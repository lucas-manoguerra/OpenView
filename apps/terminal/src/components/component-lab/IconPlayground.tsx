import { useCallback, useState } from 'preact/hooks';
import { Icon, type IconName, iconRegistry } from '../ui/Icon';

const iconNames = Object.keys(iconRegistry) as IconName[];

export function IconPlayground() {
  const [size, setSize] = useState(18);
  const setPlaygroundRef = useCallback((element: HTMLDivElement | null) => {
    if (element) element.dataset['hydrated'] = 'true';
  }, []);
  const [strokeWidth, setStrokeWidth] = useState(1.8);

  return (
    <div
      class="space-y-6"
      data-testid="icons-playground"
      data-hydrated="false"
      ref={setPlaygroundRef}
    >
      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Propiedades</h2>
          <span class="text-[10px] uppercase tracking-wider text-[#787b86]">
            {iconNames.length} iconos disponibles
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-5 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <label class="flex items-center gap-2 text-xs text-[#b2b5be]">
            Tamaño
            <select
              aria-label="Tamaño del icono"
              value={size}
              onChange={(event) => setSize(Number(event.currentTarget.value))}
              class="h-8 rounded border border-[#434651] bg-[#1e222d] px-2 text-xs text-[#d1d4dc]"
            >
              <option value="14">14 px</option>
              <option value="18">18 px</option>
              <option value="22">22 px</option>
              <option value="28">28 px</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-xs text-[#b2b5be]">
            Grosor
            <select
              aria-label="Grosor del trazo"
              value={strokeWidth}
              onChange={(event) => setStrokeWidth(Number(event.currentTarget.value))}
              class="h-8 rounded border border-[#434651] bg-[#1e222d] px-2 text-xs text-[#d1d4dc]"
            >
              <option value="1.4">1.4</option>
              <option value="1.8">1.8</option>
              <option value="2">2.0</option>
              <option value="2.2">2.2</option>
            </select>
          </label>
          <span class="text-[11px] text-[#787b86]" data-testid="icons-current-size">
            {size}px · stroke {strokeWidth}
          </span>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Biblioteca de iconos</h2>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {iconNames.map((name) => (
            <div
              key={name}
              class="flex min-h-16 items-center gap-3 rounded-md border border-[#2a2e39] bg-[#131722] px-3 py-2"
              data-testid="icon-item"
            >
              <span class="grid size-8 shrink-0 place-items-center text-[#b2b5be]">
                <Icon name={name} size={size} strokeWidth={strokeWidth} />
              </span>
              <span class="min-w-0 truncate font-mono text-[11px] text-[#787b86]">{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Accesibilidad</h2>
        <div class="flex flex-wrap items-center gap-3 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <span class="text-xs text-[#787b86]">Decorativo:</span>
          <Icon name="trending-up" decorative />
          <span class="text-xs text-[#787b86]">Informativo:</span>
          <Icon name="trending-up" decorative={false} label="Tendencia alcista" />
          <span class="text-[11px] text-[#787b86]">
            Los iconos dentro de controles usan aria-hidden; los informativos exponen un nombre.
          </span>
        </div>
      </section>
    </div>
  );
}
