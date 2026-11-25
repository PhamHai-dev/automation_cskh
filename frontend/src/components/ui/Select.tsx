import React, { SelectHTMLAttributes, ReactNode } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, helperText, leftIcon, options, children, disabled, id, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id || `select-${generatedId}`;

    return (
      <div className="ui-field min-w-0 w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            {label}
          </label>
        )}
        <div className="relative min-w-0 flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-text-muted pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}
          <select
            id={selectId}
            ref={ref}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || helperText ? `${selectId}-feedback` : undefined}
            className={`flex h-10 min-w-0 w-full appearance-none rounded-xl border bg-surface px-3 py-2 text-sm text-text-primary transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted pr-10 ${
              leftIcon ? 'pl-9' : ''
            } ${
              error
                ? 'border-danger focus:border-danger focus:ring-danger/20 text-danger'
                : 'border-border hover:border-border-strong'
            } ${className}`}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div className="absolute right-3 text-text-muted pointer-events-none flex items-center">
            {error ? <AlertCircle className="w-4 h-4 text-danger" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
        {error && <p id={`${selectId}-feedback`} className="mt-1.5 text-xs text-danger flex items-center gap-1">{error}</p>}
        {helperText && !error && <p id={`${selectId}-feedback`} className="mt-1.5 text-xs text-text-muted">{helperText}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
