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

  const openDialog = () => {
    setOpen(true);
    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          '[data-dialog-autofocus], button:not(:disabled), input:not(:disabled)',
        )
        ?.focus();
    });
  };

  const closeDialog = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement?.focus();
    } else if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        class="inline-flex h-8 items-center rounded border border-[#2a2e39] bg-[#1e222d] px-3 text-xs font-medium text-[#b2b5be] transition-colors hover:border-[#434651] hover:bg-[#2a2e39] hover:text-[#d1d4dc] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2962ff]"
      >
        {triggerLabel}
      </button>

      {open ? (
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar diálogo al hacer clic fuera"
            tabIndex={-1}
            onClick={closeDialog}
            class="absolute inset-0 cursor-default bg-black/60"
          />
          <dialog
            ref={dialogRef}
            open
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={description ? `${dialogId}-description` : undefined}
            onKeyDown={handleKeyDown}
            class="relative z-10 m-0 w-full max-w-md rounded-lg border border-[#2a2e39] bg-[#1e222d] p-0 text-[#d1d4dc] shadow-2xl shadow-black/50"
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
        </div>
      ) : null}
    </>
  );
}
