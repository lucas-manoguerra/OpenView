import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient as SupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type BrowserSupabaseClient = SupabaseJsClient<Database>;

export function createClient(): BrowserSupabaseClient {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Missing Supabase configuration. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
