import { describe, expect, it } from 'vitest';
import { createCandle } from './src/candle';

describe('createCandle', () => {
  const validCandle = {
    timestamp: 1_700_000_000_000,
    open: 100,
    high: 108,
    low: 96,
    close: 104,
    volume: 250,
  };

  it('accepts a valid OHLCV candle', () => {
    expect(createCandle(validCandle)).toEqual({
      ok: true,
      value: validCandle,
    });
  });

  it('rejects a non-finite price', () => {
    expect(createCandle({ ...validCandle, close: Number.NaN })).toEqual({
      ok: false,
      error: 'non-finite-value',
    });
  });

  it('rejects a negative volume', () => {
    expect(createCandle({ ...validCandle, volume: -1 })).toEqual({
      ok: false,
      error: 'negative-volume',
    });
  });

  it('rejects a low above the candle high', () => {
    expect(createCandle({ ...validCandle, low: 109 })).toEqual({
      ok: false,
      error: 'invalid-price-range',
    });
  });

  it('rejects an open outside the high-low range', () => {
    expect(createCandle({ ...validCandle, open: 110 })).toEqual({
      ok: false,
      error: 'invalid-ohlc-range',
    });
  });
});
