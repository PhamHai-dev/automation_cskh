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
