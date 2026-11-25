import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Loader2,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../components/ui/Toast';
import { reconciliationApi } from '../../attendance/api/reconciliation.api';
import { careApi } from '../../care/api/care.api';
import type { AttendanceNotificationItem } from '../../care/types/care.types';
import { classesApi } from '../../classes/api/classes.api';
import { teachersApi } from '../api/teachers.api';
import type { Teacher } from '../types/teachers.types';

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime = (value?: string | null) => (value ? value.slice(0, 5) : '—');

const sessionTimestamp = (session: any) => {
  const date = String(session?.session_date || '').slice(0, 10);
  const time = String(session?.start_time || '23:59').slice(0, 5);
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
};

const getSessionProgress = (session: any) => {
  const enrollmentClasses = session?.class?.enrollment_classes || [];
  const attendances = enrollmentClasses
    .map((item: any) =>
      (item.attendance || []).find(
        (attendance: any) => Number(attendance.class_session_id) === Number(session.id)
      )
    )
    .filter(Boolean);
  const marked = attendances.filter(
    (attendance: any) => attendance.teacher_status || attendance.status
  ).length;
  return { total: enrollmentClasses.length, marked };
};

export const TeacherDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<Teacher | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifications, setNotifications] = useState<AttendanceNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [classCount, setClassCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => toLocalDateString(new Date()), []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      teachersApi.getMyProfile(),
      reconciliationApi.getTeacherSessions({ startDate: today, endDate: today }),
      reconciliationApi.getTeacherTrackingCount(),
      careApi.listNotifications({ status: 'all', limit: 5, offset: 0 }),
      classesApi.list({ page: 1, pageSize: 200 }),
      reconciliationApi.getTeacherStudentInfo(),
    ]);

    const [profileResult, sessionsResult, pendingResult, notificationsResult, classesResult, studentsResult] =
      results;

    if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
    if (sessionsResult.status === 'fulfilled') {
      const sessionData = sessionsResult.value;
      const sessionItems = Array.isArray(sessionData) ? sessionData : sessionData.items || [];
      setSessions(
        [...sessionItems].sort(
          (first, second) => sessionTimestamp(first) - sessionTimestamp(second)
        )
      );
    }
    if (pendingResult.status === 'fulfilled') setPendingCount(pendingResult.value.count || 0);
    if (notificationsResult.status === 'fulfilled') {
      setNotifications(notificationsResult.value.items || []);
      setUnreadCount(notificationsResult.value.unreadCount || 0);
    }
    if (classesResult.status === 'fulfilled') {
      setClassCount(
        new Set(
          (classesResult.value || []).filter((item) => item.active).map((item) => item.id)
        ).size
      );
    }
    if (studentsResult.status === 'fulfilled') {
      setStudentCount(
        new Set((studentsResult.value.items || []).map((item) => item.studentId)).size
      );
    }

    if (results.some((result) => result.status === 'rejected')) {
      toast.error('Một số thông tin trên Dashboard chưa thể tải. Vui lòng thử làm mới.');
    }
    setLoading(false);
  }, [today, toast]);

  useEffect(() => {
    document.title = 'Dashboard giáo viên | CSKH Automation';
    loadDashboard();
  }, [loadDashboard]);

  const nextSession = useMemo(() => {
    const now = Date.now();
    return sessions.find((session) => sessionTimestamp(session) >= now) || sessions[0] || null;
  }, [sessions]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Chào buổi sáng';
    if (hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  }, []);

  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    []
  );

  if (loading) {
    return (
      <PageContainer>
        <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Đang chuẩn bị bàn làm việc của bạn...
        </div>
      </PageContainer>
    );
  }

  const nextProgress = nextSession ? getSessionProgress(nextSession) : null;

  return (
    <PageContainer>
      <section className="relative mb-6 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-blue-50 via-white to-teal-50 p-5 shadow-soft sm:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-surface/80 px-3 py-1 text-xs font-semibold text-primary shadow-2xs backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Tổng quan hôm nay
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">
              {greeting}, {profile?.name || user?.name || 'Giáo viên'}!
            </h1>
            <p className="mt-2 text-sm font-medium capitalize text-text-secondary">{formattedDate}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboard}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            className="self-start bg-surface/80 lg:self-auto"
          >
            Làm mới
          </Button>
        </div>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Buổi dạy hôm nay', value: sessions.length, icon: CalendarDays, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
          { label: 'Việc cần xử lý', value: pendingCount, icon: BookOpenCheck, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
          { label: 'Lớp phụ trách', value: classCount, icon: GraduationCap, tone: 'bg-teal-50 text-teal-700 border-teal-100' },
          { label: 'Học viên của tôi', value: studentCount, icon: Users, tone: 'bg-violet-50 text-violet-700 border-violet-100' },
        ].map((item) => (
          <Card key={item.label} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-2xl font-extrabold text-text-primary sm:text-3xl">{item.value}</div>
                <div className="mt-1 text-xs font-semibold text-text-secondary sm:text-sm">{item.label}</div>
              </div>
              <div className={`rounded-xl border p-2.5 ${item.tone}`}><item.icon className="h-5 w-5" /></div>
            </div>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
              <div><h2 className="text-base font-bold text-text-primary">Buổi dạy tiếp theo</h2><p className="mt-0.5 text-xs text-text-muted">Thông tin quan trọng để bắt đầu nhanh</p></div>
              <Link to="/teacher/schedule" className="text-xs font-bold text-primary hover:text-primary-hover">Xem lịch dạy</Link>
            </div>
            {nextSession ? (
              <div className="p-5 sm:p-6">
                <div className="rounded-2xl border border-primary/15 bg-primary-soft/70 p-4 sm:p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="info" size="sm">Hôm nay</Badge>
                        {nextProgress && nextProgress.total > 0 && (
                          <Badge variant={nextProgress.marked >= nextProgress.total ? 'success' : 'warning'} size="sm">
                            {nextProgress.marked >= nextProgress.total ? 'Đã điểm danh' : `${nextProgress.marked}/${nextProgress.total} đã điểm danh`}
                          </Badge>
                        )}
                      </div>
                      <h3 className="truncate text-lg font-extrabold text-text-primary">{nextSession.class?.class_name || 'Lớp học'}</h3>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-text-secondary">
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-primary" />{formatTime(nextSession.start_time)} – {formatTime(nextSession.end_time)}</span>
                        <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-accent" />{nextProgress?.total || 0} học viên</span>
                      </div>
                    </div>
                    <Link to="/teacher/attendance" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover">Mở điểm danh<ArrowRight className="h-4 w-4" /></Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center px-5 py-12 text-center"><div className="mb-3 rounded-2xl bg-emerald-50 p-3 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div><h3 className="font-bold text-text-primary">Hôm nay chưa có buổi dạy</h3><p className="mt-1 text-sm text-text-muted">Bạn có thể kiểm tra lịch các ngày tiếp theo.</p></div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border/80 px-5 py-4"><div><h2 className="text-base font-bold text-text-primary">Lịch dạy hôm nay</h2><p className="mt-0.5 text-xs text-text-muted">{sessions.length} buổi trong ngày</p></div><CalendarDays className="h-5 w-5 text-primary" /></div>
            {sessions.length === 0 ? <div className="px-5 py-10 text-center text-sm text-text-muted">Không có lịch dạy hôm nay.</div> : (
              <div className="divide-y divide-border/70">{sessions.map((session) => { const progress = getSessionProgress(session); const completed = progress.total > 0 && progress.marked >= progress.total; return (
                <Link key={session.id} to="/teacher/attendance" className="flex items-center gap-4 px-5 py-4 transition hover:bg-surface-muted/60">
                  <div className="w-20 shrink-0"><div className="text-sm font-extrabold text-text-primary">{formatTime(session.start_time)}</div><div className="mt-0.5 text-[11px] text-text-muted">{formatTime(session.end_time)}</div></div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-text-primary">{session.class?.class_name || 'Lớp học'}</div><div className="mt-1 text-xs text-text-muted">{progress.total} học viên</div></div>
                  <Badge variant={completed ? 'success' : 'warning'} size="sm">{completed ? 'Đã điểm danh' : 'Chưa hoàn tất'}</Badge><ArrowRight className="h-4 w-4 text-text-muted" />
                </Link>); })}</div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border/80 px-5 py-4"><div className="flex items-center justify-between"><h2 className="text-base font-bold text-text-primary">Việc cần xử lý</h2>{pendingCount > 0 && <Badge variant="warning" size="sm">{pendingCount}</Badge>}</div><p className="mt-0.5 text-xs text-text-muted">Các lượt đang chờ bạn xác nhận</p></div>
            <div className="p-5">{pendingCount > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><div className="text-sm font-extrabold text-amber-900">{pendingCount} lượt chờ xác nhận</div><p className="mt-1 text-xs leading-5 text-amber-800">Hoàn tất sớm để dữ liệu điểm danh được đối soát chính xác.</p></div></div><Link to="/teacher/tasks" className="mt-4 inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-800 hover:text-amber-950">Xử lý ngay <ArrowRight className="h-3.5 w-3.5" /></Link></div>
            ) : <div className="flex flex-col items-center py-5 text-center"><CheckCircle2 className="mb-2 h-7 w-7 text-emerald-500" /><div className="text-sm font-bold text-text-primary">Không còn việc chờ xử lý</div><p className="mt-1 text-xs text-text-muted">Mọi lượt điểm danh đã được cập nhật.</p></div>}</div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border/80 px-5 py-4"><div><div className="flex items-center gap-2"><h2 className="text-base font-bold text-text-primary">Thông báo mới nhất</h2>{unreadCount > 0 && <Badge variant="info" size="sm">{unreadCount} mới</Badge>}</div><p className="mt-0.5 text-xs text-text-muted">Cập nhật liên quan đến điểm danh</p></div><Bell className="h-5 w-5 text-primary" /></div>
            {notifications.length === 0 ? <div className="px-5 py-10 text-center text-sm text-text-muted">Bạn chưa có thông báo nào.</div> : (
              <div className="divide-y divide-border/70">{notifications.slice(0, 4).map((item) => (
                <Link key={item.id} to="/teacher/notifications" className="block px-5 py-3.5 transition hover:bg-surface-muted/60"><div className="flex gap-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.is_read ? 'bg-slate-300' : 'bg-primary'}`} /><div className="min-w-0"><div className="truncate text-xs font-bold text-text-primary">{item.student_name}</div><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-text-secondary">{item.class_name} · Buổi {item.session_number} đã được cập nhật bởi {item.actor_name}</p></div></div></Link>
              ))}</div>
            )}
            <div className="border-t border-border/80 bg-surface-subtle/50 px-5 py-3"><Link to="/teacher/notifications" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-hover">Xem tất cả thông báo <ArrowRight className="h-3.5 w-3.5" /></Link></div>
          </Card>
        </div>
      </section>
    </PageContainer>
  );
};

export default TeacherDashboardPage;
