import { useState } from 'preact/hooks';
import type { QuoteUpdate } from '@openview/market-data';
import {
  MAX_WATCHLIST_INSTRUMENTS,
  type WatchlistInstrument,
} from '../watchlist/watchlist-preferences';

type MarketWatchlistProps = Readonly<{
  instruments: readonly WatchlistInstrument[];
  availableInstruments: readonly WatchlistInstrument[];
  selectedInstrumentId: string;
  quotes: Readonly<Record<string, QuoteUpdate>>;
  onSelect: (instrumentId: string) => void;
  onAdd: (instrument: WatchlistInstrument) => void;
  onRemove: (instrumentId: string) => void;
}>;

const formatQuoteValue = (value: number | null, maximumFractionDigits = 8): string =>
  value === null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits }).format(value);

export function MarketWatchlist({
  instruments,
  availableInstruments,
  selectedInstrumentId,
  quotes,
  onSelect,
  onAdd,
  onRemove,
}: MarketWatchlistProps) {
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const searchResults =
    normalizedSearch.length === 0
      ? []
      : availableInstruments.filter(
          (instrument) =>
            !instruments.some((current) => current.id === instrument.id) &&
            (instrument.symbol.toLocaleLowerCase().includes(normalizedSearch) ||
              instrument.name.toLocaleLowerCase().includes(normalizedSearch) ||
              instrument.id.toLocaleLowerCase().includes(normalizedSearch)),
        );
  const atCapacity = instruments.length >= MAX_WATCHLIST_INSTRUMENTS;

  return (
    <section
      class="overflow-hidden rounded-xl border border-white/10 bg-[#0a101a]"
      aria-label="Lista de seguimiento"
      data-testid="market-watchlist"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Lista de seguimiento
        </div>
        <div class="text-[10px] text-slate-600">
          Spot · USDT · {instruments.length}/{MAX_WATCHLIST_INSTRUMENTS}
        </div>
      </div>
      <div class="border-b border-white/[0.06] p-3">
        <label class="grid gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Agregar instrumento
          <input
            type="search"
            value={search}
            onInput={(event) => setSearch(event.currentTarget.value)}
            placeholder="Buscar activo o símbolo"
            aria-label="Buscar instrumento para agregar"
            data-testid="watchlist-search"
            class="w-full rounded-lg border border-white/10 bg-[#101723] px-3 py-2 text-xs normal-case tracking-normal text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-blue-400/50"
          />
        </label>
        {normalizedSearch.length > 0 && (
          <div class="mt-2 space-y-1">
            {searchResults.length === 0 ? (
              <div class="px-2 py-2 text-xs text-slate-500" role="status">
                No hay instrumentos disponibles en el catálogo para esta búsqueda.
              </div>
            ) : (
              searchResults.map((instrument) => (
                <button
                  type="button"
                  key={instrument.id}
                  data-testid="watchlist-add-instrument"
                  data-instrument-id={instrument.id}
                  disabled={atCapacity}
                  onClick={() => {
                    onAdd(instrument);
                    setSearch('');
                  }}
                  class="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>
                    <span class="font-semibold">{instrument.symbol}</span>
                    <span class="ml-2 text-slate-500">{instrument.name}</span>
                  </span>
                  <span class="text-blue-300">Agregar</span>
                </button>
              ))
            )}
            {atCapacity && (
              <div class="px-2 py-1 text-[10px] text-amber-300" role="status">
                Se alcanzó el máximo de instrumentos.
              </div>
            )}
          </div>
        )}
        <div class="mt-1 text-[10px] text-slate-600">
          Catálogo inicial de pares Spot USDT; la disponibilidad depende del proveedor.
        </div>
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

          return (
            <div
              key={instrument.id}
              class="grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.7fr)_4.5rem_4rem] items-center gap-3 px-3 py-2"
            >
              <button
                type="button"
                aria-label={instrument.name + ' ' + instrument.symbol}
                aria-pressed={selectedInstrumentId === instrument.id}
                data-testid="watchlist-instrument"
                data-instrument-id={instrument.id}
                onClick={() => onSelect(instrument.id)}
                class={
                  'flex min-w-0 items-center gap-2.5 rounded-lg py-1 text-left transition-colors hover:bg-white/[0.04] ' +
                  (selectedInstrumentId === instrument.id ? 'text-blue-200' : 'text-slate-200')
                }
              >
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[9px] font-semibold text-slate-300">
                  {instrument.id.split('-')[0]}
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-xs font-semibold">{instrument.symbol}</span>
                  <span class="mt-0.5 block truncate text-[10px] text-slate-500">
                    {instrument.name}
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
    </section>
  );
}
