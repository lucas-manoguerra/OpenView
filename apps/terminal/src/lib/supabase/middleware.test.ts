import type { APIContext } from 'astro';
import { describe, expect, it, vi } from 'vitest';
import { getAuthenticatedUser, hasSupabaseAuthCookie, isPublicRoute } from './middleware';
import { createServerClient } from './server';

vi.mock('./server', () => ({
  createServerClient: vi.fn(),
}));

describe('Supabase middleware helpers', () => {
  it('returns the verified claims nested in the Supabase response data', async () => {
    const claims = { sub: 'user-123', email: 'trader@example.com' };
    const getClaims = vi.fn().mockResolvedValue({ data: { claims }, error: null });
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getClaims },
    } as unknown as ReturnType<typeof createServerClient>);

    const context = {
      request: new Request('https://terminal.example/dashboard', {
        headers: { Cookie: 'sb-projectref-auth-token=valid-token' },
      }),
    } as APIContext;

    const result = await getAuthenticatedUser(context, new Headers());

    expect(result.user).toEqual(claims);
    expect(result.error).toBeNull();
    expect(getClaims).toHaveBeenCalledOnce();
  });

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

  it('keeps the terminal public while protecting account routes', () => {
    expect(isPublicRoute('/')).toBe(true);
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/component-lab')).toBe(true);
    expect(isPublicRoute('/component-lab/chart/controls')).toBe(true);
    expect(isPublicRoute('/auth/callback')).toBe(true);
    expect(isPublicRoute('/auth/callback/provider')).toBe(false);
    expect(isPublicRoute('/dashboard')).toBe(false);
    expect(isPublicRoute('/login-extra')).toBe(false);
    expect(isPublicRoute('/auth/signout')).toBe(false);
    expect(isPublicRoute('/register')).toBe(false);
    expect(isPublicRoute('/forgot-password')).toBe(false);
    expect(isPublicRoute('/reset-password')).toBe(false);
  });
});
