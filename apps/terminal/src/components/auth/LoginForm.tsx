import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { createClient } from '../../lib/supabase/client';

export function LoginForm() {
  const supabase: SupabaseClient<Database> = createClient();
  let email = '';
  let password = '';
  let error: string | null = null;
  let loading = false;

  async function handleSubmit(event: Event) {
    event.preventDefault();
    error = null;
    loading = true;
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw authError;
      window.location.href = '/dashboard';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error de inicio de sesión';
    } finally {
      loading = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} class="login-form">
      <h2>Iniciar sesión</h2>
      {error && <div class="error-message">{error}</div>}
      <div class="field">
        <label htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          type="email"
          name="email"
          required
          onInput={(e) => {
            email = (e.target as HTMLInputElement).value;
          }}
        />
      </div>
      <div class="field">
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          name="password"
          required
          onInput={(e) => {
            password = (e.target as HTMLInputElement).value;
          }}
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
