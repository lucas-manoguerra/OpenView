# Política de rendimiento

## Principios

- No hidratar páginas completas cuando basta con una isla interactiva.
- Mantener el dominio y el motor fuera del runtime de UI.
- Evitar renders amplios cuando cambian datos de una sola serie o panel.
- Agrupar invalidaciones de dibujo y evitar trabajo repetido por evento.
- Liberar observers, listeners, workers y buffers cuando termina su propietario.
- Medir antes de introducir optimizaciones complejas.

## Métricas del motor

La implementación deberá medir y registrar:

- Tiempo de layout por actualización.
- Tiempo de render por frame.
- Frames perdidos durante pan y zoom.
- Memoria retenida por buffers y cachés.
- Latencia desde el evento de entrada hasta el frame visible.
- Tiempo de inicialización y coste de cada extensión.

## Presupuestos iniciales

Los presupuestos numéricos se definirán después de construir el primer renderer medible y establecer un baseline repetible. No se inventarán umbrales sin medición.

Cada cambio de rendimiento debe incluir el escenario, hardware, tamaño de datos, método de medición y comparación antes/después.
