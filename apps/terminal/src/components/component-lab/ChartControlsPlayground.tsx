import { useCallback, useState } from 'preact/hooks';
import {
  ChartTypeSelector,
  PriceScaleSelector,
  TimeframeSelector,
  type ChartControlOption,
} from '../ui';

const timeframeOptions: readonly ChartControlOption[] = [
  { value: '1m', label: '1m' },
  { value: '3m', label: '3m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '2h', label: '2h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1M', label: '1M' },
];

const quickTimeframes = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

const chartTypeOptions: readonly ChartControlOption[] = [
  { value: 'candles', label: 'Velas' },
  { value: 'bars', label: 'Barras' },
  { value: 'line', label: 'Línea' },
  { value: 'area', label: 'Área' },
];

const priceScaleOptions: readonly ChartControlOption[] = [
  { value: 'linear', label: 'Lin' },
  { value: 'logarithmic', label: 'Log' },
  { value: 'percentage', label: '%' },
  { value: 'indexed-to-100', label: '100' },
];

export function ChartControlsPlayground() {
  const [timeframe, setTimeframe] = useState('15m');
  const [chartType, setChartType] = useState('candles');
  const [priceScale, setPriceScale] = useState('linear');
  const [disabled, setDisabled] = useState(false);
  const setPlaygroundRef = useCallback((element: HTMLDivElement | null) => {
    if (element) element.dataset['hydrated'] = 'true';
  }, []);

  return (
    <div
      class="space-y-6"
      data-testid="chart-controls-playground"
      data-hydrated="false"
      ref={setPlaygroundRef}
    >
      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Temporalidades</h2>
          <label class="flex items-center gap-2 text-xs text-[#b2b5be]">
            <input
              type="checkbox"
              checked={disabled}
              onChange={(event) => setDisabled(event.currentTarget.checked)}
              class="accent-[#2962ff]"
            />
            Deshabilitar controles
          </label>
        </div>
        <div class="flex min-h-14 items-center overflow-x-auto rounded-md border border-[#2a2e39] bg-[#0b0e14] p-3">
          <TimeframeSelector
            value={timeframe}
            options={timeframeOptions}
            quickValues={quickTimeframes}
            onChange={setTimeframe}
            disabled={disabled}
          />
        </div>
        <p class="text-[11px] text-[#787b86]" data-testid="selected-timeframe">
          Temporalidad seleccionada: <span class="font-mono text-[#6b9eff]">{timeframe}</span>
        </p>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Tipo de gráfico</h2>
        <div class="flex flex-wrap items-center gap-3 rounded-md border border-[#2a2e39] bg-[#0b0e14] p-3">
          <ChartTypeSelector
            value={chartType}
            options={chartTypeOptions}
            onChange={setChartType}
            disabled={disabled}
          />
          <span class="text-[11px] text-[#787b86]" data-testid="selected-chart-type">
            {chartType}
          </span>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Escala de precios</h2>
        <div class="flex flex-wrap items-center gap-3 rounded-md border border-[#2a2e39] bg-[#0b0e14] p-3">
          <PriceScaleSelector
            value={priceScale}
            options={priceScaleOptions}
            onChange={setPriceScale}
            disabled={disabled}
          />
          <span class="text-[11px] text-[#787b86]" data-testid="selected-price-scale">
            {priceScale}
          </span>
        </div>
      </section>
    </div>
  );
}
