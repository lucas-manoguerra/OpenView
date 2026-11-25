import { useMemo, useState } from 'preact/hooks';
import {
  DRAWING_TOOL_CATALOG,
  DRAWING_TOOL_GROUPS,
  getDrawingToolsByGroup,
  type DrawingToolGroup,
} from '../../drawings/drawing-tool-catalog';

export type ImplementedDrawingToolId =
  | 'trend-line'
  | 'ray'
  | 'horizontal-line'
  | 'vertical-line'
  | 'rectangle';

type DrawingToolCatalogMenuProps = Readonly<{
  activeTool: string;
  onSelect: (tool: ImplementedDrawingToolId) => void;
}>;

const implementedTools = new Set<ImplementedDrawingToolId>([
  'trend-line',
  'ray',
  'horizontal-line',
  'vertical-line',
  'rectangle',
]);

export function DrawingToolCatalogMenu({ activeTool, onSelect }: DrawingToolCatalogMenuProps) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<DrawingToolGroup>('lines');
  const [query, setQuery] = useState('');
  const tools = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const source = normalizedQuery
      ? DRAWING_TOOL_CATALOG
      : getDrawingToolsByGroup(group);
    return source.filter((tool) =>
      normalizedQuery
        ? tool.label.toLocaleLowerCase().includes(normalizedQuery) ||
          tool.id.toLocaleLowerCase().includes(normalizedQuery)
        : true,
    );
  }, [group, query]);

  return (
    <div class="relative z-40 w-full px-1">
      <button
        type="button"
        data-testid="drawing-tool-catalog-toggle"
        aria-label="Abrir catálogo de herramientas de dibujo"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        class="grid size-8 place-items-center rounded text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        title="Todas las herramientas de dibujo"
      >
        ▦
      </button>
      {open ? (
        <section
          data-testid="drawing-tool-catalog"
          aria-label="Catálogo de herramientas de dibujo"
          class="absolute left-full top-0 ml-2 flex max-h-[min(560px,80vh)] w-[min(620px,calc(100vw-64px))] overflow-hidden rounded-lg border border-white/10 bg-[#101723] text-slate-200 shadow-2xl"
        >
          <nav aria-label="Familias de herramientas" class="w-40 shrink-0 overflow-y-auto border-r border-white/10 p-1.5">
            {DRAWING_TOOL_GROUPS.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={group === item.id}
                data-testid={`drawing-tool-group-${item.id}`}
                onClick={() => {
                  setGroup(item.id);
                  setQuery('');
                }}
                class={`mb-0.5 flex min-h-8 w-full items-center rounded px-2 text-left text-[11px] transition-colors ${
                  group === item.id
                    ? 'bg-blue-500/20 text-blue-200'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="border-b border-white/10 p-2">
              <label class="sr-only" for="drawing-tool-catalog-search">Buscar herramientas</label>
              <input
                id="drawing-tool-catalog-search"
                data-testid="drawing-tool-catalog-search"
                type="search"
                value={query}
                onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
                placeholder="Buscar herramienta…"
                class="h-8 w-full rounded border border-white/10 bg-[#0b0f17] px-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-500"
              />
            </div>
            <div class="grid min-h-0 flex-1 grid-cols-2 content-start gap-1 overflow-y-auto p-2 sm:grid-cols-3">
              {tools.map((tool) => {
                const available = implementedTools.has(tool.id as ImplementedDrawingToolId);
                return (
                  <button
                    type="button"
                    key={tool.id}
                    data-testid={`drawing-tool-catalog-item-${tool.id}`}
                    data-availability={tool.availability}
                    disabled={!available}
                    aria-pressed={activeTool === tool.id}
                    onClick={() => {
                      if (!available) return;
                      onSelect(tool.id as ImplementedDrawingToolId);
                      setOpen(false);
                    }}
                    class={`flex min-h-14 flex-col items-start justify-center gap-1 rounded border px-2 py-1.5 text-left transition-colors ${
                      activeTool === tool.id
                        ? 'border-blue-400/50 bg-blue-500/15 text-blue-100'
                        : available
                          ? 'border-white/5 text-slate-300 hover:border-white/15 hover:bg-white/5'
                          : 'cursor-not-allowed border-transparent text-slate-500 opacity-70'
                    }`}
                  >
                    <span class="text-[11px] leading-tight">{tool.label}</span>
                    <span class="text-[9px] uppercase tracking-wide text-slate-500">
                      {available ? 'Disponible' : 'Próximamente'}
                    </span>
                  </button>
                );
              })}
              {tools.length === 0 ? (
                <p class="col-span-full px-2 py-6 text-center text-xs text-slate-500">
                  No se encontraron herramientas
                </p>
              ) : null}
            </div>
            <footer class="border-t border-white/10 px-2 py-1.5 text-[10px] text-slate-500">
              {DRAWING_TOOL_CATALOG.filter((tool) => tool.availability === 'implemented').length} de {DRAWING_TOOL_CATALOG.length} herramientas implementadas
            </footer>
          </div>
        </section>
      ) : null}
    </div>
  );
}
