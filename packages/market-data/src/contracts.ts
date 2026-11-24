import type { Candle, InstrumentId } from '@openview/market-domain';

export type CandleInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

export type DataRedistribution = 'allowed' | 'restricted' | 'unknown';

export type MarketDataCapabilities = Readonly<{
  historicalCandles: boolean;
  streamingQuotes: boolean;
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
}
