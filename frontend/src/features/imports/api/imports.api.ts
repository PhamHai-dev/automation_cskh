import { apiClient } from '../../../api/client';
import {
  UploadResponse,
  SheetPreviewData,
  ValidationReport,
  ImportBatchSummary,
  ImportRowItem,
  GoogleSheetSyncConfig,
  CsUserOption,
  CreateGoogleSheetSyncConfigDTO,
  UpdateGoogleSheetSyncConfigDTO,
  SheetSyncResult,
  ServiceAccountInfo,
  CsSheetBackupConfigItem,
  UpdateCsSheetBackupConfigDTO,
  CsSheetBackupSummary,
  BackupHistoryResponse,
  SyncHistoryResponse,
  SyncFlowType,
  SyncFlowCounts,
  SyncFilterConfig,
  BulkPasteLinksResponse,
  SyncPreviewResponse,
  SyncCommitResponse,
  SyncHistoryDetailResponse,
  SyncRollbackResponse,
} from '../types/imports.types';

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

  // Google Sheet Sync (4 Flows: STUDENT_MASTER, CSKH_ATTENDANCE, TEACHER_ATTENDANCE, STUDY_REPORT)
  getSheetSyncConfigs: async (params?: {
    flowType?: SyncFlowType | 'ALL';
    programType?: string;
    sourceType?: string;
    enabled?: boolean;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    configs: GoogleSheetSyncConfig[];
    csUsers: CsUserOption[];
    serviceAccount?: ServiceAccountInfo;
    flowCounts?: SyncFlowCounts;
    total?: number;
  }> => {
    const res = await apiClient.get('/imports/sheet-sync/configs', { params });
    return res.data?.data || res.data;
  },

  createSheetSyncConfig: async (
    payload: CreateGoogleSheetSyncConfigDTO
  ): Promise<GoogleSheetSyncConfig> => {
    const res = await apiClient.post('/imports/sheet-sync/configs', payload);
    return res.data?.data || res.data;
  },

  deleteSheetSyncConfig: async (code: string): Promise<{ deleted: boolean; code: string }> => {
    const res = await apiClient.delete(`/imports/sheet-sync/configs/${encodeURIComponent(code)}`);
    return res.data?.data || res.data;
  },

  bulkPasteSheetSyncLinks: async (payload: {
    mode: 'VALIDATE_ONLY' | 'CREATE';
    flow_type: SyncFlowType;
    program_type: 'JLPT' | 'KAIWA' | string;
    enabled?: boolean;
    sync_interval_minutes?: number;
    sync_year?: number | null;
    raw_text: string;
  }): Promise<BulkPasteLinksResponse> => {
    const res = await apiClient.post('/imports/sheet-sync/configs/bulk-links', payload);
    return res.data?.data || res.data;
  },

  previewSheetSyncConfig: async (
    code: string,
    payload?: {
      sync_year?: number | null;
      filter_config?: SyncFilterConfig | null;
      forceFullSync?: boolean;
    }
  ): Promise<SyncPreviewResponse> => {
    const res = await apiClient.post(
      `/imports/sheet-sync/configs/${encodeURIComponent(code)}/preview`,
      payload || {}
    );
    return res.data?.data || res.data;
  },

  commitSheetSyncPreview: async (
    code: string,
    payload: {
      previewToken?: string;
      selectedItemKeys?: string[];
      sync_year?: number | null;
      filter_config?: SyncFilterConfig | null;
    }
  ): Promise<SyncCommitResponse> => {
    const res = await apiClient.post(
      `/imports/sheet-sync/configs/${encodeURIComponent(code)}/commit`,
      payload
    );
    return res.data?.data || res.data;
  },

  getSheetSyncHistoryDetail: async (runId: number | string): Promise<SyncHistoryDetailResponse> => {
    const res = await apiClient.get(`/imports/sheet-sync/history/${runId}`);
    return res.data?.data || res.data;
  },

  rollbackSheetSyncHistory: async (
    runId: number | string,
    payload?: {
      changeIds?: number[];
      rollbackAll?: boolean;
      forceOverwriteConflicts?: boolean;
    }
  ): Promise<SyncRollbackResponse> => {
    const res = await apiClient.post(
      `/imports/sheet-sync/history/${runId}/rollback`,
      payload || { rollbackAll: true }
    );
    return res.data?.data || res.data;
  },

  saveServiceAccount: async (
    serviceAccountJson: string | null
  ): Promise<{ serviceAccount: ServiceAccountInfo }> => {
    const res = await apiClient.put('/imports/sheet-sync/service-account', {
      service_account_json: serviceAccountJson,
    });
    return res.data?.data || res.data;
  },

  updateSheetSyncConfig: async (
    code: string,
    payload: UpdateGoogleSheetSyncConfigDTO
  ): Promise<GoogleSheetSyncConfig> => {
    const res = await apiClient.put(`/imports/sheet-sync/configs/${encodeURIComponent(code)}`, payload);
    return res.data?.data || res.data;
  },

  uploadSheetSyncLocalFile: async (
    code: string,
    file: File
  ): Promise<{
    local_file_path: string;
    file_name: string;
    config: GoogleSheetSyncConfig;
  }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(
      `/imports/sheet-sync/configs/${encodeURIComponent(code)}/upload-file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return res.data?.data || res.data;
  },

  runSheetSync: async (
    code: string,
    options?: { forceFullSync?: boolean; limit?: number }
  ): Promise<SheetSyncResult> => {
    const res = await apiClient.post(`/imports/sheet-sync/configs/${encodeURIComponent(code)}/sync`, options || {});
    return res.data?.data || res.data;
  },

  runSheetSyncAll: async (options?: {
    forceFullSync?: boolean;
    limit?: number;
    flowType?: SyncFlowType;
  }): Promise<{ results: SheetSyncResult[] }> => {
    const res = await apiClient.post('/imports/sheet-sync/sync-all', options || {});
    return res.data?.data || res.data;
  },

  getSheetSyncHistory: async (params?: {
    configId?: number;
    code?: string;
    flowType?: SyncFlowType | string;
    programType?: string;
    triggerType?: string;
    status?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SyncHistoryResponse> => {
    const res = await apiClient.get('/imports/sheet-sync/history', { params });
    return res.data?.data || res.data;
  },

  // CS Sheet Backup (Web -> Sheet Kaiwa, JLPT & Teacher)
  getSheetBackupConfigs: async (): Promise<{
    configs: CsSheetBackupConfigItem[];
    serviceAccount?: ServiceAccountInfo;
    availableYears?: number[];
  }> => {
    const res = await apiClient.get('/imports/sheet-backup/configs');
    return res.data?.data || res.data;
  },

  updateSheetBackupConfig: async (
    configId: number,
    payload: UpdateCsSheetBackupConfigDTO
  ): Promise<CsSheetBackupConfigItem> => {
    const res = await apiClient.put(`/imports/sheet-backup/configs/${configId}`, payload);
    return res.data?.data || res.data;
  },

  createSheetBackupConfig: async (
    payload: UpdateCsSheetBackupConfigDTO & { cs_user_id?: number; program_type: string }
  ): Promise<CsSheetBackupConfigItem> => {
    const res = await apiClient.post('/imports/sheet-backup/configs', payload);
    return res.data?.data || res.data;
  },

  deleteSheetBackupConfig: async (
    configId: number
  ): Promise<{ deleted: boolean; id: number }> => {
    const res = await apiClient.delete(`/imports/sheet-backup/configs/${configId}`);
    return res.data?.data || res.data;
  },

  runSheetBackup: async (
    configId: number,
    options?: { forceFullRewrite?: boolean; year?: number | null }
  ): Promise<CsSheetBackupSummary> => {
    const res = await apiClient.post(`/imports/sheet-backup/configs/${configId}/run`, options || {});
    return res.data?.data || res.data;
  },

  runSheetBackupAll: async (options?: {
    forceFullRewrite?: boolean;
    year?: number | null;
    programType?: string | null;
  }): Promise<{ results: CsSheetBackupSummary[] }> => {
    const res = await apiClient.post('/imports/sheet-backup/run-all', options || {});
    return res.data?.data || res.data;
  },

  getSheetBackupHistory: async (params?: {
    configId?: number;
    csUserId?: number;
    programType?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<BackupHistoryResponse> => {
    const res = await apiClient.get('/imports/sheet-backup/history', { params });
    return res.data?.data || res.data;
  },

  downloadCsSheetBackupExcel: async (
    configId: number,
    fileName: string,
    refresh = false
  ): Promise<void> => {
    const res = await apiClient.get(
      `/imports/sheet-backup/configs/${configId}/download?refresh=${refresh}`,
      {
        responseType: 'blob',
      }
    );
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  bulkPasteSheetBackupLinks: async (rawText: string): Promise<{
    updatedCount: number;
    skippedCount: number;
    items: Array<{
      line: string;
      matchedConfigId: number | null;
      name: string | null;
      status: 'UPDATED' | 'NOT_FOUND' | 'INVALID_URL';
    }>;
  }> => {
    const res = await apiClient.post('/imports/sheet-backup/configs/bulk-links', {
      raw_text: rawText,
    });
    return res.data?.data || res.data;
  },
};
