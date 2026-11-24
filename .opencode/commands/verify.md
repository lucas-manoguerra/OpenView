---

description: Run the OpenView verification harness and diagnose failures without weakening checks.
agent: orchestrator
---

Verify the current OpenView work.

Inspect the working tree and determine the narrowest relevant checks. Run `pnpm architecture:check`, focused package typechecks and tests, then `pnpm check`. Run `pnpm test:e2e` when the application or interaction changed.

For each failure, identify the first root cause, correct the implementation or harness, and rerun the failed check. Do not disable rules, lower assertions or claim checks passed without command output.

Summarize commands, results, remaining failures and risks.
