import { createInstrumentId } from '@openview/market-domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BinanceSpotMarketDataProvider,
  type BinanceWebSocketConnection,
} from '../src/providers/binance-spot';

const START_TIME = Date.UTC(2024, 0, 1);

class FakeWebSocket extends EventTarget {
  readonly url: string;
  closeCalls = 0;

  constructor(url: string) {
    super();
    this.url = url;
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

const createKlineEvent = (overrides: Readonly<{ close?: string; final?: boolean }> = {}) => ({
  e: 'kline',
  s: 'BTCUSDT',
  k: {
    t: START_TIME,
    s: 'BTCUSDT',
    i: '1m',
    o: '100',
    h: '105',
    l: '98',
    c: overrides.close ?? '102',
    v: '12.5',
    x: overrides.final ?? false,
  },
});

const createProvider = (
  connections: FakeWebSocket[],
  options: Readonly<{
    reconnectDelayMs?: number;
    maxReconnectDelayMs?: number;
  }> = {},
) =>
  new BinanceSpotMarketDataProvider({
    webSocketFactory: (url: string): BinanceWebSocketConnection => {
      const connection = new FakeWebSocket(url);
      connections.push(connection);
      return connection;
    },
    reconnectDelayMs: options.reconnectDelayMs ?? 1_000,
    maxReconnectDelayMs: options.maxReconnectDelayMs ?? 4_000,
  });

describe('Binance Spot candle stream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to the selected instrument and interval and normalizes live klines', () => {
    const connections: FakeWebSocket[] = [];
    const provider = createProvider(connections);
    const updates: unknown[] = [];
    const states: string[] = [];
    const errors: Error[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      {
        onCandle: (update) => updates.push(update),
        onStatus: (state) => states.push(state),
        onError: (error) => errors.push(error),
      },
    );

    const connection = connections[0];
    expect(connection?.url).toBe('wss://stream.binance.com:9443/ws/btcusdt@kline_1m');

    connection?.open();
    connection?.emit(createKlineEvent({ close: '103.5' }));

    expect(states).toEqual(['connecting', 'connected']);
    expect(errors).toEqual([]);
    expect(updates).toEqual([
      {
        instrumentId: 'BTC-USDT',
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
    ]);
    expect(Object.isFrozen(updates[0])).toBe(true);

    subscription.unsubscribe();
    expect(connection?.closeCalls).toBe(1);
    expect(states.at(-1)).toBe('disconnected');
  });

  it('marks final candle updates and ignores non-kline stream events', () => {
    const connections: FakeWebSocket[] = [];
    const provider = createProvider(connections);
    const updates: boolean[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      { onCandle: (update) => updates.push(update.isFinal) },
    );
    const connection = connections[0];

    connection?.open();
    connection?.emit({ e: '24hrTicker', s: 'BTCUSDT' });
    connection?.emit(createKlineEvent({ final: true }));

    expect(updates).toEqual([true]);
    subscription.unsubscribe();
  });

  it('reports malformed kline payloads without publishing invalid candles', () => {
    const connections: FakeWebSocket[] = [];
    const provider = createProvider(connections);
    const updates: unknown[] = [];
    const errors: Error[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      {
        onCandle: (update) => updates.push(update),
        onError: (error) => errors.push(error),
      },
    );
    const connection = connections[0];

    connection?.open();
    connection?.emit(createKlineEvent({ close: 'not-a-number' }));

    expect(updates).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('non-finite close price');
    subscription.unsubscribe();
  });

  it('reconnects after a disconnect using bounded exponential backoff', () => {
    vi.useFakeTimers();
    const connections: FakeWebSocket[] = [];
    const provider = createProvider(connections, {
      reconnectDelayMs: 500,
      maxReconnectDelayMs: 1_000,
    });
    const states: string[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      { onCandle: () => undefined, onStatus: (state) => states.push(state) },
    );

    connections[0]?.close();
    vi.advanceTimersByTime(499);
    expect(connections).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(connections).toHaveLength(2);
    expect(states).toEqual(['connecting', 'reconnecting']);

    connections[1]?.close();
    vi.advanceTimersByTime(999);
    expect(connections).toHaveLength(2);

    vi.advanceTimersByTime(1);
    expect(connections).toHaveLength(3);

    connections[2]?.open();
    expect(states.at(-1)).toBe('connected');
    subscription.unsubscribe();
  });

  it('cancels pending reconnection and closes the active socket on unsubscribe', () => {
    vi.useFakeTimers();
    const connections: FakeWebSocket[] = [];
    const provider = createProvider(connections);
    const states: string[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      { onCandle: () => undefined, onStatus: (state) => states.push(state) },
    );

    connections[0]?.close();
    subscription.unsubscribe();
    vi.advanceTimersByTime(10_000);

    expect(connections).toHaveLength(1);
    expect(states.at(-1)).toBe('disconnected');
  });

  it('rejects unsupported intervals and insecure stream URLs', () => {
    const connections: FakeWebSocket[] = [];
    const provider = createProvider(connections);

    expect(() =>
      provider.subscribeToCandles(
        { instrumentId: createInstrumentId('BTC-USDT'), interval: '1s' },
        { onCandle: () => undefined },
      ),
    ).toThrow('does not support the 1s candle interval');
    expect(
      () => new BinanceSpotMarketDataProvider({ streamBaseUrl: 'ws://stream.example.test' }),
    ).toThrow('must use WSS');
    expect(connections).toHaveLength(0);
  });

  it('reconnects when Binance announces a scheduled server shutdown', () => {
    vi.useFakeTimers();
    const connections: FakeWebSocket[] = [];
    const provider = createProvider(connections, { reconnectDelayMs: 500 });
    const states: string[] = [];
    const subscription = provider.subscribeToCandles(
      { instrumentId: createInstrumentId('BTC-USDT'), interval: '1m' },
      { onCandle: () => undefined, onStatus: (state) => states.push(state) },
    );

    connections[0]?.open();
    connections[0]?.emit({ e: 'serverShutdown' });
    expect(connections[0]?.closeCalls).toBe(1);
    expect(states.at(-1)).toBe('reconnecting');

    vi.advanceTimersByTime(500);
    expect(connections).toHaveLength(2);
    connections[1]?.open();
    expect(states.at(-1)).toBe('connected');

    subscription.unsubscribe();
  });
});

describe('Binance Spot quote stream', () => {
  it('streams normalized quotes for multiple instruments over one combined connection', () => {
    const connections: FakeWebSocket[] = [];
    const provider = createProvider(connections);
    const updates: unknown[] = [];
    const states: string[] = [];
    const errors: Error[] = [];
    const subscription = provider.subscribeToQuotes(
      [createInstrumentId('BTC-USDT'), createInstrumentId('ETH-USDT')],
      {
        onQuote: (quote) => updates.push(quote),
        onStatus: (state) => states.push(state),
        onError: (error) => errors.push(error),
      },
    );
    const connection = connections[0];
    const url = new URL(connection?.url ?? 'wss://invalid.example');

    expect(url.pathname).toBe('/stream');
    expect(url.searchParams.get('streams')).toBe('btcusdt@ticker/ethusdt@ticker');

    connection?.open();
    connection?.emit({
      stream: 'btcusdt@ticker',
      data: {
        e: '24hrTicker',
        E: START_TIME,
        s: 'BTCUSDT',
        c: '100.5',
        b: '100',
        a: '101',
        v: '123.45',
        P: '2.5',
      },
    });
    connection?.emit({
      stream: 'ethusdt@ticker',
      data: {
        e: '24hrTicker',
        E: START_TIME + 1,
        s: 'ETHUSDT',
        c: '25',
        b: '24.9',
        a: '25.1',
        v: '456.78',
        P: '-1.25',
      },
    });

    expect(states).toEqual(['connecting', 'connected']);
    expect(errors).toEqual([]);
    expect(updates).toMatchObject([
      {
        instrumentId: 'BTC-USDT',
        timestamp: START_TIME,
        bid: 100,
        ask: 101,
        last: 100.5,
        volume24h: 123.45,
        changePercent24h: 2.5,
      },
      {
        instrumentId: 'ETH-USDT',
        timestamp: START_TIME + 1,
        bid: 24.9,
        ask: 25.1,
        last: 25,
        volume24h: 456.78,
        changePercent24h: -1.25,
      },
    ]);
    expect((updates[0] as { receivedAt: number }).receivedAt).toBeGreaterThan(0);

    subscription.unsubscribe();
    expect(connection?.closeCalls).toBe(1);
    expect(states.at(-1)).toBe('disconnected');
  });

  it('rejects duplicate exchange symbols before opening a connection', () => {
    const connections: FakeWebSocket[] = [];
    const provider = createProvider(connections);

    expect(() =>
      provider.subscribeToQuotes(
        [createInstrumentId('BTC-USDT'), createInstrumentId('BINANCE:BTCUSDT')],
        { onQuote: () => undefined },
      ),
    ).toThrow('cannot contain duplicate symbols');
    expect(connections).toHaveLength(0);
  });
});
