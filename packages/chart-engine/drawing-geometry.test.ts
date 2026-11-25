import { describe, expect, it } from 'vitest';
import { createChartFrame, dataPointToChartCoordinate } from './src/chart-frame';
import {
  getLogicalIndexAtTimestamp,
  getTimestampAtLogicalIndex,
  hitTestChartDrawing,
  selectChartDrawingsWithinArea,
  updateChartDrawing,
} from './src/drawing-geometry';
import type { ChartRenderCandle, ChartRenderDrawing } from './src/canvas-painter';

const createCandles = (): readonly ChartRenderCandle[] =>
  Object.freeze([
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

const createFrame = () => createChartFrame(900, 500, { min: 90, max: 120 }, 2);

const trendDrawing: ChartRenderDrawing = Object.freeze({
  id: 'trend-1',
  type: 'trend-line',
  start: Object.freeze({ timestamp: 1_700_000_000_000, price: 100 }),
  end: Object.freeze({ timestamp: 1_700_000_120_000, price: 110 }),
  color: '#60a5fa',
});

describe('chart drawing geometry', () => {
  it('converts between timestamps and logical indices', () => {
    const candles = createCandles();

    expect(getLogicalIndexAtTimestamp(1_700_000_030_000, candles)).toBe(0.5);
    expect(getTimestampAtLogicalIndex(1.5, candles)).toBe(1_700_000_090_000);
    expect(getLogicalIndexAtTimestamp(1_700_000_060_000, candles)).toBe(1);
  });

  it('prioritizes drawing control points before the drawing body', () => {
    const frame = createFrame();
    const candles = createCandles();
    const start = dataPointToChartCoordinate({ logicalIndex: 0, price: 100 }, frame);

    expect(hitTestChartDrawing(start, [trendDrawing], candles, frame)).toEqual({
      drawingId: 'trend-1',
      target: 'start',
    });
  });

  it('selects a line body when the pointer is away from its control points', () => {
    const frame = createFrame();
    const candles = createCandles();
    const start = dataPointToChartCoordinate({ logicalIndex: 0, price: 100 }, frame);
    const end = dataPointToChartCoordinate({ logicalIndex: 2, price: 110 }, frame);
    const middle = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };

    expect(hitTestChartDrawing(middle, [trendDrawing], candles, frame)).toEqual({
      drawingId: 'trend-1',
      target: 'body',
    });
  });

  it('does not hit-test locked drawings', () => {
    const frame = createFrame();
    const candles = createCandles();
    const lockedDrawing: ChartRenderDrawing = Object.freeze({
      ...trendDrawing,
      locked: true,
    });
    const start = dataPointToChartCoordinate({ logicalIndex: 0, price: 100 }, frame);
    const end = dataPointToChartCoordinate({ logicalIndex: 2, price: 110 }, frame);
    const middle = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };

    expect(hitTestChartDrawing(start, [lockedDrawing], candles, frame)).toBeNull();
    expect(hitTestChartDrawing(middle, [lockedDrawing], candles, frame)).toBeNull();
  });

  it('selects the top-most drawing when annotations overlap', () => {
    const frame = createFrame();
    const candles = createCandles();
    const upperDrawing: ChartRenderDrawing = Object.freeze({
      ...trendDrawing,
      id: 'trend-2',
    });
    const start = dataPointToChartCoordinate({ logicalIndex: 0, price: 100 }, frame);

    expect(hitTestChartDrawing(start, [trendDrawing, upperDrawing], candles, frame)).toEqual({
      drawingId: 'trend-2',
      target: 'start',
    });
  });

  it('prioritizes a selected anchor over an overlapping unselected drawing body', () => {
    const frame = createFrame();
    const candles = createCandles();
    const overlappingLine: ChartRenderDrawing = Object.freeze({
      id: 'horizontal-overlap',
      type: 'horizontal-line',
      start: Object.freeze({ timestamp: 1_700_000_120_000, price: 100 }),
      end: null,
      color: '#f4c542',
    });
    const selectedStart = dataPointToChartCoordinate({ logicalIndex: 0, price: 100 }, frame);

    expect(
      hitTestChartDrawing(
        selectedStart,
        [trendDrawing, overlappingLine],
        candles,
        frame,
        8,
        ['trend-1'],
      ),
    ).toEqual({
      drawingId: 'trend-1',
      target: 'start',
    });
  });

  it('selects unlocked drawings fully contained in a marquee area', () => {
    const frame = createFrame();
    const candles = createCandles();
    const start = dataPointToChartCoordinate({ logicalIndex: 0, price: 100 }, frame);
    const end = dataPointToChartCoordinate({ logicalIndex: 2, price: 110 }, frame);
    const outsideDrawing: ChartRenderDrawing = Object.freeze({
      ...trendDrawing,
      id: 'trend-outside',
      start: Object.freeze({ timestamp: 1_700_000_000_000, price: 115 }),
      end: Object.freeze({ timestamp: 1_700_000_120_000, price: 118 }),
    });
    const lockedDrawing: ChartRenderDrawing = Object.freeze({
      ...trendDrawing,
      id: 'trend-locked',
      locked: true,
    });

    expect(
      selectChartDrawingsWithinArea(
        {
          start: { x: start.x - 4, y: end.y - 4 },
          end: { x: end.x + 4, y: start.y + 4 },
        },
        [trendDrawing, outsideDrawing, lockedDrawing],
        candles,
        frame,
      ),
    ).toEqual(['trend-1']);
  });

  it('selects a drawing when its path crosses the marquee even if both anchors are outside', () => {
    const frame = createFrame();
    const candles = createCandles();
    const crossingDrawing: ChartRenderDrawing = Object.freeze({
      ...trendDrawing,
      id: 'trend-crossing',
      start: Object.freeze({ timestamp: 1_700_000_000_000, price: 92 }),
      end: Object.freeze({ timestamp: 1_700_000_120_000, price: 118 }),
    });
    const middle = dataPointToChartCoordinate({ logicalIndex: 1, price: 105 }, frame);

    expect(
      selectChartDrawingsWithinArea(
        {
          start: { x: middle.x - 12, y: middle.y - 12 },
          end: { x: middle.x + 12, y: middle.y + 12 },
        },
        [crossingDrawing],
        candles,
        frame,
      ),
    ).toEqual(['trend-crossing']);
  });

  it('rejects non-finite marquee selection coordinates', () => {
    expect(() =>
      selectChartDrawingsWithinArea(
        {
          start: { x: Number.NaN, y: 0 },
          end: { x: 100, y: 100 },
        },
        [trendDrawing],
        createCandles(),
        createFrame(),
      ),
    ).toThrow(RangeError);
  });

  it('moves both anchors by a logical-time and price delta', () => {
    const candles = createCandles();
    const updated = updateChartDrawing(
      trendDrawing,
      'body',
      { logicalIndex: 0.5, price: 105 },
      { logicalIndex: 1.5, price: 108 },
      candles,
    );

    expect(updated.start).toEqual({
      timestamp: 1_700_000_060_000,
      price: 103,
    });
    expect(updated.end).toEqual({
      timestamp: 1_700_000_180_000,
      price: 113,
    });
    expect(updated.id).toBe(trendDrawing.id);
  });

  it('edits one control point without changing the opposite anchor', () => {
    const candles = createCandles();
    const updated = updateChartDrawing(
      trendDrawing,
      'end',
      { logicalIndex: 2, price: 110 },
      { logicalIndex: 1, price: 115 },
      candles,
    );

    expect(updated.start).toBe(trendDrawing.start);
    expect(updated.end).toEqual({
      timestamp: 1_700_000_060_000,
      price: 115,
    });
  });

  it('moves horizontal lines by price and vertical lines by time only', () => {
    const candles = createCandles();
    const horizontal: ChartRenderDrawing = Object.freeze({
      id: 'horizontal-1',
      type: 'horizontal-line',
      start: Object.freeze({ timestamp: 1_700_000_060_000, price: 105 }),
      end: null,
      color: '#f4c542',
    });
    const vertical: ChartRenderDrawing = Object.freeze({
      id: 'vertical-1',
      type: 'vertical-line',
      start: Object.freeze({ timestamp: 1_700_000_060_000, price: 105 }),
      end: null,
      color: '#f4c542',
    });

    const movedHorizontal = updateChartDrawing(
      horizontal,
      'body',
      { logicalIndex: 1, price: 105 },
      { logicalIndex: 2, price: 108 },
      candles,
    );
    const movedVertical = updateChartDrawing(
      vertical,
      'body',
      { logicalIndex: 1, price: 105 },
      { logicalIndex: 2, price: 108 },
      candles,
    );

    expect(movedHorizontal.start).toEqual({
      timestamp: 1_700_000_060_000,
      price: 108,
    });
    expect(movedVertical.start).toEqual({
      timestamp: 1_700_000_120_000,
      price: 105,
    });
  });

  it('rejects edits whose market anchors cannot be resolved', () => {
    expect(() =>
      updateChartDrawing(
        trendDrawing,
        'start',
        { logicalIndex: 0, price: 100 },
        { logicalIndex: Number.NaN, price: 105 },
        createCandles(),
      ),
    ).toThrow(RangeError);
  });
});
