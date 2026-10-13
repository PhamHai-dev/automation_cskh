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
