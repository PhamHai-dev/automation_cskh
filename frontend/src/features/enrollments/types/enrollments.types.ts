import { Student } from '../../students/types/students.types';
import { Package } from '../../packages/types/packages.types';

export interface Enrollment {
  id: number;
  external_id?: string;
  student_id: number;
  package_id?: number;
  cs_id: number;
  total_sessions: number;
  completed_sessions?: number;
  start_date?: string;
  end_date?: string;
  status: 'NOT_STARTED' | 'STUDYING' | 'PAUSED' | 'FINISHED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
  student?: Student;
  package?: Package;
  cs?: {
    id: number;
    name: string;
    email: string;
  };
}

export interface CreateEnrollmentDTO {
  external_id?: string;
  student_id: number;
  package_id?: number;
  cs_id: number;
  total_sessions: number;
  start_date?: string;
  end_date?: string;
}

export interface UpdateEnrollmentDTO {
  external_id?: string;
  package_id?: number;
  total_sessions?: number;
  start_date?: string;
  end_date?: string;
  status?: 'NOT_STARTED' | 'STUDYING' | 'PAUSED' | 'FINISHED' | 'CANCELLED';
}
