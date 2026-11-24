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

export type QuoteUpdate = Readonly<{
  instrumentId: InstrumentId;
  timestamp: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
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
  getHistoricalCandles(request: HistoricalCandleRequest): Promise<readonly Candle[]>;
  subscribeToQuotes?(
    instrumentIds: readonly InstrumentId[],
    onQuote: (quote: QuoteUpdate) => void,
  ): MarketDataSubscription;
  subscribeToCandles?(
    request: CandleSubscriptionRequest,
    handlers: CandleStreamHandlers,
  ): MarketDataSubscription;
}
