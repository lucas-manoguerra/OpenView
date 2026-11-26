import type { APIContext } from 'astro';
import { createServerClient } from '../../lib/supabase/server';
import { isPublicRoute, getAuthenticatedUser } from '../../lib/supabase/middleware';

export interface UserSessionProps {
  user: { sub: string; email?: string } | null;
}

export function UserSession({ user }: UserSessionProps) {
  return (
    <div class="user-session">
      {user ? (
        <>
          <span>Sesión: {user.email}</span>
          <form action="/auth/signout" method="POST">
            <button type="submit">Cerrar sesión</button>
          </form>
        </>
      ) : (
        <span>No autenticado</span>
      )}
    </div>
  );
}

export async function getUserSession(context: APIContext) {
  const { pathname } = new URL(context.request.url);
  if (isPublicRoute(pathname)) {
    return null;
  }
  const { user } = await getAuthenticatedUser(context);
  return user;
}
