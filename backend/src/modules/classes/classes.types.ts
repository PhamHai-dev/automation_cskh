export interface CreateClassDTO {
  class_code?: string;
  class_name: string;
  level?: string;
  model_type: 'ONE_TO_ONE' | 'GROUP';
  attendance_source: 'LEARNING_SYSTEM' | 'ZOOM';
}

export interface UpdateClassDTO {
  class_code?: string;
  class_name?: string;
  level?: string;
  model_type?: 'ONE_TO_ONE' | 'GROUP';
  attendance_source?: 'LEARNING_SYSTEM' | 'ZOOM';
  active?: boolean;
}

export interface AssignTeacherDTO {
  teacher_id: number;
  role: 'MAIN' | 'ASSISTANT' | 'SUBSTITUTE';
  start_date?: string | Date;
  end_date?: string | Date;
}
