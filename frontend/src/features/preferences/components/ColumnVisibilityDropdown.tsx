import React, { useEffect, useRef, useState } from 'react';
import { Columns3, RotateCcw, Check } from 'lucide-react';
import { PreferenceScope } from '../columns';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { Button } from '../../../components/ui/Button';

interface ColumnVisibilityDropdownProps {
  scope: PreferenceScope;
}

export const ColumnVisibilityDropdown: React.FC<ColumnVisibilityDropdownProps> = ({ scope }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { columns, draft, dirty, saving, setDraftValue, setAll, resetToDefault, save } =
    useColumnVisibility(scope);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const visibleCount = columns.filter((c) => (c.locked ? true : Boolean(draft[c.key]))).length;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/80 bg-white px-3 text-xs font-bold text-text-primary shadow-2xs transition hover:border-primary/50 hover:bg-primary-soft/20 cursor-pointer whitespace-nowrap"
        title="Chọn các cột hiển thị trên bảng này"
      >
        <Columns3 className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>Cột hiển thị</span>
        <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
          {visibleCount}/{columns.length}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 sm:w-96 rounded-2xl border border-border bg-surface p-3.5 shadow-xl">
          <div className="flex items-center justify-between border-b border-border/70 pb-2.5 mb-2.5">
            <div>
              <div className="text-xs font-extrabold text-text-primary">Tùy chỉnh cột hiển thị</div>
              <div className="text-[11px] text-text-muted">
                Tích chọn cột cần xem rồi bấm Lưu
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setAll(true)}
                className="font-semibold text-primary hover:underline cursor-pointer"
              >
                Hiện hết
              </button>
              <span className="text-border">•</span>
              <button
                type="button"
                onClick={resetToDefault}
                className="inline-flex items-center gap-1 font-semibold text-text-secondary hover:text-text-primary cursor-pointer"
                title="Đặt về bộ cột chuẩn mặc định"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Mặc định</span>
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {columns.map((col) => {
              const checked = col.locked ? true : Boolean(draft[col.key]);
              return (
                <label
                  key={col.key}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs select-none transition ${
                    col.locked
                      ? 'border-border/50 bg-slate-100/70 text-text-muted cursor-not-allowed opacity-75'
                      : checked
                      ? 'border-primary/30 bg-primary-soft/35 text-text-primary font-semibold cursor-pointer hover:bg-primary-soft/60'
                      : 'border-border/60 bg-white text-text-secondary cursor-pointer hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={col.locked}
                    onChange={(e) => !col.locked && setDraftValue(col.key, e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-primary border-slate-300"
                  />
                  <span className="truncate flex-1" title={col.label}>
                    {col.label}
                  </span>
                  {col.locked && (
                    <span className="text-[10px] italic text-text-muted shrink-0">Cố định</span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="mt-3 pt-2.5 border-t border-border/70 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Đóng
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              disabled={!dirty || saving}
              leftIcon={<Check className="h-3.5 w-3.5" />}
              onClick={async () => {
                const ok = await save();
                if (ok) setOpen(false);
              }}
            >
              {saving ? 'Đang lưu...' : 'Lưu áp dụng'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
