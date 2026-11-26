import { useMemo, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { createClient } from '../../lib/supabase/client';

export function LoginForm() {
  const supabase: SupabaseClient<Database> = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de inicio de sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="login-form">
      <h2>Iniciar sesión</h2>
      {error && (
        <div class="error-message" role="alert">
          {error}
        </div>
      )}
      <div class="field">
        <label htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onInput={(event) => setEmail((event.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <div class="field">
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          value={password}
          onInput={(event) => setPassword((event.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
      </button>
      <p class="footer">
        ¿No tienes cuenta? <a href="/register">Regístrate</a>
      </p>
    </form>
  );
}
