import { describe, expect, it } from 'vitest';
import { hasSupabaseAuthCookie, isPublicRoute } from './middleware';

describe('Supabase middleware helpers', () => {
  it('does not require remote auth validation when no Supabase session cookie exists', () => {
    expect(hasSupabaseAuthCookie(null)).toBe(false);
    expect(hasSupabaseAuthCookie('')).toBe(false);
    expect(hasSupabaseAuthCookie('theme=dark; locale=es')).toBe(false);
  });

  it('recognizes the Supabase auth cookie and chunked session cookies', () => {
    expect(hasSupabaseAuthCookie('sb-projectref-auth-token=token')).toBe(true);
    expect(hasSupabaseAuthCookie('theme=dark; sb-projectref-auth-token.0=chunk')).toBe(true);
  });

  it('does not treat unrelated or malformed cookies as an authenticated session', () => {
    expect(hasSupabaseAuthCookie('sb-projectref-auth-token-old=token')).toBe(false);
    expect(hasSupabaseAuthCookie('sb-projectref-auth-tokenx=token')).toBe(false);
    expect(hasSupabaseAuthCookie('sb-projectref-auth-token.abc=chunk')).toBe(false);
  });

  it('classifies authentication entry points as public without widening route matches', () => {
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/auth/callback/provider')).toBe(true);
    expect(isPublicRoute('/dashboard')).toBe(false);
    expect(isPublicRoute('/login-extra')).toBe(false);
  });
});
