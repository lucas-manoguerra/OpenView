---

name: Performance
description: Evaluate rendering cost, frame latency, memory ownership, bundle size, and interaction responsiveness.
---

# Performance skill

Start with a measurable scenario and baseline. Record hardware, runtime, dataset size, viewport, interaction and measurement method.

Inspect hydration boundaries, allocation in hot paths, repeated geometry calculations, layout thrashing, redundant invalidations and long-lived resources.

Use `requestAnimationFrame` for visual scheduling when appropriate, with explicit cancellation and one owner per scheduled callback.

Do not replace `useEffect` with an untracked effect abstraction. Model events, state transitions and resource lifecycle explicitly.

Do not claim a performance improvement without comparable measurements. Update `docs/engineering/performance-budget.md` when a repeatable baseline or budget is established.
