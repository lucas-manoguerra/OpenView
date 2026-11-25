import type { ChartRenderDrawing } from '@openview/chart-engine';
import type { DrawingStyleTemplate } from '../../drawings/drawing-style-templates';
import type { DrawingToolType } from '../../drawings/drawing-tool-preferences';
import type { DrawingPanelPosition } from '../../drawings/drawing-panel-layout';

type DrawingStyleUpdates = Partial<
  Pick<
    ChartRenderDrawing,
    | 'color'
    | 'lineWidth'
    | 'lineStyle'
    | 'fillColor'
    | 'fillOpacity'
    | 'extendStart'
    | 'extendEnd'
    | 'startStyle'
    | 'endStyle'
  >
>;

type DrawingPropertiesPanelProps = Readonly<{
  selectedDrawing: ChartRenderDrawing;
  selectedDrawingIds: readonly string[];
  selectedDrawingsShareType: boolean;
  panelPosition: DrawingPanelPosition | null;
  templates: readonly DrawingStyleTemplate[];
  activeDefaultStyle: boolean;
  activeTemplateTool: DrawingToolType | null;
  expanded: boolean;
  selectedTemplateId: string;
  newTemplateName: string;
  templateError: string | null;
  panelRef: (element: HTMLDivElement | null) => void;
  onDragStart: (event: PointerEvent) => void;
  onClose: () => void;
  onStyleChange: (updates: DrawingStyleUpdates) => void;
  onToggleTemplates: () => void;
  onTemplateChange: (templateId: string) => void;
  onApplyTemplate: () => void;
  onDeleteTemplate: () => void;
  onTemplateNameChange: (name: string) => void;
  onSaveTemplate: () => void;
}>;

export function DrawingPropertiesPanel({
  selectedDrawing,
  selectedDrawingIds,
  selectedDrawingsShareType,
  panelPosition,
  templates,
  activeDefaultStyle,
  activeTemplateTool,
  expanded,
  selectedTemplateId,
  newTemplateName,
  templateError,
  panelRef,
  onDragStart,
  onClose,
  onStyleChange,
  onToggleTemplates,
  onTemplateChange,
  onApplyTemplate,
  onDeleteTemplate,
  onTemplateNameChange,
  onSaveTemplate,
}: DrawingPropertiesPanelProps) {
  return (
    <div
      ref={panelRef}
      data-testid="drawing-properties-panel"
      data-panel-left={panelPosition?.left ?? 'default'}
      data-panel-top={panelPosition?.top ?? 'default'}
      class="absolute bottom-10 left-3 z-20 w-64 max-w-[calc(100%_-_3rem)] max-h-[60%] overflow-y-auto rounded-xl border border-white/10 bg-[#101723]/95 p-3 shadow-2xl backdrop-blur"
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
      <div class="mb-3 flex items-center gap-2">
        <div
          data-testid="drawing-properties-drag-handle"
          class="flex min-w-0 flex-1 cursor-grab items-center gap-2 touch-none rounded px-1 py-1 text-[11px] font-semibold text-slate-200 active:cursor-grabbing"
          onPointerDown={onDragStart}
        >
          <span aria-hidden="true" class="text-slate-500">
            ⠿
          </span>
          <span class="truncate">
            {selectedDrawingIds.length > 1
              ? 'Editar ' + selectedDrawingIds.length + ' dibujos'
              : 'Editar ' + selectedDrawing.type}
          </span>
        </div>
        <button
          type="button"
          aria-label="Ocultar panel de estilo"
          data-testid="drawing-editor-close"
          onClick={onClose}
          class="grid size-6 shrink-0 place-items-center rounded text-xs text-slate-400 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>
      <div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
        <label htmlFor="drawing-style-color" class="text-[10px] text-slate-400">
          Color
        </label>
        <input
          id="drawing-style-color"
          type="color"
          aria-label="Color del dibujo"
          data-testid="drawing-style-color"
          value={selectedDrawing.color}
          onInput={(event) => onStyleChange({ color: event.currentTarget.value })}
          class="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
        />
        <label htmlFor="drawing-style-width" class="text-[10px] text-slate-400">
          Grosor
        </label>
        <select
          id="drawing-style-width"
          aria-label="Grosor del dibujo"
          data-testid="drawing-style-width"
          value={String(selectedDrawing.lineWidth ?? 1.5)}
          onChange={(event) => onStyleChange({ lineWidth: Number(event.currentTarget.value) })}
          class="min-w-20 rounded border border-white/10 bg-[#0b0f17] px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-blue-400"
        >
          <option value="1">1 px</option>
          <option value="1.5">1.5 px</option>
          <option value="2">2 px</option>
          <option value="3">3 px</option>
          <option value="4">4 px</option>
          <option value="5">5 px</option>
          <option value="6">6 px</option>
        </select>
        <label htmlFor="drawing-style-line" class="text-[10px] text-slate-400">
          Trazo
        </label>
        <select
          id="drawing-style-line"
          aria-label="Estilo de línea del dibujo"
          data-testid="drawing-style-line"
          value={selectedDrawing.lineStyle ?? 'solid'}
          onChange={(event) =>
            onStyleChange({
              lineStyle: event.currentTarget.value as NonNullable<ChartRenderDrawing['lineStyle']>,
            })
          }
          class="min-w-20 rounded border border-white/10 bg-[#0b0f17] px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-blue-400"
        >
          <option value="solid">Continuo</option>
          <option value="dashed">Guiones</option>
          <option value="dotted">Puntos</option>
        </select>
      </div>
      {selectedDrawingsShareType && selectedDrawing.type === 'rectangle' && (
        <div
          class="mt-3 space-y-2 border-t border-white/10 pt-3"
          data-testid="drawing-rectangle-properties"
        >
          <div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
            <label htmlFor="drawing-fill-color" class="text-[10px] text-slate-400">
              Color de relleno
            </label>
            <input
              id="drawing-fill-color"
              type="color"
              aria-label="Color de relleno"
              data-testid="drawing-fill-color"
              value={selectedDrawing.fillColor ?? selectedDrawing.color}
              onInput={(event) => onStyleChange({ fillColor: event.currentTarget.value })}
              class="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
            />
          </div>
          <label class="flex items-center justify-between gap-3 text-[10px] text-slate-400">
            Opacidad del relleno
            <input
              type="range"
              aria-label="Opacidad del relleno"
              data-testid="drawing-fill-opacity"
              min="0"
              max="100"
              step="5"
              value={String(Math.round((selectedDrawing.fillOpacity ?? 0) * 100))}
              onInput={(event) =>
                onStyleChange({ fillOpacity: Number(event.currentTarget.value) / 100 })
              }
              class="w-28 accent-blue-400"
            />
            <span class="w-8 text-right tabular-nums text-slate-300">
              {Math.round((selectedDrawing.fillOpacity ?? 0) * 100)}%
            </span>
          </label>
        </div>
      )}
      {selectedDrawingsShareType &&
        (selectedDrawing.type === 'trend-line' || selectedDrawing.type === 'ray') && (
          <div
            class="mt-3 space-y-2 border-t border-white/10 pt-3"
            data-testid="drawing-line-properties"
          >
            <div class="grid grid-cols-2 gap-2">
              <label class="flex items-center gap-2 text-[10px] text-slate-400">
                <input
                  type="checkbox"
                  aria-label="Extender inicio"
                  data-testid="drawing-extend-start"
                  checked={selectedDrawing.extendStart ?? false}
                  onChange={(event) => onStyleChange({ extendStart: event.currentTarget.checked })}
                  class="accent-blue-400"
                />
                Extender inicio
              </label>
              <label class="flex items-center gap-2 text-[10px] text-slate-400">
                <input
                  type="checkbox"
                  aria-label="Extender final"
                  data-testid="drawing-extend-end"
                  checked={selectedDrawing.extendEnd ?? selectedDrawing.type === 'ray'}
                  onChange={(event) => onStyleChange({ extendEnd: event.currentTarget.checked })}
                  class="accent-blue-400"
                />
                Extender final
              </label>
            </div>
            <div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
              <label htmlFor="drawing-start-style" class="text-[10px] text-slate-400">
                Estilo de inicio
              </label>
              <select
                id="drawing-start-style"
                aria-label="Estilo de inicio"
                data-testid="drawing-start-style"
                value={selectedDrawing.startStyle ?? 'none'}
                onChange={(event) =>
                  onStyleChange({
                    startStyle: event.currentTarget.value as NonNullable<
                      ChartRenderDrawing['startStyle']
                    >,
                  })
                }
                class="min-w-24 rounded border border-white/10 bg-[#0b0f17] px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-blue-400"
              >
                <option value="none">Ninguno</option>
                <option value="arrow">Flecha</option>
                <option value="circle">Círculo</option>
              </select>
              <label htmlFor="drawing-end-style" class="text-[10px] text-slate-400">
                Estilo final
              </label>
              <select
                id="drawing-end-style"
                aria-label="Estilo final"
                data-testid="drawing-end-style"
                value={selectedDrawing.endStyle ?? 'none'}
                onChange={(event) =>
                  onStyleChange({
                    endStyle: event.currentTarget.value as NonNullable<
                      ChartRenderDrawing['endStyle']
                    >,
                  })
                }
                class="min-w-24 rounded border border-white/10 bg-[#0b0f17] px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-blue-400"
              >
                <option value="none">Ninguno</option>
                <option value="arrow">Flecha</option>
                <option value="circle">Círculo</option>
              </select>
            </div>
          </div>
        )}
      <div class="mt-3 border-t border-white/10 pt-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Plantillas
          </span>
          <button
            type="button"
            data-testid="drawing-templates-toggle"
            aria-expanded={expanded}
            onClick={onToggleTemplates}
            class="rounded px-2 py-1 text-[10px] text-blue-300 transition-colors hover:bg-blue-400/10"
          >
            {expanded ? 'Ocultar' : 'Gestionar'}
          </button>
        </div>
        {expanded && (
          <div class="mt-2 space-y-2" data-testid="drawing-templates-manager">
            <select
              aria-label="Plantilla de dibujo"
              data-testid="drawing-template-select"
              value={selectedTemplateId}
              onChange={(event) => onTemplateChange(event.currentTarget.value)}
              class="w-full rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-blue-400"
            >
              {activeDefaultStyle && <option value="default">Default</option>}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <div class="flex gap-2">
              <button
                type="button"
                data-testid="drawing-template-apply"
                onClick={onApplyTemplate}
                class="flex-1 rounded bg-blue-500/15 px-2 py-1.5 text-[10px] font-medium text-blue-200 hover:bg-blue-500/25"
              >
                Aplicar
              </button>
              {templates.some(
                (template) =>
                  template.id === selectedTemplateId && template.tool === activeTemplateTool,
              ) && (
                <button
                  type="button"
                  data-testid="drawing-template-delete"
                  aria-label="Eliminar plantilla personalizada"
                  onClick={onDeleteTemplate}
                  class="rounded bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200 hover:bg-rose-500/20"
                >
                  Eliminar
                </button>
              )}
            </div>
            <div class="flex gap-2">
              <input
                type="text"
                aria-label="Nombre de la nueva plantilla"
                data-testid="drawing-template-name"
                maxLength={32}
                value={newTemplateName}
                onInput={(event) => onTemplateNameChange(event.currentTarget.value)}
                placeholder="Guardar estilo actual…"
                class="min-w-0 flex-1 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-[10px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-400"
              />
              <button
                type="button"
                data-testid="drawing-template-save"
                disabled={newTemplateName.trim().length === 0}
                onClick={onSaveTemplate}
                class="rounded bg-white/10 px-2 py-1.5 text-[10px] font-medium text-slate-200 hover:bg-white/15 disabled:opacity-30"
              >
                Guardar
              </button>
            </div>
            {templateError !== null && (
              <p role="alert" class="text-[10px] text-rose-300">
                {templateError}
              </p>
            )}
            <p class="text-[9px] leading-relaxed text-slate-500">
              Las plantillas personalizadas se guardan en este navegador y se aplican a toda la
              selección.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
