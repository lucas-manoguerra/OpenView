import { describe, expect, it, vi } from 'vitest';
import { createChart, type ChartSnapshot } from './chart-api';
import { createChartFrame } from './chart-frame';
import { logicalIndexToCoordinate } from './time-scale';
import { priceToCoordinate } from './price-scale';
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
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const listener = vi.fn();
    const unsubscribe = chart.subscribe(listener);

    chart.execute({ type: 'set-scene', scene: createScene() });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'scene-changed' }));

    const snapshot = chart.exportSnapshot();
    expect(snapshot.version).toBe(1);
    expect(snapshot.objectOrder).toHaveLength(2);
    chart.execute({
      type: 'move-object',
      target: { kind: 'price-series', id: 'main' },
      action: 'front',
    });
    expect(chart.exportSnapshot().objectOrder.at(-1)).toEqual({
      kind: 'price-series',
      id: 'main',
    });

    unsubscribe();
    chart.destroy();
    chart.destroy();
    expect(() => chart.exportSnapshot()).toThrow('destroyed');
  });

  it('owns drawing mutations and selection through public commands', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const listener = vi.fn();
    chart.subscribe(listener);
    const drawing = {
      id: 'drawing-1',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };

    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    const normalizedDrawings = chart.exportSnapshot().scene.drawings;
    expect(normalizedDrawings).toEqual([
      expect.objectContaining({
        ...drawing,
        lineWidth: 1.5,
        lineStyle: 'solid',
        fillColor: '#ffffff',
        fillOpacity: 0,
        extendStart: false,
        extendEnd: false,
        startStyle: 'none',
        endStyle: 'none',
        locked: false,
        visible: true,
      }),
    ]);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'drawing-state-changed',
        drawings: normalizedDrawings,
        selectedDrawingId: null,
        selectedDrawingIds: [],
      }),
    );

    chart.execute({ type: 'set-drawing-selection', drawingIds: ['missing', 'drawing-1'] });
    expect(chart.exportSnapshot().scene.selectedDrawingId).toBe('drawing-1');
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual(['drawing-1']);

    chart.execute({ type: 'set-drawings', drawings: [] });
    expect(chart.exportSnapshot().scene.selectedDrawingId).toBeNull();
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual([]);
    chart.destroy();
  });

  it('renders single and grouped drawing edit previews without mutating canonical state', () => {
    const { surface } = createSurface();
    const candles = [
      { timestamp: 1, open: 2, high: 4, low: 1, close: 3, volume: 10, logicalIndex: 0 },
      { timestamp: 2, open: 3, high: 5, low: 2, close: 4, volume: 12, logicalIndex: 1 },
    ];
    const frame = createChartFrame(320, 240, { min: 0, max: 10 }, 1);
    const chart = createChart({
      surface,
      initialScene: createChartRenderScene(frame, candles),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const drawing = {
      id: 'drawing-preview',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };
    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    const canonical = chart.exportSnapshot().scene.drawings;

    chart.execute({
      type: 'set-drawing-edit-preview',
      gesture: {
        kind: 'single',
        drawingId: drawing.id,
        target: 'end',
        origin: { logicalIndex: 1, price: 3 },
        current: { logicalIndex: 1, price: 4 },
      },
    });
    expect(chart.exportSnapshot().scene.drawings).toEqual(canonical);

    chart.execute({
      type: 'set-drawing-edit-preview',
      gesture: {
        kind: 'group',
        drawingIds: [drawing.id],
        origin: { logicalIndex: 0, price: 2 },
        current: { logicalIndex: 1, price: 3 },
      },
    });
    expect(chart.exportSnapshot().scene.drawings).toEqual(canonical);

    chart.execute({ type: 'set-drawing-edit-preview', gesture: null });
    expect(chart.exportSnapshot().scene.drawings).toEqual(canonical);

    chart.execute({
      type: 'set-drawing-edit-preview',
      gesture: {
        kind: 'single',
        drawingId: drawing.id,
        target: 'end',
        origin: { logicalIndex: 1, price: 3 },
        current: { logicalIndex: 1, price: 4 },
      },
    });
    chart.execute({ type: 'set-drawings', drawings: [{ ...drawing, color: '#ff0000' }] });
    expect(chart.exportSnapshot().scene.drawings[0]?.color).toBe('#ff0000');
    chart.destroy();
  });

  it('preserves chart-owned drawings and selection when the host updates the scene', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const drawing = {
      id: 'drawing-1',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };

    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    chart.execute({ type: 'set-drawing-selection', drawingIds: ['drawing-1'] });
    chart.execute({ type: 'set-scene', scene: createScene() });

    expect(chart.exportSnapshot().scene.drawings).toHaveLength(1);
    expect(chart.exportSnapshot().scene.selectedDrawingId).toBe('drawing-1');
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual(['drawing-1']);
    chart.destroy();
  });

  it('hides drawings from rendering without deleting chart-owned drawing state', () => {
    const { surface } = createSurface();
    const drawing = {
      id: 'drawing-1',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });

    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    chart.execute({ type: 'set-drawing-selection', drawingIds: ['drawing-1'] });
    chart.execute({ type: 'set-drawings-visible', visible: false });

    expect(chart.exportSnapshot().scene.drawings).toHaveLength(1);
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual(['drawing-1']);

    chart.execute({ type: 'set-drawings-visible', visible: true });
    expect(chart.exportSnapshot().scene.drawings).toHaveLength(1);
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual(['drawing-1']);
    chart.destroy();
  });

  it('owns drawing hover state and preserves it across host scene updates', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const drawing = {
      id: 'drawing-hover',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };
    const hit = { drawingId: 'drawing-hover', target: 'start' as const };

    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    chart.execute({ type: 'set-drawing-hover', hit });
    expect(chart.exportSnapshot().scene.hoveredDrawingHit).toEqual(hit);

    chart.execute({ type: 'set-scene', scene: createScene() });
    expect(chart.exportSnapshot().scene.hoveredDrawingHit).toEqual(hit);

    chart.execute({ type: 'set-drawings', drawings: [{ ...drawing, visible: false }] });
    expect(chart.exportSnapshot().scene.hoveredDrawingHit).toBeNull();

    chart.execute({ type: 'set-drawing-hover', hit });
    expect(chart.exportSnapshot().scene.hoveredDrawingHit).toBeNull();

    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    chart.execute({ type: 'set-drawing-hover', hit });
    chart.execute({ type: 'set-drawings', drawings: [] });
    expect(chart.exportSnapshot().scene.hoveredDrawingHit).toBeNull();

    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    chart.execute({ type: 'set-drawing-hover', hit });
    chart.execute({ type: 'set-drawings-visible', visible: false });
    expect(chart.exportSnapshot().scene.hoveredDrawingHit).toBeNull();
    chart.destroy();
  });

  it('queries visible drawing hits and area selection through chart-owned scene state', () => {
    const { surface } = createSurface();
    const candles = [
      { timestamp: 1, open: 2, high: 4, low: 1, close: 3, volume: 10, logicalIndex: 0 },
      { timestamp: 2, open: 3, high: 5, low: 2, close: 4, volume: 12, logicalIndex: 1 },
    ];
    const frame = createChartFrame(320, 240, { min: 0, max: 10 }, 1);
    const scene = createChartRenderScene(frame, candles);
    const chart = createChart({
      surface,
      initialScene: scene,
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const drawing = {
      id: 'drawing-query',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };
    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    const point = {
      x: frame.layout.plotArea.x + logicalIndexToCoordinate(0, frame.timeScale),
      y: frame.layout.plotArea.y + priceToCoordinate(2, frame.priceScale),
    };

    expect(chart.hitTestDrawing(point)).toEqual({
      drawingId: 'drawing-query',
      target: 'start',
    });
    expect(
      chart.selectDrawingsWithinArea({
        start: { x: point.x - 2, y: point.y - 2 },
        end: { x: point.x + 2, y: point.y + 2 },
      }),
    ).toEqual(['drawing-query']);

    chart.execute({ type: 'set-drawings', drawings: [{ ...drawing, visible: false }] });
    expect(chart.hitTestDrawing(point)).toBeNull();
    expect(
      chart.selectDrawingsWithinArea({
        start: { x: point.x - 2, y: point.y - 2 },
        end: { x: point.x + 2, y: point.y + 2 },
      }),
    ).toEqual([]);

    chart.execute({ type: 'set-drawings-visible', visible: false });
    expect(chart.hitTestDrawing(point)).toBeNull();
    expect(
      chart.selectDrawingsWithinArea({
        start: { x: point.x - 2, y: point.y - 2 },
        end: { x: point.x + 2, y: point.y + 2 },
      }),
    ).toEqual([]);
    chart.destroy();
  });

  it('round-trips a serializable object order snapshot', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const snapshot: ChartSnapshot = chart.exportSnapshot();
    chart.importSnapshot(snapshot);
    expect(chart.exportSnapshot().objectOrder).toEqual(snapshot.objectOrder);
    chart.destroy();
  });
});
