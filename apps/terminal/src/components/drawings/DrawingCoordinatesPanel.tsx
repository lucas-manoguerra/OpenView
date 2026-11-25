import type { ChartRenderDrawing } from '@openview/chart-engine';
import type { DrawingPanelPosition } from '../../drawings/drawing-panel-layout';

type DrawingCoordinatesPanelProps = Readonly<{
  selectedDrawing: ChartRenderDrawing;
  panelPosition: DrawingPanelPosition | null;
  panelRef: (element: HTMLElement | null) => void;
  onDragStart: (event: PointerEvent) => void;
  onClose: () => void;
  onAnchorUpdate: (target: 'start' | 'end', updates: Partial<ChartRenderDrawing['start']>) => void;
}>;

const toLocalDateTimeValue = (timestamp: number): string => {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function DrawingCoordinatesPanel({
  selectedDrawing,
  panelPosition,
  panelRef,
  onDragStart,
  onClose,
  onAnchorUpdate,
}: DrawingCoordinatesPanelProps) {
  return (
    <section
      ref={panelRef}
      data-testid="drawing-coordinate-panel"
      data-panel-left={panelPosition?.left ?? 'default'}
      data-panel-top={panelPosition?.top ?? 'default'}
      aria-label="Coordenadas del dibujo"
      class="absolute left-3 top-24 z-20 w-56 max-w-[calc(100%_-_3rem)] max-h-[25%] overflow-y-auto rounded-xl border border-white/10 bg-[#101723]/95 p-3 shadow-xl backdrop-blur"
      style={
        panelPosition === null
          ? undefined
          : {
              left: panelPosition.left,
              top: panelPosition.top,
              right: 'auto',
              bottom: 'auto',
            }
      }
    >
      <div class="mb-2 flex items-center gap-2">
        <div
          data-testid="drawing-coordinate-drag-handle"
          onPointerDown={onDragStart}
          class="min-w-0 flex-1 cursor-grab touch-none rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 active:cursor-grabbing"
        >
          {selectedDrawing.type === 'horizontal-line'
            ? 'Nivel de precio'
            : selectedDrawing.type === 'vertical-line'
              ? 'Marca temporal'
              : selectedDrawing.type === 'rectangle'
                ? 'Límites del rectángulo'
                : 'Puntos de anclaje'}
        </div>
        <button
          type="button"
          aria-label="Ocultar panel de coordenadas"
          data-testid="drawing-coordinate-close"
          onClick={onClose}
          class="grid size-6 shrink-0 place-items-center rounded text-xs text-slate-400 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>
      {selectedDrawing.type === 'horizontal-line' && (
        <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
          Precio
          <input
            type="number"
            step="any"
            aria-label="Precio de la línea horizontal"
            data-testid="drawing-horizontal-price"
            value={String(selectedDrawing.start.price)}
            onInput={(event) =>
              onAnchorUpdate('start', { price: Number(event.currentTarget.value) })
            }
            class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
          />
        </label>
      )}
      {selectedDrawing.type === 'vertical-line' && (
        <label class="grid grid-cols-1 gap-1 text-[10px] text-slate-400">
          Fecha y hora local
          <input
            type="datetime-local"
            aria-label="Fecha y hora de la línea vertical"
            data-testid="drawing-vertical-time"
            value={toLocalDateTimeValue(selectedDrawing.start.timestamp)}
            onInput={(event) =>
              onAnchorUpdate('start', {
                timestamp: new Date(event.currentTarget.value).getTime(),
              })
            }
            class="w-full rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-blue-400"
          />
        </label>
      )}
      {(selectedDrawing.type === 'trend-line' || selectedDrawing.type === 'ray') &&
        selectedDrawing.end !== null && (
          <div class="space-y-2">
            <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
              Precio inicial
              <input
                type="number"
                step="any"
                aria-label="Precio inicial del dibujo"
                data-testid="drawing-start-price"
                value={String(selectedDrawing.start.price)}
                onInput={(event) =>
                  onAnchorUpdate('start', { price: Number(event.currentTarget.value) })
                }
                class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
              />
            </label>
            <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
              Precio final
              <input
                type="number"
                step="any"
                aria-label="Precio final del dibujo"
                data-testid="drawing-end-price"
                value={String(selectedDrawing.end.price)}
                onInput={(event) =>
                  onAnchorUpdate('end', { price: Number(event.currentTarget.value) })
                }
                class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
              />
            </label>
          </div>
        )}
      {selectedDrawing.type === 'rectangle' && selectedDrawing.end !== null && (
        <div class="space-y-2">
          <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
            Precio del primer punto
            <input
              type="number"
              step="any"
              aria-label="Precio del primer punto del rectángulo"
              data-testid="drawing-rectangle-start-price"
              value={String(selectedDrawing.start.price)}
              onInput={(event) =>
                onAnchorUpdate('start', { price: Number(event.currentTarget.value) })
              }
              class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
            />
          </label>
          <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
            Precio del segundo punto
            <input
              type="number"
              step="any"
              aria-label="Precio del segundo punto del rectángulo"
              data-testid="drawing-rectangle-end-price"
              value={String(selectedDrawing.end.price)}
              onInput={(event) =>
                onAnchorUpdate('end', { price: Number(event.currentTarget.value) })
              }
              class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
            />
          </label>
        </div>
      )}
    </section>
  );
}
