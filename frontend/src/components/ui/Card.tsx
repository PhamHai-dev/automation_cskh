import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  className = '',
  hoverable = false,
  children,
  ...props
}) => {
  return (
    <div
      className={`rounded-2xl border border-border/80 bg-surface shadow-soft transition-all duration-200 ${
        hoverable ? 'hover:shadow-soft-md hover:border-slate-300 -translate-y-0.5' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`flex flex-col space-y-1.5 p-5 sm:p-6 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <h3
      className={`font-semibold tracking-tight text-text-primary text-base sm:text-lg ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p className={`text-xs sm:text-sm text-text-muted leading-relaxed ${className}`} {...props}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-5 sm:p-6 pt-0 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`flex items-center p-5 sm:p-6 pt-0 border-t border-border/60 mt-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
