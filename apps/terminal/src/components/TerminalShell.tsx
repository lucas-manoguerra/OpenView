import { useState } from 'preact/hooks';
import { MarketChart } from './MarketChart';

type WorkspaceSection = 'watchlist' | 'markets' | 'chart';

const navigationItems: ReadonlyArray<{
  id: WorkspaceSection;
  label: string;
  abbreviation: string;
}> = [
  { id: 'watchlist', label: 'Lista de seguimiento', abbreviation: 'WL' },
  { id: 'markets', label: 'Mercados', abbreviation: 'MK' },
  { id: 'chart', label: 'Gráfico', abbreviation: 'CH' },
];

const sectionTitles: Record<WorkspaceSection, string> = {
  watchlist: 'Lista de seguimiento',
  markets: 'Mercados',
  chart: 'Espacio de gráficos',
};

const activeNavigationClass =
  'grid size-9 place-items-center rounded-lg bg-blue-500/15 text-[10px] font-semibold text-blue-200 ring-1 ring-inset ring-blue-400/30 transition-colors';

const inactiveNavigationClass =
  'grid size-9 place-items-center rounded-lg text-[10px] font-semibold text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200';

const markTerminalHydrated = (element: HTMLElement | null): void => {
  if (element !== null) {
    element.setAttribute('data-hydrated', 'true');
  }
};

export function TerminalShell() {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('chart');

  return (
    <main
      ref={markTerminalHydrated}
      class="flex h-screen min-h-[600px] flex-col overflow-hidden bg-[#0b0e14] text-slate-200"
    >
      <header class="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#11151d] px-3 sm:px-4">
        <div class="flex min-w-0 items-center gap-3">
          <a
            class="flex shrink-0 items-center gap-2.5 no-underline"
            href="/"
            aria-label="OpenView inicio"
          >
            <span class="grid size-7 place-items-center rounded-md bg-blue-500/15 text-[11px] font-bold text-blue-300">
              OV
            </span>
            <span class="text-sm font-semibold tracking-tight text-white">OpenView</span>
          </a>
          <span class="hidden h-5 w-px bg-white/10 sm:block" />
          <nav aria-label="Navegación del workspace" class="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              aria-current={activeSection === 'chart' ? 'page' : undefined}
              onClick={() => setActiveSection('chart')}
              class={
                'rounded-md px-2.5 py-1.5 text-[11px] transition-colors ' +
                (activeSection === 'chart'
                  ? 'bg-white/[0.07] text-white'
                  : 'text-slate-500 hover:text-slate-200')
              }
            >
              Gráfico
            </button>
            <button
              type="button"
              aria-current={activeSection === 'markets' ? 'page' : undefined}
              onClick={() => setActiveSection('markets')}
              class={
                'rounded-md px-2.5 py-1.5 text-[11px] transition-colors ' +
                (activeSection === 'markets'
                  ? 'bg-white/[0.07] text-white'
                  : 'text-slate-500 hover:text-slate-200')
              }
            >
              Mercados
            </button>
          </nav>
        </div>
        <div class="flex shrink-0 items-center gap-2.5">
          <span class="hidden text-[10px] text-slate-600 md:inline">Market workspace</span>
          <span class="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.04] px-2.5 py-1 text-[10px] text-emerald-300">
            <span class="size-1.5 rounded-full bg-emerald-400" />
            Local preview
          </span>
        </div>
      </header>

      <div class="flex min-h-0 flex-1 overflow-hidden">
        <aside class="hidden w-12 shrink-0 border-r border-white/10 bg-[#11151d] py-2 md:flex md:flex-col md:items-center">
          <nav aria-label="Secciones principales" class="flex flex-col gap-1.5">
            {navigationItems.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-label={item.label}
                aria-current={activeSection === item.id ? 'page' : undefined}
                title={item.label}
                class={activeSection === item.id ? activeNavigationClass : inactiveNavigationClass}
                onClick={() => setActiveSection(item.id)}
              >
                {item.abbreviation}
              </button>
            ))}
          </nav>
          <div class="mt-auto grid size-8 place-items-center rounded-lg border border-white/[0.07] text-[10px] font-semibold text-slate-600">
            OV
          </div>
        </aside>

        <section class="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#0b0e14] p-2 sm:p-3 lg:p-4">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <div class="flex min-w-0 items-center gap-2">
              <h1 class="truncate text-sm font-semibold text-slate-100">
                {sectionTitles[activeSection]}
              </h1>
              <span class="hidden text-[10px] text-slate-600 sm:inline">
                Motor independiente de la interfaz
              </span>
            </div>
            <span class="rounded border border-white/[0.08] px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-slate-500">
              Spot workspace
            </span>
          </div>
          <MarketChart />
        </section>
      </div>
    </main>
  );
}
