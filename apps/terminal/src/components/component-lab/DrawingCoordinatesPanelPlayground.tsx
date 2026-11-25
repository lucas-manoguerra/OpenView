import { useState } from 'preact/hooks';
import type { ChartRenderDrawing } from '@openview/chart-engine';
import { DrawingCoordinatesPanel } from '../drawings/DrawingCoordinatesPanel';

const INITIAL_DRAWING: ChartRenderDrawing = {
  id: 'component-lab-coordinate-drawing',
  type: 'trend-line',
  start: { timestamp: 1_700_000_000_000, price: 42000 },
  end: { timestamp: 1_700_001_200_000, price: 43500 },
  color: '#60a5fa',
  lineWidth: 1,
  lineStyle: 'solid',
};

export function DrawingCoordinatesPanelPlayground() {
  const [drawing, setDrawing] = useState<ChartRenderDrawing>(INITIAL_DRAWING);
  const [visible, setVisible] = useState(true);

  const updateAnchor = (target: 'start' | 'end', updates: Partial<ChartRenderDrawing['start']>) => {
    setDrawing((current) => {
      if (target === 'start') {
        return { ...current, start: { ...current.start, ...updates } };
      }
      if (current.end === null) return current;
      return { ...current, end: { ...current.end, ...updates } };
    });
  };

  return (
    <section class="space-y-4" data-testid="drawing-coordinates-playground">
      <div class="rounded-md border border-[#2a2e39] bg-[#131722] p-4">
        <label class="grid max-w-xs gap-2 text-xs text-[#787b86]">
          Tipo de dibujo
          <select
            data-testid="drawing-coordinate-type"
            value={drawing.type}
            onChange={(event) => {
              const type = event.currentTarget.value as ChartRenderDrawing['type'];
              setDrawing((current) => ({
                ...current,
                type,
                end:
                  type === 'horizontal-line' || type === 'vertical-line'
                    ? null
                    : (current.end ?? current.start),
              }));
            }}
            class="rounded border border-[#2a2e39] bg-[#0b0f17] px-3 py-2 text-sm text-[#d1d4dc]"
          >
            <option value="trend-line">Línea de tendencia</option>
            <option value="ray">Rayo</option>
            <option value="horizontal-line">Línea horizontal</option>
            <option value="vertical-line">Línea vertical</option>
            <option value="rectangle">Rectángulo</option>
          </select>
        </label>
        <p class="mt-3 text-xs text-[#787b86]" data-testid="drawing-coordinate-state">
          Inicio: {drawing.start.price} · Final: {drawing.end?.price ?? '—'}
        </p>
      </div>
      <div class="relative min-h-[340px] rounded-md border border-[#2a2e39] bg-[#0b0f17] p-4">
        {visible ? (
          <DrawingCoordinatesPanel
            selectedDrawing={drawing}
            panelPosition={null}
            panelRef={(element) => {
              if (element) element.dataset['hydrated'] = 'true';
            }}
            onDragStart={() => {}}
            onClose={() => setVisible(false)}
            onAnchorUpdate={updateAnchor}
          />
        ) : (
          <button
            type="button"
            data-testid="drawing-coordinate-reopen"
            onClick={() => setVisible(true)}
            class="rounded border border-[#2a2e39] px-3 py-2 text-xs text-[#d1d4dc] hover:bg-white/5"
          >
            Mostrar coordenadas
          </button>
        )}
      </div>
    </section>
  );
}
