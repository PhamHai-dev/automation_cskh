export interface CreateTeacherDTO {
  email: string;
  name: string;
  password?: string;
  phone?: string;
  teacher_code?: string;
  teacher_type?: 'VIETNAMESE' | 'JAPANESE' | 'OTHER';
}

export interface UpdateTeacherDTO {
  name?: string;
  phone?: string;
  teacher_code?: string;
  teacher_type?: 'VIETNAMESE' | 'JAPANESE' | 'OTHER';
  active?: boolean;
}
