import {
  createChartObjectOrder,
  moveChartObjectInOrder,
  reconcileChartObjectOrder,
  type ChartObjectOrderAction,
  type ChartObjectOrderItem,
} from './chart-object-order';
import type { ChartCoordinate, ChartDataPoint } from './chart-frame';
import {
  hitTestChartDrawing,
  selectChartDrawingsWithinArea,
  updateChartDrawing,
  type ChartDrawingHit,
  type ChartDrawingSelectionArea,
} from './drawing-geometry';
import {
  updateChartRenderScene,
  type ChartRenderDrawing,
  type ChartRenderScene,
} from './canvas-painter';
import {
  createCanvasRenderer,
  type CanvasRenderer,
  type CanvasRendererOptions,
  type CanvasSurface,
} from './canvas-renderer';

export type ChartDrawingEditPreview =
  | Readonly<{
      kind: 'single';
      drawingId: string;
      target: ChartDrawingHit['target'];
      origin: ChartDataPoint;
      current: ChartDataPoint;
    }>
  | Readonly<{
      kind: 'group';
      drawingIds: readonly string[];
      origin: ChartDataPoint;
      current: ChartDataPoint;
    }>;

export type ChartCommand =
  | Readonly<{ type: 'set-scene'; scene: ChartRenderScene }>
  | Readonly<{ type: 'set-drawings'; drawings: readonly ChartRenderDrawing[] }>
  | Readonly<{
      type: 'update-drawing-properties';
      drawingIds: readonly string[];
      updates: Partial<Omit<ChartRenderDrawing, 'id' | 'type' | 'start' | 'end'>>;
    }>
  | Readonly<{
      type: 'update-drawing-anchor';
      drawingId: string;
      target: 'start' | 'end';
      updates: Partial<ChartRenderDrawing['start']>;
    }>
  | Readonly<{ type: 'add-drawing'; drawing: ChartRenderDrawing }>
  | Readonly<{ type: 'delete-drawings'; drawingIds: readonly string[] }>
  | Readonly<{ type: 'set-drawings-visible'; visible: boolean }>
  | Readonly<{ type: 'set-drawing-selection'; drawingIds: readonly string[] }>
  | Readonly<{ type: 'set-drawing-hover'; hit: ChartDrawingHit | null }>
  | Readonly<{ type: 'set-drawing-edit-preview'; gesture: ChartDrawingEditPreview | null }>
  | Readonly<{ type: 'set-drawing-creation-preview'; drawing: ChartRenderDrawing | null }>
  | Readonly<{ type: 'commit-drawing-edit'; gesture: ChartDrawingEditPreview }>
  | Readonly<{ type: 'undo-drawings' }>
  | Readonly<{ type: 'redo-drawings' }>
  | Readonly<{ type: 'clear-drawing-history' }>
  | Readonly<{ type: 'move-object'; target: ChartObjectOrderItem; action: ChartObjectOrderAction }>
  | Readonly<{ type: 'resize'; width: number; height: number; devicePixelRatio?: number }>
  | Readonly<{ type: 'render-now' }>;

export type ChartEvent =
  | Readonly<{ type: 'scene-changed'; scene: ChartRenderScene }>
  | Readonly<{ type: 'object-order-changed'; order: readonly ChartObjectOrderItem[] }>
  | Readonly<{
      type: 'drawing-state-changed';
      drawings: readonly ChartRenderDrawing[];
      selectedDrawingId: string | null;
      selectedDrawingIds: readonly string[];
    }>
  | Readonly<{ type: 'history-state-changed'; undoCount: number; redoCount: number }>
  | Readonly<{ type: 'destroyed' }>;

export type ChartSnapshot = Readonly<{
  version: 1;
  scene: ChartRenderScene;
  objectOrder: readonly ChartObjectOrderItem[];
}>;

export type ChartApi = Readonly<{
  execute(command: ChartCommand): void;
  subscribe(listener: (event: ChartEvent) => void): () => void;
  exportSnapshot(): ChartSnapshot;
  importSnapshot(snapshot: ChartSnapshot): void;
  hitTestDrawing(point: ChartCoordinate, tolerance?: number): ChartDrawingHit | null;
  selectDrawingsWithinArea(area: ChartDrawingSelectionArea): readonly string[];
  destroy(): void;
}>;

export type CreateChartOptions = Readonly<{
  surface: CanvasSurface;
  initialScene: ChartRenderScene;
  renderer?: CanvasRendererOptions;
}>;

const getAvailableObjects = (scene: ChartRenderScene): readonly ChartObjectOrderItem[] =>
  Object.freeze([
    Object.freeze({ kind: 'price-series' as const, id: 'main' }),
    Object.freeze({ kind: 'volume' as const, id: 'volume' }),
    ...scene.indicators.map((item) => Object.freeze({ kind: 'indicator' as const, id: item.id })),
    ...scene.drawings.map((item) => Object.freeze({ kind: 'drawing' as const, id: item.id })),
  ]);

export const createChart = (options: CreateChartOptions): ChartApi => {
  const renderer: CanvasRenderer = createCanvasRenderer(options.surface, options.renderer);
  const listeners = new Set<(event: ChartEvent) => void>();
  let scene = options.initialScene;
  let objectOrder = createChartObjectOrder(getAvailableObjects(scene));
  let drawingsVisible = true;
  let drawingPreview: readonly ChartRenderDrawing[] | null = null;
  let drawingCreationPreview: ChartRenderDrawing | null = null;
  const drawingUndoStack: (readonly ChartRenderDrawing[])[] = [];
  const drawingRedoStack: (readonly ChartRenderDrawing[])[] = [];
  let destroyed = false;

  const emit = (event: ChartEvent): void => {
    for (const listener of [...listeners]) {
      listener(event);
    }
  };

  const assertActive = (): void => {
    if (destroyed) {
      throw new Error('The chart instance has been destroyed.');
    }
  };

  const render = (): void => {
    const previewDrawings =
      drawingPreview ??
      (drawingCreationPreview === null
        ? null
        : Object.freeze([...scene.drawings, drawingCreationPreview]));
    const previewScene =
      previewDrawings === null
        ? scene
        : updateChartRenderScene(scene, { drawings: previewDrawings });
    const renderScene = drawingsVisible
      ? previewScene
      : updateChartRenderScene(previewScene, { drawings: [] });
    renderer.setScene(updateChartRenderScene(renderScene, { objectOrder }));
  };

  const emitHistoryState = (): void => {
    emit(
      Object.freeze({
        type: 'history-state-changed',
        undoCount: drawingUndoStack.length,
        redoCount: drawingRedoStack.length,
      }),
    );
  };

  const emitDrawingState = (): void => {
    emit(
      Object.freeze({
        type: 'drawing-state-changed',
        drawings: scene.drawings,
        selectedDrawingId: scene.selectedDrawingId,
        selectedDrawingIds: scene.selectedDrawingIds,
      }),
    );
  };

  renderer.resize(scene.frame.layout.bounds.width, scene.frame.layout.bounds.height);
  render();

  return Object.freeze({
    execute(command: ChartCommand): void {
      assertActive();

      if (command.type === 'set-scene') {
        scene = updateChartRenderScene(command.scene, {
          drawings: scene.drawings,
          selectedDrawingId: scene.selectedDrawingId,
          selectedDrawingIds: scene.selectedDrawingIds,
          hoveredDrawingHit: scene.hoveredDrawingHit,
        });
        objectOrder = reconcileChartObjectOrder(objectOrder, getAvailableObjects(scene));
        render();
        emit(Object.freeze({ type: 'scene-changed', scene }));
        emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
        emitDrawingState();
        return;
      }

      if (command.type === 'add-drawing') {
        if (scene.drawings.some((drawing) => drawing.id === command.drawing.id)) {
          throw new RangeError('A drawing with this id already exists.');
        }
        drawingPreview = null;
        drawingCreationPreview = null;
        drawingUndoStack.push(scene.drawings);
        if (drawingUndoStack.length > 50) drawingUndoStack.shift();
        drawingRedoStack.length = 0;
        scene = updateChartRenderScene(scene, {
          drawings: [...scene.drawings, command.drawing],
          selectedDrawingId: command.drawing.id,
          selectedDrawingIds: [command.drawing.id],
          hoveredDrawingHit: null,
        });
        objectOrder = reconcileChartObjectOrder(objectOrder, getAvailableObjects(scene));
        render();
        emitDrawingState();
        emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
        emitHistoryState();
        return;
      }

      if (command.type === 'delete-drawings') {
        drawingPreview = null;
        drawingCreationPreview = null;
        const deletedIds = new Set(command.drawingIds);
        const nextDrawings = scene.drawings.filter((drawing) => !deletedIds.has(drawing.id));
        if (nextDrawings.length === scene.drawings.length) return;
        drawingPreview = null;
        drawingUndoStack.push(scene.drawings);
        if (drawingUndoStack.length > 50) drawingUndoStack.shift();
        drawingRedoStack.length = 0;
        const availableIds = new Set(nextDrawings.map((drawing) => drawing.id));
        const selectedDrawingIds = Object.freeze(
          scene.selectedDrawingIds.filter((id) => availableIds.has(id)),
        );
        const selectedDrawingId =
          scene.selectedDrawingId !== null && availableIds.has(scene.selectedDrawingId)
            ? scene.selectedDrawingId
            : (selectedDrawingIds[selectedDrawingIds.length - 1] ?? null);
        const hoveredDrawingHit =
          scene.hoveredDrawingHit !== null && availableIds.has(scene.hoveredDrawingHit.drawingId)
            ? scene.hoveredDrawingHit
            : null;
        scene = updateChartRenderScene(scene, {
          drawings: nextDrawings,
          selectedDrawingId,
          selectedDrawingIds,
          hoveredDrawingHit,
        });
        objectOrder = reconcileChartObjectOrder(objectOrder, getAvailableObjects(scene));
        render();
        emitDrawingState();
        emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
        emitHistoryState();
        return;
      }

      if (command.type === 'update-drawing-properties') {
        const drawingIds = new Set(command.drawingIds);
        const nextDrawings = scene.drawings.map((drawing) =>
          drawingIds.has(drawing.id)
            ? Object.freeze({ ...drawing, ...command.updates })
            : drawing,
        );
        if (nextDrawings.every((drawing, index) => drawing === scene.drawings[index])) return;
        drawingUndoStack.push(scene.drawings);
        if (drawingUndoStack.length > 50) drawingUndoStack.shift();
        drawingRedoStack.length = 0;
        scene = updateChartRenderScene(scene, { drawings: Object.freeze(nextDrawings) });
        render();
        emitDrawingState();
        emitHistoryState();
        return;
      }

      if (command.type === 'update-drawing-anchor') {
        const { timestamp, price } = command.updates;
        if (
          (timestamp !== undefined && (!Number.isFinite(timestamp) || timestamp <= 0)) ||
          (price !== undefined && !Number.isFinite(price))
        ) {
          throw new RangeError('Drawing anchor coordinates must be finite and timestamps positive.');
        }
        const targetDrawing = scene.drawings.find((drawing) => drawing.id === command.drawingId);
        if (targetDrawing === undefined || (command.target === 'end' && targetDrawing.end === null)) {
          return;
        }
        const nextDrawings = scene.drawings.map((drawing) => {
          if (drawing.id !== command.drawingId) return drawing;
          if (command.target === 'start') {
            return Object.freeze({
              ...drawing,
              start: Object.freeze({ ...drawing.start, ...command.updates }),
            });
          }
          return Object.freeze({
            ...drawing,
            end: Object.freeze({ ...drawing.end!, ...command.updates }),
          });
        });
        drawingUndoStack.push(scene.drawings);
        if (drawingUndoStack.length > 50) drawingUndoStack.shift();
        drawingRedoStack.length = 0;
        scene = updateChartRenderScene(scene, { drawings: Object.freeze(nextDrawings) });
        render();
        emitDrawingState();
        emitHistoryState();
        return;
      }

      if (command.type === 'set-drawings') {
        drawingPreview = null;
        drawingCreationPreview = null;
        if (JSON.stringify(scene.drawings) !== JSON.stringify(command.drawings)) {
          drawingUndoStack.push(scene.drawings);
          if (drawingUndoStack.length > 50) drawingUndoStack.shift();
          drawingRedoStack.length = 0;
          emitHistoryState();
        }
        const drawingIds = new Set(command.drawings.map((drawing) => drawing.id));
        const selectedDrawingIds = scene.selectedDrawingIds.filter((id) => drawingIds.has(id));
        const selectedDrawingId =
          scene.selectedDrawingId !== null && drawingIds.has(scene.selectedDrawingId)
            ? scene.selectedDrawingId
            : (selectedDrawingIds[selectedDrawingIds.length - 1] ?? null);
        const hoveredDrawingHit =
          scene.hoveredDrawingHit !== null &&
          drawingIds.has(scene.hoveredDrawingHit.drawingId) &&
          command.drawings.some(
            (drawing) =>
              drawing.id === scene.hoveredDrawingHit?.drawingId && drawing.visible !== false,
          )
            ? scene.hoveredDrawingHit
            : null;
        scene = updateChartRenderScene(scene, {
          drawings: command.drawings,
          selectedDrawingId,
          selectedDrawingIds,
          hoveredDrawingHit,
        });
        objectOrder = reconcileChartObjectOrder(objectOrder, getAvailableObjects(scene));
        render();
        emitDrawingState();
        emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
        return;
      }

      if (command.type === 'undo-drawings' || command.type === 'redo-drawings') {
        const source = command.type === 'undo-drawings' ? drawingUndoStack : drawingRedoStack;
        const destination = command.type === 'undo-drawings' ? drawingRedoStack : drawingUndoStack;
        const previousDrawings = source.pop();
        if (previousDrawings === undefined) return;
        destination.push(scene.drawings);
        if (destination.length > 50) destination.shift();
        drawingPreview = null;
        drawingCreationPreview = null;
        const availableIds = new Set(previousDrawings.map((drawing) => drawing.id));
        const selectedDrawingIds = Object.freeze(
          scene.selectedDrawingIds.filter((id) => availableIds.has(id)),
        );
        const selectedDrawingId =
          scene.selectedDrawingId !== null && availableIds.has(scene.selectedDrawingId)
            ? scene.selectedDrawingId
            : (selectedDrawingIds[selectedDrawingIds.length - 1] ?? null);
        const hoveredDrawingHit =
          scene.hoveredDrawingHit !== null &&
          previousDrawings.some(
            (drawing) =>
              drawing.id === scene.hoveredDrawingHit?.drawingId && drawing.visible !== false,
          )
            ? scene.hoveredDrawingHit
            : null;
        scene = updateChartRenderScene(scene, {
          drawings: previousDrawings,
          selectedDrawingId,
          selectedDrawingIds,
          hoveredDrawingHit,
        });
        objectOrder = reconcileChartObjectOrder(objectOrder, getAvailableObjects(scene));
        render();
        emitDrawingState();
        emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
        emitHistoryState();
        return;
      }

      if (command.type === 'clear-drawing-history') {
        drawingUndoStack.length = 0;
        drawingRedoStack.length = 0;
        emitHistoryState();
        return;
      }

      if (command.type === 'set-drawings-visible') {
        drawingsVisible = command.visible;
        if (!drawingsVisible) {
          drawingPreview = null;
          drawingCreationPreview = null;
        }
        if (!drawingsVisible && scene.hoveredDrawingHit !== null) {
          scene = updateChartRenderScene(scene, { hoveredDrawingHit: null });
          emit(Object.freeze({ type: 'scene-changed', scene }));
        }
        render();
        return;
      }

      if (command.type === 'set-drawing-selection') {
        const availableIds = new Set(scene.drawings.map((drawing) => drawing.id));
        const selectedDrawingIds = Object.freeze(
          [...new Set(command.drawingIds)].filter((id) => availableIds.has(id)),
        );
        const selectedDrawingId = selectedDrawingIds[selectedDrawingIds.length - 1] ?? null;
        scene = updateChartRenderScene(scene, { selectedDrawingId, selectedDrawingIds });
        render();
        emitDrawingState();
        return;
      }

      if (command.type === 'set-drawing-creation-preview') {
        drawingCreationPreview = command.drawing;
        drawingPreview = null;
        render();
        return;
      }

      if (command.type === 'set-drawing-edit-preview') {
        drawingCreationPreview = null;
        const gesture = command.gesture;
        if (gesture === null) {
          drawingPreview = null;
          render();
          return;
        }

        if (gesture.kind === 'single') {
          const targetDrawing = scene.drawings.find((drawing) => drawing.id === gesture.drawingId);
          if (targetDrawing === undefined || targetDrawing.visible === false) {
            drawingPreview = null;
          } else {
            const previewDrawing = updateChartDrawing(
              targetDrawing,
              gesture.target,
              gesture.origin,
              gesture.current,
              scene.candles,
            );
            drawingPreview = Object.freeze(
              scene.drawings.map((drawing) =>
                drawing.id === gesture.drawingId ? previewDrawing : drawing,
              ),
            );
          }
        } else {
          const selectedIds = new Set(gesture.drawingIds);
          drawingPreview = Object.freeze(
            scene.drawings.map((drawing) =>
              selectedIds.has(drawing.id) && drawing.visible !== false
                ? updateChartDrawing(
                    drawing,
                    'body',
                    gesture.origin,
                    gesture.current,
                    scene.candles,
                  )
                : drawing,
            ),
          );
        }
        render();
        return;
      }

      if (command.type === 'commit-drawing-edit') {
        const previousDrawings = scene.drawings;
        const gesture = command.gesture;
        const nextDrawings =
          gesture.kind === 'single'
            ? scene.drawings.map((drawing) =>
                drawing.id === gesture.drawingId && drawing.visible !== false
                  ? updateChartDrawing(
                      drawing,
                      gesture.target,
                      gesture.origin,
                      gesture.current,
                      scene.candles,
                    )
                  : drawing,
              )
            : (() => {
                const selectedIds = new Set(gesture.drawingIds);
                return scene.drawings.map((drawing) =>
                  selectedIds.has(drawing.id) && drawing.visible !== false
                    ? updateChartDrawing(
                        drawing,
                        'body',
                        gesture.origin,
                        gesture.current,
                        scene.candles,
                      )
                    : drawing,
                );
              })();
        drawingPreview = null;
        if (nextDrawings.some((drawing, index) => drawing !== scene.drawings[index])) {
          scene = updateChartRenderScene(scene, { drawings: nextDrawings });
          drawingUndoStack.push(previousDrawings);
          if (drawingUndoStack.length > 50) drawingUndoStack.shift();
          drawingRedoStack.length = 0;
          render();
          emitDrawingState();
          emitHistoryState();
        } else {
          render();
        }
        return;
      }

      if (command.type === 'set-drawing-hover') {
        const hitIsVisible =
          command.hit !== null &&
          drawingsVisible &&
          scene.drawings.some(
            (drawing) => drawing.id === command.hit?.drawingId && drawing.visible !== false,
          );
        const nextHit = hitIsVisible ? command.hit : null;
        if (
          scene.hoveredDrawingHit?.drawingId === nextHit?.drawingId &&
          scene.hoveredDrawingHit?.target === nextHit?.target
        ) {
          return;
        }
        scene = updateChartRenderScene(scene, { hoveredDrawingHit: nextHit });
        render();
        emit(Object.freeze({ type: 'scene-changed', scene }));
        return;
      }

      if (command.type === 'move-object') {
        const nextOrder = moveChartObjectInOrder(objectOrder, command.target, command.action);
        if (nextOrder !== objectOrder) {
          objectOrder = nextOrder;
          render();
          emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
        }
        return;
      }

      if (command.type === 'resize') {
        renderer.resize(command.width, command.height, command.devicePixelRatio);
        render();
        return;
      }

      renderer.renderNow();
    },

    subscribe(listener: (event: ChartEvent) => void): () => void {
      assertActive();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    hitTestDrawing(point: ChartCoordinate, tolerance = 8): ChartDrawingHit | null {
      assertActive();
      if (!drawingsVisible) {
        return null;
      }
      const visibleDrawings = scene.drawings.filter((drawing) => drawing.visible !== false);
      return hitTestChartDrawing(
        point,
        visibleDrawings,
        scene.candles,
        scene.frame,
        tolerance,
        scene.selectedDrawingIds,
      );
    },

    selectDrawingsWithinArea(area: ChartDrawingSelectionArea): readonly string[] {
      assertActive();
      if (!drawingsVisible) {
        return Object.freeze([]);
      }
      const visibleDrawings = scene.drawings.filter((drawing) => drawing.visible !== false);
      return selectChartDrawingsWithinArea(area, visibleDrawings, scene.candles, scene.frame);
    },

    exportSnapshot(): ChartSnapshot {
      assertActive();
      return Object.freeze({
        version: 1,
        scene,
        objectOrder: createChartObjectOrder(objectOrder),
      });
    },

    importSnapshot(snapshot: ChartSnapshot): void {
      assertActive();
      if (snapshot.version !== 1) {
        throw new RangeError('Unsupported chart snapshot version.');
      }
      const nextScene = snapshot.scene;
      drawingPreview = null;
      drawingCreationPreview = null;
      drawingUndoStack.length = 0;
      drawingRedoStack.length = 0;
      const available = getAvailableObjects(nextScene);
      const importedOrder = createChartObjectOrder(snapshot.objectOrder);
      scene = nextScene;
      objectOrder = reconcileChartObjectOrder(importedOrder, available);
      render();
      emit(Object.freeze({ type: 'scene-changed', scene }));
      emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
      emitDrawingState();
      emitHistoryState();
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      renderer.destroy();
      emit(Object.freeze({ type: 'destroyed' }));
      listeners.clear();
    },
  });
};
