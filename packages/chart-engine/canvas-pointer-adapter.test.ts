import { describe, expect, it, vi } from 'vitest';
import { createChartFrame } from './src/chart-frame';
import { createChartInteractionController } from './src/chart-interaction';
import { attachCanvasPointerEvents } from './src/canvas-pointer-adapter';

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

const createPointerEvent = (
  values: Partial<PointerEvent> = {},
): PointerEvent =>
  ({
    clientX: 500,
    clientY: 250,
    button: 0,
    pointerId: 7,
    preventDefault: vi.fn(),
    ...values,
  }) as PointerEvent;

const createWheelEvent = (
  values: Partial<WheelEvent> = {},
): WheelEvent =>
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
    const event = createWheelEvent({ clientX: 110, clientY: 60 });

    dispatch('wheel', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('removes all listeners and cancels active interactions on destruction', () => {
    const { canvas, dispatch, listenerCount, capturedPointers } = createCanvasTarget();
    const controller = createChartInteractionController(
      createChartFrame(900, 500, { min: 90, max: 120 }, 99),
    );
    const adapter = attachCanvasPointerEvents(canvas, controller);

    expect(listenerCount()).toBe(6);

    dispatch('pointerdown', createPointerEvent());
    adapter.destroy();
    adapter.destroy();

    expect(listenerCount()).toBe(0);
    expect(controller.snapshot.dragging).toBe(false);
    expect(controller.snapshot.crosshair).toBeNull();
    expect(capturedPointers.has(7)).toBe(true);
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
