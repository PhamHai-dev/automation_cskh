import { apiClient } from '../../../api/client';
import {
  AttendanceRecord,
  ReconciliationListResponse,
  ResolveConflictRequest,
  TeacherMarkRequest,
  CSMarkRequest,
} from '../types/reconciliation.types';

export interface ReconciliationQueryParams {
  page?: number;
  limit?: number;
  classId?: number;
  csId?: number;
  teacherId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export const reconciliationApi = {
  getConflicts: async (params?: ReconciliationQueryParams): Promise<ReconciliationListResponse> => {
    const res = await apiClient.get('/attendance-reconciliation/conflicts', { params });
    return res.data.data;
  },

  getPending: async (params?: ReconciliationQueryParams): Promise<ReconciliationListResponse> => {
    const res = await apiClient.get('/attendance-reconciliation/pending', { params });
    return res.data.data;
  },

  resolveConflict: async (
    attendanceId: number,
    data: ResolveConflictRequest
  ): Promise<AttendanceRecord> => {
    const res = await apiClient.post(
      `/attendance-reconciliation/${attendanceId}/resolve-conflict`,
      data
    );
    return res.data.data;
  },

  bulkApprovePending: async (
    attendanceIds: number[]
  ): Promise<{ approvedCount: number; approvedIds: number[] }> => {
    const res = await apiClient.post('/attendance-reconciliation/bulk-approve', {
      attendanceIds,
    });
    return res.data.data;
  },

  markByTeacher: async (
    attendanceId: number,
    data: TeacherMarkRequest
  ): Promise<AttendanceRecord> => {
    const res = await apiClient.post(
      `/attendance-reconciliation/${attendanceId}/teacher-mark`,
      data
    );
    return res.data.data;
  },

  markByCS: async (
    attendanceId: number,
    data: CSMarkRequest
  ): Promise<AttendanceRecord> => {
    const res = await apiClient.post(
      `/attendance-reconciliation/${attendanceId}/cs-mark`,
      data
    );
    return res.data.data;
  },

  getTeacherSessions: async (params?: { startDate?: string; endDate?: string }): Promise<any[]> => {
    const res = await apiClient.get('/attendance-reconciliation/teacher-sessions', { params });
    return res.data.data;
  },

  uploadTeacherExcel: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(
      '/attendance-reconciliation/upload-teacher-excel',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return res.data.data;
  },
};
