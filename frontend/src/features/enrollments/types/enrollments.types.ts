import { Student } from '../../students/types/students.types';
import { Package } from '../../packages/types/packages.types';

export interface Enrollment {
  id: number;
  external_id?: string;
  student_id: number;
  package_id?: number;
  cs_id: number;
  paid_at?: string | null;
  sale_name?: string | null;
  student_source_status?: string | null;
  course_content?: string | null;
  payment_status?: string | null;
  course_teacher_type?: string | null;
  level?: string | null;
  total_sessions: number;
  completed_sessions?: number;
  class_model?: string | null;
  sales_note?: string | null;
  study_report_url?: string | null;
  exchange_info?: string | null;
  callback_note?: string | null;
  hot_issue_note?: string | null;
  post_course_care?: string | null;
  handed_over_at?: string | null;
  account_created_at?: string | null;
  external_remaining_sessions?: number | null;
  attended_previous_years?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status: 'NOT_STARTED' | 'STUDYING' | 'PAUSED' | 'FINISHED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
  student?: Student;
  package?: Package;
  sale?: {
    id: number;
    code: string;
    name: string;
  };
  care_logs?: Array<{
    id: number;
    after_session_number: number;
    content: string;
    outcome?: string;
    created_at: string;
  }>;
  care_tasks?: Array<{
    id: number;
    type: string;
    title: string;
    note: string;
    status: string;
    due_at?: string;
    priority: string;
  }>;
  cs?: {
    id: number;
    name: string;
    email: string;
  };
  enrollment_classes?: Array<{
    id: number;
    class_id: number;
    status?: string;
    class?: {
      id: number;
      class_name: string;
      class_code?: string;
      class_teachers?: Array<{ teacher?: { name: string }; teacher_code?: string }>;
      class_schedules?: Array<{ schedule_pattern: string; start_time?: string; duration_minutes?: number }>;
      class_sessions?: Array<{ id: number; session_date: string; session_number: number; status: string }>;
    };
    attendance?: Array<{
      id: number;
      status: string;
      class_session_id: number;
      class_session?: { id: number; session_date: string; session_number: number };
    }>;
  }>;
}

export interface CreateEnrollmentDTO {
  external_id?: string;
  student_id: number;
  package_id?: number;
  cs_id: number;
  total_sessions: number;
  external_remaining_sessions?: number;
  start_date?: string;
  end_date?: string;
}

export interface UpdateEnrollmentDTO {
  external_id?: string;
  package_id?: number;
  total_sessions?: number;
  external_remaining_sessions?: number;
  start_date?: string;
  end_date?: string;
  status?: 'NOT_STARTED' | 'STUDYING' | 'PAUSED' | 'FINISHED' | 'CANCELLED';
}
