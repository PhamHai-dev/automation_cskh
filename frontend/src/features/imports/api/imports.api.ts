import { apiClient } from '../../../api/client';
import { UploadResponse, SheetPreviewData, ValidationReport, ImportBatchSummary, ImportRowItem } from '../types/imports.types';

export const importsApi = {
  upload: async (file: File, assignedCsId?: number): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (assignedCsId) {
      formData.append('assigned_cs_id', String(assignedCsId));
    }

    const res = await apiClient.post('/imports/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  getPreview: async (importId: number, sheetName?: string, limit = 10): Promise<SheetPreviewData> => {
    const res = await apiClient.get(`/imports/${importId}/preview`, {
      params: { sheetName, limit },
    });
    return res.data;
  },

  saveMapping: async (
    importId: number,
    data: {
      sheet: 'studentEnrollment' | 'attendance';
      headerRowIndex?: number;
      columnMapping: Record<string, string>;
      assignedCsId?: number;
      selectedMonth?: number;
      selectedYear?: number;
    }
  ): Promise<{ success: boolean; columnMapping: Record<string, string>; assignedCsId?: number }> => {
    const res = await apiClient.post(`/imports/${importId}/mapping`, {
      ...data,
      assigned_cs_id: data.assignedCsId,
    });
    return res.data;
  },

  validate: async (importId: number, assignedCsId?: number): Promise<ValidationReport> => {
    const res = await apiClient.post(`/imports/${importId}/validate`, {
      assigned_cs_id: assignedCsId,
    });
    return res.data;
  },

  confirm: async (importId: number, skipErrors = true, assignedCsId?: number): Promise<ImportBatchSummary> => {
    const res = await apiClient.post(`/imports/${importId}/confirm`, {
      skipErrors,
      assigned_cs_id: assignedCsId,
    });
    return res.data;
  },

  getBatch: async (importId: number): Promise<ImportBatchSummary> => {
    const res = await apiClient.get(`/imports/${importId}`);
    return res.data;
  },

  listBatches: async (limit = 20, offset = 0): Promise<{ items: ImportBatchSummary[]; total: number }> => {
    const res = await apiClient.get('/imports/batches', {
      params: { limit, offset },
    });
    return res.data;
  },

  getErrors: async (importId: number): Promise<ImportRowItem[]> => {
    const res = await apiClient.get(`/imports/${importId}/errors`);
    return res.data;
  },

  downloadErrors: async (importId: number, fileName = 'errors.xlsx'): Promise<void> => {
    const res = await apiClient.get(`/imports/${importId}/errors?download=true`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  downloadTemplate: async (type: 'student_enrollment' | 'attendance'): Promise<void> => {
    const res = await apiClient.get(`/imports/template/${type}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `template_${type}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  exportStudents: async (): Promise<void> => {
    const res = await apiClient.get('/imports/export/students', {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'students_enrollments_export.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  exportAttendance: async (): Promise<void> => {
    const res = await apiClient.get('/imports/export/attendance', {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'attendance_export.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  listCreateRequests: async (status = 'PENDING', page = 1, pageSize = 20) => {
    const res = await apiClient.get('/imports/create-requests', { params: { status, page, pageSize } });
    return res.data;
  },
  approveCreateRequest: async (id: number, version: number, assignedCsId?: number) => {
    const res = await apiClient.post(`/imports/create-requests/${id}/approve`, { version, assignedCsId });
    return res.data;
  },
  rejectCreateRequest: async (id: number, version: number, reason: string) => {
    const res = await apiClient.post(`/imports/create-requests/${id}/reject`, { version, reason });
    return res.data;
  },
};
