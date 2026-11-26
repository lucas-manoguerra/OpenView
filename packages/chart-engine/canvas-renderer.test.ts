import { describe, expect, it } from 'vitest';
import { type ChartRenderCandle, createChartRenderScene } from './src/canvas-painter';
import {
  type CanvasFrameScheduler,
  type CanvasSurface,
  createCanvasRenderer,
} from './src/canvas-renderer';
import { createChartFrame } from './src/chart-frame';

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

const createScheduler = (): Readonly<{
  scheduler: CanvasFrameScheduler;
  pending: Map<number, () => void>;
  flush: () => void;
}> => {
  const pending = new Map<number, () => void>();
  let nextHandle = 1;

  const scheduler: CanvasFrameScheduler = {
    requestFrame: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => {
      pending.delete(handle);
    },
  };

  const flush = (): void => {
    const callbacks = [...pending.values()];
    pending.clear();

    for (const callback of callbacks) {
      callback();
    }
  };

  return { scheduler, pending, flush };
};

const createSurface = (context: CanvasRenderingContext2D | null): CanvasSurface => ({
  width: 0,
  height: 0,
  getContext: () => context,
});

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
];

describe('canvas renderer lifecycle', () => {
  it('resizes the backing surface using the device pixel ratio', () => {
    const { context, calls } = createMockContext();
    const surface = createSurface(context);
    const scheduler = createScheduler();
    const renderer = createCanvasRenderer(surface, { scheduler: scheduler.scheduler });

    renderer.resize(320, 180, 1.5);

    expect(surface.width).toBe(480);
    expect(surface.height).toBe(270);
    expect(renderer.size).toEqual({
      width: 320,
      height: 180,
      devicePixelRatio: 1.5,
    });
    expect(scheduler.pending.size).toBe(1);

    scheduler.flush();

    expect(calls).toContainEqual({
      name: 'setTransform',
      args: [1.5, 0, 0, 1.5, 0, 0],
    });
  });

  it('coalesces multiple invalidations into one scheduled render', () => {
    const { context, calls } = createMockContext();
    const surface = createSurface(context);
    const scheduler = createScheduler();
    const renderer = createCanvasRenderer(surface, { scheduler: scheduler.scheduler });
    const frame = createChartFrame(320, 180, { min: 90, max: 120 }, 20);
    const scene = createChartRenderScene(frame, createCandles());

    renderer.resize(320, 180, 2);
    renderer.setScene(scene);
    renderer.invalidate();
    renderer.invalidate();

    expect(scheduler.pending.size).toBe(1);

    scheduler.flush();

    expect(calls.some((call) => call.name === 'fillText')).toBe(true);
    expect(calls.some((call) => call.name === 'clip')).toBe(true);
  });

  it('renders immediately and cancels a pending animation frame', () => {
    const { context, calls } = createMockContext();
    const scheduler = createScheduler();
    const renderer = createCanvasRenderer(createSurface(context), {
      scheduler: scheduler.scheduler,
    });
    const frame = createChartFrame(320, 180, { min: 90, max: 120 }, 20);

    renderer.resize(320, 180);
    renderer.setScene(createChartRenderScene(frame, createCandles()));

    expect(scheduler.pending.size).toBe(1);

    renderer.renderNow();

    expect(scheduler.pending.size).toBe(0);
    expect(calls.some((call) => call.name === 'fillText')).toBe(true);
  });

  it('clears the previous scene after a size or pixel ratio change', () => {
    const { context, calls } = createMockContext();
    const scheduler = createScheduler();
    const renderer = createCanvasRenderer(createSurface(context), {
      scheduler: scheduler.scheduler,
    });
    const frame = createChartFrame(320, 180, { min: 90, max: 120 }, 20);

    renderer.resize(320, 180);
    renderer.setScene(createChartRenderScene(frame, createCandles()));
    scheduler.flush();
    calls.length = 0;

    renderer.resize(400, 220, 2);
    scheduler.flush();

    expect(calls.some((call) => call.name === 'fillText')).toBe(false);
    expect(calls.some((call) => call.name === 'clearRect')).toBe(true);
  });

  it('clears the current scene when null is supplied', () => {
    const { context, calls } = createMockContext();
    const scheduler = createScheduler();
    const renderer = createCanvasRenderer(createSurface(context), {
      scheduler: scheduler.scheduler,
    });
    const frame = createChartFrame(320, 180, { min: 90, max: 120 }, 20);

    renderer.resize(320, 180);
    renderer.setScene(createChartRenderScene(frame, createCandles()));
    scheduler.flush();
    calls.length = 0;

    renderer.setScene(null);
    scheduler.flush();

    expect(calls.some((call) => call.name === 'clearRect')).toBe(true);
    expect(calls.some((call) => call.name === 'fillText')).toBe(false);
  });

  it('does not schedule redundant work for an unchanged size', () => {
    const { context } = createMockContext();
    const scheduler = createScheduler();
    const renderer = createCanvasRenderer(createSurface(context), {
      scheduler: scheduler.scheduler,
    });

    renderer.resize(320, 180);
    renderer.resize(320, 180);

    expect(scheduler.pending.size).toBe(1);
  });

  it('allows zero-sized surfaces to suspend drawing', () => {
    const { context, calls } = createMockContext();
    const surface = createSurface(context);
    const scheduler = createScheduler();
    const renderer = createCanvasRenderer(surface, { scheduler: scheduler.scheduler });

    renderer.resize(0, 0, 2);
    scheduler.flush();

    expect(surface.width).toBe(0);
    expect(surface.height).toBe(0);
    expect(calls.some((call) => call.name === 'clearRect')).toBe(false);
  });

  it('rejects invalid sizes, pixel ratios and mismatched frame dimensions', () => {
    const { context } = createMockContext();
    const scheduler = createScheduler();
    const renderer = createCanvasRenderer(createSurface(context), {
      scheduler: scheduler.scheduler,
    });

    expect(() => renderer.resize(-1, 100)).toThrow(RangeError);
    expect(() => renderer.resize(100, Number.NaN)).toThrow(RangeError);
    expect(() => renderer.resize(100, 100, 0)).toThrow(RangeError);

    renderer.resize(320, 180);
    const mismatchedFrame = createChartFrame(300, 180, { min: 90, max: 120 }, 20);

    expect(() =>
      renderer.setScene(createChartRenderScene(mismatchedFrame, createCandles())),
    ).toThrow(RangeError);
  });

  it('cancels scheduled work and prevents use after destruction', () => {
    const { context } = createMockContext();
    const scheduler = createScheduler();
    const renderer = createCanvasRenderer(createSurface(context), {
      scheduler: scheduler.scheduler,
    });

    renderer.resize(320, 180);
    expect(scheduler.pending.size).toBe(1);

    renderer.destroy();

    expect(scheduler.pending.size).toBe(0);
    expect(() => renderer.resize(320, 180)).toThrow(Error);
    expect(() => renderer.renderNow()).toThrow(Error);
    expect(() =>
      renderer.setScene(
        createChartRenderScene(
          createChartFrame(320, 180, { min: 90, max: 120 }, 20),
          createCandles(),
        ),
      ),
    ).toThrow(Error);
  });

  it('requires a usable 2D rendering context', () => {
    const scheduler = createScheduler();

    expect(() =>
      createCanvasRenderer(createSurface(null), { scheduler: scheduler.scheduler }),
    ).toThrow('A 2D canvas rendering context is required.');
  });
});
