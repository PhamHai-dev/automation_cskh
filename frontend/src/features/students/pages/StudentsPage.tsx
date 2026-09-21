import React, { useEffect, useState, useMemo } from 'react';
import { studentsApi } from '../api/students.api';
import { Student } from '../types/students.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
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
  Calendar,
  BookOpen,
  Eye,
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

export const StudentsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isCS = user?.roles.includes('CS') && !user?.roles.includes('ADMIN');

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchStudents();
  }, []);

  // Extract unique Sales list for Filter
  const salesList = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      s.enrollments?.forEach((e) => {
        if (e.sale_name) set.add(e.sale_name);
        if (e.cs?.name) set.add(e.cs.name);
        if (e.cs?.email) set.add(e.cs.email);
      });
    });
    return Array.from(set).filter(Boolean);
  }, [students]);

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

  // Filtered list matching Sheet 1
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
        // If current user is CS, match user's name or email
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

  // Columns defined according to Sheet 1 (`1.Chăm sóc`)
  const sheet1Columns: Column<Student>[] = [
    {
      header: '#',
      cell: (item) => (
        <span className="font-bold text-slate-400 text-xs text-center block w-6">
          {filteredStudents.indexOf(item) + 1}
        </span>
      ),
    },
    {
      header: 'ID (Mã HV)',
      cell: (item) => (
        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
          {item.external_id || `HV_${item.id}`}
        </span>
      ),
    },
    {
      header: 'Ngày nộp HP',
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
      header: 'Sale (CSKH)',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        const sale = enr?.sale_name || enr?.cs?.name || enr?.cs?.email || '—';
        return (
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs whitespace-nowrap">
            <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>{sale}</span>
          </div>
        );
      },
    },
    {
      header: 'Trạng thái HV',
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
      header: 'Họ tên HV',
      cell: (item) => (
        <div className="flex items-center space-x-2 whitespace-nowrap">
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
            {item.full_name.charAt(0).toUpperCase()}
          </div>
          <span className="font-bold text-slate-900 text-xs hover:text-blue-600 cursor-pointer" onClick={() => setViewingStudent(item)}>
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
      header: 'SĐT',
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
      header: 'Nội dung khoá',
      cell: (item) => {
        const enr = item.enrollments?.[0];
        return (
          <span className="text-slate-700 text-xs whitespace-nowrap max-w-[180px] truncate block">
            {enr?.course_content || enr?.package?.name || 'Tiếng Nhật Kaiwa'}
          </span>
        );
      },
    },
    {
      header: 'Trạng thái TT',
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
      header: 'Mô hình',
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
          <span className="text-slate-500 text-xs italic max-w-[150px] truncate block" title={enr?.sales_note || ''}>
            {enr?.sales_note || '—'}
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
      header: 'Ngày KT / Bảo lưu',
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
        const sched = ec?.class?.class_schedules?.[0];
        return (
          <span className="font-mono text-slate-700 text-xs whitespace-nowrap">
            {sched?.start_time || '20h00'}
          </span>
        );
      },
    },
    {
      header: 'Lịch học',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const sched = ec?.class?.class_schedules?.[0];
        return (
          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs whitespace-nowrap">
            {sched?.schedule_pattern || '246'}
          </span>
        );
      },
    },
    {
      header: 'Thời lượng',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const sched = ec?.class?.class_schedules?.[0];
        return (
          <span className="text-slate-600 text-xs whitespace-nowrap">
            {sched?.duration_minutes ? `${sched.duration_minutes}p` : '30p'}
          </span>
        );
      },
    },
    {
      header: 'Giáo viên & Mã GV',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const teacher = ec?.class?.class_teachers?.[0]?.teacher;
        const teacherCode = (teacher as any)?.teacher_code || 'GV_01';
        return (
          <div className="text-xs whitespace-nowrap">
            <span className="font-semibold text-slate-800">{teacher?.name || 'Sensei Tanaka'}</span>
            <span className="text-slate-400 font-mono ml-1">({teacherCode})</span>
          </div>
        );
      },
    },
    {
      header: 'Tên lớp',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        return (
          <span className="font-semibold text-slate-800 text-xs whitespace-nowrap max-w-[150px] truncate block" title={ec?.class?.class_name || ''}>
            {ec?.class?.class_name || 'Lớp N5 - K01 (246 Sáng)'}
          </span>
        );
      },
    },
    {
      header: 'Đã học',
      cell: (item) => {
        const ec = item.enrollments?.[0]?.enrollment_classes?.[0];
        const attendedCount = ec?.attendance?.filter((a: any) => a.status === 'ATTENDED').length || 0;
        return (
          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs text-center block whitespace-nowrap">
            {attendedCount} buổi
          </span>
        );
      },
    },
    {
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
    },
  ];

  return (
    <PageContainer>
      {/* Page Header */}
      <PageHeader
        title="Danh sách Học viên (Chuẩn Sheet 1)"
        description="Toàn bộ thông tin học viên, tiến độ gói học, nợ buổi âm và giáo viên phụ trách theo cấu trúc Sheet 1 Chăm sóc."
        actions={
          <div className="flex items-center gap-2">
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

      {/* Filter and Tool Bar */}
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
        <DataTable
          data={filteredStudents}
          columns={sheet1Columns}
          isLoading={loading}
          emptyMessage="Không tìm thấy học viên nào phù hợp với điều kiện lọc."
        />
      </div>

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
                  <strong className="text-slate-900 font-mono">{viewingStudent.external_id || `HV_${viewingStudent.id}`}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Họ và tên:</span>
                  <strong className="text-slate-900">{viewingStudent.full_name}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Giới tính:</span>
                  <strong className="text-slate-900">{viewingStudent.gender ? GENDER_LABELS[viewingStudent.gender] || viewingStudent.gender : '—'}</strong>
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
                    {viewingStudent.date_of_birth ? new Date(viewingStudent.date_of_birth).toLocaleDateString('vi-VN') : '—'}
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
                  <strong className="text-slate-900">{viewingStudent.parent_name || '—'} {viewingStudent.parent_phone ? `(${viewingStudent.parent_phone})` : ''}</strong>
                </div>
              </div>
            </div>

            {/* Section 2: Course & Financial Details from Sheet 1 */}
            {viewingStudent.enrollments?.[0] && (
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2.5 flex items-center gap-2 border-b border-slate-100 pb-1.5">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  2. Khóa học & Tiến độ (Sheet 1)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                  <div>
                    <span className="text-slate-500 block">Nhân viên Sale:</span>
                    <strong className="text-blue-700 font-bold">
                      {viewingStudent.enrollments[0].sale_name || viewingStudent.enrollments[0].cs?.name || '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Gói học:</span>
                    <strong className="text-slate-900">{viewingStudent.enrollments[0].package?.name || 'Gói chuẩn 30 buổi'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Trình độ:</span>
                    <strong className="text-slate-900">{viewingStudent.enrollments[0].level || 'N5'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Tổng số buổi:</span>
                    <strong className="text-slate-900 font-bold">{viewingStudent.enrollments[0].total_sessions} buổi</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Số buổi còn lại:</span>
                    <strong className={`font-bold ${((viewingStudent.enrollments[0].external_remaining_sessions || 0) < 0) ? 'text-red-600 font-extrabold' : 'text-emerald-700'}`}>
                      {viewingStudent.enrollments[0].external_remaining_sessions !== null && viewingStudent.enrollments[0].external_remaining_sessions !== undefined
                        ? `${viewingStudent.enrollments[0].external_remaining_sessions} buổi`
                        : '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Trạng thái:</span>
                    <strong className="text-slate-900">{viewingStudent.enrollments[0].status}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ngày bắt đầu:</span>
                    <strong className="text-slate-900">
                      {viewingStudent.enrollments[0].start_date ? new Date(viewingStudent.enrollments[0].start_date).toLocaleDateString('vi-VN') : '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ngày kết thúc / Bảo lưu:</span>
                    <strong className="text-slate-900">
                      {viewingStudent.enrollments[0].end_date ? new Date(viewingStudent.enrollments[0].end_date).toLocaleDateString('vi-VN') : '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ghi chú Sale:</span>
                    <span className="text-slate-700 italic">{viewingStudent.enrollments[0].sales_note || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Class & Schedule */}
            {viewingStudent.enrollments?.[0]?.enrollment_classes?.[0] && (
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2.5 flex items-center gap-2 border-b border-slate-100 pb-1.5">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  3. Lớp học & Giáo viên phụ trách
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                  <div>
                    <span className="text-slate-500 block">Tên lớp:</span>
                    <strong className="text-slate-900">
                      {viewingStudent.enrollments[0].enrollment_classes[0].class?.class_name || 'Lớp học'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Lịch học:</span>
                    <strong className="text-blue-700">
                      {viewingStudent.enrollments[0].enrollment_classes[0].class?.class_schedules?.[0]?.schedule_pattern || '246'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Giờ học:</span>
                    <strong className="text-slate-900">
                      {viewingStudent.enrollments[0].enrollment_classes[0].class?.class_schedules?.[0]?.start_time || '20h00'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Thời lượng:</span>
                    <strong className="text-slate-900">
                      {viewingStudent.enrollments[0].enrollment_classes[0].class?.class_schedules?.[0]?.duration_minutes || 30} phút
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Giáo viên:</span>
                    <strong className="text-slate-900">
                      {viewingStudent.enrollments[0].enrollment_classes[0].class?.class_teachers?.[0]?.teacher?.name || 'Giáo viên'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Số buổi đã điểm danh:</span>
                    <strong className="text-emerald-700">
                      {viewingStudent.enrollments[0].enrollment_classes[0].attendance?.length || 0} buổi
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <Button variant="outline" onClick={() => setViewingStudent(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? 'Chỉnh sửa Học viên' : 'Thêm mới Học viên'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Mã Học viên (ID) *"
              value={formData.external_id}
              onChange={(e) => setFormData({ ...formData, external_id: e.target.value })}
              placeholder="VD: HV_001, HV_002..."
            />

            <Input
              label="Họ và tên *"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="VD: Nguyễn Văn An"
              required
            />

            <Input
              label="Số điện thoại"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0912345678"
            />

            <Input
              label="Địa chỉ Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="an.nguyen@gmail.com"
            />

            <Select
              label="Giới tính"
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
              options={[
                { value: 'MALE', label: 'Nam' },
                { value: 'FEMALE', label: 'Nữ' },
                { value: 'OTHER', label: 'Khác' },
              ]}
            />

            <Input
              label="Ngày sinh"
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
            />

            <Input
              label="Nghề nghiệp"
              value={formData.occupation}
              onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
              placeholder="VD: Kỹ sư, Sinh viên..."
            />

            <Input
              label="Trường học"
              value={formData.school}
              onChange={(e) => setFormData({ ...formData, school: e.target.value })}
              placeholder="VD: ĐH Quốc Gia..."
            />

            <Input
              label="Tên phụ huynh"
              value={formData.parent_name}
              onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
              placeholder="Nếu là học viên nhỏ tuổi"
            />

            <Input
              label="SĐT phụ huynh"
              value={formData.parent_phone}
              onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
              placeholder="0987654321"
            />
          </div>

          <Textarea
            label="Ghi chú thêm"
            value={formData.note}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            placeholder="Thông tin ghi chú về học viên..."
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border/80">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" isLoading={submitting}>
              {editingStudent ? 'Lưu thay đổi' : 'Tạo mới'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
