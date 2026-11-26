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
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function getAuthenticatedUser(context: APIContext, responseHeaders: Headers) {
  const supabase = createServerClient(context, responseHeaders);

  const { data: claims, error } = await supabase.auth.getClaims();

  if (error || !claims) {
    return { supabase, user: null, error };
  }

  return { supabase, user: claims, error: null };
}
