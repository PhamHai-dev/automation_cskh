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

export type TeacherAccountStatusFilter =
  | 'HAS_ACCOUNT'
  | 'NO_ACCOUNT'
  | 'ACTIVE_ACCOUNT'
  | 'LOCKED_ACCOUNT'
  | 'PROVISIONED'
  | 'UNPROVISIONED'
  | string;

export interface TeacherListFilters {
  page?: number;
  pageSize?: number;
  isPaginated?: boolean;
  search?: string;
  active?: boolean;
  teacherType?: 'VIETNAMESE' | 'JAPANESE' | 'OTHER' | string;
  accountStatus?: TeacherAccountStatusFilter;
}

export interface TeacherListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TeacherListResult<T = any> {
  data: T[];
  meta: TeacherListMeta;
}
