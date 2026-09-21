import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'teal';
}

const COLOR_CLASSES: Record<string, { bgGradient: string; text: string; iconBg: string; border: string }> = {
  blue: {
    bgGradient: 'from-blue-500/10 via-transparent to-transparent',
    text: 'text-blue-600',
    iconBg: 'bg-blue-100 text-blue-700 ring-4 ring-blue-50',
    border: 'border-blue-100',
  },
  emerald: {
    bgGradient: 'from-emerald-500/10 via-transparent to-transparent',
    text: 'text-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700 ring-4 ring-emerald-50',
    border: 'border-emerald-100',
  },
  amber: {
    bgGradient: 'from-amber-500/10 via-transparent to-transparent',
    text: 'text-amber-600',
    iconBg: 'bg-amber-100 text-amber-700 ring-4 ring-amber-50',
    border: 'border-amber-100',
  },
  rose: {
    bgGradient: 'from-rose-500/10 via-transparent to-transparent',
    text: 'text-rose-600',
    iconBg: 'bg-rose-100 text-rose-700 ring-4 ring-rose-50',
    border: 'border-rose-100',
  },
  indigo: {
    bgGradient: 'from-indigo-500/10 via-transparent to-transparent',
    text: 'text-indigo-600',
    iconBg: 'bg-indigo-100 text-indigo-700 ring-4 ring-indigo-50',
    border: 'border-indigo-100',
  },
  teal: {
    bgGradient: 'from-teal-500/10 via-transparent to-transparent',
    text: 'text-teal-600',
    iconBg: 'bg-teal-100 text-teal-700 ring-4 ring-teal-50',
    border: 'border-teal-100',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = 'blue',
}) => {
  const scheme = COLOR_CLASSES[color] || COLOR_CLASSES.blue;

  return (
    <div className={`relative bg-white rounded-2xl border border-slate-200/80 p-5 shadow-soft hover:shadow-md transition-all duration-200 overflow-hidden group`}>
      {/* Decorative gradient highlight */}
      <div className={`absolute -top-12 -right-12 w-28 h-28 rounded-full bg-gradient-to-br ${scheme.bgGradient} blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none`} />

      <div className="flex items-center justify-between gap-2 mb-3 relative z-10">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        {icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 duration-200 ${scheme.iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2 relative z-10">
        <span className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">{value}</span>
        {trend && (
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              trend.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>

      {subtitle && <p className="text-xs text-slate-500 mt-1.5 line-clamp-1 relative z-10">{subtitle}</p>}
    </div>
  );
};
