# Component Lab Validation

Cada ruta del Component Lab es una superficie de validación aislada y no una implementación paralela del componente.

## Requisitos mínimos

- La ruta carga directamente sin necesitar navegar desde el terminal.
- La demostración usa el mismo componente exportado que consumirá la aplicación.
- Las variantes y estados importantes son visibles.
- Las interacciones actualizan el estado observable.
- Los controles tienen nombres accesibles.
- Los elementos interactivos pueden usarse con teclado.
- Los componentes sin estado no agregan estado artificial.
- La ruta incluye enlace de regreso al índice del laboratorio.

## Estado de validación

Un componente se considera listo para integración cuando:
- Su API está tipada y documentada.
- Su ruta aislada cubre variantes y estados.
- Los eventos producen el resultado esperado.
- No presenta errores de tipo, lint ni build.
- Su fidelidad visual ha sido comparada con la referencia TradingView.
