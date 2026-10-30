import { apiClient } from '../../../api/client';
import { PaginatedMeta, PaginatedResponse, normalizePaginatedResponse } from '../../../api/pagination.types';
import { Class, CreateClassDTO, UpdateClassDTO, AssignTeacherDTO } from '../types/classes.types';

export type { PaginatedMeta, PaginatedResponse };

export interface ClassesListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  model_type?: string;
  model_filter?: string;
  program_type?: string;
  status?: string;
  package_name?: string;
  course_category?: string;
  course_level?: string;
  teacher_name?: string;
  teacher_code?: string;
  class_name?: string;
  schedule_pattern?: string;
  start_time?: string;
  sale?: string;
  total_sessions_op?: string;
  total_sessions_exact?: string | number;
  total_sessions_min?: string | number;
  total_sessions_max?: string | number;
  attended_sessions_op?: string;
  attended_sessions_exact?: string | number;
  attended_sessions_min?: string | number;
  attended_sessions_max?: string | number;
  remaining_sessions_op?: string;
  remaining_sessions_exact?: string | number;
  remaining_sessions_min?: string | number;
  remaining_sessions_max?: string | number;
  start_date_op?: string;
  start_date_exact?: string;
  start_date_from?: string;
  start_date_to?: string;
  end_date_op?: string;
  end_date_exact?: string;
  end_date_from?: string;
  end_date_to?: string;
  relevant_date?: string;
  session_from?: string;
  session_to?: string;
  summary_month?: string;
}

export const classesApi = {
  list: async (params?: ClassesListParams, signal?: AbortSignal): Promise<Class[]> => {
    const res = await apiClient.get('/classes', { params, signal });
    return res.data.data;
  },

  listPaginated: async (
    params?: ClassesListParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Class>> => {
    const res = await apiClient.get('/classes', { params, signal });
    return normalizePaginatedResponse<Class>(res.data, params);
  },

  get: async (id: number, signal?: AbortSignal): Promise<Class> => {
    const res = await apiClient.get(`/classes/${id}`, { signal });
    return res.data.data;
  },

  create: async (data: CreateClassDTO): Promise<Class> => {
    const res = await apiClient.post('/classes', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdateClassDTO): Promise<Class> => {
    const res = await apiClient.patch(`/classes/${id}`, data);
    return res.data.data;
  },

  assignTeacher: async (id: number, data: AssignTeacherDTO): Promise<any> => {
    const res = await apiClient.post(`/classes/${id}/teachers`, data);
    return res.data.data;
  },

  endTeacherAssignment: async (
    classId: number,
    assignmentId: number,
    data: { end_date: string | null }
  ): Promise<any> => {
    const res = await apiClient.patch(`/classes/${classId}/teachers/${assignmentId}/end`, data);
    return res.data.data;
  },
};
