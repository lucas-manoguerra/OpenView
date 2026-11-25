import type { ComponentChildren, JSX } from 'preact';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

export type ButtonProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'size'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  children: ComponentChildren;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border border-[#2962ff] bg-[#2962ff] text-white hover:bg-[#1e53e5] active:bg-[#1948c7]',
  secondary: 'border border-[#434651] bg-[#2a2e39] text-[#d1d4dc] hover:border-[#5d606b] hover:bg-[#363a45] active:bg-[#20232c]',
  ghost: 'border border-transparent bg-transparent text-[#b2b5be] hover:bg-[#2a2e39] hover:text-[#d1d4dc] active:bg-[#363a45]',
  danger: 'border border-[#f23645]/50 bg-[#f23645]/10 text-[#f23645] hover:bg-[#f23645]/20 active:bg-[#f23645]/30',
};

const sizeClasses: Record<ButtonSize, string> = {
  small: 'h-7 gap-1.5 rounded px-2 text-xs',
  medium: 'h-8 gap-2 rounded-md px-3 text-[13px]',
  large: 'h-10 gap-2 rounded-md px-4 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'medium',
  fullWidth = false,
  loading = false,
  disabled = false,
  class: className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      class={[
        'inline-flex shrink-0 select-none items-center justify-center font-medium leading-none',
        'transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[#2962ff] focus-visible:ring-offset-1 focus-visible:ring-offset-[#131722]',
        'disabled:pointer-events-none disabled:opacity-45',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {loading ? <span class="size-3 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      {children}
    </button>
  );
}
