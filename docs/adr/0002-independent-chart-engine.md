# ADR 0002: Motor de gráficos independiente

## Estado

Aceptado.

## Contexto

Lightweight Charts proporciona una referencia funcional útil para estudiar escalas, series, interacción y rendering. OpenView necesita una implementación propia y una arquitectura que permita controlar rendimiento y extensiones.

## Decisión

El motor se implementa desde cero en `packages/chart-engine`. Lightweight Charts se utiliza como referencia de comportamiento observable y documentación pública. No se incorpora como dependencia ni se copian o adaptan sus fuentes, tests internos o estructura privada.

## Consecuencias

- El modelo de datos, los contratos y los algoritmos pertenecen a OpenView.
- Las comparaciones con la referencia deben formularse como comportamiento esperado y criterios verificables.
- Los nombres internos y decisiones arquitectónicas se diseñan desde las necesidades propias del producto.
- Toda incorporación de código externo requiere revisión de licencia y procedencia.
