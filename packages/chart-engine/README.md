# OpenView Chart Engine

`@openview/chart-engine` is the framework-independent chart library used by host applications such as the terminal. It owns chart-domain state and rendering; the host owns application chrome and global window behavior.

## Ownership boundary

- The chart owns its render scene, series/volume/indicator/drawing objects, selection and interaction state, object ordering, and chart snapshots.
- A host owns floating panels, their drag behavior, global context menus, and application navigation.
- Hosts communicate with the chart through exported commands and events. They must not import chart implementation files or mutate internal chart state.
- The chart engine must not import terminal, provider adapters, `@openview/market-data`, or UI-framework modules and must be usable without mounting the terminal.
- Data providers belong to the host application. The terminal normalizes provider responses into the shared market-domain OHLCV contract before supplying data to the chart. The chart consumes standardized data only; it never selects providers, fetches history, opens market-data streams, authenticates, or interprets exchange-specific payloads.
- `@openview/market-domain` contains provider-neutral data structures. It is not a provider integration layer; the chart has no dependency on `@openview/market-data`.

## Public lifecycle API

Create an instance with `createChart({ surface, initialScene, renderer? })`. The returned `ChartApi` exposes:

- `execute(command)` for scene updates, drawing collection, global drawing visibility, selection, hover, transient edit-preview mutations, drawing undo/redo, object-order changes, resize, and immediate rendering.
- `subscribe(listener)` for scene, drawing-state, object-order, and lifecycle events.
- `exportSnapshot()` and `importSnapshot(snapshot)` for versioned, serializable persistence.
- `destroy()` for deterministic renderer and subscription cleanup.

The host should retain only the returned API instance. Drawing creation, updates, and deletion are sent through `set-drawings`; selection is sent through `set-drawing-selection`; and global show/hide is sent through `set-drawings-visible`. Global visibility affects rendering only: it does not remove drawings from the chart scene, snapshots, or object order. Individual drawing visibility remains part of each drawing's own state. The chart updates its authoritative scene and emits `drawing-state-changed` for collection and selection changes. Pointer adapters send single-anchor/body and grouped-edit previews with `set-drawing-edit-preview`; previews are rendered over the canonical drawings but are excluded from scene state and snapshots. Sending `null` cancels the preview. Final single and grouped transformations are applied by the chart with `commit-drawing-edit`, which updates canonical drawings, records one undo step, and clears the transient preview; hosts consume the resulting `drawing-state-changed` event. Drawing collection changes through `set-drawings` also create one undo step when the collection actually changes. Hosts invoke `undo-drawings` and `redo-drawings` and consume `history-state-changed` to update control availability; `clear-drawing-history` resets the in-memory history when the host changes the active instrument. The chart keeps a bounded 50-step history and clears redo history after a new edit. Importing a snapshot starts a new history context: pending previews and both history stacks are cleared, and the host receives a zeroed history-state event. Undo/redo restores drawings and reconciles selection and object ordering inside the chart; the host does not own or mirror history stacks. Hosts can query `hitTestDrawing(point, tolerance?)` and `selectDrawingsWithinArea(area)`; hover feedback is sent with `set-drawing-hover`, keeping the hovered drawing hit in chart-owned scene state. Host scene updates preserve that hover state. Both geometry queries use the chart's current frame, candles, visibility and selection state, so the host does not need to supply or mirror geometry inputs. A context-menu action such as “bring to front” is sent as a `move-object` command; the chart updates its own order and renderer.

## Object ordering

The render stack covers the main price series, volume, each indicator, and drawings. New objects are appended when reconciling a scene; removed objects are discarded; retained objects preserve their relative order. The order is included in version 1 snapshots.

The object order is a chart-domain concern. A host may present controls for it, but must not maintain a second authoritative order.

## Snapshot compatibility

Snapshots are versioned. Import rejects unsupported versions and reconciles object references against the imported scene, preventing stale object IDs from entering the active render stack.
