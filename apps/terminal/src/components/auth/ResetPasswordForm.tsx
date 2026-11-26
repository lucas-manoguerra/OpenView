import { useEffect, useMemo, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { createClient } from '../../lib/supabase/client';
import { getRecoveryTokenHash } from '../../lib/supabase/recovery-token';

export function ResetPasswordForm() {
  const supabase: SupabaseClient<Database> = useMemo(() => createClient(), []);
  const tokenHash = typeof window === 'undefined' ? null : getRecoveryTokenHash(window.location.search);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    let active = true;

    async function verifyToken() {
      if (!tokenHash) {
        setError('No se proporcionó un token de restablecimiento.');
        setVerifying(false);
        return;
      }
      try {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (verifyError) throw verifyError;
        if (active) setTokenValid(true);
      } catch {
        if (active) {
          setTokenValid(false);
          setError('El enlace de restablecimiento no es válido o ha expirado.');
        }
      } finally {
        if (active) setVerifying(false);
      }
    }

    void verifyToken();
    return () => {
      active = false;
    };
  }, [supabase, tokenHash]);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess('Contraseña actualizada correctamente. Ya puedes iniciar sesión.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar contraseña');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="reset-password-form">
      <h2>Restablecer contraseña</h2>
      {error && <div class="error-message" role="alert">{error}</div>}
      {success && <div class="success-message" role="status">{success}</div>}
      {!success && verifying && <p>Verificando enlace de restablecimiento...</p>}
      {!success && !verifying && tokenValid && (
        <>
          <p>Ingresa tu nueva contraseña.</p>
          <div class="field">
            <label htmlFor="password">Nueva contraseña</label>
            <input id="password" type="password" name="password" required minLength={8} autoComplete="new-password" value={password} onInput={(event) => setPassword((event.currentTarget as HTMLInputElement).value)} />
          </div>
          <div class="field">
            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input id="confirmPassword" type="password" name="confirmPassword" required minLength={8} autoComplete="new-password" value={confirmPassword} onInput={(event) => setConfirmPassword((event.currentTarget as HTMLInputElement).value)} />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </>
      )}
    </form>
  );
}
