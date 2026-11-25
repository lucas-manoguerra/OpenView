import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import { DrawingToolCatalogMenu } from '../DrawingToolCatalogMenu';
import {
  DEFAULT_DRAWING_TOOL_PREFERENCES,
  loadBrowserDrawingToolPreferences,
  saveBrowserDrawingToolPreferences,
  type DrawingToolPreferences,
  type DrawingToolType,
} from '../../drawings/drawing-tool-preferences';
import {
  createDrawingStyleTemplate,
  loadBrowserDrawingStyleTemplates,
  saveBrowserDrawingStyleTemplates,
  type DrawingStyleTemplate,
} from '../../drawings/drawing-style-templates';
import type { ChartDrawingLineStyle } from '@openview/chart-engine';

const isDrawingTool = (tool: string): tool is DrawingToolType =>
  Object.prototype.hasOwnProperty.call(DEFAULT_DRAWING_TOOL_PREFERENCES, tool);

export function DrawingPlayground() {
  const [activeTool, setActiveTool] = useState<DrawingToolType>('trend-line');
  const [preferences, setPreferences] = useState<DrawingToolPreferences>(
    DEFAULT_DRAWING_TOOL_PREFERENCES,
  );
  const [templates, setTemplates] = useState<readonly DrawingStyleTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('default');
  const hasLoadedPreferences = useRef(false);
  const setPlaygroundRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    element.dataset['hydrated'] = 'true';
    if (hasLoadedPreferences.current) return;
    hasLoadedPreferences.current = true;
    setPreferences(loadBrowserDrawingToolPreferences());
    setTemplates(loadBrowserDrawingStyleTemplates());
  }, []);

  const style = preferences[activeTool];
  const toolTemplates = useMemo(
    () => templates.filter((template) => template.tool === activeTool),
    [templates, activeTool],
  );
  const updateStyle = (updates: Partial<typeof style>): void => {
    const next = Object.freeze({
      ...preferences,
      [activeTool]: Object.freeze({ ...style, ...updates }),
    });
    setPreferences(next);
    saveBrowserDrawingToolPreferences(next);
    setSelectedTemplateId('');
  };
  const applyTemplate = (id: string): void => {
    setSelectedTemplateId(id);
    if (id === 'default') {
      updateStyle(DEFAULT_DRAWING_TOOL_PREFERENCES[activeTool]);
      setSelectedTemplateId('default');
      return;
    }
    const template = toolTemplates.find((item) => item.id === id);
    if (template) updateStyle(template);
    setSelectedTemplateId(id);
  };
  const saveTemplate = (): void => {
    const name = templateName.trim();
    if (
      !name ||
      toolTemplates.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    ) {
      return;
    }
    const template = createDrawingStyleTemplate(
      'custom-' + Date.now().toString(36),
      name,
      activeTool,
      style,
    );
    if (!template) return;
    const next = Object.freeze([...templates, template]);
    setTemplates(next);
    saveBrowserDrawingStyleTemplates(next);
    setTemplateName('');
    setSelectedTemplateId(template.id);
  };
  const deleteTemplate = (): void => {
    const next = templates.filter((item) => item.id !== selectedTemplateId);
    setTemplates(next);
    saveBrowserDrawingStyleTemplates(next);
    setSelectedTemplateId('default');
  };

  return (
    <div
      class="space-y-6"
      data-testid="drawings-playground"
      data-hydrated="false"
      ref={setPlaygroundRef}
    >
      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Catálogo de herramientas</h2>
        <div class="flex min-h-28 items-start gap-3 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <DrawingToolCatalogMenu
            activeTool={activeTool}
            onSelect={(tool) => {
              if (isDrawingTool(tool)) setActiveTool(tool);
            }}
          />
          <div class="min-w-0 flex-1 text-xs leading-5 text-[#787b86]">
            Selecciona una herramienta para inspeccionar su configuración por defecto, última\n            configuración y plantillas propias.
          </div>
          <span data-testid="drawing-active-tool" class="text-[11px] text-[#787b86]">
            {activeTool}
          </span>
        </div>
      </section>
      <section class="space-y-3">
        <div>
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Propiedades de dibujo</h2>
          <p class="mt-1 text-xs text-[#787b86]">
            Los cambios se guardan como última configuración de esta herramienta.
          </p>
        </div>
        <div class="grid gap-3 rounded-md border border-[#2a2e39] bg-[#131722] p-4 sm:grid-cols-3">
          <label class="flex items-center gap-3 text-xs text-[#b2b5be]">
            Color
            <input
              type="color"
              aria-label="Color de dibujo"
              data-testid="drawing-style-color"
              value={style.color}
              onInput={(event) => updateStyle({ color: event.currentTarget.value })}
              class="h-8 w-12 cursor-pointer rounded border border-[#434651] bg-transparent"
            />
          </label>
          <label class="flex items-center gap-2 text-xs text-[#b2b5be]">
            Grosor
            <select
              aria-label="Grosor de línea"
              data-testid="drawing-style-width"
              value={String(style.lineWidth)}
              onChange={(event) => updateStyle({ lineWidth: Number(event.currentTarget.value) })}
              class="h-8 rounded border border-[#434651] bg-[#1e222d] px-2 text-xs text-[#d1d4dc]"
            >
              {[1, 1.5, 2, 3, 4, 5, 6].map((width) => (
                <option value={String(width)}>{width} px</option>
              ))}
            </select>
          </label>
          <label class="flex items-center gap-2 text-xs text-[#b2b5be]">
            Estilo
            <select
              aria-label="Estilo de línea"
              data-testid="drawing-style-line"
              value={style.lineStyle}
              onChange={(event) =>
                updateStyle({ lineStyle: event.currentTarget.value as ChartDrawingLineStyle })
              }
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
                borderTopColor: style.color,
                borderTopWidth: String(style.lineWidth) + 'px',
                borderTopStyle: style.lineStyle,
              }}
            />
            <span class="font-mono text-[10px] text-[#787b86]">Vista previa</span>
          </div>
        </div>
      </section>
      <section class="space-y-3">
        <div>
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Plantillas de {activeTool}</h2>
          <p class="mt-1 text-xs text-[#787b86]">
            Default no se puede borrar. Las plantillas personalizadas solo pertenecen a esta
            herramienta.
          </p>
        </div>
        <div class="space-y-3 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="drawing-template-default"
              onClick={() => applyTemplate('default')}
              class={
                'rounded border px-3 py-2 text-xs ' +
                (selectedTemplateId === 'default'
                  ? 'border-[#2962ff] text-white'
                  : 'border-[#434651] text-[#b2b5be]')
              }
            >
              Default
            </button>
            {toolTemplates.map((template) => (
              <button
                type="button"
                key={template.id}
                data-testid={'drawing-custom-template-' + template.id}
                onClick={() => applyTemplate(template.id)}
                class={
                  'rounded border px-3 py-2 text-xs ' +
                  (selectedTemplateId === template.id
                    ? 'border-[#2962ff] text-white'
                    : 'border-[#434651] text-[#b2b5be]')
                }
              >
                {template.name}
              </button>
            ))}
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <label class="min-w-48 flex-1 space-y-1 text-xs text-[#b2b5be]">
              Nombre de plantilla
              <input
                aria-label="Nombre de plantilla"
                data-testid="drawing-template-name"
                value={templateName}
                maxLength={32}
                onInput={(event) => setTemplateName(event.currentTarget.value)}
                placeholder="Mi estilo"
                class="h-8 w-full rounded border border-[#434651] bg-[#1e222d] px-2 text-xs text-[#d1d4dc]"
              />
            </label>
            <button
              type="button"
              data-testid="drawing-template-save"
              disabled={!templateName.trim() || toolTemplates.length >= 20}
              onClick={saveTemplate}
              class="h-8 rounded bg-[#2962ff] px-3 text-xs font-medium text-white disabled:opacity-40"
            >
              Guardar plantilla
            </button>
            <button
              type="button"
              data-testid="drawing-template-delete"
              disabled={
                selectedTemplateId === 'default' ||
                !toolTemplates.some((item) => item.id === selectedTemplateId)
              }
              onClick={deleteTemplate}
              class="h-8 rounded border border-[#434651] px-3 text-xs text-[#b2b5be] disabled:opacity-40"
            >
              Eliminar seleccionada
            </button>
          </div>
          <span class="text-[10px] text-[#787b86]" data-testid="drawing-template-count">
            {toolTemplates.length} plantillas personalizadas de esta herramienta
          </span>
        </div>
      </section>
    </div>
  );
}
