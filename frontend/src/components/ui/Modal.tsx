import React, { useEffect, useId, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';

const openDialogs: string[] = [];
let previousBodyOverflow = '';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  closeOnOutsideClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOutsideClick = true,
}) => {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const wasOpen = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  closeRef.current = onClose;
  if (isOpen && !wasOpen.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpen.current = isOpen;

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = openerRef.current;
    if (openDialogs.length === 0) previousBodyOverflow = document.body.style.overflow;
    openDialogs.push(dialogId);
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    ) || []).filter(el => el.getClientRects().length > 0 && !el.closest('[hidden], [inert]'));
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== dialogId) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const elements = focusable();
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { e.preventDefault(); dialogRef.current?.focus(); }
        else if (!dialogRef.current?.contains(document.activeElement)) {
          e.preventDefault(); (e.shiftKey ? last : first).focus();
        }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      const index = openDialogs.indexOf(dialogId);
      if (index >= 0) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, dialogId]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-[95vw]',
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex min-w-0 items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={() => closeOnOutsideClick && onClose()}
      />

      {/* Modal Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${dialogId}-title` : undefined}
        aria-label={!title ? 'Hộp thoại' : undefined}
        aria-describedby={description ? `${dialogId}-description` : undefined}
        tabIndex={-1}
        className={`relative min-w-0 w-full ${sizeClasses[size]} bg-surface rounded-2xl shadow-soft-lg border border-border overflow-hidden z-10 outline-none flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || description) && (
          <div className="shrink-0 flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-border/80 bg-surface">
            <div className="min-w-0 break-words">
              {title && (
                <h3 id={`${dialogId}-title`} className="text-base sm:text-lg font-bold text-text-primary tracking-tight">
                  {title}
                </h3>
              )}
              {description && (
                <p id={`${dialogId}-description`} className="mt-1 text-xs sm:text-sm text-text-muted leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 min-w-0 p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 p-4 sm:p-5 border-t border-border/80 bg-surface-muted/50 [&>.flex]:flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>, document.body
  );
};
