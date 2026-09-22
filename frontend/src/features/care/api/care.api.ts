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

  // Milestones
  getMilestones: async (): Promise<Array<{ id: number; session_number: number; display_order: number }>> => {
    const res = await apiClient.get('/milestones');
    return res.data.data;
  },

  addMilestone: async (session_number: number): Promise<{ id: number; session_number: number; display_order: number }> => {
    const res = await apiClient.post('/milestones', { session_number });
    return res.data.data;
  },

  // Update Enrollment Care Fields
  updateEnrollmentCare: async (
    enrollmentId: number,
    data: {
      study_report_url?: string | null;
      exchange_info?: string | null;
      callback_note?: string | null;
      hot_issue_note?: string | null;
      post_course_care?: string | null;
    }
  ): Promise<any> => {
    const res = await apiClient.put(`/enrollments/${enrollmentId}/care`, data);
    return res.data.data;
  },

  // Save Session Care Log
  saveSessionCareLog: async (
    enrollmentId: number,
    sessionNumber: number,
    data: {
      content: string;
      outcome?: string;
    }
  ): Promise<any> => {
    const res = await apiClient.put(`/enrollments/${enrollmentId}/sessions/${sessionNumber}/care-log`, data);
    return res.data.data;
  },
};
