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

  const handlePointerDown = (event: PointerEvent): void => {
    const position = getCanvasPosition(canvas, event);

    if (controller.pointerDown(position, event.button)) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: PointerEvent): void => {
    controller.pointerMove(getCanvasPosition(canvas, event));
  };

  const handlePointerUp = (event: PointerEvent): void => {
    controller.pointerUp(getCanvasPosition(canvas, event));

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    controller.pointerCancel();

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerLeave = (): void => {
    controller.pointerLeave();
  };

  const handleWheel = (event: WheelEvent): void => {
    const handled = controller.wheel(
      getCanvasPosition(canvas, event),
      event.deltaX,
      event.deltaY,
    );

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
      controller.pointerCancel();
    },
  });
};
