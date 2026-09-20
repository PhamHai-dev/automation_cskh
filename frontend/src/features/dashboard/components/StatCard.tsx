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
  color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo';
}

const COLOR_CLASSES: Record<string, { bg: string; text: string; iconBg: string }> = {
  blue: { bg: 'bg-blue-50/60', text: 'text-blue-700', iconBg: 'bg-blue-100 text-blue-600' },
  emerald: { bg: 'bg-emerald-50/60', text: 'text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-600' },
  amber: { bg: 'bg-amber-50/60', text: 'text-amber-700', iconBg: 'bg-amber-100 text-amber-600' },
  rose: { bg: 'bg-rose-50/60', text: 'text-rose-700', iconBg: 'bg-rose-100 text-rose-600' },
  indigo: { bg: 'bg-indigo-50/60', text: 'text-indigo-700', iconBg: 'bg-indigo-100 text-indigo-600' },
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
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</span>
        {icon && <div className={`p-2 rounded-lg ${scheme.iconBg}`}>{icon}</div>}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl lg:text-3xl font-bold text-gray-900">{value}</span>
        {trend && (
          <span
            className={`text-xs font-semibold ${
              trend.isPositive ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>

      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
};
