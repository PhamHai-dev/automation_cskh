import { apiClient } from '../../../api/client';
import { Teacher, CreateTeacherDTO, UpdateTeacherDTO } from '../types/teachers.types';

export const teachersApi = {
  list: async (): Promise<Teacher[]> => {
    const res = await apiClient.get('/teachers');
    return res.data.data;
  },

  get: async (id: number): Promise<Teacher> => {
    const res = await apiClient.get(`/teachers/${id}`);
    return res.data.data;
  },

  create: async (data: CreateTeacherDTO): Promise<Teacher> => {
    const res = await apiClient.post('/teachers', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdateTeacherDTO): Promise<Teacher> => {
    const res = await apiClient.patch(`/teachers/${id}`, data);
    return res.data.data;
  }
};
