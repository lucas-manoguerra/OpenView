import { defineMiddleware } from 'astro:middleware';
import { getAuthenticatedUser, isPublicRoute } from './lib/supabase/middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context.request;
  const pathname = new URL(url).pathname;

  if (
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)
  ) {
    return await next();
  }

  const { user, error } = await getAuthenticatedUser(context);

  if (error && !user) {
    return await next();
  }

  if (isPublicRoute(pathname)) {
    if (user) {
      return context.redirect('/dashboard');
    }
    return await next();
  }

  if (!user) {
    return context.redirect('/login');
  }

  return await next();
});
