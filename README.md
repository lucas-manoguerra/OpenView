# OpenView

OpenView es una plataforma gratuita y extensible de análisis de mercados, desarrollada desde cero con TypeScript, Astro, Preact y Tailwind CSS.

El proyecto utiliza un monorepo modular. La aplicación web, el dominio de mercado, el motor de gráficos y las fuentes de datos tienen responsabilidades independientes y contratos explícitos.

## Requisitos

- Node.js 24 LTS
- pnpm 12.23.0
- Git

## Inicio

```bash
corepack enable
corepack prepare pnpm@12.23.0 --activate
pnpm install
pnpm dev
```

La aplicación estará disponible en http://localhost:4321.

## Cloudflare deployment

Cloudflare Workers deployment uses Wrangler from `apps/terminal/wrangler.jsonc`. The Worker name is `openview-terminal`.

For local CLI deployment, copy `.env.cloudflare.example` to `.env.cloudflare`, then set:

- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID that owns the Worker.
- `CLOUDFLARE_API_TOKEN`: a narrowly scoped API token with the Workers Scripts edit permission required by Wrangler.

Load the local values into the current shell before running Wrangler:

```bash
set -a
. ./.env.cloudflare
set +a
pnpm --filter @openview/terminal exec wrangler deploy --dry-run
```

Run a real deployment only after reviewing the dry-run output and explicitly authorizing the deployment. For GitHub Actions, store these values as repository or environment secrets named `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; do not commit the local `.env.cloudflare` file or place the API token in the application `apps/terminal/.env`. The Cloudflare API token is a deployment credential, not a browser/runtime variable.

## Verificaciones

```bash
pnpm check
pnpm test:e2e
pnpm check:all
```

El comando `pnpm check` ejecuta formato, lint, verificaciones arquitectónicas, comprobación de tipos, pruebas unitarias y build. `pnpm check:all` incorpora las pruebas de navegador.

## Arquitectura

```text
apps/
  terminal/                 Aplicación Astro y sus islas Preact
packages/
  market-domain/             Tipos e invariantes puros del dominio
  chart-engine/              Modelo, escalas y rendering independiente de UI
  market-data/               Contratos y normalización de fuentes
.opencode/
  agents/                    Orquestador y agentes especialistas
  commands/                  Flujos reutilizables de trabajo
  skills/                    Conocimiento operativo del proyecto
docs/
  adr/                       Decisiones arquitectónicas
  architecture/              Límites y dependencias
  engineering/               Calidad, pruebas y rendimiento
  product/                   Reglas de producto y datos
  roadmap/                   Hitos de implementación
scripts/                     Harnesses y verificaciones ejecutables
tests/e2e/                   Pruebas de navegador
.github/workflows/           Integración continua
```

## Reglas no negociables

1. `useEffect` está prohibido en el código de aplicación y paquetes.
2. El código fuente no contiene comentarios; los nombres, tipos, contratos y estructura expresan la intención.
3. El motor de gráficos no depende de Astro, Preact ni Tailwind.
4. El dominio no depende de frameworks, APIs del navegador ni proveedores.
5. Ningún paquete importa desde `apps/`.
6. Las fuentes de datos declaran capacidades, licencias y restricciones de redistribución.
7. Los cambios deben superar `pnpm check` antes de integrarse.
8. El rendimiento se valida con mediciones y presupuestos explícitos.

Las reglas se comprueban con Biome y los scripts de arquitectura. No dependen solamente de instrucciones para los agentes.

## Referencia de producto

La plataforma TradingView oficial es la única referencia para la paridad visual y funcional de OpenView: estructura, jerarquía, estilos, componentes, herramientas, flujos, controles, menús, interacciones y UI/UX. El objetivo es alcanzar paridad integral con la plataforma, no solamente con el gráfico.

OpenView implementa su propia arquitectura, modelo de dominio, motor, escalas, renderizado y API. TradingView Lightweight Charts no se utiliza como sustituto de la plataforma ni como modelo de arquitectura o interacción; tampoco se incorpora como dependencia. No se copia código fuente, assets propietarios ni tests internos.

La documentación técnica de proveedores, protocolos, estándares web y APIs puede consultarse exclusivamente para verificar contratos y hechos técnicos, nunca como referencia de producto, visual o UI/UX.

## Datos y gratuidad

Que OpenView sea gratuito no significa que todas las fuentes de datos de mercado sean gratuitas, utilizables en tiempo real o redistribuibles. Cada proveedor deberá declarar y respetar sus condiciones de uso y licencia.

## Estado

Esta primera etapa establece la infraestructura, los límites arquitectónicos, los contratos iniciales y el harness de calidad. El motor de gráficos y los conectores de producción se desarrollarán por etapas.

La licencia de distribución del proyecto se decidirá explícitamente antes de publicar una versión distribuible.
