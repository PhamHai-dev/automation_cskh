import { apiClient } from '../../../api/client';
import { PaginatedMeta, PaginatedResponse, normalizePaginatedResponse } from '../../../api/pagination.types';
import { Teacher, CreateTeacherDTO, UpdateTeacherDTO, ProvisionAccountDTO } from '../types/teachers.types';

export type { PaginatedMeta, PaginatedResponse };

export interface TeachersListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  teacher_type?: string;
  account_status?: string;
  active?: boolean;
}

export const teachersApi = {
  list: async (params?: TeachersListParams, signal?: AbortSignal): Promise<Teacher[]> => {
    const res = await apiClient.get('/teachers', { params, signal });
    return res.data.data;
  },

  listPaginated: async (
    params?: TeachersListParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Teacher>> => {
    const res = await apiClient.get('/teachers', { params, signal });
    return normalizePaginatedResponse<Teacher>(res.data, params);
  },

  get: async (id: number, signal?: AbortSignal): Promise<Teacher> => {
    const res = await apiClient.get(`/teachers/${id}`, { signal });
    return res.data.data;
  },

  create: async (data: CreateTeacherDTO): Promise<Teacher> => {
    const res = await apiClient.post('/teachers', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdateTeacherDTO): Promise<Teacher> => {
    const res = await apiClient.patch(`/teachers/${id}`, data);
    return res.data.data;
  },

  provisionAccount: async (id: number, data: ProvisionAccountDTO): Promise<Teacher> => {
    const res = await apiClient.post(`/teachers/${id}/account`, data);
    return res.data.data;
  },
};
