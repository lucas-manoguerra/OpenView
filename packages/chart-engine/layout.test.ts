import { describe, expect, it } from 'vitest';
import { createChartLayout } from './src/layout';

describe('chart layout', () => {
  it('creates plot and scale areas using the default right and time axes', () => {
    const layout = createChartLayout(1000, 600);

    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 1000, height: 600 });
    expect(layout.plotArea).toEqual({ x: 0, y: 0, width: 928, height: 568 });
    expect(layout.rightPriceScaleArea).toEqual({
      x: 928,
      y: 0,
      width: 72,
      height: 568,
    });
    expect(layout.timeScaleArea).toEqual({
      x: 0,
      y: 568,
      width: 928,
      height: 32,
    });
  });

  it('reserves both price scale areas and positions the plot between them', () => {
    const layout = createChartLayout(1200, 800, {
      leftPriceScaleWidth: 64,
      rightPriceScaleWidth: 80,
      timeScaleHeight: 36,
    });

    expect(layout.plotArea).toEqual({ x: 64, y: 0, width: 1056, height: 764 });
    expect(layout.leftPriceScaleArea).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 764,
    });
    expect(layout.rightPriceScaleArea).toEqual({
      x: 1120,
      y: 0,
      width: 80,
      height: 764,
    });
    expect(layout.timeScaleArea).toEqual({
      x: 64,
      y: 764,
      width: 1056,
      height: 36,
    });
  });

  it('applies top and bottom insets without changing the outer bounds', () => {
    const layout = createChartLayout(900, 500, {
      topInset: 18,
      bottomInset: 12,
      timeScaleHeight: 30,
    });

    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 900, height: 500 });
    expect(layout.plotArea).toEqual({ x: 0, y: 18, width: 828, height: 440 });
    expect(layout.rightPriceScaleArea.y).toBe(18);
    expect(layout.timeScaleArea.y).toBe(470);
  });

  it('allows hiding either price scale by reserving zero width', () => {
    const leftOnly = createChartLayout(800, 400, {
      leftPriceScaleWidth: 60,
      rightPriceScaleWidth: 0,
    });
    const noPriceScale = createChartLayout(800, 400, {
      leftPriceScaleWidth: 0,
      rightPriceScaleWidth: 0,
    });

    expect(leftOnly.leftPriceScaleArea.width).toBe(60);
    expect(leftOnly.rightPriceScaleArea.width).toBe(0);
    expect(leftOnly.plotArea.x).toBe(60);
    expect(noPriceScale.plotArea.width).toBe(800);
  });

  it('allows hiding the time scale while preserving the full chart height', () => {
    const layout = createChartLayout(800, 400, { timeScaleHeight: 0 });

    expect(layout.timeScaleArea.height).toBe(0);
    expect(layout.timeScaleArea.y).toBe(400);
    expect(layout.plotArea.height).toBe(400);
  });

  it('returns immutable layout geometry', () => {
    const layout = createChartLayout(800, 400);

    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.bounds)).toBe(true);
    expect(Object.isFrozen(layout.plotArea)).toBe(true);
    expect(Object.isFrozen(layout.rightPriceScaleArea)).toBe(true);
    expect(Object.isFrozen(layout.timeScaleArea)).toBe(true);
  });

  it('keeps adjacent plot and scale edges aligned', () => {
    const layout = createChartLayout(1280, 720, {
      leftPriceScaleWidth: 56,
      rightPriceScaleWidth: 84,
      timeScaleHeight: 28,
      topInset: 10,
      bottomInset: 6,
    });

    expect(layout.leftPriceScaleArea.x + layout.leftPriceScaleArea.width).toBe(layout.plotArea.x);
    expect(layout.plotArea.x + layout.plotArea.width).toBe(layout.rightPriceScaleArea.x);
    expect(layout.plotArea.y + layout.plotArea.height + 6).toBe(layout.timeScaleArea.y);
    expect(layout.timeScaleArea.x).toBe(layout.plotArea.x);
    expect(layout.timeScaleArea.width).toBe(layout.plotArea.width);
  });

  it('rejects non-finite and non-positive outer dimensions', () => {
    expect(() => createChartLayout(0, 400)).toThrow(RangeError);
    expect(() => createChartLayout(800, -1)).toThrow(RangeError);
    expect(() => createChartLayout(Number.NaN, 400)).toThrow(RangeError);
    expect(() => createChartLayout(800, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('rejects negative insets and scale dimensions', () => {
    expect(() => createChartLayout(800, 400, { leftPriceScaleWidth: -1 })).toThrow(RangeError);
    expect(() => createChartLayout(800, 400, { rightPriceScaleWidth: -1 })).toThrow(RangeError);
    expect(() => createChartLayout(800, 400, { timeScaleHeight: -1 })).toThrow(RangeError);
    expect(() => createChartLayout(800, 400, { topInset: -1 })).toThrow(RangeError);
    expect(() => createChartLayout(800, 400, { bottomInset: -1 })).toThrow(RangeError);
  });

  it('rejects dimensions that leave no drawable plot area', () => {
    expect(() =>
      createChartLayout(100, 400, { leftPriceScaleWidth: 50, rightPriceScaleWidth: 50 }),
    ).toThrow(RangeError);
    expect(() => createChartLayout(800, 100, { timeScaleHeight: 100 })).toThrow(RangeError);
    expect(() => createChartLayout(800, 100, { topInset: 50, bottomInset: 50 })).toThrow(
      RangeError,
    );
  });
});
