import { describe, expect, it } from 'vitest';
import {
  chartCoordinateToDataPoint,
  createChartFrame,
  dataPointToChartCoordinate,
} from './src/chart-frame';

describe('chart frame composition', () => {
  it('creates price and time scales from the drawable plot area', () => {
    const frame = createChartFrame(1000, 600, { min: 100, max: 200 }, 99, {
      layout: {
        leftPriceScaleWidth: 60,
        rightPriceScaleWidth: 72,
        timeScaleHeight: 32,
      },
    });

    expect(frame.timeScale.width).toBe(frame.layout.plotArea.width);
    expect(frame.priceScale.height).toBe(frame.layout.plotArea.height);
    expect(frame.layout.plotArea).toEqual({
      x: 60,
      y: 0,
      width: 868,
      height: 568,
    });
  });

  it('maps the latest bar and maximum price to the top-right plot edge', () => {
    const frame = createChartFrame(1000, 600, { min: 100, max: 200 }, 99, {
      layout: {
        leftPriceScaleWidth: 60,
        rightPriceScaleWidth: 72,
      },
    });

    expect(dataPointToChartCoordinate({ logicalIndex: 99, price: 200 }, frame)).toEqual({
      x: 924,
      y: 0,
    });
  });

  it('maps the minimum price to the bottom edge of the plot area', () => {
    const frame = createChartFrame(800, 500, { min: 50, max: 150 }, 49, {
      layout: {
        topInset: 20,
        bottomInset: 12,
        timeScaleHeight: 28,
      },
    });

    const coordinate = dataPointToChartCoordinate({ logicalIndex: 49, price: 50 }, frame);

    expect(coordinate.y).toBe(frame.layout.plotArea.y + frame.layout.plotArea.height);
  });

  it('converts between chart coordinates and data points', () => {
    const frame = createChartFrame(1200, 720, { min: 90, max: 110 }, 199, {
      layout: {
        leftPriceScaleWidth: 64,
        rightPriceScaleWidth: 80,
        timeScaleHeight: 36,
        topInset: 16,
      },
    });
    const point = { logicalIndex: 123.25, price: 104.75 };
    const coordinate = dataPointToChartCoordinate(point, frame);

    expect(chartCoordinateToDataPoint(coordinate, frame).logicalIndex).toBeCloseTo(
      point.logicalIndex,
    );
    expect(chartCoordinateToDataPoint(coordinate, frame).price).toBeCloseTo(point.price);
  });

  it('applies inverted price and time scales in chart coordinates', () => {
    const frame = createChartFrame(800, 500, { min: 100, max: 200 }, 99, {
      priceScale: { inverted: true },
      timeScale: { inverted: true },
    });

    const coordinate = dataPointToChartCoordinate({ logicalIndex: 99, price: 100 }, frame);

    expect(coordinate.x).toBe(frame.layout.plotArea.x + 4);
    expect(coordinate.y).toBe(frame.layout.plotArea.y);
    expect(chartCoordinateToDataPoint(coordinate, frame)).toEqual({
      logicalIndex: 99,
      price: 100,
    });
  });

  it('supports percentage scales through the composed coordinate system', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 110 }, 99, {
      priceScale: { mode: 'percentage', baseValue: 100 },
    });

    const coordinate = dataPointToChartCoordinate({ logicalIndex: 99, price: 100 }, frame);
    const point = chartCoordinateToDataPoint(coordinate, frame);

    expect(coordinate.y).toBe(frame.layout.plotArea.y + frame.layout.plotArea.height / 2);
    expect(point.price).toBe(100);
  });

  it('preserves coordinate extrapolation outside the plot area', () => {
    const frame = createChartFrame(800, 500, { min: 100, max: 200 }, 99);
    const point = { logicalIndex: 120, price: 220 };

    expect(chartCoordinateToDataPoint(dataPointToChartCoordinate(point, frame), frame)).toEqual(
      point,
    );
  });

  it('returns an immutable frame and immutable coordinates', () => {
    const frame = createChartFrame(800, 500, { min: 100, max: 200 }, 99);
    const coordinate = dataPointToChartCoordinate({ logicalIndex: 50, price: 150 }, frame);

    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(coordinate)).toBe(true);
    expect(Object.isFrozen(chartCoordinateToDataPoint(coordinate, frame))).toBe(true);
  });

  it('rejects non-finite chart coordinates', () => {
    const frame = createChartFrame(800, 500, { min: 100, max: 200 }, 99);

    expect(() => chartCoordinateToDataPoint({ x: Number.NaN, y: 100 }, frame)).toThrow(RangeError);
    expect(() =>
      chartCoordinateToDataPoint({ x: 100, y: Number.POSITIVE_INFINITY }, frame),
    ).toThrow(RangeError);
    expect(() =>
      dataPointToChartCoordinate({ logicalIndex: 10, price: Number.NaN }, frame),
    ).toThrow(RangeError);
  });
});
