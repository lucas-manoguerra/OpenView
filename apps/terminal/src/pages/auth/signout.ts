import type { APIContext } from 'astro';
import { createServerClient } from '../../lib/supabase/server';

export async function POST(context: APIContext) {
  const supabase = createServerClient(context);
  await supabase.auth.signOut();
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
    },
  });
}
