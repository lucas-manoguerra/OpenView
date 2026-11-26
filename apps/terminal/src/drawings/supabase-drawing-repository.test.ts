import { describe, expect, it } from 'vitest';
import type { Database } from '../lib/supabase/database.types';
import {
  DrawingRevisionConflictError,
  type DrawingRepositoryScope,
  type SaveDrawingInput,
} from './drawing-repository';
import { SupabaseDrawingRepository } from './supabase-drawing-repository';

type DrawingRow = Database['public']['Tables']['chart_drawings']['Row'];

type MockResponseData<T> = Readonly<{
  data: readonly T[] | T | null;
  error: { code?: string; message: string } | null;
}>;

type MockQuery<T> = {
  data: readonly T[] | T | null;
  error: { code?: string; message: string } | null;
  selectCalls: string[];
  insertCalls: unknown[];
  updateCalls: unknown[];
  deleteCalls: unknown[];
  eqFilters: Array<{ column: string; value: string | number }>;
  isFilters: Array<{ column: string; value: null }>;
  orderCalls: Array<{ column: string; ascending: boolean | undefined }>;
  callCount: number;
  maybeSingleResponses: MockResponseData<T>[];
  from: (table: string) => MockQuery<T>;
  select: () => MockQuery<T>;
  insert: (values: unknown) => MockQuery<T>;
  update: (values: unknown) => MockQuery<T>;
  delete: () => MockQuery<T>;
  eq: (column: string, value: string | number) => MockQuery<T>;
  is: (column: string, value: null) => MockQuery<T>;
  order: (column: string, options?: Readonly<{ ascending?: boolean }>) => MockQuery<T>;
  maybeSingle: () => Promise<MockResponseData<T>>;
};

function createMockQuery<T>(): MockQuery<T> {
  const query: MockQuery<T> = {
    data: null,
    error: null,
    selectCalls: [],
    insertCalls: [],
    updateCalls: [],
    deleteCalls: [],
    eqFilters: [],
    isFilters: [],
    orderCalls: [],
    callCount: 0,
    maybeSingleResponses: [],
    from: () => query,
    select: () => {
      query.selectCalls.push('*');
      query.callCount += 1;
      return query;
    },
    insert: (values: unknown) => {
      query.insertCalls.push(values);
      query.callCount += 1;
      return query;
    },
    update: (values: unknown) => {
      query.updateCalls.push(values);
      query.callCount += 1;
      return query;
    },
    delete: () => {
      query.deleteCalls.push(true);
      query.callCount += 1;
      return query;
    },
    eq: (column: string, value: string | number) => {
      query.eqFilters.push({ column, value });
      query.callCount += 1;
      return query;
    },
    is: (column: string, value: null) => {
      query.isFilters.push({ column, value });
      query.callCount += 1;
      return query;
    },
    order: (column: string, options?: Readonly<{ ascending?: boolean }>) => {
      query.orderCalls.push({ column, ascending: options?.ascending });
      query.callCount += 1;
      return query;
    },
    maybeSingle: async () => {
      query.callCount += 1;
      if (query.maybeSingleResponses.length > 0) {
        return query.maybeSingleResponses.shift()!;
      }
      return { data: query.data, error: query.error };
    },
  };
  return query;
}

function createMockClient<T>(): MockQuery<T> {
  return createMockQuery<T>();
}

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_DRAWING_ID = '660e8400-e29b-41d4-a716-446655440001';
const TEST_DRAWING_ID_2 = '660e8400-e29b-41d4-a716-446655440002';

const makeRow = (overrides: Partial<DrawingRow> = {}): DrawingRow => ({
  created_at: '2026-01-01T00:00:00Z',
  drawing_id: TEST_DRAWING_ID,
  instrument_id: 'binance-spot:BTC-USDT',
  payload: {
    type: 'horizontal-line',
    start: { timestamp: 1000, price: 50000 },
    end: null,
    color: '#ff0000',
  },
  revision: 1,
  timeframe_scope: null,
  updated_at: '2026-01-01T00:00:00Z',
  user_id: TEST_USER_ID,
  z_order: 0,
  ...overrides,
});

const makeScope = (overrides: Partial<DrawingRepositoryScope> = {}): DrawingRepositoryScope => ({
  owner: { kind: 'account', id: TEST_USER_ID },
  instrumentId: 'binance-spot:BTC-USDT',
  timeframe: null,
  ...overrides,
});

const makeSaveInput = (overrides: Partial<SaveDrawingInput> = {}): SaveDrawingInput => ({
  drawingId: TEST_DRAWING_ID_2,
  payload: {
    type: 'horizontal-line',
    start: { timestamp: 1000, price: 50000 },
    end: null,
    color: '#ff0000',
  },
  zOrder: 0,
  ...overrides,
});

describe('SupabaseDrawingRepository', () => {
  describe('list', () => {
    it('returns drawings filtered by user, instrument, and timeframe', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      client.data = [makeRow({ timeframe_scope: null }), makeRow({ timeframe_scope: '1m' })];
      client.error = null;

      const drawings = await repository.list(makeScope());

      expect(client.selectCalls).toHaveLength(1);
      expect(client.eqFilters).toContainEqual({ column: 'user_id', value: TEST_USER_ID });
      expect(client.eqFilters).toContainEqual({
        column: 'instrument_id',
        value: 'binance-spot:BTC-USDT',
      });
      expect(client.orderCalls).toContainEqual({ column: 'z_order', ascending: true });
      expect(drawings).toHaveLength(1);
      expect(drawings[0]?.timeframeScope).toBeNull();
    });

    it('throws on Supabase error', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      client.data = null;
      client.error = { code: 'PGRST101', message: 'connection error' };

      await expect(repository.list(makeScope())).rejects.toThrow('connection error');
    });

    it('throws when scope owner is not account', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      await expect(
        repository.list({
          owner: { kind: 'anonymous', id: 'local-browser' },
          instrumentId: 'binance-spot:BTC-USDT',
          timeframe: null,
        }),
      ).rejects.toThrow(RangeError);
    });
  });

  describe('save', () => {
    it('inserts a new drawing and returns the saved row', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      const savedRow = makeRow({ drawing_id: TEST_DRAWING_ID_2, revision: 1 });
      client.data = savedRow;
      client.error = null;

      const saved = await repository.save(makeScope(), makeSaveInput(), null);

      expect(client.insertCalls).toHaveLength(1);
      expect(saved.drawingId).toBe(TEST_DRAWING_ID_2);
      expect(saved.revision).toBe(1);
    });

    it('throws revision conflict on duplicate key (23505)', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      client.maybeSingleResponses = [
        { data: null, error: { code: '23505', message: 'duplicate key' } },
        { data: makeRow({ revision: 3 }), error: null },
      ];

      await expect(repository.save(makeScope(), makeSaveInput(), null)).rejects.toThrow(
        DrawingRevisionConflictError,
      );
    });

    it('updates an existing drawing with expected revision', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      const updatedRow = makeRow({ drawing_id: TEST_DRAWING_ID, revision: 2 });
      client.data = updatedRow;
      client.error = null;

      const saved = await repository.save(
        makeScope(),
        { ...makeSaveInput(), drawingId: TEST_DRAWING_ID },
        1,
      );

      expect(client.updateCalls).toHaveLength(1);
      expect(client.eqFilters).toContainEqual({ column: 'revision', value: 1 });
      expect(saved.revision).toBe(2);
    });

    it('throws revision conflict when update affects no rows', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      client.data = null;
      client.error = null;

      await expect(
        repository.save(makeScope(), { ...makeSaveInput(), drawingId: TEST_DRAWING_ID }, 5),
      ).rejects.toThrow(DrawingRevisionConflictError);
    });

    it('validates drawing UUID and payload', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      await expect(
        repository.save(
          makeScope(),
          { drawingId: 'not-a-uuid', payload: makeSaveInput().payload, zOrder: 0 },
          null,
        ),
      ).rejects.toThrow(RangeError);
    });
  });

  describe('delete', () => {
    it('deletes a drawing with expected revision', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      client.data = makeRow({ revision: 1 });
      client.error = null;

      await repository.delete(makeScope(), TEST_DRAWING_ID, 1);

      expect(client.deleteCalls).toHaveLength(1);
      expect(client.eqFilters).toContainEqual({ column: 'revision', value: 1 });
    });

    it('throws revision conflict when delete affects no rows', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      client.data = null;
      client.error = null;

      await expect(repository.delete(makeScope(), TEST_DRAWING_ID, 5)).rejects.toThrow(
        DrawingRevisionConflictError,
      );
    });
  });

  describe('timeframe scope', () => {
    it('filters drawings by timeframe scope when querying', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      client.data = [
        makeRow({ timeframe_scope: '1m' }),
        makeRow({ timeframe_scope: '5m' }),
        makeRow({ timeframe_scope: null }),
      ];
      client.error = null;

      const drawings = await repository.list(makeScope({ timeframe: '1m' }));

      expect(drawings).toHaveLength(2);
      expect(drawings.map((d) => d.timeframeScope)).toContain('1m');
      expect(drawings.map((d) => d.timeframeScope)).toContain(null);
    });

    it('uses IS NULL filter for timeframe in update save', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      client.maybeSingleResponses = [{ data: makeRow({ revision: 1 }), error: null }];

      await repository.save(
        makeScope({ timeframe: null }),
        { ...makeSaveInput(), drawingId: TEST_DRAWING_ID },
        1,
      );

      expect(client.isFilters).toContainEqual({ column: 'timeframe_scope', value: null });
    });

    it('uses EQ filter for timeframe in update save', async () => {
      const client = createMockClient<DrawingRow>();
      const repository = new SupabaseDrawingRepository(client as never);

      client.maybeSingleResponses = [{ data: makeRow({ revision: 1 }), error: null }];

      await repository.save(
        makeScope({ timeframe: '1h' }),
        { ...makeSaveInput(), drawingId: TEST_DRAWING_ID },
        1,
      );

      expect(client.eqFilters).toContainEqual({ column: 'timeframe_scope', value: '1h' });
    });
  });
});
