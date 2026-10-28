import React, { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { HomeKpiMetric } from '../../types/home.types';
import { Sparkline } from './Sparkline';

export type KpiTone = 'blue' | 'emerald' | 'violet' | 'amber';

const TONE_CONFIG: Record<KpiTone, { icon: string; line: string; fill: string }> = {
  blue: { icon: 'bg-blue-50 text-blue-600', line: '#2563eb', fill: 'rgba(37, 99, 235, 0.12)' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', line: '#10b981', fill: 'rgba(16, 185, 129, 0.12)' },
  violet: { icon: 'bg-violet-50 text-violet-600', line: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.12)' },
  amber: { icon: 'bg-amber-50 text-amber-600', line: '#f59e0b', fill: 'rgba(245, 158, 11, 0.14)' },
};

interface HomeKpiCardProps {
  label: string;
  icon: ReactNode;
  tone: KpiTone;
  metric?: HomeKpiMetric;
  /** Number of decimals to render (e.g. percentage KPIs use 1) */
  decimals?: number;
  suffix?: string;
  /** When `false`, a rising value is bad (e.g. more pending tasks) */
  higherIsBetter?: boolean;
}

const formatNumber = (value: number, decimals: number) =>
  new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

export const HomeKpiCard: React.FC<HomeKpiCardProps> = ({
  label,
  icon,
  tone,
  metric,
  decimals = 0,
  suffix = '',
  higherIsBetter = true,
}) => {
  const cfg = TONE_CONFIG[tone];
  const value = typeof metric?.value === 'number' ? metric.value : 0;
  const delta = typeof metric?.delta === 'number' ? metric.delta : 0;
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const isGood = (isPositive && higherIsBetter) || (isNegative && !higherIsBetter);

  const deltaText = `${isPositive ? '+' : ''}${formatNumber(delta, metric?.delta_unit === 'percent' ? 1 : 0)}${
    metric?.delta_unit === 'percent' ? '%' : ''
  }`;

  const deltaColor = delta === 0 ? 'text-text-muted' : isGood ? 'text-emerald-600' : 'text-rose-600';

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-soft p-4 sm:p-5 flex flex-col gap-3 hover:shadow-soft-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.icon}`}>
            {icon}
          </span>
          <span className="text-xs font-semibold text-text-secondary leading-tight">{label}</span>
        </div>
        <Sparkline
          points={metric?.sparkline || []}
          color={cfg.line}
          fillColor={cfg.fill}
          width={90}
          height={36}
          className="shrink-0"
        />
      </div>

      <div>
        <div className="text-2xl sm:text-[28px] font-extrabold text-text-primary tracking-tight leading-none">
          {formatNumber(value, decimals)}
          {suffix && <span className="text-lg font-bold ml-0.5">{suffix}</span>}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] leading-tight">
          {delta === 0 ? (
            <span className="text-text-muted font-medium">Không thay đổi</span>
          ) : (
            <>
              <span className={`inline-flex items-center gap-1 font-bold ${deltaColor}`}>
                {isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {deltaText}
              </span>
              <span className="text-text-muted truncate">
                {metric?.comparison_label || 'so với kỳ trước'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
