export type ChartControlOption = {
  value: string;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
};

export type TimeframeSelectorProps = {
  value: string;
  options: readonly ChartControlOption[];
  quickValues: readonly string[];
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  testId?: string;
  testIdPrefix?: string;
  size?: 'small' | 'medium';
};

export function TimeframeSelector({
  value,
  options,
  quickValues,
  onChange,
  label = 'Temporalidad',
  disabled = false,
  testId = 'timeframe-selector',
  testIdPrefix = 'timeframe',
  size = 'small',
}: TimeframeSelectorProps) {
  const quickOptions = options.filter((option) => quickValues.includes(option.value));

  return (
    <fieldset
      aria-label={label}
      data-testid={testId}
      class="flex min-w-0 items-center gap-1"
    >
      <legend class="sr-only">{label}</legend>
      <div class="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {quickOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled || option.disabled}
            aria-pressed={value === option.value}
            aria-label={option.ariaLabel ?? option.label}
            data-testid={`${testIdPrefix}-${option.value}`}
            onClick={() => onChange(option.value)}
            class={[
              (size === 'medium' ? 'h-8 px-2.5' : 'h-7 px-2') +
                ' shrink-0 rounded text-[11px] tabular-nums transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2962ff]',
              'disabled:cursor-not-allowed disabled:opacity-40',
              value === option.value
                ? 'bg-[#2962ff]/15 font-semibold text-[#6b9eff]'
                : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label class="flex h-7 shrink-0 items-center rounded border border-[#2a2e39] bg-[#1e222d] px-1.5">
        <span class="sr-only">Todas las temporalidades</span>
        <select
          aria-label="Todas las temporalidades"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          class="max-w-20 bg-transparent text-[11px] text-[#b2b5be] outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

export type ChartTypeSelectorProps = {
  value: string;
  options: readonly ChartControlOption[];
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  testId?: string;
  showLabel?: boolean;
};

export function ChartTypeSelector({
  value,
  options,
  onChange,
  label = 'Tipo de gráfico',
  disabled = false,
  testId = 'chart-type-selector',
  showLabel = true,
}: ChartTypeSelectorProps) {
  return (
    <label class="inline-flex h-8 items-center gap-2 rounded-md border border-[#2a2e39] bg-[#131722] px-2.5">
      {showLabel ? <span class="text-[10px] text-[#787b86]">{label}</span> : null}
      <select
        aria-label={label}
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        class="max-w-28 bg-transparent text-xs text-[#d1d4dc] outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export type PriceScaleSelectorProps = {
  value: string;
  options: readonly ChartControlOption[];
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  testIdPrefix?: string;
};

export function PriceScaleSelector({
  value,
  options,
  onChange,
  label = 'Escala de precios',
  disabled = false,
  testIdPrefix = 'price-scale',
}: PriceScaleSelectorProps) {
  return (
    <fieldset
      aria-label={label}
      data-testid="price-scale-selector"
      class="inline-flex items-center gap-0.5 rounded-md border border-[#2a2e39] bg-[#131722] p-0.5"
    >
      <legend class="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled || option.disabled}
          aria-pressed={value === option.value}
          aria-label={option.label}
          onClick={() => onChange(option.value)}
          class={[
            'h-7 rounded px-2 text-[10px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2962ff]',
            'disabled:cursor-not-allowed disabled:opacity-40',
            value === option.value
              ? 'bg-[#2962ff]/15 text-[#6b9eff]'
              : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]',
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
