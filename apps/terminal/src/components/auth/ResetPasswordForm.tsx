import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { createClient } from '../../lib/supabase/client';

export function ResetPasswordForm() {
  const supabase: SupabaseClient<Database> = createClient();
  const tokenHash =
    typeof window === 'undefined'
      ? null
      : new URL(window.location.href).searchParams.get('token_hash');
  let password = '';
  let confirmPassword = '';
  let error: string | null = null;
  let success: string | null = null;
  let loading = false;
  let tokenValid = false;
  let verifying = true;

  async function verifyToken() {
    if (!tokenHash) {
      error = 'No se proporcionó un token de restablecimiento.';
      verifying = false;
      return;
    }
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (verifyError) throw verifyError;
      tokenValid = true;
    } catch {
      tokenValid = false;
      error = 'El enlace de restablecimiento no es válido o ha expirado.';
    } finally {
      verifying = false;
    }
  }

  if (typeof window !== 'undefined') {
    verifyToken();
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    error = null;
    loading = true;
    if (password !== confirmPassword) {
      error = 'Las contraseñas no coinciden.';
      loading = false;
      return;
    }
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      success = 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al actualizar contraseña';
    } finally {
      loading = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} class="reset-password-form">
      <h2>Restablecer contraseña</h2>
      {error && <div class="error-message">{error}</div>}
      {success && <div class="success-message">{success}</div>}
      {!success && verifying && <p>Verificando enlace de restablecimiento...</p>}
      {!success && !verifying && tokenValid && (
        <>
          <p>Ingresa tu nueva contraseña.</p>
          <div class="field">
            <label htmlFor="password">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              name="password"
              required
              minLength={8}
              onInput={(e) => {
                password = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <div class="field">
            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              required
              minLength={8}
              onInput={(e) => {
                confirmPassword = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </>
      )}
      {!success && !verifying && !tokenValid && !error && (
        <p>Verificando enlace de restablecimiento...</p>
      )}
    </form>
  );
}
