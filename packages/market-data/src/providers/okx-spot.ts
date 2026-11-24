import { createCandle, type Candle, type InstrumentId } from '@openview/market-domain';
import type {
  CandleInterval,
  CandleStreamHandlers,
  CandleSubscriptionRequest,
  CandleUpdate,
  HistoricalCandleRequest,
  InstrumentDiscoveryFilter,
  MarketInstrument,
  MarketDataCapabilities,
  MarketDataProvider,
  MarketDataSubscription,
  QuoteStreamHandlers,
  QuoteUpdate,
} from '../contracts';
import { MarketDataProviderError } from '../errors';
import {
  createMarketInstrument,
  normalizeMarketInstruments,
} from '../instrument-catalog';
import { MarketDataRequestScheduler, type RequestWaiter } from '../request-scheduler';
import {
  createReconnectingWebSocketSubscription,
  type MarketDataWebSocketConnection,
  type MarketDataWebSocketFactory,
} from '../reconnecting-websocket';

const PROVIDER_ID = 'okx-spot';
const DEFAULT_BASE_URL = 'https://www.okx.com';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_REQUEST_INTERVAL_MS = 110;
const DEFAULT_STREAM_BASE_URL = 'wss://ws.okx.com/ws/v5/business';
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000;
const DEFAULT_HEARTBEAT_RESPONSE_TIMEOUT_MS = 5_000;

const INTERVALS: ReadonlyMap<CandleInterval, string> = new Map([
  ['1s', '1s'],
  ['1m', '1m'],
  ['3m', '3m'],
  ['5m', '5m'],
  ['15m', '15m'],
  ['30m', '30m'],
  ['1h', '1H'],
  ['2h', '2H'],
  ['4h', '4H'],
  ['12h', '12Hutc'],
  ['1d', '1Dutc'],
  ['3d', '3Dutc'],
  ['1w', '1Wutc'],
  ['1M', '1Mutc'],
]);

const SUPPORTED_INTERVALS: readonly CandleInterval[] = Object.freeze([
  '1s',
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '12h',
  '1d',
  '3d',
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

export type OkxSpotProviderOptions = Readonly<{
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
  heartbeatResponseTimeoutMs?: number;
  waiter?: RequestWaiter;
}>;

export type OkxWebSocketConnection = MarketDataWebSocketConnection;
export type OkxWebSocketFactory = MarketDataWebSocketFactory;

const isRecord = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readProperty = (value: unknown, key: string): unknown =>
  isRecord(value) ? Reflect.get(value, key) : undefined;

const toFiniteNumber = (value: unknown, field: string): number => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    throw new RangeError(`OKX returned an invalid ${field} value.`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new RangeError(`OKX returned a non-finite ${field} value.`);
  }

  return parsed;
};

const parseCandle = (value: unknown): Candle => {
  if (!Array.isArray(value) || value.length < 6) {
    throw new RangeError('OKX returned a malformed candlestick row.');
  }

  const timestamp = toFiniteNumber(value[0], 'open time');

  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new RangeError('OKX returned an invalid candle open time.');
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
    throw new RangeError(`OKX returned an invalid OHLCV candle: ${candle.error}.`);
  }

  return candle.value;
};

const normalizeInstrumentId = (instrumentId: string): string => {
  const value = instrumentId.trim().toUpperCase();
  const separatorIndex = value.indexOf(':');
  const exchange = separatorIndex < 0 ? null : value.slice(0, separatorIndex);
  const pair = separatorIndex < 0 ? value : value.slice(separatorIndex + 1);

  if (exchange !== null && exchange !== 'OKX') {
    throw new RangeError('OKX Spot only accepts unqualified symbols or OKX-qualified symbols.');
  }

  const normalizedPair = pair.replace(/\//g, '-');

  if (!/^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$/.test(normalizedPair)) {
    throw new RangeError('OKX Spot symbols must include a base and quote asset, such as BTC-USDT.');
  }

  return normalizedPair;
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
    throw new RangeError(`OKX Spot does not support the ${request.interval} candle interval.`);
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
  const code = readProperty(payload, 'code');
  const message = readProperty(payload, 'msg');
  const codeLabel = typeof code === 'string' && code.length > 0 ? ` (code ${code})` : '';
  const messageLabel = typeof message === 'string' && message.length > 0 ? `: ${message}` : '';

  return `OKX API request failed with HTTP ${status}${codeLabel}${messageLabel}.`;
};

const parseStreamCandles = (
  value: unknown,
  request: CandleSubscriptionRequest,
  instrumentId: string,
  channel: string,
): readonly CandleUpdate[] => {
  const argument = readProperty(value, 'arg');

  if (
    readProperty(argument, 'channel') !== channel ||
    readProperty(argument, 'instId') !== instrumentId
  ) {
    return Object.freeze([]);
  }

  const data = readProperty(value, 'data');

  if (!Array.isArray(data)) {
    throw new RangeError('OKX returned a malformed WebSocket candlesticks payload.');
  }

  return Object.freeze(
    data.map((row) => {
      const candle = parseCandle(row);
      const confirmation = Array.isArray(row) ? row[8] : undefined;

      if (confirmation !== '0' && confirmation !== '1') {
        throw new RangeError('OKX returned an invalid streamed candle confirmation flag.');
      }

      return Object.freeze({
        instrumentId: request.instrumentId,
        interval: request.interval,
        candle,
        isFinal: confirmation === '1',
      });
    }),
  );
};

export class OkxSpotMarketDataProvider implements MarketDataProvider {
  readonly id = PROVIDER_ID;
  readonly displayName = 'OKX Spot';
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
  private readonly heartbeatResponseTimeoutMs: number;
  private readonly scheduler: MarketDataRequestScheduler;

  constructor(options: OkxSpotProviderOptions = {}) {
    const parsedBaseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);

    if (parsedBaseUrl.protocol !== 'https:') {
      throw new RangeError('OKX Spot provider base URLs must use HTTPS.');
    }

    const streamBaseUrl = new URL(options.streamBaseUrl ?? DEFAULT_STREAM_BASE_URL);
    const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    const webSocketFactory = options.webSocketFactory ?? ((url: string) => new WebSocket(url));
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    const reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    const maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    const heartbeatResponseTimeoutMs =
      options.heartbeatResponseTimeoutMs ?? DEFAULT_HEARTBEAT_RESPONSE_TIMEOUT_MS;

    if (typeof fetcher !== 'function') {
      throw new Error('A Fetch API implementation is required for the OKX Spot provider.');
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
      throw new RangeError('OKX Spot page size must be an integer between 1 and 100.');
    }

    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
      throw new RangeError('OKX Spot maximum pages must be an integer between 1 and 1000.');
    }

    if (streamBaseUrl.protocol !== 'wss:') {
      throw new RangeError('OKX Spot stream URLs must use WSS.');
    }

    if (typeof webSocketFactory !== 'function') {
      throw new Error('A WebSocket factory is required for the OKX Spot provider.');
    }

    if (!Number.isInteger(reconnectDelayMs) || reconnectDelayMs < 1) {
      throw new RangeError('OKX Spot reconnect delay must be a positive integer.');
    }

    if (!Number.isInteger(maxReconnectDelayMs) || maxReconnectDelayMs < reconnectDelayMs) {
      throw new RangeError('OKX Spot maximum reconnect delay must be at least the initial delay.');
    }

    if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1) {
      throw new RangeError('OKX Spot heartbeat interval must be a positive integer.');
    }

    if (!Number.isInteger(heartbeatResponseTimeoutMs) || heartbeatResponseTimeoutMs < 1) {
      throw new RangeError('OKX Spot heartbeat response timeout must be a positive integer.');
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
    this.heartbeatResponseTimeoutMs = heartbeatResponseTimeoutMs;
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
        'OKX Spot does not support the ' + request.interval + ' candle interval.',
      );
    }

    const instrumentId = normalizeInstrumentId(request.instrumentId);
    const channel = 'candle' + interval;

    return createReconnectingWebSocketSubscription({
      url: this.streamBaseUrl,
      webSocketFactory: this.webSocketFactory,
      reconnectDelayMs: this.reconnectDelayMs,
      maxReconnectDelayMs: this.maxReconnectDelayMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      heartbeatMessage: 'ping',
      heartbeatOnIdle: true,
      heartbeatResponse: 'pong',
      heartbeatResponseTimeoutMs: this.heartbeatResponseTimeoutMs,
      ...(handlers.onStatus === undefined ? {} : { onStatus: handlers.onStatus }),
      ...(handlers.onError === undefined ? {} : { onError: handlers.onError }),
      onOpen: (connection) => {
        if (connection.send === undefined) {
          throw new Error('OKX Spot WebSocket connection cannot send subscription messages.');
        }

        connection.send(
          JSON.stringify({
            op: 'subscribe',
            args: [{ channel, instId: instrumentId }],
          }),
        );
      },
      onMessage: (message, connection) => {
        if (message === 'ping') {
          if (connection.send === undefined) {
            throw new Error('OKX Spot WebSocket connection cannot send pong messages.');
          }

          connection.send('pong');
          return;
        }

        if (message === 'pong') {
          return;
        }

        const payload: unknown = JSON.parse(message);
        const event = readProperty(payload, 'event');

        if (event === 'error') {
          connection.close();
          const code = readProperty(payload, 'code');
          const reason = readProperty(payload, 'msg');
          throw new Error(
            'OKX Spot subscription failed' +
              (code === undefined ? '' : ' (code ' + String(code) + ')') +
              (typeof reason === 'string' && reason.length > 0 ? ': ' + reason : '.'),
          );
        }

        if (event !== undefined) {
          return;
        }

        for (const update of parseStreamCandles(payload, request, instrumentId, channel)) {
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
      throw new RangeError('At least one instrument is required for an OKX Spot quote stream.');
    }

    const instrumentsById = new Map<string, InstrumentId>();

    for (const instrumentId of instrumentIds) {
      const normalizedId = normalizeInstrumentId(instrumentId);

      if (instrumentsById.has(normalizedId)) {
        throw new RangeError('OKX Spot quote subscriptions cannot contain duplicate instruments.');
      }

      instrumentsById.set(normalizedId, instrumentId);
    }

    const args = [...instrumentsById.keys()].map((instId) => ({
      channel: 'tickers',
      instId,
    }));
    const url = new URL('/ws/v5/public', this.streamBaseUrl);

    const readOptionalNumber = (value: unknown, field: string): number | null => {
      if (value === undefined || value === null || value === '') {
        return null;
      }

      return toFiniteNumber(value, field);
    };

    return createReconnectingWebSocketSubscription({
      url: url.toString(),
      webSocketFactory: this.webSocketFactory,
      reconnectDelayMs: this.reconnectDelayMs,
      maxReconnectDelayMs: this.maxReconnectDelayMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      heartbeatMessage: 'ping',
      heartbeatOnIdle: true,
      heartbeatResponse: 'pong',
      heartbeatResponseTimeoutMs: this.heartbeatResponseTimeoutMs,
      ...(handlers.onStatus === undefined ? {} : { onStatus: handlers.onStatus }),
      ...(handlers.onError === undefined ? {} : { onError: handlers.onError }),
      onOpen: (connection) => {
        if (connection.send === undefined) {
          throw new Error('OKX Spot WebSocket connection cannot send subscription messages.');
        }

        connection.send(JSON.stringify({ op: 'subscribe', args }));
      },
      onMessage: (message, connection) => {
        if (message === 'ping') {
          if (connection.send === undefined) {
            throw new Error('OKX Spot WebSocket connection cannot send pong messages.');
          }

          connection.send('pong');
          return;
        }

        if (message === 'pong') {
          return;
        }

        const payload: unknown = JSON.parse(message);
        const event = readProperty(payload, 'event');

        if (event === 'error') {
          connection.close();
          const code = readProperty(payload, 'code');
          const reason = readProperty(payload, 'msg');
          throw new Error(
            'OKX Spot quote subscription failed' +
              (code === undefined ? '' : ' (code ' + String(code) + ')') +
              (typeof reason === 'string' && reason.length > 0 ? ': ' + reason : '.'),
          );
        }

        if (event !== undefined) {
          return;
        }

        const argument = readProperty(payload, 'arg');

        if (readProperty(argument, 'channel') !== 'tickers') {
          return;
        }

        const instrument = readProperty(argument, 'instId');

        if (typeof instrument !== 'string' || !instrumentsById.has(instrument)) {
          return;
        }

        const data = readProperty(payload, 'data');

        if (!Array.isArray(data)) {
          throw new RangeError('OKX returned a malformed WebSocket tickers payload.');
        }

        for (const item of data) {
          if (!isRecord(item) || readProperty(item, 'instId') !== instrument) {
            throw new RangeError('OKX returned a ticker for an unexpected instrument.');
          }

          const mappedInstrumentId = instrumentsById.get(instrument);

          if (mappedInstrumentId === undefined) {
            return;
          }

          const timestamp = toFiniteNumber(readProperty(item, 'ts'), 'ticker timestamp');

          if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
            throw new RangeError('OKX returned an invalid ticker timestamp.');
          }

          const last = readOptionalNumber(readProperty(item, 'last'), 'last price');
          const open24h = readOptionalNumber(readProperty(item, 'open24h'), '24-hour open price');
          const changePercent24h =
            last !== null && open24h !== null && open24h > 0
              ? ((last - open24h) / open24h) * 100
              : null;
          const quote: QuoteUpdate = Object.freeze({
            instrumentId: mappedInstrumentId,
            timestamp,
            receivedAt: Date.now(),
            bid: readOptionalNumber(readProperty(item, 'bidPx'), 'best bid price'),
            ask: readOptionalNumber(readProperty(item, 'askPx'), 'best ask price'),
            last,
            volume24h: readOptionalNumber(readProperty(item, 'vol24h'), '24-hour base volume'),
            changePercent24h,
          });

          handlers.onQuote(quote);
        }
      },
    });
  }

  async listInstruments(
    filter: InstrumentDiscoveryFilter = {},
  ): Promise<readonly MarketInstrument[]> {
    const url = new URL('/api/v5/public/instruments', this.baseUrl);
    url.searchParams.set('instType', 'SPOT');

    const response = await this.scheduler.run(
      () =>
        this.fetcher(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          ...(filter.signal === undefined ? {} : { signal: filter.signal }),
        }),
      filter.signal,
    );
    const payload: unknown = await response.json().catch(() => null);
    const code = readProperty(payload, 'code');

    if (!response.ok || code !== '0') {
      throw new MarketDataProviderError(
        this.id,
        getApiError(payload, response.status),
        response.status,
        getRetryAfterMs(response),
      );
    }

    const rows = readProperty(payload, 'data');

    if (!Array.isArray(rows)) {
      throw new RangeError('OKX returned a malformed public instruments response.');
    }

    const instruments: MarketInstrument[] = [];

    for (const item of rows) {
      if (!isRecord(item)) {
        throw new RangeError('OKX returned a malformed spot instrument.');
      }

      if (readProperty(item, 'state') !== 'live') {
        continue;
      }

      const baseAsset = readProperty(item, 'baseCcy');
      const quoteAsset = readProperty(item, 'quoteCcy');

      if (typeof baseAsset !== 'string' || typeof quoteAsset !== 'string') {
        throw new RangeError('OKX returned an instrument without base and quote currencies.');
      }

      instruments.push(createMarketInstrument(baseAsset, quoteAsset));
    }

    return normalizeMarketInstruments(instruments, filter);
  }

  async getHistoricalCandles(request: HistoricalCandleRequest): Promise<readonly Candle[]> {
    const interval = validateRequest(request);
    const instrumentId = normalizeInstrumentId(request.instrumentId);
    const candlesByTimestamp = new Map<number, Candle>();
    let cursor = request.endTime;
    let pageCount = 0;

    while (cursor > request.startTime) {
      if (pageCount >= this.maxPages) {
        throw new MarketDataProviderError(
          this.id,
          `OKX Spot history exceeded the configured page limit of ${this.maxPages}.`,
        );
      }

      const url = new URL('/api/v5/market/history-candles', this.baseUrl);
      url.searchParams.set('instId', instrumentId);
      url.searchParams.set('bar', interval);
      url.searchParams.set('after', String(cursor));
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
      const code = readProperty(payload, 'code');

      if (!response.ok || code !== '0') {
        throw new MarketDataProviderError(
          this.id,
          getApiError(payload, response.status),
          response.status,
          getRetryAfterMs(response),
        );
      }

      const rows = readProperty(payload, 'data');

      if (!Array.isArray(rows)) {
        throw new RangeError('OKX returned a malformed history candlesticks response.');
      }

      if (rows.length === 0) {
        break;
      }

      const pageCandles = rows.map(parseCandle).sort((left, right) => {
        return left.timestamp - right.timestamp;
      });
      const inRange = pageCandles.filter(
        (candle) => candle.timestamp >= request.startTime && candle.timestamp < cursor,
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

      if (oldestTimestamp >= cursor) {
        throw new MarketDataProviderError(
          this.id,
          'OKX Spot pagination did not move to an earlier candle.',
        );
      }

      cursor = oldestTimestamp;
    }

    return Object.freeze(
      [...candlesByTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp),
    );
  }
}
