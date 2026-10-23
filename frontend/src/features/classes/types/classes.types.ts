import { Teacher } from '../../teachers/types/teachers.types';

export interface ClassTeacher {
  id: number;
  class_id: number;
  teacher_id: number;
  role: 'MAIN' | 'ASSISTANT' | 'SUBSTITUTE';
  start_date: string | null;
  end_date: string | null;
  teacher?: Teacher;
}

export type ClassModelType = '1:1' | '1:2' | '1:n' | string;

export interface Class {
  id: number;
  class_code?: string;
  class_name: string;
  level?: string;
  model_type: ClassModelType;
  attendance_source: 'LEARNING_SYSTEM' | 'ZOOM';
  active: boolean;
  class_teachers?: ClassTeacher[];
  class_sessions?: ClassSession[];
  enrollment_classes?: any[];
  class_schedules?: any[];
  created_at: string;
  updated_at: string;
}

export const formatClassCode = (code?: string | null, id?: number): string => {
  const trimmed = code ? code.trim() : '';
  if (trimmed && !/^(CLS_|id\d+$)/i.test(trimmed)) {
    return trimmed;
  }
  if (id && id > 0) {
    return `class_${String(id).padStart(4, '0')}`;
  }
  return trimmed || '—';
};

export interface CreateClassDTO {
  class_code?: string;
  class_name: string;
  level?: string;
  model_type: '1:1' | '1:2' | '1:n';
  attendance_source?: 'LEARNING_SYSTEM' | 'ZOOM';
}

export interface UpdateClassDTO {
  class_code?: string;
  class_name?: string;
  level?: string;
  model_type?: '1:1' | '1:2' | '1:n';
  attendance_source?: 'LEARNING_SYSTEM' | 'ZOOM';
  active?: boolean;
}

export interface AssignTeacherDTO {
  teacher_id: number;
  role: 'MAIN' | 'ASSISTANT' | 'SUBSTITUTE';
  start_date?: string;
  end_date?: string;
}

// ---- ClassSession ----

export type ClassSessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface ClassSession {
  id: number;
  class_id: number;
  session_number: number;
  session_date: string;
  start_time?: string;
  end_time?: string;
  teacher_id?: number;
  status: ClassSessionStatus;
  attendance?: Attendance[];
  created_by_id: number;
  created_by?: { id: number; name: string; email: string };
  created_at: string;
  updated_at: string;
}

export interface CreateClassSessionDTO {
  session_number?: number;
  session_date: string;
  start_time?: string;
  end_time?: string;
  teacher_id?: number;
}

export interface UpdateClassSessionDTO extends Partial<CreateClassSessionDTO> {
  status?: ClassSessionStatus;
}

// ---- Attendance ----

export type AttendanceStatus = 'ATTENDED' | 'ABSENT_APPROVED_A' | 'LEAVE_B' | 'ABSENT_UNAPPROVED_C' | 'TEACHER_ABSENT_D' | 'TECH_ERROR_E';

export type AttendanceSource = 'MANUAL' | 'EXCEL_IMPORT' | 'TEACHER_UPLOAD';

export type AttendanceSide = 'TEACHER' | 'CS' | 'ADMIN';
export type ReconciliationState = 'PENDING_TEACHER' | 'PENDING_CS' | 'MATCHED' | 'CONFLICT' | 'RESOLVED';

export interface Attendance {
  id: number;
  enrollment_class_id: number;
  class_session_id: number;
  status: AttendanceStatus;
  source: AttendanceSource;
  teacher_status?: AttendanceStatus | null;
  cs_status?: AttendanceStatus | null;
  lesson_topic?: string | null;
  teacher_note?: string | null;
  cs_note?: string | null;
  teacher_submitted_at?: string | null;
  cs_submitted_at?: string | null;
  reconciliation_state?: ReconciliationState;
  created_by_id: number;
  created_by?: { id: number; name: string; email: string };
  enrollment_class?: {
    id: number;
    enrollment?: {
      id: number;
      student?: { id: number; full_name: string; phone: string; email?: string | null; external_id?: string | null };
      package?: { id: number; name: string; code: string };
      cs?: { id: number; name: string; email: string };
    };
  };
  class_session?: ClassSession;
  created_at: string;
  updated_at: string;
}

export interface MarkAttendanceDTO {
  enrollment_class_id: number;
  status: AttendanceStatus;
  side?: AttendanceSide;
  lesson_topic?: string | null;
  teacher_note?: string | null;
  cs_note?: string | null;
}

export interface BulkMarkAttendanceDTO {
  items: Array<{
    enrollment_class_id: number;
    status: AttendanceStatus;
    lesson_topic?: string | null;
    teacher_note?: string | null;
    cs_note?: string | null;
  }>;
  side?: AttendanceSide;
}

export interface UpdateAttendanceDTO {
  status?: AttendanceStatus;
  side?: AttendanceSide;
  lesson_topic?: string | null;
  teacher_note?: string | null;
  cs_note?: string | null;
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  ATTENDED: 'Có mặt',
  ABSENT_APPROVED_A: 'Nghỉ phép (A)',
  LEAVE_B: 'Bảo lưu (B)',
  ABSENT_UNAPPROVED_C: 'Nghỉ sai (C)',
  TEACHER_ABSENT_D: 'GV nghỉ (D)',
  TECH_ERROR_E: 'Lỗi kỹ thuật (E)',
};

export const SESSION_STATUS_LABELS: Record<ClassSessionStatus, string> = {
  SCHEDULED: 'Chưa diễn ra',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
};
