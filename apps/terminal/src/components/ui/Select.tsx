import type { ComponentChildren, JSX } from 'preact';

export type SelectSize = 'small' | 'medium' | 'large';

export type SelectProps = Omit<JSX.IntrinsicElements['select'], 'size' | 'role'> & {
  label?: string;
  hint?: string;
  error?: string;
  size?: SelectSize;
  fullWidth?: boolean;
  children: ComponentChildren;
};

const sizeClasses: Record<SelectSize, string> = {
  small: 'h-7 px-2 text-xs',
  medium: 'h-8 px-2.5 text-[13px]',
  large: 'h-10 px-3 text-sm',
};

export function Select({
  label,
  hint,
  error,
  size = 'medium',
  fullWidth = false,
  id,
  class: className = '',
  disabled = false,
  children,
  ...props
}: SelectProps) {
  const describedBy =
    [
      hint && !error ? `${id ?? 'select'}-hint` : undefined,
      error ? `${id ?? 'select'}-error` : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <label
      class={['flex min-w-0 flex-col gap-1.5', fullWidth ? 'w-full' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {label ? <span class="text-xs font-medium text-[#b2b5be]">{label}</span> : null}
      <select
        {...props}
        id={id}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        class={[
          'min-w-0 rounded-md border bg-[#131722] text-[#d1d4dc] outline-none transition-colors',
          'focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff]/30',
          'disabled:cursor-not-allowed disabled:opacity-45',
          error ? 'border-[#f23645]' : 'border-[#434651] hover:border-[#5d606b]',
          sizeClasses[size],
        ].join(' ')}
      >
        {children}
      </select>
      {error ? (
        <span id={`${id ?? 'select'}-error`} class="text-[11px] text-[#f23645]">
          {error}
        </span>
      ) : null}
      {!error && hint ? (
        <span id={`${id ?? 'select'}-hint`} class="text-[11px] text-[#787b86]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
