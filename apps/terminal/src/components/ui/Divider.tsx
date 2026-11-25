export type DividerProps = {
  orientation?: 'horizontal' | 'vertical';
  class?: string;
};

export function Divider({ orientation = 'horizontal', class: className = '' }: DividerProps) {
  return (
    <span
      aria-hidden="true"
      class={[
        'block shrink-0 bg-[#2a2e39]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      ].join(' ')}
    />
  );
}
