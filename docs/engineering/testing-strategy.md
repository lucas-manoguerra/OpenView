# Estrategia de pruebas

## Capas

### Unitarias

Vitest verifica invariantes del dominio, conversiones de coordenadas, escalas, cálculos y transformaciones. Cada prueba debe cubrir entradas válidas, límites y errores.

### Arquitectura

`pnpm architecture:check` verifica la prohibición de comentarios y `useEffect`, además de los límites entre paquetes.

### Tipos

Cada paquete ejecuta TypeScript con modo estricto, comprobación de tipos exactos y acceso indexado seguro.

### Integración y navegador

Playwright valida rutas, accesibilidad observable, interacción entre secciones e integración de las islas Preact con Astro.

## Reglas

- Las pruebas no dependen de proveedores externos ni mercados en vivo.
- Los datos de prueba son deterministas y están versionados.
- Los mocks tienen contratos explícitos y representan casos normales, extremos y fallos.
- No se debilitan pruebas ni reglas para aceptar una implementación defectuosa.
- Los tests nuevos se agregan junto con el cambio que verifican.

## Verificación local

```bash
pnpm check
pnpm test:e2e
```
