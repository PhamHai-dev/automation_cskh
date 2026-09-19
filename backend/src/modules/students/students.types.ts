export interface CreateStudentDTO {
  full_name: string;
  gender?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string | Date;
  occupation?: string;
  zalo_uid?: string;
  note?: string;
}

export interface UpdateStudentDTO {
  full_name?: string;
  gender?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string | Date;
  occupation?: string;
  zalo_uid?: string;
  note?: string;
}
