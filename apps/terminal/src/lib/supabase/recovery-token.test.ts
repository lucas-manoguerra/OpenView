import { describe, expect, it } from 'vitest';
import { getRecoveryTokenHash } from './recovery-token';

describe('getRecoveryTokenHash', () => {
  it('returns the recovery token hash from the URL search string', () => {
    expect(getRecoveryTokenHash('?token_hash=recovery-token&type=recovery')).toBe('recovery-token');
  });

  it('returns null when the URL has no recovery token hash', () => {
    expect(getRecoveryTokenHash('?type=recovery')).toBeNull();
    expect(getRecoveryTokenHash('')).toBeNull();
  });
});
