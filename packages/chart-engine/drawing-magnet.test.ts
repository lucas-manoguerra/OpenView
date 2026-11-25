import { describe, expect, it } from 'vitest';
import { createChartFrame } from './src/chart-frame';
import { resolveChartDrawingMagnetMode, snapChartDrawingPointToOhlc } from './src/drawing-magnet';
import type { ChartIndicatorSeries, ChartRenderCandle } from './src/canvas-painter';

const candles: readonly ChartRenderCandle[] = Object.freeze([
  Object.freeze({
    logicalIndex: 0,
    timestamp: 1_700_000_000_000,
    open: 100,
    high: 112,
    low: 96,
    close: 108,
    volume: 40,
  }),
  Object.freeze({
    logicalIndex: 1,
    timestamp: 1_700_000_060_000,
    open: 108,
    high: 114,
    low: 104,
    close: 106,
    volume: 80,
  }),
  Object.freeze({
    logicalIndex: 2,
    timestamp: 1_700_000_120_000,
    open: 106,
    high: 110,
    low: 101,
    close: 106,
    volume: 0,
  }),
]);

const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 2);

describe('chart drawing magnet', () => {
  it('keeps drawing points unchanged when the magnet is disabled', () => {
    const point = Object.freeze({ logicalIndex: 1, price: 109 });

    expect(snapChartDrawingPointToOhlc(point, candles, frame, 'off')).toBe(point);
  });

  it('strong magnet snaps to the nearest OHLC value on the closest candle', () => {
    expect(
      snapChartDrawingPointToOhlc(
        { logicalIndex: 1.1, price: 109 },
        candles,
        frame,
        'strong',
      ),
    ).toEqual({ logicalIndex: 1, price: 108 });
  });

  it('weak magnet snaps only while the pointer is within its pixel tolerance', () => {
    expect(
      snapChartDrawingPointToOhlc(
        { logicalIndex: 1, price: 107.8 },
        candles,
        frame,
        'weak',
        8,
      ),
    ).toEqual({ logicalIndex: 1, price: 108 });

    const distantPoint = Object.freeze({ logicalIndex: 1, price: 100 });

    expect(snapChartDrawingPointToOhlc(distantPoint, candles, frame, 'weak', 8)).toBe(distantPoint);
  });

  it('snaps to overlay indicator values when indicator snapping is enabled', () => {
    const indicators: readonly ChartIndicatorSeries[] = [
      Object.freeze({
        id: 'sma-20',
        label: 'SMA 20',
        color: '#2962ff',
        points: Object.freeze([
          Object.freeze({ logicalIndex: 0, value: 109 }),
          Object.freeze({ logicalIndex: 1, value: 111 }),
          Object.freeze({ logicalIndex: 2, value: 107 }),
        ]),
      }),
    ];

    expect(
      snapChartDrawingPointToOhlc(
        { logicalIndex: 1, price: 111.2 },
        candles,
        frame,
        'strong',
        undefined,
        indicators,
        true,
      ),
    ).toEqual({ logicalIndex: 1, price: 111 });
  });

  it('does not use overlay indicator values when indicator snapping is disabled', () => {
    const indicators: readonly ChartIndicatorSeries[] = [
      Object.freeze({
        id: 'sma-20',
        label: 'SMA 20',
        color: '#2962ff',
        points: Object.freeze([Object.freeze({ logicalIndex: 1, value: 111 })]),
      }),
    ];

    expect(
      snapChartDrawingPointToOhlc(
        { logicalIndex: 1, price: 111.2 },
        candles,
        frame,
        'strong',
        undefined,
        indicators,
        false,
      ),
    ).toEqual({ logicalIndex: 1, price: 114 });
  });

  it('uses the configured magnet mode unless the temporary modifier is pressed', () => {
    expect(resolveChartDrawingMagnetMode('off', false)).toBe('off');
    expect(resolveChartDrawingMagnetMode('weak', false)).toBe('weak');
    expect(resolveChartDrawingMagnetMode('strong', false)).toBe('strong');
    expect(resolveChartDrawingMagnetMode('off', true)).toBe('strong');
    expect(resolveChartDrawingMagnetMode('weak', true)).toBe('off');
    expect(resolveChartDrawingMagnetMode('strong', true)).toBe('off');
  });

  it('rejects invalid tolerance values', () => {
    expect(() =>
      snapChartDrawingPointToOhlc(
        { logicalIndex: 1, price: 107 },
        candles,
        frame,
        'weak',
        Number.NaN,
      ),
    ).toThrow(RangeError);
  });
});
