import { apiClient } from '../../../api/client';
import {
  AttendanceRecord,
  ReconciliationListResponse,
  ResolveConflictRequest,
  TeacherMarkRequest,
  CSMarkRequest,
  ReconciliationStats,
  ReconciliationHistoryResponse,
  TeacherTrackingPendingResponse,
  TeacherTrackingHistoryResponse,
} from '../types/reconciliation.types';

export interface ReconciliationQueryParams {
  page?: number;
  limit?: number;
  pageSize?: number;
  classId?: number;
  csId?: number;
  teacherId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
  state?: 'PENDING_CS' | 'PENDING_TEACHER';
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

  getStats: async (params?: ReconciliationQueryParams): Promise<ReconciliationStats> => {
    const res = await apiClient.get('/attendance-reconciliation/stats', { params });
    return res.data.data;
  },

  getHistory: async (params?: ReconciliationQueryParams): Promise<ReconciliationHistoryResponse> => {
    const res = await apiClient.get('/attendance-reconciliation/history', { params });
    return res.data.data;
  },

  getTeacherTrackingPending: async (params?: ReconciliationQueryParams): Promise<TeacherTrackingPendingResponse> => {
    const res = await apiClient.get('/attendance-reconciliation/teacher-tracking/pending', { params });
    return res.data.data;
  },

  getTeacherTrackingCount: async (params?: ReconciliationQueryParams): Promise<{ count: number }> => {
    const res = await apiClient.get('/attendance-reconciliation/teacher-tracking/count', { params });
    return res.data.data;
  },

  getTeacherTrackingHistory: async (params?: ReconciliationQueryParams): Promise<TeacherTrackingHistoryResponse> => {
    const res = await apiClient.get('/attendance-reconciliation/teacher-tracking/history', { params });
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

  getTeacherSessions: async (params?: { startDate?: string; endDate?: string; teacherId?: number }): Promise<any[]> => {
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
