import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { createClient } from '../../lib/supabase/client';

export function ForgotPasswordForm() {
  const supabase: SupabaseClient<Database> = createClient();
  let email = '';
  let error: string | null = null;
  let success: string | null = null;
  let loading = false;

  async function handleSubmit(event: Event) {
    event.preventDefault();
    error = null;
    success = null;
    loading = true;
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (authError) throw authError;
      success =
        'Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al solicitar restablecimiento';
    } finally {
      loading = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} class="forgot-password-form">
      <h2>Restablecer contraseña</h2>
      {error && <div class="error-message">{error}</div>}
      {success && <div class="success-message">{success}</div>}
      {!success && (
        <>
          <p>Ingresa tu correo electrónico para recibir un enlace de restablecimiento.</p>
          <div class="field">
            <label>Correo electrónico</label>
            <input
              type="email"
              name="email"
              required
              onInput={(e) => {
                email = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar enlace'}
          </button>
          <p class="footer">
            ¿Ya tienes el enlace? <a href="/reset-password">Restablecer contraseña</a>
          </p>
        </>
      )}
    </form>
  );
}
