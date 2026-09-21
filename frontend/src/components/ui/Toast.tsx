import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
}

interface ToastContextType {
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, title?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setToasts((prev) => [...prev, { id, type, message, title }]);
      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  const toast = {
    success: (msg: string, title?: string) => addToast('success', msg, title),
    error: (msg: string, title?: string) => addToast('error', msg, title),
    warning: (msg: string, title?: string) => addToast('warning', msg, title),
    info: (msg: string, title?: string) => addToast('info', msg, title),
  };

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
  };

  const borderColors = {
    success: 'border-emerald-200 bg-white shadow-emerald-500/10',
    error: 'border-rose-200 bg-white shadow-rose-500/10',
    warning: 'border-amber-200 bg-white shadow-amber-500/10',
    info: 'border-blue-200 bg-white shadow-blue-500/10',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-soft-lg ${borderColors[t.type]} transition-all transform animate-in slide-in-from-bottom-5 duration-200`}
            role="alert"
          >
            {icons[t.type]}
            <div className="flex-1 min-w-0">
              {t.title && <p className="text-xs font-bold text-text-primary mb-0.5">{t.title}</p>}
              <p className="text-xs font-medium text-text-secondary leading-relaxed break-words">{t.message}</p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-text-muted hover:text-text-primary p-0.5 rounded transition shrink-0"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
};
