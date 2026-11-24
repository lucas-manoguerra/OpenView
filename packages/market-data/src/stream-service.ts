import type { InstrumentId } from '@openview/market-domain';
import type {
  CandleStreamHandlers,
  CandleSubscriptionRequest,
  MarketDataProvider,
  MarketDataSubscription,
  QuoteStreamHandlers,
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

  subscribeToQuotes(
    providerId: string,
    instrumentIds: readonly InstrumentId[],
    handlers: QuoteStreamHandlers,
  ): MarketDataSubscription {
    if (instrumentIds.length === 0) {
      throw new RangeError('At least one instrument is required for a quote subscription.');
    }

    const uniqueInstrumentIds = new Set(instrumentIds);

    if (uniqueInstrumentIds.size !== instrumentIds.length) {
      throw new RangeError('Quote subscriptions cannot contain duplicate instruments.');
    }

    if (instrumentIds.some((instrumentId) => instrumentId.trim().length === 0)) {
      throw new RangeError('Quote subscriptions cannot contain empty instrument identifiers.');
    }

    const provider: MarketDataProvider = this.registry.require(providerId);

    if (!provider.capabilities.streamingQuotes || provider.subscribeToQuotes === undefined) {
      throw new MarketDataProviderError(
        provider.id,
        `${provider.displayName} does not provide live quote streams.`,
      );
    }

    return provider.subscribeToQuotes(Object.freeze([...instrumentIds]), handlers);
  }
}
