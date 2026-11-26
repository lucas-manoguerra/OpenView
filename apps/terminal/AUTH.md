# Supabase Auth configuration for Terminal

Terminal uses Supabase SSR with the PKCE flow. Configure the hosted Supabase project before enabling email authentication in a deployed environment.

## Local environment

Copy `apps/terminal/.env.example` to `apps/terminal/.env` and replace the placeholders with the project's Supabase URL and publishable key. The app reads `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` in both browser and server clients. These are public client configuration values; never put a Supabase service-role or secret key in this file. Keep `.env` untracked and commit only `.env.example`.

## Hosted URL configuration

In **Supabase Dashboard → Authentication → URL Configuration**, set the Site URL to the canonical deployed Terminal origin:

```text
https://openview-terminal.developer-spoonacular-004.workers.dev/
```

Add these exact entries to **Redirect URLs**:

```text
https://openview-terminal.developer-spoonacular-004.workers.dev/auth/callback
https://openview-terminal.developer-spoonacular-004.workers.dev/reset-password
http://localhost:4321/auth/callback
http://localhost:4321/reset-password
```

The registration form passes `/auth/callback?next=/dashboard` as `emailRedirectTo`. The callback exchanges the PKCE authorization code on the server and writes the resulting session cookies. The recovery form passes the absolute `/reset-password` URL as `redirectTo`.

Keep the Site URL set to the canonical Terminal origin. Do not add broad wildcard redirects unless the deployment model requires them.

## Signup confirmation email

The signup flow uses Supabase's standard confirmation URL (`{{ .ConfirmationURL }}`). The redirect destination is supplied by the registration form and must be allowed by Redirect URLs above.

## Password recovery email

In **Supabase Dashboard → Authentication → Email Templates → Reset Password**, use this template so the one-time token hash is delivered to the redirect destination:

```html
<h2>Restablecer contraseña</h2>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
<p>
  <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">
    Elegir una nueva contraseña
  </a>
</p>
<p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
```

The resulting URL must contain both `token_hash` and `type=recovery`. The reset form verifies that one-time token with `verifyOtp` before calling `updateUser`.

Do not use the default `{{ .ConfirmationURL }}` link for this custom token-hash reset form: the form explicitly expects the token hash in the query string.

## Verification checklist

- Confirm the deployed and local callback and reset URLs are allow-listed.
- Send a signup confirmation and verify it returns through `/auth/callback` to the dashboard with an authenticated session.
- Send a password recovery email and verify its link opens `/reset-password?token_hash=...&type=recovery`.
- Verify expired and reused recovery links are rejected.
- Verify signing out clears the SSR session cookies.

Never place a Supabase service-role or secret key in browser-exposed environment variables.
