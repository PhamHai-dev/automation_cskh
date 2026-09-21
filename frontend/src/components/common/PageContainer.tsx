import React from 'react';

export const PageContainer: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`mx-auto max-w-[1600px] w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-7 ${className}`}>
      {children}
    </div>
  );
};
