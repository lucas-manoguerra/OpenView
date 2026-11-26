import type { APIContext } from 'astro';
import { createServerClient } from '../../lib/supabase/server';

export async function POST(context: APIContext) {
  const responseHeaders = new Headers();
  const supabase = createServerClient(context, responseHeaders);
  await supabase.auth.signOut();
  responseHeaders.set('Location', '/login');
  return new Response(null, {
    status: 303,
    headers: responseHeaders,
  });
}
