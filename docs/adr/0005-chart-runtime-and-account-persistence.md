# ADR 0005: Estado runtime del Chart y persistencia de cuenta en Terminal

## Estado

Aceptado. La implementación se realizará por etapas.

## Contexto

El motor gráfico ya administra dibujos, selección, historial de edición, interacción y snapshots runtime. Esa propiedad del comportamiento gráfico no debe convertir al motor en propietario de datos durables.

Los dibujos deben sobrevivir recargas, sesiones y cambios de dispositivo. Además, cada usuario tendrá sus propios dibujos, plantillas y preferencias. Un dibujo puede pertenecer a un instrumento en todas sus temporalidades o quedar limitado a una temporalidad concreta.

El Chart también debe seguir siendo una librería independiente, reutilizable sin Terminal, autenticación, backend ni almacenamiento.

## Decisión

### Chart: runtime gráfico sin persistencia

- Consume exclusivamente series y datos normalizados mediante contratos públicos neutrales.
- Renderiza el gráfico y administra escalas, viewport, interacción, hit-testing, herramientas gráficas, selección, edición, orden visual e historial de edición en memoria.
- Recibe comandos públicos para activar herramientas y modificar el estado gráfico.
- Emite eventos y datos serializables cuando cambia el estado relevante.
- No conoce usuarios, cuentas, sesiones, autenticación, símbolos de proveedor, credenciales, almacenamiento, APIs remotas ni políticas de sincronización.
- No importa ni depende de adaptadores de persistencia.
- No decide cuándo guardar, cuándo recuperar ni a qué cuenta pertenece un dibujo.

El historial Undo/Redo es temporal y pertenece a la sesión de edición del Chart. No se persiste como historial durable. La persistencia guarda el estado confirmado de los dibujos.

ChartSnapshot es un snapshot runtime para transferir/restaurar estado interno compatible entre instancias del motor. No es el formato de persistencia de usuario: incluye estado de escena y datos que deben reconstruirse desde Terminal. No debe almacenarse como documento completo de workspace.

### Terminal: coordinación y persistencia

- Posee toolbar, selección de herramientas, paneles, configuración de usuario y coordinación de comandos/eventos del Chart.
- Proporciona al Chart el estilo activo cuando el usuario inicia una herramienta.
- Escucha eventos públicos del Chart y convierte los cambios confirmados en documentos de persistencia propios.
- Recupera los documentos correspondientes al usuario, instrumento y alcance temporal, y entrega al Chart únicamente los dibujos aplicables.
- Gestiona guardado, restauración, sincronización, reintentos, conflictos, migraciones y estados de carga/error.
- No implementa renderizado, hit-testing ni geometría de dibujos.

La persistencia se abstrae detrás de un repositorio de Terminal. Los componentes no deben acceder directamente a localStorage, IndexedDB ni al SDK del backend. Los adaptadores local y remoto implementan el mismo contrato.

### Identidad y alcance de los dibujos

Cada dibujo tiene un UUID estable e inmutable generado por el Chart. El documento persistido añade metadatos de propiedad que no pertenecen al motor:

- user_id: propietario autenticado.
- instrument_id: identidad canónica y estable del instrumento, no el símbolo de presentación ni el proveedor activo.
- timeframe_scope: null significa todas las temporalidades; un valor concreto limita el dibujo a esa temporalidad.
- drawing_id: UUID del dibujo.
- payload: propiedades serializables del dibujo.
- z_order: orden visual dentro del ámbito.
- created_at, updated_at y revision: auditoría y control de concurrencia.

Al abrir un instrumento y temporalidad, Terminal combina los dibujos globales (timeframe_scope IS NULL) con los dibujos específicos de esa temporalidad. Un dibujo específico no debe duplicarse al cambiar de temporalidad. La identidad canónica del instrumento deberá distinguir mercados/venues cuando corresponda; el ticker por sí solo no siempre identifica un instrumento.

La visibilidad, bloqueo y estilo que forman parte del dibujo se persisten en su payload. La selección, hover, previews, cursores y Undo/Redo no se persisten.

### Plantillas y preferencias

- Plantillas personalizadas: propiedad de la cuenta, separadas por tipo de herramienta y con IDs estables.
- Preferencias por herramienta: propiedad de la cuenta; incluyen la configuración predeterminada más reciente para cada tipo.
- Preferencias de interacción y configuración del espacio de trabajo: propiedad de la cuenta cuando afecten la experiencia entre dispositivos.
- Estado efímero de UI (menús abiertos, hover, selección temporal y previews): no se sincroniza.
- Preferencias anónimas/locales solo son una modalidad transitoria mientras no exista sesión autenticada; nunca son la fuente canónica de una cuenta.

## Persistencia y autenticación

Se adopta como dirección recomendada Supabase Auth + PostgreSQL, detrás de interfaces de Terminal:

- Supabase Auth proporciona identidad y sesiones.
- PostgreSQL almacena dibujos, plantillas y preferencias.
- Row Level Security (RLS) restringe lectura y escritura al propietario autenticado.
- Las claves privilegiadas permanecen exclusivamente en servidor; el cliente utiliza una clave publicable y el contexto autenticado, protegido por RLS.
- Las operaciones de persistencia validan propiedad, instrumento, alcance temporal, esquema y revisión.

Se elige esta opción frente a Clerk más una base independiente o Better Auth autogestionado porque reúne identidad, PostgreSQL y autorización por fila en una sola plataforma y reduce la cantidad de infraestructura que OpenView debe operar. Clerk sigue siendo una alternativa válida si más adelante se necesita una capa de identidad administrada independiente. Better Auth es viable si se decide operar autenticación y sesiones dentro de la propia infraestructura.

La aplicación Astro deberá incorporar un adaptador de servidor y manejo seguro de cookies/sesiones cuando se implemente SSR y endpoints protegidos. No se habilitará acceso de escritura a datos de cuenta desde endpoints anónimos.

## Modelo de almacenamiento recomendado

- chart_drawings: una fila por dibujo, indexada por propietario, instrumento y temporalidad. Evita reescribir todo un documento cuando cambia un único dibujo y permite aplicar concurrencia por elemento.
- drawing_templates: una fila por plantilla, con propietario y tipo de herramienta.
- user_chart_preferences: documento JSONB versionado por usuario y namespace para preferencias pequeñas y evolutivas.
- chart_workspaces (etapa posterior): layouts de múltiples gráficos y configuraciones de workspace, separados de los dibujos.

JSONB se usa para payloads versionados y específicos de cada tipo de dibujo, no para reemplazar columnas relacionales de identidad, propiedad, alcance, auditoría e índices. La escritura debe utilizar revision/control optimista para evitar que dos dispositivos sobrescriban silenciosamente cambios recientes.

Los datos de mercado, históricos OHLCV y streams no se incluyen en estas tablas: se reconstruyen mediante los proveedores y servicios de datos.

## Migración por etapas

1. Formalizar contratos y propiedad de responsabilidades sin cambiar el comportamiento visual.
2. Crear el repositorio de persistencia de Terminal y un adaptador local para desarrollo/offline.
3. Implementar autenticación, PostgreSQL, RLS y adaptador remoto.
4. Migrar dibujos, plantillas y preferencias locales a la cuenta autenticada, con validación, deduplicación y confirmación del usuario cuando existan conflictos.
5. Añadir sincronización entre dispositivos, control de revisiones y recuperación ante fallos.

No se debe borrar el almacenamiento local anterior hasta confirmar que la migración a la cuenta terminó correctamente.

## Consecuencias

- Chart continúa siendo una librería independiente y portable.
- Terminal es el único propietario de la persistencia y de la relación entre datos y usuario.
- La cuenta es la fuente canónica para los datos sincronizados entre dispositivos.
- El almacenamiento local funciona como caché/offline, no como autoridad de identidad ni de propiedad.
- Los contratos de persistencia no se filtran a packages/chart-engine ni a packages/market-domain.
