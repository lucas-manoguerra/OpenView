import { describe, expect, it } from 'vitest';
import {
  calculateExponentialMovingAverage,
  calculateSimpleMovingAverage,
  type MovingAverageInput,
} from './src/indicators';

const createCandles = (): readonly MovingAverageInput[] =>
  Object.freeze([
    Object.freeze({ logicalIndex: 2, close: 10 }),
    Object.freeze({ logicalIndex: 3, close: 12 }),
    Object.freeze({ logicalIndex: 4, close: 14 }),
    Object.freeze({ logicalIndex: 5, close: 16 }),
    Object.freeze({ logicalIndex: 6, close: 18 }),
  ]);

describe('moving average indicators', () => {
  it('calculates a rolling simple moving average aligned to logical indices', () => {
    const average = calculateSimpleMovingAverage(createCandles(), 3);

    expect(average).toEqual([
      { logicalIndex: 4, value: 12 },
      { logicalIndex: 5, value: 14 },
      { logicalIndex: 6, value: 16 },
    ]);
    expect(Object.isFrozen(average)).toBe(true);
    expect(Object.isFrozen(average[0])).toBe(true);
  });

  it('seeds exponential moving average with the first simple average', () => {
    const average = calculateExponentialMovingAverage(createCandles(), 3);

    expect(average).toEqual([
      { logicalIndex: 4, value: 12 },
      { logicalIndex: 5, value: 14 },
      { logicalIndex: 6, value: 16 },
    ]);
  });

  it('returns no points until enough candles exist', () => {
    expect(calculateSimpleMovingAverage(createCandles().slice(0, 2), 3)).toEqual([]);
    expect(calculateExponentialMovingAverage(createCandles().slice(0, 2), 3)).toEqual([]);
  });

  it('rejects invalid periods and unordered or non-finite inputs', () => {
    expect(() => calculateSimpleMovingAverage(createCandles(), 0)).toThrow(RangeError);
    expect(() => calculateExponentialMovingAverage(createCandles(), 1.5)).toThrow(RangeError);
    expect(() =>
      calculateSimpleMovingAverage(
        [{ logicalIndex: 1, close: 10 }, { logicalIndex: 1, close: 12 }],
        1,
      ),
    ).toThrow(RangeError);
    expect(() =>
      calculateExponentialMovingAverage([{ logicalIndex: 1, close: Number.NaN }], 1),
    ).toThrow(RangeError);
  });
});
