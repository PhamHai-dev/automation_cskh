export type AttendanceSide = 'TEACHER' | 'CS';

export interface MarkAttendanceDTO {
  enrollment_class_id: number;
  status: 'ATTENDED' | 'ABSENT_APPROVED_A' | 'LEAVE_B' | 'ABSENT_UNAPPROVED_C' | 'TEACHER_ABSENT_D' | 'TECH_ERROR_E';
  side?: AttendanceSide;
  lesson_topic?: string | null;
  teacher_note?: string | null;
  cs_note?: string | null;
}

export interface BulkMarkAttendanceDTO {
  items: Array<{
    enrollment_class_id: number;
    status: 'ATTENDED' | 'ABSENT_APPROVED_A' | 'LEAVE_B' | 'ABSENT_UNAPPROVED_C' | 'TEACHER_ABSENT_D' | 'TECH_ERROR_E';
    lesson_topic?: string | null;
    teacher_note?: string | null;
    cs_note?: string | null;
  }>;
  side?: AttendanceSide;
}

export interface UpdateAttendanceDTO {
  status?: 'ATTENDED' | 'ABSENT_APPROVED_A' | 'LEAVE_B' | 'ABSENT_UNAPPROVED_C' | 'TEACHER_ABSENT_D' | 'TECH_ERROR_E';
  side?: AttendanceSide;
  lesson_topic?: string | null;
  teacher_note?: string | null;
  cs_note?: string | null;
}
