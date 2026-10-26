import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Class,
  ClassSession,
  Attendance,
  AttendanceStatus,
  AttendanceSide,
  formatClassCode,
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

export { formatClassCode };

export interface StudentRow {
  enrollment_class_id: number;
  class_id?: number;
  class_code?: string | null;
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
  program_type?: 'JLPT' | 'KAIWA' | string; // Khóa học (JLPT / KAIWA)
  cs_staff_code?: string | null;    // Mã CVHT phụ trách
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

interface AttendancePickerPopoverProps {
  anchorEl: HTMLElement;
  studentName: string;
  dateStr: string;
  targetSession: ClassSession | undefined;
  targetSessionNumber: number;
  attendance: Attendance | undefined;
  rawAttendance?: Attendance | undefined;
  saving: boolean;
  canEditTeacherNote?: boolean;
  canDeleteSession?: boolean;
  onSelectStatus: (
    session: ClassSession | undefined,
    status: AttendanceStatus,
    extra?: { lesson_topic?: string | null; teacher_note?: string | null }
  ) => void;
  onSaveNote: (
    session: ClassSession | undefined,
    lessonTopic: string | null,
    teacherNote: string | null
  ) => void;
  onClear: (session: ClassSession) => void;
  onDeleteSession?: (session: ClassSession) => void;
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
  const popoverWidth = popoverEl?.offsetWidth || 280;
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

const POPOVER_STATUS_OPTIONS: Array<{ status: AttendanceStatus; label: string }> = [
  { status: 'ATTENDED', label: '1 · Có mặt' },
  { status: 'ABSENT_APPROVED_A', label: 'A · Nghỉ có phép (A)' },
  { status: 'LEAVE_B', label: 'B · Bảo lưu (B)' },
  { status: 'ABSENT_UNAPPROVED_C', label: 'C · Nghỉ sai QĐ (C)' },
  { status: 'TEACHER_ABSENT_D', label: 'D · Giáo viên nghỉ (D)' },
  { status: 'TECH_ERROR_E', label: 'E · Lỗi kỹ thuật (E)' },
];

const AttendancePickerPopover: React.FC<AttendancePickerPopoverProps> = ({
  anchorEl,
  studentName,
  dateStr,
  targetSession,
  targetSessionNumber,
  attendance,
  rawAttendance,
  saving,
  canEditTeacherNote = false,
  canDeleteSession = false,
  onSelectStatus,
  onSaveNote,
  onClear,
  onDeleteSession,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const sourceAtt = rawAttendance || attendance;
  const [lessonTopic, setLessonTopic] = useState<string>(() => sourceAtt?.lesson_topic || '');
  const [teacherNote, setTeacherNote] = useState<string>(() => sourceAtt?.teacher_note || '');
  const [position, setPosition] = useState(() => computePopoverCoords(anchorEl.getBoundingClientRect(), null));
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ lesson: string; note: string }>({
    lesson: (sourceAtt?.lesson_topic || '').trim(),
    note: (sourceAtt?.teacher_note || '').trim(),
  });

  useEffect(() => {
    const initLesson = sourceAtt?.lesson_topic || '';
    const initNote = sourceAtt?.teacher_note || '';
    setLessonTopic(initLesson);
    setTeacherNote(initNote);
    lastSavedRef.current = { lesson: initLesson.trim(), note: initNote.trim() };
  }, [sourceAtt?.id, targetSession?.id]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const triggerNoteSaveNow = (nextLesson: string, nextNote: string) => {
    if (!canEditTeacherNote) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const normLesson = nextLesson.trim();
    const normNote = nextNote.trim();
    if (
      lastSavedRef.current.lesson === normLesson &&
      lastSavedRef.current.note === normNote
    ) {
      return;
    }
    lastSavedRef.current = { lesson: normLesson, note: normNote };
    onSaveNote(targetSession, normLesson || null, normNote || null);
  };

  const scheduleNoteAutoSave = (nextLesson: string, nextNote: string) => {
    if (!canEditTeacherNote) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      triggerNoteSaveNow(nextLesson, nextNote);
    }, 600);
  };

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
  }, [anchorEl, onClose, targetSessionNumber, Boolean(attendance)]);

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
  const currentStatus = attendance?.status;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`Điểm danh cho ${studentName} ngày ${formattedDate} Buổi ${targetSessionNumber}`}
      className="fixed z-[100] w-[min(285px,calc(100vw-24px))] rounded-xl border border-border bg-surface p-2.5 text-left shadow-soft-xl animate-in fade-in-0 zoom-in-95 duration-100 select-none"
      style={{ top: position.top, left: position.left }}
    >
      <span aria-hidden="true" className={`absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-border bg-surface ${position.placement === 'top' ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-l border-t'}`} style={{ left: position.arrowLeft }} />
      <div className="mb-1.5 flex items-start justify-between gap-2 border-b border-border/60 pb-1.5">
        <div className="min-w-0">
          <div className="truncate text-xs font-extrabold text-text-primary" title={studentName}>{studentName}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-primary">
            <span>{formattedDate}</span>
            <span>·</span>
            <span className="font-extrabold">Buổi {targetSessionNumber}</span>
            {targetSession?.start_time && <span className="text-[10px] text-text-muted">({targetSession.start_time})</span>}
          </div>
        </div>
      </div>

      {/* Khu vực nhập Bài học & Ghi chú GV theo buổi — đặt phía trên để GV gõ trước rồi bấm trạng thái 1 lần */}
      {canEditTeacherNote && (
        <div className="mb-2 border-b border-border/70 pb-2 space-y-1.5">
          <div>
            <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wide mb-0.5">
              Bài học (Lesson)
            </label>
            <input
              type="text"
              value={lessonTopic}
              onChange={(e) => {
                const val = e.target.value;
                setLessonTopic(val);
                scheduleNoteAutoSave(val, teacherNote);
              }}
              onBlur={() => triggerNoteSaveNow(lessonTopic, teacherNote)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  triggerNoteSaveNow(lessonTopic, teacherNote);
                }
              }}
              placeholder="VD: Bài 4, Kaiwa 2..."
              className="w-full h-7 px-2 rounded-lg border border-border text-xs bg-white text-text-primary focus:outline-none focus:ring-1 focus:ring-primary select-text"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wide mb-0.5">
              Ghi chú GV theo buổi
            </label>
            <textarea
              rows={2}
              value={teacherNote}
              onChange={(e) => {
                const val = e.target.value;
                setTeacherNote(val);
                scheduleNoteAutoSave(lessonTopic, val);
              }}
              onBlur={() => triggerNoteSaveNow(lessonTopic, teacherNote)}
              placeholder="Nhận xét buổi học, BTVN..."
              className="w-full px-2 py-1 rounded-lg border border-border text-xs bg-white text-text-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none select-text"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1" role="listbox" aria-label={`Danh sách trạng thái Buổi ${targetSessionNumber}`}>
        {POPOVER_STATUS_OPTIONS.map(({ status, label }) => {
          const option = STATUS_CONFIG[status];
          const active = currentStatus === status;
          return (
            <button
              id={`attendance-${targetSession?.id ?? 'draft'}-${status}`}
              key={status}
              type="button"
              role="option"
              aria-selected={active}
              disabled={saving}
              onClick={() =>
                onSelectStatus(
                  targetSession,
                  status,
                  canEditTeacherNote
                    ? {
                        lesson_topic: lessonTopic.trim() || null,
                        teacher_note: teacherNote.trim() || null,
                      }
                    : undefined
                )
              }
              className={`flex h-7 w-full items-center justify-between rounded-lg border px-2.5 text-left text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'ring-2 ring-primary ring-offset-1' : ''} ${option.bg} ${option.text} ${option.border}`}
            >
              <span>{label}</span>
              {active && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          );
        })}

        {targetSession && attendance && (
          <button
            id={`clear-attendance-${targetSession.id}`}
            type="button"
            disabled={saving}
            onClick={() => onClear(targetSession)}
            className="mt-0.5 flex h-7 w-full items-center justify-center rounded-lg border border-border bg-surface-muted/60 px-2.5 text-[11px] font-bold text-text-muted transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Chưa điểm danh (Xóa trạng thái)
          </button>
        )}

        {canDeleteSession && targetSession && onDeleteSession && (
          <button
            id={`delete-session-${targetSession.id}`}
            type="button"
            disabled={saving}
            onClick={() => onDeleteSession(targetSession)}
            className="mt-1 flex h-6 w-full items-center justify-center rounded-lg border border-rose-200/80 bg-rose-50/50 px-2 text-[10px] font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`Xóa buổi ${targetSessionNumber}`}
          >
            Xóa buổi học #{targetSessionNumber} (toàn lớp)
          </button>
        )}
      </div>
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
  const isAdmin = Boolean(user?.roles.includes('ADMIN'));
  const isAdminOrManage = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'MANAGE'));
  const isCSOnly = Boolean(user?.roles.includes('CS') && !isAdminOrManage);
  const isTeacherOnly = Boolean(user?.roles.includes('TEACHER') && !isAdminOrManage && !user?.roles.includes('CS'));
  const selectedSide: AttendanceSide = isAdminOrManage ? 'ADMIN' : isCSOnly ? 'CS' : 'TEACHER';

  const [internalActiveTab] = useState<AttendanceTab>('quick');
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const activeSide: AttendanceSide = selectedSide;

  // Tab 1 (Quick Attendance) specific date state (Default: Today)
  const [quickDate, setQuickDate] = useState<string>(() => toLocalDateString(new Date()));

  // Filter mode for Tab 2 (Detailed): 'month' (default), 'week'
  const [filterMode, setFilterMode] = useState<'month' | 'week'>('month');

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
    session: ClassSession | undefined;
    sessionNumber: number;
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

  // Map toàn bộ bản ghi Attendance (cả GV & CSKH) chưa xóa theo enrollment + session
  const rawAttendanceMap = useMemo(() => {
    const map = new Map<string, Attendance>();
    attendances.forEach((a) => {
      if ((a as any).deleted_at) return;
      map.set(`${a.enrollment_class_id}_session_${a.class_session_id}`, a);
    });
    attendanceOverrides.forEach((value, key) => {
      if ((value as any).deleted_at) {
        map.delete(key);
      } else {
        map.set(key, value);
      }
    });
    return map;
  }, [attendances, attendanceOverrides]);

  // Map existing attendances by enrollment + concrete session (never by date) filtered by activeSide.
  const attendanceMap = useMemo(() => {
    const map = new Map<string, Attendance>();
    rawAttendanceMap.forEach((a, key) => {
      const visibleStatus =
        activeSide === 'ADMIN'
          ? a.status
          : activeSide === 'TEACHER'
          ? a.teacher_status
          : a.cs_status;
      if (!visibleStatus) return;
      map.set(key, { ...a, status: visibleStatus });
    });
    return map;
  }, [rawAttendanceMap, activeSide]);



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

      // E.3: dates covered by optimistic (pending) edits. A pending optimistic
      // entry for a date intentionally supersedes server rows of that date
      // until the refresh lands. This set must NOT collapse two same-day
      // server rows against each other: they are distinct sessions and each
      // counts separately.
      const optimisticDates = new Set<string>();

      // 1. Process optimistic updates first
      Object.entries(optimisticUpdates).forEach(([key, opt]) => {
        const [ecIdStr, dStr] = key.split('_');
        if (parseInt(ecIdStr, 10) !== s.enrollment_class_id) return;
        optimisticDates.add(dStr);

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

      // 2. Process existing attendances not overridden by optimisticUpdates.
      // E.3: each server row counts on its own — two FINAL rows sharing one
      // session date are two distinct sessions and must both count (the old
      // per-date collapse dropped the second row). Only optimistic/cleared
      // entries for that date suppress server rows.
      attendances.forEach((a) => {
        if (a.enrollment_class_id !== s.enrollment_class_id || (a as any).deleted_at) return;
        const dStr =
          formatSessionDate(a.class_session?.session_date) ||
          (sessions.find((sess) => sess.id === a.class_session_id)?.session_date
            ? formatSessionDate(sessions.find((sess) => sess.id === a.class_session_id)!.session_date)
            : '');

        if (!dStr || optimisticDates.has(dStr) || clearedKeys.has(`${s.enrollment_class_id}_${dStr}`)) return;

        const status =
          selectedSide === 'ADMIN'
            ? a.status
            : selectedSide === 'TEACHER'
            ? a.teacher_status
            : a.cs_status;
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
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (filterMode === 'week') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setMonth(d.getMonth() + 1);
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
      await onSaveCustom(pendingMap, undefined, bulkSessionIndex, activeSide);
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
          side: activeSide,
        });
      }
      onRefresh();
    }
  };

  // Bulk Apply Attended for selected students (Lưu trực tiếp vào DB)
  const handleBulkApplyAttended = async () => {
    const targetDate = activeTab === 'quick' ? quickDate : bulkDate;
    if (selectedStudents.size === 0 || !targetDate) return;

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
      const key = `${ecId}_session_${session.id}`;
      const existing = attendanceMap.get(key);
      if (existing) toRemove.push({ classId, sessionId: session.id, attendanceId: existing.id });
    });

    if (toRemove.length === 0) {
      toast.info('Buổi đã chọn chưa có dữ liệu điểm danh');
      return;
    }
    try {
      setBulkSaving(true);
      await Promise.all(toRemove.map((item) =>
        attendanceApi.remove(item.classId, item.sessionId, item.attendanceId, activeSide)
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
    status: AttendanceStatus,
    fallbackSessionNumber?: number,
    extra?: { lesson_topic?: string | null; teacher_note?: string | null }
  ) => {
    const classId = resolveClassId(enrollmentClassId, session);
    if (!classId) return toast.error('Không xác định được lớp học');

    // Tự động đóng popup ngay khi chọn trạng thái
    setActiveCell(null);
    setActiveAnchorEl(null);
    setSavingSessionId(session?.id ?? 'draft');
    try {
      let target = session;
      const existingCount = getSessionsForCell(enrollmentClassId, dateStr).length;
      if (!target) {
        target = await classSessionsApi.create(classId, { session_date: dateStr });
        setCreatedSessions((current) => [...current, target!]);
      }
      const saved = await attendanceApi.mark(classId, target.id, {
        enrollment_class_id: enrollmentClassId,
        status,
        side: activeSide,
        ...(extra?.lesson_topic !== undefined ? { lesson_topic: extra.lesson_topic } : {}),
        ...(extra?.teacher_note !== undefined ? { teacher_note: extra.teacher_note } : {}),
      });
      setAttendanceOverrides((current) => {
        const next = new Map(current);
        const sideStatus =
          activeSide === 'ADMIN'
            ? saved.status
            : activeSide === 'TEACHER'
            ? saved.teacher_status
            : saved.cs_status;
        next.set(`${enrollmentClassId}_session_${target!.id}`, {
          ...saved,
          status: sideStatus || saved.status || status,
        });
        return next;
      });
      const localIndex = getSessionsForCell(enrollmentClassId, dateStr).findIndex((item) => item.id === target!.id);
      const displaySessionNo = localIndex >= 0 ? localIndex + 1 : (fallbackSessionNumber || existingCount + 1);
      toast.success(`Đã lưu Buổi ${displaySessionNo}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || err.message || 'Không thể lưu điểm danh');
      onRefresh();
    } finally {
      setSavingSessionId(null);
    }
  };

  const handleSaveNote = async (
    enrollmentClassId: number,
    dateStr: string,
    session: ClassSession | undefined,
    lessonTopic: string | null,
    teacherNote: string | null
  ) => {
    const classId = resolveClassId(enrollmentClassId, session);
    if (!classId) return toast.error('Không xác định được lớp học');

    setSavingSessionId(session?.id ?? 'draft');
    try {
      let target = session;
      if (!target) {
        target = await classSessionsApi.create(classId, { session_date: dateStr });
        setCreatedSessions((current) => [...current, target!]);
        setActiveCell((prev) =>
          prev && prev.enrollmentClassId === enrollmentClassId && prev.dateStr === dateStr && !prev.session
            ? { ...prev, session: target }
            : prev
        );
      }
      const key = `${enrollmentClassId}_session_${target.id}`;
      const existingRaw = rawAttendanceMap.get(key);
      let saved: Attendance;
      if (existingRaw) {
        saved = await attendanceApi.update(classId, target.id, existingRaw.id, {
          side: activeSide,
          lesson_topic: lessonTopic,
          teacher_note: teacherNote,
        });
      } else {
        saved = await attendanceApi.mark(classId, target.id, {
          enrollment_class_id: enrollmentClassId,
          status: 'ATTENDED',
          side: activeSide,
          lesson_topic: lessonTopic,
          teacher_note: teacherNote,
        });
      }
      setAttendanceOverrides((current) => {
        const next = new Map(current);
        const sideStatus =
          activeSide === 'ADMIN'
            ? saved.status
            : activeSide === 'TEACHER'
            ? saved.teacher_status
            : saved.cs_status;
        next.set(key, {
          ...saved,
          status: sideStatus || saved.status || existingRaw?.status || 'ATTENDED',
        });
        return next;
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || err.message || 'Không thể lưu ghi chú');
      onRefresh();
    } finally {
      setSavingSessionId(null);
    }
  };

  const handleClearCell = async (enrollmentClassId: number, session: ClassSession) => {
    const key = `${enrollmentClassId}_session_${session.id}`;
    const rawAtt = rawAttendanceMap.get(key);
    const attendance = attendanceMap.get(key);
    if (!attendance) return;
    setActiveCell(null);
    setActiveAnchorEl(null);
    setSavingSessionId(session.id);
    try {
      await attendanceApi.remove(session.class_id, session.id, attendance.id, activeSide);
      setAttendanceOverrides((current) => {
        const next = new Map(current);
        const existing = rawAtt || attendance;
        if (activeSide === 'ADMIN') {
          next.set(key, {
            ...existing,
            teacher_status: null,
            cs_status: null,
            deleted_at: new Date().toISOString(),
          } as any);
        } else {
          const nextTeacherStatus = activeSide === 'TEACHER' ? null : (existing.teacher_status ?? null);
          const nextCsStatus = activeSide === 'CS' ? null : (existing.cs_status ?? null);
          if (!nextTeacherStatus && !nextCsStatus) {
            next.set(key, {
              ...existing,
              teacher_status: null,
              cs_status: null,
              deleted_at: new Date().toISOString(),
            } as any);
          } else {
            next.set(key, {
              ...existing,
              teacher_status: nextTeacherStatus,
              cs_status: nextCsStatus,
              reconciliation_state: nextTeacherStatus ? 'PENDING_CS' : 'PENDING_TEACHER',
            });
          }
        }
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

  const handleDeleteSession = async (session: ClassSession) => {
    const activeCount = Array.from(attendanceMap.values()).filter((item) => item.class_session_id === session.id).length;
    const confirmMsg =
      activeCount > 0
        ? `Buổi này có ${activeCount} bản ghi điểm danh. Xóa buổi học sẽ xóa dữ liệu của toàn lớp. Tiếp tục?`
        : 'Bạn có chắc chắn muốn xóa buổi học này của toàn lớp?';
    if (!window.confirm(confirmMsg)) return;
    setActiveCell(null);
    setActiveAnchorEl(null);
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
    return `Tháng ${month} / ${year}`;
  }, [currentDate, filterMode, datesList]);

  // Reusable date cell: one compact badge for every real session in the day, plus '+' button for next session.
  const renderAttendanceCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    const formattedDateLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString('vi-VN');

    const openPickerForSession = (
      anchor: HTMLElement,
      session: ClassSession | undefined,
      sessionNumber: number
    ) => {
      const cellKey = `${st.enrollment_class_id}_${dateStr}_s${sessionNumber}`;
      if (activeCell?.cellKey === cellKey) {
        setActiveCell(null);
        setActiveAnchorEl(null);
      } else {
        setActiveAnchorEl(anchor);
        setActiveCell({
          enrollmentClassId: st.enrollment_class_id,
          dateStr,
          studentName: st.full_name,
          cellKey,
          session,
          sessionNumber,
        });
      }
    };

    if (daySessions.length === 0) {
      const cellKey = `${st.enrollment_class_id}_${dateStr}_s1`;
      const isActive = activeCell?.cellKey === cellKey;
      return (
        <div className="flex min-h-9 w-full min-w-[52px] items-center justify-center px-1 py-1">
          <button
            id={`attendance-cell-${st.enrollment_class_id}-${dateStr}`}
            type="button"
            onClick={(event) => openPickerForSession(event.currentTarget, undefined, 1)}
            aria-expanded={isActive}
            aria-label={`Điểm danh ${st.full_name} ngày ${formattedDateLabel}, Buổi 1`}
            title="Điểm danh Buổi 1"
            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              isActive
                ? 'border-primary bg-primary-soft text-primary ring-2 ring-primary/30'
                : 'border-border/60 bg-surface text-text-muted hover:border-primary/50 hover:bg-surface-muted hover:text-text-primary'
            }`}
          >
            —
          </button>
        </div>
      );
    }

    const nextSessionNumber = daySessions.length + 1;
    const plusCellKey = `${st.enrollment_class_id}_${dateStr}_s${nextSessionNumber}`;
    const isPlusActive = activeCell?.cellKey === plusCellKey;

    return (
      <div
        id={`attendance-cell-${st.enrollment_class_id}-${dateStr}`}
        className="flex min-h-9 w-full min-w-[60px] flex-wrap items-center justify-center gap-1 px-1 py-1"
      >
        {daySessions.map((session, index) => {
          const sessionNumber = index + 1;
          const cellKey = `${st.enrollment_class_id}_${dateStr}_s${sessionNumber}`;
          const isBadgeActive = activeCell?.cellKey === cellKey;
          const attendance = attendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          const rawAtt = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          const hasNoteOrLesson = Boolean(rawAtt?.lesson_topic || rawAtt?.teacher_note);
          const cfg = attendance ? STATUS_CONFIG[attendance.status] : null;
          const noteTooltip = [
            rawAtt?.lesson_topic ? `Bài học: ${rawAtt.lesson_topic}` : '',
            rawAtt?.teacher_note ? `Ghi chú GV: ${rawAtt.teacher_note}` : '',
          ]
            .filter(Boolean)
            .join(' | ');
          return (
            <button
              id={`attendance-badge-${st.enrollment_class_id}-${dateStr}-${sessionNumber}`}
              key={session.id}
              type="button"
              onClick={(event) => openPickerForSession(event.currentTarget, session, sessionNumber)}
              aria-expanded={isBadgeActive}
              aria-label={`Điểm danh ${st.full_name} ngày ${formattedDateLabel}, Buổi ${sessionNumber}`}
              title={`Buổi ${sessionNumber}${session.start_time ? ` · ${session.start_time}` : ''}: ${cfg?.label || 'Chưa điểm danh'}${noteTooltip ? ` — ${noteTooltip}` : ''}`}
              className={`relative inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[10px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                cfg
                  ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                  : 'border-border bg-surface text-text-muted hover:border-primary/50 hover:bg-surface-muted'
              } ${isBadgeActive ? 'ring-2 ring-primary ring-offset-1' : ''}`}
            >
              {cfg ? cfg.short : sessionNumber}
              {hasNoteOrLesson && (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-indigo-600"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}

        <button
          id={`attendance-add-session-${st.enrollment_class_id}-${dateStr}`}
          type="button"
          onClick={(event) => openPickerForSession(event.currentTarget, undefined, nextSessionNumber)}
          aria-expanded={isPlusActive}
          aria-label={`Thêm Buổi ${nextSessionNumber} cho ${st.full_name} ngày ${formattedDateLabel}`}
          title={`Thêm buổi tiếp theo (Buổi ${nextSessionNumber})`}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-dashed text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            isPlusActive
              ? 'border-primary bg-primary-soft text-primary ring-2 ring-primary/30'
              : 'border-primary/50 text-primary hover:bg-primary-soft'
          }`}
        >
          +
        </button>
      </div>
    );
  };

  // Ô chỉ đọc: Điểm danh phía Giáo viên (dùng trong Tab Điểm danh nhanh)
  const renderTeacherReadonlyCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    if (daySessions.length === 0) {
      return (
        <div className="flex min-h-9 w-full min-w-[52px] items-center justify-center px-1 py-1">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/50 bg-slate-50 px-2 text-xs font-semibold text-text-muted">
            —
          </span>
        </div>
      );
    }

    return (
      <div className="flex min-h-9 w-full min-w-[60px] flex-wrap items-center justify-center gap-1 px-1 py-1">
        {daySessions.map((session, index) => {
          const sessionNumber = index + 1;
          const att = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          const tStatus = att?.teacher_status as AttendanceStatus | null | undefined;
          const cfg = tStatus ? STATUS_CONFIG[tStatus] : null;
          const hasNoteOrLesson = Boolean(att?.lesson_topic || att?.teacher_note);
          const noteTooltip = [
            att?.lesson_topic ? `Bài học: ${att.lesson_topic}` : '',
            att?.teacher_note ? `Ghi chú GV: ${att.teacher_note}` : '',
          ]
            .filter(Boolean)
            .join(' | ');
          return (
            <span
              key={session.id}
              title={
                (cfg
                  ? `Buổi ${sessionNumber} (GV): ${cfg.label}`
                  : `Buổi ${sessionNumber}: Giáo viên chưa điểm danh`) +
                (noteTooltip ? ` — ${noteTooltip}` : '')
              }
              className={`relative inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[10px] font-extrabold ${
                cfg
                  ? `${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`
                  : 'border-border/60 bg-slate-100/80 text-text-muted'
              }`}
            >
              {cfg ? cfg.short : '—'}
              {hasNoteOrLesson && (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-indigo-600"
                  aria-hidden="true"
                />
              )}
            </span>
          );
        })}
      </div>
    );
  };

  // Ô chỉ đọc: Điểm danh phía CSKH (dùng trong Tab Điểm danh nhanh khi user là Admin/Manage hoặc GV)
  const renderCSReadonlyCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    if (daySessions.length === 0) {
      return (
        <div className="flex min-h-9 w-full min-w-[52px] items-center justify-center px-1 py-1">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/50 bg-slate-50 px-2 text-xs font-semibold text-text-muted">
            —
          </span>
        </div>
      );
    }

    return (
      <div className="flex min-h-9 w-full min-w-[60px] flex-wrap items-center justify-center gap-1 px-1 py-1">
        {daySessions.map((session, index) => {
          const sessionNumber = index + 1;
          const att = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          const csStatus = att?.cs_status as AttendanceStatus | null | undefined;
          const cfg = csStatus ? STATUS_CONFIG[csStatus] : null;
          return (
            <span
              key={session.id}
              title={
                cfg
                  ? `Buổi ${sessionNumber} (CSKH): ${cfg.label}`
                  : `Buổi ${sessionNumber}: CSKH chưa điểm danh`
              }
              className={`relative inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[10px] font-extrabold ${
                cfg
                  ? `${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`
                  : 'border-border/60 bg-slate-100/80 text-text-muted'
              }`}
            >
              {cfg ? cfg.short : '—'}
            </span>
          );
        })}
      </div>
    );
  };

  // Ô chỉ đọc: Điểm danh chốt / Trạng thái cuối (dùng trong Tab Điểm danh nhanh)
  const renderFinalStatusCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    if (daySessions.length === 0) {
      return (
        <div className="flex min-h-9 w-full min-w-[52px] items-center justify-center px-1 py-1">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/50 bg-slate-50 px-2 text-xs font-semibold text-text-muted">
            —
          </span>
        </div>
      );
    }

    return (
      <div className="flex min-h-9 w-full min-w-[60px] flex-wrap items-center justify-center gap-1 px-1 py-1">
        {daySessions.map((session, index) => {
          const sessionNumber = index + 1;
          const att = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          if (!att || (!att.teacher_status && !att.cs_status)) {
            return (
              <span
                key={session.id}
                title={`Buổi ${sessionNumber}: Chưa có dữ liệu điểm danh`}
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/60 bg-slate-100/80 px-1.5 text-[10px] font-semibold text-text-muted"
              >
                —
              </span>
            );
          }

          if (att.reconciliation_state === 'RESOLVED') {
            const finalSt = (att.status || att.cs_status || att.teacher_status) as AttendanceStatus | undefined;
            const cfg = finalSt ? STATUS_CONFIG[finalSt] : null;
            return (
              <span
                key={session.id}
                title={`Buổi ${sessionNumber} (Đã phân xử): ${cfg?.label || finalSt || ''}`}
                className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[10px] font-extrabold ${
                  cfg
                    ? `${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`
                    : 'border-border bg-surface text-text-primary'
                }`}
              >
                {cfg ? cfg.short : '—'}
              </span>
            );
          }

          const isMatched =
            att.reconciliation_state === 'MATCHED' ||
            Boolean(att.teacher_status && att.cs_status && att.teacher_status === att.cs_status);

          if (isMatched) {
            const finalSt = (att.status || att.cs_status || att.teacher_status) as AttendanceStatus | undefined;
            const cfg = finalSt ? STATUS_CONFIG[finalSt] : null;
            return (
              <span
                key={session.id}
                title={`Buổi ${sessionNumber} (Đã khớp): ${cfg?.label || finalSt || ''}`}
                className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[10px] font-extrabold ${
                  cfg
                    ? `${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`
                    : 'border-border bg-surface text-text-primary'
                }`}
              >
                {cfg ? cfg.short : '—'}
              </span>
            );
          }

          const isConflict =
            att.reconciliation_state === 'CONFLICT' ||
            Boolean(att.teacher_status && att.cs_status && att.teacher_status !== att.cs_status);

          if (isConflict) {
            const tShort = att.teacher_status ? STATUS_CONFIG[att.teacher_status as AttendanceStatus]?.short || '?' : '?';
            const csShort = att.cs_status ? STATUS_CONFIG[att.cs_status as AttendanceStatus]?.short || '?' : '?';
            return (
              <span
                key={session.id}
                title={`Buổi ${sessionNumber}: Lệch điểm danh (GV: ${tShort} | CSKH: ${csShort})`}
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-rose-300 bg-rose-100 px-1.5 text-[10px] font-extrabold text-rose-800"
              >
                Lệch
              </span>
            );
          }

          // Chỉ mới 1 bên điểm danh (PENDING_CS hoặc PENDING_TEACHER)
          return (
            <span
              key={session.id}
              title={`Buổi ${sessionNumber}: ${att.teacher_status ? 'Chờ CSKH điểm danh' : 'Chờ Giáo viên điểm danh'}`}
              className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-bold text-amber-700"
            >
              Chờ
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
      {/* Unified filters, save action and active-tab controls */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border/80 bg-slate-50/60 p-3 sm:px-4">
        {titleHeader}
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

                {/* 3 Cột điểm danh ngày hiện tại (hoặc quickDate): GV -> CSKH -> Chốt */}
                {(() => {
                  const [y, m, day] = quickDate.split('-').map(Number);
                  const d = new Date(y, m - 1, day);
                  const dateFormatted = `${d.getDate() < 10 ? `0${d.getDate()}` : d.getDate()}/${
                    d.getMonth() + 1 < 10 ? `0${d.getMonth() + 1}` : d.getMonth() + 1
                  }/${d.getFullYear()}`;
                  const dayOfWeek = DAY_OF_WEEK_NAMES[d.getDay()];

                  return (
                    <>
                      <th className="px-3 py-2 border-r border-border/60 text-center min-w-[130px] bg-slate-100/90 text-text-secondary">
                        <div className="text-[12px] font-extrabold text-text-primary">
                          Điểm danh GV
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold text-text-muted flex items-center justify-center gap-1 whitespace-nowrap">
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          <span>{dayOfWeek} {dateFormatted}</span>
                        </div>
                      </th>
                      <th className="px-3 py-2 border-r border-border/60 text-center min-w-[145px] bg-blue-50/90 text-primary border-primary/40">
                        <div className="text-[12px] font-extrabold text-primary">
                          Điểm danh CSKH
                        </div>
                        <div className="mt-0.5 text-[10px] font-bold text-primary/80 flex items-center justify-center gap-1 whitespace-nowrap">
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          <span>{dayOfWeek} {dateFormatted}</span>
                        </div>
                      </th>
                      <th className="px-3 py-2 border-r border-border/60 text-center min-w-[135px] bg-emerald-50/70 text-emerald-900">
                        <div className="text-[12px] font-extrabold text-emerald-900">
                          Điểm danh
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold text-emerald-700 flex items-center justify-center gap-1 whitespace-nowrap">
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          <span>{dayOfWeek} {dateFormatted}</span>
                        </div>
                      </th>
                    </>
                  );
                })()}
              </tr>
            </thead>

            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-10 text-text-muted">
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

                      {/* Cột 1: Điểm danh GV */}
                      <td className="px-2 py-1.5 border-r border-border/60 text-center bg-slate-50/40">
                        {isTeacherOnly
                          ? renderAttendanceCell(st, quickDate)
                          : renderTeacherReadonlyCell(st, quickDate)}
                      </td>

                      {/* Cột 2: Điểm danh CSKH */}
                      <td className="px-2 py-1.5 border-r border-border/60 text-center bg-blue-50/20">
                        {isCSOnly
                          ? renderAttendanceCell(st, quickDate)
                          : renderCSReadonlyCell(st, quickDate)}
                      </td>

                      {/* Cột 3: Điểm danh Chốt / Trạng thái cuối */}
                      <td className="px-2 py-1.5 border-r border-border/60 text-center bg-emerald-50/20">
                        {isAdminOrManage
                          ? renderAttendanceCell(st, quickDate)
                          : renderFinalStatusCell(st, quickDate)}
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
        </div>
      </div>

      {/* Floating Attendance Picker Popover */}
      {activeCell && activeAnchorEl && (() => {
        const daySessions = getSessionsForCell(activeCell.enrollmentClassId, activeCell.dateStr);
        const resolvedSession = activeCell.session
          ? daySessions.find((item) => item.id === activeCell.session?.id) || activeCell.session
          : undefined;
        const attendance = resolvedSession
          ? attendanceMap.get(`${activeCell.enrollmentClassId}_session_${resolvedSession.id}`)
          : undefined;
        const rawAttendance = resolvedSession
          ? rawAttendanceMap.get(`${activeCell.enrollmentClassId}_session_${resolvedSession.id}`)
          : undefined;
        const isSaving = savingSessionId !== null && savingSessionId === (resolvedSession?.id ?? 'draft');
        return (
          <AttendancePickerPopover
            anchorEl={activeAnchorEl}
            studentName={activeCell.studentName}
            dateStr={activeCell.dateStr}
            targetSession={resolvedSession}
            targetSessionNumber={activeCell.sessionNumber}
            attendance={attendance}
            rawAttendance={rawAttendance}
            saving={isSaving}
            canEditTeacherNote={isTeacherOnly}
            canDeleteSession={isAdmin}
            onSelectStatus={(session, status, extra) =>
              handleStatusSelect(
                activeCell.enrollmentClassId,
                activeCell.dateStr,
                session,
                status,
                activeCell.sessionNumber,
                extra
              )
            }
            onSaveNote={(session, lessonTopic, teacherNote) =>
              handleSaveNote(
                activeCell.enrollmentClassId,
                activeCell.dateStr,
                session,
                lessonTopic,
                teacherNote
              )
            }
            onClear={(session) => handleClearCell(activeCell.enrollmentClassId, session)}
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
