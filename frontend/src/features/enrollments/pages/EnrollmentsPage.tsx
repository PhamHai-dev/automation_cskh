import React, { useEffect, useState } from 'react';
import { enrollmentsApi } from '../api/enrollments.api';
import { Enrollment, CreateEnrollmentDTO, UpdateEnrollmentDTO } from '../types/enrollments.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Edit, Plus } from 'lucide-react';

const ENROLLMENT_STATUS_LABELS: Record<string, { label: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  NOT_STARTED: { label: 'Chưa học', variant: 'neutral' },
  STUDYING: { label: 'Đang học', variant: 'success' },
  PAUSED: { label: 'Tạm dừng / Bảo lưu', variant: 'warning' },
  FINISHED: { label: 'Hoàn thành', variant: 'info' },
  CANCELLED: { label: 'Đã hủy', variant: 'danger' },
};

export const EnrollmentsPage = () => {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    student_id: '',
    package_id: '',
    cs_id: '',
    total_sessions: '',
    start_date: '',
    end_date: '',
    status: 'NOT_STARTED' as 'NOT_STARTED' | 'STUDYING' | 'PAUSED' | 'FINISHED' | 'CANCELLED',
  });

  const fetchEnrollments = async () => {
    try {
      const data = await enrollmentsApi.list();
      setEnrollments(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Không thể tải danh sách ghi danh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollments();
  }, []);

  const openModal = (enrollment?: Enrollment) => {
    if (enrollment) {
      setEditingEnrollment(enrollment);
      setFormData({
        student_id: String(enrollment.student_id),
        package_id: enrollment.package_id ? String(enrollment.package_id) : '',
        cs_id: String(enrollment.cs_id),
        total_sessions: String(enrollment.total_sessions),
        start_date: enrollment.start_date ? new Date(enrollment.start_date).toISOString().split('T')[0] : '',
        end_date: enrollment.end_date ? new Date(enrollment.end_date).toISOString().split('T')[0] : '',
        status: enrollment.status,
      });
    } else {
      setEditingEnrollment(null);
      setFormData({
        student_id: '',
        package_id: '',
        cs_id: '',
        total_sessions: '',
        start_date: '',
        end_date: '',
        status: 'NOT_STARTED',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEnrollment(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEnrollment) {
        const payload: UpdateEnrollmentDTO = {
          package_id: formData.package_id ? parseInt(formData.package_id, 10) : undefined,
          total_sessions: parseInt(formData.total_sessions, 10),
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
          status: formData.status,
        };
        await enrollmentsApi.update(editingEnrollment.id, payload);
      } else {
        const payload: CreateEnrollmentDTO = {
          student_id: parseInt(formData.student_id, 10),
          package_id: formData.package_id ? parseInt(formData.package_id, 10) : undefined,
          cs_id: parseInt(formData.cs_id, 10),
          total_sessions: parseInt(formData.total_sessions, 10),
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
        };
        await enrollmentsApi.create(payload);
      }
      closeModal();
      fetchEnrollments();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const columns: Column<Enrollment>[] = [
    {
      header: 'Học viên',
      cell: (item) => (
        <div>
          <div className="font-semibold text-gray-900">{item.student?.full_name || `Học viên #${item.student_id}`}</div>
          <div className="text-gray-500 text-xs">{item.student?.phone || '—'}</div>
        </div>
      ),
    },
    {
      header: 'Gói học',
      cell: (item) => (item.package ? item.package.name : <span className="text-gray-400 italic">Chưa chọn</span>),
    },
    {
      header: 'CS Phụ trách',
      cell: (item) => item.cs?.name || `CS #${item.cs_id}`,
    },
    {
      header: 'Số buổi',
      cell: (item) => (
        <span className="text-xs font-medium">
          {item.completed_sessions ?? 0} / {item.total_sessions} buổi
        </span>
      ),
    },
    {
      header: 'Trạng thái',
      cell: (item) => {
        const cfg = ENROLLMENT_STATUS_LABELS[item.status] || { label: item.status, variant: 'neutral' };
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
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
            title="Chỉnh sửa thông tin ghi danh"
          >
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Ghi danh"
        description="Theo dõi toàn bộ hợp đồng học tập, phân công nhân viên CSKH và quản lý trạng thái tiến độ của học viên"
        actions={
          <Button onClick={() => openModal()} variant="primary" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Thêm ghi danh mới
          </Button>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm">{error}</div>}

      <DataTable
        columns={columns}
        data={enrollments}
        isLoading={loading}
        emptyMessage="Chưa có bản ghi danh nào trong hệ thống."
      />

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">
                {editingEnrollment ? 'Chỉnh sửa Ghi danh' : 'Tạo Ghi danh Mới'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {!editingEnrollment ? (
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="ID Học viên *"
                    type="number"
                    required
                    value={formData.student_id}
                    onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                    placeholder="VD: 1, 2..."
                  />
                  <Input
                    label="ID Nhân viên CS *"
                    type="number"
                    required
                    value={formData.cs_id}
                    onChange={(e) => setFormData({ ...formData, cs_id: e.target.value })}
                    placeholder="VD: 3, 5..."
                  />
                </div>
              ) : (
                <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-1 text-gray-600">
                  <div>
                    Học viên:{' '}
                    <strong className="text-gray-900">
                      {editingEnrollment.student?.full_name} (ID: {editingEnrollment.student_id})
                    </strong>
                  </div>
                  <div>
                    CS phụ trách:{' '}
                    <strong className="text-gray-900">
                      {editingEnrollment.cs?.name} (ID: {editingEnrollment.cs_id})
                    </strong>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="ID Gói học"
                  type="number"
                  value={formData.package_id}
                  onChange={(e) => setFormData({ ...formData, package_id: e.target.value })}
                  placeholder="VD: 1, 2..."
                />
                <Input
                  label="Tổng số buổi học *"
                  type="number"
                  min={1}
                  required
                  value={formData.total_sessions}
                  onChange={(e) => setFormData({ ...formData, total_sessions: e.target.value })}
                  placeholder="VD: 10, 20..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Ngày bắt đầu"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
                <Input
                  label="Ngày kết thúc dự kiến"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>

              {editingEnrollment && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                    Trạng thái ghi danh
                  </label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="NOT_STARTED">Chưa học</option>
                    <option value="STUDYING">Đang học</option>
                    <option value="PAUSED">Tạm dừng / Bảo lưu</option>
                    <option value="FINISHED">Hoàn thành</option>
                    <option value="CANCELLED">Đã hủy</option>
                  </select>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>
                  Hủy
                </Button>
                <Button variant="primary" type="submit">
                  {editingEnrollment ? 'Lưu thay đổi' : 'Tạo ghi danh'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
