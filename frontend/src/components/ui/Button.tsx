import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent' | 'soft';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] select-none';

    const variants = {
      primary:
        'bg-primary text-white hover:bg-primary-hover active:bg-primary-active shadow-sm shadow-primary/20 focus-visible:ring-primary',
      accent:
        'bg-accent text-white hover:bg-accent-hover active:bg-accent-active shadow-sm shadow-accent/20 focus-visible:ring-accent',
      secondary:
        'bg-surface-muted text-text-primary hover:bg-slate-200/80 active:bg-slate-300/80 border border-border focus-visible:ring-slate-400',
      outline:
        'border border-border bg-white text-text-secondary hover:bg-surface-muted hover:text-text-primary active:bg-slate-100 focus-visible:ring-primary',
      ghost:
        'bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary active:bg-slate-100 focus-visible:ring-slate-400',
      danger:
        'bg-danger text-white hover:bg-red-600 active:bg-red-700 shadow-sm shadow-danger/20 focus-visible:ring-danger',
      soft:
        'bg-primary-soft text-primary hover:bg-blue-100 border border-primary-border focus-visible:ring-primary',
    };

    const sizes = {
      sm: 'h-8 px-2.5 text-xs gap-1.5',
      md: 'h-9 px-3.5 py-1.5 text-sm gap-2',
      lg: 'h-11 px-5 py-2.5 text-base gap-2.5',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-current" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);
Button.displayName = 'Button';
