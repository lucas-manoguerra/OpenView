import type { ChartRenderDrawing } from '@openview/chart-engine';
import type { Database, Json } from '../lib/supabase/database.types';
import {
  DrawingRevisionConflictError,
  type DrawingRepository,
  type DrawingRepositoryScope,
  type PersistedDrawing,
  type SaveDrawingInput,
} from './drawing-repository';

type DrawingPayload = Omit<ChartRenderDrawing, 'id'>;
type DrawingRow = Database['public']['Tables']['chart_drawings']['Row'];
type DrawingInsert = Database['public']['Tables']['chart_drawings']['Insert'];
type DrawingUpdate = Database['public']['Tables']['chart_drawings']['Update'];

type SupabaseError = Readonly<{
  code?: string;
  message: string;
}>;

type SupabaseResult<T> = Readonly<{
  data: T | null;
  error: SupabaseError | null;
}>;

interface SupabaseDrawingQuery<Row> extends PromiseLike<SupabaseResult<readonly Row[]>> {
  select(columns?: string): SupabaseDrawingQuery<Row>;
  insert(values: DrawingInsert): SupabaseDrawingQuery<Row>;
  update(values: DrawingUpdate): SupabaseDrawingQuery<Row>;
  delete(): SupabaseDrawingQuery<Row>;
  eq(column: string, value: string | number): SupabaseDrawingQuery<Row>;
  is(column: string, value: null): SupabaseDrawingQuery<Row>;
  order(column: string, options?: Readonly<{ ascending?: boolean }>): SupabaseDrawingQuery<Row>;
  maybeSingle(): PromiseLike<SupabaseResult<Row>>;
}

export interface SupabaseDrawingClient {
  from(table: 'chart_drawings'): unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPoint = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value['timestamp'] === 'number' &&
  Number.isFinite(value['timestamp']) &&
  typeof value['price'] === 'number' &&
  Number.isFinite(value['price']);

const isDrawingPayload = (value: unknown): value is DrawingPayload => {
  if (!isRecord(value)) return false;
  const types = ['trend-line', 'ray', 'horizontal-line', 'vertical-line', 'rectangle'];
  if (
    typeof value['type'] !== 'string' ||
    !types.includes(value['type']) ||
    !isPoint(value['start']) ||
    (value['end'] !== null && !isPoint(value['end'])) ||
    (value['end'] === null &&
      value['type'] !== 'horizontal-line' &&
      value['type'] !== 'vertical-line') ||
    typeof value['color'] !== 'string' ||
    value['color'].length === 0
  ) {
    return false;
  }

  const lineWidth = value['lineWidth'] ?? 1.5;
  const lineStyle = value['lineStyle'] ?? 'solid';
  const fillColor = value['fillColor'] ?? value['color'];
  const fillOpacity = value['fillOpacity'] ?? 0;
  const startStyle = value['startStyle'] ?? 'none';
  const endStyle = value['endStyle'] ?? 'none';

  return (
    typeof lineWidth === 'number' &&
    Number.isFinite(lineWidth) &&
    lineWidth >= 0.5 &&
    lineWidth <= 8 &&
    ['solid', 'dashed', 'dotted'].includes(String(lineStyle)) &&
    typeof fillColor === 'string' &&
    fillColor.length > 0 &&
    typeof fillOpacity === 'number' &&
    Number.isFinite(fillOpacity) &&
    fillOpacity >= 0 &&
    fillOpacity <= 1 &&
    ['none', 'arrow', 'circle'].includes(String(startStyle)) &&
    ['none', 'arrow', 'circle'].includes(String(endStyle)) &&
    ['locked', 'visible', 'extendStart', 'extendEnd'].every(
      (key) => value[key] === undefined || typeof value[key] === 'boolean',
    )
  );
};

const validateScope = (scope: DrawingRepositoryScope): void => {
  if (scope.owner.kind !== 'account') {
    throw new RangeError('Remote drawing persistence requires an authenticated account owner.');
  }
  if (!scope.owner.id.trim() || !scope.instrumentId.trim()) {
    throw new RangeError('Drawing owner and instrument identifiers are required.');
  }
  if (scope.timeframe !== null && !scope.timeframe.trim()) {
    throw new RangeError('Drawing timeframe cannot be empty.');
  }
};

const validateDrawing = (drawing: SaveDrawingInput): void => {
  if (!drawing.drawingId.trim() || !isDrawingPayload(drawing.payload)) {
    throw new RangeError('A valid drawing identifier and payload are required.');
  }
  if (!Number.isSafeInteger(drawing.zOrder) || drawing.zOrder < 0) {
    throw new RangeError('Drawing z-order must be a non-negative integer.');
  }
};

const mapRow = (row: DrawingRow): PersistedDrawing => {
  if (
    !isDrawingPayload(row.payload) ||
    !Number.isSafeInteger(row.z_order) ||
    row.z_order < 0 ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  ) {
    throw new TypeError('Supabase returned a malformed chart drawing row.');
  }

  return Object.freeze({
    drawingId: row.drawing_id,
    payload: Object.freeze(row.payload),
    zOrder: row.z_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    timeframeScope: row.timeframe_scope,
  });
};

const throwIfError = (error: SupabaseError | null): void => {
  if (error !== null) {
    const failure = new Error(error.message);
    failure.name = 'SupabaseDrawingRepositoryError';
    Object.assign(failure, { code: error.code });
    throw failure;
  }
};

export class SupabaseDrawingRepository implements DrawingRepository {
  constructor(private readonly client: SupabaseDrawingClient) {}

  private table(): SupabaseDrawingQuery<DrawingRow> {
    return this.client.from('chart_drawings') as SupabaseDrawingQuery<DrawingRow>;
  }

  private identityQuery(scope: DrawingRepositoryScope, drawingId: string) {
    let query = this.table()
      .select('*')
      .eq('user_id', scope.owner.id)
      .eq('instrument_id', scope.instrumentId)
      .eq('drawing_id', drawingId);

    query =
      scope.timeframe === null
        ? query.is('timeframe_scope', null)
        : query.eq('timeframe_scope', scope.timeframe);

    return query;
  }

  private async findCurrentRevision(
    scope: DrawingRepositoryScope,
    drawingId: string,
  ): Promise<number | null> {
    const result = await this.identityQuery(scope, drawingId).maybeSingle();
    throwIfError(result.error);
    return result.data?.revision ?? null;
  }

  async list(scope: DrawingRepositoryScope): Promise<readonly PersistedDrawing[]> {
    validateScope(scope);
    const result = await this.table()
      .select('*')
      .eq('user_id', scope.owner.id)
      .eq('instrument_id', scope.instrumentId)
      .order('z_order', { ascending: true });

    throwIfError(result.error);
    const rows = result.data ?? [];
    return Object.freeze(
      rows
        .filter(
          (row) => row.timeframe_scope === null || row.timeframe_scope === scope.timeframe,
        )
        .map(mapRow),
    );
  }

  async save(
    scope: DrawingRepositoryScope,
    drawing: SaveDrawingInput,
    expectedRevision: number | null,
  ): Promise<PersistedDrawing> {
    validateScope(scope);
    validateDrawing(drawing);

    if (expectedRevision === null) {
      const values: DrawingInsert = {
        user_id: scope.owner.id,
        instrument_id: scope.instrumentId,
        drawing_id: drawing.drawingId,
        timeframe_scope: scope.timeframe,
        payload: drawing.payload as unknown as Json,
        z_order: drawing.zOrder,
      };
      const result = await this.table()
        .insert(values)
        .select('*')
        .maybeSingle();

      if (result.error?.code === '23505') {
        const actualRevision = await this.findCurrentRevision(scope, drawing.drawingId);
        throw new DrawingRevisionConflictError(drawing.drawingId, null, actualRevision);
      }
      throwIfError(result.error);
      if (result.data === null) {
        throw new Error('Supabase inserted a drawing but returned no row.');
      }
      return mapRow(result.data);
    }

    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new RangeError('Expected drawing revision must be a positive safe integer.');
    }

    const values: DrawingUpdate = {
      payload: drawing.payload as unknown as Json,
      z_order: drawing.zOrder,
    };
    let query = this.table()
      .update(values)
      .eq('user_id', scope.owner.id)
      .eq('instrument_id', scope.instrumentId)
      .eq('drawing_id', drawing.drawingId)
      .eq('revision', expectedRevision);
    query =
      scope.timeframe === null
        ? query.is('timeframe_scope', null)
        : query.eq('timeframe_scope', scope.timeframe);
    const result = await query.select('*').maybeSingle();

    throwIfError(result.error);
    if (result.data === null) {
      const actualRevision = await this.findCurrentRevision(scope, drawing.drawingId);
      throw new DrawingRevisionConflictError(
        drawing.drawingId,
        expectedRevision,
        actualRevision,
      );
    }
    return mapRow(result.data);
  }

  async delete(
    scope: DrawingRepositoryScope,
    drawingId: string,
    expectedRevision: number,
  ): Promise<void> {
    validateScope(scope);
    if (!drawingId.trim() || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new RangeError('A drawing identifier and positive expected revision are required.');
    }

    let query = this.table()
      .delete()
      .eq('user_id', scope.owner.id)
      .eq('instrument_id', scope.instrumentId)
      .eq('drawing_id', drawingId)
      .eq('revision', expectedRevision);
    query =
      scope.timeframe === null
        ? query.is('timeframe_scope', null)
        : query.eq('timeframe_scope', scope.timeframe);
    const result = await query.select('*').maybeSingle();

    throwIfError(result.error);
    if (result.data === null) {
      const actualRevision = await this.findCurrentRevision(scope, drawingId);
      throw new DrawingRevisionConflictError(drawingId, expectedRevision, actualRevision);
    }
  }
}
