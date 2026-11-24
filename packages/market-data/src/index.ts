export type {
  CandleInterval,
  CandleStreamHandlers,
  CandleSubscriptionRequest,
  CandleUpdate,
  DataRedistribution,
  HistoricalCandleRequest,
  MarketDataCapabilities,
  MarketDataProvider,
  MarketDataStreamState,
  MarketDataSubscription,
  QuoteUpdate,
} from './contracts';

export { MarketDataProviderError } from './errors';
export { MarketDataProviderRegistry } from './registry';
export { MarketDataStreamService } from './stream-service';
export {
  HistoricalCandleService,
  type HistoricalDataSource,
} from './history-service';
export {
  BinanceSpotMarketDataProvider,
  type BinanceSpotProviderOptions,
  type BinanceWebSocketConnection,
  type BinanceWebSocketFactory,
} from './providers/binance-spot';

export {
  BybitSpotMarketDataProvider,
  type BybitSpotProviderOptions,
} from './providers/bybit-spot';
export {
  OkxSpotMarketDataProvider,
  type OkxSpotProviderOptions,
} from './providers/okx-spot';
