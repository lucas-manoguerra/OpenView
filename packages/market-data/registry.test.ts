import { describe, expect, it } from 'vitest';
import type { MarketDataProvider } from './src/contracts';
import { MarketDataProviderRegistry } from './src/registry';

const createProvider = (id: string): MarketDataProvider => ({
  id,
  displayName: id,
  capabilities: {
    historicalCandles: false,
    streamingQuotes: false,
    supportedIntervals: [],
    redistribution: 'unknown',
    attributionRequired: false,
  },
  getHistoricalCandles: async () => Object.freeze([]),
});

describe('market data provider registry', () => {
  it('registers providers by stable identifier and lists them in registration order', () => {
    const binance = createProvider('binance-spot');
    const bybit = createProvider('bybit-spot');
    const registry = new MarketDataProviderRegistry([binance, bybit]);

    expect(registry.get('binance-spot')).toBe(binance);
    expect(registry.get('unknown')).toBeNull();
    expect(registry.list()).toEqual([binance, bybit]);
    expect(Object.isFrozen(registry.list())).toBe(true);
  });

  it('requires a registered provider when requested by identifier', () => {
    const registry = new MarketDataProviderRegistry([createProvider('binance-spot')]);

    expect(registry.require('binance-spot').id).toBe('binance-spot');
    expect(() => registry.require('okx-spot')).toThrow('is not registered');
  });

  it('rejects empty and duplicate provider identifiers', () => {
    expect(() => new MarketDataProviderRegistry([createProvider(' ')] )).toThrow(RangeError);
    expect(() =>
      new MarketDataProviderRegistry([
        createProvider('binance-spot'),
        createProvider('binance-spot'),
      ]),
    ).toThrow('registered more than once');
  });
});
