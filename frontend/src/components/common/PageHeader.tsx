import React, { ReactNode } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  backUrl?: string;
  onBack?: () => void;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  breadcrumbs,
  backUrl,
  onBack,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) onBack();
    else if (backUrl) navigate(backUrl);
    else navigate(-1);
  };

  return (
    <div className="page-header min-w-0 mb-6">
      {/* Breadcrumbs or Back Button */}
      {(breadcrumbs || backUrl || onBack) && (
        <div className="flex items-center gap-2 mb-2.5 text-xs text-text-muted">
          {(backUrl || onBack) && (
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1 font-semibold text-text-secondary hover:text-primary transition-colors py-0.5 px-1.5 rounded-lg hover:bg-surface-muted"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại</span>
            </button>
          )}

          {breadcrumbs && (
            <nav className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              {breadcrumbs.map((item, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={idx}>
                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
                    {item.href && !isLast ? (
                      <Link
                        to={item.href}
                        className="hover:text-primary transition-colors truncate max-w-[150px] sm:max-w-none"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className={`truncate max-w-[200px] sm:max-w-none ${isLast ? 'font-semibold text-text-primary' : ''}`}>
                        {item.label}
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          )}
        </div>
      )}

      {/* Title & Actions Row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 basis-64 min-w-0">
          <h1 className="break-words text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-3xl text-xs sm:text-sm leading-relaxed text-text-muted">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="page-header-actions flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
