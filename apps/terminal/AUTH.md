# Configuración de autenticación de Supabase para Terminal

Terminal utiliza Supabase SSR (renderizado del lado del servidor) con el flujo PKCE. Antes de habilitar el acceso por correo electrónico en un entorno publicado, configura el proyecto de Supabase siguiendo estos pasos.

## 1. Configurar las variables del entorno local

1. Copia el archivo `apps/terminal/.env.example` y crea `apps/terminal/.env`.
2. Abre `apps/terminal/.env` y reemplaza los valores de ejemplo por la URL y la clave publicable de tu proyecto de Supabase.
3. Comprueba que estén definidas estas dos variables:

```dotenv
PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_reemplazar_por_tu_clave
```

La aplicación utiliza estas variables tanto en el navegador como en el servidor. Son datos de configuración públicos. **Nunca** coloques una clave `service_role` ni una clave secreta de Supabase en este archivo. El archivo `.env` debe permanecer fuera de Git; solamente se versiona `.env.example`.

## 2. Configurar las direcciones permitidas en Supabase

1. Entra al [panel de Supabase](https://supabase.com/dashboard).
2. Selecciona el proyecto de OpenView.
3. En el menú lateral, entra en **Autenticación (Authentication)**.
4. Abre **Configuración de URL (URL Configuration)**.
5. En **URL del sitio (Site URL)**, coloca exactamente esta dirección:

```text
https://openview-terminal.developer-spoonacular-004.workers.dev/
```

6. En **Direcciones de redirección (Redirect URLs)**, agrega estas cuatro direcciones, una por una:

```text
https://openview-terminal.developer-spoonacular-004.workers.dev/auth/callback
https://openview-terminal.developer-spoonacular-004.workers.dev/reset-password
http://localhost:4321/auth/callback
http://localhost:4321/reset-password
```

7. Guarda los cambios.

**Importante:** conserva la URL del sitio con el dominio principal de Terminal. No agregues comodines ni direcciones demasiado amplias si no son necesarios.

La pantalla de registro envía al usuario a `/auth/callback?next=/dashboard` después de confirmar el correo. Esa ruta recibe el código de autorización, intercambia el código por una sesión en el servidor y guarda las cookies de sesión. El formulario de recuperación utiliza la dirección absoluta `/reset-password`.

## 3. Revisar el correo de confirmación de registro

1. En el panel de Supabase, entra en **Autenticación (Authentication) → Plantillas de correo (Email Templates)**.
2. Abre la plantilla **Confirmación de registro (Confirm signup)**.
3. Comprueba que el enlace de confirmación utilice esta variable de Supabase:

```text
{{ .ConfirmationURL }}
```

4. Guarda la plantilla si hiciste algún cambio.

La aplicación indica la dirección de retorno al registrar al usuario. Esa dirección debe coincidir con una de las direcciones permitidas del paso 2.

## 4. Configurar el correo para recuperar la contraseña

1. En **Autenticación (Authentication) → Plantillas de correo (Email Templates)**, abre **Restablecer contraseña (Reset Password)**.
2. Reemplaza el contenido de la plantilla por este texto:

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

3. Guarda la plantilla.

**No reemplaces ese enlace por `{{ .ConfirmationURL }}`.** El formulario de recuperación de OpenView necesita recibir los parámetros `token_hash` y `type=recovery` en la dirección web. Luego verifica ese código de un solo uso con `verifyOtp` antes de permitir el cambio de contraseña mediante `updateUser`.

## 5. Comprobar que todo funciona

Cuando hayas guardado la configuración anterior, realiza estas pruebas:

- [ ] Las cuatro direcciones de retorno (dos de producción y dos locales) aparecen en la lista de direcciones permitidas.
- [ ] Al registrar una cuenta, llega el correo de confirmación.
- [ ] Al abrir el enlace de confirmación, el navegador vuelve a `/auth/callback` y termina en el panel con la sesión iniciada.
- [ ] Al solicitar recuperar la contraseña, llega el correo correspondiente.
- [ ] El enlace del correo abre una dirección con este formato: `/reset-password?token_hash=...&type=recovery`.
- [ ] La aplicación permite establecer una contraseña nueva con un enlace válido.
- [ ] Los enlaces vencidos o utilizados anteriormente son rechazados.
- [ ] Al cerrar sesión, se eliminan las cookies de sesión del servidor.

Si alguna prueba falla, no habilites todavía el flujo para usuarios reales: revisa primero las direcciones permitidas y las plantillas de correo.

## Seguridad

Nunca coloques claves secretas ni claves `service_role` en variables que comiencen con `PUBLIC_`, en el navegador ni en archivos versionados. La clave publicable puede utilizarse en el cliente; el acceso a los datos debe seguir protegido por las políticas RLS de la base de datos.
