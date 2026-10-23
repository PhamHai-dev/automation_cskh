import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageContainer } from '../../components/common/PageContainer';
import { Badge } from '../../components/ui/Badge';
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
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  const hasRole = (roles: string[]) => userRoles.some((r) => roles.includes(r));

  const quickLinks = [
    {
      title: 'Báo cáo & Thống kê',
      desc: 'Tỷ lệ chuyên cần, ma trận mốc buổi học và tiến độ CS',
      path: '/dashboard',
      icon: <LayoutDashboard className="w-6 h-6 text-emerald-600" />,
      bg: 'bg-emerald-500/10 border-emerald-200/80 hover:border-emerald-500',
      badge: 'Thống kê',
      badgeVariant: 'success' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS']),
    },
    {
      title: 'Chăm sóc & Việc cần làm',
      desc: 'Nhật ký tương tác học viên, hẹn gọi lại và xử lý khiếu nại',
      path: '/care',
      icon: <HeartHandshake className="w-6 h-6 text-indigo-600" />,
      bg: 'bg-indigo-500/10 border-indigo-200/80 hover:border-indigo-500',
      badge: 'Nhiệm vụ',
      badgeVariant: 'info' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS']),
    },
    {
      title: 'Quản lý Ghi danh',
      desc: 'Hợp đồng, số buổi còn lại (cảnh báo nợ buổi) và phân công CS',
      path: '/enrollments',
      icon: <FileCheck2 className="w-6 h-6 text-blue-600" />,
      bg: 'bg-blue-500/10 border-blue-200/80 hover:border-blue-500',
      badge: 'Hợp đồng',
      badgeVariant: 'info' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS']),
    },
    {
      title: 'Quản lý Lớp học & Điểm danh',
      desc: 'Lịch học, ma trận chuỗi ngày học và chấm điểm danh',
      path: '/classes',
      icon: <GraduationCap className="w-6 h-6 text-teal-600" />,
      bg: 'bg-teal-500/10 border-teal-200/80 hover:border-teal-500',
      badge: 'Lớp học',
      badgeVariant: 'accent' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
    },
    {
      title: 'Danh sách Học viên',
      desc: 'Hồ sơ cá nhân học viên, phụ huynh và tài khoản Zalo liên hệ',
      path: '/students',
      icon: <Users className="w-6 h-6 text-purple-600" />,
      bg: 'bg-purple-500/10 border-purple-200/80 hover:border-purple-500',
      badge: 'Hồ sơ',
      badgeVariant: 'neutral' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS']),
    },
    {
      title: 'Gói học & Khóa học',
      desc: 'Cấu hình chương trình học, số buổi định mức mặc định',
      path: '/packages',
      icon: <Package className="w-6 h-6 text-amber-600" />,
      bg: 'bg-amber-500/10 border-amber-200/80 hover:border-amber-500',
      badge: 'Cấu hình',
      badgeVariant: 'warning' as const,
      allowed: hasRole(['ADMIN', 'MANAGE']),
    },
    {
      title: 'Quản lý Giáo viên',
      desc: 'Giáo viên Việt Nam & Bản ngữ, mã GV và lịch sử dạy lớp',
      path: '/teachers',
      icon: <UserCheck className="w-6 h-6 text-sky-600" />,
      bg: 'bg-sky-500/10 border-sky-200/80 hover:border-sky-500',
      badge: 'Nhân sự',
      badgeVariant: 'info' as const,
      allowed: hasRole(['ADMIN', 'MANAGE']),
    },
    {
      title: 'Nhập & Xuất Excel',
      desc: 'Import Sheet 1 (Học viên) & Sheet 3 (Chấm buổi), đối soát dữ liệu',
      path: '/imports',
      icon: <FileSpreadsheet className="w-6 h-6 text-rose-600" />,
      bg: 'bg-rose-500/10 border-rose-200/80 hover:border-rose-500',
      badge: 'Excel',
      badgeVariant: 'danger' as const,
      allowed: hasRole(['ADMIN', 'MANAGE']),
    },
    {
      title: 'Quản trị Người dùng',
      desc: 'Phân quyền tài khoản, mở/khóa người dùng và quản lý nhóm CS',
      path: '/settings/users',
      icon: <ShieldCheck className="w-6 h-6 text-slate-700" />,
      bg: 'bg-slate-500/10 border-slate-200/80 hover:border-slate-500',
      badge: 'Bảo mật',
      badgeVariant: 'neutral' as const,
      allowed: hasRole(['ADMIN']),
    },
  ];

  return (
    <PageContainer>
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-primary to-teal-600 text-white p-6 sm:p-10 mb-8 shadow-soft-lg">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold text-white mb-4 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Trung tâm Điều phối & Tự động hóa Vận hành CSKH</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Xin chào, {user?.name || 'Bạn'}!
          </h1>
          <p className="text-blue-100 text-xs sm:text-base leading-relaxed max-w-2xl">
            Chào mừng bạn đến với hệ thống quản trị học viên, điều phối lớp học và tự động hóa quy trình chăm sóc khách hàng.
          </p>
        </div>

        {/* Decorative background circle */}
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-80 h-80 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Quick Launch Grid */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-text-primary mb-1">Truy cập Nhanh Các Phân Hệ</h2>
        <p className="text-xs text-text-muted">Chọn phân hệ bạn muốn làm việc hôm nay</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {quickLinks
          .filter((item) => item.allowed)
          .map((item, idx) => (
            <Link
              key={idx}
              to={item.path}
              className={`group flex flex-col justify-between p-5 sm:p-6 bg-surface rounded-2xl border border-border/80 shadow-soft hover:shadow-soft-md transition-all duration-200 hover:-translate-y-0.5 ${item.bg}`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-white rounded-xl shadow-xs border border-border/60">
                    {item.icon}
                  </div>
                  <Badge variant={item.badgeVariant} size="sm">
                    {item.badge}
                  </Badge>
                </div>
                <h3 className="text-base font-bold text-text-primary group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                  {item.desc}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-between text-xs font-semibold text-text-muted group-hover:text-primary transition-colors">
                <span>Vào phân hệ</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
      </div>
    </PageContainer>
  );
};
