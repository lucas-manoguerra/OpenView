# Hitos de OpenView

## Fase 0 — Fundación

- [x] Monorepo con límites por responsabilidad.
- [x] Aplicación Astro y primera isla Preact.
- [x] Contratos iniciales de dominio, motor y datos.
- [x] Harness de calidad y verificación arquitectónica.
- [x] Orquestador y subagentes OpenCode.
- [ ] Instalación limpia y lockfile versionado.
- [ ] Ejecución completa de CI y corrección de cualquier fallo.

## Fase 1 — Núcleo del motor

- [ ] Modelo de series y datos normalizados.
- [ ] Viewport y transformaciones de coordenadas.
- [ ] Escala temporal continua y discreta.
- [ ] Escalas de precio lineal, porcentual, logarítmica y base 100.
- [ ] Motor de layout y medición de texto.
- [ ] Canvas renderer y gestión de alta densidad de píxeles.
- [ ] Crosshair y eventos de entrada.
- [ ] Pruebas deterministas de escalas y rendering.

## Fase 2 — Experiencia de gráfico

- [ ] Series OHLC, línea, área y barras.
- [ ] Volumen y paneles sincronizados.
- [ ] Pan, zoom, autoajuste y navegación temporal.
- [ ] Ejes, etiquetas, grillas y formato numérico.
- [ ] Tooltips y sincronización de crosshair.
- [ ] Configuración persistente del espacio de trabajo.

## Fase 3 — Datos de mercado

- [ ] Adaptadores de proveedores gratuitos con términos verificados.
- [ ] Normalización de históricos y streaming.
- [ ] Caché y deduplicación de solicitudes.
- [ ] Gestión de rate limits, desconexión y reintentos.
- [ ] Fixtures y simuladores reproducibles.

## Fase 4 — Extensiones de análisis

- [ ] Indicadores como módulos independientes.
- [ ] Herramientas de dibujo.
- [ ] Alertas y condiciones.
- [ ] Layouts multipanel.
- [ ] Sistema público de extensiones.

## Fase 5 — Cuenta y persistencia de workspace

- [ ] Definir identidad canónica de instrumentos (venue, mercado y producto cuando aplique).
- [ ] Crear repositorios de Terminal para dibujos, plantillas y preferencias.
- [ ] Persistir dibujos por usuario e instrumento, con alcance global o por temporalidad.
- [ ] Añadir autenticación y sesiones con Supabase Auth.
- [ ] Configurar PostgreSQL, migraciones y políticas RLS verificadas.
- [ ] Implementar sincronización entre dispositivos y control optimista de revisiones.
- [ ] Migrar preferencias locales a la cuenta sin pérdida ni duplicación.
- [ ] Mantener caché offline local desacoplada de la fuente canónica remota.
- [ ] Añadir pruebas de aislamiento entre usuarios y recuperación de workspace.

## Fase 5 — Preparación de distribución

- [ ] Revisión de seguridad y dependencias.
- [ ] Presupuestos de rendimiento medidos.
- [ ] Política de privacidad y almacenamiento.
- [ ] Licencia del proyecto decidida.
- [ ] Empaquetado y documentación de despliegue.
