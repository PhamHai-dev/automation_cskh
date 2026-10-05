import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { classSessionsApi } from '../api/sessions.api';
import { classesApi } from '../api/classes.api';
import { Class, ClassSession, CreateClassSessionDTO, UpdateClassSessionDTO } from '../types/classes.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { Edit, ClipboardCheck, Plus, AlertTriangle } from 'lucide-react';

const SESSION_STATUS_VN: Record<string, { label: string; variant: 'info' | 'success' | 'danger' | 'warning' | 'neutral' }> = {
  SCHEDULED: { label: 'Đã lên lịch', variant: 'info' },
  COMPLETED: { label: 'Đã hoàn thành', variant: 'success' },
  CANCELLED: { label: 'Đã hủy', variant: 'danger' },
};

const StatusBadge = ({ status }: { status: ClassSession['status'] }) => {
  const cfg = SESSION_STATUS_VN[status] || { label: status, variant: 'neutral' };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

export const ClassSessionsPage: React.FC = () => {
  const toast = useToast();
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const clsId = parseInt(classId || '0', 10);

  const [cls, setCls] = useState<Class | null>(null);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);
  const [cancellingSession, setCancellingSession] = useState<ClassSession | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    session_number: '',
    session_date: '',
    start_time: '',
    end_time: '',
    teacher_id: '',
    status: 'SCHEDULED' as 'SCHEDULED' | 'COMPLETED' | 'CANCELLED',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setForbiddenError(null);
      const [clsData, sessionsData] = await Promise.all([
        classesApi.get(clsId),
        classSessionsApi.list(clsId),
      ]);
      setCls(clsData);
      setSessions(sessionsData);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setForbiddenError(
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Bạn không được phân công phụ trách lớp học này.'
        );
      } else {
        toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách buổi học');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clsId) fetchData();
  }, [clsId]);

  const openModal = (session?: ClassSession) => {
    if (session) {
      setEditingSession(session);
      setFormData({
        session_number: String(session.session_number),
        session_date: session.session_date ? new Date(session.session_date).toISOString().split('T')[0] : '',
        start_time: session.start_time || '',
        end_time: session.end_time || '',
        teacher_id: session.teacher_id ? String(session.teacher_id) : '',
        status: session.status,
      });
    } else {
      setEditingSession(null);
      const nextNumber = sessions.length > 0 ? Math.max(...sessions.map((s) => s.session_number)) + 1 : 1;
      setFormData({
        session_number: String(nextNumber),
        session_date: new Date().toISOString().split('T')[0],
        start_time: '19:00',
        end_time: '20:30',
        teacher_id: '',
        status: 'SCHEDULED',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSession(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: CreateClassSessionDTO = {
        session_number: parseInt(formData.session_number, 10),
        session_date: formData.session_date,
        start_time: formData.start_time || undefined,
        end_time: formData.end_time || undefined,
        teacher_id: formData.teacher_id ? parseInt(formData.teacher_id, 10) : undefined,
      };

      if (editingSession) {
        const updatePayload: UpdateClassSessionDTO = {
          ...payload,
          status: formData.status,
        };
        await classSessionsApi.update(clsId, editingSession.id, updatePayload);
        toast.success('Cập nhật buổi học thành công!');
      } else {
        await classSessionsApi.create(clsId, payload);
        toast.success('Tạo buổi học mới thành công!');
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingSession) return;
    try {
      await classSessionsApi.cancel(clsId, cancellingSession.id);
      toast.success(`Đã hủy buổi học số ${cancellingSession.session_number}`);
      setCancellingSession(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Hủy buổi học không thành công');
    }
  };

  const columns: Column<ClassSession>[] = [
    { header: 'Buổi số', accessorKey: 'session_number', className: 'w-20 font-bold text-slate-900 text-xs' },
    {
      header: 'Ngày học',
      cell: (item) => (
        <span className="font-semibold text-slate-800 text-xs">
          {new Date(item.session_date).toLocaleDateString('vi-VN')}
        </span>
      ),
    },
    {
      header: 'Khung giờ',
      cell: (item) => (item.start_time ? `${item.start_time}${item.end_time ? ` - ${item.end_time}` : ''}` : '—'),
    },
    {
      header: 'Trạng thái',
      cell: (item) => <StatusBadge status={item.status} />,
    },
    {
      header: 'Thao tác & Điểm danh',
      className: 'text-right',
      cell: (item) => (
        <div className="flex justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={item.status !== 'SCHEDULED'}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/classes/${clsId}/sessions/${item.id}/attendance`);
            }}
            className="text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
            title="Điểm danh buổi học này"
            leftIcon={<ClipboardCheck className="w-3.5 h-3.5" />}
          >
            Điểm danh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openModal(item);
            }}
            leftIcon={<Edit className="w-4 h-4 text-slate-500 hover:text-blue-600" />}
            title="Chỉnh sửa buổi học"
          />
          {item.status === 'SCHEDULED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setCancellingSession(item);
              }}
              className="text-rose-600 hover:bg-rose-50"
              title="Hủy buổi học"
            >
              Hủy
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (forbiddenError) {
    return (
      <PageContainer>
        <PageHeader
          title="Danh sách buổi học"
          backUrl="/classes"
          breadcrumbs={[
            { label: 'Lớp học phụ trách', href: '/classes' },
            { label: 'Buổi học' },
          ]}
        />
        <div className="bg-surface rounded-2xl border border-rose-200/80 p-8 text-center max-w-lg mx-auto my-12 shadow-soft">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-2xs">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Không có quyền truy cập lớp học</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            {forbiddenError}
          </p>
          <div className="flex justify-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate('/classes')}
            >
              Về danh sách lớp phụ trách
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={`Buổi học: ${cls?.class_name || `Lớp #${clsId}`}`}
        backUrl="/classes"
        actions={
          <Button
            onClick={() => openModal()}
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Thêm buổi học mới
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={sessions}
        isLoading={loading}
        emptyMessage="Chưa có buổi học nào được tạo cho lớp này."
      />

      {/* Modal Thêm/Sửa */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingSession ? 'Chỉnh sửa Buổi học' : 'Tạo Buổi học Mới'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={closeModal}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" form="session-form" type="submit">
              {editingSession ? 'Lưu thay đổi' : 'Tạo buổi học'}
            </Button>
          </div>
        }
      >
        <form id="session-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Buổi học số *"
              type="number"
              min={1}
              required
              value={formData.session_number}
              onChange={(e) => setFormData({ ...formData, session_number: e.target.value })}
            />
            <Input
              label="Ngày diễn ra *"
              type="date"
              required
              value={formData.session_date}
              onChange={(e) => setFormData({ ...formData, session_date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Giờ bắt đầu"
              type="time"
              value={formData.start_time}
              onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
            />
            <Input
              label="Giờ kết thúc"
              type="time"
              value={formData.end_time}
              onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
            />
          </div>

          {editingSession && (
            <Select
              label="Trạng thái buổi học"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              options={[
                { value: 'SCHEDULED', label: 'Đã lên lịch' },
                { value: 'COMPLETED', label: 'Đã hoàn thành' },
                { value: 'CANCELLED', label: 'Đã hủy' },
              ]}
            />
          )}
        </form>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={cancellingSession !== null}
        onClose={() => setCancellingSession(null)}
        title="Xác nhận hủy buổi học"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancellingSession(null)}>
              Đóng
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmCancel}>
              Xác nhận hủy buổi
            </Button>
          </div>
        }
      >
        <div className="flex items-start space-x-3 text-xs text-slate-700">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p>
            Bạn có chắc chắn muốn hủy buổi học số <strong>{cancellingSession?.session_number}</strong> vào ngày{' '}
            <strong>
              {cancellingSession ? new Date(cancellingSession.session_date).toLocaleDateString('vi-VN') : ''}
            </strong>
            ?
          </p>
        </div>
      </Modal>
    </PageContainer>
  );
};
