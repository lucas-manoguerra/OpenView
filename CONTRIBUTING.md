# Contribuir

## Flujo de trabajo

1. Crear una rama desde `main` con un nombre descriptivo.
2. Leer `AGENTS.md` y los documentos aplicables.
3. Abrir una tarea pequeña con resultado observable y criterios de aceptación.
4. Mantener los cambios dentro del paquete responsable.
5. Añadir pruebas junto con el comportamiento.
6. Ejecutar `pnpm check` antes de abrir el pull request.
7. Describir decisiones, compatibilidad, riesgos y verificación en el pull request.

## Convenciones

- TypeScript estricto en toda la lógica propia.
- Nombres de dominio en inglés, completos y consistentes.
- Funciones con verbos; tipos y entidades con sustantivos.
- Sin comentarios en código.
- Sin `useEffect`.
- Sin dependencias cruzadas que violen `docs/architecture/module-boundaries.md`.
- Un cambio arquitectónico requiere un ADR.

## Pull requests

Un pull request debe ser pequeño, enfocado y verificable. No mezclar refactors no relacionados con nuevas capacidades. Ningún cambio puede deshabilitar un check existente sin una decisión explícita y documentada.
