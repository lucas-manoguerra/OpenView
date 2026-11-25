import { describe, expect, it, vi } from 'vitest';
import {
  chartCoordinateToDataPoint,
  createChartFrame,
  dataPointToChartCoordinate,
} from './src/chart-frame';
import { createChartInteractionController } from './src/chart-interaction';
import type { ChartRenderCandle, ChartRenderDrawing } from './src/canvas-painter';
import {
  attachCanvasPointerEvents,
  type CanvasDrawingGesture,
  type CanvasDrawingGroupEditGesture,
} from './src/canvas-pointer-adapter';

type Listener = EventListenerOrEventListenerObject;

const createCanvasTarget = (): Readonly<{
  canvas: HTMLCanvasElement;
  dispatch: (type: string, event: Event) => void;
  listenerCount: () => number;
  capturedPointers: Set<number>;
}> => {
  const listeners = new Map<string, Set<Listener>>();
  const capturedPointers = new Set<number>();
  const canvas = {
    addEventListener: (type: string, listener: Listener) => {
      const registered = listeners.get(type) ?? new Set<Listener>();
      registered.add(listener);
      listeners.set(type, registered);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    getBoundingClientRect: () =>
      ({
        left: 100,
        top: 50,
        width: 900,
        height: 500,
        right: 1000,
        bottom: 550,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect,
    setPointerCapture: (pointerId: number) => capturedPointers.add(pointerId),
    hasPointerCapture: (pointerId: number) => capturedPointers.has(pointerId),
    releasePointerCapture: (pointerId: number) => capturedPointers.delete(pointerId),
  } as unknown as HTMLCanvasElement;

  const dispatch = (type: string, event: Event): void => {
    for (const listener of listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener.call(canvas, event);
      } else {
        listener.handleEvent(event);
      }
    }
  };

  const listenerCount = (): number =>
    [...listeners.values()].reduce((total, registered) => total + registered.size, 0);

  return { canvas, dispatch, listenerCount, capturedPointers };
};

const createPointerEvent = (values: Partial<PointerEvent> = {}): PointerEvent =>
  ({
    clientX: 500,
    clientY: 250,
    button: 0,
    pointerId: 7,
    preventDefault: vi.fn(),
    ...values,
  }) as PointerEvent;

const createDoubleClickEvent = (values: Partial<MouseEvent> = {}): MouseEvent =>
  ({
    clientX: 980,
    clientY: 250,
    preventDefault: vi.fn(),
    ...values,
  }) as MouseEvent;

const createWheelEvent = (values: Partial<WheelEvent> = {}): WheelEvent =>
  ({
    clientX: 500,
    clientY: 250,
    deltaX: 0,
    deltaY: -100,
    preventDefault: vi.fn(),
    ...values,
  }) as WheelEvent;

describe('canvas pointer event adapter', () => {
  it('translates client coordinates into canvas logical pixels', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );

    attachCanvasPointerEvents(canvas, controller);
    dispatch('pointermove', createPointerEvent({ clientX: 420, clientY: 170 }));

    expect(controller.snapshot.crosshair).toEqual({ x: 320, y: 120 });
  });

  it('registers and removes the double click listener with the rest of the adapter', () => {
    const { canvas, listenerCount } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    const adapter = attachCanvasPointerEvents(canvas, controller);

    expect(listenerCount()).toBe(8);

    adapter.destroy();

    expect(listenerCount()).toBe(0);
  });

  it('captures the primary pointer while dragging the plot', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    attachCanvasPointerEvents(canvas, controller);
    const event = createPointerEvent({ clientX: 500, clientY: 250 });

    dispatch('pointerdown', event);

    expect(controller.snapshot.dragging).toBe(true);
    expect(capturedPointers.has(7)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('creates a time-and-price anchored trend line without panning the chart', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    const gestures: CanvasDrawingGesture[] = [];
    attachCanvasPointerEvents(canvas, controller, {
      getDrawingTool: () => 'trend-line',
      onDrawingComplete: (drawing) => gestures.push(drawing),
    });
    const start = {
      x: frame.layout.plotArea.x + 40,
      y: frame.layout.plotArea.y + 60,
    };
    const end = {
      x: frame.layout.plotArea.x + 180,
      y: frame.layout.plotArea.y + 120,
    };

    dispatch('pointerdown', createPointerEvent({ clientX: 100 + start.x, clientY: 50 + start.y }));
    dispatch('pointermove', createPointerEvent({ clientX: 100 + end.x, clientY: 50 + end.y }));
    dispatch('pointerup', createPointerEvent({ clientX: 100 + end.x, clientY: 50 + end.y }));

    expect(gestures).toHaveLength(1);
    expect(gestures[0]).toEqual({
      type: 'trend-line',
      start: chartCoordinateToDataPoint(start, frame),
      end: chartCoordinateToDataPoint(end, frame),
    });
    expect(controller.snapshot.frame.timeScale.rightOffset).toBe(frame.timeScale.rightOffset);
    expect(capturedPointers.has(7)).toBe(false);
  });

  it('creates a horizontal line on click without requiring a drag', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    const gestures: CanvasDrawingGesture[] = [];
    attachCanvasPointerEvents(canvas, controller, {
      getDrawingTool: () => 'horizontal-line',
      onDrawingComplete: (drawing) => gestures.push(drawing),
    });
    const point = {
      x: frame.layout.plotArea.x + 140,
      y: frame.layout.plotArea.y + 80,
    };

    dispatch('pointerdown', createPointerEvent({ clientX: 100 + point.x, clientY: 50 + point.y }));
    dispatch('pointerup', createPointerEvent({ clientX: 100 + point.x, clientY: 50 + point.y }));

    expect(gestures).toEqual([
      {
        type: 'horizontal-line',
        start: chartCoordinateToDataPoint(point, frame),
        end: null,
      },
    ]);
    expect(controller.snapshot.dragging).toBe(false);
  });

  it('creates a ray gesture with two anchored points', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    const gestures: CanvasDrawingGesture[] = [];
    attachCanvasPointerEvents(canvas, controller, {
      getDrawingTool: () => 'ray',
      onDrawingComplete: (drawing) => gestures.push(drawing),
    });
    const start = { x: frame.layout.plotArea.x + 30, y: frame.layout.plotArea.y + 40 };
    const end = { x: frame.layout.plotArea.x + 130, y: frame.layout.plotArea.y + 90 };

    dispatch('pointerdown', createPointerEvent({ clientX: 100 + start.x, clientY: 50 + start.y }));
    dispatch('pointerup', createPointerEvent({ clientX: 100 + end.x, clientY: 50 + end.y }));

    expect(gestures).toEqual([
      {
        type: 'ray',
        start: chartCoordinateToDataPoint(start, frame),
        end: chartCoordinateToDataPoint(end, frame),
      },
    ]);
  });

  it('creates vertical lines on a single click', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    const gestures: CanvasDrawingGesture[] = [];
    attachCanvasPointerEvents(canvas, controller, {
      getDrawingTool: () => 'vertical-line',
      onDrawingComplete: (drawing) => gestures.push(drawing),
    });
    const point = { x: frame.layout.plotArea.x + 130, y: frame.layout.plotArea.y + 75 };

    dispatch('pointerdown', createPointerEvent({ clientX: 100 + point.x, clientY: 50 + point.y }));
    dispatch('pointerup', createPointerEvent({ clientX: 100 + point.x, clientY: 50 + point.y }));

    expect(gestures).toEqual([
      {
        type: 'vertical-line',
        start: chartCoordinateToDataPoint(point, frame),
        end: null,
      },
    ]);
  });

  it('creates rectangle gestures with opposite corners', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    const gestures: CanvasDrawingGesture[] = [];
    attachCanvasPointerEvents(canvas, controller, {
      getDrawingTool: () => 'rectangle',
      onDrawingComplete: (drawing) => gestures.push(drawing),
    });
    const start = { x: frame.layout.plotArea.x + 70, y: frame.layout.plotArea.y + 55 };
    const end = { x: frame.layout.plotArea.x + 190, y: frame.layout.plotArea.y + 155 };

    dispatch('pointerdown', createPointerEvent({ clientX: 100 + start.x, clientY: 50 + start.y }));
    dispatch('pointerup', createPointerEvent({ clientX: 100 + end.x, clientY: 50 + end.y }));

    expect(gestures).toEqual([
      {
        type: 'rectangle',
        start: chartCoordinateToDataPoint(start, frame),
        end: chartCoordinateToDataPoint(end, frame),
      },
    ]);
  });

  it('does not create a drawing when its pointer gesture is cancelled', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    const gestures: CanvasDrawingGesture[] = [];
    attachCanvasPointerEvents(canvas, controller, {
      getDrawingTool: () => 'trend-line',
      onDrawingComplete: (drawing) => gestures.push(drawing),
    });

    dispatch('pointerdown', createPointerEvent());
    dispatch('pointercancel', createPointerEvent());

    expect(gestures).toEqual([]);
    expect(capturedPointers.has(7)).toBe(false);
    expect(controller.snapshot.dragging).toBe(false);
  });

  it('selects a drawing and reports a moved control point', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 2);
    const controller = createChartInteractionController(frame);
    const candles: readonly ChartRenderCandle[] = [
      {
        logicalIndex: 0,
        timestamp: 1_700_000_000_000,
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        volume: 10,
      },
      {
        logicalIndex: 1,
        timestamp: 1_700_000_060_000,
        open: 105,
        high: 112,
        low: 100,
        close: 108,
        volume: 20,
      },
      {
        logicalIndex: 2,
        timestamp: 1_700_000_120_000,
        open: 108,
        high: 114,
        low: 105,
        close: 110,
        volume: 30,
      },
    ];
    const drawing: ChartRenderDrawing = {
      id: 'trend-1',
      type: 'trend-line',
      start: { timestamp: candles[0]?.timestamp ?? 0, price: 100 },
      end: { timestamp: candles[2]?.timestamp ?? 0, price: 110 },
      color: '#60a5fa',
    };
    const selections: (string | null)[] = [];
    const edits: { drawingId: string; target: string; origin: unknown; current: unknown }[] = [];
    attachCanvasPointerEvents(canvas, controller, {
      getDrawingTool: () => 'select',
      getDrawings: () => [drawing],
      getCandles: () => candles,
      onDrawingSelect: (drawingId) => selections.push(drawingId),
      onDrawingEdit: (gesture) => edits.push(gesture),
    });
    const start = dataPointToChartCoordinate({ logicalIndex: 0, price: 100 }, frame);
    const moved = dataPointToChartCoordinate({ logicalIndex: 0.5, price: 103 }, frame);

    dispatch('pointerdown', createPointerEvent({ clientX: 100 + start.x, clientY: 50 + start.y }));
    dispatch('pointerup', createPointerEvent({ clientX: 100 + moved.x, clientY: 50 + moved.y }));

    expect(selections).toEqual(['trend-1']);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({
      drawingId: 'trend-1',
      target: 'start',
      origin: chartCoordinateToDataPoint(start, frame),
      current: chartCoordinateToDataPoint(moved, frame),
    });
    expect(capturedPointers.has(7)).toBe(false);
  });

  it('selects a drawing without creating an edit when the pointer does not move', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 2);
    const controller = createChartInteractionController(frame);
    const candles: readonly ChartRenderCandle[] = [
      {
        logicalIndex: 0,
        timestamp: 1_700_000_000_000,
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        volume: 10,
      },
      {
        logicalIndex: 1,
        timestamp: 1_700_000_060_000,
        open: 105,
        high: 112,
        low: 100,
        close: 108,
        volume: 20,
      },
      {
        logicalIndex: 2,
        timestamp: 1_700_000_120_000,
        open: 108,
        high: 114,
        low: 105,
        close: 110,
        volume: 30,
      },
    ];
    const drawing: ChartRenderDrawing = {
      id: 'trend-1',
      type: 'trend-line',
      start: { timestamp: candles[0]?.timestamp ?? 0, price: 100 },
      end: { timestamp: candles[2]?.timestamp ?? 0, price: 110 },
      color: '#60a5fa',
    };
    const edits: unknown[] = [];
    attachCanvasPointerEvents(canvas, controller, {
      getDrawingTool: () => 'select',
      getDrawings: () => [drawing],
      getCandles: () => candles,
      onDrawingEdit: (gesture) => edits.push(gesture),
    });
    const start = dataPointToChartCoordinate({ logicalIndex: 0, price: 100 }, frame);
    const event = createPointerEvent({
      clientX: 100 + start.x,
      clientY: 50 + start.y,
    });

    dispatch('pointerdown', event);
    dispatch('pointerup', event);

    expect(edits).toEqual([]);
  });

  it('toggles drawing selection with Shift and moves selected drawings as a group', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 2);
    const controller = createChartInteractionController(frame);
    const candles: readonly ChartRenderCandle[] = [
      {
        logicalIndex: 0,
        timestamp: 1_700_000_000_000,
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        volume: 10,
      },
      {
        logicalIndex: 1,
        timestamp: 1_700_000_060_000,
        open: 105,
        high: 112,
        low: 100,
        close: 108,
        volume: 20,
      },
      {
        logicalIndex: 2,
        timestamp: 1_700_000_120_000,
        open: 108,
        high: 120,
        low: 105,
        close: 118,
        volume: 30,
      },
    ];
    const drawings: readonly ChartRenderDrawing[] = [
      {
        id: 'trend-1',
        type: 'trend-line',
        start: { timestamp: candles[0]!.timestamp, price: 100 },
        end: { timestamp: candles[2]!.timestamp, price: 108 },
        color: '#60a5fa',
      },
      {
        id: 'trend-2',
        type: 'trend-line',
        start: { timestamp: candles[0]!.timestamp, price: 110 },
        end: { timestamp: candles[2]!.timestamp, price: 118 },
        color: '#f4c542',
      },
    ];
    let selectedIds: readonly string[] = [];
    const selections: string[][] = [];
    const groupEdits: CanvasDrawingGroupEditGesture[] = [];
    const deletedGroups: readonly string[][] = [];
    const mutableDeletedGroups = deletedGroups as string[][];
    attachCanvasPointerEvents(canvas, controller, {
      getDrawingTool: () => 'select',
      getDrawings: () => drawings,
      getCandles: () => candles,
      getSelectedDrawingIds: () => selectedIds,
      onDrawingSelectionChange: (ids) => {
        selectedIds = ids;
        selections.push([...ids]);
      },
      onDrawingGroupEdit: (gesture) => groupEdits.push(gesture),
      onDrawingDeleteMany: (drawingIds) => mutableDeletedGroups.push([...drawingIds]),
    });

    const firstBody = dataPointToChartCoordinate({ logicalIndex: 1, price: 104 }, frame);
    const secondBody = dataPointToChartCoordinate({ logicalIndex: 1, price: 114 }, frame);
    const pointerEvent = (
      point: Readonly<{ x: number; y: number }>,
      values: Partial<PointerEvent> = {},
    ) =>
      createPointerEvent({
        clientX: 100 + point.x,
        clientY: 50 + point.y,
        ...values,
      });

    dispatch('pointerdown', pointerEvent(firstBody));
    dispatch('pointerup', pointerEvent(firstBody));
    expect(selectedIds).toEqual(['trend-1']);

    dispatch('pointerdown', pointerEvent(secondBody, { shiftKey: true }));
    dispatch('pointerup', pointerEvent(secondBody, { shiftKey: true }));
    expect(selectedIds).toEqual(['trend-1', 'trend-2']);

    dispatch('pointerdown', pointerEvent(secondBody, { shiftKey: true }));
    dispatch('pointerup', pointerEvent(secondBody, { shiftKey: true }));
    expect(selectedIds).toEqual(['trend-1']);

    dispatch('pointerdown', pointerEvent(secondBody, { shiftKey: true }));
    dispatch('pointerup', pointerEvent(secondBody, { shiftKey: true }));
    expect(selectedIds).toEqual(['trend-1', 'trend-2']);

    const movedBody = { x: firstBody.x + 35, y: firstBody.y - 18 };
    dispatch('pointerdown', pointerEvent(firstBody));
    dispatch('pointerup', pointerEvent(movedBody));

    expect(groupEdits).toHaveLength(1);
    expect(groupEdits[0]?.drawingIds).toEqual(['trend-1', 'trend-2']);
    expect(groupEdits[0]?.current).toEqual(chartCoordinateToDataPoint(movedBody, frame));
    expect(capturedPointers.has(7)).toBe(false);
    expect(selections).toEqual([
      ['trend-1'],
      ['trend-1', 'trend-2'],
      ['trend-1'],
      ['trend-1', 'trend-2'],
      ['trend-1', 'trend-2'],
    ]);

    dispatch('keydown', { key: 'Delete', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(deletedGroups).toEqual([['trend-1', 'trend-2']]);
  });

  it('deletes the selected drawing on Delete and deselects on Escape', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const deleted: string[] = [];
    const selections: (string | null)[] = [];
    let selectedId: string | null = 'trend-1';
    attachCanvasPointerEvents(
      canvas,
      createChartInteractionController(createChartFrame(900, 500, { min: 90, max: 120 }, 2)),
      {
        getSelectedDrawingId: () => selectedId,
        onDrawingDelete: (drawingId) => deleted.push(drawingId),
        onDrawingSelect: (drawingId) => {
          selections.push(drawingId);
          selectedId = drawingId;
        },
      },
    );

    dispatch('keydown', { key: 'Delete', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    dispatch('keydown', { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent);

    expect(deleted).toEqual(['trend-1']);
    expect(selections).toEqual([null]);
  });

  it('pans during captured pointer movement and releases capture on pointer up', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    attachCanvasPointerEvents(canvas, controller);

    dispatch('pointerdown', createPointerEvent({ clientX: 500, clientY: 250 }));
    dispatch('pointermove', createPointerEvent({ clientX: 540, clientY: 250 }));
    dispatch('pointerup', createPointerEvent({ clientX: 540, clientY: 250 }));

    expect(controller.snapshot.frame.timeScale.rightOffset).toBe(-5);
    expect(controller.snapshot.dragging).toBe(false);
    expect(capturedPointers.has(7)).toBe(false);
  });

  it('cancels the drag and releases capture when the pointer is cancelled', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    attachCanvasPointerEvents(canvas, controller);

    dispatch('pointerdown', createPointerEvent());
    dispatch('pointercancel', createPointerEvent());

    expect(controller.snapshot.dragging).toBe(false);
    expect(controller.snapshot.crosshair).toBeNull();
    expect(capturedPointers.has(7)).toBe(false);
  });

  it('pans the price scale when dragging the price axis', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    attachCanvasPointerEvents(canvas, controller);

    dispatch('pointerdown', createPointerEvent({ clientX: 980, clientY: 250 }));
    dispatch('pointermove', createPointerEvent({ clientX: 980, clientY: 290 }));
    dispatch('pointerup', createPointerEvent({ clientX: 980, clientY: 290 }));

    expect(controller.snapshot.frame.priceScale.range).not.toEqual(frame.priceScale.range);
    expect(controller.snapshot.dragging).toBe(false);
    expect(capturedPointers.has(7)).toBe(false);
  });

  it('zooms the price scale when the wheel is over the right price axis', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    attachCanvasPointerEvents(canvas, controller);
    const event = createWheelEvent({ clientX: 980, clientY: 250 });

    dispatch('wheel', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(
      controller.snapshot.frame.priceScale.range.max -
        controller.snapshot.frame.priceScale.range.min,
    ).toBeLessThan(frame.priceScale.range.max - frame.priceScale.range.min);
    expect(controller.snapshot.frame.timeScale.barSpacing).toBe(frame.timeScale.barSpacing);
  });

  it('auto-fits the visible price range on a double click of the price axis', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    const event = createDoubleClickEvent();
    attachCanvasPointerEvents(canvas, controller, {
      getAutoScalePriceRange: () => ({ min: 96, max: 104 }),
    });

    dispatch('dblclick', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(controller.snapshot.frame.priceScale.range).toEqual({ min: 96, max: 104 });
  });

  it('does not auto-fit when a double click occurs outside the price axis', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99);
    const controller = createChartInteractionController(frame);
    const event = createDoubleClickEvent({ clientX: 500, clientY: 250 });
    attachCanvasPointerEvents(canvas, controller, {
      getAutoScalePriceRange: () => ({ min: 96, max: 104 }),
    });

    dispatch('dblclick', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(controller.snapshot.frame.priceScale.range).toEqual(frame.priceScale.range);
  });

  it('ignores a second pointer while a drag already owns pointer capture', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    attachCanvasPointerEvents(canvas, controller);

    dispatch('pointerdown', createPointerEvent({ pointerId: 7 }));
    dispatch('pointerdown', createPointerEvent({ pointerId: 12 }));
    dispatch('pointermove', createPointerEvent({ pointerId: 12, clientX: 700 }));

    expect(capturedPointers.has(7)).toBe(true);
    expect(capturedPointers.has(12)).toBe(false);
    expect(controller.snapshot.crosshair).toEqual({ x: 400, y: 200 });
  });

  it('prevents default wheel scrolling when the chart handles zoom input', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    attachCanvasPointerEvents(canvas, controller);
    const event = createWheelEvent();

    dispatch('wheel', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(controller.snapshot.frame.timeScale.barSpacing).toBeGreaterThan(8);
  });

  it('does not prevent page scrolling when the wheel is outside the plot', () => {
    const { canvas, dispatch } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    attachCanvasPointerEvents(canvas, controller);
    const event = createWheelEvent({ clientX: 990, clientY: 40 });

    dispatch('wheel', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('removes all listeners and cancels active interactions on destruction', () => {
    const { canvas, dispatch, listenerCount, capturedPointers } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    const adapter = attachCanvasPointerEvents(canvas, controller);

    expect(listenerCount()).toBe(8);

    dispatch('pointerdown', createPointerEvent());
    adapter.destroy();
    adapter.destroy();

    expect(listenerCount()).toBe(0);
    expect(controller.snapshot.dragging).toBe(false);
    expect(controller.snapshot.crosshair).toBeNull();
    expect(capturedPointers.has(7)).toBe(false);
  });

  it('ignores non-primary pointer buttons and releases captures after pointer up', () => {
    const { canvas, dispatch, capturedPointers } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    attachCanvasPointerEvents(canvas, controller);

    dispatch('pointerdown', createPointerEvent({ button: 2 }));

    expect(controller.snapshot.dragging).toBe(false);
    expect(capturedPointers.size).toBe(0);

    dispatch('pointerdown', createPointerEvent({ pointerId: 12 }));
    dispatch('pointerup', createPointerEvent({ pointerId: 12 }));

    expect(capturedPointers.has(12)).toBe(false);
  });
});
