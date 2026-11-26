import type { APIContext } from 'astro';
import { getSafeRedirectPath } from '../../lib/supabase/safe-redirect';
import { createServerClient } from '../../lib/supabase/server';

export async function GET(context: APIContext) {
  const requestUrl = new URL(context.request.url);
  const code = requestUrl.searchParams.get('code');
  const next = getSafeRedirectPath(requestUrl.searchParams.get('next'), requestUrl.origin);

  if (!code) {
    return context.redirect('/login?error=auth_callback', 303);
  }

  const responseHeaders = new Headers();
  const supabase = createServerClient(context, responseHeaders);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return context.redirect('/login?error=auth_callback', 303);
  }

  const response = context.redirect(next, 303);
  responseHeaders.forEach((value, name) => {
    response.headers.set(name, value);
  });
  return response;
}
