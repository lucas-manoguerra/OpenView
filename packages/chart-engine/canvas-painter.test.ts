import { describe, expect, it } from 'vitest';
import { createChartFrame, dataPointToChartCoordinate } from './src/chart-frame';
import {
  createChartRenderScene,
  DEFAULT_CHART_THEME,
  drawChartScene,
  type ChartRenderCandle,
} from './src/canvas-painter';

type RecordedCall = Readonly<{
  name: string;
  args: readonly unknown[];
}>;

const createMockContext = (): Readonly<{
  context: CanvasRenderingContext2D;
  calls: RecordedCall[];
}> => {
  const calls: RecordedCall[] = [];
  const record = (name: string, ...args: unknown[]): void => {
    calls.push({ name, args });
  };
  const context = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    save: () => record('save'),
    restore: () => record('restore'),
    clearRect: (...args: number[]) => record('clearRect', ...args),
    fillRect: (...args: number[]) => record('fillRect', ...args),
    beginPath: () => record('beginPath'),
    moveTo: (...args: number[]) => record('moveTo', ...args),
    lineTo: (...args: number[]) => record('lineTo', ...args),
    stroke: () => record('stroke'),
    fillText: (...args: [string, number, number]) => record('fillText', ...args),
    rect: (...args: number[]) => record('rect', ...args),
    clip: () => record('clip'),
    setLineDash: (segments: number[]) => record('setLineDash', ...segments),
    setTransform: (...args: number[]) => record('setTransform', ...args),
  };

  return {
    context: context as unknown as CanvasRenderingContext2D,
    calls,
  };
};

const createCandles = (): readonly ChartRenderCandle[] => [
  {
    logicalIndex: 0,
    timestamp: 1_700_000_000_000,
    open: 100,
    high: 112,
    low: 96,
    close: 108,
    volume: 40,
  },
  {
    logicalIndex: 1,
    timestamp: 1_700_000_060_000,
    open: 108,
    high: 114,
    low: 104,
    close: 106,
    volume: 80,
  },
  {
    logicalIndex: 2,
    timestamp: 1_700_000_120_000,
    open: 106,
    high: 110,
    low: 101,
    close: 106,
    volume: 0,
  },
];

describe('canvas chart painter', () => {
  it('draws a background, price grid, time grid and price axis labels', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10, {
      layout: { leftPriceScaleWidth: 56, rightPriceScaleWidth: 72 },
    });
    const scene = createChartRenderScene(frame, []);
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(calls.some((call) => call.name === 'clearRect')).toBe(true);
    expect(calls.filter((call) => call.name === 'moveTo').length).toBeGreaterThan(0);
    expect(calls.filter((call) => call.name === 'lineTo').length).toBeGreaterThan(0);
    expect(calls.some((call) => call.name === 'fillText')).toBe(true);
    expect(calls.some((call) => call.name === 'fillRect' && call.args[0] === 0)).toBe(true);
  });

  it('draws bullish, bearish and unchanged candles inside the plot clip', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const scene = createChartRenderScene(frame, createCandles());
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(calls.some((call) => call.name === 'clip')).toBe(true);
    expect(calls.filter((call) => call.name === 'fillRect').length).toBeGreaterThanOrEqual(5);
    expect(calls.some((call) => call.name === 'stroke')).toBe(true);
  });

  it('draws a separate volume panel with bars relative to the visible maximum', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10, {
      layout: { volumeHeight: 80 },
    });
    const scene = createChartRenderScene(frame, createCandles());
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    const volumeBackground = calls.find(
      (call) =>
        call.name === 'fillRect' &&
        call.args[0] === frame.layout.volumeArea.x &&
        call.args[1] === frame.layout.volumeArea.y &&
        call.args[3] === frame.layout.volumeArea.height,
    );

    expect(volumeBackground).toBeDefined();
    expect(calls.some((call) => call.name === 'clip')).toBe(true);
  });

  it('draws volume grid guides above the volume background and beneath its bars', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10, {
      layout: { volumeHeight: 80 },
    });
    const scene = createChartRenderScene(frame, createCandles());
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    const volumeBackgroundIndex = calls.findIndex(
      (call) =>
        call.name === 'fillRect' &&
        call.args[0] === frame.layout.volumeArea.x &&
        call.args[1] === frame.layout.volumeArea.y &&
        call.args[3] === frame.layout.volumeArea.height,
    );
    const gridLineIndex = calls.findIndex(
      (call) =>
        call.name === 'lineTo' &&
        typeof call.args[0] === 'number' &&
        call.args[0] > frame.layout.plotArea.x &&
        call.args[0] < frame.layout.plotArea.x + frame.layout.plotArea.width &&
        call.args[1] ===
          frame.layout.plotArea.y + frame.layout.plotArea.height + frame.layout.volumeArea.height,
    );
    const firstVolumeBarIndex = calls.findIndex(
      (call, index) =>
        index > gridLineIndex &&
        call.name === 'fillRect' &&
        typeof call.args[1] === 'number' &&
        call.args[1] >= frame.layout.volumeArea.y &&
        call.args[1] < frame.layout.volumeArea.y + frame.layout.volumeArea.height,
    );

    expect(volumeBackgroundIndex).toBeGreaterThanOrEqual(0);
    expect(gridLineIndex).toBeGreaterThan(volumeBackgroundIndex);
    expect(firstVolumeBarIndex).toBeGreaterThan(gridLineIndex);
  });

  it('draws crosshair guides using a dashed stroke', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const coordinate = dataPointToChartCoordinate({ logicalIndex: 1, price: 105 }, frame);
    const scene = createChartRenderScene(frame, createCandles(), coordinate);
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(calls).toContainEqual({ name: 'setLineDash', args: [4, 4] });
    expect(calls).toContainEqual({ name: 'setLineDash', args: [] });
  });

  it('does not draw a crosshair outside the plot area', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const scene = createChartRenderScene(frame, [], {
      x: frame.layout.plotArea.x + frame.layout.plotArea.width + 1,
      y: frame.layout.plotArea.y + 10,
    });
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(calls.some((call) => call.name === 'setLineDash')).toBe(false);
  });

  it('uses an immutable default theme and supports an empty volume panel', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const scene = createChartRenderScene(frame, []);
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(Object.isFrozen(DEFAULT_CHART_THEME)).toBe(true);
    expect(calls.every((call) => call.name !== 'setLineDash')).toBe(true);
  });

  it('freezes render data and rejects unordered indices or invalid volume', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const candles = createCandles();
    const scene = createChartRenderScene(frame, candles);

    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.candles)).toBe(true);
    expect(Object.isFrozen(scene.candles[0])).toBe(true);
    expect(() => createChartRenderScene(frame, [candles[1]!, candles[0]!])).toThrow(RangeError);
    expect(() => createChartRenderScene(frame, [{ ...candles[0]!, volume: -1 }])).toThrow(
      RangeError,
    );
    expect(() => createChartRenderScene(frame, candles, { x: Number.NaN, y: 10 })).toThrow(
      RangeError,
    );
  });
});
