import {
  createChartObjectOrder,
  moveChartObjectInOrder,
  reconcileChartObjectOrder,
  type ChartObjectOrderAction,
  type ChartObjectOrderItem,
} from './chart-object-order';
import {
  updateChartRenderScene,
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
  | Readonly<{ type: 'move-object'; target: ChartObjectOrderItem; action: ChartObjectOrderAction }>
  | Readonly<{ type: 'resize'; width: number; height: number; devicePixelRatio?: number }>
  | Readonly<{ type: 'render-now' }>;

export type ChartEvent =
  | Readonly<{ type: 'scene-changed'; scene: ChartRenderScene }>
  | Readonly<{ type: 'object-order-changed'; order: readonly ChartObjectOrderItem[] }>
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
    renderer.setScene(updateChartRenderScene(scene, { objectOrder }));
  };

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
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      renderer.destroy();
      listeners.clear();
    },
  });
};
