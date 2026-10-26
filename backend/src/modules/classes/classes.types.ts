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

