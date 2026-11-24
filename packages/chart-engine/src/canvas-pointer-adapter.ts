import { chartCoordinateToDataPoint, type ChartDataPoint } from './chart-frame';
import { hitTestChartDrawing, type ChartDrawingHit } from './drawing-geometry';
import type { ChartRenderCandle, ChartRenderDrawing } from './canvas-painter';
import type { ChartInteractionController } from './chart-interaction';
import type { NumericRange } from './viewport';

export type CanvasDrawingTool =
  | 'cursor'
  | 'select'
  | 'trend-line'
  | 'ray'
  | 'horizontal-line'
  | 'vertical-line'
  | 'rectangle';

export type CanvasDrawingGesture = Readonly<{
  type: Exclude<CanvasDrawingTool, 'cursor' | 'select'>;
  start: ChartDataPoint;
  end: ChartDataPoint | null;
}>;

export type CanvasDrawingEditGesture = Readonly<{
  drawingId: string;
  target: ChartDrawingHit['target'];
  origin: ChartDataPoint;
  current: ChartDataPoint;
}>;

export type CanvasPointerAdapterOptions = Readonly<{
  getAutoScalePriceRange?: () => NumericRange | null;
  getDrawingTool?: () => CanvasDrawingTool;
  getDrawings?: () => readonly ChartRenderDrawing[];
  getCandles?: () => readonly ChartRenderCandle[];
  getSelectedDrawingId?: () => string | null;
  onDrawingComplete?: (drawing: CanvasDrawingGesture) => void;
  onDrawingSelect?: (drawingId: string | null) => void;
  onDrawingEdit?: (gesture: CanvasDrawingEditGesture) => void;
  onDrawingDelete?: (drawingId: string) => void;
}>;

export type CanvasPointerAdapter = Readonly<{
  destroy(): void;
}>;

const getCanvasPosition = (
  canvas: HTMLCanvasElement,
  event: Pick<PointerEvent | WheelEvent | MouseEvent, 'clientX' | 'clientY'>,
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
  options: CanvasPointerAdapterOptions = {},
): CanvasPointerAdapter => {
  let destroyed = false;
  let activePointerId: number | null = null;
  let activeDrawingTool: Exclude<CanvasDrawingTool, 'cursor'> | null = null;
  let drawingStart: ChartDataPoint | null = null;
  let activeDrawingEdit: CanvasDrawingEditGesture | null = null;

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
    const drawingTool = options.getDrawingTool?.() ?? 'cursor';

    if (event.button !== 0) {
      return;
    }

    if (drawingTool === 'select') {
      const hit = hitTestChartDrawing(
        position,
        options.getDrawings?.() ?? [],
        options.getCandles?.() ?? [],
        controller.snapshot.frame,
      );
      options.onDrawingSelect?.(hit?.drawingId ?? null);

      if (hit !== null) {
        activeDrawingEdit = {
          drawingId: hit.drawingId,
          target: hit.target,
          origin: chartCoordinateToDataPoint(position, controller.snapshot.frame),
          current: chartCoordinateToDataPoint(position, controller.snapshot.frame),
        };
        activePointerId = event.pointerId;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        return;
      }
    }

    if (drawingTool !== 'cursor' && drawingTool !== 'select') {
      const { plotArea } = controller.snapshot.frame.layout;
      const insidePlot =
        position.x >= plotArea.x &&
        position.x <= plotArea.x + plotArea.width &&
        position.y >= plotArea.y &&
        position.y <= plotArea.y + plotArea.height;

      if (!insidePlot) {
        return;
      }

      drawingStart = chartCoordinateToDataPoint(position, controller.snapshot.frame);
      activeDrawingTool = drawingTool;
      activePointerId = event.pointerId;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      return;
    }

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

    if (activeDrawingTool !== null || activeDrawingEdit !== null) {
      return;
    }

    controller.pointerMove(getCanvasPosition(canvas, event));
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    if (activeDrawingEdit !== null) {
      const position = getCanvasPosition(canvas, event);
      const { plotArea } = controller.snapshot.frame.layout;
      const boundedPosition = Object.freeze({
        x: Math.max(plotArea.x, Math.min(plotArea.x + plotArea.width, position.x)),
        y: Math.max(plotArea.y, Math.min(plotArea.y + plotArea.height, position.y)),
      });
      const current = chartCoordinateToDataPoint(boundedPosition, controller.snapshot.frame);

      if (
        current.logicalIndex !== activeDrawingEdit.origin.logicalIndex ||
        current.price !== activeDrawingEdit.origin.price
      ) {
        options.onDrawingEdit?.({
          ...activeDrawingEdit,
          current,
        });
      }
      activeDrawingEdit = null;
      releaseActivePointer();
      return;
    }

    if (activeDrawingTool !== null && drawingStart !== null) {
      const position = getCanvasPosition(canvas, event);
      const { plotArea } = controller.snapshot.frame.layout;
      const boundedPosition = Object.freeze({
        x: Math.max(plotArea.x, Math.min(plotArea.x + plotArea.width, position.x)),
        y: Math.max(plotArea.y, Math.min(plotArea.y + plotArea.height, position.y)),
      });
      const end = chartCoordinateToDataPoint(boundedPosition, controller.snapshot.frame);

      const clickTool =
        activeDrawingTool === 'horizontal-line' || activeDrawingTool === 'vertical-line';
      options.onDrawingComplete?.({
        type: activeDrawingTool,
        start: drawingStart,
        end: clickTool ? null : end,
      });
      drawingStart = null;
      activeDrawingTool = null;
      releaseActivePointer();
      return;
    }

    controller.pointerUp(getCanvasPosition(canvas, event));
    releaseActivePointer();
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    if (activeDrawingEdit !== null) {
      activeDrawingEdit = null;
      releaseActivePointer();
      return;
    }

    if (activeDrawingTool !== null) {
      drawingStart = null;
      activeDrawingTool = null;
      releaseActivePointer();
      return;
    }

    controller.pointerCancel();
    releaseActivePointer();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    const selectedDrawingId = options.getSelectedDrawingId?.() ?? null;

    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDrawingId !== null) {
      options.onDrawingDelete?.(selectedDrawingId);
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape' && selectedDrawingId !== null) {
      options.onDrawingSelect?.(null);
      event.preventDefault();
    }
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

  const handleDoubleClick = (event: MouseEvent): void => {
    const range = options.getAutoScalePriceRange?.();

    if (range === undefined || range === null) {
      return;
    }

    const handled = controller.fitPriceScaleAt(getCanvasPosition(canvas, event), range);

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
  canvas.addEventListener('dblclick', handleDoubleClick);
  canvas.addEventListener('keydown', handleKeyDown);

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
      canvas.removeEventListener('dblclick', handleDoubleClick);
      canvas.removeEventListener('keydown', handleKeyDown);
      drawingStart = null;
      activeDrawingEdit = null;
      activeDrawingTool = null;
      releaseActivePointer();
      controller.pointerCancel();
    },
  });
};
