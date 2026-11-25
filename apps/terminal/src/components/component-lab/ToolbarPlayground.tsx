import { useCallback, useState } from 'preact/hooks';
import { Toolbar, type ToolbarGroup } from '../ui';

const toolbarGroups: readonly ToolbarGroup[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    items: [
      { id: 'cursor', label: 'Cursor', icon: 'mouse-pointer', shortcut: 'V' },
      { id: 'crosshair', label: 'Cruz', icon: 'crosshair', shortcut: 'C' },
    ],
  },
  {
    id: 'drawings',
    label: 'Herramientas de dibujo',
    items: [
      { id: 'trend-line', label: 'Línea de tendencia', icon: 'trending-up', shortcut: 'T' },
      { id: 'horizontal-line', label: 'Línea horizontal', icon: 'minus' },
      { id: 'brush', label: 'Pincel', icon: 'pencil' },
    ],
  },
  {
    id: 'chart',
    label: 'Herramientas del gráfico',
    items: [
      { id: 'measure', label: 'Medir', icon: 'arrow-up-down' },
      { id: 'zoom-in', label: 'Acercar', icon: 'zoom-in' },
      { id: 'zoom-out', label: 'Alejar', icon: 'zoom-out' },
    ],
  },
  {
    id: 'objects',
    label: 'Objetos',
    items: [
      { id: 'lock', label: 'Bloquear dibujos', icon: 'lock' },
      { id: 'hide', label: 'Ocultar dibujos', icon: 'eye-off' },
      { id: 'delete-all', label: 'Eliminar dibujos', icon: 'trash-2', disabled: true },
    ],
  },
];

export function ToolbarPlayground() {
  const [activeTool, setActiveTool] = useState('cursor');
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const setPlaygroundRef = useCallback((element: HTMLDivElement | null) => {
    if (element) element.dataset['hydrated'] = 'true';
  }, []);

  return (
    <div
      class="space-y-6"
      data-testid="toolbar-playground"
      data-hydrated="false"
      ref={setPlaygroundRef}
    >
      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Barra de herramientas</h2>
          <label class="flex items-center gap-2 text-xs text-[#b2b5be]">
            Orientación
            <select
              aria-label="Orientación de la barra"
              value={orientation}
              onChange={(event) =>
                setOrientation(event.currentTarget.value as 'horizontal' | 'vertical')
              }
              class="h-8 rounded border border-[#434651] bg-[#1e222d] px-2 text-xs text-[#d1d4dc]"
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </label>
        </div>
        <div class="flex min-h-24 items-start overflow-x-auto rounded-md border border-[#2a2e39] bg-[#0b0e14] p-4">
          <Toolbar
            groups={toolbarGroups}
            value={activeTool}
            onChange={setActiveTool}
            label="Herramientas de dibujo"
            orientation={orientation}
          />
        </div>
        <div class="flex items-center gap-2 rounded-md border border-[#2a2e39] bg-[#131722] px-3 py-2">
          <span class="text-[11px] text-[#787b86]">Herramienta activa</span>
          <span
            class="font-mono text-xs text-[#6b9eff]"
            aria-live="polite"
            data-testid="toolbar-active-tool"
          >
            {activeTool}
          </span>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Comportamiento</h2>
        <ul class="list-inside list-disc space-y-1 text-xs leading-5 text-[#787b86]">
          <li>Las herramientas se agrupan con separadores visuales.</li>
          <li>La selección activa utiliza el estado azul de OpenView.</li>
          <li>Flechas, Inicio y Fin mueven el foco entre herramientas habilitadas.</li>
          <li>
            Los atajos se muestran en los tooltips y los controles deshabilitados no reciben foco.
          </li>
        </ul>
      </section>
    </div>
  );
}
