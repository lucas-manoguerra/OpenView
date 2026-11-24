import { describe, expect, it } from 'vitest';
import {
  coordinateToPrice,
  createPriceScale,
  generatePriceTicks,
  priceToCoordinate,
} from './src/price-scale';

describe('price scale transformations', () => {
  it('maps the maximum price to the top edge and the minimum to the bottom edge', () => {
    const scale = createPriceScale({ min: 100, max: 200 }, 400);

    expect(priceToCoordinate(200, scale)).toBe(0);
    expect(priceToCoordinate(100, scale)).toBe(400);
    expect(priceToCoordinate(150, scale)).toBe(200);
  });

  it('supports inverted price coordinates', () => {
    const scale = createPriceScale({ min: 100, max: 200 }, 400, { inverted: true });

    expect(priceToCoordinate(100, scale)).toBe(0);
    expect(priceToCoordinate(200, scale)).toBe(400);
  });

  it('converts coordinates back to prices without clamping the viewport edges', () => {
    const scale = createPriceScale({ min: 100, max: 200 }, 400);

    expect(coordinateToPrice(200, scale)).toBe(150);
    expect(coordinateToPrice(-200, scale)).toBe(250);
    expect(coordinateToPrice(priceToCoordinate(137.5, scale), scale)).toBeCloseTo(137.5);
  });

  it('round trips logarithmic price coordinates', () => {
    const scale = createPriceScale({ min: 1, max: 1000 }, 600, { mode: 'logarithmic' });

    expect(priceToCoordinate(10, scale)).toBeCloseTo(400);
    expect(coordinateToPrice(priceToCoordinate(25, scale), scale)).toBeCloseTo(25);
  });

  it('round trips percentage coordinates around the selected base value', () => {
    const scale = createPriceScale(
      { min: 90, max: 110 },
      400,
      { mode: 'percentage', baseValue: 100 },
    );

    expect(priceToCoordinate(100, scale)).toBe(200);
    expect(coordinateToPrice(200, scale)).toBe(100);
  });

  it('round trips indexed-to-100 coordinates', () => {
    const scale = createPriceScale(
      { min: 50, max: 150 },
      400,
      { mode: 'indexed-to-100', baseValue: 100 },
    );

    expect(priceToCoordinate(100, scale)).toBe(200);
    expect(coordinateToPrice(priceToCoordinate(125, scale), scale)).toBeCloseTo(125);
  });

  it('generates evenly spaced linear ticks with precision derived from the step', () => {
    const scale = createPriceScale({ min: 1.01, max: 1.09 }, 400);
    const ticks = generatePriceTicks(scale, 5);

    expect(ticks.map((tick) => tick.label)).toEqual(['1.02', '1.04', '1.06', '1.08']);
    expect(ticks.map((tick) => tick.price)).toEqual([1.02, 1.04, 1.06, 1.08]);
  });

  it('formats percentage ticks in relative units', () => {
    const scale = createPriceScale(
      { min: 90, max: 110 },
      400,
      { mode: 'percentage', baseValue: 100 },
    );
    const ticks = generatePriceTicks(scale, 5);

    expect(ticks.map((tick) => tick.label)).toEqual(['-10%', '-5%', '0%', '+5%', '+10%']);
    expect(ticks[3]?.price).toBe(105);
  });

  it('generates readable major ticks on logarithmic scales', () => {
    const scale = createPriceScale({ min: 1, max: 100 }, 500, { mode: 'logarithmic' });
    const ticks = generatePriceTicks(scale, 6);

    expect(ticks.map((tick) => tick.price)).toEqual([1, 2, 5, 10, 20, 50, 100]);
    expect(ticks.map((tick) => tick.label)).toEqual(['1', '2', '5', '10', '20', '50', '100']);
    expect(ticks[0]?.coordinate).toBe(500);
    expect(ticks.at(-1)?.coordinate).toBe(0);
  });

  it('uses a linear interval fallback for a narrow logarithmic range', () => {
    const scale = createPriceScale({ min: 100, max: 110 }, 400, { mode: 'logarithmic' });
    const ticks = generatePriceTicks(scale, 5);

    expect(ticks.map((tick) => tick.price)).toEqual([100, 102, 104, 106, 108, 110]);
  });

  it('rejects collapsed, non-finite and invalid logarithmic ranges', () => {
    expect(() => createPriceScale({ min: 10, max: 10 }, 400)).toThrow(RangeError);
    expect(() => createPriceScale({ min: 0, max: Number.POSITIVE_INFINITY }, 400)).toThrow(
      RangeError,
    );
    expect(() =>
      createPriceScale({ min: -1, max: 10 }, 400, { mode: 'logarithmic' }),
    ).toThrow(RangeError);
  });

  it('requires a positive base value for relative price scales', () => {
    expect(() => createPriceScale({ min: 90, max: 110 }, 400, { mode: 'percentage' })).toThrow(
      RangeError,
    );
    expect(() =>
      createPriceScale({ min: 90, max: 110 }, 400, { mode: 'indexed-to-100', baseValue: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      createPriceScale({ min: 90, max: 110 }, 400, { mode: 'linear', baseValue: 100 }),
    ).toThrow(RangeError);
  });

  it('rejects invalid coordinates, prices and tick density', () => {
    const scale = createPriceScale({ min: 1, max: 100 }, 400, { mode: 'logarithmic' });

    expect(() => coordinateToPrice(Number.NaN, scale)).toThrow(RangeError);
    expect(() => priceToCoordinate(0, scale)).toThrow(RangeError);
    expect(() => generatePriceTicks(scale, 1)).toThrow(RangeError);
    expect(() => generatePriceTicks(scale, 51)).toThrow(RangeError);
  });
});
