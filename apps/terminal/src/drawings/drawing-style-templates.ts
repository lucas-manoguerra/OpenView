import type { ChartDrawingLineStyle } from '@openview/chart-engine';

export type DrawingStyle = Readonly<{
  color: string;
  lineWidth: number;
  lineStyle: ChartDrawingLineStyle;
}>;

export type DrawingStyleTemplate = DrawingStyle &
  Readonly<{
    id: string;
    name: string;
  }>;

type StringStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'openview.chart.drawing-style-templates';
const STORAGE_VERSION = 1;
export const MAX_CUSTOM_DRAWING_TEMPLATES = 20;

export const BUILT_IN_DRAWING_STYLE_TEMPLATES: readonly DrawingStyleTemplate[] = Object.freeze([
  Object.freeze({
    id: 'builtin-blue',
    name: 'Azul clásico',
    color: '#60a5fa',
    lineWidth: 1.5,
    lineStyle: 'solid',
  }),
  Object.freeze({
    id: 'builtin-red-dashed',
    name: 'Rojo discontinuo',
    color: '#ef5350',
    lineWidth: 2,
    lineStyle: 'dashed',
  }),
  Object.freeze({
    id: 'builtin-green',
    name: 'Verde',
    color: '#26a69a',
    lineWidth: 1.5,
    lineStyle: 'solid',
  }),
  Object.freeze({
    id: 'builtin-gold-dotted',
    name: 'Dorado punteado',
    color: '#f4c542',
    lineWidth: 2,
    lineStyle: 'dotted',
  }),
]);

const isDrawingLineStyle = (value: unknown): value is ChartDrawingLineStyle =>
  value === 'solid' || value === 'dashed' || value === 'dotted';

const createTemplate = (value: unknown): DrawingStyleTemplate | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const id = Reflect.get(value, 'id');
  const name = Reflect.get(value, 'name');
  const color = Reflect.get(value, 'color');
  const lineWidth = Reflect.get(value, 'lineWidth');
  const lineStyle = Reflect.get(value, 'lineStyle');

  if (
    typeof id !== 'string' ||
    !/^custom-[a-zA-Z0-9-]{1,80}$/.test(id) ||
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    name.trim().length > 32 ||
    typeof color !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(color) ||
    typeof lineWidth !== 'number' ||
    !Number.isFinite(lineWidth) ||
    lineWidth < 0.5 ||
    lineWidth > 8 ||
    !isDrawingLineStyle(lineStyle)
  ) {
    return null;
  }

  return Object.freeze({
    id,
    name: name.trim(),
    color: color.toLowerCase(),
    lineWidth,
    lineStyle,
  });
};

export const createDrawingStyleTemplate = (
  id: string,
  name: string,
  style: DrawingStyle,
): DrawingStyleTemplate | null =>
  createTemplate({
    id,
    name,
    color: style.color,
    lineWidth: style.lineWidth,
    lineStyle: style.lineStyle,
  });

export const restoreDrawingStyleTemplates = (
  serialized: string | null,
): readonly DrawingStyleTemplate[] => {
  if (serialized === null) {
    return Object.freeze([]);
  }

  try {
    const parsed: unknown = JSON.parse(serialized);

    if (typeof parsed !== 'object' || parsed === null) {
      return Object.freeze([]);
    }

    if (
      Reflect.get(parsed, 'version') !== STORAGE_VERSION ||
      !Array.isArray(Reflect.get(parsed, 'templates'))
    ) {
      return Object.freeze([]);
    }

    const savedTemplates: unknown[] = Reflect.get(parsed, 'templates');
    const knownIds = new Set<string>();
    const knownNames = new Set<string>();
    const templates: DrawingStyleTemplate[] = [];

    for (const value of savedTemplates) {
      const template = createTemplate(value);

      if (template === null) {
        continue;
      }

      const normalizedName = template.name.toLocaleLowerCase();

      if (knownIds.has(template.id) || knownNames.has(normalizedName)) {
        continue;
      }

      knownIds.add(template.id);
      knownNames.add(normalizedName);
      templates.push(template);

      if (templates.length >= MAX_CUSTOM_DRAWING_TEMPLATES) {
        break;
      }
    }

    return Object.freeze(templates);
  } catch {
    return Object.freeze([]);
  }
};

export const loadDrawingStyleTemplates = (
  storage: StringStorage | null,
): readonly DrawingStyleTemplate[] => {
  if (storage === null) {
    return Object.freeze([]);
  }

  try {
    return restoreDrawingStyleTemplates(storage.getItem(STORAGE_KEY));
  } catch {
    return Object.freeze([]);
  }
};

export const saveDrawingStyleTemplates = (
  storage: StringStorage | null,
  templates: readonly DrawingStyleTemplate[],
): void => {
  if (storage === null) {
    return;
  }

  try {
    const normalizedTemplates = restoreDrawingStyleTemplates(
      JSON.stringify({ version: STORAGE_VERSION, templates }),
    );
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        templates: normalizedTemplates,
      }),
    );
  } catch {
    return;
  }
};

const getBrowserStorage = (): StringStorage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const loadBrowserDrawingStyleTemplates = (): readonly DrawingStyleTemplate[] =>
  loadDrawingStyleTemplates(getBrowserStorage());

export const saveBrowserDrawingStyleTemplates = (
  templates: readonly DrawingStyleTemplate[],
): void => {
  saveDrawingStyleTemplates(getBrowserStorage(), templates);
};
