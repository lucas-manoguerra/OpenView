import { describe, expect, it } from 'vitest';
import { createChartFrame, dataPointToChartCoordinate } from './src/chart-frame';
import {
  createChartRenderScene,
  updateChartRenderScene,
  DEFAULT_CHART_THEME,
  drawChartScene,
  type ChartRenderCandle,
  type ChartRenderDrawing,
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
    measureText: (text: string) => ({ width: text.length * 6 }) as TextMetrics,
    save: () => record('save'),
    restore: () => record('restore'),
    clearRect: (...args: number[]) => record('clearRect', ...args),
    fillRect: (...args: number[]) => record('fillRect', ...args),
    fill: () => record('fill'),
    closePath: () => record('closePath'),
    beginPath: () => record('beginPath'),
    moveTo: (...args: number[]) => record('moveTo', ...args),
    lineTo: (...args: number[]) => record('lineTo', ...args),
    arc: (...args: number[]) => record('arc', ...args),
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

  it('draws timestamp labels instead of logical indices on the time axis', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 2, {
      timeScale: { barSpacing: 50, maxBarSpacing: 50 },
    });
    const scene = createChartRenderScene(frame, createCandles());
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    const timeAxisLabels = calls
      .filter(
        (call) =>
          call.name === 'fillText' &&
          typeof call.args[0] === 'string' &&
          call.args[2] === frame.layout.timeScaleArea.y + frame.layout.timeScaleArea.height / 2,
      )
      .map((call) => call.args[0]);

    expect(timeAxisLabels.length).toBeGreaterThan(0);
    expect(timeAxisLabels.every((label) => typeof label === 'string' && label.includes(':'))).toBe(
      true,
    );
    expect(timeAxisLabels).not.toContain('0');
    expect(timeAxisLabels).not.toContain('1');
    expect(timeAxisLabels).not.toContain('2');
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

  it('draws OHLC bars with high-low stems and open-close ticks', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const scene = createChartRenderScene(frame, createCandles(), null, 'bars');
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(scene.chartType).toBe('bars');
    expect(calls.filter((call) => call.name === 'moveTo').length).toBeGreaterThan(6);
    expect(calls.filter((call) => call.name === 'lineTo').length).toBeGreaterThan(6);
    expect(calls.some((call) => call.name === 'fill')).toBe(false);
  });

  it('draws close-price line and area styles without candle bodies', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const lineScene = createChartRenderScene(frame, createCandles(), null, 'line');
    const areaScene = createChartRenderScene(frame, createCandles(), null, 'area');
    const lineContext = createMockContext();
    const areaContext = createMockContext();

    drawChartScene(lineContext.context, lineScene);
    drawChartScene(areaContext.context, areaScene);

    expect(lineScene.chartType).toBe('line');
    expect(lineContext.calls.some((call) => call.name === 'stroke')).toBe(true);
    expect(lineContext.calls.some((call) => call.name === 'fill')).toBe(false);
    expect(areaScene.chartType).toBe('area');
    expect(areaContext.calls.filter((call) => call.name === 'fill')).toHaveLength(1);
    expect(areaContext.calls.some((call) => call.name === 'closePath')).toBe(true);
  });

  it('updates chart type immutably without rebuilding candle data', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const scene = createChartRenderScene(frame, createCandles());
    const updated = updateChartRenderScene(scene, { chartType: 'line' });

    expect(updated).not.toBe(scene);
    expect(updated.chartType).toBe('line');
    expect(updated.candles).toBe(scene.candles);
    expect(updateChartRenderScene(updated, { chartType: 'line' })).toBe(updated);
  });

  it('renders indicator overlays above the selected chart type', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const indicators = [
      {
        id: 'sma-3',
        label: 'SMA 3',
        color: '#f4c542',
        points: [
          { logicalIndex: 0, value: 101 },
          { logicalIndex: 1, value: 104 },
          { logicalIndex: 2, value: 108 },
        ],
      },
    ];
    const scene = createChartRenderScene(frame, createCandles(), null, 'candles', indicators);
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(scene.indicators).toHaveLength(1);
    expect(Object.isFrozen(scene.indicators)).toBe(true);
    expect(Object.isFrozen(scene.indicators[0])).toBe(true);
    expect(calls.filter((call) => call.name === 'stroke').length).toBeGreaterThan(3);
    expect(() =>
      createChartRenderScene(frame, createCandles(), null, 'candles', [
        {
          id: 'invalid',
          label: 'Invalid',
          color: '#fff',
          points: [
            { logicalIndex: 2, value: 100 },
            { logicalIndex: 1, value: 101 },
          ],
        },
      ]),
    ).toThrow(RangeError);
  });

  it('renders time-anchored trend lines and price-anchored horizontal lines', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const drawings: readonly ChartRenderDrawing[] = [
      {
        id: 'trend-1',
        type: 'trend-line',
        start: { timestamp: 1_700_000_000_000, price: 100 },
        end: { timestamp: 1_700_000_120_000, price: 110 },
        color: '#60a5fa',
      },
      {
        id: 'horizontal-1',
        type: 'horizontal-line',
        start: { timestamp: 1_700_000_060_000, price: 105 },
        end: null,
        color: '#f4c542',
      },
    ];
    const scene = createChartRenderScene(frame, createCandles(), null, 'candles', [], drawings);
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(scene.drawings).toHaveLength(2);
    expect(Object.isFrozen(scene.drawings)).toBe(true);
    expect(Object.isFrozen(scene.drawings[0]?.start)).toBe(true);
    expect(calls.filter((call) => call.name === 'stroke').length).toBeGreaterThan(2);
    expect(calls.filter((call) => call.name === 'lineTo').length).toBeGreaterThan(5);
  });

  it('normalizes drawing color, width and line pattern', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const drawings: readonly ChartRenderDrawing[] = [
      {
        id: 'styled-trend',
        type: 'trend-line',
        start: { timestamp: 1_700_000_000_000, price: 100 },
        end: { timestamp: 1_700_000_120_000, price: 110 },
        color: '#ef4444',
        lineWidth: 4,
        lineStyle: 'dashed',
      },
    ];
    const scene = createChartRenderScene(frame, createCandles(), null, 'candles', [], drawings);
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(scene.drawings[0]?.color).toBe('#ef4444');
    expect(scene.drawings[0]?.lineWidth).toBe(4);
    expect(scene.drawings[0]?.lineStyle).toBe('dashed');
    expect(calls.some((call) => call.name === 'setLineDash' && call.args.join(',') === '8,5')).toBe(
      true,
    );
    expect(() =>
      createChartRenderScene(
        frame,
        createCandles(),
        null,
        'candles',
        [],
        [{ ...drawings[0]!, id: 'invalid-width', lineWidth: 9 }],
      ),
    ).toThrow(RangeError);
  });

  it('renders ray, vertical line and rectangle geometry', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const drawings: readonly ChartRenderDrawing[] = [
      {
        id: 'ray-1',
        type: 'ray',
        start: { timestamp: 1_700_000_000_000, price: 102 },
        end: { timestamp: 1_700_000_060_000, price: 108 },
        color: '#60a5fa',
      },
      {
        id: 'vertical-1',
        type: 'vertical-line',
        start: { timestamp: 1_700_000_060_000, price: 105 },
        end: null,
        color: '#f4c542',
      },
      {
        id: 'rectangle-1',
        type: 'rectangle',
        start: { timestamp: 1_700_000_000_000, price: 110 },
        end: { timestamp: 1_700_000_120_000, price: 100 },
        color: '#ab47bc',
      },
    ];
    const scene = createChartRenderScene(frame, createCandles(), null, 'candles', [], drawings);
    const { context, calls } = createMockContext();

    drawChartScene(context, scene);

    expect(scene.drawings.map((drawing) => drawing.type)).toEqual([
      'ray',
      'vertical-line',
      'rectangle',
    ]);
    expect(calls.filter((call) => call.name === 'stroke').length).toBeGreaterThanOrEqual(3);
    expect(calls.filter((call) => call.name === 'lineTo').length).toBeGreaterThanOrEqual(8);
  });

  it('preserves drawings through scene updates and rejects invalid annotations', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const drawings: readonly ChartRenderDrawing[] = [
      {
        id: 'horizontal-1',
        type: 'horizontal-line',
        start: { timestamp: 1_700_000_060_000, price: 105 },
        end: null,
        color: '#f4c542',
      },
    ];
    const scene = createChartRenderScene(frame, createCandles(), null, 'candles', [], drawings);
    const updated = updateChartRenderScene(scene, { crosshair: { x: 120, y: 140 } });

    expect(updated.drawings).toBe(scene.drawings);
    expect(updateChartRenderScene(updated, { drawings: updated.drawings })).toBe(updated);
    expect(() =>
      createChartRenderScene(
        frame,
        createCandles(),
        null,
        'candles',
        [],
        [
          {
            id: 'trend-invalid',
            type: 'trend-line',
            start: { timestamp: 1_700_000_000_000, price: 100 },
            end: null,
            color: '#60a5fa',
          },
        ],
      ),
    ).toThrow(RangeError);
  });

  it('renders visible control handles for the selected drawing', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const drawings: readonly ChartRenderDrawing[] = [
      {
        id: 'trend-selected',
        type: 'trend-line',
        start: { timestamp: 1_700_000_000_000, price: 100 },
        end: { timestamp: 1_700_000_120_000, price: 110 },
        color: '#60a5fa',
      },
    ];
    const normalScene = createChartRenderScene(
      frame,
      createCandles(),
      null,
      'candles',
      [],
      drawings,
    );
    const selectedScene = createChartRenderScene(
      frame,
      createCandles(),
      null,
      'candles',
      [],
      drawings,
      'trend-selected',
    );
    const normalContext = createMockContext();
    const selectedContext = createMockContext();

    drawChartScene(normalContext.context, normalScene);
    drawChartScene(selectedContext.context, selectedScene);

    expect(selectedScene.selectedDrawingId).toBe('trend-selected');
    expect(
      selectedContext.calls.filter((call) => call.name === 'arc').length -
        normalContext.calls.filter((call) => call.name === 'arc').length,
    ).toBe(4);
  });

  it('renders handles for every drawing in a multi-selection', () => {
    const frame = createChartFrame(800, 500, { min: 90, max: 120 }, 10);
    const drawings: readonly ChartRenderDrawing[] = [
      {
        id: 'trend-one',
        type: 'trend-line',
        start: { timestamp: 1_700_000_000_000, price: 100 },
        end: { timestamp: 1_700_000_120_000, price: 105 },
        color: '#60a5fa',
      },
      {
        id: 'trend-two',
        type: 'trend-line',
        start: { timestamp: 1_700_000_000_000, price: 110 },
        end: { timestamp: 1_700_000_120_000, price: 115 },
        color: '#f4c542',
      },
    ];
    const normalScene = createChartRenderScene(frame, createCandles(), null, 'candles', [], drawings);
    const selectedScene = createChartRenderScene(
      frame,
      createCandles(),
      null,
      'candles',
      [],
      drawings,
      'trend-two',
      ['trend-one', 'trend-two'],
    );
    const normalContext = createMockContext();
    const selectedContext = createMockContext();

    drawChartScene(normalContext.context, normalScene);
    drawChartScene(selectedContext.context, selectedScene);

    expect(selectedScene.selectedDrawingIds).toEqual(['trend-one', 'trend-two']);
    expect(
      selectedContext.calls.filter((call) => call.name === 'arc').length -
        normalContext.calls.filter((call) => call.name === 'arc').length,
    ).toBe(8);

    const cleared = updateChartRenderScene(selectedScene, { selectedDrawingIds: [] });
    expect(cleared.selectedDrawingId).toBeNull();
    expect(cleared.selectedDrawingIds).toEqual([]);
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
    const firstCandle = candles[0];
    const secondCandle = candles[1];

    if (firstCandle === undefined || secondCandle === undefined) {
      throw new Error('The candle fixture must contain at least two candles.');
    }

    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.candles)).toBe(true);
    expect(Object.isFrozen(scene.candles[0])).toBe(true);
    expect(() => createChartRenderScene(frame, [secondCandle, firstCandle])).toThrow(RangeError);
    expect(() =>
      createChartRenderScene(frame, [
        firstCandle,
        { ...secondCandle, timestamp: firstCandle.timestamp },
      ]),
    ).toThrow(RangeError);
    expect(() => createChartRenderScene(frame, [{ ...firstCandle, volume: -1 }])).toThrow(
      RangeError,
    );
    expect(() => createChartRenderScene(frame, candles, { x: Number.NaN, y: 10 })).toThrow(
      RangeError,
    );
  });
});
