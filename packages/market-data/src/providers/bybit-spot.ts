import { createCandle, type Candle, type InstrumentId } from '@openview/market-domain';
import type {
  CandleInterval,
  CandleStreamHandlers,
  CandleSubscriptionRequest,
  CandleUpdate,
  HistoricalCandleRequest,
  MarketDataCapabilities,
  MarketDataProvider,
  MarketDataSubscription,
  QuoteStreamHandlers,
  QuoteUpdate,
} from '../contracts';
import { MarketDataProviderError } from '../errors';
import { MarketDataRequestScheduler, type RequestWaiter } from '../request-scheduler';
import {
  createReconnectingWebSocketSubscription,
  type MarketDataWebSocketConnection,
  type MarketDataWebSocketFactory,
} from '../reconnecting-websocket';

const PROVIDER_ID = 'bybit-spot';
const DEFAULT_BASE_URL = 'https://api.bybit.com';
const DEFAULT_PAGE_SIZE = 1_000;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_REQUEST_INTERVAL_MS = 100;
const DEFAULT_STREAM_BASE_URL = 'wss://stream.bybit.com/v5/public/spot';
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;

const INTERVALS: ReadonlyMap<CandleInterval, string> = new Map([
  ['1m', '1'],
  ['3m', '3'],
  ['5m', '5'],
  ['15m', '15'],
  ['30m', '30'],
  ['1h', '60'],
  ['2h', '120'],
  ['4h', '240'],
  ['6h', '360'],
  ['12h', '720'],
  ['1d', 'D'],
  ['1w', 'W'],
  ['1M', 'M'],
]);

const SUPPORTED_INTERVALS: readonly CandleInterval[] = Object.freeze([
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1d',
  '1w',
  '1M',
]);

const CAPABILITIES: MarketDataCapabilities = Object.freeze({
  historicalCandles: true,
  streamingQuotes: true,
  streamingCandles: true,
  supportedIntervals: SUPPORTED_INTERVALS,
  redistribution: 'unknown',
  attributionRequired: false,
});

export type BybitSpotProviderOptions = Readonly<{
  baseUrl?: string;
  streamBaseUrl?: string;
  fetcher?: typeof fetch;
  webSocketFactory?: MarketDataWebSocketFactory;
  pageSize?: number;
  maxPages?: number;
  minimumRequestIntervalMs?: number;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  heartbeatIntervalMs?: number;
  waiter?: RequestWaiter;
}>;

export type BybitWebSocketConnection = MarketDataWebSocketConnection;
export type BybitWebSocketFactory = MarketDataWebSocketFactory;

const isRecord = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readProperty = (value: unknown, key: string): unknown =>
  isRecord(value) ? Reflect.get(value, key) : undefined;

const toFiniteNumber = (value: unknown, field: string): number => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    throw new RangeError(`Bybit returned an invalid ${field} value.`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new RangeError(`Bybit returned a non-finite ${field} value.`);
  }

  return parsed;
};

const parseCandle = (value: unknown): Candle => {
  if (!Array.isArray(value) || value.length < 6) {
    throw new RangeError('Bybit returned a malformed kline row.');
  }

  const timestamp = toFiniteNumber(value[0], 'open time');

  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new RangeError('Bybit returned an invalid candle open time.');
  }

  const candle = createCandle({
    timestamp,
    open: toFiniteNumber(value[1], 'open price'),
    high: toFiniteNumber(value[2], 'high price'),
    low: toFiniteNumber(value[3], 'low price'),
    close: toFiniteNumber(value[4], 'close price'),
    volume: toFiniteNumber(value[5], 'base volume'),
  });

  if (!candle.ok) {
    throw new RangeError(`Bybit returned an invalid OHLCV candle: ${candle.error}.`);
  }

  return candle.value;
};

const normalizeSymbol = (instrumentId: string): string => {
  const value = instrumentId.trim().toUpperCase();
  const separatorIndex = value.indexOf(':');
  const exchange = separatorIndex < 0 ? null : value.slice(0, separatorIndex);
  const pair = separatorIndex < 0 ? value : value.slice(separatorIndex + 1);

  if (exchange !== null && exchange !== 'BYBIT') {
    throw new RangeError('Bybit Spot only accepts unqualified symbols or BYBIT-qualified symbols.');
  }

  const symbol = pair.replace(/[-/_]/g, '');

  if (!/^[A-Z0-9]{3,30}$/.test(symbol)) {
    throw new RangeError('Instrument identifiers must resolve to a valid Bybit Spot symbol.');
  }

  return symbol;
};

const parseStreamCandles = (
  value: unknown,
  request: CandleSubscriptionRequest,
  symbol: string,
  interval: string,
): readonly CandleUpdate[] => {
  const topic = readProperty(value, 'topic');

  if (topic !== 'kline.' + interval + '.' + symbol) {
    return Object.freeze([]);
  }

  const data = readProperty(value, 'data');

  if (!Array.isArray(data)) {
    throw new RangeError('Bybit returned a malformed WebSocket kline payload.');
  }

  return Object.freeze(
    data.map((item) => {
      if (!isRecord(item)) {
        throw new RangeError('Bybit returned a malformed streamed candle.');
      }

      if (readProperty(item, 'interval') !== interval) {
        throw new RangeError('Bybit returned a streamed candle for an unexpected interval.');
      }

      const timestamp = toFiniteNumber(readProperty(item, 'start'), 'streamed open time');

      if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
        throw new RangeError('Bybit returned an invalid streamed candle open time.');
      }

      const result = createCandle({
        timestamp,
        open: toFiniteNumber(readProperty(item, 'open'), 'streamed open price'),
        high: toFiniteNumber(readProperty(item, 'high'), 'streamed high price'),
        low: toFiniteNumber(readProperty(item, 'low'), 'streamed low price'),
        close: toFiniteNumber(readProperty(item, 'close'), 'streamed close price'),
        volume: toFiniteNumber(readProperty(item, 'volume'), 'streamed base volume'),
      });

      if (!result.ok) {
        throw new RangeError(
          'Bybit returned an invalid streamed OHLCV candle: ' + result.error + '.',
        );
      }

      const isFinal = readProperty(item, 'confirm');

      if (typeof isFinal !== 'boolean') {
        throw new RangeError('Bybit returned an invalid streamed candle confirmation flag.');
      }

      return Object.freeze({
        instrumentId: request.instrumentId,
        interval: request.interval,
        candle: result.value,
        isFinal,
      });
    }),
  );
};

const validateRequest = (request: HistoricalCandleRequest): string => {
  if (
    !Number.isSafeInteger(request.startTime) ||
    !Number.isSafeInteger(request.endTime) ||
    request.startTime < 0 ||
    request.endTime <= request.startTime
  ) {
    throw new RangeError(
      'Historical candle ranges must be safe Unix millisecond values with end after start.',
    );
  }

  const interval = INTERVALS.get(request.interval);

  if (interval === undefined) {
    throw new RangeError(`Bybit Spot does not support the ${request.interval} candle interval.`);
  }

  return interval;
};

const getRetryAfterMs = (response: Response): number | null => {
  const value = response.headers.get('retry-after');

  if (value === null) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const retryAt = Date.parse(value);

  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : null;
};

const getApiError = (payload: unknown, status: number): string => {
  const code = readProperty(payload, 'retCode');
  const message = readProperty(payload, 'retMsg');
  const codeLabel = code === undefined ? '' : ` (code ${String(code)})`;
  const messageLabel = typeof message === 'string' && message.length > 0 ? `: ${message}` : '';

  return `Bybit API request failed with HTTP ${status}${codeLabel}${messageLabel}.`;
};

export class BybitSpotMarketDataProvider implements MarketDataProvider {
  readonly id = PROVIDER_ID;
  readonly displayName = 'Bybit Spot';
  readonly capabilities = CAPABILITIES;

  private readonly baseUrl: string;
  private readonly streamBaseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly webSocketFactory: MarketDataWebSocketFactory;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly scheduler: MarketDataRequestScheduler;

  constructor(options: BybitSpotProviderOptions = {}) {
    const parsedBaseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);

    if (parsedBaseUrl.protocol !== 'https:') {
      throw new RangeError('Bybit Spot provider base URLs must use HTTPS.');
    }

    const streamBaseUrl = new URL(options.streamBaseUrl ?? DEFAULT_STREAM_BASE_URL);
    const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    const webSocketFactory = options.webSocketFactory ?? ((url: string) => new WebSocket(url));
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    const reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    const maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

    if (typeof fetcher !== 'function') {
      throw new Error('A Fetch API implementation is required for the Bybit Spot provider.');
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
      throw new RangeError('Bybit Spot page size must be an integer between 1 and 1000.');
    }

    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
      throw new RangeError('Bybit Spot maximum pages must be an integer between 1 and 1000.');
    }

    if (streamBaseUrl.protocol !== 'wss:') {
      throw new RangeError('Bybit Spot stream URLs must use WSS.');
    }

    if (typeof webSocketFactory !== 'function') {
      throw new Error('A WebSocket factory is required for the Bybit Spot provider.');
    }

    if (!Number.isInteger(reconnectDelayMs) || reconnectDelayMs < 1) {
      throw new RangeError('Bybit Spot reconnect delay must be a positive integer.');
    }

    if (!Number.isInteger(maxReconnectDelayMs) || maxReconnectDelayMs < reconnectDelayMs) {
      throw new RangeError(
        'Bybit Spot maximum reconnect delay must be at least the initial delay.',
      );
    }

    if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1) {
      throw new RangeError('Bybit Spot heartbeat interval must be a positive integer.');
    }

    this.baseUrl = parsedBaseUrl.toString().replace(/\/$/, '');
    this.streamBaseUrl = streamBaseUrl.toString().replace(/\/$/, '');
    this.fetcher = fetcher;
    this.webSocketFactory = webSocketFactory;
    this.pageSize = pageSize;
    this.maxPages = maxPages;
    this.reconnectDelayMs = reconnectDelayMs;
    this.maxReconnectDelayMs = maxReconnectDelayMs;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.scheduler = new MarketDataRequestScheduler({
      minimumIntervalMs: options.minimumRequestIntervalMs ?? DEFAULT_REQUEST_INTERVAL_MS,
      ...(options.waiter === undefined ? {} : { waiter: options.waiter }),
    });
  }

  subscribeToCandles(
    request: CandleSubscriptionRequest,
    handlers: CandleStreamHandlers,
  ): MarketDataSubscription {
    const interval = INTERVALS.get(request.interval);

    if (
      interval === undefined ||
      !this.capabilities.supportedIntervals.includes(request.interval)
    ) {
      throw new RangeError(
        'Bybit Spot does not support the ' + request.interval + ' candle interval.',
      );
    }

    const symbol = normalizeSymbol(request.instrumentId);
    const topic = 'kline.' + interval + '.' + symbol;

    return createReconnectingWebSocketSubscription({
      url: this.streamBaseUrl,
      webSocketFactory: this.webSocketFactory,
      reconnectDelayMs: this.reconnectDelayMs,
      maxReconnectDelayMs: this.maxReconnectDelayMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      ...(handlers.onStatus === undefined ? {} : { onStatus: handlers.onStatus }),
      ...(handlers.onError === undefined ? {} : { onError: handlers.onError }),
      onOpen: (connection) => {
        if (connection.send === undefined) {
          throw new Error('Bybit Spot WebSocket connection cannot send subscription messages.');
        }

        connection.send(JSON.stringify({ op: 'subscribe', args: [topic] }));
      },
      onMessage: (message, connection) => {
        const payload: unknown = JSON.parse(message);
        const operation = readProperty(payload, 'op');

        if (operation === 'ping') {
          if (connection.send === undefined) {
            throw new Error('Bybit Spot WebSocket connection cannot send pong messages.');
          }

          connection.send(JSON.stringify({ op: 'pong' }));
          return;
        }

        const success = readProperty(payload, 'success');

        if (success === false && operation === 'subscribe') {
          connection.close();
          const reason = readProperty(payload, 'ret_msg');
          throw new Error(
            typeof reason === 'string'
              ? 'Bybit Spot subscription failed: ' + reason
              : 'Bybit Spot subscription was rejected.',
          );
        }

        for (const update of parseStreamCandles(payload, request, symbol, interval)) {
          handlers.onCandle(update);
        }
      },
    });
  }


  subscribeToQuotes(
    instrumentIds: readonly InstrumentId[],
    handlers: QuoteStreamHandlers,
  ): MarketDataSubscription {
    if (instrumentIds.length === 0) {
      throw new RangeError('At least one instrument is required for a Bybit Spot quote stream.');
    }

    const instrumentsBySymbol = new Map<string, InstrumentId>();

    for (const instrumentId of instrumentIds) {
      const symbol = normalizeSymbol(instrumentId);

      if (instrumentsBySymbol.has(symbol)) {
        throw new RangeError('Bybit Spot quote subscriptions cannot contain duplicate symbols.');
      }

      instrumentsBySymbol.set(symbol, instrumentId);
    }

    type MutableQuoteState = {
      timestamp: number;
      bid: number | null;
      ask: number | null;
      last: number | null;
      volume24h: number | null;
      changePercent24h: number | null;
    };
    const quoteStates = new Map<string, MutableQuoteState>();

    for (const symbol of instrumentsBySymbol.keys()) {
      quoteStates.set(symbol, {
        timestamp: 0,
        bid: null,
        ask: null,
        last: null,
        volume24h: null,
        changePercent24h: null,
      });
    }
    const topics = [...instrumentsBySymbol.keys()].flatMap((symbol) => [
      'tickers.' + symbol,
      'orderbook.1.' + symbol,
    ]);

    const publishQuote = (symbol: string, timestamp: number): void => {
      const instrumentId = instrumentsBySymbol.get(symbol);
      const state = quoteStates.get(symbol);

      if (instrumentId === undefined || state === undefined) {
        return;
      }

      if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
        throw new RangeError('Bybit returned an invalid quote timestamp.');
      }

      state.timestamp = Math.max(state.timestamp, timestamp);
      const quote: QuoteUpdate = Object.freeze({
        instrumentId,
        timestamp: state.timestamp,
        receivedAt: Date.now(),
        bid: state.bid,
        ask: state.ask,
        last: state.last,
        volume24h: state.volume24h,
        changePercent24h: state.changePercent24h,
      });

      handlers.onQuote(quote);
    };

    const readOptionalNumber = (value: unknown, field: string): number | null => {
      if (value === undefined || value === null || value === '') {
        return null;
      }

      return toFiniteNumber(value, field);
    };

    const readTopOfBookPrice = (levels: unknown, field: string): number | null => {
      if (!Array.isArray(levels) || levels.length === 0) {
        return null;
      }

      const level = levels[0];

      if (!Array.isArray(level) || level.length < 2) {
        throw new RangeError('Bybit returned a malformed ' + field + ' orderbook level.');
      }

      const size = toFiniteNumber(level[1], field + ' size');

      return size === 0 ? null : toFiniteNumber(level[0], field + ' price');
    };

    return createReconnectingWebSocketSubscription({
      url: this.streamBaseUrl,
      webSocketFactory: this.webSocketFactory,
      reconnectDelayMs: this.reconnectDelayMs,
      maxReconnectDelayMs: this.maxReconnectDelayMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      ...(handlers.onStatus === undefined ? {} : { onStatus: handlers.onStatus }),
      ...(handlers.onError === undefined ? {} : { onError: handlers.onError }),
      onOpen: (connection) => {
        if (connection.send === undefined) {
          throw new Error('Bybit Spot WebSocket connection cannot send subscription messages.');
        }

        connection.send(JSON.stringify({ op: 'subscribe', args: topics }));
      },
      onMessage: (message, connection) => {
        const payload: unknown = JSON.parse(message);
        const operation = readProperty(payload, 'op');

        if (operation === 'ping') {
          if (connection.send === undefined) {
            throw new Error('Bybit Spot WebSocket connection cannot send pong messages.');
          }

          connection.send(JSON.stringify({ op: 'pong' }));
          return;
        }

        const success = readProperty(payload, 'success');

        if (success === false && operation === 'subscribe') {
          connection.close();
          const reason = readProperty(payload, 'ret_msg');
          throw new Error(
            typeof reason === 'string'
              ? 'Bybit Spot quote subscription failed: ' + reason
              : 'Bybit Spot quote subscription was rejected.',
          );
        }

        const topic = readProperty(payload, 'topic');

        if (typeof topic !== 'string') {
          return;
        }

        const isTicker = topic.startsWith('tickers.');
        const isOrderbook = topic.startsWith('orderbook.1.');

        if (!isTicker && !isOrderbook) {
          return;
        }

        const symbol = topic.slice(isTicker ? 'tickers.'.length : 'orderbook.1.'.length);
        const state = quoteStates.get(symbol);

        if (state === undefined || !instrumentsBySymbol.has(symbol)) {
          return;
        }

        const data = readProperty(payload, 'data');
        const items = Array.isArray(data) ? data : [data];
        const timestamp = toFiniteNumber(readProperty(payload, 'ts'), 'quote timestamp');

        for (const item of items) {
          if (!isRecord(item) || readProperty(item, 'symbol') !== symbol && isTicker) {
            throw new RangeError('Bybit returned a quote for an unexpected instrument.');
          }

          if (isTicker) {
            const last = readOptionalNumber(readProperty(item, 'lastPrice'), 'last price');
            const volume = readOptionalNumber(readProperty(item, 'volume24h'), '24-hour volume');
            const change = readOptionalNumber(
              readProperty(item, 'price24hPcnt'),
              '24-hour percentage change',
            );

            if (last !== null) {
              state.last = last;
            }

            if (volume !== null) {
              state.volume24h = volume;
            }

            if (change !== null) {
              state.changePercent24h = change * 100;
            }
          } else {
            if (readProperty(item, 's') !== symbol) {
              throw new RangeError('Bybit returned an orderbook for an unexpected instrument.');
            }

            state.bid = readTopOfBookPrice(readProperty(item, 'b'), 'bid');
            state.ask = readTopOfBookPrice(readProperty(item, 'a'), 'ask');
          }

          publishQuote(symbol, timestamp);
        }
      },
    });
  }

  async getHistoricalCandles(request: HistoricalCandleRequest): Promise<readonly Candle[]> {
    const interval = validateRequest(request);
    const symbol = normalizeSymbol(request.instrumentId);
    const candlesByTimestamp = new Map<number, Candle>();
    let cursorEnd = request.endTime;
    let pageCount = 0;

    while (cursorEnd > request.startTime) {
      if (pageCount >= this.maxPages) {
        throw new MarketDataProviderError(
          this.id,
          `Bybit Spot history exceeded the configured page limit of ${this.maxPages}.`,
        );
      }

      const url = new URL('/v5/market/kline', this.baseUrl);
      url.searchParams.set('category', 'spot');
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('interval', interval);
      url.searchParams.set('start', String(request.startTime));
      url.searchParams.set('end', String(cursorEnd - 1));
      url.searchParams.set('limit', String(this.pageSize));

      const response = await this.scheduler.run(
        () =>
          this.fetcher(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            ...(request.signal === undefined ? {} : { signal: request.signal }),
          }),
        request.signal,
      );

      const payload: unknown = await response.json().catch(() => null);
      const code = readProperty(payload, 'retCode');

      if (!response.ok || Number(code) !== 0) {
        throw new MarketDataProviderError(
          this.id,
          getApiError(payload, response.status),
          response.status,
          getRetryAfterMs(response),
        );
      }

      const result = readProperty(payload, 'result');
      const rows = readProperty(result, 'list');

      if (!Array.isArray(rows)) {
        throw new RangeError('Bybit returned a malformed kline response.');
      }

      if (rows.length === 0) {
        break;
      }

      const pageCandles = rows.map(parseCandle).sort((left, right) => {
        return left.timestamp - right.timestamp;
      });
      const inRange = pageCandles.filter(
        (candle) => candle.timestamp >= request.startTime && candle.timestamp < cursorEnd,
      );

      if (inRange.length === 0) {
        break;
      }

      for (const candle of inRange) {
        if (!candlesByTimestamp.has(candle.timestamp)) {
          candlesByTimestamp.set(candle.timestamp, candle);
        }
      }

      pageCount += 1;

      if (rows.length < this.pageSize) {
        break;
      }

      const oldestTimestamp = inRange[0]?.timestamp;

      if (oldestTimestamp === undefined || oldestTimestamp <= request.startTime) {
        break;
      }

      if (oldestTimestamp >= cursorEnd) {
        throw new MarketDataProviderError(
          this.id,
          'Bybit Spot pagination did not move to an earlier candle.',
        );
      }

      cursorEnd = oldestTimestamp;
    }

    return Object.freeze(
      [...candlesByTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp),
    );
  }
}
