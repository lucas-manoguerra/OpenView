# ADR 0001: Monorepo con límites de dominio explícitos

## Estado

Aceptado.

## Contexto

OpenView combina una aplicación web, un dominio financiero, un motor de gráficos y adaptadores de datos. Estas áreas evolucionan con ritmos y requisitos de rendimiento diferentes.

## Decisión

Se utiliza pnpm workspaces con aplicaciones en `apps/` y paquetes en `packages/`. El motor y el dominio no dependen de la aplicación. Las dependencias entre paquetes deben apuntar hacia contratos más estables.

## Consecuencias

- Cada paquete puede probarse y evolucionar de forma independiente.
- Las fronteras se verifican automáticamente.
- Los cambios transversales deben introducir contratos explícitos.
- La integración de la UI no debe filtrar abstracciones de framework hacia el motor.
