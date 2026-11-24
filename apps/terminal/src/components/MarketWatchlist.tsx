import type { QuoteUpdate } from '@openview/market-data';

export type WatchlistInstrument = Readonly<{
  id: string;
  symbol: string;
  name: string;
  chartSymbol: string;
}>;

type MarketWatchlistProps = Readonly<{
  instruments: readonly WatchlistInstrument[];
  selectedInstrumentId: string;
  quotes: Readonly<Record<string, QuoteUpdate>>;
  onSelect: (instrumentId: string) => void;
}>;

const formatQuoteValue = (value: number | null, maximumFractionDigits = 8): string =>
  value === null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits }).format(value);

export function MarketWatchlist({
  instruments,
  selectedInstrumentId,
  quotes,
  onSelect,
}: MarketWatchlistProps) {
  return (
    <section
      class="overflow-hidden rounded-xl border border-white/10 bg-[#0a101a]"
      aria-label="Lista de seguimiento"
      data-testid="market-watchlist"
    >
      <div class="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Lista de seguimiento
        </div>
        <div class="text-[10px] text-slate-600">Spot · USDT</div>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.7fr)_4.5rem] gap-3 px-3 py-2 text-[9px] font-medium uppercase tracking-wider text-slate-600">
        <span>Instrumento</span>
        <span class="text-right">Último</span>
        <span class="text-right">24h</span>
      </div>
      <div class="divide-y divide-white/[0.05]">
        {instruments.map((instrument) => {
          const quote = quotes[instrument.id];
          const change = quote?.changePercent24h ?? null;

          return (
            <button
              type="button"
              key={instrument.id}
              aria-label={instrument.name + ' ' + instrument.symbol}
              aria-pressed={selectedInstrumentId === instrument.id}
              data-testid="watchlist-instrument"
              data-instrument-id={instrument.id}
              onClick={() => onSelect(instrument.id)}
              class={
                'grid w-full grid-cols-[minmax(0,1fr)_minmax(5rem,0.7fr)_4.5rem] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.04] ' +
                (selectedInstrumentId === instrument.id ? 'bg-blue-500/[0.08]' : '')
              }
            >
              <span class="flex min-w-0 items-center gap-2.5">
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[9px] font-semibold text-slate-300">
                  {instrument.symbol.split('/')[0]}
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-xs font-semibold text-slate-200">
                    {instrument.symbol}
                  </span>
                  <span class="mt-0.5 block truncate text-[10px] text-slate-500">
                    {instrument.name}
                  </span>
                </span>
              </span>
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
            </button>
          );
        })}
      </div>
    </section>
  );
}
