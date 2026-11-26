import { describe, expect, it } from 'vitest';
import { getRecoveryTokenHash } from './recovery-token';

describe('getRecoveryTokenHash', () => {
  it('returns the recovery token hash from the URL search string', () => {
    expect(getRecoveryTokenHash('?token_hash=recovery-token&type=recovery')).toBe('recovery-token');
  });

  it('rejects missing token hashes and non-recovery token types', () => {
    expect(getRecoveryTokenHash('?type=recovery')).toBeNull();
    expect(getRecoveryTokenHash('?token_hash=signup-token&type=signup')).toBeNull();
    expect(getRecoveryTokenHash('?token_hash=invite-token&type=invite')).toBeNull();
    expect(getRecoveryTokenHash('?token_hash=recovery-token')).toBeNull();
    expect(getRecoveryTokenHash('')).toBeNull();
  });
});
