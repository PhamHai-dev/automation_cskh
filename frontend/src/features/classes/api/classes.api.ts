import { apiClient } from '../../../api/client';
import { Class, CreateClassDTO, UpdateClassDTO, AssignTeacherDTO } from '../types/classes.types';

export const classesApi = {
  list: async (): Promise<Class[]> => {
    const res = await apiClient.get('/classes');
    return res.data.data;
  },

  get: async (id: number): Promise<Class> => {
    const res = await apiClient.get(`/classes/${id}`);
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

  endTeacherAssignment: async (classId: number, assignmentId: number, data: { end_date: string | null }): Promise<any> => {
    const res = await apiClient.patch(`/classes/${classId}/teachers/${assignmentId}/end`, data);
    return res.data.data;
  }
};
