export interface Student {
  id: number;
  full_name: string;
  gender?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  occupation?: string;
  zalo_uid?: string;
  note?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateStudentDTO {
  full_name: string;
  gender?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  occupation?: string;
  zalo_uid?: string;
  note?: string;
}

export interface UpdateStudentDTO extends Partial<CreateStudentDTO> {}
