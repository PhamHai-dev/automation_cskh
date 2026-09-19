import React from 'react';

export const PageContainer: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  return (
    <div className={`mx-auto max-w-7xl w-full px-4 sm:px-5 lg:px-6 py-6 ${className}`}>
      {children}
    </div>
  );
};
