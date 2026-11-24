---

name: Architecture
description: Apply OpenView module ownership, dependency direction, ADRs, and API design rules.
---

# Architecture skill

Before changing architecture, read `AGENTS.md`, `docs/architecture/module-boundaries.md` and the relevant ADR.

Identify the owner of each behavior before editing. Keep application composition, pure financial domain, chart rendering and provider adaptation separate.

Use stable contracts at package boundaries. Avoid framework types in domain and chart engine APIs. Do not add dependency cycles or import from applications into packages.

An architecture change requires an ADR update with context, decision, alternatives and consequences. Verify boundaries with `pnpm architecture:check`.
