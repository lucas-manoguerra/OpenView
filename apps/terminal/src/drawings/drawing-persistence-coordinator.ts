import type { ChartRenderDrawing } from '@openview/chart-engine';
import type {
  DrawingRepository,
  DrawingRepositoryScope,
  PersistedDrawing,
  SaveDrawingInput,
} from './drawing-repository';

export type DrawingWorkspace = Readonly<{
  token: number;
  drawings: readonly ChartRenderDrawing[];
}>;

type ActiveWorkspace = {
  token: number;
  scope: DrawingRepositoryScope;
  persisted: Map<string, PersistedDrawing>;
};

const toChartDrawing = (drawing: PersistedDrawing): ChartRenderDrawing => ({
  ...drawing.payload,
  id: drawing.drawingId,
});

const toSaveInput = (drawing: ChartRenderDrawing, zOrder: number): SaveDrawingInput => {
  const { id, ...payload } = drawing;
  return { drawingId: id, payload, zOrder };
};

const sameDrawing = (first: PersistedDrawing, second: SaveDrawingInput): boolean =>
  first.zOrder === second.zOrder &&
  JSON.stringify(first.payload) === JSON.stringify(second.payload);

export class DrawingPersistenceCoordinator {
  private active: ActiveWorkspace | null = null;
  private nextToken = 0;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly repository: DrawingRepository) {}

  async activate(scope: DrawingRepositoryScope): Promise<DrawingWorkspace> {
    const token = ++this.nextToken;
    this.active = null;
    const persisted = await this.repository.list(scope);

    if (token !== this.nextToken) {
      return Object.freeze({ token, drawings: Object.freeze([]) });
    }

    this.active = {
      token,
      scope,
      persisted: new Map(persisted.map((drawing) => [drawing.drawingId, drawing])),
    };

    return Object.freeze({
      token,
      drawings: Object.freeze(persisted.map(toChartDrawing)),
    });
  }

  persist(token: number, drawings: readonly ChartRenderDrawing[]): Promise<void> {
    const workspace = this.active;
    if (workspace === null || workspace.token !== token) return Promise.resolve();

    const snapshot = Object.freeze([...drawings]);
    const operation = this.writes.then(async () => {
      // A queued snapshot is scoped to the workspace that accepted it. It may
      // finish after a switch, but can never write into the newly active scope.
      const current = new Map(workspace.persisted);
      const nextIds = new Set(snapshot.map((drawing) => drawing.id));

      for (const [drawingId, existing] of current) {
        if (nextIds.has(drawingId)) continue;
        await this.repository.delete(
          { ...workspace.scope, timeframe: existing.timeframeScope },
          drawingId,
          existing.revision,
        );
        workspace.persisted.delete(drawingId);
      }

      for (const [zOrder, drawing] of snapshot.entries()) {
        const input = toSaveInput(drawing, zOrder);
        const existing = current.get(drawing.id);
        if (existing !== undefined && sameDrawing(existing, input)) continue;

        const saveScope = existing === undefined
          ? workspace.scope
          : { ...workspace.scope, timeframe: existing.timeframeScope };
        const saved = await this.repository.save(
          saveScope,
          input,
          existing?.revision ?? null,
        );
        workspace.persisted.set(saved.drawingId, saved);
      }
    });

    this.writes = operation.catch(() => undefined);
    return operation;
  }
}
