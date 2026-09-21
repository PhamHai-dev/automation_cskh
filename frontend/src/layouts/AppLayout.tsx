import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-text-primary antialiased">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block shrink-0 h-full">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
          />
        </div>

        {/* Mobile / Tablet Drawer Backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Mobile / Tablet Drawer */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface shadow-soft-lg transform transition-transform duration-300 ease-in-out lg:hidden ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar
            collapsed={false}
            onToggleCollapse={() => {}}
            onMobileClose={() => setMobileOpen(false)}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <Header onMobileMenuOpen={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    );
  };
