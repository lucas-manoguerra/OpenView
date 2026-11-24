export type WatchlistInstrument = Readonly<{
  id: string;
  symbol: string;
  name: string;
  chartSymbol: string;
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
const STORAGE_VERSION = 1;

const createDefaultPreferences = (): WatchlistPreferences =>
  Object.freeze({
    instruments: DEFAULT_WATCHLIST,
    selectedInstrumentId: DEFAULT_WATCHLIST[0].id,
  });

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
    const instrumentIds = Reflect.get(parsed, 'instrumentIds');
    const selectedInstrumentId = Reflect.get(parsed, 'selectedInstrumentId');

    if (version !== STORAGE_VERSION || !Array.isArray(instrumentIds)) {
      return createDefaultPreferences();
    }

    const knownIds = new Set(WATCHLIST_CATALOG.map((instrument) => instrument.id));
    const normalizedIds = [...new Set(
      instrumentIds.filter((id): id is string => typeof id === 'string' && knownIds.has(id)),
    )].slice(0, MAX_WATCHLIST_INSTRUMENTS);

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
        : instruments[0].id;

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
        instrumentIds: preferences.instruments.map((instrument) => instrument.id),
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
