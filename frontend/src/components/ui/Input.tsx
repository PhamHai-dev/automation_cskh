import React, { InputHTMLAttributes, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelClassName?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, labelClassName, error, helperText, leftIcon, rightIcon, disabled, id, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className={`block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5 ${labelClassName || ''}`}>
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-text-muted pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            className={`flex h-10 w-full rounded-xl border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted ${
              leftIcon ? 'pl-9' : ''
            } ${rightIcon || error ? 'pr-9' : ''} ${
              error
                ? 'border-danger focus:border-danger focus:ring-danger/20 text-danger'
                : 'border-border hover:border-slate-300'
            } ${className}`}
            {...props}
          />
          {rightIcon && !error && (
            <div className="absolute right-3 text-text-muted flex items-center">
              {rightIcon}
            </div>
          )}
          {error && (
            <div className="absolute right-3 text-danger pointer-events-none flex items-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-danger flex items-center gap-1">{error}</p>}
        {helperText && !error && <p className="mt-1.5 text-xs text-text-muted">{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
