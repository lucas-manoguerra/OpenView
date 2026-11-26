import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';
import type {
  DrawingRepository,
  DrawingOwnerScope,
  DrawingRepositoryScope,
} from './drawing-repository';
import { createBrowserDrawingRepository } from './drawing-repository';
import { SupabaseDrawingRepository } from './supabase-drawing-repository';
import type { SupabaseDrawingClient } from './supabase-drawing-repository';

const ANONYMOUS_OWNER_ID = 'local-browser';

export type DrawingRepositoryKind = 'local' | 'remote';

export interface DrawingRepositorySelection {
  readonly kind: DrawingRepositoryKind;
  readonly repository: DrawingRepository;
  readonly owner: DrawingOwnerScope;
}

export function selectDrawingRepository(
  supabaseClient: SupabaseClient<Database>,
  userId: string | null,
): DrawingRepositorySelection {
  if (userId !== null) {
    return {
      kind: 'remote',
      repository: new SupabaseDrawingRepository(supabaseClient as unknown as SupabaseDrawingClient),
      owner: { kind: 'account', id: userId },
    };
  }

  const repository = createBrowserDrawingRepository();
  if (repository === null) {
    throw new Error('Local storage is not available for anonymous drawing persistence.');
  }

  return {
    kind: 'local',
    repository,
    owner: { kind: 'anonymous', id: ANONYMOUS_OWNER_ID },
  };
}

export function createRepositoryScope(
  owner: DrawingOwnerScope,
  instrumentId: string,
  timeframe: string | null,
): DrawingRepositoryScope {
  return {
    owner,
    instrumentId,
    timeframe,
  };
}
