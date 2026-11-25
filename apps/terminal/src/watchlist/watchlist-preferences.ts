import type { MarketInstrument } from '@openview/market-data';

export type WatchlistInstrument = Readonly<{
  id: string;
  symbol: string;
  name: string;
  chartSymbol: string;
  priceIncrement?: number;
}>;

export type WatchlistPreferences = Readonly<{
  instruments: readonly WatchlistInstrument[];
  selectedInstrumentId: string;
}>;

type StringStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const MAX_WATCHLIST_INSTRUMENTS = 25;

export const WATCHLIST_CATALOG: readonly WatchlistInstrument[] = Object.freeze([
  Object.freeze({
    id: 'BTC-USDT',
    symbol: 'BTC / USDT',
    name: 'Bitcoin',
    chartSymbol: 'BTC / USDT',
  }),
  Object.freeze({
    id: 'ETH-USDT',
    symbol: 'ETH / USDT',
    name: 'Ethereum',
    chartSymbol: 'ETH / USDT',
  }),
  Object.freeze({
    id: 'SOL-USDT',
    symbol: 'SOL / USDT',
    name: 'Solana',
    chartSymbol: 'SOL / USDT',
  }),
  Object.freeze({
    id: 'BNB-USDT',
    symbol: 'BNB / USDT',
    name: 'BNB',
    chartSymbol: 'BNB / USDT',
  }),
  Object.freeze({
    id: 'XRP-USDT',
    symbol: 'XRP / USDT',
    name: 'XRP',
    chartSymbol: 'XRP / USDT',
  }),
  Object.freeze({
    id: 'DOGE-USDT',
    symbol: 'DOGE / USDT',
    name: 'Dogecoin',
    chartSymbol: 'DOGE / USDT',
  }),
  Object.freeze({
    id: 'ADA-USDT',
    symbol: 'ADA / USDT',
    name: 'Cardano',
    chartSymbol: 'ADA / USDT',
  }),
  Object.freeze({
    id: 'LTC-USDT',
    symbol: 'LTC / USDT',
    name: 'Litecoin',
    chartSymbol: 'LTC / USDT',
  }),
  Object.freeze({
    id: 'LINK-USDT',
    symbol: 'LINK / USDT',
    name: 'Chainlink',
    chartSymbol: 'LINK / USDT',
  }),
  Object.freeze({
    id: 'AVAX-USDT',
    symbol: 'AVAX / USDT',
    name: 'Avalanche',
    chartSymbol: 'AVAX / USDT',
  }),
  Object.freeze({
    id: 'DOT-USDT',
    symbol: 'DOT / USDT',
    name: 'Polkadot',
    chartSymbol: 'DOT / USDT',
  }),
]);

export const DEFAULT_WATCHLIST: readonly WatchlistInstrument[] = Object.freeze(
  WATCHLIST_CATALOG.slice(0, 3),
);

const STORAGE_KEY = 'openview.watchlist.preferences';
const STORAGE_VERSION = 2;
const LEGACY_STORAGE_VERSION = 1;

const createDefaultPreferences = (): WatchlistPreferences =>
  Object.freeze({
    instruments: DEFAULT_WATCHLIST,
    selectedInstrumentId: DEFAULT_WATCHLIST[0]?.id ?? 'BTC-USDT',
  });

const createInstrumentFromId = (value: string, name?: string): WatchlistInstrument | null => {
  const normalizedId = value.trim().toUpperCase();
  const match = /^([A-Z0-9]{1,24})-([A-Z0-9]{1,24})$/.exec(normalizedId);
  const baseAsset = match?.[1];
  const quoteAsset = match?.[2];

  if (baseAsset === undefined || quoteAsset === undefined) {
    return null;
  }

  const knownInstrument = WATCHLIST_CATALOG.find((instrument) => instrument.id === normalizedId);
  const symbol = baseAsset + ' / ' + quoteAsset;

  return Object.freeze({
    id: normalizedId,
    symbol,
    name: name?.trim() || knownInstrument?.name || baseAsset,
    chartSymbol: symbol,
  });
};

export const createWatchlistInstrument = (instrument: MarketInstrument): WatchlistInstrument => {
  const normalized = createInstrumentFromId(String(instrument.id));
  const baseAsset = instrument.baseAsset.trim().toUpperCase();
  const quoteAsset = instrument.quoteAsset.trim().toUpperCase();

  if (normalized === null || normalized.id !== baseAsset + '-' + quoteAsset) {
    throw new RangeError('Discovered market instrument identifiers are inconsistent.');
  }

  return Object.freeze({
    ...normalized,
    ...(instrument.priceIncrement === undefined
      ? {}
      : { priceIncrement: instrument.priceIncrement }),
  });
};

const restoreLegacyPreferences = (
  instrumentIds: unknown,
  selectedInstrumentId: unknown,
): WatchlistPreferences => {
  if (!Array.isArray(instrumentIds)) {
    return createDefaultPreferences();
  }

  const knownIds = new Set(WATCHLIST_CATALOG.map((instrument) => instrument.id));
  const normalizedIds = [
    ...new Set(
      instrumentIds.filter((id): id is string => typeof id === 'string' && knownIds.has(id)),
    ),
  ].slice(0, MAX_WATCHLIST_INSTRUMENTS);

  if (normalizedIds.length === 0) {
    return createDefaultPreferences();
  }

  const instruments = normalizedIds.flatMap((id) => {
    const instrument = WATCHLIST_CATALOG.find((item) => item.id === id);
    return instrument === undefined ? [] : [instrument];
  });
  const selectedId =
    typeof selectedInstrumentId === 'string' &&
    instruments.some((instrument) => instrument.id === selectedInstrumentId)
      ? selectedInstrumentId
      : (instruments[0]?.id ?? DEFAULT_WATCHLIST[0]?.id ?? 'BTC-USDT');

  return Object.freeze({
    instruments: Object.freeze(instruments),
    selectedInstrumentId: selectedId,
  });
};

export const restoreWatchlistPreferences = (serialized: string | null): WatchlistPreferences => {
  if (serialized === null) {
    return createDefaultPreferences();
  }

  try {
    const parsed: unknown = JSON.parse(serialized);

    if (typeof parsed !== 'object' || parsed === null) {
      return createDefaultPreferences();
    }

    const version = Reflect.get(parsed, 'version');
    const selectedInstrumentId = Reflect.get(parsed, 'selectedInstrumentId');

    if (version === LEGACY_STORAGE_VERSION) {
      return restoreLegacyPreferences(Reflect.get(parsed, 'instrumentIds'), selectedInstrumentId);
    }

    const savedInstruments = Reflect.get(parsed, 'instruments');

    if (version !== STORAGE_VERSION || !Array.isArray(savedInstruments)) {
      return createDefaultPreferences();
    }

    const instrumentsById = new Map<string, WatchlistInstrument>();

    for (const savedInstrument of savedInstruments) {
      if (typeof savedInstrument !== 'object' || savedInstrument === null) {
        continue;
      }

      const id = Reflect.get(savedInstrument, 'id');
      const name = Reflect.get(savedInstrument, 'name');

      if (typeof id !== 'string' || (name !== undefined && typeof name !== 'string')) {
        continue;
      }

      const instrument = createInstrumentFromId(id, name);

      if (instrument !== null && !instrumentsById.has(instrument.id)) {
        instrumentsById.set(instrument.id, instrument);
      }
    }

    const instruments = [...instrumentsById.values()].slice(0, MAX_WATCHLIST_INSTRUMENTS);

    if (instruments.length === 0) {
      return createDefaultPreferences();
    }

    const selectedId =
      typeof selectedInstrumentId === 'string' &&
      instruments.some((instrument) => instrument.id === selectedInstrumentId)
        ? selectedInstrumentId
        : (instruments[0]?.id ?? DEFAULT_WATCHLIST[0]?.id ?? 'BTC-USDT');

    return Object.freeze({
      instruments: Object.freeze(instruments),
      selectedInstrumentId: selectedId,
    });
  } catch {
    return createDefaultPreferences();
  }
};

export const loadWatchlistPreferences = (storage: StringStorage | null): WatchlistPreferences => {
  if (storage === null) {
    return createDefaultPreferences();
  }

  try {
    return restoreWatchlistPreferences(storage.getItem(STORAGE_KEY));
  } catch {
    return createDefaultPreferences();
  }
};

export const saveWatchlistPreferences = (
  storage: StringStorage | null,
  preferences: WatchlistPreferences,
): void => {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        instruments: preferences.instruments.map((instrument) => ({
          id: instrument.id,
          name: instrument.name,
        })),
        selectedInstrumentId: preferences.selectedInstrumentId,
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

export const loadBrowserWatchlistPreferences = (): WatchlistPreferences =>
  loadWatchlistPreferences(getBrowserStorage());

export const saveBrowserWatchlistPreferences = (preferences: WatchlistPreferences): void => {
  saveWatchlistPreferences(getBrowserStorage(), preferences);
};
