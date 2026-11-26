import { createInstrumentId } from '@openview/market-domain';
import { describe, expect, it } from 'vitest';
import {
  createWatchlistInstrument,
  DEFAULT_WATCHLIST,
  loadWatchlistPreferences,
  restoreWatchlistPreferences,
  saveWatchlistPreferences,
  WATCHLIST_CATALOG,
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

  it('restores legacy version one preferences from the original curated catalogue', () => {
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
    expect(preferences.instruments[0]?.name).toBe('Solana');
    expect(preferences.selectedInstrumentId).toBe('ETH-USDT');
  });

  it('restores dynamic instruments that are not part of the default catalogue', () => {
    const preferences = restoreWatchlistPreferences(
      JSON.stringify({
        version: 2,
        instruments: [
          { id: 'PEPE-USDC', name: 'PEPE' },
          { id: 'LINK-BTC', name: 'Chainlink' },
        ],
        selectedInstrumentId: 'LINK-BTC',
      }),
    );

    expect(preferences.instruments).toEqual([
      {
        id: 'PEPE-USDC',
        symbol: 'PEPE / USDC',
        name: 'PEPE',
        chartSymbol: 'PEPE / USDC',
      },
      {
        id: 'LINK-BTC',
        symbol: 'LINK / BTC',
        name: 'Chainlink',
        chartSymbol: 'LINK / BTC',
      },
    ]);
    expect(preferences.selectedInstrumentId).toBe('LINK-BTC');
  });

  it('removes malformed, duplicate and excess dynamic identifiers and repairs selection', () => {
    const preferences = restoreWatchlistPreferences(
      JSON.stringify({
        version: 2,
        instruments: [
          { id: 'ETH-USDT', name: 'Ethereum' },
          { id: 'INVALID/PAIR', name: 'Invalid' },
          { id: 'ETH-USDT', name: 'Duplicate' },
          { id: 'SOL-USDT', name: 'Solana' },
          { id: 'BTC USDT', name: 'Invalid spacing' },
        ],
        selectedInstrumentId: 'UNKNOWN-USDT',
      }),
    );

    expect(preferences.instruments.map((instrument) => instrument.id)).toEqual([
      'ETH-USDT',
      'SOL-USDT',
    ]);
    expect(preferences.instruments[0]?.name).toBe('Ethereum');
    expect(preferences.selectedInstrumentId).toBe('ETH-USDT');
  });

  it('falls back to defaults for malformed, empty and unsupported preference data', () => {
    const invalidValues = [
      '{',
      JSON.stringify([]),
      JSON.stringify({ version: 3, instruments: [{ id: 'ETH-USDT' }] }),
      JSON.stringify({ version: 2, instruments: [] }),
      JSON.stringify({ version: 1, instrumentIds: ['UNKNOWN-USDT'] }),
    ];

    for (const value of invalidValues) {
      const preferences = restoreWatchlistPreferences(value);
      expect(preferences.instruments).toEqual(DEFAULT_WATCHLIST);
      expect(preferences.selectedInstrumentId).toBe('BTC-USDT');
    }
  });

  it('enforces the maximum watchlist size for dynamic instruments', () => {
    const instruments = Array.from({ length: 30 }, (_, index) => ({
      id: 'ASSET' + String(index).padStart(2, '0') + '-USDT',
      name: 'ASSET' + String(index).padStart(2, '0'),
    }));
    const preferences = restoreWatchlistPreferences(
      JSON.stringify({
        version: 2,
        instruments,
        selectedInstrumentId: 'ASSET29-USDT',
      }),
    );

    expect(preferences.instruments).toHaveLength(25);
    expect(preferences.selectedInstrumentId).toBe('ASSET00-USDT');
  });

  it('converts normalized provider instruments into watchlist instruments', () => {
    expect(
      createWatchlistInstrument({
        id: createInstrumentId('PEPE-USDC'),
        symbol: 'PEPE/USDC',
        baseAsset: 'PEPE',
        quoteAsset: 'USDC',
        priceIncrement: 0.001,
      }),
    ).toEqual({
      id: 'PEPE-USDC',
      symbol: 'PEPE / USDC',
      name: 'PEPE',
      chartSymbol: 'PEPE / USDC',
      priceIncrement: 0.001,
    });
  });

  it('rejects inconsistent provider instrument identifiers', () => {
    expect(() =>
      createWatchlistInstrument({
        id: createInstrumentId('BTC-USDT'),
        symbol: 'BTC/USDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
      }),
    ).toThrow(RangeError);
  });

  it('persists and reloads dynamic watchlist order and selection', () => {
    const storage = new MemoryStorage();
    const preferences: WatchlistPreferences = {
      instruments: [
        {
          id: 'PEPE-USDC',
          symbol: 'PEPE / USDC',
          name: 'PEPE',
          chartSymbol: 'PEPE / USDC',
        },
        getCatalogInstrument('ETH-USDT'),
      ],
      selectedInstrumentId: 'ETH-USDT',
    };

    saveWatchlistPreferences(storage, preferences);
    const serialized = storage.getItem('openview.watchlist.preferences');

    expect(serialized).not.toBeNull();
    expect(JSON.parse(serialized ?? '{}')).toMatchObject({
      version: 2,
      instruments: [
        { id: 'PEPE-USDC', name: 'PEPE' },
        { id: 'ETH-USDT', name: 'Ethereum' },
      ],
      selectedInstrumentId: 'ETH-USDT',
    });
    expect(loadWatchlistPreferences(storage)).toEqual(preferences);
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
