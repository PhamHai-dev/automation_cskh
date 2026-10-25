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

