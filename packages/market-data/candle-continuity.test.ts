import { describe, expect, it } from 'vitest';
import { getNextCandleTimestamp } from './src/candle-continuity';

describe('candle continuity', () => {
  it('advances fixed-duration intervals in UTC milliseconds', () => {
    const timestamp = Date.UTC(2024, 0, 1, 12);

    expect(getNextCandleTimestamp(timestamp, '1m')).toBe(timestamp + 60_000);
    expect(getNextCandleTimestamp(timestamp, '4h')).toBe(timestamp + 14_400_000);
    expect(getNextCandleTimestamp(timestamp, '1w')).toBe(timestamp + 604_800_000);
  });

  it('advances monthly candles by calendar month boundaries', () => {
    expect(getNextCandleTimestamp(Date.UTC(2024, 0, 1), '1M')).toBe(Date.UTC(2024, 1, 1));
    expect(getNextCandleTimestamp(Date.UTC(2024, 1, 1), '1M')).toBe(Date.UTC(2024, 2, 1));
    expect(getNextCandleTimestamp(Date.UTC(2024, 11, 1), '1M')).toBe(Date.UTC(2025, 0, 1));
  });

  it('rejects invalid timestamps', () => {
    expect(() => getNextCandleTimestamp(-1, '1m')).toThrow(RangeError);
    expect(() => getNextCandleTimestamp(Number.NaN, '1m')).toThrow(RangeError);
  });
});
