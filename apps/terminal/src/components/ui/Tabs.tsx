import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export type TabItem = {
  id: string;
  label: string;
  content: ComponentChildren;
  disabled?: boolean;
};

export type TabsProps = {
  tabs: readonly TabItem[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
};

export function Tabs({ tabs, defaultValue, value, onChange, id = 'tradingview-tabs' }: TabsProps) {
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? tabs.find((tab) => !tab.disabled)?.id ?? '',
  );
  const selectedValue = value ?? internalValue;
  const selectedTab = tabs.find((tab) => tab.id === selectedValue) ?? tabs[0];

  const selectTab = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  const enabledTabs = tabs.filter((tab) => !tab.disabled);

  const handleKeyDown = (event: KeyboardEvent) => {
    const currentIndex = enabledTabs.findIndex(
      (tab) => `${id}-tab-${tab.id}` === (event.target as HTMLElement).id,
    );
    if (currentIndex < 0 || enabledTabs.length === 0) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % enabledTabs.length;
    else if (event.key === 'ArrowLeft')
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = enabledTabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = enabledTabs[nextIndex];
    if (!nextTab) return;
    selectTab(nextTab.id);
    document.getElementById(`${id}-tab-${nextTab.id}`)?.focus();
  };

  return (
    <div class="min-w-0">
      <div
        id={id}
        role="tablist"
        aria-label="Secciones"
        onKeyDown={handleKeyDown}
        class="flex min-w-0 items-center gap-1 border-b border-[#2a2e39]"
      >
        {tabs.map((tab) => {
          const selected = tab.id === selectedValue;
          return (
            <button
              key={tab.id}
              id={`${id}-tab-${tab.id}`}
              type="button"
              role="tab"
              data-tab-value={tab.id}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => selectTab(tab.id)}
              class={[
                'relative -mb-px inline-flex h-9 items-center px-3 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#2962ff]',
                'disabled:cursor-not-allowed disabled:opacity-40',
                selected
                  ? 'border-b-2 border-[#2962ff] text-[#d1d4dc]'
                  : 'border-b-2 border-transparent text-[#787b86] hover:text-[#b2b5be]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {selectedTab ? (
        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${selectedTab.id}`}
          class="min-w-0 py-3 text-sm text-[#b2b5be]"
        >
          {selectedTab.content}
        </div>
      ) : null}
    </div>
  );
}
