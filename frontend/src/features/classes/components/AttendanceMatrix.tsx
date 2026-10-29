import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Class,
  ClassSession,
  Attendance,
  AttendanceStatus,
  AttendanceSide,
  formatClassCode,
  normalizeClassModel,
  CLASS_MODEL_BADGE_STYLES,
  ENROLLMENT_STATUS_BADGE_MAP,
  formatScheduleTimeDisplay,
} from '../types/classes.types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { attendanceApi, classSessionsApi } from '../api/sessions.api';
import { useAuth } from '../../../contexts/AuthContext';
import { AttendanceSessionDrawer } from './AttendanceSessionDrawer';
import {
  MonthlyEmptyDateCell,
  MonthlySessionBadge,
  AttendanceMatrixLegendBar,
  classifySessionAttendance,
  MatrixCellFilter,
  AttendanceLegendCounts,
} from './AttendanceCellBadge';
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
  Plus,
  Trash2,
  UserRoundCheck,
  Edit,
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
  onAssignTeacherForClass?: (classId: number) => void;
  onEditClassById?: (classId: number) => void;
  selectedDate?: string;
  onSelectedDateChange?: (date: string) => void;
  onlyScheduledOnDate?: boolean;
  onOnlyScheduledOnDateChange?: (val: boolean) => void;
  currentPeriodDate?: Date;
  onCurrentPeriodDateChange?: (date: Date) => void;
  detailedFilterMode?: 'week' | 'month';
  onDetailedFilterModeChange?: (mode: 'week' | 'month') => void;
  detailedViewMode?: 'matrix' | 'log';
  onDetailedViewModeChange?: (mode: 'matrix' | 'log') => void;
  onlyDaysWithSessions?: boolean;
  onOnlyDaysWithSessionsChange?: (val: boolean) => void;
  selectedEnrollmentIds?: Set<number>;
  onSelectedEnrollmentIdsChange?: (next: Set<number>) => void;
}

export type AttendanceTab = 'quick' | 'detailed' | 'stats';

const formatClassModel = (model?: string | null): '1:1' | '1:2' | '1:n' =>
  normalizeClassModel(model);

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; short: string; bg: string; text: string; border: string }
> = {
  ATTENDED: {
    label: 'Có mặt',
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

// Sắp xếp các buổi học trong cùng một ngày: chỉ so giờ start_time khi CẢ HAI ca đều có giờ.
// Ca tạo qua nút "+" không có start_time (null) — nếu để '' so localeCompare với '19:30'
// thì '' đứng TRƯỚC, đẩy Ca mới lên vị trí số 1 và làm "biến mất" Ca 1 khỏi ô nhập/đầu bảng.
// Khi thiếu giờ học thì giữ theo thứ tự tạo thực tế (session_number, rồi id).
export const compareSessionsInDay = (a: ClassSession, b: ClassSession): number => {
  if (a.start_time && b.start_time) {
    const byTime = a.start_time.localeCompare(b.start_time);
    if (byTime !== 0) return byTime;
  }
  return a.session_number - b.session_number || a.id - b.id;
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
  onAssignTeacherForClass,
  onEditClassById,
  selectedDate: controlledSelectedDate,
  onSelectedDateChange,
  onlyScheduledOnDate: controlledOnlyScheduledOnDate,
  onOnlyScheduledOnDateChange: _onOnlyScheduledOnDateChange,
  currentPeriodDate: controlledCurrentPeriodDate,
  onCurrentPeriodDateChange,
  detailedFilterMode: controlledDetailedFilterMode,
  onDetailedFilterModeChange,
  detailedViewMode: controlledDetailedViewMode,
  onDetailedViewModeChange,
  onlyDaysWithSessions: controlledOnlyDaysWithSessions,
  onOnlyDaysWithSessionsChange: _onOnlyDaysWithSessionsChange,
  selectedEnrollmentIds: controlledSelectedEnrollmentIds,
  onSelectedEnrollmentIdsChange,
}) => {
  const isColVisible = (key: string): boolean => {
    if (!visibleColumns) return true;
    return visibleColumns[key] !== false;
  };

  const toast = useToast();
  const { user } = useAuth();
  const isAdminOrManage = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'MANAGE'));
  const showClassManageActions = Boolean(isAdminOrManage && (onAssignTeacherForClass || onEditClassById));
  const isCSOnly = Boolean(user?.roles.includes('CS') && !isAdminOrManage);
  const isTeacherOnly = Boolean(user?.roles.includes('TEACHER') && !isAdminOrManage && !user?.roles.includes('CS'));
  const selectedSide: AttendanceSide = isAdminOrManage ? 'ADMIN' : isCSOnly ? 'CS' : 'TEACHER';

  const [internalActiveTab] = useState<AttendanceTab>('quick');
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const activeSide: AttendanceSide = selectedSide;

  // Tab 1 (Quick Attendance) specific date state (Default: Today)
  const [internalQuickDate, setInternalQuickDate] = useState<string>(() => toLocalDateString(new Date()));
  const quickDate = controlledSelectedDate ?? internalQuickDate;
  const setQuickDate = (next: string | ((prev: string) => string)) => {
    const val = typeof next === 'function' ? next(quickDate) : next;
    setInternalQuickDate(val);
    onSelectedDateChange?.(val);
  };

  // Tab 1: lọc chỉ học viên có lịch học hoặc đã có ca học trong ngày đang chọn
  const [internalOnlyScheduled] = useState<boolean>(false);
  const onlyStudentsWithDaySchedule = controlledOnlyScheduledOnDate ?? internalOnlyScheduled;

  // Tab 1: ô đang mở thanh chọn 6 trạng thái inline (`${enrollment_class_id}_${dateStr}_s${caNo}`)
  const [activeInlinePickerKey, setActiveInlinePickerKey] = useState<string | null>(null);
  // Tab 1: nháp Ghi chú CSKH theo từng học viên & từng ca (`${enrollment_class_id}_${dateStr}_s${caNo}`)
  const [csNoteDrafts, setCsNoteDrafts] = useState<Record<string, string>>({});
  const csNoteDraftsRef = useRef<Record<string, string>>({});
  const csNoteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSavedCsNoteMapRef = useRef<Record<string, string>>({});

  // Tab 1: nháp Bài học & Ghi chú GV theo từng học viên & từng ca khi đăng nhập vai trò Giáo viên
  const [teacherLessonDrafts, setTeacherLessonDrafts] = useState<Record<string, string>>({});
  const [teacherNoteDrafts, setTeacherNoteDrafts] = useState<Record<string, string>>({});
  const teacherLessonDraftsRef = useRef<Record<string, string>>({});
  const teacherNoteDraftsRef = useRef<Record<string, string>>({});
  const teacherNoteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSavedTeacherNoteMapRef = useRef<Record<string, { lesson: string; note: string }>>({});
  // Khóa chống tạo trùng ClassSession khi người dùng vừa bấm chấm vừa gõ bài học/ghi chú trên ca mới
  const sessionCreateLocksRef = useRef<Record<string, Promise<ClassSession>>>({});

  // Filter mode for Tab 2 (Detailed): 'month' (default), 'week'
  const [internalFilterMode, setInternalFilterMode] = useState<'month' | 'week'>('month');
  const filterMode = controlledDetailedFilterMode ?? internalFilterMode;
  const setFilterMode = (next: 'month' | 'week') => {
    setInternalFilterMode(next);
    onDetailedFilterModeChange?.(next);
  };

  // Tab 2: chế độ xem Bảng tháng ('matrix') hoặc Nhật ký buổi học ('log')
  const [internalDetailedViewMode, setInternalDetailedViewMode] = useState<'matrix' | 'log'>('matrix');
  const detailedViewMode = controlledDetailedViewMode ?? internalDetailedViewMode;
  const setDetailedViewMode = (next: 'matrix' | 'log') => {
    setInternalDetailedViewMode(next);
    onDetailedViewModeChange?.(next);
  };

  // Tab 2: chỉ hiện những ngày có buổi học phát sinh trong kỳ
  const [internalOnlyDaysWithSessions] = useState<boolean>(false);
  const onlyDaysWithSessions = controlledOnlyDaysWithSessions ?? internalOnlyDaysWithSessions;

  // Ngăn chi tiết buổi học bên phải (AttendanceSessionDrawer) cho Tab 2
  const [drawerState, setDrawerState] = useState<{
    student: StudentRow;
    dateStr: string;
    caNumber: number;
    defaultEditing?: boolean;
  } | null>(null);

  // Modal xác nhận xóa ca học khi ca đã có dữ liệu điểm danh
  const [deleteCaTarget, setDeleteCaTarget] = useState<{
    classId: number;
    className: string;
    dateStr: string;
    caNumber: number;
    session: ClassSession;
    attendanceCount: number;
  } | null>(null);
  const [deletingCa, setDeletingCa] = useState(false);

  // Selected date reference for Tab 2 & 3 (default: today)
  const [internalCurrentDate, setInternalCurrentDate] = useState<Date>(() => new Date());
  const currentDate = controlledCurrentPeriodDate ?? internalCurrentDate;
  const setCurrentDate = (next: Date | ((prev: Date) => Date)) => {
    const val = typeof next === 'function' ? next(currentDate) : next;
    setInternalCurrentDate(val);
    onCurrentPeriodDateChange?.(val);
  };

  // Phân trang mặc định 25 dòng/trang (tùy chọn 25, 50, 100, 200)
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Track optimistic updates: Key is `${enrollment_class_id}_${dateString}_${sessionIndex}`
  const [optimisticUpdates, setOptimisticUpdates] = useState<
    Record<
      string,
      {
        status: AttendanceStatus;
        updated_at: string;
        source: 'MANUAL';
        sessionIndex: number;
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
  const [internalSelectedStudents, setInternalSelectedStudents] = useState<Set<number>>(new Set());
  const selectedStudents = controlledSelectedEnrollmentIds ?? internalSelectedStudents;
  const setSelectedStudents = (next: Set<number> | ((prev: Set<number>) => Set<number>)) => {
    const val = typeof next === 'function' ? next(selectedStudents) : next;
    setInternalSelectedStudents(val);
    onSelectedEnrollmentIdsChange?.(val);
  };
  const [bulkDate, setBulkDate] = useState<string>(() => toLocalDateString(new Date()));
  const [bulkSessionIndex, setBulkSessionIndex] = useState(0);
  const [bulkLessonTopic, setBulkLessonTopic] = useState('');
  const [bulkTeacherNote, setBulkTeacherNote] = useState('');
  const [bulkCsNote, setBulkCsNote] = useState('');

  const [savingSessionId, setSavingSessionId] = useState<number | 'draft' | null>(null);
  const [savingActionKey, setSavingActionKey] = useState<string | null>(null);
  const [createdSessions, setCreatedSessions] = useState<ClassSession[]>([]);
  const [deletedSessionIds, setDeletedSessionIds] = useState<Set<number>>(new Set());
  const [attendanceOverrides, setAttendanceOverrides] = useState<Map<string, Attendance>>(new Map());

  useEffect(() => {
    if (sessions.length === 0) return;
    const serverIds = new Set(sessions.map((s) => s.id));
    setCreatedSessions((prev) => {
      const remaining = prev.filter((s) => !serverIds.has(s.id));
      return remaining.length === prev.length ? prev : remaining;
    });
  }, [sessions]);
  useEffect(() => {
    if (attendances.length === 0) return;
    setAttendanceOverrides((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      attendances.forEach((srv) => {
        const k = `${srv.enrollment_class_id}_session_${srv.class_session_id}`;
        const ov = next.get(k);
        if (!ov) return;
        const srvTime = srv.updated_at ? new Date(srv.updated_at).getTime() : 0;
        const ovTime = ov.updated_at ? new Date(ov.updated_at).getTime() : 0;
        if (srvTime >= ovTime) {
          next.delete(k);
        }
      });
      return next.size === prev.size ? prev : next;
    });
  }, [attendances]);

  // Đóng thanh chọn 6 trạng thái inline khi đổi ngày, đổi tab hoặc bấm phím Escape
  useEffect(() => {
    setActiveInlinePickerKey(null);
  }, [quickDate, activeTab]);

  // Tự động quay về trang 1 khi đổi tab, chế độ xem, ngày hoặc danh sách học viên
  useEffect(() => {
    setPage(1);
  }, [activeTab, detailedViewMode, onlyStudentsWithDaySchedule, quickDate, students.length]);

  useEffect(() => {
    if (!activeInlinePickerKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveInlinePickerKey(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeInlinePickerKey]);

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
    [...sessions, ...createdSessions].forEach((session) => {
      if (!deletedSessionIds.has(session.id)) {
        byId.set(session.id, session);
      }
    });
    return Array.from(byId.values());
  }, [sessions, createdSessions, deletedSessionIds]);

  const sessionsByClassAndDate = useMemo(() => {
    const map = new Map<string, ClassSession[]>();
    effectiveSessions.forEach((session) => {
      const key = `${session.class_id}_${formatSessionDate(session.session_date)}`;
      const list = map.get(key) || [];
      list.push(session);
      map.set(key, list);
    });
    map.forEach((list) => list.sort(compareSessionsInDay));
    return map;
  }, [effectiveSessions]);

  const sessionsByClassAndDateRef = useRef<Map<string, ClassSession[]>>(new Map());
  sessionsByClassAndDateRef.current = sessionsByClassAndDate;

  const rawAttendanceMapRef = useRef<Map<string, Attendance>>(new Map());

  const getSessionsForCell = (enrollmentClassId: number, dateStr: string) => {
    const classId = cls?.id || students.find((item) => item.enrollment_class_id === enrollmentClassId)?.class_id;
    return classId ? sessionsByClassAndDate.get(`${classId}_${dateStr}`) || [] : [];
  };

  // Kiểm tra học viên có lịch học hoặc đã có ca phát sinh trong ngày đang chọn (giống bên GV)
  const isStudentRelevantOnDate = (st: StudentRow, dateStr: string): boolean => {
    if (st.enrollment_class_id > 0 && getSessionsForCell(st.enrollment_class_id, dateStr).length > 0) {
      return true;
    }
    const raw = (st.schedule_pattern || '').trim();
    if (!raw || raw.toUpperCase().includes('LKCD')) return false;
    const normalized = raw.toUpperCase().replace(/[^0-9CN]/g, '');
    const [y, m, d] = dateStr.split('-').map(Number);
    const jsDay = new Date(y, m - 1, d).getDay();
    const code = jsDay === 0 ? 'CN' : String(jsDay + 1);
    return code === 'CN' ? normalized.includes('CN') : normalized.includes(code);
  };

  const quickVisibleStudents = useMemo(
    () =>
      onlyStudentsWithDaySchedule
        ? students.filter((st) => isStudentRelevantOnDate(st, quickDate))
        : students,
    [students, onlyStudentsWithDaySchedule, quickDate, sessionsByClassAndDate]
  );

  // Tab 2: Lọc chỉ những ngày có buổi học phát sinh của danh sách học viên đang hiển thị
  const visibleDatesList = useMemo(() => {
    if (!onlyDaysWithSessions) return datesList;
    const filtered = datesList.filter((d) => {
      const dStr = toDateString(d);
      return students.some(
        (st) => st.enrollment_class_id > 0 && getSessionsForCell(st.enrollment_class_id, dStr).length > 0
      );
    });
    return filtered.length > 0 ? filtered : datesList;
  }, [datesList, onlyDaysWithSessions, students, sessionsByClassAndDate]);

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
        const existing = map.get(key);
        map.set(key, existing ? { ...existing, ...value } : value);
      }
    });
    return map;
  }, [attendances, attendanceOverrides]);
  rawAttendanceMapRef.current = rawAttendanceMap;

  // Kiểm tra một bản ghi điểm danh đã thực sự có kết quả CHỐT hay chưa.
  // Lưu ý: Trong DB cột `Attendance.status` không nullable nên khi GV hoặc CSKH chấm trước,
  // backend vẫn gán tạm `status = parsedStatus` dù `reconciliation_state` đang là
  // `PENDING_CS` / `PENDING_TEACHER` / `CONFLICT`. Vì vậy tuyệt đối không đọc thẳng `att.status`
  // khi chưa kiểm tra trạng thái đối chiếu.
  const isAttendanceFinalized = (att: Attendance | undefined): boolean => {
    if (!att) return false;
    if (att.reconciliation_state === 'RESOLVED' || att.reconciliation_state === 'MATCHED') {
      return true;
    }
    if (
      att.reconciliation_state === 'PENDING_CS' ||
      att.reconciliation_state === 'PENDING_TEACHER' ||
      att.reconciliation_state === 'CONFLICT'
    ) {
      return false;
    }
    return Boolean(att.teacher_status && att.cs_status && att.teacher_status === att.cs_status);
  };

  const getFinalizedStatus = (att: Attendance | undefined): AttendanceStatus | undefined => {
    if (!att || !isAttendanceFinalized(att)) return undefined;
    if (att.reconciliation_state === 'RESOLVED') {
      return att.status as AttendanceStatus | undefined;
    }
    return (att.status || att.cs_status || att.teacher_status) as AttendanceStatus | undefined;
  };

  // Map existing attendances by enrollment + concrete session (for Tab 2 Bảng tháng & Drawer & Tab 3)
  // Tuyệt đối KHÔNG fallback sang `a.status` khi `reconciliation_state` chưa chốt (PENDING_CS / PENDING_TEACHER / CONFLICT),
  // vì các bản ghi AUTO_SCHEDULE hoặc chỉ mới nhập ghi chú có `teacher_status = null` và `cs_status = null`.
  const attendanceMap = useMemo(() => {
    const map = new Map<string, Attendance>();
    rawAttendanceMap.forEach((a, key) => {
      const finalized = getFinalizedStatus(a);
      const visibleStatus = (
        activeSide === 'TEACHER'
          ? a.teacher_status || finalized
          : activeSide === 'CS'
          ? a.cs_status || a.teacher_status || finalized
          : finalized || a.teacher_status || a.cs_status
      ) as AttendanceStatus | undefined;
      if (!visibleStatus) return;
      map.set(key, { ...a, status: visibleStatus });
    });
    return map;
  }, [rawAttendanceMap, activeSide]);

  // Tab 2: Danh sách Nhật ký buổi học trong kỳ (xếp mới nhất lên đầu)
  const periodSessionLogs = useMemo(() => {
    const periodDateSet = new Set(datesList.map((d) => toDateString(d)));
    const rows: Array<{
      key: string;
      student: StudentRow;
      session: ClassSession;
      dateStr: string;
      caNumber: number;
      att: Attendance | undefined;
    }> = [];

    students.forEach((st) => {
      if (st.enrollment_class_id <= 0) return;
      datesList.forEach((d) => {
        const dStr = toDateString(d);
        if (!periodDateSet.has(dStr)) return;
        const daySessions = getSessionsForCell(st.enrollment_class_id, dStr);
        daySessions.forEach((sess, idx) => {
          const att = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${sess.id}`);
          rows.push({
            key: `${st.enrollment_class_id}_session_${sess.id}`,
            student: st,
            session: sess,
            dateStr: dStr,
            caNumber: idx + 1,
            att,
          });
        });
      });
    });

    return rows.sort(
      (a, b) =>
        b.dateStr.localeCompare(a.dateStr) ||
        b.caNumber - a.caNumber ||
        a.student.full_name.localeCompare(b.student.full_name)
    );
  }, [students, datesList, sessionsByClassAndDate, rawAttendanceMap]);



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

      // Khóa theo từng buổi cụ thể (sessionId) đang có bản cập nhật optimistic,
      // tuyệt đối KHÔNG chặn cả ngày (tránh làm mất thống kê của Ca 1 khi chấm Ca 2+).
      const suppressedSessionIds = new Set<number>();

      // 1. Process optimistic updates first (scoped by dateStr + sessionIndex)
      Object.entries(optimisticUpdates).forEach(([key, opt]) => {
        const parts = key.split('_');
        const ecIdStr = parts[0];
        const dStr = parts[1];
        if (parseInt(ecIdStr, 10) !== s.enrollment_class_id) return;

        const daySessions = getSessionsForCell(s.enrollment_class_id, dStr);
        const targetSess = daySessions[opt.sessionIndex ?? 0];
        if (targetSess) {
          suppressedSessionIds.add(targetSess.id);
        }

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

      // 2. Duyệt qua rawAttendanceMap (đã gộp attendanceOverrides khi chấm qua popover)
      // và tra ngày từ effectiveSessions (đã gộp createdSessions khi thêm Ca 2+),
      // đảm bảo mọi ca trong cùng ngày đều được tính độc lập và cập nhật tức thì.
      rawAttendanceMap.forEach((a) => {
        if (a.enrollment_class_id !== s.enrollment_class_id || (a as any).deleted_at) return;
        if (suppressedSessionIds.has(a.class_session_id)) return;

        const matchedSess =
          a.class_session || effectiveSessions.find((sess) => sess.id === a.class_session_id);
        const dStr = matchedSess?.session_date ? formatSessionDate(matchedSess.session_date) : '';

        if (!dStr || clearedKeys.has(`${s.enrollment_class_id}_session_${a.class_session_id}`)) return;

        const finalized = getFinalizedStatus(a);
        const status = (
          selectedSide === 'TEACHER'
            ? a.teacher_status || finalized
            : selectedSide === 'CS'
            ? a.cs_status || finalized
            : finalized
        ) as AttendanceStatus | undefined;
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
  }, [
    students,
    rawAttendanceMap,
    effectiveSessions,
    sessionsByClassAndDate,
    optimisticUpdates,
    currentDate,
    clearedKeys,
    selectedSide,
  ]);

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
      const prevAtt = s.attended_previous_years || 0;
      const curAtt = stat?.totalAttended || 0;
      grandTotalAttended += prevAtt + curAtt;
      if (stat) {
        grandTotalMonthAttended += stat.monthAttended;
        grandTotalAbsentA += stat.totalAbsentA;
        grandTotalAbsentC += stat.totalAbsentC;
        grandTotalMonthAbsentA += stat.monthAbsentA;
        grandTotalMonthAbsentC += stat.monthAbsentC;
        grandTotalTeacherD += stat.totalTeacherD;
        grandTotalLeaveB += stat.monthLeaveB;
        grandTotalTechE += stat.monthTechE;
      }
      const rem = s.total_sessions
        ? s.total_sessions - prevAtt - curAtt
        : (s.remaining_sessions ?? 0) - curAtt;
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

  const validVisibleStudentIds = useMemo(() => {
    const source = activeTab === 'quick' ? quickVisibleStudents : students;
    return source.filter((student) => student.enrollment_class_id > 0).map((student) => student.enrollment_class_id);
  }, [activeTab, quickVisibleStudents, students]);
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

  const bulkTargetDate = activeTab === 'quick' ? quickDate : bulkDate || quickDate;

  const selectedUniqueClassIds = useMemo(() => {
    const classSet = new Set<number>();
    selectedStudents.forEach((ecId) => {
      const st = students.find((item) => item.enrollment_class_id === ecId);
      const classId = cls?.id || st?.class_id;
      if (classId && classId > 0) classSet.add(classId);
    });
    return Array.from(classSet);
  }, [selectedStudents, students, cls]);

  const bulkMatchableCount = useMemo(() => {
    if (activeSide === 'TEACHER' || selectedStudents.size === 0 || !bulkTargetDate) return 0;
    let count = 0;
    selectedStudents.forEach((ecId) => {
      if (ecId <= 0) return;
      const daySessions = getSessionsForCell(ecId, bulkTargetDate);
      const sess = daySessions[bulkSessionIndex];
      if (!sess) return;
      const att = rawAttendanceMap.get(`${ecId}_session_${sess.id}`);
      if (!att?.teacher_status) return;
      if (activeSide === 'CS') {
        if (!att.cs_status) count++;
      } else {
        count++;
      }
    });
    return count;
  }, [activeSide, selectedStudents, bulkTargetDate, bulkSessionIndex, rawAttendanceMap, sessionsByClassAndDate]);

  // Hàm cốt lõi lưu trực tiếp danh sách bản ghi vào cơ sở dữ liệu
  const executeSave = async (
    records: { ecId: number; dateStr: string; status: AttendanceStatus }[]
  ) => {
    if (records.length === 0) return;

    // 1. Cập nhật optimistic UI ngay lập tức (khóa theo Ca đang chấm, không chặn cả ngày)
    const nowIso = new Date().toISOString();
    const optSessionIndex = bulkSessionIndex;
    setOptimisticUpdates((prev) => {
      const next = { ...prev };
      records.forEach((r) => {
        next[`${r.ecId}_${r.dateStr}_${optSessionIndex}`] = {
          status: r.status,
          updated_at: nowIso,
          source: 'MANUAL',
          sessionIndex: optSessionIndex,
        };
      });
      return next;
    });

    setClearedKeys((prev) => {
      const next = new Set(prev);
      records.forEach((r) => {
        for (const k of Array.from(next)) {
          if (k.startsWith(`${r.ecId}_${r.dateStr}`)) next.delete(k);
        }
        next.delete(`${r.ecId}_${r.dateStr}_${optSessionIndex}`);
      });
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
    const targetDate = bulkTargetDate;
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
        `Đã lưu Có mặt (Ca ${bulkSessionIndex + 1}) cho ${records.length} học viên ngày ${new Date(`${targetDate}T00:00:00`).toLocaleDateString('vi-VN')}`
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
    const targetDate = bulkTargetDate;
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
        `Đã lưu ${STATUS_CONFIG[status].label} (Ca ${bulkSessionIndex + 1}) cho ${records.length} học viên ngày ${new Date(`${targetDate}T00:00:00`).toLocaleDateString('vi-VN')}`
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
    const targetDate = bulkTargetDate;
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
      toast.info(`Ca ${bulkSessionIndex + 1} chưa có dữ liệu điểm danh của bạn trên các dòng đã chọn`);
      return;
    }
    try {
      setBulkSaving(true);
      await Promise.all(toRemove.map((item) =>
        attendanceApi.remove(item.classId, item.sessionId, item.attendanceId, activeSide)
      ));
      toast.info(`Đã xóa chấm Ca ${bulkSessionIndex + 1} cho ${toRemove.length} học viên`);
      onRefresh();
    } catch (err: any) {
      toast.error('Lỗi khi xóa điểm danh: ' + (err.response?.data?.error?.message || err.message));
      onRefresh();
    } finally {
      setBulkSaving(false);
    }
  };

  // Khớp theo GV cho đúng các dòng đang chọn ở Ca & Ngày đang chọn (CSKH & Admin)
  const handleBulkMatchSelectedRows = async () => {
    if (bulkMatchableCount === 0 || !bulkTargetDate) {
      toast.info('Các dòng đã chọn chưa có điểm danh GV để khớp ở ca này');
      return;
    }
    const groups = new Map<
      string,
      { classId: number; sessionId: number; items: { enrollment_class_id: number; status: AttendanceStatus }[] }
    >();
    selectedStudents.forEach((ecId) => {
      if (ecId <= 0) return;
      const daySessions = getSessionsForCell(ecId, bulkTargetDate);
      const sess = daySessions[bulkSessionIndex];
      if (!sess) return;
      const att = rawAttendanceMap.get(`${ecId}_session_${sess.id}`);
      const tStatus = att?.teacher_status as AttendanceStatus | null | undefined;
      if (!tStatus) return;
      if (activeSide === 'CS' && att?.cs_status) return;
      const gKey = `${sess.class_id}_${sess.id}`;
      const group = groups.get(gKey) || { classId: sess.class_id, sessionId: sess.id, items: [] };
      group.items.push({ enrollment_class_id: ecId, status: tStatus });
      groups.set(gKey, group);
    });

    try {
      setBulkSaving(true);
      await Promise.all(
        Array.from(groups.values()).map((g) =>
          attendanceApi.bulkMark(g.classId, g.sessionId, { items: g.items, side: activeSide })
        )
      );
      toast.success(
        `Đã khớp theo GV (Ca ${bulkSessionIndex + 1}) cho ${bulkMatchableCount} học viên đã chọn`
      );
      onRefresh();
    } catch (err: any) {
      toast.error('Lỗi khi khớp theo GV: ' + (err.response?.data?.error?.message || err.message));
      onRefresh();
    } finally {
      setBulkSaving(false);
    }
  };

  // Áp dụng Bài học / Ghi chú GV hàng loạt cho các học viên đã chọn (Role TEACHER)
  const handleBulkApplyTeacherLessonAndNote = async () => {
    const lessonVal = bulkLessonTopic.trim();
    const noteVal = bulkTeacherNote.trim();
    if (!lessonVal && !noteVal) {
      toast.warning('Vui lòng nhập Bài học chung hoặc Ghi chú GV chung trước khi áp dụng.');
      return;
    }
    if (selectedStudents.size === 0 || !bulkTargetDate) return;

    const byClassId = new Map<number, number[]>();
    selectedStudents.forEach((ecId) => {
      if (ecId <= 0) return;
      const st = students.find((item) => item.enrollment_class_id === ecId);
      const classId = cls?.id || st?.class_id;
      if (!classId || classId <= 0) return;
      const list = byClassId.get(classId) || [];
      list.push(ecId);
      byClassId.set(classId, list);
    });

    try {
      setBulkSaving(true);
      for (const [classId, ecIds] of byClassId.entries()) {
        const daySessions = sessionsByClassAndDate.get(`${classId}_${bulkTargetDate}`) || [];
        let session = daySessions[bulkSessionIndex];
        if (!session) {
          session = await classSessionsApi.create(classId, { session_date: bulkTargetDate });
        }
        await Promise.all(
          ecIds.map(async (ecId) => {
            const existing = rawAttendanceMap.get(`${ecId}_session_${session!.id}`);
            if (existing) {
              await attendanceApi.update(classId, session!.id, existing.id, {
                side: 'TEACHER',
                ...(lessonVal ? { lesson_topic: lessonVal } : {}),
                ...(noteVal ? { teacher_note: noteVal } : {}),
              });
            } else {
              await attendanceApi.mark(classId, session!.id, {
                enrollment_class_id: ecId,
                status: 'ATTENDED',
                side: 'TEACHER',
                ...(lessonVal ? { lesson_topic: lessonVal } : {}),
                ...(noteVal ? { teacher_note: noteVal } : {}),
              });
            }
          })
        );
      }
      toast.success(
        `Đã áp dụng bài học/ghi chú (Ca ${bulkSessionIndex + 1}) cho ${selectedStudents.size} học viên`
      );
      setBulkLessonTopic('');
      setBulkTeacherNote('');
      onRefresh();
    } catch (err: any) {
      toast.error(
        'Lỗi khi áp dụng bài học/ghi chú hàng loạt: ' +
          (err.response?.data?.error?.message || err.message)
      );
      onRefresh();
    } finally {
      setBulkSaving(false);
    }
  };

  // Áp dụng Ghi chú CSKH hàng loạt cho các học viên đã chọn (Role CS)
  const handleBulkApplyCsNote = async () => {
    const noteVal = bulkCsNote.trim();
    if (!noteVal) {
      toast.warning('Vui lòng nhập Ghi chú CSKH chung trước khi áp dụng.');
      return;
    }
    if (selectedStudents.size === 0 || !bulkTargetDate) return;

    const byClassId = new Map<number, number[]>();
    selectedStudents.forEach((ecId) => {
      if (ecId <= 0) return;
      const st = students.find((item) => item.enrollment_class_id === ecId);
      const classId = cls?.id || st?.class_id;
      if (!classId || classId <= 0) return;
      const list = byClassId.get(classId) || [];
      list.push(ecId);
      byClassId.set(classId, list);
    });

    try {
      setBulkSaving(true);
      for (const [classId, ecIds] of byClassId.entries()) {
        const daySessions = sessionsByClassAndDate.get(`${classId}_${bulkTargetDate}`) || [];
        let session = daySessions[bulkSessionIndex];
        if (!session) {
          session = await classSessionsApi.create(classId, { session_date: bulkTargetDate });
        }
        await Promise.all(
          ecIds.map(async (ecId) => {
            const existing = rawAttendanceMap.get(`${ecId}_session_${session!.id}`);
            if (existing) {
              await attendanceApi.update(classId, session!.id, existing.id, {
                side: 'CS',
                cs_note: noteVal,
              });
            } else {
              await attendanceApi.mark(classId, session!.id, {
                enrollment_class_id: ecId,
                status: 'ATTENDED',
                side: 'CS',
                cs_note: noteVal,
              });
            }
          })
        );
      }
      toast.success(
        `Đã áp dụng ghi chú CSKH (Ca ${bulkSessionIndex + 1}) cho ${selectedStudents.size} học viên`
      );
      setBulkCsNote('');
      onRefresh();
    } catch (err: any) {
      toast.error(
        'Lỗi khi áp dụng ghi chú CSKH hàng loạt: ' +
          (err.response?.data?.error?.message || err.message)
      );
      onRefresh();
    } finally {
      setBulkSaving(false);
    }
  };

  const resolveClassId = (enrollmentClassId: number, session?: ClassSession) =>
    session?.class_id || cls?.id || students.find((item) => item.enrollment_class_id === enrollmentClassId)?.class_id;

  // Đảm bảo chỉ tạo đúng 1 ClassSession cho (classId, dateStr, caNo) ngay cả khi nhiều thao tác
  // (chọn trạng thái + gõ bài học + gõ ghi chú) diễn ra đồng thời trên cùng 1 dòng.
  const ensureSessionForCell = async (
    classId: number,
    dateStr: string,
    caNo = 1,
    passedSession?: ClassSession
  ): Promise<ClassSession> => {
    if (passedSession) return passedSession;
    const existingList = sessionsByClassAndDateRef.current.get(`${classId}_${dateStr}`) || [];
    const existingAtCa = existingList[caNo - 1];
    if (existingAtCa) return existingAtCa;

    const lockKey = `${classId}_${dateStr}_s${caNo}`;
    if (lockKey in sessionCreateLocksRef.current) {
      return sessionCreateLocksRef.current[lockKey];
    }

    const createPromise = (async () => {
      try {
        const created = await classSessionsApi.create(classId, { session_date: dateStr });
        setCreatedSessions((current) =>
          current.some((s) => s.id === created.id) ? current : [...current, created]
        );
        const curList = sessionsByClassAndDateRef.current.get(`${classId}_${dateStr}`) || [];
        if (!curList.some((s) => s.id === created.id)) {
          sessionsByClassAndDateRef.current.set(`${classId}_${dateStr}`, [
            ...curList,
            created,
          ]);
        }
        return created;
      } finally {
        delete sessionCreateLocksRef.current[lockKey];
      }
    })();

    sessionCreateLocksRef.current[lockKey] = createPromise;
    return createPromise;
  };

  const handleStatusSelect = async (
    enrollmentClassId: number,
    dateStr: string,
    session: ClassSession | undefined,
    status: AttendanceStatus,
    fallbackSessionNumber?: number,
    extra?: { lesson_topic?: string | null; teacher_note?: string | null; cs_note?: string | null }
  ) => {
    const classId = resolveClassId(enrollmentClassId, session);
    if (!classId) return toast.error('Không xác định được lớp học');

    const caNo = fallbackSessionNumber || 1;
    const draftKey = `${enrollmentClassId}_${dateStr}_s${caNo}`;
    const draftLesson =
      extra?.lesson_topic !== undefined
        ? extra.lesson_topic
        : teacherLessonDraftsRef.current[draftKey] !== undefined
        ? teacherLessonDraftsRef.current[draftKey].trim() || null
        : undefined;
    const draftTeacherNote =
      extra?.teacher_note !== undefined
        ? extra.teacher_note
        : teacherNoteDraftsRef.current[draftKey] !== undefined
        ? teacherNoteDraftsRef.current[draftKey].trim() || null
        : undefined;
    const draftCsNote =
      extra?.cs_note !== undefined
        ? extra.cs_note
        : csNoteDraftsRef.current[draftKey] !== undefined
        ? csNoteDraftsRef.current[draftKey].trim() || null
        : undefined;

    // Thu gọn thanh chọn trạng thái inline ngay khi chọn
    setActiveInlinePickerKey(null);
    setSavingSessionId(session?.id ?? 'draft');
    try {
      const existingCount = getSessionsForCell(enrollmentClassId, dateStr).length;
      const target = await ensureSessionForCell(classId, dateStr, caNo, session);
      const saved = await attendanceApi.mark(classId, target.id, {
        enrollment_class_id: enrollmentClassId,
        status,
        side: activeSide,
        ...(draftLesson !== undefined ? { lesson_topic: draftLesson } : {}),
        ...(draftTeacherNote !== undefined ? { teacher_note: draftTeacherNote } : {}),
        ...(draftCsNote !== undefined ? { cs_note: draftCsNote } : {}),
      });
      setAttendanceOverrides((current) => {
        const next = new Map(current);
        const key = `${enrollmentClassId}_session_${target.id}`;
        const prev = next.get(key) || rawAttendanceMapRef.current.get(key);
        const sideStatus =
          activeSide === 'ADMIN'
            ? saved.status
            : activeSide === 'TEACHER'
            ? saved.teacher_status
            : saved.cs_status;
        next.set(key, {
          ...prev,
          ...saved,
          class_session: saved.class_session || prev?.class_session || target,
          status: sideStatus || saved.status || status,
        });
        return next;
      });
      const localIndex = getSessionsForCell(enrollmentClassId, dateStr).findIndex(
        (item) => item.id === target.id
      );
      const displaySessionNo =
        localIndex >= 0 ? localIndex + 1 : fallbackSessionNumber || existingCount + 1;
      toast.success(`Đã lưu Ca ${displaySessionNo}`);
      onRefresh();
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          err.message ||
          'Không thể lưu điểm danh'
      );
      onRefresh();
    } finally {
      setSavingSessionId(null);
    }
  };

  const handleSaveNote = async (
    enrollmentClassId: number,
    dateStr: string,
    session: ClassSession | undefined,
    lessonTopic: string | null | undefined,
    teacherNote: string | null | undefined,
    csNote?: string | null,
    caNo = 1
  ) => {
    const classId = resolveClassId(enrollmentClassId, session);
    if (!classId) return toast.error('Không xác định được lớp học');

    setSavingSessionId(session?.id ?? 'draft');
    try {
      const target = await ensureSessionForCell(classId, dateStr, caNo, session);
      const key = `${enrollmentClassId}_session_${target.id}`;
      const existingRaw = rawAttendanceMapRef.current.get(key);
      let saved: Attendance;
      if (existingRaw) {
        saved = await attendanceApi.update(classId, target.id, existingRaw.id, {
          side: activeSide,
          ...(lessonTopic !== undefined ? { lesson_topic: lessonTopic } : {}),
          ...(teacherNote !== undefined ? { teacher_note: teacherNote } : {}),
          ...(csNote !== undefined ? { cs_note: csNote } : {}),
        });
      } else {
        saved = await attendanceApi.mark(classId, target.id, {
          enrollment_class_id: enrollmentClassId,
          status: undefined,
          side: activeSide,
          ...(lessonTopic !== undefined ? { lesson_topic: lessonTopic } : {}),
          ...(teacherNote !== undefined ? { teacher_note: teacherNote } : {}),
          ...(csNote !== undefined ? { cs_note: csNote } : {}),
        });
      }
      setAttendanceOverrides((current) => {
        const next = new Map(current);
        const prev = next.get(key) || rawAttendanceMapRef.current.get(key);
        const sideStatus =
          activeSide === 'ADMIN'
            ? saved.status
            : activeSide === 'TEACHER'
            ? saved.teacher_status
            : saved.cs_status;
        next.set(key, {
          ...prev,
          ...saved,
          class_session: saved.class_session || prev?.class_session || target,
          teacher_status: prev?.teacher_status ?? saved.teacher_status ?? null,
          cs_status: prev?.cs_status ?? saved.cs_status ?? null,
          status: sideStatus || prev?.status || saved.status || 'ATTENDED',
        });
        return next;
      });
      if (lessonTopic !== undefined && teacherNote !== undefined) {
        toast.success(`Đã lưu bài học & ghi chú (Ca ${caNo})`);
      } else if (lessonTopic !== undefined) {
        toast.success(lessonTopic ? `Đã lưu bài học (Ca ${caNo})` : `Đã xóa bài học (Ca ${caNo})`);
      } else if (teacherNote !== undefined) {
        toast.success(
          teacherNote ? `Đã lưu ghi chú GV (Ca ${caNo})` : `Đã xóa ghi chú GV (Ca ${caNo})`
        );
      } else if (csNote !== undefined) {
        toast.success(
          csNote ? `Đã lưu ghi chú CSKH (Ca ${caNo})` : `Đã xóa ghi chú CSKH (Ca ${caNo})`
        );
      }
      onRefresh();
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          err.message ||
          'Không thể lưu ghi chú'
      );
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
    setActiveInlinePickerKey(null);
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

  // Lấy toàn bộ bản ghi Attendance chưa xóa của một ca học (session)
  const getSessionAttendanceRecords = (session: ClassSession): Attendance[] => {
    const list: Attendance[] = [];
    rawAttendanceMap.forEach((a) => {
      if (a.class_session_id === session.id && !(a as any).deleted_at) {
        list.push(a);
      }
    });
    return list;
  };

  // Kiểm tra bản ghi có dữ liệu của chính vai trò đang đăng nhập (activeSide) hay không
  const hasCurrentSideDataOnRecord = (att: Attendance | undefined): boolean => {
    if (!att) return false;
    if (activeSide === 'TEACHER') {
      return Boolean(att.teacher_status || att.lesson_topic || att.teacher_note);
    }
    if (activeSide === 'CS') {
      return Boolean(att.cs_status || att.cs_note);
    }
    return att.reconciliation_state === 'RESOLVED';
  };

  // Kiểm tra bản ghi còn dữ liệu của các vai trò KHÁC (ngoài activeSide) hay không
  const hasOtherSidesDataOnRecord = (att: Attendance | undefined): boolean => {
    if (!att) return false;
    if (activeSide === 'TEACHER') {
      return Boolean(att.cs_status || att.cs_note || att.reconciliation_state === 'RESOLVED');
    }
    if (activeSide === 'CS') {
      return Boolean(
        att.teacher_status ||
          att.lesson_topic ||
          att.teacher_note ||
          att.reconciliation_state === 'RESOLVED'
      );
    }
    return Boolean(
      att.teacher_status ||
        att.lesson_topic ||
        att.teacher_note ||
        att.cs_status ||
        att.cs_note
    );
  };

  // Đếm số bản ghi có dữ liệu ở ca này (trên cả 3 vai trò)
  const countMarkedInCa = (session: ClassSession): number =>
    getSessionAttendanceRecords(session).filter(
      (a) => hasCurrentSideDataOnRecord(a) || hasOtherSidesDataOnRecord(a)
    ).length;

  // Xóa theo cơ chế cô lập 3 vai trò:
  // - Nếu cả 3 vai trò đều chưa chấm gì ở ca này → gỡ bỏ ngay khung Ca rỗng.
  // - Nếu vai trò hiện tại chưa chấm gì nhưng vai trò khác đã chấm → giữ nguyên khung Ca cho vai trò khác.
  // - Nếu vai trò hiện tại đã chấm → xác nhận để xóa phần dữ liệu của vai trò hiện tại
  //   (và chỉ xóa khung Ca khi các vai trò khác cũng hoàn toàn trống).
  const requestDeleteCa = (
    classId: number,
    className: string,
    dateStr: string,
    caNumber: number
  ) => {
    const daySessions = sessionsByClassAndDate.get(`${classId}_${dateStr}`) || [];
    const session = daySessions[caNumber - 1];
    if (!session) return;
    const records = getSessionAttendanceRecords(session);
    const myRecords = records.filter((r) => hasCurrentSideDataOnRecord(r));
    const otherSidesExist = records.some((r) => hasOtherSidesDataOnRecord(r));

    if (myRecords.length === 0 && !otherSidesExist) {
      void performDeleteCa(classId, className, dateStr, caNumber, session, false);
      return;
    }
    if (myRecords.length === 0 && otherSidesExist) {
      toast.info(
        `Ca ${caNumber} đang có dữ liệu của vai trò khác nên khung ca được giữ nguyên (phía bạn chưa chấm gì ở ca này).`
      );
      return;
    }
    setActiveInlinePickerKey(null);
    setDeleteCaTarget({
      classId,
      className,
      dateStr,
      caNumber,
      session,
      attendanceCount: myRecords.length,
    });
  };

  const performDeleteCa = async (
    classId: number,
    className: string,
    dateStr: string,
    caNumber: number,
    session: ClassSession,
    confirmed: boolean
  ) => {
    const key = `delca_${session.id}`;
    setSavingActionKey(key);
    setDeletingCa(true);
    try {
      const records = getSessionAttendanceRecords(session);
      const myRecords = records.filter((r) => hasCurrentSideDataOnRecord(r));
      const otherSidesExist = records.some((r) => hasOtherSidesDataOnRecord(r));

      // Dọn nháp Ghi chú CSKH & Bài học/Ghi chú GV của ngày này
      setCsNoteDrafts((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (k.includes(`_${dateStr}_s`)) delete next[k];
        });
        return next;
      });
      Object.keys(csNoteTimersRef.current).forEach((k) => {
        if (k.includes(`_${dateStr}_s`)) {
          clearTimeout(csNoteTimersRef.current[k]);
          delete csNoteTimersRef.current[k];
        }
      });
      setTeacherLessonDrafts((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (k.includes(`_${dateStr}_s`)) delete next[k];
        });
        return next;
      });
      setTeacherNoteDrafts((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (k.includes(`_${dateStr}_s`)) delete next[k];
        });
        return next;
      });
      Object.keys(teacherNoteTimersRef.current).forEach((k) => {
        if (k.includes(`_${dateStr}_s`)) {
          clearTimeout(teacherNoteTimersRef.current[k]);
          delete teacherNoteTimersRef.current[k];
        }
      });

      if (otherSidesExist) {
        // Vai trò khác vẫn còn dữ liệu trên ca này -> CHỈ xóa phần dữ liệu của activeSide, giữ nguyên khung Ca
        await Promise.all(
          myRecords.map((r) => attendanceApi.remove(classId, session.id, r.id, activeSide))
        );
        setActiveInlinePickerKey(null);
        setDeleteCaTarget(null);
        const roleLabel =
          activeSide === 'CS' ? 'CSKH' : activeSide === 'ADMIN' ? 'Admin (Chốt)' : 'Giáo viên';
        toast.success(
          `Đã xóa dữ liệu ${roleLabel} ở Ca ${caNumber} (giữ nguyên dữ liệu của các vai trò khác)`
        );
        onRefresh();
      } else {
        // Các vai trò khác đều trống -> xóa luôn khung Ca rỗng để đồng bộ gọn cả 3 bên
        await classSessionsApi.remove(classId, session.id, confirmed || myRecords.length > 0);
        setDeletedSessionIds((prev) => {
          const next = new Set(prev);
          next.add(session.id);
          return next;
        });
        setCreatedSessions((current) => current.filter((item) => item.id !== session.id));

        const remainingCa = Math.max(
          0,
          (sessionsByClassAndDate.get(`${classId}_${dateStr}`) || []).length - 1
        );
        setActiveInlinePickerKey(null);
        setDeleteCaTarget(null);
        setDrawerState((prev) => {
          if (!prev || (prev.student.class_id || cls?.id) !== classId || prev.dateStr !== dateStr)
            return prev;
          if (remainingCa === 0) return null;
          return { ...prev, caNumber: Math.min(prev.caNumber, remainingCa) };
        });
        toast.success(`Đã xóa Ca ${caNumber} (${formatSessionDate(dateStr)}) của lớp ${className}`);
        onRefresh();
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể xóa dữ liệu ca học'
      );
    } finally {
      setDeletingCa(false);
      setSavingActionKey((prev) => (prev === key ? null : prev));
    }
  };

  // CVHT: 1 chạm "Khớp theo GV" — sao chép điểm danh GV sang cs_status cho mọi ca trong ngày
  // mà GV đã chấm nhưng CSKH chưa chấm.
  const pendingMatchTeacherCount = useMemo(() => {
    if (activeSide !== 'CS') return 0;
    let count = 0;
    students.forEach((st) => {
      if (st.enrollment_class_id <= 0) return;
      getSessionsForCell(st.enrollment_class_id, quickDate).forEach((sess) => {
        const att = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${sess.id}`);
        if (att?.teacher_status && !att.cs_status) count++;
      });
    });
    return count;
  }, [activeSide, students, quickDate, rawAttendanceMap, sessionsByClassAndDate]);

  const handleMatchTeacherForDay = async () => {
    if (pendingMatchTeacherCount === 0) {
      toast.info('Mọi ca GV đã chấm trong ngày đều có CSKH xác nhận');
      return;
    }
    const groups = new Map<string, { classId: number; sessionId: number; items: { enrollment_class_id: number; status: AttendanceStatus }[] }>();
    students.forEach((st) => {
      if (st.enrollment_class_id <= 0) return;
      const daySessions = getSessionsForCell(st.enrollment_class_id, quickDate);
      daySessions.forEach((sess) => {
        const att = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${sess.id}`);
        const tStatus = att?.teacher_status as AttendanceStatus | null | undefined;
        if (!tStatus || att?.cs_status) return;
        const gKey = `${sess.class_id}_${sess.id}`;
        const group = groups.get(gKey) || { classId: sess.class_id, sessionId: sess.id, items: [] };
        group.items.push({ enrollment_class_id: st.enrollment_class_id, status: tStatus });
        groups.set(gKey, group);
      });
    });
    try {
      setBulkSaving(true);
      await Promise.all(
        Array.from(groups.values()).map((g) =>
          attendanceApi.bulkMark(g.classId, g.sessionId, { items: g.items, side: 'CS' })
        )
      );
      toast.success(`Đã khớp ${pendingMatchTeacherCount} ca theo điểm danh GV ngày ${new Date(`${quickDate}T00:00:00`).toLocaleDateString('vi-VN')}`);
      onRefresh();
    } catch (err: any) {
      toast.error('Lỗi khi khớp theo GV: ' + (err.response?.data?.error?.message || err.message));
      onRefresh();
    } finally {
      setBulkSaving(false);
    }
  };

  // "+ thêm ca" từ 1 dòng học viên: tạo Ca n+1 cho cả lớp trong ngày và mở luôn
  // thanh chọn trạng thái inline của đúng Ca mới trên dòng học viên đó (giống bên GV).
  const handleAddCaForStudent = async (st: StudentRow, dateStr: string) => {
    const classId = cls?.id || st.class_id;
    if (!classId) return toast.error('Không xác định được lớp học');
    const key = `addca_${classId}_${dateStr}`;
    setSavingActionKey(key);
    try {
      const created = await classSessionsApi.create(classId, { session_date: dateStr });
      setCreatedSessions((current) => [...current, created]);
      const allDay = [...(sessionsByClassAndDate.get(`${classId}_${dateStr}`) || []), created].sort(
        compareSessionsInDay
      );
      const newCaNumber = allDay.findIndex((s) => s.id === created.id) + 1 || allDay.length;
      setActiveInlinePickerKey(`${st.enrollment_class_id}_${dateStr}_s${newCaNumber}`);
      toast.success(`Đã thêm Ca ${newCaNumber} cho ngày ${formatSessionDate(dateStr)}`);
      onRefresh();
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thêm ca học');
    } finally {
      setSavingActionKey((prev) => (prev === key ? null : prev));
    }
  };

  // Bộ lọc nhanh theo trạng thái ô trên Bảng tháng
  const [matrixCellFilter, setMatrixCellFilter] = useState<MatrixCellFilter>('ALL');

  const matrixLegendStats = useMemo(() => {
    const counts: AttendanceLegendCounts = {
      conflict: 0,
      pendingOneSide: 0,
      sessionUnmarked: 0,
      matched: 0,
      adminResolved: 0,
    };
    const matchingStudentIdsByFilter: Record<Exclude<MatrixCellFilter, 'ALL'>, Set<number>> = {
      CONFLICT: new Set<number>(),
      PENDING_ONE_SIDE: new Set<number>(),
      SESSION_UNMARKED: new Set<number>(),
      MATCHED: new Set<number>(),
      ADMIN_RESOLVED: new Set<number>(),
    };

    students.forEach((st) => {
      if (st.enrollment_class_id <= 0) return;
      visibleDatesList.forEach((d) => {
        const dateStr = toDateString(d);
        const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
        daySessions.forEach((sess) => {
          const rawAtt = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${sess.id}`);
          const classified = classifySessionAttendance(rawAtt);
          if (classified.category === 'CONFLICT') {
            counts.conflict++;
            matchingStudentIdsByFilter.CONFLICT.add(st.enrollment_class_id);
          } else if (classified.category === 'PENDING_ONE_SIDE') {
            counts.pendingOneSide++;
            matchingStudentIdsByFilter.PENDING_ONE_SIDE.add(st.enrollment_class_id);
          } else if (classified.category === 'SESSION_UNMARKED') {
            counts.sessionUnmarked++;
            matchingStudentIdsByFilter.SESSION_UNMARKED.add(st.enrollment_class_id);
          } else if (classified.category === 'MATCHED') {
            counts.matched++;
            matchingStudentIdsByFilter.MATCHED.add(st.enrollment_class_id);
          } else if (classified.category === 'ADMIN_RESOLVED') {
            counts.adminResolved++;
            matchingStudentIdsByFilter.ADMIN_RESOLVED.add(st.enrollment_class_id);
          }
        });
      });
    });

    return { counts, matchingStudentIdsByFilter };
  }, [students, visibleDatesList, sessionsByClassAndDate, rawAttendanceMap]);

  const matrixFilteredStudents = useMemo(() => {
    if (matrixCellFilter === 'ALL') return students;
    const allowedSet = matrixLegendStats.matchingStudentIdsByFilter[matrixCellFilter];
    return students.filter((st) => allowedSet.has(st.enrollment_class_id));
  }, [students, matrixCellFilter, matrixLegendStats]);

  // Mở ngăn chi tiết buổi học (AttendanceSessionDrawer) cho Tab 2
  const openDrawer = (st: StudentRow, dateStr: string, caNumber: number, defaultEditing?: boolean) => {
    const sess = getSessionsForCell(st.enrollment_class_id, dateStr)[caNumber - 1];
    const rawAtt = sess ? rawAttendanceMap.get(`${st.enrollment_class_id}_session_${sess.id}`) : undefined;
    const hasMyMark =
      activeSide === 'TEACHER'
        ? Boolean(rawAtt?.teacher_status)
        : activeSide === 'CS'
        ? Boolean(rawAtt?.cs_status)
        : isAttendanceFinalized(rawAtt);
    const shouldEdit = defaultEditing !== undefined ? defaultEditing : !hasMyMark;
    setDrawerState({ student: st, dateStr, caNumber, defaultEditing: shouldEdit });
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

  // Tab 2 (Bảng tháng): hiển thị phân biệt rõ 7 trạng thái quy trình (Chưa tạo ca / Đã mở ca chưa chấm / Mới 1 bên chấm / Hai bên lệch / Đã khớp / Admin chốt / Có ghi chú).
  const renderMatrixDateCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    const formattedDateLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString('vi-VN');

    if (daySessions.length === 0) {
      return (
        <MonthlyEmptyDateCell
          id={`attendance-cell-${st.enrollment_class_id}-${dateStr}`}
          studentName={st.full_name}
          dateLabel={formattedDateLabel}
          onClick={() => openDrawer(st, dateStr, 1, true)}
        />
      );
    }

    const nextSessionNumber = daySessions.length + 1;

    return (
      <div
        id={`attendance-cell-${st.enrollment_class_id}-${dateStr}`}
        className="group/cell flex min-h-9 w-full min-w-[64px] flex-wrap items-center justify-center gap-1 px-1 py-1"
      >
        {daySessions.map((session, index) => {
          const sessionNumber = index + 1;
          const rawAtt = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          return (
            <MonthlySessionBadge
              id={`attendance-badge-${st.enrollment_class_id}-${dateStr}-${sessionNumber}`}
              key={session.id}
              session={session}
              sessionNumber={sessionNumber}
              totalSessionsInDay={daySessions.length}
              att={rawAtt}
              studentName={st.full_name}
              dateLabel={formattedDateLabel}
              onClick={() => openDrawer(st, dateStr, sessionNumber)}
            />
          );
        })}

        <button
          id={`attendance-add-session-${st.enrollment_class_id}-${dateStr}`}
          type="button"
          onClick={() => openDrawer(st, dateStr, nextSessionNumber, true)}
          aria-label={`Thêm Ca ${nextSessionNumber} cho ${st.full_name} ngày ${formattedDateLabel}`}
          title={`Thêm ca tiếp theo (Ca ${nextSessionNumber})`}
          className="inline-flex h-6 w-5 items-center justify-center rounded-md border border-dashed border-primary/50 text-xs font-extrabold text-primary opacity-0 group-hover/cell:opacity-100 focus:opacity-100 transition hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          +
        </button>
      </div>
    );
  };

  // ===== Tab 1 (Nhập điểm danh) chuẩn progressive disclosure giống bên GV =====
  const QUICK_INLINE_BUTTONS: Array<{ status: AttendanceStatus; code: string; shortLabel: string }> = [
    { status: 'ATTENDED', code: '1', shortLabel: 'Có mặt' },
    { status: 'ABSENT_APPROVED_A', code: 'A', shortLabel: 'Có phép' },
    { status: 'LEAVE_B', code: 'B', shortLabel: 'Bảo lưu' },
    { status: 'ABSENT_UNAPPROVED_C', code: 'C', shortLabel: 'Không phép' },
    { status: 'TEACHER_ABSENT_D', code: 'D', shortLabel: 'GV nghỉ' },
    { status: 'TECH_ERROR_E', code: 'E', shortLabel: 'Lỗi KT' },
  ];

  // Cột có thể chấm ở Tab 1: mặc định "—" + "+"; bấm "—" mới bung thanh 6 trạng thái;
  // chọn xong thu gọn thành chip "Ca n: Mã · Trạng thái". Kèm nút xóa ca (thùng rác).
  // variant='admin-final': chỉ đọc att.status (kết quả chốt); chưa chốt thì hiện "—"
  // kèm dòng note trạng thái đối chiếu bên dưới (chờ GV / chờ CSKH / hai bên lệch...).
  const renderQuickInlineStatusStack = (
    st: StudentRow,
    dateStr: string,
    readStatus: (att: Attendance | undefined) => AttendanceStatus | null | undefined,
    variant: 'mark' | 'admin-final' = 'mark'
  ) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    const totalCa = Math.max(1, daySessions.length);
    const classId = resolveClassId(st.enrollment_class_id);

    return (
      <div className="flex flex-col items-start gap-1.5">
        {Array.from({ length: totalCa }, (_, idx) => {
          const caNo = idx + 1;
          const sess = daySessions[caNo - 1];
          const att = sess ? rawAttendanceMap.get(`${st.enrollment_class_id}_session_${sess.id}`) : undefined;
          const curStatus = readStatus(att);
          const cfg = curStatus ? STATUS_CONFIG[curStatus] : null;
          const pickerKey = `${st.enrollment_class_id}_${dateStr}_s${caNo}`;
          const isOpen = activeInlinePickerKey === pickerKey;
          const isDeletingThisCa = Boolean(sess && savingActionKey === `delca_${sess.id}`);
          const isAddingCa = savingActionKey === `addca_${classId}_${dateStr}`;

          let reconcileBadge: React.ReactNode = null;
          if (variant === 'admin-final' && curStatus) {
            // Đã có kết quả chốt: gắn nhãn nguồn kết quả để Admin phân biệt tự khớp / phân xử
            reconcileBadge =
              att?.reconciliation_state === 'RESOLVED' ? (
                <span className="shrink-0 whitespace-nowrap rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                  Đã phân xử
                </span>
              ) : (
                <span className="shrink-0 whitespace-nowrap rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  Đã khớp
                </span>
              );
          }

          // Dòng note trạng thái khi Ca chưa được chốt (chỉ dùng cho cột Chốt của Admin)
          let pendingNote: React.ReactNode = null;
          if (variant === 'admin-final' && !curStatus) {
            const tStatus = att?.teacher_status as AttendanceStatus | null | undefined;
            const csStatus = att?.cs_status as AttendanceStatus | null | undefined;
            if (!tStatus && !csStatus) {
              pendingNote = (
                <span className="whitespace-nowrap text-[10px] italic text-text-muted">
                  Chưa bên nào chấm
                </span>
              );
            } else if (tStatus && csStatus && tStatus !== csStatus) {
              pendingNote = (
                <span className="whitespace-nowrap text-[10px] font-semibold text-rose-600">
                  Lệch (GV: {STATUS_CONFIG[tStatus].short} · CSKH: {STATUS_CONFIG[csStatus].short}) — cần chốt
                </span>
              );
            } else if (tStatus && !csStatus) {
              pendingNote = (
                <span className="whitespace-nowrap text-[10px] font-semibold text-amber-600">
                  Chờ CSKH chấm (GV: {STATUS_CONFIG[tStatus].short})
                </span>
              );
            } else {
              pendingNote = (
                <span className="whitespace-nowrap text-[10px] font-semibold text-amber-600">
                  Chờ GV chấm (CSKH: {STATUS_CONFIG[(csStatus ?? 'ATTENDED') as AttendanceStatus].short})
                </span>
              );
            }
          }

          return (
            <div key={caNo} className="flex flex-col items-start gap-0.5">
              <div className="flex min-h-7 flex-nowrap items-center gap-1 whitespace-nowrap">
                {!isOpen ? (
                  <>
                    <button
                      type="button"
                      disabled={savingSessionId !== null || isDeletingThisCa}
                      onClick={() => setActiveInlinePickerKey(pickerKey)}
                      title={
                        cfg
                          ? `Ca ${caNo}: ${cfg.label} — bấm để đổi trạng thái`
                          : `Bấm để chọn trạng thái điểm danh Ca ${caNo} cho ${st.full_name}`
                      }
                      className={`inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-bold transition ${
                        cfg
                          ? `${cfg.bg} ${cfg.text} ${cfg.border} shadow-2xs hover:ring-2 hover:ring-primary/40`
                          : 'min-w-9 border-border/80 bg-white text-slate-600 hover:border-primary/60 hover:bg-primary-soft/30 hover:text-primary'
                      } disabled:opacity-50`}
                    >
                      {cfg ? (
                        <>
                          {totalCa > 1 && <span className="text-[11px] font-extrabold opacity-80">Ca {caNo}:</span>}
                          <span className="font-extrabold">{cfg.short}</span>
                          <span>·</span>
                          <span>{cfg.label}</span>
                        </>
                      ) : totalCa > 1 ? (
                        <>
                          <span className="text-[11px] font-bold text-slate-500">Ca {caNo}:</span>
                          <span className="font-extrabold text-slate-400">—</span>
                        </>
                      ) : (
                        <span className="font-extrabold text-slate-500">—</span>
                      )}
                    </button>

                    {reconcileBadge}

                    {caNo === totalCa && classId && (
                      <button
                        type="button"
                        disabled={isAddingCa}
                        onClick={() => handleAddCaForStudent(st, dateStr)}
                        title={`Thêm Ca ${totalCa + 1} trong ngày này`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-primary/50 bg-white text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {sess && classId && (
                      <button
                        type="button"
                        disabled={isDeletingThisCa}
                        onClick={() => requestDeleteCa(classId, st.class_name, dateStr, caNo)}
                        title={
                          countMarkedInCa(sess) === 0
                            ? `Gỡ bỏ Ca ${caNo} (chưa chấm điểm danh)`
                            : `Xóa Ca ${caNo} của lớp`
                        }
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-xl border border-primary/40 bg-white p-1 shadow-xs">
                    <span className="shrink-0 whitespace-nowrap px-1.5 text-[11px] font-extrabold text-primary">
                      Ca {caNo}:
                    </span>
                    {QUICK_INLINE_BUTTONS.map(({ status, code, shortLabel }) => {
                      const bCfg = STATUS_CONFIG[status];
                      const isSelected = curStatus === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={savingSessionId !== null}
                          onClick={() => {
                            setActiveInlinePickerKey(null);
                            void handleStatusSelect(st.enrollment_class_id, dateStr, sess, status, caNo);
                          }}
                          title={`${bCfg.label} (Ca ${caNo})`}
                          className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-bold transition ${
                            isSelected
                              ? `${bCfg.bg} ${bCfg.text} ${bCfg.border} ring-2 ring-primary ring-offset-1`
                              : 'border-border/80 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                          } disabled:opacity-50`}
                        >
                          <span className="font-extrabold">{code}</span>
                          <span>{shortLabel}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setActiveInlinePickerKey(null)}
                      title="Đóng (Esc)"
                      className="ml-0.5 inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-[11px] font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {pendingNote && <div className="pl-0.5 whitespace-nowrap">{pendingNote}</div>}

              {variant === 'admin-final' && isOpen && att && (att.teacher_status || att.cs_status) && (
                <div className="pl-0.5 whitespace-nowrap text-[10px] text-text-secondary">
                  Tham chiếu — GV:{' '}
                  <strong>{att.teacher_status ? `${STATUS_CONFIG[att.teacher_status as AttendanceStatus].short} · ${STATUS_CONFIG[att.teacher_status as AttendanceStatus].label}` : 'chưa chấm'}</strong>
                  {' · CSKH: '}
                  <strong>{att.cs_status ? `${STATUS_CONFIG[att.cs_status as AttendanceStatus].short} · ${STATUS_CONFIG[att.cs_status as AttendanceStatus].label}` : 'chưa chấm'}</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Cột "Điểm danh GV & Bài học" (Tab 1, chỉ đọc với CSKH/Admin): gom Trạng thái điểm danh
  // + Bài học + Ghi chú GV của từng Ca vào chung một cụm box có viền gọn gàng.
  const renderQuickTeacherStackCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    if (daySessions.length === 0) {
      return (
        <div className="flex min-h-7 items-center">
          <div className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/70 bg-white px-2.5 py-1 text-[11px] text-text-muted">
            <span className="font-extrabold text-slate-400">—</span>
            <span className="text-[10px] italic">GV chưa chấm</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-start gap-1.5 py-0.5">
        {daySessions.map((session, index) => {
          const caNo = index + 1;
          const att = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          const tStatus = att?.teacher_status as AttendanceStatus | null | undefined;
          const cfg = tStatus ? STATUS_CONFIG[tStatus] : null;
          const hasLessonOrNote = Boolean(att?.lesson_topic || att?.teacher_note);
          return (
            <div
              key={session.id}
              className="inline-flex w-fit max-w-[240px] flex-col gap-1 rounded-lg border border-border/80 bg-white px-2.5 py-1.5 shadow-2xs"
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                {daySessions.length > 1 && (
                  <span className="shrink-0 whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                    Ca {caNo}
                  </span>
                )}
                <span
                  className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                    cfg
                      ? `${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`
                      : 'border-border/60 bg-slate-100/80 text-text-muted'
                  }`}
                  title={`Ca ${caNo} (GV): ${cfg?.label || 'Chưa điểm danh'}`}
                >
                  <span>{cfg ? `${cfg.short} · ${cfg.label}` : '— · Chưa chấm'}</span>
                </span>
              </div>

              {hasLessonOrNote && (
                <div className="max-w-[220px] space-y-0.5 border-t border-border/50 pt-1 text-[11px] leading-snug">
                  {att?.lesson_topic && (
                    <div className="truncate text-text-primary" title={`Bài học: ${att.lesson_topic}`}>
                      <span className="font-semibold text-teal-700">Bài học:</span> {att.lesson_topic}
                    </div>
                  )}
                  {att?.teacher_note && (
                    <div className="truncate italic text-text-secondary" title={`Ghi chú GV: ${att.teacher_note}`}>
                      <span className="not-italic font-semibold text-slate-600">Ghi chú:</span> "{att.teacher_note}"
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Cột "Ghi chú CSKH" (Tab 1): CS chấm trực tiếp theo từng Ca (autosave 600ms/blur/Enter);
  // role khác xem chỉ đọc. Chỉ lưu khi ca đã tồn tại (tránh tạo "ca ma").
  const renderQuickCsNoteStack = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    const totalCa = Math.max(1, daySessions.length);
    const editable = activeSide === 'CS';

    const persist = (caNo: number, session: ClassSession | undefined, rawVal: string) => {
      const draftKey = `${st.enrollment_class_id}_${dateStr}_s${caNo}`;
      const norm = rawVal.trim() || null;
      const classId = cls?.id || st.class_id;
      const latestSession =
        session ||
        (classId
          ? (sessionsByClassAndDateRef.current.get(`${classId}_${dateStr}`) || [])[caNo - 1]
          : undefined);
      if (!latestSession && !norm) return;
      const att = latestSession
        ? rawAttendanceMapRef.current.get(`${st.enrollment_class_id}_session_${latestSession.id}`)
        : undefined;
      const current = (att?.cs_note ?? '') || null;
      if ((lastSavedCsNoteMapRef.current[draftKey] ?? current) === norm) return;
      lastSavedCsNoteMapRef.current[draftKey] = norm ?? '';
      void handleSaveNote(
        st.enrollment_class_id,
        dateStr,
        latestSession,
        undefined,
        undefined,
        norm,
        caNo
      );
    };

    return (
      <div className="flex flex-col gap-1.5 py-0.5">
        {Array.from({ length: totalCa }, (_, idx) => {
          const caNo = idx + 1;
          const session = daySessions[caNo - 1];
          const att = session ? rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`) : undefined;
          const draftKey = `${st.enrollment_class_id}_${dateStr}_s${caNo}`;
          const noteVal = csNoteDrafts[draftKey] !== undefined ? csNoteDrafts[draftKey] : att?.cs_note || '';

          if (!editable) {
            return (
              <div key={caNo} className="flex min-h-7 items-center gap-1.5 whitespace-nowrap">
                {totalCa > 1 && (
                  <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded border border-border/70 bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
                    Ca {caNo}
                  </span>
                )}
                {noteVal ? (
                  <span className="block max-w-[200px] truncate text-xs italic text-text-secondary" title={noteVal}>
                    "{noteVal}"
                  </span>
                ) : (
                  <span className="text-[11px] text-text-muted">—</span>
                )}
              </div>
            );
          }

          return (
            <div key={caNo} className="flex min-h-7 items-center gap-1.5">
              {totalCa > 1 && (
                <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md border border-border/70 bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">
                  Ca {caNo}
                </span>
              )}
              <input
                type="text"
                value={noteVal}
                disabled={!session}
                onChange={(e) => {
                  const val = e.target.value;
                  csNoteDraftsRef.current[draftKey] = val;
                  setCsNoteDrafts((prev) => ({ ...prev, [draftKey]: val }));
                  if (csNoteTimersRef.current[draftKey]) clearTimeout(csNoteTimersRef.current[draftKey]);
                  csNoteTimersRef.current[draftKey] = setTimeout(() => {
                    delete csNoteTimersRef.current[draftKey];
                    persist(caNo, session, csNoteDraftsRef.current[draftKey] ?? val);
                  }, 800);
                }}
                onBlur={() => {
                  if (csNoteTimersRef.current[draftKey]) {
                    clearTimeout(csNoteTimersRef.current[draftKey]);
                    delete csNoteTimersRef.current[draftKey];
                  }
                  persist(caNo, session, csNoteDraftsRef.current[draftKey] ?? noteVal);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (csNoteTimersRef.current[draftKey]) {
                      clearTimeout(csNoteTimersRef.current[draftKey]);
                      delete csNoteTimersRef.current[draftKey];
                    }
                    persist(caNo, session, csNoteDraftsRef.current[draftKey] ?? noteVal);
                  }
                }}
                placeholder={session ? `Ghi chú CSKH Ca ${caNo}...` : 'Thêm ca để ghi chú'}
                className="h-7 w-full min-w-[140px] rounded-lg border border-border/80 bg-white px-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              />
            </div>
          );
        })}
      </div>
    );
  };

  // Cột "Bài học" & "Ghi chú GV" (Tab 1, khi đăng nhập vai trò Giáo viên ở chế độ Theo Học viên):
  // nhập trực tiếp theo từng Ca (autosave 450ms/blur/Enter).
  const renderQuickTeacherFieldStack = (
    st: StudentRow,
    dateStr: string,
    field: 'lesson_topic' | 'teacher_note'
  ) => {
    if (st.enrollment_class_id <= 0) {
      return (
        <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">
          Chưa xếp lớp
        </span>
      );
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    const totalCa = Math.max(1, daySessions.length);

    const persistTeacherField = (
      caNo: number,
      session: ClassSession | undefined,
      editedField: 'lesson_topic' | 'teacher_note',
      rawVal: string
    ) => {
      const draftKey = `${st.enrollment_class_id}_${dateStr}_s${caNo}`;
      const normVal = rawVal.trim() || null;
      const classId = cls?.id || st.class_id;
      const latestSession =
        session ||
        (classId
          ? (sessionsByClassAndDateRef.current.get(`${classId}_${dateStr}`) || [])[caNo - 1]
          : undefined);
      if (!latestSession && !normVal) return;

      const att = latestSession
        ? rawAttendanceMapRef.current.get(`${st.enrollment_class_id}_session_${latestSession.id}`)
        : undefined;
      const curLesson = (att?.lesson_topic ?? '').trim();
      const curNote = (att?.teacher_note ?? '').trim();
      const last = lastSavedTeacherNoteMapRef.current[draftKey] || {
        lesson: curLesson,
        note: curNote,
      };

      if (editedField === 'lesson_topic') {
        if (last.lesson === (normVal ?? '')) return;
        lastSavedTeacherNoteMapRef.current[draftKey] = {
          ...last,
          lesson: normVal ?? '',
        };
        void handleSaveNote(
          st.enrollment_class_id,
          dateStr,
          latestSession,
          normVal,
          undefined,
          undefined,
          caNo
        );
      } else {
        if (last.note === (normVal ?? '')) return;
        lastSavedTeacherNoteMapRef.current[draftKey] = {
          ...last,
          note: normVal ?? '',
        };
        void handleSaveNote(
          st.enrollment_class_id,
          dateStr,
          latestSession,
          undefined,
          normVal,
          undefined,
          caNo
        );
      }
    };

    return (
      <div className="flex flex-col gap-1.5 py-0.5">
        {Array.from({ length: totalCa }, (_, idx) => {
          const caNo = idx + 1;
          const session = daySessions[caNo - 1];
          const att = session
            ? rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`)
            : undefined;
          const draftKey = `${st.enrollment_class_id}_${dateStr}_s${caNo}`;
          const lessonVal =
            teacherLessonDrafts[draftKey] !== undefined
              ? teacherLessonDrafts[draftKey]
              : att?.lesson_topic || '';
          const noteVal =
            teacherNoteDrafts[draftKey] !== undefined
              ? teacherNoteDrafts[draftKey]
              : att?.teacher_note || '';
          const val = field === 'lesson_topic' ? lessonVal : noteVal;

          return (
            <div key={caNo} className="flex min-h-7 items-center gap-1.5">
              {totalCa > 1 && (
                <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md border border-border/70 bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">
                  Ca {caNo}
                </span>
              )}
              <input
                type="text"
                value={val}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  if (field === 'lesson_topic') {
                    teacherLessonDraftsRef.current[draftKey] = nextVal;
                    setTeacherLessonDrafts((prev) => ({ ...prev, [draftKey]: nextVal }));
                  } else {
                    teacherNoteDraftsRef.current[draftKey] = nextVal;
                    setTeacherNoteDrafts((prev) => ({ ...prev, [draftKey]: nextVal }));
                  }
                  const timerKey = `${draftKey}_${field}`;
                  if (teacherNoteTimersRef.current[timerKey]) {
                    clearTimeout(teacherNoteTimersRef.current[timerKey]);
                  }
                  teacherNoteTimersRef.current[timerKey] = setTimeout(() => {
                    delete teacherNoteTimersRef.current[timerKey];
                    const latestTyped =
                      field === 'lesson_topic'
                        ? teacherLessonDraftsRef.current[draftKey] ?? nextVal
                        : teacherNoteDraftsRef.current[draftKey] ?? nextVal;
                    persistTeacherField(caNo, session, field, latestTyped);
                  }, 800);
                }}
                onBlur={() => {
                  const timerKey = `${draftKey}_${field}`;
                  if (teacherNoteTimersRef.current[timerKey]) {
                    clearTimeout(teacherNoteTimersRef.current[timerKey]);
                    delete teacherNoteTimersRef.current[timerKey];
                  }
                  const latestTyped =
                    field === 'lesson_topic'
                      ? teacherLessonDraftsRef.current[draftKey] ?? val
                      : teacherNoteDraftsRef.current[draftKey] ?? val;
                  persistTeacherField(caNo, session, field, latestTyped);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const timerKey = `${draftKey}_${field}`;
                    if (teacherNoteTimersRef.current[timerKey]) {
                      clearTimeout(teacherNoteTimersRef.current[timerKey]);
                      delete teacherNoteTimersRef.current[timerKey];
                    }
                    const latestTyped =
                      field === 'lesson_topic'
                        ? teacherLessonDraftsRef.current[draftKey] ?? val
                        : teacherNoteDraftsRef.current[draftKey] ?? val;
                    persistTeacherField(caNo, session, field, latestTyped);
                  }
                }}
                placeholder={
                  field === 'lesson_topic'
                    ? `Bài học Ca ${caNo}...`
                    : `Ghi chú riêng Ca ${caNo}...`
                }
                className={
                  field === 'lesson_topic'
                    ? 'h-7 w-full min-w-[140px] rounded-lg border border-indigo-300/70 bg-indigo-50/60 px-2.5 text-xs font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-primary/40'
                    : 'h-7 w-full min-w-[140px] rounded-lg border border-border/80 bg-white px-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40'
                }
              />
            </div>
          );
        })}
      </div>
    );
  };

  // Ô chỉ đọc: Điểm danh & Ghi chú phía CSKH (dùng cho Admin ở Tab 1 — gom Trạng thái
  // điểm danh CSKH + Ghi chú CSKH theo từng Ca vào chung một cụm box tương tự cột GV).
  const renderCSReadonlyCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    if (daySessions.length === 0) {
      return (
        <div className="flex min-h-7 items-center">
          <div className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/70 bg-white px-2.5 py-1 text-[11px] text-text-muted">
            <span className="font-extrabold text-slate-400">—</span>
            <span className="text-[10px] italic">CSKH chưa chấm</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-start gap-1.5 py-0.5">
        {daySessions.map((session, index) => {
          const sessionNumber = index + 1;
          const att = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          const csStatus = att?.cs_status as AttendanceStatus | null | undefined;
          const cfg = csStatus ? STATUS_CONFIG[csStatus] : null;
          return (
            <div
              key={session.id}
              className="inline-flex w-fit max-w-[240px] flex-col gap-1 rounded-lg border border-border/80 bg-white px-2.5 py-1.5 shadow-2xs"
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                {daySessions.length > 1 && (
                  <span className="shrink-0 whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                    Ca {sessionNumber}
                  </span>
                )}
                <span
                  title={`Ca ${sessionNumber} (CSKH): ${cfg?.label || 'Chưa điểm danh'}`}
                  className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                    cfg
                      ? `${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`
                      : 'border-border/60 bg-slate-100/80 text-text-muted'
                  }`}
                >
                  <span>{cfg ? `${cfg.short} · ${cfg.label}` : '— · Chưa chấm'}</span>
                </span>
              </div>

              {att?.cs_note && (
                <div className="max-w-[220px] border-t border-border/50 pt-1 text-[11px] leading-snug">
                  <div className="truncate italic text-text-secondary" title={`Ghi chú CSKH: ${att.cs_note}`}>
                    <span className="not-italic font-semibold text-indigo-700">Ghi chú:</span> "{att.cs_note}"
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Ô chỉ đọc: Điểm danh chốt / Trạng thái đối chiếu cuối (xếp dọc đồng bộ theo từng Ca 1..Ca N).
  // Khi chưa có kết quả chốt (att.status trống): chỉ hiện "—" + dòng note trạng thái bên dưới.
  const renderFinalStatusCell = (st: StudentRow, dateStr: string) => {
    if (st.enrollment_class_id <= 0) {
      return <span className="whitespace-nowrap rounded bg-slate-100/80 px-2 py-0.5 text-[10px] italic text-text-muted">Chưa xếp lớp</span>;
    }
    const daySessions = getSessionsForCell(st.enrollment_class_id, dateStr);
    if (daySessions.length === 0) {
      return (
        <div className="flex flex-col items-start gap-0.5 py-0.5 whitespace-nowrap">
          <span className="inline-flex h-6 min-w-8 items-center justify-center whitespace-nowrap rounded-md border border-border/60 bg-slate-100/80 px-2 text-xs font-extrabold text-text-muted">
            —
          </span>
          <span className="pl-0.5 whitespace-nowrap text-[10px] italic text-text-muted">
            Chưa bên nào chấm
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-start gap-1.5 py-0.5">
        {daySessions.map((session, index) => {
          const sessionNumber = index + 1;
          const att = rawAttendanceMap.get(`${st.enrollment_class_id}_session_${session.id}`);
          const finalSt = getFinalizedStatus(att);
          const cfg = finalSt ? STATUS_CONFIG[finalSt] : null;

          // Đã có kết quả chốt (tự khớp hoặc Admin phân xử)
          if (cfg) {
            const isResolvedByAdmin = att?.reconciliation_state === 'RESOLVED';
            return (
              <div key={session.id} className="flex min-h-7 flex-nowrap items-center gap-1 whitespace-nowrap">
                <span
                  title={
                    `Ca ${sessionNumber} (${isResolvedByAdmin ? 'Đã phân xử' : 'Đã khớp'}): ${cfg.label}` +
                    (att?.resolution_note ? ` — Lý do: ${att.resolution_note}` : '')
                  }
                  className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-extrabold ${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`}
                >
                  {daySessions.length > 1 && <span className="opacity-75">Ca {sessionNumber}:</span>}
                  <span>{cfg.short} · {cfg.label}</span>
                </span>
                <span
                  className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    isResolvedByAdmin
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isResolvedByAdmin ? 'Đã phân xử' : 'Đã khớp'}
                </span>
              </div>
            );
          }

          // Chưa chốt: chỉ hiện "—" + dòng note bên dưới báo lý do
          const tStatus = att?.teacher_status as AttendanceStatus | null | undefined;
          const csStatus = att?.cs_status as AttendanceStatus | null | undefined;
          let noteNode: React.ReactNode;
          if (!tStatus && !csStatus) {
            noteNode = (
              <span className="whitespace-nowrap text-[10px] italic text-text-muted">
                Chưa bên nào chấm
              </span>
            );
          } else if (tStatus && csStatus && tStatus !== csStatus) {
            noteNode = (
              <span className="whitespace-nowrap text-[10px] font-semibold text-rose-600">
                Lệch (GV: {STATUS_CONFIG[tStatus].short} · CSKH: {STATUS_CONFIG[csStatus].short}) — chờ chốt
              </span>
            );
          } else if (tStatus && !csStatus) {
            noteNode = (
              <span className="whitespace-nowrap text-[10px] font-semibold text-amber-600">
                Chờ CSKH chấm (GV: {STATUS_CONFIG[tStatus].short})
              </span>
            );
          } else {
            noteNode = (
              <span className="whitespace-nowrap text-[10px] font-semibold text-amber-600">
                Chờ GV chấm (CSKH: {STATUS_CONFIG[(csStatus ?? 'ATTENDED') as AttendanceStatus].short})
              </span>
            );
          }

          return (
            <div key={session.id} className="flex flex-col items-start gap-0.5 whitespace-nowrap">
              <span
                title={`Ca ${sessionNumber}: Chưa có điểm danh chốt`}
                className="inline-flex h-6 min-w-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-border/60 bg-slate-100/80 px-2 text-xs font-extrabold text-text-muted"
              >
                {daySessions.length > 1 ? `Ca ${sessionNumber}: —` : '—'}
              </span>
              <div className="pl-0.5 whitespace-nowrap">{noteNode}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
      {/* Unified Table Toolbar for all tabs */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border/80 bg-slate-50/60 p-3 sm:px-4 text-xs">
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

              {/* CSKH: 1 chạm khớp toàn bộ ca GV đã chấm trong ngày */}
              {activeSide === 'CS' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMatchTeacherForDay}
                  disabled={bulkSaving || pendingMatchTeacherCount === 0}
                  className="h-10 whitespace-nowrap px-3 text-xs font-bold border-blue-300 text-blue-700 hover:bg-blue-50"
                  leftIcon={<Check className="h-3.5 w-3.5" />}
                  title="Sao chép điểm danh GV sang cột CSKH cho mọi ca GV đã chấm mà CSKH chưa chấm"
                >
                  Khớp theo GV ({pendingMatchTeacherCount})
                </Button>
              )}
            </>
          )}

          {activeTab === 'detailed' && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Bộ chọn kiểu xem Tab 2: Bảng tháng | Nhật ký bài học */}
              <div
                className="inline-flex h-9 items-center p-1 bg-slate-100 rounded-xl border border-slate-200/90 gap-1 text-xs font-semibold"
                role="tablist"
                aria-label="Chọn kiểu hiển thị Lịch sử & Bảng tháng"
              >
                <button
                  type="button"
                  onClick={() => setDetailedViewMode('matrix')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    detailedViewMode === 'matrix'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  Bảng tháng
                </button>
                <button
                  type="button"
                  onClick={() => setDetailedViewMode('log')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    detailedViewMode === 'log'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  Nhật ký bài học
                </button>
              </div>

              {/* Filter Mode: Theo tuần | Theo tháng */}
              <div
                className="inline-flex h-9 items-center p-1 bg-slate-100 rounded-xl border border-slate-200/90 gap-1 text-xs font-semibold"
                role="tablist"
                aria-label="Chọn phạm vi kỳ hiển thị"
              >
                <button
                  type="button"
                  onClick={() => setFilterMode('week')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    filterMode === 'week'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  Theo tuần
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('month')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    filterMode === 'month'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  Theo tháng
                </button>
              </div>

              {/* Bộ điều hướng kỳ (cho phép bấm chọn ngày/tháng trực tiếp) */}
              <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-border/60">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                  title="Kỳ trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <label className="relative inline-flex cursor-pointer items-center px-2.5 text-xs font-bold text-text-primary select-none hover:text-primary transition-colors" title="Bấm để chọn kỳ">
                  <span>{viewTitle}</span>
                  <input
                    type={filterMode === 'week' ? 'date' : 'month'}
                    value={
                      filterMode === 'week'
                        ? toLocalDateString(currentDate)
                        : `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
                    }
                    onChange={(e) => {
                      if (!e.target.value) return;
                      if (filterMode === 'week') {
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        if (y && m && d) setCurrentDate(new Date(y, m - 1, d));
                      } else {
                        const [y, m] = e.target.value.split('-').map(Number);
                        if (y && m) setCurrentDate(new Date(y, m - 1, 1));
                      }
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Chọn kỳ xem lịch sử"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleNext}
                  className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                  title="Kỳ sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
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
              <label className="relative inline-flex cursor-pointer items-center px-2.5 text-xs font-bold text-text-primary select-none hover:text-primary transition-colors" title="Bấm để chọn tháng thống kê">
                <span>
                  Tháng {currentDate.getMonth() + 1} / {currentDate.getFullYear()}
                </span>
                <input
                  type="month"
                  value={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [y, m] = e.target.value.split('-').map(Number);
                    if (y && m) setCurrentDate(new Date(y, m - 1, 1));
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Chọn tháng thống kê"
                />
              </label>
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
          )}
        </div>
      </div>

      {/* Unified Bulk Action Bar for Tab 1 (quick) & Tab 2 (detailed) */}
      {selectedStudents.size > 0 && (activeTab === 'quick' || activeTab === 'detailed') && (
        <div className="flex flex-col gap-2.5 border-b border-primary/20 bg-primary-soft/70 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Cụm 1: Thông tin chọn & Ca/Ngày áp dụng */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 font-extrabold text-white">
                {selectedStudents.size}
              </span>
              <span className="font-bold text-text-primary">học viên đã chọn</span>
              <button
                type="button"
                onClick={() => setSelectedStudents(new Set())}
                className="rounded-md border border-border/80 bg-surface px-2 py-1 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"
                title="Bỏ chọn tất cả học viên"
              >
                Bỏ chọn
              </button>

              {activeTab === 'detailed' && (
                <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-2 font-bold text-text-secondary">
                  <span>Ngày:</span>
                  <input
                    type="date"
                    value={bulkTargetDate}
                    onChange={(e) => e.target.value && setBulkDate(e.target.value)}
                    className="bg-transparent text-xs font-bold text-primary outline-none"
                    aria-label="Chọn ngày áp dụng điểm danh hàng loạt"
                  />
                </label>
              )}

              <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-2 font-bold text-text-secondary">
                <span>Ca</span>
                <select
                  id="bulk-session-selector"
                  value={bulkSessionIndex}
                  onChange={(event) => setBulkSessionIndex(Number(event.target.value))}
                  className="bg-transparent text-primary outline-none"
                  aria-label="Chọn ca để điểm danh hàng loạt"
                >
                  {Array.from(
                    {
                      length:
                        Math.max(
                          1,
                          ...Array.from(selectedStudents).map(
                            (ecId) => getSessionsForCell(ecId, bulkTargetDate).length
                          )
                        ) + 1,
                    },
                    (_, index) => (
                      <option key={index} value={index}>
                        Ca {index + 1}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>

            {/* Cụm 2: Chấm điểm danh hàng loạt 6 trạng thái & Xóa chấm */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleBulkApplyAttended}
                disabled={bulkSaving}
                aria-label={`Đánh dấu có mặt cho ${selectedStudents.size} học viên`}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> 1 Có mặt
              </button>
              {(
                [
                  'ABSENT_APPROVED_A',
                  'LEAVE_B',
                  'ABSENT_UNAPPROVED_C',
                  'TEACHER_ABSENT_D',
                  'TECH_ERROR_E',
                ] as AttendanceStatus[]
              ).map((status) => (
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
                aria-label={`Xóa chấm Ca ${bulkSessionIndex + 1} cho ${selectedStudents.size} học viên`}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 font-bold text-text-secondary transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                title={`Xóa chấm Ca ${bulkSessionIndex + 1} của vai trò đang đăng nhập`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Xóa chấm Ca {bulkSessionIndex + 1}</span>
              </button>

              {/* Cụm 3: Đối soát nhanh theo dòng đã chọn (CSKH & Admin/Manage) */}
              {(activeSide === 'CS' || activeSide === 'ADMIN') && (
                <button
                  type="button"
                  onClick={handleBulkMatchSelectedRows}
                  disabled={bulkSaving || bulkMatchableCount === 0}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-2.5 font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Sao chép / chốt điểm danh theo trạng thái GV đã chấm cho các dòng đang chọn"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Khớp theo GV ({bulkMatchableCount})</span>
                </button>
              )}

              {/* Cụm 5: Quản lý lớp nhanh khi chọn đúng 1 lớp (Admin/Manage) */}
              {showClassManageActions && selectedUniqueClassIds.length === 1 && (
                <div className="flex items-center gap-1.5 pl-1 border-l border-primary/20">
                  {onAssignTeacherForClass && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAssignTeacherForClass(selectedUniqueClassIds[0])}
                      leftIcon={<UserRoundCheck className="w-3.5 h-3.5" />}
                      className="h-8 px-2.5 text-xs font-bold text-teal-700 border-teal-300 bg-white hover:bg-teal-50"
                    >
                      Phân công GV
                    </Button>
                  )}
                  {onEditClassById && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEditClassById(selectedUniqueClassIds[0])}
                      leftIcon={<Edit className="w-3.5 h-3.5" />}
                      className="h-8 px-2.5 text-xs font-bold bg-white"
                    >
                      Sửa lớp
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cụm 4: Ghi Bài học / Ghi chú hàng loạt theo đúng Role */}
          {activeSide === 'TEACHER' && (
            <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-primary/15">
              <input
                type="text"
                value={bulkLessonTopic}
                onChange={(e) => setBulkLessonTopic(e.target.value)}
                placeholder="Bài học chung..."
                className="h-8 min-w-[180px] flex-1 max-w-xs rounded-lg border border-indigo-300/80 bg-white px-2.5 text-xs font-semibold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <input
                type="text"
                value={bulkTeacherNote}
                onChange={(e) => setBulkTeacherNote(e.target.value)}
                placeholder="Ghi chú GV chung..."
                className="h-8 min-w-[180px] flex-1 max-w-xs rounded-lg border border-border/80 bg-white px-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkApplyTeacherLessonAndNote}
                disabled={bulkSaving || (!bulkLessonTopic.trim() && !bulkTeacherNote.trim())}
                className="h-8 px-3 text-xs font-bold"
              >
                Áp dụng bài học/ghi chú
              </Button>
            </div>
          )}

          {activeSide === 'CS' && (
            <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-primary/15">
              <input
                type="text"
                value={bulkCsNote}
                onChange={(e) => setBulkCsNote(e.target.value)}
                placeholder="Ghi chú CSKH chung..."
                className="h-8 min-w-[220px] flex-1 max-w-sm rounded-lg border border-border/80 bg-white px-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkApplyCsNote}
                disabled={bulkSaving || !bulkCsNote.trim()}
                className="h-8 px-3 text-xs font-bold"
              >
                Áp dụng ghi chú CSKH
              </Button>
            </div>
          )}
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

                {/* Cột điểm danh ngày hiện tại (hoặc quickDate) đồng bộ theo Role */}
                {(() => {
                  const [y, m, day] = quickDate.split('-').map(Number);
                  const d = new Date(y, m - 1, day);
                  const dateFormatted = `${d.getDate() < 10 ? `0${d.getDate()}` : d.getDate()}/${
                    d.getMonth() + 1 < 10 ? `0${d.getMonth() + 1}` : d.getMonth() + 1
                  }/${d.getFullYear()}`;
                  const dayOfWeek = DAY_OF_WEEK_NAMES[d.getDay()];

                  if (isTeacherOnly) {
                    return (
                      <>
                        <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[240px] bg-teal-50/70 text-teal-950">
                          <div className="text-[12px] font-extrabold text-teal-950 whitespace-nowrap">
                            Điểm danh
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-teal-700 flex items-center gap-1 whitespace-nowrap">
                            <CalendarDays className="w-3 h-3 shrink-0" />
                            <span>{dayOfWeek} {dateFormatted}</span>
                          </div>
                        </th>
                        <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[175px] bg-indigo-50/50 text-indigo-950">
                          <div className="text-[12px] font-extrabold text-indigo-950 whitespace-nowrap">
                            Bài học
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-indigo-700 flex items-center gap-1 whitespace-nowrap">
                            <CalendarDays className="w-3 h-3 shrink-0" />
                            <span>{dayOfWeek} {dateFormatted}</span>
                          </div>
                        </th>
                        <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[190px] bg-indigo-50/50 text-indigo-950">
                          <div className="text-[12px] font-extrabold text-indigo-950 whitespace-nowrap">
                            Ghi chú GV
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-indigo-700 flex items-center gap-1 whitespace-nowrap">
                            <CalendarDays className="w-3 h-3 shrink-0" />
                            <span>{dayOfWeek} {dateFormatted}</span>
                          </div>
                        </th>
                      </>
                    );
                  }

                  return (
                    <>
                      <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[180px] bg-slate-100/90 text-text-secondary">
                        <div className="text-[12px] font-extrabold text-text-primary whitespace-nowrap">
                          Điểm danh GV &amp; Bài học
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold text-text-muted flex items-center gap-1 whitespace-nowrap">
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          <span>{dayOfWeek} {dateFormatted}</span>
                        </div>
                      </th>
                      <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[175px] bg-blue-50/90 text-primary border-primary/40">
                        <div className="text-[12px] font-extrabold text-primary whitespace-nowrap">
                          {isCSOnly ? 'Điểm danh CSKH' : 'Điểm danh & Ghi chú CSKH'}
                        </div>
                        <div className="mt-0.5 text-[10px] font-bold text-primary/80 flex items-center gap-1 whitespace-nowrap">
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          <span>{dayOfWeek} {dateFormatted}</span>
                        </div>
                      </th>
                      {isCSOnly && (
                        <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[170px] bg-indigo-50/70 text-indigo-900">
                          <div className="text-[12px] font-extrabold text-indigo-900 whitespace-nowrap">
                            Ghi chú CSKH
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-indigo-700 flex items-center gap-1 whitespace-nowrap">
                            <CalendarDays className="w-3 h-3 shrink-0" />
                            <span>{dayOfWeek} {dateFormatted}</span>
                          </div>
                        </th>
                      )}
                      <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[180px] bg-emerald-50/70 text-emerald-900">
                        <div className="text-[12px] font-extrabold text-emerald-900 whitespace-nowrap">
                          {isAdminOrManage ? 'Điểm danh (Chốt)' : 'Điểm danh chốt'}
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold text-emerald-700 flex items-center gap-1 whitespace-nowrap">
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          <span>{dayOfWeek} {dateFormatted}</span>
                        </div>
                      </th>
                    </>
                  );
                })()}
                {showClassManageActions && (
                  <th className="px-3 py-3 text-right whitespace-nowrap min-w-[110px]">
                    Thao tác
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {quickVisibleStudents.length === 0 ? (
                <tr>
                  <td colSpan={(isCSOnly ? 15 : 14) + (showClassManageActions ? 1 : 0)} className="text-center py-10 text-text-muted">
                    {onlyStudentsWithDaySchedule
                      ? 'Không có học viên nào có lịch hoặc ca học trong ngày này.'
                      : 'Không có học viên nào để điểm danh.'}
                  </td>
                </tr>
              ) : (
                quickVisibleStudents
                  .slice((page - 1) * pageSize, page * pageSize)
                  .map((st, idx) => {
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
                        {(page - 1) * pageSize + idx + 1}
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
                      <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-text-secondary whitespace-nowrap">
                        {st.package_name || '—'}
                      </td>
                      )}

                      {/* Cột D: Nội dung khoá */}
                      {isColVisible('course_content') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        {st.course_content || '—'}
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
                      <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-teal-800 whitespace-nowrap">
                        {st.level || '—'}
                      </td>
                      )}

                      {/* Cột G: Email */}
                      {isColVisible('email') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.email || '—'}
                      </td>
                      )}

                      {/* Cột H: Mô hình */}
                      {isColVisible('model_type') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                        {(() => {
                          const mNorm = formatClassModel(st.model_type);
                          const mStyle = CLASS_MODEL_BADGE_STYLES[mNorm];
                          return (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${mStyle.className}`}
                            >
                              {mStyle.label}
                            </span>
                          );
                        })()}
                      </td>
                      )}

                      {/* Cột K: Trạng thái */}
                      {isColVisible('status') && (
                      <td className="px-3 py-2.5 border-r-2 border-border/80 whitespace-nowrap">
                        {(() => {
                          const sCfg =
                            ENROLLMENT_STATUS_BADGE_MAP[st.status] ||
                            ENROLLMENT_STATUS_BADGE_MAP.STUDYING;
                          return (
                            <Badge variant={sCfg.variant} size="sm">
                              {sCfg.label}
                            </Badge>
                          );
                        })()}
                      </td>
                      )}

                      {isTeacherOnly ? (
                        <>
                          {/* Cột 1 (GV): Điểm danh */}
                          <td className="px-2.5 py-2 border-r border-border/60 align-middle bg-teal-50/20 whitespace-nowrap">
                            {renderQuickInlineStatusStack(
                              st,
                              quickDate,
                              (att) => att?.teacher_status as AttendanceStatus | undefined,
                              'mark'
                            )}
                          </td>
                          {/* Cột 2 (GV): Bài học */}
                          <td className="px-2.5 py-2 border-r border-border/60 align-middle bg-indigo-50/15 whitespace-nowrap">
                            {renderQuickTeacherFieldStack(st, quickDate, 'lesson_topic')}
                          </td>
                          {/* Cột 3 (GV): Ghi chú GV */}
                          <td className="px-2.5 py-2 border-r border-border/60 align-middle bg-indigo-50/15 whitespace-nowrap">
                            {renderQuickTeacherFieldStack(st, quickDate, 'teacher_note')}
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Cột 1: Điểm danh GV & Bài học */}
                          <td className="px-2.5 py-2 border-r border-border/60 align-middle bg-slate-50/40 whitespace-nowrap">
                            {renderQuickTeacherStackCell(st, quickDate)}
                          </td>

                          {/* Cột 2: Điểm danh CSKH (với Admin gộp luôn Ghi chú CSKH vào cụm box) */}
                          <td className="px-2.5 py-2 border-r border-border/60 align-middle bg-blue-50/20 whitespace-nowrap">
                            {isCSOnly
                              ? renderQuickInlineStatusStack(
                                  st,
                                  quickDate,
                                  (att) => att?.cs_status as AttendanceStatus | undefined,
                                  'mark'
                                )
                              : renderCSReadonlyCell(st, quickDate)}
                          </td>

                          {/* Cột 3: Ghi chú CSKH (chỉ hiển thị cột riêng khi đăng nhập vai trò CSKH) */}
                          {isCSOnly && (
                            <td className="px-2.5 py-2 border-r border-border/60 align-middle bg-indigo-50/15 whitespace-nowrap">
                              {renderQuickCsNoteStack(st, quickDate)}
                            </td>
                          )}

                          {/* Cột 4: Điểm danh Chốt / Trạng thái cuối */}
                          <td className="px-2.5 py-2 border-r border-border/60 align-middle bg-emerald-50/20 whitespace-nowrap">
                            {isAdminOrManage
                              ? renderQuickInlineStatusStack(
                                  st,
                                  quickDate,
                                  (att) => getFinalizedStatus(att),
                                  'admin-final'
                                )
                              : renderFinalStatusCell(st, quickDate)}
                          </td>
                        </>
                      )}

                      {showClassManageActions && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {st.class_id && st.class_id > 0 ? (
                            <div className="flex justify-end gap-1">
                              {onAssignTeacherForClass && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onAssignTeacherForClass(st.class_id!)}
                                  leftIcon={<UserRoundCheck className="w-3.5 h-3.5" />}
                                  title="Quản lý phân công giáo viên"
                                  className="h-7 px-2 text-[11px] text-teal-700 border-teal-200 hover:bg-teal-50"
                                >
                                  Phân công GV
                                </Button>
                              )}
                              {onEditClassById && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onEditClassById(st.class_id!)}
                                  leftIcon={<Edit className="w-3.5 h-3.5 text-slate-500 hover:text-blue-600" />}
                                  title="Chỉnh sửa thông tin lớp học"
                                  className="h-7 px-1.5"
                                />
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-text-muted">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CHI TIẾT MA TRẬN THEO THÁNG HOẶC NHẬT KÝ BUỔI HỌC                  */}
      {/* ========================================================================= */}
      {activeTab === 'detailed' && detailedViewMode === 'log' && (
        <div className="w-full overflow-x-auto select-none">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap w-28">Ngày học</th>
                <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap w-16">Ca</th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[160px]">Học viên</th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[130px]">Lớp học</th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[120px]">Giáo viên</th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[115px]">Điểm danh GV</th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[115px]">Điểm danh CSKH</th>
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[120px]">Trạng thái chốt</th>
                <th className="px-3 py-3 border-r border-border/60 min-w-[200px]">Bài học &amp; Ghi chú GV</th>
                <th className="px-3 py-3 border-r border-border/60 min-w-[180px]">Ghi chú CSKH</th>
                <th className="px-3 py-3 text-center whitespace-nowrap w-24">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {periodSessionLogs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-text-muted">
                    Chưa có buổi học nào phát sinh trong kỳ {viewTitle}.
                  </td>
                </tr>
              ) : (
                periodSessionLogs
                  .slice((page - 1) * pageSize, page * pageSize)
                  .map((row, idx) => {
                  const { student: st, dateStr, caNumber, att } = row;
                  const classified = classifySessionAttendance(att);
                  const tCfg = classified.teacherStatus ? STATUS_CONFIG[classified.teacherStatus] : null;
                  const csCfg = classified.csStatus ? STATUS_CONFIG[classified.csStatus] : null;
                  const finalCfg = classified.finalStatus ? STATUS_CONFIG[classified.finalStatus] : null;
                  const dObj = new Date(`${dateStr}T00:00:00`);
                  return (
                    <tr
                      key={row.key}
                      className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                        idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                      }`}
                    >
                      <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap font-bold text-text-primary">
                        <span>{DAY_OF_WEEK_NAMES[dObj.getDay()]}</span>{' '}
                        <span>{dObj.toLocaleDateString('vi-VN')}</span>
                      </td>
                      <td className="px-2.5 py-2.5 border-r border-border/60 text-center whitespace-nowrap font-bold text-slate-700">
                        Ca {caNumber}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap">
                        <div className="font-bold text-text-primary">{st.full_name}</div>
                        <div className="font-mono text-[10px] text-text-muted">{st.external_id || `HV_${st.student_id}`}</div>
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap font-semibold text-text-primary">
                        {st.class_name}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap text-text-secondary">
                        {st.teacher_name || '—'}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                        {tCfg ? (
                          <span className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-extrabold ${tCfg.bg.replace(/\s*hover:\S+/g, '')} ${tCfg.text} ${tCfg.border}`}>
                            {tCfg.short} · {tCfg.label}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                        {csCfg ? (
                          <span className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-extrabold ${csCfg.bg.replace(/\s*hover:\S+/g, '')} ${csCfg.text} ${csCfg.border}`}>
                            {csCfg.short} · {csCfg.label}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                        {classified.category === 'ADMIN_RESOLVED' && finalCfg ? (
                          <span className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-extrabold ring-1 ring-violet-500/70 ${finalCfg.bg.replace(/\s*hover:\S+/g, '')} ${finalCfg.text} ${finalCfg.border}`}>
                            ✓ {finalCfg.short} · Admin đã chốt
                          </span>
                        ) : classified.category === 'CONFLICT' ? (
                          <span className="inline-flex h-6 items-center rounded-md border-2 border-rose-500 bg-rose-50 px-2 text-[10px] font-extrabold text-rose-800">
                            Lệch (GV: {tCfg?.short || '?'} ≠ CSKH: {csCfg?.short || '?'})
                          </span>
                        ) : classified.category === 'MATCHED' && finalCfg ? (
                          <span className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-extrabold ${finalCfg.bg.replace(/\s*hover:\S+/g, '')} ${finalCfg.text} ${finalCfg.border}`}>
                            {finalCfg.short} · Đã khớp
                          </span>
                        ) : classified.category === 'PENDING_ONE_SIDE' ? (
                          <span className="inline-flex h-6 items-center rounded-md border border-dashed border-amber-400 bg-amber-50 px-2 text-[10px] font-bold text-amber-800">
                            {classified.provisionalSide === 'GV'
                              ? `Mới GV chấm (${tCfg?.short}) · Chờ CSKH`
                              : `Mới CSKH chấm (${csCfg?.short}) · Chờ GV`}
                          </span>
                        ) : (
                          <span className="inline-flex h-6 items-center rounded-md border border-dashed border-slate-400 bg-slate-50 px-2 text-[10px] font-bold text-slate-600">
                            ? · Đã mở ca, chưa chấm
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60">
                        {att?.lesson_topic || att?.teacher_note ? (
                          <div className="space-y-0.5">
                            {att.lesson_topic && (
                              <div className="font-semibold text-teal-800">{att.lesson_topic}</div>
                            )}
                            {att.teacher_note && (
                              <div className="italic text-text-secondary">"{att.teacher_note}"</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/60">
                        {att?.cs_note ? (
                          <span className="italic text-text-secondary">"{att.cs_note}"</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openDrawer(st, dateStr, caNumber, false)}
                          className="inline-flex h-7 items-center rounded-lg border border-border bg-white px-2.5 text-xs font-bold text-primary transition hover:border-primary hover:bg-primary-soft"
                        >
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'detailed' && detailedViewMode === 'matrix' && (
        <div>
          <AttendanceMatrixLegendBar
            activeFilter={matrixCellFilter}
            onFilterChange={(f) => {
              setMatrixCellFilter(f);
              setPage(1);
            }}
            counts={matrixLegendStats.counts}
          />
          <div className="w-full overflow-x-auto select-none">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                {/* Checkbox */}
                <th className="px-2 py-3 border-r border-border/60 sticky left-0 bg-slate-100 z-20 w-10 min-w-[40px] text-center">
                  <input
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleToggleSelectAllStudents}
                    disabled={validVisibleStudentIds.length === 0}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                    title="Chọn hoặc bỏ chọn tất cả học viên đang hiển thị"
                    aria-label="Chọn hoặc bỏ chọn tất cả học viên đang hiển thị"
                  />
                </th>
                {/* Sticky 3 Cột định danh nhận diện */}
                <th className="px-2 py-3 border-r border-border/60 sticky left-10 bg-slate-100 z-20 w-10 min-w-[40px] text-center">
                  #
                </th>
                {isColVisible('external_id') && (
                <th className="px-3 py-3 border-r border-border/60 sticky left-[80px] bg-slate-100 z-20 whitespace-nowrap w-[110px] min-w-[110px] max-w-[110px] overflow-hidden">
                  ID
                </th>
                )}
                {isColVisible('full_name') && (
                <th className={`px-4 py-3 border-r-2 border-border/80 bg-slate-100 z-20 whitespace-nowrap w-[180px] min-w-[180px] max-w-[180px] overflow-hidden shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] sticky ${isColVisible('external_id') ? 'left-[190px]' : 'left-[80px]'}`}>
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
                  Giờ học
                </th>
                )}
                {isColVisible('schedule_pattern') && (
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[75px]">
                  Lịch học
                </th>
                )}
                {isColVisible('duration_minutes') && (
                <th className="px-3 py-3 border-r-2 border-border/80 text-center whitespace-nowrap min-w-[80px]">
                  Thời lượng
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
                <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[95px] bg-emerald-50 text-emerald-900 font-extrabold">
                  Tổng đã học
                </th>
                <th className="px-3 py-3 border-r-2 border-border/80 text-center whitespace-nowrap min-w-[105px] bg-emerald-100/70 text-emerald-950 font-extrabold">
                  <div className="text-[10px] text-emerald-800 uppercase font-semibold">Tháng {currentDate.getMonth() + 1}</div>
                  <div>Trong tháng</div>
                </th>

                {/* Các Cột Lịch Ngày theo Tháng */}
                {visibleDatesList.map((d) => {
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
                {showClassManageActions && (
                  <th className="px-3 py-3 text-right whitespace-nowrap min-w-[110px]">
                    Thao tác
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {matrixFilteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={22 + visibleDatesList.length + (showClassManageActions ? 1 : 0)} className="text-center py-10 text-text-muted">
                    {matrixCellFilter === 'ALL'
                      ? 'Không có học viên nào để điểm danh.'
                      : 'Không có học viên nào có ca học khớp bộ lọc trạng thái đã chọn trong kỳ này.'}
                  </td>
                </tr>
              ) : (
                matrixFilteredStudents
                  .slice((page - 1) * pageSize, page * pageSize)
                  .map((st, idx) => {
                  const stat = studentStats.get(st.enrollment_class_id);
                  const prevAttended = st.attended_previous_years || 0;
                  const currentAttended = stat?.totalAttended || 0;
                  const remaining =
                    st.total_sessions
                      ? st.total_sessions - prevAttended - currentAttended
                      : ((st.remaining_sessions ?? 0) - currentAttended);
                  const isNegativeDebt = remaining < 0;
                  const isSelected = selectedStudents.has(st.enrollment_class_id);

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
                        {(page - 1) * pageSize + idx + 1}
                      </td>

                      {/* Mã HV (A) */}
                      {isColVisible('external_id') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-mono font-bold text-text-primary whitespace-nowrap sticky left-[80px] bg-slate-100 z-10 w-[110px] min-w-[110px] max-w-[110px] overflow-hidden">
                        {st.external_id || `HV_${st.student_id}`}
                      </td>
                      )}

                      {/* Họ và tên (B) */}
                      {isColVisible('full_name') && (
                      <td className={`px-4 py-2.5 border-r-2 border-border/80 font-bold text-text-primary whitespace-nowrap bg-slate-100 z-10 w-[180px] min-w-[180px] max-w-[180px] overflow-hidden shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] sticky ${isColVisible('external_id') ? 'left-[190px]' : 'left-[80px]'}`}>
                        {st.full_name}
                      </td>
                      )}

                      {/* Cột C -> O */}
                      {isColVisible('package_name') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-text-secondary whitespace-nowrap">
                        {st.package_name || '—'}
                      </td>
                      )}
                      {isColVisible('course_content') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                        {st.course_content || '—'}
                      </td>
                      )}
                      {isColVisible('total_sessions') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-center font-bold text-text-primary">
                        {st.total_sessions || 0}
                      </td>
                      )}
                      {isColVisible('level') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-teal-800 whitespace-nowrap">
                        {st.level || '—'}
                      </td>
                      )}
                      {isColVisible('email') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.email || '—'}
                      </td>
                      )}
                      {isColVisible('model_type') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                        {(() => {
                          const mNorm = formatClassModel(st.model_type);
                          const mStyle = CLASS_MODEL_BADGE_STYLES[mNorm];
                          return (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${mStyle.className}`}
                            >
                              {mStyle.label}
                            </span>
                          );
                        })()}
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
                        {st.start_date ? new Date(st.start_date).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      )}
                      {isColVisible('status') && (
                      <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap">
                        {(() => {
                          const sCfg =
                            ENROLLMENT_STATUS_BADGE_MAP[st.status] ||
                            ENROLLMENT_STATUS_BADGE_MAP.STUDYING;
                          return (
                            <Badge variant={sCfg.variant} size="sm">
                              {sCfg.label}
                            </Badge>
                          );
                        })()}
                      </td>
                      )}
                      {isColVisible('end_date') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                        {st.end_date ? new Date(st.end_date).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      )}
                      {isColVisible('start_time') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-mono text-text-secondary whitespace-nowrap">
                        {formatScheduleTimeDisplay(st.start_time) || '—'}
                      </td>
                      )}
                      {isColVisible('schedule_pattern') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-blue-700 whitespace-nowrap">
                        {st.schedule_pattern || '—'}
                      </td>
                      )}
                      {isColVisible('duration_minutes') && (
                      <td className="px-3 py-2.5 border-r-2 border-border/80 text-center text-text-muted whitespace-nowrap">
                        {st.duration_minutes ? `${st.duration_minutes}p` : '—'}
                      </td>
                      )}

                      {/* Cột U -> X: GV, Lớp & Đã học */}
                      {isColVisible('teacher_name') && (
                      <td className="px-3 py-2.5 border-r border-border/60 text-text-primary font-semibold whitespace-nowrap">
                        {st.teacher_name || '—'}
                      </td>
                      )}
                      {isColVisible('teacher_code') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-mono text-text-muted whitespace-nowrap">
                        {st.teacher_code || '—'}
                      </td>
                      )}
                      {isColVisible('class_name') && (
                      <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-text-primary whitespace-nowrap">
                        {st.class_name || '—'}
                      </td>
                      )}
                      <td className="px-3 py-2.5 border-r border-border/60 text-center font-extrabold text-emerald-800 bg-emerald-50/40">
                        {prevAttended + currentAttended}
                      </td>
                      <td className="px-2 py-2.5 border-r-2 border-border/80 text-center font-extrabold text-emerald-800 bg-emerald-100/30">
                        {stat?.monthAttended || 0}
                      </td>

                      {/* Các Cột Lịch Ngày theo Tháng */}
                      {visibleDatesList.map((d) => {
                        const dateStr = toDateString(d);
                        return (
                          <td
                            key={dateStr}
                            className="px-1 py-1 border-r border-border/60 text-center"
                          >
                            {renderMatrixDateCell(st, dateStr)}
                          </td>
                        );
                      })}
                      {showClassManageActions && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {st.class_id && st.class_id > 0 ? (
                            <div className="flex justify-end gap-1">
                              {onAssignTeacherForClass && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onAssignTeacherForClass(st.class_id!)}
                                  leftIcon={<UserRoundCheck className="w-3.5 h-3.5" />}
                                  title="Quản lý phân công giáo viên"
                                  className="h-7 px-2 text-[11px] text-teal-700 border-teal-200 hover:bg-teal-50"
                                >
                                  Phân công GV
                                </Button>
                              )}
                              {onEditClassById && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onEditClassById(st.class_id!)}
                                  leftIcon={<Edit className="w-3.5 h-3.5 text-slate-500 hover:text-blue-600" />}
                                  title="Chỉnh sửa thông tin lớp học"
                                  className="h-7 px-1.5"
                                />
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-text-muted">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
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
                  <th className="px-3 py-3 border-r border-border/60 sticky left-10 bg-slate-100 z-20 whitespace-nowrap w-[110px] min-w-[110px] max-w-[110px] overflow-hidden">
                    ID
                  </th>
                  )}
                  {isColVisible('full_name') && (
                  <th className={`px-4 py-3 border-r-2 border-border/80 bg-slate-100 z-20 whitespace-nowrap w-[180px] min-w-[180px] max-w-[180px] overflow-hidden shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] sticky ${isColVisible('external_id') ? 'left-[150px]' : 'left-10'}`}>
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
                  students
                    .slice((page - 1) * pageSize, page * pageSize)
                    .map((st, idx) => {
                    const stat = studentStats.get(st.enrollment_class_id);

                    return (
                      <tr
                        key={st.enrollment_class_id}
                        className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                          idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                        }`}
                      >
                        <td className="px-2 py-2.5 border-r border-border/60 text-center text-text-muted font-bold sticky left-0 bg-slate-100 z-10">
                          {(page - 1) * pageSize + idx + 1}
                        </td>
                        {isColVisible('external_id') && (
                        <td className="px-3 py-2.5 border-r border-border/60 font-mono font-bold text-text-primary whitespace-nowrap sticky left-10 bg-slate-100 z-10 w-[110px] min-w-[110px] max-w-[110px] overflow-hidden">
                          {st.external_id || `HV_${st.student_id}`}
                        </td>
                        )}
                        {isColVisible('full_name') && (
                        <td className={`px-4 py-2.5 border-r-2 border-border/80 font-bold text-text-primary whitespace-nowrap bg-slate-100 z-10 w-[180px] min-w-[180px] max-w-[180px] overflow-hidden shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] sticky ${isColVisible('external_id') ? 'left-[150px]' : 'left-10'}`}>
                          {st.full_name}
                        </td>
                        )}
                        {isColVisible('package_name') && (
                        <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-text-secondary whitespace-nowrap">
                          {st.package_name || '—'}
                        </td>
                        )}
                        {isColVisible('course_content') && (
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-secondary whitespace-nowrap">
                          {st.course_content || '—'}
                        </td>
                        )}
                        {isColVisible('total_sessions') && (
                        <td className="px-3 py-2.5 border-r border-border/60 text-center font-bold text-text-primary">
                          {st.total_sessions || 0}
                        </td>
                        )}
                        {isColVisible('level') && (
                        <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-teal-800 whitespace-nowrap">
                          {st.level || '—'}
                        </td>
                        )}
                        {isColVisible('email') && (
                        <td className="px-3 py-2.5 border-r border-border/60 text-text-muted whitespace-nowrap">
                          {st.email || '—'}
                        </td>
                        )}
                        {isColVisible('model_type') && (
                        <td className="px-3 py-2.5 border-r-2 border-border/80 text-center whitespace-nowrap">
                          {(() => {
                            const mNorm = formatClassModel(st.model_type);
                            const mStyle = CLASS_MODEL_BADGE_STYLES[mNorm];
                            return (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${mStyle.className}`}
                              >
                                {mStyle.label}
                              </span>
                            );
                          })()}
                        </td>
                        )}

                        {/* Cột Y -> AB */}
                        <td className="px-3 py-2.5 border-r border-border/60 text-center font-black text-emerald-800 bg-emerald-50/40">
                          {(st.attended_previous_years || 0) + (stat?.totalAttended || 0)}
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

      {/* Legend & Pagination Footer */}
      {(() => {
        const totalRows =
          activeTab === 'quick'
            ? quickVisibleStudents.length
            : activeTab === 'detailed' && detailedViewMode === 'log'
            ? periodSessionLogs.length
            : activeTab === 'detailed' && detailedViewMode === 'matrix'
            ? matrixFilteredStudents.length
            : students.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
        const safePage = Math.min(page, totalPages);
        const startIdx = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1;
        const endIdx = Math.min(safePage * pageSize, totalRows);

        return (
          <div className="p-3.5 px-4 border-t border-border/80 bg-surface-muted/30 flex flex-wrap items-center justify-between gap-4 text-xs text-text-secondary">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-text-primary">Chú thích mã:</span>
              {Object.entries(STATUS_CONFIG).map(([key, opt]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-extrabold border ${opt.bg} ${opt.text} ${opt.border}`}
                  >
                    {key === 'ATTENDED' ? '1' : opt.short}
                  </span>
                  <span>{opt.label}</span>
                </div>
              ))}
            </div>

            {totalRows > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <span>
                  Hiển thị <strong className="text-text-primary">{startIdx}</strong>–
                  <strong className="text-text-primary">{endIdx}</strong> /{' '}
                  <strong className="text-text-primary">{totalRows}</strong> dòng
                </span>
                <div className="flex items-center gap-1.5">
                  <span>Mỗi trang:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-surface border border-border rounded-lg px-2 py-1 text-xs font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="px-2 font-semibold text-text-primary">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="h-7 px-2"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Xác nhận xóa ca đã có điểm danh (xóa ca sẽ xóa luôn các bản ghi điểm danh của ca đó) */}
      <Modal
        isOpen={!!deleteCaTarget}
        onClose={() => !deletingCa && setDeleteCaTarget(null)}
        title={`Xóa Ca ${deleteCaTarget?.caNumber || ''}?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setDeleteCaTarget(null)}
              disabled={deletingCa}
            >
              Hủy
            </Button>
            <Button
              variant="danger"
              size="sm"
              type="button"
              disabled={deletingCa}
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                if (!deleteCaTarget) return;
                void performDeleteCa(
                  deleteCaTarget.classId,
                  deleteCaTarget.className,
                  deleteCaTarget.dateStr,
                  deleteCaTarget.caNumber,
                  deleteCaTarget.session,
                  true
                );
              }}
            >
              {deletingCa ? 'Đang xóa...' : 'Xác nhận xóa'}
            </Button>
          </div>
        }
      >
        {deleteCaTarget && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-text-primary">
              {deleteCaTarget.className} · {formatSessionDate(deleteCaTarget.dateStr)} · Ca{' '}
              {deleteCaTarget.caNumber}
            </p>
            <p className="rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-800">
              Thao tác này sẽ xóa dữ liệu điểm danh của <strong>bạn ({activeSide === 'CS' ? 'CSKH' : activeSide === 'ADMIN' ? 'Admin' : 'Giáo viên'})</strong> ở{' '}
              <strong>Ca {deleteCaTarget.caNumber}</strong>. Dữ liệu mà các vai trò khác đã nhập (nếu có) sẽ{' '}
              <strong>được giữ nguyên</strong>; nếu cả 3 bên đều trống thì ca học sẽ được gỡ bỏ hoàn toàn.
            </p>
          </div>
        )}
      </Modal>

      {/* Ngăn chi tiết ca học (Drawer) — CVHT/Admin/MANAGE xem & sửa 1 buổi từ Tab 2 */}
      <AttendanceSessionDrawer
        isOpen={!!drawerState}
        onClose={() => setDrawerState(null)}
        studentName={drawerState?.student.full_name || ''}
        studentCode={drawerState?.student.external_id}
        className={cls?.class_name || drawerState?.student.class_name}
        classCode={
          cls
            ? formatClassCode(cls.class_code, cls.id)
            : drawerState?.student.class_code || undefined
        }
        dateStr={drawerState?.dateStr || ''}
        daySessions={
          drawerState ? getSessionsForCell(drawerState.student.enrollment_class_id, drawerState.dateStr) : []
        }
        selectedSessionNumber={drawerState?.caNumber || 1}
        onSelectSessionNumber={(caNumber) =>
          setDrawerState((prev) => (prev ? { ...prev, caNumber } : prev))
        }
        getAttendanceForSession={(session) =>
          session && drawerState
            ? rawAttendanceMap.get(`${drawerState.student.enrollment_class_id}_session_${session.id}`)
            : undefined
        }
        side={activeSide}
        defaultEditing={drawerState?.defaultEditing}
        canEditTeacherFields={activeSide === 'TEACHER'}
        canEditCsFields={activeSide === 'CS'}
        canMarkStatus={activeSide === 'TEACHER' || activeSide === 'CS' || activeSide === 'ADMIN'}
        canDeleteSession
        saving={savingSessionId !== null}
        onSaveStatusAndNotes={async ({ session, sessionNumber, status, lesson_topic, teacher_note, cs_note }) => {
          if (!drawerState) return;
          const dKey = `${drawerState.student.enrollment_class_id}_${drawerState.dateStr}_s${sessionNumber}`;
          if (activeSide === 'TEACHER') {
            if (lesson_topic !== undefined) {
              teacherLessonDraftsRef.current[dKey] = lesson_topic || '';
              setTeacherLessonDrafts((prev) => ({ ...prev, [dKey]: lesson_topic || '' }));
            }
            if (teacher_note !== undefined) {
              teacherNoteDraftsRef.current[dKey] = teacher_note || '';
              setTeacherNoteDrafts((prev) => ({ ...prev, [dKey]: teacher_note || '' }));
            }
          }
          if (activeSide === 'CS' && cs_note !== undefined) {
            csNoteDraftsRef.current[dKey] = cs_note || '';
            setCsNoteDrafts((prev) => ({ ...prev, [dKey]: cs_note || '' }));
          }
          await handleStatusSelect(
            drawerState.student.enrollment_class_id,
            drawerState.dateStr,
            session,
            status,
            sessionNumber,
            activeSide === 'TEACHER'
              ? { lesson_topic: lesson_topic ?? null, teacher_note: teacher_note ?? null }
              : activeSide === 'CS'
              ? { cs_note: cs_note ?? null }
              : undefined
          );
          setDrawerState((prev) => (prev ? { ...prev, defaultEditing: false } : prev));
        }}
        onSaveNotesOnly={async ({ session, lesson_topic, teacher_note, cs_note }) => {
          if (!drawerState || (activeSide !== 'CS' && activeSide !== 'TEACHER')) return;
          const dKey = `${drawerState.student.enrollment_class_id}_${drawerState.dateStr}_s${drawerState.caNumber}`;
          if (activeSide === 'TEACHER') {
            if (lesson_topic !== undefined) {
              teacherLessonDraftsRef.current[dKey] = lesson_topic || '';
              setTeacherLessonDrafts((prev) => ({ ...prev, [dKey]: lesson_topic || '' }));
            }
            if (teacher_note !== undefined) {
              teacherNoteDraftsRef.current[dKey] = teacher_note || '';
              setTeacherNoteDrafts((prev) => ({ ...prev, [dKey]: teacher_note || '' }));
            }
          }
          if (activeSide === 'CS' && cs_note !== undefined) {
            csNoteDraftsRef.current[dKey] = cs_note || '';
            setCsNoteDrafts((prev) => ({ ...prev, [dKey]: cs_note || '' }));
          }
          await handleSaveNote(
            drawerState.student.enrollment_class_id,
            drawerState.dateStr,
            session,
            activeSide === 'TEACHER' ? lesson_topic ?? null : undefined,
            activeSide === 'TEACHER' ? teacher_note ?? null : undefined,
            activeSide === 'CS' ? cs_note ?? null : undefined,
            drawerState.caNumber
          );
        }}
        onClearStatus={async (session) => {
          if (!drawerState) return;
          await handleClearCell(drawerState.student.enrollment_class_id, session);
        }}
        onDeleteSession={(session) => {
          if (!drawerState) return;
          const classId = resolveClassId(drawerState.student.enrollment_class_id, session);
          if (!classId) return;
          const idx = getSessionsForCell(
            drawerState.student.enrollment_class_id,
            drawerState.dateStr
          ).findIndex((s) => s.id === session.id);
          requestDeleteCa(
            classId,
            cls?.class_name || drawerState.student.class_name,
            drawerState.dateStr,
            idx >= 0 ? idx + 1 : drawerState.caNumber
          );
        }}
      />
    </div>
  );
};
