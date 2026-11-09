import { apiClient } from '../../../api/client';
import {
  ActivityActorsResponse,
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
};
