import type { ChartInteractionController } from './chart-interaction';

export type CanvasPointerAdapter = Readonly<{
  destroy(): void;
}>;

const getCanvasPosition = (
  canvas: HTMLCanvasElement,
  event: Pick<PointerEvent | WheelEvent, 'clientX' | 'clientY'>,
): Readonly<{ x: number; y: number }> => {
  const bounds = canvas.getBoundingClientRect();

  return Object.freeze({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  });
};

export const attachCanvasPointerEvents = (
  canvas: HTMLCanvasElement,
  controller: ChartInteractionController,
): CanvasPointerAdapter => {
  let destroyed = false;
  let activePointerId: number | null = null;

  const releaseActivePointer = (): void => {
    if (activePointerId === null) {
      return;
    }

    if (canvas.hasPointerCapture(activePointerId)) {
      canvas.releasePointerCapture(activePointerId);
    }

    activePointerId = null;
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (activePointerId !== null) {
      return;
    }

    const position = getCanvasPosition(canvas, event);

    if (controller.pointerDown(position, event.button)) {
      activePointerId = event.pointerId;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (activePointerId !== null && event.pointerId !== activePointerId) {
      return;
    }

    controller.pointerMove(getCanvasPosition(canvas, event));
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    controller.pointerUp(getCanvasPosition(canvas, event));
    releaseActivePointer();
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    controller.pointerCancel();
    releaseActivePointer();
  };

  const handlePointerLeave = (): void => {
    controller.pointerLeave();
  };

  const handleWheel = (event: WheelEvent): void => {
    const handled = controller.wheel(getCanvasPosition(canvas, event), event.deltaX, event.deltaY);

    if (handled) {
      event.preventDefault();
    }
  };

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerCancel);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  return Object.freeze({
    destroy: (): void => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('wheel', handleWheel);
      releaseActivePointer();
      controller.pointerCancel();
    },
  });
};
