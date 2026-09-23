import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleToggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setMobileOpen((prev) => !prev);
    } else {
      setSidebarOpen((prev) => {
        const next = !prev;
        localStorage.setItem('sidebar_open', String(next));
        return next;
      });
    }
  };

  const handleCloseDesktopSidebar = () => {
    setSidebarOpen(false);
    localStorage.setItem('sidebar_open', 'false');
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-text-primary antialiased">
      {/* Desktop Sidebar — animate both its footprint and panel movement. */}
      <div
        className={`hidden lg:block shrink-0 h-full overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          sidebarOpen ? 'w-64' : 'w-0'
        }`}
        aria-hidden={!sidebarOpen}
      >
        <div
          className={`w-64 h-full transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            sidebarOpen
              ? 'translate-x-0 opacity-100'
              : '-translate-x-5 opacity-0 pointer-events-none'
          }`}
        >
          <Sidebar onClose={handleCloseDesktopSidebar} />
        </div>
      </div>

      {/* Mobile / Tablet Drawer Backdrop — kept mounted for a smooth fade-out. */}
      <div
        className={`fixed inset-0 bg-slate-950/45 backdrop-blur-[2px] z-40 lg:hidden transition-[opacity,backdrop-filter] duration-300 ease-out motion-reduce:transition-none ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile / Tablet Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface shadow-soft-lg transform-gpu transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none lg:hidden ${
          mobileOpen
            ? 'translate-x-0 opacity-100'
            : '-translate-x-full opacity-95 pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
      >
        <Sidebar
          onClose={() => setMobileOpen(false)}
          onMobileClose={() => setMobileOpen(false)}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header onToggleSidebar={handleToggleSidebar} sidebarOpen={sidebarOpen} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
