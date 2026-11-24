import { describe, expect, it } from 'vitest';
import { createInstrumentId } from '@openview/market-domain';
import {
  createMarketInstrument,
  normalizeMarketInstruments,
} from './src/instrument-catalog';

describe('normalized market instrument catalog', () => {
  it('normalizes asset codes and creates provider-independent identifiers', () => {
    expect(createMarketInstrument(' btc ', 'usdt')).toEqual({
      id: createInstrumentId('BTC-USDT'),
      symbol: 'BTC/USDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
    });
  });

  it('filters by quote asset, sorts and removes duplicate instrument identifiers', () => {
    const instruments = [
      createMarketInstrument('ETH', 'USDT'),
      createMarketInstrument('BTC', 'USDT'),
      createMarketInstrument('BTC', 'USDT'),
      createMarketInstrument('ETH', 'BTC'),
    ];

    expect(normalizeMarketInstruments(instruments, { quoteAsset: 'usdt' })).toEqual([
      createMarketInstrument('BTC', 'USDT'),
      createMarketInstrument('ETH', 'USDT'),
    ]);
  });

  it('rejects invalid asset identifiers and quote filters', () => {
    expect(() => createMarketInstrument('BTC/USDT', 'USDT')).toThrow(RangeError);
    expect(() => normalizeMarketInstruments([], { quoteAsset: ' ' })).toThrow(RangeError);
  });
});
