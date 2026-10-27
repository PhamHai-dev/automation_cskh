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
