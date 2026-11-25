import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRAWING_TOOL_PREFERENCES,
  DRAWING_TOOL_TYPES,
  loadDrawingToolPreferences,
  restoreDrawingToolPreferences,
  saveDrawingToolPreferences,
} from './drawing-tool-preferences';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('drawing tool preferences', () => {
  it('provides an independent default style for every drawing tool', () => {
    expect(Object.keys(DEFAULT_DRAWING_TOOL_PREFERENCES)).toEqual(DRAWING_TOOL_TYPES);
    expect(DEFAULT_DRAWING_TOOL_PREFERENCES['horizontal-line'].color).toBe('#f4c542');
    expect(DEFAULT_DRAWING_TOOL_PREFERENCES['vertical-line'].lineStyle).toBe('dashed');
  });

  it('restores persisted styles by drawing tool and normalizes colors', () => {
    const preferences = restoreDrawingToolPreferences(
      JSON.stringify({
        version: 1,
        tools: {
          'trend-line': { color: '#EF5350', lineWidth: 3, lineStyle: 'dotted' },
          rectangle: { color: '#26a69a', lineWidth: 2, lineStyle: 'solid' },
        },
      }),
    );

    expect(preferences['trend-line']).toEqual({
      color: '#ef5350',
      lineWidth: 3,
      lineStyle: 'dotted',
    });
    expect(preferences.rectangle).toEqual({
      color: '#26a69a',
      lineWidth: 2,
      lineStyle: 'solid',
    });
    expect(preferences.ray).toEqual(DEFAULT_DRAWING_TOOL_PREFERENCES.ray);
  });

  it('repairs invalid individual tool styles without discarding other preferences', () => {
    const preferences = restoreDrawingToolPreferences(
      JSON.stringify({
        version: 1,
        tools: {
          'trend-line': { color: '#ef4444', lineWidth: 3, lineStyle: 'solid' },
          ray: { color: 'red', lineWidth: 3, lineStyle: 'solid' },
          rectangle: { color: '#60a5fa', lineWidth: 10, lineStyle: 'solid' },
        },
      }),
    );

    expect(preferences['trend-line'].color).toBe('#ef4444');
    expect(preferences.ray).toEqual(DEFAULT_DRAWING_TOOL_PREFERENCES.ray);
    expect(preferences.rectangle).toEqual(DEFAULT_DRAWING_TOOL_PREFERENCES.rectangle);
  });

  it('falls back safely for corrupt data and unknown schema versions', () => {
    expect(restoreDrawingToolPreferences('{')).toEqual(DEFAULT_DRAWING_TOOL_PREFERENCES);
    expect(restoreDrawingToolPreferences(JSON.stringify({ version: 2, tools: {} }))).toEqual(
      DEFAULT_DRAWING_TOOL_PREFERENCES,
    );
    expect(restoreDrawingToolPreferences(null)).toEqual(DEFAULT_DRAWING_TOOL_PREFERENCES);
  });

  it('persists and restores styles independently for each drawing tool', () => {
    const storage = new MemoryStorage();
    const preferences = restoreDrawingToolPreferences(
      JSON.stringify({
        version: 1,
        tools: {
          'horizontal-line': { color: '#eab308', lineWidth: 4, lineStyle: 'dashed' },
        },
      }),
    );

    saveDrawingToolPreferences(storage, preferences);
    const serialized = storage.getItem('openview.chart.drawing-tool-preferences');

    expect(serialized).not.toBeNull();
    expect(JSON.parse(serialized ?? '{}')).toMatchObject({
      version: 1,
      tools: {
        'horizontal-line': { color: '#eab308', lineWidth: 4, lineStyle: 'dashed' },
      },
    });
    expect(loadDrawingToolPreferences(storage)).toEqual(preferences);
  });

  it('uses defaults when storage is unavailable or throws', () => {
    expect(loadDrawingToolPreferences(null)).toEqual(DEFAULT_DRAWING_TOOL_PREFERENCES);
    expect(() => saveDrawingToolPreferences(null, DEFAULT_DRAWING_TOOL_PREFERENCES)).not.toThrow();

    const blockedStorage = {
      getItem: () => {
        throw new Error('Storage access is blocked.');
      },
      setItem: () => {
        throw new Error('Storage access is blocked.');
      },
    };

    expect(loadDrawingToolPreferences(blockedStorage)).toEqual(DEFAULT_DRAWING_TOOL_PREFERENCES);
    expect(() =>
      saveDrawingToolPreferences(blockedStorage, DEFAULT_DRAWING_TOOL_PREFERENCES),
    ).not.toThrow();
  });
});
