import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRAWING_INTERACTION_PREFERENCES,
  loadDrawingInteractionPreferences,
  restoreDrawingInteractionPreferences,
  saveDrawingInteractionPreferences,
} from './drawing-interaction-preferences';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('drawing interaction preferences', () => {
  it('defaults to magnet mode off', () => {
    expect(DEFAULT_DRAWING_INTERACTION_PREFERENCES).toEqual({ magnetMode: 'off' });
  });

  it('restores supported magnet modes', () => {
    expect(
      restoreDrawingInteractionPreferences(
        JSON.stringify({ version: 1, magnetMode: 'weak' }),
      ),
    ).toEqual({ magnetMode: 'weak' });
    expect(
      restoreDrawingInteractionPreferences(
        JSON.stringify({ version: 1, magnetMode: 'strong' }),
      ),
    ).toEqual({ magnetMode: 'strong' });
  });

  it('falls back for malformed or unsupported preferences', () => {
    expect(restoreDrawingInteractionPreferences('{')).toBe(
      DEFAULT_DRAWING_INTERACTION_PREFERENCES,
    );
    expect(
      restoreDrawingInteractionPreferences(
        JSON.stringify({ version: 2, magnetMode: 'strong' }),
      ),
    ).toBe(DEFAULT_DRAWING_INTERACTION_PREFERENCES);
    expect(
      restoreDrawingInteractionPreferences(
        JSON.stringify({ version: 1, magnetMode: 'invalid' }),
      ),
    ).toBe(DEFAULT_DRAWING_INTERACTION_PREFERENCES);
  });

  it('persists and restores preferences through the browser storage contract', () => {
    const storage = new MemoryStorage();

    saveDrawingInteractionPreferences(storage, { magnetMode: 'strong' });

    expect(loadDrawingInteractionPreferences(storage)).toEqual({ magnetMode: 'strong' });
  });

  it('uses defaults when storage is unavailable or throws', () => {
    const blockedStorage = {
      getItem: (): string => {
        throw new Error('Storage is blocked');
      },
      setItem: (): void => {
        throw new Error('Storage is blocked');
      },
    };

    expect(loadDrawingInteractionPreferences(null)).toBe(
      DEFAULT_DRAWING_INTERACTION_PREFERENCES,
    );
    expect(loadDrawingInteractionPreferences(blockedStorage)).toBe(
      DEFAULT_DRAWING_INTERACTION_PREFERENCES,
    );
    expect(() =>
      saveDrawingInteractionPreferences(blockedStorage, { magnetMode: 'weak' }),
    ).not.toThrow();
  });
});
