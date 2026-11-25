import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRAWING_PANEL_LAYOUT,
  loadDrawingPanelLayout,
  restoreDrawingPanelLayout,
  saveDrawingPanelLayout,
} from './drawing-panel-layout';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('drawing panel layout', () => {
  it('starts with independent visible panels and automatic positions', () => {
    expect(DEFAULT_DRAWING_PANEL_LAYOUT).toEqual({
      positions: { appearance: null, coordinates: null },
      visible: { appearance: true, coordinates: true },
    });
  });

  it('restores positions and visibility independently', () => {
    const layout = restoreDrawingPanelLayout(
      JSON.stringify({
        version: 1,
        positions: {
          appearance: { left: 184, top: 92 },
          coordinates: { left: 24, top: 140 },
        },
        visible: { appearance: false, coordinates: true },
      }),
    );

    expect(layout).toEqual({
      positions: {
        appearance: { left: 184, top: 92 },
        coordinates: { left: 24, top: 140 },
      },
      visible: { appearance: false, coordinates: true },
    });
  });

  it('repairs invalid positions and visibility values independently', () => {
    const layout = restoreDrawingPanelLayout(
      JSON.stringify({
        version: 1,
        positions: {
          appearance: { left: -1, top: 20 },
          coordinates: { left: 40, top: 80 },
        },
        visible: { appearance: 'hidden', coordinates: false },
      }),
    );

    expect(layout.positions.appearance).toBeNull();
    expect(layout.positions.coordinates).toEqual({ left: 40, top: 80 });
    expect(layout.visible).toEqual({ appearance: true, coordinates: false });
  });

  it('falls back safely for corrupt data and unknown schema versions', () => {
    expect(restoreDrawingPanelLayout('{')).toEqual(DEFAULT_DRAWING_PANEL_LAYOUT);
    expect(restoreDrawingPanelLayout(JSON.stringify({ version: 2 }))).toEqual(
      DEFAULT_DRAWING_PANEL_LAYOUT,
    );
    expect(restoreDrawingPanelLayout(null)).toEqual(DEFAULT_DRAWING_PANEL_LAYOUT);
  });

  it('persists and restores panel layout from storage', () => {
    const storage = new MemoryStorage();
    const layout = restoreDrawingPanelLayout(
      JSON.stringify({
        version: 1,
        positions: {
          appearance: { left: 260, top: 110 },
          coordinates: null,
        },
        visible: { appearance: false, coordinates: true },
      }),
    );

    saveDrawingPanelLayout(storage, layout);

    const serialized = storage.getItem('openview.chart.drawing-panel-layout');
    expect(serialized).not.toBeNull();
    expect(JSON.parse(serialized ?? '{}')).toMatchObject({
      version: 1,
      positions: {
        appearance: { left: 260, top: 110 },
        coordinates: null,
      },
      visible: { appearance: false, coordinates: true },
    });
    expect(loadDrawingPanelLayout(storage)).toEqual(layout);
  });

  it('uses defaults when storage is unavailable or blocked', () => {
    expect(loadDrawingPanelLayout(null)).toEqual(DEFAULT_DRAWING_PANEL_LAYOUT);
    expect(() => saveDrawingPanelLayout(null, DEFAULT_DRAWING_PANEL_LAYOUT)).not.toThrow();

    const blockedStorage = {
      getItem: () => {
        throw new Error('Storage access is blocked.');
      },
      setItem: () => {
        throw new Error('Storage access is blocked.');
      },
    };

    expect(loadDrawingPanelLayout(blockedStorage)).toEqual(DEFAULT_DRAWING_PANEL_LAYOUT);
    expect(() =>
      saveDrawingPanelLayout(blockedStorage, DEFAULT_DRAWING_PANEL_LAYOUT),
    ).not.toThrow();
  });
});
