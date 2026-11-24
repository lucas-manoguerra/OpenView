import { createInstrumentId } from '@openview/market-domain';
import { describe, expect, it, vi } from 'vitest';
import type {
  HistoricalCandleRequest,
  MarketDataCapabilities,
  MarketDataProvider,
  QuoteStreamHandlers,
} from './src/contracts';
import { MarketDataProviderError } from './src/errors';
import { MarketDataProviderRegistry } from './src/registry';
import { MarketDataStreamService } from './src/stream-service';

const createProvider = (
  overrides: Partial<MarketDataCapabilities> = {},
  subscribeToQuotes?: MarketDataProvider['subscribeToQuotes'],
): MarketDataProvider => ({
  id: 'binance-spot',
  displayName: 'Binance Spot',
  capabilities: Object.freeze({
    historicalCandles: false,
    streamingQuotes: true,
    supportedIntervals: Object.freeze([]),
    redistribution: 'unknown',
    attributionRequired: false,
    ...overrides,
  }),
  getHistoricalCandles: async (_request: HistoricalCandleRequest) => Object.freeze([]),
  ...(subscribeToQuotes === undefined ? {} : { subscribeToQuotes }),
});

const instrumentIds = Object.freeze([
  createInstrumentId('BTC-USDT'),
  createInstrumentId('ETH-USDT'),
]);

describe('market data quote stream service', () => {
  it('routes multiple instruments to the explicitly selected provider', () => {
    const subscription = Object.freeze({ unsubscribe: vi.fn() });
    const subscribeToQuotes = vi.fn(
      (
        _instrumentIds: readonly ReturnType<typeof createInstrumentId>[],
        _handlers: QuoteStreamHandlers,
      ) => subscription,
    );
    const provider = createProvider({}, subscribeToQuotes);
    const service = new MarketDataStreamService(new MarketDataProviderRegistry([provider]));
    const handlers: QuoteStreamHandlers = { onQuote: vi.fn() };

    expect(service.subscribeToQuotes('binance-spot', instrumentIds, handlers)).toBe(subscription);
    expect(subscribeToQuotes).toHaveBeenCalledOnce();
    const receivedInstrumentIds = subscribeToQuotes.mock.calls[0]?.[0];

    expect(receivedInstrumentIds).toEqual(instrumentIds);
    expect(Object.isFrozen(receivedInstrumentIds)).toBe(true);
    expect(subscribeToQuotes).toHaveBeenCalledWith(receivedInstrumentIds, handlers);
  });

  it('rejects empty instrument lists before opening a connection', () => {
    const subscribeToQuotes = vi.fn();
    const provider = createProvider({}, subscribeToQuotes);
    const service = new MarketDataStreamService(new MarketDataProviderRegistry([provider]));

    expect(() => service.subscribeToQuotes('binance-spot', [], { onQuote: vi.fn() })).toThrow(
      'At least one instrument is required',
    );
    expect(subscribeToQuotes).not.toHaveBeenCalled();
  });

  it('rejects duplicate instruments before opening a connection', () => {
    const instrumentId = createInstrumentId('BTC-USDT');
    const provider = createProvider({}, vi.fn());
    const service = new MarketDataStreamService(new MarketDataProviderRegistry([provider]));

    expect(() =>
      service.subscribeToQuotes('binance-spot', [instrumentId, instrumentId], { onQuote: vi.fn() }),
    ).toThrow('cannot contain duplicate instruments');
  });

  it('rejects providers without live quote capability', () => {
    const provider = createProvider({ streamingQuotes: false }, vi.fn());
    const service = new MarketDataStreamService(new MarketDataProviderRegistry([provider]));

    expect(() =>
      service.subscribeToQuotes('binance-spot', instrumentIds, { onQuote: vi.fn() }),
    ).toThrow(MarketDataProviderError);
    expect(() =>
      service.subscribeToQuotes('binance-spot', instrumentIds, { onQuote: vi.fn() }),
    ).toThrow('does not provide live quote streams');
  });

  it('rejects a provider that advertises no quote subscription method', () => {
    const provider = createProvider();
    const service = new MarketDataStreamService(new MarketDataProviderRegistry([provider]));

    expect(() =>
      service.subscribeToQuotes('binance-spot', instrumentIds, { onQuote: vi.fn() }),
    ).toThrow('does not provide live quote streams');
  });
});
