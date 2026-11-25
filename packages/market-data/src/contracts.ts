import type { Candle, InstrumentId } from '@openview/market-domain';

export type CandleInterval =
  | '1s'
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M';

export type DataRedistribution = 'allowed' | 'restricted' | 'unknown';

export type MarketDataCapabilities = Readonly<{
  historicalCandles: boolean;
  streamingQuotes: boolean;
  streamingCandles?: boolean;
  supportedIntervals: readonly CandleInterval[];
  redistribution: DataRedistribution;
  attributionRequired: boolean;
}>;

export type HistoricalCandleRequest = Readonly<{
  instrumentId: InstrumentId;
  interval: CandleInterval;
  startTime: number;
  endTime: number;
  signal?: AbortSignal;
}>;

export type MarketInstrument = Readonly<{
  id: InstrumentId;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  priceIncrement?: number;
}>;

export type InstrumentDiscoveryFilter = Readonly<{
  quoteAsset?: string;
  signal?: AbortSignal;
}>;

export type QuoteUpdate = Readonly<{
  instrumentId: InstrumentId;
  timestamp: number;
  receivedAt: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume24h: number | null;
  changePercent24h: number | null;
}>;

export type QuoteStreamHandlers = Readonly<{
  onQuote: (quote: QuoteUpdate) => void;
  onStatus?: (state: MarketDataStreamState) => void;
  onError?: (error: Error) => void;
}>;

export type CandleSubscriptionRequest = Readonly<{
  instrumentId: InstrumentId;
  interval: CandleInterval;
}>;

export type CandleUpdate = Readonly<{
  instrumentId: InstrumentId;
  interval: CandleInterval;
  candle: Candle;
  isFinal: boolean;
}>;

export type MarketDataStreamState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type CandleStreamHandlers = Readonly<{
  onCandle: (update: CandleUpdate) => void;
  onStatus?: (state: MarketDataStreamState) => void;
  onError?: (error: Error) => void;
}>;

export type MarketDataSubscription = Readonly<{
  unsubscribe: () => void;
}>;

export interface MarketDataProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: MarketDataCapabilities;
  listInstruments?(filter?: InstrumentDiscoveryFilter): Promise<readonly MarketInstrument[]>;
  getHistoricalCandles(request: HistoricalCandleRequest): Promise<readonly Candle[]>;
  subscribeToQuotes?(
    instrumentIds: readonly InstrumentId[],
    handlers: QuoteStreamHandlers,
  ): MarketDataSubscription;
  subscribeToCandles?(
    request: CandleSubscriptionRequest,
    handlers: CandleStreamHandlers,
  ): MarketDataSubscription;
}
