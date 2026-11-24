import { createCandle, createInstrumentId } from '@openview/market-domain';
import { describe, expect, it, vi } from 'vitest';
import type {
  CandleInterval,
  HistoricalCandleRequest,
  MarketDataCapabilities,
  MarketDataProvider,
} from './src/contracts';
import { MarketDataProviderError } from './src/errors';
import { HistoricalCandleService } from './src/history-service';
import { MarketDataProviderRegistry } from './src/registry';

const START_TIME = Date.UTC(2024, 0, 1);

const candleResult = createCandle({
  timestamp: START_TIME,
  open: 100,
  high: 105,
  low: 98,
  close: 102,
  volume: 12.5,
});

if (!candleResult.ok) {
  throw new Error(candleResult.error);
}

const CANDLE = candleResult.value;

const getItem = <T>(items: readonly T[], index: number): T => {
  const item = items[index];

  if (item === undefined) {
    throw new Error('The requested test value does not exist.');
  }

  return item;
};

const createRequest = (interval: CandleInterval = '1m'): HistoricalCandleRequest => ({
  instrumentId: createInstrumentId('BINANCE:BTC/USDT'),
  interval,
  startTime: START_TIME,
  endTime: START_TIME + 60_000,
});

const createProvider = (
  id: string,
  overrides: Partial<MarketDataCapabilities> = {},
): MarketDataProvider => ({
  id,
  displayName: id,
  capabilities: Object.freeze({
    historicalCandles: true,
    streamingQuotes: false,
    supportedIntervals: Object.freeze(['1m', '1h'] as const),
    redistribution: 'unknown',
    attributionRequired: false,
    ...overrides,
  }),
  getHistoricalCandles: vi.fn(async (_request: HistoricalCandleRequest) => Object.freeze([CANDLE])),
});

describe('historical candle service', () => {
  it('lists immutable metadata only for providers that offer historical candles', () => {
    const binance = createProvider('binance-spot');
    const metadata = createProvider('metadata-only', { historicalCandles: false });
    const bybit = createProvider('bybit-spot', { streamingQuotes: true });
    const service = new HistoricalCandleService(
      new MarketDataProviderRegistry([binance, metadata, bybit]),
    );

    const sources = service.listSources();

    expect(sources.map((source) => source.id)).toEqual(['binance-spot', 'bybit-spot']);
    expect(getItem(sources, 0)).toMatchObject({
      id: 'binance-spot',
      displayName: 'binance-spot',
      supportedIntervals: ['1m', '1h'],
      streamingQuotes: false,
      redistribution: 'unknown',
      attributionRequired: false,
    });
    expect(Object.isFrozen(sources)).toBe(true);
    expect(Object.isFrozen(getItem(sources, 0))).toBe(true);
    expect(Object.isFrozen(getItem(sources, 0).supportedIntervals)).toBe(true);
  });

  it('returns metadata for a selected historical source', () => {
    const provider = createProvider('okx-spot', {
      supportedIntervals: Object.freeze(['1m', '1d']),
      redistribution: 'restricted',
      attributionRequired: true,
    });
    const service = new HistoricalCandleService(new MarketDataProviderRegistry([provider]));

    expect(service.getSource('okx-spot')).toMatchObject({
      id: 'okx-spot',
      supportedIntervals: ['1m', '1d'],
      redistribution: 'restricted',
      attributionRequired: true,
    });
  });

  it('routes a historical request only to the explicitly selected provider', async () => {
    const binance = createProvider('binance-spot');
    const bybit = createProvider('bybit-spot');
    const service = new HistoricalCandleService(new MarketDataProviderRegistry([binance, bybit]));
    const request = createRequest();

    await expect(service.getHistoricalCandles('bybit-spot', request)).resolves.toEqual([CANDLE]);

    expect(bybit.getHistoricalCandles).toHaveBeenCalledTimes(1);
    expect(bybit.getHistoricalCandles).toHaveBeenCalledWith(request);
    expect(binance.getHistoricalCandles).not.toHaveBeenCalled();
  });

  it('rejects providers without historical candle capability before calling them', () => {
    const provider = createProvider('metadata-only', { historicalCandles: false });
    const service = new HistoricalCandleService(new MarketDataProviderRegistry([provider]));

    expect(() => service.getSource('metadata-only')).toThrow(MarketDataProviderError);
    expect(() => service.getHistoricalCandles('metadata-only', createRequest())).toThrow(
      'does not provide historical candles',
    );
    expect(provider.getHistoricalCandles).not.toHaveBeenCalled();
  });

  it('rejects unsupported intervals with provider context before calling the provider', () => {
    const provider = createProvider('bybit-spot');
    const service = new HistoricalCandleService(new MarketDataProviderRegistry([provider]));

    expect(() => service.getHistoricalCandles('bybit-spot', createRequest('4h'))).toThrow(
      'does not support the 4h candle interval',
    );
    expect(provider.getHistoricalCandles).not.toHaveBeenCalled();
  });

  it('reports an unknown provider through the registry contract', () => {
    const service = new HistoricalCandleService(new MarketDataProviderRegistry([]));

    expect(() => service.getSource('unknown')).toThrow('is not registered');
    expect(() => service.getHistoricalCandles('unknown', createRequest())).toThrow(
      'is not registered',
    );
  });

  it('preserves provider errors without converting or retrying them', async () => {
    const provider = createProvider('binance-spot');
    const error = new MarketDataProviderError('binance-spot', 'rate limited', 429, 2_000);
    vi.mocked(provider.getHistoricalCandles).mockRejectedValueOnce(error);
    const service = new HistoricalCandleService(new MarketDataProviderRegistry([provider]));

    await expect(service.getHistoricalCandles('binance-spot', createRequest())).rejects.toBe(error);
    expect(provider.getHistoricalCandles).toHaveBeenCalledTimes(1);
  });

  it('passes the request abort signal to the selected provider unchanged', async () => {
    const provider = createProvider('binance-spot');
    const service = new HistoricalCandleService(new MarketDataProviderRegistry([provider]));
    const controller = new AbortController();
    const request = { ...createRequest(), signal: controller.signal };

    await service.getHistoricalCandles('binance-spot', request);

    expect(provider.getHistoricalCandles).toHaveBeenCalledWith(request);
  });
});
