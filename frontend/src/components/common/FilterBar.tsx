import React from 'react';

export const FilterBar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  return (
    <div className={`mb-6 flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
};
