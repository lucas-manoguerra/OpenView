import type { Candle } from '@openview/market-domain';
import type {
  CandleInterval,
  DataRedistribution,
  HistoricalCandleRequest,
  MarketDataProvider,
} from './contracts';
import { MarketDataProviderError } from './errors';
import { MarketDataProviderRegistry } from './registry';

export type HistoricalDataSource = Readonly<{
  id: string;
  displayName: string;
  supportedIntervals: readonly CandleInterval[];
  streamingQuotes: boolean;
  redistribution: DataRedistribution;
  attributionRequired: boolean;
}>;

const createSource = (provider: MarketDataProvider): HistoricalDataSource =>
  Object.freeze({
    id: provider.id,
    displayName: provider.displayName,
    supportedIntervals: Object.freeze([...provider.capabilities.supportedIntervals]),
    streamingQuotes: provider.capabilities.streamingQuotes,
    redistribution: provider.capabilities.redistribution,
    attributionRequired: provider.capabilities.attributionRequired,
  });

export class HistoricalCandleService {
  private readonly registry: MarketDataProviderRegistry;

  constructor(registry: MarketDataProviderRegistry) {
    this.registry = registry;
  }

  listSources(): readonly HistoricalDataSource[] {
    return Object.freeze(
      this.registry
        .list()
        .filter((provider) => provider.capabilities.historicalCandles)
        .map(createSource),
    );
  }

  getSource(providerId: string): HistoricalDataSource {
    return createSource(this.requireHistoricalProvider(providerId));
  }

  getHistoricalCandles(
    providerId: string,
    request: HistoricalCandleRequest,
  ): Promise<readonly Candle[]> {
    const provider = this.requireHistoricalProvider(providerId);

    if (!provider.capabilities.supportedIntervals.includes(request.interval)) {
      throw new MarketDataProviderError(
        provider.id,
        `${provider.displayName} does not support the ${request.interval} candle interval.`,
      );
    }

    return provider.getHistoricalCandles(request);
  }

  private requireHistoricalProvider(providerId: string): MarketDataProvider {
    const provider = this.registry.require(providerId);

    if (!provider.capabilities.historicalCandles) {
      throw new MarketDataProviderError(
        provider.id,
        `${provider.displayName} does not provide historical candles.`,
      );
    }

    return provider;
  }
}
