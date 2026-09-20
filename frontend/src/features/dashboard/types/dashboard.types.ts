export interface DashboardFilterParams {
  package_id?: number;
  cs_id?: number;
  class_id?: number;
  date_from?: string;
  date_to?: string;
  status?: string;
}

export interface DashboardSummary {
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

export interface TasksOverview {
  pending_total: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
  urgent_hot_issues: number;
  completed_recent: number;
}
