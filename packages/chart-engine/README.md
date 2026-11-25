# OpenView Chart Engine

`@openview/chart-engine` is the framework-independent chart library used by host applications such as the terminal. It owns chart-domain state and rendering; the host owns application chrome and global window behavior.

## Ownership boundary

- The chart owns its render scene, series/volume/indicator/drawing objects, selection and interaction state, object ordering, and chart snapshots.
- A host owns floating panels, their drag behavior, global context menus, and application navigation.
- Hosts communicate with the chart through exported commands and events. They must not import chart implementation files or mutate internal chart state.
- The chart engine must not import terminal or UI-framework modules and must be usable without mounting the terminal.

## Public lifecycle API

Create an instance with `createChart({ surface, initialScene, renderer? })`. The returned `ChartApi` exposes:

- `execute(command)` for scene updates, object-order changes, resize, and immediate rendering.
- `subscribe(listener)` for scene, object-order, and lifecycle events.
- `exportSnapshot()` and `importSnapshot(snapshot)` for versioned, serializable persistence.
- `destroy()` for deterministic renderer and subscription cleanup.

The host should retain only the returned API instance. A context-menu action such as “bring to front” is sent as a `move-object` command; the chart updates its own order and renderer.

## Object ordering

The render stack covers the main price series, volume, each indicator, and drawings. New objects are appended when reconciling a scene; removed objects are discarded; retained objects preserve their relative order. The order is included in version 1 snapshots.

The object order is a chart-domain concern. A host may present controls for it, but must not maintain a second authoritative order.

## Snapshot compatibility

Snapshots are versioned. Import rejects unsupported versions and reconciles object references against the imported scene, preventing stale object IDs from entering the active render stack.
