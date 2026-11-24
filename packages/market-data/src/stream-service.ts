import type {
  CandleStreamHandlers,
  CandleSubscriptionRequest,
  MarketDataSubscription,
  MarketDataProvider,
} from './contracts';
import { MarketDataProviderError } from './errors';
import { MarketDataProviderRegistry } from './registry';

export class MarketDataStreamService {
  private readonly registry: MarketDataProviderRegistry;

  constructor(registry: MarketDataProviderRegistry) {
    this.registry = registry;
  }

  subscribeToCandles(
    providerId: string,
    request: CandleSubscriptionRequest,
    handlers: CandleStreamHandlers,
  ): MarketDataSubscription {
    const provider: MarketDataProvider = this.registry.require(providerId);

    if (!provider.capabilities.streamingCandles || provider.subscribeToCandles === undefined) {
      throw new MarketDataProviderError(
        provider.id,
        `${provider.displayName} does not provide live candle streams.`,
      );
    }

    if (!provider.capabilities.supportedIntervals.includes(request.interval)) {
      throw new MarketDataProviderError(
        provider.id,
        `${provider.displayName} does not support the ${request.interval} candle interval.`,
      );
    }

    return provider.subscribeToCandles(request, handlers);
  }
}
