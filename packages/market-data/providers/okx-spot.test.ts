import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstrumentId } from '@openview/market-domain';
import { OkxSpotMarketDataProvider, type OkxWebSocketConnection } from '../src/providers/okx-spot';

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
    expect(provider.capabilities.streamingQuotes).toBe(true);
    expect(provider.capabilities.streamingCandles).toBe(true);
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

class FakeOkxWebSocket extends EventTarget {
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
    this.dispatchEvent(
      new MessageEvent('message', {
        data: typeof payload === 'string' ? payload : JSON.stringify(payload),
      }),
    );
  }
}

const createStreamProvider = (
  connections: FakeOkxWebSocket[],
  options: Readonly<{
    reconnectDelayMs?: number;
    heartbeatIntervalMs?: number;
    heartbeatResponseTimeoutMs?: number;
  }> = {},
) =>
  new OkxSpotMarketDataProvider({
    webSocketFactory: (url: string): OkxWebSocketConnection => {
      const connection = new FakeOkxWebSocket(url);
      connections.push(connection);
      return connection;
    },
    reconnectDelayMs: options.reconnectDelayMs ?? 1_000,
    maxReconnectDelayMs: 4_000,
    heartbeatIntervalMs: options.heartbeatIntervalMs ?? 25_000,
    heartbeatResponseTimeoutMs: options.heartbeatResponseTimeoutMs ?? 5_000,
  });

const createStreamRow = (
  timestamp: number,
  close = '102',
  confirm: '0' | '1' = '0',
): readonly string[] => [
  String(timestamp),
  '100',
  '105',
  '98',
  close,
  '12.5',
  '1250',
  '1250',
  confirm,
];

describe('OKX Spot candle stream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to the selected candle channel and normalizes partial and final updates', () => {
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const updates: unknown[] = [];
    const states: string[] = [];
    const errors: Error[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('OKX:BTC-USDT'), interval: '1m' },
      {
        onCandle: (update) => updates.push(update),
        onStatus: (state) => states.push(state),
        onError: (error) => errors.push(error),
      },
    );
    const connection = getItem(connections, 0);

    expect(connection.url).toBe('wss://ws.okx.com/ws/v5/business');
    connection.open();
    expect(connection.sent).toEqual([
      JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'candle1m', instId: 'BTC-USDT' }],
      }),
    ]);

    connection.emit({
      arg: { channel: 'candle1m', instId: 'BTC-USDT' },
      data: [createStreamRow(START_TIME, '103.5', '0')],
    });
    connection.emit({
      arg: { channel: 'candle1m', instId: 'BTC-USDT' },
      data: [createStreamRow(START_TIME, '104', '1')],
    });

    expect(states).toEqual(['connecting', 'connected']);
    expect(errors).toEqual([]);
    expect(updates).toMatchObject([
      {
        instrumentId: 'OKX:BTC-USDT',
        interval: '1m',
        candle: {
          timestamp: START_TIME,
          open: 100,
          high: 105,
          low: 98,
          close: 103.5,
          volume: 12.5,
        },
        isFinal: false,
      },
      {
        instrumentId: 'OKX:BTC-USDT',
        interval: '1m',
        candle: { timestamp: START_TIME, open: 100, high: 105, low: 98, close: 104, volume: 12.5 },
        isFinal: true,
      },
    ]);

    subscription.unsubscribe();
    expect(connection.closeCalls).toBe(1);
    expect(states.at(-1)).toBe('disconnected');
  });

  it('uses UTC candlestick channels for monthly intervals', () => {
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1M' },
      { onCandle: () => undefined },
    );
    const connection = getItem(connections, 0);

    connection.open();
    expect(connection.sent).toContain(
      JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'candle1Mutc', instId: 'BTC-USDT' }],
      }),
    );

    subscription.unsubscribe();
  });

  it('responds to OKX server ping messages with the raw pong string', () => {
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const errors: Error[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      { onCandle: () => undefined, onError: (error) => errors.push(error) },
    );
    const connection = getItem(connections, 0);

    connection.open();
    connection.emit('ping');

    expect(connection.sent.at(-1)).toBe('pong');
    expect(errors).toEqual([]);

    subscription.unsubscribe();
  });

  it('sends a raw ping only after the connection has been idle and awaits pong', () => {
    vi.useFakeTimers();
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const errors: Error[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      { onCandle: () => undefined, onError: (error) => errors.push(error) },
    );
    const connection = getItem(connections, 0);

    connection.open();
    connection.emit({ event: 'subscribe', code: '0' });
    vi.advanceTimersByTime(24_999);
    expect(connection.sent).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(connection.sent.at(-1)).toBe('ping');

    vi.advanceTimersByTime(4_999);
    expect(connection.closeCalls).toBe(0);
    connection.emit('pong');
    expect(errors).toEqual([]);

    vi.advanceTimersByTime(24_999);
    expect(connection.sent.filter((message) => message === 'ping')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(connection.sent.filter((message) => message === 'ping')).toHaveLength(2);

    subscription.unsubscribe();
  });

  it('reconnects after heartbeat timeout and resubscribes after reopening', () => {
    vi.useFakeTimers();
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections, {
      reconnectDelayMs: 500,
      heartbeatIntervalMs: 1_000,
      heartbeatResponseTimeoutMs: 250,
    });
    const errors: Error[] = [];
    const states: string[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '5m' },
      {
        onCandle: () => undefined,
        onError: (error) => errors.push(error),
        onStatus: (state) => states.push(state),
      },
    );
    const firstConnection = getItem(connections, 0);

    firstConnection.open();
    vi.advanceTimersByTime(1_000);
    expect(firstConnection.sent.at(-1)).toBe('ping');
    vi.advanceTimersByTime(250);

    expect(firstConnection.closeCalls).toBe(1);
    expect(errors.at(-1)?.message).toContain('heartbeat response timed out');
    expect(states.at(-1)).toBe('reconnecting');

    vi.advanceTimersByTime(500);
    const secondConnection = getItem(connections, 1);
    secondConnection.open();

    expect(secondConnection.sent).toEqual([
      JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'candle5m', instId: 'BTC-USDT' }],
      }),
    ]);
    expect(states.at(-1)).toBe('connected');

    subscription.unsubscribe();
  });

  it('reports malformed candles and rejected subscriptions', () => {
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const errors: Error[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      { onCandle: () => undefined, onError: (error) => errors.push(error) },
    );
    const connection = getItem(connections, 0);

    connection.open();
    connection.emit({
      arg: { channel: 'candle1m', instId: 'BTC-USDT' },
      data: [createStreamRow(START_TIME, 'not-a-price', '0')],
    });
    expect(errors[0]?.message).toContain('non-finite close price');

    connection.emit({ event: 'error', code: '60012', msg: 'Invalid channel' });
    expect(errors.at(-1)?.message).toContain('OKX Spot subscription failed (code 60012)');
    expect(connection.closeCalls).toBe(1);

    subscription.unsubscribe();
  });

  it('rejects unsupported intervals and insecure stream URLs', () => {
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections);

    expect(() =>
      provider.subscribeToCandles(
        { instrumentId: createInstrumentId('BTC-USDT'), interval: '8h' },
        { onCandle: () => undefined },
      ),
    ).toThrow('does not support the 8h');
    expect(
      () => new OkxSpotMarketDataProvider({ streamBaseUrl: 'ws://stream.example.test' }),
    ).toThrow('must use WSS');
    expect(connections).toHaveLength(0);
  });
});

describe('OKX Spot quote stream', () => {
  it('uses the public tickers channel and normalizes quotes for multiple instruments', () => {
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const updates: unknown[] = [];
    const states: string[] = [];
    const errors: Error[] = [];
    const subscription = provider.subscribeToQuotes(
      [createInstrumentId('OKX:BTC-USDT'), createInstrumentId('ETH-USDT')],
      {
        onQuote: (quote) => updates.push(quote),
        onStatus: (state) => states.push(state),
        onError: (error) => errors.push(error),
      },
    );
    const connection = getItem(connections, 0);

    expect(connection.url).toBe('wss://ws.okx.com/ws/v5/public');
    connection.open();
    expect(connection.sent).toEqual([
      JSON.stringify({
        op: 'subscribe',
        args: [
          { channel: 'tickers', instId: 'BTC-USDT' },
          { channel: 'tickers', instId: 'ETH-USDT' },
        ],
      }),
    ]);

    connection.emit({
      arg: { channel: 'tickers', instId: 'BTC-USDT' },
      data: [
        {
          instId: 'BTC-USDT',
          last: '102',
          bidPx: '101.9',
          askPx: '102.1',
          open24h: '100',
          vol24h: '321.5',
          ts: String(START_TIME + 1_000),
        },
      ],
    });
    connection.emit({
      arg: { channel: 'tickers', instId: 'ETH-USDT' },
      data: [
        {
          instId: 'ETH-USDT',
          last: '19',
          bidPx: '',
          askPx: '19.1',
          open24h: '20',
          vol24h: '654.3',
          ts: String(START_TIME + 1_001),
        },
      ],
    });

    expect(states).toEqual(['connecting', 'connected']);
    expect(errors).toEqual([]);
    expect(updates).toMatchObject([
      {
        instrumentId: 'OKX:BTC-USDT',
        timestamp: START_TIME + 1_000,
        bid: 101.9,
        ask: 102.1,
        last: 102,
        volume24h: 321.5,
        changePercent24h: 2,
      },
      {
        instrumentId: 'ETH-USDT',
        timestamp: START_TIME + 1_001,
        bid: null,
        ask: 19.1,
        last: 19,
        volume24h: 654.3,
        changePercent24h: -5,
      },
    ]);
    expect((updates[0] as { receivedAt: number }).receivedAt).toBeGreaterThan(0);

    subscription.unsubscribe();
    expect(connection.closeCalls).toBe(1);
    expect(states.at(-1)).toBe('disconnected');
  });

  it('responds to server pings and rejects duplicate normalized instruments', () => {
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const subscription = provider.subscribeToQuotes(
      [createInstrumentId('BTC-USDT')],
      { onQuote: () => undefined },
    );
    const connection = getItem(connections, 0);

    connection.open();
    connection.emit('ping');
    expect(connection.sent.at(-1)).toBe('pong');

    expect(() =>
      provider.subscribeToQuotes(
        [createInstrumentId('BTC-USDT'), createInstrumentId('OKX:BTC/USDT')],
        { onQuote: () => undefined },
      ),
    ).toThrow('cannot contain duplicate instruments');
    expect(connections).toHaveLength(1);

    subscription.unsubscribe();
  });

  it('reports rejected ticker subscriptions through the shared error handler', () => {
    const connections: FakeOkxWebSocket[] = [];
    const provider = createStreamProvider(connections);
    const errors: Error[] = [];
    const subscription = provider.subscribeToQuotes(
      [createInstrumentId('BTC-USDT')],
      { onQuote: () => undefined, onError: (error) => errors.push(error) },
    );
    const connection = getItem(connections, 0);

    connection.open();
    connection.emit({ event: 'error', code: '60012', msg: 'Invalid channel' });

    expect(errors.at(-1)?.message).toContain(
      'OKX Spot quote subscription failed (code 60012)',
    );
    expect(connection.closeCalls).toBe(1);

    subscription.unsubscribe();
  });
});
