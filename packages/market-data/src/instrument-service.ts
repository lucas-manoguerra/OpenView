import type { InstrumentDiscoveryFilter, MarketDataProvider, MarketInstrument } from './contracts';
import { MarketDataProviderError } from './errors';
import type { MarketDataProviderRegistry } from './registry';

export const DEFAULT_INSTRUMENT_CATALOG_CACHE_TTL_MS = 60_000;

export type MarketInstrumentDiscoveryServiceOptions = Readonly<{
  cacheTtlMs?: number;
  now?: () => number;
}>;

export type MarketInstrumentProviderCatalog = Readonly<{
  providerId: string;
  providerName: string;
  instruments: readonly MarketInstrument[];
}>;

export type MarketInstrumentProviderFailure = Readonly<{
  providerId: string;
  providerName: string;
  message: string;
}>;

export type MarketInstrumentDiscoveryBatch = Readonly<{
  catalogs: readonly MarketInstrumentProviderCatalog[];
  failures: readonly MarketInstrumentProviderFailure[];
}>;

type InstrumentCatalogCacheEntry = Readonly<{
  expiresAt: number;
  instruments: readonly MarketInstrument[];
}>;

export class MarketInstrumentDiscoveryService {
  private readonly registry: MarketDataProviderRegistry;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, Map<string, InstrumentCatalogCacheEntry>>();

  constructor(
    registry: MarketDataProviderRegistry,
    options: MarketInstrumentDiscoveryServiceOptions = {},
  ) {
    const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_INSTRUMENT_CATALOG_CACHE_TTL_MS;

    if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) {
      throw new RangeError('Instrument catalog cache TTL must be a finite non-negative number.');
    }

    this.registry = registry;
    this.cacheTtlMs = cacheTtlMs;
    this.now = options.now ?? Date.now;
  }

  supportsInstrumentDiscovery(providerId: string): boolean {
    return this.registry.require(providerId).listInstruments !== undefined;
  }

  listInstruments(
    providerId: string,
    filter: InstrumentDiscoveryFilter = {},
  ): Promise<readonly MarketInstrument[]> {
    const provider: MarketDataProvider = this.registry.require(providerId);
    const listInstruments = provider.listInstruments;

    if (listInstruments === undefined) {
      throw new MarketDataProviderError(
        provider.id,
        provider.displayName + ' does not support instrument discovery.',
      );
    }

    try {
      filter.signal?.throwIfAborted();
    } catch (cause) {
      return Promise.reject(cause);
    }

    const quoteAsset = filter.quoteAsset?.trim().toUpperCase();
    const cacheKey = quoteAsset === undefined ? 'all' : 'quote:' + quoteAsset;
    const currentTime = this.now();
    const providerCache = this.cache.get(provider.id);
    const cached = providerCache?.get(cacheKey);

    if (cached !== undefined && cached.expiresAt > currentTime) {
      return Promise.resolve(cached.instruments);
    }

    if (cached !== undefined) {
      providerCache?.delete(cacheKey);

      if (providerCache?.size === 0) {
        this.cache.delete(provider.id);
      }
    }

    const requestFilter: InstrumentDiscoveryFilter = {
      ...(quoteAsset === undefined ? {} : { quoteAsset }),
      ...(filter.signal === undefined ? {} : { signal: filter.signal }),
    };

    return listInstruments.call(provider, requestFilter).then((instruments) => {
      filter.signal?.throwIfAborted();

      const snapshot = Object.freeze(
        instruments.map((instrument) => Object.freeze({ ...instrument })),
      );

      if (this.cacheTtlMs > 0) {
        const providerEntries = this.cache.get(provider.id) ?? new Map();
        providerEntries.set(cacheKey, {
          expiresAt: this.now() + this.cacheTtlMs,
          instruments: snapshot,
        });
        this.cache.set(provider.id, providerEntries);
      }

      return snapshot;
    });
  }

  async listInstrumentsFromAllProviders(
    filter: InstrumentDiscoveryFilter = {},
  ): Promise<MarketInstrumentDiscoveryBatch> {
    const providers = this.registry
      .list()
      .filter((provider) => provider.listInstruments !== undefined);
    const results = await Promise.all(
      providers.map(async (provider) => {
        try {
          const instruments = await this.listInstruments(provider.id, filter);

          return {
            catalog: Object.freeze({
              providerId: provider.id,
              providerName: provider.displayName,
              instruments,
            }),
            failure: null,
          };
        } catch (cause) {
          if (filter.signal?.aborted) {
            throw cause;
          }

          return {
            catalog: null,
            failure: Object.freeze({
              providerId: provider.id,
              providerName: provider.displayName,
              message:
                cause instanceof Error
                  ? cause.message
                  : 'No se pudo consultar el catálogo del proveedor.',
            }),
          };
        }
      }),
    );

    filter.signal?.throwIfAborted();

    return Object.freeze({
      catalogs: Object.freeze(
        results.flatMap((result) => (result.catalog === null ? [] : [result.catalog])),
      ),
      failures: Object.freeze(
        results.flatMap((result) => (result.failure === null ? [] : [result.failure])),
      ),
    });
  }

  clearCache(providerId?: string): void {
    if (providerId === undefined) {
      this.cache.clear();
      return;
    }

    this.cache.delete(providerId);
  }
}
