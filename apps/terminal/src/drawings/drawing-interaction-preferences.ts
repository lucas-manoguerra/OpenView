import type { ChartDrawingMagnetMode } from '@openview/chart-engine';

export type DrawingInteractionPreferences = Readonly<{
  magnetMode: ChartDrawingMagnetMode;
  snapToIndicators: boolean;
}>;

type StringStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'openview.chart.drawing-interaction-preferences';
const STORAGE_VERSION = 1;

export const DEFAULT_DRAWING_INTERACTION_PREFERENCES: DrawingInteractionPreferences = Object.freeze(
  { magnetMode: 'off', snapToIndicators: false },
);

const isChartDrawingMagnetMode = (value: unknown): value is ChartDrawingMagnetMode =>
  value === 'off' || value === 'weak' || value === 'strong';

export const restoreDrawingInteractionPreferences = (
  serialized: string | null,
): DrawingInteractionPreferences => {
  if (serialized === null) {
    return DEFAULT_DRAWING_INTERACTION_PREFERENCES;
  }

  try {
    const parsed: unknown = JSON.parse(serialized);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Reflect.get(parsed, 'version') !== STORAGE_VERSION ||
      !isChartDrawingMagnetMode(Reflect.get(parsed, 'magnetMode'))
    ) {
      return DEFAULT_DRAWING_INTERACTION_PREFERENCES;
    }

    return Object.freeze({
      magnetMode: Reflect.get(parsed, 'magnetMode'),
      snapToIndicators:
        typeof Reflect.get(parsed, 'snapToIndicators') === 'boolean'
          ? Reflect.get(parsed, 'snapToIndicators')
          : false,
    });
  } catch {
    return DEFAULT_DRAWING_INTERACTION_PREFERENCES;
  }
};

export const loadDrawingInteractionPreferences = (
  storage: StringStorage | null,
): DrawingInteractionPreferences => {
  if (storage === null) {
    return DEFAULT_DRAWING_INTERACTION_PREFERENCES;
  }

  try {
    return restoreDrawingInteractionPreferences(storage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_DRAWING_INTERACTION_PREFERENCES;
  }
};

export const saveDrawingInteractionPreferences = (
  storage: StringStorage | null,
  preferences: DrawingInteractionPreferences,
): void => {
  if (storage === null || !isChartDrawingMagnetMode(preferences.magnetMode)) {
    return;
  }

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        magnetMode: preferences.magnetMode,
        snapToIndicators: preferences.snapToIndicators,
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

export const loadBrowserDrawingInteractionPreferences = (): DrawingInteractionPreferences =>
  loadDrawingInteractionPreferences(getBrowserStorage());

export const saveBrowserDrawingInteractionPreferences = (
  preferences: DrawingInteractionPreferences,
): void => {
  saveDrawingInteractionPreferences(getBrowserStorage(), preferences);
};
