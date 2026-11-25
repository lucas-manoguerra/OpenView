export type ComponentLabEntry = {
  id: string;
  name: string;
  family: string;
  route: string;
  status: 'available' | 'planned';
  description: string;
};

export const componentLabRegistry: readonly ComponentLabEntry[] = [
  {
    id: 'buttons-controls',
    name: 'Buttons & Controls',
    family: 'Core',
    route: '/component-lab/core/buttons',
    status: 'available',
    description: 'Button, IconButton, Tooltip, Badge y Divider.',
  },
  {
    id: 'navigation',
    name: 'Navigation',
    family: 'Navigation',
    route: '/component-lab/navigation',
    status: 'planned',
    description: 'Topbar, tabs, menús y sidebar.',
  },
  {
    id: 'trading',
    name: 'Trading',
    family: 'Trading',
    route: '/component-lab/trading',
    status: 'planned',
    description: 'Búsqueda de símbolos, información de instrumento y cotizaciones.',
  },
  {
    id: 'chart',
    name: 'Chart',
    family: 'Chart',
    route: '/component-lab/chart',
    status: 'planned',
    description: 'Controles del gráfico, timeframes y barras de herramientas.',
  },
  {
    id: 'drawings',
    name: 'Drawings',
    family: 'Drawings',
    route: '/component-lab/drawings',
    status: 'planned',
    description: 'Herramientas de dibujo, propiedades, plantillas y árbol de objetos.',
  },
  {
    id: 'panels',
    name: 'Panels',
    family: 'Panels',
    route: '/component-lab/panels',
    status: 'planned',
    description: 'Watchlist, detalles, listas y paneles acoplables.',
  },
  {
    id: 'dialogs',
    name: 'Dialogs',
    family: 'Dialogs',
    route: '/component-lab/dialogs',
    status: 'planned',
    description: 'Modales, diálogos de comandos y configuración.',
  },
  {
    id: 'forms',
    name: 'Forms',
    family: 'Forms',
    route: '/component-lab/forms',
    status: 'available',
    description: 'TextField y Select con estados, tamaños y accesibilidad.',
  },
  {
    id: 'layout',
    name: 'Layout',
    family: 'Layout',
    route: '/component-lab/layout',
    status: 'planned',
    description: 'Split panels, resizers y paneles flotantes.',
  },
];
