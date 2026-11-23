import React, { ReactNode, useEffect, useId, useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../ui/Button';

export interface AdvancedFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  activeCount?: number;
  onReset?: () => void;
  onApply?: () => void;
  applyLabel?: string;
  footer?: ReactNode;
}

export const AdvancedFilterDrawer: React.FC<AdvancedFilterDrawerProps> = ({
  open,
  onClose,
  children,
  title = 'Bộ lọc nâng cao',
  description = 'Chọn các điều kiện phù hợp để thu hẹp kết quả.',
  activeCount = 0,
  onReset,
  onApply,
  applyLabel = 'Áp dụng',
  footer,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Đóng bộ lọc nâng cao"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[920px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl outline-none sm:max-h-[92vh] sm:w-[92vw]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/70 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="text-base font-bold text-text-primary">{title}</h2>
                {activeCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-black text-white">
                    {activeCount}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-text-muted">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-muted hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Đóng bộ lọc nâng cao"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-surface px-4 py-3 sm:px-5">
          <div>
            {onReset && activeCount > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={onReset}>Xóa tất cả</Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {footer}
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Hủy</Button>
            <Button type="button" variant="primary" size="sm" onClick={onApply || onClose}>{applyLabel}</Button>
          </div>
        </footer>
      </div>
    </div>
  );
};
