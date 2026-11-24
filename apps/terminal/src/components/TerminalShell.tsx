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
  'flex min-w-0 flex-1 items-center gap-3 rounded-lg bg-blue-500/10 px-3 py-3 text-left text-sm text-blue-200 ring-1 ring-inset ring-blue-400/20 transition-colors lg:flex-none';

const markTerminalHydrated = (element: HTMLElement | null): void => {
  if (element !== null) {
    element.setAttribute('data-hydrated', 'true');
  }
};

const inactiveNavigationClass =
  'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 lg:flex-none';

export function TerminalShell() {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('chart');

  return (
    <main ref={markTerminalHydrated} class="min-h-screen bg-[#080b12] text-slate-200">
      <header class="flex h-16 items-center justify-between border-b border-white/10 px-5 lg:px-8">
        <a class="flex items-center gap-3 no-underline" href="/" aria-label="OpenView inicio">
          <span class="grid size-9 place-items-center rounded-xl bg-blue-500/15 text-sm font-bold text-blue-300">
            OV
          </span>
          <span class="text-lg font-semibold tracking-tight text-white">OpenView</span>
          <span class="hidden rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold tracking-widest text-slate-500 sm:inline">
            FOUNDATION
          </span>
        </a>
        <div class="flex items-center gap-3">
          <span class="hidden text-xs text-slate-500 sm:inline">Market workspace</span>
          <span class="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-300">
            <span class="size-1.5 rounded-full bg-emerald-400"></span>
            Local preview
          </span>
        </div>
      </header>

      <div class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1600px] grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside class="border-b border-white/10 p-4 lg:border-r lg:border-b-0 lg:p-5">
          <div class="mb-4 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Workspace
          </div>
          <nav aria-label="Secciones principales" class="flex gap-2 lg:flex-col">
            {navigationItems.map((item) => (
              <button
                type="button"
                aria-current={activeSection === item.id ? 'page' : undefined}
                class={activeSection === item.id ? activeNavigationClass : inactiveNavigationClass}
                onClick={() => setActiveSection(item.id)}
              >
                <span class="grid size-7 shrink-0 place-items-center rounded-md bg-white/5 text-[10px] font-semibold text-slate-400">
                  {item.abbreviation}
                </span>
                <span class="hidden truncate sm:inline">{item.label}</span>
              </button>
            ))}
          </nav>
          <div class="mt-8 hidden rounded-xl border border-white/10 bg-white/[0.02] p-4 lg:block">
            <div class="text-xs font-medium text-slate-300">Arquitectura modular</div>
            <p class="mt-2 text-xs leading-5 text-slate-500">
              Interfaz, dominio, motor gráfico y proveedores evolucionan de forma independiente.
            </p>
          </div>
        </aside>

        <section class="min-w-0 p-5 lg:p-8">
          <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div class="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300">
                OpenView terminal
              </div>
              <h1 class="text-2xl font-semibold tracking-tight text-white">
                {sectionTitles[activeSection]}
              </h1>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Velas históricas reales, múltiples fuentes públicas y un motor gráfico independiente
                se conectan mediante contratos explícitos.
              </p>
            </div>
            <span class="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
              Foundation stage
            </span>
          </div>

          <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div class="overflow-hidden rounded-2xl border border-white/10 bg-[#0d121d]">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                  <div class="text-sm font-medium text-slate-200">Chart engine</div>
                  <div class="mt-1 text-xs text-slate-500">Motor independiente de la interfaz</div>
                </div>
                <span class="rounded-md border border-emerald-400/20 bg-emerald-400/5 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-300">
                  Interactive preview
                </span>
              </div>
              <MarketChart />
            </div>

            <div class="space-y-4">
              <article class="rounded-2xl border border-white/10 bg-[#0d121d] p-5">
                <div class="text-xs font-medium text-slate-400">Market data</div>
                <div class="mt-3 text-lg font-semibold text-white">Fuentes históricas</div>
                <p class="mt-2 text-sm leading-6 text-slate-500">
                  Binance, Bybit y OKX entregan velas históricas a través del mismo servicio.
                </p>
                <div class="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs">
                  <span class="text-slate-500">Proveedores disponibles</span>
                  <span class="font-medium text-emerald-300">3</span>
                </div>
              </article>

              <article class="rounded-2xl border border-white/10 bg-[#0d121d] p-5">
                <div class="text-xs font-medium text-slate-400">Engineering status</div>
                <div class="mt-4 space-y-3">
                  {[
                    ['TypeScript strict', 'Enabled'],
                    ['Effects policy', 'No useEffect'],
                    ['Chart dependencies', 'Isolated'],
                    ['Unit tests', 'Configured'],
                  ].map(([label, value]) => (
                    <div class="flex items-center justify-between gap-3 text-xs">
                      <span class="text-slate-500">{label}</span>
                      <span class="text-emerald-300">{value}</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
