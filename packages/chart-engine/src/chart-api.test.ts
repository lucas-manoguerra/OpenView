import { describe, expect, it, vi } from 'vitest';
import { createChart, type ChartSnapshot } from './chart-api';
import { createChartFrame } from './chart-frame';
import { createChartInteractionController } from './chart-interaction';
import { logicalIndexToCoordinate } from './time-scale';
import { priceToCoordinate } from './price-scale';
import { createChartRenderScene } from './canvas-painter';

const createScene = () => {
  const frame = createChartFrame(320, 240, { min: 0, max: 10 }, 0);
  return createChartRenderScene(frame, []);
};

const createSceneWithCandles = () => {
  const frame = createChartFrame(320, 240, { min: 0, max: 10 }, 1);
  return createChartRenderScene(frame, [
    {
      timestamp: 1_000,
      open: 2,
      high: 4,
      low: 1,
      close: 3,
      volume: 10,
      logicalIndex: 0,
    },
    {
      timestamp: 2_000,
      open: 3,
      high: 5,
      low: 2,
      close: 4,
      volume: 12,
      logicalIndex: 1,
    },
  ]);
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

  it('owns pointer adapter attachment, cancellation, and cleanup', () => {
    const { surface } = createSurface();
    const listeners = new Map<string, EventListener>();
    const addEventListener = vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    });
    const removeEventListener = vi.fn((type: string) => {
      listeners.delete(type);
    });
    const canvas = {
      dataset: {},
      style: {},
      addEventListener,
      removeEventListener,
      getBoundingClientRect: () =>
        ({
          left: 0,
          top: 0,
          width: 320,
          height: 240,
          right: 320,
          bottom: 240,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLCanvasElement;
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const controller = createChartInteractionController(createScene().frame);

    chart.attachPointerEvents(canvas, controller);
    expect(addEventListener).toHaveBeenCalledTimes(9);
    chart.cancelDrawingCreation();
    chart.destroy();

    expect(removeEventListener).toHaveBeenCalledTimes(9);
    expect(listeners.size).toBe(0);
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

  it('selects drawings within an area through a chart-owned command', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createSceneWithCandles(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const drawings = [
      {
        id: 'area-selection-first',
        type: 'trend-line' as const,
        start: { timestamp: 1_000, price: 2 },
        end: { timestamp: 2_000, price: 3 },
        color: '#ffffff',
      },
      {
        id: 'area-selection-second',
        type: 'trend-line' as const,
        start: { timestamp: 1_000, price: 4 },
        end: { timestamp: 2_000, price: 5 },
        color: '#ffffff',
      },
    ];
    chart.execute({ type: 'set-drawings', drawings });

    chart.execute({
      type: 'select-drawings-within-area',
      area: { start: { x: 0, y: 0 }, end: { x: 320, y: 240 } },
    });
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual([
      'area-selection-first',
      'area-selection-second',
    ]);

    chart.execute({ type: 'set-drawings-visible', visible: false });
    chart.execute({
      type: 'select-drawings-within-area',
      area: { start: { x: 0, y: 0 }, end: { x: 320, y: 240 } },
    });
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual([]);
    expect(chart.exportSnapshot().scene.selectedDrawingId).toBeNull();
    chart.destroy();
  });

  it('nudges selected drawings in chart-owned state, respecting locks and line orientation', () => {
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
    const drawings = [
      {
        id: 'nudge-free',
        type: 'trend-line' as const,
        start: { timestamp: 1, price: 2 },
        end: { timestamp: 2, price: 3 },
        color: '#ffffff',
      },
      {
        id: 'nudge-locked',
        type: 'trend-line' as const,
        start: { timestamp: 1, price: 4 },
        end: { timestamp: 2, price: 5 },
        color: '#ffffff',
        locked: true,
      },
      {
        id: 'nudge-horizontal',
        type: 'horizontal-line' as const,
        start: { timestamp: 1, price: 6 },
        end: null,
        color: '#ffffff',
      },
    ];
    chart.execute({ type: 'set-drawings', drawings });
    chart.execute({
      type: 'nudge-drawings',
      drawingIds: drawings.map((drawing) => drawing.id),
      logicalDelta: 1,
      priceDelta: 1,
    });
    const moved = chart.exportSnapshot().scene.drawings;
    expect(moved[0]?.start.price).toBe(3);
    expect(moved[1]?.start.price).toBe(4);
    expect(moved[2]?.start.price).toBe(6);
    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings[0]?.start.price).toBe(2);
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

  it('commits single and grouped drawing edits inside chart-owned canonical state', () => {
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
    const drawings = [
      {
        id: 'drawing-single',
        type: 'trend-line' as const,
        start: { timestamp: 1, price: 2 },
        end: { timestamp: 2, price: 3 },
        color: '#ffffff',
      },
      {
        id: 'drawing-group',
        type: 'trend-line' as const,
        start: { timestamp: 1, price: 4 },
        end: { timestamp: 2, price: 5 },
        color: '#ffffff',
      },
    ];
    chart.execute({ type: 'set-drawings', drawings });
    chart.execute({ type: 'set-drawing-selection', drawingIds: ['drawing-single'] });

    chart.execute({
      type: 'set-drawing-edit-preview',
      gesture: {
        kind: 'single',
        drawingId: 'drawing-single',
        target: 'end',
        origin: { logicalIndex: 1, price: 3 },
        current: { logicalIndex: 1, price: 4 },
      },
    });
    chart.execute({
      type: 'commit-drawing-edit',
      gesture: {
        kind: 'single',
        drawingId: 'drawing-single',
        target: 'end',
        origin: { logicalIndex: 1, price: 3 },
        current: { logicalIndex: 1, price: 4 },
      },
    });
    expect(chart.exportSnapshot().scene.drawings[0]?.end?.price).toBe(4);
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual(['drawing-single']);

    chart.execute({
      type: 'commit-drawing-edit',
      gesture: {
        kind: 'group',
        drawingIds: ['drawing-single', 'drawing-group'],
        origin: { logicalIndex: 0, price: 2 },
        current: { logicalIndex: 0, price: 3 },
      },
    });
    const committed = chart.exportSnapshot().scene.drawings;
    expect(committed[0]?.start.price).toBe(3);
    expect(committed[1]?.start.price).toBe(5);

    chart.execute({ type: 'undo-drawings' });
    const undone = chart.exportSnapshot().scene.drawings;
    expect(undone[0]?.start.price).toBe(2);
    expect(undone[1]?.start.price).toBe(4);
    chart.execute({ type: 'redo-drawings' });
    const redone = chart.exportSnapshot().scene.drawings;
    expect(redone[0]?.start.price).toBe(3);
    expect(redone[1]?.start.price).toBe(5);
    chart.destroy();
  });

  it('owns drawing undo and redo history and clears redo after a new edit', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const historyEvents: { undoCount: number; redoCount: number }[] = [];
    const drawing = {
      id: 'history-drawing',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };
    chart.subscribe((event) => {
      if (event.type === 'history-state-changed') {
        historyEvents.push({ undoCount: event.undoCount, redoCount: event.redoCount });
      }
    });

    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    expect(historyEvents.at(-1)).toEqual({ undoCount: 1, redoCount: 0 });
    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings).toEqual([]);
    expect(historyEvents.at(-1)).toEqual({ undoCount: 0, redoCount: 1 });

    chart.execute({ type: 'redo-drawings' });
    expect(chart.exportSnapshot().scene.drawings).toHaveLength(1);
    expect(historyEvents.at(-1)).toEqual({ undoCount: 1, redoCount: 0 });

    chart.execute({ type: 'undo-drawings' });
    chart.execute({ type: 'set-drawings', drawings: [{ ...drawing, color: '#ff0000' }] });
    expect(historyEvents.at(-1)).toEqual({ undoCount: 1, redoCount: 0 });
    chart.execute({ type: 'redo-drawings' });
    expect(chart.exportSnapshot().scene.drawings[0]?.color).toBe('#ff0000');

    chart.execute({ type: 'clear-drawing-history' });
    expect(historyEvents.at(-1)).toEqual({ undoCount: 0, redoCount: 0 });
    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings[0]?.color).toBe('#ff0000');
    chart.destroy();
  });

  it('reconciles hovered drawings when undo and redo restore a different collection', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const firstDrawing = {
      id: 'history-hover-first',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };
    const secondDrawing = { ...firstDrawing, id: 'history-hover-second' };

    chart.execute({ type: 'set-drawings', drawings: [firstDrawing] });
    chart.execute({
      type: 'set-drawing-hover',
      hit: { drawingId: firstDrawing.id, target: 'start' },
    });
    chart.execute({ type: 'set-drawings', drawings: [secondDrawing] });
    chart.execute({
      type: 'set-drawing-hover',
      hit: { drawingId: secondDrawing.id, target: 'end' },
    });

    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings[0]?.id).toBe(firstDrawing.id);
    expect(chart.exportSnapshot().scene.hoveredDrawingHit).toBeNull();

    chart.execute({
      type: 'set-drawing-hover',
      hit: { drawingId: firstDrawing.id, target: 'start' },
    });
    chart.execute({ type: 'redo-drawings' });
    expect(chart.exportSnapshot().scene.drawings[0]?.id).toBe(secondDrawing.id);
    expect(chart.exportSnapshot().scene.hoveredDrawingHit).toBeNull();
    chart.destroy();
  });

  it('clears transient previews and drawing history when importing a snapshot', () => {
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
      id: 'snapshot-history-drawing',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };
    const historyEvents: { undoCount: number; redoCount: number }[] = [];
    chart.subscribe((event) => {
      if (event.type === 'history-state-changed') {
        historyEvents.push({ undoCount: event.undoCount, redoCount: event.redoCount });
      }
    });

    chart.execute({ type: 'set-drawings', drawings: [drawing] });
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
    const snapshot = chart.exportSnapshot();
    chart.importSnapshot(snapshot);

    expect(historyEvents.at(-1)).toEqual({ undoCount: 0, redoCount: 0 });
    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings).toHaveLength(1);
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

  it('keeps drawing creation previews transient and outside snapshots', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const preview = {
      id: 'chart-drawing-creation-preview',
      type: 'rectangle' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };

    chart.execute({ type: 'set-drawing-creation-preview', drawing: preview });
    expect(chart.exportSnapshot().scene.drawings).toHaveLength(0);
    expect(chart.exportSnapshot().objectOrder.some((item) => item.id === preview.id)).toBe(false);

    chart.execute({ type: 'set-drawing-creation-preview', drawing: null });
    expect(chart.exportSnapshot().scene.drawings).toHaveLength(0);
    chart.destroy();
  });

  it('emits context-menu requests with chart-owned drawing hit results', () => {
    const { surface } = createSurface();
    const frame = createChartFrame(320, 240, { min: 0, max: 10 }, 1);
    const candles = [
      { timestamp: 1_000, open: 2, high: 4, low: 1, close: 3, volume: 10, logicalIndex: 0 },
      { timestamp: 2_000, open: 3, high: 5, low: 2, close: 4, volume: 12, logicalIndex: 1 },
    ];
    const chart = createChart({
      surface,
      initialScene: createChartRenderScene(frame, candles),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    chart.execute({
      type: 'set-drawings',
      drawings: [
        {
          id: 'context-menu-drawing',
          type: 'horizontal-line',
          start: { timestamp: 1_000, price: 3 },
          end: null,
          color: '#ffffff',
        },
      ],
    });
    const listener = vi.fn();
    chart.subscribe(listener);
    const point = {
      x: frame.layout.plotArea.x + logicalIndexToCoordinate(0, frame.timeScale),
      y: frame.layout.plotArea.y + priceToCoordinate(3, frame.priceScale),
    };

    chart.execute({ type: 'request-context-menu', point });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'context-menu-requested',
        request: expect.objectContaining({
          point,
          drawingHit: { drawingId: 'context-menu-drawing', target: 'start' },
        }),
      }),
    );
    chart.destroy();
  });

  it('keeps drawing selection previews transient and outside snapshots', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });

    chart.execute({
      type: 'set-drawing-selection-preview',
      preview: {
        start: { x: 24, y: 36 },
        current: { x: 180, y: 140 },
      },
    });
    expect(chart.exportSnapshot().scene.drawingSelectionPreview).toBeNull();

    chart.execute({ type: 'set-drawing-selection-preview', preview: null });
    expect(chart.exportSnapshot().scene.drawingSelectionPreview).toBeNull();
    chart.destroy();
  });

  it('creates drawings from logical gestures inside the chart engine', () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440000'),
    });
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createSceneWithCandles(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });

    chart.execute({
      type: 'preview-drawing-creation',
      gesture: {
        type: 'trend-line',
        start: { logicalIndex: 0, price: 2 },
        end: { logicalIndex: 1, price: 4 },
      },
      style: { color: '#60a5fa', lineWidth: 2, lineStyle: 'dashed' },
    });
    expect(chart.exportSnapshot().scene.drawings).toHaveLength(0);

    chart.execute({
      type: 'create-drawing',
      gesture: {
        type: 'trend-line',
        start: { logicalIndex: 0, price: 2 },
        end: { logicalIndex: 1, price: 4 },
      },
      style: { color: '#60a5fa', lineWidth: 2, lineStyle: 'dashed' },
    });

    const [drawing] = chart.exportSnapshot().scene.drawings;
    expect(drawing).toMatchObject({
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'trend-line',
      start: { timestamp: 1_000, price: 2 },
      end: { timestamp: 2_000, price: 4 },
      color: '#60a5fa',
      lineWidth: 2,
      lineStyle: 'dashed',
    });
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual([drawing?.id]);
    expect(crypto.randomUUID).toHaveBeenCalledOnce();

    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings).toHaveLength(0);
    chart.destroy();
    vi.unstubAllGlobals();
  });

  it('creates and deletes drawings through chart-owned commands with undo and redo', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const drawing = {
      id: 'chart-created-drawing',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };

    chart.execute({ type: 'add-drawing', drawing });
    expect(chart.exportSnapshot().scene.drawings).toMatchObject([drawing]);
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toEqual([drawing.id]);
    expect(() => chart.execute({ type: 'add-drawing', drawing })).toThrow(
      'A drawing with this id already exists.',
    );

    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings).toHaveLength(0);
    chart.execute({ type: 'redo-drawings' });
    expect(chart.exportSnapshot().scene.drawings).toMatchObject([drawing]);

    chart.execute({ type: 'delete-drawings', drawingIds: [drawing.id] });
    expect(chart.exportSnapshot().scene.drawings).toHaveLength(0);
    expect(chart.exportSnapshot().scene.selectedDrawingIds).toHaveLength(0);
    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings).toMatchObject([drawing]);
    chart.destroy();
  });

  it('owns drawing property and anchor updates with one undoable history entry', () => {
    const { surface } = createSurface();
    const chart = createChart({
      surface,
      initialScene: createScene(),
      renderer: { scheduler: { requestFrame: () => 1, cancelFrame: () => {} } },
    });
    const drawing = {
      id: 'drawing-property-update',
      type: 'trend-line' as const,
      start: { timestamp: 1, price: 2 },
      end: { timestamp: 2, price: 3 },
      color: '#ffffff',
    };
    const listener = vi.fn();
    chart.subscribe(listener);
    chart.execute({ type: 'set-drawings', drawings: [drawing] });
    chart.execute({
      type: 'update-drawing-properties',
      drawingIds: [drawing.id],
      updates: { color: '#ff0000', lineWidth: 2.5, locked: true },
    });
    expect(chart.exportSnapshot().scene.drawings[0]).toMatchObject({
      color: '#ff0000',
      lineWidth: 2.5,
      locked: true,
    });
    chart.execute({
      type: 'update-drawing-anchor',
      drawingId: drawing.id,
      target: 'end',
      updates: { timestamp: 3, price: 4 },
    });
    expect(chart.exportSnapshot().scene.drawings[0]?.end).toEqual({ timestamp: 3, price: 4 });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'drawing-state-changed' }),
    );
    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings[0]?.end).toEqual({ timestamp: 2, price: 3 });
    chart.execute({ type: 'undo-drawings' });
    expect(chart.exportSnapshot().scene.drawings[0]).toMatchObject({
      color: '#ffffff',
      lineWidth: 1.5,
      locked: false,
    });
    expect(() =>
      chart.execute({
        type: 'update-drawing-anchor',
        drawingId: drawing.id,
        target: 'start',
        updates: { price: Number.NaN },
      }),
    ).toThrow('Drawing anchor coordinates must be finite');
    chart.destroy();
  });
});
