import type { APIContext } from 'astro';
import { createServerClient } from '../../lib/supabase/server';

function getSafeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  return value;
}

export async function GET(context: APIContext) {
  const requestUrl = new URL(context.request.url);
  const code = requestUrl.searchParams.get('code');
  const next = getSafeRedirectPath(requestUrl.searchParams.get('next'));

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
