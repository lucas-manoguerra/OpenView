import { describe, expect, it } from 'vitest';
import { createInstrumentId } from '@openview/market-domain';
import type { MarketDataProvider } from './src/contracts';
import { MarketDataProviderError } from './src/errors';
import { MarketInstrumentDiscoveryService } from './src/instrument-service';
import { MarketDataProviderRegistry } from './src/registry';

const createProvider = (overrides: Partial<MarketDataProvider> = {}): MarketDataProvider => ({
  id: 'catalog-provider',
  displayName: 'Catalog Provider',
  capabilities: {
    historicalCandles: false,
    streamingQuotes: false,
    supportedIntervals: [],
    redistribution: 'unknown',
    attributionRequired: false,
  },
  getHistoricalCandles: async () => [],
  ...overrides,
});

describe('market instrument discovery service', () => {
  it('reports providers that expose instrument discovery', () => {
    const provider = createProvider({
      listInstruments: async () => [],
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([provider]),
    );

    expect(service.supportsInstrumentDiscovery(provider.id)).toBe(true);
  });

  it('returns normalized instruments from the selected provider', async () => {
    const instruments = [
      {
        id: createInstrumentId('BTC-USDT'),
        symbol: 'BTC/USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
      },
    ];
    const provider = createProvider({
      listInstruments: async () => instruments,
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([provider]),
    );

    await expect(service.listInstruments(provider.id, { quoteAsset: 'USDT' })).resolves.toEqual(
      instruments,
    );
  });

  it('rejects discovery when a provider does not implement the capability', async () => {
    const provider = createProvider();
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([provider]),
    );

    expect(service.supportsInstrumentDiscovery(provider.id)).toBe(false);
    expect(() => service.listInstruments(provider.id)).toThrow(MarketDataProviderError);
  });

  it('rejects unknown provider identifiers', () => {
    const service = new MarketInstrumentDiscoveryService(new MarketDataProviderRegistry([]));

    expect(() => service.supportsInstrumentDiscovery('missing-provider')).toThrow(RangeError);
  });
});
