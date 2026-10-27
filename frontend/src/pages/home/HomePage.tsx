import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  Clock,
  GraduationCap,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PageContainer } from '../../components/common/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { HomeKpiCard } from '../../features/dashboard/components/home/HomeKpiCard';
import { QuickLinksSection } from '../../features/dashboard/components/home/QuickLinksSection';
import { TodayTasksCard } from '../../features/dashboard/components/home/TodayTasksCard';
import { UpcomingSessionsCard } from '../../features/dashboard/components/home/UpcomingSessionsCard';
import { TEACHER_QUICK_LINKS } from '../../features/dashboard/constants/quickLinks';
import { useHomeDashboard } from '../../features/dashboard/hooks/useHomeDashboard';
import { reconciliationApi } from '../../features/attendance/api/reconciliation.api';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  MANAGE: 'Quản lý',
  CS: 'Nhân viên CSKH',
  TEACHER: 'Giáo viên',
};

const TeacherHomeView: React.FC<{ userName: string }> = ({ userName }) => {
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const todayStr = new Date().toISOString().slice(0, 10);
    (async () => {
      try {
        const list = await reconciliationApi.getTeacherSessions({
          startDate: todayStr,
          endDate: todayStr,
        });
        if (!cancelled) {
          setTodaySessions(Array.isArray(list) ? list : []);
        }
      } catch {
        if (!cancelled) {
          setTodaySessions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSessions(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageContainer className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-primary to-teal-600 text-white p-6 sm:p-8 shadow-soft-lg">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold text-white mb-3 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Cổng Giảng dạy & Điểm danh Giáo viên</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Xin chào, {userName}!
          </h1>
          <p className="text-blue-100 text-xs sm:text-sm leading-relaxed">
            Theo dõi lịch dạy trong ngày, chấm điểm danh nhanh và phối hợp chăm sóc học viên.
          </p>
        </div>
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-72 h-72 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Teacher Quick Links */}
      <section className="space-y-3.5">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-text-primary leading-tight">
            Truy cập nhanh
          </h2>
          <p className="text-xs text-text-muted mt-0.5">Các phân hệ dành cho Giáo viên</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {TEACHER_QUICK_LINKS.map((item) => (
            <Link
              key={item.key}
              to={item.path}
              className="group bg-surface rounded-2xl border border-border/80 p-4 sm:p-5 shadow-soft hover:shadow-soft-md hover:border-primary/40 transition-all duration-200 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${item.iconClass}`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors truncate">
                    {item.title}
                  </h3>
                  <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
              <span className="w-8 h-8 rounded-full bg-surface-muted group-hover:bg-primary group-hover:text-white text-text-muted flex items-center justify-center shrink-0 transition-colors">
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Today's Teaching Sessions */}
      <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/70">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-4 h-4" />
            </span>
            <h3 className="text-sm sm:text-base font-bold text-text-primary">
              Ca dạy hôm nay của tôi
            </h3>
          </div>
          <Link
            to="/teacher/my-sessions"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover transition-colors"
          >
            <span>Mở lịch dạy</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="p-4 sm:p-5">
          {loadingSessions ? (
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-14 rounded-2xl bg-surface-muted/70 animate-pulse" />
              ))}
            </div>
          ) : todaySessions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm font-semibold text-text-primary">
                Hôm nay bạn chưa có ca dạy nào được ghi nhận.
              </p>
              <Link
                to="/teacher/my-sessions"
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary-soft text-primary hover:bg-blue-100 text-xs font-semibold transition-colors"
              >
                <span>Ghi nhận ca dạy mới</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              {todaySessions.slice(0, 6).map((s: any, idx: number) => (
                <Link
                  key={s.id || idx}
                  to="/teacher/my-sessions"
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/70 hover:bg-surface-subtle transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-text-primary truncate">
                      {s.class_name || s.student_name || `Ca dạy #${idx + 1}`}
                    </div>
                    <div className="text-[11px] text-text-muted truncate mt-0.5">
                      {s.lesson_content || s.shift_label || 'Nhấn để xem chi tiết điểm danh'}
                    </div>
                  </div>
                  <Badge variant="success" size="sm">
                    Hôm nay
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userRoles = user?.roles || [];

  const isCommandCenterRole = userRoles.some((r) =>
    ['ADMIN', 'MANAGE', 'CS'].includes(r)
  );

  const primaryRole = userRoles[0] || 'ADMIN';
  const roleLabel = ROLE_LABELS[primaryRole] || 'Quản trị viên';

  const { data, loading, removeTask } = useHomeDashboard(isCommandCenterRole);

  if (!isCommandCenterRole) {
    return <TeacherHomeView userName={user?.name || roleLabel} />;
  }

  return (
    <PageContainer className="space-y-6">
      {/* ── 1. Header Section ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-primary mb-1">
            TRUNG TÂM ĐIỀU PHỐI
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            Xin chào, {user?.name || roleLabel}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Theo dõi học viên, lớp học và công việc hôm nay.
          </p>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => navigate('/students')}
            className="bg-primary hover:bg-primary-hover text-white rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold shadow-sm inline-flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm học viên</span>
          </button>
        </div>
      </div>

      {/* ── 2. KPI Cards Row (4 columns) ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <HomeKpiCard
          label="Tổng học viên"
          icon={<Users className="w-5 h-5" />}
          tone="blue"
          metric={data?.kpis.total_students}
        />
        <HomeKpiCard
          label="Lớp đang hoạt động"
          icon={<GraduationCap className="w-5 h-5" />}
          tone="emerald"
          metric={data?.kpis.active_classes}
        />
        <HomeKpiCard
          label="Chuyên cần hôm nay"
          icon={<BarChart3 className="w-5 h-5" />}
          tone="violet"
          metric={data?.kpis.attendance_today}
          decimals={1}
          suffix="%"
        />
        <HomeKpiCard
          label="Việc cần xử lý"
          icon={<Clock className="w-5 h-5" />}
          tone="amber"
          metric={data?.kpis.pending_tasks}
          higherIsBetter={false}
        />
      </div>

      {/* ── 3. Quick Launch Section (Customizable) ──────────────────────────── */}
      <QuickLinksSection userRoles={userRoles} />

      {/* ── 4. Bottom 2-Column Section (7/12 Tasks + 5/12 Upcoming Sessions) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7">
          <TodayTasksCard
            tasks={data?.today_tasks || []}
            loading={loading}
            onTaskCompleted={removeTask}
          />
        </div>
        <div className="lg:col-span-5">
          <UpcomingSessionsCard
            sessions={data?.upcoming_sessions || []}
            loading={loading}
          />
        </div>
      </div>
    </PageContainer>
  );
};
