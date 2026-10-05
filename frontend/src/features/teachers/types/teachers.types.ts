export interface TeacherUser {
  id: number;
  email: string;
  active: boolean;
  last_login_at?: string;
}

export interface Teacher {
  id: number;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  teacher_type?: 'VIETNAMESE' | 'JAPANESE' | 'OTHER';
  active: boolean;
  user_id?: number | null;
  user?: TeacherUser | null;
  created_at?: string;
  updated_at?: string;
}

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
