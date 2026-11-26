# Supabase Auth configuration for Terminal

Terminal uses Supabase SSR with the PKCE flow. Configure the hosted Supabase project as follows before enabling email authentication in a deployed environment.

## Redirect URLs

Add the deployed Terminal origin's following URL to **Authentication → URL Configuration → Redirect URLs**:

- `https://YOUR_TERMINAL_HOST/auth/callback`
- The matching local development callback, for example `http://localhost:4321/auth/callback`

The registration form passes `/auth/callback?next=/dashboard` as `emailRedirectTo`. The callback exchanges the PKCE authorization code on the server and writes the resulting session cookies.

Keep the Site URL set to the canonical Terminal origin. Do not add broad wildcard redirects unless the deployment model requires them.

## Signup confirmation email

The signup flow uses Supabase's standard confirmation URL (`{{ .ConfirmationURL }}`). The redirect destination is supplied by the registration form and must be allowed by Redirect URLs above.

## Password recovery email

The recovery form calls `resetPasswordForEmail` with an absolute redirect URL ending in `/reset-password`. Configure **Authentication → Email Templates → Reset Password** to send the token hash directly to that URL:

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

- Confirm the deployed and local callback URLs are allow-listed.
- Send a signup confirmation and verify it returns through `/auth/callback` to the dashboard with an authenticated session.
- Send a password recovery email and verify its link opens `/reset-password?token_hash=...&type=recovery`.
- Verify expired and reused recovery links are rejected.
- Verify signing out clears the SSR session cookies.

Never place a Supabase service-role or secret key in browser-exposed environment variables.
