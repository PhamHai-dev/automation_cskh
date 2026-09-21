import React, { ReactNode } from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';

export interface FilterBarProps {
  children: ReactNode;
  className?: string;
  title?: string;
  onReset?: () => void;
  onClear?: () => void;
  hasActiveFilters?: boolean;
  activeCount?: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  children,
  className = '',
  title = 'Bộ lọc dữ liệu',
  onReset,
  onClear,
  hasActiveFilters = false,
  activeCount = 0,
}) => {
  const resetFn = onClear || onReset;
  const showReset = Boolean(resetFn && (hasActiveFilters || activeCount > 0));

  return (
    <div
      className={`mb-6 bg-surface p-4 sm:p-5 rounded-2xl border border-border/80 shadow-soft transition-all ${className}`}
    >
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/60">
        <div className="flex items-center gap-2 text-xs font-bold text-text-secondary uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <span>{title}</span>
          {activeCount > 0 && (
            <span className="ml-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
              {activeCount} đang áp dụng
            </span>
          )}
        </div>
        {showReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFn}
            className="text-xs text-text-muted hover:text-text-primary h-7 px-2"
            leftIcon={<RotateCcw className="w-3 h-3" />}
          >
            Xóa bộ lọc
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
        {children}
      </div>
    </div>
  );
};
