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
  CheckSquare,
  Check,
  X as CloseIcon,
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
  onSaveCustom?: (
    pendingEdits: Record<string, AttendanceStatus>,
    customValues: Record<string, number>
  ) => Promise<void>;
  titleHeader?: React.ReactNode;
}

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; short: string; bg: string; text: string; border: string }
> = {
  ATTENDED: {
    label: 'Có mặt (Điền số)',
    short: '1',
    bg: 'bg-emerald-100 hover:bg-emerald-200',
    text: 'text-emerald-800 font-extrabold',
    border: 'border-emerald-300',
  },
  ABSENT_APPROVED_A: {
    label: 'Nghỉ phép (A)',
    short: 'A',
    bg: 'bg-amber-100 hover:bg-amber-200',
    text: 'text-amber-800 font-extrabold',
    border: 'border-amber-300',
  },
  LEAVE_B: {
    label: 'Bảo lưu (B)',
    short: 'B',
    bg: 'bg-blue-100 hover:bg-blue-200',
    text: 'text-blue-800 font-extrabold',
    border: 'border-blue-300',
  },
  ABSENT_UNAPPROVED_C: {
    label: 'Nghỉ sai QĐ (C)',
    short: 'C',
    bg: 'bg-rose-100 hover:bg-rose-200',
    text: 'text-rose-800 font-extrabold',
    border: 'border-rose-300',
  },
  TEACHER_ABSENT_D: {
    label: 'GV nghỉ (D)',
    short: 'D',
    bg: 'bg-red-200 hover:bg-red-300',
    text: 'text-red-900 font-extrabold',
    border: 'border-red-400',
  },
  TECH_ERROR_E: {
    label: 'Lỗi kỹ thuật (E)',
    short: 'E',
    bg: 'bg-slate-200 hover:bg-slate-300',
    text: 'text-slate-800 font-extrabold',
    border: 'border-slate-400',
  },
};

const DAY_OF_WEEK_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Helper date format: YYYY-MM-DD in local time
export const toLocalDateString = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to format date from backend (@db.Date or ISO string) without timezone shift
export const formatSessionDate = (raw: string | Date | null | undefined): string => {
  if (!raw) return '';
  if (typeof raw === 'string') {
    return raw.substring(0, 10);
  }
  const d = new Date(raw);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  // Track custom attendance numeric values (default 1 for ATTENDED)
  const [customValues, setCustomValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Multi-student selection state for bulk actions
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [bulkDate, setBulkDate] = useState<string>('');
  const [bulkCount, setBulkCount] = useState<number>(1);

  // Active cell popover picker
  const [activeCell, setActiveCell] = useState<{
    enrollmentClassId: number;
    dateStr: string;
    studentName: string;
  } | null>(null);
  const [cellInputCount, setCellInputCount] = useState<number>(1);

  const toDateString = toLocalDateString;

  // Calculate dates list based on filterMode and currentDate
  const datesList = useMemo(() => {
    const dates: Date[] = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (filterMode === 'week') {
      const day = currentDate.getDay();
      const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(year, month, diff);

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d);
      }
    } else if (filterMode === 'month') {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        dates.push(new Date(year, month, i));
      }
    } else {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        dates.push(new Date(year, month, i));
      }
    }

    return dates;
  }, [currentDate, filterMode]);

  // Set default bulk date when datesList changes
  React.useEffect(() => {
    if (datesList.length > 0 && !bulkDate) {
      setBulkDate(toDateString(datesList[0]));
    }
  }, [datesList, bulkDate]);

  // Map existing attendances by `${enrollment_class_id}_${dateStr}`
  const attendanceMap = useMemo(() => {
    const map = new Map<string, Attendance>();

    const sessionDateMap = new Map<number, string>();
    sessions.forEach((s) => {
      const dStr = formatSessionDate(s.session_date);
      if (dStr) sessionDateMap.set(s.id, dStr);
    });

    attendances.forEach((a) => {
      let dStr = sessionDateMap.get(a.class_session_id);
      if (!dStr && (a as any).class_session?.session_date) {
        dStr = formatSessionDate((a as any).class_session.session_date);
      }
      if (dStr) {
        map.set(`${a.enrollment_class_id}_${dStr}`, a);
      }
    });

    return map;
  }, [sessions, attendances]);

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

  // Toggle select all students
  const handleToggleSelectAllStudents = () => {
    if (selectedStudents.size === students.length && students.length > 0) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(students.map((s) => s.enrollment_class_id)));
    }
  };

  // Toggle single student select
  const handleToggleSelectStudent = (ecId: number) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(ecId)) next.delete(ecId);
      else next.add(ecId);
      return next;
    });
  };

  // Bulk Apply Attended for selected students
  const handleBulkApplyAttended = () => {
    if (selectedStudents.size === 0 || !bulkDate) return;
    const updates: Record<string, AttendanceStatus> = {};
    const valUpdates: Record<string, number> = {};

    selectedStudents.forEach((ecId) => {
      const key = `${ecId}_${bulkDate}`;
      updates[key] = 'ATTENDED';
      valUpdates[key] = bulkCount;
    });

    setPendingEdits((prev) => ({ ...prev, ...updates }));
    setCustomValues((prev) => ({ ...prev, ...valUpdates }));
    toast.success(
      `Đã đánh dấu Có mặt (${bulkCount} buổi) cho ${selectedStudents.size} học viên vào ngày ${new Date(bulkDate).toLocaleDateString('vi-VN')}`
    );
  };

  // Bulk Apply Absent for selected students
  const handleBulkApplyAbsent = (status: AttendanceStatus) => {
    if (selectedStudents.size === 0 || !bulkDate) return;
    const updates: Record<string, AttendanceStatus> = {};

    selectedStudents.forEach((ecId) => {
      const key = `${ecId}_${bulkDate}`;
      updates[key] = status;
    });

    setPendingEdits((prev) => ({ ...prev, ...updates }));
    toast.info(
      `Đã cập nhật trạng thái ${STATUS_CONFIG[status].label} cho ${selectedStudents.size} học viên`
    );
  };

  // Quick mark/unmark all present for a specific date (Column Checkbox)
  const handleToggleAllForDate = (dateStr: string) => {
    // Check if currently all are attended
    const isAllAttended =
      students.length > 0 &&
      students.every((s) => {
        const key = `${s.enrollment_class_id}_${dateStr}`;
        const st = pendingEdits[key] || attendanceMap.get(key)?.status;
        return st === 'ATTENDED';
      });

    const updates: Record<string, AttendanceStatus> = {};
    const valUpdates: Record<string, number> = {};

    if (isAllAttended) {
      // Unmark all (set to unassigned / removed)
      students.forEach((s) => {
        const key = `${s.enrollment_class_id}_${dateStr}`;
        delete updates[key];
      });
      setPendingEdits((prev) => {
        const next = { ...prev };
        students.forEach((s) => delete next[`${s.enrollment_class_id}_${dateStr}`]);
        return next;
      });
      toast.info(`Đã bỏ điểm danh cả lớp cho ngày ${new Date(dateStr).toLocaleDateString('vi-VN')}`);
    } else {
      // Mark all attended with 1 session
      students.forEach((s) => {
        const key = `${s.enrollment_class_id}_${dateStr}`;
        updates[key] = 'ATTENDED';
        valUpdates[key] = 1;
      });
      setPendingEdits((prev) => ({ ...prev, ...updates }));
      setCustomValues((prev) => ({ ...prev, ...valUpdates }));
      toast.success(`Đã tích chọn Có mặt (1 buổi) cả lớp cho ngày ${new Date(dateStr).toLocaleDateString('vi-VN')}`);
    }
  };

  // Select status for a cell from Popover
  const handleStatusSelect = (
    enrollmentClassId: number,
    dateStr: string,
    status: AttendanceStatus,
    countVal: number = 1
  ) => {
    const key = `${enrollmentClassId}_${dateStr}`;
    setPendingEdits((prev) => ({ ...prev, [key]: status }));
    if (status === 'ATTENDED') {
      setCustomValues((prev) => ({ ...prev, [key]: countVal }));
    }
    setActiveCell(null);
  };

  // Clear attendance for a cell
  const handleClearCell = (enrollmentClassId: number, dateStr: string) => {
    const key = `${enrollmentClassId}_${dateStr}`;
    setPendingEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCustomValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setActiveCell(null);
  };

  // Save all edits
  const handleSaveAll = async () => {
    const entries = Object.entries(pendingEdits);
    if (entries.length === 0) return;

    try {
      setSaving(true);

      if (onSaveCustom) {
        await onSaveCustom(pendingEdits, customValues);
      } else if (cls) {
        const byDate = new Map<string, { ecId: number; status: AttendanceStatus }[]>();
        entries.forEach(([key, status]) => {
          const [ecIdStr, dateStr] = key.split('_');
          const ecId = parseInt(ecIdStr, 10);
          if (!byDate.has(dateStr)) byDate.set(dateStr, []);
          byDate.get(dateStr)!.push({ ecId, status });
        });

        for (const [dateStr, items] of byDate.entries()) {
          let session = sessions.find(
            (s) => formatSessionDate(s.session_date) === dateStr
          );

          if (!session) {
            session = await classSessionsApi.create(cls.id, {
              session_number: sessions.length + 1,
              session_date: dateStr,
            });
          }

          await attendanceApi.bulkMark(cls.id, session.id, {
            items: items.map((i) => ({
              enrollment_class_id: i.ecId,
              status: i.status,
              session_count:
                i.status === 'ATTENDED' ? (customValues[`${i.ecId}_${dateStr}`] ?? 1) : 1,
            })),
          });
        }
      }

      setPendingEdits({});
      setCustomValues({});
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

      {/* Bulk Action Bar (When >= 1 student selected) */}
      {selectedStudents.size > 0 && (
        <div className="bg-primary-soft/90 border-b border-primary/30 p-3 px-4 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span className="font-bold text-text-primary">
              Đã tích chọn <span className="text-primary font-extrabold">{selectedStudents.size}</span> học viên
            </span>
            <button
              type="button"
              onClick={() => setSelectedStudents(new Set())}
              className="text-text-muted hover:text-text-primary underline ml-1 text-[11px]"
            >
              Bỏ chọn
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-text-secondary font-medium">Ngày:</span>
              <select
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                className="text-xs bg-surface border border-border rounded-lg px-2.5 py-1 font-bold text-text-primary focus:ring-1 focus:ring-primary"
              >
                {datesList.map((d) => {
                  const dStr = toDateString(d);
                  return (
                    <option key={dStr} value={dStr}>
                      {DAY_OF_WEEK_NAMES[d.getDay()]} {d.getDate() < 10 ? `0${d.getDate()}` : d.getDate()}/{d.getMonth() + 1}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-text-secondary font-medium">Số buổi:</span>
              <input
                type="number"
                min="0.5"
                max="10"
                step="0.5"
                value={bulkCount}
                onChange={(e) => setBulkCount(Number(e.target.value) || 1)}
                className="w-14 text-center bg-surface border border-border rounded-lg py-1 font-extrabold text-xs text-emerald-800"
              />
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={handleBulkApplyAttended}
              className="text-xs h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              ✓ Đánh dấu có mặt ({bulkCount})
            </Button>

            <div className="flex items-center gap-1 border-l border-border/80 pl-2">
              <span className="text-[11px] text-text-muted mr-1">Vắng:</span>
              {(['ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E'] as AttendanceStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleBulkApplyAbsent(st)}
                  className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-extrabold border ${STATUS_CONFIG[st].bg} ${STATUS_CONFIG[st].text} ${STATUS_CONFIG[st].border} hover:opacity-80 transition-transform active:scale-95`}
                  title={STATUS_CONFIG[st].label}
                >
                  {STATUS_CONFIG[st].short}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Matrix Table Container */}
      <div className="w-full overflow-x-auto select-none">
        <table className="w-full text-xs text-left border-collapse">
          {/* Header Row */}
          <thead>
            <tr className="bg-surface-muted/80 text-text-secondary border-b border-border/80 text-[11px] font-bold">
              {/* Checkbox Column */}
              <th className="px-2 py-3 border-r border-border/60 sticky left-0 bg-slate-100 z-20 w-10 min-w-[40px] max-w-[40px] text-center">
                <input
                  type="checkbox"
                  checked={selectedStudents.size === students.length && students.length > 0}
                  onChange={handleToggleSelectAllStudents}
                  className="w-3.5 h-3.5 rounded text-primary focus:ring-primary border-slate-300 cursor-pointer accent-primary"
                  title="Chọn tất cả học viên"
                />
              </th>

              {/* Sticky Info Columns */}
              <th className="px-2 py-3 border-r border-border/60 sticky left-10 bg-slate-100 z-20 w-10 min-w-[40px] max-w-[40px] text-center">
                #
              </th>
              <th className="px-3 py-3 border-r border-border/60 sticky left-20 bg-slate-100 z-20 whitespace-nowrap min-w-[85px]">
                Mã
              </th>
              <th className="px-4 py-3 border-r-2 border-border/80 sticky left-[165px] bg-slate-100 z-20 whitespace-nowrap min-w-[160px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
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

                // Check if all students attended on this date
                const isAllAttended =
                  students.length > 0 &&
                  students.every((s) => {
                    const key = `${s.enrollment_class_id}_${dateStr}`;
                    const st = pendingEdits[key] || attendanceMap.get(key)?.status;
                    return st === 'ATTENDED';
                  });

                return (
                  <th
                    key={dateStr}
                    className={`px-1.5 py-2 border-r border-border/60 text-center min-w-[58px] transition-colors ${
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
                    {/* Checkbox to toggle all present for this date */}
                    <label
                      className="mt-1 flex items-center justify-center cursor-pointer group"
                      title={
                        isAllAttended
                          ? `Bỏ chọn có mặt cả lớp ngày ${d.getDate()}/${d.getMonth() + 1}`
                          : `Tích chọn cả lớp có mặt (1 buổi) ngày ${d.getDate()}/${d.getMonth() + 1}`
                      }
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isAllAttended}
                        onChange={() => handleToggleAllForDate(dateStr)}
                        className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600 transition-transform group-hover:scale-110"
                      />
                    </label>
                  </th>
                );
              })}
            </tr>

            {/* Class Summary Subheader Row */}
            <tr className="bg-slate-50 border-b border-border/80 text-[11px]">
              <td
                colSpan={12}
                className="px-4 py-2 border-r-2 border-border/80 font-bold text-text-secondary sticky left-0 bg-slate-100 z-20 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  <span>Sĩ số: {students.length} học viên</span>
                  {selectedStudents.size > 0 && (
                    <span className="text-primary font-bold">
                      (Đã tích chọn {selectedStudents.size})
                    </span>
                  )}
                </div>
              </td>
              {datesList.map((d) => {
                const dateStr = toDateString(d);
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
                  colSpan={12 + datesList.length}
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

                const isRowSelected = selectedStudents.has(st.enrollment_class_id);

                return (
                  <tr
                    key={st.enrollment_class_id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      isRowSelected ? 'bg-primary-soft/30' : ''
                    }`}
                  >
                    {/* Checkbox Column */}
                    <td className="px-2 py-2.5 border-r border-border/60 text-center sticky left-0 bg-white z-10 w-10 min-w-[40px] max-w-[40px]">
                      <input
                        type="checkbox"
                        checked={isRowSelected}
                        onChange={() => handleToggleSelectStudent(st.enrollment_class_id)}
                        className="w-3.5 h-3.5 rounded text-primary focus:ring-primary border-slate-300 cursor-pointer accent-primary"
                        title={`Tích chọn học viên ${st.full_name}`}
                      />
                    </td>

                    {/* # Index */}
                    <td className="px-2 py-2.5 border-r border-border/60 text-center font-bold text-text-muted sticky left-10 bg-white z-10 w-10 min-w-[40px] max-w-[40px]">
                      {idx + 1}
                    </td>

                    {/* Mã External ID */}
                    <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-text-primary sticky left-20 bg-white z-10 whitespace-nowrap min-w-[85px]">
                      {st.external_id || st.student_id}
                    </td>

                    {/* Họ và tên */}
                    <td className="px-4 py-2.5 border-r-2 border-border/80 font-bold text-text-primary sticky left-[165px] bg-white z-10 whitespace-nowrap min-w-[160px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
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
                      const existingAtt = attendanceMap.get(key);
                      const currentStatus: AttendanceStatus | undefined =
                        pendingEdits[key] || existingAtt?.status;

                      const isPending = !!pendingEdits[key];
                      const cfg = currentStatus ? STATUS_CONFIG[currentStatus] : null;

                      // Display value for ATTENDED: check pending edits first, then saved session_count, default 1
                      const displayValue =
                        currentStatus === 'ATTENDED'
                          ? String(
                              isPending && customValues[key] !== undefined
                                ? customValues[key]
                                : (existingAtt?.session_count ?? customValues[key] ?? 1)
                            )
                          : cfg
                          ? cfg.short
                          : '-';

                      return (
                        <td
                          key={dateStr}
                          className="px-1 py-1 border-r border-border/60 text-center relative"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                activeCell?.enrollmentClassId === st.enrollment_class_id &&
                                activeCell?.dateStr === dateStr
                              ) {
                                setActiveCell(null);
                              } else {
                                setActiveCell({
                                  enrollmentClassId: st.enrollment_class_id,
                                  dateStr,
                                  studentName: st.full_name,
                                });
                                const currentCount =
                                  customValues[key] ?? existingAtt?.session_count ?? 1;
                                setCellInputCount(currentCount);
                              }
                            }}
                            className={`w-full h-8 rounded-lg flex items-center justify-center font-extrabold text-xs transition-all border ${
                              cfg
                                ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                                : 'bg-transparent text-text-muted hover:bg-slate-100/80 border-transparent hover:border-border'
                            } ${isPending ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                            title={
                              currentStatus === 'ATTENDED'
                                ? `Có mặt (${displayValue} buổi) - ${new Date(dateStr).toLocaleDateString('vi-VN')}`
                                : cfg
                                ? `${cfg.label} - ${new Date(dateStr).toLocaleDateString('vi-VN')}`
                                : `Chưa điểm danh (${new Date(dateStr).toLocaleDateString('vi-VN')})`
                            }
                          >
                            {displayValue}
                          </button>

                          {/* Interactive Status & Number Picker Popover */}
                          {activeCell?.enrollmentClassId === st.enrollment_class_id &&
                            activeCell?.dateStr === dateStr && (
                              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 bg-surface rounded-2xl shadow-soft-xl border border-border p-3 flex flex-col gap-2.5 w-60 text-left animate-in zoom-in-95 duration-100">
                                {/* Header */}
                                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                                  <div>
                                    <div className="text-[11px] font-bold text-text-primary truncate max-w-[170px]">
                                      {activeCell.studentName}
                                    </div>
                                    <div className="text-[10px] text-text-muted">
                                      {DAY_OF_WEEK_NAMES[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setActiveCell(null)}
                                    className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-muted"
                                  >
                                    <CloseIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Section 1: Có mặt & Điền số */}
                                <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-2 flex flex-col gap-1.5">
                                  <div className="text-[10px] font-bold text-emerald-900 flex items-center justify-between">
                                    <span>CÓ MẶT (ĐIỀN SỐ):</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min="0.5"
                                      max="10"
                                      step="0.5"
                                      value={cellInputCount}
                                      onChange={(e) => setCellInputCount(Number(e.target.value) || 1)}
                                      className="w-16 text-center bg-white border border-emerald-300 rounded-lg py-1 font-extrabold text-xs text-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleStatusSelect(
                                          st.enrollment_class_id,
                                          dateStr,
                                          'ATTENDED',
                                          cellInputCount
                                        )
                                      }
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-1 text-xs font-bold transition-colors flex items-center justify-center gap-1"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Áp dụng ({cellInputCount})</span>
                                    </button>
                                  </div>
                                  {/* Quick preset number buttons */}
                                  <div className="flex items-center gap-1 pt-0.5">
                                    {[1, 2, 3].map((num) => (
                                      <button
                                        key={num}
                                        type="button"
                                        onClick={() =>
                                          handleStatusSelect(
                                            st.enrollment_class_id,
                                            dateStr,
                                            'ATTENDED',
                                            num
                                          )
                                        }
                                        className="flex-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md py-0.5 text-[11px] font-extrabold transition-colors"
                                      >
                                        {num} buổi
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Section 2: Vắng học / Nghỉ */}
                                <div className="flex flex-col gap-1">
                                  <div className="text-[10px] font-bold text-text-muted px-1">
                                    VẮNG / NGHỈ:
                                  </div>
                                  {(['ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E'] as AttendanceStatus[]).map((stKey) => {
                                    const opt = STATUS_CONFIG[stKey];
                                    return (
                                      <button
                                        key={stKey}
                                        type="button"
                                        onClick={() =>
                                          handleStatusSelect(
                                            st.enrollment_class_id,
                                            dateStr,
                                            stKey
                                          )
                                        }
                                        className="flex items-center justify-between px-2 py-1 rounded-lg text-xs font-semibold hover:bg-surface-muted transition-colors text-left"
                                      >
                                        <span className="text-text-primary text-[11px]">{opt.label}</span>
                                        <span
                                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-extrabold ${opt.bg} ${opt.text}`}
                                        >
                                          {opt.short}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Section 3: Clear / Reset */}
                                <div className="border-t border-border/60 pt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleClearCell(st.enrollment_class_id, dateStr)}
                                    className="w-full text-center text-text-muted hover:text-rose-600 hover:bg-rose-50 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                                  >
                                    Xóa điểm danh (đặt về chưa học)
                                  </button>
                                </div>
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
                {key === 'ATTENDED' ? '1' : opt.short}
              </span>
              <span>{key === 'ATTENDED' ? 'Có mặt (Điền số: 1, 2...)' : opt.label}</span>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-text-muted">
          * Tích chọn ô Checkbox để thao tác hàng loạt; Click vào ô để nhập số buổi có mặt hoặc chọn lý do vắng
        </div>
      </div>
    </div>
  );
};
