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

export interface ClassEnrollmentAttendanceStats {
  totalAttendedAdmin: number;
  totalAttendedTeacher: number;
  monthAttendedAdmin: number;
  monthAttendedTeacher: number;
}

export interface ClassListQueryOptions {
  accessibleClassIds?: number[] | null;
  page?: number;
  pageSize?: number;
  isPaginated?: boolean;
  search?: string;
  modelType?: string;
  active?: boolean;
  relevantDate?: string;
  sessionFrom?: string;
  sessionTo?: string;
  summaryMonth?: string;
}

export interface ClassListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets?: Record<string, any>;
  filterOptions?: Record<string, any>;
}

export interface ClassListResult<T = any> {
  data: T[];
  meta: ClassListMeta;
}
