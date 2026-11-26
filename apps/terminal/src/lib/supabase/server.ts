import type { APIContext } from 'astro';
import type { SupabaseClient as SupabaseJsClient } from '@supabase/supabase-js';
import { createServerClient as createSupabaseServerClient, parseCookieHeader } from '@supabase/ssr';
import type { Database } from './database.types';

export type ServerSupabaseClient = SupabaseJsClient<Database>;

export function createServerClient(context: APIContext): ServerSupabaseClient {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Missing Supabase configuration. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  return createSupabaseServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.request.headers.get('Cookie') ?? '');
      },
      setAll(cookiesToSet: Array<{ name: string; value: string }>) {
        cookiesToSet.forEach(({ name, value }) => {
          context.cookies.set(name, value, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
          });
        });
      },
    },
  }) as ServerSupabaseClient;
}
