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

  // ── Chăm sóc khách hàng ────────────────────────────────────────────────────
  { prefix: '/students/jlpt-attendance-report', group: 'Chăm sóc khách hàng', page: 'Chuyên cần HV (JLPT)' },
  { prefix: '/students/care-reports', group: 'Chăm sóc khách hàng', page: 'Báo cáo HV' },
  { prefix: '/students', group: 'Chăm sóc khách hàng', page: 'Học viên' },
  { prefix: '/care', group: 'Chăm sóc khách hàng', page: 'Nhiệm vụ & Thông báo' },

  // ── Đào tạo ────────────────────────────────────────────────────────────────
  { prefix: '/attendance/reconciliation', group: 'Đào tạo', page: 'Đối soát điểm danh' },
  { prefix: '/classes', group: 'Đào tạo', page: 'Điểm danh & Lớp học' },
  { prefix: '/enrollments', group: 'Đào tạo', page: 'Điểm danh & Lớp học' },
  { prefix: '/packages', group: 'Đào tạo', page: 'Gói học' },

  // ── Giáo viên ──────────────────────────────────────────────────────────────
  { prefix: '/teachers/schedule', group: 'Giáo viên', page: 'Lịch dạy' },
  { prefix: '/teachers/tasks', group: 'Giáo viên', page: 'Việc cần xử lý' },
  { prefix: '/teachers', group: 'Giáo viên', page: 'Danh sách giáo viên' },

  // ── Không gian Giáo viên ──────────────────────────────────────────────────
  { prefix: '/teacher/dashboard', group: 'Tổng quan', page: 'Dashboard giáo viên' },
  { prefix: '/teacher/attendance', group: 'Giảng dạy', page: 'Điểm danh' },
  { prefix: '/teacher/schedule', group: 'Giảng dạy', page: 'Lịch dạy' },
  { prefix: '/teacher/tasks', group: 'Giảng dạy', page: 'Việc cần xử lý' },
  { prefix: '/teacher/students', group: 'Giảng dạy', page: 'Học viên của tôi' },
  { prefix: '/teacher/notifications', group: 'Cá nhân', page: 'Thông báo' },
  { prefix: '/teacher/profile', group: 'Cá nhân', page: 'Hồ sơ giáo viên' },
  { prefix: '/teacher/my-sessions', group: 'Giảng dạy', page: 'Lịch dạy' },
  { prefix: '/teacher/attendance-tracking', group: 'Giảng dạy', page: 'Việc cần xử lý' },

  // ── Đa kênh ──────────────────────────────────────────────────────────────
  { prefix: '/omnichannel/chat', group: 'Đa kênh (Zalo & LINE)', page: 'Hộp thư đa kênh' },
  { prefix: '/omnichannel/groups', group: 'Đa kênh (Zalo & LINE)', page: 'Nhóm lớp đa kênh' },
  { prefix: '/omnichannel/student-links', group: 'Đa kênh (Zalo & LINE)', page: 'Liên kết học viên' },
  { prefix: '/omnichannel/contacts', group: 'Đa kênh (Zalo & LINE)', page: 'Danh bạ đa kênh' },
  { prefix: '/omnichannel/accounts', group: 'Đa kênh (Zalo & LINE)', page: 'Tài khoản & bảo mật' },
  { prefix: '/omnichannel', group: 'Đa kênh (Zalo & LINE)', page: 'Tài khoản & bảo mật' },
  { prefix: '/zalo', group: 'Đa kênh (Zalo & LINE)', page: 'Zalo' },
  { prefix: '/line', group: 'Đa kênh (Zalo & LINE)', page: 'LINE' },

  // ── Tự động hóa & Chiến dịch ───────────────────────────────────────────────
  { prefix: '/automation', group: 'Tự động hóa & Chiến dịch', page: 'Kịch bản & phát tin' },

  // ── Dữ liệu ────────────────────────────────────────────────────────────────
  { prefix: '/data-backup/history', group: 'Dữ liệu', page: 'Lịch sử sao lưu' },
  { prefix: '/data-backup/connection', group: 'Dữ liệu', page: 'Cấu hình & Kết nối' },
  { prefix: '/data-backup/configs', group: 'Dữ liệu', page: 'Danh sách nguồn sao lưu' },
  { prefix: '/data-backup', group: 'Dữ liệu', page: 'Danh sách nguồn sao lưu' },
  { prefix: '/data-sync', group: 'Dữ liệu', page: 'Đồng bộ dữ liệu' },
  { prefix: '/imports/approval-queue', group: 'Dữ liệu', page: 'Hàng đợi phê duyệt' },
  { prefix: '/imports', group: 'Dữ liệu', page: 'Nhập & xuất Excel' },

  // ── Quản trị hệ thống ──────────────────────────────────────────────────────
  { prefix: '/activity-logs', group: 'Quản trị hệ thống', page: 'Lịch sử hoạt động' },
  { prefix: '/settings/users', group: 'Quản trị hệ thống', page: 'Người dùng & phân quyền' },
  { prefix: '/settings/config/auto-attendance', group: 'Quản trị hệ thống', page: 'Cấu hình điểm danh tự động' },
  { prefix: '/settings/config/sheet-backup', group: 'Quản trị hệ thống', page: 'Cấu hình sao lưu Sheet' },
  { prefix: '/settings/config', group: 'Quản trị hệ thống', page: 'Cấu hình hệ thống' },
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
        { label: 'Dữ liệu', to: '/data-backup' },
        { label: 'Lịch sử sao lưu', to: '/data-backup/history' },
      ];
    }
    if (tab === 'connection') {
      return [
        { label: 'Dữ liệu', to: '/data-backup' },
        { label: 'Cấu hình & Kết nối', to: '/data-backup/connection' },
      ];
    }
    return [
      { label: 'Dữ liệu', to: '/data-backup' },
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
