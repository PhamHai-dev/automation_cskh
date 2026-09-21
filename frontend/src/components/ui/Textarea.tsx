import React, { TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', label, error, helperText, disabled, id, ...props }, ref) => {
    const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          disabled={disabled}
          className={`flex min-h-[80px] w-full rounded-xl border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted ${
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20 text-danger'
              : 'border-border hover:border-slate-300'
          } ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-danger flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </p>
        )}
        {helperText && !error && <p className="mt-1.5 text-xs text-text-muted">{helperText}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
