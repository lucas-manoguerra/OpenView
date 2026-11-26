import { useMemo, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { createClient } from '../../lib/supabase/client';

export function ForgotPasswordForm() {
  const supabase: SupabaseClient<Database> = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (authError) throw authError;
      setSuccess('Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al solicitar restablecimiento');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="forgot-password-form">
      <h2>Restablecer contraseña</h2>
      {error && <div class="error-message" role="alert">{error}</div>}
      {success && <div class="success-message" role="status">{success}</div>}
      {!success && (
        <>
          <p>Ingresa tu correo electrónico para recibir un enlace de restablecimiento.</p>
          <div class="field">
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" name="email" required autoComplete="email" value={email} onInput={(event) => setEmail((event.currentTarget as HTMLInputElement).value)} />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar enlace'}
          </button>
          <p class="footer">¿Ya tienes el enlace? <a href="/reset-password">Restablecer contraseña</a></p>
        </>
      )}
    </form>
  );
}
