import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Class,
  ClassSession,
  Attendance,
  AttendanceStatus,
  AttendanceSide,
} from '../types/classes.types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import { attendanceApi, classSessionsApi } from '../api/sessions.api';
import { useAuth } from '../../../contexts/AuthContext';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarDays,
  Award,
  AlertTriangle,
  Clock,
  Users,
  BarChart3,
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
  phone?: string | null;            // SĐT phục vụ tìm kiếm
  model_type?: string | null;       // Cột H: Mô hình (1:1, 1:2, 1:n)
  remaining_sessions?: number | null;// Cột I: Số buổi còn lại
  attended_previous_years?: number | null; // Số buổi đã học năm trước
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
    customValues?: Record<string, number>,
    sessionIndex?: number,
    side?: AttendanceSide
  ) => Promise<void>;
  activeTab?: AttendanceTab;
  titleHeader?: React.ReactNode;
  visibleColumns?: Record<string, boolean>;
}

export type AttendanceTab = 'quick' | 'detailed' | 'stats';

const formatClassModel = (model?: string | null): string => {
  const labels: Record<string, string> = {
    ONE_TO_ONE: '1-1',
    ONE_TO_TWO: '1-2',
    ONE_TO_N: '1-N',
    GROUP: '1-N',
    '1:1': '1-1',
    '1:2': '1-2',
    '1:n': '1-N',
  };

  return labels[model || ''] || model || '1-1';
};

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

const isDateInSchedule = (dateStr: string, pattern?: string | null): boolean => {
  if (!pattern) return true;
  if (pattern.toUpperCase() === 'LKCD') return true;
  const d = new Date(dateStr);
  const day = d.getDay();
  const map: Record<number, string> = { 0: 'CN', 1: '2', 2: '3', 3: '4', 4: '5', 5: '6', 6: '7' };
  const char = map[day];
  return pattern.toUpperCase().includes(char);
};

interface AttendancePickerPopoverProps {
  anchorEl: HTMLElement;
  studentName: string;
  dateStr: string;
  sessions: ClassSession[];
  attendanceBySession: Map<number, Attendance>;
  savingSessionId: number | 'draft' | null;
  onSelectStatus: (session: ClassSession | undefined, status: AttendanceStatus) => void;
  onClear: (session: ClassSession) => void;
  onAddSession: () => void;
  onDeleteSession: (session: ClassSession) => void;
  onClose: () => void;
}

interface PopoverPositionState {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
  arrowLeft: number;
}

function computePopoverCoords(anchorRect: DOMRect, popoverEl: HTMLElement | null): PopoverPositionState {
  const viewportPadding = 12;
  const popoverWidth = popoverEl?.offsetWidth || 360;
  const popoverHeight = Math.min(popoverEl?.offsetHeight || 420, window.innerHeight - 100);
  const headerEl = document.querySelector('header');
  const safeTopLimit = Math.max(headerEl?.getBoundingClientRect().bottom || 64, 0) + 8;
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const left = Math.round(Math.min(Math.max(anchorCenterX - popoverWidth / 2, viewportPadding), Math.max(viewportPadding, window.innerWidth - popoverWidth - viewportPadding)));
  const topIfAbove = anchorRect.top - 8 - popoverHeight;
  const placement: 'top' | 'bottom' = topIfAbove < safeTopLimit ? 'bottom' : 'top';
  const top = placement === 'top'
    ? Math.round(topIfAbove)
    : Math.round(Math.min(anchorRect.bottom + 8, Math.max(safeTopLimit, window.innerHeight - popoverHeight - viewportPadding)));
  return {
    top,
    left,
    placement,
    arrowLeft: Math.round(Math.min(Math.max(anchorCenterX - left, 20), popoverWidth - 20)),
  };
}

const AttendancePickerPopover: React.FC<AttendancePickerPopoverProps> = ({
  anchorEl,
  studentName,
  dateStr,
  sessions,
  attendanceBySession,
  savingSessionId,
  onSelectStatus,
  onClear,
  onAddSession,
  onDeleteSession,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => computePopoverCoords(anchorEl.getBoundingClientRect(), null));

  useEffect(() => {
    let rafId: number | null = null;
    const updatePosition = () => {
      if (!document.body.contains(anchorEl)) return onClose();
      const rect = anchorEl.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return onClose();
      setPosition(computePopoverCoords(rect, popoverRef.current));
    };
    const handleScrollOrResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePosition);
    };
    updatePosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [anchorEl, onClose, sessions.length]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorEl.contains(target) && !popoverRef.current?.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorEl, onClose]);

  const formattedDate = new Date(`${dateStr}T00:00:00`).toLocaleDateString('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const rows: Array<ClassSession | undefined> = sessions.length ? sessions : [undefined];
  const statusOrder: AttendanceStatus[] = ['ATTENDED', 'ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E'];

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`Điểm danh cho ${studentName} ngày ${formattedDate}`}
      className="fixed z-[100] w-[min(360px,calc(100vw-24px))] rounded-2xl border border-border bg-surface p-3 text-left shadow-soft-xl animate-in fade-in-0 zoom-in-95 duration-100 select-none"
      style={{ top: position.top, left: position.left }}
    >
      <span aria-hidden="true" className={`absolute h-3 w-3 -translate-x-1/2 rotate-45 border-border bg-surface ${position.placement === 'top' ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-l border-t'}`} style={{ left: position.arrowLeft }} />
      <div className="mb-3 flex items-start justify-between border-b border-border/60 pb-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-extrabold text-text-primary" title={studentName}>{studentName}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-primary">{formattedDate}</div>
        </div>
        <button id="attendance-popover-close" type="button" onClick={onClose} aria-label="Đóng bảng điểm danh" className="rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-surface-muted">Đóng</button>
      </div>

      <div className="max-h-[min(58vh,430px)] space-y-2 overflow-y-auto pr-1">
        {rows.map((session, index) => {
          const attendance = session ? attendanceBySession.get(session.id) : undefined;
          const currentStatus = attendance?.status;
          const rowSaving = savingSessionId === (session?.id ?? 'draft');
          return (
            <section key={session?.id ?? 'draft'} className={`rounded-xl border p-2.5 ${rowSaving ? 'border-primary/40 opacity-70' : 'border-border/70'}`} aria-label={`Buổi ${index + 1}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-extrabold text-text-primary">Buổi {index + 1}</span>
                  {session?.start_time && <span className="ml-2 text-[10px] text-text-muted">{session.start_time}</span>}
                  {!session && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">Chưa lưu</span>}
                </div>
                {session && (
                  <button id={`delete-session-${session.id}`} type="button" onClick={() => onDeleteSession(session)} className="rounded-lg px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50" aria-label={`Xóa buổi ${index + 1}`}>Xóa buổi</button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {statusOrder.map((status) => {
                  const option = STATUS_CONFIG[status];
                  const active = currentStatus === status;
                  return (
                    <button
                      id={`attendance-${session?.id ?? 'draft'}-${status}`}
                      key={status}
                      type="button"
                      disabled={rowSaving}
                      onClick={() => onSelectStatus(session, status)}
                      aria-pressed={active}
                      className={`h-8 rounded-lg border px-1 text-[10px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${active ? 'ring-2 ring-primary ring-offset-1' : ''} ${option.bg} ${option.text} ${option.border}`}
                      title={option.label}
                    >{status === 'ATTENDED' ? '1 · Có mặt' : option.short}</button>
                  );
                })}
              </div>
              {session && attendance && (
                <button type="button" onClick={() => onClear(session)} className="mt-2 w-full rounded-lg border border-border py-1.5 text-[10px] font-bold text-text-muted hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600">Chưa điểm danh</button>
              )}
            </section>
          );
        })}
      </div>
      <button id="add-attendance-session" type="button" onClick={onAddSession} disabled={savingSessionId !== null || !sessions.length} className="mt-3 flex h-9 w-full items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 text-xs font-extrabold text-primary transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50">+ Thêm buổi</button>
      {!sessions.length && <p className="mt-1.5 text-center text-[10px] text-text-muted">Buổi 1 chỉ được tạo khi bạn chọn trạng thái.</p>}
    </div>,
    document.body
  );
};

export const AttendanceMatrix: React.FC<AttendanceMatrixProps> = ({
  cls,
  students,
  sessions,
  attendances,
  onRefresh,
  onSaveCustom,
  activeTab: controlledActiveTab,
  titleHeader,
  visibleColumns,
}) => {
  const isColVisible = (key: string): boolean => {
    if (!visibleColumns) return true;
    return visibleColumns[key] !== false;
  };

  const toast = useToast();
  const { user } = useAuth();
  const privilegedSideChoice = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'MANAGE'));
  const defaultSide: AttendanceSide = user?.roles.includes('TEACHER') && !user?.roles.includes('CS') ? 'TEACHER' : 'CS';
  const [selectedSide, setSelectedSide] = useState<AttendanceSide>(defaultSide);

  const [internalActiveTab] = useState<AttendanceTab>('quick');
  const activeTab = controlledActiveTab ?? internalActiveTab;

  // Tab 1 (Quick Attendance) specific date state (Default: Today)
  const [quickDate, setQuickDate] = useState<string>(() => toLocalDateString(new Date()));

  // Filter mode for Tab 2 (Detailed): 'month' (default), 'week', 'year'
  const [filterMode, setFilterMode] = useState<'month' | 'week' | 'year'>('month');

  // Selected date reference for Tab 2 & 3 (default: today)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Track optimistic updates: Key is `${enrollment_class_id}_${dateString}`
  const [optimisticUpdates, setOptimisticUpdates] = useState<
    Record<
      string,
      {
        status: AttendanceStatus;
        updated_at: string;
        source: 'MANUAL';
      }
    >
  >({});
  const [clearedKeys, setClearedKeys] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  // Sync optimistic states when attendances prop changes
  useEffect(() => {
    setOptimisticUpdates({});
    setClearedKeys(new Set());
  }, [attendances]);

  // Multi-student selection state for bulk actions
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [bulkDate, setBulkDate] = useState<string>('');
  const [bulkSessionIndex, setBulkSessionIndex] = useState(0);


  // Active date-cell popover picker
  const [activeCell, setActiveCell] = useState<{
    enrollmentClassId: number;
    dateStr: string;
    studentName: string;
    cellKey: string;
  } | null>(null);
  const [activeAnchorEl, setActiveAnchorEl] = useState<HTMLElement | null>(null);
  const [savingSessionId, setSavingSessionId] = useState<number | 'draft' | null>(null);
  const [createdSessions, setCreatedSessions] = useState<ClassSession[]>([]);
  const [attendanceOverrides, setAttendanceOverrides] = useState<Map<string, Attendance>>(new Map());

  useEffect(() => setCreatedSessions([]), [sessions]);
  useEffect(() => setAttendanceOverrides(new Map()), [attendances]);

  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

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

  const effectiveSessions = useMemo(() => {
    const byId = new Map<number, ClassSession>();
    [...sessions, ...createdSessions].forEach((session) => byId.set(session.id, session));
    return Array.from(byId.values());
  }, [sessions, createdSessions]);

  const sessionsByClassAndDate = useMemo(() => {
    const map = new Map<string, ClassSession[]>();
    effectiveSessions.forEach((session) => {
      const key = `${session.class_id}_${formatSessionDate(session.session_date)}`;
      const list = map.get(key) || [];
      list.push(session);
      map.set(key, list);
    });
    map.forEach((list) => list.sort((a, b) =>
      (a.start_time || '').localeCompare(b.start_time || '') ||
      a.session_number - b.session_number || a.id - b.id
    ));
    return map;
  }, [effectiveSessions]);

  const getSessionsForCell = (enrollmentClassId: number, dateStr: string) => {
    const classId = cls?.id || students.find((item) => item.enrollment_class_id === enrollmentClassId)?.class_id;
    return classId ? sessionsByClassAndDate.get(`${classId}_${dateStr}`) || [] : [];
  };

  // Map existing attendances by enrollment + concrete session (never by date).
  const attendanceMap = useMemo(() => {
    const map = new Map<string, Attendance>();
    attendances.forEach((a) => {
      if ((a as any).deleted_at) return;
      const visibleStatus = selectedSide === 'TEACHER' ? a.teacher_status : a.cs_status;
      if (!visibleStatus) return;
      map.set(`${a.enrollment_class_id}_session_${a.class_session_id}`, { ...a, status: visibleStatus });
    });
    attendanceOverrides.forEach((value, key) => map.set(key, value));
    return map;
  }, [attendances, attendanceOverrides, selectedSide]);



  // Clean up clearedKeys when attendances updates from server
  React.useEffect(() => {
    if (clearedKeys.size === 0) return;
    setClearedKeys((prev) => {
      const next = new Set(prev);
      for (const key of next) {
        if (!attendanceMap.has(key)) {
          next.delete(key);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [attendanceMap]);


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

      const processedDates = new Set<string>();

      // 1. Process optimistic updates first
      Object.entries(optimisticUpdates).forEach(([key, opt]) => {
        const [ecIdStr, dStr] = key.split('_');
        if (parseInt(ecIdStr, 10) !== s.enrollment_class_id) return;
        processedDates.add(dStr);

        const status = opt.status;
        const count = 1;
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

      // 2. Process existing attendances not overridden in optimisticUpdates
      attendances.forEach((a) => {
        if (a.enrollment_class_id !== s.enrollment_class_id || (a as any).deleted_at) return;
        const dStr =
          formatSessionDate(a.class_session?.session_date) ||
          (sessions.find((sess) => sess.id === a.class_session_id)?.session_date
            ? formatSessionDate(sessions.find((sess) => sess.id === a.class_session_id)!.session_date)
            : '');

        if (!dStr || processedDates.has(dStr) || clearedKeys.has(`${s.enrollment_class_id}_${dStr}`)) return;
        processedDates.add(dStr);

        const status = selectedSide === 'TEACHER' ? a.teacher_status : a.cs_status;
        if (!status) return;
        const count = 1;

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
  }, [students, attendances, sessions, optimisticUpdates, currentDate, clearedKeys, selectedSide]);

  // Overall KPI cards computation for Tab 3
  const overallKPIs = useMemo(() => {
    let grandTotalAttended = 0;
    let grandTotalMonthAttended = 0;
    let grandTotalAbsentA = 0;
    let grandTotalAbsentC = 0;
    let grandTotalMonthAbsentA = 0;
    let grandTotalMonthAbsentC = 0;
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
        grandTotalMonthAbsentA += stat.monthAbsentA;
        grandTotalMonthAbsentC += stat.monthAbsentC;
        grandTotalTeacherD += stat.totalTeacherD;
        grandTotalLeaveB += stat.monthLeaveB;
        grandTotalTechE += stat.monthTechE;
      }
      const rem =
        s.total_sessions ? s.total_sessions - (stat?.totalAttended || 0) : 0;
      if (rem < 0) negativeDebtStudents++;
    });

    const monthSessionsRecorded =
      grandTotalMonthAttended + grandTotalMonthAbsentA + grandTotalMonthAbsentC;
    const attendanceRate =
      monthSessionsRecorded > 0
        ? Math.round((grandTotalMonthAttended / monthSessionsRecorded) * 100)
        : 100;

    return {
      grandTotalAttended,
      grandTotalMonthAttended,
      grandTotalAbsentA,
      grandTotalAbsentC,
      grandTotalMonthAbsentA,
      grandTotalMonthAbsentC,
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

  const validVisibleStudentIds = useMemo(
    () => students.filter((student) => student.enrollment_class_id > 0).map((student) => student.enrollment_class_id),
    [students]
  );
  const selectedVisibleCount = validVisibleStudentIds.filter((id) => selectedStudents.has(id)).length;
  const allVisibleSelected = validVisibleStudentIds.length > 0 && selectedVisibleCount === validVisibleStudentIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    setSelectedStudents((current) => {
      const visible = new Set(validVisibleStudentIds);
      const next = new Set(Array.from(current).filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [validVisibleStudentIds]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);



  // Toggle all valid students currently visible after filters
  const handleToggleSelectAllStudents = () => {
    if (allVisibleSelected) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(validVisibleStudentIds));
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

  // Hàm cốt lõi lưu trực tiếp danh sách bản ghi vào cơ sở dữ liệu
  const executeSave = async (
    records: { ecId: number; dateStr: string; status: AttendanceStatus }[]
  ) => {
    if (records.length === 0) return;

    // 1. Cập nhật optimistic UI ngay lập tức
    const nowIso = new Date().toISOString();
    setOptimisticUpdates((prev) => {
      const next = { ...prev };
      records.forEach((r) => {
        next[`${r.ecId}_${r.dateStr}`] = {
          status: r.status,
          updated_at: nowIso,
          source: 'MANUAL',
        };
      });
      return next;
    });

    setClearedKeys((prev) => {
      const next = new Set(prev);
      records.forEach((r) => next.delete(`${r.ecId}_${r.dateStr}`));
      return next;
    });

    // 2. Gửi API lưu vào database
    if (onSaveCustom) {
      const pendingMap: Record<string, AttendanceStatus> = {};
      records.forEach((r) => {
        pendingMap[`${r.ecId}_${r.dateStr}`] = r.status;
      });
      await onSaveCustom(pendingMap, undefined, bulkSessionIndex, selectedSide);
    } else if (cls) {
      const byDate = new Map<string, { ecId: number; status: AttendanceStatus }[]>();
      records.forEach((r) => {
        if (!byDate.has(r.dateStr)) byDate.set(r.dateStr, []);
        byDate.get(r.dateStr)!.push(r);
      });

      for (const [dateStr, items] of byDate.entries()) {
        const daySessions = sessionsByClassAndDate.get(`${cls.id}_${dateStr}`) || [];
        let session = daySessions[bulkSessionIndex];
        if (!session) {
          session = await classSessionsApi.create(cls.id, { session_date: dateStr });
        }
        await attendanceApi.bulkMark(cls.id, session.id, {
          items: items.map((i) => ({
            enrollment_class_id: i.ecId,
            status: i.status,
          })),
          side: selectedSide,
        });
      }
      onRefresh();
    }
  };

  // Bulk Apply Attended for selected students (Lưu trực tiếp vào DB)
  const handleBulkApplyAttended = async () => {
    const targetDate = activeTab === 'quick' ? quickDate : bulkDate;
    if (selectedStudents.size === 0 || !targetDate) return;

    let outOfScheduleCount = 0;
    selectedStudents.forEach((ecId) => {
      const student = students.find((s) => s.enrollment_class_id === ecId);
      if (student && !isDateInSchedule(targetDate, student.schedule_pattern)) {
        outOfScheduleCount++;
      }
    });

    if (outOfScheduleCount > 0) {
      if (!window.confirm(`Có ${outOfScheduleCount} học viên được chọn không có lịch học vào ngày này. Bạn có chắc chắn muốn điểm danh?`)) {
        return;
      }
    }

    const records = Array.from(selectedStudents)
      .filter((ecId) => ecId > 0)
      .map((ecId) => ({
        ecId,
        dateStr: targetDate,
        status: 'ATTENDED' as AttendanceStatus,
      }));

    try {
      setBulkSaving(true);
      await executeSave(records);
      toast.success(
        `Đã lưu Có mặt cho ${records.length} học viên ngày ${new Date(targetDate).toLocaleDateString('vi-VN')}`
      );
    } catch (err: any) {
      toast.error('Lỗi khi lưu điểm danh hàng loạt: ' + (err.response?.data?.error?.message || err.message));
      onRefresh();
    } finally {
      setBulkSaving(false);
    }
  };

  // Bulk Apply Absent for selected students (Lưu trực tiếp vào DB)
  const handleBulkApplyAbsent = async (status: AttendanceStatus) => {
    const targetDate = activeTab === 'quick' ? quickDate : bulkDate;
    if (selectedStudents.size === 0 || !targetDate) return;

    let outOfScheduleCount = 0;
    selectedStudents.forEach((ecId) => {
      const student = students.find(s => s.enrollment_class_id === ecId);
      if (student && !isDateInSchedule(targetDate, student.schedule_pattern)) {
        outOfScheduleCount++;
      }
    });

    if (outOfScheduleCount > 0) {
      if (!window.confirm(`Có ${outOfScheduleCount} học viên được chọn không có lịch học vào ngày này. Bạn có chắc chắn muốn điểm danh?`)) {
        return;
      }
    }

    const records = Array.from(selectedStudents)
      .filter((ecId) => ecId > 0)
      .map((ecId) => ({
        ecId,
        dateStr: targetDate,
        status,
      }));

    try {
      setBulkSaving(true);
      await executeSave(records);
      toast.success(
        `Đã lưu ${STATUS_CONFIG[status].label} cho ${records.length} học viên ngày ${new Date(targetDate).toLocaleDateString('vi-VN')}`
      );
    } catch (err: any) {
      toast.error('Lỗi khi lưu điểm danh hàng loạt: ' + (err.response?.data?.error?.message || err.message));
      onRefresh();
    } finally {
      setBulkSaving(false);
    }
  };

  // Bulk Clear Attendance for selected students (Xóa trực tiếp trong DB)
  const handleBulkClear = async () => {
    const targetDate = activeTab === 'quick' ? quickDate : bulkDate;
    if (selectedStudents.size === 0 || !targetDate) return;

    const toRemove: Array<{ classId: number; sessionId: number; attendanceId: number }> = [];
    selectedStudents.forEach((ecId) => {
      if (ecId <= 0) return;
      const student = students.find((item) => item.enrollment_class_id === ecId);
      const classId = cls?.id || student?.class_id;
      if (!classId) return;
      const session = (sessionsByClassAndDate.get(`${classId}_${targetDate}`) || [])[bulkSessionIndex];
      if (!session) return;
      const existing = attendanceMap.get(`${ecId}_session_${session.id}`);
      if (existing) toRemove.push({ classId, sessionId: session.id, attendanceId: existing.id });
    });

    if (toRemove.length === 0) {
      toast.info('Buổi đã chọn chưa có dữ liệu điểm danh');
      return;
    }
    try {
      setBulkSaving(true);
      await Promise.all(toRemove.map((item) =>
        attendanceApi.remove(item.classId, item.sessionId, item.attendanceId, selectedSide)
      ));
      toast.info(`Đã xóa điểm danh Buổi ${bulkSessionIndex + 1} cho ${toRemove.length} học viên`);
      onRefresh();
    } catch (err: any) {
      toast.error('Lỗi khi reset điểm danh: ' + (err.response?.data?.error?.message || err.message));
      onRefresh();
    } finally {
      setBulkSaving(false);
    }
  };

  const resolveClassId = (enrollmentClassId: number, session?: ClassSession) =>
    session?.class_id || cls?.id || students.find((item) => item.enrollment_class_id === enrollmentClassId)?.class_id;

  const handleStatusSelect = async (
    enrollmentClassId: number,
    dateStr: string,
    session: ClassSession | undefined,
    status: AttendanceStatus
  ) => {
    const student = students.find((item) => item.enrollment_class_id === enrollmentClassId);
    if (student && !isDateInSchedule(dateStr, student.schedule_pattern) &&
      !window.confirm(`${student.full_name} không có lịch học ngày này. Vẫn điểm danh?`)) return;
    const classId = resolveClassId(enrollmentClassId, session);
    if (!classId) return toast.error('Không xác định được lớp học');

    setSavingSessionId(session?.id ?? 'draft');
    try {
      let target = session;
      if (!target) {
        target = await classSessionsApi.create(classId, { session_date: dateStr });
        setCreatedSessions((current) => [...current, target!]);
      }
      const saved = await attendanceApi.mark(classId, target.id, {
        enrollment_class_id: enrollmentClassId,
        status,
        side: selectedSide,
      });
      setAttendanceOverrides((current) => {
        const next = new Map(current);
        const sideStatus = selectedSide === 'TEACHER' ? saved.teacher_status : saved.cs_status;
        next.set(`${enrollmentClassId}_session_${target!.id}`, {
          ...saved,
          status: sideStatus || status,
        });
        return next;
      });
      const localIndex = getSessionsForCell(enrollmentClassId, dateStr).findIndex((item) => item.id === target!.id);
      toast.success(`Đã lưu Buổi ${localIndex >= 0 ? localIndex + 1 : 1}`);
      setActiveCell(null);
      setActiveAnchorEl(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || err.message || 'Không thể lưu điểm danh');
      onRefresh();
    } finally {
      setSavingSessionId(null);
    }
  };

  const handleClearCell = async (enrollmentClassId: number, session: ClassSession) => {
    const key = `${enrollmentClassId}_session_${session.id}`;
    const attendance = attendanceMap.get(key);
    if (!attendance) return;
    setSavingSessionId(session.id);
    try {
      await attendanceApi.remove(session.class_id, session.id, attendance.id, selectedSide);
      setAttendanceOverrides((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
      toast.info('Đã chuyển sang Chưa điểm danh');
      onRefresh();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Không thể xóa điểm danh');
    } finally {
      setSavingSessionId(null);
    }
  };

  const handleAddSession = async (enrollmentClassId: number, dateStr: string) => {
    const classId = resolveClassId(enrollmentClassId);
    if (!classId) return toast.error('Không xác định được lớp học');
    setSavingSessionId('draft');
    try {
      const created = await classSessionsApi.create(classId, { session_date: dateStr });
      setCreatedSessions((current) => [...current, created]);
      toast.success('Đã thêm buổi học cho toàn lớp');
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Không thể thêm buổi');
    } finally {
      setSavingSessionId(null);
    }
  };

  const handleDeleteSession = async (session: ClassSession) => {
    const activeCount = Array.from(attendanceMap.values()).filter((item) => item.class_session_id === session.id).length;
    if (activeCount > 0 && !window.confirm(`Buổi này có ${activeCount} bản ghi điểm danh. Xóa buổi sẽ xóa dữ liệu của toàn lớp. Tiếp tục?`)) return;
    setSavingSessionId(session.id);
    try {
      await classSessionsApi.remove(session.class_id, session.id, activeCount > 0);
      setCreatedSessions((current) => current.filter((item) => item.id !== session.id));
      toast.info('Đã xóa buổi học của toàn lớp');
      onRefresh();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Không thể xóa buổi');
    } finally {
      setSavingSessionId(null);
    }
  };

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

  // Reusable date cell: one compact badge for every real session in the day.
  const renderAttendanceCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    const isActive = activeCell?.enrollmentClassId === st.enrollment_class_id && activeCell.dateStr === dateStr;
    return (
      <button
        id={`attendance-cell-${st.enrollment_class_id}-${dateStr}`}
        type="button"
        onClick={(event) => {
          if (isActive) {
            setActiveCell(null);
            setActiveAnchorEl(null);
          } else {
            setActiveAnchorEl(event.currentTarget);
            setActiveCell({ enrollmentClassId: st.enrollment_class_id, dateStr, studentName: st.full_name, cellKey: `${st.enrollment_class_id}_${dateStr}` });
          }
        }}
        aria-expanded={isActive}
        aria-label={`Điểm danh ${st.full_name} ngày ${new Date(`${dateStr}T00:00:00`).toLocaleDateString('vi-VN')}, ${daySessions.length || 1} buổi`}
        className={`flex min-h-9 w-full min-w-[52px] flex-wrap items-center justify-center gap-1 rounded-lg border px-1 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${isActive ? 'border-primary bg-primary-soft ring-2 ring-primary/30' : 'border-transparent hover:border-border hover:bg-surface-muted'}`}
      >
        {daySessions.length === 0 ? (
          <span className="text-xs font-semibold text-text-muted">—</span>
        ) : daySessions.map((session, index) => {
          const attendance = attendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          const cfg = attendance ? STATUS_CONFIG[attendance.status] : null;
          return (
            <span
              key={session.id}
              title={`Buổi ${index + 1}${session.start_time ? ` · ${session.start_time}` : ''}: ${cfg?.label || 'Chưa điểm danh'}`}
              className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1 text-[10px] font-extrabold ${cfg ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'border-border bg-surface text-text-muted'}`}
            >
              {cfg ? cfg.short : index + 1}
            </span>
          );
        })}
      </button>
    );
  };

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
      {/* Unified filters, save action and active-tab controls */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border/80 bg-slate-50/60 p-3 sm:px-4">
        {titleHeader}
        <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-surface p-1" aria-label="Chọn phía điểm danh">
          {(['TEACHER', 'CS'] as AttendanceSide[]).map((side) => (
            <button
              id={`attendance-side-${side.toLowerCase()}`}
              key={side}
              type="button"
              disabled={!privilegedSideChoice && side !== defaultSide}
              onClick={() => privilegedSideChoice && setSelectedSide(side)}
              className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${selectedSide === side ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:bg-surface-muted disabled:hidden'}`}
            >
              {side === 'TEACHER' ? 'Phía Giáo viên' : 'Phía CSKH'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {activeTab === 'quick' && (
            <>
              <div className="flex h-10 items-center gap-1 rounded-xl border border-border/60 bg-surface p-1">
                <button
                  type="button"
                  onClick={handleQuickDatePrev}
                  className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
                  title="Ngày hôm trước"
                  aria-label="Chuyển đến ngày hôm trước"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  type="date"
                  value={quickDate}
                  onChange={(e) => e.target.value && setQuickDate(e.target.value)}
                  className="w-[132px] rounded-lg border-0 bg-transparent px-1 py-1 text-xs font-bold text-text-primary outline-none focus:ring-1 focus:ring-primary"
                  aria-label="Ngày điểm danh"
                />
                <button
                  type="button"
                  onClick={handleQuickDateNext}
                  className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
                  title="Ngày hôm sau"
                  aria-label="Chuyển đến ngày hôm sau"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickDateToday}
                className="h-10 whitespace-nowrap px-3 text-xs font-bold"
              >
                Hôm nay
              </Button>
            </>
          )}
        </div>
      </div>

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
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="p-3 px-4 border-b border-border/70 bg-surface flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
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
        </div>
      )}

      {/* Compact bulk attendance action strip */}
      {selectedStudents.size > 0 && activeTab === 'quick' && (
        <div className="flex flex-col gap-3 border-b border-primary/20 bg-primary-soft/70 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 font-extrabold text-white">
              {selectedStudents.size}
            </span>
            <span className="font-bold text-text-primary">học viên đã chọn</span>
            <button
              type="button"
              onClick={() => setSelectedStudents(new Set())}
              className="ml-1 rounded-md border border-border/80 bg-surface px-2 py-1 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"
              title="Bỏ chọn tất cả học viên"
            >
              Bỏ chọn
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] sm:pb-0">
            <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-2 font-bold text-text-secondary">
              <span>Buổi</span>
              <select
                id="bulk-session-selector"
                value={bulkSessionIndex}
                onChange={(event) => setBulkSessionIndex(Number(event.target.value))}
                className="bg-transparent text-primary outline-none"
                aria-label="Chọn buổi để điểm danh hàng loạt"
              >
                {Array.from({ length: Math.max(1, ...Array.from(selectedStudents).map((ecId) => getSessionsForCell(ecId, quickDate).length)) + 1 }, (_, index) => (
                  <option key={index} value={index}>{index + 1}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleBulkApplyAttended}
              disabled={bulkSaving}
              aria-label={`Đánh dấu có mặt cho ${selectedStudents.size} học viên`}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Có mặt
            </button>
            {(['ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E'] as AttendanceStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => handleBulkApplyAbsent(status)}
                disabled={bulkSaving}
                aria-label={`${STATUS_CONFIG[status].label} cho ${selectedStudents.size} học viên`}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-bold transition hover:-translate-y-px hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].text} ${STATUS_CONFIG[status].border}`}
                title={STATUS_CONFIG[status].label}
              >
                <span className="text-[10px] font-extrabold">{STATUS_CONFIG[status].short}</span>
                <span>{STATUS_CONFIG[status].label.replace(/\s*\([A-E]\)$/, '')}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={handleBulkClear}
              disabled={bulkSaving}
              aria-label={`Chuyển Chưa điểm danh cho ${selectedStudents.size} học viên`}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 font-bold text-text-secondary transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              title="Chuyển sang Chưa điểm danh"
            >
              <span className="text-[10px] font-extrabold">-</span>
              <span>Chưa điểm danh</span>
            </button>
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
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleToggleSelectAllStudents}
                    disabled={validVisibleStudentIds.length === 0}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                    title="Chọn hoặc bỏ chọn tất cả học viên đang hiển thị"
                    aria-label="Chọn hoặc bỏ chọn tất cả học viên đang hiển thị"
                  />
                </th>
                <th className="px-2 py-3 border-r border-border/60 w-10 min-w-[40px] text-center bg-slate-100/90">
                  #
                </th>
                {isColVisible('external_id') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[90px]">
                  ID
                </th>
                )}
                {isColVisible('full_name') && (
                <th className="px-4 py-3 border-r border-border/60 whitespace-nowrap min-w-[160px]">
                  Họ tên HV
                </th>
                )}
                {isColVisible('package_name') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                  Gói học
                </th>
                )}
                {isColVisible('course_content') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[120px]">
                  Nội dung khoá
                </th>
                )}
                {isColVisible('total_sessions') && (
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[90px]">
                  Tổng số buổi
                </th>
                )}
                {isColVisible('level') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[100px]">
                  Khoá học
                </th>
                )}
                {isColVisible('email') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[160px]">
                  Email
                </th>
                )}
                {isColVisible('model_type') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[90px]">
                  Mô hình
                </th>
                )}
                {isColVisible('status') && (
                <th className="px-3 py-3 border-r-2 border-border/80 whitespace-nowrap min-w-[110px]">
                  Trạng thái
                </th>
                )}

                {/* 1 Cột điểm danh ngày hiện tại (hoặc quickDate) */}
                {(() => {
                  const [y, m, day] = quickDate.split('-').map(Number);
                  const d = new Date(y, m - 1, day);
                  const isToday = toLocalDateString(new Date()) === quickDate;

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
                      {isColVisible('external_id') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-mono font-bold text-text-primary whitespace-nowrap">
                        {st.external_id || `HV_${st.student_id}`}
                      </td>
                      )}

                      {/* Cột B: Họ tên */}
                      {isColVisible('full_name') && (
                      <td className="px-4 py-2.5 border-r border-border/60 font-bold text-text-primary whitespace-nowrap">
                        {st.full_name}
                      </td>
                      )}

                      {/* Cột C: Gói học */}
                      {isColVisible('package_name') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        <span className="font-semibold">{st.package_name || '-'}</span>
                      </td>
                      )}

                      {/* Cột D: Nội dung khoá */}
                      {isColVisible('course_content') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.course_content || '-'}
                      </td>
                      )}

                      {/* Cột E: Tổng số buổi */}
                      {isColVisible('total_sessions') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-center font-bold text-text-primary">
                        {st.total_sessions || 0}
                      </td>
                      )}

                      {/* Cột F: Khoá học / Trình độ */}
                      {isColVisible('level') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        {st.level || '-'}
                      </td>
                      )}

                      {/* Cột G: Email */}
                      {isColVisible('email') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.email || '-'}
                      </td>
                      )}

                      {/* Cột H: Mô hình */}
                      {isColVisible('model_type') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        <Badge variant="neutral" size="sm">
                          {formatClassModel(st.model_type)}
                        </Badge>
                      </td>
                      )}

                      {/* Cột K: Trạng thái */}
                      {isColVisible('status') && (
                      <td className="px-3 py-2.5 border-r-2 border-border/80 whitespace-nowrap">
                        <Badge
                          variant={
                            st.status === 'STUDYING'
                              ? 'success'
                              : st.status === 'PAUSED' || st.status === 'WAITING_CLASS'
                              ? 'warning'
                              : st.status === 'UPCOMING'
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
                            ? 'Kết thúc'
                            : st.status === 'WAITING_CLASS'
                            ? 'Chờ lớp'
                            : st.status === 'UPCOMING'
                            ? 'Sắp học'
                            : st.status === 'NOT_STARTED'
                            ? 'Chưa học'
                            : st.status}
                        </Badge>
                      </td>
                      )}

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
                {/* Sticky 3 Cột định danh nhận diện */}
                <th className="px-2 py-3 border-r border-border/60 sticky left-0 bg-slate-100 z-20 w-10 min-w-[40px] text-center">
                  #
                </th>
                {isColVisible('external_id') && (
                <th className="px-3 py-3 border-r border-border/60 sticky left-10 bg-slate-100 z-20 whitespace-nowrap min-w-[85px]">
                  ID
                </th>
                )}
                {isColVisible('full_name') && (
                <th className="px-4 py-3 border-r-2 border-border/80 sticky left-[125px] bg-slate-100 z-20 whitespace-nowrap min-w-[160px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                  Họ tên HV
                </th>
                )}

                {/* Cột C -> O: Gói học & Lịch học */}
                {isColVisible('package_name') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                  Gói học
                </th>
                )}
                {isColVisible('course_content') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                  Nội dung khoá
                </th>
                )}
                {isColVisible('total_sessions') && (
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[80px]">
                  Tổng số buổi
                </th>
                )}
                {isColVisible('level') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[95px]">
                  Khoá học
                </th>
                )}
                {isColVisible('email') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[150px]">
                  Email
                </th>
                )}
                {isColVisible('model_type') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[85px]">
                  Mô hình
                </th>
                )}
                {isColVisible('remaining_sessions') && (
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[95px] bg-amber-50/60 text-amber-900">
                  Số buổi còn lại
                </th>
                )}
                {isColVisible('start_date') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[90px]">
                  Ngày bắt đầu học
                </th>
                )}
                {isColVisible('status') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[100px]">
                  Trạng thái
                </th>
                )}
                {isColVisible('end_date') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[95px]">
                  Ngày kết thúc/Bảo lưu
                </th>
                )}
                {isColVisible('start_time') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[75px]">
                  Giờ học (1)
                </th>
                )}
                {isColVisible('schedule_pattern') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[75px]">
                  Lịch học (1)
                </th>
                )}
                {isColVisible('duration_minutes') && (
                <th className="px-3 py-3 border-r-2 border-border/80 text-center whitespace-nowrap min-w-[80px]">
                  Thời lượng buổi học (1)
                </th>
                )}

                {/* Cột U -> X: GV, Lớp & Đã học */}
                {isColVisible('teacher_name') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[120px]">
                  Giáo viên
                </th>
                )}
                {isColVisible('teacher_code') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[80px]">
                  Mã GV
                </th>
                )}
                {isColVisible('class_name') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[130px]">
                  Tên lớp
                </th>
                )}
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
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={29 + datesList.length} className="text-center py-10 text-text-muted">
                    Không có học viên nào để điểm danh.
                  </td>
                </tr>
              ) : (
                students.map((st, idx) => {
                  const stat = studentStats.get(st.enrollment_class_id);
                  const prevAttended = st.attended_previous_years || 0;
                  const currentAttended = stat?.totalAttended || 0;
                  const remaining =
                    st.total_sessions
                      ? st.total_sessions - prevAttended - currentAttended
                      : ((st.remaining_sessions ?? 0) - currentAttended);
                  const isNegativeDebt = remaining < 0;

                  return (
                    <tr
                      key={st.enrollment_class_id}
                      className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                        idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                      }`}
                    >
                      {/* STT */}
                      <td className="px-2 py-2.5 border-r border-border/60 text-center text-text-muted font-bold sticky left-0 bg-slate-100 z-10">
                        {idx + 1}
                      </td>

                      {/* Mã HV (A) */}
                      {isColVisible('external_id') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-mono font-bold text-text-primary whitespace-nowrap sticky left-10 bg-slate-100 z-10">
                        {st.external_id || `HV_${st.student_id}`}
                      </td>
                      )}

                      {/* Họ và tên (B) */}
                      {isColVisible('full_name') && (
                      <td className="px-4 py-2.5 border-r-2 border-border/80 font-bold text-text-primary whitespace-nowrap sticky left-[125px] bg-slate-100 z-10 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        {st.full_name}
                      </td>
                      )}

                      {/* Cột C -> O */}
                      {isColVisible('package_name') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        {st.package_name || '-'}
                      </td>
                      )}
                      {isColVisible('course_content') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.course_content || '-'}
                      </td>
                      )}
                      {isColVisible('total_sessions') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-center font-bold text-text-primary">
                        {st.total_sessions || 0}
                      </td>
                      )}
                      {isColVisible('level') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        {st.level || '-'}
                      </td>
                      )}
                      {isColVisible('email') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.email || '-'}
                      </td>
                      )}
                      {isColVisible('model_type') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        <Badge variant="neutral" size="sm">
                          {formatClassModel(st.model_type)}
                        </Badge>
                      </td>
                      )}

                      {/* Buổi còn lại (I) - Cảnh báo nợ âm */}
                      {isColVisible('remaining_sessions') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-center font-extrabold whitespace-nowrap">
                        {isNegativeDebt ? (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-300 text-xs font-black shadow-2xs">
                            {remaining}
                          </span>
                        ) : (
                          <span className="text-text-primary font-bold">{remaining}</span>
                        )}
                      </td>
                      )}

                      {isColVisible('start_date') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.start_date ? new Date(st.start_date).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      )}
                      {isColVisible('status') && (
                      <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap">
                        <Badge
                          variant={
                            st.status === 'STUDYING'
                              ? 'success'
                              : st.status === 'PAUSED' || st.status === 'WAITING_CLASS'
                              ? 'warning'
                              : st.status === 'UPCOMING'
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
                            ? 'Kết thúc'
                            : st.status === 'WAITING_CLASS'
                            ? 'Chờ lớp'
                            : st.status === 'UPCOMING'
                            ? 'Sắp học'
                            : st.status === 'NOT_STARTED'
                            ? 'Chưa học'
                            : st.status}
                        </Badge>
                      </td>
                      )}
                      {isColVisible('end_date') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.end_date ? new Date(st.end_date).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      )}
                      {isColVisible('start_time') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.start_time || '-'}
                      </td>
                      )}
                      {isColVisible('schedule_pattern') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.schedule_pattern || '-'}
                      </td>
                      )}
                      {isColVisible('duration_minutes') && (
                      <td className="px-3 py-2.5 border-r-2 border-border/80 text-center text-text-muted whitespace-nowrap">
                        {st.duration_minutes ? `${st.duration_minutes}p` : '-'}
                      </td>
                      )}

                      {/* Cột U -> X: GV, Lớp & Đã học */}
                      {isColVisible('teacher_name') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-primary font-semibold whitespace-nowrap">
                        {st.teacher_name || '-'}
                      </td>
                      )}
                      {isColVisible('teacher_code') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-mono text-text-muted whitespace-nowrap">
                        {st.teacher_code || '-'}
                      </td>
                      )}
                      {isColVisible('class_name') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-text-primary whitespace-nowrap">
                        {st.class_name}
                      </td>
                      )}
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
                {overallKPIs.grandTotalMonthAbsentA}
              </div>
              <div className="text-[10px] text-amber-700 mt-0.5">
                Tháng {currentDate.getMonth() + 1}/{currentDate.getFullYear()}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50/80 border border-rose-200 shadow-2xs">
              <div className="text-[11px] font-bold text-rose-800 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>Nghỉ sai QĐ (C)</span>
              </div>
              <div className="text-2xl font-black text-rose-950 mt-1">
                {overallKPIs.grandTotalMonthAbsentC}
              </div>
              <div className="text-[10px] text-rose-700 mt-0.5">
                Tháng {currentDate.getMonth() + 1}/{currentDate.getFullYear()}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/80 border border-purple-200 shadow-2xs">
              <div className="text-[11px] font-bold text-purple-800 uppercase flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
                <span>Tỷ lệ chuyên cần</span>
              </div>
              <div className="text-2xl font-black text-purple-950 mt-1">
                {overallKPIs.attendanceRate}%
              </div>
              <div className="text-[10px] text-purple-700 mt-0.5">
                Tháng {currentDate.getMonth() + 1}/{currentDate.getFullYear()}
              </div>
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
                  <th className="px-2 py-3 border-r border-border/60 sticky left-0 bg-slate-100 z-20 w-10 min-w-[40px] text-center">
                    #
                  </th>
                  {isColVisible('external_id') && (
                  <th className="px-3 py-3 border-r border-border/60 sticky left-10 bg-slate-100 z-20 whitespace-nowrap min-w-[85px]">
                    ID
                  </th>
                  )}
                  {isColVisible('full_name') && (
                  <th className="px-4 py-3 border-r-2 border-border/80 sticky left-[125px] bg-slate-100 z-20 whitespace-nowrap min-w-[160px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                    Họ tên HV
                  </th>
                  )}
                  {isColVisible('package_name') && (
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                    Gói học
                  </th>
                  )}
                  {isColVisible('course_content') && (
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                    Nội dung khoá
                  </th>
                  )}
                  {isColVisible('total_sessions') && (
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[90px]">
                    Tổng số buổi
                  </th>
                  )}
                  {isColVisible('level') && (
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[95px]">
                    Khoá học
                  </th>
                  )}
                  {isColVisible('email') && (
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[150px]">
                    Email
                  </th>
                  )}
                  {isColVisible('model_type') && (
                  <th className="px-3 py-3 border-r-2 border-border/80 whitespace-nowrap min-w-[85px]">
                    Mô hình
                  </th>
                  )}

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
                        <td className="px-2 py-2.5 border-r border-border/60 text-center text-text-muted font-bold sticky left-0 bg-slate-100 z-10">
                          {idx + 1}
                        </td>
                        {isColVisible('external_id') && (
                        <td className="px-3 py-2.5 border-r border-border/60 font-mono font-bold text-text-primary whitespace-nowrap sticky left-10 bg-slate-100 z-10">
                          {st.external_id || `HV_${st.student_id}`}
                        </td>
                        )}
                        {isColVisible('full_name') && (
                        <td className="px-4 py-2.5 border-r-2 border-border/80 font-bold text-text-primary whitespace-nowrap sticky left-[125px] bg-slate-100 z-10 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                          {st.full_name}
                        </td>
                        )}
                        {isColVisible('package_name') && (
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                          {st.package_name || '-'}
                        </td>
                        )}
                        {isColVisible('course_content') && (
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                          {st.course_content || '-'}
                        </td>
                        )}
                        {isColVisible('total_sessions') && (
                        <td className="px-3 py-2.5 border-r border-border/60 text-center font-bold text-text-primary">
                          {st.total_sessions || 0}
                        </td>
                        )}
                        {isColVisible('level') && (
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                          {st.level || '-'}
                        </td>
                        )}
                        {isColVisible('email') && (
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                          {st.email || '-'}
                        </td>
                        )}
                        {isColVisible('model_type') && (
                        <td className="px-3 py-2.5 border-r-2 border-border/80 text-text-secondary whitespace-nowrap">
                          <Badge variant="neutral" size="sm">
                            {formatClassModel(st.model_type)}
                          </Badge>
                        </td>
                        )}

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
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-extrabold border border-blue-300 bg-blue-100 text-blue-700">
              *
            </span>
            <span>Xanh nhạt: Điểm danh thủ công hôm nay</span>
          </div>
        </div>
      </div>

      {/* Floating Attendance Picker Popover */}
      {activeCell && activeAnchorEl && (() => {
        const daySessions = getSessionsForCell(activeCell.enrollmentClassId, activeCell.dateStr);
        const attendanceBySession = new Map<number, Attendance>();
        daySessions.forEach((session) => {
          const attendance = attendanceMap.get(`${activeCell.enrollmentClassId}_session_${session.id}`);
          if (attendance) attendanceBySession.set(session.id, attendance);
        });
        return (
          <AttendancePickerPopover
            anchorEl={activeAnchorEl}
            studentName={activeCell.studentName}
            dateStr={activeCell.dateStr}
            sessions={daySessions}
            attendanceBySession={attendanceBySession}
            savingSessionId={savingSessionId}
            onSelectStatus={(session, status) => handleStatusSelect(activeCell.enrollmentClassId, activeCell.dateStr, session, status)}
            onClear={(session) => handleClearCell(activeCell.enrollmentClassId, session)}
            onAddSession={() => handleAddSession(activeCell.enrollmentClassId, activeCell.dateStr)}
            onDeleteSession={handleDeleteSession}
            onClose={() => {
              setActiveCell(null);
              setActiveAnchorEl(null);
            }}
          />
        );
      })()}
    </div>
  );
};
