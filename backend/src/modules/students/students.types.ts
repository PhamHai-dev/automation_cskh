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
  note?: string;

  // Enrollment & Course & Finance info
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
  // Student core info
  external_id?: string;
  full_name?: string;
  gender?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string | Date;
  occupation?: string;
  zalo_uid?: string;
  note?: string;

  // Enrollment & Course & Finance info
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
