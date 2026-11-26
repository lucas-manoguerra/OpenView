# ADR 0004: Estado de terminal y preferencias persistentes

## Estado

Aceptado. Complementado por ADR 0005 para persistencia de cuenta y sincronización entre dispositivos.

## Contexto

La terminal está construida con Preact y Astro. La watchlist necesita estado local de interfaz, restauración de preferencias y una frontera clara entre datos de mercado efímeros y preferencias del usuario.

Las preferencias de una watchlist no son datos de mercado. No deben contener cotizaciones, velas, estados de conexión ni objetos del motor gráfico.

## Decisión

- Se utiliza el estado nativo de Preact para el estado de interfaz que pertenece a un componente o flujo local.
- Las preferencias persistentes se serializan mediante un módulo propio, con versión de esquema, validación en tiempo de lectura y una lista permitida de instrumentos.
- El acceso al almacenamiento del navegador se realiza explícitamente después de la hidratación y se toleran almacenamiento bloqueado, datos corruptos y versiones desconocidas.
- No se incorpora Zustand en esta etapa: la aplicación no necesita todavía un store global compartido y su integración está orientada principalmente a React.
- Nano Stores será la primera opción a evaluar cuando el estado deba compartirse entre islas Preact, múltiples gráficos o paneles independientes. Su integración específica para Preact y su módulo persistente permiten cubrir ese crecimiento sin introducir un store acoplado a React.

## Separación de responsabilidades

- Las cotizaciones y los streams permanecen efímeros y se reconstruyen al iniciar la terminal.
- El histórico OHLCV pertenece al servicio de datos y no se persiste como preferencia.
- La watchlist y el instrumento seleccionado son preferencias persistentes.
- El motor de gráficos mantiene su propio estado de interacción y no depende del store de preferencias.

## Alcance de la persistencia local

El almacenamiento local descrito en esta decisión es una solución transitoria para preferencias anónimas y caché de interfaz. No define la propiedad final de dibujos, plantillas ni configuraciones asociadas a una cuenta.

Con autenticación, la fuente canónica de las preferencias sincronizables será el repositorio remoto de Terminal, con autorización por usuario. localStorage o IndexedDB podrán mantenerse como caché/offline, nunca como mecanismo de identidad ni como única persistencia de datos de cuenta.

Los dibujos durables se guardan mediante el repositorio de Terminal y no como ChartSnapshot completo. La separación y el modelo de cuenta se especifican en ADR 0005.

## Consecuencias

- No se agrega una dependencia global de estado para un único flujo de UI.
- Las preferencias disponen de migración explícita mediante una versión de esquema.
- Los cambios de almacenamiento no alteran contratos del dominio de mercado ni del motor.
- Si aparecen varios consumidores independientes de las mismas preferencias, la migración a Nano Stores debe realizarse detrás del módulo de preferencias y sin trasladar datos efímeros al almacenamiento persistente.
