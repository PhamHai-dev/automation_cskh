import { apiClient } from '../../../api/client';
import { ClassSession, Attendance, CreateClassSessionDTO, UpdateClassSessionDTO, MarkAttendanceDTO, BulkMarkAttendanceDTO, UpdateAttendanceDTO } from '../types/classes.types';

export const classSessionsApi = {
  list: async (classId: number): Promise<ClassSession[]> => {
    const res = await apiClient.get(`/classes/${classId}/sessions`);
    return res.data.data;
  },

  get: async (classId: number, sessionId: number): Promise<ClassSession> => {
    const res = await apiClient.get(`/classes/${classId}/sessions/${sessionId}`);
    return res.data.data;
  },

  create: async (classId: number, data: CreateClassSessionDTO): Promise<ClassSession> => {
    const res = await apiClient.post(`/classes/${classId}/sessions`, data);
    return res.data.data;
  },

  update: async (classId: number, sessionId: number, data: UpdateClassSessionDTO): Promise<ClassSession> => {
    const res = await apiClient.patch(`/classes/${classId}/sessions/${sessionId}`, data);
    return res.data.data;
  },

  cancel: async (classId: number, sessionId: number): Promise<void> => {
    await apiClient.post(`/classes/${classId}/sessions/${sessionId}/cancel`);
  },
};

export const attendanceApi = {
  list: async (classId: number, sessionId: number): Promise<Attendance[]> => {
    const res = await apiClient.get(`/classes/${classId}/sessions/${sessionId}/attendance`);
    return res.data.data;
  },

  mark: async (classId: number, sessionId: number, data: MarkAttendanceDTO): Promise<Attendance> => {
    const res = await apiClient.post(`/classes/${classId}/sessions/${sessionId}/attendance`, data);
    return res.data.data;
  },

  bulkMark: async (classId: number, sessionId: number, data: BulkMarkAttendanceDTO): Promise<Attendance[]> => {
    const res = await apiClient.post(`/classes/${classId}/sessions/${sessionId}/attendance/bulk`, data);
    return res.data.data;
  },

  update: async (classId: number, sessionId: number, attendanceId: number, data: UpdateAttendanceDTO): Promise<Attendance> => {
    const res = await apiClient.patch(`/classes/${classId}/sessions/${sessionId}/attendance/${attendanceId}`, data);
    return res.data.data;
  },

  remove: async (classId: number, sessionId: number, attendanceId: number): Promise<void> => {
    await apiClient.delete(`/classes/${classId}/sessions/${sessionId}/attendance/${attendanceId}`);
  },
};
