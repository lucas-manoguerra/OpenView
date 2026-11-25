import { useEffect, useRef, useState } from 'preact/hooks';

export type DropdownMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  shortcut?: string;
};

export type DropdownMenuProps = {
  label: string;
  items: readonly DropdownMenuItem[];
  onSelect?: (id: string) => void;
  align?: 'start' | 'end';
};

export function DropdownMenu({
  label,
  items,
  onSelect,
  align = 'start',
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    firstItem?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    const enabledItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    const currentIndex = enabledItems.indexOf(event.target as HTMLButtonElement);
    if (currentIndex < 0 || enabledItems.length === 0) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % enabledItems.length;
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = enabledItems.length - 1;
    else return;

    event.preventDefault();
    enabledItems[nextIndex].focus();
  };

  return (
    <div ref={rootRef} class="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="tradingview-dropdown-menu"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        class={[
          'inline-flex h-8 items-center gap-2 rounded border px-2.5 text-xs font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2962ff]',
          open
            ? 'border-[#434651] bg-[#2a2e39] text-[#d1d4dc]'
            : 'border-[#2a2e39] bg-[#1e222d] text-[#b2b5be] hover:border-[#434651] hover:bg-[#2a2e39]',
        ].join(' ')}
      >
        {label}
        <span aria-hidden="true" class={['text-[9px] transition-transform', open ? 'rotate-180' : ''].join(' ')}>
          ▾
        </span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          id="tradingview-dropdown-menu"
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          class={[
            'absolute top-full z-50 mt-1 min-w-44 rounded border border-[#2a2e39]',
            'bg-[#1e222d] p-1 shadow-xl shadow-black/30',
            align === 'end' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onSelect?.(item.id);
                closeMenu(true);
              }}
              class={[
                'flex h-8 w-full items-center justify-between gap-5 rounded px-2 text-left text-xs',
                'text-[#b2b5be] transition-colors hover:bg-[#2a2e39] hover:text-[#d1d4dc]',
                'focus-visible:bg-[#2a2e39] focus-visible:outline-none focus-visible:text-[#d1d4dc]',
                'disabled:cursor-not-allowed disabled:opacity-40',
              ].join(' ')}
            >
              <span>{item.label}</span>
              {item.shortcut ? <span class="font-mono text-[10px] text-[#787b86]">{item.shortcut}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
