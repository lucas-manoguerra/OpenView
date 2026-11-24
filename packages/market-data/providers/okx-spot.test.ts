import { describe, expect, it, vi } from 'vitest';
import { createInstrumentId } from '@openview/market-domain';
import { OkxSpotMarketDataProvider } from '../src/providers/okx-spot';

const MINUTE = 60_000;
const START_TIME = Date.UTC(2024, 0, 1);

const createCandleRow = (timestamp: number, close = '102'): readonly unknown[] => [
  timestamp,
  '100',
  '105',
  '98',
  close,
  '12.5',
  '1250',
  '1250',
  '1',
];

const createResponse = (payload: unknown, status = 200, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(payload), { status, headers });

const createOkxPayload = (data: readonly unknown[], code = '0', msg = '') => ({
  code,
  msg,
  data,
});

const createFetcher = (
  responses: readonly Response[],
): Readonly<{
  fetcher: typeof fetch;
  requests: { url: URL; init: RequestInit }[];
}> => {
  const pendingResponses = [...responses];
  const requests: { url: URL; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const response = pendingResponses.shift();

    if (response === undefined) {
      throw new Error('No mocked OKX response is available.');
    }

    requests.push({
      url: input instanceof URL ? input : new URL(String(input)),
      init,
    });

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
    interval: '1m' | '1s' | '8h' | '1d' | '1M';
    startTime: number;
    endTime: number;
  }> = {},
) => ({
  instrumentId: createInstrumentId(overrides.instrumentId ?? 'OKX:BTC-USDT'),
  interval: overrides.interval ?? '1m',
  startTime: overrides.startTime ?? START_TIME,
  endTime: overrides.endTime ?? START_TIME + 2 * MINUTE,
});

const createProvider = (options: ConstructorParameters<typeof OkxSpotMarketDataProvider>[0] = {}) =>
  new OkxSpotMarketDataProvider({
    minimumRequestIntervalMs: 0,
    ...options,
  });

describe('OKX Spot market data provider', () => {
  it('exposes public historical candle capabilities without credentials', () => {
    const provider = createProvider();

    expect(provider.id).toBe('okx-spot');
    expect(provider.displayName).toBe('OKX Spot');
    expect(provider.capabilities.historicalCandles).toBe(true);
    expect(provider.capabilities.streamingQuotes).toBe(false);
    expect(provider.capabilities.supportedIntervals).toContain('1s');
    expect(provider.capabilities.supportedIntervals).toContain('1M');
    expect(provider.capabilities.redistribution).toBe('unknown');
  });

  it('maps history candlesticks into chronological domain candles', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(
        createOkxPayload([
          createCandleRow(START_TIME + MINUTE, '103'),
          createCandleRow(START_TIME, '102'),
        ]),
      ),
    ]);
    const provider = createProvider({ fetcher });
    const candles = await provider.getHistoricalCandles(createRequest());

    expect(candles.map((candle) => candle.timestamp)).toEqual([START_TIME, START_TIME + MINUTE]);
    expect(getItem(candles, 0).close).toBe(102);
    expect(getItem(candles, 1).close).toBe(103);
    expect(Object.isFrozen(candles)).toBe(true);
    expect(Object.isFrozen(getItem(candles, 0))).toBe(true);
    expect(getItem(requests, 0).url.origin).toBe('https://www.okx.com');
    expect(getItem(requests, 0).url.pathname).toBe('/api/v5/market/history-candles');
    expect(getItem(requests, 0).url.searchParams.get('instId')).toBe('BTC-USDT');
    expect(getItem(requests, 0).url.searchParams.get('bar')).toBe('1m');
    expect(getItem(requests, 0).url.searchParams.get('after')).toBe(
      String(START_TIME + 2 * MINUTE),
    );
    expect(getItem(requests, 0).url.searchParams.get('limit')).toBe('100');
    expect(new Headers(getItem(requests, 0).init.headers).get('authorization')).toBeNull();
  });

  it('uses UTC calendar boundaries for daily and monthly candle intervals', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(createOkxPayload([createCandleRow(START_TIME)])),
      createResponse(createOkxPayload([createCandleRow(START_TIME)])),
    ]);
    const provider = createProvider({ fetcher });

    await provider.getHistoricalCandles(createRequest({ interval: '1d' }));
    await provider.getHistoricalCandles(createRequest({ interval: '1M' }));

    expect(getItem(requests, 0).url.searchParams.get('bar')).toBe('1Dutc');
    expect(getItem(requests, 1).url.searchParams.get('bar')).toBe('1Mutc');
  });

  it('paginates backward using the oldest candle timestamp returned by the previous page', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(
        createOkxPayload([
          createCandleRow(START_TIME + 2 * MINUTE),
          createCandleRow(START_TIME + MINUTE),
        ]),
      ),
      createResponse(createOkxPayload([createCandleRow(START_TIME)])),
    ]);
    const provider = createProvider({ fetcher, pageSize: 2 });
    const candles = await provider.getHistoricalCandles(
      createRequest({ endTime: START_TIME + 3 * MINUTE }),
    );

    expect(candles.map((candle) => candle.timestamp)).toEqual([
      START_TIME,
      START_TIME + MINUTE,
      START_TIME + 2 * MINUTE,
    ]);
    expect(requests).toHaveLength(2);
    expect(getItem(requests, 1).url.searchParams.get('after')).toBe(String(START_TIME + MINUTE));
  });

  it('normalizes slash-separated and exchange-qualified instrument identifiers', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(createOkxPayload([createCandleRow(START_TIME)])),
      createResponse(createOkxPayload([createCandleRow(START_TIME)])),
    ]);
    const provider = createProvider({ fetcher });

    await provider.getHistoricalCandles(createRequest({ instrumentId: 'BTC/USDT' }));
    await provider.getHistoricalCandles(createRequest({ instrumentId: 'OKX:BTC-USDT' }));

    expect(requests.map((request) => request.url.searchParams.get('instId'))).toEqual([
      'BTC-USDT',
      'BTC-USDT',
    ]);
  });

  it('deduplicates duplicate timestamps and retains the first row', async () => {
    const { fetcher } = createFetcher([
      createResponse(
        createOkxPayload([
          createCandleRow(START_TIME + MINUTE, '103'),
          createCandleRow(START_TIME + MINUTE, '104'),
          createCandleRow(START_TIME, '102'),
        ]),
      ),
    ]);
    const candles = await createProvider({ fetcher }).getHistoricalCandles(createRequest());

    expect(candles).toHaveLength(2);
    expect(getItem(candles, 1).close).toBe(103);
  });

  it('passes an abort signal through to the fetch request', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(createOkxPayload([createCandleRow(START_TIME)])),
    ]);
    const controller = new AbortController();

    await createProvider({ fetcher }).getHistoricalCandles({
      ...createRequest(),
      signal: controller.signal,
    });

    expect(getItem(requests, 0).init.signal).toBe(controller.signal);
  });

  it('surfaces HTTP rate limits and retry-after metadata without automatic retries', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(createOkxPayload([], '50011', 'Rate limit reached'), 429, {
        'Retry-After': '2',
      }),
    ]);

    await expect(
      createProvider({ fetcher }).getHistoricalCandles(createRequest()),
    ).rejects.toMatchObject({
      name: 'MarketDataProviderError',
      providerId: 'okx-spot',
      statusCode: 429,
      retryAfterMs: 2_000,
      message: 'OKX API request failed with HTTP 429 (code 50011): Rate limit reached.',
    });
    expect(requests).toHaveLength(1);
  });

  it('surfaces OKX application error codes even when HTTP status is successful', async () => {
    const { fetcher } = createFetcher([
      createResponse(createOkxPayload([], '50011', 'Rate limit reached')),
    ]);

    await expect(
      createProvider({ fetcher }).getHistoricalCandles(createRequest()),
    ).rejects.toMatchObject({
      statusCode: 200,
      message: 'OKX API request failed with HTTP 200 (code 50011): Rate limit reached.',
    });
  });

  it('rejects malformed payloads and invalid OHLCV candles', async () => {
    const malformed = createFetcher([createResponse({ code: '0', data: {} })]);
    const invalidCandle = createFetcher([
      createResponse(createOkxPayload([createCandleRow(START_TIME, 'not-a-price')])),
    ]);

    await expect(
      createProvider({ fetcher: malformed.fetcher }).getHistoricalCandles(createRequest()),
    ).rejects.toThrow('malformed history candlesticks response');
    await expect(
      createProvider({ fetcher: invalidCandle.fetcher }).getHistoricalCandles(createRequest()),
    ).rejects.toThrow('non-finite close');
  });

  it('rejects unsupported intervals, invalid ranges and ambiguous symbols before network access', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = createProvider({ fetcher });

    await expect(provider.getHistoricalCandles(createRequest({ interval: '8h' }))).rejects.toThrow(
      'does not support the 8h',
    );
    await expect(
      provider.getHistoricalCandles(createRequest({ instrumentId: 'BTCUSDT' })),
    ).rejects.toThrow('must include a base and quote');
    await expect(
      provider.getHistoricalCandles(
        createRequest({ startTime: START_TIME + MINUTE, endTime: START_TIME }),
      ),
    ).rejects.toThrow(RangeError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces secure hosts and bounded paging configuration', () => {
    expect(() => new OkxSpotMarketDataProvider({ baseUrl: 'http://api.test' })).toThrow(RangeError);
    expect(() => new OkxSpotMarketDataProvider({ pageSize: 101 })).toThrow(RangeError);
    expect(() => new OkxSpotMarketDataProvider({ maxPages: 0 })).toThrow(RangeError);
  });
});
