import { apiClient } from '../../../api/client';
import { PaginatedMeta, PaginatedResponse, normalizePaginatedResponse } from '../../../api/pagination.types';
import { Enrollment, CreateEnrollmentDTO, UpdateEnrollmentDTO } from '../types/enrollments.types';

export type { PaginatedMeta, PaginatedResponse };

export interface EnrollmentsListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sale?: string;
  program_type?: string;
  cs_id?: number;
  status?: string;
  package_name?: string;
  course_category?: string;
  course_level?: string;
  teacher_name?: string;
  teacher_code?: string;
  class_name?: string;
  model_filter?: string;
  schedule_pattern?: string;
  start_time?: string;
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
  session_from?: string;
  session_to?: string;
  summary_month?: string;
}

export const enrollmentsApi = {
  list: async (params?: EnrollmentsListParams, signal?: AbortSignal): Promise<Enrollment[]> => {
    const res = await apiClient.get('/enrollments', { params, signal });
    return res.data.data;
  },

  listPaginated: async (
    params?: EnrollmentsListParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Enrollment>> => {
    const res = await apiClient.get('/enrollments', { params, signal });
    return normalizePaginatedResponse<Enrollment>(res.data, params);
  },

  get: async (id: number, signal?: AbortSignal): Promise<Enrollment> => {
    const res = await apiClient.get(`/enrollments/${id}`, { signal });
    return res.data.data;
  },

  create: async (data: CreateEnrollmentDTO): Promise<Enrollment> => {
    const res = await apiClient.post('/enrollments', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdateEnrollmentDTO): Promise<Enrollment> => {
    const res = await apiClient.patch(`/enrollments/${id}`, data);
    return res.data.data;
  },
};
