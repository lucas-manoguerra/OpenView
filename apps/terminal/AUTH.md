# Configuración de autenticación Google para OpenView Terminal

OpenView Terminal utiliza exclusivamente **Google OAuth** a través de Supabase Auth. El flujo web usa PKCE y una ruta de retorno en el servidor para intercambiar el código por una sesión y guardar las cookies seguras.

## 1. Variables locales

1. Copia `apps/terminal/.env.example` como `apps/terminal/.env`.
2. Completa la URL y la clave publicable del proyecto Supabase:

```dotenv
PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_reemplazar_por_tu_clave
```

Estas dos variables son configuración pública. Nunca uses una clave `service_role` ni una clave secreta en el navegador o en variables `PUBLIC_*`. El archivo `.env` no debe subirse a Git.

## 2. Crear credenciales OAuth en Google

1. Abre [Google Cloud Console](https://console.cloud.google.com/).
2. Crea o selecciona un proyecto para OpenView.
3. En **Google Auth Platform**, configura la pantalla de consentimiento y los datos de la aplicación.
4. Configura el público permitido según quién podrá iniciar sesión. Para una aplicación en pruebas, agrega las cuentas de prueba necesarias.
5. En **Clientes**, crea un cliente OAuth de tipo **Aplicación web**.
6. En **URI de redireccionamiento autorizados**, agrega exactamente la URL de callback que muestra Supabase en **Authentication → Sign In / Providers → Google**. Tiene este formato:

```text
https://TU_PROJECT_REF.supabase.co/auth/v1/callback
```

7. Guarda el cliente y copia su **Client ID** y **Client Secret**.

No uses la URL `/auth/callback` de OpenView como callback de Google. Google devuelve primero el control a Supabase; Supabase luego redirige a OpenView.

## 3. Habilitar Google en Supabase

1. Abre el [panel de Supabase](https://supabase.com/dashboard) y selecciona el proyecto de OpenView.
2. Entra en **Authentication → Sign In / Providers → Google**.
3. Activa Google.
4. Pega el **Client ID** y el **Client Secret** obtenidos de Google Cloud.
5. Guarda los cambios.

El secreto OAuth se almacena solamente en Supabase. No lo agregues al repositorio, a Astro ni a Cloudflare Workers.

## 4. Configurar las URL permitidas en Supabase

En **Authentication → URL Configuration**:

- **Site URL**:

```text
https://openview-terminal.developer-spoonacular-004.workers.dev/
```

- Agrega estas direcciones en **Redirect URLs**:

```text
https://openview-terminal.developer-spoonacular-004.workers.dev/auth/callback
http://localhost:4321/auth/callback
```

Guarda los cambios. En producción se recomienda mantener las URL exactas, sin comodines innecesarios.

## 5. Flujo de inicio de sesión

1. La persona pulsa **Continuar con Google** en `/login`.
2. Supabase inicia OAuth con Google usando PKCE.
3. Google devuelve el usuario al callback de Supabase.
4. Supabase redirige a `/auth/callback?next=/dashboard`.
5. El servidor de OpenView intercambia el código por una sesión y persiste las cookies.
6. La persona termina en `/dashboard`.

## 6. Alcance de autenticación

La interfaz y las rutas de Terminal admiten únicamente inicio de sesión con Google. No se ofrecen registro por correo/contraseña, inicio por contraseña ni recuperación de contraseña. El alta de una cuenta nueva se realiza durante el primer acceso OAuth con Google.

La restricción de proveedores debe mantenerse también en Supabase: deja Google habilitado y deshabilita los demás proveedores que no se utilicen. No deshabilites mecanismos internos necesarios para la sesión o la renovación de tokens.

## 7. Lista de verificación

- [ ] Google OAuth Client creado como aplicación web.
- [ ] Callback de Supabase agregado en Google Cloud.
- [ ] Google habilitado en Supabase con Client ID y Client Secret.
- [ ] Site URL de producción configurada.
- [ ] Redirect URLs de producción y desarrollo agregadas.
- [ ] Inicio con Google funciona en producción.
- [ ] Inicio con Google funciona en desarrollo local.
- [ ] Un usuario sin sesión no puede acceder a rutas privadas.
- [ ] El cierre de sesión invalida la sesión y vuelve a `/login`.
