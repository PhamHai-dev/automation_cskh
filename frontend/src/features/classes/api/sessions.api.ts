import { apiClient } from '../../../api/client';
import { ClassSession, Attendance, AttendanceSide, CreateClassSessionDTO, UpdateClassSessionDTO, MarkAttendanceDTO, BulkMarkAttendanceDTO, UpdateAttendanceDTO } from '../types/classes.types';

/**
 * Body for the teacher "ghi ca thực học" flow.
 * `idempotency_key` is a client-generated intent key: mint a fresh value per deliberate
 * user action (one per "ghi ca" click intent), and reuse the SAME value only when replaying
 * the exact same request after a network failure. The backend replays the same key to one
 * session; distinct keys on the same day each create their own session.
 */
export interface CreateActualClassSessionDTO {
  idempotency_key: string;
  enrollment_class_id: number;
  session_date: string;
  start_time?: string;
  end_time?: string;
  teacher_id?: number;
}

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

  createActual: async (classId: number, data: CreateActualClassSessionDTO): Promise<ClassSession> => {
    const res = await apiClient.post(`/classes/${classId}/sessions/actual`, data);
    return res.data.data;
  },

  update: async (classId: number, sessionId: number, data: UpdateClassSessionDTO): Promise<ClassSession> => {
    const res = await apiClient.patch(`/classes/${classId}/sessions/${sessionId}`, data);
    return res.data.data;
  },

  cancel: async (classId: number, sessionId: number, reason?: string): Promise<void> => {
    await apiClient.post(`/classes/${classId}/sessions/${sessionId}/cancel`, { reason });
  },

  remove: async (classId: number, sessionId: number, confirm = false): Promise<{ attendanceCount: number }> => {
    const res = await apiClient.delete(`/classes/${classId}/sessions/${sessionId}`, {
      params: { confirm },
    });
    return res.data.data;
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

  remove: async (classId: number, sessionId: number, attendanceId: number, side?: AttendanceSide): Promise<void> => {
    await apiClient.delete(`/classes/${classId}/sessions/${sessionId}/attendance/${attendanceId}`, { params: { side } });
  },
};
