import { Enrollment, ProgramMetadata } from '../../enrollments/types/enrollments.types';

export type { ProgramMetadata };

export interface Student {
  id: number;
  external_id?: string | null;
  full_name: string;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  school?: string | null;
  occupation?: string | null;
  zalo_uid?: string | null;
  line_uid?: string | null;
  note?: string | null;
  enrollments?: Enrollment[];
  created_at: string;
  updated_at: string;
}

export interface CreateStudentDTO {
  // 1. Personal & Contact (A -> I)
  external_id?: string;
  full_name: string;
  gender?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  parent_name?: string;
  parent_phone?: string;
  school?: string;
  occupation?: string;
  zalo_uid?: string;
  line_uid?: string;
  note?: string;

  // 2. Enrollment, Course & Finance (J -> U)
  paid_at?: string;
  sale_name?: string;
  student_source_status?: string;
  course_content?: string;
  payment_status?: string;
  level?: string;
  total_sessions?: number | string;
  external_remaining_sessions?: number | string;
  attended_previous_years?: number | string;
  class_model?: string;
  sales_note?: string;

  // 3. Class & Schedule (V -> AJ)
  class_name?: string;
  teacher_name?: string;
  teacher_code?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  start_time?: string;
  schedule_pattern?: string;
  duration_minutes?: number | string;

  // 4. Care & Reports (AK -> BH)
  study_report_url?: string;
  exchange_info?: string;
  callback_note?: string;
  hot_issue_note?: string;
  post_course_care?: string;
  handed_over_at?: string;
  account_created_at?: string;

  // 5. Program & CVHT sync fields
  program_type?: 'JLPT' | 'KAIWA' | string;
  program_metadata?: Record<string, any>;
  cs_id?: number;
  package_code?: string;
}

export interface UpdateStudentDTO extends Partial<CreateStudentDTO> {
  enrollment_id: number;
}

export interface JlptNkhtSessionItem {
  session_number: number;
  session_label?: string;
  attendance?: 'O' | 'X' | '';
  preparation?: string;
  attitude?: string;
  homework_status?: string;
  exam_score?: number | string | null;
  note?: string;
}

export interface JlptAttendanceReportOverrides {
  attended_sessions?: number | null;
  total_marked_sessions?: number | null;
  average_exam_score?: number | null;
  homework_completed_sessions?: number | null;
  max_consecutive_absent?: number | null;
  max_consecutive_no_homework?: number | null;
}

export interface JlptAttendanceReportRow {
  student_id: number;
  enrollment_id: number;
  external_id: string | null;
  is_readonly: boolean;
  // A -> V (22 columns)
  class_code: string;                        // Col A
  full_name: string;                         // Col B
  attended_sessions: number | null;          // Col C
  total_marked_sessions: number | null;      // Col D
  attendance_rate: number | null;            // Col E (0..1)
  average_exam_score: number | null;         // Col F
  homework_completed_sessions: number | null;// Col G
  max_consecutive_absent: number | null;     // Col H
  absent_warning: string;                    // Col I
  max_consecutive_no_homework: number | null;// Col J
  no_homework_warning: string;               // Col K
  exchange_info: string;                     // Col L
  status: string;                            // Col M (raw code)
  status_label: string;                      // Col M (display label: "Đang học", ...)
  cvht_code: string;                         // Col N
  cs_id: number | null;
  cs_name: string | null;
  course_track: string;                      // Col O ("N5", "N4", "N3", "N2", "N4-LuyenDe", "N3-LuyenDe")
  last_exam_name: string;                    // Col P
  last_exam_session: number | null;          // Col Q
  sessions_since_last_exam: number | null;   // Col R
  next_exam_name: string;                    // Col S
  next_exam_session: number | null;          // Col T
  sessions_until_next_exam: number | null;   // Col U
  exam_schedule_warning: string;             // Col V
  test_scores: Record<string, string>;
  overrides: JlptAttendanceReportOverrides;
  nkht_sessions: JlptNkhtSessionItem[];
}

export interface JlptAttendanceReportSummary {
  totalStudents: number;
  studyingCount: number;
  absentWarningCount: number;
  noHomeworkWarningCount: number;
  missingExamScoreCount: number;
  upcomingExamCount: number;
  lowAttendanceCount?: number;
  lowAttendanceRedCount?: number;
}

export interface JlptAttendanceReportMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary?: JlptAttendanceReportSummary;
  filterOptions?: {
    classCodes?: string[];
    classList?: string[];
    courseTracks?: string[];
    courseTrackList?: string[];
    cvhtList?: string[];
    statuses?: Array<{ value: string; label: string }>;
  };
}

export interface JlptAttendanceReportResponse {
  data: JlptAttendanceReportRow[];
  meta: JlptAttendanceReportMeta;
}

export interface JlptAttendanceReportParams {
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
  status?: string;
  class_code?: string;
  overrides?: Partial<JlptAttendanceReportOverrides>;
  test_scores?: Record<string, string | number | null>;
  nkht_sessions?: JlptNkhtSessionItem[];
}
