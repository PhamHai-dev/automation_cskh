// ─── Trang chủ Điều phối (Command Center) — API contract with backend ─────────
// GET /api/v1/dashboard/home   -> { data: HomeDashboardPayload }
// GET /api/v1/dashboard/search -> { data: GlobalSearchPayload }

export interface SparklinePoint {
  date: string;
  value: number;
}

export interface HomeKpiMetric {
  value: number;
  delta: number;
  delta_unit: 'percent' | 'count';
  comparison_label: string;
  sparkline: SparklinePoint[];
}

export interface HomeTodayTaskItem {
  id: number;
  title: string;
  subtitle: string;
  type: 'CALLBACK' | 'HOT_ISSUE' | 'FOLLOW_UP' | 'AUTO_ATTENDANCE' | 'SCHEDULE_DATA_ISSUE';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'DONE' | 'CANCELLED';
  badge_label: 'Ưu tiên' | 'Đang xử lý' | 'Chờ xử lý';
  badge_variant: 'danger' | 'info' | 'warning';
  due_at: string | null;
  time_label: string;
  date_label: string;
  enrollment_id: number;
  student_id: number;
  student_name: string;
}

export interface HomeUpcomingSessionItem {
  session_id: number;
  class_id: number;
  class_name: string;
  class_code: string | null;
  level: string | null;
  model_type: string;
  teacher_name: string | null;
  subtitle: string;
  session_date: string;
  start_time: string;
  end_time: string;
  display_status: 'ONGOING' | 'UPCOMING' | 'COMPLETED';
  display_status_label: 'Đang diễn ra' | 'Sắp diễn ra' | 'Đã hoàn thành';
  student_count: number;
}

export interface HomeDashboardPayload {
  kpis: {
    total_students: HomeKpiMetric;
    active_classes: HomeKpiMetric;
    attendance_today: HomeKpiMetric;
    pending_tasks: HomeKpiMetric;
  };
  today_tasks: HomeTodayTaskItem[];
  upcoming_sessions: HomeUpcomingSessionItem[];
}

export interface GlobalSearchStudentItem {
  id: number;
  full_name: string;
  external_id: string | null;
  phone: string | null;
  subtitle: string;
}

export interface GlobalSearchClassItem {
  id: number;
  class_name: string;
  class_code: string | null;
  level: string | null;
  subtitle: string;
}

export interface GlobalSearchTeacherItem {
  id: number;
  name: string;
  code: string;
  teacher_type: string | null;
  subtitle: string;
}

export interface GlobalSearchPayload {
  students: GlobalSearchStudentItem[];
  classes: GlobalSearchClassItem[];
  teachers: GlobalSearchTeacherItem[];
}
