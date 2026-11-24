import { createCandle, type Candle } from '@openview/market-domain';
import type {
  CandleInterval,
  HistoricalCandleRequest,
  MarketDataCapabilities,
  MarketDataProvider,
} from '../contracts';
import { MarketDataProviderError } from '../errors';
import { MarketDataRequestScheduler, type RequestWaiter } from '../request-scheduler';

const PROVIDER_ID = 'okx-spot';
const DEFAULT_BASE_URL = 'https://www.okx.com';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_REQUEST_INTERVAL_MS = 110;

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
  streamingQuotes: false,
  supportedIntervals: SUPPORTED_INTERVALS,
  redistribution: 'unknown',
  attributionRequired: false,
});

export type OkxSpotProviderOptions = Readonly<{
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

export class OkxSpotMarketDataProvider implements MarketDataProvider {
  readonly id = PROVIDER_ID;
  readonly displayName = 'OKX Spot';
  readonly capabilities = CAPABILITIES;

  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly scheduler: MarketDataRequestScheduler;

  constructor(options: OkxSpotProviderOptions = {}) {
    const parsedBaseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);

    if (parsedBaseUrl.protocol !== 'https:') {
      throw new RangeError('OKX Spot provider base URLs must use HTTPS.');
    }

    const fetcher = options.fetcher ?? globalThis.fetch;
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

    if (typeof fetcher !== 'function') {
      throw new Error('A Fetch API implementation is required for the OKX Spot provider.');
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
      throw new RangeError('OKX Spot page size must be an integer between 1 and 100.');
    }

    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
      throw new RangeError('OKX Spot maximum pages must be an integer between 1 and 1000.');
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
