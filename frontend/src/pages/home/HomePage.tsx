import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageContainer } from '../../components/common/PageContainer';
import { Badge } from '../../components/ui/Badge';
import {
  LayoutDashboard,
  HeartHandshake,
  Users,
  GraduationCap,
  Package,
  UserCheck,
  FileSpreadsheet,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  CalendarCheck,
  ClipboardCheck,
  MessageSquare,
  Zap,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  const hasRole = (roles: string[]) => userRoles.some((r) => roles.includes(r));
  const isStaffWithEnrollmentView = hasRole(['ADMIN', 'MANAGE', 'CS']);

  const quickLinks = [
    {
      title: 'Báo cáo & Thống kê',
      desc: 'Tỷ lệ chuyên cần, ma trận mốc buổi học và tiến độ CSKH',
      path: '/dashboard',
      icon: <LayoutDashboard className="w-6 h-6 text-emerald-600" />,
      bg: 'bg-emerald-500/10 border-emerald-200/80 hover:border-emerald-500',
      badge: 'Thống kê',
      badgeVariant: 'success' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS']),
    },
    {
      title: 'Lịch dạy & Theo dõi điểm danh',
      desc: 'Ghi nhận ca thực học, chấm điểm danh nhanh và theo dõi các buổi chờ chấm / lịch sử',
      path: '/teacher/my-sessions',
      icon: <CalendarCheck className="w-6 h-6 text-emerald-600" />,
      bg: 'bg-emerald-500/10 border-emerald-200/80 hover:border-emerald-500',
      badge: 'Giáo viên',
      badgeVariant: 'success' as const,
      allowed: hasRole(['TEACHER']),
    },
    {
      title: 'Lớp học & Điểm danh',
      desc: 'Điểm danh chuyên cần theo học viên, quản lý lớp học, lịch học và phân công giáo viên',
      path: isStaffWithEnrollmentView ? '/enrollments' : '/classes',
      icon: <GraduationCap className="w-6 h-6 text-teal-600" />,
      bg: 'bg-teal-500/10 border-teal-200/80 hover:border-teal-500',
      badge: 'Lớp học & Điểm danh',
      badgeVariant: 'accent' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
    },
    {
      title: 'Đối soát Điểm danh 2 chiều',
      desc: 'Đối chiếu kết quả chấm giữa Giáo viên và CSKH, xử lý lệch điểm danh',
      path: '/attendance/reconciliation',
      icon: <ClipboardCheck className="w-6 h-6 text-cyan-600" />,
      bg: 'bg-cyan-500/10 border-cyan-200/80 hover:border-cyan-500',
      badge: 'Đối soát',
      badgeVariant: 'info' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS']),
    },
    {
      title: 'Danh sách Học viên',
      desc: 'Hồ sơ cá nhân học viên, tiến độ học tập và liên kết nhóm Zalo/LINE',
      path: '/students',
      icon: <Users className="w-6 h-6 text-purple-600" />,
      bg: 'bg-purple-500/10 border-purple-200/80 hover:border-purple-500',
      badge: 'Hồ sơ',
      badgeVariant: 'neutral' as const,
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
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
    },
    {
      title: 'Hộp thư Đa kênh (Zalo & LINE)',
      desc: 'Nhắn tin trực tiếp với học viên và nhóm lớp trên Zalo/LINE tập trung',
      path: '/omnichannel/chat',
      icon: <MessageSquare className="w-6 h-6 text-blue-600" />,
      bg: 'bg-blue-500/10 border-blue-200/80 hover:border-blue-500',
      badge: 'Đa kênh',
      badgeVariant: 'info' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS']),
    },
    {
      title: 'Kịch bản & Phát tin Tự động',
      desc: 'Workflow chăm sóc theo mốc buổi học và chiến dịch gửi tin hẹn giờ',
      path: '/automation',
      icon: <Zap className="w-6 h-6 text-amber-600" />,
      bg: 'bg-amber-500/10 border-amber-200/80 hover:border-amber-500',
      badge: 'Automation',
      badgeVariant: 'warning' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS']),
    },
    {
      title: 'Nhập & Xuất Excel / Google Sheet',
      desc: 'Đồng bộ Google Sheet, backup Sheet CSKH, tải file điểm danh và lịch sử nhập',
      path: '/imports',
      icon: <FileSpreadsheet className="w-6 h-6 text-rose-600" />,
      bg: 'bg-rose-500/10 border-rose-200/80 hover:border-rose-500',
      badge: 'Dữ liệu',
      badgeVariant: 'danger' as const,
      allowed: hasRole(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
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
      title: 'Quản trị Người dùng',
      desc: 'Phân quyền tài khoản, mở/khóa người dùng và cấu hình hệ thống',
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
      {/* Compact Welcome Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-primary to-teal-600 text-white px-6 py-5 mb-6 shadow-soft">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-semibold text-white mb-1.5 border border-white/20">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Hệ thống Vận hành & CSKH</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Xin chào, {user?.name || 'Bạn'}!
            </h1>
          </div>
        </div>
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
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
