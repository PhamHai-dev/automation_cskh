import { apiClient } from '../../../api/client';
import { Enrollment, CreateEnrollmentDTO, UpdateEnrollmentDTO } from '../types/enrollments.types';

export const enrollmentsApi = {
  list: async (params?: { sale?: string; program_type?: string; cs_id?: number }): Promise<Enrollment[]> => {
    const res = await apiClient.get('/enrollments', { params });
    return res.data.data;
  },

  get: async (id: number): Promise<Enrollment> => {
    const res = await apiClient.get(`/enrollments/${id}`);
    return res.data.data;
  },

  create: async (data: CreateEnrollmentDTO): Promise<Enrollment> => {
    const res = await apiClient.post('/enrollments', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdateEnrollmentDTO): Promise<Enrollment> => {
    const res = await apiClient.patch(`/enrollments/${id}`, data);
    return res.data.data;
  }
};
