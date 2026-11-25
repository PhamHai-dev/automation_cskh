import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' | 'debt';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className = '',
  variant = 'neutral',
  size = 'md',
  dot = false,
  children,
  ...props
}) => {
  const variants = {
    success: 'bg-success-soft text-success-foreground border-success-border',
    warning: 'bg-warning-soft text-warning-foreground border-warning-border',
    danger: 'bg-danger-soft text-danger-foreground border-danger-border',
    info: 'bg-info-soft text-info-foreground border-info-border',
    neutral: 'bg-surface-muted text-text-secondary border-border',
    accent: 'bg-accent-soft text-accent-active border-accent-border',
    debt: 'bg-red-100 text-red-800 border-red-300 font-bold',
  };

  const dotColors = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    neutral: 'bg-text-muted',
    accent: 'bg-accent',
    debt: 'bg-red-600',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[11px] gap-1',
    md: 'px-2.5 py-0.5 text-xs gap-1.5',
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap font-medium leading-5 rounded-full border ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />}
      {children}
    </span>
  );
};
