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
  QuoteStreamHandlers,
  QuoteUpdate,
} from './contracts';

export { MarketDataProviderError } from './errors';
export { getNextCandleTimestamp } from './candle-continuity';
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
  type BybitWebSocketConnection,
  type BybitWebSocketFactory,
} from './providers/bybit-spot';
export {
  OkxSpotMarketDataProvider,
  type OkxSpotProviderOptions,
  type OkxWebSocketConnection,
  type OkxWebSocketFactory,
} from './providers/okx-spot';
