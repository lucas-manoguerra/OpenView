import type { ChartDrawingLineStyle } from '@openview/chart-engine';
import {
  DEFAULT_DRAWING_TOOL_PREFERENCES,
  DRAWING_TOOL_TYPES,
  type DrawingToolStyle,
  type DrawingToolType,
} from './drawing-tool-preferences';

export type DrawingStyle = DrawingToolStyle;
export type DrawingStyleTemplate = DrawingStyle &
  Readonly<{ id: string; name: string; tool: DrawingToolType }>;

type StringStorage = Pick<Storage, 'getItem' | 'setItem'>;
const STORAGE_KEY = 'openview.chart.drawing-style-templates';
const STORAGE_VERSION = 2;
export const MAX_CUSTOM_DRAWING_TEMPLATES = 20;

export const DEFAULT_DRAWING_STYLE_TEMPLATES: Readonly<Record<DrawingToolType, DrawingStyle>> =
  DEFAULT_DRAWING_TOOL_PREFERENCES;

const isLineStyle = (value: unknown): value is ChartDrawingLineStyle =>
  value === 'solid' || value === 'dashed' || value === 'dotted';

const createTemplate = (value: unknown): DrawingStyleTemplate | null => {
  if (typeof value !== 'object' || value === null) return null;
  const id = Reflect.get(value, 'id');
  const name = Reflect.get(value, 'name');
  const tool = Reflect.get(value, 'tool');
  const color = Reflect.get(value, 'color');
  const lineWidth = Reflect.get(value, 'lineWidth');
  const lineStyle = Reflect.get(value, 'lineStyle');
  if (
    typeof id !== 'string' ||
    !/^custom-[a-zA-Z0-9-]{1,80}$/.test(id) ||
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    name.trim().length > 32 ||
    typeof tool !== 'string' ||
    !DRAWING_TOOL_TYPES.includes(tool as DrawingToolType) ||
    typeof color !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(color) ||
    typeof lineWidth !== 'number' ||
    !Number.isFinite(lineWidth) ||
    lineWidth < 0.5 ||
    lineWidth > 8 ||
    !isLineStyle(lineStyle)
  ) {
    return null;
  }
  return Object.freeze({
    id,
    name: name.trim(),
    tool: tool as DrawingToolType,
    color: color.toLowerCase(),
    lineWidth,
    lineStyle,
  });
};

export const createDrawingStyleTemplate = (
  id: string,
  name: string,
  tool: DrawingToolType,
  style: DrawingStyle,
): DrawingStyleTemplate | null => createTemplate({ id, name, tool, ...style });

export const restoreDrawingStyleTemplates = (
  serialized: string | null,
): readonly DrawingStyleTemplate[] => {
  if (serialized === null) return Object.freeze([]);
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Reflect.get(parsed, 'version') !== STORAGE_VERSION ||
      !Array.isArray(Reflect.get(parsed, 'templates'))
    ) {
      return Object.freeze([]);
    }
    const templates: DrawingStyleTemplate[] = [];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const value of Reflect.get(parsed, 'templates') as unknown[]) {
      const template = createTemplate(value);
      if (template === null) continue;
      const key = template.tool + ':' + template.name.toLocaleLowerCase();
      if (ids.has(template.id) || names.has(key)) continue;
      ids.add(template.id);
      names.add(key);
      templates.push(template);
      if (templates.length >= MAX_CUSTOM_DRAWING_TEMPLATES * DRAWING_TOOL_TYPES.length) break;
    }
    return Object.freeze(templates);
  } catch {
    return Object.freeze([]);
  }
};

export const loadDrawingStyleTemplates = (
  storage: StringStorage | null,
): readonly DrawingStyleTemplate[] => {
  if (storage === null) return Object.freeze([]);
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
  if (storage === null) return;
  try {
    const normalized = restoreDrawingStyleTemplates(
      JSON.stringify({ version: STORAGE_VERSION, templates }),
    );
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, templates: normalized }),
    );
  } catch {
    return;
  }
};

const getBrowserStorage = (): StringStorage | null => {
  if (typeof window === 'undefined') return null;
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
): void => saveDrawingStyleTemplates(getBrowserStorage(), templates);
