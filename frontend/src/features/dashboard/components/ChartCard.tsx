import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface ChartCardProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  onExport?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  description,
  actions,
  onExport,
  children,
  className = '',
}) => {
  return (
    <div className={`bg-white rounded-2xl border border-border/80 shadow-soft p-5 ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h4 className="font-semibold text-text-primary text-sm sm:text-base">{title}</h4>
          {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport} leftIcon={<Download className="w-3.5 h-3.5" />}>
              <span className="hidden sm:inline">CSV</span>
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
};
