import type { ComponentChildren } from 'preact';

export type TooltipProps = {
  content: string;
  children: ComponentChildren;
  side?: 'top' | 'bottom' | 'left' | 'right';
};

const sideClasses = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'left-1/2 top-full mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <span class="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        class={[
          'pointer-events-none absolute z-50 whitespace-nowrap rounded border border-[#434651]',
          'bg-[#1e222d] px-2 py-1.5 text-[11px] font-medium text-[#d1d4dc] opacity-0 shadow-xl',
          'transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100',
          sideClasses[side],
        ].join(' ')}
      >
        {content}
      </span>
    </span>
  );
}
