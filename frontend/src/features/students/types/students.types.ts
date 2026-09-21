import { Enrollment } from '../../enrollments/types/enrollments.types';

export interface Student {
  id: number;
  external_id?: string | null;
  full_name: string;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  school?: string | null;
  occupation?: string | null;
  zalo_uid?: string | null;
  note?: string | null;
  enrollments?: Enrollment[];
  created_at: string;
  updated_at: string;
}

export interface CreateStudentDTO {
  external_id?: string;
  full_name: string;
  gender?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  parent_name?: string;
  parent_phone?: string;
  school?: string;
  occupation?: string;
  zalo_uid?: string;
  note?: string;
}

export interface UpdateStudentDTO extends Partial<CreateStudentDTO> {}
