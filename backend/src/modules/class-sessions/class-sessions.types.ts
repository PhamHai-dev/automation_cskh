export interface CreateClassSessionDTO {
  session_number: number;
  session_date: string;
  start_time?: string;
  end_time?: string;
  teacher_id?: number;
  status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
}

export interface UpdateClassSessionDTO {
  session_number?: number;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  teacher_id?: number;
  status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
}

export interface CancelClassSessionDTO {
  reason?: string;
}
