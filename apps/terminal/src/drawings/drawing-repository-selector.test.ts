import { describe, expect, it } from 'vitest';
import type { Database } from '../lib/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DrawingOwnerScope } from './drawing-repository';
import { LocalStorageDrawingRepository } from './drawing-repository';
import { selectDrawingRepository, createRepositoryScope } from './drawing-repository-selector';
import { SupabaseDrawingRepository } from './supabase-drawing-repository';

const createMockStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value);
    },
    removeItem: (key: string): void => {
      values.delete(key);
    },
  };
};

Object.defineProperty(globalThis, 'window', {
  value: {
    localStorage: createMockStorage(),
  },
  writable: true,
});

const createMockSupabaseClient = (): SupabaseClient<Database> => {
  return {
    from: () => ({}) as never,
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } }, error: null }),
    },
  } as unknown as SupabaseClient<Database>;
};

describe('selectDrawingRepository', () => {
  it('returns local repository for anonymous user', () => {
    const supabase = createMockSupabaseClient();
    const selection = selectDrawingRepository(supabase, null);

    expect(selection.kind).toBe('local');
    expect(selection.owner).toEqual({ kind: 'anonymous', id: 'local-browser' });
    expect(selection.repository).toBeInstanceOf(LocalStorageDrawingRepository);
  });

  it('returns remote repository for authenticated user', () => {
    const supabase = createMockSupabaseClient();
    const selection = selectDrawingRepository(supabase, 'user-123');

    expect(selection.kind).toBe('remote');
    expect(selection.owner).toEqual({ kind: 'account', id: 'user-123' });
    expect(selection.repository).toBeInstanceOf(SupabaseDrawingRepository);
  });

  it('uses different owners for different users', () => {
    const supabase = createMockSupabaseClient();
    const selectionA = selectDrawingRepository(supabase, 'user-a');
    const selectionB = selectDrawingRepository(supabase, 'user-b');

    expect(selectionA.owner.id).toBe('user-a');
    expect(selectionB.owner.id).toBe('user-b');
    expect(selectionA.owner.id).not.toBe(selectionB.owner.id);
  });

  it('creates a new repository instance per call', () => {
    const supabase = createMockSupabaseClient();
    const selectionA = selectDrawingRepository(supabase, 'user-1');
    const selectionB = selectDrawingRepository(supabase, 'user-1');

    expect(selectionA.repository).not.toBe(selectionB.repository);
  });
});

describe('createRepositoryScope', () => {
  it('creates scope with account owner', () => {
    const owner: DrawingOwnerScope = { kind: 'account', id: 'user-1' };
    const scope = createRepositoryScope(owner, 'binance-spot:BTC-USDT', '1m');

    expect(scope.owner).toEqual(owner);
    expect(scope.instrumentId).toBe('binance-spot:BTC-USDT');
    expect(scope.timeframe).toBe('1m');
  });

  it('creates scope with anonymous owner and null timeframe', () => {
    const owner: DrawingOwnerScope = { kind: 'anonymous', id: 'local-browser' };
    const scope = createRepositoryScope(owner, 'binance-spot:BTC-USDT', null);

    expect(scope.owner).toEqual(owner);
    expect(scope.instrumentId).toBe('binance-spot:BTC-USDT');
    expect(scope.timeframe).toBeNull();
  });
});
