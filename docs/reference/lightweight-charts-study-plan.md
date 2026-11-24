# Plan de estudio de Lightweight Charts

## Propósito

TradingView Lightweight Charts sirve como referencia para observar capacidades, interacciones y resultados visuales. No es una dependencia ni una base de código para OpenView.

Referencia: https://github.com/tradingview/lightweight-charts

## Superficies a estudiar

1. API pública y ciclo de vida de series.
2. Series temporales y tratamiento de datos irregulares.
3. Escalas temporales, escalas de precio y márgenes.
4. Rango visible, pan, zoom y autoajuste.
5. Crosshair, sincronización y tooltips.
6. Marcadores, líneas, overlays y primitivas personalizadas.
7. Layout, redimensionamiento, densidad de píxeles y rendering.
8. Accesibilidad, eventos y comportamiento de interacción.
9. Rendimiento con series largas y actualizaciones incrementales.

## Método de comparación

Cada estudio debe registrar:

- Versión de la referencia observada.
- Comportamiento de entrada y salida.
- Casos normales, límites y errores.
- Capturas o grabaciones propias cuando sean útiles.
- Criterios de aceptación verificables para OpenView.
- Diferencias intencionales de diseño.
- Riesgos de licencia, marca o confusión de producto.

## Límites

No copiar código fuente, tests internos, estructuras privadas ni nombres internos. No reconstruir la arquitectura por ingeniería inversa de detalles no públicos. La implementación debe derivarse de requisitos observables, algoritmos generales y decisiones arquitectónicas propias.
