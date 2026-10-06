export interface CreateTeacherDTO {
  code?: string;
  name: string;
  phone?: string;
  email?: string;
  teacher_type?: 'VIETNAMESE' | 'JAPANESE' | 'OTHER';
  active?: boolean;
}

export interface UpdateTeacherDTO {
  code?: string;
  name?: string;
  phone?: string;
  email?: string;
  teacher_type?: 'VIETNAMESE' | 'JAPANESE' | 'OTHER';
  active?: boolean;
}

export interface ProvisionAccountDTO {
  email: string;
  password?: string;
}
