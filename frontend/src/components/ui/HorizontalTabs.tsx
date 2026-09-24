import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';

export interface HorizontalTabItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  panelId?: string;
}

interface HorizontalTabsProps<T extends string> {
  items: HorizontalTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  sm: 'px-3 py-2 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-xs sm:text-sm gap-2',
};

export function HorizontalTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className = '',
}: HorizontalTabsProps<T>) {
  const generatedId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabledIndexes = items
    .map((item, index) => (!item.disabled ? index : -1))
    .filter((index) => index >= 0);

  const focusTab = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    onChange(item.value);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const enabledPosition = enabledIndexes.indexOf(currentIndex);
    if (event.key === 'Home') return focusTab(enabledIndexes[0]);
    if (event.key === 'End') return focusTab(enabledIndexes[enabledIndexes.length - 1]);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const nextPosition = (enabledPosition + offset + enabledIndexes.length) % enabledIndexes.length;
    focusTab(enabledIndexes[nextPosition]);
  };

  return (
    <div className={`max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="inline-flex min-w-max items-center gap-1 rounded-xl border border-border/80 bg-surface-muted/80 p-1 shadow-xs"
      >
        {items.map((item, index) => {
          const isActive = item.value === value;
          const tabId = `${generatedId}-${item.value}-tab`;
          const panelId = item.panelId ?? `${generatedId}-${item.value}-panel`;
          return (
            <button
              key={item.value}
              ref={(node) => { tabRefs.current[index] = node; }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`inline-flex shrink-0 items-center justify-center rounded-lg border font-semibold outline-none transition-[color,background-color,box-shadow,border-color,transform] duration-150 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses[size]} ${
                isActive
                  ? 'border-border/70 bg-surface text-primary shadow-sm'
                  : 'border-transparent text-text-secondary hover:bg-surface/70 hover:text-text-primary'
              }`}
            >
              {item.icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>}
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${isActive ? 'bg-primary-soft text-primary' : 'bg-surface text-text-muted'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
