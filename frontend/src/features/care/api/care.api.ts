import { apiClient } from '../../../api/client';
import { CareLog, CreateCareLogDTO, CareTask, CreateCareTaskDTO, UpdateCareTaskDTO, TaskFilterParams } from '../types/care.types';

export const careApi = {
  // Care Logs
  getLogs: async (enrollmentId: number): Promise<CareLog[]> => {
    const res = await apiClient.get(`/enrollments/${enrollmentId}/care-logs`);
    return res.data.data;
  },

  createLog: async (enrollmentId: number, data: CreateCareLogDTO): Promise<CareLog> => {
    const res = await apiClient.post(`/enrollments/${enrollmentId}/care-logs`, data);
    return res.data.data;
  },

  // Care Tasks
  listTasks: async (params?: TaskFilterParams): Promise<CareTask[]> => {
    const res = await apiClient.get('/care-tasks', { params });
    return res.data.data;
  },

  getTask: async (id: number): Promise<CareTask> => {
    const res = await apiClient.get(`/care-tasks/${id}`);
    return res.data.data;
  },

  createTask: async (data: CreateCareTaskDTO): Promise<CareTask> => {
    const res = await apiClient.post('/care-tasks', data);
    return res.data.data;
  },

  updateTask: async (id: number, data: UpdateCareTaskDTO): Promise<CareTask> => {
    const res = await apiClient.patch(`/care-tasks/${id}`, data);
    return res.data.data;
  },

  completeTask: async (id: number): Promise<CareTask> => {
    const res = await apiClient.post(`/care-tasks/${id}/complete`);
    return res.data.data;
  },

  cancelTask: async (id: number): Promise<CareTask> => {
    const res = await apiClient.post(`/care-tasks/${id}/cancel`);
    return res.data.data;
  },
};
