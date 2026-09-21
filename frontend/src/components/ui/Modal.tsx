import React, { useEffect, ReactNode } from 'react';
import { X } from 'lucide-react';

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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-[95vw]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={() => closeOnOutsideClick && onClose()}
      />

      {/* Modal Dialog */}
      <div
        className={`relative w-full ${sizeClasses[size]} bg-surface rounded-2xl shadow-soft-lg border border-border overflow-hidden z-10 my-8 transition-all transform scale-100 flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between p-5 sm:p-6 border-b border-border/80 bg-surface">
            <div>
              {title && (
                <h3 className="text-base sm:text-lg font-bold text-text-primary tracking-tight">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-1 text-xs sm:text-sm text-text-muted leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text-primary p-1.5 rounded-lg hover:bg-surface-muted transition-colors ml-4 shrink-0"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-border/80 bg-surface-muted/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
