export function getRecoveryTokenHash(search: string): string | null {
  return new URLSearchParams(search).get('token_hash');
}
