import { apiClient } from '../../../api/client';
import { ImportType, UploadResponse, SheetPreviewData, ValidationReport, ImportBatchSummary, ImportRowItem } from '../types/imports.types';

export const importsApi = {
  upload: async (file: File, importType: ImportType): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('import_type', importType);

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
    data: { sheetName?: string; headerRowIndex?: number; columnMapping: Record<string, string> }
  ): Promise<{ success: boolean; columnMapping: Record<string, string> }> => {
    const res = await apiClient.post(`/imports/${importId}/mapping`, data);
    return res.data;
  },

  validate: async (importId: number): Promise<ValidationReport> => {
    const res = await apiClient.post(`/imports/${importId}/validate`);
    return res.data;
  },

  confirm: async (importId: number, skipErrors = true): Promise<ImportBatchSummary> => {
    const res = await apiClient.post(`/imports/${importId}/confirm`, { skipErrors });
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
};
