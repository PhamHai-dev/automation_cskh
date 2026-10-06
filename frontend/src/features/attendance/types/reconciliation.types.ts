export type AttendanceStatus =
  | 'ATTENDED'
  | 'ABSENT_APPROVED_A'
  | 'LEAVE_B'
  | 'ABSENT_UNAPPROVED_C'
  | 'TEACHER_ABSENT_D'
  | 'TECH_ERROR_E';

export type ReconciliationState =
  | 'PENDING_CS'
  | 'PENDING_TEACHER'
  | 'MATCHED'
  | 'CONFLICT'
  | 'RESOLVED';

export interface AttendanceRecord {
  id: number;
  enrollment_class_id: number;
  class_session_id: number;
  status: AttendanceStatus | null;
  session_count: number;
  lesson_topic: string | null;
  reconciliation_state: ReconciliationState;
  
  teacher_status: AttendanceStatus | null;
  teacher_raw_value: string | null;
  teacher_note: string | null;
  teacher_submitted_at: string | null;
  teacher_user_id: number | null;
  teacher_user?: { id: number; name: string | null; email: string };

  cs_status: AttendanceStatus | null;
  cs_raw_value: string | null;
  cs_note: string | null;
  cs_submitted_at: string | null;
  cs_user_id: number | null;
  cs_user?: { id: number; name: string | null; email: string };

  resolved_by_id: number | null;
  resolved_at: string | null;
  resolution_note: string | null;
  resolved_by?: { id: number; name: string | null; email: string };

  enrollment_class: {
    id: number;
    enrollment: {
      id: number;
      student: {
        id: number;
        full_name: string;
        external_id: string | null;
        phone: string | null;
      };
      cs: { id: number; name: string | null; email: string };
      package: { id: number; name: string | null; code: string } | null;
    };
    class: { id: number; class_name: string; class_code: string | null };
  };

  class_session: {
    id: number;
    session_number: number;
    session_date: string;
    start_time: string | null;
    end_time: string | null;
    class: { id: number; class_name: string };
  };
}

export interface ReconciliationListResponse {
  items: AttendanceRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ResolveConflictRequest {
  finalStatus: AttendanceStatus;
  resolutionNote: string;
  sessionCount?: number;
}

export interface TeacherMarkRequest {
  status: AttendanceStatus;
  rawValue?: string;
  lessonTopic?: string;
  note?: string;
  sessionCount?: number;
}

export interface CSMarkRequest {
  status: AttendanceStatus;
  rawValue?: string;
  note?: string;
  sessionCount?: number;
}
