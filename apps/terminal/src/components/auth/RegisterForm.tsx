import { useMemo, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { createClient } from '../../lib/supabase/client';

export function RegisterForm() {
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
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de registro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="register-form">
      <h2>Crear cuenta</h2>
      {error && <div class="error-message" role="alert">{error}</div>}
      <div class="field">
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" type="email" name="email" required autoComplete="email" value={email} onInput={(event) => setEmail((event.currentTarget as HTMLInputElement).value)} />
      </div>
      <div class="field">
        <label htmlFor="password">Contraseña</label>
        <input id="password" type="password" name="password" required minLength={8} autoComplete="new-password" value={password} onInput={(event) => setPassword((event.currentTarget as HTMLInputElement).value)} />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>
      <p class="footer">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></p>
    </form>
  );
}
