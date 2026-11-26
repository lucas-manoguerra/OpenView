import type { APIContext } from 'astro';
import { createServerClient } from './server';

export const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/auth/callback',
  '/forgot-password',
  '/reset-password',
];

export function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') {
    return true;
  }

  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function hasSupabaseAuthCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) {
    return false;
  }

  return cookieHeader.split(';').some((cookie) => {
    const separatorIndex = cookie.indexOf('=');
    const name = (separatorIndex === -1 ? cookie : cookie.slice(0, separatorIndex)).trim();

    return /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i.test(name);
  });
}

export async function getAuthenticatedUser(context: APIContext, responseHeaders: Headers) {
  if (!hasSupabaseAuthCookie(context.request.headers.get('Cookie'))) {
    return { supabase: null, user: null, error: null };
  }

  const supabase = createServerClient(context, responseHeaders);
  const { data: claims, error } = await supabase.auth.getClaims();

  if (error || !claims) {
    return { supabase, user: null, error };
  }

  return { supabase, user: claims, error: null };
}
