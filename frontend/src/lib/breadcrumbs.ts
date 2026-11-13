// Dynamic breadcrumb mapping for the top Header bar.
// Each entry maps a route prefix to a [group, page] label pair.
// Longest-prefix match wins, so nested routes (e.g. /attendance/reconciliation)
// can override their parent group.

export interface BreadcrumbSegment {
  label: string;
  to?: string;
}

interface RouteMap {
  prefix: string;
  group: string;
  page: string;
}

const ROUTE_MAP: RouteMap[] = [
  // ── Tổng quan ────────────────────────────────────────────────────────────
  { prefix: '/', group: 'Tổng quan', page: 'Dashboard thống kê' },
  { prefix: '/dashboard', group: 'Tổng quan', page: 'Dashboard thống kê' },

  // ── Chăm sóc học viên ────────────────────────────────────────────────────
  { prefix: '/students/jlpt-attendance-report', group: 'Chăm sóc học viên', page: 'Chuyên cần HV (JLPT)' },
  { prefix: '/students/care-reports', group: 'Chăm sóc học viên', page: 'Báo cáo học tập & chăm sóc' },
  { prefix: '/students', group: 'Chăm sóc học viên', page: 'Hồ sơ học viên' },
  { prefix: '/enrollments', group: 'Chăm sóc học viên', page: 'Quản lý ghi danh' },
  { prefix: '/care', group: 'Chăm sóc học viên', page: 'Nhiệm vụ & chăm sóc' },

  // ── Đào tạo & Lớp học ────────────────────────────────────────────────────
  { prefix: '/attendance/reconciliation', group: 'Đào tạo & Lớp học', page: 'Đối soát điểm danh' },
  { prefix: '/classes', group: 'Đào tạo & Lớp học', page: 'Lớp học & điểm danh' },
  { prefix: '/packages', group: 'Đào tạo & Lớp học', page: 'Gói học & khóa học' },
  { prefix: '/teachers', group: 'Đào tạo & Lớp học', page: 'Quản lý giáo viên' },

  // ── Lịch dạy Giáo viên ───────────────────────────────────────────────────
  { prefix: '/teacher/my-sessions', group: 'Lịch dạy giáo viên', page: 'Lịch dạy của tôi' },
  { prefix: '/teacher/attendance-tracking', group: 'Lịch dạy giáo viên', page: 'Theo dõi điểm danh' },

  // ── Đa kênh ──────────────────────────────────────────────────────────────
  { prefix: '/omnichannel/chat', group: 'Đa kênh (Zalo & LINE)', page: 'Hộp thư đa kênh' },
  { prefix: '/omnichannel/groups', group: 'Đa kênh (Zalo & LINE)', page: 'Nhóm lớp đa kênh' },
  { prefix: '/omnichannel/student-links', group: 'Đa kênh (Zalo & LINE)', page: 'Liên kết học viên' },
  { prefix: '/omnichannel/contacts', group: 'Đa kênh (Zalo & LINE)', page: 'Danh bạ đa kênh' },
  { prefix: '/omnichannel/accounts', group: 'Đa kênh (Zalo & LINE)', page: 'Tài khoản & bảo mật' },
  { prefix: '/omnichannel', group: 'Đa kênh (Zalo & LINE)', page: 'Tài khoản & bảo mật' },
  { prefix: '/zalo', group: 'Đa kênh (Zalo & LINE)', page: 'Zalo' },
  { prefix: '/line', group: 'Đa kênh (Zalo & LINE)', page: 'LINE' },

  // ── Tự động hóa ──────────────────────────────────────────────────────────
  { prefix: '/automation', group: 'Tự động hóa', page: 'Kịch bản & phát tin' },

  // ── Dữ liệu & Hệ thống ───────────────────────────────────────────────────
  { prefix: '/data-backup/history', group: 'Sao lưu dữ liệu', page: 'Lịch sử sao lưu' },
  { prefix: '/data-backup/connection', group: 'Sao lưu dữ liệu', page: 'Cấu hình & Kết nối' },
  { prefix: '/data-backup/configs', group: 'Sao lưu dữ liệu', page: 'Danh sách nguồn sao lưu' },
  { prefix: '/data-backup', group: 'Sao lưu dữ liệu', page: 'Danh sách nguồn sao lưu' },
  { prefix: '/data-sync', group: 'Dữ liệu & Hệ thống', page: 'Đồng bộ dữ liệu' },
  { prefix: '/activity-logs', group: 'Dữ liệu & Hệ thống', page: 'Lịch sử hoạt động' },
  { prefix: '/imports/approval-queue', group: 'Dữ liệu & Hệ thống', page: 'Hàng đợi phê duyệt' },
  { prefix: '/imports', group: 'Dữ liệu & Hệ thống', page: 'Nhập & xuất Excel' },
  { prefix: '/settings/users', group: 'Dữ liệu & Hệ thống', page: 'Người dùng & phân quyền' },
  { prefix: '/settings/config/auto-attendance', group: 'Dữ liệu & Hệ thống', page: 'Cấu hình điểm danh tự động' },
  { prefix: '/settings/config/sheet-backup', group: 'Dữ liệu & Hệ thống', page: 'Cấu hình sao lưu Sheet' },
  { prefix: '/settings/config', group: 'Dữ liệu & Hệ thống', page: 'Cấu hình hệ thống' },
];

/** Sort by descending prefix length so the most specific route wins. */
const SORTED_ROUTE_MAP = [...ROUTE_MAP].sort((a, b) => b.prefix.length - a.prefix.length);

const EXTRA_PAGE_LABELS: Array<{ match: RegExp; page: string }> = [
  { match: /^\/students\/\d+\/study-report$/, page: 'Báo cáo học tập' },
  { match: /^\/automation\/\d+$/, page: 'Chi tiết kịch bản' },
];

export const getBreadcrumbs = (pathname: string, search = ''): BreadcrumbSegment[] => {
  const normalized = pathname.replace(/\/+$/, '') || '/';

  if (normalized === '/data-backup') {
    const tab = new URLSearchParams(search).get('tab');
    if (tab === 'history') {
      return [
        { label: 'Sao lưu dữ liệu', to: '/data-backup' },
        { label: 'Lịch sử sao lưu', to: '/data-backup/history' },
      ];
    }
    if (tab === 'connection') {
      return [
        { label: 'Sao lưu dữ liệu', to: '/data-backup' },
        { label: 'Cấu hình & Kết nối', to: '/data-backup/connection' },
      ];
    }
    return [
      { label: 'Sao lưu dữ liệu', to: '/data-backup' },
      { label: 'Danh sách nguồn sao lưu', to: '/data-backup' },
    ];
  }

  const extra = EXTRA_PAGE_LABELS.find((entry) => entry.match.test(normalized));
  const route =
    SORTED_ROUTE_MAP.find((entry) => normalized === entry.prefix) ||
    SORTED_ROUTE_MAP.find((entry) => entry.prefix !== '/' && normalized.startsWith(`${entry.prefix}/`));

  if (route) {
    return [
      { label: route.group },
      { label: extra ? extra.page : route.page, to: normalized },
    ];
  }

  // Fallback: derive a readable label from the last path segment.
  const segments = normalized.split('/').filter(Boolean);
  const last = segments[segments.length - 1] || 'Trang chủ';
  return [{ label: 'Tổng quan' }, { label: last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ') }];
};
