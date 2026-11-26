import { describe, expect, it } from 'vitest';
import { getSafeRedirectPath } from './safe-redirect';

describe('getSafeRedirectPath', () => {
  const origin = 'https://terminal.example';

  it('allows same-origin absolute paths with query and hash', () => {
    expect(getSafeRedirectPath('/dashboard?tab=charts#watchlist', origin)).toBe(
      '/dashboard?tab=charts#watchlist',
    );
  });

  it('falls back for missing, relative and protocol-relative destinations', () => {
    expect(getSafeRedirectPath(null, origin)).toBe('/dashboard');
    expect(getSafeRedirectPath('dashboard', origin)).toBe('/dashboard');
    expect(getSafeRedirectPath('//attacker.example/path', origin)).toBe('/dashboard');
  });

  it('rejects backslash-based external destinations', () => {
    expect(getSafeRedirectPath('/\\\\attacker.example/path', origin)).toBe('/dashboard');
    expect(getSafeRedirectPath('/\\attacker.example/path', origin)).toBe('/dashboard');
  });

  it('rejects any destination that resolves to another origin', () => {
    expect(getSafeRedirectPath('https://attacker.example/path', origin)).toBe('/dashboard');
  });
});
