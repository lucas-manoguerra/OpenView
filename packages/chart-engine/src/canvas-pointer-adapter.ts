import { chartCoordinateToDataPoint, type ChartDataPoint } from './chart-frame';
import { hitTestChartDrawing, type ChartDrawingHit } from './drawing-geometry';
import {
  resolveChartDrawingMagnetMode,
  snapChartDrawingPointToOhlc,
  type ChartDrawingMagnetMode,
} from './drawing-magnet';
import type { ChartIndicatorSeries, ChartRenderCandle, ChartRenderDrawing } from './canvas-painter';
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

export type CanvasDrawingGroupEditGesture = Readonly<{
  drawingIds: readonly string[];
  origin: ChartDataPoint;
  current: ChartDataPoint;
}>;

export type CanvasPointerAdapterOptions = Readonly<{
  getAutoScalePriceRange?: () => NumericRange | null;
  getDrawingTool?: () => CanvasDrawingTool;
  getDrawingMagnetMode?: () => ChartDrawingMagnetMode;
  getSnapToIndicators?: () => boolean;
  getIndicators?: () => readonly ChartIndicatorSeries[];
  getKeepDrawing?: () => boolean;
  getDrawings?: () => readonly ChartRenderDrawing[];
  getCandles?: () => readonly ChartRenderCandle[];
  getSelectedDrawingId?: () => string | null;
  getSelectedDrawingIds?: () => readonly string[];
  onDrawingComplete?: (drawing: CanvasDrawingGesture) => void;
  onDrawingToolExit?: () => void;
  onDrawingSelect?: (drawingId: string | null) => void;
  onDrawingSelectionChange?: (drawingIds: readonly string[]) => void;
  onDrawingEdit?: (gesture: CanvasDrawingEditGesture) => void;
  onDrawingGroupEdit?: (gesture: CanvasDrawingGroupEditGesture) => void;
  onDrawingDelete?: (drawingId: string) => void;
  onDrawingDeleteMany?: (drawingIds: readonly string[]) => void;
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
  let activeDrawingTool: Exclude<CanvasDrawingTool, 'cursor' | 'select'> | null = null;
  let drawingStart: ChartDataPoint | null = null;
  let activeDrawingEdit: CanvasDrawingEditGesture | null = null;
  let activeDrawingGroupEdit: CanvasDrawingGroupEditGesture | null = null;

  const snapDrawingPoint = (point: ChartDataPoint, event: PointerEvent): ChartDataPoint => {
    const configuredMode = options.getDrawingMagnetMode?.() ?? 'off';
    const mode = resolveChartDrawingMagnetMode(configuredMode, event.ctrlKey || event.metaKey);

    return snapChartDrawingPointToOhlc(
      point,
      options.getCandles?.() ?? [],
      controller.snapshot.frame,
      mode,
      undefined,
      options.getIndicators?.() ?? [],
      options.getSnapToIndicators?.() ?? false,
    );
  };

  const getSelectedDrawingIds = (): readonly string[] => {
    const selectedIds = options.getSelectedDrawingIds?.();

    if (selectedIds !== undefined) {
      return selectedIds;
    }

    const selectedId = options.getSelectedDrawingId?.() ?? null;
    return selectedId === null ? [] : [selectedId];
  };

  const emitDrawingSelection = (drawingIds: readonly string[]): void => {
    if (options.onDrawingSelectionChange !== undefined) {
      options.onDrawingSelectionChange(Object.freeze([...drawingIds]));
    } else {
      options.onDrawingSelect?.(drawingIds[drawingIds.length - 1] ?? null);
    }
  };

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
      const selectedIds = getSelectedDrawingIds();

      if (event.shiftKey) {
        if (hit !== null) {
          const nextSelection = selectedIds.includes(hit.drawingId)
            ? selectedIds.filter((drawingId) => drawingId !== hit.drawingId)
            : [...selectedIds, hit.drawingId];
          emitDrawingSelection(nextSelection);
          event.preventDefault();
          return;
        }
      } else if (hit === null) {
        emitDrawingSelection([]);
      } else {
        const nextSelection = selectedIds.includes(hit.drawingId) ? selectedIds : [hit.drawingId];
        emitDrawingSelection(nextSelection);

        const rawOrigin = chartCoordinateToDataPoint(position, controller.snapshot.frame);
        const origin = hit.target === 'body' ? rawOrigin : snapDrawingPoint(rawOrigin, event);

        if (hit.target === 'body' && nextSelection.length > 1) {
          activeDrawingGroupEdit = {
            drawingIds: Object.freeze([...nextSelection]),
            origin,
            current: origin,
          };
        } else {
          activeDrawingEdit = {
            drawingId: hit.drawingId,
            target: hit.target,
            origin,
            current: origin,
          };
        }

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

      drawingStart = snapDrawingPoint(
        chartCoordinateToDataPoint(position, controller.snapshot.frame),
        event,
      );
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

    if (
      activeDrawingTool !== null ||
      activeDrawingEdit !== null ||
      activeDrawingGroupEdit !== null
    ) {
      return;
    }

    controller.pointerMove(getCanvasPosition(canvas, event));
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    if (activeDrawingEdit !== null || activeDrawingGroupEdit !== null) {
      const position = getCanvasPosition(canvas, event);
      const { plotArea } = controller.snapshot.frame.layout;
      const boundedPosition = Object.freeze({
        x: Math.max(plotArea.x, Math.min(plotArea.x + plotArea.width, position.x)),
        y: Math.max(plotArea.y, Math.min(plotArea.y + plotArea.height, position.y)),
      });
      const rawCurrent = chartCoordinateToDataPoint(boundedPosition, controller.snapshot.frame);
      const current =
        activeDrawingEdit?.target === 'start' || activeDrawingEdit?.target === 'end'
          ? snapDrawingPoint(rawCurrent, event)
          : rawCurrent;
      const origin = activeDrawingEdit?.origin ?? activeDrawingGroupEdit?.origin;

      if (
        origin !== undefined &&
        (current.logicalIndex !== origin.logicalIndex || current.price !== origin.price)
      ) {
        if (activeDrawingGroupEdit !== null) {
          options.onDrawingGroupEdit?.({
            ...activeDrawingGroupEdit,
            current,
          });
        } else if (activeDrawingEdit !== null) {
          options.onDrawingEdit?.({
            ...activeDrawingEdit,
            current,
          });
        }
      }
      activeDrawingEdit = null;
      activeDrawingGroupEdit = null;
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
      const end = snapDrawingPoint(
        chartCoordinateToDataPoint(boundedPosition, controller.snapshot.frame),
        event,
      );

      const clickTool =
        activeDrawingTool === 'horizontal-line' || activeDrawingTool === 'vertical-line';
      options.onDrawingComplete?.({
        type: activeDrawingTool,
        start: drawingStart,
        end: clickTool ? null : end,
      });
      if (!(options.getKeepDrawing?.() ?? false)) {
        options.onDrawingToolExit?.();
      }
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

    if (activeDrawingEdit !== null || activeDrawingGroupEdit !== null) {
      activeDrawingEdit = null;
      activeDrawingGroupEdit = null;
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
    const selectedIds = getSelectedDrawingIds();

    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
      if (options.onDrawingDeleteMany !== undefined) {
        options.onDrawingDeleteMany(selectedIds);
      } else {
        const selectedId = selectedIds[selectedIds.length - 1];
        if (selectedId !== undefined) {
          options.onDrawingDelete?.(selectedId);
        }
      }
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape' && selectedIds.length > 0) {
      emitDrawingSelection([]);
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
      activeDrawingGroupEdit = null;
      activeDrawingTool = null;
      releaseActivePointer();
      controller.pointerCancel();
    },
  });
};
