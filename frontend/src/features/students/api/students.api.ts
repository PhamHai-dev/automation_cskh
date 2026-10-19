import { apiClient } from '../../../api/client';
import { Student, CreateStudentDTO, UpdateStudentDTO } from '../types/students.types';

export const studentsApi = {
  list: async (params?: { program_type?: string; cs_id?: number }): Promise<Student[]> => {
    const res = await apiClient.get('/students', { params });
    return res.data.data;
  },

  get: async (id: number): Promise<Student> => {
    const res = await apiClient.get(`/students/${id}`);
    return res.data.data;
  },

  create: async (data: CreateStudentDTO): Promise<Student> => {
    const res = await apiClient.post('/students', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdateStudentDTO): Promise<Student> => {
    const res = await apiClient.patch(`/students/${id}`, data);
    return res.data.data;
  }
};
