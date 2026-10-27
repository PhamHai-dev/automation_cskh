import React, { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { reconciliationApi } from '../features/attendance/api/reconciliation.api';
import {
  Home,
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
  Sparkles,
  Zap,
  Link2,
  MessageSquare,
  CalendarCheck,
  ClipboardCheck,
  Settings,
  Sliders,
} from 'lucide-react';

interface SidebarProps {
  onClose: () => void;
  onMobileClose?: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  allowedRoles?: string[];
  end?: boolean;
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  onClose,
  onMobileClose,
}) => {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const isTeacherOnly = userRoles.includes('TEACHER') && !userRoles.includes('ADMIN') && !userRoles.includes('MANAGE');
  const [attendancePendingCount, setAttendancePendingCount] = useState(0);

  const loadAttendanceCount = useCallback(async () => {
    if (!isTeacherOnly) return;
    try {
      const result = await reconciliationApi.getTeacherTrackingCount();
      setAttendancePendingCount(result.count);
    } catch {
      setAttendancePendingCount(0);
    }
  }, [isTeacherOnly]);

  useEffect(() => {
    loadAttendanceCount();
    const handleRefresh = () => loadAttendanceCount();
    window.addEventListener('teacher-attendance-updated', handleRefresh);
    return () => window.removeEventListener('teacher-attendance-updated', handleRefresh);
  }, [loadAttendanceCount]);

  const navGroups: NavGroup[] = [
    {
      title: 'TỔNG QUAN',
      items: [
        {
          name: 'Trang chủ Điều phối',
          path: '/',
          icon: <Home className="w-5 h-5 shrink-0" />,
          end: true,
        },
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
          allowedRoles: ['ADMIN', 'MANAGE', 'CS', 'TEACHER'],
        },
      ],
    },
    {
      title: 'ĐÀO TẠO & LỚP HỌC',
      items: [
        {
          name: 'Lớp học & Điểm danh',
          path: '/classes',
          icon: <GraduationCap className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS', 'TEACHER'],
        },
        {
          name: 'Đối soát Điểm danh',
          path: '/attendance/reconciliation',
          icon: <ClipboardCheck className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
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
      title: 'LỊCH DẠY GIÁO VIÊN',
      items: [
        {
          name: 'Lịch dạy của tôi',
          path: '/teacher/my-sessions',
          icon: <CalendarCheck className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'TEACHER'],
        },
        {
          name: 'Theo dõi điểm danh',
          path: '/teacher/attendance-tracking',
          icon: <ClipboardCheck className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'TEACHER'],
          badge: isTeacherOnly ? attendancePendingCount : undefined,
        },
      ],
    },
    {
      title: 'ĐA KÊNH (ZALO & LINE)',
      items: [
        {
          name: 'Hộp thư Đa kênh',
          path: '/omnichannel/chat',
          icon: <MessageSquare className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
        },
        {
          name: 'Nhóm Lớp Đa kênh',
          path: '/omnichannel/groups',
          icon: <Users className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
        },
        {
          name: 'Liên kết HV Đa kênh',
          path: '/omnichannel/student-links',
          icon: <Link2 className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
        },
        {
          name: 'Danh bạ Đa kênh',
          path: '/omnichannel/contacts',
          icon: <Users className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
        },
        {
          name: 'Tài khoản & Bảo mật',
          path: '/omnichannel/accounts',
          icon: <ShieldCheck className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
          end: true,
        },
      ],
    },
    {
      title: 'TỰ ĐỘNG HÓA & CHIẾN DỊCH',
      items: [
        {
          name: 'Kịch bản & Phát tin',
          path: '/automation',
          icon: <Zap className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
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
          name: 'Hàng đợi Phê duyệt Nhập liệu',
          path: '/imports/approval-queue',
          icon: <ShieldCheck className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN', 'MANAGE'],
        },
        {
          name: 'Người dùng & Phân quyền',
          path: '/settings/users',
          icon: <ShieldCheck className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN'],
        },
        {
          name: 'Cấu hình',
          path: '/settings/config',
          icon: <Sliders className="w-5 h-5 shrink-0" />,
          allowedRoles: ['ADMIN'],
        },
      ],
    },
    {
      title: 'CÁ NHÂN',
      items: [
        {
          name: 'Cấu hình cá nhân',
          path: '/settings/preferences',
          icon: <Settings className="w-5 h-5 shrink-0" />,
          // All authenticated users
        },
      ],
    },
  ];

  const hasPermission = (allowedRoles?: string[]) => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    return userRoles.some((role) => allowedRoles.includes(role));
  };

  return (
    <aside className="h-full w-64 bg-surface border-r border-border/80 flex flex-col select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border/80 shrink-0">
        <NavLink to="/" className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white shadow-md shadow-primary/20 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex flex-col truncate">
            <span className="font-bold text-sm text-text-primary tracking-tight">CSKH Automation</span>
            <span className="text-[11px] text-text-muted font-medium">Hệ thống Vận hành</span>
          </div>
        </NavLink>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="flex w-7 h-7 rounded-lg border border-border items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
          title="Đóng thanh điều hướng"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter((item) => hasPermission(item.allowedRoles));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="space-y-1">
              <div className="px-3 mb-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">
                {group.title}
              </div>
              {visibleItems.map((item) => (
                <NavLink
                  key={`${item.path}-${item.name}`}
                  to={item.path}
                  end={item.end}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all duration-150 ${isActive
                      ? 'bg-primary-soft text-primary font-semibold shadow-xs'
                      : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                    }`
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate flex-1">{item.name}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="min-w-5 rounded-full bg-warning/15 px-1.5 py-0.5 text-center text-[10px] font-bold text-amber-700">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-border/80 bg-surface-subtle/50 text-[11px] text-text-muted flex justify-between items-center">
        <span>v1.0.0 Modular Monolith</span>
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Hệ thống hoạt động" />
      </div>
    </aside>
  );
};
