import React, { useEffect, useState, useMemo, useRef } from 'react';
import { classesApi } from '../api/classes.api';
import { classSessionsApi, attendanceApi } from '../api/sessions.api';
import { enrollmentsApi } from '../../enrollments/api/enrollments.api';
import { Enrollment } from '../../enrollments/types/enrollments.types';
import {
  Class,
  ClassSession,
  ClassTeacherAssignment,
  ClassTeacherRole,
  Attendance,
  AttendanceStatus,
  AttendanceSide,
  CreateClassDTO,
  UpdateClassDTO,
  formatClassCode,
  cleanClassIdentifier,
  normalizeClassModel,
  CLASS_MODEL_BADGE_STYLES,
  ENROLLMENT_STATUS_BADGE_MAP,
  resolveEffectiveEnrollmentStatus,
  resolveClassDisplayStatus,
  formatCourseContentDisplay,
  formatScheduleTimeDisplay,
} from '../types/classes.types';
import { teachersApi } from '../../teachers/api/teachers.api';
import { Teacher } from '../../teachers/types/teachers.types';
import {
  AttendanceMatrix,
  AttendanceTab,
  StudentRow,
  compareSessionsInDay,
  formatSessionDate,
  toLocalDateString,
} from '../components/AttendanceMatrix';
import { AttendanceSessionDrawer } from '../components/AttendanceSessionDrawer';
import { useColumnVisibility } from '../../preferences/hooks/useColumnVisibility';
import { PreferenceScope } from '../../preferences/columns';
import { ColumnVisibilityDropdown } from '../../preferences/components/ColumnVisibilityDropdown';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar } from '../../../components/common/FilterBar';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
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
  Users,
  UserRoundCheck,
  GraduationCap,
  Trash2,
  BarChart3,
} from 'lucide-react';

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

type DetailedFilterMode = 'week' | 'month';
type DetailedViewMode = 'matrix' | 'log';

export interface ClassesPageProps {
  initialDisplayMode?: 'students' | 'classes';
}

interface EnrolledStudentItem {
  enrollment_class_id: number;
  class_id: number;
  student_id: number;
  full_name: string;
  external_id: string;
  phone?: string;
  email?: string;
  package_name?: string;
  course_content?: string;
  level?: string;
  total_sessions?: number;
  remaining_sessions?: number | null;
  attended_previous_years?: number;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
  program_type?: string;
  sale_name?: string | null;
  cs_staff_code?: string | null;
}

export const ClassesPage: React.FC<ClassesPageProps> = ({ initialDisplayMode }) => {
  const { user } = useAuth();
  const isAdminOrManage = Boolean(
    user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE')
  );
  const isCSOnly = Boolean(
    user?.roles?.includes('CS') && !isAdminOrManage
  );
  const isTeacher = Boolean(
    user?.roles?.includes('TEACHER') &&
      !isAdminOrManage &&
      !user?.roles?.includes('CS')
  );
  const activeSide: AttendanceSide = isAdminOrManage ? 'ADMIN' : isCSOnly ? 'CS' : 'TEACHER';
  const canManageClasses = isAdminOrManage;
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));

  const toast = useToast();

  // Chế độ hiển thị tại chỗ (Grouping Mode: Theo Học viên | Theo Lớp học)
  const [displayMode, setDisplayMode] = useState<'students' | 'classes'>(
    initialDisplayMode ?? (isTeacher ? 'classes' : 'students')
  );

  const [classes, setClasses] = useState<Class[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  // 3 Tab lớn dùng chung cho cả 2 chế độ và cả 3 role
  const [activeTab, setActiveTab] = useState<AttendanceTab>('quick');
  const prefScope: PreferenceScope = `enrollments.${activeTab}`;
  const { visible: visibleColumns } = useColumnVisibility(prefScope);
  const isColVisible = (key: string): boolean => {
    if (!visibleColumns) return true;
    return visibleColumns[key] !== false;
  };

  // Filters dùng chung cho cả 2 chế độ
  const [programFilter, setProgramFilter] = useState<'ALL' | 'KAIWA' | 'JLPT'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState<string>('');
  const [levelPackageFilter, setLevelPackageFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [onlyScheduledOnDate, setOnlyScheduledOnDate] = useState<boolean>(false);
  const [statsAttendanceFilter, setStatsAttendanceFilter] = useState<'' | 'ATTENTION' | 'GOOD'>('');

  // State chọn học viên & lớp học đồng bộ 100% giữa 2 chế độ và Thanh Nghiệp Vụ Hàng Loạt
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<Set<number>>(new Set());
  const [selectedClassIds, setSelectedClassIds] = useState<Set<number>>(new Set());
  const [bulkDateInClasses, setBulkDateInClasses] = useState<string>(() => toLocalDateString(new Date()));
  const [bulkSessionIndex, setBulkSessionIndex] = useState<number>(0);
  const [bulkLessonTopic, setBulkLessonTopic] = useState<string>('');
  const [bulkTeacherNote, setBulkTeacherNote] = useState<string>('');
  const [bulkCsNote, setBulkCsNote] = useState<string>('');
  const [bulkSaving, setBulkSaving] = useState<boolean>(false);

  // Nháp Ghi chú CSKH theo từng học viên & từng ca ở chế độ Theo Lớp học (`${enrollment_class_id}_${dateStr}_s${caNo}`)
  const [csNoteDrafts, setCsNoteDrafts] = useState<Record<string, string>>({});
  const csNoteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSavedCsNoteMapRef = useRef<Record<string, string>>({});

  // Tab 1 (Điểm danh nhanh): 1 ngày đang chọn (mặc định Hôm nay)
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString(new Date()));

  // Tab 2 (Lịch sử & Bảng tháng): Chế độ lọc kỳ (Theo tuần | Theo tháng), chế độ hiển thị (Bảng điểm danh | Nhật ký bài học), và lọc chỉ ngày có buổi học
  const [detailedFilterMode, setDetailedFilterMode] = useState<DetailedFilterMode>('month');
  const [detailedViewMode, setDetailedViewMode] = useState<DetailedViewMode>('matrix');
  const [onlyDaysWithSessions, setOnlyDaysWithSessions] = useState<boolean>(false);
  const [currentPeriodDate, setCurrentPeriodDate] = useState<Date>(() => new Date());

  // Collapsed state for 1:2 / 1:n classes (empty set = all expanded by default)
  const [collapsedClassIds, setCollapsedClassIds] = useState<Set<number>>(new Set());

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
  // Xác nhận xóa ca đã có điểm danh (Modal); ca trống bấm lầm "+" sẽ được gỡ ngay không hỏi lại
  const [deleteCaTarget, setDeleteCaTarget] = useState<{
    cls: Class;
    dateStr: string;
    caNumber: number;
    session: ClassSession;
    attendanceRowCount: number;
  } | null>(null);
  const [deletingCa, setDeletingCa] = useState(false);

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
  // Luôn lấy dữ liệu mới nhất từ danh sách lớp để modal tự render lại sau khi refresh.
  const assignmentClass = useMemo(
    () => classes.find((c) => c.id === assignmentClassId) || null,
    [classes, assignmentClassId]
  );
  const [assignmentTeachers, setAssignmentTeachers] = useState<Teacher[]>([]);
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
      if (isTeacher) {
        const data = await classesApi.list();
        setClasses(data);
      } else {
        const [classesData, enrollmentsData] = await Promise.all([
          classesApi.list(),
          enrollmentsApi.list().catch(() => [] as Enrollment[]),
        ]);
        setClasses(classesData);
        setEnrollments(enrollmentsData);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách lớp học & điểm danh');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, [isTeacher]);

  const normalizeModel = (model?: string | null, studentCount?: number): '1:1' | '1:2' | '1:n' =>
    normalizeClassModel(model, studentCount);

  const getStudentsOfClass = (cls: Class): EnrolledStudentItem[] => {
    const list: EnrolledStudentItem[] = [];
    cls.enrollment_classes?.forEach((ec: any) => {
      const enr = ec.enrollment;
      const st = enr?.student;
      const pkg = enr?.package;
      const pkgLabel = pkg?.name || pkg?.code || '';
      const levelLabel = enr?.level || cls.level || '';
      const effectiveStatus = resolveEffectiveEnrollmentStatus(
        enr?.status,
        true,
        `${enr?.class_model || ''} ${levelLabel}`
      );
      list.push({
        enrollment_class_id: ec.id,
        class_id: cls.id,
        student_id: st?.id || ec.id,
        full_name: st?.full_name || `Học viên #${ec.id}`,
        external_id: st?.external_id || enr?.external_id || `HV_${st?.id || ec.id}`,
        phone: st?.phone || '',
        email: st?.email || '',
        package_name: pkgLabel,
        course_content: formatCourseContentDisplay(
          enr?.course_content,
          enr?.program_type,
          pkgLabel,
          levelLabel
        ),
        level: levelLabel,
        total_sessions: enr?.total_sessions || 0,
        remaining_sessions: enr?.external_remaining_sessions ?? null,
        attended_previous_years: enr?.attended_previous_years || 0,
        start_date: enr?.start_date || null,
        end_date: enr?.end_date || null,
        status: effectiveStatus,
        program_type: enr?.program_type || 'KAIWA',
        sale_name: enr?.sale_name || enr?.sale?.name || null,
        cs_staff_code: enr?.cs?.staff_code || null,
      });
    });
    return list;
  };

  // Build lookup maps from classes + enrollments payload
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

    enrollments.forEach((enr) => {
      enr.enrollment_classes?.forEach((ec) => {
        const classId = ec.class_id || ec.class?.id;
        ec.class?.class_sessions?.forEach((s: any) => {
          const fullSess: ClassSession = { ...s, class_id: s.class_id || classId };
          if (!sessIdMap.has(fullSess.id)) {
            sessIdMap.set(fullSess.id, fullSess);
            if (classId) {
              const dStr = formatSessionDate(fullSess.session_date);
              const key = `${classId}_${dStr}`;
              const list = sessMap.get(key) || [];
              if (!list.some((item) => item.id === fullSess.id)) {
                list.push(fullSess);
                sessMap.set(key, list);
              }
            }
          }
        });
        ec.attendance?.forEach((a: any) => {
          if (!a.deleted_at) {
            attMap.set(`${ec.id}_session_${a.class_session_id}`, {
              ...a,
              enrollment_class_id: ec.id,
            } as Attendance);
            if (a.class_session && !sessIdMap.has(a.class_session.id)) {
              const fullSess: ClassSession = {
                ...a.class_session,
                class_id: a.class_session.class_id || classId,
              };
              sessIdMap.set(fullSess.id, fullSess);
              if (classId) {
                const dStr = formatSessionDate(fullSess.session_date);
                const key = `${classId}_${dStr}`;
                const list = sessMap.get(key) || [];
                if (!list.some((item) => item.id === fullSess.id)) {
                  list.push(fullSess);
                  sessMap.set(key, list);
                }
              }
            }
          }
        });
      });
    });

    sessMap.forEach((list) => list.sort(compareSessionsInDay));

    return {
      sessionsByClassAndDate: sessMap,
      attendanceByEcAndSession: attMap,
      sessionsById: sessIdMap,
    };
  }, [classes, enrollments]);

  // Kiểm tra một bản ghi điểm danh đã thực sự có kết quả CHỐT hay chưa (dùng chung cho CSKH & Admin)
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

  // Tính thống kê cho từng học viên (Tổng buổi đã học, Đã học trong tháng, Số buổi vắng/bảo lưu trong tháng) theo đúng vai trò
  const studentAttendanceStats = useMemo(() => {
    const stats = new Map<
      number,
      { totalAttended: number; monthAttended: number; monthAbsentOrLeave: number }
    >();
    const currentYear = currentPeriodDate.getFullYear();
    const currentMonth = currentPeriodDate.getMonth() + 1;
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    attendanceByEcAndSession.forEach((att) => {
      const ecId = att.enrollment_class_id;
      const effectiveStatus = isTeacher
        ? att.teacher_status
        : isCSOnly
        ? att.cs_status
        : getFinalizedStatus(att);
      if (!effectiveStatus) return;

      const sess = att.class_session || sessionsById.get(att.class_session_id);
      const dStr = formatSessionDate(sess?.session_date);

      const cur = stats.get(ecId) || {
        totalAttended: 0,
        monthAttended: 0,
        monthAbsentOrLeave: 0,
      };
      if (effectiveStatus === 'ATTENDED') {
        cur.totalAttended += 1;
        if (dStr && dStr.startsWith(monthPrefix)) {
          cur.monthAttended += 1;
        }
      } else if (
        dStr &&
        dStr.startsWith(monthPrefix) &&
        (effectiveStatus === 'ABSENT_APPROVED_A' ||
          effectiveStatus === 'LEAVE_B' ||
          effectiveStatus === 'ABSENT_UNAPPROVED_C')
      ) {
        cur.monthAbsentOrLeave += 1;
      }
      stats.set(ecId, cur);
    });

    return stats;
  }, [attendanceByEcAndSession, sessionsById, currentPeriodDate, isTeacher, isCSOnly]);

  // Danh sách học viên đầy đủ cho chế độ "Theo Học viên" & Tab 3 "Thống kê chuyên cần"
  const allStudentRows: StudentRow[] = useMemo(() => {
    const rows: StudentRow[] = [];
    const seenEcIds = new Set<number>();

    if (!isTeacher && enrollments.length > 0) {
      enrollments.forEach((enr) => {
        const student = enr.student;
        if (!student) return;
        const pkg = enr.package;

        if (enr.enrollment_classes && enr.enrollment_classes.length > 0) {
          enr.enrollment_classes.forEach((ec) => {
            seenEcIds.add(ec.id);
            const fullClass = classes.find((c) => c.id === ec.class_id);
            const cls = fullClass || ec.class;
            const mainTeacher =
              fullClass?.class_teachers?.find((t) => t.role === 'MAIN' && t.active !== false)?.teacher ||
              fullClass?.class_teachers?.find((t) => t.active !== false)?.teacher ||
              (cls as any)?.class_teachers?.[0]?.teacher;
            const schedule = fullClass?.class_schedules?.[0] || (cls as any)?.class_schedules?.[0];
            const pkgLabel = pkg?.name || pkg?.code || '—';
            const levelLabel = enr.level || (cls as any)?.level || '—';
            const classStudentCount = fullClass?.enrollment_classes?.length;
            const resolvedModel = normalizeClassModel(
              enr.class_model || (cls as any)?.model_type,
              classStudentCount
            );
            const resolvedStatus = resolveEffectiveEnrollmentStatus(
              enr.status,
              true,
              `${enr.class_model || ''} ${levelLabel}`
            );
            const cleanedClassName =
              cleanClassIdentifier(cls?.class_name) ||
              cleanClassIdentifier(cls?.class_code) ||
              cls?.class_name ||
              '—';

            rows.push({
              enrollment_class_id: ec.id,
              class_id: ec.class_id,
              class_code: cls?.class_code
                ? formatClassCode(cls.class_code, cls.id)
                : cls?.id
                ? formatClassCode(null, cls.id)
                : '—',
              student_id: student.id,
              external_id: student.external_id || enr.external_id || `HV_${student.id}`,
              full_name: student.full_name,
              package_name: pkgLabel,
              course_content: formatCourseContentDisplay(
                enr.course_content,
                enr.program_type,
                pkgLabel,
                levelLabel
              ),
              total_sessions: enr.total_sessions || 0,
              level: levelLabel,
              email: student.email || '',
              phone: student.phone || '',
              model_type: resolvedModel,
              remaining_sessions: enr.external_remaining_sessions,
              attended_previous_years: enr.attended_previous_years ?? 0,
              start_date: enr.start_date,
              status: resolvedStatus,
              end_date: enr.end_date,
              start_time: formatScheduleTimeDisplay(schedule?.start_time),
              schedule_pattern: schedule?.schedule_pattern || '',
              duration_minutes: schedule?.duration_minutes || 0,
              teacher_name: mainTeacher?.name || '—',
              teacher_code:
                (mainTeacher as any)?.code ||
                (mainTeacher as any)?.teacher_profile?.teacher_code ||
                (mainTeacher as any)?.teacher_code ||
                '—',
              class_name: cleanedClassName,
              sale_name: enr.sale_name || (enr as any).sale?.name || '—',
              program_type: enr.program_type || 'KAIWA',
              cs_staff_code: enr.cs?.staff_code || null,
            });
          });
        } else {
          const pkgLabel = pkg?.name || pkg?.code || '—';
          const levelLabel = enr.level || '—';
          const resolvedStatus = resolveEffectiveEnrollmentStatus(
            enr.status,
            false,
            `${enr.class_model || ''} ${levelLabel}`
          );
          rows.push({
            enrollment_class_id: -enr.id,
            class_id: 0,
            class_code: '—',
            student_id: student.id,
            external_id: student.external_id || enr.external_id || `HV_${student.id}`,
            full_name: student.full_name,
            package_name: pkgLabel,
            course_content: formatCourseContentDisplay(
              enr.course_content,
              enr.program_type,
              pkgLabel,
              levelLabel
            ),
            total_sessions: enr.total_sessions || 0,
            level: levelLabel,
            email: student.email || '',
            phone: student.phone || '',
            model_type: normalizeClassModel(enr.class_model),
            remaining_sessions: enr.external_remaining_sessions,
            attended_previous_years: enr.attended_previous_years ?? 0,
            start_date: enr.start_date,
            status: resolvedStatus,
            end_date: enr.end_date,
            start_time: '',
            schedule_pattern: '',
            duration_minutes: 0,
            teacher_name: 'Chưa xếp GV',
            teacher_code: '—',
            class_name: 'Chưa xếp lớp',
            sale_name: enr.sale_name || (enr as any).sale?.name || '—',
            program_type: enr.program_type || 'KAIWA',
            cs_staff_code: enr.cs?.staff_code || null,
          });
        }
      });
    }

    // Bổ sung các học viên từ classes (đối với Giáo viên hoặc lớp chưa có trong enrollments)
    classes.forEach((cls) => {
      const mainTeacher =
        cls.class_teachers?.find((t) => t.role === 'MAIN' && t.active !== false)?.teacher ||
        cls.class_teachers?.find((t) => t.active !== false)?.teacher ||
        cls.class_teachers?.[0]?.teacher;
      const schedule = cls.class_schedules?.[0];
      const studentsOfCls = getStudentsOfClass(cls);
      const cleanedClassName =
        cleanClassIdentifier(cls.class_name) ||
        cleanClassIdentifier(cls.class_code) ||
        cls.class_name;

      studentsOfCls.forEach((st) => {
        if (seenEcIds.has(st.enrollment_class_id)) return;
        seenEcIds.add(st.enrollment_class_id);
        rows.push({
          enrollment_class_id: st.enrollment_class_id,
          class_id: cls.id,
          class_code: formatClassCode(cls.class_code, cls.id),
          student_id: st.student_id,
          external_id: st.external_id,
          full_name: st.full_name,
          package_name: st.package_name || '—',
          course_content: st.course_content || '—',
          total_sessions: st.total_sessions || 0,
          level: st.level || cls.level || '—',
          email: st.email || '',
          phone: st.phone || '',
          model_type: normalizeClassModel(cls.model_type, studentsOfCls.length),
          remaining_sessions: st.remaining_sessions ?? null,
          attended_previous_years: st.attended_previous_years ?? 0,
          start_date: st.start_date || null,
          status: st.status || (cls.active ? 'STUDYING' : 'FINISHED'),
          end_date: st.end_date || null,
          start_time: formatScheduleTimeDisplay(schedule?.start_time),
          schedule_pattern: schedule?.schedule_pattern || '',
          duration_minutes: schedule?.duration_minutes || 0,
          teacher_name: mainTeacher?.name || '—',
          teacher_code: (mainTeacher as any)?.code || '—',
          class_name: cleanedClassName,
          sale_name: st.sale_name || '—',
          program_type: st.program_type || (cls.level?.toUpperCase().includes('N') ? 'JLPT' : 'KAIWA'),
          cs_staff_code: st.cs_staff_code || null,
        });
      });
    });

    return rows;
  }, [isTeacher, enrollments, classes]);

  const programCounts = useMemo(() => {
    let kaiwa = 0;
    let jlpt = 0;
    allStudentRows.forEach((s) => {
      const pType = (s.program_type || '').toUpperCase();
      if (pType === 'JLPT') jlpt++;
      else kaiwa++;
    });
    return { all: allStudentRows.length, kaiwa, jlpt };
  }, [allStudentRows]);

  // Danh sách Giáo viên trích xuất từ lớp học & học viên để lọc
  const teacherOptions = useMemo(() => {
    const names = new Set<string>();
    classes.forEach((c) => {
      const mainTeacher =
        c.class_teachers?.find((t) => t.role === 'MAIN' && t.active !== false)?.teacher ||
        c.class_teachers?.find((t) => t.active !== false)?.teacher ||
        c.class_teachers?.[0]?.teacher;
      if (mainTeacher?.name && mainTeacher.name !== '—') names.add(mainTeacher.name.trim());
    });
    allStudentRows.forEach((st) => {
      if (st.teacher_name && st.teacher_name !== '—' && st.teacher_name !== 'Chưa xếp GV') {
        names.add(st.teacher_name.trim());
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'vi-VN'));
  }, [classes, allStudentRows]);

  // Danh sách Trình độ / Gói học trích xuất từ dữ liệu để lọc
  const levelPackageOptions = useMemo(() => {
    const values = new Set<string>();
    classes.forEach((c) => {
      if (c.level && c.level.trim() && c.level.trim() !== '—') {
        values.add(c.level.trim());
      }
    });
    allStudentRows.forEach((st) => {
      if (st.level && st.level.trim() && st.level.trim() !== '—') {
        values.add(st.level.trim());
      }
      if (st.package_name && st.package_name.trim() && st.package_name.trim() !== '—') {
        values.add(st.package_name.trim());
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'vi-VN'));
  }, [classes, allStudentRows]);

  const matrixStudents = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase('vi-VN');
    return allStudentRows.filter((st) => {
      if (programFilter !== 'ALL') {
        const pType = (st.program_type || 'KAIWA').toUpperCase();
        if (pType !== programFilter) return false;
      }
      if (q) {
        const matched = [
          st.external_id,
          st.full_name,
          st.phone,
          st.email,
          st.class_name,
          st.class_code,
          st.teacher_name,
          st.package_name,
        ].some((val) => val?.toLocaleLowerCase('vi-VN').includes(q));
        if (!matched) return false;
      }
      if (modelFilter && normalizeModel(st.model_type) !== modelFilter) {
        return false;
      }
      if (!isTeacher && teacherFilter) {
        if ((st.teacher_name || '').trim() !== teacherFilter) return false;
      }
      if (levelPackageFilter) {
        const matchLv = (st.level || '').trim() === levelPackageFilter;
        const matchPkg = (st.package_name || '').trim() === levelPackageFilter;
        if (!matchLv && !matchPkg) return false;
      }
      if (statusFilter) {
        if (statusFilter === 'WAITING_CLASS') {
          if (st.enrollment_class_id > 0 && st.status !== 'WAITING_CLASS') return false;
        } else if (st.status !== statusFilter) {
          return false;
        }
      }
      if (activeTab === 'stats' && statsAttendanceFilter) {
        const stStat = studentAttendanceStats.get(st.enrollment_class_id);
        const absentOrLeave = stStat?.monthAbsentOrLeave || 0;
        if (statsAttendanceFilter === 'ATTENTION' && absentOrLeave < 2) return false;
        if (statsAttendanceFilter === 'GOOD' && absentOrLeave >= 2) return false;
      }
      return true;
    });
  }, [
    allStudentRows,
    programFilter,
    searchTerm,
    modelFilter,
    isTeacher,
    teacherFilter,
    levelPackageFilter,
    statusFilter,
    activeTab,
    statsAttendanceFilter,
    studentAttendanceStats,
  ]);

  const allSessions = useMemo(() => Array.from(sessionsById.values()), [sessionsById]);
  const allAttendances = useMemo(
    () => Array.from(attendanceByEcAndSession.values()),
    [attendanceByEcAndSession]
  );

  // Filtered classes
  const filteredClasses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return classes.filter((c) => {
      const formattedCode = formatClassCode(c.class_code, c.id).toLowerCase();
      const students = getStudentsOfClass(c);
      const mainTeacher =
        c.class_teachers?.find((t) => t.role === 'MAIN' && t.active !== false)?.teacher ||
        c.class_teachers?.find((t) => t.active !== false)?.teacher ||
        c.class_teachers?.[0]?.teacher;

      if (programFilter !== 'ALL') {
        const isJlptClass =
          students.some((s) => (s.program_type || '').toUpperCase() === 'JLPT') ||
          /\b(jlpt|jnpt|n[1-5])\b/i.test(`${c.class_name} ${c.level || ''}`);
        const classProg = isJlptClass ? 'JLPT' : 'KAIWA';
        if (classProg !== programFilter) return false;
      }

      const matchSearch =
        !q ||
        c.class_name.toLowerCase().includes(q) ||
        formattedCode.includes(q) ||
        (c.class_code && c.class_code.toLowerCase().includes(q)) ||
        (mainTeacher?.name && mainTeacher.name.toLowerCase().includes(q)) ||
        students.some(
          (st) =>
            st.full_name.toLowerCase().includes(q) ||
            st.external_id.toLowerCase().includes(q) ||
            (st.phone && st.phone.toLowerCase().includes(q)) ||
            (st.email && st.email.toLowerCase().includes(q))
        );

      const modelNormalized = normalizeModel(c.model_type, students.length);
      const matchModel = !modelFilter || modelNormalized === modelFilter || c.model_type === modelFilter;

      if (!matchSearch || !matchModel) return false;

      if (!isTeacher && teacherFilter) {
        if ((mainTeacher?.name || '').trim() !== teacherFilter) return false;
      }

      if (levelPackageFilter) {
        const matchClassLv = (c.level || '').trim() === levelPackageFilter;
        const matchStLvOrPkg = students.some(
          (st) =>
            (st.level || '').trim() === levelPackageFilter ||
            (st.package_name || '').trim() === levelPackageFilter
        );
        if (!matchClassLv && !matchStLvOrPkg) return false;
      }

      if (statusFilter) {
        const classDisplayStatus = resolveClassDisplayStatus(c, students).statusKey;
        if (classDisplayStatus === statusFilter) return true;
        if (students.length > 0 && students.some((st) => st.status === statusFilter)) {
          return true;
        }
        return false;
      }

      return true;
    });
  }, [
    classes,
    searchTerm,
    modelFilter,
    programFilter,
    isTeacher,
    teacherFilter,
    levelPackageFilter,
    statusFilter,
  ]);

  const activeFiltersCount =
    (programFilter !== 'ALL' ? 1 : 0) +
    (searchTerm ? 1 : 0) +
    (modelFilter ? 1 : 0) +
    (!isTeacher && teacherFilter ? 1 : 0) +
    (levelPackageFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (activeTab === 'quick' && onlyScheduledOnDate ? 1 : 0) +
    (activeTab === 'detailed' && onlyDaysWithSessions ? 1 : 0) +
    (activeTab === 'stats' && statsAttendanceFilter ? 1 : 0);

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

  // Phân trang mặc định 25 dòng/trang (tùy chọn 25, 50, 100, 200)
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  useEffect(() => {
    setPage(1);
  }, [
    activeTab,
    detailedViewMode,
    onlyScheduledOnDate,
    onlyDaysWithSessions,
    selectedDate,
    searchTerm,
    modelFilter,
    teacherFilter,
    levelPackageFilter,
    statusFilter,
    statsAttendanceFilter,
  ]);

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
    const hasSideStatus = isTeacher
      ? Boolean(att?.teacher_status)
      : isCSOnly
      ? Boolean(att?.cs_status)
      : Boolean(getFinalizedStatus(att));
    const shouldEdit = defaultEditing !== undefined ? defaultEditing : !hasSideStatus;
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

  // Thêm ca mới cho cả lớp (nút "+" nhỏ ở cuối danh sách ca — dòng lớp hoặc dòng học viên):
  // Tạo đúng 1 buổi ClassSession mới cho ngày đó, tự động thêm hàng Ca n+1 cho Điểm danh + Bài học + Ghi chú,
  // và nếu bấm "+" từ dòng 1 học viên cụ thể thì mở luôn bộ chọn trạng thái của học viên đó ở Ca n+1.
  const handleAddCaForClass = async (
    cls: Class,
    dateStr: string,
    openPickerForStudent?: EnrolledStudentItem
  ) => {
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

  // Gỡ bỏ 1 ca học theo cơ chế cô lập 3 vai trò (GV · CSKH · Admin):
  // - Nếu cả 3 vai trò đều chưa chấm gì ở ca này → gỡ bỏ ngay khung Ca rỗng.
  // - Nếu vai trò hiện tại chưa chấm gì nhưng vai trò khác đã chấm → giữ nguyên khung Ca cho vai trò khác.
  // - Nếu vai trò hiện tại đã chấm → xác nhận để xóa dữ liệu phía vai trò hiện tại (nếu các bên khác cũng trống thì gỡ luôn khung Ca).
  const requestDeleteCa = (cls: Class, dateStr: string, caNumber: number) => {
    const session = getDaySessions(cls.id, dateStr)[caNumber - 1];
    if (!session) return;
    const students = getStudentsOfClass(cls);
    const records = students
      .map((s) => attendanceByEcAndSession.get(`${s.enrollment_class_id}_session_${session.id}`))
      .filter((a): a is Attendance => Boolean(a && a.id));
    const myRows = records.filter((a) => hasCurrentSideDataOnRecord(a));
    const otherSidesExist = records.some((a) => hasOtherSidesDataOnRecord(a));

    if (myRows.length === 0 && !otherSidesExist) {
      void performDeleteCa(cls, dateStr, caNumber, session, false);
      return;
    }
    if (myRows.length === 0 && otherSidesExist) {
      toast.info(
        `Ca ${caNumber} đang có dữ liệu của vai trò khác nên khung ca được giữ nguyên (phía bạn chưa chấm gì ở ca này).`
      );
      return;
    }
    setActiveQuickPickerKey(null);
    setDeleteCaTarget({
      cls,
      dateStr,
      caNumber,
      session,
      attendanceRowCount: myRows.length,
    });
  };

  const performDeleteCa = async (
    cls: Class,
    dateStr: string,
    caNumber: number,
    session: ClassSession,
    confirmed: boolean
  ) => {
    const key = `delca_${session.id}`;
    setSavingKey(key);
    setDeletingCa(true);
    try {
      const students = getStudentsOfClass(cls);
      const records = students
        .map((s) => attendanceByEcAndSession.get(`${s.enrollment_class_id}_session_${session.id}`))
        .filter((a): a is Attendance => Boolean(a && a.id));
      const myRows = records.filter((a) => hasCurrentSideDataOnRecord(a));
      const otherSidesExist = records.some((a) => hasOtherSidesDataOnRecord(a));

      // Dọn toàn bộ nháp của ngày này thuộc lớp
      setClassLessonDrafts((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (k.startsWith(`${cls.id}_${dateStr}_s`)) delete next[k];
        });
        return next;
      });
      setInlineDrafts((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (k.includes(`_${dateStr}_s`)) delete next[k];
        });
        return next;
      });
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
      Object.keys(lastClassLessonRef.current).forEach((k) => {
        if (k.startsWith(`classlesson_${cls.id}_${dateStr}_s`)) delete lastClassLessonRef.current[k];
      });

      if (otherSidesExist) {
        // Vai trò khác vẫn còn dữ liệu trên ca này -> CHỈ xóa phần của activeSide, giữ nguyên khung Ca
        await Promise.all(
          myRows.map((r) => attendanceApi.remove(cls.id, session.id, r.id, activeSide))
        );
        setActiveQuickPickerKey(null);
        setDeleteCaTarget(null);
        const roleLabel =
          activeSide === 'CS' ? 'CSKH' : activeSide === 'ADMIN' ? 'Admin (Chốt)' : 'Giáo viên';
        toast.success(
          `Đã xóa dữ liệu ${roleLabel} ở Ca ${caNumber} (giữ nguyên dữ liệu của các vai trò khác)`
        );
        await fetchClasses(true);
      } else {
        // Không còn vai trò nào khác có dữ liệu -> xóa luôn khung Ca rỗng
        await classSessionsApi.remove(cls.id, session.id, confirmed || myRows.length > 0);
        const remainingCa = Math.max(0, getDaySessions(cls.id, dateStr).length - 1);
        setSelectedCa(cls.id, dateStr, Math.max(1, Math.min(caNumber, remainingCa)));
        setActiveQuickPickerKey(null);
        setDeleteCaTarget(null);
        setDrawerState((prev) => {
          if (!prev || prev.classId !== cls.id || prev.dateStr !== dateStr) return prev;
          if (remainingCa === 0) return null;
          return { ...prev, caNumber: Math.min(prev.caNumber, remainingCa) };
        });
        toast.success(
          `Đã xóa Ca ${caNumber} (${formatSessionDate(dateStr)}) của lớp ${formatClassCode(cls.class_code, cls.id)}`
        );
        await fetchClasses(true);
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể xóa dữ liệu ca học'
      );
    } finally {
      setDeletingCa(false);
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

  // Danh sách lớp hiển thị trên bảng: tab Nhập có thể thu gọn còn lớp liên quan tới ngày chọn
  const tableClasses = useMemo(() => {
    if (activeTab === 'quick' && onlyScheduledOnDate) {
      return filteredClasses.filter((c) => isClassRelevantOnDate(c, selectedDate));
    }
    return filteredClasses;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, onlyScheduledOnDate, filteredClasses, selectedDate, sessionsByClassAndDate]);

  const tableStudentsCount = useMemo(
    () => tableClasses.reduce((acc, c) => acc + getStudentsOfClass(c).length, 0),
    [tableClasses]
  );

  // Đồng bộ ngày áp dụng hàng loạt ở chế độ Theo Lớp học
  useEffect(() => {
    if (activeTab === 'quick') {
      setBulkDateInClasses(selectedDate);
    } else if (periodDates.length > 0 && !bulkDateInClasses) {
      setBulkDateInClasses(toLocalDateString(periodDates[0]));
    }
  }, [activeTab, selectedDate, periodDates, bulkDateInClasses]);

  const bulkTargetDateInClasses =
    activeTab === 'quick' ? selectedDate : bulkDateInClasses || selectedDate;

  // Danh sách enrollment_class_id hợp lệ đang hiển thị trong các lớp của tableClasses
  const validVisibleEnrollmentIdsInClasses = useMemo(() => {
    const ids: number[] = [];
    tableClasses.forEach((c) => {
      getStudentsOfClass(c).forEach((st) => {
        if (st.enrollment_class_id > 0) ids.push(st.enrollment_class_id);
      });
    });
    return ids;
  }, [tableClasses]);

  const validVisibleEmptyClassIds = useMemo(
    () =>
      tableClasses
        .filter((c) => getStudentsOfClass(c).length === 0)
        .map((c) => c.id),
    [tableClasses]
  );

  // Tra cứu học viên -> class_id trong toàn bộ dữ liệu
  const ecIdToClassIdMap = useMemo(() => {
    const map = new Map<number, number>();
    classes.forEach((c) => {
      getStudentsOfClass(c).forEach((st) => {
        map.set(st.enrollment_class_id, c.id);
      });
    });
    allStudentRows.forEach((st) => {
      if (st.enrollment_class_id > 0 && st.class_id && st.class_id > 0) {
        map.set(st.enrollment_class_id, st.class_id);
      }
    });
    return map;
  }, [classes, allStudentRows]);

  const selectedVisibleEcCountInClasses = validVisibleEnrollmentIdsInClasses.filter((id) =>
    selectedEnrollmentIds.has(id)
  ).length;
  const selectedVisibleEmptyClassCount = validVisibleEmptyClassIds.filter((id) =>
    selectedClassIds.has(id)
  ).length;
  const totalSelectableInClasses =
    validVisibleEnrollmentIdsInClasses.length + validVisibleEmptyClassIds.length;
  const totalSelectedInClasses =
    selectedVisibleEcCountInClasses + selectedVisibleEmptyClassCount;
  const allVisibleInClassesSelected =
    totalSelectableInClasses > 0 && totalSelectedInClasses === totalSelectableInClasses;
  const someVisibleInClassesSelected =
    totalSelectedInClasses > 0 && !allVisibleInClassesSelected;

  const handleToggleSelectAllInClasses = () => {
    if (allVisibleInClassesSelected) {
      setSelectedEnrollmentIds((prev) => {
        const next = new Set(prev);
        validVisibleEnrollmentIdsInClasses.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedClassIds(new Set());
    } else {
      setSelectedEnrollmentIds((prev) => {
        const next = new Set(prev);
        validVisibleEnrollmentIdsInClasses.forEach((id) => next.add(id));
        return next;
      });
      setSelectedClassIds(new Set(validVisibleEmptyClassIds));
    }
  };

  const handleToggleSelectClassRow = (cls: Class, studentsOfClass: EnrolledStudentItem[]) => {
    const ecIds = studentsOfClass
      .map((s) => s.enrollment_class_id)
      .filter((id) => id > 0);
    if (ecIds.length === 0) {
      setSelectedClassIds((prev) => {
        const next = new Set(prev);
        if (next.has(cls.id)) next.delete(cls.id);
        else next.add(cls.id);
        return next;
      });
      return;
    }
    const allInClassSelected = ecIds.every((id) => selectedEnrollmentIds.has(id));
    setSelectedEnrollmentIds((prev) => {
      const next = new Set(prev);
      if (allInClassSelected) {
        ecIds.forEach((id) => next.delete(id));
      } else {
        ecIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleToggleSelectSingleEcId = (ecId: number) => {
    if (ecId <= 0) return;
    setSelectedEnrollmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(ecId)) next.delete(ecId);
      else next.add(ecId);
      return next;
    });
  };

  // Danh sách class_id duy nhất đang được chọn (từ selectedEnrollmentIds + selectedClassIds)
  const selectedUniqueClassIdsInClasses = useMemo(() => {
    const classSet = new Set<number>();
    selectedClassIds.forEach((cid) => {
      if (cid > 0) classSet.add(cid);
    });
    selectedEnrollmentIds.forEach((ecId) => {
      const cid = ecIdToClassIdMap.get(ecId);
      if (cid && cid > 0) classSet.add(cid);
    });
    return Array.from(classSet);
  }, [selectedClassIds, selectedEnrollmentIds, ecIdToClassIdMap]);

  // Số lượng ca của các dòng đã chọn có thể khớp theo GV (cho CSKH & Admin ở chế độ Theo Lớp học)
  const bulkMatchableCountInClasses = useMemo(() => {
    if (activeSide === 'TEACHER' || selectedEnrollmentIds.size === 0 || !bulkTargetDateInClasses) {
      return 0;
    }
    let count = 0;
    selectedEnrollmentIds.forEach((ecId) => {
      if (ecId <= 0) return;
      const classId = ecIdToClassIdMap.get(ecId);
      if (!classId) return;
      const daySessions = getDaySessions(classId, bulkTargetDateInClasses);
      const sess = daySessions[bulkSessionIndex];
      if (!sess) return;
      const att = attendanceByEcAndSession.get(`${ecId}_session_${sess.id}`);
      if (!att?.teacher_status) return;
      if (activeSide === 'CS') {
        if (!att.cs_status) count++;
      } else {
        count++;
      }
    });
    return count;
  }, [
    activeSide,
    selectedEnrollmentIds,
    bulkTargetDateInClasses,
    bulkSessionIndex,
    ecIdToClassIdMap,
    sessionsByClassAndDate,
    attendanceByEcAndSession,
  ]);

  // Chấm điểm danh hàng loạt trên các dòng đã chọn ở chế độ Theo Lớp học
  const handleBulkMarkSelectedInClasses = async (status: AttendanceStatus) => {
    if (selectedEnrollmentIds.size === 0 || !bulkTargetDateInClasses) {
      toast.warning('Vui lòng chọn ít nhất 1 học viên để điểm danh hàng loạt.');
      return;
    }
    const byClassId = new Map<number, number[]>();
    selectedEnrollmentIds.forEach((ecId) => {
      if (ecId <= 0) return;
      const classId = ecIdToClassIdMap.get(ecId);
      if (!classId) return;
      const list = byClassId.get(classId) || [];
      list.push(ecId);
      byClassId.set(classId, list);
    });

    try {
      setBulkSaving(true);
      for (const [classId, ecIds] of byClassId.entries()) {
        const daySessions = getDaySessions(classId, bulkTargetDateInClasses);
        let session = daySessions[bulkSessionIndex];
        if (!session) {
          session = await classSessionsApi.create(classId, {
            session_date: bulkTargetDateInClasses,
          });
        }
        await attendanceApi.bulkMark(classId, session.id, {
          items: ecIds.map((ecId) => ({
            enrollment_class_id: ecId,
            status,
          })),
          side: activeSide,
        });
      }
      toast.success(
        `Đã lưu ${STATUS_CONFIG[status].label} (Ca ${bulkSessionIndex + 1}) cho ${selectedEnrollmentIds.size} học viên ngày ${new Date(`${bulkTargetDateInClasses}T00:00:00`).toLocaleDateString('vi-VN')}`
      );
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        'Lỗi khi lưu điểm danh hàng loạt: ' +
          (err.response?.data?.error?.message || err.message)
      );
      await fetchClasses(true);
    } finally {
      setBulkSaving(false);
    }
  };

  // Xóa chấm điểm danh hàng loạt trên các dòng đã chọn ở chế độ Theo Lớp học
  const handleBulkClearSelectedInClasses = async () => {
    if (selectedEnrollmentIds.size === 0 || !bulkTargetDateInClasses) return;
    const toRemove: Array<{ classId: number; sessionId: number; attendanceId: number }> = [];
    selectedEnrollmentIds.forEach((ecId) => {
      if (ecId <= 0) return;
      const classId = ecIdToClassIdMap.get(ecId);
      if (!classId) return;
      const session = getDaySessions(classId, bulkTargetDateInClasses)[bulkSessionIndex];
      if (!session) return;
      const att = attendanceByEcAndSession.get(`${ecId}_session_${session.id}`);
      const hasMyStatus =
        activeSide === 'ADMIN'
          ? Boolean(getFinalizedStatus(att))
          : activeSide === 'CS'
          ? Boolean(att?.cs_status)
          : Boolean(att?.teacher_status);
      if (att && hasMyStatus) {
        toRemove.push({ classId, sessionId: session.id, attendanceId: att.id });
      }
    });

    if (toRemove.length === 0) {
      toast.info(
        `Ca ${bulkSessionIndex + 1} chưa có dữ liệu điểm danh của bạn trên các dòng đã chọn`
      );
      return;
    }

    try {
      setBulkSaving(true);
      await Promise.all(
        toRemove.map((item) =>
          attendanceApi.remove(item.classId, item.sessionId, item.attendanceId, activeSide)
        )
      );
      toast.info(`Đã xóa chấm Ca ${bulkSessionIndex + 1} cho ${toRemove.length} học viên`);
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        'Lỗi khi xóa điểm danh hàng loạt: ' +
          (err.response?.data?.error?.message || err.message)
      );
      await fetchClasses(true);
    } finally {
      setBulkSaving(false);
    }
  };

  // Khớp theo GV trên các dòng đã chọn ở chế độ Theo Lớp học
  const handleBulkMatchSelectedInClasses = async () => {
    if (bulkMatchableCountInClasses === 0 || !bulkTargetDateInClasses) {
      toast.info('Các dòng đã chọn chưa có điểm danh GV để khớp ở ca này');
      return;
    }
    const groups = new Map<
      string,
      {
        classId: number;
        sessionId: number;
        items: { enrollment_class_id: number; status: AttendanceStatus }[];
      }
    >();
    selectedEnrollmentIds.forEach((ecId) => {
      if (ecId <= 0) return;
      const classId = ecIdToClassIdMap.get(ecId);
      if (!classId) return;
      const sess = getDaySessions(classId, bulkTargetDateInClasses)[bulkSessionIndex];
      if (!sess) return;
      const att = attendanceByEcAndSession.get(`${ecId}_session_${sess.id}`);
      const tStatus = att?.teacher_status as AttendanceStatus | null | undefined;
      if (!tStatus) return;
      if (activeSide === 'CS' && att?.cs_status) return;
      const gKey = `${classId}_${sess.id}`;
      const group = groups.get(gKey) || { classId, sessionId: sess.id, items: [] };
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
        `Đã khớp theo GV (Ca ${bulkSessionIndex + 1}) cho ${bulkMatchableCountInClasses} học viên đã chọn`
      );
      await fetchClasses(true);
    } catch (err: any) {
      toast.error('Lỗi khi khớp theo GV: ' + (err.response?.data?.error?.message || err.message));
      await fetchClasses(true);
    } finally {
      setBulkSaving(false);
    }
  };

  // Áp dụng Bài học / Ghi chú GV hàng loạt trên các dòng đã chọn (Role TEACHER)
  const handleBulkApplyTeacherLessonAndNoteInClasses = async () => {
    const lessonVal = bulkLessonTopic.trim();
    const noteVal = bulkTeacherNote.trim();
    if (!lessonVal && !noteVal) {
      toast.warning('Vui lòng nhập Bài học chung hoặc Ghi chú GV chung trước khi áp dụng.');
      return;
    }
    if (selectedEnrollmentIds.size === 0 || !bulkTargetDateInClasses) return;

    const byClassId = new Map<number, number[]>();
    selectedEnrollmentIds.forEach((ecId) => {
      if (ecId <= 0) return;
      const classId = ecIdToClassIdMap.get(ecId);
      if (!classId) return;
      const list = byClassId.get(classId) || [];
      list.push(ecId);
      byClassId.set(classId, list);
    });

    try {
      setBulkSaving(true);
      for (const [classId, ecIds] of byClassId.entries()) {
        const daySessions = getDaySessions(classId, bulkTargetDateInClasses);
        let session = daySessions[bulkSessionIndex];
        if (!session) {
          session = await classSessionsApi.create(classId, {
            session_date: bulkTargetDateInClasses,
          });
        }
        await Promise.all(
          ecIds.map(async (ecId) => {
            const existing = attendanceByEcAndSession.get(`${ecId}_session_${session!.id}`);
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
        `Đã áp dụng bài học/ghi chú (Ca ${bulkSessionIndex + 1}) cho ${selectedEnrollmentIds.size} học viên`
      );
      setBulkLessonTopic('');
      setBulkTeacherNote('');
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        'Lỗi khi áp dụng bài học/ghi chú hàng loạt: ' +
          (err.response?.data?.error?.message || err.message)
      );
      await fetchClasses(true);
    } finally {
      setBulkSaving(false);
    }
  };

  // Áp dụng Ghi chú CSKH hàng loạt trên các dòng đã chọn (Role CS)
  const handleBulkApplyCsNoteInClasses = async () => {
    const noteVal = bulkCsNote.trim();
    if (!noteVal) {
      toast.warning('Vui lòng nhập Ghi chú CSKH chung trước khi áp dụng.');
      return;
    }
    if (selectedEnrollmentIds.size === 0 || !bulkTargetDateInClasses) return;

    const byClassId = new Map<number, number[]>();
    selectedEnrollmentIds.forEach((ecId) => {
      if (ecId <= 0) return;
      const classId = ecIdToClassIdMap.get(ecId);
      if (!classId) return;
      const list = byClassId.get(classId) || [];
      list.push(ecId);
      byClassId.set(classId, list);
    });

    try {
      setBulkSaving(true);
      for (const [classId, ecIds] of byClassId.entries()) {
        const daySessions = getDaySessions(classId, bulkTargetDateInClasses);
        let session = daySessions[bulkSessionIndex];
        if (!session) {
          session = await classSessionsApi.create(classId, {
            session_date: bulkTargetDateInClasses,
          });
        }
        await Promise.all(
          ecIds.map(async (ecId) => {
            const existing = attendanceByEcAndSession.get(`${ecId}_session_${session!.id}`);
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
        `Đã áp dụng ghi chú CSKH (Ca ${bulkSessionIndex + 1}) cho ${selectedEnrollmentIds.size} học viên`
      );
      setBulkCsNote('');
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        'Lỗi khi áp dụng ghi chú CSKH hàng loạt: ' +
          (err.response?.data?.error?.message || err.message)
      );
      await fetchClasses(true);
    } finally {
      setBulkSaving(false);
    }
  };

  // Core Attendance & Lesson/Note save action (Side: activeSide — TEACHER / CS / ADMIN)
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
    cs_note?: string | null;
    studentName?: string;
  }) => {
    const {
      classId,
      enrollmentClassId,
      dateStr,
      sessionNumber,
      status,
      lesson_topic,
      teacher_note,
      cs_note,
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
        side: activeSide,
        ...(lesson_topic !== undefined ? { lesson_topic } : {}),
        ...(teacher_note !== undefined ? { teacher_note } : {}),
        ...(cs_note !== undefined ? { cs_note } : {}),
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

  // Save only Lesson & Note (auto-save without closing popover or spamming toast)
  const handleSaveLessonAndNote = async (params: {
    classId: number;
    enrollmentClassId: number;
    dateStr: string;
    session?: ClassSession;
    sessionNumber?: number;
    lessonTopic: string | null;
    teacherNote: string | null;
    csNote?: string | null;
    studentName?: string;
    fromPopover?: boolean;
  }) => {
    const {
      classId,
      enrollmentClassId,
      dateStr,
      sessionNumber,
      lessonTopic,
      teacherNote,
      csNote,
      fromPopover,
    } = params;
    const normLesson = (lessonTopic || '').trim();
    const normNote = (teacherNote || '').trim();
    const normCsNote = (csNote || '').trim();

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

    if (activeSide === 'TEACHER') {
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
    }

    setSavingKey(key);
    try {
      let targetSession = resolvedSession;
      if (!targetSession) {
        targetSession = await classSessionsApi.create(classId, { session_date: dateStr });
        if (activeSide === 'TEACHER') {
          lastSavedNoteRef.current[`${enrollmentClassId}_session_${targetSession.id}`] = {
            lesson: normLesson,
            note: normNote,
          };
        }
      }

      const existingAtt = attendanceByEcAndSession.get(
        `${enrollmentClassId}_session_${targetSession.id}`
      );

      if (existingAtt) {
        await attendanceApi.update(classId, targetSession.id, existingAtt.id, {
          side: activeSide,
          ...(activeSide === 'TEACHER'
            ? { lesson_topic: normLesson || null, teacher_note: normNote || null }
            : {}),
          ...(csNote !== undefined ? { cs_note: normCsNote || null } : {}),
        });
      } else {
        await attendanceApi.mark(classId, targetSession.id, {
          enrollment_class_id: enrollmentClassId,
          status: 'ATTENDED',
          side: activeSide,
          ...(activeSide === 'TEACHER'
            ? { lesson_topic: normLesson || null, teacher_note: normNote || null }
            : {}),
          ...(csNote !== undefined ? { cs_note: normCsNote || null } : {}),
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

  // Bỏ chấm cả lớp 1:2 / 1:n theo ca đang chọn (gỡ điểm danh của vai trò hiện tại)
  const handleBulkUnmarkWholeClass = async (
    cls: Class,
    dateStr: string,
    caNumber = 1
  ) => {
    const students = getStudentsOfClass(cls);
    const existing = sessionsByClassAndDate.get(`${cls.id}_${dateStr}`) || [];
    const targetSession = existing[caNumber - 1];
    if (!targetSession || students.length === 0) return;

    const toRemove = students
      .map((s) =>
        attendanceByEcAndSession.get(`${s.enrollment_class_id}_session_${targetSession.id}`)
      )
      .filter((att): att is Attendance => Boolean(att && att.id && hasCurrentSideDataOnRecord(att)));

    if (toRemove.length === 0) return;

    const key = `class_${cls.id}_${dateStr}_s${caNumber}`;
    setSavingKey(key);
    try {
      await Promise.all(
        toRemove.map((att) =>
          attendanceApi.remove(cls.id, targetSession.id, att.id, activeSide)
        )
      );
      toast.info(
        `Đã bỏ chấm cả lớp (Ca ${caNumber}) cho lớp ${formatClassCode(cls.class_code, cls.id)}`
      );
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Không thể bỏ chấm cả lớp'
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
      await attendanceApi.remove(classId, session.id, existingAtt.id, activeSide);
      setDrawerState(null);
      toast.info('Đã xóa trạng thái điểm danh');
      await fetchClasses(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa điểm danh');
    } finally {
      setSavingKey(null);
    }
  };

  // CSKH: 1 chạm "Khớp theo GV" ở chế độ Theo Lớp học — sao chép điểm danh GV sang cs_status
  // cho mọi ca trong ngày đang chọn mà GV đã chấm nhưng CSKH chưa chấm.
  const pendingMatchTeacherCountInClasses = useMemo(() => {
    if (!isCSOnly) return 0;
    let count = 0;
    tableClasses.forEach((cls) => {
      const daySessions = getDaySessions(cls.id, selectedDate);
      const students = getStudentsOfClass(cls);
      daySessions.forEach((sess) => {
        students.forEach((st) => {
          const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${sess.id}`);
          if (att?.teacher_status && !att.cs_status) count++;
        });
      });
    });
    return count;
  }, [isCSOnly, tableClasses, selectedDate, sessionsByClassAndDate, attendanceByEcAndSession]);

  const handleMatchTeacherForDayInClasses = async () => {
    if (pendingMatchTeacherCountInClasses === 0) {
      toast.info('Mọi ca GV đã chấm trong ngày đều có CSKH xác nhận');
      return;
    }
    const groups = new Map<
      string,
      { classId: number; sessionId: number; items: { enrollment_class_id: number; status: AttendanceStatus }[] }
    >();
    tableClasses.forEach((cls) => {
      const daySessions = getDaySessions(cls.id, selectedDate);
      const students = getStudentsOfClass(cls);
      daySessions.forEach((sess) => {
        students.forEach((st) => {
          const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${sess.id}`);
          const tStatus = att?.teacher_status as AttendanceStatus | null | undefined;
          if (!tStatus || att?.cs_status) return;
          const gKey = `${cls.id}_${sess.id}`;
          const group = groups.get(gKey) || { classId: cls.id, sessionId: sess.id, items: [] };
          group.items.push({ enrollment_class_id: st.enrollment_class_id, status: tStatus });
          groups.set(gKey, group);
        });
      });
    });

    setSavingKey('match_teacher_day');
    try {
      await Promise.all(
        Array.from(groups.values()).map((g) =>
          attendanceApi.bulkMark(g.classId, g.sessionId, { items: g.items, side: 'CS' })
        )
      );
      toast.success(
        `Đã khớp ${pendingMatchTeacherCountInClasses} ca theo điểm danh GV ngày ${new Date(
          `${selectedDate}T00:00:00`
        ).toLocaleDateString('vi-VN')}`
      );
      await fetchClasses(true);
    } catch (err: any) {
      toast.error('Lỗi khi khớp theo GV: ' + (err.response?.data?.error?.message || err.message));
      await fetchClasses(true);
    } finally {
      setSavingKey(null);
    }
  };

  // Lưu hàng loạt từ AttendanceMatrix (chế độ Theo Học viên)
  const handleCustomSaveMatrix = async (
    pendingEdits: Record<string, AttendanceStatus>,
    _customValues?: Record<string, number>,
    sessionIndex = 0,
    side?: AttendanceSide
  ) => {
    const entries = Object.entries(pendingEdits);
    if (entries.length === 0) return;

    const byClassAndDate = new Map<
      string,
      { classId: number; dateStr: string; items: { ecId: number; status: AttendanceStatus }[] }
    >();

    entries.forEach(([key, status]) => {
      const [ecIdStr, dateStr] = key.split('_');
      const ecId = parseInt(ecIdStr, 10);
      const student = matrixStudents.find((s) => s.enrollment_class_id === ecId);
      if (!student || student.enrollment_class_id <= 0 || !student.class_id) return;
      const groupKey = `${student.class_id}_${dateStr}`;
      if (!byClassAndDate.has(groupKey)) {
        byClassAndDate.set(groupKey, { classId: student.class_id, dateStr, items: [] });
      }
      byClassAndDate.get(groupKey)!.items.push({ ecId, status });
    });

    for (const { classId, dateStr, items } of byClassAndDate.values()) {
      const existingSessions = (await classSessionsApi.list(classId))
        .filter((s) => formatSessionDate(s.session_date) === dateStr)
        .sort(compareSessionsInDay);
      let session = existingSessions[sessionIndex];
      if (!session) {
        session = await classSessionsApi.create(classId, { session_date: dateStr });
      }

      await attendanceApi.bulkMark(classId, session.id, {
        items: items.map((i) => ({
          enrollment_class_id: i.ecId,
          status: i.status,
        })),
        side,
      });
    }

    await fetchClasses(true);
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

  // Ô nhập Bài học chung cấp lớp cho 1 ca cụ thể (tự động xếp chồng Ca 1..Ca N khi phát sinh ca n+1,
  // nhãn Ca tĩnh — không nhảy màu theo thao tác chọn ca bên cột Điểm danh)
  const renderClassCaLessonInput = (
    cls: Class,
    dateStr: string,
    caNumber: number,
    totalCa: number,
    isOneToOne: boolean
  ) => {
    const val = getClassLessonValue(cls, dateStr, caNumber);
    return (
      <div key={caNumber} className="flex min-h-7 items-center gap-1.5">
        {totalCa > 1 && (
          <span
            className="inline-flex h-6 shrink-0 items-center rounded-md border border-border/70 bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600"
            title={`Ca ${caNumber}`}
          >
            Ca {caNumber}
          </span>
        )}
        <input
          type="text"
          value={val}
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

  // Cột "Điểm danh GV & Bài học" (Tab 1, chỉ đọc với CSKH/Admin ở chế độ Theo Lớp học)
  const renderQuickTeacherStackForClassStudent = (
    cls: Class,
    st: EnrolledStudentItem,
    dateStr: string
  ) => {
    const daySessions = getDaySessions(cls.id, dateStr);
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
          const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`);
          const tStatus = att?.teacher_status as AttendanceStatus | null | undefined;
          const cfg = tStatus ? STATUS_CONFIG[tStatus] : null;
          const lessonTopic = att?.lesson_topic || getClassLessonValue(cls, dateStr, caNo);
          const hasLessonOrNote = Boolean(lessonTopic || att?.teacher_note);
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
                  {lessonTopic && (
                    <div className="truncate text-text-primary" title={`Bài học: ${lessonTopic}`}>
                      <span className="font-semibold text-teal-700">Bài học:</span> {lessonTopic}
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

  // Ô chỉ đọc: Điểm danh & Ghi chú phía CSKH (dùng cho Admin ở Tab 1 chế độ Theo Lớp học)
  const renderCSReadonlyCellForClassStudent = (
    cls: Class,
    st: EnrolledStudentItem,
    dateStr: string
  ) => {
    const daySessions = getDaySessions(cls.id, dateStr);
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
          const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`);
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

  // Cột "Ghi chú CSKH" (Tab 1 chế độ Theo Lớp học): CS nhập trực tiếp theo từng Ca (autosave 600ms/blur/Enter)
  const renderQuickCsNoteStackForClassStudent = (
    cls: Class,
    st: EnrolledStudentItem,
    dateStr: string
  ) => {
    const daySessions = getDaySessions(cls.id, dateStr);
    const totalCa = Math.max(1, daySessions.length);

    const persistCsNote = (caNo: number, session: ClassSession | undefined, rawVal: string) => {
      if (!session) return;
      const draftKey = `${st.enrollment_class_id}_${dateStr}_s${caNo}`;
      const norm = rawVal.trim() || null;
      const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`);
      const current = (att?.cs_note ?? '') || null;
      if ((lastSavedCsNoteMapRef.current[draftKey] ?? current) === norm) return;
      lastSavedCsNoteMapRef.current[draftKey] = norm ?? '';
      void handleSaveLessonAndNote({
        classId: cls.id,
        enrollmentClassId: st.enrollment_class_id,
        dateStr,
        session,
        sessionNumber: caNo,
        lessonTopic: null,
        teacherNote: null,
        csNote: norm,
        studentName: st.full_name,
        fromPopover: true,
      });
    };

    return (
      <div className="flex flex-col gap-1.5 py-0.5">
        {Array.from({ length: totalCa }, (_, idx) => {
          const caNo = idx + 1;
          const session = daySessions[caNo - 1];
          const att = session
            ? attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`)
            : undefined;
          const draftKey = `${st.enrollment_class_id}_${dateStr}_s${caNo}`;
          const noteVal =
            csNoteDrafts[draftKey] !== undefined ? csNoteDrafts[draftKey] : att?.cs_note || '';

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
                  setCsNoteDrafts((prev) => ({ ...prev, [draftKey]: val }));
                  if (csNoteTimersRef.current[draftKey]) clearTimeout(csNoteTimersRef.current[draftKey]);
                  csNoteTimersRef.current[draftKey] = setTimeout(() => {
                    delete csNoteTimersRef.current[draftKey];
                    persistCsNote(caNo, session, val);
                  }, 600);
                }}
                onBlur={() => {
                  if (csNoteTimersRef.current[draftKey]) {
                    clearTimeout(csNoteTimersRef.current[draftKey]);
                    delete csNoteTimersRef.current[draftKey];
                  }
                  persistCsNote(caNo, session, noteVal);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    persistCsNote(caNo, session, noteVal);
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

  // Ô chỉ đọc: Điểm danh chốt / Trạng thái đối chiếu cuối (dùng cho CSKH ở Tab 1 chế độ Theo Lớp học)
  const renderFinalStatusCellForClassStudent = (
    cls: Class,
    st: EnrolledStudentItem,
    dateStr: string
  ) => {
    const daySessions = getDaySessions(cls.id, dateStr);
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
          const att = attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${session.id}`);
          const finalSt = getFinalizedStatus(att);
          const cfg = finalSt ? STATUS_CONFIG[finalSt] : null;

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

  // Ô điểm danh gọn theo chuẩn Progressive Disclosure ở Tab 1 (Nhập điểm danh — chế độ Theo Lớp học)
  // Hỗ trợ đồng bộ cả 3 vai trò: TEACHER (chấm teacher_status), CS (chấm cs_status), ADMIN (chấm chốt).
  const renderQuickStatusCell = (
    cls: Class,
    st: EnrolledStudentItem,
    dateStr: string,
    variant: 'mark' | 'admin-final' = 'mark'
  ) => {
    const daySessions = getDaySessions(cls.id, dateStr);
    const totalCa = isTeacher ? getVisibleCaCount(cls, dateStr) : Math.max(1, daySessions.length);

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
      <div className="flex flex-col items-start gap-1.5">
        {Array.from({ length: totalCa }, (_, idx) => {
          const caNo = idx + 1;
          const sess = daySessions[caNo - 1];
          const att = sess
            ? attendanceByEcAndSession.get(`${st.enrollment_class_id}_session_${sess.id}`)
            : undefined;
          const curStatus = (
            variant === 'admin-final'
              ? getFinalizedStatus(att)
              : isCSOnly
              ? att?.cs_status
              : att?.teacher_status
          ) as AttendanceStatus | undefined;
          const cfg = curStatus ? STATUS_CONFIG[curStatus] : null;
          const pickerKey = `${st.enrollment_class_id}_${dateStr}_s${caNo}`;
          const isOpen = activeQuickPickerKey === pickerKey;
          const isLastCa = caNo === totalCa;
          const isDeletingThisCa = Boolean(sess && savingKey === `delca_${sess.id}`);

          let reconcileBadge: React.ReactNode = null;
          if (variant === 'admin-final' && curStatus) {
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
                      disabled={isSavingRow || isDeletingThisCa}
                      onClick={() => {
                        setSelectedCa(cls.id, dateStr, caNo);
                        setActiveQuickPickerKey(pickerKey);
                      }}
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

                    {isLastCa && (
                      <button
                        type="button"
                        disabled={isAddingCa}
                        onClick={() => handleAddCaForClass(cls, dateStr, st)}
                        title={`Thêm Ca ${totalCa + 1} trong ngày này`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-primary/50 bg-white text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {sess && (
                      <button
                        type="button"
                        disabled={isDeletingThisCa}
                        onClick={() => requestDeleteCa(cls, dateStr, caNo)}
                        title={
                          countMarkedInCa(cls, dateStr, caNo) === 0
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
                    {QUICK_BUTTONS.map(({ status, code, shortLabel }) => {
                      const bCfg = STATUS_CONFIG[status];
                      const isSelected = curStatus === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={isSavingRow}
                          onClick={async () => {
                            setActiveQuickPickerKey(null);
                            setSelectedCa(cls.id, dateStr, caNo);
                            await handleQuickMark(cls, st, dateStr, caNo, status);
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
                      onClick={() => setActiveQuickPickerKey(null)}
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
                  <strong>
                    {att.teacher_status
                      ? `${STATUS_CONFIG[att.teacher_status as AttendanceStatus].short} · ${STATUS_CONFIG[att.teacher_status as AttendanceStatus].label}`
                      : 'chưa chấm'}
                  </strong>
                  {' · CSKH: '}
                  <strong>
                    {att.cs_status
                      ? `${STATUS_CONFIG[att.cs_status as AttendanceStatus].short} · ${STATUS_CONFIG[att.cs_status as AttendanceStatus].label}`
                      : 'chưa chấm'}
                  </strong>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Render Attendance Cell cho Bảng tháng (Tab 2) — bấm mở ngăn chi tiết bên phải cho cả 3 role
  const renderMatrixDateCell = (cls: Class, st: EnrolledStudentItem, dateStr: string) => {
    const daySessions = sessionsByClassAndDate.get(`${cls.id}_${dateStr}`) || [];

    if (daySessions.length === 0) {
      return (
        <div className="flex min-h-9 w-full min-w-[52px] items-center justify-center px-1 py-1">
          <button
            type="button"
            onClick={() => openDrawer(cls, st, dateStr, 1, true)}
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
          const displayStatus = (
            isTeacher
              ? att?.teacher_status
              : isCSOnly
              ? att?.cs_status
              : getFinalizedStatus(att)
          ) as AttendanceStatus | undefined;
          const cfg = displayStatus ? STATUS_CONFIG[displayStatus] : null;
          const hasNote = Boolean(att?.lesson_topic || att?.teacher_note || att?.cs_note);
          const tooltip = [
            `Ca ${sessionNumber}: ${cfg?.label || 'Chưa điểm danh'}`,
            att?.lesson_topic ? `Bài học: ${att.lesson_topic}` : '',
            att?.teacher_note ? `Ghi chú GV: ${att.teacher_note}` : '',
            att?.cs_note ? `Ghi chú CSKH: ${att.cs_note}` : '',
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
          onClick={() => openDrawer(cls, st, dateStr, nextSessionNumber, true)}
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

  useEffect(() => {
    if (!canManageClasses) return;
    teachersApi
      .list()
      .then((items) => setAssignmentTeachers(items.filter((t) => t.active)))
      .catch(() => toast.error('Không thể tải danh sách giáo viên'));
  }, [canManageClasses, toast]);

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

  return (
    <PageContainer>
      <PageHeader
        title="Lớp học & Điểm danh"
        actions={
          canManageClasses ? (
            <Button
              onClick={() => openModal()}
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Thêm lớp học mới
            </Button>
          ) : undefined
        }
      />

      {/* 3 Tab lớn ở đầu trang dùng chung cho cả 2 chế độ (Theo Học viên & Theo Lớp học) và cả 3 role */}
      <HorizontalTabs
        ariaLabel="Chế độ điểm danh & chuyên cần"
        value={activeTab}
        onChange={setActiveTab}
        className="mb-4"
        items={[
          { value: 'quick', label: 'Nhập điểm danh', icon: <Zap /> },
          { value: 'detailed', label: 'Lịch sử & Bảng tháng', icon: <ListChecks /> },
          { value: 'stats', label: 'Thống kê chuyên cần', icon: <BarChart3 /> },
        ]}
      />

      <FilterBar
        title="Bộ lọc & Chế độ hiển thị"
        activeCount={activeFiltersCount}
        onClear={() => {
          setProgramFilter('ALL');
          setSearchTerm('');
          setModelFilter('');
          setTeacherFilter('');
          setLevelPackageFilter('');
          setStatusFilter('');
          setOnlyScheduledOnDate(false);
          setOnlyDaysWithSessions(false);
          setStatsAttendanceFilter('');
        }}
        gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end"
      >
        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Chế độ hiển thị
          </label>
          <div
            className="grid grid-cols-2 h-9 p-1 bg-slate-100 rounded-xl border border-border gap-1"
            role="tablist"
            aria-label="Chế độ hiển thị Theo Học viên hoặc Theo Lớp học"
          >
            <button
              type="button"
              onClick={() => setDisplayMode('students')}
              className={`h-full rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                displayMode === 'students'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Theo Học viên</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('classes')}
              className={`h-full rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                displayMode === 'classes'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
              <span>Theo Lớp học</span>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Tìm kiếm
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tên/Mã HV, Mã/Tên lớp, Giáo viên, SĐT, Email..."
              className="w-full h-9 pl-9 pr-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Chương trình
          </label>
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value as 'ALL' | 'KAIWA' | 'JLPT')}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
          >
            <option value="ALL">Tất cả chương trình ({programCounts.all})</option>
            <option value="KAIWA">Giao tiếp - Kaiwa ({programCounts.kaiwa})</option>
            <option value="JLPT">Luyện thi - JLPT ({programCounts.jlpt})</option>
          </select>
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

        {!isTeacher && (
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              Giáo viên phụ trách
            </label>
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
            >
              <option value="">Tất cả giáo viên</option>
              {teacherOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Gói học / Trình độ
          </label>
          <select
            value={levelPackageFilter}
            onChange={(e) => setLevelPackageFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
          >
            <option value="">Tất cả trình độ / gói</option>
            {levelPackageOptions.map((val) => (
              <option key={val} value={val}>
                {val}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Trạng thái
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="STUDYING">Đang học</option>
            <option value="PAUSED">Bảo lưu</option>
            <option value="WAITING_CLASS">Chờ lớp</option>
            <option value="FINISHED">Kết thúc</option>
          </select>
        </div>

        {activeTab === 'quick' && (
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              Lịch học trong ngày
            </label>
            <select
              value={onlyScheduledOnDate ? 'SCHEDULED' : 'ALL'}
              onChange={(e) => setOnlyScheduledOnDate(e.target.value === 'SCHEDULED')}
              className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
            >
              <option value="ALL">Tất cả lịch học</option>
              <option value="SCHEDULED">Chỉ có lịch / ca ngày đang chọn</option>
            </select>
          </div>
        )}

        {activeTab === 'detailed' && (
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              Phạm vi ngày trong kỳ
            </label>
            <select
              value={onlyDaysWithSessions ? 'WITH_SESSIONS' : 'ALL'}
              onChange={(e) => setOnlyDaysWithSessions(e.target.value === 'WITH_SESSIONS')}
              className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
            >
              <option value="ALL">Tất cả ngày trong kỳ</option>
              <option value="WITH_SESSIONS">Chỉ ngày có buổi học</option>
            </select>
          </div>
        )}

        {activeTab === 'stats' && (
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              Mức chuyên cần
            </label>
            <select
              value={statsAttendanceFilter}
              onChange={(e) => setStatsAttendanceFilter(e.target.value as '' | 'ATTENTION' | 'GOOD')}
              className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
            >
              <option value="">Tất cả mức chuyên cần</option>
              <option value="ATTENTION">Cần chú ý (Vắng/Bảo lưu ≥ 2 buổi)</option>
              <option value="GOOD">Đạt yêu cầu</option>
            </select>
          </div>
        )}
      </FilterBar>

      {/* NỘI DUNG CHÍNH: THEO HỌC VIÊN (hoặc Tab 3 Thống kê) ⇄ THEO LỚP HỌC */}
      {displayMode === 'students' || activeTab === 'stats' ? (
        loading && allStudentRows.length === 0 ? (
          <div className="flex items-center justify-center p-12 bg-surface rounded-2xl border border-border/80 text-text-muted">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3" />
            <span>Đang tải dữ liệu điểm danh học viên...</span>
          </div>
        ) : (
          <AttendanceMatrix
            activeTab={activeTab}
            titleHeader={
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 shadow-2xs">
                  <span>Hiển thị:</span>
                  <span className="font-extrabold text-primary">{matrixStudents.length}</span>
                  <span className="text-text-muted">/ {allStudentRows.length} học viên</span>
                </span>
                <ColumnVisibilityDropdown scope={prefScope} />
              </div>
            }
            students={matrixStudents}
            sessions={allSessions}
            attendances={allAttendances}
            visibleColumns={visibleColumns}
            onRefresh={() => void fetchClasses(true)}
            onSaveCustom={handleCustomSaveMatrix}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            onlyScheduledOnDate={onlyScheduledOnDate}
            onOnlyScheduledOnDateChange={setOnlyScheduledOnDate}
            currentPeriodDate={currentPeriodDate}
            onCurrentPeriodDateChange={setCurrentPeriodDate}
            detailedFilterMode={detailedFilterMode}
            onDetailedFilterModeChange={setDetailedFilterMode}
            detailedViewMode={detailedViewMode}
            onDetailedViewModeChange={setDetailedViewMode}
            onlyDaysWithSessions={onlyDaysWithSessions}
            onOnlyDaysWithSessionsChange={setOnlyDaysWithSessions}
            selectedEnrollmentIds={selectedEnrollmentIds}
            onSelectedEnrollmentIdsChange={setSelectedEnrollmentIds}
            onAssignTeacherForClass={
              canManageClasses
                ? (classId) => {
                    const target = classes.find((c) => c.id === classId);
                    if (target) openAssignmentModal(target);
                  }
                : undefined
            }
            onEditClassById={
              canManageClasses
                ? (classId) => {
                    const target = classes.find((c) => c.id === classId);
                    if (target) openModal(target);
                  }
                : undefined
            }
          />
        )
      ) : (
      <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
        {/* Thanh điều khiển trên đầu bảng tùy theo Tab đang chọn */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/80 bg-slate-50/60 p-3 sm:px-4 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 shadow-2xs">
              <span>Hiển thị:</span>
              <span className="font-extrabold text-primary">{tableClasses.length}</span>
              <span className="text-text-muted">/ {classes.length} lớp học</span>
              <span className="text-border">•</span>
              <span className="font-bold text-text-primary">{tableStudentsCount}</span>
              <span className="text-text-muted">học viên</span>
            </span>

            <ColumnVisibilityDropdown scope={prefScope} />

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

                {isCSOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMatchTeacherForDayInClasses}
                    disabled={savingKey === 'match_teacher_day' || pendingMatchTeacherCountInClasses === 0}
                    className="h-10 whitespace-nowrap px-3 text-xs font-bold border-blue-300 text-blue-700 hover:bg-blue-50"
                    leftIcon={<Check className="h-3.5 w-3.5" />}
                    title="Sao chép điểm danh GV sang cột CSKH cho mọi ca GV đã chấm mà CSKH chưa chấm"
                  >
                    Khớp theo GV ({pendingMatchTeacherCountInClasses})
                  </Button>
                )}
              </>
            ) : (
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

                {/* Bộ chọn chế độ kỳ: Theo tuần | Theo tháng */}
                <div
                  className="inline-flex h-9 items-center p-1 bg-slate-100 rounded-xl border border-slate-200/90 gap-1 text-xs font-semibold"
                  role="tablist"
                  aria-label="Chọn phạm vi kỳ hiển thị"
                >
                  <button
                    type="button"
                    onClick={() => setDetailedFilterMode('week')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      detailedFilterMode === 'week'
                        ? 'bg-primary text-white shadow-xs font-bold'
                        : 'bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    Theo tuần
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailedFilterMode('month')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      detailedFilterMode === 'month'
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
                    onClick={() => handleStepPeriod(-1)}
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                    title="Kỳ trước"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <label className="relative inline-flex cursor-pointer items-center px-2.5 text-xs font-bold text-text-primary select-none hover:text-primary transition-colors" title="Bấm để chọn kỳ">
                    <span>{detailedPeriodTitle}</span>
                    <input
                      type={detailedFilterMode === 'week' ? 'date' : 'month'}
                      value={
                        detailedFilterMode === 'week'
                          ? toLocalDateString(currentPeriodDate)
                          : `${currentPeriodDate.getFullYear()}-${String(currentPeriodDate.getMonth() + 1).padStart(2, '0')}`
                      }
                      onChange={(e) => {
                        if (!e.target.value) return;
                        if (detailedFilterMode === 'week') {
                          const [y, m, d] = e.target.value.split('-').map(Number);
                          if (y && m && d) setCurrentPeriodDate(new Date(y, m - 1, d));
                        } else {
                          const [y, m] = e.target.value.split('-').map(Number);
                          if (y && m) setCurrentPeriodDate(new Date(y, m - 1, 1));
                        }
                      }}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="Chọn kỳ xem lịch sử"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleStepPeriod(1)}
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                    title="Kỳ sau"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Thanh Nghiệp Vụ Hàng Loạt (Bulk Action Bar) dùng chung cho cả 3 Role ở chế độ Theo Lớp học */}
        {(selectedEnrollmentIds.size > 0 || selectedClassIds.size > 0) &&
          (activeTab === 'quick' || activeTab === 'detailed') && (
            <div className="flex flex-col gap-2.5 border-b border-primary/20 bg-primary-soft/70 px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Cụm 1: Thông tin chọn & Ca/Ngày áp dụng */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 font-extrabold text-white">
                    {selectedEnrollmentIds.size > 0
                      ? selectedEnrollmentIds.size
                      : selectedClassIds.size}
                  </span>
                  <span className="font-bold text-text-primary">
                    {selectedEnrollmentIds.size > 0
                      ? `học viên${selectedUniqueClassIdsInClasses.length > 0 ? ` · ${selectedUniqueClassIdsInClasses.length} lớp` : ''} đã chọn`
                      : 'lớp đã chọn'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEnrollmentIds(new Set());
                      setSelectedClassIds(new Set());
                    }}
                    className="rounded-md border border-border/80 bg-surface px-2 py-1 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"
                    title="Bỏ chọn tất cả"
                  >
                    Bỏ chọn
                  </button>

                  {activeTab === 'detailed' && (
                    <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-2 font-bold text-text-secondary">
                      <span>Ngày:</span>
                      <input
                        type="date"
                        value={bulkTargetDateInClasses}
                        onChange={(e) => e.target.value && setBulkDateInClasses(e.target.value)}
                        className="bg-transparent text-xs font-bold text-primary outline-none"
                        aria-label="Chọn ngày áp dụng điểm danh hàng loạt"
                      />
                    </label>
                  )}

                  <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-2 font-bold text-text-secondary">
                    <span>Ca</span>
                    <select
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
                              ...selectedUniqueClassIdsInClasses.map(
                                (cid) => getDaySessions(cid, bulkTargetDateInClasses).length
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
                    onClick={() => void handleBulkMarkSelectedInClasses('ATTENDED')}
                    disabled={bulkSaving || selectedEnrollmentIds.size === 0}
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
                      onClick={() => void handleBulkMarkSelectedInClasses(status)}
                      disabled={bulkSaving || selectedEnrollmentIds.size === 0}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-bold transition hover:-translate-y-px hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].text} ${STATUS_CONFIG[status].border}`}
                      title={STATUS_CONFIG[status].label}
                    >
                      <span className="text-[10px] font-extrabold">{STATUS_CONFIG[status].short}</span>
                      <span>{STATUS_CONFIG[status].label.replace(/\s*\([A-E]\)$/, '')}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void handleBulkClearSelectedInClasses()}
                    disabled={bulkSaving || selectedEnrollmentIds.size === 0}
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
                      onClick={() => void handleBulkMatchSelectedInClasses()}
                      disabled={bulkSaving || bulkMatchableCountInClasses === 0}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-2.5 font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Sao chép / chốt điểm danh theo trạng thái GV đã chấm cho các dòng đang chọn"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Khớp theo GV ({bulkMatchableCountInClasses})</span>
                    </button>
                  )}

                  {/* Cụm 5: Quản lý lớp nhanh khi chọn đúng 1 lớp (Admin/Manage) */}
                  {canManageClasses && selectedUniqueClassIdsInClasses.length === 1 && (
                    <div className="flex items-center gap-1.5 pl-1 border-l border-primary/20">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const target = classes.find(
                            (c) => c.id === selectedUniqueClassIdsInClasses[0]
                          );
                          if (target) openAssignmentModal(target);
                        }}
                        leftIcon={<UserRoundCheck className="w-3.5 h-3.5" />}
                        className="h-8 px-2.5 text-xs font-bold text-teal-700 border-teal-300 bg-white hover:bg-teal-50"
                      >
                        Phân công GV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const target = classes.find(
                            (c) => c.id === selectedUniqueClassIdsInClasses[0]
                          );
                          if (target) openModal(target);
                        }}
                        leftIcon={<Edit className="w-3.5 h-3.5" />}
                        className="h-8 px-2.5 text-xs font-bold bg-white"
                      >
                        Sửa lớp
                      </Button>
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
                    onClick={() => void handleBulkApplyTeacherLessonAndNoteInClasses()}
                    disabled={
                      bulkSaving ||
                      selectedEnrollmentIds.size === 0 ||
                      (!bulkLessonTopic.trim() && !bulkTeacherNote.trim())
                    }
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
                    onClick={() => void handleBulkApplyCsNoteInClasses()}
                    disabled={
                      bulkSaving || selectedEnrollmentIds.size === 0 || !bulkCsNote.trim()
                    }
                    className="h-8 px-3 text-xs font-bold"
                  >
                    Áp dụng ghi chú CSKH
                  </Button>
                </div>
              )}
            </div>
          )}

        {/* Bảng Lớp học & Điểm danh (hoặc Nhật ký bài học khi chọn ở Tab 2) */}
        {activeTab === 'detailed' && detailedViewMode === 'log' ? (
          <div className="w-full overflow-x-auto select-none">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap w-28">Ngày học</th>
                  <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap w-16">Ca</th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[160px]">Học viên</th>
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[140px]">Lớp học</th>
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
                    <td colSpan={11} className="py-10 text-center text-text-muted">
                      Chưa có buổi học nào phát sinh trong kỳ {detailedPeriodTitle}.
                    </td>
                  </tr>
                ) : (
                  periodSessionLogs
                    .slice((page - 1) * pageSize, page * pageSize)
                    .map(({ key, cls, student, dateStr, caNumber, att }, idx) => {
                      const tCfg = att?.teacher_status
                        ? STATUS_CONFIG[att.teacher_status as AttendanceStatus]
                        : null;
                      const csCfg = att?.cs_status
                        ? STATUS_CONFIG[att.cs_status as AttendanceStatus]
                        : null;
                      const finalSt = (att?.status || att?.cs_status || att?.teacher_status) as
                        | AttendanceStatus
                        | undefined;
                      const finalCfg = finalSt ? STATUS_CONFIG[finalSt] : null;
                      const isConflict =
                        att?.reconciliation_state === 'CONFLICT' ||
                        Boolean(
                          att?.teacher_status &&
                            att?.cs_status &&
                            att.teacher_status !== att.cs_status
                        );
                      const isMatched =
                        att?.reconciliation_state === 'MATCHED' ||
                        Boolean(
                          att?.teacher_status &&
                            att?.cs_status &&
                            att.teacher_status === att.cs_status
                        );
                      const dObj = new Date(`${dateStr}T00:00:00`);
                      const mainTeacher =
                        cls.class_teachers?.find((t) => t.role === 'MAIN' && t.active !== false)
                          ?.teacher ||
                        cls.class_teachers?.find((t) => t.active !== false)?.teacher ||
                        cls.class_teachers?.[0]?.teacher;
                      const cleanedClsName =
                        cleanClassIdentifier(cls.class_name) ||
                        cleanClassIdentifier(cls.class_code) ||
                        cls.class_name;

                      return (
                        <tr
                          key={key}
                          className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                            idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                          }`}
                        >
                          <td className="px-3 py-2.5 border-r border-border/60 font-bold text-text-primary whitespace-nowrap">
                            <span>{DAY_OF_WEEK_NAMES[dObj.getDay()]}</span>{' '}
                            <span>{dObj.toLocaleDateString('vi-VN')}</span>
                          </td>
                          <td className="px-2.5 py-2.5 border-r border-border/60 text-center font-bold text-slate-700 whitespace-nowrap">
                            Ca {caNumber}
                          </td>
                          <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap">
                            <div className="font-bold text-text-primary">{student.full_name}</div>
                            <div className="font-mono text-[10px] text-text-muted">
                              {student.external_id}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap">
                            <div className="font-bold text-text-primary">{cleanedClsName}</div>
                            <div className="font-mono text-[10px] text-text-muted">
                              {formatClassCode(cls.class_code, cls.id)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 border-r border-border/60 whitespace-nowrap text-text-secondary">
                            {mainTeacher?.name || '—'}
                          </td>
                          <td className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                            {tCfg ? (
                              <span
                                className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-extrabold ${tCfg.bg.replace(
                                  /\s*hover:\S+/g,
                                  ''
                                )} ${tCfg.text} ${tCfg.border}`}
                              >
                                {tCfg.short} · {tCfg.label}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                            {csCfg ? (
                              <span
                                className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-extrabold ${csCfg.bg.replace(
                                  /\s*hover:\S+/g,
                                  ''
                                )} ${csCfg.text} ${csCfg.border}`}
                              >
                                {csCfg.short} · {csCfg.label}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                            {isConflict ? (
                              <span className="inline-flex h-6 items-center rounded-md border border-rose-300 bg-rose-100 px-2 text-[10px] font-extrabold text-rose-800">
                                Lệch (GV: {tCfg?.short || '?'} | CSKH: {csCfg?.short || '?'})
                              </span>
                            ) : isMatched && finalCfg ? (
                              <span
                                className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-extrabold ${finalCfg.bg.replace(
                                  /\s*hover:\S+/g,
                                  ''
                                )} ${finalCfg.text} ${finalCfg.border}`}
                              >
                                {finalCfg.short} · Đã khớp
                              </span>
                            ) : att?.reconciliation_state === 'RESOLVED' && finalCfg ? (
                              <span
                                className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-extrabold ${finalCfg.bg.replace(
                                  /\s*hover:\S+/g,
                                  ''
                                )} ${finalCfg.text} ${finalCfg.border}`}
                              >
                                {finalCfg.short} · Đã phân xử
                              </span>
                            ) : att && (att.teacher_status || att.cs_status) ? (
                              <span className="inline-flex h-6 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-bold text-amber-700">
                                {att.teacher_status ? 'Chờ CSKH' : 'Chờ GV'}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 border-r border-border/60">
                            {att?.lesson_topic || att?.teacher_note ? (
                              <div className="space-y-0.5">
                                {att.lesson_topic && (
                                  <div className="font-semibold text-teal-800">
                                    {att.lesson_topic}
                                  </div>
                                )}
                                {att.teacher_note && (
                                  <div className="italic text-text-secondary">
                                    "{att.teacher_note}"
                                  </div>
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
                              onClick={() => openDrawer(cls, student, dateStr, caNumber, false)}
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
        ) : (
        <div className="w-full overflow-x-auto select-none">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                <th
                  className={`px-2 py-3 border-r border-border/60 w-10 min-w-[40px] text-center bg-slate-100/90 ${
                    activeTab === 'detailed' ? 'sticky left-0 z-20 bg-slate-100' : ''
                  }`}
                >
                  <input
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleInClassesSelected;
                    }}
                    type="checkbox"
                    checked={allVisibleInClassesSelected}
                    onChange={handleToggleSelectAllInClasses}
                    disabled={totalSelectableInClasses === 0}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                    title="Chọn hoặc bỏ chọn tất cả lớp / học viên đang hiển thị"
                    aria-label="Chọn hoặc bỏ chọn tất cả lớp / học viên đang hiển thị"
                  />
                </th>
                <th
                  className={`px-3 py-3 border-r border-border/60 whitespace-nowrap w-28 min-w-[112px] ${
                    activeTab === 'detailed' ? 'sticky left-10 z-20 bg-slate-100' : ''
                  }`}
                >
                  Mã lớp
                </th>
                <th
                  className={`px-3 py-3 border-r border-border/60 whitespace-nowrap w-[155px] min-w-[155px] ${
                    activeTab === 'detailed'
                      ? 'sticky left-[152px] z-20 bg-slate-100'
                      : ''
                  }`}
                >
                  Tên lớp
                </th>
                {isColVisible('level') && (
                  <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap w-24">
                    Trình độ
                  </th>
                )}
                {isColVisible('model_type') && (
                  <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap w-20">
                    Mô hình
                  </th>
                )}
                {isColVisible('teacher_name') && (
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[130px]">
                    Giáo viên
                  </th>
                )}
                {isColVisible('schedule_pattern') && (
                  <th className="px-3 py-3 border-r border-border/60 whitespace-nowrap min-w-[110px]">
                    Lịch học
                  </th>
                )}
                {isColVisible('status') && (
                  <th className="px-2.5 py-3 border-r border-border/60 text-center whitespace-nowrap w-24">
                    Trạng thái
                  </th>
                )}
                <th
                  className={`px-3 py-3 border-r-2 border-border/80 whitespace-nowrap min-w-[175px] ${
                    activeTab === 'detailed'
                      ? 'sticky left-[307px] z-20 bg-slate-100 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]'
                      : ''
                  }`}
                >
                  Học viên
                </th>

                {activeTab === 'quick' ? (
                  (() => {
                    const [y, m, day] = selectedDate.split('-').map(Number);
                    const d = new Date(y, m - 1, day);
                    const dateFormatted = `${d.getDate() < 10 ? `0${d.getDate()}` : d.getDate()}/${
                      d.getMonth() + 1 < 10 ? `0${d.getMonth() + 1}` : d.getMonth() + 1
                    }/${d.getFullYear()}`;
                    const dayOfWeek = DAY_OF_WEEK_NAMES[d.getDay()];

                    if (isTeacher) {
                      return (
                        <>
                          <th className="px-3 py-2 border-r border-border/60 text-center bg-teal-50/70 text-teal-950 min-w-[290px]">
                            <div className="text-[12px] font-extrabold text-teal-950">
                              Điểm danh
                            </div>
                            <div className="mt-0.5 text-[10px] font-semibold text-teal-700 flex items-center justify-center gap-1 whitespace-nowrap">
                              <CalendarDays className="w-3 h-3 shrink-0" />
                              <span>
                                {dayOfWeek} {dateFormatted}
                              </span>
                            </div>
                          </th>
                          <th className="px-3 py-2.5 border-r border-border/60 bg-indigo-50/50 text-indigo-950 min-w-[170px]">
                            <div className="text-[12px] font-extrabold">Bài học</div>
                          </th>
                          <th className="px-3 py-2.5 border-r border-border/60 bg-indigo-50/50 text-indigo-950 min-w-[200px]">
                            <div className="text-[12px] font-extrabold">Ghi chú GV</div>
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
                            <span>
                              {dayOfWeek} {dateFormatted}
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[175px] bg-blue-50/90 text-primary border-primary/40">
                          <div className="text-[12px] font-extrabold text-primary whitespace-nowrap">
                            {isCSOnly ? 'Điểm danh CSKH' : 'Điểm danh & Ghi chú CSKH'}
                          </div>
                          <div className="mt-0.5 text-[10px] font-bold text-primary/80 flex items-center gap-1 whitespace-nowrap">
                            <CalendarDays className="w-3 h-3 shrink-0" />
                            <span>
                              {dayOfWeek} {dateFormatted}
                            </span>
                          </div>
                        </th>
                        {isCSOnly && (
                          <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[170px] bg-indigo-50/70 text-indigo-900">
                            <div className="text-[12px] font-extrabold text-indigo-900 whitespace-nowrap">
                              Ghi chú CSKH
                            </div>
                            <div className="mt-0.5 text-[10px] font-semibold text-indigo-700 flex items-center gap-1 whitespace-nowrap">
                              <CalendarDays className="w-3 h-3 shrink-0" />
                              <span>
                                {dayOfWeek} {dateFormatted}
                              </span>
                            </div>
                          </th>
                        )}
                        <th className="px-3 py-2 border-r border-border/60 text-left whitespace-nowrap min-w-[180px] bg-emerald-50/70 text-emerald-900">
                          <div className="text-[12px] font-extrabold text-emerald-900 whitespace-nowrap">
                            {isAdminOrManage ? 'Điểm danh (Chốt)' : 'Điểm danh chốt'}
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-emerald-700 flex items-center gap-1 whitespace-nowrap">
                            <CalendarDays className="w-3 h-3 shrink-0" />
                            <span>
                              {dayOfWeek} {dateFormatted}
                            </span>
                          </div>
                        </th>
                      </>
                    );
                  })()
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

                {canManageClasses && (
                  <th className="px-3 py-3 text-right whitespace-nowrap min-w-[110px]">
                    Thao tác
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      (activeTab === 'quick'
                        ? isCSOnly
                          ? 13
                          : 12
                        : 11 + visiblePeriodDates.length) +
                      (canManageClasses ? 1 : 0)
                    }
                    className="py-12 text-center text-text-muted"
                  >
                    Đang tải danh sách lớp học & điểm danh...
                  </td>
                </tr>
              ) : tableClasses.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      (activeTab === 'quick'
                        ? isCSOnly
                          ? 13
                          : 12
                        : 11 + visiblePeriodDates.length) +
                      (canManageClasses ? 1 : 0)
                    }
                    className="py-12 text-center text-text-muted"
                  >
                    {activeTab === 'quick' && onlyScheduledOnDate && filteredClasses.length > 0
                      ? 'Không có lớp nào có lịch hoặc ca học trong ngày đang chọn. Chọn "Tất cả lịch học" trong Bộ lọc để xem toàn bộ lớp.'
                      : isTeacher
                      ? 'Bạn chưa được phân công phụ trách lớp học nào.'
                      : 'Không tìm thấy lớp học nào phù hợp.'}
                  </td>
                </tr>
              ) : (
                tableClasses
                  .slice((page - 1) * pageSize, page * pageSize)
                  .map((cls) => {
                  const formattedCode = formatClassCode(cls.class_code, cls.id);
                  const students = getStudentsOfClass(cls);
                  const modelNorm = normalizeModel(cls.model_type, students.length);
                  const conf = CLASS_MODEL_BADGE_STYLES[modelNorm] || CLASS_MODEL_BADGE_STYLES['1:1'];
                  const classStatusInfo = resolveClassDisplayStatus(cls, students);
                  const cleanedClassName =
                    cleanClassIdentifier(cls.class_name) ||
                    cleanClassIdentifier(cls.class_code) ||
                    cls.class_name;
                  const isOneToOne = modelNorm === '1:1' && students.length <= 1;
                  const singleStudent = isOneToOne ? students[0] : undefined;
                  const isExpanded = !collapsedClassIds.has(cls.id);
                  const mainTeacher =
                    cls.class_teachers?.find((t) => t.role === 'MAIN' && t.active !== false)?.teacher ||
                    cls.class_teachers?.find((t) => t.active !== false)?.teacher ||
                    cls.class_teachers?.find((t) => t.role === 'MAIN')?.teacher ||
                    cls.class_teachers?.[0]?.teacher;
                  const schedule = cls.class_schedules?.[0];
                  const formattedStartTime = formatScheduleTimeDisplay(schedule?.start_time);

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

                  const classEcIds = students
                    .map((s) => s.enrollment_class_id)
                    .filter((id) => id > 0);
                  const selectedInClassCount = classEcIds.filter((id) =>
                    selectedEnrollmentIds.has(id)
                  ).length;
                  const allInClassSelected =
                    classEcIds.length > 0
                      ? selectedInClassCount === classEcIds.length
                      : selectedClassIds.has(cls.id);
                  const someInClassSelected =
                    classEcIds.length > 0 &&
                    selectedInClassCount > 0 &&
                    !allInClassSelected;
                  const visibleOptionalColsCount =
                    (isColVisible('level') ? 1 : 0) +
                    (isColVisible('model_type') ? 1 : 0) +
                    (isColVisible('teacher_name') ? 1 : 0) +
                    (isColVisible('schedule_pattern') ? 1 : 0) +
                    (isColVisible('status') ? 1 : 0);

                  return (
                    <React.Fragment key={cls.id}>
                      {/* DÒNG LỚP HỌC CHÍNH */}
                      <tr
                        className={`border-b border-border/70 transition-colors ${
                          allInClassSelected
                            ? 'bg-primary-soft/40'
                            : isOneToOne
                            ? 'bg-surface hover:bg-slate-50/80'
                            : 'bg-slate-100/75 hover:bg-slate-100 font-semibold'
                        }`}
                      >
                        {/* Checkbox chọn lớp / toàn bộ học viên của lớp */}
                        <td
                          className={`px-2 py-2.5 border-r border-border/60 w-10 min-w-[40px] text-center ${
                            activeTab === 'detailed'
                              ? `sticky left-0 z-10 ${isOneToOne ? 'bg-surface' : 'bg-slate-100'}`
                              : ''
                          }`}
                        >
                          <input
                            ref={(el) => {
                              if (el) el.indeterminate = someInClassSelected;
                            }}
                            type="checkbox"
                            checked={allInClassSelected}
                            onChange={() => handleToggleSelectClassRow(cls, students)}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-primary accent-primary focus:ring-primary"
                            title={
                              isOneToOne
                                ? 'Chọn lớp / học viên'
                                : `Chọn hoặc bỏ chọn toàn bộ học viên lớp ${formattedCode}`
                            }
                          />
                        </td>

                        {/* Mã lớp chuẩn class_0001 */}
                        <td
                          className={`px-3 py-2.5 border-r border-border/60 whitespace-nowrap w-28 min-w-[112px] ${
                            activeTab === 'detailed'
                              ? `sticky left-10 z-10 ${isOneToOne ? 'bg-surface' : 'bg-slate-100'}`
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
                              ? `sticky left-[152px] z-10 ${
                                  isOneToOne ? 'bg-surface' : 'bg-slate-100'
                                }`
                              : ''
                          }`}
                          title={cleanedClassName}
                        >
                          <div className="truncate max-w-[150px]">{cleanedClassName}</div>
                        </td>

                        {/* Trình độ */}
                        {isColVisible('level') && (
                          <td className="px-2.5 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                            {cls.level || singleStudent?.level ? (
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                {cls.level || singleStudent?.level}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        )}

                        {/* Mô hình */}
                        {isColVisible('model_type') && (
                          <td className="px-2.5 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${conf.className}`}
                            >
                              {conf.label}
                            </span>
                          </td>
                        )}

                        {/* Giáo viên */}
                        {isColVisible('teacher_name') && (
                          <td className="px-3 py-2.5 border-r border-border/60 font-semibold text-slate-800 text-xs whitespace-nowrap">
                            {mainTeacher ? (
                              mainTeacher.name
                            ) : (
                              <span className="italic text-slate-400">Chưa phân công</span>
                            )}
                          </td>
                        )}

                        {/* Lịch học */}
                        {isColVisible('schedule_pattern') && (
                          <td className="px-3 py-2.5 border-r border-border/60 text-xs text-text-secondary whitespace-nowrap">
                            {schedule ? (
                              <span>
                                {schedule.schedule_pattern || 'Linh hoạt'}
                                {formattedStartTime ? ` · ${formattedStartTime}` : ''}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        )}

                        {/* Trạng thái (đồng bộ 4 trạng thái chuẩn: Đang học | Bảo lưu | Chờ lớp | Kết thúc) */}
                        {isColVisible('status') && (
                          <td className="px-2.5 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                            <Badge variant={classStatusInfo.variant} size="sm">
                              {classStatusInfo.label}
                            </Badge>
                          </td>
                        )}

                        {/* Cột Học viên */}
                        <td
                          className={`px-3 py-2.5 border-r-2 border-border/80 whitespace-nowrap min-w-[175px] ${
                            activeTab === 'detailed'
                              ? `sticky left-[307px] z-10 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)] ${
                                  isOneToOne ? 'bg-surface' : 'bg-slate-100'
                                }`
                              : ''
                          }`}
                        >
                          {isOneToOne ? (
                            singleStudent ? (
                              <div>
                                <div className="font-bold text-text-primary whitespace-nowrap">
                                  {singleStudent.full_name}
                                </div>
                                <div className="font-mono text-[10px] text-text-muted whitespace-nowrap">
                                  {singleStudent.external_id}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs italic text-slate-400 whitespace-nowrap">
                                Chưa xếp học viên
                              </span>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleClassExpand(cls.id)}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-purple-200 bg-purple-50/80 px-2.5 py-1 text-xs font-extrabold text-purple-900 hover:bg-purple-100 transition"
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

                        {/* Cột Điểm danh & Bài học & Ghi chú tùy theo Tab & Role */}
                        {activeTab === 'quick' ? (
                          isTeacher ? (
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
                                    {Array.from(
                                      { length: getVisibleCaCount(cls, selectedDate) },
                                      (_, idx) => {
                                        const caNo = idx + 1;
                                        const totalCa = getVisibleCaCount(cls, selectedDate);
                                        const isLastCa = caNo === totalCa;
                                        const sess = getDaySessions(cls.id, selectedDate)[caNo - 1];
                                        const marked = countMarkedInCa(cls, selectedDate, caNo);
                                        const isBulkSaving =
                                          savingKey ===
                                          `class_${cls.id}_${selectedDate}_s${caNo}`;
                                        const isAddingCa =
                                          savingKey === `addca_${cls.id}_${selectedDate}`;
                                        const isDeletingThisCa = Boolean(
                                          sess && savingKey === `delca_${sess.id}`
                                        );
                                        const progressChipClass =
                                          marked === 0
                                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                                            : marked < students.length
                                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                                            : 'bg-emerald-50 text-emerald-800 border-emerald-200';
                                        const progressLabel =
                                          marked === 0
                                            ? `Ca ${caNo}: Chưa chấm (0/${students.length})`
                                            : marked < students.length
                                            ? `Ca ${caNo}: Đã chấm ${marked}/${students.length}`
                                            : `Ca ${caNo}: Đã chấm đủ ${marked}/${students.length}`;
                                        return (
                                          <div
                                            key={caNo}
                                            className="flex min-h-7 flex-nowrap items-center gap-1.5 whitespace-nowrap"
                                          >
                                            <span
                                              className={`inline-flex h-7 shrink-0 items-center rounded-lg border px-2.5 text-[11px] font-bold ${progressChipClass}`}
                                              title={`Tiến độ điểm danh Ca ${caNo} của lớp`}
                                            >
                                              {progressLabel}
                                            </span>

                                            <button
                                              type="button"
                                              disabled={
                                                isBulkSaving ||
                                                isDeletingThisCa ||
                                                students.length === 0
                                              }
                                              onClick={() => {
                                                setSelectedCa(cls.id, selectedDate, caNo);
                                                if (marked >= students.length && students.length > 0) {
                                                  void handleBulkUnmarkWholeClass(
                                                    cls,
                                                    selectedDate,
                                                    caNo
                                                  );
                                                } else {
                                                  void handleBulkMarkWholeClass(
                                                    cls,
                                                    selectedDate,
                                                    'ATTENDED',
                                                    caNo
                                                  );
                                                }
                                              }}
                                              title={
                                                marked >= students.length && students.length > 0
                                                  ? `Bỏ chấm điểm danh cả lớp (${students.length} học viên) ở Ca ${caNo}`
                                                  : `Chấm Có mặt cả lớp (${students.length} học viên) cho Ca ${caNo}`
                                              }
                                              className={`inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-dashed px-2.5 text-[11px] font-bold transition disabled:opacity-50 ${
                                                marked >= students.length && students.length > 0
                                                  ? 'border-rose-300 bg-white text-rose-700 hover:border-rose-400 hover:bg-rose-50'
                                                  : 'border-indigo-300 bg-white text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50'
                                              }`}
                                            >
                                              <ListChecks
                                                className={`h-3.5 w-3.5 ${
                                                  marked >= students.length && students.length > 0
                                                    ? 'text-rose-600'
                                                    : 'text-indigo-600'
                                                }`}
                                              />
                                              <span>
                                                {marked >= students.length && students.length > 0
                                                  ? 'Bỏ chấm cả lớp'
                                                  : 'Chấm cả lớp'}
                                              </span>
                                            </button>

                                            {isLastCa && (
                                              <button
                                                type="button"
                                                disabled={isAddingCa}
                                                onClick={() =>
                                                  handleAddCaForClass(cls, selectedDate)
                                                }
                                                title={`Thêm Ca ${totalCa + 1} cho cả lớp`}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-primary/60 bg-white text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:opacity-50"
                                              >
                                                <Plus className="h-3.5 w-3.5" />
                                              </button>
                                            )}

                                            {sess && (
                                              <button
                                                type="button"
                                                disabled={isDeletingThisCa}
                                                onClick={() =>
                                                  requestDeleteCa(cls, selectedDate, caNo)
                                                }
                                                title={
                                                  marked === 0
                                                    ? `Gỡ bỏ Ca ${caNo} (chưa chấm điểm danh)`
                                                    : `Xóa Ca ${caNo} của cả lớp`
                                                }
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                )}
                              </td>

                              <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/15 select-text align-top">
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
                              </td>

                              <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/15 select-text align-top">
                                {isOneToOne && singleStudent ? (
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
                                  <span className="text-[11px] text-text-muted">—</span>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              {/* Cột 1 (CSKH/Admin): Điểm danh GV & Bài học */}
                              <td className="px-2.5 py-2 border-r border-border/60 bg-slate-50/40 align-middle whitespace-nowrap">
                                {isOneToOne ? (
                                  singleStudent ? (
                                    renderQuickTeacherStackForClassStudent(cls, singleStudent, selectedDate)
                                  ) : (
                                    <span className="text-xs italic text-slate-400">Chưa có học viên</span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-text-muted">
                                    Mở rộng lớp ({students.length} HV) ↓
                                  </span>
                                )}
                              </td>

                              {/* Cột 2 (CSKH/Admin): Điểm danh CSKH (hoặc Điểm danh & Ghi chú CSKH) */}
                              <td className="px-2.5 py-2 border-r border-border/60 bg-blue-50/20 align-middle whitespace-nowrap">
                                {isOneToOne ? (
                                  singleStudent ? (
                                    isCSOnly ? (
                                      renderQuickStatusCell(cls, singleStudent, selectedDate, 'mark')
                                    ) : (
                                      renderCSReadonlyCellForClassStudent(cls, singleStudent, selectedDate)
                                    )
                                  ) : (
                                    <span className="text-xs italic text-slate-400">—</span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-text-muted">—</span>
                                )}
                              </td>

                              {/* Cột 3 (chỉ CSKH): Ghi chú CSKH */}
                              {isCSOnly && (
                                <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/15 align-middle whitespace-nowrap">
                                  {isOneToOne && singleStudent ? (
                                    renderQuickCsNoteStackForClassStudent(cls, singleStudent, selectedDate)
                                  ) : (
                                    <span className="text-[11px] text-text-muted">—</span>
                                  )}
                                </td>
                              )}

                              {/* Cột 4 (CSKH/Admin): Điểm danh chốt */}
                              <td className="px-2.5 py-2 border-r border-border/60 bg-emerald-50/20 align-middle whitespace-nowrap">
                                {isOneToOne ? (
                                  singleStudent ? (
                                    isAdminOrManage ? (
                                      renderQuickStatusCell(cls, singleStudent, selectedDate, 'admin-final')
                                    ) : (
                                      renderFinalStatusCellForClassStudent(cls, singleStudent, selectedDate)
                                    )
                                  ) : (
                                    <span className="text-xs italic text-slate-400">—</span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-text-muted">—</span>
                                )}
                              </td>
                            </>
                          )
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
                                    (() => {
                                      const markedInDay = countMarkedInCa(cls, dStr, 1);
                                      const isAllMarkedInDay =
                                        markedInDay >= students.length && students.length > 0;
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (isAllMarkedInDay) {
                                              void handleBulkUnmarkWholeClass(cls, dStr, 1);
                                            } else {
                                              void handleBulkMarkWholeClass(cls, dStr, 'ATTENDED', 1);
                                            }
                                          }}
                                          disabled={savingKey === `class_${cls.id}_${dStr}_s1`}
                                          title={
                                            isAllMarkedInDay
                                              ? `Bỏ chấm cả lớp (${students.length} học viên) ngày ${dStr}`
                                              : `Chấm Có mặt cả lớp (${students.length} học viên) ngày ${dStr}`
                                          }
                                          className={`inline-flex h-6 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-dashed bg-white px-1.5 text-[10px] font-bold transition disabled:opacity-50 ${
                                            isAllMarkedInDay
                                              ? 'border-rose-300 text-rose-700 hover:border-rose-400 hover:bg-rose-50'
                                              : 'border-indigo-300 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50'
                                          }`}
                                        >
                                          <ListChecks className="h-3 w-3 shrink-0" />
                                          <span>{isAllMarkedInDay ? 'Bỏ chấm cả lớp' : 'Chấm cả lớp'}</span>
                                        </button>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-[10px] text-slate-400">↓</span>
                                  )}
                                </td>
                              );
                            })}
                          </>
                        )}

                        {/* Cột Thao tác (chỉ hiển thị cho vai trò quản lý lớp) */}
                        {canManageClasses && (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="flex justify-end gap-1">
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
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* CÁC DÒNG HỌC VIÊN CON BÊN DƯỚI LỚP 1:2 / 1:N */}
                      {!isOneToOne &&
                        isExpanded &&
                        (students.length === 0 ? (
                          <tr className="border-b border-border/50 bg-slate-50/40">
                            <td colSpan={3 + visibleOptionalColsCount} className="px-3 py-2 border-r border-border/50" />
                            <td
                              colSpan={
                                (activeTab === 'quick'
                                  ? isCSOnly
                                    ? 5
                                    : 4
                                  : 3 + visiblePeriodDates.length) +
                                (canManageClasses ? 1 : 0)
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
                            const isChildSelected = selectedEnrollmentIds.has(
                              st.enrollment_class_id
                            );

                            return (
                              <tr
                                key={st.enrollment_class_id}
                                className={`border-b border-border/50 transition-colors ${
                                  isChildSelected
                                    ? 'bg-primary-soft/35 hover:bg-primary-soft/45'
                                    : 'bg-white hover:bg-blue-50/30'
                                }`}
                              >
                                <td
                                  className={`px-2 py-2 border-r border-border/50 w-10 min-w-[40px] text-center ${
                                    activeTab === 'detailed' ? 'sticky left-0 z-10 bg-white' : ''
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChildSelected}
                                    onChange={() =>
                                      handleToggleSelectSingleEcId(st.enrollment_class_id)
                                    }
                                    className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-primary accent-primary focus:ring-primary"
                                    title={`Chọn học viên ${st.full_name}`}
                                  />
                                </td>
                                <td
                                  className={`py-2 pl-[1cm] pr-3 border-r border-border/50 text-left font-mono text-[10px] text-slate-400 w-28 min-w-[112px] ${
                                    activeTab === 'detailed' ? 'sticky left-10 z-10 bg-white' : ''
                                  }`}
                                >
                                  {formattedCode}.{sIdx + 1}
                                </td>
                                <td
                                  className={`px-3 py-2 border-r border-border/50 text-[11px] text-slate-500 whitespace-nowrap w-[155px] min-w-[155px] ${
                                    activeTab === 'detailed'
                                      ? 'sticky left-[152px] z-10 bg-white'
                                      : ''
                                  }`}
                                  title={cleanedClassName}
                                >
                                  <div className="truncate max-w-[150px]">{cleanedClassName}</div>
                                </td>
                                {isColVisible('level') && (
                                  <td className="px-2.5 py-2 border-r border-border/50 text-center text-[11px] text-slate-500">
                                    {st.level || cls.level || '—'}
                                  </td>
                                )}
                                {isColVisible('model_type') && (
                                  <td className="px-2.5 py-2 border-r border-border/50 text-center text-[11px] text-slate-500">
                                    {conf.label}
                                  </td>
                                )}
                                {isColVisible('teacher_name') && (
                                  <td className="px-3 py-2 border-r border-border/50 text-[11px] text-slate-500 whitespace-nowrap">
                                    {mainTeacher?.name || '—'}
                                  </td>
                                )}
                                {isColVisible('schedule_pattern') && (
                                  <td className="px-3 py-2 border-r border-border/50 text-[11px] text-slate-500 whitespace-nowrap">
                                    {schedule ? (
                                      <span>
                                        {schedule.schedule_pattern || 'Linh hoạt'}
                                        {formattedStartTime ? ` · ${formattedStartTime}` : ''}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                )}
                                {isColVisible('status') && (
                                  <td className="px-2.5 py-2 border-r border-border/50 text-center whitespace-nowrap">
                                    {(() => {
                                      const stBadge =
                                        ENROLLMENT_STATUS_BADGE_MAP[st.status || 'STUDYING'] ||
                                        ENROLLMENT_STATUS_BADGE_MAP.STUDYING;
                                      return (
                                        <Badge variant={stBadge.variant} size="sm">
                                          {stBadge.label}
                                        </Badge>
                                      );
                                    })()}
                                  </td>
                                )}
                                <td
                                  className={`px-3 py-2 border-r-2 border-border/80 whitespace-nowrap min-w-[175px] ${
                                    activeTab === 'detailed'
                                      ? 'sticky left-[307px] z-10 bg-purple-50/95 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]'
                                      : 'bg-purple-50/20'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                                    <div>
                                      <div className="font-bold text-text-primary whitespace-nowrap">
                                        {st.full_name}
                                      </div>
                                      <div className="font-mono text-[10px] text-text-muted whitespace-nowrap">
                                        {st.external_id}
                                      </div>
                                    </div>
                                    {st.package_name && (
                                      <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                        {st.package_name}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {activeTab === 'quick' ? (
                                  isTeacher ? (
                                    <>
                                      <td className="px-2.5 py-2 border-r border-border/60 bg-teal-50/10 align-top">
                                        {renderQuickStatusCell(cls, st, selectedDate)}
                                      </td>
                                      <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/10 select-text align-top">
                                        {renderCaReadonlyStack(cls, st, selectedDate, 'lesson_topic')}
                                      </td>
                                      <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/10 select-text align-top">
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
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="px-2.5 py-2 border-r border-border/60 bg-slate-50/40 align-middle whitespace-nowrap">
                                        {renderQuickTeacherStackForClassStudent(cls, st, selectedDate)}
                                      </td>
                                      <td className="px-2.5 py-2 border-r border-border/60 bg-blue-50/20 align-middle whitespace-nowrap">
                                        {isCSOnly
                                          ? renderQuickStatusCell(cls, st, selectedDate, 'mark')
                                          : renderCSReadonlyCellForClassStudent(cls, st, selectedDate)}
                                      </td>
                                      {isCSOnly && (
                                        <td className="px-2.5 py-2 border-r border-border/60 bg-indigo-50/15 align-middle whitespace-nowrap">
                                          {renderQuickCsNoteStackForClassStudent(cls, st, selectedDate)}
                                        </td>
                                      )}
                                      <td className="px-2.5 py-2 border-r border-border/60 bg-emerald-50/20 align-middle whitespace-nowrap">
                                        {isAdminOrManage
                                          ? renderQuickStatusCell(cls, st, selectedDate, 'admin-final')
                                          : renderFinalStatusCellForClassStudent(cls, st, selectedDate)}
                                      </td>
                                    </>
                                  )
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

                                {canManageClasses && (
                                  <td className="px-3 py-1.5 text-right text-[11px] text-text-muted">
                                    —
                                  </td>
                                )}
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

        {/* Chú thích mã & Phân trang ở chân bảng */}
        {(() => {
          const isLogMode = activeTab === 'detailed' && detailedViewMode === 'log';
          const totalRows = isLogMode ? periodSessionLogs.length : tableClasses.length;
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
                      className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-extrabold border ${opt.bg.replace(
                        /\s*hover:\S+/g,
                        ''
                      )} ${opt.text} ${opt.border}`}
                    >
                      {opt.short}
                    </span>
                    <span>{opt.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-600 border border-white shadow-2xs" />
                  <span>Có Bài học / Ghi chú GV</span>
                </div>
              </div>

              {totalRows > 0 && (
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  <span>
                    Hiển thị <strong className="text-text-primary">{startIdx}</strong>–
                    <strong className="text-text-primary">{endIdx}</strong> /{' '}
                    <strong className="text-text-primary">{totalRows}</strong>{' '}
                    {isLogMode ? 'buổi' : 'lớp'}
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
      </div>
      )}

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
                  deleteCaTarget.cls,
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
              {deleteCaTarget.cls.class_name}
              <span className="ml-1.5 font-mono text-xs text-text-muted">
                ({formatClassCode(deleteCaTarget.cls.class_code, deleteCaTarget.cls.id)})
              </span>{' '}
              · {formatSessionDate(deleteCaTarget.dateStr)} · Ca {deleteCaTarget.caNumber}
            </p>
            <p className="rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-800">
              Thao tác này sẽ xóa dữ liệu điểm danh của{' '}
              <strong>
                bạn ({activeSide === 'CS' ? 'CSKH' : activeSide === 'ADMIN' ? 'Admin' : 'Giáo viên'})
              </strong>{' '}
              ở <strong>Ca {deleteCaTarget.caNumber}</strong>. Dữ liệu mà các vai trò khác đã nhập
              (nếu có) sẽ <strong>được giữ nguyên</strong>; nếu cả 3 bên đều trống thì ca học sẽ
              được gỡ bỏ hoàn toàn.
            </p>
          </div>
        )}
      </Modal>

      {/* Ngăn chi tiết ca học (Drawer) — đồng bộ cho cả 3 role (GV · CSKH · Admin) */}
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
        side={activeSide}
        defaultEditing={drawerState?.defaultEditing}
        canEditTeacherFields={isTeacher}
        canEditCsFields={isCSOnly}
        canMarkStatus={isTeacher || isCSOnly || isAdminOrManage}
        canDeleteSession
        saving={!!savingKey}
        onSaveStatusAndNotes={async ({ session, sessionNumber, status, lesson_topic, teacher_note, cs_note }) => {
          if (!drawerState) return;
          await handleMarkAttendanceAndNote({
            classId: drawerState.classId,
            enrollmentClassId: drawerState.enrollmentClassId,
            dateStr: drawerState.dateStr,
            session,
            sessionNumber,
            status,
            ...(isTeacher ? { lesson_topic, teacher_note } : {}),
            ...(isCSOnly ? { cs_note } : {}),
            studentName: drawerState.studentName,
          });
        }}
        onSaveNotesOnly={async ({ session, sessionNumber, lesson_topic, teacher_note, cs_note }) => {
          if (!drawerState || (!isTeacher && !isCSOnly)) return;
          await handleSaveLessonAndNote({
            classId: drawerState.classId,
            enrollmentClassId: drawerState.enrollmentClassId,
            dateStr: drawerState.dateStr,
            session,
            sessionNumber,
            lessonTopic: isTeacher ? lesson_topic ?? null : null,
            teacherNote: isTeacher ? teacher_note ?? null : null,
            ...(isCSOnly ? { csNote: cs_note ?? null } : {}),
            studentName: drawerState.studentName,
            fromPopover: true,
          });
        }}
        onClearStatus={async (session) => {
          if (!drawerState) return;
          await handleClearAttendance(drawerState.classId, drawerState.enrollmentClassId, session);
        }}
        onDeleteSession={(session) => {
          if (!drawerState) return;
          const cls = classes.find((c) => c.id === drawerState.classId);
          if (!cls) return;
          const idx = getDaySessions(cls.id, drawerState.dateStr).findIndex(
            (s) => s.id === session.id
          );
          requestDeleteCa(cls, drawerState.dateStr, idx >= 0 ? idx + 1 : drawerState.caNumber);
        }}
      />

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
