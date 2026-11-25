# OpenView Chart Engine

`@openview/chart-engine` is the framework-independent chart library used by host applications such as the terminal. It owns chart-domain state and rendering; the host owns application chrome and global window behavior.

## Ownership boundary

- The chart owns its render scene, series/volume/indicator/drawing objects, selection and interaction state, object ordering, and chart snapshots.
- A host owns floating panels, their drag behavior, global context menus, and application navigation.
- Hosts communicate with the chart through exported commands and events. They must not import chart implementation files or mutate internal chart state.
- The chart engine must not import terminal or UI-framework modules and must be usable without mounting the terminal.

## Public lifecycle API

Create an instance with `createChart({ surface, initialScene, renderer? })`. The returned `ChartApi` exposes:

- `execute(command)` for scene updates, drawing collection, global drawing visibility and selection mutations, object-order changes, resize, and immediate rendering.
- `subscribe(listener)` for scene, drawing-state, object-order, and lifecycle events.
- `exportSnapshot()` and `importSnapshot(snapshot)` for versioned, serializable persistence.
- `destroy()` for deterministic renderer and subscription cleanup.

The host should retain only the returned API instance. Drawing creation, updates, and deletion are sent through `set-drawings`; selection is sent through `set-drawing-selection`; and global show/hide is sent through `set-drawings-visible`. Global visibility affects rendering only: it does not remove drawings from the chart scene, snapshots, or object order. Individual drawing visibility remains part of each drawing's own state. The chart updates its authoritative scene and emits `drawing-state-changed` for collection and selection changes. Hosts can query `hitTestDrawing(point, tolerance?)` and `selectDrawingsWithinArea(area)`; both queries use the chart's current frame, candles, visibility and selection state, so the host does not need to supply or mirror geometry inputs. A context-menu action such as “bring to front” is sent as a `move-object` command; the chart updates its own order and renderer.

## Object ordering

The render stack covers the main price series, volume, each indicator, and drawings. New objects are appended when reconciling a scene; removed objects are discarded; retained objects preserve their relative order. The order is included in version 1 snapshots.

The object order is a chart-domain concern. A host may present controls for it, but must not maintain a second authoritative order.

## Snapshot compatibility

Snapshots are versioned. Import rejects unsupported versions and reconciles object references against the imported scene, preventing stale object IDs from entering the active render stack.
