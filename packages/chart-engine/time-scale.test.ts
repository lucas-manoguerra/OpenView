import { describe, expect, it } from 'vitest';
import {
  coordinateToLogicalIndex,
  createTimeScale,
  logicalIndexToCoordinate,
  panTimeScale,
  resizeTimeScale,
  zoomTimeScale,
} from './src/time-scale';

describe('logical time scale', () => {
  it('creates a visible logical range from width and bar spacing', () => {
    const scale = createTimeScale(800, 99);

    expect(scale.visibleLogicalRange).toEqual({ from: -0.5, to: 99.5 });
    expect(scale.barSpacing).toBe(8);
  });

  it('maps logical bar centers to evenly spaced horizontal coordinates', () => {
    const scale = createTimeScale(800, 99);

    expect(logicalIndexToCoordinate(0, scale)).toBe(4);
    expect(logicalIndexToCoordinate(50, scale)).toBe(404);
    expect(logicalIndexToCoordinate(99, scale)).toBe(796);
  });

  it('converts horizontal coordinates back to logical indices', () => {
    const scale = createTimeScale(800, 99);

    expect(coordinateToLogicalIndex(404, scale)).toBe(50);
    expect(coordinateToLogicalIndex(logicalIndexToCoordinate(25.25, scale), scale)).toBeCloseTo(
      25.25,
    );
  });

  it('supports coordinates and logical indices outside the visible range', () => {
    const scale = createTimeScale(800, 99);

    expect(logicalIndexToCoordinate(120, scale)).toBe(964);
    expect(coordinateToLogicalIndex(964, scale)).toBe(120);
  });

  it('moves chart content with the horizontal drag direction', () => {
    const scale = createTimeScale(800, 99);
    const nextScale = panTimeScale(scale, 80);

    expect(nextScale.rightOffset).toBe(-10);
    expect(logicalIndexToCoordinate(50, nextScale)).toBe(logicalIndexToCoordinate(50, scale) + 80);
  });

  it('pans inverted time scales in the same visual drag direction', () => {
    const scale = createTimeScale(800, 99, { inverted: true });
    const nextScale = panTimeScale(scale, 80);

    expect(nextScale.rightOffset).toBe(10);
    expect(logicalIndexToCoordinate(50, nextScale)).toBe(logicalIndexToCoordinate(50, scale) + 80);
  });

  it('keeps the logical index under the pointer fixed while zooming', () => {
    const scale = createTimeScale(800, 99);
    const anchorCoordinate = 200;
    const anchorLogicalIndex = coordinateToLogicalIndex(anchorCoordinate, scale);
    const nextScale = zoomTimeScale(scale, 2, anchorCoordinate);

    expect(nextScale.barSpacing).toBe(16);
    expect(logicalIndexToCoordinate(anchorLogicalIndex, nextScale)).toBeCloseTo(anchorCoordinate);
  });

  it('preserves the zoom anchor on inverted time scales', () => {
    const scale = createTimeScale(800, 99, { inverted: true });
    const anchorCoordinate = 200;
    const anchorLogicalIndex = coordinateToLogicalIndex(anchorCoordinate, scale);
    const nextScale = zoomTimeScale(scale, 2, anchorCoordinate);

    expect(logicalIndexToCoordinate(anchorLogicalIndex, nextScale)).toBeCloseTo(anchorCoordinate);
  });

  it('keeps bar spacing within configured limits while zooming', () => {
    const scale = createTimeScale(800, 99, {
      minBarSpacing: 2,
      maxBarSpacing: 20,
    });

    expect(zoomTimeScale(scale, 100, 400).barSpacing).toBe(20);
    expect(zoomTimeScale(scale, 0.01, 400).barSpacing).toBe(2);
  });

  it('returns the same scale when zoom is already clamped at a limit', () => {
    const scale = createTimeScale(800, 99, {
      barSpacing: 20,
      maxBarSpacing: 20,
    });

    expect(zoomTimeScale(scale, 2, 400)).toBe(scale);
  });

  it('resizes while preserving bar spacing and the right logical boundary', () => {
    const scale = createTimeScale(800, 99, { rightOffset: 3 });
    const nextScale = resizeTimeScale(scale, 1000);

    expect(nextScale.barSpacing).toBe(scale.barSpacing);
    expect(nextScale.visibleLogicalRange.to).toBe(scale.visibleLogicalRange.to);
    expect(nextScale.visibleLogicalRange.from).toBeLessThan(scale.visibleLogicalRange.from);
  });

  it('rejects invalid scale dimensions and spacing limits', () => {
    expect(() => createTimeScale(0, 99)).toThrow(RangeError);
    expect(() => createTimeScale(800, 99, { barSpacing: 0 })).toThrow(RangeError);
    expect(() => createTimeScale(800, 99, { minBarSpacing: 5, maxBarSpacing: 2 })).toThrow(
      RangeError,
    );
    expect(() => createTimeScale(800, 99, { barSpacing: 60, maxBarSpacing: 50 })).toThrow(
      RangeError,
    );
  });

  it('rejects invalid navigation inputs', () => {
    const scale = createTimeScale(800, 99);

    expect(() => logicalIndexToCoordinate(Number.NaN, scale)).toThrow(RangeError);
    expect(() => coordinateToLogicalIndex(Number.POSITIVE_INFINITY, scale)).toThrow(RangeError);
    expect(() => panTimeScale(scale, Number.NaN)).toThrow(RangeError);
    expect(() => zoomTimeScale(scale, 0, 400)).toThrow(RangeError);
    expect(() => resizeTimeScale(scale, 0)).toThrow(RangeError);
  });
});
