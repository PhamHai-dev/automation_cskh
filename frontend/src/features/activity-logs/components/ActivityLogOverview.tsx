import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { Card } from '../../../components/ui/Card';

export interface ActivityMetric {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
}

const toneClasses = {
  primary: 'bg-primary-soft text-primary border-primary-border',
  success: 'bg-success-soft text-success border-success-border',
  warning: 'bg-warning-soft text-warning border-warning-border',
  danger: 'bg-danger-soft text-danger border-danger-border',
};

export function ActivityLogOverview({ metrics }: { metrics: ActivityMetric[] }) {
  return (
    <section aria-label="Tổng quan hoạt động" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        const tone = metric.tone || 'primary';
        return (
          <Card key={metric.label} className="group relative overflow-hidden p-4 sm:p-5">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-blue-400 to-accent opacity-70" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                  {metric.label}
                </p>
                <p className="mt-2 text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">
                  {metric.value}
                </p>
                <p className="mt-1 truncate text-[11px] text-text-secondary sm:text-xs">{metric.helper}</p>
              </div>
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneClasses[tone]}`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <ArrowUpRight className="absolute bottom-3 right-3 h-4 w-4 text-primary/0 transition-all group-hover:-translate-y-0.5 group-hover:text-primary/30" />
          </Card>
        );
      })}
    </section>
  );
}
