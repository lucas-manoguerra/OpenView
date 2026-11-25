# Directivas para agentes de desarrollo

## Misión

Construir OpenView como una réplica visual y funcional integral de TradingView, con paridad progresiva de toda la plataforma. OpenView conserva una implementación y arquitectura propias, modulares, extensibles y de alto rendimiento.

## Referencia exclusiva de producto

- TradingView es la única referencia de producto para visuales, estilos, funcionalidades, flujos de trabajo, interacciones y UI/UX.
- No utilizar otras plataformas de trading, gráficos, brokers o terminales como referencia ni adoptar de ellas patrones, componentes, nombres, comportamientos o decisiones de producto.
- Para definir un comportamiento, inspeccionar TradingView directamente y priorizar su interfaz y documentación oficial. Registrar como pendiente cualquier comportamiento que no se haya podido verificar, en lugar de inferirlo a partir de otros productos.
- Reimplementar las capacidades con código y arquitectura propios. No copiar código fuente, assets propietarios, tests internos ni detalles privados de implementación de TradingView.
- La paridad abarca la plataforma completa, no solamente el gráfico: incluye módulos, paneles, herramientas, flujos de trabajo, preferencias e interacciones.

## Jerarquía de autoridad

1. Requisitos explícitos del usuario.
2. Este archivo y los ADR aceptados.
3. Contratos y límites arquitectónicos de `docs/architecture/`.
4. Estrategia de calidad de `docs/engineering/`.
5. Convenciones locales de cada paquete.

Ante un conflicto, no inventar una decisión irreversible. Presentar el conflicto al orquestador.

## Reglas absolutas

- No utilizar `useEffect`, ni importarlo, llamarlo, envolverlo o recrear un hook equivalente con otro nombre.
- No introducir comentarios en código: ni comentarios explicativos, ni comentarios de desactivación de lint, ni bloques comentados.
- No utilizar `any`, `@ts-ignore`, `@ts-nocheck` ni casts sin una justificación de tipos demostrable.
- No incorporar `lightweight-charts` como dependencia de la aplicación o del motor propio.
- No copiar, portar ni adaptar código fuente, tests internos, nombres privados o estructura interna de TradingView Lightweight Charts.
- No introducir React ni `preact/compat`.
- No agregar dependencias sin explicar qué responsabilidad cubren y por qué no puede resolverse con la plataforma existente.
- No crear módulos genéricos `utils`, `helpers` o `common` como destino de lógica sin una responsabilidad de dominio concreta.
- No crear ciclos entre paquetes.
- No acoplar el motor de gráficos a Astro, Preact, Tailwind, proveedores de datos ni almacenamiento.
- No mezclar datos de mercado crudos con modelos normalizados del dominio.
- No afirmar que una fuente de datos es gratuita, en tiempo real o redistribuible sin verificar sus condiciones.
- No declarar una verificación como exitosa sin haber ejecutado el comando y observado su resultado.

## Política de rendimiento

- Astro debe entregar estructura estática por defecto; hidratar solamente las islas interactivas necesarias.
- Preact Signals es la opción preferida para estado reactivo local cuando ofrece granularidad real.
- Los eventos de usuario deben activar comandos explícitos y transiciones de estado identificables.
- La planificación de frames debe agrupar invalidaciones mediante `requestAnimationFrame` y evitar trabajo repetido.
- El motor debe separar cálculo, layout, escalas, entrada, extensiones y renderizado.
- El tamaño del bundle, el tiempo de frame, la memoria y la respuesta de interacción deben medirse.
- Las operaciones asíncronas deben tener cancelación, control de concurrencia y manejo explícito de errores cuando corresponda.

## Procedimiento de trabajo

1. Leer los documentos y el código afectado antes de proponer cambios.
2. Identificar el paquete dueño de la responsabilidad.
3. Formular contratos y criterios de aceptación antes de paralelizar.
4. Delegar tareas independientes a especialistas con rutas de escritura delimitadas.
5. No asignar dos agentes al mismo archivo simultáneamente.
6. Integrar las propuestas en el orquestador y revisar los límites entre módulos.
7. Ejecutar primero las pruebas específicas y después `pnpm check`.
8. Corregir las causas de los fallos; no desactivar reglas ni debilitar tests para conseguir checks verdes.
9. Solicitar revisión independiente de arquitectura, rendimiento o seguridad cuando el cambio afecte esos dominios.
10. Informar archivos modificados, decisiones, checks ejecutados y limitaciones reales.

## Criterios para aceptar una implementación

- Los nombres describen la intención y el dominio.
- Cada módulo tiene una sola razón principal para cambiar.
- Las dependencias apuntan hacia el dominio y los contratos estables.
- Los errores y estados inválidos se expresan explícitamente.
- Los tests cubren comportamiento observable, límites y errores.
- Los cambios conservan compatibilidad o describen claramente la migración.
- `pnpm check` pasa sin advertencias nuevas.

## Uso de agentes especializados

El orquestador decide el orden y la integración. Los especialistas implementan solamente dentro de su ámbito y devuelven un informe con contratos modificados, riesgos, tests y comandos ejecutados. Los agentes de revisión son de solo lectura.
