import { useCallback, useRef, useState } from 'preact/hooks';
import { createInstrumentId } from '@openview/market-domain';
import {
  BinanceSpotMarketDataProvider,
  BybitSpotMarketDataProvider,
  HistoricalCandleService,
  MarketDataProviderRegistry,
  OkxSpotMarketDataProvider,
  type CandleInterval,
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

const historicalService = new HistoricalCandleService(
  new MarketDataProviderRegistry([
    new BinanceSpotMarketDataProvider(),
    new BybitSpotMarketDataProvider(),
    new OkxSpotMarketDataProvider(),
  ]),
);

const dataSources = historicalService.listSources();

const getFallbackInterval = (
  supportedIntervals: readonly CandleInterval[],
): CandleInterval | undefined =>
  supportedIntervals.includes('1m') ? '1m' : supportedIntervals[0];

export function MarketChart() {
  const [providerId, setProviderId] = useState(DEFAULT_PROVIDER_ID);
  const [interval, setInterval] = useState<CandleInterval>(DEFAULT_INTERVAL);
  const [candles, setCandles] = useState<
    Awaited<ReturnType<typeof historicalService.getHistoricalCandles>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadCandles = useCallback(
    async (nextProviderId: string, nextInterval: CandleInterval): Promise<void> => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      setCandles([]);

      const endTime = Date.now();
      const startTime = endTime - INTERVAL_DURATION_MS[nextInterval] * HISTORY_CANDLE_COUNT;

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

        setCandles(result);
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

  const bindInitializer = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element === null) {
        abortControllerRef.current?.abort();
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
          <span class="size-1.5 rounded-full bg-emerald-400" />
          <span>{selectedSource.displayName}</span>
          <span aria-hidden="true">·</span>
          <span>{INSTRUMENT_ID}</span>
        </div>
      </div>
      <ChartCanvas
        candles={candles}
        symbol="BTC / USDT"
        interval={interval}
        loading={loading}
        error={error}
        onRetry={() => void loadCandles(providerId, interval)}
      />
    </div>
  );
}
