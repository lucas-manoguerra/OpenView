---

name: Testing
description: Create deterministic unit, architecture, integration, and browser tests for OpenView.
---

# Testing skill

Tests describe observable behavior and protect architectural contracts.

Use Vitest for pure domain and engine logic. Use Playwright for user-visible navigation, keyboard behavior, accessibility and integration of Astro islands.

Prefer deterministic fixtures over live providers. Cover valid input, boundaries, invalid input, failure states and regression cases.

Keep tests independent of execution order. Avoid timing-based waits where observable state can be awaited directly.

Do not change production behavior only to satisfy a brittle test. Do not reduce test coverage or weaken assertions to get a green pipeline.

Run focused tests first, then `pnpm check`, and `pnpm test:e2e` for interface changes.
