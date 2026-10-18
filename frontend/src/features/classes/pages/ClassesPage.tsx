import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { classesApi } from '../api/classes.api';
import { classSessionsApi, attendanceApi } from '../api/sessions.api';
import {
  Class,
  ClassSession,
  Attendance,
  AttendanceStatus,
  CreateClassDTO,
  UpdateClassDTO,
  formatClassCode,
} from '../types/classes.types';
import { formatSessionDate, toLocalDateString } from '../components/AttendanceMatrix';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar } from '../../../components/common/FilterBar';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Edit,
  Plus,
  Calendar,
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  BookOpen,
  Save,
  Users,
  ClipboardCheck,
  MessageSquare,
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

type ClassesTab = 'attendance' | 'sessions';
type CalendarViewMode = 'day' | 'week' | 'month';

interface EnrolledStudentItem {
  enrollment_class_id: number;
  class_id: number;
  student_id: number;
  full_name: string;
  external_id: string;
  phone?: string;
  package_name?: string;
  total_sessions?: number;
}

export const ClassesPage: React.FC = () => {
  const { user } = useAuth();
  const isTeacher = Boolean(
    user?.roles?.includes('TEACHER') &&
      !user?.roles?.includes('ADMIN') &&
      !user?.roles?.includes('MANAGE')
  );
  const canManageClasses = Boolean(user?.roles?.some((r) => ['ADMIN', 'MANAGE'].includes(r)));

  const toast = useToast();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);

  // Page Tabs: 'attendance' (Lớp học & Điểm danh trực tiếp) | 'sessions' (Buổi học & Ghi chú GV)
  const [activeTab, setActiveTab] = useState<ClassesTab>('attendance');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState('');

  // Calendar view state for Tab 1
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day');
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString(new Date()));
  const [currentPeriodDate, setCurrentPeriodDate] = useState<Date>(() => new Date());

  //Collapsed state for 1:2 / 1:n classes (empty set = all expanded by default!)
  const [collapsedClassIds, setCollapsedClassIds] = useState<Set<number>>(new Set());

  // Inline note/lesson draft edits keyed by `${enrollment_class_id}_${dateStr}` or `${enrollment_class_id}_session_${sessionId}`
  const [inlineDrafts, setInlineDrafts] = useState<
    Record<string, { lesson_topic?: string; teacher_note?: string; status?: AttendanceStatus }>
  >({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Popover state for Week / Month matrix cells (or Day multiple sessions)
  const [activePopover, setActivePopover] = useState<{
    anchorEl: HTMLElement;
    classId: number;
    enrollmentClassId: number;
    studentName: string;
    dateStr: string;
    session?: ClassSession;
    sessionNumber: number;
  } | null>(null);
  const [popoverLesson, setPopoverLesson] = useState('');
  const [popoverNote, setPopoverNote] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Tab 2 (Buổi học) filters & Quick Create Session Modal
  const [sessionClassFilter, setSessionClassFilter] = useState<string>('');
  const [sessionScope, setSessionScope] = useState<'month' | 'all'>('month');
  const [sessionMonthDate, setSessionMonthDate] = useState<Date>(() => new Date());
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

  const fetchClasses = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await classesApi.list();
      setClasses(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách lớp học');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  // Close popover on click outside / Escape
  useEffect(() => {
    if (!activePopover) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!activePopover.anchorEl.contains(target) && !popoverRef.current?.contains(target)) {
        setActivePopover(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePopover(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePopover]);

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
      });
    });
    return list;
  };

  // Build lookup maps from classes payload
  const { sessionsByClassAndDate, attendanceByEcAndSession, allSessionsList } = useMemo(() => {
    const sessMap = new Map<string, ClassSession[]>();
    const attMap = new Map<string, Attendance>();
    const flatSessions: Array<{ cls: Class; session: ClassSession }> = [];

    classes.forEach((cls) => {
      const classSessById = new Map<number, ClassSession>();

      cls.class_sessions?.forEach((s: any) => {
        classSessById.set(s.id, s);
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
        flatSessions.push({ cls, session: s });
      });
    });

    sessMap.forEach((list) =>
      list.sort(
        (a, b) =>
          (a.start_time || '').localeCompare(b.start_time || '') ||
          a.session_number - b.session_number ||
          a.id - b.id
      )
    );

    return {
      sessionsByClassAndDate: sessMap,
      attendanceByEcAndSession: attMap,
      allSessionsList: flatSessions,
    };
  }, [classes]);

  // Filtered classes
  const filteredClasses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
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
  }, [classes, searchTerm, modelFilter]);

  const activeFiltersCount = (searchTerm ? 1 : 0) + (modelFilter ? 1 : 0);

  // Dates list for Week / Month view in Tab 1
  const periodDates = useMemo(() => {
    const dates: Date[] = [];
    const year = currentPeriodDate.getFullYear();
    const month = currentPeriodDate.getMonth();

    if (viewMode === 'week') {
      const day = currentPeriodDate.getDay();
      const diff = currentPeriodDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(year, month, diff);
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d);
      }
    } else if (viewMode === 'month') {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        dates.push(new Date(year, month, i));
      }
    }
    return dates;
  }, [currentPeriodDate, viewMode]);

  // Stepper handlers for Day / Week / Month
  const handleStepDay = (delta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + delta);
    setSelectedDate(toLocalDateString(next));
  };

  const handleStepPeriod = (delta: number) => {
    const next = new Date(currentPeriodDate);
    if (viewMode === 'week') {
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

  // Core Attendance & Lesson/Note save action (Side: TEACHER)
  const handleMarkAttendanceAndNote = async (params: {
    classId: number;
    enrollmentClassId: number;
    dateStr: string;
    session?: ClassSession;
    status: AttendanceStatus;
    lesson_topic?: string | null;
    teacher_note?: string | null;
    studentName?: string;
  }) => {
    const { classId, enrollmentClassId, dateStr, status, lesson_topic, teacher_note, studentName } =
      params;
    const key = `${enrollmentClassId}_${dateStr}`;
    setSavingKey(key);
    try {
      let targetSession = params.session;
      if (!targetSession) {
        const existing = sessionsByClassAndDate.get(`${classId}_${dateStr}`) || [];
        targetSession = existing[0];
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
      setActivePopover(null);
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

  // Save only Lesson & Teacher Note (or create attendance if not yet marked)
  const handleSaveLessonAndNote = async (params: {
    classId: number;
    enrollmentClassId: number;
    dateStr: string;
    session?: ClassSession;
    lessonTopic: string | null;
    teacherNote: string | null;
    studentName?: string;
  }) => {
    const { classId, enrollmentClassId, dateStr, lessonTopic, teacherNote, studentName } = params;
    const key = `${enrollmentClassId}_${dateStr}`;
    setSavingKey(key);
    try {
      let targetSession = params.session;
      if (!targetSession) {
        const existing = sessionsByClassAndDate.get(`${classId}_${dateStr}`) || [];
        targetSession = existing[0];
      }
      if (!targetSession) {
        targetSession = await classSessionsApi.create(classId, { session_date: dateStr });
      }

      const existingAtt = attendanceByEcAndSession.get(
        `${enrollmentClassId}_session_${targetSession.id}`
      );

      if (existingAtt) {
        await attendanceApi.update(classId, targetSession.id, existingAtt.id, {
          side: 'TEACHER',
          lesson_topic: lessonTopic,
          teacher_note: teacherNote,
        });
      } else {
        await attendanceApi.mark(classId, targetSession.id, {
          enrollment_class_id: enrollmentClassId,
          status: 'ATTENDED',
          side: 'TEACHER',
          lesson_topic: lessonTopic,
          teacher_note: teacherNote,
        });
      }

      setInlineDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        delete next[`${enrollmentClassId}_session_${targetSession!.id}`];
        return next;
      });
      setActivePopover(null);
      toast.success(`Đã lưu Bài học & Ghi chú GV${studentName ? ` cho ${studentName}` : ''}`);
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể lưu ghi chú buổi học'
      );
    } finally {
      setSavingKey(null);
    }
  };

  // Chấm cả lớp 1:2 / 1:n Có mặt trong 1 chạm
  const handleBulkMarkWholeClass = async (cls: Class, dateStr: string, status: AttendanceStatus = 'ATTENDED') => {
    const students = getStudentsOfClass(cls);
    if (students.length === 0) {
      toast.warning('Lớp học chưa có học viên nào.');
      return;
    }
    const key = `class_${cls.id}_${dateStr}`;
    setSavingKey(key);
    try {
      const existing = sessionsByClassAndDate.get(`${cls.id}_${dateStr}`) || [];
      let targetSession = existing[0];
      if (!targetSession) {
        targetSession = await classSessionsApi.create(cls.id, { session_date: dateStr });
      }

      await attendanceApi.bulkMark(cls.id, targetSession.id, {
        items: students.map((s) => {
          const draft = inlineDrafts[`${s.enrollment_class_id}_${dateStr}`];
          return {
            enrollment_class_id: s.enrollment_class_id,
            status,
            ...(draft?.lesson_topic !== undefined ? { lesson_topic: draft.lesson_topic.trim() || null } : {}),
            ...(draft?.teacher_note !== undefined ? { teacher_note: draft.teacher_note.trim() || null } : {}),
          };
        }),
        side: 'TEACHER',
      });

      toast.success(
        `Đã chấm ${STATUS_CONFIG[status].label} cho toàn bộ ${students.length} học viên lớp ${formatClassCode(cls.class_code, cls.id)}`
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
    const existingAtt = attendanceByEcAndSession.get(`${enrollmentClassId}_session_${session.id}`);
    if (!existingAtt) return;
    setSavingKey(`${enrollmentClassId}_${formatSessionDate(session.session_date)}`);
    try {
      await attendanceApi.remove(classId, session.id, existingAtt.id, 'TEACHER');
      setActivePopover(null);
      toast.info('Đã xóa trạng thái điểm danh');
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa điểm danh');
    } finally {
      setSavingKey(null);
    }
  };

  // Render Lesson input inline on Day View
  const renderDayLessonInput = (cls: Class, st: EnrolledStudentItem, dateStr: string) => {
    const daySessions = sessionsByClassAndDate.get(`${cls.id}_${dateStr}`) || [];
    const primarySession = daySessions[0];
    const att = primarySession
      ? attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${primarySession.id}`)
      : undefined;

    const draftKey = `${st.enrollment_class_id}_${dateStr}`;
    const draft = inlineDrafts[draftKey];
    const lessonVal = draft?.lesson_topic !== undefined ? draft.lesson_topic : att?.lesson_topic || '';
    const noteVal = draft?.teacher_note !== undefined ? draft.teacher_note : att?.teacher_note || '';

    const triggerSave = () => {
      handleSaveLessonAndNote({
        classId: cls.id,
        enrollmentClassId: st.enrollment_class_id,
        dateStr,
        session: primarySession,
        lessonTopic: lessonVal.trim() || null,
        teacherNote: noteVal.trim() || null,
        studentName: st.full_name,
      });
    };

    return (
      <input
        type="text"
        value={lessonVal}
        onChange={(e) => {
          const val = e.target.value;
          setInlineDrafts((prev) => ({
            ...prev,
            [draftKey]: {
              ...prev[draftKey],
              lesson_topic: val,
            },
          }));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            triggerSave();
          }
        }}
        placeholder="Nhập bài học..."
        className="w-full min-w-[130px] h-8 px-2.5 rounded-lg border border-border/80 bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    );
  };

  // Render Teacher Note input + Save button inline on Day View
  const renderDayNoteInput = (cls: Class, st: EnrolledStudentItem, dateStr: string) => {
    const daySessions = sessionsByClassAndDate.get(`${cls.id}_${dateStr}`) || [];
    const primarySession = daySessions[0];
    const att = primarySession
      ? attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${primarySession.id}`)
      : undefined;

    const draftKey = `${st.enrollment_class_id}_${dateStr}`;
    const draft = inlineDrafts[draftKey];
    const lessonVal = draft?.lesson_topic !== undefined ? draft.lesson_topic : att?.lesson_topic || '';
    const noteVal = draft?.teacher_note !== undefined ? draft.teacher_note : att?.teacher_note || '';
    const isDirty =
      (draft?.lesson_topic !== undefined && draft.lesson_topic !== (att?.lesson_topic || '')) ||
      (draft?.teacher_note !== undefined && draft.teacher_note !== (att?.teacher_note || ''));
    const isSaving = savingKey === draftKey;

    const triggerSave = () => {
      handleSaveLessonAndNote({
        classId: cls.id,
        enrollmentClassId: st.enrollment_class_id,
        dateStr,
        session: primarySession,
        lessonTopic: lessonVal.trim() || null,
        teacherNote: noteVal.trim() || null,
        studentName: st.full_name,
      });
    };

    return (
      <div className="flex items-center gap-1.5 min-w-[190px]">
        <input
          type="text"
          value={noteVal}
          onChange={(e) => {
            const val = e.target.value;
            setInlineDrafts((prev) => ({
              ...prev,
              [draftKey]: {
                ...prev[draftKey],
                teacher_note: val,
              },
            }));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              triggerSave();
            }
          }}
          placeholder="Nhập ghi chú..."
          className="flex-1 min-w-[130px] h-8 px-2.5 rounded-lg border border-border/80 bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="button"
          disabled={isSaving}
          onClick={triggerSave}
          title="Lưu bài học & ghi chú"
          className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-bold transition ${
            isDirty
              ? 'bg-primary text-white shadow-2xs hover:bg-primary/90'
              : 'border border-border bg-surface-muted/70 text-text-secondary hover:bg-surface-muted'
          } disabled:opacity-50`}
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSaving ? '...' : 'Lưu'}</span>
        </button>
      </div>
    );
  };

  // Render Attendance Cell (Popover Select/Option style identical to CSKH AttendanceMatrix)
  const renderMatrixDateCell = (cls: Class, st: EnrolledStudentItem, dateStr: string) => {
    const daySessions = sessionsByClassAndDate.get(`${cls.id}_${dateStr}`) || [];

    if (daySessions.length === 0) {
      return (
        <div className="flex min-h-9 w-full min-w-[52px] items-center justify-center px-1 py-1">
          <button
            type="button"
            onClick={(e) => {
              setPopoverLesson('');
              setPopoverNote('');
              setActivePopover({
                anchorEl: e.currentTarget,
                classId: cls.id,
                enrollmentClassId: st.enrollment_class_id,
                studentName: st.full_name,
                dateStr,
                session: undefined,
                sessionNumber: 1,
              });
            }}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/60 bg-surface px-2 text-xs font-semibold text-text-muted transition hover:border-primary/50 hover:bg-surface-muted hover:text-text-primary"
            title={`Điểm danh ${st.full_name} ngày ${dateStr}, Buổi 1`}
          >
            —
          </button>
        </div>
      );
    }

    const nextSessionNumber = daySessions.length + 1;

    return (
      <div className="flex min-h-9 w-full min-w-[60px] flex-wrap items-center justify-center gap-1 px-1 py-1">
        {daySessions.map((sess, idx) => {
          const sessionNumber = idx + 1;
          const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${sess.id}`);
          const tStatus = (att?.teacher_status || undefined) as AttendanceStatus | undefined;
          const cfg = tStatus ? STATUS_CONFIG[tStatus] : null;
          const hasNote = Boolean(att?.lesson_topic || att?.teacher_note);
          const tooltip = [
            `Buổi ${sessionNumber}: ${cfg?.label || 'Chưa điểm danh'}`,
            att?.lesson_topic ? `Bài học: ${att.lesson_topic}` : '',
            att?.teacher_note ? `Ghi chú GV: ${att.teacher_note}` : '',
          ]
            .filter(Boolean)
            .join(' | ');

          return (
            <button
              key={sess.id}
              type="button"
              onClick={(e) => {
                setPopoverLesson(att?.lesson_topic || '');
                setPopoverNote(att?.teacher_note || '');
                setActivePopover({
                  anchorEl: e.currentTarget,
                  classId: cls.id,
                  enrollmentClassId: st.enrollment_class_id,
                  studentName: st.full_name,
                  dateStr,
                  session: sess,
                  sessionNumber,
                });
              }}
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
          onClick={(e) => {
            setPopoverLesson('');
            setPopoverNote('');
            setActivePopover({
              anchorEl: e.currentTarget,
              classId: cls.id,
              enrollmentClassId: st.enrollment_class_id,
              studentName: st.full_name,
              dateStr,
              session: undefined,
              sessionNumber: nextSessionNumber,
            });
          }}
          title={`Thêm buổi tiếp theo (Buổi ${nextSessionNumber})`}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-primary/50 text-xs font-extrabold text-primary transition hover:bg-primary-soft"
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

  // Handle Quick Create Session + Note in Tab 2
  const handleCreateQuickSession = async (e: React.FormEvent) => {
    e.preventDefault();
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

  // Build rows for Tab 2: Buổi học (Bài học & Ghi chú GV)
  const tab2SessionRows = useMemo(() => {
    const monthPrefix = `${sessionMonthDate.getFullYear()}-${String(
      sessionMonthDate.getMonth() + 1
    ).padStart(2, '0')}`;
    const q = searchTerm.trim().toLowerCase();

    const rows: Array<{
      rowKey: string;
      cls: Class;
      session: ClassSession;
      student: EnrolledStudentItem;
      dateStr: string;
      att?: Attendance;
    }> = [];

    allSessionsList.forEach(({ cls, session }) => {
      if (sessionClassFilter && String(cls.id) !== sessionClassFilter) return;
      const modelNorm = normalizeModel(cls.model_type);
      if (modelFilter && modelNorm !== modelFilter) return;

      const dStr = formatSessionDate(session.session_date);
      if (sessionScope === 'month' && !dStr.startsWith(monthPrefix)) return;

      const students = getStudentsOfClass(cls);
      students.forEach((st) => {
        const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`);
        if (q) {
          const hay = [
            formatClassCode(cls.class_code, cls.id),
            cls.class_name,
            st.full_name,
            st.external_id,
            att?.lesson_topic,
            att?.teacher_note,
            dStr,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return;
        }

        rows.push({
          rowKey: `${st.enrollment_class_id}_session_${session.id}`,
          cls,
          session,
          student: st,
          dateStr: dStr,
          att,
        });
      });
    });

    rows.sort(
      (a, b) =>
        b.dateStr.localeCompare(a.dateStr) ||
        b.session.session_number - a.session.session_number ||
        a.cls.id - b.cls.id
    );

    return rows;
  }, [
    allSessionsList,
    sessionClassFilter,
    modelFilter,
    sessionScope,
    sessionMonthDate,
    searchTerm,
    attendanceByEcAndSession,
  ]);

  return (
    <PageContainer>
      <PageHeader
        title={isTeacher ? 'Lớp học & Điểm danh Giáo viên' : 'Quản lý Lớp học & Điểm danh'}
        actions={
          <div className="flex items-center gap-2">
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
        <div className="mb-4 px-4 py-3 rounded-xl bg-teal-50/90 border border-teal-200/90 text-xs text-teal-900 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="font-bold">Lớp học phụ trách:</span>
            <span>
              Điểm danh trực tiếp trên bảng lớp học (Lớp 1:1 chấm trực tiếp trên dòng lớp, Lớp 1:n chấm từng học viên bên dưới) kèm Bài học & Ghi chú theo buổi.
            </span>
          </div>
          <Badge variant="accent">Phụ trách: {classes.length} lớp</Badge>
        </div>
      )}

      {/* 2 Tabs: Lớp học & Điểm danh | Buổi học */}
      <HorizontalTabs
        ariaLabel="Chế độ quản lý lớp học và điểm danh"
        value={activeTab}
        onChange={setActiveTab}
        className="mb-4"
        items={[
          {
            value: 'attendance',
            label: 'Lớp học & Điểm danh',
            icon: <ClipboardCheck />,
          },
          {
            value: 'sessions',
            label: 'Buổi học',
            icon: <BookOpen />,
          },
        ]}
      />

      <FilterBar
        title="Tìm kiếm & Lọc nhanh"
        activeCount={activeFiltersCount}
        onClear={() => {
          setSearchTerm('');
          setModelFilter('');
          setSessionClassFilter('');
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

        {activeTab === 'sessions' && (
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              Lớp học
            </label>
            <select
              value={sessionClassFilter}
              onChange={(e) => setSessionClassFilter(e.target.value)}
              className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
            >
              <option value="">Tất cả các lớp ({classes.length})</option>
              {classes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {formatClassCode(c.class_code, c.id)} — {c.class_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </FilterBar>

      {/* ======================================================================= */}
      {/* TAB 1: DANH SÁCH LỚP & ĐIỂM DANH TRỰC TIẾP                              */}
      {/* ======================================================================= */}
      {activeTab === 'attendance' && (
        <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
          {/* Thanh điều khiển Lịch (Theo ngày / Theo tuần / Theo tháng) */}
          <div className="p-3 sm:px-4 border-b border-border/80 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex p-0.5 bg-surface-muted rounded-xl border border-border/70 font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('day')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === 'day'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Theo ngày
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === 'week'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Theo tuần
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === 'month'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Theo tháng
                </button>
              </div>

              {viewMode === 'day' ? (
                <div className="flex items-center gap-1.5">
                  <div className="flex h-9 items-center gap-1 rounded-xl border border-border/70 bg-white px-1.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleStepDay(-1)}
                      className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
                      title="Ngày hôm trước"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                      className="w-[130px] border-0 bg-transparent px-1 text-xs font-extrabold text-text-primary outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleStepDay(1)}
                      className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
                      title="Ngày hôm sau"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDate(toLocalDateString(new Date()))}
                    className="h-9 text-xs font-bold"
                  >
                    Hôm nay
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="flex h-9 items-center gap-1 rounded-xl border border-border/70 bg-white px-1.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleStepPeriod(-1)}
                      className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2.5 text-xs font-extrabold text-text-primary">
                      {viewMode === 'week'
                        ? `Tuần: ${periodDates[0]?.toLocaleDateString('vi-VN')} — ${periodDates[
                            periodDates.length - 1
                          ]?.toLocaleDateString('vi-VN')}`
                        : `Tháng ${currentPeriodDate.getMonth() + 1} / ${currentPeriodDate.getFullYear()}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStepPeriod(1)}
                      className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPeriodDate(new Date())}
                    className="h-9 text-xs font-bold"
                  >
                    {viewMode === 'week' ? 'Tuần này' : 'Tháng này'}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {multiStudentClasses.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleExpandAll}
                  leftIcon={allExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  className="h-8 text-xs font-semibold"
                >
                  {allExpanded ? 'Thu gọn lớp 1:n' : 'Mở rộng tất cả lớp 1:n'}
                </Button>
              )}
            </div>
          </div>

          {/* Bảng Lớp học & Điểm danh trực tiếp */}
          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap w-28">
                    Mã lớp
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[150px]">
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
                  <th className="px-3 py-3 border-r-2 border-border/80 whitespace-nowrap min-w-[170px]">
                    Học viên
                  </th>

                  {viewMode === 'day' ? (
                    <>
                      <th className="px-3 py-2.5 border-r border-border/60 text-center bg-teal-50/70 text-teal-950 min-w-[135px]">
                        <div className="text-[12px] font-extrabold">
                          Điểm danh
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold text-teal-700">
                          {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('vi-VN')}
                        </div>
                      </th>
                      <th className="px-3 py-2.5 border-r border-border/60 bg-indigo-50/50 text-indigo-950 min-w-[160px]">
                        <div className="text-[12px] font-extrabold">
                          Bài học
                        </div>
                      </th>
                      <th className="px-3 py-2.5 border-r border-border/60 bg-indigo-50/50 text-indigo-950 min-w-[210px]">
                        <div className="text-[12px] font-extrabold">
                          Ghi chú GV
                        </div>
                      </th>
                    </>
                  ) : (
                    periodDates.map((d) => {
                      const dStr = toLocalDateString(d);
                      const isToday = toLocalDateString(new Date()) === dStr;
                      const dayOfWeek = DAY_OF_WEEK_NAMES[d.getDay()];
                      return (
                        <th
                          key={dStr}
                          className={`px-1.5 py-2 border-r border-border/60 text-center min-w-[54px] ${
                            isToday ? 'bg-blue-50 text-primary font-extrabold' : ''
                          }`}
                        >
                          <div className="text-[10px] text-text-muted">{dayOfWeek}</div>
                          <div className="text-xs font-extrabold text-text-primary">
                            {String(d.getDate()).padStart(2, '0')}
                          </div>
                        </th>
                      );
                    })
                  )}

                  <th className="px-3 py-3 text-right whitespace-nowrap min-w-[110px]">
                    Thao tác
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={viewMode === 'day' ? 12 : 9 + periodDates.length} className="py-12 text-center text-text-muted">
                      Đang tải danh sách lớp học & điểm danh...
                    </td>
                  </tr>
                ) : filteredClasses.length === 0 ? (
                  <tr>
                    <td colSpan={viewMode === 'day' ? 12 : 9 + periodDates.length} className="py-12 text-center text-text-muted">
                      {isTeacher
                        ? 'Bạn chưa được phân công phụ trách lớp học nào.'
                        : 'Không tìm thấy lớp học nào phù hợp.'}
                    </td>
                  </tr>
                ) : (
                  filteredClasses.map((cls) => {
                    const formattedCode = formatClassCode(cls.class_code, cls.id);
                    const modelNorm = normalizeModel(cls.model_type);
                    const conf = MODEL_CONFIG[modelNorm] || MODEL_CONFIG['1:1'];
                    const students = getStudentsOfClass(cls);
                    const isOneToOne = modelNorm === '1:1' && students.length <= 1;
                    const singleStudent = isOneToOne ? students[0] : undefined;
                    const isExpanded = !collapsedClassIds.has(cls.id);
                    const mainTeacher =
                      cls.class_teachers?.find((t) => t.role === 'MAIN')?.teacher ||
                      cls.class_teachers?.[0]?.teacher;
                    const schedule = cls.class_schedules?.[0];

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
                          <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap">
                            <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-900 border border-slate-300 shadow-2xs">
                              {formattedCode}
                            </span>
                          </td>

                          {/* Tên lớp */}
                          <td className="px-3 py-2.5 border-r border-border/60 font-bold text-slate-900 text-xs whitespace-nowrap">
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
                            {mainTeacher ? mainTeacher.name : <span className="italic text-slate-400">Chưa phân công</span>}
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
                          <td className="px-3 py-2.5 border-r-2 border-border/80">
                            {isOneToOne ? (
                              singleStudent ? (
                                <div>
                                  <div className="font-bold text-text-primary">{singleStudent.full_name}</div>
                                  <div className="font-mono text-[10px] text-text-muted">
                                    {singleStudent.external_id}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs italic text-slate-400">Chưa xếp học viên</span>
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

                          {/* Cột Điểm danh & Bài học & Ghi chú theo chế độ xem */}
                          {viewMode === 'day' ? (
                            <>
                              <td className="px-2 py-1.5 border-r border-border/60 text-center bg-teal-50/20">
                                {isOneToOne ? (
                                  singleStudent ? (
                                    renderMatrixDateCell(cls, singleStudent, selectedDate)
                                  ) : (
                                    <span className="text-[11px] italic text-text-muted">—</span>
                                  )
                                ) : (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={
                                        students.length === 0 ||
                                        savingKey === `class_${cls.id}_${selectedDate}`
                                      }
                                      onClick={() => handleBulkMarkWholeClass(cls, selectedDate, 'ATTENDED')}
                                      leftIcon={<Check className="w-3.5 h-3.5 text-emerald-600" />}
                                      className="h-7 text-[11px] font-bold border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                    >
                                      Có mặt cả lớp ({students.length})
                                    </Button>
                                  </div>
                                )}
                              </td>

                              <td className="px-2.5 py-1.5 border-r border-border/60 bg-indigo-50/15">
                                {isOneToOne && singleStudent ? (
                                  renderDayLessonInput(cls, singleStudent, selectedDate)
                                ) : (
                                  <span className="text-[11px] text-text-muted">—</span>
                                )}
                              </td>

                              <td className="px-2.5 py-1.5 border-r border-border/60 bg-indigo-50/15">
                                {isOneToOne && singleStudent ? (
                                  renderDayNoteInput(cls, singleStudent, selectedDate)
                                ) : (
                                  <span className="text-[11px] text-text-muted">—</span>
                                )}
                              </td>
                            </>
                          ) : (
                            periodDates.map((d) => {
                              const dStr = toLocalDateString(d);
                              return (
                                <td
                                  key={dStr}
                                  className="px-1 py-1.5 border-r border-border/60 text-center"
                                >
                                  {isOneToOne && singleStudent ? (
                                    renderMatrixDateCell(cls, singleStudent, dStr)
                                  ) : (
                                    <span className="text-[10px] text-slate-400">↓</span>
                                  )}
                                </td>
                              );
                            })
                          )}

                          {/* Cột Thao tác */}
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/classes/${cls.id}/sessions`)}
                                title="Quản lý danh sách buổi học"
                                leftIcon={<Calendar className="w-3.5 h-3.5" />}
                                className="h-7 px-2 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50"
                              >
                                Buổi học
                              </Button>
                              {canManageClasses && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openModal(cls)}
                                  leftIcon={<Edit className="w-3.5 h-3.5 text-slate-500 hover:text-blue-600" />}
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
                                colSpan={viewMode === 'day' ? 5 : 2 + periodDates.length}
                                className="px-3 py-2 text-xs italic text-slate-400"
                              >
                                Lớp chưa có học viên nào được gán.
                              </td>
                            </tr>
                          ) : (
                            students.map((st, sIdx) => (
                              <tr
                                key={st.enrollment_class_id}
                                className="border-b border-border/50 bg-white hover:bg-blue-50/30 transition-colors"
                              >
                                <td className="px-3 py-2 border-r border-border/50 text-right font-mono text-[10px] text-slate-400">
                                  {formattedCode}.{sIdx + 1}
                                </td>
                                <td className="px-3 py-2 border-r border-border/50 text-[11px] text-slate-500 whitespace-nowrap">
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
                                <td className="px-3 py-2 border-r-2 border-border/80 bg-purple-50/20">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <div className="font-bold text-text-primary">{st.full_name}</div>
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

                                {viewMode === 'day' ? (
                                  <>
                                    <td className="px-2 py-1 border-r border-border/60 text-center bg-teal-50/10">
                                      {renderMatrixDateCell(cls, st, selectedDate)}
                                    </td>
                                    <td className="px-2.5 py-1.5 border-r border-border/60 bg-indigo-50/10">
                                      {renderDayLessonInput(cls, st, selectedDate)}
                                    </td>
                                    <td className="px-2.5 py-1.5 border-r border-border/60 bg-indigo-50/10">
                                      {renderDayNoteInput(cls, st, selectedDate)}
                                    </td>
                                  </>
                                ) : (
                                  periodDates.map((d) => {
                                    const dStr = toLocalDateString(d);
                                    return (
                                      <td
                                        key={dStr}
                                        className="px-1 py-1 border-r border-border/60 text-center"
                                      >
                                        {renderMatrixDateCell(cls, st, dStr)}
                                      </td>
                                    );
                                  })
                                )}

                                <td className="px-3 py-1.5 text-right text-[11px] text-text-muted">
                                  —
                                </td>
                              </tr>
                            ))
                          ))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* TAB 2: BUỔI HỌC (BÀI HỌC & GHI CHÚ CỦA GIÁO VIÊN)                       */}
      {/* ======================================================================= */}
      {activeTab === 'sessions' && (
        <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
          <div className="p-3 sm:px-4 border-b border-border/80 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex p-0.5 bg-surface-muted rounded-xl border border-border/70 font-semibold">
                <button
                  type="button"
                  onClick={() => setSessionScope('month')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    sessionScope === 'month'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Theo tháng
                </button>
                <button
                  type="button"
                  onClick={() => setSessionScope('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    sessionScope === 'all'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Tất cả các buổi
                </button>
              </div>

              {sessionScope === 'month' && (
                <div className="flex items-center gap-1.5">
                  <div className="flex h-9 items-center gap-1 rounded-xl border border-border/70 bg-white px-1.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(sessionMonthDate);
                        d.setMonth(d.getMonth() - 1);
                        setSessionMonthDate(d);
                      }}
                      className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2.5 text-xs font-extrabold text-text-primary">
                      Tháng {sessionMonthDate.getMonth() + 1} / {sessionMonthDate.getFullYear()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(sessionMonthDate);
                        d.setMonth(d.getMonth() + 1);
                        setSessionMonthDate(d);
                      }}
                      className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSessionMonthDate(new Date())}
                    className="h-9 text-xs font-bold"
                  >
                    Tháng hiện tại
                  </Button>
                </div>
              )}

              <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-900">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Hiển thị: {tab2SessionRows.length} bản ghi buổi học</span>
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                  <th className="px-2.5 py-3 border-r border-border/60 w-10 text-center">#</th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[100px]">
                    Mã lớp
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[150px]">
                    Tên lớp
                  </th>
                  <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[80px]">
                    Mô hình
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[85px]">
                    Buổi học
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                    Ngày học
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[95px]">
                    Mã HV
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[150px]">
                    Họ tên HV
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 text-center whitespace-nowrap min-w-[145px]">
                    Điểm danh GV
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[200px]">
                    Bài học
                  </th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[240px]">
                    Ghi chú GV
                  </th>
                  <th className="px-3 py-3 text-center whitespace-nowrap w-24">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {tab2SessionRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-text-muted">
                      Chưa có dữ liệu buổi học nào trong kỳ đã chọn.
                    </td>
                  </tr>
                ) : (
                  tab2SessionRows.map((row, idx) => {
                    const draft = inlineDrafts[row.rowKey];
                    const effectiveStatus = (draft?.status ??
                      row.att?.teacher_status ??
                      undefined) as AttendanceStatus | undefined;
                    const effectiveLesson =
                      draft?.lesson_topic !== undefined
                        ? draft.lesson_topic
                        : row.att?.lesson_topic || '';
                    const effectiveNote =
                      draft?.teacher_note !== undefined
                        ? draft.teacher_note
                        : row.att?.teacher_note || '';
                    const isDirty = Boolean(
                      draft &&
                        ((draft.status !== undefined && draft.status !== row.att?.teacher_status) ||
                          (draft.lesson_topic !== undefined &&
                            draft.lesson_topic !== (row.att?.lesson_topic || '')) ||
                          (draft.teacher_note !== undefined &&
                            draft.teacher_note !== (row.att?.teacher_note || '')))
                    );
                    const isSaving = savingKey === `${row.student.enrollment_class_id}_${row.dateStr}`;
                    const statusCfg = effectiveStatus ? STATUS_CONFIG[effectiveStatus] : null;
                    const modelNorm = normalizeModel(row.cls.model_type);

                    const saveRow = async () => {
                      const statusToSave = (effectiveStatus || 'ATTENDED') as AttendanceStatus;
                      await handleMarkAttendanceAndNote({
                        classId: row.cls.id,
                        enrollmentClassId: row.student.enrollment_class_id,
                        dateStr: row.dateStr,
                        session: row.session,
                        status: statusToSave,
                        lesson_topic: effectiveLesson.trim() || null,
                        teacher_note: effectiveNote.trim() || null,
                        studentName: row.student.full_name,
                      });
                      setInlineDrafts((prev) => {
                        const next = { ...prev };
                        delete next[row.rowKey];
                        return next;
                      });
                    };

                    return (
                      <tr
                        key={row.rowKey}
                        className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                          isDirty ? 'bg-amber-50/40' : idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                        }`}
                      >
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-text-muted">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap">
                          <span className="font-mono text-[11px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-900 border border-slate-300">
                            {formatClassCode(row.cls.class_code, row.cls.id)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 font-bold text-text-primary whitespace-nowrap">
                          {row.cls.class_name}
                        </td>
                        <td className="px-2.5 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${MODEL_CONFIG[modelNorm].className}`}
                          >
                            {modelNorm}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-center font-extrabold text-primary whitespace-nowrap">
                          Buổi {row.session.session_number}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 text-[11px] text-text-secondary whitespace-nowrap">
                          {new Date(`${row.dateStr}T00:00:00`).toLocaleDateString('vi-VN')}
                          {row.session.start_time ? ` · ${row.session.start_time}` : ''}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 font-mono text-xs font-bold text-text-primary whitespace-nowrap">
                          {row.student.external_id}
                        </td>
                        <td className="px-3 py-2.5 border-r border-border/60 font-bold text-text-primary whitespace-nowrap">
                          {row.student.full_name}
                        </td>
                        <td className="px-3 py-2 border-r border-border/60 text-center">
                          <select
                            value={effectiveStatus || ''}
                            onChange={(e) => {
                              const val = e.target.value as AttendanceStatus | '';
                              if (!val) return;
                              setInlineDrafts((prev) => ({
                                ...prev,
                                [row.rowKey]: {
                                  ...prev[row.rowKey],
                                  status: val,
                                },
                              }));
                            }}
                            className={`h-8 w-full rounded-lg border px-2 text-xs font-extrabold outline-none cursor-pointer ${
                              statusCfg
                                ? `${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`
                                : 'border-border bg-white text-text-muted'
                            }`}
                          >
                            <option value="">-- Chưa chấm --</option>
                            {POPOVER_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.status} value={opt.status}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2.5 py-2 border-r border-border/60">
                          <input
                            type="text"
                            value={effectiveLesson}
                            onChange={(e) => {
                              const val = e.target.value;
                              setInlineDrafts((prev) => ({
                                ...prev,
                                [row.rowKey]: {
                                  ...prev[row.rowKey],
                                  lesson_topic: val,
                                },
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveRow();
                              }
                            }}
                            placeholder="Nhập bài học (VD: Bài 5, Kaiwa 3)..."
                            className="w-full h-8 px-2.5 rounded-lg border border-border/80 bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                        </td>
                        <td className="px-2.5 py-2 border-r border-border/60">
                          <div className="relative">
                            <input
                              type="text"
                              value={effectiveNote}
                              onChange={(e) => {
                                const val = e.target.value;
                                setInlineDrafts((prev) => ({
                                  ...prev,
                                  [row.rowKey]: {
                                    ...prev[row.rowKey],
                                    teacher_note: val,
                                  },
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  saveRow();
                                }
                              }}
                              placeholder="Nhập ghi chú buổi học của GV..."
                              className="w-full h-8 pl-2.5 pr-7 rounded-lg border border-border/80 bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <MessageSquare className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <Button
                            variant={isDirty ? 'primary' : 'outline'}
                            size="sm"
                            disabled={isSaving}
                            onClick={saveRow}
                            leftIcon={<Save className="w-3.5 h-3.5" />}
                            className="h-8 px-2.5 text-xs font-bold"
                          >
                            {isSaving ? '...' : 'Lưu'}
                          </Button>
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

      {/* Popover chọn điểm danh + Bài học + Ghi chú GV (khi ở chế độ Tuần/Tháng hoặc thêm buổi) */}
      {activePopover &&
        (() => {
          const rect = activePopover.anchorEl.getBoundingClientRect();
          const top = Math.min(rect.bottom + 8, window.innerHeight - 380);
          const left = Math.min(Math.max(rect.left - 110, 12), window.innerWidth - 295);
          const existingAtt = activePopover.session
            ? attendanceByEcAndSession.get(
                `${activePopover.enrollmentClassId}_session_${activePopover.session.id}`
              )
            : undefined;
          const currentStatus = existingAtt?.teacher_status as AttendanceStatus | undefined;

          return createPortal(
            <div
              ref={popoverRef}
              className="fixed z-[120] w-[280px] rounded-xl border border-border bg-surface p-3 shadow-soft-xl text-xs"
              style={{ top, left }}
            >
              <div className="mb-2 border-b border-border/70 pb-1.5 flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-text-primary">{activePopover.studentName}</div>
                  <div className="text-[11px] font-semibold text-primary">
                    {new Date(`${activePopover.dateStr}T00:00:00`).toLocaleDateString('vi-VN')} · Buổi{' '}
                    {activePopover.sessionNumber}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePopover(null)}
                  className="text-text-muted hover:text-text-primary text-xs font-bold px-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-1">
                {POPOVER_STATUS_OPTIONS.map(({ status, label }) => {
                  const cfg = STATUS_CONFIG[status];
                  const active = currentStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() =>
                        handleMarkAttendanceAndNote({
                          classId: activePopover.classId,
                          enrollmentClassId: activePopover.enrollmentClassId,
                          dateStr: activePopover.dateStr,
                          session: activePopover.session,
                          status,
                          lesson_topic: popoverLesson.trim() || null,
                          teacher_note: popoverNote.trim() || null,
                          studentName: activePopover.studentName,
                        })
                      }
                      className={`flex h-7 w-full items-center justify-between rounded-lg border px-2.5 text-xs font-extrabold transition ${
                        active ? 'ring-2 ring-primary ring-offset-1' : ''
                      } ${cfg.bg} ${cfg.text} ${cfg.border}`}
                    >
                      <span>{label}</span>
                      {active && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}

                {activePopover.session && existingAtt && (
                  <button
                    type="button"
                    onClick={() =>
                      handleClearAttendance(
                        activePopover.classId,
                        activePopover.enrollmentClassId,
                        activePopover.session!
                      )
                    }
                    className="mt-1 flex h-7 w-full items-center justify-center rounded-lg border border-border bg-surface-muted px-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
                  >
                    Xóa trạng thái điểm danh
                  </button>
                )}
              </div>

              <div className="mt-2.5 border-t border-border/70 pt-2 space-y-1.5">
                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase mb-0.5">
                    Bài học (Lesson)
                  </label>
                  <input
                    type="text"
                    value={popoverLesson}
                    onChange={(e) => setPopoverLesson(e.target.value)}
                    placeholder="VD: Bài 4, Kaiwa 2..."
                    className="w-full h-7 px-2 rounded-lg border border-border bg-white text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase mb-0.5">
                    Ghi chú GV theo buổi
                  </label>
                  <textarea
                    rows={2}
                    value={popoverNote}
                    onChange={(e) => setPopoverNote(e.target.value)}
                    placeholder="Nhận xét buổi học, BTVN..."
                    className="w-full px-2 py-1 rounded-lg border border-border bg-white text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleSaveLessonAndNote({
                      classId: activePopover.classId,
                      enrollmentClassId: activePopover.enrollmentClassId,
                      dateStr: activePopover.dateStr,
                      session: activePopover.session,
                      lessonTopic: popoverLesson.trim() || null,
                      teacherNote: popoverNote.trim() || null,
                      studentName: activePopover.studentName,
                    })
                  }
                  className="flex h-7 w-full items-center justify-center gap-1 rounded-lg bg-primary text-white text-[11px] font-bold hover:bg-primary/90"
                >
                  <Save className="w-3 h-3" />
                  <span>Lưu bài học & ghi chú</span>
                </button>
              </div>
            </div>,
            document.body
          );
        })()}

      {/* Modal "+ Thêm buổi học & Ghi chú" nhanh */}
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
    </PageContainer>
  );
};
