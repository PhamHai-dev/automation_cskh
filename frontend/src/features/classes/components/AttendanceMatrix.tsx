import React, { useState, useMemo } from 'react';
import {
  Class,
  ClassSession,
  Attendance,
  AttendanceStatus,
} from '../types/classes.types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import { attendanceApi, classSessionsApi } from '../api/sessions.api';
import {
  Save,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react';

export interface StudentRow {
  enrollment_class_id: number;
  class_id?: number;
  student_id: number;
  external_id?: string | null;
  full_name: string;
  status: string; // STUDYING, PAUSED, FINISHED...
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  schedule_pattern?: string | null;
  duration_minutes?: number | null;
  teacher_name?: string | null;
  teacher_code?: string | null;
  class_name: string;
  sale_name?: string | null;
}

export interface AttendanceMatrixProps {
  cls?: Class;
  students: StudentRow[];
  sessions: ClassSession[];
  attendances: Attendance[];
  onRefresh: () => void;
  onSaveCustom?: (pendingEdits: Record<string, AttendanceStatus>) => Promise<void>;
  titleHeader?: React.ReactNode;
}

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; short: string; bg: string; text: string; border: string }
> = {
  ATTENDED: {
    label: 'Có mặt (X)',
    short: 'X',
    bg: 'bg-emerald-100 hover:bg-emerald-200',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
  },
  ABSENT_APPROVED_A: {
    label: 'Nghỉ phép (A)',
    short: 'A',
    bg: 'bg-amber-100 hover:bg-amber-200',
    text: 'text-amber-800',
    border: 'border-amber-300',
  },
  LEAVE_B: {
    label: 'Bảo lưu (B)',
    short: 'B',
    bg: 'bg-blue-100 hover:bg-blue-200',
    text: 'text-blue-800',
    border: 'border-blue-300',
  },
  ABSENT_UNAPPROVED_C: {
    label: 'Nghỉ sai QĐ (C)',
    short: 'C',
    bg: 'bg-rose-100 hover:bg-rose-200',
    text: 'text-rose-800',
    border: 'border-rose-300',
  },
  TEACHER_ABSENT_D: {
    label: 'GV nghỉ (D)',
    short: 'D',
    bg: 'bg-red-200 hover:bg-red-300',
    text: 'text-red-900',
    border: 'border-red-400',
  },
  TECH_ERROR_E: {
    label: 'Lỗi kỹ thuật (E)',
    short: 'E',
    bg: 'bg-slate-200 hover:bg-slate-300',
    text: 'text-slate-800',
    border: 'border-slate-400',
  },
};

const DAY_OF_WEEK_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export const AttendanceMatrix: React.FC<AttendanceMatrixProps> = ({
  cls,
  students,
  sessions,
  attendances,
  onRefresh,
  onSaveCustom,
}) => {
  const toast = useToast();

  // Filter mode: 'month' (default), 'week', 'year'
  const [filterMode, setFilterMode] = useState<'month' | 'week' | 'year'>('month');

  // Selected date reference (default is today)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Track pending local edits: Key is `${enrollment_class_id}_${dateString}`
  const [pendingEdits, setPendingEdits] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);

  // Active cell popover picker
  const [activeCell, setActiveCell] = useState<{
    enrollmentClassId: number;
    dateStr: string;
  } | null>(null);

  // Calculate dates list based on filterMode and currentDate
  const datesList = useMemo(() => {
    const dates: Date[] = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (filterMode === 'week') {
      // Find Monday of the current week
      const day = currentDate.getDay();
      const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(year, month, diff);

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d);
      }
    } else if (filterMode === 'month') {
      // All days in the selected month
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        dates.push(new Date(year, month, i));
      }
    } else {
      // Year view - sample or 12 key dates (or first 30 days)
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        dates.push(new Date(year, month, i));
      }
    }

    return dates;
  }, [currentDate, filterMode]);

  // Map existing attendances by `${enrollment_class_id}_${dateStr}`
  const attendanceMap = useMemo(() => {
    const map = new Map<string, Attendance>();

    // Map session_id -> session_date YYYY-MM-DD
    const sessionDateMap = new Map<number, string>();
    sessions.forEach((s) => {
      const dStr = new Date(s.session_date).toISOString().split('T')[0];
      sessionDateMap.set(s.id, dStr);
    });

    attendances.forEach((a) => {
      const dStr = sessionDateMap.get(a.class_session_id);
      if (dStr) {
        map.set(`${a.enrollment_class_id}_${dStr}`, a);
      }
    });

    return map;
  }, [sessions, attendances]);

  // Helper date format: YYYY-MM-DD
  const toDateString = (d: Date) => d.toISOString().split('T')[0];

  // Navigation handlers
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (filterMode === 'week') {
      d.setDate(d.getDate() - 7);
    } else if (filterMode === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setFullYear(d.getFullYear() - 1);
    }
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (filterMode === 'week') {
      d.setDate(d.getDate() + 7);
    } else if (filterMode === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setFullYear(d.getFullYear() + 1);
    }
    setCurrentDate(d);
  };

  const handleCurrentToday = () => {
    setCurrentDate(new Date());
  };

  // Toggle or pick status for a cell
  const handleStatusSelect = (
    enrollmentClassId: number,
    dateStr: string,
    status: AttendanceStatus
  ) => {
    const key = `${enrollmentClassId}_${dateStr}`;
    setPendingEdits((prev) => ({ ...prev, [key]: status }));
    setActiveCell(null);
  };

  // Quick mark all present for a specific date
  const handleMarkAllPresentForDate = (dateStr: string) => {
    const updates: Record<string, AttendanceStatus> = {};
    students.forEach((s) => {
      updates[`${s.enrollment_class_id}_${dateStr}`] = 'ATTENDED';
    });
    setPendingEdits((prev) => ({ ...prev, ...updates }));
    toast.info(`Đã chọn Tất cả có mặt cho ngày ${new Date(dateStr).toLocaleDateString('vi-VN')}`);
  };

  // Save all edits
  const handleSaveAll = async () => {
    const entries = Object.entries(pendingEdits);
    if (entries.length === 0) return;

    try {
      setSaving(true);

      if (onSaveCustom) {
        await onSaveCustom(pendingEdits);
      } else if (cls) {
        // Group edits by dateStr
        const byDate = new Map<string, { ecId: number; status: AttendanceStatus }[]>();
        entries.forEach(([key, status]) => {
          const [ecIdStr, dateStr] = key.split('_');
          const ecId = parseInt(ecIdStr, 10);
          if (!byDate.has(dateStr)) byDate.set(dateStr, []);
          byDate.get(dateStr)!.push({ ecId, status });
        });

        // Process each date
        for (const [dateStr, items] of byDate.entries()) {
          // Find or create session for this date
          let session = sessions.find(
            (s) => new Date(s.session_date).toISOString().split('T')[0] === dateStr
          );

          if (!session) {
            // Create session
            session = await classSessionsApi.create(cls.id, {
              session_number: sessions.length + 1,
              session_date: dateStr,
            });
          }

          // Bulk mark
          await attendanceApi.bulkMark(cls.id, session.id, {
            items: items.map((i) => ({
              enrollment_class_id: i.ecId,
              status: i.status,
            })),
          });
        }
      }

      setPendingEdits({});
      toast.success('Đã lưu toàn bộ kết quả điểm danh thành công!');
      onRefresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể lưu điểm danh');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(pendingEdits).length > 0;

  // Title for current view
  const viewTitle = useMemo(() => {
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    if (filterMode === 'week') {
      const first = datesList[0]?.toLocaleDateString('vi-VN') || '';
      const last = datesList[datesList.length - 1]?.toLocaleDateString('vi-VN') || '';
      return `Tuần: ${first} — ${last}`;
    }
    if (filterMode === 'month') {
      return `Tháng ${month} / ${year}`;
    }
    return `Năm ${year}`;
  }, [currentDate, filterMode, datesList]);

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
      {/* Top Filter Bar & Controls */}
      <div className="p-4 sm:p-5 border-b border-border/80 bg-surface flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Mode & Date Navigation */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Tabs */}
          <div className="flex p-1 bg-surface-muted rounded-xl border border-border/60 text-xs font-semibold">
            <button
              onClick={() => setFilterMode('week')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterMode === 'week'
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Theo tuần
            </button>
            <button
              onClick={() => setFilterMode('month')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterMode === 'month'
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Theo tháng
            </button>
            <button
              onClick={() => setFilterMode('year')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterMode === 'year'
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Theo năm
            </button>
          </div>

          {/* Stepper buttons */}
          <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-border/60">
            <button
              onClick={handlePrev}
              className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
              title="Kỳ trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 text-xs font-bold text-text-primary select-none">
              {viewTitle}
            </span>
            <button
              onClick={handleNext}
              className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
              title="Kỳ sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCurrentToday}
            className="text-xs h-8"
          >
            Hôm nay
          </Button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="warning" size="md">
              Có {Object.keys(pendingEdits).length} thay đổi chưa lưu
            </Badge>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveAll}
            disabled={!hasChanges || saving}
            isLoading={saving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Lưu kết quả điểm danh
          </Button>
        </div>
      </div>

      {/* Matrix Table Container */}
      <div className="w-full overflow-x-auto select-none">
        <table className="w-full text-xs text-left border-collapse">
          {/* Header Row */}
          <thead>
            <tr className="bg-surface-muted/80 text-text-secondary border-b border-border/80 text-[11px] font-bold uppercase tracking-wider">
              {/* Sticky Info Columns */}
              <th className="px-2 py-3 border-r border-border/60 sticky left-0 bg-slate-100 z-20 w-12 min-w-[48px] max-w-[48px] text-center">
                #
              </th>
              <th className="px-3 py-3 border-r border-border/60 sticky left-12 bg-slate-100 z-20 whitespace-nowrap min-w-[92px]">
                Mã
              </th>
              <th className="px-4 py-3 border-r-2 border-border/80 sticky left-[140px] bg-slate-100 z-20 whitespace-nowrap min-w-[160px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                Họ và tên
              </th>
              <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap">
                Ngày BĐ
              </th>
              <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap">
                Trạng thái
              </th>
              <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap">
                Ngày KT/Bảo lưu
              </th>
              <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap">
                Giờ học
              </th>
              <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap">
                Lịch học
              </th>
              <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap">
                Thời lượng
              </th>
              <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap">
                Giáo viên & Mã GV
              </th>
              <th className="px-3 py-3 border-r-2 border-border/80 whitespace-nowrap min-w-[140px]">
                Tên lớp
              </th>

              {/* Dynamic Date Columns */}
              {datesList.map((d) => {
                const dateStr = toDateString(d);
                const dayOfWeek = DAY_OF_WEEK_NAMES[d.getDay()];
                const isToday = toDateString(new Date()) === dateStr;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                return (
                  <th
                    key={dateStr}
                    className={`px-2 py-2 border-r border-border/60 text-center min-w-[58px] transition-colors ${
                      isToday
                        ? 'bg-blue-50/90 text-primary border-primary/40'
                        : isWeekend
                        ? 'bg-slate-100/50 text-text-muted'
                        : ''
                    }`}
                  >
                    <div className="font-bold text-[10px] text-text-muted leading-tight">
                      {dayOfWeek}
                    </div>
                    <div className="text-[12px] font-extrabold text-text-primary">
                      {d.getDate() < 10 ? `0${d.getDate()}` : d.getDate()}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMarkAllPresentForDate(dateStr)}
                      className="text-[9px] text-primary/70 hover:text-primary mt-0.5 inline-block opacity-0 hover:opacity-100 transition-opacity"
                      title="Đánh dấu cả lớp có mặt"
                    >
                      ✓ tất cả
                    </button>
                  </th>
                );
              })}
            </tr>

            {/* Class Summary Subheader Row */}
            <tr className="bg-slate-50 border-b border-border/80 text-[11px]">
              <td
                colSpan={11}
                className="px-4 py-2 border-r-2 border-border/80 font-bold text-text-secondary sticky left-0 bg-slate-100 z-20 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  <span>Sĩ số: {students.length} học viên</span>
                </div>
              </td>
              {datesList.map((d) => {
                const dateStr = toDateString(d);
                // Count attended for this date
                let attendedCount = 0;
                students.forEach((s) => {
                  const key = `${s.enrollment_class_id}_${dateStr}`;
                  const currentStatus =
                    pendingEdits[key] || attendanceMap.get(key)?.status;
                  if (currentStatus === 'ATTENDED') attendedCount++;
                });

                const rate =
                  students.length > 0
                    ? Math.round((attendedCount / students.length) * 100)
                    : 0;

                return (
                  <td
                    key={`rate-${dateStr}`}
                    className="px-1 py-1.5 border-r border-border/60 text-center font-bold text-[10px] text-text-secondary"
                  >
                    {attendedCount > 0 ? `${rate}%` : '-'}
                  </td>
                );
              })}
            </tr>
          </thead>

          {/* Student Rows */}
          <tbody className="divide-y divide-border/60">
            {students.length === 0 ? (
              <tr>
                <td
                  colSpan={11 + datesList.length}
                  className="px-4 py-12 text-center text-text-muted"
                >
                  Lớp học hiện chưa có học viên nào được gán.
                </td>
              </tr>
            ) : (
              students.map((st, idx) => {
                const statusBadgeVariant =
                  st.status === 'STUDYING'
                    ? 'success'
                    : st.status === 'PAUSED'
                    ? 'warning'
                    : st.status === 'FINISHED'
                    ? 'info'
                    : 'neutral';

                return (
                  <tr
                    key={st.enrollment_class_id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    {/* # Index */}
                    <td className="px-2 py-2.5 border-r border-border/60 text-center font-bold text-text-muted sticky left-0 bg-white z-10 w-12 min-w-[48px] max-w-[48px]">
                      {idx + 1}
                    </td>

                    {/* Mã External ID */}
                    <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-text-primary sticky left-12 bg-white z-10 whitespace-nowrap min-w-[92px]">
                      {st.external_id || st.student_id}
                    </td>

                    {/* Họ và tên */}
                    <td className="px-4 py-2.5 border-r-2 border-border/80 font-bold text-text-primary sticky left-[140px] bg-white z-10 whitespace-nowrap min-w-[160px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                      {st.full_name}
                    </td>

                    {/* Ngày bắt đầu */}
                    <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap text-text-secondary">
                      {st.start_date
                        ? new Date(st.start_date).toLocaleDateString('vi-VN')
                        : '—'}
                    </td>

                    {/* Trạng thái */}
                    <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap">
                      <Badge variant={statusBadgeVariant} size="sm">
                        {st.status === 'STUDYING'
                          ? 'Đang học'
                          : st.status === 'PAUSED'
                          ? 'Bảo lưu'
                          : st.status === 'FINISHED'
                          ? 'Kết thúc'
                          : st.status}
                      </Badge>
                    </td>

                    {/* Ngày kết thúc/Bảo lưu */}
                    <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap text-text-secondary">
                      {st.end_date
                        ? new Date(st.end_date).toLocaleDateString('vi-VN')
                        : '—'}
                    </td>

                    {/* Giờ học */}
                    <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap text-text-secondary">
                      {st.start_time || '20h00'}
                    </td>

                    {/* Lịch học */}
                    <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap text-text-secondary font-medium">
                      {st.schedule_pattern || '246'}
                    </td>

                    {/* Thời lượng */}
                    <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap text-text-secondary">
                      {st.duration_minutes ? `${st.duration_minutes}p` : '30p'}
                    </td>

                    {/* Giáo viên & Mã GV */}
                    <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap text-text-secondary">
                      {st.teacher_name
                        ? `${st.teacher_name} ${st.teacher_code ? `(${st.teacher_code})` : ''}`
                        : '—'}
                    </td>

                    {/* Tên lớp */}
                    <td className="px-3 py-2.5 border-r-2 border-border/80 whitespace-nowrap text-text-secondary font-medium">
                      {st.class_name}
                    </td>

                    {/* Dynamic Date Attendance Cells */}
                    {datesList.map((d) => {
                      const dateStr = toDateString(d);
                      const key = `${st.enrollment_class_id}_${dateStr}`;
                      const currentStatus: AttendanceStatus | undefined =
                        pendingEdits[key] || attendanceMap.get(key)?.status;

                      const isPending = !!pendingEdits[key];
                      const cfg = currentStatus ? STATUS_CONFIG[currentStatus] : null;

                      return (
                        <td
                          key={dateStr}
                          className="px-1 py-1 border-r border-border/60 text-center relative"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setActiveCell(
                                activeCell?.enrollmentClassId === st.enrollment_class_id &&
                                  activeCell?.dateStr === dateStr
                                  ? null
                                  : { enrollmentClassId: st.enrollment_class_id, dateStr }
                              )
                            }
                            className={`w-full h-8 rounded-lg flex items-center justify-center font-extrabold text-xs transition-all border ${
                              cfg
                                ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                                : 'bg-transparent text-text-muted hover:bg-slate-100/80 border-transparent hover:border-border'
                            } ${isPending ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                            title={
                              cfg
                                ? `${cfg.label} - ${new Date(dateStr).toLocaleDateString('vi-VN')}`
                                : `Chưa điểm danh (${new Date(dateStr).toLocaleDateString('vi-VN')})`
                            }
                          >
                            {cfg ? cfg.short : '-'}
                          </button>

                          {/* Quick Status Picker Popover */}
                          {activeCell?.enrollmentClassId === st.enrollment_class_id &&
                            activeCell?.dateStr === dateStr && (
                              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 bg-surface rounded-xl shadow-soft-lg border border-border p-1.5 flex flex-col gap-1 w-40 text-left animate-in zoom-in-95 duration-100">
                                <div className="text-[10px] font-bold text-text-muted px-2 py-1 border-b border-border/60">
                                  Chọn trạng thái:
                                </div>
                                {Object.entries(STATUS_CONFIG).map(([stKey, opt]) => (
                                  <button
                                    key={stKey}
                                    type="button"
                                    onClick={() =>
                                      handleStatusSelect(
                                        st.enrollment_class_id,
                                        dateStr,
                                        stKey as AttendanceStatus
                                      )
                                    }
                                    className="flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold hover:bg-surface-muted transition-colors text-left"
                                  >
                                    <span className="text-text-primary">{opt.label}</span>
                                    <span
                                      className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-extrabold ${opt.bg} ${opt.text}`}
                                    >
                                      {opt.short}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Legend Footer */}
      <div className="p-4 border-t border-border/80 bg-surface-muted/30 flex flex-wrap items-center justify-between gap-4 text-xs text-text-secondary">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-text-primary">Chú thích trạng thái:</span>
          {Object.entries(STATUS_CONFIG).map(([key, opt]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-extrabold border ${opt.bg} ${opt.text} ${opt.border}`}
              >
                {opt.short}
              </span>
              <span>{opt.label}</span>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-text-muted">
          * Click trực tiếp vào ô để thay đổi trạng thái điểm danh cho học viên
        </div>
      </div>
    </div>
  );
};
