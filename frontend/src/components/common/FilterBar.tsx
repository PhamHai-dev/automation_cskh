import React, { ReactNode, useState } from 'react';
import { ChevronDown, Filter, RotateCcw, X } from 'lucide-react';
import { Button } from '../ui/Button';

export type FilterChipTone = 'neutral' | 'kaiwa' | 'jlpt' | 'warning';

export interface ActiveFilterChip {
  id: string;
  label: string;
  value?: string;
  tone?: FilterChipTone;
  onRemove: () => void;
}

export interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  className?: string;
  clearLabel?: string;
  onClear?: () => void;
}

const chipToneClasses: Record<FilterChipTone, string> = {
  neutral: 'border-border bg-surface text-text-secondary',
  kaiwa: 'border-teal-200 bg-teal-50 text-teal-800',
  jlpt: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

export const ActiveFilterChips: React.FC<ActiveFilterChipsProps> = ({
  chips,
  className = '',
  clearLabel = 'Xóa tất cả',
  onClear,
}) => {
  if (chips.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Điều kiện lọc đang áp dụng">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className={`inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-2xs ${
            chipToneClasses[chip.tone || 'neutral']
          }`}
        >
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide opacity-70">
            {chip.label}
          </span>
          {chip.value && <span className="truncate font-bold">{chip.value}</span>}
          <button
            id={`remove-filter-${chip.id.replace(/[^a-zA-Z0-9-_]/g, '-')}`}
            type="button"
            onClick={chip.onRemove}
            className="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-black/5 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label={`Xóa bộ lọc ${chip.label}${chip.value ? `: ${chip.value}` : ''}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      {onClear && chips.length > 1 && (
        <button
          id="clear-all-active-filters"
          type="button"
          onClick={onClear}
          className="h-8 px-2 text-xs font-bold text-text-muted transition hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
};

export const LearningActiveFilters: React.FC<ActiveFilterChipsProps> = ({ chips, onClear }) => {
  return (
    <div className="learning-filter-active" data-filter-row="active">
      <div className="learning-filter-active-content">
        <span className="text-xs font-semibold text-text-secondary">Đang áp dụng:</span>
        {chips.length > 0 ? <ActiveFilterChips chips={chips} /> : (
          <span className="text-xs text-text-muted">Chưa áp dụng bộ lọc</span>
        )}
      </div>
      {onClear && (
        <Button id="learning-clear-filters" type="button" variant="ghost" size="sm" onClick={onClear} disabled={chips.length === 0}
          leftIcon={<RotateCcw className="h-3.5 w-3.5" />} className="shrink-0 text-xs text-text-muted hover:text-danger">
          Xóa tất cả
        </Button>
      )}
    </div>
  );
};

export interface FilterBarProps {
  children: ReactNode;
  className?: string;
  gridClassName?: string;
  title?: string;
  description?: string;
  resultSummary?: ReactNode;
  chips?: ActiveFilterChip[];
  onReset?: () => void;
  onClear?: () => void;
  hasActiveFilters?: boolean;
  activeCount?: number;
  collapsibleOnMobile?: boolean;
  defaultMobileExpanded?: boolean;
  variant?: 'card' | 'toolbar' | 'learning';
  viewControls?: ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  children,
  className = '',
  gridClassName = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end',
  title = 'Bộ lọc dữ liệu',
  description,
  resultSummary,
  chips = [],
  onReset,
  onClear,
  hasActiveFilters = false,
  activeCount = 0,
  collapsibleOnMobile = false,
  defaultMobileExpanded = false,
  variant = 'card',
  viewControls,
}) => {
  const [mobileExpanded, setMobileExpanded] = useState(defaultMobileExpanded);
  const resetFn = onClear || onReset;
  const semanticActiveCount = chips.length > 0 ? chips.length : activeCount;
  const showReset = Boolean(resetFn && (hasActiveFilters || semanticActiveCount > 0));

  if (variant === 'learning') {
    return (
      <section className={`learning-filter-panel shadow-soft ${className}`} aria-label="Tìm kiếm & Bộ lọc">
        <div className="learning-filter-heading">
          <h2 className="text-text-primary"><Filter className="h-4 w-4 text-primary" aria-hidden="true" />Tìm kiếm & Bộ lọc</h2>
          {resultSummary && <span className="text-xs font-semibold text-text-muted">{resultSummary}</span>}
        </div>
        <div className="learning-filter-row" data-filter-row="conditions">{children}</div>
        {viewControls && <div className="learning-filter-row learning-filter-display" data-filter-row="display">{viewControls}</div>}
        <LearningActiveFilters chips={chips} onClear={resetFn} />
      </section>
    );
  }

  if (variant === 'toolbar') {
    return (
      <section
        className={`mb-3 rounded-2xl border border-border/80 bg-surface p-3 shadow-soft transition-all ${className}`}
        aria-label={title}
      >
        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
          {children}
          {resultSummary && (
            <div className="ml-auto hidden shrink-0 text-xs font-semibold text-text-muted 2xl:block">
              {resultSummary}
            </div>
          )}
          {showReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFn}
              className="h-9 shrink-0 px-2.5 text-xs text-text-muted hover:text-danger"
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              <span className="hidden 2xl:inline">Xóa lọc</span>
            </Button>
          )}
        </div>
        <ActiveFilterChips chips={chips} onClear={resetFn} className="mt-3 border-t border-border/60 pt-3" />
      </section>
    );
  }

  return (
    <section
      className={`mb-6 rounded-2xl border border-border/80 bg-surface p-4 shadow-soft transition-all sm:p-5 ${className}`}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-secondary">
            <Filter className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>{title}</span>
            {semanticActiveCount > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                {semanticActiveCount} đang áp dụng
              </span>
            )}
          </div>
          {description && <p className="mt-1.5 text-xs text-text-muted">{description}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {resultSummary && <div className="hidden text-xs font-semibold text-text-muted lg:block">{resultSummary}</div>}
          {showReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFn}
              className="h-7 px-2 text-xs text-text-muted hover:text-text-primary"
              leftIcon={<RotateCcw className="h-3 w-3" />}
            >
              <span className="hidden sm:inline">Xóa bộ lọc</span>
              <span className="sm:hidden">Xóa</span>
            </Button>
          )}
          {collapsibleOnMobile && (
            <button
              id="toggle-mobile-filters"
              type="button"
              onClick={() => setMobileExpanded((value) => !value)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs font-bold text-text-secondary transition hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:hidden"
              aria-expanded={mobileExpanded}
              aria-controls="filter-bar-content"
            >
              {mobileExpanded ? 'Thu gọn' : 'Mở lọc'}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${mobileExpanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </div>

      <div
        id="filter-bar-content"
        className={`${collapsibleOnMobile && !mobileExpanded ? 'hidden sm:block' : 'block'} pt-3`}
      >
        <div className={gridClassName}>{children}</div>
      </div>

      <ActiveFilterChips chips={chips} onClear={resetFn} className="mt-3 border-t border-border/60 pt-3" />
    </section>
  );
};
