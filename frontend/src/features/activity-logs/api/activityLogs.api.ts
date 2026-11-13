import { apiClient } from '../../../api/client';
import {
  ActivityActorsResponse,
  ActivityExportQueryParams,
  AuditLogActor,
  AuditLogListResponse,
  AuditLogQueryParams,
  LoginAuditListResponse,
  LoginAuditQueryParams,
} from '../types/activityLogs.types';

export const activityLogsApi = {
  getAuditLogs: async (params?: AuditLogQueryParams): Promise<AuditLogListResponse> => {
    const res = await apiClient.get('/activity-logs/audit', { params });
    return res.data?.data || res.data;
  },

  getLoginLogs: async (params?: LoginAuditQueryParams): Promise<LoginAuditListResponse> => {
    const res = await apiClient.get('/activity-logs/logins', { params });
    return res.data?.data || res.data;
  },

  getActors: async (): Promise<AuditLogActor[]> => {
    const res = await apiClient.get<ActivityActorsResponse>('/activity-logs/actors');
    const payload = (res.data as any)?.data || res.data;
    return Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
  },

  downloadExport: async (params: ActivityExportQueryParams): Promise<void> => {
    const res = await apiClient.get('/activity-logs/export', {
      params,
      responseType: 'blob',
    });
    const disposition = String(res.headers?.['content-disposition'] || '');
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    const fallback = `lich-su-${params.view}-${new Date().toISOString().slice(0, 10)}.csv`;
    const fileName = decodeURIComponent(utf8Match?.[1] || plainMatch?.[1] || fallback);
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
