# TradingView Component Suite

## Objetivo

Centralizar los componentes visuales y funcionales de OpenView en una biblioteca reutilizable. La plataforma oficial TradingView es la única referencia de producto para estructura, apariencia, estados, interacciones y comportamiento.

La implementación es propia: no se copia código fuente, assets propietarios ni pruebas internas.

## Principios

1. Una única fuente de tokens visuales.
2. Componentes con contratos TypeScript explícitos.
3. Los componentes no dependen de la aplicación que los consume.
4. La lógica de interacción vive en el componente cuando es comportamiento intrínseco; el estado de negocio permanece en el consumidor.
5. Cada familia tiene una ruta de laboratorio aislada.
6. Cada componente debe exponer variantes, estados, accesibilidad y eventos verificables.
7. No se integra un componente en el terminal hasta validar su demostración y pruebas.
8. Se mantiene compatibilidad con Preact, Astro y Tailwind CSS existentes.
9. No se permite introducir patrones visuales o funcionales de otras plataformas.

## Ubicación

- `apps/terminal/src/styles/tokens.css`: tokens globales.
- `apps/terminal/src/components/ui/`: componentes reutilizables.
- `apps/terminal/src/components/component-lab/`: playgrounds y registro.
- `apps/terminal/src/pages/component-lab/`: rutas aisladas.
- `docs/architecture/tradingview-component-suite.md`: reglas de arquitectura.

## Contrato de cada componente

Cada componente debe documentar:

- Propiedades y valores admitidos.
- Variantes, tamaños y estados.
- Eventos emitidos y callbacks.
- Estados disabled, loading, active, focus y hover cuando correspondan.
- Semántica HTML y atributos ARIA.
- Comportamiento de teclado.
- Ejemplos en el Component Lab.
- Pruebas unitarias y/o E2E para la interacción relevante.

## Familias

Core, Navigation, Trading, Chart, Drawings, Panels, Dialogs, Forms, Data, Layout y Feedback.

## Flujo de incorporación

1. Implementar el componente en la biblioteca.
2. Añadir su entrada al registro.
3. Crear o ampliar su ruta de laboratorio.
4. Validar visualmente contra TradingView.
5. Probar estados, eventos, teclado y accesibilidad.
6. Ejecutar los controles de calidad del monorepo.
7. Integrarlo en la aplicación consumidora.
8. Documentar cualquier diferencia de paridad pendiente.

## Primera entrega

La primera entrega establece tokens y componentes Core: Button, IconButton, Tooltip, Badge y Divider. Su demostración vive en `/component-lab/core/buttons`.
