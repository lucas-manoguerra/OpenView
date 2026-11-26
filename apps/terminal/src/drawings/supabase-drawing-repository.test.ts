import { describe, expect, it } from 'vitest';
import type { Database } from '../lib/supabase/database.types';
import {
  SupabaseDrawingRepository,
  type SupabaseDrawingClient,
  type SupabaseDrawingQuery,
  type SupabaseResult,
} from './supabase-drawing-repository';
import {
  DrawingRevisionConflictError,
  type DrawingRepositoryScope,
  type SaveDrawingInput,
} from './drawing-repository';

type Row = Database['public']['Tables']['chart_drawings']['Row'];
type Insert = Database['public']['Tables']['chart_drawings']['Insert'];
type Operation = 'select' | 'insert' | 'update' | 'delete';
type SupabaseDrawingBuilder<Row> = {
  select(columns?: string): SupabaseDrawingBuilder<Row>;
  insert(values: Insert): SupabaseDrawingBuilder<Row>;
  update(values: Partial<Row>): SupabaseDrawingBuilder<Row>;
  delete(): SupabaseDrawingBuilder<Row>;
  eq(column: string, value: string | number): SupabaseDrawingBuilder<Row>;
  is(column: string, value: null): SupabaseDrawingBuilder<Row>;
  order(column: string): SupabaseDrawingBuilder<Row>;
  maybeSingle(): PromiseLike<SupabaseResult<Row>>;
};

class MemorySupabase {
  readonly rows: Row[] = [];

  readonly client = {
    from: (_table: 'chart_drawings') => {
      let operation: Operation = 'select';
      let filters: Record<string, string | number | null> = {};
      let values: Partial<Row> = {};
      let ordering: string | null = null;

      const execute = (): {
        data: readonly Row[];
        error: { code?: string; message: string } | null;
      } => {
        const matches = (row: Row): boolean =>
          Object.entries(filters).every(([key, value]) => row[key as keyof Row] === value);
        const matching = this.rows.filter(matches);

        if (operation === 'insert') {
          const insert = values as Insert;
          if (
            this.rows.some(
              (row) =>
                row.user_id === insert.user_id &&
                row.instrument_id === insert.instrument_id &&
                row.drawing_id === insert.drawing_id,
            )
          ) {
            return { data: [], error: { code: '23505', message: 'duplicate key' } };
          }
          const timestamp = '2026-11-26T12:00:00.000Z';
          const row: Row = {
            user_id: insert.user_id ?? '',
            instrument_id: insert.instrument_id ?? '',
            drawing_id: insert.drawing_id ?? '',
            timeframe_scope: insert.timeframe_scope ?? null,
            payload: insert.payload ?? {},
            z_order: insert.z_order ?? 0,
            created_at: timestamp,
            updated_at: timestamp,
            revision: 1,
          };
          this.rows.push(row);
          return { data: [row], error: null };
        }

        if (operation === 'update') {
          const row = matching[0];
          if (row === undefined) return { data: [], error: null };
          Object.assign(row, values, {
            updated_at: '2026-11-26T12:01:00.000Z',
            revision: row.revision + 1,
          });
          return { data: [row], error: null };
        }

        if (operation === 'delete') {
          const row = matching[0];
          if (row === undefined) return { data: [], error: null };
          this.rows.splice(this.rows.indexOf(row), 1);
          return { data: [row], error: null };
        }

        const result = [...matching];
        if (ordering !== null) result.sort((a, b) => a.z_order - b.z_order);
        return { data: result, error: null };
      };

      const builder: SupabaseDrawingBuilder<Row> = {
        select: (_columns?: string) => builder,
        insert: (input: Insert) => {
          operation = 'insert';
          values = input;
          return builder;
        },
        update: (input: Partial<Row>) => {
          operation = 'update';
          values = input;
          return builder;
        },
        delete: () => {
          operation = 'delete';
          return builder;
        },
        eq: (column: string, value: string | number) => {
          filters = { ...filters, [column]: value };
          return builder;
        },
        is: (column: string, value: null) => {
          filters = { ...filters, [column]: value };
          return builder;
        },
        order: (column: string) => {
          ordering = column;
          return builder;
        },
        maybeSingle: async () => {
          const result = execute();
          return { data: result.data[0] ?? null, error: result.error };
        },
      };
      Object.defineProperty(builder, 'then', {
        value: <TResult1 = SupabaseResult<readonly Row[]>, TResult2 = never>(
          onfulfilled?:
            | ((value: SupabaseResult<readonly Row[]>) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): PromiseLike<TResult1 | TResult2> =>
          Promise.resolve(execute()).then(onfulfilled, onrejected),
      });
      return builder as SupabaseDrawingQuery<Row>;
    },
  } as unknown as SupabaseDrawingClient;
}

const scope: DrawingRepositoryScope = {
  owner: { kind: 'account', id: '00000000-0000-4000-8000-000000000001' },
  instrumentId: 'binance-spot:BTC-USDT',
  timeframe: '1h',
};

const drawing: SaveDrawingInput = {
  drawingId: '00000000-0000-4000-8000-000000000010',
  payload: {
    type: 'trend-line',
    start: { timestamp: 10, price: 100 },
    end: { timestamp: 20, price: 120 },
    color: '#60a5fa',
    lineWidth: 1.5,
    lineStyle: 'solid',
    locked: false,
    visible: true,
  },
  zOrder: 2,
};

describe('Supabase drawing repository', () => {
  it('persists rows and uses the server revision returned by the database', async () => {
    const database = new MemorySupabase();
    const repository = new SupabaseDrawingRepository(database.client);

    const saved = await repository.save(scope, drawing, null);

    expect(saved).toMatchObject({
      drawingId: drawing.drawingId,
      zOrder: 2,
      revision: 1,
      timeframeScope: '1h',
      createdAt: '2026-11-26T12:00:00.000Z',
    });
    expect(database.rows).toHaveLength(1);
  });

  it('combines global and current-timeframe drawings without leaking other timeframes', async () => {
    const database = new MemorySupabase();
    const repository = new SupabaseDrawingRepository(database.client);

    await repository.save(
      { ...scope, timeframe: null },
      { ...drawing, drawingId: '00000000-0000-4000-8000-000000000011' },
      null,
    );
    await repository.save(
      scope,
      { ...drawing, drawingId: '00000000-0000-4000-8000-000000000012' },
      null,
    );
    await repository.save(
      { ...scope, timeframe: '4h' },
      { ...drawing, drawingId: '00000000-0000-4000-8000-000000000013' },
      null,
    );

    expect((await repository.list(scope)).map((item) => item.drawingId)).toEqual([
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000012',
    ]);
  });

  it('increments revisions and rejects stale updates and deletes', async () => {
    const repository = new SupabaseDrawingRepository(new MemorySupabase().client);
    const first = await repository.save(scope, drawing, null);
    const second = await repository.save(scope, drawing, first.revision);

    expect(second.revision).toBe(2);
    await expect(repository.save(scope, drawing, first.revision)).rejects.toBeInstanceOf(
      DrawingRevisionConflictError,
    );
    await expect(
      repository.delete(scope, drawing.drawingId, first.revision),
    ).rejects.toBeInstanceOf(DrawingRevisionConflictError);
    await repository.delete(scope, drawing.drawingId, second.revision);
  });

  it('rejects anonymous owners and malformed drawings before making requests', async () => {
    const repository = new SupabaseDrawingRepository(new MemorySupabase().client);

    await expect(
      repository.list({
        ...scope,
        owner: { kind: 'anonymous', id: 'browser-1' },
      }),
    ).rejects.toThrow('authenticated account');
    await expect(repository.save(scope, { ...drawing, zOrder: -1 }, null)).rejects.toThrow(
      'z-order',
    );
    await expect(
      repository.save(scope, { ...drawing, drawingId: 'not-a-uuid' }, null),
    ).rejects.toThrow('UUID');
  });

  it('keeps account and instrument identity in every database query', async () => {
    const database = new MemorySupabase();
    const repository = new SupabaseDrawingRepository(database.client);

    await repository.save(scope, drawing, null);
    expect(
      await repository.list({
        ...scope,
        owner: { kind: 'account', id: '00000000-0000-4000-8000-000000000002' },
      }),
    ).toEqual([]);
    expect(await repository.list({ ...scope, instrumentId: 'okx-spot:BTC-USDT' })).toEqual([]);
  });
});
