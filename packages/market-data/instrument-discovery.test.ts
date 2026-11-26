import { createInstrumentId } from '@openview/market-domain';
import { describe, expect, it, vi } from 'vitest';
import type { MarketDataProvider, MarketInstrument } from './src/contracts';
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

const createInstruments = (): readonly MarketInstrument[] => [
  {
    id: createInstrumentId('BTC-USDT'),
    symbol: 'BTC/USDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
  },
];

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
    const instruments = createInstruments();
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

  it('returns separate provider catalogs for every registered discovery source', async () => {
    const bitcoin = createInstruments();
    const ethereum: readonly MarketInstrument[] = [
      {
        id: createInstrumentId('ETH-USDT'),
        symbol: 'ETH/USDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
      },
    ];
    const binance = createProvider({
      id: 'binance-spot',
      displayName: 'Binance Spot',
      listInstruments: vi.fn(async () => bitcoin),
    });
    const bybit = createProvider({
      id: 'bybit-spot',
      displayName: 'Bybit Spot',
      listInstruments: vi.fn(async () => ethereum),
    });
    const historyOnly = createProvider({
      id: 'history-only',
      displayName: 'History only',
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([binance, bybit, historyOnly]),
    );

    const batch = await service.listInstrumentsFromAllProviders();

    expect(batch.catalogs).toEqual([
      {
        providerId: 'binance-spot',
        providerName: 'Binance Spot',
        instruments: bitcoin,
      },
      {
        providerId: 'bybit-spot',
        providerName: 'Bybit Spot',
        instruments: ethereum,
      },
    ]);
    expect(batch.failures).toEqual([]);
  });

  it('keeps successful providers available when another provider fails', async () => {
    const successfulProvider = createProvider({
      id: 'binance-spot',
      displayName: 'Binance Spot',
      listInstruments: async () => createInstruments(),
    });
    const unavailableProvider = createProvider({
      id: 'okx-spot',
      displayName: 'OKX',
      listInstruments: async () => {
        throw new Error('Exchange temporarily unavailable');
      },
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([successfulProvider, unavailableProvider]),
    );

    const batch = await service.listInstrumentsFromAllProviders();

    expect(batch.catalogs.map((catalog) => catalog.providerId)).toEqual(['binance-spot']);
    expect(batch.failures).toEqual([
      {
        providerId: 'okx-spot',
        providerName: 'OKX',
        message: 'Exchange temporarily unavailable',
      },
    ]);
  });

  it('reports all provider failures without hiding the individual causes', async () => {
    const providers = ['binance-spot', 'bybit-spot', 'okx-spot'].map((id) =>
      createProvider({
        id,
        listInstruments: async () => {
          throw new Error(id + ' unavailable');
        },
      }),
    );
    const service = new MarketInstrumentDiscoveryService(new MarketDataProviderRegistry(providers));

    const batch = await service.listInstrumentsFromAllProviders();

    expect(batch.catalogs).toEqual([]);
    expect(batch.failures.map((failure) => failure.message)).toEqual([
      'binance-spot unavailable',
      'bybit-spot unavailable',
      'okx-spot unavailable',
    ]);
  });

  it('caches successful catalogs for the configured TTL and freezes the snapshot', async () => {
    let currentTime = 1_000;
    let requestCount = 0;
    const provider = createProvider({
      listInstruments: async () => {
        requestCount += 1;
        return createInstruments();
      },
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([provider]),
      { cacheTtlMs: 100, now: () => currentTime },
    );

    const firstResult = await service.listInstruments(provider.id, { quoteAsset: 'usdt' });
    const cachedResult = await service.listInstruments(provider.id, { quoteAsset: 'USDT' });

    expect(requestCount).toBe(1);
    expect(cachedResult).toBe(firstResult);
    expect(Object.isFrozen(firstResult)).toBe(true);
    expect(Object.isFrozen(firstResult[0])).toBe(true);

    currentTime += 99;
    await service.listInstruments(provider.id, { quoteAsset: 'USDT' });
    expect(requestCount).toBe(1);

    currentTime += 1;
    await service.listInstruments(provider.id, { quoteAsset: 'USDT' });
    expect(requestCount).toBe(2);
  });

  it('keeps different quote filters and providers in separate cache entries', async () => {
    const firstProviderFilters: string[] = [];
    const secondProviderFilters: string[] = [];
    const firstProvider = createProvider({
      id: 'first-provider',
      listInstruments: async (filter) => {
        firstProviderFilters.push(filter?.quoteAsset ?? '*');
        return createInstruments();
      },
    });
    const secondProvider = createProvider({
      id: 'second-provider',
      listInstruments: async (filter) => {
        secondProviderFilters.push(filter?.quoteAsset ?? '*');
        return createInstruments();
      },
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([firstProvider, secondProvider]),
    );

    await service.listInstruments(firstProvider.id, { quoteAsset: 'USDT' });
    await service.listInstruments(firstProvider.id, { quoteAsset: 'USDC' });
    await service.listInstruments(firstProvider.id, { quoteAsset: 'USDT' });
    await service.listInstruments(secondProvider.id, { quoteAsset: 'USDT' });

    expect(firstProviderFilters).toEqual(['USDT', 'USDC']);
    expect(secondProviderFilters).toEqual(['USDT']);
  });

  it('keeps unfiltered catalogs separate from quote filters', async () => {
    const filters: string[] = [];
    const provider = createProvider({
      listInstruments: async (filter) => {
        filters.push(filter?.quoteAsset ?? 'all');
        return createInstruments();
      },
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([provider]),
    );

    await service.listInstruments(provider.id);
    await service.listInstruments(provider.id, { quoteAsset: '*' });
    await service.listInstruments(provider.id);

    expect(filters).toEqual(['all', '*']);
  });

  it('normalizes quote filters before requesting and caching catalogs', async () => {
    const filters: string[] = [];
    const provider = createProvider({
      listInstruments: async (filter) => {
        filters.push(filter?.quoteAsset ?? '*');
        return createInstruments();
      },
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([provider]),
    );

    await service.listInstruments(provider.id, { quoteAsset: ' usdt ' });
    await service.listInstruments(provider.id, { quoteAsset: 'USDT' });

    expect(filters).toEqual(['USDT']);
  });

  it('invalidates a single provider catalog or the entire cache', async () => {
    let firstProviderRequests = 0;
    let secondProviderRequests = 0;
    const firstProvider = createProvider({
      id: 'first-provider',
      listInstruments: async () => {
        firstProviderRequests += 1;
        return createInstruments();
      },
    });
    const secondProvider = createProvider({
      id: 'second-provider',
      listInstruments: async () => {
        secondProviderRequests += 1;
        return createInstruments();
      },
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([firstProvider, secondProvider]),
    );

    await service.listInstruments(firstProvider.id);
    await service.listInstruments(secondProvider.id);
    service.clearCache(firstProvider.id);
    await service.listInstruments(firstProvider.id);
    await service.listInstruments(secondProvider.id);

    expect(firstProviderRequests).toBe(2);
    expect(secondProviderRequests).toBe(1);

    service.clearCache();
    await service.listInstruments(firstProvider.id);
    await service.listInstruments(secondProvider.id);

    expect(firstProviderRequests).toBe(3);
    expect(secondProviderRequests).toBe(2);
  });

  it('does not cache failed provider requests', async () => {
    let requestCount = 0;
    let shouldFail = true;
    const provider = createProvider({
      listInstruments: async () => {
        requestCount += 1;

        if (shouldFail) {
          throw new Error('Temporary catalog failure');
        }

        return createInstruments();
      },
    });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([provider]),
    );

    await expect(service.listInstruments(provider.id)).rejects.toThrow('Temporary catalog failure');

    shouldFail = false;
    await expect(service.listInstruments(provider.id)).resolves.toEqual(createInstruments());
    await service.listInstruments(provider.id);

    expect(requestCount).toBe(2);
  });

  it('supports disabling the cache and rejects invalid TTL configuration', async () => {
    let requestCount = 0;
    const provider = createProvider({
      listInstruments: async () => {
        requestCount += 1;
        return createInstruments();
      },
    });
    const registry = new MarketDataProviderRegistry([provider]);
    const service = new MarketInstrumentDiscoveryService(registry, { cacheTtlMs: 0 });

    await service.listInstruments(provider.id);
    await service.listInstruments(provider.id);

    expect(requestCount).toBe(2);
    expect(() => new MarketInstrumentDiscoveryService(registry, { cacheTtlMs: -1 })).toThrow(
      RangeError,
    );
    expect(
      () => new MarketInstrumentDiscoveryService(registry, { cacheTtlMs: Number.NaN }),
    ).toThrow(RangeError);
  });

  it('does not invoke the provider when the discovery request is already aborted', async () => {
    const listInstruments = vi.fn(async () => createInstruments());
    const provider = createProvider({ listInstruments });
    const service = new MarketInstrumentDiscoveryService(
      new MarketDataProviderRegistry([provider]),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      service.listInstruments(provider.id, { signal: controller.signal }),
    ).rejects.toThrow();
    expect(listInstruments).not.toHaveBeenCalled();
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
