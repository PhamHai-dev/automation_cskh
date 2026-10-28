import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { classesApi } from '../api/classes.api';
import { classSessionsApi, attendanceApi } from '../api/sessions.api';
import {
  Class,
  ClassSession,
  ClassTeacherAssignment,
  ClassTeacherRole,
  Attendance,
  AttendanceStatus,
  CreateClassDTO,
  UpdateClassDTO,
  formatClassCode,
} from '../types/classes.types';
import { teachersApi } from '../../teachers/api/teachers.api';
import { Teacher } from '../../teachers/types/teachers.types';
import { compareSessionsInDay, formatSessionDate, toLocalDateString } from '../components/AttendanceMatrix';
import { AttendanceSessionDrawer } from '../components/AttendanceSessionDrawer';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar } from '../../../components/common/FilterBar';
import { PaginationFooter } from '../../../components/common/Pagination';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useQuery, invalidateQueries } from '../../../hooks/useQuery';
import {
  Edit,
  Plus,
  CalendarDays,
  ListChecks,
  Zap,
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  BookOpen,
  Users,
  UserRoundCheck,
} from 'lucide-react';

const MODEL_CONFIG: Record<string, { label: string; className: string }> = {
  '1:1': { label: '1:1', className: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' },
  '1:2': { label: '1:2', className: 'bg-purple-50 text-purple-700 border-purple-200 font-bold' },
  '1:n': { label: '1:n', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' },
  ONE_TO_ONE: { label: '1:1', className: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' },
  ONE_TO_TWO: { label: '1:2', className: 'bg-purple-50 text-purple-700 border-purple-200 font-bold' },
  ONE_TO_N: { label: '1:n', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' },
  GROUP: { label: '1:n', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' },
};

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

const POPOVER_STATUS_OPTIONS: Array<{ status: AttendanceStatus; label: string }> = [
  { status: 'ATTENDED', label: '1 · Có mặt' },
  { status: 'ABSENT_APPROVED_A', label: 'A · Nghỉ có phép (A)' },
  { status: 'LEAVE_B', label: 'B · Bảo lưu (B)' },
  { status: 'ABSENT_UNAPPROVED_C', label: 'C · Nghỉ sai QĐ (C)' },
  { status: 'TEACHER_ABSENT_D', label: 'D · Giáo viên nghỉ (D)' },
  { status: 'TECH_ERROR_E', label: 'E · Lỗi kỹ thuật (E)' },
];

const DAY_OF_WEEK_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const TEACHER_ROLE_CONFIG: Record<
  ClassTeacherRole,
  { label: string; variant: 'info' | 'accent' | 'warning' }
> = {
  MAIN: { label: 'Giáo viên chính', variant: 'info' },
  ASSISTANT: { label: 'Giáo viên phụ', variant: 'accent' },
  SUBSTITUTE: { label: 'Giáo viên dạy thay', variant: 'warning' },
};

const formatAssignmentDate = (raw?: string | null): string => {
  if (!raw) return '—';
  const ymd = formatSessionDate(raw);
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return ymd || '—';
};

type ClassAttendanceTab = 'quick' | 'detailed';
type DetailedFilterMode = 'week' | 'month';
type DetailedViewMode = 'matrix' | 'log';

interface EnrolledStudentItem {
  enrollment_class_id: number;
  class_id: number;
  student_id: number;
  full_name: string;
  external_id: string;
  phone?: string;
  package_name?: string;
  total_sessions?: number;
  attended_previous_years?: number;
}

export const ClassesPage: React.FC = () => {
  const { user } = useAuth();
  const isTeacher = Boolean(
    user?.roles?.includes('TEACHER') &&
      !user?.roles?.includes('ADMIN') &&
      !user?.roles?.includes('MANAGE') &&
      !user?.roles?.includes('CS')
  );
  const canManageClasses = Boolean(user?.roles?.some((r) => ['ADMIN', 'MANAGE'].includes(r)));
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));

  const toast = useToast();

  // Filters & URL sync
  const [searchParams, setSearchParams] = useSearchParams();

  // 2 Tab lớn ở đầu trang: 'quick' (Điểm danh nhanh - 1 ngày) & 'detailed' (Điểm danh chi tiết - Ma trận tháng)
  const [activeTab, setActiveTab] = useState<ClassAttendanceTab>(() =>
    searchParams.get('tab') === 'detailed' ? 'detailed' : 'quick'
  );

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 300);
  const [modelFilter, setModelFilter] = useState(() => searchParams.get('model') || '');

  useEffect(() => {
    const q = searchParams.get('search') || '';
    if (q !== searchTerm) setSearchTerm(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Tab 1 (Điểm danh nhanh): 1 ngày đang chọn (mặc định Hôm nay hoặc từ URL)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const urlDate = searchParams.get('date');
    return urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)
      ? urlDate
      : toLocalDateString(new Date());
  });

  // Tab 2 (Lịch sử & Bảng tháng): Chế độ lọc kỳ (Theo tuần | Theo tháng), chế độ hiển thị (Bảng điểm danh | Nhật ký bài học), và lọc chỉ ngày có buổi học
  const [detailedFilterMode, setDetailedFilterMode] = useState<DetailedFilterMode>('month');
  const [detailedViewMode, setDetailedViewMode] = useState<DetailedViewMode>('matrix');
  const [onlyDaysWithSessions, setOnlyDaysWithSessions] = useState<boolean>(false);
  const [currentPeriodDate, setCurrentPeriodDate] = useState<Date>(() => {
    const urlDate = searchParams.get('date');
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      const [y, m, d] = urlDate.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  });

  // Pagination cho danh sách lớp (synced with URL)
  const [classPage, setClassPage] = useState<number>(
    () => Math.max(1, Number(searchParams.get('page')) || 1)
  );
  const [classPageSize, setClassPageSize] = useState<number>(
    () => Math.max(1, Number(searchParams.get('pageSize')) || 20)
  );

  // Sync search, model, tab, date, page, pageSize to URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (searchTerm.trim()) next.set('search', searchTerm.trim());
    else next.delete('search');
    if (modelFilter) next.set('model', modelFilter);
    else next.delete('model');
    if (activeTab !== 'quick') next.set('tab', activeTab);
    else next.delete('tab');

    const activeDateStr =
      activeTab === 'quick' ? selectedDate : toLocalDateString(currentPeriodDate);
    const todayStr = toLocalDateString(new Date());
    if (activeDateStr && activeDateStr !== todayStr) {
      next.set('date', activeDateStr);
    } else {
      next.delete('date');
    }

    if (classPage > 1) next.set('page', String(classPage));
    else next.delete('page');
    if (classPageSize !== 20) next.set('pageSize', String(classPageSize));
    else next.delete('pageSize');

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    searchTerm,
    modelFilter,
    activeTab,
    selectedDate,
    currentPeriodDate,
    classPage,
    classPageSize,
    searchParams,
    setSearchParams,
  ]);

  // Collapsed state for 1:2 / 1:n classes (empty set = all expanded by default)
  const [collapsedClassIds, setCollapsedClassIds] = useState<Set<number>>(new Set());
  // Tab nhập: chỉ hiện lớp có ca học trong ngày đang chọn (giảm loạn với GV nhiều lớp)
  const [onlyClassesWithDaySessions, setOnlyClassesWithDaySessions] = useState<boolean>(false);

  // Inline note/lesson draft edits keyed by `${enrollment_class_id}_${dateStr}_s${ca}`
  const [inlineDrafts, setInlineDrafts] = useState<
    Record<string, { lesson_topic?: string; teacher_note?: string; status?: AttendanceStatus }>
  >({});
  // Bài học chung theo ca của lớp: gõ 1 lần ở dòng lớp, áp cho mọi học viên khi chấm
  const [classLessonDrafts, setClassLessonDrafts] = useState<Record<string, string>>({});
  // Ca đang chọn nhập điểm danh, key `${classId}_${dateStr}` (mặc định Ca 1)
  const [quickSelectedCa, setQuickSelectedCa] = useState<Record<string, number>>({});
  // Ô đang bung bảng 6 trạng thái ở Tab Nhập điểm danh, key `${enrollment_class_id}_${dateStr}_s${ca}`
  // Mặc định null → mọi dòng học viên chỉ hiện dấu "—" gọn hoặc "Ca n: Trạng thái" đã chọn.
  const [activeQuickPickerKey, setActiveQuickPickerKey] = useState<string | null>(null);

  // Ngăn input bài học/ghi chú lớp trước ghi đè bài học vừa chọn ở thẻ lớp
  const lastClassLessonRef = useRef<Record<string, string>>({});
  const [savingClassLessonKey, setSavingClassLessonKey] = useState<string | null>(null);

  // Ngăn drawer chi tiết 1 buổi (thay popover nổi)
  const [drawerState, setDrawerState] = useState<{
    classId: number;
    enrollmentClassId: number;
    studentName: string;
    studentCode?: string;
    dateStr: string;
    caNumber: number;
    defaultEditing?: boolean;
  } | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const inlineTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSavedNoteRef = useRef<Record<string, { lesson: string; note: string }>>({});

  // Quick Create Session Modal (for Teacher)
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [newSessionForm, setNewSessionForm] = useState({
    class_id: '',
    session_date: toLocalDateString(new Date()),
    start_time: '19:30',
    lesson_topic: '',
    teacher_note: '',
    default_status: 'ATTENDED' as AttendanceStatus,
  });
  const [creatingSession, setCreatingSession] = useState(false);

  // Modal Thêm/Sửa Lớp học
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState({
    class_name: '',
    class_code: '',
    model_type: '1:1' as '1:1' | '1:2' | '1:n',
    attendance_source: 'LEARNING_SYSTEM' as 'LEARNING_SYSTEM' | 'ZOOM',
    level: '',
    active: true,
  });

  // Modal Phân công Giáo viên (D8 — Admin kết thúc phân công, ADMIN/MANAGE thêm phân công)
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [assignmentClassId, setAssignmentClassId] = useState<number | null>(null);
  const [endingAssignmentId, setEndingAssignmentId] = useState<number | null>(null);
  const [endDateDraft, setEndDateDraft] = useState('');
  const [endingAssignment, setEndingAssignment] = useState(false);
  const [newAssignment, setNewAssignment] = useState<{
    teacher_id: string;
    role: ClassTeacherRole;
    start_date: string;
    end_date: string;
  }>({
    teacher_id: '',
    role: 'MAIN',
    start_date: toLocalDateString(new Date()),
    end_date: '',
  });
  const [assigningTeacher, setAssigningTeacher] = useState(false);

  // Tính khoảng ngày của kỳ đang xem (session_from, session_to, summary_month) + phân trang & lọc server-side
  const sessionWindowParams = useMemo(() => {
    const baseFilterParams = {
      page: classPage,
      pageSize: classPageSize,
      search: debouncedSearch || undefined,
      model_type: modelFilter || undefined,
      relevant_date:
        activeTab === 'quick' && onlyClassesWithDaySessions ? selectedDate : undefined,
    };

    if (activeTab === 'quick') {
      const [y, m] = selectedDate.split('-').map(Number);
      const firstDay = new Date(y, m - 1, 1);
      const lastDay = new Date(y, m, 0);
      return {
        ...baseFilterParams,
        session_from: toLocalDateString(firstDay),
        session_to: toLocalDateString(lastDay),
        summary_month: `${y}-${String(m).padStart(2, '0')}`,
      };
    }

    const year = currentPeriodDate.getFullYear();
    const month = currentPeriodDate.getMonth();
    const summaryMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

    if (detailedFilterMode === 'week') {
      const day = currentPeriodDate.getDay();
      const diff = currentPeriodDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(year, month, diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const monthFirst = new Date(year, month, 1);
      const monthLast = new Date(year, month + 1, 0);
      const fromDate = monday < monthFirst ? monday : monthFirst;
      const toDate = sunday > monthLast ? sunday : monthLast;
      return {
        ...baseFilterParams,
        session_from: toLocalDateString(fromDate),
        session_to: toLocalDateString(toDate),
        summary_month: summaryMonth,
      };
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return {
      ...baseFilterParams,
      session_from: toLocalDateString(firstDay),
      session_to: toLocalDateString(lastDay),
      summary_month: summaryMonth,
    };
  }, [
    classPage,
    classPageSize,
    debouncedSearch,
    modelFilter,
    onlyClassesWithDaySessions,
    activeTab,
    selectedDate,
    currentPeriodDate,
    detailedFilterMode,
  ]);

  const {
    data: paginatedResult,
    isLoading: loading,
    isFetching,
  } = useQuery({
    queryKey: ['classes', 'paginated', sessionWindowParams],
    queryFn: (signal) => classesApi.listPaginated(sessionWindowParams, signal),
    staleTime: 30 * 1000,
    keepPreviousData: true,
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách lớp học');
    },
  });

  const classes = useMemo(() => paginatedResult?.data || [], [paginatedResult]);
  const meta = paginatedResult?.meta;

  // Luôn lấy dữ liệu mới nhất từ danh sách lớp để modal tự render lại sau khi refresh.
  const assignmentClass = useMemo(
    () => classes.find((c) => c.id === assignmentClassId) || null,
    [classes, assignmentClassId]
  );

  // Chống chấm nhầm trên dữ liệu cũ khi đang tải kỳ mới
  useEffect(() => {
    if (isFetching && activeQuickPickerKey) {
      setActiveQuickPickerKey(null);
    }
  }, [isFetching, activeQuickPickerKey]);

  // Chuẩn hóa sinh mã lớp tiếp theo dạng class_0001, class_0002...
  const generateNextClassCode = () => {
    let maxNum = 0;
    classes.forEach((c) => {
      if (c.id > maxNum) maxNum = c.id;
      if (c.class_code) {
        const m = c.class_code.match(/^(?:class_|id)(\d+)$/i);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxNum) maxNum = n;
        }
      }
    });
    return `class_${String(maxNum + 1).padStart(4, '0')}`;
  };

  const fetchClasses = async (_silent = false) => {
    invalidateQueries(['classes', 'enrollments', 'students']);
  };

  const normalizeModel = (model?: string | null): '1:1' | '1:2' | '1:n' => {
    if (model === 'ONE_TO_TWO' || model === '1:2') return '1:2';
    if (model === 'ONE_TO_N' || model === '1:n' || model === 'GROUP') return '1:n';
    return '1:1';
  };

  const getStudentsOfClass = (cls: Class): EnrolledStudentItem[] => {
    const list: EnrolledStudentItem[] = [];
    cls.enrollment_classes?.forEach((ec: any) => {
      const st = ec.enrollment?.student;
      const pkg = ec.enrollment?.package;
      list.push({
        enrollment_class_id: ec.id,
        class_id: cls.id,
        student_id: st?.id || ec.id,
        full_name: st?.full_name || `Học viên #${ec.id}`,
        external_id: st?.external_id || ec.enrollment?.external_id || `HV_${st?.id || ec.id}`,
        phone: st?.phone || '',
        package_name: pkg?.name || pkg?.code || '',
        total_sessions: ec.enrollment?.total_sessions || 0,
        attended_previous_years: ec.enrollment?.attended_previous_years || 0,
      });
    });
    return list;
  };

  // Build lookup maps from classes payload
  const { sessionsByClassAndDate, attendanceByEcAndSession, sessionsById } = useMemo(() => {
    const sessMap = new Map<string, ClassSession[]>();
    const attMap = new Map<string, Attendance>();
    const sessIdMap = new Map<number, ClassSession>();

    classes.forEach((cls) => {
      const classSessById = new Map<number, ClassSession>();

      cls.class_sessions?.forEach((s: any) => {
        classSessById.set(s.id, s);
        sessIdMap.set(s.id, s);
        s.attendance?.forEach((a: any) => {
          if (!a.deleted_at) {
            attMap.set(`${a.enrollment_class_id}_session_${s.id}`, a);
          }
        });
      });

      cls.enrollment_classes?.forEach((ec: any) => {
        ec.attendance?.forEach((a: any) => {
          if (!a.deleted_at) {
            attMap.set(`${ec.id}_session_${a.class_session_id}`, a);
            if (a.class_session && !classSessById.has(a.class_session.id)) {
              classSessById.set(a.class_session.id, a.class_session);
              sessIdMap.set(a.class_session.id, a.class_session);
            }
          }
        });
      });

      Array.from(classSessById.values()).forEach((s) => {
        const dStr = formatSessionDate(s.session_date);
        const key = `${cls.id}_${dStr}`;
        const list = sessMap.get(key) || [];
        list.push(s);
        sessMap.set(key, list);
      });
    });

    sessMap.forEach((list) => list.sort(compareSessionsInDay));

    return {
      sessionsByClassAndDate: sessMap,
      attendanceByEcAndSession: attMap,
      sessionsById: sessIdMap,
    };
  }, [classes]);

  // Tính thống kê cho từng học viên (Tổng buổi đã học & Đã học trong tháng đang xem)
  const studentAttendanceStats = useMemo(() => {
    const stats = new Map<number, { totalAttended: number; monthAttended: number }>();
    const currentYear = currentPeriodDate.getFullYear();
    const currentMonth = currentPeriodDate.getMonth() + 1;
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    const precomputedTotalByEcId = new Map<number, number>();
    const precomputedMonthByEcId = new Map<number, number>();
    classes.forEach((cls) => {
      cls.enrollment_classes?.forEach((ec: any) => {
        if (ec.attendance_stats) {
          const totalVal = isTeacher
            ? ec.attendance_stats.totalAttendedTeacher ??
              ec.attendance_stats.TEACHER?.totalAttended
            : ec.attendance_stats.totalAttendedAdmin ??
              ec.attendance_stats.ADMIN?.totalAttended;
          const monthVal = isTeacher
            ? ec.attendance_stats.monthAttendedTeacher ??
              ec.attendance_stats.monthAttended
            : ec.attendance_stats.monthAttendedAdmin ??
              ec.attendance_stats.monthAttended;

          if (typeof totalVal === 'number') {
            precomputedTotalByEcId.set(ec.id, totalVal);
          }
          if (typeof monthVal === 'number') {
            precomputedMonthByEcId.set(ec.id, monthVal);
          }
          if (typeof totalVal === 'number' || typeof monthVal === 'number') {
            stats.set(ec.id, {
              totalAttended: typeof totalVal === 'number' ? totalVal : 0,
              monthAttended: typeof monthVal === 'number' ? monthVal : 0,
            });
          }
        }
      });
    });

    attendanceByEcAndSession.forEach((att) => {
      const ecId = att.enrollment_class_id;
      const effectiveStatus = isTeacher
        ? att.teacher_status || att.status
        : att.status || att.teacher_status;
      if (effectiveStatus !== 'ATTENDED') return;

      const sess = att.class_session || sessionsById.get(att.class_session_id);
      const dStr = formatSessionDate(sess?.session_date);

      const cur = stats.get(ecId) || { totalAttended: 0, monthAttended: 0 };
      if (!precomputedTotalByEcId.has(ecId)) {
        cur.totalAttended += 1;
      }
      if (!precomputedMonthByEcId.has(ecId) && dStr && dStr.startsWith(monthPrefix)) {
        cur.monthAttended += 1;
      }
      stats.set(ecId, cur);
    });

    return stats;
  }, [classes, attendanceByEcAndSession, sessionsById, currentPeriodDate, isTeacher]);

  // Filtered classes (using debouncedSearch)
  const filteredClasses = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return classes.filter((c) => {
      const formattedCode = formatClassCode(c.class_code, c.id).toLowerCase();
      const students = getStudentsOfClass(c);
      const matchSearch =
        !q ||
        c.class_name.toLowerCase().includes(q) ||
        formattedCode.includes(q) ||
        (c.class_code && c.class_code.toLowerCase().includes(q)) ||
        students.some(
          (st) =>
            st.full_name.toLowerCase().includes(q) ||
            st.external_id.toLowerCase().includes(q)
        );

      const modelNormalized = normalizeModel(c.model_type);
      const matchModel = !modelFilter || modelNormalized === modelFilter || c.model_type === modelFilter;

      return matchSearch && matchModel;
    });
  }, [classes, debouncedSearch, modelFilter]);

  const activeFiltersCount = (searchTerm ? 1 : 0) + (modelFilter ? 1 : 0);

  // Dates list for Tab 2 (Điểm danh chi tiết: Theo tuần | Theo tháng)
  const periodDates = useMemo(() => {
    const dates: Date[] = [];
    const year = currentPeriodDate.getFullYear();
    const month = currentPeriodDate.getMonth();

    if (detailedFilterMode === 'week') {
      const day = currentPeriodDate.getDay();
      const diff = currentPeriodDate.getDate() - day + (day === 0 ? -6 : 1);
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
  }, [currentPeriodDate, detailedFilterMode]);

  const detailedPeriodTitle = useMemo(() => {
    const month = currentPeriodDate.getMonth() + 1;
    const year = currentPeriodDate.getFullYear();
    if (detailedFilterMode === 'week') {
      const first = periodDates[0]?.toLocaleDateString('vi-VN') || '';
      const last = periodDates[periodDates.length - 1]?.toLocaleDateString('vi-VN') || '';
      return `Tuần: ${first} — ${last}`;
    }
    return `Tháng ${month} / ${year}`;
  }, [currentPeriodDate, detailedFilterMode, periodDates]);

  // Danh sách ngày hiển thị trên Bảng tháng (hỗ trợ lọc "Chỉ ngày có buổi học")
  const visiblePeriodDates = useMemo(() => {
    if (!onlyDaysWithSessions) return periodDates;
    return periodDates.filter((d) => {
      const dStr = toLocalDateString(d);
      return filteredClasses.some(
        (c) => (sessionsByClassAndDate.get(`${c.id}_${dStr}`) || []).length > 0
      );
    });
  }, [periodDates, onlyDaysWithSessions, filteredClasses, sessionsByClassAndDate]);

  // Nhật ký bài học & ghi chú theo từng buổi trong kỳ (phục vụ chế độ "Nhật ký bài học" ở Tab 2)
  const periodSessionLogs = useMemo(() => {
    const periodDateSet = new Set(periodDates.map((d) => toLocalDateString(d)));
    const rows: Array<{
      key: string;
      cls: Class;
      student: EnrolledStudentItem;
      session: ClassSession;
      dateStr: string;
      caNumber: number;
      att: Attendance | undefined;
    }> = [];

    filteredClasses.forEach((cls) => {
      const students = getStudentsOfClass(cls);
      periodDates.forEach((d) => {
        const dStr = toLocalDateString(d);
        if (!periodDateSet.has(dStr)) return;
        const daySessions = sessionsByClassAndDate.get(`${cls.id}_${dStr}`) || [];
        daySessions.forEach((sess, idx) => {
          students.forEach((st) => {
            const att = attendanceByEcAndSession.get(
              `${st.enrollment_class_id}_session_${sess.id}`
            );
            rows.push({
              key: `${st.enrollment_class_id}_session_${sess.id}`,
              cls,
              student: st,
              session: sess,
              dateStr: dStr,
              caNumber: idx + 1,
              att,
            });
          });
        });
      });
    });

    return rows.sort((a, b) => b.dateStr.localeCompare(a.dateStr) || b.caNumber - a.caNumber);
  }, [filteredClasses, periodDates, sessionsByClassAndDate, attendanceByEcAndSession]);

  // Stepper handlers for Tab 1 (Quick Day) and Tab 2 (Detailed Period)
  const handleStepDay = (delta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + delta);
    setSelectedDate(toLocalDateString(next));
  };

  const handleStepPeriod = (delta: number) => {
    const next = new Date(currentPeriodDate);
    if (detailedFilterMode === 'week') {
      next.setDate(next.getDate() + delta * 7);
    } else {
      next.setMonth(next.getMonth() + delta);
    }
    setCurrentPeriodDate(next);
  };

  const toggleClassExpand = (classId: number) => {
    setCollapsedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  // ── Tab Nhập điểm danh: danh sách ca trong ngày của lớp + ca đang chọn ──
  const getDaySessions = (classId: number, dateStr: string): ClassSession[] =>
    sessionsByClassAndDate.get(`${classId}_${dateStr}`) || [];

  // Lớp "liên quan tới ngày đang chọn": đã có ca trong ngày HOẶC lịch học trùng thứ của ngày đó.
  // Ngữ pháp schedule_pattern giống backend (auto-attendance): chữ số 2..7 = Thứ 2..7, "CN" = Chủ nhật,
  // "LKCD" = lịch không cố định (chỉ tự hiện khi đã có ca chấm).
  const isClassRelevantOnDate = (cls: Class, dateStr: string): boolean => {
    if (getDaySessions(cls.id, dateStr).length > 0) return true;
    const raw = cls.class_schedules
      ?.map((s) => s.schedule_pattern || '')
      .filter(Boolean)
      .join('');
    if (!raw || raw.toUpperCase().includes('LKCD')) return false;
    const normalized = raw.toUpperCase().replace(/[^0-9CN]/g, '');
    const [y, m, d] = dateStr.split('-').map(Number);
    const jsDay = new Date(y, m - 1, d).getDay();
    const code = jsDay === 0 ? 'CN' : String(jsDay + 1);
    return code === 'CN' ? normalized.includes('CN') : normalized.includes(code);
  };

  const getSelectedCa = (classId: number, dateStr: string): number =>
    quickSelectedCa[`${classId}_${dateStr}`] || 1;

  const setSelectedCa = (classId: number, dateStr: string, caNumber: number) => {
    setQuickSelectedCa((prev) => ({ ...prev, [`${classId}_${dateStr}`]: caNumber }));
  };

  // Số ca hiển thị trong ngày của 1 lớp (tối thiểu 1 ca; khi bấm + tạo ca n+1 sẽ tăng tương ứng
  // để cột Điểm danh, Bài học và Ghi chú tự động sinh thêm hàng Ca n+1 đồng bộ).
  const getVisibleCaCount = (cls: Class, dateStr: string): number =>
    Math.max(1, getDaySessions(cls.id, dateStr).length, getSelectedCa(cls.id, dateStr));

  // Đóng bộ chọn trạng thái inline khi bấm phím Escape hoặc đổi ngày
  useEffect(() => {
    setActiveQuickPickerKey(null);
  }, [selectedDate, activeTab]);

  useEffect(() => {
    if (!activeQuickPickerKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveQuickPickerKey(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeQuickPickerKey]);

  // Ngăn drawer (Panel bên phải) chi tiết 1 buổi — mặc định mở ở chế độ Xem nếu buổi đã chấm,
  // hoặc mở thẳng chế độ Sửa nếu giáo viên bấm vào ô trống / thêm ca mới.
  const openDrawer = (
    cls: Class,
    st: EnrolledStudentItem,
    dateStr: string,
    caNumber: number,
    defaultEditing?: boolean
  ) => {
    const sess = getDaySessions(cls.id, dateStr)[caNumber - 1];
    const att = sess
      ? attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${sess.id}`)
      : undefined;
    const shouldEdit =
      defaultEditing !== undefined ? defaultEditing : Boolean(isTeacher && !att?.teacher_status);
    setDrawerState({
      classId: cls.id,
      enrollmentClassId: st.enrollment_class_id,
      studentName: st.full_name,
      studentCode: st.external_id,
      dateStr,
      caNumber,
      defaultEditing: shouldEdit,
    });
  };

  // Thêm ca mới cho cả lớp (1 nút cấp lớp hoặc nút "+" cạnh dấu "—"):
  // Tạo đúng 1 buổi ClassSession mới cho ngày đó, tự động thêm hàng Ca n+1 cho Điểm danh + Bài học + Ghi chú,
  // và nếu bấm "+" từ dòng 1 học viên cụ thể thì mở luôn bộ chọn trạng thái của học viên đó ở Ca n+1.
  const handleAddCaForClass = async (
    cls: Class,
    dateStr: string,
    openPickerForStudent?: EnrolledStudentItem
  ) => {
    if (!isTeacher) return;
    const key = `addca_${cls.id}_${dateStr}`;
    setSavingKey(key);
    try {
      const created = await classSessionsApi.create(cls.id, { session_date: dateStr });
      const nextList = [...getDaySessions(cls.id, dateStr), created].sort(compareSessionsInDay);
      const newCaNumber = nextList.findIndex((s) => s.id === created.id) + 1 || nextList.length;
      setSelectedCa(cls.id, dateStr, newCaNumber);
      if (openPickerForStudent) {
        setActiveQuickPickerKey(
          `${openPickerForStudent.enrollment_class_id}_${dateStr}_s${newCaNumber}`
        );
      }
      toast.success(`Đã thêm Ca ${nextList.length} cho ngày ${formatSessionDate(dateStr)}`);
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thêm ca học');
    } finally {
      setSavingKey((prev) => (prev === key ? null : prev));
    }
  };

  // Bài học chung của lớp cho 1 ca: cập nhật lesson_topic cho mọi học viên đã có điểm danh ca đó.
  // Nếu chưa có học viên nào được chấm ở ca này, giữ nguyên nháp trong classLessonDrafts để tự động
  // gắn vào khi giáo viên bấm chấm điểm danh (tránh báo lỗi làm gián đoạn thao tác).
  const handleSaveClassLesson = async (cls: Class, dateStr: string, caNumber: number) => {
    if (!isTeacher) return;
    const key = `classlesson_${cls.id}_${dateStr}_s${caNumber}`;
    const draftKey = `${cls.id}_${dateStr}_s${caNumber}`;
    if (!(draftKey in classLessonDrafts)) return;
    const trimmed = (classLessonDrafts[draftKey] || '').trim();
    if (lastClassLessonRef.current[key] === trimmed) return;

    const session = getDaySessions(cls.id, dateStr)[caNumber - 1];
    if (!session) return;
    const targets = getStudentsOfClass(cls).filter(
      (s) => attendanceByEcAndSession.get(`${s.enrollment_class_id}_session_${session.id}`)?.id
    );
    if (targets.length === 0) {
      return;
    }
    lastClassLessonRef.current[key] = trimmed;
    setSavingClassLessonKey(key);
    try {
      await Promise.all(
        targets.map(async (s) => {
          const att = attendanceByEcAndSession.get(`${s.enrollment_class_id}_session_${session.id}`)!;
          await attendanceApi.update(cls.id, session.id, att.id, {
            side: 'TEACHER',
            lesson_topic: trimmed || null,
          });
        })
      );
      toast.success(
        targets.length === 1
          ? `Đã lưu bài học (Ca ${caNumber})`
          : `Đã áp dụng bài học chung cho ${targets.length} học viên (Ca ${caNumber})`
      );
      await fetchClasses(true);
    } catch (err: any) {
      delete lastClassLessonRef.current[key];
      toast.error(err.response?.data?.message || 'Không thể áp dụng bài học chung');
    } finally {
      setSavingClassLessonKey(null);
    }
  };

  const multiStudentClasses = useMemo(
    () =>
      filteredClasses.filter(
        (c) => normalizeModel(c.model_type) !== '1:1' || getStudentsOfClass(c).length > 1
      ),
    [filteredClasses]
  );

  const allExpanded = multiStudentClasses.every((c) => !collapsedClassIds.has(c.id));

  const handleToggleExpandAll = () => {
    if (allExpanded) {
      setCollapsedClassIds(new Set(multiStudentClasses.map((c) => c.id)));
    } else {
      setCollapsedClassIds(new Set());
    }
  };

  // Mặc định ở tab Nhập: chỉ xòe lớp có ca trong ngày đang chọn (đổi ngày sẽ tính lại).
  const autoCollapsedSignatureRef = useRef<string>('');
  useEffect(() => {
    if (loading || filteredClasses.length === 0) return;
    const signature = `${selectedDate}|${filteredClasses.map((c) => c.id).join(',')}`;
    if (autoCollapsedSignatureRef.current === signature) return;
    autoCollapsedSignatureRef.current = signature;
    const irrelevant = multiStudentClasses
      .filter((c) => !isClassRelevantOnDate(c, selectedDate))
      .map((c) => c.id);
    setCollapsedClassIds(new Set(irrelevant));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selectedDate, filteredClasses]);

  const relevantClassesOnDateCount = useMemo(
    () => filteredClasses.filter((c) => isClassRelevantOnDate(c, selectedDate)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredClasses, selectedDate, sessionsByClassAndDate]
  );

  // Danh sách lớp hiển thị trên bảng: tab Nhập có thể thu gọn còn lớp liên quan tới ngày chọn
  const tableClasses = useMemo(() => {
    if (activeTab === 'quick' && onlyClassesWithDaySessions) {
      return filteredClasses.filter((c) => isClassRelevantOnDate(c, selectedDate));
    }
    return filteredClasses;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, onlyClassesWithDaySessions, filteredClasses, selectedDate, sessionsByClassAndDate]);

  const tableStudentsCount = useMemo(
    () => tableClasses.reduce((acc, c) => acc + getStudentsOfClass(c).length, 0),
    [tableClasses]
  );

  const isFirstClassFilterRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstClassFilterRenderRef.current) {
      isFirstClassFilterRenderRef.current = false;
      return;
    }
    setClassPage(1);
  }, [debouncedSearch, modelFilter, activeTab, onlyClassesWithDaySessions, selectedDate]);

  const classTotalCount = meta ? meta.total : tableClasses.length;
  const classTotalPages = meta
    ? Math.max(1, meta.totalPages)
    : Math.max(1, Math.ceil(tableClasses.length / classPageSize));
  const classPageSafe = Math.min(classPage, classTotalPages);
  const pagedClasses = useMemo(
    () =>
      meta
        ? tableClasses
        : tableClasses.slice(
            (classPageSafe - 1) * classPageSize,
            classPageSafe * classPageSize
          ),
    [meta, tableClasses, classPageSafe, classPageSize]
  );
  const classStartRecord =
    classTotalCount === 0 ? 0 : (classPageSafe - 1) * classPageSize + 1;
  const classEndRecord = Math.min(classPageSafe * classPageSize, classTotalCount);

  // Core Attendance & Lesson/Note save action (Side: TEACHER)
  // Khi params.session là undefined (mở từ nút "+ thêm ca" hoặc ô ngày chưa có buổi),
  // tìm đúng buổi theo sessionNumber (index = sessionNumber - 1) — nếu chưa có thì TẠO MỚI,
  // không lấy existing[0] (Ca 1) để tránh ghi đè làm mất hiển thị Ca 1.
  const handleMarkAttendanceAndNote = async (params: {
    classId: number;
    enrollmentClassId: number;
    dateStr: string;
    session?: ClassSession;
    sessionNumber?: number;
    status: AttendanceStatus;
    lesson_topic?: string | null;
    teacher_note?: string | null;
    studentName?: string;
  }) => {
    if (!isTeacher) return;
    const {
      classId,
      enrollmentClassId,
      dateStr,
      sessionNumber,
      status,
      lesson_topic,
      teacher_note,
      studentName,
    } = params;
    const key = `${enrollmentClassId}_${dateStr}`;
    setSavingKey(key);
    try {
      let targetSession = params.session;
      if (!targetSession) {
        const daySessions = sessionsByClassAndDate.get(`${classId}_${dateStr}`) || [];
        const idx = (sessionNumber || daySessions.length + 1) - 1;
        targetSession = daySessions[idx];
      }
      if (!targetSession) {
        targetSession = await classSessionsApi.create(classId, { session_date: dateStr });
      }

      await attendanceApi.mark(classId, targetSession.id, {
        enrollment_class_id: enrollmentClassId,
        status,
        side: 'TEACHER',
        ...(lesson_topic !== undefined ? { lesson_topic } : {}),
        ...(teacher_note !== undefined ? { teacher_note } : {}),
      });

      toast.success(
        `Đã lưu điểm danh (${STATUS_CONFIG[status].label})${studentName ? ` cho ${studentName}` : ''}`
      );
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể lưu điểm danh'
      );
    } finally {
      setSavingKey(null);
    }
  };

  // Save only Lesson & Teacher Note (auto-save without closing popover or spamming toast)
  // Khi gọi từ popover (fromPopover === true): chỉ gắn với params.session (hoặc suy ra từ
  // sessionNumber); nếu chưa có buổi thì tạo mới theo index = sessionNumber - 1 trong danh sách
  // ngày hôm đó. KHÔNG BAO GIỜ fallback về Ca 1.
  const handleSaveLessonAndNote = async (params: {
    classId: number;
    enrollmentClassId: number;
    dateStr: string;
    session?: ClassSession;
    sessionNumber?: number;
    lessonTopic: string | null;
    teacherNote: string | null;
    studentName?: string;
    fromPopover?: boolean;
  }) => {
    if (!isTeacher) return;
    const {
      classId,
      enrollmentClassId,
      dateStr,
      sessionNumber,
      lessonTopic,
      teacherNote,
      fromPopover,
    } = params;
    const normLesson = (lessonTopic || '').trim();
    const normNote = (teacherNote || '').trim();

    const daySessions = sessionsByClassAndDate.get(`${classId}_${dateStr}`) || [];
    let resolvedSession = params.session;
    if (!resolvedSession && fromPopover) {
      const idx = (sessionNumber || daySessions.length + 1) - 1;
      resolvedSession = daySessions[idx];
    }
    if (!resolvedSession && !fromPopover) {
      resolvedSession = daySessions[0];
    }
    const key = resolvedSession
      ? `${enrollmentClassId}_session_${resolvedSession.id}`
      : `${enrollmentClassId}_${dateStr}_new_${sessionNumber || 1}`;
    const existingAttBefore = resolvedSession
      ? attendanceByEcAndSession.get(`${enrollmentClassId}_session_${resolvedSession.id}`)
      : undefined;

    const origLesson = (existingAttBefore?.lesson_topic || '').trim();
    const origNote = (existingAttBefore?.teacher_note || '').trim();
    const lastSaved = lastSavedNoteRef.current[key];

    if (
      (lastSaved && lastSaved.lesson === normLesson && lastSaved.note === normNote) ||
      (!lastSaved && origLesson === normLesson && origNote === normNote)
    ) {
      return;
    }

    lastSavedNoteRef.current[key] = { lesson: normLesson, note: normNote };
    setSavingKey(key);
    try {
      let targetSession = resolvedSession;
      if (!targetSession) {
        targetSession = await classSessionsApi.create(classId, { session_date: dateStr });
        lastSavedNoteRef.current[`${enrollmentClassId}_session_${targetSession.id}`] = {
          lesson: normLesson,
          note: normNote,
        };
      }

      const existingAtt = attendanceByEcAndSession.get(
        `${enrollmentClassId}_session_${targetSession.id}`
      );

      if (existingAtt) {
        await attendanceApi.update(classId, targetSession.id, existingAtt.id, {
          side: 'TEACHER',
          lesson_topic: normLesson || null,
          teacher_note: normNote || null,
        });
      } else {
        await attendanceApi.mark(classId, targetSession.id, {
          enrollment_class_id: enrollmentClassId,
          status: 'ATTENDED',
          side: 'TEACHER',
          lesson_topic: normLesson || null,
          teacher_note: normNote || null,
        });
      }

      await fetchClasses(true);
    } catch (err: any) {
      delete lastSavedNoteRef.current[key];
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể lưu ghi chú buổi học'
      );
    } finally {
      setSavingKey((prev) => (prev === key ? null : prev));
    }
  };

  // Chấm cả lớp 1:2 / 1:n Có mặt trong 1 chạm theo ca đang chọn (dành riêng cho Giáo viên)
  const handleBulkMarkWholeClass = async (
    cls: Class,
    dateStr: string,
    status: AttendanceStatus = 'ATTENDED',
    caNumber = 1
  ) => {
    if (!isTeacher) return;
    const students = getStudentsOfClass(cls);
    if (students.length === 0) {
      toast.warning('Lớp học chưa có học viên nào.');
      return;
    }
    const key = `class_${cls.id}_${dateStr}_s${caNumber}`;
    setSavingKey(key);
    try {
      const existing = sessionsByClassAndDate.get(`${cls.id}_${dateStr}`) || [];
      let targetSession = existing[caNumber - 1];
      if (!targetSession) {
        targetSession = await classSessionsApi.create(cls.id, { session_date: dateStr });
      }

      const sharedLesson = getClassLessonValue(cls, dateStr, caNumber).trim();

      await attendanceApi.bulkMark(cls.id, targetSession.id, {
        items: students.map((s) => {
          const draft = inlineDrafts[`${s.enrollment_class_id}_${dateStr}_s${caNumber}`];
          return {
            enrollment_class_id: s.enrollment_class_id,
            status,
            ...(draft?.lesson_topic !== undefined
              ? { lesson_topic: draft.lesson_topic.trim() || null }
              : sharedLesson
              ? { lesson_topic: sharedLesson }
              : {}),
            ...(draft?.teacher_note !== undefined
              ? { teacher_note: draft.teacher_note.trim() || null }
              : {}),
          };
        }),
        side: 'TEACHER',
      });

      toast.success(
        `Đã chấm ${STATUS_CONFIG[status].label} (Ca ${caNumber}) cho ${students.length} học viên lớp ${formatClassCode(
          cls.class_code,
          cls.id
        )}`
      );
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể điểm danh cả lớp'
      );
    } finally {
      setSavingKey(null);
    }
  };

  // Clear attendance status for a session
  const handleClearAttendance = async (
    classId: number,
    enrollmentClassId: number,
    session: ClassSession
  ) => {
    if (!isTeacher) return;
    const existingAtt = attendanceByEcAndSession.get(`${enrollmentClassId}_session_${session.id}`);
    if (!existingAtt) return;
    setSavingKey(`${enrollmentClassId}_${formatSessionDate(session.session_date)}`);
    try {
      await attendanceApi.remove(classId, session.id, existingAtt.id, 'TEACHER');
      setDrawerState(null);
      toast.info('Đã xóa trạng thái điểm danh');
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa điểm danh');
    } finally {
      setSavingKey(null);
    }
  };

  // Chấm nhanh 1 học viên ở Tab Nhập điểm danh theo ca đang chọn.
  // Bài học tự động kế thừa từ ô "Bài học chung" của lớp ở ca đó.
  const handleQuickMark = (
    cls: Class,
    st: EnrolledStudentItem,
    dateStr: string,
    caNumber: number,
    status: AttendanceStatus
  ) => {
    const daySessions = getDaySessions(cls.id, dateStr);
    const sharedLesson = getClassLessonValue(cls, dateStr, caNumber).trim();
    const rowDraft = inlineDrafts[`${st.enrollment_class_id}_${dateStr}_s${caNumber}`];
    return handleMarkAttendanceAndNote({
      classId: cls.id,
      enrollmentClassId: st.enrollment_class_id,
      dateStr,
      session: daySessions[caNumber - 1],
      sessionNumber: caNumber,
      status,
      lesson_topic:
        rowDraft?.lesson_topic !== undefined
          ? rowDraft.lesson_topic.trim() || null
          : sharedLesson || undefined,
      teacher_note:
        rowDraft?.teacher_note !== undefined ? rowDraft.teacher_note.trim() || null : undefined,
      studentName: st.full_name,
    });
  };

  // Giá trị hiện của "bài học chung" của lớp cho 1 ca (ưu tiên nháp đang gõ, rồi tới dữ liệu đã lưu)
  const getClassLessonValue = (cls: Class, dateStr: string, caNumber: number): string => {
    const key = `${cls.id}_${dateStr}_s${caNumber}`;
    if (key in classLessonDrafts) return classLessonDrafts[key];
    const session = getDaySessions(cls.id, dateStr)[caNumber - 1];
    if (!session) return '';
    for (const st of getStudentsOfClass(cls)) {
      const t = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`)?.lesson_topic;
      if (t) return t;
    }
    return '';
  };

  // Trạng thái đã chấm của cả lớp trong 1 ca (để đếm trên pill chọn ca)
  const countMarkedInCa = (cls: Class, dateStr: string, caNumber: number): number => {
    const session = getDaySessions(cls.id, dateStr)[caNumber - 1];
    if (!session) return 0;
    return getStudentsOfClass(cls).filter(
      (st) => attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`)?.teacher_status
    ).length;
  };

  // Ô nhập Bài học chung cấp lớp cho 1 ca cụ thể (tự động xếp chồng Ca 1..Ca N khi phát sinh ca n+1)
  const renderClassCaLessonInput = (
    cls: Class,
    dateStr: string,
    caNumber: number,
    totalCa: number,
    isOneToOne: boolean
  ) => {
    const val = getClassLessonValue(cls, dateStr, caNumber);
    const isSelectedCa = getSelectedCa(cls.id, dateStr) === caNumber;
    return (
      <div key={caNumber} className="flex min-h-7 items-center gap-1.5">
        {totalCa > 1 && (
          <span
            onClick={() => setSelectedCa(cls.id, dateStr, caNumber)}
            className={`inline-flex h-6 shrink-0 cursor-pointer items-center rounded-md border px-1.5 text-[10px] font-extrabold transition ${
              isSelectedCa
                ? 'border-indigo-300 bg-indigo-100 text-indigo-900'
                : 'border-border/70 bg-white text-slate-500 hover:bg-slate-100'
            }`}
            title={`Ca ${caNumber}`}
          >
            Ca {caNumber}
          </span>
        )}
        <input
          type="text"
          value={val}
          onFocus={() => setSelectedCa(cls.id, dateStr, caNumber)}
          onChange={(e) =>
            setClassLessonDrafts((prev) => ({
              ...prev,
              [`${cls.id}_${dateStr}_s${caNumber}`]: e.target.value,
            }))
          }
          onBlur={() => handleSaveClassLesson(cls, dateStr, caNumber)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSaveClassLesson(cls, dateStr, caNumber);
            }
          }}
          placeholder={
            isOneToOne ? `Bài học Ca ${caNumber}...` : `Bài học chung Ca ${caNumber}...`
          }
          disabled={savingClassLessonKey === `classlesson_${cls.id}_${dateStr}_s${caNumber}`}
          className="h-7 w-full min-w-[120px] rounded-lg border border-indigo-300/70 bg-indigo-50/60 px-2.5 text-xs font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-primary/40"
          title={
            isOneToOne
              ? `Nhập tên bài học cho Ca ${caNumber}`
              : `Nhập 1 lần ở cấp lớp — tự động áp dụng cho học viên Ca ${caNumber}`
          }
        />
      </div>
    );
  };

  // Ô nhập Ghi chú GV riêng từng học viên cho 1 ca (tự động xếp chồng Ca 1..Ca N khi phát sinh ca n+1)
  const renderCaNoteInput = (
    cls: Class,
    st: EnrolledStudentItem,
    dateStr: string,
    caNumber: number,
    totalCa = 1
  ) => {
    const session = getDaySessions(cls.id, dateStr)[caNumber - 1];
    const att = session
      ? attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`)
      : undefined;
    const draftKey = `${st.enrollment_class_id}_${dateStr}_s${caNumber}`;
    const draft = inlineDrafts[draftKey];
    const lessonVal =
      draft?.lesson_topic !== undefined
        ? draft.lesson_topic
        : att?.lesson_topic || getClassLessonValue(cls, dateStr, caNumber);
    const noteVal = draft?.teacher_note !== undefined ? draft.teacher_note : att?.teacher_note || '';

    const persist = (nextLesson: string, nextNote: string) =>
      handleSaveLessonAndNote({
        classId: cls.id,
        enrollmentClassId: st.enrollment_class_id,
        dateStr,
        session,
        sessionNumber: caNumber,
        lessonTopic: nextLesson.trim() || null,
        teacherNote: nextNote.trim() || null,
        studentName: st.full_name,
        fromPopover: true,
      });

    return (
      <div key={caNumber} className="flex min-h-7 items-center gap-1.5">
        {totalCa > 1 && (
          <span className="inline-flex h-6 shrink-0 items-center rounded-md border border-border/70 bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">
            Ca {caNumber}
          </span>
        )}
        <input
          type="text"
          value={noteVal}
          onFocus={() => setSelectedCa(cls.id, dateStr, caNumber)}
          onChange={(e) => {
            const val = e.target.value;
            setInlineDrafts((prev) => ({
              ...prev,
              [draftKey]: { ...prev[draftKey], teacher_note: val },
            }));
            if (inlineTimersRef.current[draftKey]) clearTimeout(inlineTimersRef.current[draftKey]);
            inlineTimersRef.current[draftKey] = setTimeout(() => {
              delete inlineTimersRef.current[draftKey];
              persist(lessonVal, val);
            }, 600);
          }}
          onBlur={() => {
            if (inlineTimersRef.current[draftKey]) {
              clearTimeout(inlineTimersRef.current[draftKey]);
              delete inlineTimersRef.current[draftKey];
            }
            persist(lessonVal, noteVal);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              persist(lessonVal, noteVal);
            }
          }}
          placeholder={`Ghi chú riêng Ca ${caNumber}...`}
          className="h-7 w-full min-w-[120px] rounded-lg border border-border/80 bg-white px-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
    );
  };

  // Giá trị hiển thị chỉ đọc của Bài học / Ghi chú (tab Nhập: chỉ để nhìn, tự động tách theo từng Ca 1..Ca N)
  const renderCaReadonlyStack = (
    cls: Class,
    st: EnrolledStudentItem,
    dateStr: string,
    field: 'lesson_topic' | 'teacher_note'
  ) => {
    const totalCa = getVisibleCaCount(cls, dateStr);
    const daySessions = getDaySessions(cls.id, dateStr);
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: totalCa }, (_, idx) => {
          const caNumber = idx + 1;
          const session = daySessions[caNumber - 1];
          const att = session
            ? attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`)
            : undefined;
          const fallbackLesson =
            field === 'lesson_topic' ? getClassLessonValue(cls, dateStr, caNumber) : '';
          const text =
            (
              (field === 'lesson_topic' ? att?.lesson_topic || fallbackLesson : att?.teacher_note) ||
              ''
            ).trim();
          return (
            <div key={caNumber} className="flex min-h-7 items-center gap-1.5">
              {totalCa > 1 && (
                <span className="inline-flex h-5 shrink-0 items-center rounded border border-border/70 bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
                  Ca {caNumber}
                </span>
              )}
              {text ? (
                <span
                  className={`block truncate text-xs ${
                    field === 'lesson_topic'
                      ? 'font-medium text-teal-700'
                      : 'italic text-text-secondary'
                  }`}
                  title={text}
                >
                  {field === 'teacher_note' ? `"${text}"` : text}
                </span>
              ) : (
                <span className="text-[11px] text-text-muted">—</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Ô điểm danh gọn theo chuẩn Progressive Disclosure ở Tab 1 (Nhập điểm danh):
  // - Mặc định chưa chấm chỉ hiện dấu "—" + nút "+" nhỏ bên cạnh (giống Bảng tháng).
  // - Khi đã chấm, hiện chip gọn "Ca n: Mã · Trạng thái" (hoặc "Ca n: —" nếu ca đó chưa chấm).
  // - Bấm vào dấu "—" hoặc chip "Ca n: ..." mới bung thanh 6 trạng thái của đúng ca đó; chọn xong tự thu gọn lại.
  // - Bấm nút "+" tạo ngay Ca n+1 và đồng bộ thêm ô Bài học / Ghi chú cho Ca n+1.
  const renderQuickStatusCell = (cls: Class, st: EnrolledStudentItem, dateStr: string) => {
    const daySessions = getDaySessions(cls.id, dateStr);
    const totalCa = getVisibleCaCount(cls, dateStr);

    if (!isTeacher) {
      if (daySessions.length === 0) {
        return <span className="text-xs font-semibold text-text-muted">—</span>;
      }
      return (
        <div className="flex flex-col gap-1.5">
          {daySessions.map((sess, idx) => {
            const caNo = idx + 1;
            const sAtt = attendanceByEcAndSession.get(
              `${st.enrollment_class_id}_session_${sess.id}`
            );
            const stVal = (sAtt?.teacher_status || undefined) as AttendanceStatus | undefined;
            const cfg = stVal ? STATUS_CONFIG[stVal] : null;
            return (
              <div key={sess.id} className="flex min-h-7 items-center">
                <span
                  className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold ${
                    cfg
                      ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                      : 'border-border bg-slate-100 text-text-muted'
                  }`}
                  title={`Ca ${caNo}: ${cfg?.label || 'Chưa chấm'} — xem chi tiết ở tab Lịch sử & Bảng tháng`}
                >
                  <span className="text-[11px] font-extrabold opacity-80">Ca {caNo}:</span>
                  <span>{cfg ? `${cfg.short} · ${cfg.label}` : '—'}</span>
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    const QUICK_BUTTONS: Array<{ status: AttendanceStatus; code: string; shortLabel: string }> = [
      { status: 'ATTENDED', code: '1', shortLabel: 'Có mặt' },
      { status: 'ABSENT_APPROVED_A', code: 'A', shortLabel: 'Có phép' },
      { status: 'LEAVE_B', code: 'B', shortLabel: 'Bảo lưu' },
      { status: 'ABSENT_UNAPPROVED_C', code: 'C', shortLabel: 'Không phép' },
      { status: 'TEACHER_ABSENT_D', code: 'D', shortLabel: 'GV nghỉ' },
      { status: 'TECH_ERROR_E', code: 'E', shortLabel: 'Lỗi KT' },
    ];

    const isAddingCa = savingKey === `addca_${cls.id}_${dateStr}`;
    const isSavingRow = savingKey === `${st.enrollment_class_id}_${dateStr}`;

    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: totalCa }, (_, idx) => {
          const caNo = idx + 1;
          const sess = daySessions[caNo - 1];
          const att = sess
            ? attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${sess.id}`)
            : undefined;
          const tStatus = (att?.teacher_status || undefined) as AttendanceStatus | undefined;
          const cfg = tStatus ? STATUS_CONFIG[tStatus] : null;
          const pickerKey = `${st.enrollment_class_id}_${dateStr}_s${caNo}`;
          const isOpen = activeQuickPickerKey === pickerKey;
          const isLastCa = caNo === totalCa;

          return (
            <div key={caNo} className="flex min-h-7 flex-wrap items-center gap-1">
              {!isOpen ? (
                <>
                  <button
                    type="button"
                    disabled={isSavingRow || isFetching}
                    onClick={() => {
                      setSelectedCa(cls.id, dateStr, caNo);
                      setActiveQuickPickerKey(pickerKey);
                    }}
                    title={
                      cfg
                        ? `Ca ${caNo}: ${cfg.label} — bấm để đổi trạng thái`
                        : `Bấm để chọn trạng thái điểm danh Ca ${caNo} cho ${st.full_name}`
                    }
                    className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${
                      cfg
                        ? `${cfg.bg} ${cfg.text} ${cfg.border} shadow-2xs hover:ring-2 hover:ring-primary/40`
                        : 'min-w-9 border-border/80 bg-white text-slate-600 hover:border-primary/60 hover:bg-primary-soft/30 hover:text-primary'
                    } disabled:opacity-50`}
                  >
                    {cfg ? (
                      <>
                        <span className="text-[11px] font-extrabold opacity-80">Ca {caNo}:</span>
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

                  {isLastCa && (
                    <button
                      type="button"
                      disabled={isAddingCa || isFetching}
                      onClick={() => handleAddCaForClass(cls, dateStr, st)}
                      title={`Thêm Ca ${totalCa + 1} trong ngày này`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-primary/50 bg-white text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-primary/40 bg-white p-1 shadow-xs">
                  <span className="px-1.5 text-[11px] font-extrabold text-primary">
                    Ca {caNo}:
                  </span>
                  {QUICK_BUTTONS.map(({ status, code, shortLabel }) => {
                    const bCfg = STATUS_CONFIG[status];
                    const isSelected = tStatus === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        disabled={isSavingRow || isFetching}
                        onClick={async () => {
                          setActiveQuickPickerKey(null);
                          setSelectedCa(cls.id, dateStr, caNo);
                          await handleQuickMark(cls, st, dateStr, caNo, status);
                        }}
                        title={`${bCfg.label} (Ca ${caNo})`}
                        className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-bold transition ${
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
                    onClick={() => setActiveQuickPickerKey(null)}
                    title="Đóng (Esc)"
                    className="ml-0.5 inline-flex h-6 items-center rounded-md px-1.5 text-[11px] font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Render Attendance Cell cho Bảng tháng (Tab 2) — bấm mở ngăn chi tiết bên phải
  const renderMatrixDateCell = (cls: Class, st: EnrolledStudentItem, dateStr: string) => {
    const daySessions = sessionsByClassAndDate.get(`${cls.id}_${dateStr}`) || [];

    if (!isTeacher) {
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
          {daySessions.map((sess, idx) => {
            const sessionNumber = idx + 1;
            const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${sess.id}`);
            const tStatus = (att?.teacher_status || undefined) as AttendanceStatus | undefined;
            const cfg = tStatus ? STATUS_CONFIG[tStatus] : null;
            const hasNote = Boolean(att?.lesson_topic || att?.teacher_note);
            const tooltip = [
              `Ca ${sessionNumber} (GV): ${cfg?.label || 'Chưa điểm danh'}`,
              att?.lesson_topic ? `Bài học: ${att.lesson_topic}` : '',
              att?.teacher_note ? `Ghi chú GV: ${att.teacher_note}` : '',
            ]
              .filter(Boolean)
              .join(' | ');

            return (
              <button
                key={sess.id}
                type="button"
                onClick={() => openDrawer(cls, st, dateStr, sessionNumber)}
                title={tooltip}
                className={`relative inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[10px] font-extrabold transition hover:ring-1 hover:ring-primary ${
                  cfg
                    ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                    : 'border-border/60 bg-slate-100/80 text-text-muted'
                }`}
              >
                {cfg ? cfg.short : '—'}
                {hasNote && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-indigo-600" />
                )}
              </button>
            );
          })}
        </div>
      );
    }

    if (daySessions.length === 0) {
      return (
        <div className="flex min-h-9 w-full min-w-[52px] items-center justify-center px-1 py-1">
          <button
            type="button"
            onClick={() => openDrawer(cls, st, dateStr, 1)}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/60 bg-surface px-2 text-xs font-semibold text-text-muted transition hover:border-primary/50 hover:bg-surface-muted hover:text-text-primary"
            title={`Điểm danh ${st.full_name} ngày ${dateStr}, Ca 1`}
          >
            —
          </button>
        </div>
      );
    }

    const nextSessionNumber = daySessions.length + 1;

    return (
      <div className="group/cell flex min-h-9 w-full min-w-[60px] flex-wrap items-center justify-center gap-1 px-1 py-1">
        {daySessions.map((sess, idx) => {
          const sessionNumber = idx + 1;
          const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${sess.id}`);
          const tStatus = (att?.teacher_status || undefined) as AttendanceStatus | undefined;
          const cfg = tStatus ? STATUS_CONFIG[tStatus] : null;
          const hasNote = Boolean(att?.lesson_topic || att?.teacher_note);
          const tooltip = [
            `Ca ${sessionNumber}: ${cfg?.label || 'Chưa điểm danh'}`,
            att?.lesson_topic ? `Bài học: ${att.lesson_topic}` : '',
            att?.teacher_note ? `Ghi chú GV: ${att.teacher_note}` : '',
          ]
            .filter(Boolean)
            .join(' | ');

          return (
            <button
              key={sess.id}
              type="button"
              onClick={() => openDrawer(cls, st, dateStr, sessionNumber)}
              title={tooltip}
              className={`relative inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[10px] font-extrabold transition ${
                cfg
                  ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                  : 'border-border bg-surface text-text-muted hover:border-primary/50 hover:bg-surface-muted'
              }`}
            >
              {cfg ? cfg.short : sessionNumber}
              {hasNote && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-indigo-600" />
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => openDrawer(cls, st, dateStr, nextSessionNumber)}
          title={`Thêm ca học mới (Ca ${nextSessionNumber})`}
          className="inline-flex h-6 w-5 items-center justify-center rounded-md border border-dashed border-primary/50 text-xs font-extrabold text-primary opacity-0 group-hover/cell:opacity-100 focus:opacity-100 transition hover:bg-primary-soft"
        >
          +
        </button>
      </div>
    );
  };

  // Modal Create/Edit Class handlers
  const openModal = (cls?: Class) => {
    if (cls) {
      setEditingClass(cls);
      setFormData({
        class_name: cls.class_name,
        class_code: formatClassCode(cls.class_code, cls.id),
        model_type: normalizeModel(cls.model_type),
        attendance_source: cls.attendance_source,
        level: cls.level || '',
        active: cls.active,
      });
    } else {
      setEditingClass(null);
      setFormData({
        class_name: '',
        class_code: generateNextClassCode(),
        model_type: '1:1',
        attendance_source: 'LEARNING_SYSTEM',
        level: '',
        active: true,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClass(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.class_name.trim()) {
      toast.warning('Vui lòng nhập tên lớp học.');
      return;
    }

    try {
      if (editingClass) {
        const payload: UpdateClassDTO = {
          class_name: formData.class_name.trim(),
          class_code: formData.class_code.trim() || undefined,
          model_type: formData.model_type,
          attendance_source: formData.attendance_source,
          level: formData.level.trim() || undefined,
          active: formData.active,
        };
        await classesApi.update(editingClass.id, payload);
        toast.success('Cập nhật lớp học thành công!');
      } else {
        const payload: CreateClassDTO = {
          class_name: formData.class_name.trim(),
          class_code: formData.class_code.trim() || undefined,
          model_type: formData.model_type,
          attendance_source: formData.attendance_source,
          level: formData.level.trim() || undefined,
        };
        await classesApi.create(payload);
        toast.success('Tạo lớp học mới thành công!');
      }
      closeModal();
      fetchClasses();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const { data: allTeachersData = [] } = useQuery<Teacher[]>({
    queryKey: ['teachers', 'list'],
    queryFn: (signal) => teachersApi.list(undefined, signal),
    staleTime: 5 * 60 * 1000,
    keepPreviousData: true,
    enabled: canManageClasses,
    onError: () => {
      toast.error('Không thể tải danh sách giáo viên');
    },
  });

  const assignmentTeachers = useMemo(
    () => allTeachersData.filter((t) => t.active),
    [allTeachersData]
  );

  const openAssignmentModal = (cls: Class) => {
    setAssignmentClassId(cls.id);
    setEndingAssignmentId(null);
    setEndDateDraft(toLocalDateString(new Date()));
    setNewAssignment({
      teacher_id: '',
      role: 'MAIN',
      start_date: toLocalDateString(new Date()),
      end_date: '',
    });
    setIsAssignmentModalOpen(true);
  };

  const closeAssignmentModal = () => {
    if (assigningTeacher || endingAssignment) return;
    setIsAssignmentModalOpen(false);
    setAssignmentClassId(null);
    setEndingAssignmentId(null);
  };

  const handleConfirmEndAssignment = async (row: ClassTeacherAssignment) => {
    if (!assignmentClass) return;
    setEndingAssignment(true);
    try {
      await classesApi.endTeacherAssignment(assignmentClass.id, row.id, {
        end_date: endDateDraft || null,
      });
      toast.success(
        `Đã kết thúc phân công ${row.teacher?.name || 'giáo viên'} từ ngày ${formatAssignmentDate(endDateDraft)}`
      );
      setEndingAssignmentId(null);
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể kết thúc phân công giáo viên'
      );
    } finally {
      setEndingAssignment(false);
    }
  };

  const handleAssignTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentClass) return;
    const teacherId = Number(newAssignment.teacher_id);
    if (!teacherId) {
      toast.warning('Vui lòng chọn giáo viên cần phân công.');
      return;
    }
    setAssigningTeacher(true);
    try {
      await classesApi.assignTeacher(assignmentClass.id, {
        teacher_id: teacherId,
        role: newAssignment.role,
        start_date: newAssignment.start_date || undefined,
        end_date: newAssignment.end_date || undefined,
      });
      toast.success('Đã phân công giáo viên cho lớp học!');
      setNewAssignment({
        teacher_id: '',
        role: 'MAIN',
        start_date: toLocalDateString(new Date()),
        end_date: '',
      });
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể phân công giáo viên'
      );
    } finally {
      setAssigningTeacher(false);
    }
  };

  // Handle Quick Create Session + Note (Teacher only)
  const handleCreateQuickSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacher) return;
    const classId = Number(newSessionForm.class_id);
    if (!classId) {
      toast.warning('Vui lòng chọn lớp học.');
      return;
    }
    const targetCls = classes.find((c) => c.id === classId);
    if (!targetCls) return;

    setCreatingSession(true);
    try {
      const session = await classSessionsApi.create(classId, {
        session_date: newSessionForm.session_date,
        start_time: newSessionForm.start_time || undefined,
      });

      const students = getStudentsOfClass(targetCls);
      if (students.length > 0) {
        await attendanceApi.bulkMark(classId, session.id, {
          items: students.map((st) => ({
            enrollment_class_id: st.enrollment_class_id,
            status: newSessionForm.default_status,
            lesson_topic: newSessionForm.lesson_topic.trim() || null,
            teacher_note: newSessionForm.teacher_note.trim() || null,
          })),
          side: 'TEACHER',
        });
      }

      toast.success('Đã tạo buổi học và lưu bài học & ghi chú GV!');
      setIsNewSessionModalOpen(false);
      setNewSessionForm((prev) => ({
        ...prev,
        lesson_topic: '',
        teacher_note: '',
      }));
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể tạo buổi học'
      );
    } finally {
      setCreatingSession(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Lớp học & Điểm danh"
        actions={
          <div className="flex items-center gap-2">
            {isTeacher && (
              <Button
                onClick={() => {
                  setNewSessionForm((prev) => ({
                    ...prev,
                    class_id: classes[0]?.id ? String(classes[0].id) : '',
                  }));
                  setIsNewSessionModalOpen(true);
                }}
                variant="outline"
                size="sm"
                leftIcon={<BookOpen className="w-4 h-4 text-indigo-600" />}
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold"
              >
                + Thêm buổi học & Ghi chú
              </Button>
            )}
            {canManageClasses && (
              <Button
                onClick={() => openModal()}
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Thêm lớp học mới
              </Button>
            )}
          </div>
        }
      />

      {isTeacher && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-teal-50/90 border border-teal-200/90 text-xs text-teal-900 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold">Quy chuẩn điểm danh:</span>
            <span>
              <strong>Nhập điểm danh</strong> (chọn Ca → bấm trạng thái hoặc <em>Chấm Có mặt cả lớp</em> → điền 1 ô Bài học chung ở dòng lớp & Ghi chú riêng từng học viên) ·{' '}
              <strong>Lịch sử & Bảng tháng</strong> (xem lại ma trận/nhật ký, bấm vào buổi bất kỳ và chọn <em>Sửa</em> khi cần điều chỉnh).
            </span>
          </div>
          <Badge variant="accent">Phụ trách: {classes.length} lớp</Badge>
        </div>
      )}

      {/* 2 Tab lớn ở đầu trang giống giao diện điểm danh bên CSKH */}
      <HorizontalTabs
        ariaLabel="Chế độ điểm danh lớp học"
        value={activeTab}
        onChange={setActiveTab}
        className="mb-4"
        items={[
          { value: 'quick', label: 'Nhập điểm danh', icon: <Zap /> },
          { value: 'detailed', label: 'Lịch sử & Bảng tháng', icon: <ListChecks /> },
        ]}
      />

      <FilterBar
        title="Tìm kiếm & Lọc nhanh"
        activeCount={activeFiltersCount}
        onClear={() => {
          setSearchTerm('');
          setModelFilter('');
        }}
        gridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end"
      >
        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Tìm kiếm
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="VD: class_0001, Kaiwa, Nguyễn Văn A..."
              className="w-full h-9 pl-9 pr-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Mô hình lớp
          </label>
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
          >
            <option value="">Tất cả mô hình</option>
            <option value="1:1">1:1</option>
            <option value="1:2">1:2</option>
            <option value="1:n">1:n</option>
          </select>
        </div>
      </FilterBar>

      {/* DANH SÁCH LỚP & ĐIỂM DANH */}
      <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
        {/* Thanh điều khiển trên đầu bảng tùy theo Tab đang chọn */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/80 bg-slate-50/60 p-3 sm:px-4 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 shadow-2xs">
              <span>Hiển thị:</span>
              <span className="font-extrabold text-primary">{tableClasses.length}</span>
              <span className="text-text-muted">/ {classTotalCount} lớp học</span>
              <span className="text-border">•</span>
              <span className="font-bold text-text-primary">{tableStudentsCount}</span>
              <span className="text-text-muted">học viên</span>
            </span>

            {isFetching && !loading && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
                <span>Đang đồng bộ dữ liệu...</span>
              </span>
            )}

            {activeTab === 'quick' && (
              <label
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-muted select-none"
                title="Chỉ hiển thị các lớp có lịch học trùng thứ của ngày đang chọn hoặc đã có ca học trong ngày"
              >
                <input
                  type="checkbox"
                  checked={onlyClassesWithDaySessions}
                  onChange={(e) => setOnlyClassesWithDaySessions(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                />
                <span>Chỉ lớp có lịch ngày này ({relevantClassesOnDateCount})</span>
              </label>
            )}

            {multiStudentClasses.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleExpandAll}
                leftIcon={
                  allExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )
                }
                className="h-8 text-xs font-semibold"
              >
                {allExpanded ? 'Thu gọn lớp 1:n' : 'Mở rộng tất cả lớp 1:n'}
              </Button>
            )}
          </div>

          {/* Điều khiển ngày / kỳ bên phải giống bên CSKH */}
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {activeTab === 'quick' ? (
              <>
                <div className="flex h-10 items-center gap-1 rounded-xl border border-border/60 bg-surface p-1">
                  <button
                    type="button"
                    onClick={() => handleStepDay(-1)}
                    className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
                    title="Ngày hôm trước"
                    aria-label="Chuyển đến ngày hôm trước"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                    className="w-[132px] rounded-lg border-0 bg-transparent px-1 py-1 text-xs font-bold text-text-primary outline-none focus:ring-1 focus:ring-primary"
                    aria-label="Ngày điểm danh"
                  />
                  <button
                    type="button"
                    onClick={() => handleStepDay(1)}
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
                  onClick={() => setSelectedDate(toLocalDateString(new Date()))}
                  className="h-10 whitespace-nowrap px-3 text-xs font-bold"
                >
                  Hôm nay
                </Button>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {/* Bộ chọn kiểu xem Tab 2: Bảng tháng | Nhật ký bài học */}
                <div className="flex p-0.5 bg-surface-muted rounded-xl border border-border/60 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setDetailedViewMode('matrix')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      detailedViewMode === 'matrix'
                        ? 'bg-surface text-primary shadow-xs font-bold'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Bảng tháng
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailedViewMode('log')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      detailedViewMode === 'log'
                        ? 'bg-surface text-primary shadow-xs font-bold'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Nhật ký bài học ({periodSessionLogs.length})
                  </button>
                </div>

                {/* Bộ lọc thu gọn cột: Chỉ ngày có buổi */}
                {detailedViewMode === 'matrix' && (
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-muted select-none">
                    <input
                      type="checkbox"
                      checked={onlyDaysWithSessions}
                      onChange={(e) => setOnlyDaysWithSessions(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Chỉ ngày có buổi</span>
                  </label>
                )}

                {/* Bộ chọn chế độ kỳ: Theo tuần | Theo tháng */}
                <div className="flex p-0.5 bg-surface-muted rounded-xl border border-border/60 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setDetailedFilterMode('week')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      detailedFilterMode === 'week'
                        ? 'bg-surface text-primary shadow-xs font-bold'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Theo tuần
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailedFilterMode('month')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      detailedFilterMode === 'month'
                        ? 'bg-surface text-primary shadow-xs font-bold'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Theo tháng
                  </button>
                </div>

                {/* Bộ điều hướng kỳ */}
                <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-border/60">
                  <button
                    type="button"
                    onClick={() => handleStepPeriod(-1)}
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                    title="Kỳ trước"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2.5 text-xs font-bold text-text-primary select-none">
                    {detailedPeriodTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleStepPeriod(1)}
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                    title="Kỳ sau"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPeriodDate(new Date())}
                  className="text-xs h-8 px-2.5 font-bold"
                >
                  Hôm nay
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Bảng Lớp học & Điểm danh (hoặc Nhật ký bài học khi chọn ở Tab 2) */}
        {activeTab === 'detailed' && detailedViewMode === 'log' ? (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap w-28">Ngày học</th>
                  <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap w-16">Ca</th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[160px]">Lớp học</th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[170px]">Học viên</th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap w-32">Điểm danh GV</th>
                  <th className="px-3 py-3 border-r border-border/60 min-w-[220px] bg-indigo-50/50 text-indigo-950">Bài học</th>
                  <th className="px-3 py-3 border-r border-border/60 min-w-[260px] bg-indigo-50/50 text-indigo-950">Ghi chú GV</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {periodSessionLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-text-muted">
                      Chưa có buổi điểm danh nào trong kỳ đang chọn ({detailedPeriodTitle}).
                    </td>
                  </tr>
                ) : (
                  periodSessionLogs.map(({ key, cls, student, dateStr, caNumber, att }) => {
                    const tStatus = (att?.teacher_status || undefined) as AttendanceStatus | undefined;
                    const cfg = tStatus ? STATUS_CONFIG[tStatus] : null;
                    const [y, m, d] = dateStr.split('-');
                    const dateVN = y && m && d ? `${d}/${m}/${y}` : dateStr;
                    return (
                      <tr key={key} className="border-b border-border/60 hover:bg-slate-50/80 transition-colors">
                        <td className="px-3 py-2.5 border-r border-border/60 font-bold text-text-primary whitespace-nowrap">
                          {dateVN}
                        </td>
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-primary whitespace-nowrap">
                          Ca {caNumber}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60">
                          <div className="font-bold text-text-primary">{cls.class_name}</div>
                          <div className="font-mono text-[10px] text-text-muted">
                            {formatClassCode(cls.class_code, cls.id)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60">
                          <div className="font-bold text-text-primary">{student.full_name}</div>
                          <div className="font-mono text-[10px] text-text-muted">{student.external_id}</div>
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                          {cfg ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-extrabold ${cfg.bg} ${cfg.text} ${cfg.border}`}
                            >
                              <span>{cfg.short}</span>
                              <span>·</span>
                              <span>{cfg.label}</span>
                            </span>
                          ) : (
                            <span className="text-text-muted">Chưa chấm</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-xs font-medium text-teal-900">
                          {att?.lesson_topic || <span className="text-text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-xs text-text-secondary">
                          {att?.teacher_note || <span className="text-text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openDrawer(cls, student, dateStr, caNumber)}
                            className="inline-flex h-7 items-center rounded-lg border border-border/80 bg-white px-2.5 text-[11px] font-bold text-primary hover:bg-primary-soft transition"
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
        ) : (
        <div className="w-full overflow-x-auto select-none">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                <th
                  className={`px-3 py-3 border-r border-border/60 whitespace-nowrap w-28 min-w-[112px] ${
                    activeTab === 'detailed' ? 'sticky left-0 z-20 bg-slate-100' : ''
                  }`}
                >
                  Mã lớp
                </th>
                <th
                  className={`px-3 py-3 border-r border-border/60 whitespace-nowrap w-[155px] min-w-[155px] ${
                    activeTab === 'detailed'
                      ? 'sticky left-[112px] z-20 bg-slate-100'
                      : ''
                  }`}
                >
                  Tên lớp
                </th>
                <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap w-24">
                  Trình độ
                </th>
                <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap w-20">
                  Mô hình
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[130px]">
                  Giáo viên
                </th>
                <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                  Lịch học
                </th>
                <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap w-24">
                  Trạng thái
                </th>
                <th
                  className={`px-3 py-3 border-r-2 border-border/80 whitespace-nowrap min-w-[175px] ${
                    activeTab === 'detailed'
                      ? 'sticky left-[267px] z-20 bg-slate-100 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]'
                      : ''
                  }`}
                >
                  Học viên
                </th>

                {activeTab === 'quick' ? (
                  <>
                    {(() => {
                      const [y, m, day] = selectedDate.split('-').map(Number);
                      const d = new Date(y, m - 1, day);
                      const dateFormatted = `${d.getDate() < 10 ? `0${d.getDate()}` : d.getDate()}/${
                        d.getMonth() + 1 < 10 ? `0${d.getMonth() + 1}` : d.getMonth() + 1
                      }/${d.getFullYear()}`;
                      const dayOfWeek = DAY_OF_WEEK_NAMES[d.getDay()];

                      return (
                        <th className="px-3 py-2 border-r border-border/60 text-center bg-teal-50/70 text-teal-950 min-w-[290px]">
                          <div className="text-[12px] font-extrabold text-teal-950">
                            {isTeacher ? 'Điểm danh' : 'Điểm danh GV'}
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-teal-700 flex items-center justify-center gap-1 whitespace-nowrap">
                            <CalendarDays className="w-3 h-3 shrink-0" />
                            <span>
                              {dayOfWeek} {dateFormatted}
                            </span>
                          </div>
                        </th>
                      );
                    })()}
                    <>
                      <th className="px-3 py-2.5 border-r border-border/60 bg-indigo-50/50 text-indigo-950 min-w-[170px]">
                        <div className="text-[12px] font-extrabold">Bài học</div>
                      </th>
                      <th className="px-3 py-2.5 border-r border-border/60 bg-indigo-50/50 text-indigo-950 min-w-[200px]">
                        <div className="text-[12px] font-extrabold">Ghi chú GV</div>
                      </th>
                    </>
                  </>
                ) : (
                  <>
                    {/* 2 Cột thống kê nhanh trong Tab Lịch sử & Bảng tháng */}
                    <th className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap min-w-[95px] bg-emerald-50 text-emerald-900 font-extrabold">
                      Tổng đã học
                    </th>
                    <th className="px-3 py-2.5 border-r-2 border-border/80 text-center whitespace-nowrap min-w-[105px] bg-emerald-100/70 text-emerald-950 font-extrabold">
                      <div className="text-[10px] text-emerald-800 uppercase font-semibold">
                        Tháng {currentPeriodDate.getMonth() + 1}
                      </div>
                      <div>Trong tháng</div>
                    </th>

                    {/* Các cột Lịch Ngày của kỳ đang chọn */}
                    {visiblePeriodDates.map((d) => {
                      const dStr = toLocalDateString(d);
                      const isToday = toLocalDateString(new Date()) === dStr;
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const dayOfWeek = DAY_OF_WEEK_NAMES[d.getDay()];
                      return (
                        <th
                          key={dStr}
                          className={`px-1.5 py-2 border-r border-border/60 text-center min-w-[58px] transition-colors ${
                            isToday
                              ? 'bg-blue-50/90 text-primary border-primary/40 font-extrabold'
                              : isWeekend
                              ? 'bg-slate-100/50 text-text-muted'
                              : ''
                          }`}
                        >
                          <div className="font-bold text-[10px] text-text-muted leading-tight">
                            {dayOfWeek}
                          </div>
                          <div className="text-[12px] font-extrabold text-text-primary">
                            {String(d.getDate()).padStart(2, '0')}
                          </div>
                        </th>
                      );
                    })}
                  </>
                )}

                <th className="px-3 py-3 text-right whitespace-nowrap min-w-[110px]">
                  Thao tác
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={activeTab === 'quick' ? 12 : 11 + visiblePeriodDates.length}
                    className="py-12 text-center text-text-muted"
                  >
                    Đang tải danh sách lớp học & điểm danh...
                  </td>
                </tr>
              ) : tableClasses.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeTab === 'quick' ? 12 : 11 + visiblePeriodDates.length}
                    className="py-12 text-center text-text-muted"
                  >
                    {activeTab === 'quick' && onlyClassesWithDaySessions && filteredClasses.length > 0
                      ? 'Không có lớp nào có lịch hoặc ca học trong ngày đang chọn. Bỏ chọn "Chỉ lớp có lịch ngày này" để xem toàn bộ lớp.'
                      : isTeacher
                      ? 'Bạn chưa được phân công phụ trách lớp học nào.'
                      : 'Không tìm thấy lớp học nào phù hợp.'}
                  </td>
                </tr>
              ) : (
                pagedClasses.map((cls) => {
                  const formattedCode = formatClassCode(cls.class_code, cls.id);
                  const modelNorm = normalizeModel(cls.model_type);
                  const conf = MODEL_CONFIG[modelNorm] || MODEL_CONFIG['1:1'];
                  const students = getStudentsOfClass(cls);
                  const isOneToOne = modelNorm === '1:1' && students.length <= 1;
                  const singleStudent = isOneToOne ? students[0] : undefined;
                  const isExpanded = !collapsedClassIds.has(cls.id);
                  const mainTeacher =
                    cls.class_teachers?.find((t) => t.role === 'MAIN' && t.active !== false)?.teacher ||
                    cls.class_teachers?.find((t) => t.active !== false)?.teacher ||
                    cls.class_teachers?.find((t) => t.role === 'MAIN')?.teacher ||
                    cls.class_teachers?.[0]?.teacher;
                  const schedule = cls.class_schedules?.[0];

                  const singleStudentStat = singleStudent
                    ? studentAttendanceStats.get(singleStudent.enrollment_class_id)
                    : undefined;
                  const singleTotalAttended =
                    (singleStudent?.attended_previous_years || 0) +
                    (singleStudentStat?.totalAttended || 0);
                  const singleMonthAttended = singleStudentStat?.monthAttended || 0;

                  const classSumTotalAttended = students.reduce((acc, s) => {
                    const stStat = studentAttendanceStats.get(s.enrollment_class_id);
                    return acc + (s.attended_previous_years || 0) + (stStat?.totalAttended || 0);
                  }, 0);
                  const classSumMonthAttended = students.reduce((acc, s) => {
                    const stStat = studentAttendanceStats.get(s.enrollment_class_id);
                    return acc + (stStat?.monthAttended || 0);
                  }, 0);

                  return (
                    <React.Fragment key={cls.id}>
                      {/* DÒNG LỚP HỌC CHÍNH */}
                      <tr
                        className={`border-b border-border/70 transition-colors ${
                          isOneToOne
                            ? 'bg-surface hover:bg-slate-50/80'
                            : 'bg-slate-100/75 hover:bg-slate-100 font-semibold'
                        }`}
                      >
                        {/* Mã lớp chuẩn class_0001 */}
                        <td
                          className={`px-3 py-2.5 border-r border-border/60 whitespace-nowrap w-28 min-w-[112px] ${
                            activeTab === 'detailed'
                              ? `sticky left-0 z-10 ${isOneToOne ? 'bg-surface' : 'bg-slate-100'}`
                              : ''
                          }`}
                        >
                          <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-900 border border-slate-300 shadow-2xs">
                            {formattedCode}
                          </span>
                        </td>

                        {/* Tên lớp */}
                        <td
                          className={`px-3 py-2.5 border-r border-border/60 font-bold text-slate-900 text-xs whitespace-nowrap w-[155px] min-w-[155px] ${
                            activeTab === 'detailed'
                              ? `sticky left-[112px] z-10 ${
                                  isOneToOne ? 'bg-surface' : 'bg-slate-100'
                                }`
                              : ''
                          }`}
                        >
                          {cls.class_name}
                        </td>

                        {/* Trình độ */}
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                          {cls.level ? (
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {cls.level}
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>

                        {/* Mô hình */}
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${conf.className}`}
                          >
                            {conf.label}
                          </span>
                        </td>

                        {/* Giáo viên */}
                        <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-slate-800 text-xs whitespace-nowrap">
                          {mainTeacher ? (
                            mainTeacher.name
                          ) : (
                            <span className="italic text-slate-400">Chưa phân công</span>
                          )}
                        </td>

                        {/* Lịch học */}
                        <td className="px-3 py-2.5 border-r border-border/60 text-xs text-text-secondary whitespace-nowrap">
                          {schedule ? (
                            <span>
                              {schedule.schedule_pattern || 'Linh hoạt'}
                              {schedule.start_time ? ` · ${schedule.start_time}` : ''}
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>

                        {/* Trạng thái */}
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                          <Badge variant={cls.active ? 'success' : 'danger'} size="sm">
                            {cls.active ? 'Đang mở' : 'Đã đóng'}
                          </Badge>
                        </td>

                        {/* Cột Học viên */}
                        <td
                          className={`px-3 py-2.5 border-r-2 border-border/80 min-w-[175px] ${
                            activeTab === 'detailed'
                              ? `sticky left-[267px] z-10 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)] ${
                                  isOneToOne ? 'bg-surface' : 'bg-slate-100'
                                }`
                              : ''
                          }`}
                        >
                          {isOneToOne ? (
                            singleStudent ? (
                              <div>
                                <div className="font-bold text-text-primary">
                                  {singleStudent.full_name}
                                </div>
                                <div className="font-mono text-[10px] text-text-muted">
                                  {singleStudent.external_id}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs italic text-slate-400">
                                Chưa xếp học viên
                              </span>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleClassExpand(cls.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50/80 px-2.5 py-1 text-xs font-extrabold text-purple-900 hover:bg-purple-100 transition"
                            >
                              <Users className="w-3.5 h-3.5 text-purple-700" />
                              <span>{students.length} học viên</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                              )}
                            </button>
                          )}
                        </td>

                        {/* Cột Điểm danh & Bài học & Ghi chú tùy theo Tab */}
                        {activeTab === 'quick' ? (
                          <>
                            <td className="px-2.5 py-2 border-r border-border/60 bg-teal-50/20 align-top">
                              {isOneToOne ? (
                                singleStudent ? (
                                  renderQuickStatusCell(cls, singleStudent, selectedDate)
                                ) : (
                                  <span className="text-xs italic text-slate-400">
                                    Chưa có học viên
                                  </span>
                                )
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {isTeacher ? (
                                    Array.from(
                                      { length: getVisibleCaCount(cls, selectedDate) },
                                      (_, idx) => {
                                        const caNo = idx + 1;
                                        const totalCa = getVisibleCaCount(cls, selectedDate);
                                        const isLastCa = caNo === totalCa;
                                        const marked = countMarkedInCa(cls, selectedDate, caNo);
                                        const isBulkSaving =
                                          savingKey ===
                                          `class_${cls.id}_${selectedDate}_s${caNo}`;
                                        const isAddingCa =
                                          savingKey === `addca_${cls.id}_${selectedDate}`;
                                        return (
                                          <div
                                            key={caNo}
                                            className="flex min-h-7 flex-wrap items-center gap-1"
                                          >
                                            <button
                                              type="button"
                                              disabled={isBulkSaving || isFetching || students.length === 0}
                                              onClick={() => {
                                                setSelectedCa(cls.id, selectedDate, caNo);
                                                handleBulkMarkWholeClass(
                                                  cls,
                                                  selectedDate,
                                                  'ATTENDED',
                                                  caNo
                                                );
                                              }}
                                              title={`Chấm Có mặt cả lớp (${students.length} học viên) cho Ca ${caNo}`}
                                              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                                            >
                                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                                              <span>Ca {caNo}: Cả lớp Có mặt</span>
                                              {marked > 0 && (
                                                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-200/80 px-1 text-[10px] font-black text-emerald-900">
                                                  {marked}/{students.length}
                                                </span>
                                              )}
                                            </button>

                                            {isLastCa && (
                                              <button
                                                type="button"
                                                disabled={isAddingCa || isFetching}
                                                onClick={() =>
                                                  handleAddCaForClass(cls, selectedDate)
                                                }
                                                title={`Thêm Ca ${totalCa + 1} cho cả lớp`}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-primary/60 bg-white text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:opacity-50"
                                              >
                                                <Plus className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      }
                                    )
                                  ) : (
                                    <span className="text-[11px] text-text-muted">
                                      Mở rộng lớp để xem trạng thái từng học viên
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/15 select-text align-top">
                              {isTeacher ? (
                                <div className="flex flex-col gap-1.5">
                                  {Array.from(
                                    { length: getVisibleCaCount(cls, selectedDate) },
                                    (_, idx) =>
                                      renderClassCaLessonInput(
                                        cls,
                                        selectedDate,
                                        idx + 1,
                                        getVisibleCaCount(cls, selectedDate),
                                        isOneToOne
                                      )
                                  )}
                                </div>
                              ) : isOneToOne && singleStudent ? (
                                renderCaReadonlyStack(
                                  cls,
                                  singleStudent,
                                  selectedDate,
                                  'lesson_topic'
                                )
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {Array.from(
                                    { length: getVisibleCaCount(cls, selectedDate) },
                                    (_, idx) => {
                                      const caNo = idx + 1;
                                      const totalCa = getVisibleCaCount(cls, selectedDate);
                                      const val = getClassLessonValue(cls, selectedDate, caNo);
                                      return (
                                        <div
                                          key={caNo}
                                          className="flex min-h-7 items-center gap-1.5"
                                        >
                                          {totalCa > 1 && (
                                            <span className="inline-flex h-5 shrink-0 items-center rounded border border-border/70 bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
                                              Ca {caNo}
                                            </span>
                                          )}
                                          <span
                                            className="block truncate text-xs font-medium text-teal-700"
                                            title={val}
                                          >
                                            {val || (
                                              <span className="text-[11px] text-text-muted">—</span>
                                            )}
                                          </span>
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/15 select-text align-top">
                              {isOneToOne && singleStudent ? (
                                isTeacher ? (
                                  <div className="flex flex-col gap-1.5">
                                    {Array.from(
                                      { length: getVisibleCaCount(cls, selectedDate) },
                                      (_, idx) =>
                                        renderCaNoteInput(
                                          cls,
                                          singleStudent,
                                          selectedDate,
                                          idx + 1,
                                          getVisibleCaCount(cls, selectedDate)
                                        )
                                    )}
                                  </div>
                                ) : (
                                  renderCaReadonlyStack(
                                    cls,
                                    singleStudent,
                                    selectedDate,
                                    'teacher_note'
                                  )
                                )
                              ) : (
                                <span className="text-[11px] text-text-muted">—</span>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            {/* 2 Cột thống kê trong Tab Điểm danh chi tiết */}
                            <td className="px-3 py-2.5 border-r border-border/60 text-center font-extrabold text-emerald-800 bg-emerald-50/40">
                              {isOneToOne
                                ? singleStudent
                                  ? singleTotalAttended
                                  : 0
                                : classSumTotalAttended}
                            </td>
                            <td className="px-3 py-2.5 border-r-2 border-border/80 text-center font-extrabold text-emerald-800 bg-emerald-100/30">
                              {isOneToOne
                                ? singleStudent
                                  ? singleMonthAttended
                                  : 0
                                : classSumMonthAttended}
                            </td>

                            {/* Các Cột Lịch Ngày của kỳ đang chọn */}
                            {visiblePeriodDates.map((d) => {
                              const dStr = toLocalDateString(d);
                              return (
                                <td
                                  key={dStr}
                                  className="px-1 py-1.5 border-r border-border/60 text-center"
                                >
                                  {isOneToOne && singleStudent ? (
                                    renderMatrixDateCell(cls, singleStudent, dStr)
                                  ) : isTeacher && students.length > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleBulkMarkWholeClass(cls, dStr, 'ATTENDED')
                                      }
                                      disabled={savingKey === `class_${cls.id}_${dStr}_s1` || isFetching}
                                      title={`Chấm Có mặt cả lớp (${students.length} học viên) ngày ${dStr}`}
                                      className="inline-flex h-6 items-center justify-center gap-0.5 rounded-md border border-slate-300 bg-white px-1.5 text-[10px] font-semibold text-slate-600 transition hover:border-primary hover:bg-primary-soft hover:text-primary disabled:opacity-50"
                                    >
                                      <Check className="h-3 w-3 shrink-0" />
                                      <span>Cả lớp</span>
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">↓</span>
                                  )}
                                </td>
                              );
                            })}
                          </>
                        )}

                        {/* Cột Thao tác */}
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            {canManageClasses && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAssignmentModal(cls)}
                                leftIcon={<UserRoundCheck className="w-3.5 h-3.5" />}
                                title="Quản lý phân công giáo viên"
                                className="h-7 px-2 text-[11px] text-teal-700 border-teal-200 hover:bg-teal-50"
                              >
                                Phân công GV
                              </Button>
                            )}
                            {canManageClasses && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openModal(cls)}
                                leftIcon={
                                  <Edit className="w-3.5 h-3.5 text-slate-500 hover:text-blue-600" />
                                }
                                title="Chỉnh sửa thông tin lớp học"
                                className="h-7 px-1.5"
                              />
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* CÁC DÒNG HỌC VIÊN CON BÊN DƯỚI LỚP 1:2 / 1:N */}
                      {!isOneToOne &&
                        isExpanded &&
                        (students.length === 0 ? (
                          <tr className="border-b border-border/50 bg-slate-50/40">
                            <td colSpan={7} className="px-3 py-2 border-r border-border/50" />
                            <td
                              colSpan={
                                activeTab === 'quick'
                                  ? 5
                                  : 4 + visiblePeriodDates.length
                              }
                              className="px-3 py-2 text-xs italic text-slate-400"
                            >
                              Lớp chưa có học viên nào được gán.
                            </td>
                          </tr>
                        ) : (
                          students.map((st, sIdx) => {
                            const stStat = studentAttendanceStats.get(st.enrollment_class_id);
                            const stTotalAttended =
                              (st.attended_previous_years || 0) + (stStat?.totalAttended || 0);
                            const stMonthAttended = stStat?.monthAttended || 0;

                            return (
                              <tr
                                key={st.enrollment_class_id}
                                className="border-b border-border/50 bg-white hover:bg-blue-50/30 transition-colors"
                              >
                                <td
                                  className={`py-2 pl-[1cm] pr-3 border-r border-border/50 text-left font-mono text-[10px] text-slate-400 w-28 min-w-[112px] ${
                                    activeTab === 'detailed' ? 'sticky left-0 z-10 bg-white' : ''
                                  }`}
                                >
                                  {formattedCode}.{sIdx + 1}
                                </td>
                                <td
                                  className={`px-3 py-2 border-r border-border/50 text-[11px] text-slate-500 whitespace-nowrap w-[155px] min-w-[155px] ${
                                    activeTab === 'detailed'
                                      ? 'sticky left-[112px] z-10 bg-white'
                                      : ''
                                  }`}
                                >
                                  {cls.class_name}
                                </td>
                                <td className="px-2.5 py-2 border-r border-border/50 text-center text-[11px] text-slate-400">
                                  {cls.level || '—'}
                                </td>
                                <td className="px-2.5 py-2 border-r border-border/50 text-center text-[11px] text-slate-400">
                                  {conf.label}
                                </td>
                                <td className="px-3 py-2 border-r border-border/50 text-[11px] text-slate-400 whitespace-nowrap">
                                  {mainTeacher?.name || '—'}
                                </td>
                                <td className="px-3 py-2 border-r border-border/50 text-[11px] text-slate-400 whitespace-nowrap">
                                  {schedule?.schedule_pattern || '—'}
                                </td>
                                <td className="px-2.5 py-2 border-r border-border/50 text-center text-[11px] text-slate-400">
                                  —
                                </td>
                                <td
                                  className={`px-3 py-2 border-r-2 border-border/80 min-w-[175px] ${
                                    activeTab === 'detailed'
                                      ? 'sticky left-[267px] z-10 bg-purple-50/95 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]'
                                      : 'bg-purple-50/20'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <div className="font-bold text-text-primary">
                                        {st.full_name}
                                      </div>
                                      <div className="font-mono text-[10px] text-text-muted">
                                        {st.external_id}
                                      </div>
                                    </div>
                                    {st.package_name && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                        {st.package_name}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {activeTab === 'quick' ? (
                                  <>
                                    <td className="px-2.5 py-2 border-r border-border/60 bg-teal-50/10 align-top">
                                      {renderQuickStatusCell(cls, st, selectedDate)}
                                    </td>
                                    <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/10 select-text align-top">
                                      {renderCaReadonlyStack(cls, st, selectedDate, 'lesson_topic')}
                                    </td>
                                    <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/10 select-text align-top">
                                      {isTeacher ? (
                                        <div className="flex flex-col gap-1.5">
                                          {Array.from(
                                            { length: getVisibleCaCount(cls, selectedDate) },
                                            (_, idx) =>
                                              renderCaNoteInput(
                                                cls,
                                                st,
                                                selectedDate,
                                                idx + 1,
                                                getVisibleCaCount(cls, selectedDate)
                                              )
                                          )}
                                        </div>
                                      ) : (
                                        renderCaReadonlyStack(cls, st, selectedDate, 'teacher_note')
                                      )}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-3 py-2 border-r border-border/60 text-center font-extrabold text-emerald-800 bg-emerald-50/40">
                                      {stTotalAttended}
                                    </td>
                                    <td className="px-3 py-2 border-r-2 border-border/80 text-center font-extrabold text-emerald-800 bg-emerald-100/30">
                                      {stMonthAttended}
                                    </td>
                                    {visiblePeriodDates.map((d) => {
                                      const dStr = toLocalDateString(d);
                                      return (
                                        <td
                                          key={dStr}
                                          className="px-1 py-1 border-r border-border/60 text-center"
                                        >
                                          {renderMatrixDateCell(cls, st, dStr)}
                                        </td>
                                      );
                                    })}
                                  </>
                                )}

                                <td className="px-3 py-1.5 text-right text-[11px] text-text-muted">
                                  —
                                </td>
                              </tr>
                            );
                          })
                        ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Phân trang danh sách lớp */}
        {classTotalCount > 0 && (
          <PaginationFooter
            startRecord={classStartRecord}
            endRecord={classEndRecord}
            totalCount={classTotalCount}
            pageSize={classPageSize}
            currentPage={classPageSafe}
            totalPages={classTotalPages}
            onPageChange={setClassPage}
            onPageSizeChange={(size) => {
              setClassPageSize(size);
              setClassPage(1);
            }}
            recordLabel="lớp học"
          />
        )}

        {/* Chú thích mã trạng thái ở chân bảng giống bên CSKH */}
        <div className="p-3.5 px-4 border-t border-border/80 bg-surface-muted/30 flex flex-wrap items-center justify-between gap-4 text-xs text-text-secondary">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-text-primary">Chú thích mã trạng thái:</span>
            {Object.entries(STATUS_CONFIG).map(([key, opt]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-extrabold border ${opt.bg.replace(
                    /\s*hover:\S+/g,
                    ''
                  )} ${opt.text} ${opt.border}`}
                >
                  {opt.short}
                </span>
                <span>{key === 'ATTENDED' ? 'Có mặt (Điền số buổi: 1, 2...)' : opt.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-600 border border-white shadow-2xs" />
              <span>Có Bài học / Ghi chú GV</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ngăn chi tiết ca học (Drawer) — GV xem/sửa 1 buổi */}
      <AttendanceSessionDrawer
        isOpen={!!drawerState}
        onClose={() => setDrawerState(null)}
        studentName={drawerState?.studentName || ''}
        studentCode={drawerState?.studentCode}
        className={classes.find((c) => c.id === drawerState?.classId)?.class_name}
        classCode={(() => {
          const c = classes.find((x) => x.id === drawerState?.classId);
          return c ? formatClassCode(c.class_code, c.id) : undefined;
        })()}
        dateStr={drawerState?.dateStr || ''}
        daySessions={
          drawerState ? getDaySessions(drawerState.classId, drawerState.dateStr) : []
        }
        selectedSessionNumber={drawerState?.caNumber || 1}
        onSelectSessionNumber={(caNumber) =>
          setDrawerState((prev) => (prev ? { ...prev, caNumber } : prev))
        }
        getAttendanceForSession={(session) =>
          session && drawerState
            ? attendanceByEcAndSession.get(`${drawerState.enrollmentClassId}_session_${session.id}`)
            : undefined
        }
        side="TEACHER"
        defaultEditing={drawerState?.defaultEditing}
        canEditTeacherFields={isTeacher}
        canEditCsFields={false}
        canMarkStatus={isTeacher}
        saving={!!savingKey}
        onSaveStatusAndNotes={async ({ session, sessionNumber, status, lesson_topic, teacher_note }) => {
          if (!drawerState || !isTeacher) return;
          await handleMarkAttendanceAndNote({
            classId: drawerState.classId,
            enrollmentClassId: drawerState.enrollmentClassId,
            dateStr: drawerState.dateStr,
            session,
            sessionNumber,
            status,
            lesson_topic,
            teacher_note,
            studentName: drawerState.studentName,
          });
        }}
        onSaveNotesOnly={async ({ session, sessionNumber, lesson_topic, teacher_note }) => {
          if (!drawerState || !isTeacher) return;
          await handleSaveLessonAndNote({
            classId: drawerState.classId,
            enrollmentClassId: drawerState.enrollmentClassId,
            dateStr: drawerState.dateStr,
            session,
            sessionNumber,
            lessonTopic: lesson_topic ?? null,
            teacherNote: teacher_note ?? null,
            studentName: drawerState.studentName,
            fromPopover: true,
          });
        }}
        onClearStatus={async (session) => {
          if (!drawerState || !isTeacher) return;
          await handleClearAttendance(drawerState.classId, drawerState.enrollmentClassId, session);
        }}
      />

      {/* Modal "+ Thêm buổi học & Ghi chú" nhanh (dành riêng cho Giáo viên) */}
      {isTeacher && (
        <Modal
          isOpen={isNewSessionModalOpen}
          onClose={() => setIsNewSessionModalOpen(false)}
          title="Thêm buổi học mới & Ghi chú của Giáo viên"
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsNewSessionModalOpen(false)}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                size="sm"
                form="quick-session-form"
                type="submit"
                disabled={creatingSession}
              >
                {creatingSession ? 'Đang lưu...' : 'Tạo buổi học & Lưu ghi chú'}
              </Button>
            </div>
          }
        >
          <form id="quick-session-form" onSubmit={handleCreateQuickSession} className="space-y-4">
            <Select
              label="Chọn Lớp học *"
              required
              value={newSessionForm.class_id}
              onChange={(e) => setNewSessionForm({ ...newSessionForm, class_id: e.target.value })}
              options={[
                { value: '', label: '-- Chọn lớp học --' },
                ...classes.map((c) => ({
                  value: String(c.id),
                  label: `${formatClassCode(c.class_code, c.id)} — ${c.class_name} (${normalizeModel(
                    c.model_type
                  )})`,
                })),
              ]}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Ngày học *"
                type="date"
                required
                value={newSessionForm.session_date}
                onChange={(e) =>
                  setNewSessionForm({ ...newSessionForm, session_date: e.target.value })
                }
              />
              <Input
                label="Giờ học"
                type="text"
                value={newSessionForm.start_time}
                onChange={(e) =>
                  setNewSessionForm({ ...newSessionForm, start_time: e.target.value })
                }
                placeholder="VD: 19:30"
              />
            </div>

            <Select
              label="Trạng thái điểm danh mặc định cho học viên trong lớp"
              value={newSessionForm.default_status}
              onChange={(e) =>
                setNewSessionForm({
                  ...newSessionForm,
                  default_status: e.target.value as AttendanceStatus,
                })
              }
              options={POPOVER_STATUS_OPTIONS.map((o) => ({
                value: o.status,
                label: o.label,
              }))}
            />

            <Input
              label="Bài học / Lesson (lesson_topic)"
              value={newSessionForm.lesson_topic}
              onChange={(e) =>
                setNewSessionForm({ ...newSessionForm, lesson_topic: e.target.value })
              }
              placeholder="VD: Bài 5 - Ngữ pháp N4, Kaiwa chủ đề Gia đình..."
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ghi chú của Giáo viên theo buổi (teacher_note)
              </label>
              <textarea
                rows={3}
                value={newSessionForm.teacher_note}
                onChange={(e) =>
                  setNewSessionForm({ ...newSessionForm, teacher_note: e.target.value })
                }
                placeholder="Nhận xét tình hình học tập của học viên trong buổi học, bài tập về nhà..."
                className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Thêm/Sửa Lớp học */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingClass ? 'Chỉnh sửa Lớp học' : 'Tạo Lớp học Mới'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={closeModal}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" form="class-form" type="submit">
              {editingClass ? 'Lưu thay đổi' : 'Tạo lớp học'}
            </Button>
          </div>
        }
      >
        <form id="class-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Tên lớp học *"
            required
            value={formData.class_name}
            onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
            placeholder="VD: Lớp Tiếng Nhật N5 - K01..."
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Mã lớp học
              </label>
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, class_code: generateNextClassCode() }))
                }
                className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                title="Tạo mã chuẩn dạng class_0001, class_0002..."
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gợi ý mã lớp tiếp theo</span>
              </button>
            </div>
            <Input
              value={formData.class_code}
              onChange={(e) => setFormData({ ...formData, class_code: e.target.value })}
              placeholder="Để trống để hệ thống tự cấp mã (VD: class_0001)..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Mô hình lớp *"
              required
              value={formData.model_type}
              onChange={(e) => setFormData({ ...formData, model_type: e.target.value as any })}
              options={[
                { value: '1:1', label: '1:1' },
                { value: '1:2', label: '1:2' },
                { value: '1:n', label: '1:n' },
              ]}
            />
            <Input
              label="Trình độ / Level"
              value={formData.level}
              onChange={(e) => setFormData({ ...formData, level: e.target.value })}
              placeholder="VD: N5, N4, Giao tiếp..."
            />
          </div>

          <Select
            label="Nguồn điểm danh"
            value={formData.attendance_source}
            onChange={(e) =>
              setFormData({ ...formData, attendance_source: e.target.value as any })
            }
            options={[
              { value: 'LEARNING_SYSTEM', label: 'Hệ thống (LMS)' },
              { value: 'ZOOM', label: 'Học qua Zoom' },
            ]}
          />

          {editingClass && (
            <div className="flex items-center pt-2">
              <input
                id="class-active"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <label htmlFor="class-active" className="ml-2 block text-xs font-semibold text-slate-700">
                Đang mở lớp hoạt động
              </label>
            </div>
          )}
        </form>
      </Modal>

      {/* Modal Phân công Giáo viên */}
      <Modal
        isOpen={isAssignmentModalOpen && !!assignmentClass}
        onClose={closeAssignmentModal}
        title={
          assignmentClass
            ? `Phân công Giáo viên — ${assignmentClass.class_name}`
            : 'Phân công Giáo viên'
        }
        size="lg"
        closeOnOutsideClick={!assigningTeacher && !endingAssignment}
        footer={
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={closeAssignmentModal}
              disabled={assigningTeacher || endingAssignment}
            >
              Đóng
            </Button>
          </div>
        }
      >
        {assignmentClass && (
          <div className="space-y-6">
            {/* Danh sách phân công hiện có */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2.5">
                Danh sách phân công hiện tại
              </h4>
              {!assignmentClass.class_teachers || assignmentClass.class_teachers.length === 0 ? (
                <div className="rounded-xl border border-border/70 bg-slate-50/70 p-4 text-center text-xs text-text-muted italic">
                  Lớp học chưa có phân công giáo viên nào.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border/80">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-text-secondary border-b border-border/80">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Giáo viên</th>
                        <th className="px-3 py-2 font-semibold">Vai trò</th>
                        <th className="px-3 py-2 font-semibold">Trạng thái</th>
                        <th className="px-3 py-2 font-semibold">Từ ngày</th>
                        <th className="px-3 py-2 font-semibold">Đến ngày</th>
                        {isAdmin && <th className="px-3 py-2 font-semibold text-right">Thao tác</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-white">
                      {assignmentClass.class_teachers.map((row) => {
                        const roleCfg = TEACHER_ROLE_CONFIG[row.role] || {
                          label: row.role,
                          variant: 'neutral' as const,
                        };
                        const isEndingThisRow = endingAssignmentId === row.id;

                        return (
                          <tr key={row.id} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-text-primary">
                                {row.teacher?.name || `GV #${row.teacher_id}`}
                              </div>
                              <div className="text-[11px] font-mono text-text-muted">
                                {row.teacher?.code || '—'}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <Badge variant={roleCfg.variant} size="sm">
                                {roleCfg.label}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {row.active ? (
                                <Badge variant="success" size="sm" dot>
                                  Đang phân công
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  Đã kết thúc
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap text-text-secondary">
                              {formatAssignmentDate(row.start_date)}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap text-text-secondary">
                              {formatAssignmentDate(row.end_date)}
                            </td>
                            {isAdmin && (
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                {row.active && !isEndingThisRow && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => {
                                      setEndingAssignmentId(row.id);
                                      setEndDateDraft(toLocalDateString(new Date()));
                                    }}
                                    className="h-7 px-2 text-[11px] text-rose-600 border-rose-200 hover:bg-rose-50"
                                  >
                                    Kết thúc phân công
                                  </Button>
                                )}
                                {row.active && isEndingThisRow && (
                                  <div className="inline-flex items-center gap-1.5">
                                    <input
                                      type="date"
                                      value={endDateDraft}
                                      onChange={(e) => setEndDateDraft(e.target.value)}
                                      disabled={endingAssignment}
                                      className="h-7 rounded-lg border border-border px-2 text-xs text-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      type="button"
                                      disabled={endingAssignment}
                                      onClick={() => handleConfirmEndAssignment(row)}
                                      className="h-7 px-2 text-[11px]"
                                    >
                                      {endingAssignment ? 'Đang lưu...' : 'Xác nhận kết thúc'}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      type="button"
                                      disabled={endingAssignment}
                                      onClick={() => setEndingAssignmentId(null)}
                                      className="h-7 px-2 text-[11px]"
                                    >
                                      Hủy
                                    </Button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Thêm phân công mới */}
            <form
              onSubmit={handleAssignTeacherSubmit}
              className="rounded-xl border border-border/80 bg-slate-50/60 p-4 space-y-3"
            >
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Thêm phân công
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Giáo viên *"
                  value={newAssignment.teacher_id}
                  onChange={(e) =>
                    setNewAssignment((prev) => ({ ...prev, teacher_id: e.target.value }))
                  }
                  options={[
                    { value: '', label: 'Chọn giáo viên...' },
                    ...assignmentTeachers.map((t) => ({
                      value: t.id,
                      label: `${t.name} · ${t.code}`,
                    })),
                  ]}
                />
                <Select
                  label="Vai trò *"
                  value={newAssignment.role}
                  onChange={(e) =>
                    setNewAssignment((prev) => ({
                      ...prev,
                      role: e.target.value as ClassTeacherRole,
                    }))
                  }
                  options={[
                    { value: 'MAIN', label: 'Giáo viên chính' },
                    { value: 'ASSISTANT', label: 'Giáo viên phụ' },
                    { value: 'SUBSTITUTE', label: 'Giáo viên dạy thay' },
                  ]}
                />
                <Input
                  type="date"
                  label="Ngày bắt đầu"
                  value={newAssignment.start_date}
                  onChange={(e) =>
                    setNewAssignment((prev) => ({ ...prev, start_date: e.target.value }))
                  }
                />
                <Input
                  type="date"
                  label="Ngày kết thúc (tùy chọn)"
                  value={newAssignment.end_date}
                  onChange={(e) =>
                    setNewAssignment((prev) => ({ ...prev, end_date: e.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={assigningTeacher}
                  leftIcon={<UserRoundCheck className="w-3.5 h-3.5" />}
                >
                  {assigningTeacher ? 'Đang phân công...' : 'Phân công'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};
