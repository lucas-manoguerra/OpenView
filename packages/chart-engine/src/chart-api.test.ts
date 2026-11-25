import { describe, expect, it, vi } from 'vitest';
import { createChart, type ChartSnapshot } from './chart-api';
import { createChartFrame } from './chart-frame';
import { createChartRenderScene } from './canvas-painter';

const createScene = () => {
  const frame = createChartFrame(320, 240, { min: 0, max: 10 }, 0);
  return createChartRenderScene(frame, []);
};

const createSurface = () => {
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return {
    surface: {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    },
    context,
  };
};

describe('chart public API', () => {
  it('creates, subscribes, exports and destroys an isolated chart instance', () => {
    const { surface } = createSurface();
    const chart = createChart({ surface, initialScene: createScene() });
    const listener = vi.fn();
    const unsubscribe = chart.subscribe(listener);

    chart.execute({ type: 'set-scene', scene: createScene() });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'scene-changed' }));

    const snapshot = chart.exportSnapshot();
    expect(snapshot.version).toBe(1);
    expect(snapshot.objectOrder).toHaveLength(2);

    unsubscribe();
    chart.destroy();
    chart.destroy();
    expect(() => chart.exportSnapshot()).toThrow('destroyed');
  });

  it('round-trips a serializable object order snapshot', () => {
    const { surface } = createSurface();
    const chart = createChart({ surface, initialScene: createScene() });
    const snapshot: ChartSnapshot = chart.exportSnapshot();
    chart.importSnapshot(snapshot);
    expect(chart.exportSnapshot().objectOrder).toEqual(snapshot.objectOrder);
    chart.destroy();
  });
});
