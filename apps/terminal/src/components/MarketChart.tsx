import { useCallback, useRef, useState } from 'preact/hooks';
import { createInstrumentId, type Candle, type InstrumentId } from '@openview/market-domain';
import {
  BinanceSpotMarketDataProvider,
  BybitSpotMarketDataProvider,
  HistoricalCandleService,
  MarketDataProviderRegistry,
  MarketDataStreamService,
  MarketInstrumentDiscoveryService,
  getNextCandleTimestamp,
  OkxSpotMarketDataProvider,
  type CandleInterval,
  type MarketDataStreamState,
  type MarketDataSubscription,
  type QuoteUpdate,
} from '@openview/market-data';
import {
  MarketWatchlist,
  type ProviderInstrumentSearchResult,
  type SearchCatalogFailure,
} from './MarketWatchlist';
import {
  DEFAULT_WATCHLIST,
  MAX_WATCHLIST_INSTRUMENTS,
  createWatchlistInstrument,
  loadBrowserWatchlistPreferences,
  saveBrowserWatchlistPreferences,
  type WatchlistInstrument,
} from '../watchlist/watchlist-preferences';
import { ChartCanvas } from './ChartCanvas';

const DEFAULT_PROVIDER_ID = 'binance-spot';
const DEFAULT_INTERVAL: CandleInterval = '1m';
const FALLBACK_WATCHLIST_INSTRUMENT: WatchlistInstrument = Object.freeze({
  id: 'BTC-USDT',
  symbol: 'BTC / USDT',
  name: 'Bitcoin',
  chartSymbol: 'BTC / USDT',
});
const DEFAULT_WATCHLIST_INSTRUMENT = DEFAULT_WATCHLIST[0] ?? FALLBACK_WATCHLIST_INSTRUMENT;
const DEFAULT_INSTRUMENT_ID = createInstrumentId(DEFAULT_WATCHLIST_INSTRUMENT.id);
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
const instrumentDiscoveryService = new MarketInstrumentDiscoveryService(providerRegistry);
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
  const [watchlist, setWatchlist] = useState<readonly WatchlistInstrument[]>(DEFAULT_WATCHLIST);
  const [availableInstruments, setAvailableInstruments] = useState<readonly WatchlistInstrument[]>(
    [],
  );
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<readonly ProviderInstrumentSearchResult[]>([]);
  const [searchCatalogStatus, setSearchCatalogStatus] = useState<
    'idle' | 'loading' | 'ready' | 'partial' | 'unavailable'
  >('idle');
  const [searchCatalogFailures, setSearchCatalogFailures] = useState<
    readonly SearchCatalogFailure[]
  >([]);
  const [selectedInstrumentId, setSelectedInstrumentId] =
    useState<InstrumentId>(DEFAULT_INSTRUMENT_ID);
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
  const [quotes, setQuotes] = useState<Readonly<Record<string, QuoteUpdate>>>({});
  const [quoteStatus, setQuoteStatus] = useState<MarketDataStreamState>('disconnected');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [recoveringHistory, setRecoveringHistory] = useState(false);
  const [historyRecoveryCount, setHistoryRecoveryCount] = useState(0);
  const initializedRef = useRef(false);
  const requestIdRef = useRef(0);
  const quoteRequestIdRef = useRef(0);
  const catalogRequestIdRef = useRef(0);
  const catalogAbortControllerRef = useRef<AbortController | null>(null);
  const searchCatalogRequestIdRef = useRef(0);
  const searchCatalogAbortControllerRef = useRef<AbortController | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const olderAbortControllerRef = useRef<AbortController | null>(null);
  const recoveryAbortControllerRef = useRef<AbortController | null>(null);
  const recoveryRequestRef = useRef(false);
  const streamHasConnectedRef = useRef(false);
  const streamSubscriptionRef = useRef<MarketDataSubscription | null>(null);
  const quoteSubscriptionRef = useRef<MarketDataSubscription | null>(null);
  const olderRequestRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  const recoverHistoricalRange = async (
    requestId: number,
    sourceId: string,
    instrumentId: InstrumentId,
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
        instrumentId,
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

  const loadInstrumentCatalog = useCallback(
    async (nextProviderId: string): Promise<readonly WatchlistInstrument[] | null> => {
      const requestId = catalogRequestIdRef.current + 1;
      catalogRequestIdRef.current = requestId;
      catalogAbortControllerRef.current?.abort();

      const controller = new AbortController();
      catalogAbortControllerRef.current = controller;
      setCatalogStatus('loading');
      setCatalogError(null);

      try {
        const discoveredInstruments = await instrumentDiscoveryService.listInstruments(
          nextProviderId,
          { signal: controller.signal },
        );

        if (requestId !== catalogRequestIdRef.current) {
          return null;
        }

        const instruments = discoveredInstruments.map(createWatchlistInstrument);
        setAvailableInstruments(instruments);
        setCatalogStatus('ready');

        return instruments;
      } catch (cause) {
        if (controller.signal.aborted || requestId !== catalogRequestIdRef.current) {
          return null;
        }

        setAvailableInstruments([]);
        setCatalogStatus('unavailable');
        setCatalogError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo consultar el catálogo del proveedor.',
        );

        return null;
      } finally {
        if (requestId === catalogRequestIdRef.current) {
          catalogAbortControllerRef.current = null;
        }
      }
    },
    [],
  );

  const loadSearchCatalog = useCallback(async (): Promise<void> => {
    const requestId = searchCatalogRequestIdRef.current + 1;
    searchCatalogRequestIdRef.current = requestId;
    searchCatalogAbortControllerRef.current?.abort();

    const controller = new AbortController();
    searchCatalogAbortControllerRef.current = controller;
    setSearchCatalogStatus('loading');
    setSearchCatalogFailures([]);

    try {
      const batch = await instrumentDiscoveryService.listInstrumentsFromAllProviders({
        signal: controller.signal,
      });

      if (controller.signal.aborted || requestId !== searchCatalogRequestIdRef.current) {
        return;
      }

      const results = batch.catalogs.flatMap((catalog) =>
        catalog.instruments.map((instrument) => ({
          instrument: createWatchlistInstrument(instrument),
          providerId: catalog.providerId,
          providerName: catalog.providerName,
        })),
      );
      setSearchResults(results);
      setSearchCatalogFailures(batch.failures);
      setSearchCatalogStatus(
        batch.catalogs.length === 0 && batch.failures.length > 0
          ? 'unavailable'
          : batch.failures.length > 0
            ? 'partial'
            : 'ready',
      );
    } catch (cause) {
      if (controller.signal.aborted || requestId !== searchCatalogRequestIdRef.current) {
        return;
      }

      setSearchResults([]);
      setSearchCatalogFailures([
        {
          providerId: 'all',
          providerName: 'Proveedores',
          message:
            cause instanceof Error
              ? cause.message
              : 'No se pudieron consultar los catálogos de instrumentos.',
        },
      ]);
      setSearchCatalogStatus('unavailable');
    } finally {
      if (requestId === searchCatalogRequestIdRef.current) {
        searchCatalogAbortControllerRef.current = null;
      }
    }
  }, []);

  const loadQuotes = useCallback(
    (
      nextProviderId: string,
      nextInstruments: readonly WatchlistInstrument[],
      providerCatalog: readonly WatchlistInstrument[] | null,
    ): void => {
      const requestId = quoteRequestIdRef.current + 1;
      quoteRequestIdRef.current = requestId;
      quoteSubscriptionRef.current?.unsubscribe();
      quoteSubscriptionRef.current = null;
      setQuotes({});
      setQuoteStatus('disconnected');
      setQuoteError(null);

      const selectedSource = historicalService.getSource(nextProviderId);

      if (!selectedSource.streamingQuotes) {
        return;
      }

      const supportedIds =
        providerCatalog === null
          ? null
          : new Set(providerCatalog.map((instrument) => instrument.id));
      const subscribedInstruments =
        supportedIds === null
          ? nextInstruments
          : nextInstruments.filter((instrument) => supportedIds.has(instrument.id));

      if (subscribedInstruments.length === 0) {
        return;
      }

      try {
        quoteSubscriptionRef.current = streamService.subscribeToQuotes(
          nextProviderId,
          subscribedInstruments.map((instrument) => createInstrumentId(instrument.id)),
          {
            onQuote: (nextQuote) => {
              if (requestId !== quoteRequestIdRef.current) {
                return;
              }

              setQuotes((current) => ({
                ...current,
                [nextQuote.instrumentId]: nextQuote,
              }));
              setQuoteError(null);
            },
            onStatus: (status) => {
              if (requestId === quoteRequestIdRef.current) {
                setQuoteStatus(status);
              }
            },
            onError: (quoteCause) => {
              if (requestId === quoteRequestIdRef.current) {
                setQuoteError(quoteCause.message);
              }
            },
          },
        );
      } catch (quoteCause) {
        setQuoteStatus('disconnected');
        setQuoteError(
          quoteCause instanceof Error
            ? quoteCause.message
            : 'No se pudo iniciar el flujo de cotizaciones en vivo.',
        );
      }
    },
    [],
  );

  const loadCandles = useCallback(
    async (
      nextProviderId: string,
      nextInterval: CandleInterval,
      nextInstrumentId: InstrumentId,
    ): Promise<void> => {
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
          instrumentId: nextInstrumentId,
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

        const selectedSource = historicalService.getSource(nextProviderId);

        if (selectedSource.streamingCandles) {
          try {
            streamSubscriptionRef.current = streamService.subscribeToCandles(
              nextProviderId,
              { instrumentId: nextInstrumentId, interval: nextInterval },
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
                        nextInstrumentId,
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
                          nextInstrumentId,
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
        instrumentId: selectedInstrumentId,
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
  }, [interval, loading, providerId, selectedInstrumentId]);

  const bindInitializer = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element === null) {
        abortControllerRef.current?.abort();
        olderAbortControllerRef.current?.abort();
        recoveryAbortControllerRef.current?.abort();
        recoveryAbortControllerRef.current = null;
        recoveryRequestRef.current = false;
        catalogRequestIdRef.current += 1;
        catalogAbortControllerRef.current?.abort();
        catalogAbortControllerRef.current = null;
        searchCatalogRequestIdRef.current += 1;
        searchCatalogAbortControllerRef.current?.abort();
        searchCatalogAbortControllerRef.current = null;
        streamSubscriptionRef.current?.unsubscribe();
        streamSubscriptionRef.current = null;
        quoteRequestIdRef.current += 1;
        quoteSubscriptionRef.current?.unsubscribe();
        quoteSubscriptionRef.current = null;
        return;
      }

      if (initializedRef.current) {
        return;
      }

      initializedRef.current = true;
      const preferences = loadBrowserWatchlistPreferences();
      const restoredSelectedInstrumentId = createInstrumentId(preferences.selectedInstrumentId);
      setWatchlist(preferences.instruments);
      setSelectedInstrumentId(restoredSelectedInstrumentId);

      const catalogRequest = loadInstrumentCatalog(DEFAULT_PROVIDER_ID);
      const catalogRequestId = catalogRequestIdRef.current;

      void catalogRequest.then((catalog) => {
        if (catalogRequestId !== catalogRequestIdRef.current) {
          return;
        }

        loadQuotes(DEFAULT_PROVIDER_ID, preferences.instruments, catalog);

        if (catalog === null) {
          void loadCandles(DEFAULT_PROVIDER_ID, DEFAULT_INTERVAL, restoredSelectedInstrumentId);
          return;
        }

        const supportedInstruments = preferences.instruments.filter((instrument) =>
          catalog.some((available) => available.id === instrument.id),
        );
        const selectedInstrument =
          supportedInstruments.find(
            (instrument) => instrument.id === preferences.selectedInstrumentId,
          ) ?? supportedInstruments[0];

        if (selectedInstrument === undefined) {
          setCandles([]);
          setLoading(false);
          setError(
            'Ningún instrumento guardado está disponible en este proveedor. Agrega uno del catálogo.',
          );
          return;
        }

        const nextSelectedInstrumentId = createInstrumentId(selectedInstrument.id);
        setSelectedInstrumentId(nextSelectedInstrumentId);

        if (nextSelectedInstrumentId !== restoredSelectedInstrumentId) {
          saveBrowserWatchlistPreferences({
            instruments: preferences.instruments,
            selectedInstrumentId: nextSelectedInstrumentId,
          });
        }

        void loadCandles(DEFAULT_PROVIDER_ID, DEFAULT_INTERVAL, nextSelectedInstrumentId);
      });
    },
    [loadCandles, loadInstrumentCatalog, loadQuotes],
  );

  const selectedSource = historicalService.getSource(providerId);
  const displayedStreamStatus = selectedSource.streamingCandles ? streamStatus : 'unsupported';
  const quote = quotes[selectedInstrumentId] ?? null;
  const selectedInstrument =
    watchlist.find((instrument) => instrument.id === selectedInstrumentId) ??
    DEFAULT_WATCHLIST_INSTRUMENT;
  const quoteStatusLabel = !selectedSource.streamingQuotes
    ? 'No disponible'
    : quoteStatus === 'connected'
      ? quote === null
        ? 'Esperando cotización'
        : 'En vivo'
      : quoteStatus === 'reconnecting'
        ? 'Reconectando'
        : quoteStatus === 'connecting'
          ? 'Conectando'
          : 'Desconectado';
  const quoteReceivedTime =
    quote === null
      ? null
      : new Date(quote.receivedAt).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
  const quoteLatency = quote === null ? null : Math.max(0, quote.receivedAt - quote.timestamp);
  const formatQuoteValue = (value: number | null, maximumFractionDigits = 8): string =>
    value === null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits }).format(value);
  const streamStatusLabel = !selectedSource.streamingCandles
    ? 'Solo histórico'
    : streamStatus === 'connected'
      ? 'En vivo'
      : streamStatus === 'reconnecting'
        ? 'Reconectando'
        : streamStatus === 'connecting'
          ? 'Conectando'
          : 'Desconectado';

  const handleProviderChange = async (
    nextProviderId: string,
    nextWatchlist: readonly WatchlistInstrument[] = watchlist,
    preferredInstrumentId: string | null = null,
  ): Promise<void> => {
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
    loadQuotes(nextProviderId, [], []);
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    olderAbortControllerRef.current?.abort();
    recoveryAbortControllerRef.current?.abort();
    recoveryAbortControllerRef.current = null;
    recoveryRequestRef.current = false;
    streamSubscriptionRef.current?.unsubscribe();
    streamSubscriptionRef.current = null;
    candlesRef.current = [];
    setCandles([]);
    setLoading(true);
    setError(null);
    setStreamStatus('disconnected');
    setStreamError(null);
    setStreamCandleCount(0);

    const catalogRequest = loadInstrumentCatalog(nextProviderId);
    const catalogRequestId = catalogRequestIdRef.current;
    const catalog = await catalogRequest;

    if (catalogRequestId !== catalogRequestIdRef.current) {
      return;
    }

    loadQuotes(nextProviderId, nextWatchlist, catalog);

    if (catalog === null) {
      const fallbackInstrumentId = createInstrumentId(
        preferredInstrumentId ?? selectedInstrumentId,
      );
      setSelectedInstrumentId(fallbackInstrumentId);
      void loadCandles(nextProviderId, nextInterval, fallbackInstrumentId);
      return;
    }

    const supportedInstruments = nextWatchlist.filter((instrument) =>
      catalog.some((available) => available.id === instrument.id),
    );
    const nextSelectedInstrument =
      (preferredInstrumentId === null
        ? undefined
        : supportedInstruments.find((instrument) => instrument.id === preferredInstrumentId)) ??
      supportedInstruments.find((instrument) => instrument.id === selectedInstrumentId) ??
      supportedInstruments[0];

    if (nextSelectedInstrument === undefined) {
      candlesRef.current = [];
      setCandles([]);
      setLoading(false);
      setError(
        'Ningún instrumento guardado está disponible en este proveedor. Agrega uno del catálogo.',
      );
      return;
    }

    const nextSelectedInstrumentId = createInstrumentId(nextSelectedInstrument.id);
    setSelectedInstrumentId(nextSelectedInstrumentId);

    if (nextSelectedInstrumentId !== selectedInstrumentId) {
      saveBrowserWatchlistPreferences({
        instruments: nextWatchlist,
        selectedInstrumentId: nextSelectedInstrumentId,
      });
    }

    void loadCandles(nextProviderId, nextInterval, nextSelectedInstrumentId);
  };

  const handleIntervalChange = (value: string): void => {
    const nextInterval = selectedSource.supportedIntervals.find((item) => item === value);

    if (nextInterval === undefined) {
      return;
    }

    setInterval(nextInterval);
    void loadCandles(providerId, nextInterval, selectedInstrumentId);
  };

  const handleInstrumentSelect = (nextInstrumentId: string): void => {
    const nextInstrument = watchlist.find((instrument) => instrument.id === nextInstrumentId);

    if (
      nextInstrument === undefined ||
      (catalogStatus === 'ready' &&
        !availableInstruments.some((item) => item.id === nextInstrumentId)) ||
      nextInstrument.id === selectedInstrumentId
    ) {
      return;
    }

    const nextSelectedInstrumentId = createInstrumentId(nextInstrument.id);
    setSelectedInstrumentId(nextSelectedInstrumentId);
    saveBrowserWatchlistPreferences({
      instruments: watchlist,
      selectedInstrumentId: nextSelectedInstrumentId,
    });
    void loadCandles(providerId, interval, nextSelectedInstrumentId);
  };

  const handleInstrumentAdd = async (
    nextInstrument: WatchlistInstrument,
    nextProviderId: string,
  ): Promise<void> => {
    const alreadyInWatchlist = watchlist.some((instrument) => instrument.id === nextInstrument.id);

    if (!alreadyInWatchlist && watchlist.length >= MAX_WATCHLIST_INSTRUMENTS) {
      return;
    }

    const nextWatchlist = alreadyInWatchlist ? watchlist : [...watchlist, nextInstrument];
    const nextSelectedInstrumentId = createInstrumentId(nextInstrument.id);

    if (!alreadyInWatchlist) {
      setWatchlist(nextWatchlist);
    }

    setSelectedInstrumentId(nextSelectedInstrumentId);
    saveBrowserWatchlistPreferences({
      instruments: nextWatchlist,
      selectedInstrumentId: nextSelectedInstrumentId,
    });
    await handleProviderChange(nextProviderId, nextWatchlist, nextInstrument.id);
  };

  const handleInstrumentRemove = (instrumentId: string): void => {
    if (watchlist.length <= 1 || !watchlist.some((instrument) => instrument.id === instrumentId)) {
      return;
    }

    const nextWatchlist = watchlist.filter((instrument) => instrument.id !== instrumentId);
    const supportedWatchlist =
      catalogStatus === 'ready'
        ? nextWatchlist.filter((instrument) =>
            availableInstruments.some((available) => available.id === instrument.id),
          )
        : nextWatchlist;
    const selectedInstrument =
      supportedWatchlist.find((instrument) => instrument.id === selectedInstrumentId) ??
      supportedWatchlist[0] ??
      nextWatchlist[0];
    const nextSelectedInstrumentId = createInstrumentId(
      selectedInstrument?.id ?? DEFAULT_WATCHLIST_INSTRUMENT.id,
    );

    setWatchlist(nextWatchlist);
    setSelectedInstrumentId(nextSelectedInstrumentId);
    saveBrowserWatchlistPreferences({
      instruments: nextWatchlist,
      selectedInstrumentId: nextSelectedInstrumentId,
    });
    loadQuotes(providerId, nextWatchlist, catalogStatus === 'ready' ? availableInstruments : null);

    if (nextSelectedInstrumentId !== selectedInstrumentId) {
      if (supportedWatchlist.length === 0) {
        candlesRef.current = [];
        setCandles([]);
        setLoading(false);
        setError('Ningún instrumento restante está disponible en este proveedor.');
      } else {
        void loadCandles(providerId, interval, nextSelectedInstrumentId);
      }
    }
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
              onChange={(event) => void handleProviderChange(event.currentTarget.value)}
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
          <span>{selectedInstrument.id}</span>
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
      <div class="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_310px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="min-w-0 space-y-3">
          <section
            class="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-[#0a101a] p-3 sm:grid-cols-5"
            aria-label="Cotización de mercado"
            data-testid="market-quote-panel"
            data-quote-status={quoteStatus}
          >
            <div class="col-span-2 min-w-0 sm:col-span-1">
              <div class="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Último precio
              </div>
              <div
                class="mt-1 truncate text-xl font-semibold tabular-nums text-white"
                data-testid="quote-last"
              >
                {formatQuoteValue(quote?.last ?? null)}
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Variación 24h
              </div>
              <div
                class={
                  'mt-1 truncate text-sm font-semibold tabular-nums ' +
                  (quote === null || quote.changePercent24h === null
                    ? 'text-slate-400'
                    : quote.changePercent24h >= 0
                      ? 'text-emerald-300'
                      : 'text-rose-300')
                }
                data-testid="quote-change-24h"
              >
                {quote?.changePercent24h === null || quote === null
                  ? '—'
                  : (quote.changePercent24h > 0 ? '+' : '') +
                    formatQuoteValue(quote.changePercent24h, 2) +
                    '%'}
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-[10px] font-medium uppercase tracking-wider text-slate-500">Bid</div>
              <div
                class="mt-1 truncate text-sm font-medium tabular-nums text-emerald-300"
                data-testid="quote-bid"
              >
                {formatQuoteValue(quote?.bid ?? null)}
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-[10px] font-medium uppercase tracking-wider text-slate-500">Ask</div>
              <div
                class="mt-1 truncate text-sm font-medium tabular-nums text-rose-300"
                data-testid="quote-ask"
              >
                {formatQuoteValue(quote?.ask ?? null)}
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Volumen 24h
              </div>
              <div
                class="mt-1 truncate text-sm font-medium tabular-nums text-slate-200"
                data-testid="quote-volume-24h"
              >
                {formatQuoteValue(quote?.volume24h ?? null, 2)}
              </div>
            </div>
            <div class="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-[10px] text-slate-500 sm:col-span-5">
              <span data-testid="quote-stream-status" data-quote-stream-status={quoteStatus}>
                {quoteStatusLabel}
              </span>
              {quoteReceivedTime !== null && (
                <span data-testid="quote-received-at">Actualizado {quoteReceivedTime}</span>
              )}
              {quoteLatency !== null && <span data-testid="quote-latency">{quoteLatency} ms</span>}
              {quoteError !== null && (
                <span
                  class="truncate text-rose-300"
                  data-testid="quote-stream-error"
                  title={quoteError}
                >
                  {quoteError}
                </span>
              )}
            </div>
          </section>
          <ChartCanvas
            candles={candles}
            symbol={selectedInstrument.chartSymbol}
            interval={interval}
            loading={loading}
            error={error}
            onRetry={() => void loadCandles(providerId, interval, selectedInstrumentId)}
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
        <aside class="min-w-0 self-start lg:sticky lg:top-2">
          <MarketWatchlist
            instruments={watchlist}
            searchResults={searchResults}
            searchCatalogStatus={searchCatalogStatus}
            searchCatalogFailures={searchCatalogFailures}
            onOpenSearch={() => void loadSearchCatalog()}
            availableInstruments={availableInstruments}
            availableInstrumentIds={availableInstruments.map((instrument) => instrument.id)}
            catalogStatus={catalogStatus}
            catalogError={catalogError}
            providerName={selectedSource.displayName}
            selectedInstrumentId={selectedInstrumentId}
            quotes={quotes}
            onSelect={handleInstrumentSelect}
            onAdd={(instrument, sourceProviderId) =>
              void handleInstrumentAdd(instrument, sourceProviderId)
            }
            onRemove={handleInstrumentRemove}
          />
        </aside>
      </div>
    </div>
  );
}
