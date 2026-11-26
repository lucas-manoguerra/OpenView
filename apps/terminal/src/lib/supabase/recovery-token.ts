export function getRecoveryTokenHash(search: string): string | null {
  const params = new URLSearchParams(search);

  if (params.get('type') !== 'recovery') {
    return null;
  }

  return params.get('token_hash');
}
