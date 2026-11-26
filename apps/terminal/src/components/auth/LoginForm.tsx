import type { SupabaseClient } from '@supabase/supabase-js';
import { useMemo, useState } from 'preact/hooks';
import { createClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

export function LoginForm() {
  const supabase: SupabaseClient<Database> = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });

      if (authError) {
        throw authError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google');
      setLoading(false);
    }
  }

  return (
    <section class="login-form" aria-labelledby="login-title">
      <h2 id="login-title">Iniciar sesión en OpenView</h2>
      <p>Accede de forma segura con tu cuenta de Google.</p>
      {error && (
        <div class="error-message" role="alert">
          {error}
        </div>
      )}
      <button type="button" onClick={handleGoogleSignIn} disabled={loading}>
        {loading ? 'Redirigiendo a Google…' : 'Continuar con Google'}
      </button>
    </section>
  );
}
