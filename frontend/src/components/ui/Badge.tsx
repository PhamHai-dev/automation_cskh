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
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/80',
    danger: 'bg-rose-50 text-rose-700 border-rose-200/80',
    info: 'bg-blue-50 text-blue-700 border-blue-200/80',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200/80',
    accent: 'bg-teal-50 text-teal-700 border-teal-200/80',
    debt: 'bg-red-100 text-red-800 border-red-300 font-bold',
  };

  const dotColors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-blue-500',
    neutral: 'bg-slate-400',
    accent: 'bg-teal-500',
    debt: 'bg-red-600',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[11px] gap-1',
    md: 'px-2.5 py-0.5 text-xs gap-1.5',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />}
      {children}
    </span>
  );
};
