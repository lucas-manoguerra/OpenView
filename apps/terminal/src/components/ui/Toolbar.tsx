import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';

export type ToolbarItem = {
  id: string;
  label: string;
  icon: IconName;
  shortcut?: string;
  disabled?: boolean;
};

export type ToolbarGroup = {
  id: string;
  label: string;
  items: readonly ToolbarItem[];
};

export type ToolbarProps = {
  groups: readonly ToolbarGroup[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  orientation?: 'horizontal' | 'vertical';
  size?: 'small' | 'medium';
};

export function Toolbar({
  groups,
  value,
  onChange,
  label = 'Herramientas',
  orientation = 'horizontal',
  size = 'small',
}: ToolbarProps) {
  const handleKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    const toolbarElement = event.currentTarget as HTMLDivElement;
    const horizontal = orientation === 'horizontal';
    const previousKey = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (![previousKey, nextKey, 'Home', 'End'].includes(keyboardEvent.key)) return;

    const buttons = Array.from(
      toolbarElement.querySelectorAll<HTMLButtonElement>(
        'button[data-toolbar-item]:not(:disabled)',
      ),
    );
    if (buttons.length === 0) return;

    const current = (keyboardEvent.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-toolbar-item]',
    );
    const currentIndex = current ? buttons.indexOf(current) : -1;
    let nextIndex = currentIndex;

    if (keyboardEvent.key === 'Home') nextIndex = 0;
    else if (keyboardEvent.key === 'End') nextIndex = buttons.length - 1;
    else if (keyboardEvent.key === nextKey) nextIndex = (currentIndex + 1) % buttons.length;
    else if (keyboardEvent.key === previousKey) {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    }

    keyboardEvent.preventDefault();
    buttons[nextIndex]?.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label={label}
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
      class={[
        'inline-flex rounded-md border border-[#2a2e39] bg-[#131722] p-1',
        orientation === 'horizontal' ? 'flex-row items-center' : 'flex-col items-center',
      ].join(' ')}
    >
      {groups.map((group, index) => (
        <div key={group.id} class="contents">
          <fieldset
            aria-label={group.label}
            class={[
              'flex',
              orientation === 'horizontal' ? 'flex-row items-center gap-0.5' : 'flex-col gap-0.5',
            ].join(' ')}
          >
            {group.items.map((item) => {
              const active = value === item.id;
              return (
                <Tooltip
                  key={item.id}
                  content={item.shortcut ? `${item.label} · ${item.shortcut}` : item.label}
                  side={orientation === 'horizontal' ? 'top' : 'right'}
                >
                  <IconButton
                    label={item.label}
                    size={size}
                    active={active}
                    disabled={item.disabled}
                    data-toolbar-item
                    data-testid={`toolbar-item-${item.id}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => onChange(item.id)}
                  >
                    <Icon name={item.icon} size="small" />
                  </IconButton>
                </Tooltip>
              );
            })}
          </fieldset>
          {index < groups.length - 1 ? (
            <span
              aria-hidden="true"
              class={
                orientation === 'horizontal'
                  ? 'mx-1 h-5 w-px bg-[#2a2e39]'
                  : 'my-1 h-px w-5 bg-[#2a2e39]'
              }
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
