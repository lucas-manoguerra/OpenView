import type { ComponentChildren, JSX } from 'preact';

export type TextFieldSize = 'small' | 'medium' | 'large';

export type TextFieldInputType =
  | 'button'
  | 'checkbox'
  | 'color'
  | 'date'
  | 'datetime-local'
  | 'email'
  | 'file'
  | 'hidden'
  | 'image'
  | 'month'
  | 'number'
  | 'password'
  | 'radio'
  | 'range'
  | 'reset'
  | 'search'
  | 'submit'
  | 'tel'
  | 'text'
  | 'time'
  | 'url'
  | 'week';

export type TextFieldProps = Omit<JSX.IntrinsicElements['input'], 'size' | 'role' | 'type'> & {
  type?: TextFieldInputType;
  label?: string;
  hint?: string;
  error?: string;
  size?: TextFieldSize;
  fullWidth?: boolean;
  leading?: ComponentChildren;
  trailing?: ComponentChildren;
};

const sizeClasses: Record<TextFieldSize, string> = {
  small: 'h-7 px-2 text-xs',
  medium: 'h-8 px-2.5 text-[13px]',
  large: 'h-10 px-3 text-sm',
};

export function TextField({
  label,
  hint,
  error,
  size = 'medium',
  fullWidth = false,
  leading,
  trailing,
  id,
  class: className = '',
  disabled = false,
  type = 'text',
  ...props
}: TextFieldProps) {
  const describedBy =
    [
      hint && !error ? `${id ?? 'text-field'}-hint` : undefined,
      error ? `${id ?? 'text-field'}-error` : undefined,
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
      <span
        class={[
          'flex min-w-0 items-center gap-2 rounded-md border bg-[#131722] transition-colors',
          'focus-within:border-[#2962ff] focus-within:ring-1 focus-within:ring-[#2962ff]/30',
          error ? 'border-[#f23645]' : 'border-[#434651] hover:border-[#5d606b]',
          disabled ? 'cursor-not-allowed opacity-45' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {leading ? <span class="shrink-0 pl-2.5 text-xs text-[#787b86]">{leading}</span> : null}
        <input
          {...props}
          type={type as 'text'}
          id={id}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          class={[
            'min-w-0 flex-1 bg-transparent text-[#d1d4dc] outline-none placeholder:text-[#5d606b]',
            'disabled:cursor-not-allowed',
            sizeClasses[size],
          ].join(' ')}
        />
        {trailing ? <span class="shrink-0 pr-2.5 text-xs text-[#787b86]">{trailing}</span> : null}
      </span>
      {error ? (
        <span id={`${id ?? 'text-field'}-error`} class="text-[11px] text-[#f23645]">
          {error}
        </span>
      ) : null}
      {!error && hint ? (
        <span id={`${id ?? 'text-field'}-hint`} class="text-[11px] text-[#787b86]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
