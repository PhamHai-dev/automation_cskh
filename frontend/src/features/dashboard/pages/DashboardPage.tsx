import React, { useState, useEffect } from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar } from '../../../components/common/FilterBar';
import { StatCard } from '../components/StatCard';
import { AttendanceChart } from '../components/AttendanceChart';
import { CarePivotTable } from '../components/CarePivotTable';
import { TasksOverviewWidget } from '../components/TasksOverviewWidget';
import { dashboardApi } from '../api/dashboard.api';
import {
  DashboardFilterParams,
  DashboardSummary,
  AttendanceStats,
  CarePivotMatrix,
  TasksOverview,
} from '../types/dashboard.types';
import { Users, GraduationCap, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

const STATUS_LABELS: Record<string, { label: string; color: string; bgSoft: string; textColor: string }> = {
  NOT_STARTED: { label: 'Chưa học', color: 'bg-slate-400', bgSoft: 'bg-slate-100', textColor: 'text-slate-700' },
  STUDYING: { label: 'Đang học', color: 'bg-blue-600', bgSoft: 'bg-blue-50', textColor: 'text-blue-700' },
  PAUSED: { label: 'Bảo lưu / Tạm dừng', color: 'bg-amber-500', bgSoft: 'bg-amber-50', textColor: 'text-amber-700' },
  FINISHED: { label: 'Hoàn thành', color: 'bg-emerald-600', bgSoft: 'bg-emerald-50', textColor: 'text-emerald-700' },
  CANCELLED: { label: 'Đã hủy', color: 'bg-rose-500', bgSoft: 'bg-rose-50', textColor: 'text-rose-700' },
};

export const DashboardPage: React.FC = () => {
  const [filters, setFilters] = useState<DashboardFilterParams>({});
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [attendance, setAttendance] = useState<AttendanceStats | null>(null);
  const [carePivot, setCarePivot] = useState<CarePivotMatrix | null>(null);
  const [tasksOverview, setTasksOverview] = useState<TasksOverview | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumRes, attRes, pivRes, tskRes] = await Promise.all([
        dashboardApi.getSummary(filters),
        dashboardApi.getAttendance(filters),
        dashboardApi.getCarePivot(filters),
        dashboardApi.getTasksOverview(filters),
      ]);
      setSummary(sumRes);
      setAttendance(attRes);
      setCarePivot(pivRes);
      setTasksOverview(tskRes);
    } catch (err: any) {
      console.error('Lỗi khi tải dữ liệu Dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filters]);

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard Báo cáo & Thống kê Chăm sóc Khách hàng"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới dữ liệu
          </Button>
        }
      />

      {/* Filter Bar */}
      <FilterBar
        title="Bộ lọc dữ liệu Dashboard"
        activeCount={activeFiltersCount}
        onClear={() => setFilters({})}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Từ ngày</label>
            <input
              type="date"
              value={filters.date_from || ''}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value || undefined })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Đến ngày</label>
            <input
              type="date"
              value={filters.date_to || ''}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value || undefined })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Trạng thái Ghi danh</label>
            <select
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="STUDYING">Đang học</option>
              <option value="NOT_STARTED">Chưa học</option>
              <option value="PAUSED">Bảo lưu</option>
              <option value="FINISHED">Hoàn thành</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </div>
        </div>
      </FilterBar>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Tổng số Ghi danh"
          value={summary?.total_enrollments ?? '—'}
          subtitle="Tổng các hợp đồng / gói học"
          icon={<GraduationCap className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Học viên Thực tế"
          value={summary?.unique_students ?? '—'}
          subtitle="Số học viên duy nhất trong hệ thống"
          icon={<Users className="w-5 h-5" />}
          color="indigo"
        />
        <StatCard
          title="Tỷ lệ Chuyên cần"
          value={attendance ? `${attendance.attendance_rate}%` : '—'}
          subtitle={`Trên ${attendance?.total_sessions ?? 0} buổi học đã diễn ra`}
          icon={<CheckCircle className="w-5 h-5" />}
          color="emerald"
        />
        <StatCard
          title="Nhiệm vụ Quá hạn"
          value={tasksOverview?.overdue ?? 0}
          subtitle={`Trong tổng số ${tasksOverview?.pending_total ?? 0} việc cần làm`}
          icon={<AlertCircle className="w-5 h-5" />}
          color={tasksOverview?.overdue && tasksOverview.overdue > 0 ? 'rose' : 'amber'}
        />
      </div>

      {/* Row 2: Attendance Chart + Tasks Overview Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <AttendanceChart data={attendance} loading={loading} />
        </div>
        <div className="lg:col-span-1">
          <TasksOverviewWidget data={tasksOverview} loading={loading} />
        </div>
      </div>

      {/* Row 3: Care Pivot Matrix */}
      <div className="mb-6">
        <CarePivotTable data={carePivot} loading={loading} />
      </div>

      {/* Row 4: Status Breakdown Card */}
      {summary && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-soft space-y-4">
          <h4 className="font-bold text-slate-900 text-sm">Phân bổ Trạng thái Ghi danh (Enrollment Status)</h4>

          {/* Visual Bar */}
          <div className="w-full bg-slate-100 rounded-full h-3 flex overflow-hidden">
            {Object.entries(summary.status_breakdown || {}).map(([st, count]) => {
              const cfg = STATUS_LABELS[st] || { color: 'bg-slate-400', label: st };
              const pct = summary.total_enrollments > 0 ? (count / summary.total_enrollments) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={st}
                  style={{ width: `${pct}%` }}
                  className={`${cfg.color} h-full transition-all duration-300`}
                  title={`${cfg.label}: ${count} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
            {Object.entries(STATUS_LABELS).map(([stKey, cfg]) => {
              const count = summary.status_breakdown[stKey] || 0;
              const pct = summary.status_percentage[stKey] || 0;

              return (
                <div key={stKey} className={`p-3 rounded-xl border border-slate-200/60 ${cfg.bgSoft} space-y-1`}>
                  <div className={`text-xs font-semibold ${cfg.textColor} truncate`}>{cfg.label}</div>
                  <div className="flex items-baseline justify-between">
                    <span className="font-extrabold text-slate-900 text-lg">{count}</span>
                    <span className="text-xs font-bold text-slate-500">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageContainer>
  );
};
