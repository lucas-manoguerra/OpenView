import {
  createChartObjectOrder,
  moveChartObjectInOrder,
  reconcileChartObjectOrder,
  type ChartObjectOrderAction,
  type ChartObjectOrderItem,
} from './chart-object-order';
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

export type ChartCommand =
  | Readonly<{ type: 'set-scene'; scene: ChartRenderScene }>
  | Readonly<{ type: 'set-drawings'; drawings: readonly ChartRenderDrawing[] }>
  | Readonly<{ type: 'set-drawings-visible'; visible: boolean }>
  | Readonly<{ type: 'set-drawing-selection'; drawingIds: readonly string[] }>
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
    const renderScene = drawingsVisible ? scene : updateChartRenderScene(scene, { drawings: [] });
    renderer.setScene(updateChartRenderScene(renderScene, { objectOrder }));
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
        scene = command.scene;
        objectOrder = reconcileChartObjectOrder(objectOrder, getAvailableObjects(scene));
        render();
        emit(Object.freeze({ type: 'scene-changed', scene }));
        emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
        emitDrawingState();
        return;
      }

      if (command.type === 'set-drawings') {
        const drawingIds = new Set(command.drawings.map((drawing) => drawing.id));
        const selectedDrawingIds = scene.selectedDrawingIds.filter((id) => drawingIds.has(id));
        const selectedDrawingId =
          scene.selectedDrawingId !== null && drawingIds.has(scene.selectedDrawingId)
            ? scene.selectedDrawingId
            : (selectedDrawingIds[selectedDrawingIds.length - 1] ?? null);
        scene = updateChartRenderScene(scene, {
          drawings: command.drawings,
          selectedDrawingId,
          selectedDrawingIds,
        });
        objectOrder = reconcileChartObjectOrder(objectOrder, getAvailableObjects(scene));
        render();
        emitDrawingState();
        emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
        return;
      }

      if (command.type === 'set-drawings-visible') {
        drawingsVisible = command.visible;
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
      const available = getAvailableObjects(nextScene);
      const importedOrder = createChartObjectOrder(snapshot.objectOrder);
      scene = nextScene;
      objectOrder = reconcileChartObjectOrder(importedOrder, available);
      render();
      emit(Object.freeze({ type: 'scene-changed', scene }));
      emit(Object.freeze({ type: 'object-order-changed', order: objectOrder }));
      emitDrawingState();
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
