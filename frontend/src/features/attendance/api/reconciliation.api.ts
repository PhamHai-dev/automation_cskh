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

export type AttendanceImportSource = 'CSKH' | 'TEACHER';
export type AttendanceImportAction = 'APPLY' | 'KEEP_DATABASE' | 'SKIP';
export interface AttendanceImportItem {
  id: string;
  externalId: string;
  cellAddress: string;
  sourceDate: string;
  targetDate: string | null;
  rawValue: string;
  status: string | null;
  sessionCount: number;
  classification: string;
  defaultAction: AttendanceImportAction;
  messages: string[];
  sessionPlans: Array<{ startTime: string; endTime: string; action: string }>;
}
export interface AttendanceImportPreview { source: AttendanceImportSource; targetYear: number; sheetName: string; totalItems: number; summary: Record<string, number>; items: AttendanceImportItem[] }
export interface AttendanceImportResultItem { id: string; externalId: string; cellAddress: string; targetDate: string | null; rawValue: string; action: AttendanceImportAction; createdSessions: number; createdAttendances: number; updatedAttendances: number; skipped: boolean }
export interface AttendanceImportResult { createdSessions: number; createdAttendances: number; updatedAttendances: number; skipped: number; items: AttendanceImportResultItem[] }

export const attendanceImportApi = {
  preview: async (file: File, source: AttendanceImportSource, targetYear: number): Promise<AttendanceImportPreview> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', source);
    formData.append('targetYear', String(targetYear));
    const res = await apiClient.post('/attendance-reconciliation/import-excel/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data.data;
  },
  confirm: async (file: File, source: AttendanceImportSource, targetYear: number, actions: Record<string, AttendanceImportAction>): Promise<AttendanceImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', source);
    formData.append('targetYear', String(targetYear));
    formData.append('actions', JSON.stringify(actions));
    const res = await apiClient.post('/attendance-reconciliation/import-excel/confirm', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data.data;
  },
};
