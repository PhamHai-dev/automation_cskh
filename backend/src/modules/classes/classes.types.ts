import { ClassModelType, AttendanceSourceType } from '@prisma/client';

export type ClassModelInput = '1:1' | '1:2' | '1:n' | 'ONE_TO_ONE' | 'ONE_TO_TWO' | 'ONE_TO_N';

export interface CreateClassDTO {
  class_code?: string;
  class_name: string;
  level?: string;
  model_type: ClassModelInput | ClassModelType;
  attendance_source?: AttendanceSourceType | 'LEARNING_SYSTEM' | 'ZOOM';
}

export interface UpdateClassDTO {
  class_code?: string;
  class_name?: string;
  level?: string;
  model_type?: ClassModelInput | ClassModelType;
  attendance_source?: AttendanceSourceType | 'LEARNING_SYSTEM' | 'ZOOM';
  active?: boolean;
}

export interface AssignTeacherDTO {
  teacher_id: number;
  role: 'MAIN' | 'ASSISTANT' | 'SUBSTITUTE';
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  active?: boolean;
}

/**
 * D8 owner ruling (2026-10-26): Admin "Kết thúc phân công" requires an
 * EXPLICIT end_date — never defaulted to today. Optional here so the service
 * validator produces the termination-specific 422 messages instead of a
 * generic 400 Zod error.
 */
export interface EndTeacherAssignmentDTO {
  end_date?: string | Date | null;
}

