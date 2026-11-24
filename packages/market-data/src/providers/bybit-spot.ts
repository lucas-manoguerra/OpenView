import { createCandle, type Candle } from '@openview/market-domain';
import type {
  CandleInterval,
  HistoricalCandleRequest,
  MarketDataCapabilities,
  MarketDataProvider,
} from '../contracts';
import { MarketDataProviderError } from '../errors';
import { MarketDataRequestScheduler, type RequestWaiter } from '../request-scheduler';

const PROVIDER_ID = 'bybit-spot';
const DEFAULT_BASE_URL = 'https://api.bybit.com';
const DEFAULT_PAGE_SIZE = 1_000;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_REQUEST_INTERVAL_MS = 100;

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
  streamingQuotes: false,
  supportedIntervals: SUPPORTED_INTERVALS,
  redistribution: 'unknown',
  attributionRequired: false,
});

export type BybitSpotProviderOptions = Readonly<{
  baseUrl?: string;
  fetcher?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
  minimumRequestIntervalMs?: number;
  waiter?: RequestWaiter;
}>;

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
  private readonly fetcher: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly scheduler: MarketDataRequestScheduler;

  constructor(options: BybitSpotProviderOptions = {}) {
    const parsedBaseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);

    if (parsedBaseUrl.protocol !== 'https:') {
      throw new RangeError('Bybit Spot provider base URLs must use HTTPS.');
    }

    const fetcher = options.fetcher ?? globalThis.fetch;
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

    if (typeof fetcher !== 'function') {
      throw new Error('A Fetch API implementation is required for the Bybit Spot provider.');
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
      throw new RangeError('Bybit Spot page size must be an integer between 1 and 1000.');
    }

    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
      throw new RangeError('Bybit Spot maximum pages must be an integer between 1 and 1000.');
    }

    this.baseUrl = parsedBaseUrl.toString().replace(/\/$/, '');
    this.fetcher = fetcher;
    this.pageSize = pageSize;
    this.maxPages = maxPages;
    this.scheduler = new MarketDataRequestScheduler({
      minimumIntervalMs: options.minimumRequestIntervalMs ?? DEFAULT_REQUEST_INTERVAL_MS,
      ...(options.waiter === undefined ? {} : { waiter: options.waiter }),
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
