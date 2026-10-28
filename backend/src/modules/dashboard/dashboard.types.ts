export interface DashboardFilterParams {
  date_from?: string;
  date_to?: string;
  cs_id?: number;
  package_id?: number;
  class_id?: number;
  status?: string;
}

export interface EnrollmentSummaryStats {
  total_enrollments: number;
  unique_students: number;
  status_breakdown: Record<string, number>;
  status_percentage: Record<string, number>;
}

export interface AttendanceStats {
  total_sessions: number;
  total_attendances: number;
  attendance_rate: number;
  breakdown: Record<string, number>;
}

export interface CarePivotMatrix {
  session_numbers: number[];
  outcomes: string[];
  matrix: Record<string, Record<string, number>>;
  total_logs: number;
}

export interface TasksOverviewStats {
  pending_total: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
  urgent_hot_issues: number;
  completed_recent: number;
}

// ---- Granularity & common trend shape ----
export type TrendGranularity = 'day' | 'week' | 'month';

export interface TrendPoint {
  label: string;
  date: string; // ISO start of bucket
  [metric: string]: string | number;
}

// ---- Tab: Overview ----
export interface OverviewPayload {
  summary: EnrollmentSummaryStats;
  kpis: {
    total_enrollments: number;
    studying: number;
    studying_pct: number;
    paused: number;
    near_completion: number; // STUDYING enrollments with remaining sessions <= 10
    overdue_tasks: number;
  };
  enrollment_trend: { granularity: TrendGranularity; points: TrendPoint[] };
  enrollment_by_cs: Array<{ cs_id: number; cs_name: string; count: number }>;
}

// ---- Care response matrix from the student report/care columns ----
export type CareResponseBucket =
  | 'POSITIVE'
  | 'NEED_SUPPORT_SYSTEM'
  | 'TEMP_PAUSE'
  | 'NEED_CURRICULUM_SUPPORT'
  | 'NEED_STUDENT_WEAKNESS_FIX'
  | 'NEED_TEACHER_SUPPORT'
  | 'NEGATIVE_WANTS_TO_STOP'
  | 'NO_RESPONSE'
  | 'OTHER'
  | 'NOT_ENTERED';

export interface CareResponseMatrixRow {
  session_number: number;
  counts: Record<CareResponseBucket, number>;
  total_enrollments: number;
  entered_total: number;
  response_rate: number;
}

export interface CareResponseMatrix {
  session_numbers: number[];
  buckets: CareResponseBucket[];
  rows: CareResponseMatrixRow[];
  total_enrollments: number;
  total_entered: number;
  response_rate: number;
}

// ---- Care: outcome/pivot + report content analytics ----
export interface CarePayload {
  pivot: CarePivotMatrix;
  outcome_breakdown: Array<{ outcome: string; count: number }>;
  milestone_coverage: Array<{
    session_number: number;
    reached: number;
    covered: number;
    coverage_pct: number;
  }>;
  at_risk: Array<{
    enrollment_id: number;
    student_name: string;
    cs_name: string | null;
    after_session_number: number | null;
    last_log_at: string;
  }>;
  response_matrix: CareResponseMatrix;
}

// ---- Tab: Attendance ----
export interface AttendancePayload {
  stats: AttendanceStats;
  trend: { granularity: TrendGranularity; points: Array<{ label: string; date: string; total: number; attended: number; rate: number }> };
  by_class: Array<{ class_id: number; class_name: string; total: number; attended: number; rate: number }>;
}

// ---- Tab: Performance & Tasks ----
export interface PerformancePayload {
  tasks: TasksOverviewStats;
  tasks_by_type: Array<{ type: string; total: number; pending: number; done: number }>;
  task_completion: { month_total: number; month_done: number; completion_pct: number };
  cs_leaderboard: Array<{
    cs_id: number;
    cs_name: string;
    total_enrollments: number;
    total_logs: number;
    positive_logs: number;
    positive_pct: number;
    tasks_done: number;
    tasks_total: number;
    tasks_done_pct: number;
  }>;
}

// ---- Command Center Home ----
export interface SparklinePoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface HomeKpiMetric {
  value: number;          // Giá trị hiện tại (ví dụ: 1248, 48, 96.2, 12)
  delta: number;          // Chênh lệch so với kỳ trước (ví dụ: +12 (%) hoặc +3 (việc))
  delta_unit: 'percent' | 'count';
  comparison_label: string; // "so với tháng trước" hoặc "so với hôm qua"
  sparkline: SparklinePoint[]; // 7 điểm gần nhất (7 ngày qua, tính cả hôm nay)
}

export interface HomeTodayTaskItem {
  id: number;
  title: string;
  subtitle: string;       // Ví dụ: "Học viên Trần Bảo Ngọc - Lớp IELTS Foundation" hoặc tên HV + gói học
  type: 'CALLBACK' | 'HOT_ISSUE' | 'FOLLOW_UP' | 'AUTO_ATTENDANCE' | 'SCHEDULE_DATA_ISSUE';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'DONE' | 'CANCELLED';
  badge_label: 'Ưu tiên' | 'Đang xử lý' | 'Chờ xử lý';
  badge_variant: 'danger' | 'info' | 'warning';
  due_at: string | null;  // ISO string
  time_label: string;     // HH:mm (từ due_at hoặc created_at, ví dụ "09:00")
  date_label: string;     // "Hôm nay" | "Quá hạn" | DD/MM
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
  model_type: string;     // "1:1" | "1:2" | "1:n"
  teacher_name: string | null;
  subtitle: string;       // Ví dụ: "GV: Nguyễn Văn A • Mô hình 1:n" (vì DB không có phòng/cơ sở, hiển thị linh hoạt GV + mô hình/trình độ)
  session_date: string;   // YYYY-MM-DD
  start_time: string;     // HH:mm (fallback "08:00" nếu null)
  end_time: string;       // HH:mm (fallback cộng 90p từ start_time nếu null)
  display_status: 'ONGOING' | 'UPCOMING' | 'COMPLETED';
  display_status_label: 'Đang diễn ra' | 'Sắp diễn ra' | 'Đã hoàn thành';
  student_count: number;  // Số EnrollmentClass ACTIVE/PLANNED trong lớp đó
}

export interface HomeDashboardPayload {
  kpis: {
    total_students: HomeKpiMetric;     // comparison_label: "so với tháng trước", delta_unit: "percent"
    active_classes: HomeKpiMetric;     // comparison_label: "so với tháng trước", delta_unit: "percent"
    attendance_today: HomeKpiMetric;   // value = tỷ lệ % chuyên cần hôm nay (0..100, 1 chữ số thập phân; nếu hôm nay chưa có bản ghi điểm danh nào thì lấy tỷ lệ 7 ngày gần nhất hoặc 0), comparison_label: "so với hôm qua", delta_unit: "percent"
    pending_tasks: HomeKpiMetric;      // value = tổng CareTask status=PENDING trong scope, delta = chênh lệch số task tạo hôm nay so với hôm qua, comparison_label: "so với hôm qua", delta_unit: "count"
  };
  today_tasks: HomeTodayTaskItem[];         // Tối đa 6 task: status = PENDING trong scope, ưu tiên URGENT/HIGH trước, rồi due_at tăng dần
  upcoming_sessions: HomeUpcomingSessionItem[]; // Tối đa 6 buổi học: ClassSession có status != CANCELLED, ưu tiên session_date >= hôm nay (nếu không đủ thì lấy các buổi gần nhất trong 7 ngày qua/tới), của các Class thuộc scope (nếu csIds != null thì lọc các Class có EnrollmentClass của enrollment thuộc csIds; ADMIN thấy tất cả), sắp xếp theo session_date ASC, start_time ASC
}

// ---- Header Global Search ----
export interface GlobalSearchPayload {
  students: Array<{
    id: number;
    full_name: string;
    external_id: string | null;
    phone: string | null;
    subtitle: string; // ví dụ: mã HV + SĐT hoặc gói học đang học
  }>;
  classes: Array<{
    id: number;
    class_name: string;
    class_code: string | null;
    level: string | null;
    subtitle: string; // ví dụ: mã lớp + trình độ + tên GV chính
  }>;
  teachers: Array<{
    id: number;
    name: string;
    code: string;
    teacher_type: string | null;
    subtitle: string; // ví dụ: mã GV + loại GV
  }>;
}
