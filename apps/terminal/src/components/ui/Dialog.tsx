import { useId, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export type DialogProps = {
  triggerLabel: string;
  title: string;
  description?: string;
  children: ComponentChildren;
  closeLabel?: string;
};

export function Dialog({
  triggerLabel,
  title,
  description,
  children,
  closeLabel = 'Cerrar diálogo',
}: DialogProps) {
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const setDialogRef = (element: HTMLDialogElement | null) => {
    dialogRef.current = element;
    if (!element) return;
    dialogRef.current = element;
    if (!element.open) element.showModal();
    requestAnimationFrame(() => {
      element.querySelector<HTMLElement>('[autofocus]')?.focus();
    });
  };

  const openDialog = () => setOpen(true);

  const closeDialog = () => {
    dialogRef.current?.close();
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleDialogKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <style>{'.tradingview-dialog::backdrop { background: rgba(0, 0, 0, 0.6); }'}</style>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        class="inline-flex h-8 items-center rounded border border-[#2a2e39] bg-[#1e222d] px-3 text-xs font-medium text-[#b2b5be] transition-colors hover:border-[#434651] hover:bg-[#2a2e39] hover:text-[#d1d4dc] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2962ff]"
      >
        {triggerLabel}
      </button>

      {open ? (
        <dialog
          ref={setDialogRef}
          aria-modal="true"
          aria-labelledby={`${dialogId}-title`}
          aria-describedby={description ? `${dialogId}-description` : undefined}
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
          onKeyDown={handleDialogKeyDown}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
          class="tradingview-dialog fixed inset-0 m-auto w-full max-w-md rounded-lg border border-[#2a2e39] bg-[#1e222d] p-0 text-[#d1d4dc] shadow-2xl shadow-black/50"
        >
          <header class="flex items-start justify-between gap-4 border-b border-[#2a2e39] px-4 py-3">
            <div class="min-w-0">
              <h2 id={`${dialogId}-title`} class="text-sm font-semibold text-[#d1d4dc]">
                {title}
              </h2>
              {description ? (
                <p id={`${dialogId}-description`} class="mt-1 text-xs leading-5 text-[#787b86]">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={closeLabel}
              onClick={closeDialog}
              class="inline-flex size-7 shrink-0 items-center justify-center rounded text-base leading-none text-[#787b86] transition-colors hover:bg-[#2a2e39] hover:text-[#d1d4dc] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2962ff]"
            >
              ×
            </button>
          </header>
          <div class="px-4 py-4 text-sm text-[#b2b5be]">{children}</div>
        </dialog>
      ) : null}
    </>
  );
}
