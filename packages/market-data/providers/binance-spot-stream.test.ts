import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstrumentId } from '@openview/market-domain';
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

const createProvider = (connections: FakeWebSocket[], options: Readonly<{
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}> = {}) =>
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
    expect(connection?.url).toBe(
      'wss://stream.binance.com:9443/ws/btcusdt@kline_1m',
    );

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
    expect(() =>
      new BinanceSpotMarketDataProvider({ streamBaseUrl: 'ws://stream.example.test' }),
    ).toThrow('must use WSS');
    expect(connections).toHaveLength(0);
  });
});
