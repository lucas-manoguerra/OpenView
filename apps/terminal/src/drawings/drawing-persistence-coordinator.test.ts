import type { ChartRenderDrawing } from '@openview/chart-engine';
import { describe, expect, it } from 'vitest';
import type {
  DrawingRepository,
  DrawingRepositoryScope,
  PersistedDrawing,
  SaveDrawingInput,
} from './drawing-repository';
import { DrawingPersistenceCoordinator } from './drawing-persistence-coordinator';

class MemoryDrawingRepository implements DrawingRepository {
  readonly rows = new Map<string, PersistedDrawing>();
  readonly operations: string[] = [];

  private key(scope: DrawingRepositoryScope, id: string): string {
    return [scope.owner.id, scope.instrumentId, scope.timeframe ?? '*', id].join('|');
  }

  async list(scope: DrawingRepositoryScope): Promise<readonly PersistedDrawing[]> {
    return [...this.rows.values()].filter(
      (row) => row.timeframeScope === null || row.timeframeScope === scope.timeframe,
    );
  }

  async save(
    scope: DrawingRepositoryScope,
    drawing: SaveDrawingInput,
    expectedRevision: number | null,
  ): Promise<PersistedDrawing> {
    const key = this.key(scope, drawing.drawingId);
    const existing = this.rows.get(key);
    if ((existing?.revision ?? null) !== expectedRevision) {
      throw new Error('revision conflict');
    }
    const now = '2026-11-26T12:00:00.000Z';
    const saved: PersistedDrawing = {
      drawingId: drawing.drawingId,
      payload: drawing.payload,
      zOrder: drawing.zOrder,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
      timeframeScope: scope.timeframe,
    };
    this.rows.set(key, saved);
    this.operations.push('save:' + scope.instrumentId + ':' + drawing.drawingId);
    return saved;
  }

  async delete(
    scope: DrawingRepositoryScope,
    drawingId: string,
    expectedRevision: number,
  ): Promise<void> {
    const key = this.key(scope, drawingId);
    const existing = this.rows.get(key);
    if (existing?.revision !== expectedRevision) throw new Error('revision conflict');
    this.rows.delete(key);
    this.operations.push('delete:' + scope.instrumentId + ':' + drawingId);
  }
}

const scope: DrawingRepositoryScope = {
  owner: { kind: 'anonymous', id: 'browser-1' },
  instrumentId: 'binance-spot:BTC-USDT',
  timeframe: '1h',
};

const chartDrawing = (id: string, price = 100): ChartRenderDrawing => ({
  id,
  type: 'trend-line',
  start: { timestamp: 10, price },
  end: { timestamp: 20, price: price + 10 },
  color: '#60a5fa',
  lineWidth: 1.5,
  lineStyle: 'solid',
  locked: false,
  visible: true,
});

describe('drawing persistence coordinator', () => {
  it('restores drawings and persists confirmed changes with stable revisions', async () => {
    const repository = new MemoryDrawingRepository();
    const coordinator = new DrawingPersistenceCoordinator(repository);
    const workspace = await coordinator.activate(scope);

    expect(workspace.drawings).toEqual([]);
    await coordinator.persist(workspace.token, [chartDrawing('drawing-1')]);
    await coordinator.persist(workspace.token, [chartDrawing('drawing-1', 120)]);

    const restored = await coordinator.activate(scope);
    expect(restored.drawings).toEqual([chartDrawing('drawing-1', 120)]);
    expect([...repository.rows.values()][0]?.revision).toBe(2);
  });

  it('deletes drawings removed from the confirmed chart snapshot', async () => {
    const repository = new MemoryDrawingRepository();
    const coordinator = new DrawingPersistenceCoordinator(repository);
    const workspace = await coordinator.activate(scope);

    await coordinator.persist(workspace.token, [
      chartDrawing('drawing-1'),
      chartDrawing('drawing-2'),
    ]);
    await coordinator.persist(workspace.token, [chartDrawing('drawing-2')]);

    expect([...repository.rows.values()].map((row) => row.drawingId)).toEqual(['drawing-2']);
    expect(repository.operations).toContain(
      'delete:' + scope.instrumentId + ':drawing-1',
    );
  });

  it('does not allow a stale workspace token to write into the active workspace', async () => {
    const repository = new MemoryDrawingRepository();
    const coordinator = new DrawingPersistenceCoordinator(repository);
    const first = await coordinator.activate(scope);
    const secondScope = { ...scope, instrumentId: 'okx-spot:BTC-USDT' };
    const second = await coordinator.activate(secondScope);

    await coordinator.persist(first.token, [chartDrawing('stale')]);
    await coordinator.persist(second.token, [chartDrawing('current')]);

    expect([...repository.rows.values()].map((row) => row.drawingId)).toEqual(['current']);
    expect(repository.operations).toEqual([
      'save:' + secondScope.instrumentId + ':current',
    ]);
  });

  it('ignores an older asynchronous load that resolves after a newer workspace', async () => {
    let releaseFirst: ((rows: readonly PersistedDrawing[]) => void) | undefined;
    const repository: DrawingRepository = {
      list: (requestedScope) =>
        requestedScope.instrumentId === scope.instrumentId
          ? new Promise((resolve) => {
              releaseFirst = resolve;
            })
          : Promise.resolve([]),
      save: async () => {
        throw new Error('not used');
      },
      delete: async () => undefined,
    };
    const coordinator = new DrawingPersistenceCoordinator(repository);
    const firstLoad = coordinator.activate(scope);
    const secondLoad = await coordinator.activate({
      ...scope,
      instrumentId: 'okx-spot:BTC-USDT',
    });

    releaseFirst?.([]);
    const first = await firstLoad;
    expect(first.drawings).toEqual([]);
    expect(secondLoad.drawings).toEqual([]);
    await expect(coordinator.persist(first.token, [chartDrawing('stale')])).resolves.toBeUndefined();
  });
});
