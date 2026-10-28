import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentsApi } from '../api/students.api';
import { careApi } from '../../care/api/care.api';
import { Student, CreateStudentDTO } from '../types/students.types';
import { teachersApi } from '../../teachers/api/teachers.api';
import { Teacher } from '../../teachers/types/teachers.types';
import {
  cleanClassIdentifier,
  cleanNoteText,
  formatClassCode,
  normalizeClassModel,
  CLASS_MODEL_BADGE_STYLES,
  resolveEffectiveEnrollmentStatus,
  formatCourseContentDisplay,
  formatScheduleTimeDisplay,
} from '../../classes/types/classes.types';
import { CareSelectCell } from '../components/CareSelectCell';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar } from '../../../components/common/FilterBar';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { useAuth } from '../../../contexts/AuthContext';
import { useColumnVisibility } from '../../preferences/hooks/useColumnVisibility';
import { ColumnVisibilityDropdown } from '../../preferences/components/ColumnVisibilityDropdown';
import {
  Edit,
  Plus,
  Search,
  AlertTriangle,
  UserCheck,
  Eye,
  Users,
  FileText,
  ExternalLink,
  PlusCircle,
  MessageSquare,
  PhoneCall,
  Flame,
  CheckCircle2,
  BookOpen,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Nam',
  FEMALE: 'Nữ',
  OTHER: 'Khác',
};

const ENROLLMENT_STATUS_LABELS: Record<
  string,
  { label: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  WAITING_CLASS: { label: 'Chờ lớp', variant: 'warning' },
  STUDYING: { label: 'Đang học', variant: 'success' },
  PAUSED: { label: 'Bảo lưu', variant: 'warning' },
  FINISHED: { label: 'Kết thúc', variant: 'neutral' },
  UPCOMING: { label: 'Sắp học', variant: 'info' },
  NOT_STARTED: { label: 'Chưa học', variant: 'neutral' },
  CANCELLED: { label: 'Đã hủy', variant: 'danger' },
};

const isAttendedCountable = (a: any): boolean => {
  if (!a || a.deleted_at) return false;
  return (
    (a.reconciliation_state === 'RESOLVED' && a.status === 'ATTENDED') ||
    (a.reconciliation_state === 'MATCHED' &&
      (a.status === 'ATTENDED' || a.cs_status === 'ATTENDED' || a.teacher_status === 'ATTENDED')) ||
    (!a.reconciliation_state && a.status === 'ATTENDED')
  );
};

// Component chỉnh sửa văn bản trực tiếp trong ô (Inline Edit)
interface InlineEditableCellProps {
  value?: string | null;
  onSave: (newVal: string) => Promise<void>;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  isUrgent?: boolean;
}

const InlineEditableCell: React.FC<InlineEditableCellProps> = ({
  value,
  onSave,
  placeholder = '—',
  multiline = false,
  className = '',
  isUrgent = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const handleCommit = async () => {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (value || '').trim()) return;

    try {
      setIsSaving(true);
      await onSave(trimmed);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      setDraft(value || '');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    if (multiline) {
      return (
        <div className="relative min-w-[190px] p-0.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCommit();
              } else if (e.key === 'Escape') {
                setIsEditing(false);
                setDraft(value || '');
              }
            }}
            rows={2}
            className="w-full text-xs p-1.5 bg-white border-2 border-primary rounded-lg focus:outline-none shadow-md resize-none text-slate-800"
            placeholder={placeholder}
          />
          <div className="text-[10px] text-slate-400 text-right pr-1">Enter: Lưu • Esc: Hủy</div>
        </div>
      );
    }

    return (
      <div className="min-w-[160px]">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCommit();
            } else if (e.key === 'Escape') {
              setIsEditing(false);
              setDraft(value || '');
            }
          }}
          className="w-full text-xs p-1 bg-white border-2 border-primary rounded-lg focus:outline-none shadow-md text-slate-800"
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`group cursor-pointer p-1.5 rounded-lg transition-all min-h-[28px] flex items-center justify-between gap-1 hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-300 ${
        isUrgent && value ? 'bg-rose-50 text-rose-900 border border-rose-200' : ''
      } ${className}`}
      title="Click để chỉnh sửa trực tiếp"
    >
      <span
        className={`text-xs block truncate max-w-[200px] ${
          value ? 'text-slate-800 font-medium' : 'text-slate-400 italic'
        }`}
      >
        {value || placeholder}
      </span>
      {isSaving ? (
        <span className="text-[10px] text-primary animate-pulse shrink-0 font-bold">Lưu...</span>
      ) : justSaved ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
      ) : (
        <Edit className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-blue-600" />
      )}
    </div>
  );
};

export const StudentsPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdminOrManage = Boolean(
    user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE'),
  );
  const isCSOnly = Boolean(user?.roles?.includes('CS') && !isAdminOrManage);

  // Active tab state: 'students' (Tab 1) | 'care_reports' (Tab 2)
  const [activeTab, setActiveTab] = useState<'students' | 'care_reports'>('students');

  // Column visibility preference (per user, per tab)
  const { visible: visibleColumns } = useColumnVisibility(
    activeTab === 'students' ? 'students.tab1' : 'students.tab2',
  );

  // Helper: keep a column unless the user hid it (columns without key are always kept)
  const keepColumn = (col: Column<Student>): boolean =>
    !col.key || visibleColumns[col.key] !== false;

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // Care milestones state (mặc định các mốc chuẩn: 1, 3, 10, 15)
  const [configuredMilestones, setConfiguredMilestones] = useState<number[]>([1, 3, 10, 15]);
  const [isAddMilestoneModalOpen, setIsAddMilestoneModalOpen] = useState(false);
  const [newMilestoneInput, setNewMilestoneInput] = useState<number | ''>('');
  const [addingMilestone, setAddingMilestone] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [programFilter, setProgramFilter] = useState<'ALL' | 'KAIWA' | 'JLPT'>('ALL');
  const [statusFilter, setStatusFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [csFilter, setCsFilter] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const initialFormData: CreateStudentDTO = {
    // 1. Hồ sơ & Liên hệ
    external_id: '',
    full_name: '',
    gender: 'OTHER',
    phone: '',
    email: '',
    date_of_birth: '',
    parent_name: '',
    parent_phone: '',
    school: '',
    occupation: '',
    zalo_uid: '',
    line_uid: '',
    note: '',

    // 2. Khóa học & Tài chính
    paid_at: '',
    sale_name: '',
    student_source_status: 'Học viên chuẩn',
    course_content: 'Tiếng Nhật Kaiwa',
    payment_status: 'Đã đóng đủ',
    level: 'N5',
    total_sessions: 30,
    external_remaining_sessions: 30,
    attended_previous_years: '',
    class_model: 'Nhóm',
    sales_note: '',

    // 3. Lớp học & Lịch học
    class_name: '',
    teacher_name: '',
    teacher_code: '',
    start_date: '',
    end_date: '',
    status: 'STUDYING',
    start_time: '20h00',
    schedule_pattern: '246',
    duration_minutes: 30,

    // 4. Báo cáo & CSKH
    study_report_url: '',
    exchange_info: '',
    callback_note: '',
    hot_issue_note: '',
    post_course_care: '',
    handed_over_at: '',
    account_created_at: '',

    // 5. Program & Metadata
    program_type: 'KAIWA',
    program_metadata: {},
  };

  const [teachersList, setTeachersList] = useState<Teacher[]>([]);
  const [formData, setFormData] = useState<CreateStudentDTO>(initialFormData);
  const [formModalTab, setFormModalTab] = useState<'profile' | 'course' | 'class' | 'care'>('profile');

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const data = await studentsApi.list();
      setStudents(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách học viên');
    } finally {
      setLoading(false);
    }
  };

  const fetchMilestones = async () => {
    try {
      const list = await careApi.getMilestones();
      if (list && list.length > 0) {
        setConfiguredMilestones(list.map((m) => m.session_number).sort((a, b) => a - b));
      }
    } catch (err) {
      console.error('Lỗi khi tải cấu hình mốc buổi:', err);
    }
  };

  const fetchTeachers = async () => {
    try {
      const data = await teachersApi.list();
      setTeachersList(data);
    } catch (err) {
      console.error('Lỗi khi tải danh sách giáo viên:', err);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchMilestones();
    fetchTeachers();
  }, []);

  // Chuẩn hóa mô hình lớp về 1:1 | 1:2 | 1:n
  const normalizeModel = (model?: string | null): '1:1' | '1:2' | '1:n' =>
    normalizeClassModel(model);

  // Chuẩn hóa tình trạng học phí về PAID | DEBT | UNSET
  const classifyPaymentStatus = (raw?: string | null): 'PAID' | 'DEBT' | 'UNSET' => {
    const val = (raw || '').trim();
    if (!val || val === '—') return 'UNSET';
    const lower = val.toLowerCase();
    if (lower.includes('đủ') || lower.includes('hoàn tất') || lower === 'paid') {
      return 'PAID';
    }
    if (
      lower.includes('nợ') ||
      lower.includes('chưa') ||
      lower.includes('phần') ||
      lower.includes('thiếu') ||
      lower === 'debt' ||
      lower === 'partial' ||
      lower === 'unpaid'
    ) {
      return 'DEBT';
    }
    return 'PAID';
  };

  // Tập học viên thuộc phạm vi quyền của user đang đăng nhập (tầng dữ liệu cơ sở allRows)
  const allRows = useMemo(() => {
    if (!isCSOnly) return students;
    const userId = user?.id;
    const userStaffCode = ((user as any)?.staff_code || (user as any)?.code || '')
      .trim()
      .toUpperCase();

    const matchedByExplicitOwner = students.filter((s) => {
      const enr = s.enrollments?.[0];
      if (!enr) return false;
      const enrCsId = (enr as any)?.cs_user_id ?? enr?.cs_id ?? enr?.cs?.id;
      const enrCsCode = (
        (enr as any)?.cs_staff_code ||
        enr?.cs?.staff_code ||
        (enr?.cs as any)?.code ||
        ''
      )
        .trim()
        .toUpperCase();

      if (userId && enrCsId === userId) return true;
      if (userStaffCode && enrCsCode && enrCsCode === userStaffCode) return true;
      return false;
    });

    // Nếu dữ liệu có thông tin khớp trực tiếp cs_id / staff_code thì giữ đúng tập của CS đó;
    // nếu backend đã lọc theo token của CS (mà bản ghi thiếu trường cs chi tiết) thì giữ nguyên tập trả về
    const anyRowHasCsIdentity = students.some((s) => {
      const enr = s.enrollments?.[0];
      return Boolean(
        (enr as any)?.cs_user_id ||
          enr?.cs_id ||
          enr?.cs?.id ||
          (enr as any)?.cs_staff_code ||
          enr?.cs?.staff_code ||
          (enr?.cs as any)?.code,
      );
    });

    return anyRowHasCsIdentity ? matchedByExplicitOwner : students;
  }, [students, isCSOnly, user]);

  // Counts by program_type
  const programCounts = useMemo(() => {
    let kaiwa = 0;
    let jlpt = 0;
    allRows.forEach((s) => {
      const enr = s.enrollments?.[0];
      const pType = (enr?.program_type || 'KAIWA').toUpperCase();
      if (pType === 'JLPT') {
        jlpt++;
      } else {
        kaiwa++;
      }
    });
    return { all: allRows.length, kaiwa, jlpt };
  }, [allRows]);

  // Danh sách CSKH thực tế trích xuất từ dữ liệu thuộc phạm vi xem của ADMIN / MANAGE
  const csOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    allRows.forEach((s) => {
      s.enrollments?.forEach((enr) => {
        const csId = (enr as any)?.cs_user_id ?? enr?.cs_id ?? enr?.cs?.id;
        const code = (
          (enr as any)?.cs_staff_code ||
          enr?.cs?.staff_code ||
          (enr?.cs as any)?.code ||
          ''
        ).trim();
        const name = (enr?.cs?.name || '').trim();
        if (!csId && !code && !name) return;

        const key = code ? `CODE:${code.toUpperCase()}` : `ID:${csId}`;
        if (!map.has(key)) {
          const label =
            code && name
              ? `${code} - ${name}`
              : code || name || `CSKH #${csId}`;
          map.set(key, { value: key, label });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'vi-VN'));
  }, [allRows]);

  // Filtered students list matching Sheet 1 & Sheet JLPT
  const filteredStudents = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();

    return allRows.filter((s) => {
      // Primary enrollment for Sheet 1 attributes
      const enr = s.enrollments?.[0];
      const ec = enr?.enrollment_classes?.[0];

      // 1. Search term: Mã HV, Họ tên, SĐT, Email, Lớp học...
      if (query) {
        const classCode =
          ec?.class?.class_code ||
          enr?.program_metadata?.latest_class_code ||
          '';
        const className = ec?.class?.class_name || '';
        const teacherName = ec?.class?.class_teachers?.[0]?.teacher?.name || '';
        const matchSearch =
          s.full_name.toLowerCase().includes(query) ||
          (s.phone && s.phone.toLowerCase().includes(query)) ||
          (s.external_id && s.external_id.toLowerCase().includes(query)) ||
          `hv_${s.id}`.includes(query) ||
          (s.email && s.email.toLowerCase().includes(query)) ||
          classCode.toLowerCase().includes(query) ||
          className.toLowerCase().includes(query) ||
          teacherName.toLowerCase().includes(query);
        if (!matchSearch) return false;
      }

      // 2. Chương trình (ALL | KAIWA | JLPT)
      if (programFilter !== 'ALL') {
        const pType = (enr?.program_type || 'KAIWA').toUpperCase();
        if (pType !== programFilter) return false;
      }

      // 3. Trạng thái học (chuẩn hóa theo việc đã được xếp lớp hay chưa)
      if (statusFilter) {
        const hasAssignedClass = Boolean(
          ec?.class?.id ||
            ec?.class?.class_code ||
            ec?.class?.class_name ||
            enr?.program_metadata?.latest_class_code
        );
        const stStatus = resolveEffectiveEnrollmentStatus(
          enr?.status,
          hasAssignedClass,
          `${enr?.class_model || ''} ${enr?.level || ''}`
        );
        if (stStatus !== statusFilter) return false;
      }

      // 4. Mô hình lớp (1:1 | 1:2 | 1:n)
      if (modelFilter) {
        const rawModel = enr?.class_model || ec?.class?.model_type || '';
        if (normalizeModel(rawModel) !== modelFilter) return false;
      }

      // 5. Tình trạng học phí (PAID | DEBT | UNSET)
      if (paymentFilter) {
        if (classifyPaymentStatus(enr?.payment_status) !== paymentFilter) return false;
      }

      // 6. CSKH phụ trách (chỉ áp dụng khi ADMIN / MANAGE chọn lọc)
      if (isAdminOrManage && csFilter) {
        const csId = (enr as any)?.cs_user_id ?? enr?.cs_id ?? enr?.cs?.id;
        const code = (
          (enr as any)?.cs_staff_code ||
          enr?.cs?.staff_code ||
          (enr?.cs as any)?.code ||
          ''
        )
          .trim()
          .toUpperCase();
        const name = (enr?.cs?.name || '').trim();
        const hasCs = Boolean(csId || code || name);

        if (csFilter === 'UNASSIGNED') {
          if (hasCs) return false;
        } else if (csFilter.startsWith('CODE:')) {
          const targetCode = csFilter.slice(5);
          if (code !== targetCode) return false;
        } else if (csFilter.startsWith('ID:')) {
          const targetId = Number(csFilter.slice(3));
          if (csId !== targetId) return false;
        }
      }

      return true;
    });
  }, [
    allRows,
    searchTerm,
    programFilter,
    statusFilter,
    modelFilter,
    paymentFilter,
    csFilter,
    isAdminOrManage,
  ]);

  const activeFiltersCount =
    (searchTerm.trim() ? 1 : 0) +
    (programFilter !== 'ALL' ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (modelFilter ? 1 : 0) +
    (paymentFilter ? 1 : 0) +
    (isAdminOrManage && csFilter ? 1 : 0);

  const handleResetFilters = () => {
    setSearchTerm('');
    setProgramFilter('ALL');
    setStatusFilter('');
    setModelFilter('');
    setPaymentFilter('');
    setCsFilter('');
  };

  // All active session milestones depending on programFilter (KAIWA vs JLPT vs ALL)
  const activeMilestones = useMemo(() => {
    if (programFilter === 'KAIWA') {
      const set = new Set<number>([1, 3, 10, 15, 20, 25, 27]);
      filteredStudents.forEach((st) => {
        st.enrollments?.forEach((enr) => {
          enr.care_logs?.forEach((cl) => {
            if (cl.after_session_number) set.add(cl.after_session_number);
          });
        });
      });
      return Array.from(set).sort((a, b) => a - b);
    }

    if (programFilter === 'JLPT') {
      const set = new Set<number>([1, 15, 25, 30, 35, 40]);
      filteredStudents.forEach((st) => {
        st.enrollments?.forEach((enr) => {
          enr.care_logs?.forEach((cl) => {
            if (cl.after_session_number) set.add(cl.after_session_number);
          });
        });
      });
      return Array.from(set).sort((a, b) => a - b);
    }

    const set = new Set<number>([...configuredMilestones, 1, 3, 10, 15, 20, 25, 27, 30, 35, 40]);
    filteredStudents.forEach((st) => {
      st.enrollments?.forEach((enr) => {
        enr.care_logs?.forEach((cl) => {
          if (cl.after_session_number) {
            set.add(cl.after_session_number);
          }
        });
      });
    });

    return Array.from(set).sort((a, b) => a - b);
  }, [configuredMilestones, filteredStudents, programFilter]);

  // Handle adding a new care milestone
  const handleAddMilestone = async () => {
    const val = Number(newMilestoneInput);
    if (!val || val <= 0) {
      toast.warning('Vui lòng nhập số buổi hợp lệ (> 0)');
      return;
    }

    if (activeMilestones.includes(val)) {
      toast.info(`Mốc Buổi ${val} đã có trong bảng`);
      setIsAddMilestoneModalOpen(false);
      setNewMilestoneInput('');
      return;
    }

    try {
      setAddingMilestone(true);
      await careApi.addMilestone(val);
      setConfiguredMilestones((prev) => Array.from(new Set([...prev, val])).sort((a, b) => a - b));
      toast.success(`Đã bổ sung cột Chăm sóc sau buổi ${val} vào bảng!`);
      setIsAddMilestoneModalOpen(false);
      setNewMilestoneInput('');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể thêm mốc buổi');
    } finally {
      setAddingMilestone(false);
    }
  };

  // Handler to update an enrollment care field
  const handleSaveEnrollmentCareField = async (
    enrollmentId: number,
    field: 'study_report_url' | 'exchange_info' | 'callback_note' | 'hot_issue_note' | 'post_course_care',
    val: string
  ) => {
    await careApi.updateEnrollmentCare(enrollmentId, { [field]: val });
    // Local state sync
    setStudents((prev) =>
      prev.map((st) => ({
        ...st,
        enrollments: st.enrollments?.map((enr) =>
          enr.id === enrollmentId ? { ...enr, [field]: val } : enr
        ),
      }))
    );
  };

  // Handler to update JLPT program_metadata directly via studentsApi.update
  const handleSaveProgramMetadata = async (
    student: Student,
    patch: Record<string, any>
  ) => {
    const enr = student.enrollments?.[0];
    if (!enr) return;
    const nextMeta = {
      ...(enr.program_metadata || {}),
      ...patch,
    };
    await studentsApi.update(student.id, {
      enrollment_id: enr.id,
      program_type: enr.program_type || 'JLPT',
      program_metadata: nextMeta,
    });
    setStudents((prev) =>
      prev.map((st) =>
        st.id === student.id
          ? {
              ...st,
              enrollments: st.enrollments?.map((e, idx) =>
                idx === 0 ? { ...e, program_metadata: nextMeta } : e
              ),
            }
          : st
      )
    );
  };

  // Handler to save session care log
  const handleSaveSessionCareLog = async (
    enrollmentId: number,
    sessionNumber: number,
    content: string
  ) => {
    await careApi.saveSessionCareLog(enrollmentId, sessionNumber, { content });
    // Local state sync
    setStudents((prev) =>
      prev.map((st) => ({
        ...st,
        enrollments: st.enrollments?.map((enr) => {
          if (enr.id !== enrollmentId) return enr;
          const careLogs = [...(enr.care_logs || [])];
          const existingIdx = careLogs.findIndex(
            (cl) => cl.after_session_number === sessionNumber
          );
          if (existingIdx >= 0) {
            careLogs[existingIdx] = {
              ...careLogs[existingIdx],
              content,
            };
          } else {
            careLogs.push({
              id: Date.now(),
              after_session_number: sessionNumber,
              content,
              created_at: new Date().toISOString(),
            });
          }
          return { ...enr, care_logs: careLogs };
        }),
      }))
    );
  };

  const openModal = (student?: Student) => {
    setFormModalTab('profile');
    if (student) {
      const enr = student.enrollments?.[0];
      const ec = enr?.enrollment_classes?.[0];
      const sched = ec?.class?.class_schedules?.[0];
      const teacher = ec?.class?.class_teachers?.[0]?.teacher;

      setEditingStudent(student);
      setFormData({
        // 1. Hồ sơ & Liên hệ
        external_id: student.external_id || '',
        full_name: student.full_name,
        gender: (student.gender as any) || 'OTHER',
        phone: student.phone || '',
        email: student.email || '',
        date_of_birth: student.date_of_birth
          ? new Date(student.date_of_birth).toISOString().split('T')[0]
          : '',
        parent_name: student.parent_name || '',
        parent_phone: student.parent_phone || '',
        school: student.school || '',
        occupation: student.occupation || '',
        zalo_uid: student.zalo_uid || '',
        line_uid: student.line_uid || '',
        note: student.note || '',

        // 2. Gói học, Học phí & Tiến độ
        paid_at: enr?.paid_at ? new Date(enr.paid_at).toISOString().split('T')[0] : '',
        sale_name: enr?.sale_name || enr?.sale?.name || enr?.cs?.name || '',
        student_source_status: enr?.student_source_status || 'Học viên chuẩn',
        course_content: enr?.course_content || enr?.package?.name || 'Tiếng Nhật Kaiwa',
        payment_status: enr?.payment_status || 'Đã đóng đủ',
        level: enr?.level || 'N5',
        total_sessions: enr?.total_sessions ?? 30,
        external_remaining_sessions: enr?.external_remaining_sessions ?? 30,
        attended_previous_years:
          enr?.attended_previous_years !== undefined && enr?.attended_previous_years !== null
            ? enr.attended_previous_years
            : '',
        class_model: enr?.class_model || 'Nhóm',
        sales_note: enr?.sales_note || '',

        // 3. Lớp học & Lịch học
        class_name: ec?.class?.class_name || '',
        teacher_name: teacher?.name || '',
        teacher_code: (teacher as any)?.code || (teacher as any)?.teacher_profile?.teacher_code || '',
        start_date: enr?.start_date ? new Date(enr.start_date).toISOString().split('T')[0] : '',
        end_date: enr?.end_date ? new Date(enr.end_date).toISOString().split('T')[0] : '',
        status: enr?.status || 'STUDYING',
        start_time: sched?.start_time || '20h00',
        schedule_pattern: sched?.schedule_pattern || '246',
        duration_minutes: sched?.duration_minutes ?? 30,

        // 4. Báo cáo & CSKH
        study_report_url: enr?.study_report_url || '',
        exchange_info: enr?.exchange_info || '',
        callback_note: enr?.callback_note || '',
        hot_issue_note: enr?.hot_issue_note || '',
        post_course_care: enr?.post_course_care || '',
        handed_over_at: enr?.handed_over_at
          ? new Date(enr.handed_over_at).toISOString().split('T')[0]
          : '',
        account_created_at: enr?.account_created_at
          ? new Date(enr.account_created_at).toISOString().split('T')[0]
          : '',
        program_type: enr?.program_type || 'KAIWA',
        program_metadata: enr?.program_metadata || {},
      });
    } else {
      setEditingStudent(null);
      setFormData({
        ...initialFormData,
        program_type: programFilter === 'JLPT' ? 'JLPT' : 'KAIWA',
        sale_name: user?.name || user?.email || '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      toast.warning('Vui lòng nhập họ và tên học viên.');
      setFormModalTab('profile');
      return;
    }

    try {
      setSubmitting(true);
      const payload: CreateStudentDTO = {
        ...formData,
        date_of_birth: formData.date_of_birth || undefined,
        paid_at: formData.paid_at || undefined,
        attended_previous_years:
          formData.attended_previous_years !== '' && formData.attended_previous_years !== undefined
            ? Number(formData.attended_previous_years)
            : undefined,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
        handed_over_at: formData.handed_over_at || undefined,
        account_created_at: formData.account_created_at || undefined,
      };

      if (editingStudent) {
        const enrollmentId = editingStudent.enrollments?.[0]?.id;
        if (!enrollmentId) {
          toast.error('Không xác định được gói ghi danh để cập nhật');
          return;
        }
        await studentsApi.update(editingStudent.id, { ...payload, enrollment_id: enrollmentId });
        toast.success('Cập nhật hồ sơ học viên thành công!');
      } else {
        await studentsApi.create(payload);
        toast.success('Thêm mới học viên thành công!');
      }
      setIsModalOpen(false);
      fetchStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Có lỗi xảy ra khi lưu học viên');
    } finally {
      setSubmitting(false);
    }
  };

  const isJlptMode = programFilter === 'JLPT';

  // --- CỘT CHUNG (A ➔ I): CỐ ĐỊNH Ở CẢ 2 TAB ---
  const commonColumnsAtoI: Column<Student>[] = [
    {
      key: 'stt',
      header: '#',
      width: '52px',
      className: 'sticky left-0 z-20 bg-white w-[52px] min-w-[52px] max-w-[52px] text-center',
      cell: (item) => (
        <span className="font-bold text-slate-400 text-xs text-center block">
          {filteredStudents.indexOf(item) + 1}
        </span>
      ),
    },
    {
      key: 'external_id',
      header: 'Mã học viên',
      width: '124px',
      className: 'sticky left-[52px] z-20 bg-white w-[124px] min-w-[124px] max-w-[124px]',
      cell: (item) => (
        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
          {item.external_id || `HV_${item.id}`}
        </span>
      ),
    },
    {
      key: 'full_name',
      header: 'Họ và tên',
      width: '210px',
      className:
        'sticky left-[176px] z-20 bg-white w-[210px] min-w-[210px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)]',
      cell: (item) => (
        <div className="flex items-center space-x-2 whitespace-nowrap">
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
            {item.full_name.charAt(0).toUpperCase()}
          </div>
          <span
            className="font-bold text-slate-900 text-xs hover:text-blue-600 cursor-pointer"
            onClick={() => setViewingStudent(item)}
          >
            {item.full_name}
          </span>
        </div>
      ),
    },
    {
      key: 'program_type',
      header: 'Khóa',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const pType = (enr?.program_type || 'KAIWA').toUpperCase();
        const isJlpt = pType === 'JLPT';
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide whitespace-nowrap border ${
              isJlpt
                ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                : 'bg-teal-100 text-teal-800 border-teal-300'
            }`}
          >
            {isJlpt ? 'JLPT' : 'KAIWA'}
          </span>
        );
      },
    },
    {
      key: 'cs_staff_code',
      header: 'CSKH',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const code = enr?.cs?.staff_code || enr?.cs?.name || '—';
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-mono font-bold text-[11px] whitespace-nowrap">
            {code}
          </span>
        );
      },
    },
    {
      key: 'paid_at',
      header: 'Ngày nộp học phí',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const date = enr?.paid_at || enr?.start_date;
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {date ? new Date(date).toLocaleDateString('vi-VN') : '—'}
          </span>
        );
      },
    },
    {
      key: 'sale_name',
      header: 'Sale phụ trách',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const sale = enr?.sale_name || (enr as any)?.sale?.name || '—';
        return (
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs whitespace-nowrap">
            <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>{sale}</span>
          </div>
        );
      },
    },
    {
      key: 'student_source_status',
      header: 'Trạng thái học viên',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const status = enr?.student_source_status || '—';
        return (
          <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
            {status}
          </span>
        );
      },
    },
    {
      key: 'gender',
      header: 'Giới tính',
      cell: (item) => (
        <span className="text-slate-600 text-xs whitespace-nowrap">
          {item.gender ? GENDER_LABELS[item.gender] || item.gender : '—'}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Số điện thoại',
      cell: (item) => (
        <span className="font-mono text-slate-700 text-xs whitespace-nowrap">
          {item.phone || '—'}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      cell: (item) => (
        <span className="text-slate-600 text-xs max-w-[160px] truncate block" title={item.email || ''}>
          {item.email || '—'}
        </span>
      ),
    },
    {
      key: 'course_content',
      header: isJlptMode ? 'Học phí thực nộp' : 'Nội dung khóa học',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const val = isJlptMode
          ? enr?.program_metadata?.tuition_fee || enr?.course_content || '—'
          : formatCourseContentDisplay(
              enr?.course_content,
              enr?.program_type,
              enr?.package?.name || enr?.package?.code,
              enr?.level
            );
        const displayVal =
          isJlptMode && /^\d+(?:\.\d+)?$/.test(String(val).trim())
            ? `${Number(val).toLocaleString('vi-VN')}đ`
            : String(val);
        return (
          <span className="text-slate-700 text-xs whitespace-nowrap max-w-[180px] truncate block">
            {displayVal}
          </span>
        );
      },
    },
  ];

  // --- CỘT THAO TÁC CUỐI BẢNG ---
  const actionColumn: Column<Student> = {
    key: 'action',
    header: 'Thao tác',
    className: 'text-right sticky right-0 bg-white z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]',
    cell: (item) => (
      <div className="flex justify-end gap-1 whitespace-nowrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setViewingStudent(item);
          }}
          title="Xem toàn bộ thông tin Sheet 1"
        >
          <Eye className="w-4 h-4 text-blue-600" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            openModal(item);
          }}
          title="Chỉnh sửa học viên"
        >
          <Edit className="w-4 h-4 text-slate-500 hover:text-blue-600" />
        </Button>
      </div>
    ),
  };

  // --- TAB 1: CỘT HỌC VIÊN (A ➔ I + J ➔ AJ) ---
  const tab1Columns: Column<Student>[] = [
    ...commonColumnsAtoI,
    {
      key: 'payment_status',
      header: 'Trạng thái thanh toán',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        if (!enr?.payment_status) {
          return <span className="text-slate-400 text-xs">—</span>;
        }
        return (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded whitespace-nowrap">
            {enr.payment_status}
          </span>
        );
      },
    },
    {
      key: 'package_name',
      header: isJlptMode ? 'Mã khóa học' : 'Gói học',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="font-semibold text-slate-800 text-xs whitespace-nowrap">
            {enr?.package?.code || enr?.package?.name || '—'}
          </span>
        );
      },
    },
    {
      key: 'level',
      header: isJlptMode ? 'Gói SP' : 'Trình độ (Kaiwa 1..4)',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="font-mono font-semibold text-slate-700 text-xs whitespace-nowrap">
            {enr?.level || '—'}
          </span>
        );
      },
    },
    {
      key: 'total_sessions',
      header: 'Tổng số buổi',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="font-bold text-slate-800 text-xs text-center block whitespace-nowrap">
            {enr?.total_sessions ?? '—'}
          </span>
        );
      },
    },
    {
      key: 'class_model',
      header: 'Mô hình',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const ec = enr?.enrollment_classes?.[0];
        const mNorm = normalizeClassModel(enr?.class_model || ec?.class?.model_type);
        const mStyle = CLASS_MODEL_BADGE_STYLES[mNorm];
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border whitespace-nowrap ${mStyle.className}`}
          >
            {mStyle.label}
          </span>
        );
      },
    },
    {
      key: 'class_code',
      header: 'Mã lớp',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const ec = enr?.enrollment_classes?.[0];
        const rawCode =
          ec?.class?.class_code ||
          enr?.program_metadata?.latest_class_code ||
          ec?.class?.class_name ||
          '';
        const code = rawCode ? formatClassCode(rawCode, ec?.class?.id) : '—';
        return code !== '—' ? (
          <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs whitespace-nowrap">
            {code}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        );
      },
    },
    {
      key: 'sales_note',
      header: 'Ghi chú sale',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const cleaned = cleanNoteText(enr?.sales_note);
        return (
          <span
            className="text-slate-500 text-xs italic max-w-[150px] truncate block"
            title={cleaned}
          >
            {cleaned || '—'}
          </span>
        );
      },
    },
    {
      key: 'date_of_birth',
      header: 'Ngày sinh',
      cell: (item) => (
        <span className="text-slate-600 text-xs whitespace-nowrap">
          {item.date_of_birth ? new Date(item.date_of_birth).toLocaleDateString('vi-VN') : '—'}
        </span>
      ),
    },
    {
      key: 'occupation',
      header: 'Nghề nghiệp',
      cell: (item) => (
        <span className="text-slate-600 text-xs whitespace-nowrap">
          {item.occupation || '—'}
        </span>
      ),
    },
    {
      key: 'remaining_sessions',
      header: 'Số buổi còn lại',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const ec = enr?.enrollment_classes?.[0];
        if (!enr) return <span className="text-slate-400">—</span>;

        // Tính các buổi đã học năm nay:
        const currentYear = new Date().getFullYear();
        const attendedThisYear =
          ec?.attendance?.filter((a: any) => {
            if (!isAttendedCountable(a)) return false;
            const sessionDate = a.class_session?.session_date
              ? new Date(a.class_session.session_date)
              : null;
            return !sessionDate || sessionDate.getFullYear() === currentYear;
          }).length || 0;

        // Đã học năm trước (ưu tiên giá trị nhập/Excel, nếu không thì tự tính)
        let attendedPrev = 0;
        if (enr.attended_previous_years !== undefined && enr.attended_previous_years !== null) {
          attendedPrev = Number(enr.attended_previous_years);
        } else {
          const attendedInPastYears =
            ec?.attendance?.filter((a: any) => {
              if (!isAttendedCountable(a)) return false;
              const sessionDate = a.class_session?.session_date
                ? new Date(a.class_session.session_date)
                : null;
              return sessionDate && sessionDate.getFullYear() < currentYear;
            }).length || 0;

          if (attendedInPastYears > 0) {
            attendedPrev = attendedInPastYears;
          } else if (
            enr.total_sessions &&
            enr.external_remaining_sessions !== undefined &&
            enr.external_remaining_sessions !== null
          ) {
            attendedPrev = Math.max(
              0,
              enr.total_sessions - Number(enr.external_remaining_sessions) - attendedThisYear,
            );
          }
        }

        // Số buổi còn lại thực tế
        let rem: number;
        if (enr.total_sessions) {
          rem = enr.total_sessions - attendedPrev - attendedThisYear;
        } else if (
          enr.external_remaining_sessions !== null &&
          enr.external_remaining_sessions !== undefined
        ) {
          rem = Number(enr.external_remaining_sessions) - attendedThisYear;
        } else {
          return <span className="text-slate-400">—</span>;
        }

        const isDebt = rem < 0;

        return (
          <div
            className="flex items-center gap-1 whitespace-nowrap"
            title={`Tổng buổi: ${enr.total_sessions || 0} - Đã học năm trước: ${attendedPrev} - Đã học năm nay: ${attendedThisYear} = Còn lại: ${rem}`}
          >
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                isDebt
                  ? 'bg-red-100 text-red-800 border-red-300 font-extrabold shadow-xs animate-pulse'
                  : rem <= 3
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {isDebt && <AlertTriangle className="w-3 h-3 mr-1 text-red-600" />}
              {rem} buổi
            </span>
          </div>
        );
      },
    },
    {
      key: 'start_date',
      header: 'Ngày bắt đầu học',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {enr?.start_date ? new Date(enr.start_date).toLocaleDateString('vi-VN') : '—'}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const ec = enr?.enrollment_classes?.[0];
        const hasAssignedClass = Boolean(
          ec?.class?.id ||
            ec?.class?.class_code ||
            ec?.class?.class_name ||
            enr?.program_metadata?.latest_class_code
        );
        const status = resolveEffectiveEnrollmentStatus(
          enr?.status,
          hasAssignedClass,
          `${enr?.class_model || ''} ${enr?.level || ''}`
        );
        const conf = ENROLLMENT_STATUS_LABELS[status] || ENROLLMENT_STATUS_LABELS.STUDYING;
        return <Badge variant={conf.variant}>{conf.label}</Badge>;
      },
    },
    {
      key: 'end_date',
      header: isJlptMode ? 'Ngày KG dự kiến' : 'Ngày bảo lưu/kết thúc',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const displayDate = isJlptMode
          ? enr?.program_metadata?.expected_start_date ||
            (enr?.handed_over_at ? new Date(enr.handed_over_at).toLocaleDateString('vi-VN') : null) ||
            (enr?.end_date ? new Date(enr.end_date).toLocaleDateString('vi-VN') : null)
          : enr?.end_date
          ? new Date(enr.end_date).toLocaleDateString('vi-VN')
          : null;
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {displayDate || '—'}
          </span>
        );
      },
    },
    {
      key: 'start_time',
      header: 'Giờ học',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const schedules = ec?.class?.class_schedules || [];
        const times = schedules
          .map((s) => formatScheduleTimeDisplay(s.start_time))
          .filter(Boolean);
        const displayTime = times.length > 0 ? times.join(', ') : '—';
        return (
          <span className="font-mono text-slate-700 text-xs whitespace-nowrap">
            {displayTime}
          </span>
        );
      },
    },
    {
      key: 'schedule_pattern',
      header: 'Lịch học',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const schedules = ec?.class?.class_schedules || [];
        const patterns = schedules.map((s) => s.schedule_pattern).filter(Boolean);
        const displayPattern = patterns.length > 0 ? patterns.join(', ') : '—';
        return (
          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs whitespace-nowrap">
            {displayPattern}
          </span>
        );
      },
    },
    {
      key: 'duration_minutes',
      header: 'Thời lượng',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const schedules = ec?.class?.class_schedules || [];
        const durations = schedules
          .map((s) => (s.duration_minutes ? `${s.duration_minutes}p` : null))
          .filter(Boolean);
        const displayDuration =
          durations.length > 0 ? Array.from(new Set(durations)).join(', ') : '—';
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {displayDuration}
          </span>
        );
      },
    },
    {
      key: 'teacher_name',
      header: 'Giáo viên',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const teacher = ec?.class?.class_teachers?.[0]?.teacher;
        return (
          <span className="font-semibold text-slate-800 text-xs whitespace-nowrap">
            {teacher?.name || '—'}
          </span>
        );
      },
    },
    {
      key: 'teacher_code',
      header: 'Mã giáo viên',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const teacher = ec?.class?.class_teachers?.[0]?.teacher;
        const teacherCode =
          (teacher as any)?.code ||
          (teacher as any)?.teacher_profile?.teacher_code ||
          (teacher as any)?.teacher_code ||
          '—';
        return <span className="text-slate-500 font-mono text-xs whitespace-nowrap">{teacherCode}</span>;
      },
    },
    {
      key: 'class_name',
      header: 'Tên lớp',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const cleaned = cleanClassIdentifier(ec?.class?.class_name) || ec?.class?.class_name || '—';
        return (
          <span
            className="font-semibold text-slate-800 text-xs whitespace-nowrap max-w-[150px] truncate block"
            title={cleaned}
          >
            {cleaned}
          </span>
        );
      },
    },
    {
      key: 'attended_prev',
      header: 'Đã học năm trước',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const ec = enr?.enrollment_classes?.[0];

        // 1. Nếu có giá trị lưu từ Excel hoặc người dùng nhập
        if (enr?.attended_previous_years !== undefined && enr?.attended_previous_years !== null) {
          return (
            <span className="font-semibold text-slate-700 text-xs text-center block whitespace-nowrap">
              {enr.attended_previous_years} buổi
            </span>
          );
        }

        // 2. Tự tính: Đếm các buổi ATTENDED có session_date trước năm hiện tại
        const currentYear = new Date().getFullYear();
        const attendedInPastYears =
          ec?.attendance?.filter((a: any) => {
            if (!isAttendedCountable(a)) return false;
            const sessionDate = a.class_session?.session_date
              ? new Date(a.class_session.session_date)
              : null;
            return sessionDate && sessionDate.getFullYear() < currentYear;
          }).length || 0;

        if (attendedInPastYears > 0) {
          return (
            <span className="font-semibold text-slate-700 text-xs text-center block whitespace-nowrap">
              {attendedInPastYears} buổi
            </span>
          );
        }

        // 3. Fallback: Nếu là học viên cũ import không có log chi tiết:
        // Đã học năm trước = max(0, Tổng buổi - Còn lại ban đầu - Đã học năm nay)
        const attendedThisYear =
          ec?.attendance?.filter((a: any) => {
            if (!isAttendedCountable(a)) return false;
            const sessionDate = a.class_session?.session_date
              ? new Date(a.class_session.session_date)
              : null;
            return !sessionDate || sessionDate.getFullYear() === currentYear;
          }).length || 0;

        if (
          enr?.total_sessions &&
          enr?.external_remaining_sessions !== undefined &&
          enr?.external_remaining_sessions !== null
        ) {
          const calculatedPrev = Math.max(
            0,
            enr.total_sessions - Number(enr.external_remaining_sessions) - attendedThisYear,
          );
          if (calculatedPrev > 0) {
            return (
              <span
                className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs text-center block whitespace-nowrap"
                title="Tự động tính: Tổng số buổi - Số buổi còn lại ban đầu - Đã học năm nay"
              >
                {calculatedPrev} buổi
              </span>
            );
          }
        }

        return <span className="text-slate-400 text-xs text-center block whitespace-nowrap">0</span>;
      },
    },
    {
      key: 'attended_this_year',
      header: 'Đã học 2026',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const currentYear = new Date().getFullYear();
        const attendedCount =
          ec?.attendance?.filter((a: any) => {
            if (!isAttendedCountable(a)) return false;
            const sessionDate = a.class_session?.session_date
              ? new Date(a.class_session.session_date)
              : null;
            return !sessionDate || sessionDate.getFullYear() === currentYear;
          }).length || 0;
        return (
          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs text-center block whitespace-nowrap">
            {attendedCount} buổi
          </span>
        );
      },
    },
    actionColumn,
  ];

  // --- TAB 2: CỘT BÁO CÁO HỌC TẬP & CHĂM SÓC ---
  const tab2Columns: Column<Student>[] = [
    ...commonColumnsAtoI,
    {
      key: 'study_report_url',
      header: 'Báo cáo học tập',
      cell: (item: Student) => (
        <div className="flex items-center justify-center whitespace-nowrap">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/students/${item.id}/study-report`);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary bg-primary-soft border border-primary/30 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            title={`Mở Báo cáo học tập của ${item.full_name}`}
          >
            <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>Mở báo cáo</span>
          </button>
        </div>
      ),
    },
    {
      key: 'exchange_info',
      header: 'Trao đổi với học viên',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        if (!enr) return <span className="text-slate-400">—</span>;
        return (
          <InlineEditableCell
            value={enr.exchange_info}
            multiline
            placeholder="Ghi chú trao đổi..."
            onSave={(newVal) => handleSaveEnrollmentCareField(enr.id, 'exchange_info', newVal)}
          />
        );
      },
    },
    {
      key: 'callback_note',
      header: 'Lịch hẹn gọi',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        if (!enr) return <span className="text-slate-400">—</span>;
        return (
          <div className="flex items-center gap-1">
            <PhoneCall className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <InlineEditableCell
              value={enr.callback_note}
              placeholder="Hẹn ngày/giờ gọi..."
              onSave={(newVal) => handleSaveEnrollmentCareField(enr.id, 'callback_note', newVal)}
            />
          </div>
        );
      },
    },
    {
      key: 'hot_issue_note',
      header: 'Điểm nóng',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        if (!enr) return <span className="text-slate-400">—</span>;
        return (
          <div className="flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <InlineEditableCell
              value={enr.hot_issue_note}
              isUrgent={!!enr.hot_issue_note}
              placeholder="Vấn đề khẩn cấp..."
              onSave={(newVal) => handleSaveEnrollmentCareField(enr.id, 'hot_issue_note', newVal)}
            />
          </div>
        );
      },
    },

    // --- DYNAMIC CARE SESSION COLUMNS (AO ➔ BC: Buổi 1, Buổi N...) ---
    ...activeMilestones.map((sessionNum) => {
      const label =
        programFilter === 'JLPT'
          ? sessionNum === 40
            ? 'Cuối khóa (B40)'
            : `Sau buổi ${sessionNum}`
          : programFilter === 'KAIWA' && sessionNum === 27
          ? 'Buổi 27-29'
          : `Nội dung CS sau buổi ${sessionNum}`;

      return {
        header: (
          <div
            key={`head-sess-${sessionNum}`}
            className="flex items-center gap-1 text-slate-800 whitespace-nowrap"
          >
            <MessageSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>{label}</span>
          </div>
        ),
        cell: (item: Student) => {
          const enr = item.enrollments?.[0];
          if (!enr) return <span className="text-slate-400">—</span>;
          const log = enr.care_logs?.find((cl) => cl.after_session_number === sessionNum);
          return (
            <CareSelectCell
              value={log?.content}
              placeholder="Chọn phản hồi..."
              onSave={(newVal) => handleSaveSessionCareLog(enr.id, sessionNum, newVal)}
            />
          );
        },
      };
    }),

    // --- CÁC CỘT ĐẶC THÙ CỦA KHÓA JLPT (Đọc/Ghi trực tiếp program_metadata) ---
    ...(programFilter === 'JLPT'
      ? [
          {
            key: 'satisfaction_score_b18',
            header: 'Điểm hài lòng (B18)',
            cell: (item: Student) => {
              const enr = item.enrollments?.[0];
              if (!enr) return <span className="text-slate-400">—</span>;
              return (
                <InlineEditableCell
                  value={enr.program_metadata?.satisfaction_score_b18 || ''}
                  placeholder="Điểm B18..."
                  onSave={(newVal) =>
                    handleSaveProgramMetadata(item, { satisfaction_score_b18: newVal })
                  }
                />
              );
            },
          },
          {
            key: 'exam_registration',
            header: 'ĐK Thi',
            cell: (item: Student) => {
              const enr = item.enrollments?.[0];
              if (!enr) return <span className="text-slate-400">—</span>;
              return (
                <InlineEditableCell
                  value={enr.program_metadata?.exam_registration || ''}
                  placeholder="VD: T7.2026"
                  onSave={(newVal) =>
                    handleSaveProgramMetadata(item, { exam_registration: newVal })
                  }
                />
              );
            },
          },
          {
            key: 'exam_score',
            header: 'Điểm thi thật',
            cell: (item: Student) => {
              const enr = item.enrollments?.[0];
              if (!enr) return <span className="text-slate-400">—</span>;
              const rawVal = enr.program_metadata?.exam_score;
              return (
                <InlineEditableCell
                  value={rawVal !== undefined && rawVal !== null ? String(rawVal) : ''}
                  placeholder="Điểm thi..."
                  onSave={(newVal) => handleSaveProgramMetadata(item, { exam_score: newVal })}
                />
              );
            },
          },
          {
            key: 'exam_result',
            header: 'Tình trạng thi',
            cell: (item: Student) => {
              const enr = item.enrollments?.[0];
              if (!enr) return <span className="text-slate-400">—</span>;
              return (
                <InlineEditableCell
                  value={enr.program_metadata?.exam_result || ''}
                  placeholder="pass / not pass..."
                  onSave={(newVal) => handleSaveProgramMetadata(item, { exam_result: newVal })}
                />
              );
            },
          },
          {
            key: 'test_scores_summary',
            header: 'Kiểm tra (L1–L7)',
            cell: (item: Student) => {
              const enr = item.enrollments?.[0];
              if (!enr) return <span className="text-slate-400">—</span>;
              const scoresObj = enr.program_metadata?.test_scores || {};
              const summaryStr = Object.entries(scoresObj)
                .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
                .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
                .join(' | ');
              return (
                <InlineEditableCell
                  value={summaryStr}
                  placeholder="L1: 80 | L2: 85..."
                  onSave={async (newVal) => {
                    const parsed: Record<string, string> = {
                      ...(enr.program_metadata?.test_scores as Record<string, string> | undefined),
                    };
                    newVal.split('|').forEach((part) => {
                      const [k, ...rest] = part.split(':');
                      if (k && rest.length > 0) {
                        parsed[k.trim().toLowerCase()] = rest.join(':').trim();
                      }
                    });
                    if (!newVal.includes(':') && newVal.trim()) {
                      parsed.l1 = newVal.trim();
                    }
                    await handleSaveProgramMetadata(item, { test_scores: parsed });
                  }}
                />
              );
            },
          },
          {
            key: 'special_support',
            header: 'HT Đặc biệt (L1–L3)',
            cell: (item: Student) => {
              const enr = item.enrollments?.[0];
              if (!enr) return <span className="text-slate-400">—</span>;
              const supObj = enr.program_metadata?.special_support || {};
              const summaryStr = Object.entries(supObj)
                .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
                .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
                .join(' | ');
              return (
                <InlineEditableCell
                  value={summaryStr}
                  multiline
                  placeholder="L1: Hỗ trợ..."
                  onSave={async (newVal) => {
                    const parsed: Record<string, string | null> = {
                      ...(enr.program_metadata?.special_support || {}),
                    };
                    if (newVal.includes(':')) {
                      newVal.split('|').forEach((part) => {
                        const [k, ...rest] = part.split(':');
                        if (k && rest.length > 0) {
                          parsed[k.trim().toLowerCase()] = rest.join(':').trim();
                        }
                      });
                    } else {
                      parsed.l1 = newVal.trim();
                    }
                    await handleSaveProgramMetadata(item, { special_support: parsed });
                  }}
                />
              );
            },
          },
          {
            key: 'renewal_note',
            header: 'Tái tục',
            cell: (item: Student) => {
              const enr = item.enrollments?.[0];
              if (!enr) return <span className="text-slate-400">—</span>;
              return (
                <InlineEditableCell
                  value={enr.program_metadata?.renewal_note || ''}
                  placeholder="Ghi chú tái tục..."
                  onSave={(newVal) => handleSaveProgramMetadata(item, { renewal_note: newVal })}
                />
              );
            },
          },
        ]
      : []),

    // --- CÁC CỘT CUỐI (BD ➔ BH) ---
    {
      key: 'post_course_care',
      header: 'Chăm sóc sau kết thúc',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        if (!enr) return <span className="text-slate-400">—</span>;
        return (
          <InlineEditableCell
            value={enr.post_course_care}
            multiline
            placeholder="Đánh giá/tái tục sau khóa..."
            onSave={(newVal) => handleSaveEnrollmentCareField(enr.id, 'post_course_care', newVal)}
          />
        );
      },
    },
    {
      key: 'end_date',
      header: 'Ngày kết thúc',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {enr?.end_date ? new Date(enr.end_date).toLocaleDateString('vi-VN') : '—'}
          </span>
        );
      },
    },
    {
      key: 'handed_over_at',
      header: 'Ngày bàn giao',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {enr?.handed_over_at ? new Date(enr.handed_over_at).toLocaleDateString('vi-VN') : '—'}
          </span>
        );
      },
    },
    {
      key: 'paid_month',
      header: 'Tháng nộp học phí',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const date = enr?.paid_at || enr?.start_date;
        if (!date) return <span className="text-slate-400">—</span>;
        const d = new Date(date);
        return (
          <span className="text-slate-700 font-semibold text-xs whitespace-nowrap">
            Tháng {d.getMonth() + 1}/{d.getFullYear()}
          </span>
        );
      },
    },
    {
      key: 'account_created_at',
      header: 'Ngày tạo tài khoản',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {enr?.account_created_at
              ? new Date(enr.account_created_at).toLocaleDateString('vi-VN')
              : '—'}
          </span>
        );
      },
    },
    actionColumn,
  ];

  return (
    <PageContainer>
      {/* Page Header */}
      <PageHeader
        title="Danh sách học viên"
        actions={
          <div className="flex items-center gap-2">
            {activeTab === 'care_reports' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddMilestoneModalOpen(true)}
                leftIcon={<PlusCircle className="w-4 h-4 text-emerald-600" />}
                className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              >
                Thêm mốc buổi CS
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => openModal()}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Thêm học viên mới
            </Button>
          </div>
        }
      />

      <HorizontalTabs
        ariaLabel="Nội dung danh sách học viên"
        value={activeTab}
        onChange={setActiveTab}
        className="mb-4"
        items={[
          {
            value: 'students',
            label: 'Hồ sơ học viên',
            icon: <Users />,
            badge: `${filteredStudents.length} HV`,
          },
          {
            value: 'care_reports',
            label: 'Báo cáo học tập & chăm sóc',
            icon: <FileText />,
          },
        ]}
      />

      {/* Unified FilterBar */}
      <FilterBar
        title="Tìm kiếm & Lọc học viên"
        activeCount={activeFiltersCount}
        onClear={handleResetFilters}
        gridClassName={`grid grid-cols-1 sm:grid-cols-2 ${
          isAdminOrManage ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-3 xl:grid-cols-5'
        } gap-3.5 items-end`}
      >
        {/* 1. Tìm kiếm */}
        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Tìm kiếm
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Mã HV, Họ tên, SĐT, Email, Lớp học..."
              className="w-full h-9 pl-9 pr-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        {/* 2. Chương trình */}
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
            <option value="KAIWA">Giao tiếp (Kaiwa) ({programCounts.kaiwa})</option>
            <option value="JLPT">Luyện thi (JLPT) ({programCounts.jlpt})</option>
          </select>
        </div>

        {/* 3. Trạng thái học */}
        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Trạng thái học
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

        {/* 4. Mô hình lớp */}
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

        {/* 5. Tình trạng học phí */}
        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Tình trạng học phí
          </label>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
          >
            <option value="">Tất cả học phí</option>
            <option value="PAID">Đã đóng đủ</option>
            <option value="DEBT">Còn nợ phí</option>
            <option value="UNSET">Chưa cập nhật</option>
          </select>
        </div>

        {/* 6. CSKH phụ trách (CHỈ hiển thị khi ADMIN / MANAGE, ẩn hoàn toàn khi CS) */}
        {isAdminOrManage && (
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              CSKH phụ trách
            </label>
            <select
              value={csFilter}
              onChange={(e) => setCsFilter(e.target.value)}
              className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
            >
              <option value="">Tất cả CSKH phụ trách</option>
              <option value="UNASSIGNED">Chưa phân công CSKH</option>
              {csOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </FilterBar>

      {/* Thanh trạng thái hiển thị & tùy chọn cột */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-text-secondary inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 shadow-2xs">
          <span>Hiển thị:</span>
          <strong className="text-primary font-extrabold">{filteredStudents.length}</strong>
          <span className="text-text-muted">/ {allRows.length} học viên</span>
        </div>
        <ColumnVisibilityDropdown
          scope={activeTab === 'students' ? 'students.tab1' : 'students.tab2'}
        />
      </div>

      {/* Main Table View */}
      <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
        <DataTable
          data={filteredStudents}
          columns={(activeTab === 'students' ? tab1Columns : tab2Columns).filter(keepColumn)}
          isLoading={loading}
          emptyMessage="Không tìm thấy học viên nào phù hợp với điều kiện lọc."
        />
      </div>

      {/* Modal Thêm Mốc Buổi Chăm Sóc */}
      {isAddMilestoneModalOpen && (
        <Modal
          isOpen={isAddMilestoneModalOpen}
          onClose={() => setIsAddMilestoneModalOpen(false)}
          title="Thêm Cột Mốc Buổi Chăm Sóc Mới"
        >
          <div className="space-y-4 text-xs">
            <p className="text-text-secondary">
              Nhập số thứ tự buổi học bạn muốn bổ sung vào bảng chăm sóc (ví dụ: <strong>3</strong>, <strong>5</strong>, <strong>10</strong>, <strong>15</strong>...). Cột này sẽ được lưu chung trên hệ thống để toàn bộ CSKH/Admin cùng thấy.
            </p>

            <div>
              <label className="block font-bold text-slate-800 mb-1">
                Số thứ tự buổi học (Số nguyên dương):
              </label>
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="Ví dụ: 3, 5, 10..."
                value={newMilestoneInput}
                onChange={(e) => setNewMilestoneInput(e.target.value ? parseInt(e.target.value, 10) : '')}
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <span className="text-slate-500">Mốc đang có:</span>
              <div className="flex flex-wrap gap-1">
                {activeMilestones.map((m) => (
                  <span
                    key={m}
                    className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold text-[11px]"
                  >
                    Buổi {m}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddMilestoneModalOpen(false)}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddMilestone}
                isLoading={addingMilestone}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Thêm cột vào bảng
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* View Detail Modal (Full Sheet 1 Detail) */}
      {viewingStudent && (
        <Modal
          isOpen={!!viewingStudent}
          onClose={() => setViewingStudent(null)}
          title={`Hồ sơ chi tiết Sheet 1 — ${viewingStudent.full_name}`}
        >
          <div className="space-y-5 text-xs text-slate-700">
            {/* Section 1: Personal info */}
            <div>
              <h4 className="font-bold text-slate-900 text-sm mb-2.5 flex items-center gap-2 border-b border-slate-100 pb-1.5">
                <UserCheck className="w-4 h-4 text-blue-600" />
                1. Thông tin cá nhân & Liên hệ
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                <div>
                  <span className="text-slate-500 block">Mã học viên:</span>
                  <strong className="text-slate-900 font-mono">
                    {viewingStudent.external_id || `HV_${viewingStudent.id}`}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Họ và tên:</span>
                  <strong className="text-slate-900">{viewingStudent.full_name}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Giới tính:</span>
                  <strong className="text-slate-900">
                    {viewingStudent.gender ? GENDER_LABELS[viewingStudent.gender] || viewingStudent.gender : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Số điện thoại:</span>
                  <strong className="text-slate-900 font-mono">{viewingStudent.phone || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Email:</span>
                  <strong className="text-slate-900">{viewingStudent.email || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Ngày sinh:</span>
                  <strong className="text-slate-900">
                    {viewingStudent.date_of_birth
                      ? new Date(viewingStudent.date_of_birth).toLocaleDateString('vi-VN')
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Nghề nghiệp:</span>
                  <strong className="text-slate-900">{viewingStudent.occupation || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Trường học:</span>
                  <strong className="text-slate-900">{viewingStudent.school || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Phụ huynh:</span>
                  <strong className="text-slate-900">
                    {viewingStudent.parent_name || '—'}{' '}
                    {viewingStudent.parent_phone ? `(${viewingStudent.parent_phone})` : ''}
                  </strong>
                </div>
              </div>
            </div>

            {/* Section 2: Enrollment Info */}
            {viewingStudent.enrollments?.[0] && (
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2.5 flex items-center gap-2 border-b border-slate-100 pb-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  2. Khóa học & Lịch học
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                  <div>
                    <span className="text-slate-500 block">Gói học:</span>
                    <strong className="text-slate-900">
                      {viewingStudent.enrollments[0].package?.name || '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Trình độ:</span>
                    <strong className="text-slate-900 font-mono">
                      {viewingStudent.enrollments[0].level || 'N5'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Sale phụ trách:</span>
                    <strong className="text-slate-900">
                      {viewingStudent.enrollments[0].sale_name ||
                        viewingStudent.enrollments[0].sale?.name ||
                        viewingStudent.enrollments[0].cs?.name ||
                        '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Tổng số buổi:</span>
                    <strong className="text-slate-900">
                      {viewingStudent.enrollments[0].total_sessions} buổi
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Số buổi còn lại:</span>
                    <strong
                      className={`font-bold ${
                        (viewingStudent.enrollments[0].external_remaining_sessions || 0) < 0
                          ? 'text-red-600'
                          : 'text-emerald-700'
                      }`}
                    >
                      {viewingStudent.enrollments[0].external_remaining_sessions ?? '—'} buổi
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Trạng thái:</span>
                    <Badge
                      variant={
                        ENROLLMENT_STATUS_LABELS[viewingStudent.enrollments[0].status]?.variant ||
                        'neutral'
                      }
                    >
                      {ENROLLMENT_STATUS_LABELS[viewingStudent.enrollments[0].status]?.label ||
                        viewingStudent.enrollments[0].status}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Care & Reports Info */}
            {viewingStudent.enrollments?.[0] && (
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2.5 flex items-center gap-2 border-b border-slate-100 pb-1.5">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  3. Báo cáo học tập & Thông tin chăm sóc
                </h4>
                <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-500 block mb-0.5">Link Báo cáo học tập:</span>
                      {viewingStudent.enrollments[0].study_report_url ? (
                        <a
                          href={
                            viewingStudent.enrollments[0].study_report_url.startsWith('http')
                              ? viewingStudent.enrollments[0].study_report_url
                              : `https://${viewingStudent.enrollments[0].study_report_url}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 font-bold inline-flex items-center gap-1 hover:underline"
                        >
                          <span>Mở Google Docs/Sheets</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-slate-400">Chưa có link</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Lịch hẹn gọi:</span>
                      <strong className="text-slate-900">
                        {viewingStudent.enrollments[0].callback_note || '—'}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Thông tin trao đổi với HV:</span>
                    <p className="bg-white p-2 rounded-lg border border-slate-200 text-slate-800">
                      {viewingStudent.enrollments[0].exchange_info || 'Chưa có thông tin trao đổi'}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Điểm nóng (Vấn đề cần lưu ý):</span>
                    <p
                      className={`p-2 rounded-lg border text-slate-800 ${
                        viewingStudent.enrollments[0].hot_issue_note
                          ? 'bg-rose-50 border-rose-200 text-rose-900 font-medium'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      {viewingStudent.enrollments[0].hot_issue_note || 'Không có điểm nóng'}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Chăm sóc sau kết thúc:</span>
                    <p className="bg-white p-2 rounded-lg border border-slate-200 text-slate-800">
                      {viewingStudent.enrollments[0].post_course_care || 'Chưa có thông tin sau kết thúc'}
                    </p>
                  </div>

                  {/* Care Logs List */}
                  {viewingStudent.enrollments[0].care_logs &&
                    viewingStudent.enrollments[0].care_logs.length > 0 && (
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-slate-700 font-bold block mb-1.5">
                          Nhật ký chăm sóc sau các buổi:
                        </span>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {viewingStudent.enrollments[0].care_logs.map((cl) => (
                            <div
                              key={cl.id}
                              className="bg-emerald-50/70 border border-emerald-200/80 p-2 rounded-lg text-slate-800 flex items-start gap-2"
                            >
                              <Badge variant="success" size="sm">
                                Buổi {cl.after_session_number}
                              </Badge>
                              <span className="flex-1">{cl.content}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Edit / Create Student Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          size="2xl"
          title={
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                {editingStudent ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {editingStudent ? `Chỉnh sửa hồ sơ: ${editingStudent.full_name}` : 'Thêm mới học viên'}
                </h3>
                <p className="text-xs text-slate-500 font-normal">
                  Điền đầy đủ thông tin hồ sơ, tài chính, lớp học và ghi chú chăm sóc theo chuẩn Sheet 1
                </p>
              </div>
            </div>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <HorizontalTabs
              ariaLabel="Nhóm thông tin học viên"
              value={formModalTab}
              onChange={setFormModalTab}
              size="sm"
              items={[
                { value: 'profile', label: 'Hồ sơ & liên hệ', icon: <Users /> },
                { value: 'course', label: 'Khóa học & tài chính', icon: <BookOpen /> },
                { value: 'class', label: 'Lớp học & lịch học', icon: <Calendar /> },
                { value: 'care', label: 'Báo cáo & CSKH', icon: <MessageSquare /> },
              ]}
            />

            {/* TAB 1: HỒ SƠ & LIÊN HỆ */}
            {formModalTab === 'profile' && (
              <div className="space-y-4 pt-1 animate-fadeIn text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Mã học viên (ID Sheet 1)
                    </label>
                    <Input
                      placeholder="Ví dụ: 420274574 hoặc HV_001"
                      value={formData.external_id || ''}
                      onChange={(e) => setFormData({ ...formData, external_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Họ và tên <span className="text-red-500">*</span>
                    </label>
                    <Input
                      placeholder="Nguyễn Văn A"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Giới tính</label>
                    <select
                      value={formData.gender || 'OTHER'}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="MALE">Nam</option>
                      <option value="FEMALE">Nữ</option>
                      <option value="OTHER">Khác</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Ngày sinh (DOB)</label>
                    <Input
                      type="date"
                      value={formData.date_of_birth || ''}
                      onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Số điện thoại</label>
                    <Input
                      placeholder="0987654321"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Email</label>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Zalo UID / SĐT Zalo</label>
                    <Input
                      placeholder="Số điện thoại hoặc UID Zalo"
                      value={formData.zalo_uid || ''}
                      onChange={(e) => setFormData({ ...formData, zalo_uid: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">LINE UID / ID LINE</label>
                    <Input
                      placeholder="LINE UID (U...) hoặc SĐT LINE"
                      value={formData.line_uid || ''}
                      onChange={(e) => setFormData({ ...formData, line_uid: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nghề nghiệp</label>
                    <Input
                      placeholder="Ví dụ: Kỹ sư, Sinh viên..."
                      value={formData.occupation || ''}
                      onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Trường học</label>
                    <Input
                      placeholder="Tên trường học"
                      value={formData.school || ''}
                      onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Họ tên Phụ huynh</label>
                    <Input
                      placeholder="Họ tên cha hoặc mẹ"
                      value={formData.parent_name || ''}
                      onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">SĐT Phụ huynh</label>
                    <Input
                      placeholder="Số điện thoại phụ huynh"
                      value={formData.parent_phone || ''}
                      onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Ghi chú cá nhân</label>
                  <textarea
                    rows={2}
                    placeholder="Ghi chú thêm về học viên..."
                    value={formData.note || ''}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: KHÓA HỌC & TÀI CHÍNH */}
            {formModalTab === 'course' && (
              <div className="space-y-4 pt-1 animate-fadeIn text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Nội dung khóa học
                    </label>
                    <Input
                      placeholder="Ví dụ: Tiếng Nhật Kaiwa, Luyện thi JLPT N5..."
                      value={formData.course_content || ''}
                      onChange={(e) => setFormData({ ...formData, course_content: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Trình độ</label>
                    <select
                      value={formData.level || 'N5'}
                      onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="N5">N5 (Sơ cấp 1)</option>
                      <option value="N4">N4 (Sơ cấp 2)</option>
                      <option value="N3">N3 (Trung cấp)</option>
                      <option value="N2">N2 (Trung - Cao cấp)</option>
                      <option value="N1">N1 (Cao cấp)</option>
                      <option value="Kaiwa">Giao tiếp Kaiwa</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Sale phụ trách</label>
                    <Input
                      placeholder="Tên hoặc Email nhân viên Sale/CSKH"
                      value={formData.sale_name || ''}
                      onChange={(e) => setFormData({ ...formData, sale_name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Trạng thái học viên
                    </label>
                    <Input
                      placeholder="Ví dụ: Học viên chuẩn, Học thử, Tiềm năng..."
                      value={formData.student_source_status || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, student_source_status: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Ngày nộp học phí
                    </label>
                    <Input
                      type="date"
                      value={formData.paid_at || ''}
                      onChange={(e) => setFormData({ ...formData, paid_at: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Trạng thái thanh toán
                    </label>
                    <select
                      value={formData.payment_status || 'Đã đóng đủ'}
                      onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="Đã đóng đủ">Đã đóng đủ</option>
                      <option value="Đóng 1 phần">Đóng 1 phần</option>
                      <option value="Chưa đóng">Chưa đóng</option>
                      <option value="Nợ học phí">Nợ học phí</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tổng số buổi</label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="30"
                      value={formData.total_sessions || ''}
                      onChange={(e) => setFormData({ ...formData, total_sessions: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Số buổi còn lại
                    </label>
                    <Input
                      type="number"
                      placeholder="30 (hoặc âm nợ)"
                      value={formData.external_remaining_sessions ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, external_remaining_sessions: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Đã học năm trước
                    </label>
                    <Input
                      type="number"
                      placeholder="Ví dụ: 35"
                      value={formData.attended_previous_years ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, attended_previous_years: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Mô hình lớp</label>
                    <select
                      value={formData.class_model || 'Nhóm'}
                      onChange={(e) => setFormData({ ...formData, class_model: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="Nhóm">Nhóm</option>
                      <option value="1:1">1:1 (Kèm 1-1)</option>
                      <option value="1:2">1:2</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Ghi chú sale</label>
                  <textarea
                    rows={2}
                    placeholder="Ghi chú từ bộ phận Sale về học viên này..."
                    value={formData.sales_note || ''}
                    onChange={(e) => setFormData({ ...formData, sales_note: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            {/* TAB 3: LỚP HỌC & LỊCH HỌC */}
            {formModalTab === 'class' && (
              <div className="space-y-4 pt-1 animate-fadeIn text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tên lớp học</label>
                    <Input
                      placeholder="Ví dụ: Lớp N5 - K01 (246 Sáng)"
                      value={formData.class_name || ''}
                      onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Mã giáo viên
                    </label>
                    <Input
                      list="teacher-codes-datalist"
                      placeholder="Ví dụ: GV01, GV_TANAKA"
                      value={formData.teacher_code || ''}
                      onChange={(e) => {
                        const codeVal = e.target.value;
                        const matched = teachersList.find(
                          (t) => t.code?.toLowerCase() === codeVal.trim().toLowerCase()
                        );
                        setFormData((prev) => ({
                          ...prev,
                          teacher_code: codeVal,
                          ...(matched ? { teacher_name: matched.name } : {}),
                        }));
                      }}
                    />
                    <datalist id="teacher-codes-datalist">
                      {teachersList.map((t) => (
                        <option key={t.id} value={t.code}>
                          {t.name}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Giáo viên phụ trách
                    </label>
                    <Input
                      list="teacher-names-datalist"
                      placeholder="Ví dụ: Sensei Tanaka Kenji"
                      value={formData.teacher_name || ''}
                      onChange={(e) => {
                        const nameVal = e.target.value;
                        const matched = teachersList.find(
                          (t) => t.name?.toLowerCase() === nameVal.trim().toLowerCase()
                        );
                        setFormData((prev) => ({
                          ...prev,
                          teacher_name: nameVal,
                          ...(matched ? { teacher_code: matched.code } : {}),
                        }));
                      }}
                    />
                    <datalist id="teacher-names-datalist">
                      {teachersList.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.code ? `[${t.code}]` : ''}
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Ngày bắt đầu học
                    </label>
                    <Input
                      type="date"
                      value={formData.start_date || ''}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Ngày kết thúc / bảo lưu
                    </label>
                    <Input
                      type="date"
                      value={formData.end_date || ''}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Trạng thái gói</label>
                    <select
                      value={formData.status || 'STUDYING'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="WAITING_CLASS">Chờ lớp (WAITING_CLASS)</option>
                      <option value="STUDYING">Đang học (STUDYING)</option>
                      <option value="PAUSED">Bảo lưu (PAUSED)</option>
                      <option value="FINISHED">Kết thúc (FINISHED)</option>
                      <option value="UPCOMING">Sắp học (UPCOMING)</option>
                      <option value="NOT_STARTED">Chưa học (NOT_STARTED)</option>
                      <option value="CANCELLED">Đã hủy (CANCELLED)</option>
                    </select>
                  </div>
                </div>

                {/* 3 Cột chuẩn hóa: Giờ học, Lịch học, Thời lượng */}
                <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200/80">
                  <h5 className="font-bold text-blue-900 mb-2.5 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Khung thời gian & Lịch học trong tuần</span>
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Giờ học</label>
                      <Input
                        placeholder="Ví dụ: 20h00, 19h30..."
                        value={formData.start_time || ''}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Lịch học (Thứ)
                      </label>
                      <Input
                        placeholder="Ví dụ: 246, 357, Thứ 2-4-6..."
                        value={formData.schedule_pattern || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, schedule_pattern: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Thời lượng (phút)
                      </label>
                      <Input
                        type="number"
                        placeholder="Ví dụ: 30, 45, 60..."
                        value={formData.duration_minutes || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, duration_minutes: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: BÁO CÁO & CSKH */}
            {formModalTab === 'care' && (
              <div className="space-y-4 pt-1 animate-fadeIn text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1 flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                    <span>Đường dẫn Báo cáo học tập (Google Docs / Google Sheets)</span>
                  </label>
                  <Input
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={formData.study_report_url || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, study_report_url: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1 flex items-center gap-1">
                      <PhoneCall className="w-3.5 h-3.5 text-blue-500" />
                      <span>Lịch hẹn gọi</span>
                    </label>
                    <Input
                      placeholder="Ví dụ: Hẹn gọi lại vào 15h thứ 6 để chốt lịch..."
                      value={formData.callback_note || ''}
                      onChange={(e) => setFormData({ ...formData, callback_note: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-rose-500" />
                      <span>Điểm nóng / Vấn đề cần lưu ý</span>
                    </label>
                    <Input
                      placeholder="Ví dụ: Phụ huynh muốn đổi lịch, phàn nàn phát âm..."
                      value={formData.hot_issue_note || ''}
                      onChange={(e) => setFormData({ ...formData, hot_issue_note: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Ngày bàn giao</label>
                    <Input
                      type="date"
                      value={formData.handed_over_at || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, handed_over_at: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Ngày tạo tài khoản
                    </label>
                    <Input
                      type="date"
                      value={formData.account_created_at || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, account_created_at: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Thông tin trao đổi với Học viên / Phụ huynh
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ghi nhận thông tin phản hồi, nguyện vọng học tập..."
                    value={formData.exchange_info || ''}
                    onChange={(e) => setFormData({ ...formData, exchange_info: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Chăm sóc sau kết thúc khóa học
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Đánh giá kết quả cuối khóa, phương án tái tục hoặc giới thiệu..."
                    value={formData.post_course_care || ''}
                    onChange={(e) => setFormData({ ...formData, post_course_care: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            {/* FORM FOOTER CONTROLS */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 mt-6">
              {/* Tab Step Controls */}
              <div className="flex items-center gap-1.5">
                {formModalTab !== 'profile' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (formModalTab === 'course') setFormModalTab('profile');
                      else if (formModalTab === 'class') setFormModalTab('course');
                      else if (formModalTab === 'care') setFormModalTab('class');
                    }}
                    leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                  >
                    Quay lại
                  </Button>
                )}
                {formModalTab !== 'care' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (formModalTab === 'profile') setFormModalTab('course');
                      else if (formModalTab === 'course') setFormModalTab('class');
                      else if (formModalTab === 'class') setFormModalTab('care');
                    }}
                    rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                  >
                    Tiếp theo
                  </Button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={submitting}
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                  className="px-5 font-bold shadow-md shadow-blue-500/20"
                >
                  {editingStudent ? 'Cập nhật hồ sơ' : 'Lưu học viên mới'}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </PageContainer>
  );
};
