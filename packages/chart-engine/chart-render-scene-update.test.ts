import { describe, expect, it } from 'vitest';
import {
  type ChartRenderCandle,
  createChartRenderScene,
  updateChartRenderScene,
} from './src/canvas-painter';
import { createChartFrame } from './src/chart-frame';

const candles: readonly ChartRenderCandle[] = Object.freeze([
  Object.freeze({
    logicalIndex: 0,
    timestamp: 1_700_000_000,
    open: 100,
    high: 105,
    low: 98,
    close: 103,
    volume: 25,
  }),
  Object.freeze({
    logicalIndex: 1,
    timestamp: 1_700_000_060,
    open: 103,
    high: 108,
    low: 101,
    close: 106,
    volume: 32,
  }),
]);

const createFrame = (width = 900) => createChartFrame(width, 500, { min: 90, max: 120 }, 1);

describe('chart render scene updates', () => {
  it('updates the frame and crosshair while preserving validated candle data', () => {
    const scene = createChartRenderScene(createFrame(), candles);
    const frame = createFrame(1200);
    const crosshair = { x: 400, y: 200 };

    const updated = updateChartRenderScene(scene, { frame, crosshair });

    expect(updated.frame).toBe(frame);
    expect(updated.crosshair).toEqual(crosshair);
    expect(updated.candles).toBe(scene.candles);
    expect(updated.timeAxisData).toBe(scene.timeAxisData);
  });

  it('clears the crosshair without replacing the frame or candle collection', () => {
    const scene = createChartRenderScene(createFrame(), candles, { x: 400, y: 200 });

    const updated = updateChartRenderScene(scene, { crosshair: null });

    expect(updated.frame).toBe(scene.frame);
    expect(updated.crosshair).toBeNull();
    expect(updated.candles).toBe(scene.candles);
  });

  it('returns the same scene when the update does not change visible state', () => {
    const scene = createChartRenderScene(createFrame(), candles);

    expect(updateChartRenderScene(scene, {})).toBe(scene);
  });

  it('rejects non-finite crosshair coordinates', () => {
    const scene = createChartRenderScene(createFrame(), candles);

    expect(() => updateChartRenderScene(scene, { crosshair: { x: Number.NaN, y: 0 } })).toThrow(
      RangeError,
    );
  });
});
