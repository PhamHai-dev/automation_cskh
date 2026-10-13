import type { TrendGranularity } from './types/dashboard.types';

// Curated palette for charts (matches the slate/indigo/emerald design language)
export const CHART_COLORS = [
  '#4f46e5', // indigo-600
  '#0ea5e9', // sky-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#14b8a6', // teal-500
  '#64748b', // slate-500
];

// --- Enrollment status ---
export const STATUS_META: Record<string, { label: string; color: string }> = {
  WAITING_CLASS: { label: 'Chờ lớp', color: '#f59e0b' },
  STUDYING: { label: 'Đang học', color: '#4f46e5' },
  PAUSED: { label: 'Bảo lưu', color: '#f59e0b' },
  FINISHED: { label: 'Kết thúc', color: '#10b981' },
  UPCOMING: { label: 'Sắp học', color: '#0ea5e9' },
  NOT_STARTED: { label: 'Chưa học', color: '#94a3b8' },
  CANCELLED: { label: 'Đã hủy', color: '#ef4444' },
};

// --- Care outcomes ---
export const OUTCOME_META: Record<string, { label: string; color: string; alert?: boolean }> = {
  POSITIVE: { label: 'Phản hồi tích cực', color: '#10b981' },
  NEED_SUPPORT_SYSTEM: { label: 'Cần hỗ trợ hệ thống', color: '#0ea5e9' },
  TEMP_PAUSE: { label: 'Tạm, học thêm rồi báo', color: '#f59e0b' },
  NEED_CURRICULUM_SUPPORT: { label: 'Cần hỗ trợ chương trình', color: '#8b5cf6' },
  NEED_STUDENT_WEAKNESS_FIX: { label: 'Cần hỗ trợ điểm yếu HV', color: '#f97316' },
  NEED_TEACHER_SUPPORT: { label: 'Cần hỗ trợ giáo viên', color: '#14b8a6' },
  NEGATIVE_WANTS_TO_STOP: { label: 'Tiêu cực, muốn dừng', color: '#ef4444', alert: true },
  NO_RESPONSE: { label: 'Chưa phản hồi', color: '#94a3b8' },
};

// --- Attendance statuses ---
export const ATTENDANCE_META: Record<string, { label: string; color: string }> = {
  ATTENDED: { label: 'Có mặt', color: '#10b981' },
  ABSENT_APPROVED_A: { label: 'Vắng có phép (A)', color: '#0ea5e9' },
  LEAVE_B: { label: 'Nghỉ (B)', color: '#f59e0b' },
  ABSENT_UNAPPROVED_C: { label: 'Vắng không phép (C)', color: '#ef4444' },
  TEACHER_ABSENT_D: { label: 'GV vắng (D)', color: '#8b5cf6' },
  TECH_ERROR_E: { label: 'Lỗi kỹ thuật (E)', color: '#64748b' },
};

// --- Care task types ---
export const TASK_TYPE_META: Record<string, { label: string; color: string }> = {
  CALLBACK: { label: 'Liên hệ lại', color: '#4f46e5' },
  HOT_ISSUE: { label: 'Điểm nóng', color: '#ef4444' },
  FOLLOW_UP: { label: 'Theo dõi', color: '#0ea5e9' },
  AUTO_ATTENDANCE: { label: 'Điểm danh tự động', color: '#14b8a6' },
  SCHEDULE_DATA_ISSUE: { label: 'Lỗi lịch/dữ liệu', color: '#f59e0b' },
};

export const GRANULARITY_LABEL: Record<TrendGranularity, string> = {
  day: 'theo ngày',
  week: 'theo tuần',
  month: 'theo tháng',
};
