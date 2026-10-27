import React from 'react';
import {
  Users,
  GraduationCap,
  Heart,
  FileText,
  ClipboardCheck,
  BarChart3,
  MessageSquare,
  Zap,
  FileSpreadsheet,
  Package,
  UserCheck,
} from 'lucide-react';

export interface QuickLinkDef {
  /** Stable key persisted in preferences scope `home.quick_links` */
  key: string;
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  iconClass: string;
  allowedRoles: string[];
  pinnedByDefault: boolean;
}

const icon = (node: React.ReactNode, cls: string) => ({ node, cls });

const ICON_SVG = 'w-6 h-6';

export const QUICK_LINK_REGISTRY: QuickLinkDef[] = [
  {
    key: 'students',
    title: 'Danh sách học viên',
    description: 'Hồ sơ và tiến độ học tập của học viên.',
    path: '/students',
    icon: <Users className={ICON_SVG} />,
    iconClass: 'bg-blue-50 text-blue-600',
    allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
    pinnedByDefault: true,
  },
  {
    key: 'classes',
    title: 'Lớp học & điểm danh',
    description: 'Lịch học, điểm danh và quản lý lớp học.',
    path: '/classes',
    icon: <GraduationCap className={ICON_SVG} />,
    iconClass: 'bg-emerald-50 text-emerald-600',
    allowedRoles: ['ADMIN', 'MANAGE', 'CS', 'TEACHER'],
    pinnedByDefault: true,
  },
  {
    key: 'care',
    title: 'Chăm sóc học viên',
    description: 'Theo dõi và xử lý yêu cầu chăm sóc học viên.',
    path: '/care',
    icon: <Heart className={ICON_SVG} />,
    iconClass: 'bg-rose-50 text-rose-600',
    allowedRoles: ['ADMIN', 'MANAGE', 'CS', 'TEACHER'],
    pinnedByDefault: true,
  },
  {
    key: 'enrollments',
    title: 'Quản lý ghi danh',
    description: 'Hợp đồng, gói học và quy trình ghi danh.',
    path: '/enrollments',
    icon: <FileText className={ICON_SVG} />,
    iconClass: 'bg-violet-50 text-violet-600',
    allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
    pinnedByDefault: true,
  },
  {
    key: 'reconciliation',
    title: 'Đối soát điểm danh',
    description: 'Kiểm tra và xử lý sai lệch điểm danh.',
    path: '/attendance/reconciliation',
    icon: <ClipboardCheck className={ICON_SVG} />,
    iconClass: 'bg-amber-50 text-amber-600',
    allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
    pinnedByDefault: true,
  },
  {
    key: 'dashboard',
    title: 'Báo cáo & thống kê',
    description: 'Nắm bắt hiệu quả vận hành và ra quyết định.',
    path: '/dashboard',
    icon: <BarChart3 className={ICON_SVG} />,
    iconClass: 'bg-cyan-50 text-cyan-600',
    allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
    pinnedByDefault: true,
  },
  {
    key: 'omnichannel_chat',
    title: 'Hộp thư Đa kênh',
    description: 'Nhắn tin Zalo & LINE với học viên tập trung.',
    path: '/omnichannel/chat',
    icon: <MessageSquare className={ICON_SVG} />,
    iconClass: 'bg-indigo-50 text-indigo-600',
    allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
    pinnedByDefault: false,
  },
  {
    key: 'automation',
    title: 'Kịch bản Tự động',
    description: 'Workflow chăm sóc và chiến dịch phát tin.',
    path: '/automation',
    icon: <Zap className={ICON_SVG} />,
    iconClass: 'bg-yellow-50 text-yellow-600',
    allowedRoles: ['ADMIN', 'MANAGE', 'CS'],
    pinnedByDefault: false,
  },
  {
    key: 'imports',
    title: 'Nhập & Xuất Excel',
    description: 'Đồng bộ dữ liệu, backup Sheet và lịch sử nhập.',
    path: '/imports',
    icon: <FileSpreadsheet className={ICON_SVG} />,
    iconClass: 'bg-lime-50 text-lime-600',
    allowedRoles: ['ADMIN', 'MANAGE', 'CS', 'TEACHER'],
    pinnedByDefault: false,
  },
  {
    key: 'packages',
    title: 'Gói học & Khóa học',
    description: 'Cấu hình chương trình học và định mức buổi.',
    path: '/packages',
    icon: <Package className={ICON_SVG} />,
    iconClass: 'bg-orange-50 text-orange-600',
    allowedRoles: ['ADMIN', 'MANAGE'],
    pinnedByDefault: false,
  },
  {
    key: 'teachers',
    title: 'Quản lý Giáo viên',
    description: 'Hồ sơ giáo viên, mã GV và phân công lớp.',
    path: '/teachers',
    icon: <UserCheck className={ICON_SVG} />,
    iconClass: 'bg-sky-50 text-sky-600',
    allowedRoles: ['ADMIN', 'MANAGE'],
    pinnedByDefault: false,
  },
];

/** Teacher-only quick links (TEACHER without ADMIN/MANAGE/CS). */
export const TEACHER_QUICK_LINKS: QuickLinkDef[] = [
  {
    key: 'teacher_my_sessions',
    title: 'Lịch dạy của tôi',
    description: 'Ghi nhận ca thực học và bài học trong ngày.',
    path: '/teacher/my-sessions',
    icon: icon(<GraduationCap className={ICON_SVG} />, '').node,
    iconClass: 'bg-emerald-50 text-emerald-600',
    allowedRoles: ['TEACHER'],
    pinnedByDefault: true,
  },
  {
    key: 'teacher_attendance_tracking',
    title: 'Theo dõi điểm danh',
    description: 'Buổi học chờ chấm điểm danh và lịch sử đã chấm.',
    path: '/teacher/attendance-tracking',
    icon: icon(<ClipboardCheck className={ICON_SVG} />, '').node,
    iconClass: 'bg-amber-50 text-amber-600',
    allowedRoles: ['TEACHER'],
    pinnedByDefault: true,
  },
  {
    key: 'teacher_care',
    title: 'Chăm sóc học viên',
    description: 'Theo dõi và xử lý yêu cầu chăm sóc học viên.',
    path: '/care',
    icon: icon(<Heart className={ICON_SVG} />, '').node,
    iconClass: 'bg-rose-50 text-rose-600',
    allowedRoles: ['TEACHER'],
    pinnedByDefault: true,
  },
  {
    key: 'classes',
    title: 'Lớp học & điểm danh',
    description: 'Lịch học, điểm danh và quản lý lớp học.',
    path: '/classes',
    icon: icon(<Users className={ICON_SVG} />, '').node,
    iconClass: 'bg-blue-50 text-blue-600',
    allowedRoles: ['TEACHER'],
    pinnedByDefault: true,
  },
];
