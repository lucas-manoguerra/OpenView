import { describe, expect, it } from 'vitest';
import {
  createChartViewport,
  priceToVerticalCoordinate,
  timeToHorizontalCoordinate,
} from './src/viewport';

describe('chart viewport transformations', () => {
  it('creates a positive viewport', () => {
    expect(createChartViewport(800, 400, 2)).toEqual({
      width: 800,
      height: 400,
      devicePixelRatio: 2,
    });
  });

  it('maps the visible time range to the horizontal viewport', () => {
    expect(timeToHorizontalCoordinate(50, { min: 0, max: 100 }, 800)).toBe(400);
  });

  it('maps the maximum price to the top edge', () => {
    expect(priceToVerticalCoordinate(200, { min: 100, max: 200 }, 400)).toBe(0);
  });

  it('maps the minimum price to the bottom edge', () => {
    expect(priceToVerticalCoordinate(100, { min: 100, max: 200 }, 400)).toBe(400);
  });

  it('rejects a collapsed scale range', () => {
    expect(() => timeToHorizontalCoordinate(50, { min: 10, max: 10 }, 800)).toThrow(RangeError);
  });
});
