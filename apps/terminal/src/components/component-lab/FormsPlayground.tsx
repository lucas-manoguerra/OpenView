import { useState } from 'preact/hooks';
import { Badge } from '../ui/Badge';
import { Select } from '../ui/Select';
import { TextField } from '../ui/TextField';

export function FormsPlayground() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('15');
  const [query, setQuery] = useState('');

  return (
    <div class="space-y-6">
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-[#d1d4dc]">TextField · tamaños</h2>
          <Badge tone="positive">Interactivo</Badge>
        </div>
        <div class="grid max-w-xl gap-4 rounded-md border border-[#2a2e39] bg-[#131722] p-4 sm:grid-cols-3">
          <TextField label="Pequeño" size="small" defaultValue="BTCUSDT" />
          <TextField label="Mediano" size="medium" defaultValue="ETHUSDT" />
          <TextField label="Grande" size="large" defaultValue="SOLUSDT" />
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Estados y adornos</h2>
        <div class="grid max-w-2xl gap-4 rounded-md border border-[#2a2e39] bg-[#131722] p-4 sm:grid-cols-2">
          <TextField
            label="Símbolo"
            value={symbol}
            onInput={(event) => setSymbol(event.currentTarget.value.toUpperCase())}
            leading="⌕"
            hint="Admite escritura continua, por ejemplo BTCUSDT."
            data-testid="forms-symbol-input"
          />
          <TextField label="Deshabilitado" disabled value="No disponible" />
          <TextField label="Con error" value="BTC / USDT" error="Formato de símbolo no válido." />
          <TextField label="Buscar" type="search" placeholder="Buscar instrumento…" />
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Select nativo estilizado</h2>
        <div class="grid max-w-2xl gap-4 rounded-md border border-[#2a2e39] bg-[#131722] p-4 sm:grid-cols-2">
          <Select
            label="Temporalidad"
            value={timeframe}
            onChange={(event) => setTimeframe(event.currentTarget.value)}
            data-testid="forms-timeframe-select"
          >
            <option value="1">1 minuto</option>
            <option value="5">5 minutos</option>
            <option value="15">15 minutos</option>
            <option value="60">1 hora</option>
            <option value="240">4 horas</option>
            <option value="D">1 día</option>
          </Select>
          <Select label="Deshabilitado" disabled value="locked">
            <option value="locked">Solo lectura</option>
          </Select>
        </div>
        <div
          class="rounded-md border border-[#2a2e39] bg-[#131722] p-4 text-xs text-[#787b86]"
          aria-live="polite"
        >
          Símbolo:{' '}
          <span class="font-mono text-[#d1d4dc]" data-testid="forms-symbol-value">
            {symbol}
          </span>
          <span class="mx-2 text-[#434651]">·</span>
          Temporalidad:{' '}
          <span class="font-mono text-[#d1d4dc]" data-testid="forms-timeframe-value">
            {timeframe}
          </span>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Campo de búsqueda controlado</h2>
        <div class="max-w-xl rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <TextField
            label="Filtrar componentes"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder="Escribe para filtrar…"
            leading="⌕"
            trailing={<span data-testid="forms-query-length">{query.length}</span>}
            data-testid="forms-query-input"
          />
        </div>
      </section>
    </div>
  );
}
