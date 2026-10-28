import { apiClient } from '../../../api/client';
import { PaginatedMeta, PaginatedResponse, normalizePaginatedResponse } from '../../../api/pagination.types';
import { Class, CreateClassDTO, UpdateClassDTO, AssignTeacherDTO } from '../types/classes.types';

export type { PaginatedMeta, PaginatedResponse };

export interface ClassesListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  model_type?: string;
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
