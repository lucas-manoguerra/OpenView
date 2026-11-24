import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WATCHLIST,
  WATCHLIST_CATALOG,
  loadWatchlistPreferences,
  restoreWatchlistPreferences,
  saveWatchlistPreferences,
  type WatchlistPreferences,
} from './watchlist-preferences';

const getCatalogInstrument = (id: string) => {
  const instrument = WATCHLIST_CATALOG.find((item) => item.id === id);

  if (instrument === undefined) {
    throw new Error('The catalogue must contain ' + id + '.');
  }

  return instrument;
};

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('watchlist preferences', () => {
  it('uses the default instruments when there are no saved preferences', () => {
    const preferences = restoreWatchlistPreferences(null);

    expect(preferences.instruments).toEqual(DEFAULT_WATCHLIST);
    expect(preferences.selectedInstrumentId).toBe('BTC-USDT');
  });

  it('restores a valid ordered instrument list and selected instrument', () => {
    const preferences = restoreWatchlistPreferences(
      JSON.stringify({
        version: 1,
        instrumentIds: ['SOL-USDT', 'ETH-USDT'],
        selectedInstrumentId: 'ETH-USDT',
      }),
    );

    expect(preferences.instruments.map((instrument) => instrument.id)).toEqual([
      'SOL-USDT',
      'ETH-USDT',
    ]);
    expect(preferences.selectedInstrumentId).toBe('ETH-USDT');
  });

  it('removes unknown and duplicate instrument ids and repairs an invalid selection', () => {
    const preferences = restoreWatchlistPreferences(
      JSON.stringify({
        version: 1,
        instrumentIds: ['ETH-USDT', 'UNKNOWN-USDT', 'ETH-USDT', 'SOL-USDT'],
        selectedInstrumentId: 'UNKNOWN-USDT',
      }),
    );

    expect(preferences.instruments.map((instrument) => instrument.id)).toEqual([
      'ETH-USDT',
      'SOL-USDT',
    ]);
    expect(preferences.selectedInstrumentId).toBe('ETH-USDT');
  });

  it('falls back to defaults for malformed, empty and unsupported preference data', () => {
    const invalidValues = [
      '{',
      JSON.stringify([]),
      JSON.stringify({ version: 2, instrumentIds: ['ETH-USDT'] }),
      JSON.stringify({ version: 1, instrumentIds: [] }),
      JSON.stringify({ version: 1, instrumentIds: ['UNKNOWN-USDT'] }),
    ];

    for (const value of invalidValues) {
      const preferences = restoreWatchlistPreferences(value);
      expect(preferences.instruments).toEqual(DEFAULT_WATCHLIST);
      expect(preferences.selectedInstrumentId).toBe('BTC-USDT');
    }
  });

  it('restores all supported instruments from the catalogue', () => {
    const preferences = restoreWatchlistPreferences(
      JSON.stringify({
        version: 1,
        instrumentIds: [...WATCHLIST_CATALOG.map((instrument) => instrument.id), 'BTC-USDT'],
        selectedInstrumentId: 'DOT-USDT',
      }),
    );

    expect(preferences.instruments).toHaveLength(WATCHLIST_CATALOG.length);
  });

  it('persists and reloads watchlist order and selection', () => {
    const storage = new MemoryStorage();
    const preferences: WatchlistPreferences = {
      instruments: [getCatalogInstrument('SOL-USDT'), getCatalogInstrument('ETH-USDT')],
      selectedInstrumentId: 'ETH-USDT',
    };

    saveWatchlistPreferences(storage, preferences);
    const restored = loadWatchlistPreferences(storage);

    expect(restored).toEqual(preferences);
  });

  it('uses defaults when browser storage is unavailable', () => {
    expect(loadWatchlistPreferences(null)).toEqual({
      instruments: DEFAULT_WATCHLIST,
      selectedInstrumentId: 'BTC-USDT',
    });
    expect(() =>
      saveWatchlistPreferences(null, {
        instruments: DEFAULT_WATCHLIST,
        selectedInstrumentId: 'BTC-USDT',
      }),
    ).not.toThrow();
  });
});
