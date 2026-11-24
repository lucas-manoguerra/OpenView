---

name: Chart Engine
description: Design and implement OpenView chart rendering, scales, viewport, layout, and input without UI framework coupling.
---

# Chart engine skill

The chart engine belongs to `packages/chart-engine` and must remain independent of Astro, Preact, Tailwind and market-data vendors.

Separate domain inputs, viewport transforms, scale calculations, layout, renderer lifecycle, input events and extension points.

Make coordinate spaces explicit. Distinguish logical pixels from device pixels. Define ownership and invalidation for every rendering resource.

Keep math functions pure where possible. Add deterministic tests for transformations, boundaries, precision, degenerate ranges and resizing.

Do not use `useEffect`, do not introduce comments in code and do not copy or port source from a reference library. Consult ADR 0002 and the performance budget before making design changes.
