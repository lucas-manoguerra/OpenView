import { describe, expect, it, vi } from 'vitest';
import { createInstrumentId } from '@openview/market-domain';
import {
  BinanceSpotMarketDataProvider,
  type BinanceSpotProviderOptions,
} from '../src/providers/binance-spot';

const MINUTE = 60_000;
const START_TIME = Date.UTC(2024, 0, 1);

const createKline = (timestamp: number, close = '102'): readonly unknown[] => [
  timestamp,
  '100',
  '105',
  '98',
  close,
  '12.5',
  timestamp + MINUTE - 1,
  '1250',
  20,
  '6',
  '600',
  '0',
];

const createResponse = (payload: unknown, status = 200, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(payload), { status, headers });

const createFetcher = (
  responses: readonly Response[],
): Readonly<{
  fetcher: typeof fetch;
  requests: { url: URL; init: RequestInit }[];
}> => {
  const pendingResponses = [...responses];
  const requests: { url: URL; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    if (pendingResponses.length === 0) {
      throw new Error('No mocked Binance response is available.');
    }

    const url = input instanceof URL ? input : new URL(String(input));
    requests.push({ url, init });

    const response = pendingResponses.shift();

    if (response === undefined) {
      throw new Error('No mocked Binance response is available.');
    }

    return response;
  };

  return { fetcher, requests };
};

const getItem = <T>(items: readonly T[], index: number): T => {
  const item = items[index];

  if (item === undefined) {
    throw new Error('The requested test value does not exist.');
  }

  return item;
};

const createRequest = (
  overrides: Partial<{
    instrumentId: string;
    startTime: number;
    endTime: number;
  }> = {},
) => ({
  instrumentId: createInstrumentId(overrides.instrumentId ?? 'BINANCE:BTC/USDT'),
  interval: '1m' as const,
  startTime: overrides.startTime ?? START_TIME,
  endTime: overrides.endTime ?? START_TIME + 3 * MINUTE,
});

const createProvider = (options: BinanceSpotProviderOptions = {}) =>
  new BinanceSpotMarketDataProvider(options);

describe('Binance Spot market data provider', () => {
  it('exposes its public historical candle capabilities without API credentials', () => {
    const provider = createProvider();

    expect(provider.id).toBe('binance-spot');
    expect(provider.displayName).toBe('Binance Spot');
    expect(provider.capabilities.historicalCandles).toBe(true);
    expect(provider.capabilities.streamingQuotes).toBe(false);
    expect(provider.capabilities.supportedIntervals).toContain('1M');
    expect(provider.capabilities.redistribution).toBe('unknown');
  });

  it('maps public Binance kline rows to domain candles and uses the market-data-only endpoint', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse([
        createKline(START_TIME),
        createKline(START_TIME + MINUTE, '103'),
        createKline(START_TIME + 2 * MINUTE, '104'),
      ]),
    ]);
    const provider = createProvider({ fetcher });

    const candles = await provider.getHistoricalCandles(
      createRequest({
        instrumentId: 'BINANCE:BTC/USDT',
        endTime: START_TIME + 2 * MINUTE,
      }),
    );

    expect(candles).toEqual([
      {
        timestamp: START_TIME,
        open: 100,
        high: 105,
        low: 98,
        close: 102,
        volume: 12.5,
      },
      {
        timestamp: START_TIME + MINUTE,
        open: 100,
        high: 105,
        low: 98,
        close: 103,
        volume: 12.5,
      },
    ]);
    expect(Object.isFrozen(candles)).toBe(true);
    expect(Object.isFrozen(candles[0])).toBe(true);
    expect(requests).toHaveLength(1);
    expect(getItem(requests, 0).url.origin).toBe('https://data-api.binance.vision');
    expect(getItem(requests, 0).url.pathname).toBe('/api/v3/klines');
    expect(requests[0]!.url.searchParams.get('symbol')).toBe('BTCUSDT');
    expect(requests[0]!.url.searchParams.get('interval')).toBe('1m');
    expect(requests[0]!.url.searchParams.get('startTime')).toBe(String(START_TIME));
    expect(requests[0]!.url.searchParams.get('endTime')).toBe(String(START_TIME + 2 * MINUTE - 1));
    expect(requests[0]!.url.searchParams.get('limit')).toBe('1000');
    expect(new Headers(requests[0]!.init.headers).get('authorization')).toBeNull();
    expect(new Headers(requests[0]!.init.headers).get('accept')).toBe('application/json');
  });

  it('normalizes plain and exchange-qualified instrument identifiers', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse([createKline(START_TIME)]),
      createResponse([createKline(START_TIME)]),
    ]);
    const provider = createProvider({ fetcher });

    await provider.getHistoricalCandles(createRequest({ instrumentId: 'BTC-USDT' }));
    await provider.getHistoricalCandles(createRequest({ instrumentId: 'BTCUSDT' }));

    expect(requests.map((request) => request.url.searchParams.get('symbol'))).toEqual([
      'BTCUSDT',
      'BTCUSDT',
    ]);
  });

  it('requests additional pages without duplicating the previous page boundary', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse([createKline(START_TIME), createKline(START_TIME + MINUTE)]),
      createResponse([createKline(START_TIME + 2 * MINUTE)]),
    ]);
    const provider = createProvider({ fetcher, pageSize: 2 });
    const candles = await provider.getHistoricalCandles(createRequest());

    expect(candles.map((candle) => candle.timestamp)).toEqual([
      START_TIME,
      START_TIME + MINUTE,
      START_TIME + 2 * MINUTE,
    ]);
    expect(requests).toHaveLength(2);
    expect(getItem(requests, 1).url.searchParams.get('startTime')).toBe(
      String(START_TIME + MINUTE + 1),
    );
    expect(
      requests.every(
        (request) =>
          request.url.searchParams.get('endTime') === String(START_TIME + 3 * MINUTE - 1),
      ),
    ).toBe(true);
  });

  it('sorts candles chronologically and removes duplicate open times', async () => {
    const { fetcher } = createFetcher([
      createResponse([
        createKline(START_TIME + MINUTE),
        createKline(START_TIME),
        createKline(START_TIME + MINUTE, '104'),
      ]),
    ]);
    const provider = createProvider({ fetcher });
    const candles = await provider.getHistoricalCandles(createRequest());

    expect(candles.map((candle) => candle.timestamp)).toEqual([START_TIME, START_TIME + MINUTE]);
    expect(getItem(candles, 1).close).toBe(102);
  });

  it('passes an optional abort signal through to fetch', async () => {
    const { fetcher, requests } = createFetcher([createResponse([createKline(START_TIME)])]);
    const provider = createProvider({ fetcher });
    const controller = new AbortController();

    await provider.getHistoricalCandles({
      ...createRequest(),
      signal: controller.signal,
    });

    expect(requests[0]!.init.signal).toBe(controller.signal);
  });

  it('surfaces rate limit status and retry-after metadata without retrying automatically', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse({ code: -1003, msg: 'Too many requests' }, 429, { 'Retry-After': '2' }),
    ]);
    const provider = createProvider({ fetcher });

    await expect(provider.getHistoricalCandles(createRequest())).rejects.toMatchObject({
      name: 'MarketDataProviderError',
      providerId: 'binance-spot',
      statusCode: 429,
      retryAfterMs: 2_000,
      message: 'Binance API request failed with HTTP 429: Too many requests',
    });
    expect(requests).toHaveLength(1);
  });

  it('rejects malformed responses and invalid OHLCV rows', async () => {
    const malformedResponse = createFetcher([createResponse({ data: [] })]);
    const invalidCandleResponse = createFetcher([
      createResponse([createKline(START_TIME, 'not-a-price')]),
    ]);

    await expect(
      createProvider({ fetcher: malformedResponse.fetcher }).getHistoricalCandles(createRequest()),
    ).rejects.toThrow('malformed klines response');
    await expect(
      createProvider({ fetcher: invalidCandleResponse.fetcher }).getHistoricalCandles(
        createRequest(),
      ),
    ).rejects.toThrow('non-finite close');
  });

  it('rejects invalid request ranges and symbols before performing network requests', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = createProvider({ fetcher });

    await expect(
      provider.getHistoricalCandles(
        createRequest({ startTime: START_TIME + MINUTE, endTime: START_TIME }),
      ),
    ).rejects.toThrow(RangeError);
    await expect(
      provider.getHistoricalCandles(createRequest({ instrumentId: 'BYBIT:BTCUSDT' })),
    ).rejects.toThrow(RangeError);
    await expect(
      provider.getHistoricalCandles(createRequest({ instrumentId: 'BTC USDT' })),
    ).rejects.toThrow(RangeError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects non-advancing history requests when the configured page limit is reached', async () => {
    const { fetcher, requests } = createFetcher([createResponse([createKline(START_TIME)])]);
    const provider = createProvider({ fetcher, pageSize: 1, maxPages: 1 });

    await expect(provider.getHistoricalCandles(createRequest())).rejects.toThrow(
      'exceeded the configured page limit',
    );
    expect(requests).toHaveLength(1);
  });

  it('requires secure provider URLs and valid paging configuration', () => {
    expect(() => createProvider({ baseUrl: 'http://api.example.test' })).toThrow(RangeError);
    expect(() => createProvider({ pageSize: 1_001 })).toThrow(RangeError);
    expect(() => createProvider({ maxPages: 0 })).toThrow(RangeError);
  });
});
