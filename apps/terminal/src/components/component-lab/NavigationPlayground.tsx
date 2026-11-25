import { useState } from 'preact/hooks';
import { DropdownMenu, Tabs } from '../ui';

const navigationTabs = [
  {
    id: 'chart',
    label: 'Gráfico',
    content: 'Vista principal del gráfico con el instrumento y la temporalidad seleccionados.',
  },
  {
    id: 'details',
    label: 'Detalles',
    content: 'Información resumida del instrumento y sus datos de mercado.',
  },
  {
    id: 'news',
    label: 'Noticias',
    content: 'Noticias y eventos relacionados con el instrumento activo.',
  },
];

const menuItems = [
  { id: 'save-layout', label: 'Guardar diseño', shortcut: 'Ctrl + S' },
  { id: 'duplicate-layout', label: 'Duplicar diseño' },
  { id: 'separator-placeholder', label: 'Restaurar diseño', disabled: true },
];

export function NavigationPlayground() {
  const [activeTab, setActiveTab] = useState('chart');
  const [lastAction, setLastAction] = useState('Ninguna acción seleccionada');

  return (
    <div class="space-y-6">
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Pestañas</h2>
          <span class="text-[10px] font-medium uppercase tracking-wider text-[#787b86]">
            Navegación por teclado
          </span>
        </div>
        <div class="rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <Tabs
            tabs={navigationTabs}
            value={activeTab}
            onChange={setActiveTab}
            id="navigation-playground-tabs"
          />
          <p class="mt-3 border-t border-[#2a2e39] pt-3 text-[11px] text-[#787b86]" aria-live="polite">
            Pestaña activa: <span class="font-mono text-[#d1d4dc]" data-testid="navigation-active-tab">{activeTab}</span>
          </p>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Menú desplegable</h2>
        <div class="flex flex-wrap items-center gap-3 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <DropdownMenu label="Diseño" items={menuItems} onSelect={(id) => setLastAction(id)} />
          <span class="text-xs text-[#787b86]" aria-live="polite">
            Última acción:{' '}
            <span class="font-mono text-[#d1d4dc]" data-testid="navigation-menu-action">
              {lastAction}
            </span>
          </span>
        </div>
      </section>
    </div>
  );
}
