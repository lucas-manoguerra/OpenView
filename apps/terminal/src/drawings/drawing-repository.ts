import type { ChartDrawingPoint, ChartRenderDrawing } from '@openview/chart-engine';

export type DrawingOwnerScope =
  | Readonly<{ kind: 'account'; id: string }>
  | Readonly<{ kind: 'anonymous'; id: string }>;

export type DrawingRepositoryScope = Readonly<{
  owner: DrawingOwnerScope;
  instrumentId: string;
  timeframe: string | null;
}>;

export type PersistedDrawing = Readonly<{
  drawingId: string;
  payload: Omit<ChartRenderDrawing, 'id'>;
  zOrder: number;
  createdAt: string;
  updatedAt: string;
  revision: number;
  timeframeScope: string | null;
}>;

export type SaveDrawingInput = Readonly<{
  drawingId: string;
  payload: Omit<ChartRenderDrawing, 'id'>;
  zOrder: number;
}>;

export interface DrawingRepository {
  list(scope: DrawingRepositoryScope): Promise<readonly PersistedDrawing[]>;
  save(
    scope: DrawingRepositoryScope,
    drawing: SaveDrawingInput,
    expectedRevision: number | null,
  ): Promise<PersistedDrawing>;
  delete(scope: DrawingRepositoryScope, drawingId: string, expectedRevision: number): Promise<void>;
}

export class DrawingRevisionConflictError extends Error {
  constructor(
    readonly drawingId: string,
    readonly expectedRevision: number | null,
    readonly actualRevision: number | null,
  ) {
    super(
      `Drawing "${drawingId}" revision conflict: expected ${expectedRevision ?? 'new'}, received ${actualRevision ?? 'missing'}.`,
    );
    this.name = 'DrawingRevisionConflictError';
  }
}

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type StoredDrawing = PersistedDrawing;

const STORAGE_PREFIX = 'openview.terminal.drawings';
const STORAGE_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDrawingPoint = (value: unknown): value is ChartDrawingPoint =>
  isRecord(value) &&
  typeof value['timestamp'] === 'number' &&
  Number.isFinite(value['timestamp']) &&
  typeof value['price'] === 'number' &&
  Number.isFinite(value['price']);

const isDrawingPayload = (value: unknown): value is Omit<ChartRenderDrawing, 'id'> => {
  if (!isRecord(value)) return false;
  if (
    !['trend-line', 'ray', 'horizontal-line', 'vertical-line', 'rectangle'].includes(
      String(value['type']),
    ) ||
    !isDrawingPoint(value['start']) ||
    (value['end'] !== null && !isDrawingPoint(value['end'])) ||
    typeof value['color'] !== 'string'
  ) {
    return false;
  }
  return true;
};

const isStoredDrawing = (value: unknown): value is StoredDrawing => {
  if (!isRecord(value)) return false;
  return (
    typeof value['drawingId'] === 'string' &&
    value['drawingId'].length > 0 &&
    isDrawingPayload(value['payload']) &&
    typeof value['zOrder'] === 'number' &&
    Number.isSafeInteger(value['zOrder']) &&
    value['zOrder'] >= 0 &&
    typeof value['createdAt'] === 'string' &&
    Number.isFinite(Date.parse(value['createdAt'])) &&
    typeof value['updatedAt'] === 'string' &&
    Number.isFinite(Date.parse(value['updatedAt'])) &&
    typeof value['revision'] === 'number' &&
    Number.isSafeInteger(value['revision']) &&
    value['revision'] > 0 &&
    (value['timeframeScope'] === null || typeof value['timeframeScope'] === 'string')
  );
};

const restoreCollection = (serialized: string | null): readonly StoredDrawing[] => {
  if (serialized === null) return Object.freeze([]);
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (
      !isRecord(parsed) ||
      parsed['version'] !== STORAGE_VERSION ||
      !Array.isArray(parsed['drawings'])
    ) {
      return Object.freeze([]);
    }
    const restored = parsed['drawings'].filter(isStoredDrawing);
    const unique = new Map<string, StoredDrawing>();
    for (const drawing of restored) unique.set(drawing.drawingId, drawing);
    return Object.freeze([...unique.values()]);
  } catch {
    return Object.freeze([]);
  }
};

const createStorageKey = (scope: DrawingRepositoryScope): string => {
  const owner = `${scope.owner.kind}:${scope.owner.id.trim()}`;
  return [
    STORAGE_PREFIX,
    encodeURIComponent(owner),
    encodeURIComponent(scope.instrumentId.trim()),
  ].join(':');
};

const validateScope = (scope: DrawingRepositoryScope): void => {
  if (!scope.owner.id.trim() || !scope.instrumentId.trim()) {
    throw new RangeError('Drawing owner and instrument identifiers are required.');
  }
  if (scope.timeframe !== null && !scope.timeframe.trim()) {
    throw new RangeError('Drawing timeframe cannot be empty.');
  }
};

export class LocalStorageDrawingRepository implements DrawingRepository {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(scope: DrawingRepositoryScope): Promise<readonly PersistedDrawing[]> {
    validateScope(scope);
    const drawings = restoreCollection(this.storage.getItem(createStorageKey(scope)))
      .filter(
        (drawing) => drawing.timeframeScope === null || drawing.timeframeScope === scope.timeframe,
      )
      .sort((first, second) => first.zOrder - second.zOrder);
    return Object.freeze(drawings);
  }

  async save(
    scope: DrawingRepositoryScope,
    drawing: SaveDrawingInput,
    expectedRevision: number | null,
  ): Promise<PersistedDrawing> {
    validateScope(scope);
    if (!drawing.drawingId.trim() || !isDrawingPayload(drawing.payload)) {
      throw new RangeError('A valid drawing identifier and payload are required.');
    }
    if (!Number.isSafeInteger(drawing.zOrder) || drawing.zOrder < 0) {
      throw new RangeError('Drawing z-order must be a non-negative integer.');
    }

    const key = createStorageKey(scope);
    const collection = [...restoreCollection(this.storage.getItem(key))];
    const existingIndex = collection.findIndex((item) => item.drawingId === drawing.drawingId);
    const existing = existingIndex < 0 ? null : (collection[existingIndex] ?? null);
    const actualRevision = existing?.revision ?? null;

    if (actualRevision !== expectedRevision) {
      throw new DrawingRevisionConflictError(drawing.drawingId, expectedRevision, actualRevision);
    }
    if (existing !== null && existing.timeframeScope !== scope.timeframe) {
      throw new RangeError('A drawing cannot be moved between timeframe scopes implicitly.');
    }

    const timestamp = this.now().toISOString();
    const saved: StoredDrawing = Object.freeze({
      drawingId: drawing.drawingId,
      payload: Object.freeze({ ...drawing.payload }),
      zOrder: drawing.zOrder,
      timeframeScope: scope.timeframe,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      revision: (existing?.revision ?? 0) + 1,
    });

    if (existingIndex < 0) collection.push(saved);
    else collection[existingIndex] = saved;

    this.storage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, drawings: collection }));
    return saved;
  }

  async delete(
    scope: DrawingRepositoryScope,
    drawingId: string,
    expectedRevision: number,
  ): Promise<void> {
    validateScope(scope);
    const key = createStorageKey(scope);
    const collection = [...restoreCollection(this.storage.getItem(key))];
    const index = collection.findIndex(
      (item) => item.drawingId === drawingId && item.timeframeScope === scope.timeframe,
    );
    const existing = index < 0 ? null : (collection[index] ?? null);

    if (existing === null || existing.revision !== expectedRevision) {
      throw new DrawingRevisionConflictError(
        drawingId,
        expectedRevision,
        existing?.revision ?? null,
      );
    }

    collection.splice(index, 1);
    if (collection.length === 0) this.storage.removeItem(key);
    else
      this.storage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, drawings: collection }));
  }
}

export const createBrowserDrawingRepository = (): DrawingRepository | null => {
  if (typeof window === 'undefined') return null;
  try {
    return new LocalStorageDrawingRepository(window.localStorage);
  } catch {
    return null;
  }
};
