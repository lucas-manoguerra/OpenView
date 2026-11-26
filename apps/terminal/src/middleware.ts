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

  const responseHeaders = new Headers();
  const { user } = await getAuthenticatedUser(context, responseHeaders);

  let response: Response;

  if (isPublicRoute(pathname)) {
    response = user ? context.redirect('/dashboard') : await next();
  } else if (!user) {
    response = context.redirect('/login');
  } else {
    response = await next();
  }

  responseHeaders.forEach((value, name) => {
    response.headers.set(name, value);
  });

  return response;
});
