import type { ChartDrawingLineStyle } from '@openview/chart-engine';

export const DRAWING_TOOL_TYPES = [
  'trend-line',
  'ray',
  'horizontal-line',
  'vertical-line',
  'rectangle',
] as const;

export type DrawingToolType = (typeof DRAWING_TOOL_TYPES)[number];

export type DrawingToolStyle = Readonly<{
  color: string;
  lineWidth: number;
  lineStyle: ChartDrawingLineStyle;
}>;

export type DrawingToolPreferences = Readonly<Record<DrawingToolType, DrawingToolStyle>>;

type StringStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'openview.chart.drawing-tool-preferences';
const STORAGE_VERSION = 1;

const createStyle = (
  color: string,
  lineWidth = 1.5,
  lineStyle: ChartDrawingLineStyle = 'solid',
): DrawingToolStyle => Object.freeze({ color, lineWidth, lineStyle });

export const DEFAULT_DRAWING_TOOL_PREFERENCES: DrawingToolPreferences = Object.freeze({
  'trend-line': createStyle('#60a5fa'),
  ray: createStyle('#60a5fa'),
  'horizontal-line': createStyle('#f4c542'),
  'vertical-line': createStyle('#ab47bc', 1.5, 'dashed'),
  rectangle: createStyle('#60a5fa', 1.5, 'solid'),
});

const isChartDrawingLineStyle = (value: unknown): value is ChartDrawingLineStyle =>
  value === 'solid' || value === 'dashed' || value === 'dotted';

const restoreStyle = (value: unknown, fallback: DrawingToolStyle): DrawingToolStyle => {
  if (typeof value !== 'object' || value === null) {
    return fallback;
  }

  const color = Reflect.get(value, 'color');
  const lineWidth = Reflect.get(value, 'lineWidth');
  const lineStyle = Reflect.get(value, 'lineStyle');

  if (
    typeof color !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(color) ||
    typeof lineWidth !== 'number' ||
    !Number.isFinite(lineWidth) ||
    lineWidth < 0.5 ||
    lineWidth > 8 ||
    !isChartDrawingLineStyle(lineStyle)
  ) {
    return fallback;
  }

  return createStyle(color.toLowerCase(), lineWidth, lineStyle);
};

export const restoreDrawingToolPreferences = (
  serialized: string | null,
): DrawingToolPreferences => {
  if (serialized === null) {
    return DEFAULT_DRAWING_TOOL_PREFERENCES;
  }

  try {
    const parsed: unknown = JSON.parse(serialized);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Reflect.get(parsed, 'version') !== STORAGE_VERSION
    ) {
      return DEFAULT_DRAWING_TOOL_PREFERENCES;
    }

    const savedTools = Reflect.get(parsed, 'tools');

    if (typeof savedTools !== 'object' || savedTools === null) {
      return DEFAULT_DRAWING_TOOL_PREFERENCES;
    }

    const preferences = Object.fromEntries(
      DRAWING_TOOL_TYPES.map((tool) => [
        tool,
        restoreStyle(
          Reflect.get(savedTools, tool),
          DEFAULT_DRAWING_TOOL_PREFERENCES[tool],
        ),
      ]),
    ) as Record<DrawingToolType, DrawingToolStyle>;

    return Object.freeze(preferences);
  } catch {
    return DEFAULT_DRAWING_TOOL_PREFERENCES;
  }
};

export const loadDrawingToolPreferences = (
  storage: StringStorage | null,
): DrawingToolPreferences => {
  if (storage === null) {
    return DEFAULT_DRAWING_TOOL_PREFERENCES;
  }

  try {
    return restoreDrawingToolPreferences(storage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_DRAWING_TOOL_PREFERENCES;
  }
};

export const saveDrawingToolPreferences = (
  storage: StringStorage | null,
  preferences: DrawingToolPreferences,
): void => {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        tools: preferences,
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

export const loadBrowserDrawingToolPreferences = (): DrawingToolPreferences =>
  loadDrawingToolPreferences(getBrowserStorage());

export const saveBrowserDrawingToolPreferences = (
  preferences: DrawingToolPreferences,
): void => {
  saveDrawingToolPreferences(getBrowserStorage(), preferences);
};
