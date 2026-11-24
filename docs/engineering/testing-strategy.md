# Estrategia de pruebas

## Capas

### Unitarias

Vitest verifica invariantes del dominio, conversiones de coordenadas, escalas, cálculos y transformaciones. Cada prueba debe cubrir entradas válidas, límites y errores.

### Arquitectura

`pnpm architecture:check` verifica la prohibición de comentarios y `useEffect`, además de los límites entre paquetes.

### Tipos

Cada paquete ejecuta TypeScript con modo estricto, comprobación de tipos exactos y acceso indexado seguro.

### Integración y navegador

Playwright valida rutas, accesibilidad observable, interacción entre secciones e integración de las islas Preact con Astro. El reporte HTML y los traces se publican como artefactos de GitHub Actions para facilitar el diagnóstico de fallos.

## Jobs de CI

El workflow `.github/workflows/quality.yml` mantiene verificaciones independientes y ejecuta los jobs en paralelo:

- **Format:** formato de archivos con Biome.
- **Lint:** reglas estáticas de Biome.
- **Architecture boundaries:** prohibición de `useEffect`, comentarios y dependencias fuera de los límites.
- **TypeScript · market-domain:** tipos del dominio de mercado.
- **TypeScript · chart-engine:** tipos del motor de gráficos.
- **TypeScript · market-data:** tipos de proveedores y contratos de datos.
- **TypeScript · terminal:** tipos de la aplicación Astro y Preact.
- **Unit tests:** tests unitarios con Vitest.
- **Astro build:** compilación de la aplicación.
- **Browser tests · Chromium:** pruebas E2E con Playwright.

El job `All quality checks` agrega los resultados y falla cuando cualquier verificación termina en error, es cancelada o no se ejecuta. Así se conserva un único check agregado para protección de ramas sin perder el diagnóstico individual.

La configuración de Node.js, pnpm y dependencias se centraliza en `.github/actions/setup-environment`.

## Reglas

- Las pruebas no dependen de proveedores externos ni mercados en vivo.
- Los datos de prueba son deterministas y están versionados.
- Los mocks tienen contratos explícitos y representan casos normales, extremos y fallos.
- No se debilitan pruebas ni reglas para aceptar una implementación defectuosa.
- Los tests nuevos se agregan junto con el cambio que verifican.

## Verificación local

Ejecutar las verificaciones por separado con `pnpm format:check`, `pnpm lint`, `pnpm architecture:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` y `pnpm test:e2e`.

Para ejecutar formato, lint, arquitectura, tipos, tests unitarios y build en un solo comando, utilizar `pnpm check`.
