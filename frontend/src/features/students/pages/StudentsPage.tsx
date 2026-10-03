import React, { useEffect, useState, useMemo } from 'react';
import { studentsApi } from '../api/students.api';
import { careApi } from '../../care/api/care.api';
import { Student, CreateStudentDTO } from '../types/students.types';
import { teachersApi } from '../../teachers/api/teachers.api';
import { Teacher } from '../../teachers/types/teachers.types';
import { CareSelectCell } from '../components/CareSelectCell';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { useAuth } from '../../../contexts/AuthContext';
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

// Component chỉnh sửa link Báo cáo học tập (Cột AK)
const InlineReportLinkCell: React.FC<{
  url?: string | null;
  onSave: (newUrl: string) => Promise<void>;
}> = ({ url, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(url || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(url || '');
  }, [url]);

  const handleCommit = async () => {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (url || '').trim()) return;

    try {
      setIsSaving(true);
      await onSave(trimmed);
    } catch {
      setDraft(url || '');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="min-w-[180px]">
        <input
          autoFocus
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCommit();
            } else if (e.key === 'Escape') {
              setIsEditing(false);
              setDraft(url || '');
            }
          }}
          className="w-full text-xs p-1 bg-white border-2 border-primary rounded-lg focus:outline-none shadow-md text-blue-700"
          placeholder="Dán link Google Docs/Sheets..."
        />
      </div>
    );
  }

  if (!url) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="text-[11px] text-blue-600 hover:text-blue-800 bg-blue-50/60 hover:bg-blue-100 border border-blue-200/60 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap"
      >
        <Plus className="w-3 h-3" />
        <span>Thêm link</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <a
        href={url.startsWith('http') ? url : `https://${url}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-2 py-0.5 rounded-lg transition-colors"
        title={url}
      >
        <span>Xem BC</span>
        <ExternalLink className="w-3 h-3 text-blue-600" />
      </a>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
        title="Sửa đường dẫn link"
      >
        <Edit className="w-3 h-3" />
      </button>
      {isSaving && <span className="text-[10px] text-primary animate-pulse">Lưu...</span>}
    </div>
  );
};

export const StudentsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isCS = user?.roles.includes('CS') && !user?.roles.includes('ADMIN');

  // Active tab state: 'students' (Tab 1) | 'care_reports' (Tab 2)
  const [activeTab, setActiveTab] = useState<'students' | 'care_reports'>('students');

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // Care milestones state (mặc định các mốc chuẩn: 1, 3, 10, 15)
  const [configuredMilestones, setConfiguredMilestones] = useState<number[]>([1, 3, 10, 15]);
  const [isAddMilestoneModalOpen, setIsAddMilestoneModalOpen] = useState(false);
  const [newMilestoneInput, setNewMilestoneInput] = useState<number | ''>('');
  const [addingMilestone, setAddingMilestone] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [saleFilter, setSaleFilter] = useState('');

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

  // Filtered students list matching Sheet 1
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Search term
      const query = searchTerm.toLowerCase().trim();
      const matchSearch =
        !query ||
        s.full_name.toLowerCase().includes(query) ||
        (s.phone && s.phone.includes(query)) ||
        (s.external_id && s.external_id.toLowerCase().includes(query)) ||
        (s.email && s.email.toLowerCase().includes(query));

      // Gender filter
      const matchGender = !genderFilter || s.gender === genderFilter;

      // Primary enrollment for Sheet 1 attributes
      const enr = s.enrollments?.[0];

      // Status filter
      const matchStatus = !statusFilter || (enr && enr.status === statusFilter);

      // Sale filter
      let matchSale = true;
      if (isCS) {
        const userIdentifier = (user?.name || user?.email || '').toLowerCase();
        const saleName = (enr?.sale_name || enr?.cs?.name || enr?.cs?.email || '').toLowerCase();
        matchSale = saleName.includes(userIdentifier) || enr?.cs_id === user?.id;
      } else if (saleFilter) {
        const saleName = (enr?.sale_name || enr?.cs?.name || enr?.cs?.email || '').toLowerCase();
        matchSale = saleName === saleFilter.toLowerCase();
      }

      return matchSearch && matchGender && matchStatus && matchSale;
    });
  }, [students, searchTerm, genderFilter, statusFilter, saleFilter, isCS, user]);

  // Extract unique Sales list for Filter
  const salesList = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      s.enrollments?.forEach((e) => {
        if (e.sale_name) set.add(e.sale_name);
        if (e.sale?.name) set.add(e.sale.name);
        if (e.cs?.name) set.add(e.cs.name);
        if (e.cs?.email) set.add(e.cs.email);
      });
    });
    return Array.from(set).filter(Boolean);
  }, [students]);

  // All active session milestones (configured milestones + any session numbers with existing care logs)
  const activeMilestones = useMemo(() => {
    const set = new Set<number>(configuredMilestones);
    // Ensure session 1 is always present by default
    set.add(1);

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
  }, [configuredMilestones, filteredStudents]);

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
      });
    } else {
      setEditingStudent(null);
      setFormData({
        ...initialFormData,
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
        await studentsApi.update(editingStudent.id, payload);
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

  // --- CỘT CHUNG (A ➔ I): CỐ ĐỊNH Ở CẢ 2 TAB ---
  const commonColumnsAtoI: Column<Student>[] = [
    {
      header: '#',
      cell: (item) => (
        <span className="font-bold text-slate-400 text-xs text-center block w-6">
          {filteredStudents.indexOf(item) + 1}
        </span>
      ),
    },
    {
      header: 'Mã học viên',
      cell: (item) => (
        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
          {item.external_id || `HV_${item.id}`}
        </span>
      ),
    },
    {
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
      header: 'Sale phụ trách',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const sale = enr?.sale_name || enr?.sale?.name || enr?.cs?.name || enr?.cs?.email || '—';
        return (
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs whitespace-nowrap">
            <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>{sale}</span>
          </div>
        );
      },
    },
    {
      header: 'Trạng thái học viên',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const status = enr?.student_source_status || 'Học viên chuẩn';
        return (
          <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
            {status}
          </span>
        );
      },
    },
    {
      header: 'Họ và tên',
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
      header: 'Giới tính',
      cell: (item) => (
        <span className="text-slate-600 text-xs whitespace-nowrap">
          {item.gender ? GENDER_LABELS[item.gender] || item.gender : '—'}
        </span>
      ),
    },
    {
      header: 'Số điện thoại',
      cell: (item) => (
        <span className="font-mono text-slate-700 text-xs whitespace-nowrap">
          {item.phone || '—'}
        </span>
      ),
    },
    {
      header: 'Email',
      cell: (item) => (
        <span className="text-slate-600 text-xs max-w-[160px] truncate block" title={item.email || ''}>
          {item.email || '—'}
        </span>
      ),
    },
    {
      header: 'Nội dung khóa học',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="text-slate-700 text-xs whitespace-nowrap max-w-[180px] truncate block">
            {enr?.course_content || enr?.package?.name || 'Tiếng Nhật Kaiwa'}
          </span>
        );
      },
    },
  ];

  // --- CỘT THAO TÁC CUỐI BẢNG ---
  const actionColumn: Column<Student> = {
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
      header: 'Trạng thái thanh toán',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const status = enr?.payment_status || 'Đã đóng đủ';
        return (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded whitespace-nowrap">
            {status}
          </span>
        );
      },
    },
    {
      header: 'Gói học',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="font-semibold text-slate-800 text-xs whitespace-nowrap">
            {enr?.package?.name || 'Gói chuẩn 30 buổi'}
          </span>
        );
      },
    },
    {
      header: 'Khóa học',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="text-slate-700 text-xs whitespace-nowrap">
            {enr?.course_content || 'Tiếng Nhật Kaiwa'}
          </span>
        );
      },
    },
    {
      header: 'Trình độ',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="font-mono font-semibold text-slate-700 text-xs whitespace-nowrap">
            {enr?.level || 'N5'}
          </span>
        );
      },
    },
    {
      header: 'Tổng số buổi',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="font-bold text-slate-800 text-xs text-center block whitespace-nowrap">
            {enr?.total_sessions || 30}
          </span>
        );
      },
    },
    {
      header: 'Mô hình lớp',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {enr?.class_model || 'Nhóm'}
          </span>
        );
      },
    },
    {
      header: 'Ghi chú sale',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span
            className="text-slate-500 text-xs italic max-w-[150px] truncate block"
            title={enr?.sales_note || ''}
          >
            {enr?.sales_note || '—'}
          </span>
        );
      },
    },
    {
      header: 'Ngày sinh',
      cell: (item) => (
        <span className="text-slate-600 text-xs whitespace-nowrap">
          {item.date_of_birth ? new Date(item.date_of_birth).toLocaleDateString('vi-VN') : '—'}
        </span>
      ),
    },
    {
      header: 'Nghề nghiệp',
      cell: (item) => (
        <span className="text-slate-600 text-xs whitespace-nowrap">
          {item.occupation || '—'}
        </span>
      ),
    },
    {
      header: 'Mô hình',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {enr?.class_model || '1:1'}
          </span>
        );
      },
    },
    {
      header: 'Số buổi còn lại',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const ec = enr?.enrollment_classes?.[0];
        if (!enr) return <span className="text-slate-400">—</span>;

        // Tính các buổi đã học năm nay:
        const currentYear = new Date().getFullYear();
        const attendedThisYear =
          ec?.attendance?.filter((a: any) => {
            if (a.status !== 'ATTENDED') return false;
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
              if (a.status !== 'ATTENDED') return false;
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
      header: 'Trạng thái',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const status = enr?.status || 'STUDYING';
        const conf = ENROLLMENT_STATUS_LABELS[status] || ENROLLMENT_STATUS_LABELS.STUDYING;
        return <Badge variant={conf.variant}>{conf.label}</Badge>;
      },
    },
    {
      header: 'Ngày kết thúc / bảo lưu',
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
      header: 'Giờ học',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const schedules = ec?.class?.class_schedules || [];
        const times = schedules.map((s) => s.start_time).filter(Boolean);
        const displayTime = times.length > 0 ? times.join(', ') : (schedules[0]?.start_time || '20h00');
        return (
          <span className="font-mono text-slate-700 text-xs whitespace-nowrap">
            {displayTime}
          </span>
        );
      },
    },
    {
      header: 'Lịch học',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const schedules = ec?.class?.class_schedules || [];
        const patterns = schedules.map((s) => s.schedule_pattern).filter(Boolean);
        const displayPattern = patterns.length > 0 ? patterns.join(', ') : '246';
        return (
          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs whitespace-nowrap">
            {displayPattern}
          </span>
        );
      },
    },
    {
      header: 'Thời lượng',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const schedules = ec?.class?.class_schedules || [];
        const durations = schedules
          .map((s) => (s.duration_minutes ? `${s.duration_minutes}p` : null))
          .filter(Boolean);
        const displayDuration =
          durations.length > 0 ? Array.from(new Set(durations)).join(', ') : '30p';
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {displayDuration}
          </span>
        );
      },
    },
    {
      header: 'Vòng lặp',
      cell: () => <span className="text-slate-500 text-xs whitespace-nowrap">Hàng tuần</span>,
    },
    {
      header: 'Ngày học',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const sched = ec?.class?.class_schedules?.[0];
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {sched?.schedule_pattern ? `Thứ ${sched.schedule_pattern}` : '—'}
          </span>
        );
      },
    },
    {
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
      header: 'Tên lớp',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        return (
          <span
            className="font-semibold text-slate-800 text-xs whitespace-nowrap max-w-[150px] truncate block"
            title={ec?.class?.class_name || ''}
          >
            {ec?.class?.class_name || '—'}
          </span>
        );
      },
    },
    {
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
            if (a.status !== 'ATTENDED') return false;
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
            if (a.status !== 'ATTENDED') return false;
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
      header: 'Đã học 2026',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const currentYear = new Date().getFullYear();
        const attendedCount =
          ec?.attendance?.filter((a: any) => {
            if (a.status !== 'ATTENDED') return false;
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
      header: 'Báo cáo học tập',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        if (!enr) return <span className="text-slate-400">—</span>;
        return (
          <InlineReportLinkCell
            url={enr.study_report_url}
            onSave={(newUrl) => handleSaveEnrollmentCareField(enr.id, 'study_report_url', newUrl)}
          />
        );
      },
    },
    {
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
    ...activeMilestones.map((sessionNum) => ({
      header: (
        <div key={`head-sess-${sessionNum}`} className="flex items-center gap-1 text-slate-800 whitespace-nowrap">
          <MessageSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>Nội dung chăm sóc sau buổi {sessionNum}</span>
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
    })),

    // --- CÁC CỘT CUỐI (BD ➔ BH) ---
    {
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
        title="Danh sách Học viên (Chuẩn Sheet 1)"
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
        className="mb-5"
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
            badge: 'Chỉnh sửa trực tiếp',
          },
        ]}
      />

      {/* Filter and Tool Bar (Synced across both Tabs) */}
      <div className="mb-5 p-4 bg-surface rounded-2xl border border-border/80 shadow-soft flex flex-wrap items-center justify-between gap-4">
        {/* Left: Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Role Status or Sale Filter */}
          {isCS ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-900 border border-blue-200/80 rounded-xl text-xs font-bold">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <span>Học viên của Sale: {user?.name || user?.email}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-secondary whitespace-nowrap">
                Lọc theo Sale:
              </span>
              <select
                value={saleFilter}
                onChange={(e) => setSaleFilter(e.target.value)}
                className="text-xs font-medium px-3 py-1.5 bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-text-primary min-w-[170px]"
              >
                <option value="">-- Tất cả nhân viên Sale --</option>
                {salesList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-text-primary min-w-[150px]"
          >
            <option value="">-- Tất cả trạng thái --</option>
            <option value="WAITING_CLASS">Chờ lớp</option>
            <option value="STUDYING">Đang học</option>
            <option value="PAUSED">Bảo lưu</option>
            <option value="FINISHED">Kết thúc</option>
            <option value="UPCOMING">Sắp học</option>
            <option value="NOT_STARTED">Chưa học</option>
          </select>

          {/* Gender Filter */}
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-text-primary min-w-[130px]"
          >
            <option value="">-- Giới tính --</option>
            <option value="MALE">Nam</option>
            <option value="FEMALE">Nữ</option>
          </select>

          <div className="text-xs text-text-muted flex items-center gap-1">
            <span>Hiển thị:</span>
            <strong className="text-text-primary font-bold">{filteredStudents.length}</strong>
            <span>/ {students.length} học viên</span>
          </div>
        </div>

        {/* Right: Search */}
        <div className="w-full sm:w-72">
          <Input
            placeholder="Tìm theo tên HV, SĐT, mã ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-text-muted" />}
          />
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
        {activeTab === 'care_reports' && (
          <div className="px-4 py-2 bg-emerald-50/70 border-b border-emerald-200/80 flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-2 font-medium">
              <span className="font-bold">Mẹo:</span>
              <span>
                Click trực tiếp vào các ô Trao đổi, Điểm nóng, CS sau buổi để gõ nhận xét như Excel. Nhấn Enter hoặc click ra ngoài để tự động lưu.
              </span>
            </div>
            <div className="text-[11px] font-bold text-emerald-800">
              Đang hiển thị {activeMilestones.length} mốc buổi chăm sóc
            </div>
          </div>
        )}

        <DataTable
          data={filteredStudents}
          columns={activeTab === 'students' ? tab1Columns : tab2Columns}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Zalo UID / SĐT Zalo</label>
                    <Input
                      placeholder="Số điện thoại hoặc UID Zalo"
                      value={formData.zalo_uid || ''}
                      onChange={(e) => setFormData({ ...formData, zalo_uid: e.target.value })}
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
