# Instalación reproducible

## Entorno admitido

- Node.js 24 LTS.
- pnpm 12.23.0.
- Git.

## Primer setup

```bash
corepack enable
corepack prepare pnpm@12.23.0 --activate
pnpm install
```

La primera instalación debe crear `pnpm-lock.yaml`. Versionar ese archivo antes de activar instalaciones congeladas en CI.

## Instalaciones posteriores

```bash
pnpm install --frozen-lockfile
```

## Actualización de dependencias

Los cambios de dependencias deben actualizar manifiestos y lockfile juntos. La revisión debe incluir la razón del cambio, impacto de bundle, compatibilidad de Node, licencia y resultado de los checks.
