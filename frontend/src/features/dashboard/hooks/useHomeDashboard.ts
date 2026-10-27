import { useCallback, useEffect, useState } from 'react';
import { dashboardApi } from '../api/dashboard.api';
import { HomeDashboardPayload } from '../types/home.types';

interface UseHomeDashboardResult {
  data: HomeDashboardPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  removeTask: (taskId: number) => void;
}

const EMPTY_PAYLOAD: HomeDashboardPayload = {
  kpis: {
    total_students: { value: 0, delta: 0, delta_unit: 'percent', comparison_label: 'so với tháng trước', sparkline: [] },
    active_classes: { value: 0, delta: 0, delta_unit: 'percent', comparison_label: 'so với tháng trước', sparkline: [] },
    attendance_today: { value: 0, delta: 0, delta_unit: 'percent', comparison_label: 'so với hôm qua', sparkline: [] },
    pending_tasks: { value: 0, delta: 0, delta_unit: 'count', comparison_label: 'so với hôm qua', sparkline: [] },
  },
  today_tasks: [],
  upcoming_sessions: [],
};

export const useHomeDashboard = (): UseHomeDashboardResult => {
  const [data, setData] = useState<HomeDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.getHome();
      setData({
        kpis: res?.kpis || EMPTY_PAYLOAD.kpis,
        today_tasks: Array.isArray(res?.today_tasks) ? res.today_tasks : [],
        upcoming_sessions: Array.isArray(res?.upcoming_sessions) ? res.upcoming_sessions : [],
      });
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          'Không tải được dữ liệu trang chủ'
      );
      setData(EMPTY_PAYLOAD);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeTask = useCallback((taskId: number) => {
    setData((prev) => {
      if (!prev) return prev;
      const remaining = prev.today_tasks.filter((t) => t.id !== taskId);
      return {
        ...prev,
        today_tasks: remaining,
        kpis: {
          ...prev.kpis,
          pending_tasks: {
            ...prev.kpis.pending_tasks,
            value: Math.max(0, (prev.kpis.pending_tasks?.value || 0) - 1),
          },
        },
      };
    });
  }, []);

  return { data, loading, error, refresh: load, removeTask };
};
