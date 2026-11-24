import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { QuoteUpdate } from '@openview/market-data';
import {
  MAX_WATCHLIST_INSTRUMENTS,
  type WatchlistInstrument,
} from '../watchlist/watchlist-preferences';

export type ProviderInstrumentSearchResult = Readonly<{
  instrument: WatchlistInstrument;
  providerId: string;
  providerName: string;
}>;

export type SearchCatalogFailure = Readonly<{
  providerId: string;
  providerName: string;
  message: string;
}>;

type SearchCatalogStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'unavailable';

type MarketWatchlistProps = Readonly<{
  instruments: readonly WatchlistInstrument[];
  availableInstruments: readonly WatchlistInstrument[];
  availableInstrumentIds: readonly string[];
  catalogStatus: 'loading' | 'ready' | 'unavailable';
  catalogError: string | null;
  providerName: string;
  selectedInstrumentId: string;
  quotes: Readonly<Record<string, QuoteUpdate>>;
  searchResults: readonly ProviderInstrumentSearchResult[];
  searchCatalogStatus: SearchCatalogStatus;
  searchCatalogFailures: readonly SearchCatalogFailure[];
  onOpenSearch: () => void;
  isSearchOpen: boolean;
  onSearchOpenChange: (isOpen: boolean) => void;
  onSelect: (instrumentId: string) => void;
  onAdd: (instrument: WatchlistInstrument, providerId: string) => void;
  onRemove: (instrumentId: string) => void;
}>;

const formatQuoteValue = (value: number | null, maximumFractionDigits = 8): string =>
  value === null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits }).format(value);

const compactSearchValue = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const getProviderAbbreviation = (providerId: string): string => {
  if (providerId.startsWith('binance')) {
    return 'BN';
  }

  if (providerId.startsWith('bybit')) {
    return 'BY';
  }

  if (providerId.startsWith('okx')) {
    return 'OK';
  }

  return providerId.slice(0, 2).toUpperCase();
};

const getQuoteDisplayName = (quoteAsset: string): string => {
  const quoteNames: Readonly<Record<string, string>> = {
    BTC: 'Bitcoin',
    ETH: 'Ether',
    USDC: 'USD Coin',
    USDT: 'TetherUS',
  };

  return quoteNames[quoteAsset] ?? quoteAsset;
};

const getProviderClassName = (providerId: string): string => {
  if (providerId.startsWith('binance')) {
    return 'bg-[#f0b90b] text-[#1e2329]';
  }

  if (providerId.startsWith('bybit')) {
    return 'bg-[#202630] text-white';
  }

  if (providerId.startsWith('okx')) {
    return 'bg-[#202630] text-white';
  }

  return 'bg-slate-700 text-white';
};

function SymbolSearchModal({
  instruments,
  results,
  status,
  failures,
  onClose,
  onAdd,
}: Readonly<{
  instruments: readonly WatchlistInstrument[];
  results: readonly ProviderInstrumentSearchResult[];
  status: SearchCatalogStatus;
  failures: readonly SearchCatalogFailure[];
  onClose: () => void;
  onAdd: (instrument: WatchlistInstrument, providerId: string) => void;
}>) {
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const focusSearchInput = useCallback((element: HTMLInputElement | null): void => {
    element?.focus();
  }, []);
  const normalizedQuery = compactSearchValue(query);
  const providers = useMemo(
    () => [
      { id: 'all', name: 'Todos' },
      ...results.reduce<ReadonlyArray<{ id: string; name: string }>>((entries, result) => {
        if (entries.some((entry) => entry.id === result.providerId)) {
          return entries;
        }

        return [...entries, { id: result.providerId, name: result.providerName }];
      }, []),
    ],
    [results],
  );
  const filteredResults = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return [];
    }

    return results
      .filter((result) => providerFilter === 'all' || result.providerId === providerFilter)
      .filter((result) => {
        const instrument = result.instrument;
        const searchableValues = [
          instrument.id,
          instrument.symbol,
          instrument.name,
          instrument.id.replace('-', ''),
          instrument.symbol.replace('/', ''),
        ];

        return searchableValues.some((value) =>
          compactSearchValue(value).includes(normalizedQuery),
        );
      })
      .slice(0, 60);
  }, [normalizedQuery, providerFilter, results]);

  const closeModal = (): void => {
    setQuery('');
    setProviderFilter('all');
    setActiveIndex(0);
    onClose();
  };

  const selectResult = (result: ProviderInstrumentSearchResult): void => {
    onAdd(result.instrument, result.providerId);
    closeModal();
  };

  const handleSearchKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (filteredResults.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % filteredResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + filteredResults.length) % filteredResults.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = filteredResults[activeIndex] ?? filteredResults[0];

      if (result !== undefined) {
        selectResult(result);
      }
    }
  };

  return (
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-[#10141e]/75 p-3 backdrop-blur-[2px] sm:p-6">
      <button
        type="button"
        aria-label="Cerrar buscador"
        data-testid="symbol-search-backdrop"
        class="absolute inset-0 size-full cursor-default"
        onClick={closeModal}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-search-title"
        class="relative z-10 flex max-h-[min(780px,calc(100vh-24px))] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-[#d9dde5] bg-[#f8f9fb] text-[#131722] shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:max-h-[min(780px,calc(100vh-48px))]"
        data-testid="symbol-search-modal"
      >
        <h2 id="symbol-search-title" class="sr-only">
          Buscar instrumentos y mercados
        </h2>
        <div class="flex items-center gap-3 border-b border-[#e0e3eb] bg-white px-4 py-3 sm:px-5">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            class="size-5 shrink-0 text-[#6a6d78]"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 4.2 4.2" />
          </svg>
          <input
            type="search"
            value={query}
            ref={focusSearchInput}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar símbolo o mercado (ej. ADAUSDT)"
            aria-label="Buscar símbolos en todos los proveedores"
            aria-controls="symbol-search-results"
            aria-activedescendant={
              filteredResults[activeIndex] === undefined
                ? undefined
                : 'symbol-search-result-' + activeIndex
            }
            data-testid="watchlist-search"
            class="h-9 min-w-0 flex-1 bg-transparent text-sm text-[#131722] outline-none placeholder:text-[#a0a4ad]"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
              }}
              class="px-1 text-xs text-[#6a6d78] hover:text-[#131722]"
              aria-label="Borrar búsqueda"
            >
              Borrar
            </button>
          )}
          <button
            type="button"
            onClick={closeModal}
            aria-label="Cerrar buscador"
            data-testid="watchlist-search-close"
            class="grid size-8 shrink-0 place-items-center rounded-md text-lg text-[#6a6d78] hover:bg-[#f0f2f5] hover:text-[#131722]"
          >
            ×
          </button>
        </div>

        <div class="flex gap-1 overflow-x-auto border-b border-[#e0e3eb] bg-white px-3 py-2 sm:px-4">
          {providers.map((provider) => (
            <button
              type="button"
              key={provider.id}
              aria-pressed={providerFilter === provider.id}
              onClick={() => {
                setProviderFilter(provider.id);
                setActiveIndex(0);
              }}
              class={
                'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ' +
                (providerFilter === provider.id
                  ? 'bg-[#202630] text-white'
                  : 'bg-[#f0f2f5] text-[#434651] hover:bg-[#e4e7ed]')
              }
            >
              {provider.name}
            </button>
          ))}
        </div>

        {status === 'partial' && failures.length > 0 && (
          <div
            class="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800 sm:px-5"
            role="status"
            data-testid="watchlist-search-partial"
          >
            Catálogo parcial: {failures.length} proveedor(es) no respondieron. Se muestran los
            mercados disponibles de las demás fuentes.
          </div>
        )}

        <div class="min-h-0 flex-1 overflow-y-auto bg-[#f8f9fb]" id="symbol-search-results">
          {status === 'loading' && results.length === 0 ? (
            <div class="grid min-h-52 place-items-center px-6 text-center text-sm text-[#6a6d78]">
              Consultando Binance, Bybit y OKX…
            </div>
          ) : status === 'unavailable' ? (
            <div
              class="grid min-h-52 place-items-center px-6 text-center text-sm text-[#b45309]"
              role="alert"
              data-testid="watchlist-search-error"
            >
              No se pudo consultar ningún catálogo de instrumentos.
            </div>
          ) : normalizedQuery.length === 0 ? (
            <div class="grid min-h-52 place-items-center px-6 text-center">
              <div>
                <div class="text-sm font-medium text-[#434651]">Buscar símbolos</div>
                <p class="mt-1 text-xs text-[#787b86]">
                  Escribe un ticker, nombre o par completo como ADAUSDT.
                </p>
              </div>
            </div>
          ) : filteredResults.length === 0 ? (
            <div class="grid min-h-52 place-items-center px-6 text-center text-sm text-[#6a6d78]">
              No se encontraron símbolos para “{query}”.
            </div>
          ) : (
            <div class="py-2">
              <div class="flex items-center justify-between px-4 pb-2 text-[10px] font-medium uppercase tracking-wider text-[#8a8d98] sm:px-5">
                <span>Símbolo</span>
                <span>{filteredResults.length} resultados</span>
              </div>
              {filteredResults.map((result, index) => {
                const { instrument } = result;
                const isInWatchlist = instruments.some((item) => item.id === instrument.id);
                const isAtCapacity =
                  !isInWatchlist && instruments.length >= MAX_WATCHLIST_INSTRUMENTS;

                return (
                  <button
                    type="button"
                    key={result.providerId + ':' + instrument.id}
                    id={'symbol-search-result-' + index}
                    data-testid="watchlist-search-result"
                    data-provider-id={result.providerId}
                    data-instrument-id={instrument.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectResult(result)}
                    disabled={isAtCapacity}
                    class={
                      'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors sm:px-5 ' +
                      (activeIndex === index ? 'bg-[#e9f1ff]' : 'hover:bg-[#eef1f6]') +
                      (isAtCapacity ? ' cursor-not-allowed opacity-50' : '')
                    }
                  >
                    <span class="grid size-9 shrink-0 place-items-center rounded-full bg-[#e7efff] text-[10px] font-bold text-[#2962ff]">
                      {(instrument.id.split('-')[0] ?? instrument.id).slice(0, 4)}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[13px] font-medium text-[#2962ff]">
                        {instrument.id.replace('-', '')}
                      </span>
                      <span class="mt-0.5 block truncate text-[11px] text-[#6a6d78]">
                        {instrument.name} / {getQuoteDisplayName(instrument.id.split('-')[1] ?? '')}
                        <span class="ml-2 rounded bg-[#e5e7eb] px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#626672]">
                          Spot Crypto
                        </span>
                      </span>
                    </span>
                    <span class="flex shrink-0 items-center gap-2">
                      <span
                        class={
                          'grid size-6 place-items-center rounded-full text-[9px] font-bold ' +
                          getProviderClassName(result.providerId)
                        }
                        aria-hidden="true"
                      >
                        {getProviderAbbreviation(result.providerId)}
                      </span>
                      <span class="hidden min-w-16 text-right text-[11px] text-[#434651] sm:inline">
                        {result.providerName.replace(' Spot', '')}
                      </span>
                    </span>
                    <span
                      class={
                        'grid size-7 shrink-0 place-items-center rounded-full border text-base ' +
                        (isInWatchlist
                          ? 'border-[#d9dde5] text-[#16a34a]'
                          : 'border-[#c7ccd5] text-[#434651]')
                      }
                      aria-hidden="true"
                    >
                      {isInWatchlist ? '✓' : '+'}
                    </span>
                    <span class="sr-only">
                      {isInWatchlist ? 'Ya está en la lista; abrir' : 'Agregar a la lista'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-[#e0e3eb] bg-white px-4 py-2.5 text-[10px] text-[#787b86] sm:px-5">
          <span>
            {status === 'loading'
              ? 'Actualizando mercados…'
              : 'Resultados de los proveedores Spot disponibles'}
          </span>
          <span class="hidden sm:inline">↑ ↓ navegar · Enter abrir · Esc cerrar</span>
        </footer>
      </section>
    </div>
  );
}

export function MarketWatchlist({
  instruments,
  availableInstruments,
  availableInstrumentIds,
  catalogStatus,
  catalogError,
  providerName,
  selectedInstrumentId,
  quotes,
  searchResults,
  searchCatalogStatus,
  searchCatalogFailures,
  onOpenSearch,
  isSearchOpen,
  onSearchOpenChange,
  onSelect,
  onAdd,
  onRemove,
}: MarketWatchlistProps) {
  const shortcutDocumentRef = useRef<Document | null>(null);
  const onOpenSearchRef = useRef(onOpenSearch);
  onOpenSearchRef.current = onOpenSearch;
  const handleDocumentShortcut = useCallback((event: KeyboardEvent): void => {
    const target = event.target;

    if (
      event.key !== '/' ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT'))
    ) {
      return;
    }

    event.preventDefault();
    onSearchOpenChange(true);
    onOpenSearchRef.current();
  }, []);
  const bindShortcutRoot = useCallback(
    (element: HTMLDivElement | null): void => {
      shortcutDocumentRef.current?.removeEventListener('keydown', handleDocumentShortcut);
      shortcutDocumentRef.current = null;

      if (element !== null) {
        shortcutDocumentRef.current = element.ownerDocument;
        shortcutDocumentRef.current.addEventListener('keydown', handleDocumentShortcut);
      }
    },
    [handleDocumentShortcut],
  );
  const atCapacity = instruments.length >= MAX_WATCHLIST_INSTRUMENTS;
  const availableIds = new Set(availableInstrumentIds);

  const openSearch = (): void => {
    onSearchOpenChange(true);
    onOpenSearch();
  };

  return (
    <div ref={bindShortcutRoot}>
      <section
        class="overflow-hidden rounded-xl border border-white/10 bg-[#0a101a]"
        aria-label="Lista de seguimiento"
        data-testid="market-watchlist"
        data-catalog-status={catalogStatus}
      >
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
          <div class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Lista de seguimiento
          </div>
          <div class="text-[10px] text-slate-600">
            {providerName} · Spot · {instruments.length}/{MAX_WATCHLIST_INSTRUMENTS}
          </div>
        </div>
        <div class="border-b border-white/[0.06] p-3">
          <button
            type="button"
            onClick={openSearch}
            aria-label="Buscar instrumentos en todos los proveedores"
            data-testid="watchlist-open-search"
            class="flex h-10 w-full items-center gap-2 rounded-lg border border-white/10 bg-[#101723] px-3 text-left text-xs text-slate-400 outline-none transition-colors hover:border-blue-400/40 hover:bg-[#131e2d]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              class="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.2 4.2" />
            </svg>
            <span class="flex-1">Buscar símbolo o mercado</span>
            <kbd class="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-500">
              /
            </kbd>
          </button>
          <div class="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-600">
            <span>
              {searchCatalogStatus === 'loading'
                ? 'Actualizando catálogos de proveedores…'
                : 'Buscar en todos los proveedores Spot'}
            </span>
            <span>
              {searchResults.length > 0
                ? searchResults.length + ' mercados'
                : 'Binance · Bybit · OKX'}
            </span>
          </div>
          {catalogStatus === 'unavailable' && (
            <div
              class="mt-2 text-[10px] text-amber-300"
              role="status"
              data-testid="watchlist-catalog-error"
            >
              {catalogError ?? 'El catálogo del proveedor del gráfico no está disponible.'}
            </div>
          )}
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.7fr)_4.5rem_4rem] gap-3 px-3 py-2 text-[9px] font-medium uppercase tracking-wider text-slate-600">
          <span>Instrumento</span>
          <span class="text-right">Último</span>
          <span class="text-right">24h</span>
          <span class="text-right">Acción</span>
        </div>
        <div class="divide-y divide-white/[0.05]">
          {instruments.map((instrument) => {
            const quote = quotes[instrument.id];
            const change = quote?.changePercent24h ?? null;
            const isAvailable = catalogStatus !== 'ready' || availableIds.has(instrument.id);

            return (
              <div
                key={instrument.id}
                class="grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.7fr)_4.5rem_4rem] items-center gap-3 px-3 py-2"
                data-instrument-availability={isAvailable ? 'available' : 'unavailable'}
              >
                <button
                  type="button"
                  aria-label={instrument.name + ' ' + instrument.symbol}
                  aria-pressed={selectedInstrumentId === instrument.id}
                  aria-disabled={!isAvailable}
                  title={
                    isAvailable
                      ? undefined
                      : 'Este instrumento no está disponible en ' + providerName
                  }
                  data-testid="watchlist-instrument"
                  data-instrument-id={instrument.id}
                  disabled={!isAvailable}
                  onClick={() => onSelect(instrument.id)}
                  class={
                    'flex min-w-0 items-center gap-2.5 rounded-lg py-1 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50 ' +
                    (selectedInstrumentId === instrument.id ? 'text-blue-200' : 'text-slate-200')
                  }
                >
                  <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[9px] font-semibold text-slate-300">
                    {instrument.id.split('-')[0]}
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-xs font-semibold">{instrument.symbol}</span>
                    <span class="mt-0.5 block truncate text-[10px] text-slate-500">
                      {isAvailable ? instrument.name : 'No disponible en ' + providerName}
                    </span>
                  </span>
                </button>
                <span
                  class="truncate text-right text-xs font-medium tabular-nums text-slate-200"
                  data-testid={'watchlist-last-' + instrument.id}
                >
                  {formatQuoteValue(quote?.last ?? null)}
                </span>
                <span
                  class={
                    'text-right text-[10px] font-medium tabular-nums ' +
                    (change === null
                      ? 'text-slate-500'
                      : change >= 0
                        ? 'text-emerald-300'
                        : 'text-rose-300')
                  }
                  data-testid={'watchlist-change-' + instrument.id}
                >
                  {change === null
                    ? '—'
                    : (change > 0 ? '+' : '') + formatQuoteValue(change, 2) + '%'}
                </span>
                <button
                  type="button"
                  aria-label={'Quitar ' + instrument.symbol}
                  data-testid={'watchlist-remove-' + instrument.id}
                  disabled={instruments.length <= 1}
                  onClick={() => onRemove(instrument.id)}
                  class="rounded-md px-2 py-1 text-[10px] text-slate-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-20"
                >
                  Quitar
                </button>
              </div>
            );
          })}
        </div>
        {atCapacity && (
          <div class="border-t border-white/[0.06] px-3 py-2 text-[10px] text-amber-300">
            Se alcanzó el máximo de {MAX_WATCHLIST_INSTRUMENTS} instrumentos.
          </div>
        )}
      </section>
      {isSearchOpen && (
        <SymbolSearchModal
          instruments={instruments}
          results={searchResults}
          status={searchCatalogStatus}
          failures={searchCatalogFailures}
          onClose={() => onSearchOpenChange(false)}
          onAdd={onAdd}
        />
      )}
    </div>
  );
}
