import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  HeartHandshake,
  FileCheck2,
  Users,
  GraduationCap,
  Package,
  UserCheck,
  FileSpreadsheet,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onMobileClose?: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  allowedRoles?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  onMobileClose,
}) => {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  const navGroups: NavGroup[] = [
    {
      title: 'TỔNG QUAN',
      items: [
        {
          name: 'Báo cáo Thống kê',
          path: '/dashboard',
          icon: <LayoutDashboard className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
        },
      ],
    },
    {
      title: 'CHĂM SÓC KHÁCH HÀNG',
      items: [
        {
          name: 'Quản lý Ghi danh',
          path: '/enrollments',
          icon: <FileCheck2 className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
        },
        {
          name: 'Danh sách Học viên',
          path: '/students',
          icon: <Users className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
        },
        {
          name: 'Nhiệm vụ & Chăm sóc',
          path: '/care',
          icon: <HeartHandshake className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
        },
      ],
    },
    {
      title: 'ĐÀO TẠO & LỚP HỌC',
      items: [
        {
          name: 'Quản lý Lớp học',
          path: '/classes',
          icon: <GraduationCap className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS', 'TEACHER'],
        },
        {
          name: 'Gói học & Khóa học',
          path: '/packages',
          icon: <Package className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE'],
        },
        {
          name: 'Danh sách Giáo viên',
          path: '/teachers',
          icon: <UserCheck className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE'],
        },
      ],
    },
    {
      title: 'DỮ LIỆU & HỆ THỐNG',
      items: [
        {
          name: 'Nhập & Xuất Excel',
          path: '/imports',
          icon: <FileSpreadsheet className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS', 'TEACHER'],
        },
        {
          name: 'Quản trị Người dùng',
          path: '/settings/users',
          icon: <ShieldCheck className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN'],
        },
      ],
    },
  ];

  const hasPermission = (allowedRoles?: string[]) => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    return userRoles.some((role) => allowedRoles.includes(role));
  };

  return (
    <aside
      className={`h-full bg-surface border-r border-border/80 flex flex-col transition-all duration-300 ease-in-out select-none ${collapsed ? 'w-20' : 'w-64'
        }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border/80 shrink-0">
        <NavLink to="/" className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white shadow-md shadow-primary/20 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <span className="font-bold text-sm text-text-primary tracking-tight">CSKH Automation</span>
              <span className="text-[11px] text-text-muted font-medium">Hệ thống Vận hành</span>
            </div>
          )}
        </NavLink>

        {/* Desktop Collapse Toggle */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex w-7 h-7 rounded-lg border border-border items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
          title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter((item) => hasPermission(item.allowedRoles));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="space-y-1">
              {!collapsed && (
                <div className="px-3 mb-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  {group.title}
                </div>
              )}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onMobileClose}
                  title={collapsed ? item.name : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all duration-150 ${isActive
                      ? 'bg-primary-soft text-primary font-semibold shadow-xs'
                      : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                    } ${collapsed ? 'justify-center px-0' : ''}`
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      {!collapsed && (
        <div className="p-3 border-t border-border/80 bg-surface-subtle/50 text-[11px] text-text-muted flex justify-between items-center">
          <span>v1.0.0 Modular Monolith</span>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Hệ thống hoạt động" />
        </div>
      )}
    </aside>
  );
};
