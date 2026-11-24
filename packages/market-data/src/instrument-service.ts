import type {
  InstrumentDiscoveryFilter,
  MarketDataProvider,
  MarketInstrument,
} from './contracts';
import { MarketDataProviderError } from './errors';
import { MarketDataProviderRegistry } from './registry';

export class MarketInstrumentDiscoveryService {
  private readonly registry: MarketDataProviderRegistry;

  constructor(registry: MarketDataProviderRegistry) {
    this.registry = registry;
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

    return listInstruments.call(provider, filter);
  }
}
