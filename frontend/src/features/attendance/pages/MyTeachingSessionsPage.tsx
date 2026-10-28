import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Calendar,
  Clock,
  BookOpen,
  User,
  Users,
  Check,
  UserRoundCheck,
  ClipboardCheck,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  Table2,
  CalendarDays,
  X,
} from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar } from '../../../components/common/FilterBar';
import { DataTable, type Column } from '../../../components/common/DataTable';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { teachersApi } from '../../teachers/api/teachers.api';
import type { Teacher } from '../../teachers/types/teachers.types';
import { reconciliationApi } from '../api/reconciliation.api';
import type {
  AttendanceStatus,
  TeacherTrackingHistoryItem,
  TeacherTrackingPendingItem,
} from '../types/reconciliation.types';
import { attendanceApi } from '../../classes/api/sessions.api';
import { classesApi } from '../../classes/api/classes.api';
import { formatClassCode } from '../../classes/types/classes.types';

const toLocalDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const extractSessionDateStr = (raw: string | Date | null | undefined): string => {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  return toLocalDateString(new Date(raw));
};

const DAY_OF_WEEK_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAY_LONG_LABELS = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const formatSessionDayBadge = (ymd: string): { dow: string; dmy: string; full: string } => {
  if (!ymd) return { dow: '—', dmy: '—', full: '—' };
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return { dow: '—', dmy: ymd, full: ymd };
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const dow = DAY_OF_WEEK_LABELS[d.getDay()] || '—';
  const dd = String(parts[2]).padStart(2, '0');
  const mm = String(parts[1]).padStart(2, '0');
  const yyyy = parts[0];
  return { dow, dmy: `${dd}/${mm}/${yyyy}`, full: `${dow} · ${dd}/${mm}/${yyyy}` };
};

const normalizeModelType = (raw?: string | null): '1:1' | '1:2' | '1:n' => {
  const v = (raw || '').trim().toUpperCase();
  if (v === '1:2' || v === '1-2' || v === 'ONE_TO_TWO') return '1:2';
  if (v === '1:N' || v === '1-N' || v === 'ONE_TO_N' || v === 'GROUP') return '1:n';
  return '1:1';
};

interface StatusConfigItem {
  code: string;
  label: string;
  shortLabel: string;
  chipLabel: string;
  bg: string;
  text: string;
  border: string;
}

const STATUS_CONFIG: Record<AttendanceStatus, StatusConfigItem> = {
  ATTENDED: {
    code: '1',
    label: 'Có mặt',
    shortLabel: 'Có mặt',
    chipLabel: '1 · Có mặt',
    bg: 'bg-emerald-100 hover:bg-emerald-200',
    text: 'text-emerald-800 font-extrabold',
    border: 'border-emerald-300',
  },
  ABSENT_APPROVED_A: {
    code: 'A',
    label: 'Nghỉ phép (A)',
    shortLabel: 'Nghỉ phép (A)',
    chipLabel: 'A · Nghỉ phép (A)',
    bg: 'bg-amber-100 hover:bg-amber-200',
    text: 'text-amber-800 font-extrabold',
    border: 'border-amber-300',
  },
  LEAVE_B: {
    code: 'B',
    label: 'Bảo lưu (B)',
    shortLabel: 'Bảo lưu (B)',
    chipLabel: 'B · Bảo lưu (B)',
    bg: 'bg-blue-100 hover:bg-blue-200',
    text: 'text-blue-800 font-extrabold',
    border: 'border-blue-300',
  },
  ABSENT_UNAPPROVED_C: {
    code: 'C',
    label: 'Nghỉ không phép (C)',
    shortLabel: 'Không phép (C)',
    chipLabel: 'C · Nghỉ không phép (C)',
    bg: 'bg-rose-100 hover:bg-rose-200',
    text: 'text-rose-800 font-extrabold',
    border: 'border-rose-300',
  },
  TEACHER_ABSENT_D: {
    code: 'D',
    label: 'GV nghỉ (D)',
    shortLabel: 'GV nghỉ (D)',
    chipLabel: 'D · GV nghỉ (D)',
    bg: 'bg-purple-100 hover:bg-purple-200',
    text: 'text-purple-800 font-extrabold',
    border: 'border-purple-300',
  },
  TECH_ERROR_E: {
    code: 'E',
    label: 'Lỗi kỹ thuật (E)',
    shortLabel: 'Lỗi KT (E)',
    chipLabel: 'E · Lỗi kỹ thuật (E)',
    bg: 'bg-slate-200 hover:bg-slate-300',
    text: 'text-slate-800 font-extrabold',
    border: 'border-slate-400',
  },
};

const STATUS_PICKER_LIST: AttendanceStatus[] = [
  'ATTENDED',
  'ABSENT_APPROVED_A',
  'LEAVE_B',
  'ABSENT_UNAPPROVED_C',
  'TEACHER_ABSENT_D',
  'TECH_ERROR_E',
];

const TRACKING_STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'ATTENDED', label: '1 · Có mặt' },
  { value: 'ABSENT_APPROVED_A', label: 'A · Nghỉ phép (A)' },
  { value: 'LEAVE_B', label: 'B · Bảo lưu (B)' },
  { value: 'ABSENT_UNAPPROVED_C', label: 'C · Nghỉ không phép (C)' },
  { value: 'TEACHER_ABSENT_D', label: 'D · GV nghỉ (D)' },
  { value: 'TECH_ERROR_E', label: 'E · Lỗi kỹ thuật (E)' },
];

const statusLabel = (status: AttendanceStatus) =>
  STATUS_CONFIG[status]?.chipLabel || status;

const dateLabel = (value: string) => new Date(value).toLocaleDateString('vi-VN');
const dateTimeLabel = (value: string) => new Date(value).toLocaleString('vi-VN');

export type MainTeacherTab = 'schedule' | 'pending' | 'history';
type ViewMode = 'table' | 'timetable';
type ModelFilter = 'ALL' | '1:1' | '1:2' | '1:n';
type CompletionFilter = 'ALL' | 'PENDING' | 'COMPLETED';

export interface MyTeachingSessionsPageProps {
  initialMainTab?: MainTeacherTab;
}

interface EnrichedSession {
  session: any;
  dateYmd: string;
  caInDay: number;
  totalCaInDay: number;
  modelType: '1:1' | '1:2' | '1:n';
  isGroupClass: boolean;
  enrollmentClasses: any[];
  totalStudents: number;
  markedCount: number;
  isFullyMarked: boolean;
  isPartiallyMarked: boolean;
  isUnmarked: boolean;
  effectiveLessonTopic: string;
  effectiveTeacherNote: string;
}

export const MyTeachingSessionsPage: React.FC<MyTeachingSessionsPageProps> = ({
  initialMainTab = 'schedule',
}) => {
  const toast = useToast();

  const { user } = useAuth();
  const isPrivileged = !!user?.roles.some((role) => role === 'ADMIN' || role === 'MANAGE');
  // D8 assist-mark ("chấm hộ giáo viên") is ADMIN-only per backend
  // isAssistMarkPrivileged (reconciliation.service.ts); MANAGE keeps read-only
  // viewing of another teacher's schedule via teacher-sessions (ADMIN/MANAGE).
  const isAdmin = !!user?.roles.includes('ADMIN');
  const canMark = !isPrivileged || isAdmin;

  // Main horizontal tab: schedule | pending | history
  const [mainTab, setMainTab] = useState<MainTeacherTab>(initialMainTab);

  // Sync if initialMainTab prop changes (e.g. route navigation between /teacher/my-sessions and /teacher/attendance-tracking)
  useEffect(() => {
    setMainTab(initialMainTab);
  }, [initialMainTab]);

  // Shared Teacher & Class lists
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | undefined>();
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const hasContext = !isPrivileged || !!selectedTeacherId;

  // Shared FilterBar states across all 3 tabs
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<number | undefined>();
  const [modelFilter, setModelFilter] = useState<ModelFilter>('ALL');

  // Tab 1 (`schedule`) specific filter & view states
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState<'today' | 'week' | 'month'>('today');
  const [anchorDate, setAnchorDate] = useState<string>(() => toLocalDateString(new Date()));
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Tab 1 pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Tab 2 (`pending`) & Tab 3 (`history`) specific states
  const [trackingStartDate, setTrackingStartDate] = useState<string>('');
  const [trackingEndDate, setTrackingEndDate] = useState<string>('');
  const [pendingItems, setPendingItems] = useState<TeacherTrackingPendingItem[]>([]);
  const [historyItems, setHistoryItems] = useState<TeacherTrackingHistoryItem[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [trackingTotal, setTrackingTotal] = useState<number>(0);
  const [trackingPage, setTrackingPage] = useState<number>(1);
  const [trackingPageSize, setTrackingPageSize] = useState<number>(25);
  const [isLoadingTracking, setIsLoadingTracking] = useState<boolean>(false);

  // Modal for marking pending item in Tab 2 (`pending`)
  const [selectedPendingItem, setSelectedPendingItem] = useState<TeacherTrackingPendingItem | null>(
    null
  );
  const [pendingMarkStatus, setPendingMarkStatus] = useState<AttendanceStatus | ''>('');
  const [pendingMarkLesson, setPendingMarkLesson] = useState<string>('');
  const [pendingMarkNote, setPendingMarkNote] = useState<string>('');
  const [isSubmittingPendingMark, setIsSubmittingPendingMark] = useState<boolean>(false);

  // Progressive disclosure inline status picker key: `${sessionId}_${ecId}`
  const [activeInlinePickerKey, setActiveInlinePickerKey] = useState<string | null>(null);
  // Expanded group class rows in table view
  const [expandedGroupSessions, setExpandedGroupSessions] = useState<Record<number, boolean>>({});
  // Saving indicator per session or student
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Local drafts for inline lesson topic & teacher note per session (`s_${sessionId}`)
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const lastSavedLessonRef = useRef<Record<string, string>>({});
  const lastSavedNoteRef = useRef<Record<string, string>>({});

  // Single-student Mark Attendance Modal (detailed override in Tab 1)
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [selectedEnrollmentClass, setSelectedEnrollmentClass] = useState<any | null>(null);
  const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('ATTENDED');
  const [lessonTopic, setLessonTopic] = useState('');
  const [teacherNote, setTeacherNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Session Quick Attendance Modal (for Timetable click in Tab 1)
  const [quickModalSessionId, setQuickModalSessionId] = useState<number | null>(null);
  const [quickModalLesson, setQuickModalLesson] = useState<string>('');
  const [quickModalNote, setQuickModalNote] = useState<string>('');
  const [quickModalStatuses, setQuickModalStatuses] = useState<Record<number, AttendanceStatus>>(
    {}
  );
  const [quickModalStudentNotes, setQuickModalStudentNotes] = useState<Record<number, string>>({});
  const [isQuickModalSaving, setIsQuickModalSaving] = useState(false);

  // Debounce search query for server queries (Tab 2 & Tab 3)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const parseAnchorDate = (ymd: string): Date => {
    const parts = ymd.split('-').map(Number);
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
  };

  const shiftPeriod = (delta: -1 | 1) => {
    const base = parseAnchorDate(anchorDate);
    if (viewMode === 'timetable' || dateRangeFilter === 'week') {
      base.setDate(base.getDate() + delta * 7);
    } else if (dateRangeFilter === 'today') {
      base.setDate(base.getDate() + delta);
    } else {
      base.setMonth(base.getMonth() + delta);
    }
    setAnchorDate(toLocalDateString(base));
    setCurrentPage(1);
  };

  const getWeekBounds = useCallback((baseDate: Date) => {
    const curr = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    const day = curr.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const days: Array<{
      ymd: string;
      date: Date;
      dowShort: string;
      dowLong: string;
      dmyShort: string;
    }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ymd = toLocalDateString(d);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      days.push({
        ymd,
        date: d,
        dowShort: DAY_OF_WEEK_LABELS[d.getDay()],
        dowLong: WEEKDAY_LONG_LABELS[d.getDay()],
        dmyShort: `${dd}/${mm}`,
      });
    }
    return {
      start: toLocalDateString(monday),
      end: toLocalDateString(sunday),
      days,
    };
  }, []);

  const calculateDates = useCallback(() => {
    const base = parseAnchorDate(anchorDate);
    if (viewMode === 'timetable' || dateRangeFilter === 'week') {
      const { start, end } = getWeekBounds(base);
      return { start, end };
    }
    if (dateRangeFilter === 'today') {
      const ymd = toLocalDateString(base);
      return { start: ymd, end: ymd };
    }
    // month
    const firstDay = new Date(base.getFullYear(), base.getMonth(), 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return {
      start: toLocalDateString(firstDay),
      end: toLocalDateString(lastDay),
    };
  }, [anchorDate, dateRangeFilter, viewMode, getWeekBounds]);

  // Load teacher list once for ADMIN/MANAGE
  useEffect(() => {
    if (!isPrivileged) return;
    teachersApi
      .list()
      .then((items) => setTeachers(items.filter((t) => t.active && t.user_id)))
      .catch(() => toast.error('Không thể tải danh sách giáo viên'));
  }, [isPrivileged, toast]);

  // Load classes list
  useEffect(() => {
    classesApi
      .list()
      .then((items) => setAvailableClasses(items.filter((item) => item.active)))
      .catch(() => toast.error('Không thể tải danh sách lớp phụ trách'));
  }, [toast]);

  // Map classId -> modelType from availableClasses + sessions so we can also client-filter pending/history by model
  const classModelById = useMemo(() => {
    const map = new Map<number, '1:1' | '1:2' | '1:n'>();
    for (const cls of availableClasses) {
      if (cls?.id) {
        map.set(Number(cls.id), normalizeModelType(cls.model_type));
      }
    }
    for (const s of sessions) {
      const cid = s.class?.id || s.class_id;
      if (cid && s.class?.model_type) {
        map.set(Number(cid), normalizeModelType(s.class.model_type));
      }
    }
    return map;
  }, [availableClasses, sessions]);

  // Load Tab 1 (`schedule`) sessions
  const loadSessions = useCallback(async () => {
    if (!hasContext) {
      setSessions([]);
      return;
    }
    setIsLoadingSessions(true);
    try {
      const { start, end } = calculateDates();
      const data = await reconciliationApi.getTeacherSessions({
        startDate: start,
        endDate: end,
        ...(isPrivileged ? { teacherId: selectedTeacherId } : {}),
      });
      setSessions(data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải lịch dạy của bạn');
    } finally {
      setIsLoadingSessions(false);
    }
  }, [calculateDates, hasContext, isPrivileged, selectedTeacherId, toast]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load pending count badge for Tab 2 (`pending`)
  const loadPendingCount = useCallback(async () => {
    if (!hasContext) {
      setPendingCount(0);
      return;
    }
    try {
      const result = await reconciliationApi.getTeacherTrackingCount({
        teacherId: isPrivileged ? selectedTeacherId : undefined,
        classId: selectedClassId,
        startDate: trackingStartDate || undefined,
        endDate: trackingEndDate || undefined,
        search: debouncedSearch || undefined,
      });
      setPendingCount(result.count);
    } catch {
      setPendingCount(0);
    }
  }, [
    hasContext,
    isPrivileged,
    selectedTeacherId,
    selectedClassId,
    trackingStartDate,
    trackingEndDate,
    debouncedSearch,
  ]);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  // Load Tab 2 (`pending`) or Tab 3 (`history`) data when active or filters change
  const loadTrackingData = useCallback(async () => {
    if (!hasContext) {
      setPendingItems([]);
      setHistoryItems([]);
      setTrackingTotal(0);
      return;
    }
    if (mainTab === 'schedule') return;

    setIsLoadingTracking(true);
    try {
      const query = {
        teacherId: isPrivileged ? selectedTeacherId : undefined,
        classId: selectedClassId,
        startDate: trackingStartDate || undefined,
        endDate: trackingEndDate || undefined,
        search: debouncedSearch || undefined,
        page: trackingPage,
        pageSize: trackingPageSize,
      };
      if (mainTab === 'pending') {
        const result = await reconciliationApi.getTeacherTrackingPending(query);
        setPendingItems(result.items || []);
        setTrackingTotal(result.total || 0);
      } else if (mainTab === 'history') {
        const result = await reconciliationApi.getTeacherTrackingHistory(query);
        setHistoryItems(result.items || []);
        setTrackingTotal(result.total || 0);
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || 'Không thể tải dữ liệu theo dõi điểm danh giáo viên'
      );
    } finally {
      setIsLoadingTracking(false);
    }
  }, [
    hasContext,
    mainTab,
    isPrivileged,
    selectedTeacherId,
    selectedClassId,
    trackingStartDate,
    trackingEndDate,
    debouncedSearch,
    trackingPage,
    trackingPageSize,
    toast,
  ]);

  useEffect(() => {
    loadTrackingData();
  }, [loadTrackingData]);

  // Enrich sessions with Ca 1/Ca 2 per class+date, modelType, attendance progress, etc.
  const enrichedSessions = useMemo<EnrichedSession[]>(() => {
    const byClassAndDate = new Map<string, any[]>();
    for (const s of sessions) {
      const ymd = extractSessionDateStr(s.session_date);
      const key = `${s.class_id || s.class?.id || 0}_${ymd}`;
      const list = byClassAndDate.get(key) || [];
      list.push(s);
      byClassAndDate.set(key, list);
    }

    const caIndexMap = new Map<number, { caInDay: number; totalCaInDay: number }>();
    byClassAndDate.forEach((list) => {
      const sorted = [...list].sort((a, b) => {
        if (a.start_time && b.start_time) {
          const cmp = String(a.start_time).localeCompare(String(b.start_time));
          if (cmp !== 0) return cmp;
        }
        return (a.session_number || 0) - (b.session_number || 0) || (a.id || 0) - (b.id || 0);
      });
      sorted.forEach((item, idx) => {
        caIndexMap.set(item.id, { caInDay: idx + 1, totalCaInDay: sorted.length });
      });
    });

    return sessions.map((session) => {
      const dateYmd = extractSessionDateStr(session.session_date);
      const caInfo = caIndexMap.get(session.id) || { caInDay: 1, totalCaInDay: 1 };
      const enrollmentClasses: any[] = session.class?.enrollment_classes || [];
      const rawModel = session.class?.model_type;
      let modelType = normalizeModelType(rawModel);
      if (!rawModel && enrollmentClasses.length === 2) modelType = '1:2';
      else if (!rawModel && enrollmentClasses.length > 2) modelType = '1:n';

      const isGroupClass = modelType !== '1:1' || enrollmentClasses.length > 1;
      const totalStudents = enrollmentClasses.length;
      let markedCount = 0;
      let firstTopic = '';
      let firstNote = '';

      for (const ec of enrollmentClasses) {
        const att = ec.attendance?.find(
          (a: any) => a.class_session_id === session.id && !a.deleted_at
        );
        if (att?.teacher_status) {
          markedCount += 1;
        }
        if (!firstTopic && att?.lesson_topic) firstTopic = att.lesson_topic;
        if (!firstNote && att?.teacher_note) firstNote = att.teacher_note;
      }

      const isFullyMarked = totalStudents > 0 && markedCount === totalStudents;
      const isPartiallyMarked = markedCount > 0 && markedCount < totalStudents;
      const isUnmarked = markedCount === 0;

      return {
        session,
        dateYmd,
        caInDay: caInfo.caInDay,
        totalCaInDay: caInfo.totalCaInDay,
        modelType,
        isGroupClass,
        enrollmentClasses,
        totalStudents,
        markedCount,
        isFullyMarked,
        isPartiallyMarked,
        isUnmarked,
        effectiveLessonTopic: firstTopic,
        effectiveTeacherNote: firstNote,
      };
    });
  }, [sessions]);

  // KPI metrics (computed across sessions in the current date period)
  const kpiMetrics = useMemo(() => {
    const totalSessions = enrichedSessions.length;
    let completedSessions = 0;
    let pendingSessions = 0;
    const classIds = new Set<number>();
    let totalStudentTurns = 0;
    let markedStudentTurns = 0;

    for (const item of enrichedSessions) {
      if (item.session.class?.id) classIds.add(item.session.class.id);
      else if (item.session.class_id) classIds.add(item.session.class_id);

      totalStudentTurns += item.totalStudents;
      markedStudentTurns += item.markedCount;

      if (item.isFullyMarked) {
        completedSessions += 1;
      } else {
        pendingSessions += 1;
      }
    }

    return {
      totalSessions,
      completedSessions,
      pendingSessions,
      distinctClasses: classIds.size,
      totalStudentTurns,
      markedStudentTurns,
    };
  }, [enrichedSessions]);

  // Apply search, class, model, and completion filters for Tab 1 (`schedule`)
  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedSessions.filter((item) => {
      const clsId = item.session.class?.id || item.session.class_id;
      if (selectedClassId && Number(clsId) !== Number(selectedClassId)) {
        return false;
      }
      if (modelFilter !== 'ALL' && item.modelType !== modelFilter) {
        return false;
      }
      if (completionFilter === 'COMPLETED' && !item.isFullyMarked) {
        return false;
      }
      if (completionFilter === 'PENDING' && item.isFullyMarked) {
        return false;
      }
      if (q) {
        const clsName = (item.session.class?.class_name || '').toLowerCase();
        const clsCode = formatClassCode(
          item.session.class?.class_code,
          item.session.class?.id
        ).toLowerCase();
        const level = (item.session.class?.level || '').toLowerCase();
        const topic = (item.effectiveLessonTopic || '').toLowerCase();
        const note = (item.effectiveTeacherNote || '').toLowerCase();
        const studentMatch = item.enrollmentClasses.some((ec: any) => {
          const st = ec.enrollment?.student;
          const sName = (st?.full_name || '').toLowerCase();
          const sCode = (st?.external_id || '').toLowerCase();
          const sPhone = (st?.phone || '').toLowerCase();
          const att = ec.attendance?.find(
            (a: any) => a.class_session_id === item.session.id && !a.deleted_at
          );
          const sTopic = (att?.lesson_topic || '').toLowerCase();
          const sNote = (att?.teacher_note || '').toLowerCase();
          return (
            sName.includes(q) ||
            sCode.includes(q) ||
            sPhone.includes(q) ||
            sTopic.includes(q) ||
            sNote.includes(q)
          );
        });
        if (
          !clsName.includes(q) &&
          !clsCode.includes(q) &&
          !level.includes(q) &&
          !topic.includes(q) &&
          !note.includes(q) &&
          !studentMatch
        ) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedSessions, selectedClassId, modelFilter, completionFilter, searchQuery]);

  // Apply client-side model filter on pendingItems & historyItems when modelFilter !== 'ALL'
  const displayedPendingItems = useMemo(() => {
    if (modelFilter === 'ALL') return pendingItems;
    return pendingItems.filter((item) => {
      const m = classModelById.get(Number(item.class?.id));
      return !m || m === modelFilter;
    });
  }, [pendingItems, modelFilter, classModelById]);

  const displayedHistoryItems = useMemo(() => {
    if (modelFilter === 'ALL') return historyItems;
    return historyItems.filter((item) => {
      if (!item.class?.id) return true;
      const m = classModelById.get(Number(item.class.id));
      return !m || m === modelFilter;
    });
  }, [historyItems, modelFilter, classModelById]);

  // Active filter count & clear handler for `<FilterBar>`
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count += 1;
    if (selectedClassId) count += 1;
    if (modelFilter !== 'ALL') count += 1;
    if (mainTab === 'schedule') {
      if (completionFilter !== 'ALL') count += 1;
    } else {
      if (trackingStartDate) count += 1;
      if (trackingEndDate) count += 1;
    }
    return count;
  }, [
    searchQuery,
    selectedClassId,
    modelFilter,
    mainTab,
    completionFilter,
    trackingStartDate,
    trackingEndDate,
  ]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSelectedClassId(undefined);
    setModelFilter('ALL');
    setCompletionFilter('ALL');
    setTrackingStartDate('');
    setTrackingEndDate('');
    setCurrentPage(1);
    setTrackingPage(1);
  };

  // Helper to mark a single student in a session
  const persistSingleStudentAttendance = useCallback(
    async (
      session: any,
      ec: any,
      status: AttendanceStatus,
      topicText?: string,
      noteText?: string
    ) => {
      const existingAtt = ec.attendance?.find(
        (a: any) => a.class_session_id === session.id && !a.deleted_at
      );
      const finalTopic =
        topicText !== undefined ? topicText.trim() : (existingAtt?.lesson_topic || '').trim();
      const finalNote =
        noteText !== undefined ? noteText.trim() : (existingAtt?.teacher_note || '').trim();

      const rawValue =
        status === 'ATTENDED'
          ? `${ec.enrollment?.student?.external_id || ''}-${finalTopic}`
          : undefined;

      if (existingAtt?.id) {
        await reconciliationApi.markByTeacher(existingAtt.id, {
          status,
          ...(isPrivileged ? { teacherId: selectedTeacherId } : {}),
          lessonTopic: status === 'ATTENDED' ? finalTopic || undefined : undefined,
          note: finalNote || undefined,
          rawValue,
        });
      } else {
        if (isPrivileged) {
          throw new Error(
            'Chưa có hồ sơ điểm danh gốc cho học viên này. Chỉ giáo viên phụ trách lớp mới khởi tạo trực tiếp.'
          );
        }
        await attendanceApi.mark(session.class.id, session.id, {
          enrollment_class_id: ec.id,
          status,
          side: 'TEACHER',
          lesson_topic: status === 'ATTENDED' ? finalTopic || null : null,
          teacher_note: finalNote || null,
        });
      }
    },
    [isPrivileged, selectedTeacherId]
  );

  // Quick inline status select for 1 student in Tab 1
  const handleInlineSelectStatus = async (
    item: EnrichedSession,
    ec: any,
    status: AttendanceStatus
  ) => {
    if (!canMark) return;
    if (isPrivileged && !selectedTeacherId) {
      toast.warning('Hãy chọn giáo viên cần hỗ trợ');
      return;
    }
    const key = `${item.session.id}_${ec.id}`;
    setSavingKey(key);
    setActiveInlinePickerKey(null);

    const sessionDraftKey = `s_${item.session.id}`;
    const existingAtt = ec.attendance?.find(
      (a: any) => a.class_session_id === item.session.id && !a.deleted_at
    );
    const topicVal =
      lessonDrafts[sessionDraftKey] !== undefined
        ? lessonDrafts[sessionDraftKey]
        : existingAtt?.lesson_topic || item.effectiveLessonTopic || '';
    const noteVal =
      noteDrafts[sessionDraftKey] !== undefined
        ? noteDrafts[sessionDraftKey]
        : existingAtt?.teacher_note || item.effectiveTeacherNote || '';

    try {
      await persistSingleStudentAttendance(item.session, ec, status, topicVal, noteVal);
      toast.success(
        `Đã chấm ${STATUS_CONFIG[status].chipLabel} cho ${ec.enrollment?.student?.full_name || 'học viên'}`
      );
      await Promise.all([loadSessions(), loadPendingCount()]);
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Không thể ghi nhận điểm danh');
    } finally {
      setSavingKey(null);
    }
  };

  // Bulk mark entire group class ("Chấm cả lớp")
  const handleMarkEntireClass = async (
    item: EnrichedSession,
    status: AttendanceStatus = 'ATTENDED'
  ) => {
    if (!canMark) return;
    if (isPrivileged && !selectedTeacherId) {
      toast.warning('Hãy chọn giáo viên cần hỗ trợ');
      return;
    }
    if (item.enrollmentClasses.length === 0) {
      toast.info('Lớp chưa có học viên đang học để điểm danh');
      return;
    }

    const bulkKey = `bulk_${item.session.id}`;
    setSavingKey(bulkKey);
    const sessionDraftKey = `s_${item.session.id}`;
    const topicVal =
      lessonDrafts[sessionDraftKey] !== undefined
        ? lessonDrafts[sessionDraftKey]
        : item.effectiveLessonTopic || '';
    const noteVal =
      noteDrafts[sessionDraftKey] !== undefined
        ? noteDrafts[sessionDraftKey]
        : item.effectiveTeacherNote || '';

    try {
      for (const ec of item.enrollmentClasses) {
        const existingAtt = ec.attendance?.find(
          (a: any) => a.class_session_id === item.session.id && !a.deleted_at
        );
        await persistSingleStudentAttendance(
          item.session,
          ec,
          status,
          topicVal || existingAtt?.lesson_topic || '',
          noteVal || existingAtt?.teacher_note || ''
        );
      }
      toast.success(
        `Đã chấm ${STATUS_CONFIG[status].chipLabel} cho toàn bộ ${item.enrollmentClasses.length} học viên lớp ${item.session.class?.class_name}`
      );
      await Promise.all([loadSessions(), loadPendingCount()]);
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Không thể chấm điểm danh cả lớp');
    } finally {
      setSavingKey(null);
    }
  };

  // Save inline lesson topic & teacher note for a session
  const handleSaveSessionLessonAndNote = async (
    item: EnrichedSession,
    explicitTopic?: string,
    explicitNote?: string
  ) => {
    if (!canMark) return;
    const sessionDraftKey = `s_${item.session.id}`;
    const topicVal = (
      explicitTopic !== undefined
        ? explicitTopic
        : lessonDrafts[sessionDraftKey] ?? item.effectiveLessonTopic ?? ''
    ).trim();
    const noteVal = (
      explicitNote !== undefined
        ? explicitNote
        : noteDrafts[sessionDraftKey] ?? item.effectiveTeacherNote ?? ''
    ).trim();

    const prevSavedTopic =
      lastSavedLessonRef.current[sessionDraftKey] ?? (item.effectiveLessonTopic || '');
    const prevSavedNote =
      lastSavedNoteRef.current[sessionDraftKey] ?? (item.effectiveTeacherNote || '');

    if (topicVal === prevSavedTopic && noteVal === prevSavedNote) {
      return;
    }

    const targets = item.enrollmentClasses.filter((ec: any) => {
      const att = ec.attendance?.find(
        (a: any) => a.class_session_id === item.session.id && !a.deleted_at
      );
      return Boolean(att?.teacher_status);
    });

    if (targets.length === 0) {
      if (item.enrollmentClasses.length === 1 && (topicVal || noteVal)) {
        const singleEc = item.enrollmentClasses[0];
        setSavingKey(`note_${item.session.id}`);
        try {
          await persistSingleStudentAttendance(
            item.session,
            singleEc,
            'ATTENDED',
            topicVal,
            noteVal
          );
          lastSavedLessonRef.current[sessionDraftKey] = topicVal;
          lastSavedNoteRef.current[sessionDraftKey] = noteVal;
          toast.success('Đã lưu bài học & ghi nhận 1 · Có mặt');
          await Promise.all([loadSessions(), loadPendingCount()]);
          window.dispatchEvent(new Event('teacher-attendance-updated'));
        } catch (err: any) {
          toast.error(err.response?.data?.message || err.message || 'Không thể lưu bài học');
        } finally {
          setSavingKey(null);
        }
      }
      return;
    }

    setSavingKey(`note_${item.session.id}`);
    try {
      for (const ec of targets) {
        const existingAtt = ec.attendance?.find(
          (a: any) => a.class_session_id === item.session.id && !a.deleted_at
        );
        const stStatus: AttendanceStatus = existingAtt?.teacher_status || 'ATTENDED';
        await persistSingleStudentAttendance(item.session, ec, stStatus, topicVal, noteVal);
      }
      lastSavedLessonRef.current[sessionDraftKey] = topicVal;
      lastSavedNoteRef.current[sessionDraftKey] = noteVal;
      toast.success('Đã cập nhật bài học & ghi chú giáo viên');
      await loadSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Không thể lưu bài học / ghi chú');
    } finally {
      setSavingKey(null);
    }
  };

  // Open Quick Session Attendance Modal (used by Timetable chip click)
  const openQuickSessionModal = (item: EnrichedSession) => {
    setQuickModalSessionId(item.session.id);
    setQuickModalLesson(item.effectiveLessonTopic || '');
    setQuickModalNote(item.effectiveTeacherNote || '');
    const initStatuses: Record<number, AttendanceStatus> = {};
    const initNotes: Record<number, string> = {};
    for (const ec of item.enrollmentClasses) {
      const att = ec.attendance?.find(
        (a: any) => a.class_session_id === item.session.id && !a.deleted_at
      );
      if (att?.teacher_status) {
        initStatuses[ec.id] = att.teacher_status as AttendanceStatus;
      }
      initNotes[ec.id] = att?.teacher_note || '';
    }
    setQuickModalStatuses(initStatuses);
    setQuickModalStudentNotes(initNotes);
  };

  const quickModalItem = useMemo(
    () => enrichedSessions.find((x) => x.session.id === quickModalSessionId) || null,
    [enrichedSessions, quickModalSessionId]
  );

  const handleSaveQuickSessionModal = async () => {
    if (!quickModalItem || !canMark) return;
    if (isPrivileged && !selectedTeacherId) {
      toast.warning('Hãy chọn giáo viên cần hỗ trợ');
      return;
    }
    const ecs = quickModalItem.enrollmentClasses;
    const markedEcs = ecs.filter((ec: any) => Boolean(quickModalStatuses[ec.id]));
    if (markedEcs.length === 0) {
      toast.warning('Hãy chọn trạng thái điểm danh cho ít nhất 1 học viên');
      return;
    }

    setIsQuickModalSaving(true);
    try {
      for (const ec of markedEcs) {
        const stStatus = quickModalStatuses[ec.id];
        const stNote =
          (quickModalStudentNotes[ec.id] || '').trim() || quickModalNote.trim();
        await persistSingleStudentAttendance(
          quickModalItem.session,
          ec,
          stStatus,
          quickModalLesson.trim(),
          stNote
        );
      }
      toast.success('Đã lưu điểm danh ca học thành công!');
      setQuickModalSessionId(null);
      await Promise.all([loadSessions(), loadPendingCount()]);
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Không thể lưu điểm danh ca học');
    } finally {
      setIsQuickModalSaving(false);
    }
  };

  const handleOpenMarkModal = (session: any, ec: any, status: AttendanceStatus) => {
    if (isPrivileged && !isAdmin) return;
    setSelectedSession(session);
    setSelectedEnrollmentClass(ec);
    const existingAtt = ec.attendance?.find(
      (a: any) => a.class_session_id === session.id && !a.deleted_at
    );
    setSelectedStatus(status);
    setLessonTopic(existingAtt?.lesson_topic || '');
    setTeacherNote(existingAtt?.teacher_note || '');
    setIsMarkModalOpen(true);
  };

  const handleConfirmMark = async () => {
    if (!selectedSession || !selectedEnrollmentClass) return;
    if (isPrivileged && !isAdmin) return;
    if (isPrivileged && !selectedTeacherId) {
      toast.warning('Hãy chọn giáo viên cần hỗ trợ');
      return;
    }

    setIsSubmitting(true);
    try {
      await persistSingleStudentAttendance(
        selectedSession,
        selectedEnrollmentClass,
        selectedStatus,
        lessonTopic,
        teacherNote
      );
      toast.success('Điểm danh thành công! Dữ liệu đã được gửi đối soát với CSKH.');
      setIsMarkModalOpen(false);
      await Promise.all([loadSessions(), loadPendingCount()]);
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Không thể ghi nhận điểm danh');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tab 2 (`pending`): open mark modal & confirm
  const openPendingMarkModal = (item: TeacherTrackingPendingItem) => {
    if (isPrivileged && !isAdmin) return;
    setSelectedPendingItem(item);
    setPendingMarkStatus('');
    setPendingMarkLesson('');
    setPendingMarkNote('');
  };

  const handleConfirmPendingMark = async () => {
    if (!selectedPendingItem || !pendingMarkStatus || (isPrivileged && !isAdmin)) return;
    setIsSubmittingPendingMark(true);
    try {
      await reconciliationApi.markByTeacher(selectedPendingItem.id, {
        status: pendingMarkStatus,
        teacherId: isPrivileged ? selectedTeacherId : undefined,
        lessonTopic:
          pendingMarkStatus === 'ATTENDED' ? pendingMarkLesson.trim() || undefined : undefined,
        note: pendingMarkNote.trim() || undefined,
      });
      toast.success('Đã ghi nhận điểm danh và gửi đối soát');
      setSelectedPendingItem(null);
      await Promise.all([loadTrackingData(), loadPendingCount(), loadSessions()]);
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể ghi nhận điểm danh');
    } finally {
      setIsSubmittingPendingMark(false);
    }
  };

  const toggleGroupExpand = (sessionId: number) => {
    setExpandedGroupSessions((prev) => ({
      ...prev,
      [sessionId]: !prev[sessionId],
    }));
  };

  // Pagination calculation over filteredSessions (Tab 1)
  const totalCount = filteredSessions.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const currentPageSafe = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const paginatedSessions = useMemo(() => {
    const start = (currentPageSafe - 1) * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [filteredSessions, currentPageSafe, pageSize]);

  const startRecord = totalCount === 0 ? 0 : (currentPageSafe - 1) * pageSize + 1;
  const endRecord = Math.min(currentPageSafe * pageSize, totalCount);

  // Weekly calendar days for Timetable mode (Tab 1)
  const weekCalendar = useMemo(() => {
    const base = parseAnchorDate(anchorDate);
    const { days } = getWeekBounds(base);
    const mapByDay = new Map<string, EnrichedSession[]>();
    for (const d of days) {
      mapByDay.set(d.ymd, []);
    }
    for (const item of filteredSessions) {
      const list = mapByDay.get(item.dateYmd);
      if (list) list.push(item);
    }
    mapByDay.forEach((list) => {
      list.sort((a, b) => {
        const tA = a.session.start_time || '99:99';
        const tB = b.session.start_time || '99:99';
        return String(tA).localeCompare(String(tB)) || a.caInDay - b.caInDay;
      });
    });
    return days.map((d) => ({
      ...d,
      items: mapByDay.get(d.ymd) || [],
    }));
  }, [anchorDate, getWeekBounds, filteredSessions]);

  const todayYmd = useMemo(() => toLocalDateString(new Date()), []);

  // Columns for Tab 2 (`pending`)
  const pendingColumns: Column<TeacherTrackingPendingItem>[] = [
    {
      header: 'Ngày / giờ',
      cell: (item) => (
        <div>
          <div className="font-semibold text-text-primary">
            {dateLabel(item.session.session_date)}
          </div>
          <div className="text-xs text-text-muted">
            {item.session.start_time || '—'} – {item.session.end_time || '—'}
          </div>
        </div>
      ),
    },
    {
      header: 'Học viên',
      cell: (item) => (
        <div>
          <div className="font-semibold text-text-primary">{item.student.full_name}</div>
          <div className="text-xs text-text-muted">
            {item.student.external_id || 'Chưa có mã'}
            {item.student.phone ? ` · ${item.student.phone}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Lớp / buổi',
      cell: (item) => (
        <div>
          <div className="font-medium text-text-primary">{item.class.class_name}</div>
          <div className="text-xs text-text-muted">Buổi {item.session.session_number}</div>
        </div>
      ),
    },
    {
      header: 'Trạng thái',
      cell: () => (
        <Badge variant="warning" dot>
          Chưa điểm danh
        </Badge>
      ),
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      cell: (item) =>
        isPrivileged && !isAdmin ? (
          <span
            title="Chỉ Admin chấm hộ giáo viên; MANAGE ghi ý kiến CSKH trong nhóm phụ trách"
            className="inline-block"
          >
            <Button
              id={`mark-attendance-${item.id}`}
              size="sm"
              disabled
              title="Chỉ Admin chấm hộ giáo viên; MANAGE ghi ý kiến CSKH trong nhóm phụ trách"
            >
              <ClipboardCheck className="h-4 w-4 mr-1.5" />
              Điểm danh
            </Button>
          </span>
        ) : (
          <Button
            id={`mark-attendance-${item.id}`}
            size="sm"
            onClick={() => openPendingMarkModal(item)}
          >
            <ClipboardCheck className="h-4 w-4 mr-1.5" />
            Điểm danh
          </Button>
        ),
    },
  ];

  // Columns for Tab 3 (`history`)
  const historyColumns: Column<TeacherTrackingHistoryItem>[] = [
    {
      header: 'Thời gian đổi',
      cell: (item) => (
        <span className="whitespace-nowrap font-medium text-text-primary">
          {dateTimeLabel(item.created_at)}
        </span>
      ),
    },
    {
      header: 'Học viên',
      cell: (item) => (
        <div>
          <div className="font-semibold text-text-primary">{item.student?.full_name || '—'}</div>
          <div className="text-xs text-text-muted">
            {item.student?.external_id || 'Chưa có mã'}
          </div>
        </div>
      ),
    },
    {
      header: 'Lớp / buổi',
      cell: (item) => (
        <div>
          <div className="font-medium text-text-primary">{item.class?.class_name || '—'}</div>
          <div className="text-xs text-text-muted">
            {item.session
              ? `${dateLabel(item.session.session_date)} · Buổi ${item.session.session_number}`
              : '—'}
          </div>
        </div>
      ),
    },
    {
      header: 'Thay đổi',
      cell: (item) => (
        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
          <Badge variant="neutral">{statusLabel(item.from_status)}</Badge>
          <span className="text-text-muted">→</span>
          <Badge variant="accent">{statusLabel(item.to_status)}</Badge>
        </div>
      ),
    },
    {
      header: 'Bài học / Ghi chú',
      cell: (item) => (
        <div className="space-y-0.5">
          {item.lesson_topic && (
            <div className="text-xs font-semibold text-teal-700">Bài: {item.lesson_topic}</div>
          )}
          <div className="text-text-secondary">
            {item.note || (!item.lesson_topic ? '—' : '')}
          </div>
        </div>
      ),
    },
    {
      header: 'Người thao tác',
      cell: (item) => <span className="font-medium text-text-primary">{item.performed_by}</span>,
    },
  ];

  // Render Progressive Disclosure Status Control for a single student in Tab 1
  const renderProgressiveStudentStatus = (item: EnrichedSession, ec: any, compact = false) => {
    const att = ec.attendance?.find(
      (a: any) => a.class_session_id === item.session.id && !a.deleted_at
    );
    const curStatus = (att?.teacher_status as AttendanceStatus | null | undefined) || null;
    const cfg = curStatus ? STATUS_CONFIG[curStatus] : null;
    const pickerKey = `${item.session.id}_${ec.id}`;
    const isOpen = activeInlinePickerKey === pickerKey;
    const isSavingThis = savingKey === pickerKey;

    if (!canMark) {
      return (
        <div className="inline-flex items-center gap-1.5">
          {cfg ? (
            <span
              className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs font-extrabold ${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`}
            >
              {cfg.chipLabel}
            </span>
          ) : (
            <Badge variant="neutral" size="sm">
              Chưa chấm
            </Badge>
          )}
        </div>
      );
    }

    if (isOpen) {
      return (
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-primary/40 bg-white p-1 shadow-xs">
          {STATUS_PICKER_LIST.map((stKey) => {
            const stCfg = STATUS_CONFIG[stKey];
            const isSelected = curStatus === stKey;
            return (
              <button
                key={stKey}
                type="button"
                disabled={isSavingThis}
                onClick={() => void handleInlineSelectStatus(item, ec, stKey)}
                title={stCfg.chipLabel}
                className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-bold transition cursor-pointer ${
                  isSelected
                    ? `${stCfg.bg} ${stCfg.text} ${stCfg.border} ring-2 ring-primary ring-offset-1`
                    : 'border-border/80 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                } disabled:opacity-50`}
              >
                <span className="font-extrabold">{stCfg.code}</span>
                <span>·</span>
                <span>{stCfg.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setActiveInlinePickerKey(null)}
            title="Đóng"
            className="ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          disabled={isSavingThis}
          onClick={() => setActiveInlinePickerKey(pickerKey)}
          title={
            cfg
              ? `${cfg.chipLabel} — Bấm để đổi trạng thái điểm danh`
              : `Bấm để chấm điểm danh cho ${ec.enrollment?.student?.full_name || 'học viên'}`
          }
          className={`inline-flex ${compact ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs'} shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-bold transition cursor-pointer ${
            cfg
              ? `${cfg.bg} ${cfg.text} ${cfg.border} shadow-2xs`
              : 'min-w-9 border-border/80 bg-white text-slate-500 hover:border-primary/60 hover:bg-primary-soft/30 hover:text-primary'
          } disabled:opacity-50`}
        >
          {isSavingThis ? (
            <span className="text-[11px] text-slate-500">Đang lưu...</span>
          ) : cfg ? (
            <span>{cfg.chipLabel}</span>
          ) : (
            <span className="font-extrabold text-slate-400">—</span>
          )}
        </button>

        {/* Reconciliation status micro-badge */}
        {att?.reconciliation_state === 'MATCHED' ? (
          <Badge variant="success" size="sm" dot>
            Khớp CSKH
          </Badge>
        ) : att?.reconciliation_state === 'CONFLICT' ? (
          <Badge variant="danger" size="sm" dot>
            Lệch ý kiến
          </Badge>
        ) : att?.teacher_status ? (
          <Badge variant="warning" size="sm" dot>
            Chờ CSKH duyệt
          </Badge>
        ) : null}
      </div>
    );
  };

  // Render Group Class Progress Chip + Distinct Dashed Indigo "Chấm cả lớp" Action Button
  const renderGroupProgressAndBulkAction = (item: EnrichedSession) => {
    const isBulkSaving = savingKey === `bulk_${item.session.id}`;

    let progressBadge: React.ReactNode;
    if (item.isFullyMarked) {
      progressBadge = (
        <span
          data-testid={`group-progress-${item.session.id}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-bold text-emerald-700 whitespace-nowrap"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Đã chấm đủ {item.markedCount}/{item.totalStudents}
        </span>
      );
    } else if (item.isPartiallyMarked) {
      progressBadge = (
        <span
          data-testid={`group-progress-${item.session.id}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-bold text-amber-700 whitespace-nowrap"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Đã chấm {item.markedCount}/{item.totalStudents}
        </span>
      );
    } else {
      progressBadge = (
        <span
          data-testid={`group-progress-${item.session.id}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          Chưa chấm 0/{item.totalStudents}
        </span>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        {progressBadge}

        {canMark && item.totalStudents > 0 && (
          <button
            type="button"
            data-testid={`bulk-mark-class-${item.session.id}`}
            disabled={isBulkSaving}
            onClick={() => void handleMarkEntireClass(item, 'ATTENDED')}
            title="Thao tác chấm nhanh 1 · Có mặt cho toàn bộ học viên trong lớp nhóm này"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-indigo-300 bg-white px-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 transition whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>{isBulkSaving ? 'Đang chấm...' : 'Chấm cả lớp'}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <PageContainer>
      <PageHeader title="Lịch dạy & Theo dõi Điểm danh" />

      {/* 3 Tab nghiệp vụ lớn ngay dưới PageHeader */}
      <HorizontalTabs
        ariaLabel="Chế độ lịch dạy và theo dõi điểm danh giáo viên"
        value={mainTab}
        onChange={(nextTab) => {
          setMainTab(nextTab);
          setCurrentPage(1);
          setTrackingPage(1);
        }}
        className="mb-4"
        items={[
          {
            value: 'schedule',
            label: 'Lịch dạy & Điểm danh',
            icon: <Calendar />,
            badge: kpiMetrics.totalSessions,
          },
          {
            value: 'pending',
            label: 'Chờ GV xác nhận',
            icon: <ClipboardCheck />,
            badge: pendingCount,
          },
          {
            value: 'history',
            label: 'Lịch sử thay đổi',
            icon: <History />,
          },
        ]}
      />

      {/* Cụm FilterBar chuẩn Design System dùng chung cho cả 3 Tab */}
      <FilterBar
        title="Bộ lọc & Tìm kiếm"
        activeCount={activeFilterCount}
        onClear={handleClearFilters}
        gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end"
      >
        {isPrivileged && (
          <div>
            <label
              htmlFor="sessions-teacher-select"
              className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
            >
              Giáo viên phụ trách
            </label>
            <select
              id="sessions-teacher-select"
              value={selectedTeacherId || ''}
              onChange={(event) => {
                setSelectedTeacherId(
                  event.target.value ? Number(event.target.value) : undefined
                );
                setCurrentPage(1);
                setTrackingPage(1);
              }}
              className="w-full h-9 px-3 border border-border rounded-xl text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
            >
              <option value="">Chọn giáo viên...</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.user_id!}>
                  {teacher.name} · {teacher.code}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label
            htmlFor="sessions-quick-search"
            className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
          >
            Tìm kiếm nhanh
          </label>
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              id="sessions-quick-search"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
                setTrackingPage(1);
              }}
              placeholder="Mã lớp, tên lớp, tên/mã/SĐT HV, bài học..."
              className="w-full h-9 pl-8 pr-7 border border-border rounded-xl text-xs bg-white text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDebouncedSearch('');
                  setCurrentPage(1);
                  setTrackingPage(1);
                }}
                className="absolute right-2 text-text-muted hover:text-text-primary cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="sessions-class-filter"
            className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
          >
            Lớp học
          </label>
          <select
            id="sessions-class-filter"
            value={selectedClassId || ''}
            onChange={(e) => {
              setSelectedClassId(e.target.value ? Number(e.target.value) : undefined);
              setCurrentPage(1);
              setTrackingPage(1);
            }}
            className="w-full h-9 px-3 border border-border rounded-xl text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
          >
            <option value="">Tất cả lớp học</option>
            {availableClasses.map((cls: any) => (
              <option key={cls.id} value={cls.id}>
                {cls.class_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="sessions-model-filter"
            className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
          >
            Mô hình lớp
          </label>
          <select
            id="sessions-model-filter"
            value={modelFilter}
            onChange={(e) => {
              setModelFilter(e.target.value as ModelFilter);
              setCurrentPage(1);
              setTrackingPage(1);
            }}
            aria-label="Lọc theo mô hình lớp"
            className="w-full h-9 px-3 border border-border rounded-xl text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
          >
            <option value="ALL">Tất cả mô hình</option>
            <option value="1:1">1:1</option>
            <option value="1:2">1:2</option>
            <option value="1:n">1:n</option>
          </select>
        </div>

        {mainTab === 'schedule' ? (
          <div>
            <label
              htmlFor="sessions-status-filter"
              className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
            >
              Trạng thái chấm
            </label>
            <select
              id="sessions-status-filter"
              value={completionFilter}
              onChange={(e) => {
                setCompletionFilter(e.target.value as CompletionFilter);
                setCurrentPage(1);
              }}
              aria-label="Trạng thái chấm"
              className="w-full h-9 px-3 border border-border rounded-xl text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PENDING">Chờ chấm / Chấm thiếu</option>
              <option value="COMPLETED">Đã chấm đủ</option>
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="tracking-start-date"
                className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
              >
                Từ ngày
              </label>
              <input
                id="tracking-start-date"
                type="date"
                value={trackingStartDate}
                onChange={(e) => {
                  setTrackingStartDate(e.target.value);
                  setTrackingPage(1);
                }}
                className="w-full h-9 px-2.5 border border-border rounded-xl text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
              />
            </div>
            <div>
              <label
                htmlFor="tracking-end-date"
                className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
              >
                Đến ngày
              </label>
              <input
                id="tracking-end-date"
                type="date"
                value={trackingEndDate}
                min={trackingStartDate || undefined}
                onChange={(e) => {
                  setTrackingEndDate(e.target.value);
                  setTrackingPage(1);
                }}
                className="w-full h-9 px-2.5 border border-border rounded-xl text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
              />
            </div>
          </div>
        )}
      </FilterBar>

      {/* MAIN CONTENT AREA */}
      {!hasContext ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <UserRoundCheck className="h-7 w-7" />
          </div>
          <h2 className="font-bold text-text-primary">Chọn giáo viên để bắt đầu</h2>
          <p className="mt-1 text-sm text-text-muted">
            Hệ thống không trộn dữ liệu của nhiều giáo viên trong cùng một danh sách.
          </p>
        </Card>
      ) : mainTab === 'pending' ? (
        <DataTable
          columns={pendingColumns}
          data={displayedPendingItems}
          isLoading={isLoadingTracking}
          emptyMessage="Không còn lượt nào chờ giáo viên điểm danh"
          serverPagination
          total={trackingTotal}
          page={trackingPage}
          pageSize={trackingPageSize}
          onPageChange={setTrackingPage}
          onPageSizeChange={setTrackingPageSize}
        />
      ) : mainTab === 'history' ? (
        <DataTable
          columns={historyColumns}
          data={displayedHistoryItems}
          isLoading={isLoadingTracking}
          emptyMessage="Chưa có lần thay đổi trạng thái nào"
          serverPagination
          total={trackingTotal}
          page={trackingPage}
          pageSize={trackingPageSize}
          onPageChange={setTrackingPage}
          onPageSizeChange={setTrackingPageSize}
        />
      ) : (
        /* TAB 1 (`schedule`): Lịch dạy & Điểm danh với Table Toolbar chuẩn mực */
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-soft">
          {/* Thanh công cụ đầu bảng (Table Toolbar) */}
          <div
            data-testid="sessions-kpi-bar"
            className="border-b border-border/80 bg-slate-50/60 p-3 sm:px-4 flex flex-wrap items-center justify-between gap-2.5 text-xs"
          >
            {/* Bên trái: Các chip KPI lọc nhanh gọn gàng */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="kpi-chip-all"
                onClick={() => {
                  setCompletionFilter('ALL');
                  setCurrentPage(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  completionFilter === 'ALL'
                    ? 'border-primary bg-primary-soft/60 text-primary shadow-2xs'
                    : 'border-border/80 bg-surface text-text-secondary hover:bg-slate-100'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>Tất cả:</span>
                <strong className="font-extrabold text-text-primary">
                  {kpiMetrics.totalSessions} ca
                </strong>
              </button>

              <button
                type="button"
                data-testid="kpi-chip-pending"
                onClick={() => {
                  setCompletionFilter(completionFilter === 'PENDING' ? 'ALL' : 'PENDING');
                  setCurrentPage(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  completionFilter === 'PENDING'
                    ? 'border-amber-400 bg-amber-50 text-amber-800 shadow-2xs ring-1 ring-amber-300'
                    : 'border-amber-200/80 bg-amber-50/40 text-amber-700 hover:bg-amber-50'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Chờ chấm:</span>
                <strong className="font-extrabold text-amber-900">
                  {kpiMetrics.pendingSessions}
                </strong>
              </button>

              <button
                type="button"
                data-testid="kpi-chip-completed"
                onClick={() => {
                  setCompletionFilter(completionFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED');
                  setCurrentPage(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  completionFilter === 'COMPLETED'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-800 shadow-2xs ring-1 ring-emerald-300'
                    : 'border-emerald-200/80 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Đã chấm đủ:</span>
                <strong className="font-extrabold text-emerald-900">
                  {kpiMetrics.completedSessions}
                </strong>
              </button>

              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-secondary">
                <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                <span>Số lớp:</span>
                <strong className="font-extrabold text-text-primary">
                  {kpiMetrics.distinctClasses}
                </strong>
              </span>
            </div>

            {/* Bên phải: Bộ chuyển kiểu xem + Bộ chọn phạm vi kỳ + Cụm lịch */}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {/* Bộ chuyển kiểu xem (2 chế độ tinh gọn: Bảng lịch dạy ⇄ Thời khóa biểu tuần) */}
              <div
                className="inline-flex h-9 items-center p-0.5 bg-surface-muted rounded-xl border border-border/70 gap-0.5"
                role="tablist"
                aria-label="Chuyển đổi chế độ hiển thị lịch dạy"
              >
                <button
                  type="button"
                  data-testid="view-mode-table"
                  onClick={() => setViewMode('table')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'table'
                      ? 'bg-surface text-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>Bảng lịch dạy</span>
                </button>
                <button
                  type="button"
                  data-testid="view-mode-timetable"
                  onClick={() => {
                    setViewMode('timetable');
                    if (dateRangeFilter === 'today') {
                      setDateRangeFilter('week');
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'timetable'
                      ? 'bg-surface text-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Thời khóa biểu tuần</span>
                </button>
              </div>

              {/* Bộ chọn phạm vi kỳ: Theo ngày | Theo tuần | Theo tháng */}
              <div
                className="inline-flex h-9 items-center p-0.5 bg-surface-muted rounded-xl border border-border/70 gap-0.5"
                role="group"
                aria-label="Chế độ xem kỳ lịch dạy"
              >
                <button
                  type="button"
                  onClick={() => {
                    setDateRangeFilter('today');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateRangeFilter === 'today'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Theo ngày
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateRangeFilter('week');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateRangeFilter === 'week'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Theo tuần
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateRangeFilter('month');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateRangeFilter === 'month'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Theo tháng
                </button>
              </div>

              {/* Cụm lịch < [input type="date"] > */}
              <div className="flex h-9 items-center gap-1 rounded-xl border border-border/70 bg-surface p-1">
                <button
                  type="button"
                  onClick={() => shiftPeriod(-1)}
                  className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary cursor-pointer"
                  aria-label="Kỳ trước"
                  title="Kỳ trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={anchorDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setAnchorDate(e.target.value);
                      setCurrentPage(1);
                    }
                  }}
                  className="w-[128px] rounded-lg border-0 bg-transparent px-1 py-0.5 text-xs font-bold text-text-primary outline-none focus:ring-1 focus:ring-primary"
                  aria-label="Chọn ngày xem lịch"
                />
                <button
                  type="button"
                  onClick={() => shiftPeriod(1)}
                  className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary cursor-pointer"
                  aria-label="Kỳ sau"
                  title="Kỳ sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Nội dung bảng lịch dạy hoặc thời khóa biểu tuần */}
          {isLoadingSessions ? (
            <div className="py-12 text-center text-text-muted">Đang tải lịch dạy...</div>
          ) : filteredSessions.length === 0 && viewMode !== 'timetable' ? (
            <div className="py-12 text-center">
              <Calendar className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-60" />
              <h3 className="text-base font-semibold text-text-primary">
                Không có ca dạy nào khớp bộ lọc trong khoảng thời gian này
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Chuyển ngày, đổi bộ lọc trạng thái/mô hình hoặc chọn chế độ xem Theo tuần / Theo
                tháng để xem các buổi học khác.
              </p>
            </div>
          ) : viewMode === 'table' ? (
            <>
              <div data-testid="sessions-table-view" className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/80 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                      <th className="py-2.5 px-3 whitespace-nowrap">Ngày & Thứ</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Khung giờ</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Lớp học</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Học viên</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Tiến độ & Điểm danh</th>
                      <th className="py-2.5 px-3 whitespace-nowrap min-w-[260px]">
                        Bài học & Ghi chú GV
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paginatedSessions.map((item) => {
                      const { session } = item;
                      const dayFmt = formatSessionDayBadge(item.dateYmd);
                      const classCode = formatClassCode(
                        session.class?.class_code,
                        session.class?.id
                      );
                      const isExpanded = !!expandedGroupSessions[session.id];
                      const sessionDraftKey = `s_${session.id}`;
                      const lessonVal =
                        lessonDrafts[sessionDraftKey] !== undefined
                          ? lessonDrafts[sessionDraftKey]
                          : item.effectiveLessonTopic || '';
                      const noteVal =
                        noteDrafts[sessionDraftKey] !== undefined
                          ? noteDrafts[sessionDraftKey]
                          : item.effectiveTeacherNote || '';
                      const isSavingNote = savingKey === `note_${session.id}`;
                      const singleEc = !item.isGroupClass ? item.enrollmentClasses[0] : null;
                      const singleStudent = singleEc?.enrollment?.student;

                      return (
                        <React.Fragment key={session.id}>
                          <tr
                            data-testid={`session-row-${session.id}`}
                            className={`min-h-[44px] transition-colors ${
                              item.isFullyMarked
                                ? 'bg-emerald-50/15 hover:bg-emerald-50/30'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* 1. Ngày & Thứ + Ca */}
                            <td className="py-2 px-3 whitespace-nowrap align-middle">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex h-5 items-center justify-center rounded bg-slate-100 px-1.5 text-[11px] font-extrabold text-slate-700">
                                  {dayFmt.dow}
                                </span>
                                <span className="font-bold text-text-primary">{dayFmt.dmy}</span>
                                <span className="inline-flex items-center rounded-md bg-teal-50 border border-teal-200/80 px-1.5 py-0.5 text-[10px] font-extrabold text-teal-700">
                                  Ca {item.caInDay}
                                </span>
                              </div>
                            </td>

                            {/* 2. Khung giờ */}
                            <td className="py-2 px-3 whitespace-nowrap align-middle">
                              {session.start_time || session.end_time ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
                                  <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                  {session.start_time || '—'} - {session.end_time || '—'}
                                </span>
                              ) : (
                                <span className="italic text-text-muted">Chưa xếp giờ</span>
                              )}
                            </td>

                            {/* 3. Lớp học */}
                            <td className="py-2 px-3 align-middle">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-[11px] font-bold text-slate-500">
                                  {classCode}
                                </span>
                                <span className="font-bold text-text-primary">
                                  {session.class?.class_name || '—'}
                                </span>
                                <span
                                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold border ${
                                    item.modelType === '1:1'
                                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  }`}
                                >
                                  {item.modelType}
                                </span>
                                {session.class?.level && (
                                  <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                    {session.class.level}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 4. Học viên */}
                            <td className="py-2 px-3 whitespace-nowrap align-middle">
                              {!item.isGroupClass ? (
                                singleStudent ? (
                                  <div className="flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <div>
                                      <span className="font-bold text-text-primary">
                                        {singleStudent.full_name}
                                      </span>
                                      <span className="ml-1.5 text-[11px] text-text-muted">
                                        ({singleStudent.external_id || '—'})
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="italic text-text-muted">Chưa có học viên</span>
                                )
                              ) : (
                                <button
                                  type="button"
                                  data-testid={`toggle-group-students-${session.id}`}
                                  onClick={() => toggleGroupExpand(session.id)}
                                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                >
                                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>{item.totalStudents} học viên</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                  )}
                                </button>
                              )}
                            </td>

                            {/* 5. Tiến độ & Điểm danh */}
                            <td className="py-2 px-3 align-middle">
                              {!item.isGroupClass ? (
                                singleEc ? (
                                  renderProgressiveStudentStatus(item, singleEc)
                                ) : (
                                  <span className="text-text-muted">—</span>
                                )
                              ) : (
                                renderGroupProgressAndBulkAction(item)
                              )}
                            </td>

                            {/* 6. Bài học & Ghi chú GV */}
                            <td className="py-2 px-3 align-middle">
                              {canMark ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={lessonVal}
                                    onChange={(e) =>
                                      setLessonDrafts((prev) => ({
                                        ...prev,
                                        [sessionDraftKey]: e.target.value,
                                      }))
                                    }
                                    onBlur={() => void handleSaveSessionLessonAndNote(item)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void handleSaveSessionLessonAndNote(item);
                                      }
                                    }}
                                    placeholder="Bài học (VD: K2 L4)..."
                                    aria-label={`Bài học ca ${session.id}`}
                                    className="h-7 w-32 sm:w-36 rounded-lg border border-border/80 bg-white px-2 text-xs text-text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                  <input
                                    type="text"
                                    value={noteVal}
                                    onChange={(e) =>
                                      setNoteDrafts((prev) => ({
                                        ...prev,
                                        [sessionDraftKey]: e.target.value,
                                      }))
                                    }
                                    onBlur={() => void handleSaveSessionLessonAndNote(item)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void handleSaveSessionLessonAndNote(item);
                                      }
                                    }}
                                    placeholder="Ghi chú GV..."
                                    aria-label={`Ghi chú GV ca ${session.id}`}
                                    className="h-7 w-32 sm:w-40 rounded-lg border border-border/80 bg-white px-2 text-xs text-text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                  <button
                                    type="button"
                                    disabled={isSavingNote}
                                    onClick={() => void handleSaveSessionLessonAndNote(item)}
                                    title="Lưu nhanh bài học & ghi chú"
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-slate-50 text-teal-700 hover:bg-teal-50 hover:border-teal-300 transition cursor-pointer disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="text-xs text-text-secondary">
                                  {lessonVal ? (
                                    <span className="font-semibold text-teal-700">
                                      Bài: {lessonVal}
                                    </span>
                                  ) : (
                                    <span className="text-text-muted">—</span>
                                  )}
                                  {noteVal && (
                                    <span className="ml-2 italic text-text-muted">"{noteVal}"</span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Expanded sub-rows for Group Class (1:2 / 1:n) */}
                          {item.isGroupClass && isExpanded && (
                            <tr className="bg-slate-50/70">
                              <td colSpan={6} className="px-4 py-2.5">
                                <div className="rounded-xl border border-indigo-100 bg-white p-2.5 shadow-2xs">
                                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-indigo-900">
                                    <span>
                                      Danh sách học viên lớp {session.class?.class_name} (Ca{' '}
                                      {item.caInDay} · {dayFmt.dmy})
                                    </span>
                                    <span className="text-text-muted font-medium">
                                      Bấm vào từng học viên để chấm lẻ hoặc điều chỉnh trạng thái
                                      riêng
                                    </span>
                                  </div>
                                  <div className="divide-y divide-border/50">
                                    {item.enrollmentClasses.map((ec: any, idx: number) => {
                                      const st = ec.enrollment?.student;
                                      const att = ec.attendance?.find(
                                        (a: any) =>
                                          a.class_session_id === session.id && !a.deleted_at
                                      );
                                      return (
                                        <div
                                          key={ec.id}
                                          className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs"
                                        >
                                          <div className="flex items-center gap-2 min-w-[200px]">
                                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                                              {idx + 1}
                                            </span>
                                            <span className="font-bold text-text-primary">
                                              {st?.full_name || '—'}
                                            </span>
                                            <span className="text-text-muted">
                                              • Mã HV: {st?.external_id || '—'}
                                            </span>
                                            {isPrivileged && st?.phone && (
                                              <span className="text-text-muted">• {st.phone}</span>
                                            )}
                                          </div>

                                          <div className="flex flex-wrap items-center gap-3">
                                            {renderProgressiveStudentStatus(item, ec, true)}
                                            {att?.lesson_topic && (
                                              <span className="text-[11px] font-semibold text-teal-700">
                                                Bài: {att.lesson_topic}
                                              </span>
                                            )}
                                            {att?.teacher_note && (
                                              <span className="text-[11px] italic text-text-secondary">
                                                "{att.teacher_note}"
                                              </span>
                                            )}
                                            {canMark && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleOpenMarkModal(
                                                    session,
                                                    ec,
                                                    (att?.teacher_status as AttendanceStatus) ||
                                                      'ATTENDED'
                                                  )
                                                }
                                                className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                                              >
                                                Ghi chú riêng
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION FOOTER (25 · 50 · 100 · 200) */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border/80 bg-surface text-xs text-text-secondary">
                <div className="flex items-center gap-2">
                  <span>
                    Hiển thị <strong className="text-text-primary">{startRecord}</strong> -{' '}
                    <strong className="text-text-primary">{endRecord}</strong> trên tổng số{' '}
                    <strong className="text-text-primary">{totalCount}</strong> ca dạy
                  </span>
                  <span className="hidden sm:inline text-text-muted">•</span>
                  <div className="flex items-center gap-1.5">
                    <span>Mỗi trang:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPageSafe - 1))}
                    disabled={currentPageSafe <= 1}
                    className="h-8 w-8 p-0"
                    aria-label="Trang trước"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="px-2 font-medium">
                    Trang {currentPageSafe} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPageSafe + 1))}
                    disabled={currentPageSafe >= totalPages}
                    className="h-8 w-8 p-0"
                    aria-label="Trang sau"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* VIEW MODE 2: WEEKLY CALENDAR TIMETABLE (`timetable` — 7 Days Matrix) */
            <div data-testid="sessions-timetable-view" className="p-3.5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span>
                    Thời khóa biểu tuần ({weekCalendar[0]?.dmyShort} –{' '}
                    {weekCalendar[6]?.dmyShort})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                    Đã chấm đủ
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-amber-700">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                    Đang chấm dở
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-rose-700">
                    <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" />
                    Chưa chấm
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
                {weekCalendar.map((dayCol) => {
                  const isToday = dayCol.ymd === todayYmd;
                  return (
                    <div
                      key={dayCol.ymd}
                      data-testid={`timetable-day-${dayCol.ymd}`}
                      className={`flex flex-col rounded-xl border min-h-[220px] ${
                        isToday
                          ? 'border-primary/60 bg-primary-soft/15'
                          : 'border-border/70 bg-slate-50/50'
                      }`}
                    >
                      {/* Column Header */}
                      <div
                        className={`flex items-center justify-between border-b px-2.5 py-2 rounded-t-xl ${
                          isToday
                            ? 'border-primary/30 bg-primary text-white'
                            : 'border-border/60 bg-slate-100/80 text-text-primary'
                        }`}
                      >
                        <div className="text-xs font-extrabold">{dayCol.dowLong}</div>
                        <div
                          className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                            isToday ? 'bg-white/20 text-white' : 'text-text-secondary'
                          }`}
                        >
                          {dayCol.dmyShort}
                        </div>
                      </div>

                      {/* Session Chips */}
                      <div className="flex-1 space-y-2 p-2">
                        {dayCol.items.length === 0 ? (
                          <div className="flex h-full min-h-[120px] items-center justify-center text-[11px] italic text-text-muted">
                            Trống lịch
                          </div>
                        ) : (
                          dayCol.items.map((item) => {
                            const { session } = item;
                            const singleSt =
                              item.enrollmentClasses.length === 1
                                ? item.enrollmentClasses[0]?.enrollment?.student
                                : null;

                            const chipTheme = item.isFullyMarked
                              ? 'border-emerald-300 bg-emerald-50/90 hover:bg-emerald-100/80 text-emerald-950'
                              : item.isPartiallyMarked
                              ? 'border-amber-300 bg-amber-50/90 hover:bg-amber-100/80 text-amber-950'
                              : 'border-rose-200 bg-rose-50/60 hover:bg-rose-100/60 text-slate-900';

                            return (
                              <button
                                key={session.id}
                                type="button"
                                data-testid={`timetable-chip-${session.id}`}
                                onClick={() => openQuickSessionModal(item)}
                                className={`w-full text-left rounded-xl border p-2.5 shadow-2xs transition cursor-pointer ${chipTheme}`}
                              >
                                <div className="flex items-center justify-between gap-1 text-[11px] font-extrabold">
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    {session.start_time || '—'} - {session.end_time || '—'}
                                  </span>
                                  <span className="rounded bg-white/80 px-1.5 py-0.2 text-[10px] font-extrabold border border-black/10">
                                    {item.modelType}
                                  </span>
                                </div>

                                <div className="mt-1 font-bold text-xs truncate">
                                  {session.class?.class_name}
                                </div>

                                <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
                                  {!item.isGroupClass && singleSt ? (
                                    <span className="truncate font-medium">
                                      HV: {singleSt.full_name}
                                    </span>
                                  ) : (
                                    <span className="font-semibold">
                                      Đã chấm: {item.markedCount}/{item.totalStudents} HV
                                    </span>
                                  )}
                                  {!item.isGroupClass && singleSt && (
                                    <span className="shrink-0 text-[10px] font-extrabold">
                                      {item.isFullyMarked ? '1 · Có mặt' : 'Chưa chấm'}
                                    </span>
                                  )}
                                </div>

                                {item.effectiveLessonTopic && (
                                  <div className="mt-1 truncate rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                                    Bài: {item.effectiveLessonTopic}
                                  </div>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Điểm danh nhanh cả ca học (từ Thời khóa biểu tuần) */}
      <Modal
        isOpen={Boolean(quickModalItem)}
        onClose={() => {
          if (!isQuickModalSaving) setQuickModalSessionId(null);
        }}
        size="lg"
        title={
          <div className="flex items-center gap-2 text-text-primary font-bold">
            <CalendarDays className="w-5 h-5 text-primary" />
            <span>
              Điểm danh nhanh ca học: {quickModalItem?.session.class?.class_name} (Ca{' '}
              {quickModalItem?.caInDay} ·{' '}
              {quickModalItem ? formatSessionDayBadge(quickModalItem.dateYmd).full : ''})
            </span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setQuickModalSessionId(null)}
              disabled={isQuickModalSaving}
            >
              Đóng
            </Button>
            {canMark && (
              <Button
                variant="primary"
                onClick={handleSaveQuickSessionModal}
                disabled={isQuickModalSaving}
              >
                {isQuickModalSaving ? 'Đang lưu...' : 'Lưu điểm danh ca học'}
              </Button>
            )}
          </div>
        }
      >
        {quickModalItem && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-slate-50 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-text-primary">
                  Khung giờ: {quickModalItem.session.start_time || '—'} -{' '}
                  {quickModalItem.session.end_time || '—'}
                </span>
                <span>•</span>
                <span className="font-semibold text-indigo-700">
                  Mô hình {quickModalItem.modelType}
                </span>
                <span>•</span>
                <span>
                  Tiến độ: {Object.keys(quickModalStatuses).length}/{quickModalItem.totalStudents}{' '}
                  HV
                </span>
              </div>

              {canMark && quickModalItem.totalStudents > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<number, AttendanceStatus> = {};
                    for (const ec of quickModalItem.enrollmentClasses) {
                      next[ec.id] = 'ATTENDED';
                    }
                    setQuickModalStatuses(next);
                  }}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-indigo-300 bg-white px-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Chấm cả lớp (1 · Có mặt)</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Bài học / Chủ đề bài giảng của ca"
                placeholder="VD: K2 L4, Kaiwa 2 Bài 4..."
                value={quickModalLesson}
                onChange={(e) => setQuickModalLesson(e.target.value)}
                disabled={!canMark}
              />
              <Input
                label="Ghi chú chung của giáo viên"
                placeholder="Ghi chú chung cho buổi học..."
                value={quickModalNote}
                onChange={(e) => setQuickModalNote(e.target.value)}
                disabled={!canMark}
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-text-primary">
                Danh sách học viên ({quickModalItem.totalStudents})
              </div>
              <div className="divide-y divide-border/60 rounded-xl border border-border/80 bg-white">
                {quickModalItem.enrollmentClasses.map((ec: any) => {
                  const st = ec.enrollment?.student;
                  const chosen = quickModalStatuses[ec.id];
                  return (
                    <div
                      key={ec.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 text-xs"
                    >
                      <div>
                        <div className="font-bold text-text-primary">{st?.full_name || '—'}</div>
                        <div className="text-[11px] text-text-muted">
                          Mã HV: {st?.external_id || '—'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {STATUS_PICKER_LIST.map((stKey) => {
                          const stCfg = STATUS_CONFIG[stKey];
                          const active = chosen === stKey;
                          return (
                            <button
                              key={stKey}
                              type="button"
                              disabled={!canMark}
                              onClick={() =>
                                setQuickModalStatuses((prev) => ({
                                  ...prev,
                                  [ec.id]: stKey,
                                }))
                              }
                              className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition cursor-pointer ${
                                active
                                  ? `${stCfg.bg} ${stCfg.text} ${stCfg.border} ring-2 ring-primary ring-offset-1`
                                  : 'border-border/80 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              } disabled:opacity-50`}
                            >
                              <span>{stCfg.chipLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Điểm danh buổi học (1 học viên chi tiết ở Tab 1) */}
      <Modal
        isOpen={isMarkModalOpen}
        onClose={() => setIsMarkModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-text-primary font-bold">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <span>
              Điểm danh ca dạy: {selectedSession?.start_time || '19:00'} -{' '}
              {selectedSession?.end_time || '19:30'}
            </span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setIsMarkModalOpen(false)}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmMark}
              disabled={isSubmitting || (isPrivileged && !isAdmin)}
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu Điểm Danh'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-surface-muted/60 p-3 rounded-xl border border-border/60 text-xs">
            <p className="font-bold text-text-primary text-sm">
              {selectedEnrollmentClass?.enrollment?.student?.full_name}
            </p>
            <p className="text-text-muted mt-0.5">
              Mã HV: {selectedEnrollmentClass?.enrollment?.student?.external_id || 'N/A'} • Lớp:{' '}
              {selectedSession?.class?.class_name}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Trạng thái điểm danh
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_PICKER_LIST.map((stKey) => (
                <Button
                  key={stKey}
                  type="button"
                  variant={selectedStatus === stKey ? 'primary' : 'outline'}
                  className="justify-start text-xs h-9"
                  onClick={() => setSelectedStatus(stKey)}
                >
                  {STATUS_CONFIG[stKey].chipLabel}
                </Button>
              ))}
            </div>
          </div>

          {selectedStatus === 'ATTENDED' && (
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Tên bài học / Chủ đề bài giảng{' '}
                <span className="text-teal-600 font-normal">(VD: K2 L4, K1-L1...)</span>
              </label>
              <Input
                placeholder="Ví dụ: K2 L4 hoặc Kaiwa 2 Bài 4"
                value={lessonTopic}
                onChange={(e) => setLessonTopic(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Ghi chú của giáo viên (tùy chọn)
            </label>
            <Textarea
              placeholder="Ghi nhận thái độ học viên, lỗi phát âm, nhắc nhở làm BTVN..."
              rows={2}
              value={teacherNote}
              onChange={(e) => setTeacherNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* MODAL: Điểm danh xác nhận ở Tab 2 (`pending` — Chờ GV xác nhận) */}
      <Modal
        isOpen={!!selectedPendingItem}
        onClose={() => !isSubmittingPendingMark && setSelectedPendingItem(null)}
        title="Điểm danh học viên"
        description={
          selectedPendingItem
            ? `${selectedPendingItem.student.full_name} · ${selectedPendingItem.class.class_name} · Buổi ${selectedPendingItem.session.session_number}`
            : undefined
        }
        closeOnOutsideClick={!isSubmittingPendingMark}
        footer={
          <>
            <Button
              id="cancel-teacher-mark"
              variant="outline"
              onClick={() => setSelectedPendingItem(null)}
              disabled={isSubmittingPendingMark}
            >
              Hủy
            </Button>
            <Button
              id="submit-teacher-mark"
              onClick={handleConfirmPendingMark}
              disabled={!pendingMarkStatus || isSubmittingPendingMark}
            >
              {isSubmittingPendingMark ? 'Đang lưu...' : 'Xác nhận điểm danh'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-info/20 bg-blue-50/70 p-3 text-sm text-text-secondary">
            Hãy tự chọn kết quả theo thực tế buổi học. Kết quả do CSKH ghi nhận không được hiển thị
            tại đây.
          </div>
          <Select
            id="teacher-mark-status"
            label="Trạng thái điểm danh"
            value={pendingMarkStatus}
            onChange={(event) => setPendingMarkStatus(event.target.value as AttendanceStatus)}
            options={[{ value: '', label: 'Chọn trạng thái...' }, ...TRACKING_STATUS_OPTIONS]}
          />
          {pendingMarkStatus === 'ATTENDED' && (
            <Input
              id="teacher-mark-lesson"
              label="Nội dung bài học"
              value={pendingMarkLesson}
              onChange={(event) => setPendingMarkLesson(event.target.value)}
              placeholder="Nội dung đã học trong buổi (VD: K2 L4)"
            />
          )}
          <Textarea
            id="teacher-mark-note"
            label="Ghi chú giáo viên"
            value={pendingMarkNote}
            onChange={(event) => setPendingMarkNote(event.target.value)}
            placeholder="Ghi chú thêm (không bắt buộc)"
          />
        </div>
      </Modal>
    </PageContainer>
  );
};

export default MyTeachingSessionsPage;
