import React from 'react';
import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/ui/Badge';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

const ROLE_DISPLAY_NAMES: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'neutral' | 'accent' }> = {
  ADMIN: { label: 'Quản trị viên', variant: 'danger' as any },
  MANAGE: { label: 'Quản lý nhóm', variant: 'warning' },
  CS: { label: 'Nhân viên CSKH', variant: 'info' },
  TEACHER: { label: 'Giáo viên', variant: 'accent' },
};

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, sidebarOpen }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) {
      await logout();
      navigate('/login');
    }
  };

  const primaryRole = user?.roles?.[0] || 'CS';
  const roleConfig = ROLE_DISPLAY_NAMES[primaryRole] || { label: primaryRole, variant: 'neutral' };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="h-16 bg-surface/90 backdrop-blur-md border-b border-border/80 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between">
      {/* Sidebar Open/Toggle Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className={`p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors ${
            sidebarOpen ? 'lg:hidden' : 'flex'
          }`}
          aria-label="Mở thanh điều hướng"
          title="Mở thanh điều hướng"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* User Actions */}
      <div className="flex items-center gap-3 sm:gap-4">
        {user && (
          <div className="flex items-center gap-2.5 pl-3 border-l border-border/60">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-blue-400 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {getInitials(user.name)}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-bold text-text-primary leading-tight">
                {user.name}
              </span>
              <span className="text-[10px] text-text-muted">{user.email}</span>
            </div>
            <Badge variant={roleConfig.variant} size="sm" className="hidden md:inline-flex">
              {roleConfig.label}
            </Badge>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-text-secondary hover:text-danger hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-100"
          title="Đăng xuất"
        >
          <LogOut className="w-4 h-4 text-text-muted group-hover:text-danger" />
          <span className="hidden sm:inline">Đăng xuất</span>
        </button>
      </div>
    </header>
  );
};
