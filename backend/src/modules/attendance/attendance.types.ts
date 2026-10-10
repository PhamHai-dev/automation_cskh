export type AttendanceSide = 'TEACHER' | 'CS';

export interface MarkAttendanceDTO {
  enrollment_class_id: number;
  status: 'ATTENDED' | 'ABSENT_APPROVED_A' | 'LEAVE_B' | 'ABSENT_UNAPPROVED_C' | 'TEACHER_ABSENT_D' | 'TECH_ERROR_E';
  side?: AttendanceSide;
}

export interface BulkMarkAttendanceDTO {
  items: Array<{
    enrollment_class_id: number;
    status: 'ATTENDED' | 'ABSENT_APPROVED_A' | 'LEAVE_B' | 'ABSENT_UNAPPROVED_C' | 'TEACHER_ABSENT_D' | 'TECH_ERROR_E';
  }>;
  side?: AttendanceSide;
}

export interface UpdateAttendanceDTO {
  status?: 'ATTENDED' | 'ABSENT_APPROVED_A' | 'LEAVE_B' | 'ABSENT_UNAPPROVED_C' | 'TEACHER_ABSENT_D' | 'TECH_ERROR_E';
  side?: AttendanceSide;
}
