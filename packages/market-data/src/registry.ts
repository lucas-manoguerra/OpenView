import type { MarketDataProvider } from './contracts';

export class MarketDataProviderRegistry {
  private readonly providers: ReadonlyMap<string, MarketDataProvider>;

  constructor(providers: readonly MarketDataProvider[]) {
    const entries = new Map<string, MarketDataProvider>();

    for (const provider of providers) {
      const id = provider.id.trim();

      if (id.length === 0) {
        throw new RangeError('Market data provider identifiers cannot be empty.');
      }

      if (entries.has(id)) {
        throw new RangeError(`Market data provider "${id}" is registered more than once.`);
      }

      entries.set(id, provider);
    }

    this.providers = entries;
  }

  get(providerId: string): MarketDataProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  require(providerId: string): MarketDataProvider {
    const provider = this.get(providerId);

    if (provider === null) {
      throw new RangeError(`Market data provider "${providerId}" is not registered.`);
    }

    return provider;
  }

  list(): readonly MarketDataProvider[] {
    return Object.freeze([...this.providers.values()]);
  }
}
