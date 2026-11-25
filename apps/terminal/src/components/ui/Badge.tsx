import type { ComponentChildren } from 'preact';

export type BadgeProps = {
  children: ComponentChildren;
  tone?: 'neutral' | 'positive' | 'negative' | 'blue';
};

const tones = {
  neutral: 'border-[#434651] bg-[#2a2e39] text-[#b2b5be]',
  positive: 'border-[#089981]/30 bg-[#089981]/10 text-[#089981]',
  negative: 'border-[#f23645]/30 bg-[#f23645]/10 text-[#f23645]',
  blue: 'border-[#2962ff]/30 bg-[#2962ff]/10 text-[#6b9eff]',
};

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return (
    <span class={['inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium', tones[tone]].join(' ')}>
      {children}
    </span>
  );
}
