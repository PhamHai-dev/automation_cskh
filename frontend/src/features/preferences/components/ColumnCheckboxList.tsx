import React from 'react';
import { ColumnMeta } from '../columns';

interface ColumnCheckboxListProps {
  columns: ColumnMeta[];
  draft: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export const ColumnCheckboxList: React.FC<ColumnCheckboxListProps> = ({
  columns,
  draft,
  onToggle,
  onSelectAll,
  onDeselectAll,
}) => {
  const visibleCount = columns.filter((c) => !c.locked && draft[c.key] !== false && (draft[c.key] !== undefined ? draft[c.key] : true)).length;
  const toggleableCount = columns.filter((c) => !c.locked).length;

  return (
    <div>
      {/* Bulk actions */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onSelectAll}
          className="text-xs font-semibold text-primary hover:text-primary/80 underline-offset-2 hover:underline transition"
        >
          Chọn tất cả
        </button>
        <span className="text-text-muted text-xs">•</span>
        <button
          type="button"
          onClick={onDeselectAll}
          className="text-xs font-semibold text-text-secondary hover:text-text-primary underline-offset-2 hover:underline transition"
        >
          Bỏ chọn tất cả
        </button>
        <span className="ml-auto text-xs text-text-muted font-medium">
          {visibleCount}/{toggleableCount} cột hiển thị
        </span>
      </div>

      {/* Column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {columns.map((col) => {
          const isChecked = col.locked ? true : (draft[col.key] ?? true);
          return (
            <label
              key={col.key}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all cursor-pointer select-none ${
                col.locked
                  ? 'border-border/50 bg-surface-muted/50 cursor-not-allowed opacity-70'
                  : isChecked
                  ? 'border-primary/30 bg-primary-soft/40 hover:bg-primary-soft/60'
                  : 'border-border/60 bg-surface hover:bg-surface-muted/60'
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={col.locked}
                onChange={(e) => !col.locked && onToggle(col.key, e.target.checked)}
                className="w-3.5 h-3.5 rounded text-primary accent-primary border-slate-300 focus:ring-primary disabled:cursor-not-allowed"
                aria-label={col.label}
              />
              <span className={`text-xs font-medium flex-1 ${col.locked ? 'text-text-muted' : 'text-text-primary'}`}>
                {col.label}
              </span>
              {col.locked && (
                <span className="text-[10px] text-text-muted italic">(luôn hiện)</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
};
