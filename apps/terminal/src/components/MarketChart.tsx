import { useCallback, useRef, useState } from 'preact/hooks';
import { createInstrumentId, type Candle } from '@openview/market-domain';
import {
  BinanceSpotMarketDataProvider,
  BybitSpotMarketDataProvider,
  HistoricalCandleService,
  MarketDataProviderRegistry,
  MarketDataStreamService,
  getNextCandleTimestamp,
  OkxSpotMarketDataProvider,
  type CandleInterval,
  type MarketDataStreamState,
  type MarketDataSubscription,
} from '@openview/market-data';
import { ChartCanvas } from './ChartCanvas';

const DEFAULT_PROVIDER_ID = 'binance-spot';
const DEFAULT_INTERVAL: CandleInterval = '1m';
const INSTRUMENT_ID = createInstrumentId('BTC-USDT');
const HISTORY_CANDLE_COUNT = 500;

const INTERVAL_DURATION_MS: Readonly<Record<CandleInterval, number>> = Object.freeze({
  '1s': 1_000,
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '6h': 21_600_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
});

const providerRegistry = new MarketDataProviderRegistry([
  new BinanceSpotMarketDataProvider(),
  new BybitSpotMarketDataProvider(),
  new OkxSpotMarketDataProvider(),
]);

const historicalService = new HistoricalCandleService(providerRegistry);
const streamService = new MarketDataStreamService(providerRegistry);
const dataSources = historicalService.listSources();

const getFallbackInterval = (
  supportedIntervals: readonly CandleInterval[],
): CandleInterval | undefined => (supportedIntervals.includes('1m') ? '1m' : supportedIntervals[0]);

const mergeCandleSeries = (...series: (readonly Candle[])[]): readonly Candle[] => {
  const merged = new Map<number, Candle>();

  for (const candles of series) {
    for (const candle of candles) {
      merged.set(candle.timestamp, candle);
    }
  }

  return Object.freeze(
    [...merged.values()].sort((first, second) => first.timestamp - second.timestamp),
  );
};

const mergeLiveCandle = (candles: readonly Candle[], nextCandle: Candle): readonly Candle[] =>
  mergeCandleSeries(candles, [nextCandle]);

const getOlderHistoryStartTime = (endTime: number, interval: CandleInterval): number => {
  if (interval !== '1M') {
    return endTime - INTERVAL_DURATION_MS[interval] * HISTORY_CANDLE_COUNT;
  }

  const start = new Date(endTime);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - HISTORY_CANDLE_COUNT);

  return start.getTime();
};

const getHistoryStartTime = (endTime: number, interval: CandleInterval): number => {
  if (interval !== '1M') {
    return endTime - INTERVAL_DURATION_MS[interval] * HISTORY_CANDLE_COUNT;
  }

  const start = new Date(endTime);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - HISTORY_CANDLE_COUNT + 1);

  return start.getTime();
};

export function MarketChart() {
  const [providerId, setProviderId] = useState(DEFAULT_PROVIDER_ID);
  const [interval, setInterval] = useState<CandleInterval>(DEFAULT_INTERVAL);
  const [candles, setCandles] = useState<
    Awaited<ReturnType<typeof historicalService.getHistoricalCandles>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<MarketDataStreamState>('disconnected');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamCandleCount, setStreamCandleCount] = useState(0);
  const [recoveringHistory, setRecoveringHistory] = useState(false);
  const [historyRecoveryCount, setHistoryRecoveryCount] = useState(0);
  const initializedRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const olderAbortControllerRef = useRef<AbortController | null>(null);
  const recoveryAbortControllerRef = useRef<AbortController | null>(null);
  const recoveryRequestRef = useRef(false);
  const streamHasConnectedRef = useRef(false);
  const streamSubscriptionRef = useRef<MarketDataSubscription | null>(null);
  const olderRequestRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  const recoverHistoricalRange = async (
    requestId: number,
    sourceId: string,
    nextInterval: CandleInterval,
    startTime: number,
    endTime: number,
  ): Promise<void> => {
    if (
      requestId !== requestIdRef.current ||
      recoveryRequestRef.current ||
      !Number.isSafeInteger(startTime) ||
      !Number.isSafeInteger(endTime) ||
      endTime <= startTime
    ) {
      return;
    }

    const controller = new AbortController();
    recoveryAbortControllerRef.current = controller;
    recoveryRequestRef.current = true;
    setRecoveringHistory(true);

    try {
      const recoveredCandles = await historicalService.getHistoricalCandles(sourceId, {
        instrumentId: INSTRUMENT_ID,
        interval: nextInterval,
        startTime,
        endTime,
        signal: controller.signal,
      });

      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }

      const nextCandles = mergeCandleSeries(recoveredCandles, candlesRef.current);
      candlesRef.current = nextCandles;
      setCandles(nextCandles);
      setStreamError(null);
      setHistoryRecoveryCount((count) => count + 1);
    } catch (cause) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }

      setStreamError(
        cause instanceof Error
          ? 'No se pudo recuperar el histórico tras la reconexión: ' + cause.message
          : 'No se pudo recuperar el histórico tras la reconexión.',
      );
    } finally {
      if (recoveryAbortControllerRef.current === controller) {
        recoveryAbortControllerRef.current = null;
        recoveryRequestRef.current = false;
        setRecoveringHistory(false);
      }
    }
  };

  const loadCandles = useCallback(
    async (nextProviderId: string, nextInterval: CandleInterval): Promise<void> => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      abortControllerRef.current?.abort();
      olderAbortControllerRef.current?.abort();
      recoveryAbortControllerRef.current?.abort();
      recoveryAbortControllerRef.current = null;
      recoveryRequestRef.current = false;
      streamHasConnectedRef.current = false;
      setRecoveringHistory(false);
      setHistoryRecoveryCount(0);
      streamSubscriptionRef.current?.unsubscribe();
      streamSubscriptionRef.current = null;
      setStreamStatus('disconnected');
      setStreamError(null);
      setStreamCandleCount(0);
      olderRequestRef.current = false;
      hasMoreHistoryRef.current = true;
      setOlderLoading(false);
      setOlderError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      setCandles([]);

      const endTime = Date.now();
      const startTime = getHistoryStartTime(endTime, nextInterval);

      try {
        const result = await historicalService.getHistoricalCandles(nextProviderId, {
          instrumentId: INSTRUMENT_ID,
          interval: nextInterval,
          startTime,
          endTime,
          signal: controller.signal,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        candlesRef.current = result;
        setCandles(result);

        if (historicalService.getSource(nextProviderId).streamingCandles) {
          try {
            streamSubscriptionRef.current = streamService.subscribeToCandles(
              nextProviderId,
              { instrumentId: INSTRUMENT_ID, interval: nextInterval },
              {
                onCandle: (update) => {
                  if (requestId !== requestIdRef.current) {
                    return;
                  }

                  const latestCandle = candlesRef.current.at(-1);

                  if (
                    latestCandle !== undefined &&
                    update.candle.timestamp > latestCandle.timestamp
                  ) {
                    const nextExpectedTimestamp = getNextCandleTimestamp(
                      latestCandle.timestamp,
                      nextInterval,
                    );

                    if (update.candle.timestamp > nextExpectedTimestamp) {
                      void recoverHistoricalRange(
                        requestId,
                        nextProviderId,
                        nextInterval,
                        nextExpectedTimestamp,
                        update.candle.timestamp,
                      );
                    }
                  }

                  const nextCandles = mergeLiveCandle(candlesRef.current, update.candle);
                  candlesRef.current = nextCandles;
                  setStreamCandleCount((count) => count + 1);
                  setCandles(nextCandles);
                },
                onStatus: (status) => {
                  if (requestId !== requestIdRef.current) {
                    return;
                  }

                  setStreamStatus(status);

                  if (status === 'connected') {
                    if (streamHasConnectedRef.current) {
                      const latestCandle = candlesRef.current.at(-1);

                      if (latestCandle !== undefined) {
                        void recoverHistoricalRange(
                          requestId,
                          nextProviderId,
                          nextInterval,
                          latestCandle.timestamp,
                          Date.now() + 1,
                        );
                      }
                    } else {
                      streamHasConnectedRef.current = true;
                    }
                  }
                },
                onError: (streamCause) => {
                  if (requestId === requestIdRef.current) {
                    setStreamError(streamCause.message);
                  }
                },
              },
            );
          } catch (streamCause) {
            setStreamError(
              streamCause instanceof Error
                ? streamCause.message
                : 'No se pudo iniciar el flujo de velas en vivo.',
            );
            setStreamStatus('disconnected');
          }
        }
      } catch (cause) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'Ocurrió un error desconocido al consultar la fuente de mercado.',
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const loadOlderCandles = useCallback(async (): Promise<void> => {
    const currentCandles = candlesRef.current;
    const oldestCandle = currentCandles[0];

    if (
      oldestCandle === undefined ||
      olderRequestRef.current ||
      !hasMoreHistoryRef.current ||
      loading
    ) {
      return;
    }

    const requestId = requestIdRef.current;
    const controller = new AbortController();
    olderAbortControllerRef.current = controller;
    olderRequestRef.current = true;
    setOlderLoading(true);
    setOlderError(null);

    try {
      const result = await historicalService.getHistoricalCandles(providerId, {
        instrumentId: INSTRUMENT_ID,
        interval,
        startTime: getOlderHistoryStartTime(oldestCandle.timestamp, interval),
        endTime: oldestCandle.timestamp,
        signal: controller.signal,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      const mergedCandles = new Map<number, (typeof result)[number]>();

      for (const candle of [...result, ...candlesRef.current]) {
        mergedCandles.set(candle.timestamp, candle);
      }

      const nextCandles = [...mergedCandles.values()].sort(
        (first, second) => first.timestamp - second.timestamp,
      );

      if (nextCandles.length === candlesRef.current.length) {
        hasMoreHistoryRef.current = false;
        return;
      }

      candlesRef.current = nextCandles;
      setCandles(nextCandles);
    } catch (cause) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }

      setOlderError(
        cause instanceof Error ? cause.message : 'No se pudo cargar el bloque histórico anterior.',
      );
    } finally {
      if (requestId === requestIdRef.current) {
        olderRequestRef.current = false;
        setOlderLoading(false);
      }
    }
  }, [interval, loading, providerId]);

  const bindInitializer = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element === null) {
        abortControllerRef.current?.abort();
        olderAbortControllerRef.current?.abort();
        recoveryAbortControllerRef.current?.abort();
        recoveryAbortControllerRef.current = null;
        recoveryRequestRef.current = false;
        streamSubscriptionRef.current?.unsubscribe();
        streamSubscriptionRef.current = null;
        return;
      }

      if (initializedRef.current) {
        return;
      }

      initializedRef.current = true;
      void loadCandles(DEFAULT_PROVIDER_ID, DEFAULT_INTERVAL);
    },
    [loadCandles],
  );

  const selectedSource = historicalService.getSource(providerId);
  const displayedStreamStatus = selectedSource.streamingCandles ? streamStatus : 'unsupported';
  const streamStatusLabel = !selectedSource.streamingCandles
    ? 'Solo histórico'
    : streamStatus === 'connected'
      ? 'En vivo'
      : streamStatus === 'reconnecting'
        ? 'Reconectando'
        : streamStatus === 'connecting'
          ? 'Conectando'
          : 'Desconectado';

  const handleProviderChange = (nextProviderId: string): void => {
    const nextSource = dataSources.find((source) => source.id === nextProviderId);

    if (nextSource === undefined) {
      return;
    }

    const nextInterval = nextSource.supportedIntervals.includes(interval)
      ? interval
      : getFallbackInterval(nextSource.supportedIntervals);

    if (nextInterval === undefined) {
      setError('La fuente seleccionada no declara intervalos históricos disponibles.');
      return;
    }

    setProviderId(nextProviderId);
    setInterval(nextInterval);
    void loadCandles(nextProviderId, nextInterval);
  };

  const handleIntervalChange = (value: string): void => {
    const nextInterval = selectedSource.supportedIntervals.find((item) => item === value);

    if (nextInterval === undefined) {
      return;
    }

    setInterval(nextInterval);
    void loadCandles(providerId, nextInterval);
  };

  return (
    <div class="space-y-3" data-testid="market-chart">
      <span ref={bindInitializer} class="hidden" aria-hidden="true" />
      <div class="flex flex-wrap items-end justify-between gap-3 px-1">
        <div class="flex flex-wrap items-end gap-3">
          <label class="grid gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Fuente de datos
            <select
              value={providerId}
              onChange={(event) => handleProviderChange(event.currentTarget.value)}
              data-testid="provider-select"
              class="min-w-40 rounded-lg border border-white/10 bg-[#101723] px-3 py-2 text-xs normal-case tracking-normal text-slate-200 outline-none transition-colors focus:border-blue-400/50"
            >
              {dataSources.map((source) => (
                <option value={source.id}>{source.displayName}</option>
              ))}
            </select>
          </label>
          <label class="grid gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Temporalidad
            <select
              value={interval}
              onChange={(event) => handleIntervalChange(event.currentTarget.value)}
              data-testid="interval-select"
              class="min-w-24 rounded-lg border border-white/10 bg-[#101723] px-3 py-2 text-xs normal-case tracking-normal text-slate-200 outline-none transition-colors focus:border-blue-400/50"
            >
              {selectedSource.supportedIntervals.map((supportedInterval) => (
                <option value={supportedInterval}>{supportedInterval}</option>
              ))}
            </select>
          </label>
        </div>
        <div class="flex items-center gap-2 pb-2 text-[11px] text-slate-500">
          <span
            class={
              'size-1.5 rounded-full ' +
              (streamStatus === 'connected'
                ? 'bg-emerald-400'
                : selectedSource.streamingCandles
                  ? 'bg-amber-400'
                  : 'bg-slate-500')
            }
          />
          <span>{selectedSource.displayName}</span>
          <span aria-hidden="true">·</span>
          <span>{INSTRUMENT_ID}</span>
          <span aria-hidden="true">·</span>
          <span
            data-testid="market-stream-status"
            data-stream-status={displayedStreamStatus}
            data-stream-candle-count={streamCandleCount}
            data-history-recovery-count={historyRecoveryCount}
          >
            {streamStatusLabel}
          </span>
          {recoveringHistory && (
            <span data-testid="market-stream-recovery" class="text-blue-300">
              Sincronizando histórico…
            </span>
          )}
          {streamError !== null && (
            <span
              class="max-w-48 truncate text-rose-300"
              data-testid="market-stream-error"
              title={streamError}
            >
              {streamError}
            </span>
          )}
        </div>
      </div>
      <ChartCanvas
        candles={candles}
        symbol="BTC / USDT"
        interval={interval}
        loading={loading}
        error={error}
        onRetry={() => void loadCandles(providerId, interval)}
        onNeedMoreHistory={() => void loadOlderCandles()}
      />
      {(olderLoading || olderError !== null) && (
        <div
          class="flex items-center justify-end gap-2 px-1 text-[11px] text-slate-500"
          role="status"
        >
          {olderLoading && <span>Cargando histórico anterior…</span>}
          {olderError !== null && (
            <>
              <span class="text-rose-300">{olderError}</span>
              <button
                type="button"
                onClick={() => void loadOlderCandles()}
                class="rounded border border-white/10 px-2 py-1 text-slate-300 hover:bg-white/5"
              >
                Reintentar histórico
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
