export interface CreateEnrollmentDTO {
  external_id?: string;
  student_id: number;
  package_id?: number;
  cs_id: number;
  total_sessions: number;
  start_date?: string | Date;
  end_date?: string | Date;
}

export interface UpdateEnrollmentDTO {
  external_id?: string;
  program_type?: 'JLPT' | 'KAIWA';
  program_metadata?: Record<string, any> | null;
  package_id?: number;
  total_sessions?: number;
  start_date?: string | Date;
  end_date?: string | Date;
  status?: 'WAITING_CLASS' | 'STUDYING' | 'PAUSED' | 'FINISHED' | 'UPCOMING' | 'NOT_STARTED' | 'CANCELLED';
}

export interface ReassignCSDTO {
  cs_id: number;
}

export interface TransferClassDTO {
  from_class_id: number;
  to_class_id: number;
  start_date?: string | Date;
}
