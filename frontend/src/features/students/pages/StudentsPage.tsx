import React, { useEffect, useState, useMemo } from 'react';
import { studentsApi } from '../api/students.api';
import { careApi } from '../../care/api/care.api';
import { Student } from '../types/students.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
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
  NOT_STARTED: { label: 'Chưa học', variant: 'neutral' },
  STUDYING: { label: 'Đang học', variant: 'success' },
  PAUSED: { label: 'Bảo lưu / Tạm dừng', variant: 'warning' },
  FINISHED: { label: 'Hoàn thành', variant: 'info' },
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

  // Care milestones state
  const [configuredMilestones, setConfiguredMilestones] = useState<number[]>([1]);
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
  const [formData, setFormData] = useState({
    external_id: '',
    full_name: '',
    phone: '',
    email: '',
    gender: 'OTHER' as 'MALE' | 'FEMALE' | 'OTHER',
    date_of_birth: '',
    parent_name: '',
    parent_phone: '',
    school: '',
    occupation: '',
    zalo_uid: '',
    note: '',
  });

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

  useEffect(() => {
    fetchStudents();
    fetchMilestones();
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
    if (student) {
      setEditingStudent(student);
      setFormData({
        external_id: student.external_id || '',
        full_name: student.full_name,
        phone: student.phone || '',
        email: student.email || '',
        gender: (student.gender as any) || 'OTHER',
        date_of_birth: student.date_of_birth
          ? new Date(student.date_of_birth).toISOString().split('T')[0]
          : '',
        parent_name: student.parent_name || '',
        parent_phone: student.parent_phone || '',
        school: student.school || '',
        occupation: student.occupation || '',
        zalo_uid: student.zalo_uid || '',
        note: student.note || '',
      });
    } else {
      setEditingStudent(null);
      setFormData({
        external_id: '',
        full_name: '',
        phone: '',
        email: '',
        gender: 'OTHER',
        date_of_birth: '',
        parent_name: '',
        parent_phone: '',
        school: '',
        occupation: '',
        zalo_uid: '',
        note: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      toast.warning('Vui lòng nhập họ và tên học viên.');
      return;
    }

    try {
      setSubmitting(true);
      if (editingStudent) {
        await studentsApi.update(editingStudent.id, {
          ...formData,
          date_of_birth: formData.date_of_birth || undefined,
        });
        toast.success('Cập nhật thông tin học viên thành công!');
      } else {
        await studentsApi.create({
          ...formData,
          date_of_birth: formData.date_of_birth || undefined,
        });
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
        const rem = enr?.external_remaining_sessions;
        if (rem === null || rem === undefined) return <span className="text-slate-400">—</span>;
        const isDebt = rem < 0;

        return (
          <div className="flex items-center gap-1 whitespace-nowrap">
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
            {sched?.schedule_pattern ? `Thứ ${sched.schedule_pattern}` : 'Thứ 2, 4, 6'}
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
            {teacher?.name || 'Sensei Tanaka'}
          </span>
        );
      },
    },
    {
      header: 'Mã giáo viên',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const teacher = ec?.class?.class_teachers?.[0]?.teacher;
        const teacherCode = (teacher as any)?.teacher_code || 'GV_01';
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
            {ec?.class?.class_name || 'Lớp N5 - K01 (246 Sáng)'}
          </span>
        );
      },
    },
    {
      header: 'Đã học năm trước',
      cell: () => <span className="text-slate-400 text-xs text-center block whitespace-nowrap">0</span>,
    },
    {
      header: 'Đã học 2026',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const attendedCount =
          ec?.attendance?.filter((a: any) => a.status === 'ATTENDED').length || 0;
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
        <div key={`head-sess-${sessionNum}`} className="flex items-center gap-1 text-emerald-800">
          <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Chăm sóc buổi {sessionNum}</span>
        </div>
      ),
      cell: (item: Student) => {
        const enr = item.enrollments?.[0];
        if (!enr) return <span className="text-slate-400">—</span>;
        const log = enr.care_logs?.find((cl) => cl.after_session_number === sessionNum);
        return (
          <InlineEditableCell
            value={log?.content}
            multiline
            placeholder={`Nhập nhận xét sau buổi ${sessionNum}...`}
            className="bg-emerald-50/40 border border-emerald-100 hover:bg-emerald-50"
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
        description="Đầy đủ thông tin học viên, tiến độ gói học, nợ buổi âm và nhật ký chăm sóc chia theo 2 Tab nghiệp vụ."
        actions={
          <div className="flex items-center gap-2">
            {activeTab === 'care_reports' && (
              <Button
                variant="outline"
                size="md"
                onClick={() => setIsAddMilestoneModalOpen(true)}
                leftIcon={<PlusCircle className="w-4 h-4 text-emerald-600" />}
                className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              >
                + Thêm mốc buổi CS
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={() => openModal()}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Thêm học viên mới
            </Button>
          </div>
        }
      />

      {/* Tab Navigation Switcher */}
      <div className="flex items-center gap-3 mb-5 border-b border-border/80">
        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'students'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Tab 1: Hồ sơ Học viên</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary-soft text-primary font-bold">
            {filteredStudents.length} HV
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('care_reports')}
          className={`flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'care_reports'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <FileText className="w-4 h-4 text-emerald-600" />
          <span>Tab 2: Báo cáo Học tập & Chăm sóc</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
            Excel Inline Edit
          </span>
        </button>
      </div>

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
            <option value="STUDYING">Đang học</option>
            <option value="PAUSED">Bảo lưu / Tạm dừng</option>
            <option value="FINISHED">Hoàn thành</option>
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
          title={editingStudent ? 'Chỉnh sửa học viên' : 'Thêm học viên mới'}
        >
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-text-primary mb-1">
                  Mã học viên (External ID)
                </label>
                <Input
                  placeholder="Ví dụ: 420274574"
                  value={formData.external_id}
                  onChange={(e) => setFormData({ ...formData, external_id: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-text-primary mb-1">
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Nguyễn Văn A"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-text-primary mb-1">Số điện thoại</label>
                <Input
                  placeholder="0987654321"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-text-primary mb-1">Email</label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-text-primary mb-1">Giới tính</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                  className="w-full text-xs font-medium px-3 py-2 bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-text-primary"
                >
                  <option value="MALE">Nam</option>
                  <option value="FEMALE">Nữ</option>
                  <option value="OTHER">Khác</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-text-primary mb-1">Ngày sinh (DOB)</label>
                <Input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-text-primary mb-1">Nghề nghiệp</label>
                <Input
                  placeholder="Ví dụ: Kỹ sư, Sinh viên..."
                  value={formData.occupation}
                  onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-text-primary mb-1">Trường học</label>
                <Input
                  placeholder="Tên trường học"
                  value={formData.school}
                  onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-text-primary mb-1">Họ tên Phụ huynh</label>
                <Input
                  placeholder="Họ tên cha/mẹ"
                  value={formData.parent_name}
                  onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-text-primary mb-1">SĐT Phụ huynh</label>
                <Input
                  placeholder="0912345678"
                  value={formData.parent_phone}
                  onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={submitting}>
                {editingStudent ? 'Cập nhật' : 'Thêm mới'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </PageContainer>
  );
};
