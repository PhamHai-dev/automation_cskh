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

export interface TeacherListFilters {
  search?: string;
  active?: boolean;
  teacherType?: 'VIETNAMESE' | 'JAPANESE' | 'OTHER' | string;
}
