import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstrumentId } from '@openview/market-domain';
import {
  BybitSpotMarketDataProvider,
  type BybitWebSocketConnection,
} from '../src/providers/bybit-spot';

const MINUTE = 60_000;
const START_TIME = Date.UTC(2024, 0, 1);

const createKline = (timestamp: number, close = '102'): readonly unknown[] => [
  timestamp,
  '100',
  '105',
  '98',
  close,
  '12.5',
  '1250',
];

const createResponse = (payload: unknown, status = 200, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(payload), { status, headers });

const createBybitPayload = (list: readonly unknown[], retCode = 0, retMsg = 'OK') => ({
  retCode,
  retMsg,
  result: {
    category: 'spot',
    symbol: 'BTCUSDT',
    list,
  },
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
      throw new Error('No mocked Bybit response is available.');
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
    interval: '1m' | '1s' | '8h';
    startTime: number;
    endTime: number;
  }> = {},
) => ({
  instrumentId: createInstrumentId(overrides.instrumentId ?? 'BYBIT:BTC/USDT'),
  interval: overrides.interval ?? '1m',
  startTime: overrides.startTime ?? START_TIME,
  endTime: overrides.endTime ?? START_TIME + 2 * MINUTE,
});

const createProvider = (
  options: ConstructorParameters<typeof BybitSpotMarketDataProvider>[0] = {},
) =>
  new BybitSpotMarketDataProvider({
    minimumRequestIntervalMs: 0,
    ...options,
  });

describe('Bybit Spot market data provider', () => {
  it('exposes public historical candle capabilities without credentials', () => {
    const provider = createProvider();

    expect(provider.id).toBe('bybit-spot');
    expect(provider.displayName).toBe('Bybit Spot');
    expect(provider.capabilities.historicalCandles).toBe(true);
    expect(provider.capabilities.streamingQuotes).toBe(false);
    expect(provider.capabilities.supportedIntervals).toContain('1M');
    expect(provider.capabilities.supportedIntervals).not.toContain('1s');
    expect(provider.capabilities.redistribution).toBe('unknown');
  });

  it('maps reverse-ordered V5 spot klines into chronological domain candles', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(
        createBybitPayload([
          createKline(START_TIME + MINUTE, '103'),
          createKline(START_TIME, '102'),
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
    expect(getItem(requests, 0).url.origin).toBe('https://api.bybit.com');
    expect(getItem(requests, 0).url.pathname).toBe('/v5/market/kline');
    expect(getItem(requests, 0).url.searchParams.get('category')).toBe('spot');
    expect(getItem(requests, 0).url.searchParams.get('symbol')).toBe('BTCUSDT');
    expect(getItem(requests, 0).url.searchParams.get('interval')).toBe('1');
    expect(getItem(requests, 0).url.searchParams.get('start')).toBe(String(START_TIME));
    expect(getItem(requests, 0).url.searchParams.get('end')).toBe(
      String(START_TIME + 2 * MINUTE - 1),
    );
    expect(getItem(requests, 0).url.searchParams.get('limit')).toBe('1000');
    expect(new Headers(getItem(requests, 0).init.headers).get('authorization')).toBeNull();
  });

  it('paginates backward from the oldest candle returned by the previous page', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(
        createBybitPayload([
          createKline(START_TIME + 2 * MINUTE),
          createKline(START_TIME + MINUTE),
        ]),
      ),
      createResponse(createBybitPayload([createKline(START_TIME)])),
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
    expect(getItem(requests, 1).url.searchParams.get('end')).toBe(String(START_TIME + MINUTE - 1));
  });

  it('normalizes plain and exchange-qualified symbols', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(createBybitPayload([createKline(START_TIME)])),
      createResponse(createBybitPayload([createKline(START_TIME)])),
    ]);
    const provider = createProvider({ fetcher });

    await provider.getHistoricalCandles(createRequest({ instrumentId: 'BTC-USDT' }));
    await provider.getHistoricalCandles(createRequest({ instrumentId: 'BTCUSDT' }));

    expect(requests.map((request) => request.url.searchParams.get('symbol'))).toEqual([
      'BTCUSDT',
      'BTCUSDT',
    ]);
  });

  it('deduplicates duplicate candle open times returned by the API', async () => {
    const { fetcher } = createFetcher([
      createResponse(
        createBybitPayload([
          createKline(START_TIME + MINUTE, '103'),
          createKline(START_TIME + MINUTE, '104'),
          createKline(START_TIME, '102'),
        ]),
      ),
    ]);
    const candles = await createProvider({ fetcher }).getHistoricalCandles(createRequest());

    expect(candles).toHaveLength(2);
    expect(getItem(candles, 1).close).toBe(103);
  });

  it('passes an abort signal through to the fetch request', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(createBybitPayload([createKline(START_TIME)])),
    ]);
    const controller = new AbortController();

    await createProvider({ fetcher }).getHistoricalCandles({
      ...createRequest(),
      signal: controller.signal,
    });

    expect(getItem(requests, 0).init.signal).toBe(controller.signal);
  });

  it('reports HTTP rate limits and retry-after metadata without automatic retries', async () => {
    const { fetcher, requests } = createFetcher([
      createResponse(createBybitPayload([], 10006, 'Too many visits!'), 429, {
        'Retry-After': '2',
      }),
    ]);

    await expect(
      createProvider({ fetcher }).getHistoricalCandles(createRequest()),
    ).rejects.toMatchObject({
      name: 'MarketDataProviderError',
      providerId: 'bybit-spot',
      statusCode: 429,
      retryAfterMs: 2_000,
      message: 'Bybit API request failed with HTTP 429 (code 10006): Too many visits!.',
    });
    expect(requests).toHaveLength(1);
  });

  it('reports Bybit API error codes when the HTTP response itself is successful', async () => {
    const { fetcher } = createFetcher([
      createResponse(createBybitPayload([], 10006, 'Too many visits!')),
    ]);

    await expect(
      createProvider({ fetcher }).getHistoricalCandles(createRequest()),
    ).rejects.toMatchObject({
      statusCode: 200,
      message: 'Bybit API request failed with HTTP 200 (code 10006): Too many visits!.',
    });
  });

  it('rejects malformed payloads and invalid OHLCV candles', async () => {
    const malformed = createFetcher([createResponse({ retCode: 0, result: { list: {} } })]);
    const invalidCandle = createFetcher([
      createResponse(createBybitPayload([createKline(START_TIME, 'not-a-price')])),
    ]);

    await expect(
      createProvider({ fetcher: malformed.fetcher }).getHistoricalCandles(createRequest()),
    ).rejects.toThrow('malformed kline response');
    await expect(
      createProvider({ fetcher: invalidCandle.fetcher }).getHistoricalCandles(createRequest()),
    ).rejects.toThrow('non-finite close');
  });

  it('rejects unsupported intervals, invalid ranges and symbols before network access', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = createProvider({ fetcher });

    await expect(provider.getHistoricalCandles(createRequest({ interval: '1s' }))).rejects.toThrow(
      'does not support the 1s',
    );
    await expect(provider.getHistoricalCandles(createRequest({ interval: '8h' }))).rejects.toThrow(
      'does not support the 8h',
    );
    await expect(
      provider.getHistoricalCandles(createRequest({ instrumentId: 'OKX:BTC-USDT' })),
    ).rejects.toThrow('only accepts unqualified');
    await expect(
      provider.getHistoricalCandles(
        createRequest({ startTime: START_TIME + MINUTE, endTime: START_TIME }),
      ),
    ).rejects.toThrow(RangeError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces secure hosts and bounded paging configuration', () => {
    expect(() => new BybitSpotMarketDataProvider({ baseUrl: 'http://api.test' })).toThrow(
      RangeError,
    );
    expect(() => new BybitSpotMarketDataProvider({ pageSize: 1_001 })).toThrow(RangeError);
    expect(() => new BybitSpotMarketDataProvider({ maxPages: 0 })).toThrow(RangeError);
  });
});

class FakeBybitWebSocket extends EventTarget {
  readonly url: string;
  readonly sent: string[] = [];
  closeCalls = 0;

  constructor(url: string) {
    super();
    this.url = url;
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.closeCalls += 1;
    this.dispatchEvent(new Event('close'));
  }

  open(): void {
    this.dispatchEvent(new Event('open'));
  }

  emit(payload: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }
}

const createStreamProvider = (
  connections: FakeBybitWebSocket[],
  options: Readonly<{ reconnectDelayMs?: number; heartbeatIntervalMs?: number }> = {},
) =>
  new BybitSpotMarketDataProvider({
    webSocketFactory: (url: string): BybitWebSocketConnection => {
      const connection = new FakeBybitWebSocket(url);
      connections.push(connection);
      return connection;
    },
    reconnectDelayMs: options.reconnectDelayMs ?? 1_000,
    maxReconnectDelayMs: 4_000,
    heartbeatIntervalMs: options.heartbeatIntervalMs ?? 20_000,
  });

describe('Bybit Spot candle stream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to the selected spot topic and normalizes partial and final klines', () => {
    const connections: FakeBybitWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const updates: unknown[] = [];
    const states: string[] = [];
    const errors: Error[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BYBIT:BTC/USDT'), interval: '1m' },
      {
        onCandle: (update) => updates.push(update),
        onStatus: (state) => states.push(state),
        onError: (error) => errors.push(error),
      },
    );
    const connection = connections[0];

    expect(connection?.url).toBe('wss://stream.bybit.com/v5/public/spot');
    connection?.open();

    expect(connection?.sent).toEqual(['{"op":"subscribe","args":["kline.1.BTCUSDT"]}']);

    connection?.emit({
      topic: 'kline.1.BTCUSDT',
      type: 'snapshot',
      data: [
        {
          start: START_TIME,
          end: START_TIME + MINUTE - 1,
          interval: '1',
          open: '100',
          high: '105',
          low: '98',
          close: '103.5',
          volume: '12.5',
          confirm: false,
        },
      ],
    });
    connection?.emit({
      topic: 'kline.1.BTCUSDT',
      type: 'snapshot',
      data: [
        {
          start: START_TIME,
          end: START_TIME + MINUTE - 1,
          interval: '1',
          open: '100',
          high: '105',
          low: '98',
          close: '104',
          volume: '13',
          confirm: true,
        },
      ],
    });

    expect(states).toEqual(['connecting', 'connected']);
    expect(errors).toEqual([]);
    expect(updates).toMatchObject([
      {
        instrumentId: 'BYBIT:BTC/USDT',
        interval: '1m',
        candle: { timestamp: START_TIME, close: 103.5, volume: 12.5 },
        isFinal: false,
      },
      {
        instrumentId: 'BYBIT:BTC/USDT',
        interval: '1m',
        candle: { timestamp: START_TIME, close: 104, volume: 13 },
        isFinal: true,
      },
    ]);

    subscription.unsubscribe();
    expect(connection?.closeCalls).toBe(1);
    expect(states.at(-1)).toBe('disconnected');
  });

  it('sends Bybit heartbeat packets and responds to server ping messages', () => {
    vi.useFakeTimers();
    const connections: FakeBybitWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      { onCandle: () => undefined },
    );
    const connection = connections[0];

    connection?.open();
    connection?.emit({ op: 'ping' });
    expect(connection?.sent.at(-1)).toBe('{"op":"pong"}');

    vi.advanceTimersByTime(20_000);
    expect(connection?.sent.at(-1)).toBe('{"op":"ping"}');

    subscription.unsubscribe();
    vi.advanceTimersByTime(40_000);
    expect(connection?.sent).toHaveLength(3);
  });

  it('reconnects with backoff and resubscribes after the connection is restored', () => {
    vi.useFakeTimers();
    const connections: FakeBybitWebSocket[] = [];
    const provider = createStreamProvider(connections, { reconnectDelayMs: 500 });
    const states: string[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '5m' },
      { onCandle: () => undefined, onStatus: (state) => states.push(state) },
    );

    connections[0]?.open();
    connections[0]?.close();
    vi.advanceTimersByTime(499);
    expect(connections).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(connections).toHaveLength(2);
    connections[1]?.open();
    expect(connections[1]?.sent).toEqual(['{"op":"subscribe","args":["kline.5.BTCUSDT"]}']);
    expect(states).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);

    subscription.unsubscribe();
  });

  it('rejects malformed streamed candles and unsupported intervals', () => {
    const connections: FakeBybitWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const errors: Error[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      { onCandle: () => undefined, onError: (error) => errors.push(error) },
    );

    connections[0]?.open();
    connections[0]?.emit({
      topic: 'kline.1.BTCUSDT',
      data: [{ start: START_TIME, interval: '1', open: '100', high: '90', low: '95', close: '101', volume: '1', confirm: false }],
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('invalid OHLCV candle');
    expect(() =>
      provider.subscribeToCandles(
        { instrumentId: createInstrumentId('BTC-USDT'), interval: '8h' },
        { onCandle: () => undefined },
      ),
    ).toThrow('does not support the 8h');

    subscription.unsubscribe();
  });
});
