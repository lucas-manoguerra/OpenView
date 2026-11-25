import { useCallback, useState } from 'preact/hooks';
import { DrawingToolCatalogMenu } from '../DrawingToolCatalogMenu';
import {
  BUILT_IN_DRAWING_STYLE_TEMPLATES,
  MAX_CUSTOM_DRAWING_TEMPLATES,
  createDrawingStyleTemplate,
  loadBrowserDrawingStyleTemplates,
  saveBrowserDrawingStyleTemplates,
  type DrawingStyle,
  type DrawingStyleTemplate,
} from '../../drawings/drawing-style-templates';
import type { ChartDrawingLineStyle } from '@openview/chart-engine';

export function DrawingPlayground() {
  const [activeTool, setActiveTool] = useState('trend-line');
  const [color, setColor] = useState('#60a5fa');
  const [lineWidth, setLineWidth] = useState(1.5);
  const [lineStyle, setLineStyle] = useState<ChartDrawingLineStyle>('solid');
  const [templateName, setTemplateName] = useState('');
  const [customTemplates, setCustomTemplates] = useState<readonly DrawingStyleTemplate[]>([]);
  const setPlaygroundRef = useCallback((element: HTMLDivElement | null) => {
    if (element) element.dataset['hydrated'] = 'true';
  }, []);

  const applyStyle = (style: DrawingStyle): void => {
    setColor(style.color);
    setLineWidth(style.lineWidth);
    setLineStyle(style.lineStyle);
  };

  const saveTemplate = (): void => {
    const name = templateName.trim();
    if (
      name.length === 0 ||
      customTemplates.length >= MAX_CUSTOM_DRAWING_TEMPLATES ||
      customTemplates.some(
        (template) => template.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      return;
    }

    const template = createDrawingStyleTemplate('custom-' + Date.now().toString(36), name, {
      color,
      lineWidth,
      lineStyle,
    });
    if (template === null) return;

    const nextTemplates = Object.freeze([...customTemplates, template]);
    setCustomTemplates(nextTemplates);
    saveBrowserDrawingStyleTemplates(nextTemplates);
    setTemplateName('');
  };

  const loadTemplates = (): void => {
    setCustomTemplates(loadBrowserDrawingStyleTemplates());
  };

  return (
    <div
      class="space-y-6"
      data-testid="drawings-playground"
      data-hydrated="false"
      ref={setPlaygroundRef}
    >
      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Catálogo de herramientas</h2>
          <span class="text-[11px] text-[#787b86]" data-testid="drawing-active-tool">
            {activeTool}
          </span>
        </div>
        <div class="flex min-h-28 items-start gap-3 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <DrawingToolCatalogMenu
            activeTool={activeTool}
            onSelect={(tool) => setActiveTool(tool)}
          />
          <div class="min-w-0 flex-1 space-y-1 text-xs leading-5 text-[#787b86]">
            <p>Explora las familias, busca herramientas y selecciona las implementadas.</p>
            <p>Las herramientas planificadas permanecen visibles y deshabilitadas hasta completar su geometría e interacción.</p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <div>
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Propiedades de dibujo</h2>
          <p class="mt-1 text-xs text-[#787b86]">Prueba los valores de estilo de forma independiente del gráfico.</p>
        </div>
        <div class="grid gap-3 rounded-md border border-[#2a2e39] bg-[#131722] p-4 sm:grid-cols-3">
          <label class="flex items-center gap-3 text-xs text-[#b2b5be]">
            Color
            <input
              type="color"
              aria-label="Color de dibujo"
              data-testid="drawing-style-color"
              value={color}
              onInput={(event) => setColor(event.currentTarget.value)}
              class="h-8 w-12 cursor-pointer rounded border border-[#434651] bg-transparent"
            />
            <span class="font-mono text-[10px] text-[#787b86]">{color}</span>
          </label>
          <label class="flex items-center gap-2 text-xs text-[#b2b5be]">
            Grosor
            <select
              aria-label="Grosor de línea"
              data-testid="drawing-style-width"
              value={String(lineWidth)}
              onChange={(event) => setLineWidth(Number(event.currentTarget.value))}
              class="h-8 rounded border border-[#434651] bg-[#1e222d] px-2 text-xs text-[#d1d4dc]"
            >
              <option value="0.5">0.5 px</option>
              <option value="1">1 px</option>
              <option value="1.5">1.5 px</option>
              <option value="2">2 px</option>
              <option value="3">3 px</option>
              <option value="4">4 px</option>
              <option value="6">6 px</option>
              <option value="8">8 px</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-xs text-[#b2b5be]">
            Estilo
            <select
              aria-label="Estilo de línea"
              data-testid="drawing-style-line"
              value={lineStyle}
              onChange={(event) => setLineStyle(event.currentTarget.value as ChartDrawingLineStyle)}
              class="h-8 rounded border border-[#434651] bg-[#1e222d] px-2 text-xs text-[#d1d4dc]"
            >
              <option value="solid">Continua</option>
              <option value="dashed">Discontinua</option>
              <option value="dotted">Punteada</option>
            </select>
          </label>
          <div class="flex items-center gap-3 rounded border border-[#2a2e39] bg-[#0b0e14] p-3 sm:col-span-3">
            <span
              aria-hidden="true"
              class="h-0 flex-1"
              style={{
                borderTopColor: color,
                borderTopWidth: String(lineWidth) + 'px',
                borderTopStyle: lineStyle,
              }}
            />
            <span class="font-mono text-[10px] text-[#787b86]">Vista previa</span>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <div>
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Plantillas de estilo</h2>
          <p class="mt-1 text-xs text-[#787b86]">Aplica estilos predefinidos o guarda configuraciones personalizadas.</p>
        </div>
        <div class="flex flex-wrap gap-2 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          {BUILT_IN_DRAWING_STYLE_TEMPLATES.map((template) => (
            <button
              type="button"
              key={template.id}
              data-testid={'drawing-template-' + template.id}
              onClick={() => applyStyle(template)}
              class="flex items-center gap-2 rounded border border-[#434651] bg-[#1e222d] px-3 py-2 text-xs text-[#d1d4dc] hover:border-[#6b9eff]"
            >
              <span class="size-2.5 rounded-full" style={{ backgroundColor: template.color }} />
              {template.name}
            </button>
          ))}
        </div>
        <div class="flex flex-wrap items-end gap-2 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <label class="min-w-48 flex-1 space-y-1 text-xs text-[#b2b5be]">
            Nombre de plantilla
            <input
              aria-label="Nombre de plantilla"
              data-testid="drawing-template-name"
              value={templateName}
              maxLength={32}
              onInput={(event) => setTemplateName(event.currentTarget.value)}
              placeholder="Mi estilo"
              class="h-8 w-full rounded border border-[#434651] bg-[#1e222d] px-2 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff]"
            />
          </label>
          <button
            type="button"
            data-testid="drawing-template-save"
            disabled={
              templateName.trim().length === 0 ||
              customTemplates.length >= MAX_CUSTOM_DRAWING_TEMPLATES ||
              customTemplates.some(
                (template) => template.name.toLocaleLowerCase() === templateName.trim().toLocaleLowerCase(),
              )
            }
            onClick={saveTemplate}
            class="h-8 rounded bg-[#2962ff] px-3 text-xs font-medium text-white hover:bg-[#1e53e5] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Guardar plantilla
          </button>
          <button
            type="button"
            data-testid="drawing-template-load"
            onClick={loadTemplates}
            class="h-8 rounded border border-[#434651] px-3 text-xs text-[#b2b5be] hover:bg-[#1e222d]"
          >
            Cargar guardadas
          </button>
          <span class="w-full text-[10px] text-[#787b86]" data-testid="drawing-template-count">
            {customTemplates.length} / {MAX_CUSTOM_DRAWING_TEMPLATES} plantillas personalizadas
          </span>
          {customTemplates.map((template) => (
            <button
              type="button"
              key={template.id}
              data-testid={'drawing-custom-template-' + template.id}
              onClick={() => applyStyle(template)}
              class="flex items-center gap-2 rounded border border-[#434651] px-3 py-2 text-xs text-[#d1d4dc] hover:border-[#6b9eff]"
            >
              <span class="size-2.5 rounded-full" style={{ backgroundColor: template.color }} />
              {template.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
