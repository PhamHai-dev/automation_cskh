import { apiClient } from '../../../api/client';
import { PaginatedMeta, PaginatedResponse, normalizePaginatedResponse } from '../../../api/pagination.types';
import { Student, CreateStudentDTO, UpdateStudentDTO } from '../types/students.types';

export type { PaginatedMeta, PaginatedResponse };

export interface StudentsListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  program_type?: string;
  cs_id?: number;
  cvht?: string;
  gender?: string;
  status?: string;
  sale?: string;
}

export const studentsApi = {
  list: async (params?: StudentsListParams, signal?: AbortSignal): Promise<Student[]> => {
    const res = await apiClient.get('/students', { params, signal });
    return res.data.data;
  },

  listPaginated: async (
    params?: StudentsListParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Student>> => {
    const res = await apiClient.get('/students', { params, signal });
    return normalizePaginatedResponse<Student>(res.data, params);
  },

  get: async (id: number, signal?: AbortSignal): Promise<Student> => {
    const res = await apiClient.get(`/students/${id}`, { signal });
    return res.data.data;
  },

  create: async (data: CreateStudentDTO): Promise<Student> => {
    const res = await apiClient.post('/students', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdateStudentDTO): Promise<Student> => {
    const res = await apiClient.patch(`/students/${id}`, data);
    return res.data.data;
  },
};
