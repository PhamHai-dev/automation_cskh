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
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { attendanceApi, classSessionsApi } from '../api/sessions.api';
import {
  Save,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckSquare,
  Check,
  X as CloseIcon,
  Zap,
  Calendar,
  BarChart3,
  CalendarDays,
  Award,
  AlertTriangle,
  Clock,
} from 'lucide-react';

export interface StudentRow {
  enrollment_class_id: number;
  class_id?: number;
  student_id: number;
  external_id?: string | null;      // Cột A: ID
  full_name: string;                // Cột B: Họ tên HV
  package_name?: string | null;     // Cột C: Gói học
  course_content?: string | null;   // Cột D: Nội dung khoá
  total_sessions?: number | null;   // Cột E: Tổng số buổi
  level?: string | null;            // Cột F: Khoá học / Trình độ
  email?: string | null;            // Cột G: Email
  model_type?: string | null;       // Cột H: Mô hình (1:1, 1:2, 1:n)
  remaining_sessions?: number | null;// Cột I: Số buổi còn lại
  start_date?: string | null;       // Cột J: Ngày bắt đầu học
  status: string;                   // Cột K: Trạng thái (STUDYING, PAUSED, FINISHED...)
  end_date?: string | null;         // Cột L: Ngày kết thúc/Bảo lưu
  start_time?: string | null;       // Cột M: Giờ học (1)
  schedule_pattern?: string | null; // Cột N: Lịch học (1)
  duration_minutes?: number | null; // Cột O: Thời lượng buổi học (1)
  teacher_name?: string | null;     // Cột U: Giáo viên
  teacher_code?: string | null;     // Cột V: Mã GV
  class_name: string;               // Cột W: Tên lớp
  sale_name?: string | null;        // Sale phụ trách
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

export type AttendanceTab = 'quick' | 'detailed' | 'stats';

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

  // 3 Primary Tabs: 'quick' (Điểm danh nhanh), 'detailed' (Chi tiết), 'stats' (Thống kê điểm danh)
  const [activeTab, setActiveTab] = useState<AttendanceTab>('quick');

  // Tab 1 (Quick Attendance) specific date state (Default: Today)
  const [quickDate, setQuickDate] = useState<string>(() => toLocalDateString(new Date()));

  // Filter mode for Tab 2 (Detailed): 'month' (default), 'week', 'year'
  const [filterMode, setFilterMode] = useState<'month' | 'week' | 'year'>('month');

  // Selected date reference for Tab 2 & 3 (default: today)
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

  // Calculate dates list based on filterMode and currentDate (for Tab 2)
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

  // Set default bulk date when datesList changes or in quick tab
  React.useEffect(() => {
    if (activeTab === 'quick') {
      setBulkDate(quickDate);
    } else if (datesList.length > 0 && !bulkDate) {
      setBulkDate(toDateString(datesList[0]));
    }
  }, [activeTab, quickDate, datesList, bulkDate]);

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

  // Dynamic Reactive Statistics calculation for each student (X, Y, Z, AA, AB, AC, AD, AE, AF, AG, AH)
  const studentStats = useMemo(() => {
    const statsMap = new Map<
      number,
      {
        totalAttended: number;   // X, Y
        totalAbsentA: number;    // Z
        totalAbsentC: number;    // AA
        totalTeacherD: number;   // AB
        monthAttended: number;   // AC
        monthAbsentA: number;    // AD
        monthLeaveB: number;     // AE
        monthAbsentC: number;    // AF
        monthTeacherD: number;   // AG
        monthTechE: number;      // AH
      }
    >();

    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    students.forEach((s) => {
      let totalAttended = 0;
      let totalAbsentA = 0;
      let totalAbsentC = 0;
      let totalTeacherD = 0;
      let monthAttended = 0;
      let monthAbsentA = 0;
      let monthLeaveB = 0;
      let monthAbsentC = 0;
      let monthTeacherD = 0;
      let monthTechE = 0;

      // Track counted dates to prevent duplicate calculation
      const processedDates = new Set<string>();

      // 1. Process pendingEdits first (takes precedence)
      Object.entries(pendingEdits).forEach(([key, status]) => {
        const [ecIdStr, dStr] = key.split('_');
        if (parseInt(ecIdStr, 10) !== s.enrollment_class_id) return;
        processedDates.add(dStr);

        const count = customValues[key] ?? 1;
        if (status === 'ATTENDED') totalAttended += count;
        else if (status === 'ABSENT_APPROVED_A') totalAbsentA++;
        else if (status === 'ABSENT_UNAPPROVED_C') totalAbsentC++;
        else if (status === 'TEACHER_ABSENT_D') totalTeacherD++;

        if (dStr && dStr.startsWith(monthPrefix)) {
          if (status === 'ATTENDED') monthAttended += count;
          else if (status === 'ABSENT_APPROVED_A') monthAbsentA++;
          else if (status === 'LEAVE_B') monthLeaveB++;
          else if (status === 'ABSENT_UNAPPROVED_C') monthAbsentC++;
          else if (status === 'TEACHER_ABSENT_D') monthTeacherD++;
          else if (status === 'TECH_ERROR_E') monthTechE++;
        }
      });

      // 2. Process existing attendances not overridden in pendingEdits
      attendances.forEach((a) => {
        if (a.enrollment_class_id !== s.enrollment_class_id) return;
        const dStr =
          formatSessionDate(a.class_session?.session_date) ||
          sessions.find((sess) => sess.id === a.class_session_id)?.session_date
            ? formatSessionDate(sessions.find((sess) => sess.id === a.class_session_id)!.session_date)
            : '';

        if (!dStr || processedDates.has(dStr)) return;
        processedDates.add(dStr);

        const status = a.status;
        const count = a.session_count ?? 1;

        if (status === 'ATTENDED') totalAttended += count;
        else if (status === 'ABSENT_APPROVED_A') totalAbsentA++;
        else if (status === 'ABSENT_UNAPPROVED_C') totalAbsentC++;
        else if (status === 'TEACHER_ABSENT_D') totalTeacherD++;

        if (dStr.startsWith(monthPrefix)) {
          if (status === 'ATTENDED') monthAttended += count;
          else if (status === 'ABSENT_APPROVED_A') monthAbsentA++;
          else if (status === 'LEAVE_B') monthLeaveB++;
          else if (status === 'ABSENT_UNAPPROVED_C') monthAbsentC++;
          else if (status === 'TEACHER_ABSENT_D') monthTeacherD++;
          else if (status === 'TECH_ERROR_E') monthTechE++;
        }
      });

      statsMap.set(s.enrollment_class_id, {
        totalAttended,
        totalAbsentA,
        totalAbsentC,
        totalTeacherD,
        monthAttended,
        monthAbsentA,
        monthLeaveB,
        monthAbsentC,
        monthTeacherD,
        monthTechE,
      });
    });

    return statsMap;
  }, [students, attendances, sessions, pendingEdits, customValues, currentDate]);

  // Overall KPI cards computation for Tab 3
  const overallKPIs = useMemo(() => {
    let grandTotalAttended = 0;
    let grandTotalMonthAttended = 0;
    let grandTotalAbsentA = 0;
    let grandTotalAbsentC = 0;
    let grandTotalTeacherD = 0;
    let grandTotalLeaveB = 0;
    let grandTotalTechE = 0;
    let negativeDebtStudents = 0;

    students.forEach((s) => {
      const stat = studentStats.get(s.enrollment_class_id);
      if (stat) {
        grandTotalAttended += stat.totalAttended;
        grandTotalMonthAttended += stat.monthAttended;
        grandTotalAbsentA += stat.totalAbsentA;
        grandTotalAbsentC += stat.totalAbsentC;
        grandTotalTeacherD += stat.totalTeacherD;
        grandTotalLeaveB += stat.monthLeaveB;
        grandTotalTechE += stat.monthTechE;
      }
      const rem =
        s.remaining_sessions ??
        (s.total_sessions ? s.total_sessions - (stat?.totalAttended || 0) : 0);
      if (rem < 0) negativeDebtStudents++;
    });

    const totalSessionsRecorded =
      grandTotalAttended + grandTotalAbsentA + grandTotalAbsentC + grandTotalTeacherD;
    const attendanceRate =
      totalSessionsRecorded > 0
        ? Math.round((grandTotalAttended / totalSessionsRecorded) * 100)
        : 100;

    return {
      grandTotalAttended,
      grandTotalMonthAttended,
      grandTotalAbsentA,
      grandTotalAbsentC,
      grandTotalTeacherD,
      grandTotalLeaveB,
      grandTotalTechE,
      negativeDebtStudents,
      attendanceRate,
    };
  }, [students, studentStats]);

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

  // Quick Date steppers for Tab 1
  const handleQuickDatePrev = () => {
    const [y, m, day] = quickDate.split('-').map(Number);
    const d = new Date(y, m - 1, day - 1);
    setQuickDate(toLocalDateString(d));
  };

  const handleQuickDateNext = () => {
    const [y, m, day] = quickDate.split('-').map(Number);
    const d = new Date(y, m - 1, day + 1);
    setQuickDate(toLocalDateString(d));
  };

  const handleQuickDateToday = () => {
    setQuickDate(toLocalDateString(new Date()));
  };

  // Toggle select all students (only valid assigned students)
  const handleToggleSelectAllStudents = () => {
    const validStudents = students.filter((s) => s.enrollment_class_id > 0);
    if (selectedStudents.size === validStudents.length && validStudents.length > 0) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(validStudents.map((s) => s.enrollment_class_id)));
    }
  };

  // Toggle single student select
  const handleToggleSelectStudent = (ecId: number) => {
    if (ecId <= 0) return;
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(ecId)) next.delete(ecId);
      else next.add(ecId);
      return next;
    });
  };

  // Bulk Apply Attended for selected students
  const handleBulkApplyAttended = () => {
    const targetDate = activeTab === 'quick' ? quickDate : bulkDate;
    if (selectedStudents.size === 0 || !targetDate) return;
    const updates: Record<string, AttendanceStatus> = {};
    const valUpdates: Record<string, number> = {};

    selectedStudents.forEach((ecId) => {
      if (ecId <= 0) return;
      const key = `${ecId}_${targetDate}`;
      updates[key] = 'ATTENDED';
      valUpdates[key] = bulkCount;
    });

    setPendingEdits((prev) => ({ ...prev, ...updates }));
    setCustomValues((prev) => ({ ...prev, ...valUpdates }));
    toast.success(
      `Đã đánh dấu Có mặt (${bulkCount} buổi) cho ${selectedStudents.size} học viên vào ngày ${new Date(targetDate).toLocaleDateString('vi-VN')}`
    );
  };

  // Bulk Apply Absent for selected students
  const handleBulkApplyAbsent = (status: AttendanceStatus) => {
    const targetDate = activeTab === 'quick' ? quickDate : bulkDate;
    if (selectedStudents.size === 0 || !targetDate) return;
    const updates: Record<string, AttendanceStatus> = {};

    selectedStudents.forEach((ecId) => {
      if (ecId <= 0) return;
      const key = `${ecId}_${targetDate}`;
      updates[key] = status;
    });

    setPendingEdits((prev) => ({ ...prev, ...updates }));
    toast.info(
      `Đã cập nhật trạng thái ${STATUS_CONFIG[status].label} cho ${selectedStudents.size} học viên`
    );
  };

  // Quick mark/unmark all present for a specific date (Column Checkbox)
  const handleToggleAllForDate = (dateStr: string) => {
    const validStudents = students.filter((s) => s.enrollment_class_id > 0);
    const isAllAttended =
      validStudents.length > 0 &&
      validStudents.every((s) => {
        const key = `${s.enrollment_class_id}_${dateStr}`;
        const st = pendingEdits[key] || attendanceMap.get(key)?.status;
        return st === 'ATTENDED';
      });

    const updates: Record<string, AttendanceStatus> = {};
    const valUpdates: Record<string, number> = {};

    if (isAllAttended) {
      // Unmark all (set to unassigned / removed)
      setPendingEdits((prev) => {
        const next = { ...prev };
        validStudents.forEach((s) => delete next[`${s.enrollment_class_id}_${dateStr}`]);
        return next;
      });
      setCustomValues((prev) => {
        const next = { ...prev };
        validStudents.forEach((s) => delete next[`${s.enrollment_class_id}_${dateStr}`]);
        return next;
      });
      toast.info(`Đã bỏ điểm danh cả lớp cho ngày ${new Date(dateStr).toLocaleDateString('vi-VN')}`);
    } else {
      // Mark all attended with 1 session
      validStudents.forEach((s) => {
        const key = `${s.enrollment_class_id}_${dateStr}`;
        updates[key] = 'ATTENDED';
        valUpdates[key] = 1;
      });
      setPendingEdits((prev) => ({ ...prev, ...updates }));
      setCustomValues((prev) => ({ ...prev, ...valUpdates }));
      toast.success(
        `Đã tích chọn Có mặt (1 buổi) cả lớp cho ngày ${new Date(dateStr).toLocaleDateString('vi-VN')}`
      );
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
                i.status === 'ATTENDED' ? customValues[`${i.ecId}_${dateStr}`] ?? 1 : 1,
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

  // Reusable interactive attendance cell component
  const renderAttendanceCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return (
        <span
          className="text-[10px] text-text-muted italic px-2 py-0.5 bg-slate-100/80 rounded select-none whitespace-nowrap"
          title="Học viên chưa được xếp vào lớp học"
        >
          Chưa xếp lớp
        </span>
      );
    }

    const key = `${st.enrollment_class_id}_${dateStr}`;
    const existingAtt = attendanceMap.get(key);
    const currentStatus: AttendanceStatus | undefined =
      pendingEdits[key] || existingAtt?.status;
    const isPending = !!pendingEdits[key];

    const cfg = currentStatus ? STATUS_CONFIG[currentStatus] : null;
    let displayValue: string | number = '-';
    if (currentStatus === 'ATTENDED') {
      displayValue = customValues[key] ?? existingAtt?.session_count ?? 1;
    } else if (cfg) {
      displayValue = cfg.short;
    }

    return (
      <div className="relative flex items-center justify-center p-1">
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

        {/* Popover Editor */}
        {activeCell?.enrollmentClassId === st.enrollment_class_id &&
          activeCell?.dateStr === dateStr && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-surface rounded-2xl shadow-soft-xl border border-border p-3 flex flex-col gap-2.5 w-60 text-left animate-in zoom-in-95 duration-100">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                <div>
                  <div className="text-[11px] font-bold text-text-primary truncate max-w-[170px]">
                    {activeCell.studentName}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {new Date(dateStr).toLocaleDateString('vi-VN', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                    })}
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
                <div className="flex items-center gap-1 pt-0.5">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() =>
                        handleStatusSelect(st.enrollment_class_id, dateStr, 'ATTENDED', num)
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
                {(
                  [
                    'ABSENT_APPROVED_A',
                    'LEAVE_B',
                    'ABSENT_UNAPPROVED_C',
                    'TEACHER_ABSENT_D',
                    'TECH_ERROR_E',
                  ] as AttendanceStatus[]
                ).map((stKey) => {
                  const opt = STATUS_CONFIG[stKey];
                  return (
                    <button
                      key={stKey}
                      type="button"
                      onClick={() =>
                        handleStatusSelect(st.enrollment_class_id, dateStr, stKey)
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
      </div>
    );
  };

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
      {/* 3 Main Tab Switchers Bar */}
      <div className="p-3 sm:p-4 border-b border-border/80 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <HorizontalTabs
          ariaLabel="Chế độ ma trận điểm danh"
          value={activeTab}
          onChange={setActiveTab}
          size="sm"
          items={[
            { value: 'quick', label: 'Điểm danh nhanh', icon: <Zap /> },
            { value: 'detailed', label: 'Chi tiết', icon: <Calendar /> },
            { value: 'stats', label: 'Thống kê', icon: <BarChart3 /> },
          ]}
        />

        {/* Global Save Button */}
        <div className="flex items-center gap-2.5">
          {hasChanges && (
            <Badge variant="warning" size="md" className="font-bold">
              {Object.keys(pendingEdits).length} thay đổi chưa lưu
            </Badge>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveAll}
            disabled={!hasChanges || saving}
            isLoading={saving}
            leftIcon={<Save className="w-4 h-4" />}
            className="font-bold"
          >
            Lưu kết quả điểm danh
          </Button>
        </div>
      </div>

      {/* Sub Toolbar per Active Tab */}
      {activeTab === 'quick' && (
        <div className="p-3 px-4 border-b border-border/70 bg-surface flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary font-bold">Ngày điểm danh:</span>
            <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-border/60">
              <button
                type="button"
                onClick={handleQuickDatePrev}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                title="Ngày hôm trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={quickDate}
                onChange={(e) => e.target.value && setQuickDate(e.target.value)}
                className="px-2 py-0.5 bg-surface text-text-primary font-bold text-xs rounded-lg border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleQuickDateNext}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                title="Ngày hôm sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleQuickDateToday}
              className="text-xs h-7 px-2.5 font-bold"
            >
              Hôm nay
            </Button>
          </div>

          <div className="text-[11px] text-text-muted flex items-center gap-2">
            <span>Sĩ số: <strong className="text-text-primary">{students.length}</strong> học viên</span>
            <span>•</span>
            <span>Hiển thị cột <strong>A ➔ H</strong> + <strong>K</strong> + Ngày <strong>{new Date(quickDate).toLocaleDateString('vi-VN')}</strong></span>
          </div>
        </div>
      )}

      {activeTab === 'detailed' && (
        <div className="p-3 px-4 border-b border-border/70 bg-surface flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Mode */}
            <div className="flex p-0.5 bg-surface-muted rounded-xl border border-border/60 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterMode('week')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  filterMode === 'week'
                    ? 'bg-surface text-primary shadow-xs font-bold'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Theo tuần
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('month')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  filterMode === 'month'
                    ? 'bg-surface text-primary shadow-xs font-bold'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Theo tháng
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('year')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  filterMode === 'year'
                    ? 'bg-surface text-primary shadow-xs font-bold'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Theo năm
              </button>
            </div>

            {/* Stepper buttons */}
            <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-border/60">
              <button
                type="button"
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
                type="button"
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
              className="text-xs h-7 px-2.5 font-bold"
            >
              Hôm nay
            </Button>
          </div>

          <div className="text-[11px] text-text-muted">
            Cấu trúc chuẩn Sheet 3: <strong>[A ➔ O, U ➔ X]</strong> ➔ <strong>[Z ➔ AH]</strong> ➔ <strong>[Lịch ngày]</strong>
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="p-3 px-4 border-b border-border/70 bg-surface flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary font-bold">Tháng thống kê (Cột AC ➔ AH):</span>
            <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-border/60">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(currentDate);
                  d.setMonth(d.getMonth() - 1);
                  setCurrentDate(d);
                }}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                title="Tháng trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2.5 text-xs font-bold text-text-primary select-none">
                Tháng {currentDate.getMonth() + 1} / {currentDate.getFullYear()}
              </span>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(currentDate);
                  d.setMonth(d.getMonth() + 1);
                  setCurrentDate(d);
                }}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                title="Tháng sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
              className="text-xs h-7 px-2.5 font-bold"
            >
              Tháng hiện tại
            </Button>
          </div>

          <div className="text-[11px] text-text-muted">
            Tổng hợp dữ liệu chuyên cần từ <strong>Cột A ➔ H</strong> và <strong>Cột Y ➔ AH</strong>
          </div>
        </div>
      )}

      {/* Bulk Action Bar (When >= 1 student selected in Tab 1 or Tab 2) */}
      {selectedStudents.size > 0 && activeTab !== 'stats' && (
        <div className="bg-primary-soft/90 border-b border-primary/30 p-2.5 px-4 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
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
            {activeTab === 'detailed' && (
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
            )}

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
              {(
                [
                  'ABSENT_APPROVED_A',
                  'LEAVE_B',
                  'ABSENT_UNAPPROVED_C',
                  'TEACHER_ABSENT_D',
                  'TECH_ERROR_E',
                ] as AttendanceStatus[]
              ).map((st) => (
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

      {/* ========================================================================= */}
      {/* TAB 1: ĐIỂM DANH NHANH (A -> H + K + 1 Cột Ngày Hiện Tại)                 */}
      {/* ========================================================================= */}
      {activeTab === 'quick' && (
        <div className="w-full overflow-x-auto select-none">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                {/* Checkbox */}
                <th className="px-2 py-3 border-r border-border/60 w-10 min-w-[40px] text-center bg-slate-100/90">
                  <input
                    type="checkbox"
                    checked={selectedStudents.size > 0 && selectedStudents.size === students.length}
                    onChange={handleToggleSelectAllStudents}
                    className="w-3.5 h-3.5 rounded text-primary focus:ring-primary border-slate-300 cursor-pointer accent-primary"
                    title="Chọn tất cả học viên"
                  />
                </th>
                <th className="px-2 py-3 border-r border-border/60 w-10 min-w-[40px] text-center bg-slate-100/90">
                  #
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[90px]">
                  ID
                </th>
                <th className="px-4 py-3 border-r border-border/60 whitespace-nowrap min-w-[160px]">
                  Họ tên HV
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                  Gói học
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[120px]">
                  Nội dung khoá
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[90px]">
                  Tổng số buổi
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[100px]">
                  Khoá học
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[160px]">
                  Email
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[90px]">
                  Mô hình
                </th>
                <th className="px-3 py-3 border-r-2 border-border/80 whitespace-nowrap min-w-[110px]">
                  Trạng thái
                </th>

                {/* 1 Cột điểm danh ngày hiện tại (hoặc quickDate) */}
                {(() => {
                  const [y, m, day] = quickDate.split('-').map(Number);
                  const d = new Date(y, m - 1, day);
                  const isToday = toLocalDateString(new Date()) === quickDate;
                  const isAllAttended =
                    students.length > 0 &&
                    students.every((s) => {
                      const key = `${s.enrollment_class_id}_${quickDate}`;
                      return (pendingEdits[key] || attendanceMap.get(key)?.status) === 'ATTENDED';
                    });

                  return (
                    <th className="px-4 py-2 border-r border-border/60 text-center min-w-[140px] bg-blue-50/90 text-primary border-primary/40">
                      <div className="text-[10px] font-bold text-primary/80 uppercase">
                        {isToday ? 'Hôm nay' : 'Ngày chọn'} • {DAY_OF_WEEK_NAMES[d.getDay()]}
                      </div>
                      <div className="text-[13px] font-extrabold text-primary flex items-center justify-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span>
                          {d.getDate() < 10 ? `0${d.getDate()}` : d.getDate()}/
                          {d.getMonth() + 1 < 10 ? `0${d.getMonth() + 1}` : d.getMonth() + 1}/
                          {d.getFullYear()}
                        </span>
                      </div>
                      <label
                        className="mt-1 flex items-center justify-center gap-1 cursor-pointer text-[10px] font-bold text-emerald-800"
                        title="Tích chọn cả lớp có mặt"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isAllAttended}
                          onChange={() => handleToggleAllForDate(quickDate)}
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600"
                        />
                        <span>Cả lớp có mặt</span>
                      </label>
                    </th>
                  );
                })()}
              </tr>
            </thead>

            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-10 text-text-muted">
                    Không có học viên nào để điểm danh.
                  </td>
                </tr>
              ) : (
                students.map((st, idx) => {
                  const isSelected = selectedStudents.has(st.enrollment_class_id);

                  return (
                    <tr
                      key={st.enrollment_class_id}
                      className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-primary-soft/40' : idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-2 py-2.5 border-r border-border/60 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={st.enrollment_class_id <= 0}
                          onChange={() => handleToggleSelectStudent(st.enrollment_class_id)}
                          className="w-3.5 h-3.5 rounded text-primary focus:ring-primary border-slate-300 cursor-pointer accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
                          title={st.enrollment_class_id <= 0 ? 'Học viên chưa được xếp lớp' : 'Chọn học viên'}
                        />
                      </td>

                      {/* STT */}
                      <td className="px-2 py-2.5 border-r border-border/60 text-center text-text-muted font-bold">
                        {idx + 1}
                      </td>

                      {/* Cột A: Mã HV */}
                      <td className="px-3 py-2.5 border-r border-border/60 font-mono font-bold text-text-primary whitespace-nowrap">
                        {st.external_id || `HV_${st.student_id}`}
                      </td>

                      {/* Cột B: Họ tên */}
                      <td className="px-4 py-2.5 border-r border-border/60 font-bold text-text-primary whitespace-nowrap">
                        {st.full_name}
                      </td>

                      {/* Cột C: Gói học */}
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        <span className="font-semibold">{st.package_name || '-'}</span>
                      </td>

                      {/* Cột D: Nội dung khoá */}
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.course_content || '-'}
                      </td>

                      {/* Cột E: Tổng số buổi */}
                      <td className="px-3 py-2.5 border-r border-border/60 text-center font-bold text-text-primary">
                        {st.total_sessions || 0}
                      </td>

                      {/* Cột F: Khoá học / Trình độ */}
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        {st.level || '-'}
                      </td>

                      {/* Cột G: Email */}
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.email || '-'}
                      </td>

                      {/* Cột H: Mô hình */}
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        <Badge variant="neutral" size="sm">
                          {st.model_type || '1:1'}
                        </Badge>
                      </td>

                      {/* Cột K: Trạng thái */}
                      <td className="px-3 py-2.5 border-r-2 border-border/80 whitespace-nowrap">
                        <Badge
                          variant={
                            st.status === 'STUDYING'
                              ? 'success'
                              : st.status === 'PAUSED'
                              ? 'warning'
                              : st.status === 'FINISHED'
                              ? 'info'
                              : 'neutral'
                          }
                          size="sm"
                        >
                          {st.status === 'STUDYING'
                            ? 'Đang học'
                            : st.status === 'PAUSED'
                            ? 'Bảo lưu'
                            : st.status === 'FINISHED'
                            ? 'Hoàn thành'
                            : st.status}
                        </Badge>
                      </td>

                      {/* 1 Cột Ngày Điểm danh */}
                      <td className="px-2 py-1.5 border-r border-border/60 text-center bg-blue-50/20">
                        {renderAttendanceCell(st, quickDate)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CHI TIẾT MA TRẬN THEO THÁNG (A->O, U->X, Z->AH + Các Cột Ngày)     */}
      {/* ========================================================================= */}
      {activeTab === 'detailed' && (
        <div className="w-full overflow-x-auto select-none">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                {/* Checkbox Column */}
                <th className="px-2 py-3 border-r border-border/60 sticky left-0 bg-slate-100 z-20 w-10 min-w-[40px] text-center">
                  <input
                    type="checkbox"
                    checked={selectedStudents.size === students.length && students.length > 0}
                    onChange={handleToggleSelectAllStudents}
                    className="w-3.5 h-3.5 rounded text-primary focus:ring-primary border-slate-300 cursor-pointer accent-primary"
                    title="Chọn tất cả học viên"
                  />
                </th>

                {/* Sticky 3 Cột định danh nhận diện */}
                <th className="px-2 py-3 border-r border-border/60 sticky left-10 bg-slate-100 z-20 w-10 min-w-[40px] text-center">
                  #
                </th>
                <th className="px-3 py-3 border-r border-border/60 sticky left-20 bg-slate-100 z-20 whitespace-nowrap min-w-[85px]">
                  ID
                </th>
                <th className="px-4 py-3 border-r-2 border-border/80 sticky left-[165px] bg-slate-100 z-20 whitespace-nowrap min-w-[160px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                  Họ tên HV
                </th>

                {/* Cột C -> O: Gói học & Lịch học */}
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                  Gói học
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                  Nội dung khoá
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[80px]">
                  Tổng số buổi
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[95px]">
                  Khoá học
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[150px]">
                  Email
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[85px]">
                  Mô hình
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[95px] bg-amber-50/60 text-amber-900">
                  Số buổi còn lại
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[90px]">
                  Ngày bắt đầu học
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[100px]">
                  Trạng thái
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[95px]">
                  Ngày kết thúc/Bảo lưu
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[75px]">
                  Giờ học (1)
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[75px]">
                  Lịch học (1)
                </th>
                <th className="px-3 py-3 border-r-2 border-border/80 text-center whitespace-nowrap min-w-[80px]">
                  Thời lượng buổi học (1)
                </th>

                {/* Cột U -> X: GV, Lớp & Đã học */}
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[120px]">
                  Giáo viên
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[80px]">
                  Mã GV
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[130px]">
                  Tên lớp
                </th>
                <th className="px-3 py-3 border-r-2 border-border/80 text-center whitespace-nowrap min-w-[95px] bg-emerald-50 text-emerald-900 font-extrabold">
                  Tổng số buổi đã học
                </th>

                {/* Cột Z -> AH: Thống kê vắng nghỉ & chi tiết tháng */}
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[110px] bg-amber-50/70 text-amber-900">
                  Tổng số buổi HV nghỉ có phép
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[110px] bg-rose-50/70 text-rose-900">
                  Tổng số buổi HV nghỉ không phép
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[100px] bg-red-100/70 text-red-900">
                  Tổng số buổi GV nghỉ
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[110px] bg-emerald-100/70 text-emerald-950 font-extrabold">
                  <div className="text-[10px] text-emerald-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                  <div>Số buổi đã học</div>
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[120px] bg-amber-100/70 text-amber-950 font-bold">
                  <div className="text-[10px] text-amber-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                  <div>Số buổi xin nghỉ có phép</div>
                  <div className="text-[10px] text-amber-800 font-extrabold">A</div>
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[110px] bg-blue-100/70 text-blue-950 font-bold">
                  <div className="text-[10px] text-blue-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                  <div>Số buổi bảo lưu</div>
                  <div className="text-[10px] text-blue-800 font-extrabold">B</div>
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[120px] bg-rose-100/70 text-rose-950 font-bold">
                  <div className="text-[10px] text-rose-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                  <div>Số buổi nghỉ sai quy định</div>
                  <div className="text-[10px] text-rose-800 font-extrabold">C</div>
                </th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[110px] bg-red-200/70 text-red-950 font-bold">
                  <div className="text-[10px] text-red-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                  <div>Số buổi GV xin nghỉ</div>
                  <div className="text-[10px] text-red-800 font-extrabold">D</div>
                </th>
                <th className="px-3 py-3 border-r-2 border-border/80 text-center whitespace-nowrap min-w-[110px] bg-slate-200/70 text-slate-900 font-bold">
                  <div className="text-[10px] text-slate-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                  <div>Số buổi lỗi kĩ thuật</div>
                  <div className="text-[10px] text-slate-800 font-extrabold">E</div>
                </th>

                {/* Các Cột Lịch Ngày theo Tháng */}
                {datesList.map((d) => {
                  const dateStr = toDateString(d);
                  const dayOfWeek = DAY_OF_WEEK_NAMES[d.getDay()];
                  const isToday = toDateString(new Date()) === dateStr;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;

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
            </thead>

            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={30 + datesList.length} className="text-center py-10 text-text-muted">
                    Không có học viên nào để điểm danh.
                  </td>
                </tr>
              ) : (
                students.map((st, idx) => {
                  const isSelected = selectedStudents.has(st.enrollment_class_id);
                  const stat = studentStats.get(st.enrollment_class_id);
                  const remaining =
                    st.remaining_sessions ??
                    (st.total_sessions ? st.total_sessions - (stat?.totalAttended || 0) : 0);
                  const isNegativeDebt = remaining < 0;

                  return (
                    <tr
                      key={st.enrollment_class_id}
                      className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-primary-soft/40' : idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-2 py-2.5 border-r border-border/60 text-center sticky left-0 bg-slate-100 z-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={st.enrollment_class_id <= 0}
                          onChange={() => handleToggleSelectStudent(st.enrollment_class_id)}
                          className="w-3.5 h-3.5 rounded text-primary focus:ring-primary border-slate-300 cursor-pointer accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
                          title={st.enrollment_class_id <= 0 ? 'Học viên chưa được xếp lớp' : 'Chọn học viên'}
                        />
                      </td>

                      {/* STT */}
                      <td className="px-2 py-2.5 border-r border-border/60 text-center text-text-muted font-bold sticky left-10 bg-slate-100 z-10">
                        {idx + 1}
                      </td>

                      {/* Mã HV (A) */}
                      <td className="px-3 py-2.5 border-r border-border/60 font-mono font-bold text-text-primary whitespace-nowrap sticky left-20 bg-slate-100 z-10">
                        {st.external_id || `HV_${st.student_id}`}
                      </td>

                      {/* Họ và tên (B) */}
                      <td className="px-4 py-2.5 border-r-2 border-border/80 font-bold text-text-primary whitespace-nowrap sticky left-[165px] bg-slate-100 z-10 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        {st.full_name}
                      </td>

                      {/* Cột C -> O */}
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        {st.package_name || '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.course_content || '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-center font-bold text-text-primary">
                        {st.total_sessions || 0}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        {st.level || '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.email || '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        <Badge variant="neutral" size="sm">
                          {st.model_type || '1:1'}
                        </Badge>
                      </td>

                      {/* Buổi còn lại (I) - Cảnh báo nợ âm */}
                      <td className="px-3 py-2.5 border-r border-border/60 text-center font-extrabold whitespace-nowrap">
                        {isNegativeDebt ? (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-300 text-xs font-black shadow-2xs">
                            {remaining}
                          </span>
                        ) : (
                          <span className="text-text-primary font-bold">{remaining}</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.start_date ? new Date(st.start_date).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap">
                        <Badge
                          variant={
                            st.status === 'STUDYING'
                              ? 'success'
                              : st.status === 'PAUSED'
                              ? 'warning'
                              : st.status === 'FINISHED'
                              ? 'info'
                              : 'neutral'
                          }
                          size="sm"
                        >
                          {st.status === 'STUDYING'
                            ? 'Đang học'
                            : st.status === 'PAUSED'
                            ? 'Bảo lưu'
                            : st.status === 'FINISHED'
                            ? 'Hoàn thành'
                            : st.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.end_date ? new Date(st.end_date).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.start_time || '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.schedule_pattern || '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r-2 border-border/80 text-center text-text-muted whitespace-nowrap">
                        {st.duration_minutes ? `${st.duration_minutes}p` : '-'}
                      </td>

                      {/* Cột U -> X: GV, Lớp & Đã học */}
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-primary font-semibold whitespace-nowrap">
                        {st.teacher_name || '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 font-mono text-text-muted whitespace-nowrap">
                        {st.teacher_code || '-'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-text-primary whitespace-nowrap">
                        {st.class_name}
                      </td>
                      <td className="px-3 py-2.5 border-r-2 border-border/80 text-center font-extrabold text-emerald-800 bg-emerald-50/40">
                        {stat?.totalAttended || 0}
                      </td>

                      {/* Cột Z -> AH: Thống kê vắng nghỉ */}
                      <td className="px-2 py-2.5 border-r border-border/60 text-center font-bold text-amber-800 bg-amber-50/20">
                        {stat?.totalAbsentA || 0}
                      </td>
                      <td className="px-2 py-2.5 border-r border-border/60 text-center font-bold text-rose-800 bg-rose-50/20">
                        {stat?.totalAbsentC || 0}
                      </td>
                      <td className="px-2 py-2.5 border-r border-border/60 text-center font-bold text-red-900 bg-red-100/20">
                        {stat?.totalTeacherD || 0}
                      </td>
                      <td className="px-2 py-2.5 border-r border-border/60 text-center font-extrabold text-emerald-800 bg-emerald-100/30">
                        {stat?.monthAttended || 0}
                      </td>
                      <td className="px-2 py-2.5 border-r border-border/60 text-center font-bold text-amber-800 bg-amber-100/30">
                        {stat?.monthAbsentA || 0}
                      </td>
                      <td className="px-2 py-2.5 border-r border-border/60 text-center font-bold text-blue-800 bg-blue-100/30">
                        {stat?.monthLeaveB || 0}
                      </td>
                      <td className="px-2 py-2.5 border-r border-border/60 text-center font-bold text-rose-800 bg-rose-100/30">
                        {stat?.monthAbsentC || 0}
                      </td>
                      <td className="px-2 py-2.5 border-r border-border/60 text-center font-bold text-red-900 bg-red-200/30">
                        {stat?.monthTeacherD || 0}
                      </td>
                      <td className="px-2 py-2.5 border-r-2 border-border/80 text-center font-bold text-slate-800 bg-slate-200/30">
                        {stat?.monthTechE || 0}
                      </td>

                      {/* Các Cột Lịch Ngày theo Tháng */}
                      {datesList.map((d) => {
                        const dateStr = toDateString(d);
                        return (
                          <td
                            key={dateStr}
                            className="px-1 py-1 border-r border-border/60 text-center"
                          >
                            {renderAttendanceCell(st, dateStr)}
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
      )}

      {/* ========================================================================= */}
      {/* TAB 3: THỐNG KÊ ĐIỂM DANH (A -> H + Y -> AH)                             */}
      {/* ========================================================================= */}
      {activeTab === 'stats' && (
        <div className="flex flex-col gap-5 p-4 sm:p-5">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 shadow-2xs">
              <div className="text-[11px] font-bold text-emerald-800 uppercase flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tổng buổi đã học</span>
              </div>
              <div className="text-2xl font-black text-emerald-950 mt-1">
                {overallKPIs.grandTotalAttended}
              </div>
              <div className="text-[10px] text-emerald-700 mt-0.5">Tích lũy toàn thời gian</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200 shadow-2xs">
              <div className="text-[11px] font-bold text-blue-800 uppercase flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Học trong tháng</span>
              </div>
              <div className="text-2xl font-black text-blue-950 mt-1">
                {overallKPIs.grandTotalMonthAttended}
              </div>
              <div className="text-[10px] text-blue-700 mt-0.5">
                Tháng {currentDate.getMonth() + 1}/{currentDate.getFullYear()}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 shadow-2xs">
              <div className="text-[11px] font-bold text-amber-800 uppercase flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-600" />
                <span>Nghỉ có phép (A)</span>
              </div>
              <div className="text-2xl font-black text-amber-950 mt-1">
                {overallKPIs.grandTotalAbsentA}
              </div>
              <div className="text-[10px] text-amber-700 mt-0.5">Đã xin phép giáo viên</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50/80 border border-rose-200 shadow-2xs">
              <div className="text-[11px] font-bold text-rose-800 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>Nghỉ sai QĐ (C)</span>
              </div>
              <div className="text-2xl font-black text-rose-950 mt-1">
                {overallKPIs.grandTotalAbsentC}
              </div>
              <div className="text-[10px] text-rose-700 mt-0.5">Vắng không báo trước</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/80 border border-purple-200 shadow-2xs">
              <div className="text-[11px] font-bold text-purple-800 uppercase flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
                <span>Tỷ lệ chuyên cần</span>
              </div>
              <div className="text-2xl font-black text-purple-950 mt-1">
                {overallKPIs.attendanceRate}%
              </div>
              <div className="text-[10px] text-purple-700 mt-0.5">Trên tổng ca học diễn ra</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-red-50/90 border border-red-300 shadow-2xs">
              <div className="text-[11px] font-bold text-red-800 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span>Cảnh báo nợ buổi</span>
              </div>
              <div className="text-2xl font-black text-red-950 mt-1">
                {overallKPIs.negativeDebtStudents}
              </div>
              <div className="text-[10px] text-red-700 mt-0.5">Học viên số buổi &lt; 0</div>
            </div>
          </div>

          {/* Table: Cột A -> H + Y -> AH */}
          <div className="w-full overflow-x-auto select-none rounded-xl border border-border/80">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                  <th className="px-2 py-3 border-r border-border/60 w-10 min-w-[40px] text-center bg-slate-100">
                    #
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[85px]">
                    ID
                  </th>
                  <th className="px-4 py-3 border-r border-border/60 whitespace-nowrap min-w-[160px]">
                    Họ tên HV
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                    Gói học
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                    Nội dung khoá
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[90px]">
                    Tổng số buổi
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[95px]">
                    Khoá học
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[150px]">
                    Email
                  </th>
                  <th className="px-3 py-3 border-r-2 border-border/80 whitespace-nowrap min-w-[85px]">
                    Mô hình
                  </th>

                  {/* Cột Y -> AH: Thống kê toàn bộ & theo tháng khớp Sheet 3 */}
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[105px] bg-emerald-50 text-emerald-900 font-extrabold">
                    <div className="text-[10px] text-emerald-700 uppercase font-semibold">{currentDate.getFullYear()}</div>
                    <div>Tổng số buổi đã học</div>
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[125px] bg-amber-50/70 text-amber-900 font-bold">
                    Tổng số buổi HV nghỉ có phép
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[125px] bg-rose-50/70 text-rose-900 font-bold">
                    Tổng số buổi HV nghỉ không phép
                  </th>
                  <th className="px-3 py-3 border-r-2 border-border/80 text-center whitespace-nowrap min-w-[110px] bg-red-100/70 text-red-900 font-bold">
                    Tổng số buổi GV nghỉ
                  </th>

                  {/* Tháng thống kê AC -> AH khớp Sheet 3 */}
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[110px] bg-emerald-100/70 text-emerald-950 font-extrabold">
                    <div className="text-[10px] text-emerald-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                    <div>Số buổi đã học</div>
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[120px] bg-amber-100/70 text-amber-950 font-bold">
                    <div className="text-[10px] text-amber-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                    <div>Số buổi xin nghỉ có phép</div>
                    <div className="text-[10px] text-amber-800 font-extrabold">A</div>
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[110px] bg-blue-100/70 text-blue-950 font-bold">
                    <div className="text-[10px] text-blue-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                    <div>Số buổi bảo lưu</div>
                    <div className="text-[10px] text-blue-800 font-extrabold">B</div>
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[120px] bg-rose-100/70 text-rose-950 font-bold">
                    <div className="text-[10px] text-rose-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                    <div>Số buổi nghỉ sai quy định</div>
                    <div className="text-[10px] text-rose-800 font-extrabold">C</div>
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[110px] bg-red-200/70 text-red-950 font-bold">
                    <div className="text-[10px] text-red-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                    <div>Số buổi GV xin nghỉ</div>
                    <div className="text-[10px] text-red-800 font-extrabold">D</div>
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[110px] bg-slate-200/70 text-slate-900 font-bold">
                    <div className="text-[10px] text-slate-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                    <div>Số buổi lỗi kĩ thuật</div>
                    <div className="text-[10px] text-slate-800 font-extrabold">E</div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="text-center py-10 text-text-muted">
                      Không có học viên nào.
                    </td>
                  </tr>
                ) : (
                  students.map((st, idx) => {
                    const stat = studentStats.get(st.enrollment_class_id);

                    return (
                      <tr
                        key={st.enrollment_class_id}
                        className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                          idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                        }`}
                      >
                        <td className="px-2 py-2.5 border-r border-border/60 text-center text-text-muted font-bold bg-slate-100">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 font-mono font-bold text-text-primary whitespace-nowrap">
                          {st.external_id || `HV_${st.student_id}`}
                        </td>
                        <td className="px-4 py-2.5 border-r border-border/60 font-bold text-text-primary whitespace-nowrap">
                          {st.full_name}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                          {st.package_name || '-'}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                          {st.course_content || '-'}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-center font-bold text-text-primary">
                          {st.total_sessions || 0}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                          {st.level || '-'}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                          {st.email || '-'}
                        </td>
                        <td className="px-3 py-2.5 border-r-2 border-border/80 text-text-secondary whitespace-nowrap">
                          <Badge variant="neutral" size="sm">
                            {st.model_type || '1:1'}
                          </Badge>
                        </td>

                        {/* Cột Y -> AB */}
                        <td className="px-3 py-2.5 border-r border-border/60 text-center font-black text-emerald-800 bg-emerald-50/40">
                          {stat?.totalAttended || 0}
                        </td>
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-amber-800 bg-amber-50/20">
                          {stat?.totalAbsentA || 0}
                        </td>
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-rose-800 bg-rose-50/20">
                          {stat?.totalAbsentC || 0}
                        </td>
                        <td className="px-2.5 py-2.5 border-r-2 border-border/80 text-center font-bold text-red-900 bg-red-100/20">
                          {stat?.totalTeacherD || 0}
                        </td>

                        {/* Cột AC -> AH */}
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-extrabold text-emerald-800 bg-emerald-100/30">
                          {stat?.monthAttended || 0}
                        </td>
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-amber-800 bg-amber-100/30">
                          {stat?.monthAbsentA || 0}
                        </td>
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-blue-800 bg-blue-100/30">
                          {stat?.monthLeaveB || 0}
                        </td>
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-rose-800 bg-rose-100/30">
                          {stat?.monthAbsentC || 0}
                        </td>
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-red-900 bg-red-200/30">
                          {stat?.monthTeacherD || 0}
                        </td>
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-slate-800 bg-slate-200/30">
                          {stat?.monthTechE || 0}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend Footer */}
      <div className="p-3.5 px-4 border-t border-border/80 bg-surface-muted/30 flex flex-wrap items-center justify-between gap-4 text-xs text-text-secondary">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-text-primary">Chú thích mã trạng thái:</span>
          {Object.entries(STATUS_CONFIG).map(([key, opt]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-extrabold border ${opt.bg} ${opt.text} ${opt.border}`}
              >
                {key === 'ATTENDED' ? '1' : opt.short}
              </span>
              <span>{key === 'ATTENDED' ? 'Có mặt (Điền số buổi: 1, 2...)' : opt.label}</span>
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
