import type { ComponentChildren, JSX } from 'preact';

export type IconButtonProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'size'> & {
  label: string;
  size?: 'small' | 'medium' | 'large';
  active?: boolean;
  children: ComponentChildren;
};

const sizes = {
  small: 'size-7',
  medium: 'size-8',
  large: 'size-9',
};

export function IconButton({
  label,
  size = 'medium',
  active = false,
  disabled = false,
  class: className = '',
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={label}
      class={[
        'inline-grid shrink-0 place-items-center rounded-md border text-[#b2b5be]',
        'transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[#2962ff] focus-visible:ring-offset-1 focus-visible:ring-offset-[#131722]',
        'disabled:pointer-events-none disabled:opacity-40',
        sizes[size],
        active
          ? 'border-[#2962ff]/40 bg-[#2962ff]/15 text-[#6b9eff]'
          : 'border-transparent bg-transparent hover:border-[#434651] hover:bg-[#2a2e39] hover:text-[#d1d4dc]',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
