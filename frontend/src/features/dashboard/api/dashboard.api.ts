import { apiClient } from '../../../api/client';
import {
  DashboardFilterParams,
  DashboardSummary,
  AttendanceStats,
  CarePivotMatrix,
  TasksOverview,
  OverviewPayload,
  CarePayload,
  AttendancePayload,
  PerformancePayload,
} from '../types/dashboard.types';

export const dashboardApi = {
  getSummary: async (params?: DashboardFilterParams): Promise<DashboardSummary> => {
    const res = await apiClient.get('/dashboard/summary', { params });
    return res.data.data;
  },

  getAttendance: async (params?: DashboardFilterParams): Promise<AttendanceStats> => {
    const res = await apiClient.get('/dashboard/attendance', { params });
    return res.data.data;
  },

  getCarePivot: async (params?: DashboardFilterParams): Promise<CarePivotMatrix> => {
    const res = await apiClient.get('/dashboard/care-pivot', { params });
    return res.data.data;
  },

  getTasksOverview: async (params?: DashboardFilterParams): Promise<TasksOverview> => {
    const res = await apiClient.get('/dashboard/tasks-overview', { params });
    return res.data.data;
  },

  // ---- New tab-composed endpoints ----
  getOverview: async (params?: DashboardFilterParams): Promise<OverviewPayload> => {
    const res = await apiClient.get('/dashboard/overview', { params });
    return res.data.data;
  },

  getCare: async (params?: DashboardFilterParams): Promise<CarePayload> => {
    const res = await apiClient.get('/dashboard/care', { params });
    return res.data.data;
  },

  getAttendanceTab: async (params?: DashboardFilterParams): Promise<AttendancePayload> => {
    const res = await apiClient.get('/dashboard/attendance-tab', { params });
    return res.data.data;
  },

  getPerformance: async (params?: DashboardFilterParams): Promise<PerformancePayload> => {
    const res = await apiClient.get('/dashboard/performance', { params });
    return res.data.data;
  },
};
