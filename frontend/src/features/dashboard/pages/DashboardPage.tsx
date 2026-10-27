import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar } from '../../../components/common/FilterBar';
import { HorizontalTabs, type HorizontalTabItem } from '../../../components/ui/HorizontalTabs';
import { Button } from '../../../components/ui/Button';
import { StatCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';
import { CarePivotTable } from '../components/CarePivotTable';
import { AtRiskTable } from '../components/AtRiskTable';
import { StatusDonut, EnrollmentTrendArea, EnrollmentByCSBar } from '../components/OverviewCharts';
import { CareOutcomeDonut, MilestoneCoverageChart } from '../components/CareCharts';
import { AttendanceDonut, AttendanceTrendLine, AttendanceByClassBar } from '../components/AttendanceCharts';
import { TasksByTypeBar, CSLeaderboard, CompletionBar } from '../components/PerformanceCharts';
import { dashboardApi } from '../api/dashboard.api';
import { downloadCSV } from '../utils/csv';
import {
  DashboardFilterParams,
  OverviewPayload,
  CarePayload,
  AttendancePayload,
  PerformancePayload,
} from '../types/dashboard.types';
import {
  Users,
  GraduationCap,
  AlertCircle,
  RefreshCw,
  LayoutDashboard,
  MessageSquareHeart,
  CalendarCheck,
  Trophy,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

type TabKey = 'overview' | 'care' | 'attendance' | 'performance';

const TAB_ITEMS: HorizontalTabItem<TabKey>[] = [
  { value: 'overview', label: 'Tổng quan', icon: <LayoutDashboard /> },
  { value: 'care', label: 'Chăm sóc', icon: <MessageSquareHeart /> },
  { value: 'attendance', label: 'Chuyên cần', icon: <CalendarCheck /> },
  { value: 'performance', label: 'Hiệu suất & Nhiệm vụ', icon: <Trophy /> },
];

// ---- Date preset helpers ----
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function presetRange(preset: string): { date_from?: string; date_to?: string } {
  const today = new Date();
  if (preset === 'today') return { date_from: fmt(today), date_to: fmt(today) };
  if (preset === '7d') {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return { date_from: fmt(from), date_to: fmt(today) };
  }
  if (preset === '30d') {
    const from = new Date(today);
    from.setDate(today.getDate() - 29);
    return { date_from: fmt(from), date_to: fmt(today) };
  }
  if (preset === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { date_from: fmt(from), date_to: fmt(today) };
  }
  return { date_from: undefined, date_to: undefined }; // all — explicit clear so stale dates don't survive preset merge
}

const PRESETS: Array<{ key: string; label: string }> = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: 'month', label: 'Tháng này' },
  { key: 'all', label: 'Tất cả' },
];

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = (searchParams.get('tab') as TabKey) || 'overview';

  const [filters, setFilters] = useState<DashboardFilterParams>(() => ({
    date_from: searchParams.get('date_from') || presetRange('30d').date_from,
    date_to: searchParams.get('date_to') || presetRange('30d').date_to,
    status: searchParams.get('status') || undefined,
    cs_id: searchParams.get('cs_id') ? Number(searchParams.get('cs_id')) : undefined,
  }));

  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [care, setCare] = useState<CarePayload | null>(null);
  const [attendance, setAttendance] = useState<AttendancePayload | null>(null);
  const [performance, setPerformance] = useState<PerformancePayload | null>(null);

  // Sync filters + tab to URL
  useEffect(() => {
    const next = new URLSearchParams();
    next.set('tab', activeTab);
    if (filters.date_from) next.set('date_from', filters.date_from);
    if (filters.date_to) next.set('date_to', filters.date_to);
    if (filters.status) next.set('status', filters.status);
    if (filters.cs_id) next.set('cs_id', String(filters.cs_id));
    setSearchParams(next, { replace: true });
  }, [activeTab, filters, setSearchParams]);

  // Lazy-load the active tab's aggregate endpoint on tab/filter change
  const loadTab = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') setOverview(await dashboardApi.getOverview(filters));
      else if (activeTab === 'care') setCare(await dashboardApi.getCare(filters));
      else if (activeTab === 'attendance') setAttendance(await dashboardApi.getAttendanceTab(filters));
      else if (activeTab === 'performance') setPerformance(await dashboardApi.getPerformance(filters));
    } catch (err) {
      console.error('Lỗi tải dữ liệu dashboard', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const setTab = (tab: TabKey) => setSearchParams({ ...Object.fromEntries(searchParams), tab });

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;
  const canSeeLeaderboard = !!user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE');

  const applyPreset = (key: string) => setFilters({ ...filters, ...presetRange(key) });

  const currentPreset = useMemo(() => {
    const today = fmt(new Date());
    for (const p of PRESETS) {
      const r = presetRange(p.key);
      if ((r.date_from || undefined) === (filters.date_from || undefined) && (r.date_to || undefined) === (filters.date_to || undefined)) {
        return p.key;
      }
    }
    if (!filters.date_from && !filters.date_to) return 'all';
    return today;
  }, [filters]);

  return (
    <PageContainer>
      <PageHeader
        title="Báo cáo & Thống kê CSKH"
        description="Phân tích dữ liệu chăm sóc, chuyên cần và hiệu suất đội CS theo thời gian thực"
        actions={
          <Button variant="outline" size="sm" onClick={loadTab} isLoading={loading} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Làm mới
          </Button>
        }
      />

      {/* Filter bar + quick presets */}
      <FilterBar
        title="Bộ lọc dữ liệu"
        activeCount={activeFiltersCount}
        onClear={() => setFilters({})}
        gridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end"
      >
        <div className="sm:col-span-2 md:col-span-2">
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Khoảng thời gian
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-3 h-9 text-xs font-semibold rounded-xl border transition ${
                  currentPreset === p.key
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-secondary border-border hover:bg-surface-muted'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Từ ngày</label>
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value || undefined })}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Đến ngày</label>
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value || undefined })}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </FilterBar>

      {/* Tabs */}
      <div className="mb-6">
        <HorizontalTabs items={TAB_ITEMS} value={activeTab} onChange={setTab} ariaLabel="Dashboard tabs" />
      </div>

      {/* ---- TAB 1: OVERVIEW ---- */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard title="Tổng Ghi danh" value={overview.kpis.total_enrollments} subtitle="Trong khoảng lọc" icon={<GraduationCap className="w-5 h-5" />} color="blue" />
            <StatCard title="Đang học" value={`${overview.kpis.studying}`} subtitle={`${overview.kpis.studying_pct}% tổng HV`} icon={<Users className="w-5 h-5" />} color="indigo" />
            <StatCard title="Bảo lưu" value={overview.kpis.paused} subtitle="HV tạm ngưng" icon={<CalendarCheck className="w-5 h-5" />} color="amber" />
            <StatCard title="Sắp hết khóa" value={overview.kpis.near_completion} subtitle="≤10 buổi còn lại" icon={<GraduationCap className="w-5 h-5" />} color="teal" />
            <StatCard title="Nhiệm vụ quá hạn" value={overview.kpis.overdue_tasks} subtitle="Cần xử lý ngay" icon={<AlertCircle className="w-5 h-5" />} color={overview.kpis.overdue_tasks > 0 ? 'rose' : 'emerald'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Phân bổ trạng thái học viên" description={`${overview.summary.total_enrollments} ghi danh`}>
              <StatusDonut breakdown={overview.summary.status_breakdown} total={overview.summary.total_enrollments} />
            </ChartCard>
            <ChartCard
              title="Xu hướng ghi danh"
              description={`Theo ${overview.enrollment_trend.granularity === 'day' ? 'ngày' : overview.enrollment_trend.granularity === 'week' ? 'tuần' : 'tháng'}`}
              onExport={() => downloadCSV('enrollment-trend', overview.enrollment_trend.points as unknown as Record<string, unknown>[])}
            >
              <EnrollmentTrendArea data={overview.enrollment_trend} />
            </ChartCard>
          </div>

          <ChartCard
            title="Ghi danh theo CVHT"
            description="Số lượng học viên phụ trách của từng CS"
            onExport={() => downloadCSV('enrollment-by-cs', overview.enrollment_by_cs as unknown as Record<string, unknown>[])}
          >
            <EnrollmentByCSBar data={overview.enrollment_by_cs} />
          </ChartCard>
        </div>
      )}

      {/* ---- TAB 2: CARE ---- */}
      {activeTab === 'care' && care && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Tổng lượt phản hồi" value={care.response_matrix.total_entered} subtitle="Có outcome hoặc nội dung" icon={<MessageSquareHeart className="w-5 h-5" />} color="blue" />
            <StatCard title="Tỷ lệ phản hồi" value={`${care.response_matrix.response_rate}%`} subtitle="Theo các mốc buổi" icon={<MessageSquareHeart className="w-5 h-5" />} color="emerald" />
            <StatCard title="Chưa nhập" value={Math.max(0, care.response_matrix.total_enrollments - care.response_matrix.total_entered)} subtitle="Cần bổ sung nội dung" icon={<AlertCircle className="w-5 h-5" />} color="amber" />
            <StatCard title="Muốn dừng" value={care.response_matrix.rows.reduce((sum, row) => sum + row.counts.NEGATIVE_WANTS_TO_STOP, 0)} subtitle="Phản hồi tiêu cực" icon={<AlertCircle className="w-5 h-5" />} color="rose" />
          </div>

          <ChartCard
            title="Nội dung chăm sóc sau từng buổi"
            description="8 phản hồi chuẩn + Khác + Chưa nhập, lấy từ các cột Báo cáo học tập & chăm sóc"
            onExport={() => downloadCSV('care-response-matrix', care.response_matrix.rows.map((row) => ({
              'Mốc buổi': row.session_number,
              ...Object.fromEntries(row.counts ? Object.entries(row.counts) : []),
              'Tổng học viên': row.total_enrollments,
              'Đã phản hồi': row.entered_total,
              'Tỷ lệ phản hồi': `${row.response_rate}%`,
            })))}
          >
            <CarePivotTable data={care.response_matrix} loading={loading} />
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Cơ cấu outcome" description="Phân bổ theo kết quả được lưu trong CareLog">
              <CareOutcomeDonut data={care.outcome_breakdown} />
            </ChartCard>
            <ChartCard title="Độ phủ chăm sóc theo mốc" description="HV đã đạt mốc buổi vs đã được log chăm sóc">
              <MilestoneCoverageChart data={care.milestone_coverage} />
            </ChartCard>
          </div>

          <ChartCard title="Học viên rủi ro — muốn dừng học" description="Log chăm sóc gần nhất có phản hồi tiêu cực" onExport={() => downloadCSV('at-risk', care.at_risk as unknown as Record<string, unknown>[])}>
            <AtRiskTable data={care.at_risk} />
          </ChartCard>
        </div>
      )}

      {/* ---- TAB 3: ATTENDANCE ---- */}
      {activeTab === 'attendance' && attendance && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Tỷ lệ chuyên cần" value={`${attendance.stats.attendance_rate}%`} subtitle={`${attendance.stats.total_attendances} lượt điểm danh`} icon={<CalendarCheck className="w-5 h-5" />} color="emerald" />
            <StatCard title="Tổng buổi học" value={attendance.stats.total_sessions} subtitle="Buổi đã diễn ra" icon={<GraduationCap className="w-5 h-5" />} color="blue" />
            <StatCard title="Vắng không phép" value={attendance.stats.breakdown.ABSENT_UNAPPROVED_C || 0} subtitle="Cần nhắc nhở" icon={<AlertCircle className="w-5 h-5" />} color="rose" />
            <StatCard title="Có mặt" value={attendance.stats.breakdown.ATTENDED || 0} subtitle="Lượt đi học đầy đủ" icon={<Users className="w-5 h-5" />} color="indigo" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Phân bổ điểm danh" description="Theo trạng thái buổi học">
              <AttendanceDonut data={attendance.stats} />
            </ChartCard>
            <ChartCard title="Xu hướng chuyên cần" description="Đường tỷ lệ + mục tiêu 90%">
              <AttendanceTrendLine data={attendance.trend} />
            </ChartCard>
          </div>

          <ChartCard
            title="Chuyên cần theo lớp"
            description="Sắp xếp từ thấp đến cao — dễ phát hiện lớp có vấn đề"
            onExport={() => downloadCSV('attendance-by-class', attendance.by_class as unknown as Record<string, unknown>[])}
          >
            <AttendanceByClassBar data={attendance.by_class} />
          </ChartCard>
        </div>
      )}

      {/* ---- TAB 4: PERFORMANCE & TASKS ---- */}
      {activeTab === 'performance' && performance && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Đang chờ" value={performance.tasks.pending_total} subtitle="Tổng nhiệm vụ PENDING" icon={<AlertCircle className="w-5 h-5" />} color="amber" />
            <StatCard title="Quá hạn" value={performance.tasks.overdue} subtitle="Cần xử lý ngay" icon={<AlertCircle className="w-5 h-5" />} color={performance.tasks.overdue > 0 ? 'rose' : 'emerald'} />
            <StatCard title="Hạn hôm nay" value={performance.tasks.due_today} subtitle="Deadline trong ngày" icon={<CalendarCheck className="w-5 h-5" />} color="blue" />
            <StatCard title="Gấp / Điểm nóng" value={performance.tasks.urgent_hot_issues} subtitle="Ưu tiên cao" icon={<AlertCircle className="w-5 h-5" />} color="rose" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard title="Hoàn thành nhiệm vụ tháng" description="Tiến độ xử lý công việc">
              <CompletionBar data={performance.task_completion} />
            </ChartCard>
            <div className="lg:col-span-2">
              <ChartCard title="Nhiệm vụ theo loại" description="Hoàn thành vs đang chờ">
                <TasksByTypeBar data={performance.tasks_by_type} />
              </ChartCard>
            </div>
          </div>

          {canSeeLeaderboard && (
            <ChartCard
              title="Bảng xếp hạng CVHT"
              description="So sánh hiệu suất chăm sóc giữa các CS (chỉ ADMIN/MANAGE thấy)"
              onExport={() => downloadCSV('cs-leaderboard', performance.cs_leaderboard as unknown as Record<string, unknown>[])}
            >
              <CSLeaderboard data={performance.cs_leaderboard} />
            </ChartCard>
          )}
        </div>
      )}

      {loading && !overview && !care && !attendance && !performance && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-white rounded-2xl border border-border/80 animate-pulse" />
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export { DashboardPage };
