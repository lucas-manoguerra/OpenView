import { createInstrumentId } from '@openview/market-domain';
import { describe, expect, it, vi } from 'vitest';
import type {
  CandleStreamHandlers,
  CandleSubscriptionRequest,
  HistoricalCandleRequest,
  MarketDataCapabilities,
  MarketDataProvider,
} from './src/contracts';
import { MarketDataProviderError } from './src/errors';
import { MarketDataProviderRegistry } from './src/registry';
import { MarketDataStreamService } from './src/stream-service';

const createProvider = (
  overrides: Partial<MarketDataCapabilities> = {},
  subscribeToCandles?: MarketDataProvider['subscribeToCandles'],
): MarketDataProvider => ({
  id: 'binance-spot',
  displayName: 'Binance Spot',
  capabilities: Object.freeze({
    historicalCandles: true,
    streamingQuotes: false,
    streamingCandles: true,
    supportedIntervals: Object.freeze(['1m', '5m'] as const),
    redistribution: 'unknown',
    attributionRequired: false,
    ...overrides,
  }),
  getHistoricalCandles: async (_request: HistoricalCandleRequest) => Object.freeze([]),
  ...(subscribeToCandles === undefined ? {} : { subscribeToCandles }),
});

const request: CandleSubscriptionRequest = Object.freeze({
  instrumentId: createInstrumentId('BTC-USDT'),
  interval: '1m',
});

describe('market data stream service', () => {
  it('routes a candle subscription to the explicitly selected provider', () => {
    const subscription = Object.freeze({ unsubscribe: vi.fn() });
    const subscribeToCandles = vi.fn((_request: CandleSubscriptionRequest, _handlers: CandleStreamHandlers) => subscription);
    const provider = createProvider({}, subscribeToCandles);
    const service = new MarketDataStreamService(new MarketDataProviderRegistry([provider]));
    const handlers: CandleStreamHandlers = { onCandle: vi.fn() };

    expect(service.subscribeToCandles('binance-spot', request, handlers)).toBe(subscription);
    expect(subscribeToCandles).toHaveBeenCalledWith(request, handlers);
  });

  it('rejects providers without live candle capability', () => {
    const provider = createProvider({ streamingCandles: false });
    const service = new MarketDataStreamService(new MarketDataProviderRegistry([provider]));

    expect(() => service.subscribeToCandles('binance-spot', request, { onCandle: vi.fn() })).toThrow(
      MarketDataProviderError,
    );
    expect(() => service.subscribeToCandles('binance-spot', request, { onCandle: vi.fn() })).toThrow(
      'does not provide live candle streams',
    );
  });

  it('rejects unsupported stream intervals before opening a connection', () => {
    const subscribeToCandles = vi.fn();
    const provider = createProvider({}, subscribeToCandles);
    const service = new MarketDataStreamService(new MarketDataProviderRegistry([provider]));

    expect(() =>
      service.subscribeToCandles(
        'binance-spot',
        { ...request, interval: '1h' },
        { onCandle: vi.fn() },
      ),
    ).toThrow('does not support the 1h candle interval');
    expect(subscribeToCandles).not.toHaveBeenCalled();
  });
});
