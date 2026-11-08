export interface CreateStudentDTO {
  // Student core info
  external_id?: string;
  full_name: string;
  gender?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string | Date;
  occupation?: string;
  zalo_uid?: string;
  line_uid?: string;
  note?: string;

  // Enrollment & Course & Finance info
  program_type?: 'JLPT' | 'KAIWA';
  program_metadata?: Record<string, any> | null;
  cs_id?: number;
  package_code?: string;
  paid_at?: string | Date;
  sale_name?: string;
  student_source_status?: string;
  course_content?: string;
  payment_status?: string;
  level?: string;
  total_sessions?: number | string;
  external_remaining_sessions?: number | string;
  attended_previous_years?: number | string | null;
  class_model?: string;
  sales_note?: string;
  start_date?: string | Date;
  end_date?: string | Date;
  status?: string;

  // Class & Schedule info
  class_id?: number;
  class_name?: string;
  teacher_name?: string;
  teacher_code?: string;
  start_time?: string;
  schedule_pattern?: string;
  duration_minutes?: number | string;

  // Care & Reports info
  study_report_url?: string;
  exchange_info?: string;
  callback_note?: string;
  hot_issue_note?: string;
  post_course_care?: string;
  handed_over_at?: string | Date;
  account_created_at?: string | Date;
}

export interface UpdateStudentDTO {
  /** Explicit enrollment target belonging to this student and the actor's scope. */
  enrollment_id: number;

  // Student core info
  external_id?: string;
  full_name?: string;
  gender?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string | Date;
  occupation?: string;
  zalo_uid?: string;
  line_uid?: string;
  note?: string;

  // Enrollment & Course & Finance info
  program_type?: 'JLPT' | 'KAIWA';
  program_metadata?: Record<string, any> | null;
  cs_id?: number;
  package_code?: string;
  paid_at?: string | Date;
  sale_name?: string;
  student_source_status?: string;
  course_content?: string;
  payment_status?: string;
  level?: string;
  total_sessions?: number | string;
  external_remaining_sessions?: number | string;
  attended_previous_years?: number | string | null;
  class_model?: string;
  sales_note?: string;
  start_date?: string | Date;
  end_date?: string | Date;
  status?: string;

  // Class & Schedule info
  class_id?: number;
  class_name?: string;
  teacher_name?: string;
  teacher_code?: string;
  start_time?: string;
  schedule_pattern?: string;
  duration_minutes?: number | string;

  // Care & Reports info
  study_report_url?: string;
  exchange_info?: string;
  callback_note?: string;
  hot_issue_note?: string;
  post_course_care?: string;
  handed_over_at?: string | Date;
  account_created_at?: string | Date;
}

export interface StudentListQueryOptions {
  actor: { id: number; roles: string[]; email?: string };
  page?: number;
  pageSize?: number;
  isPaginated?: boolean;
  search?: string;
  programType?: string;
  csId?: number;
  cvht?: string;
  gender?: string;
  status?: string;
  model?: string;
  payment?: string;
  sale?: string;
}

export interface StudentListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: {
    programCounts: { all: number; kaiwa: number; jlpt: number };
    statusCounts: Record<string, number>;
  };
  filterOptions: {
    cvhtList: string[];
    salesList: string[];
    csOptions?: Array<{ value: string; label: string }>;
  };
}

export interface StudentListResult<T = any> {
  data: T[];
  meta: StudentListMeta;
}

export interface JlptAttendanceReportQueryOptions {
  actor: { id: number; roles: string[]; email?: string | null };
  page?: number;
  pageSize?: number;
  search?: string;
  class_code?: string;
  course_track?: string;
  status?: string;
  cvht?: string;
  warning_filter?: string;
  student_id?: number;
}

export interface UpdateJlptAttendanceReportDTO {
  enrollment_id?: number;
  exchange_info?: string;
  status?:
    | 'WAITING_CLASS'
    | 'STUDYING'
    | 'PAUSED'
    | 'FINISHED'
    | 'UPCOMING'
    | 'NOT_STARTED'
    | 'CANCELLED';
  class_code?: string;
  overrides?: {
    attended_sessions?: number | null;
    total_marked_sessions?: number | null;
    average_exam_score?: number | null;
    homework_completed_sessions?: number | null;
    max_consecutive_absent?: number | null;
    max_consecutive_no_homework?: number | null;
  };
  test_scores?: Record<string, string | number | null>;
  nkht_sessions?: Array<{
    session_number: number;
    session_label?: string;
    attendance?: 'O' | 'X' | '';
    preparation?: string;
    attitude?: string;
    homework_status?: string;
    homework_done?: boolean;
    homework_score?: number | null;
    exam_score?: number | string | null;
    note?: string;
  }>;
}
