export interface TeacherProfile {
  id: number;
  user_id: number;
  teacher_code?: string;
  teacher_type?: 'VIETNAMESE' | 'JAPANESE' | 'OTHER';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Teacher {
  id: number;
  email: string;
  name: string;
  phone?: string;
  roles: string[];
  active: boolean;
  teacher_profile?: TeacherProfile;
}

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
