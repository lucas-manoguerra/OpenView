import { createCandle, type Candle } from '@openview/market-domain';
import type {
  CandleInterval,
  HistoricalCandleRequest,
  MarketDataCapabilities,
  MarketDataProvider,
} from '../contracts';
import { MarketDataProviderError } from '../errors';

const PROVIDER_ID = 'binance-spot';
const DEFAULT_BASE_URL = 'https://data-api.binance.vision';
const DEFAULT_PAGE_SIZE = 1_000;
const DEFAULT_MAX_PAGES = 100;

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
  '8h',
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

export type BinanceSpotProviderOptions = Readonly<{
  baseUrl?: string;
  fetcher?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toFiniteNumber = (value: unknown, field: string): number => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    throw new RangeError(`Binance returned an invalid ${field} value.`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new RangeError(`Binance returned a non-finite ${field} value.`);
  }

  return parsed;
};

const parseCandle = (value: unknown): Candle => {
  if (!Array.isArray(value) || value.length < 6) {
    throw new RangeError('Binance returned a malformed kline row.');
  }

  const timestamp = toFiniteNumber(value[0], 'open time');

  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new RangeError('Binance returned an invalid candle open time.');
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
    throw new RangeError(`Binance returned an invalid OHLCV candle: ${candle.error}.`);
  }

  return candle.value;
};

const normalizeSymbol = (instrumentId: string): string => {
  const value = instrumentId.trim().toUpperCase();
  const separatorIndex = value.indexOf(':');
  const exchange = separatorIndex < 0 ? null : value.slice(0, separatorIndex);
  const pair = separatorIndex < 0 ? value : value.slice(separatorIndex + 1);

  if (exchange !== null && exchange !== 'BINANCE') {
    throw new RangeError(
      'Binance Spot only accepts unqualified symbols or BINANCE-qualified symbols.',
    );
  }

  const symbol = pair.replace(/[-/_]/g, '');

  if (!/^[A-Z0-9]{3,30}$/.test(symbol)) {
    throw new RangeError('Instrument identifiers must resolve to a valid Binance Spot symbol.');
  }

  return symbol;
};

const validateRequest = (request: HistoricalCandleRequest): void => {
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
};

const getRetryAfterMs = (response: Response): number | null => {
  const value = response.headers.get('retry-after');

  if (value === null) {
    return null;
  }

  const seconds = Number(value);

  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1_000) : null;
};

const getApiErrorMessage = (payload: unknown, status: number): string => {
  if (isRecord(payload)) {
    const message: unknown = Reflect.get(payload, 'msg');

    if (typeof message === 'string') {
      return `Binance API request failed with HTTP ${status}: ${message}`;
    }
  }

  return `Binance API request failed with HTTP ${status}.`;
};

export class BinanceSpotMarketDataProvider implements MarketDataProvider {
  readonly id = PROVIDER_ID;
  readonly displayName = 'Binance Spot';
  readonly capabilities = CAPABILITIES;

  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;

  constructor(options: BinanceSpotProviderOptions = {}) {
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const parsedBaseUrl = new URL(baseUrl);

    if (parsedBaseUrl.protocol !== 'https:') {
      throw new RangeError('Binance Spot provider base URLs must use HTTPS.');
    }

    const fetcher = options.fetcher ?? globalThis.fetch;
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

    if (typeof fetcher !== 'function') {
      throw new Error('A Fetch API implementation is required for the Binance Spot provider.');
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
      throw new RangeError('Binance Spot page size must be an integer between 1 and 1000.');
    }

    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
      throw new RangeError('Binance Spot maximum pages must be an integer between 1 and 1000.');
    }

    this.baseUrl = parsedBaseUrl.toString().replace(/\/$/, '');
    this.fetcher = fetcher;
    this.pageSize = pageSize;
    this.maxPages = maxPages;
  }

  async getHistoricalCandles(request: HistoricalCandleRequest): Promise<readonly Candle[]> {
    validateRequest(request);

    const symbol = normalizeSymbol(request.instrumentId);
    const candles: Candle[] = [];
    let cursor = request.startTime;
    let pageCount = 0;

    while (cursor < request.endTime) {
      if (pageCount >= this.maxPages) {
        throw new MarketDataProviderError(
          this.id,
          `Binance Spot history exceeded the configured page limit of ${this.maxPages}.`,
        );
      }

      const url = new URL('/api/v3/klines', this.baseUrl);
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('interval', request.interval);
      url.searchParams.set('startTime', String(cursor));
      url.searchParams.set('endTime', String(request.endTime - 1));
      url.searchParams.set('limit', String(this.pageSize));

      const response = await this.fetcher(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });

      if (!response.ok) {
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        throw new MarketDataProviderError(
          this.id,
          getApiErrorMessage(payload, response.status),
          response.status,
          getRetryAfterMs(response),
        );
      }

      const payload: unknown = await response.json();

      if (!Array.isArray(payload)) {
        throw new RangeError('Binance returned a malformed klines response.');
      }

      if (payload.length === 0) {
        break;
      }

      const pageCandles = payload.map(parseCandle).sort((left, right) => {
        return left.timestamp - right.timestamp;
      });
      let lastPageTimestamp = Number.NEGATIVE_INFINITY;

      for (const candle of pageCandles) {
        if (
          candle.timestamp >= cursor &&
          candle.timestamp >= request.startTime &&
          candle.timestamp < request.endTime &&
          candle.timestamp > lastPageTimestamp
        ) {
          candles.push(candle);
          lastPageTimestamp = candle.timestamp;
        }
      }

      pageCount += 1;

      if (payload.length < this.pageSize) {
        break;
      }

      if (!Number.isFinite(lastPageTimestamp) || lastPageTimestamp < cursor) {
        throw new MarketDataProviderError(
          this.id,
          'Binance Spot pagination did not advance to a newer candle.',
        );
      }

      const nextCursor = lastPageTimestamp + 1;

      if (nextCursor <= cursor) {
        throw new MarketDataProviderError(
          this.id,
          'Binance Spot pagination produced a non-increasing cursor.',
        );
      }

      cursor = nextCursor;
    }

    return Object.freeze(candles);
  }
}
