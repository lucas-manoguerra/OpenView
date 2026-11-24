---

description: Plan, implement, test, and review a bounded OpenView feature.
agent: orchestrator
---

Implement the requested feature in OpenView.

Read `AGENTS.md` and the module documentation first. Identify the owning package and state the acceptance criteria before changing code.

Delegate independent work to specialists with non-overlapping file ownership. Keep integration and cross-module decisions with the orchestrator.

Implement the smallest coherent vertical slice. Add deterministic tests and update documentation or ADRs when contracts change.

Run focused checks, then `pnpm check`. For interface changes, run `pnpm test:e2e`. Ask read-only reviewers to inspect architectural, performance or security risks when relevant.

Report files changed, design decisions, checks executed and any remaining limitations.
