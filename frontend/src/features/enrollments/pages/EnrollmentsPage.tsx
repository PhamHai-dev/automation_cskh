import React, { useEffect, useState, useMemo } from 'react';
import { enrollmentsApi } from '../api/enrollments.api';
import { Enrollment, CreateEnrollmentDTO, UpdateEnrollmentDTO } from '../types/enrollments.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { FilterBar } from '../../../components/common/FilterBar';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { AttendanceMatrix, StudentRow } from '../../classes/components/AttendanceMatrix';
import { classSessionsApi, attendanceApi } from '../../classes/api/sessions.api';
import { ClassSession, Attendance, AttendanceStatus } from '../../classes/types/classes.types';
import {
  CalendarDays,
  Table as TableIcon,
  Search,
  UserCheck,
  Plus,
  Edit,
  AlertTriangle,
} from 'lucide-react';

const ENROLLMENT_STATUS_LABELS: Record<
  string,
  { label: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  NOT_STARTED: { label: 'Chưa học', variant: 'neutral' },
  STUDYING: { label: 'Đang học', variant: 'success' },
  PAUSED: { label: 'Tạm dừng / Bảo lưu', variant: 'warning' },
  FINISHED: { label: 'Hoàn thành', variant: 'info' },
  CANCELLED: { label: 'Đã hủy', variant: 'danger' },
};

export const EnrollmentsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isCS = user?.roles.includes('CS') && !user?.roles.includes('ADMIN');

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  // View mode: 'matrix' (default as requested) or 'table'
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('matrix');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal states for Create/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    student_id: '',
    package_id: '',
    cs_id: '',
    total_sessions: '',
    external_remaining_sessions: '',
    start_date: '',
    end_date: '',
    status: 'NOT_STARTED' as 'NOT_STARTED' | 'STUDYING' | 'PAUSED' | 'FINISHED' | 'CANCELLED',
  });

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const data = await enrollmentsApi.list({
        sale: selectedSale || undefined,
      });
      setEnrollments(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách ghi danh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollments();
  }, [selectedSale]);

  // Extract unique Sales list for Admin filter
  const salesList = useMemo(() => {
    const set = new Set<string>();
    enrollments.forEach((e) => {
      if (e.sale_name) set.add(e.sale_name);
      if (e.cs?.name) set.add(e.cs.name);
      if (e.cs?.email) set.add(e.cs.email);
    });
    return Array.from(set).filter(Boolean);
  }, [enrollments]);

  // Extract StudentRow list for AttendanceMatrix filtered by Sale
  const matrixStudents: StudentRow[] = useMemo(() => {
    const list: StudentRow[] = [];

    enrollments.forEach((enr) => {
      const student = enr.student;
      if (!student) return;

      // Filter by search query if any
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = student.full_name?.toLowerCase().includes(query);
        const matchCode = student.external_id?.toLowerCase().includes(query) || enr.external_id?.toLowerCase().includes(query);
        const matchPhone = student.phone?.includes(query);
        if (!matchName && !matchCode && !matchPhone) return;
      }

      // If enrollment has assigned enrollment_classes
      if (enr.enrollment_classes && enr.enrollment_classes.length > 0) {
        enr.enrollment_classes.forEach((ec) => {
          const cls = ec.class;
          const teacher = cls?.class_teachers?.[0]?.teacher;
          const schedule = cls?.class_schedules?.[0];

          list.push({
            enrollment_class_id: ec.id,
            class_id: ec.class_id,
            student_id: student.id,
            external_id: student.external_id || enr.external_id || `HV_${student.id}`,
            full_name: student.full_name,
            status: enr.status,
            start_date: enr.start_date,
            end_date: enr.end_date,
            start_time: schedule?.start_time || '20h00',
            schedule_pattern: schedule?.schedule_pattern || '246',
            duration_minutes: schedule?.duration_minutes || 30,
            teacher_name: teacher?.name || 'Giáo viên',
            teacher_code: (teacher as any)?.teacher_code || 'GV_01',
            class_name: cls?.class_name || 'Lớp học',
            sale_name: enr.sale_name || enr.cs?.name || 'Sale',
          });
        });
      } else {
        // Enrolled but not yet assigned to a class
        list.push({
          enrollment_class_id: enr.id,
          class_id: 1,
          student_id: student.id,
          external_id: student.external_id || enr.external_id || `HV_${student.id}`,
          full_name: student.full_name,
          status: enr.status,
          start_date: enr.start_date,
          end_date: enr.end_date,
          start_time: '20h00',
          schedule_pattern: '246',
          duration_minutes: 30,
          teacher_name: 'Chưa xếp GV',
          teacher_code: 'GV_--',
          class_name: 'Chưa xếp lớp',
          sale_name: enr.sale_name || enr.cs?.name || 'Sale',
        });
      }
    });

    return list;
  }, [enrollments, searchQuery]);

  // Aggregate all sessions & attendances across the enrolled classes
  const { allSessions, allAttendances } = useMemo(() => {
    const sessMap = new Map<number, ClassSession>();
    const attList: Attendance[] = [];

    enrollments.forEach((enr) => {
      enr.enrollment_classes?.forEach((ec) => {
        // Collect class sessions
        ec.class?.class_sessions?.forEach((s: any) => {
          if (!sessMap.has(s.id)) {
            sessMap.set(s.id, s);
          }
        });

        // Collect attendances
        ec.attendance?.forEach((a: any) => {
          attList.push(a);
        });
      });
    });

    return {
      allSessions: Array.from(sessMap.values()),
      allAttendances: attList,
    };
  }, [enrollments]);

  // Save changes from Attendance Matrix across student classes
  const handleCustomSaveAll = async (pendingEdits: Record<string, AttendanceStatus>) => {
    const entries = Object.entries(pendingEdits);
    if (entries.length === 0) return;

    // Group edits by class_id and dateStr
    const byClassAndDate = new Map<
      string,
      { classId: number; dateStr: string; items: { ecId: number; status: AttendanceStatus }[] }
    >();

    entries.forEach(([key, status]) => {
      const [ecIdStr, dateStr] = key.split('_');
      const ecId = parseInt(ecIdStr, 10);
      const student = matrixStudents.find((s) => s.enrollment_class_id === ecId);
      const classId = student?.class_id || 1;

      const groupKey = `${classId}_${dateStr}`;
      if (!byClassAndDate.has(groupKey)) {
        byClassAndDate.set(groupKey, { classId, dateStr, items: [] });
      }
      byClassAndDate.get(groupKey)!.items.push({ ecId, status });
    });

    for (const { classId, dateStr, items } of byClassAndDate.values()) {
      const existingSessions = await classSessionsApi.list(classId);
      let session = existingSessions.find(
        (s) => new Date(s.session_date).toISOString().split('T')[0] === dateStr
      );

      if (!session) {
        session = await classSessionsApi.create(classId, {
          session_number: existingSessions.length + 1,
          session_date: dateStr,
        });
      }

      await attendanceApi.bulkMark(classId, session.id, {
        items: items.map((i) => ({
          enrollment_class_id: i.ecId,
          status: i.status,
        })),
      });
    }

    await fetchEnrollments();
  };

  // Filtered list for Table view
  const filteredEnrollments = useMemo(() => {
    return enrollments.filter((item) => {
      const matchSearch =
        !searchQuery ||
        item.student?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.student?.phone?.includes(searchQuery) ||
        String(item.student_id).includes(searchQuery) ||
        (item.external_id && item.external_id.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus = !statusFilter || item.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [enrollments, searchQuery, statusFilter]);

  const openModal = (enrollment?: Enrollment) => {
    if (enrollment) {
      setEditingEnrollment(enrollment);
      setFormData({
        student_id: String(enrollment.student_id),
        package_id: enrollment.package_id ? String(enrollment.package_id) : '',
        cs_id: String(enrollment.cs_id),
        total_sessions: String(enrollment.total_sessions),
        external_remaining_sessions:
          enrollment.external_remaining_sessions !== undefined &&
          enrollment.external_remaining_sessions !== null
            ? String(enrollment.external_remaining_sessions)
            : '',
        start_date: enrollment.start_date
          ? new Date(enrollment.start_date).toISOString().split('T')[0]
          : '',
        end_date: enrollment.end_date
          ? new Date(enrollment.end_date).toISOString().split('T')[0]
          : '',
        status: enrollment.status,
      });
    } else {
      setEditingEnrollment(null);
      setFormData({
        student_id: '',
        package_id: '',
        cs_id: user?.id ? String(user.id) : '',
        total_sessions: '24',
        external_remaining_sessions: '24',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        status: 'STUDYING',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.student_id || !formData.total_sessions) {
      toast.warning('Vui lòng điền đầy đủ các thông tin bắt buộc.');
      return;
    }

    try {
      setSubmitting(true);
      if (editingEnrollment) {
        const updateData: UpdateEnrollmentDTO = {
          package_id: formData.package_id ? parseInt(formData.package_id) : undefined,
          total_sessions: parseInt(formData.total_sessions),
          external_remaining_sessions: formData.external_remaining_sessions
            ? parseInt(formData.external_remaining_sessions)
            : undefined,
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
          status: formData.status,
        };
        await enrollmentsApi.update(editingEnrollment.id, updateData);
        toast.success('Cập nhật thông tin ghi danh thành công!');
      } else {
        const createData: CreateEnrollmentDTO = {
          student_id: parseInt(formData.student_id),
          package_id: formData.package_id ? parseInt(formData.package_id) : undefined,
          cs_id: parseInt(formData.cs_id) || user?.id || 1,
          total_sessions: parseInt(formData.total_sessions),
          external_remaining_sessions: formData.external_remaining_sessions
            ? parseInt(formData.external_remaining_sessions)
            : undefined,
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
        };
        await enrollmentsApi.create(createData);
        toast.success('Tạo bản ghi ghi danh thành công!');
      }
      setIsModalOpen(false);
      fetchEnrollments();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Có lỗi xảy ra khi lưu thông tin ghi danh');
    } finally {
      setSubmitting(false);
    }
  };

  // Table columns for detailed view
  const tableColumns: Column<Enrollment>[] = [
    {
      header: 'Học viên & Mã ghi danh',
      cell: (item) => (
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
            {item.student?.full_name?.charAt(0).toUpperCase() || 'H'}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-xs">{item.student?.full_name || 'Học viên'}</div>
            <div className="text-slate-500 font-mono text-[11px]">
              {item.external_id || `ID: ${item.id}`} • {item.student?.phone || '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Gói học & Trình độ',
      cell: (item) => (
        <div>
          <div className="font-semibold text-slate-800 text-xs">{item.package?.name || 'Gói cơ bản'}</div>
          <div className="text-[11px] text-slate-500">
            {item.level || 'Chuẩn'} • {item.class_model || 'Nhóm'}
          </div>
        </div>
      ),
    },
    {
      header: 'Nhân viên Sale (CSKH)',
      cell: (item) => (
        <div className="flex items-center gap-1.5 font-medium text-slate-700">
          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>{item.sale_name || item.cs?.name || item.cs?.email || 'Chưa gán'}</span>
        </div>
      ),
    },
    {
      header: 'Số buổi còn lại',
      cell: (item) => {
        const rem = item.external_remaining_sessions;
        if (rem === null || rem === undefined) return <span className="text-slate-400">—</span>;
        const isDebt = rem < 0;

        return (
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                isDebt
                  ? 'bg-red-100 text-red-800 border-red-300 font-extrabold shadow-xs'
                  : rem <= 3
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {isDebt && <AlertTriangle className="w-3 h-3 mr-1 text-red-600 animate-pulse" />}
              {rem} buổi
            </span>
          </div>
        );
      },
    },
    {
      header: 'Trạng thái',
      cell: (item) => {
        const conf = ENROLLMENT_STATUS_LABELS[item.status] || ENROLLMENT_STATUS_LABELS.NOT_STARTED;
        return <Badge variant={conf.variant}>{conf.label}</Badge>;
      },
    },
    {
      header: 'Thời gian học',
      cell: (item) => (
        <div className="text-[11px] text-slate-600">
          <div>BĐ: {item.start_date ? new Date(item.start_date).toLocaleDateString('vi-VN') : '—'}</div>
          <div>KT: {item.end_date ? new Date(item.end_date).toLocaleDateString('vi-VN') : '—'}</div>
        </div>
      ),
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      cell: (item) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openModal(item);
            }}
            title="Chỉnh sửa ghi danh"
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
        title="Quản lý Ghi danh & Điểm danh"
        description="Ma trận điểm danh theo ngày cho học viên do nhân viên Chăm sóc khách hàng (Sale) phụ trách."
        actions={
          <div className="flex items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="flex p-1 bg-surface-muted rounded-xl border border-border/80 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'matrix'
                    ? 'bg-surface text-primary shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                <span>Ma trận Điểm danh</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'table'
                    ? 'bg-surface text-primary shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <TableIcon className="w-4 h-4" />
                <span>Chi tiết Ghi danh</span>
              </button>
            </div>

            <Button
              variant="primary"
              size="md"
              onClick={() => openModal()}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Thêm ghi danh
            </Button>
          </div>
        }
      />

      {/* Sale Filter & Info Bar */}
      <div className="mb-5 p-4 bg-surface rounded-2xl border border-border/80 shadow-soft flex flex-wrap items-center justify-between gap-4">
        {/* Left: Role identification / Sale Selector */}
        <div className="flex items-center gap-3 flex-wrap">
          {isCS ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-900 border border-blue-200/80 rounded-xl text-xs font-bold">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <span>Nhân viên Sale (CSKH): {user?.name || user?.email}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-secondary whitespace-nowrap">
                Lọc theo Sale:
              </span>
              <select
                value={selectedSale}
                onChange={(e) => setSelectedSale(e.target.value)}
                className="text-xs font-medium px-3 py-1.5 bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-text-primary min-w-[180px]"
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

          <div className="text-xs text-text-muted flex items-center gap-1">
            <span>Tổng cộng:</span>
            <strong className="text-text-primary font-bold">{matrixStudents.length}</strong>
            <span>học viên</span>
          </div>
        </div>

        {/* Right: Quick Search */}
        <div className="w-full sm:w-72">
          <Input
            placeholder="Tìm theo tên học viên, SĐT, mã..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-text-muted" />}
          />
        </div>
      </div>

      {/* Main Content Area: Matrix vs Table */}
      {viewMode === 'matrix' ? (
        <div className="space-y-4">
          <AttendanceMatrix
            students={matrixStudents}
            sessions={allSessions}
            attendances={allAttendances}
            onRefresh={fetchEnrollments}
            onSaveCustom={handleCustomSaveAll}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <FilterBar
            activeCount={(searchQuery ? 1 : 0) + (statusFilter ? 1 : 0)}
            onClear={() => {
              setSearchQuery('');
              setStatusFilter('');
            }}
          >
            <div className="w-full sm:w-48">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: '', label: 'Tất cả trạng thái' },
                  { value: 'STUDYING', label: 'Đang học' },
                  { value: 'PAUSED', label: 'Bảo lưu / Tạm dừng' },
                  { value: 'FINISHED', label: 'Hoàn thành' },
                  { value: 'NOT_STARTED', label: 'Chưa học' },
                  { value: 'CANCELLED', label: 'Đã hủy' },
                ]}
              />
            </div>
          </FilterBar>

          <DataTable
            data={filteredEnrollments}
            columns={tableColumns}
            isLoading={loading}
            emptyMessage="Không tìm thấy bản ghi ghi danh nào phù hợp."
          />
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEnrollment ? 'Chỉnh sửa Ghi danh' : 'Tạo mới Ghi danh'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Mã Học viên (ID) *"
              type="number"
              value={formData.student_id}
              onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
              required
              disabled={!!editingEnrollment}
            />

            <Input
              label="Mã Gói học (Package ID)"
              type="number"
              value={formData.package_id}
              onChange={(e) => setFormData({ ...formData, package_id: e.target.value })}
              placeholder="VD: 1, 2..."
            />

            <Input
              label="Tổng số buổi *"
              type="number"
              value={formData.total_sessions}
              onChange={(e) => setFormData({ ...formData, total_sessions: e.target.value })}
              required
            />

            <Input
              label="Số buổi còn lại"
              type="number"
              value={formData.external_remaining_sessions}
              onChange={(e) => setFormData({ ...formData, external_remaining_sessions: e.target.value })}
              placeholder="Có thể nhập số âm nếu nợ buổi: -1, -2..."
            />

            <Input
              label="Ngày bắt đầu học"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            />

            <Input
              label="Ngày kết thúc / Bảo lưu"
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            />
          </div>

          <Select
            label="Trạng thái"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
            options={[
              { value: 'NOT_STARTED', label: 'Chưa học' },
              { value: 'STUDYING', label: 'Đang học' },
              { value: 'PAUSED', label: 'Tạm dừng / Bảo lưu' },
              { value: 'FINISHED', label: 'Hoàn thành' },
              { value: 'CANCELLED', label: 'Đã hủy' },
            ]}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border/80">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" isLoading={submitting}>
              {editingEnrollment ? 'Lưu thay đổi' : 'Tạo mới'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
