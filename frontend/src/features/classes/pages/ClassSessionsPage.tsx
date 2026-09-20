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
import { Badge } from '../../../components/ui/Badge';
import { Edit, ArrowLeft, ClipboardCheck, Plus } from 'lucide-react';

const SESSION_STATUS_VN: Record<string, { label: string; variant: 'info' | 'success' | 'danger' | 'warning' | 'neutral' }> = {
  SCHEDULED: { label: 'Đã lên lịch', variant: 'info' },
  COMPLETED: { label: 'Đã hoàn thành', variant: 'success' },
  CANCELLED: { label: 'Đã hủy', variant: 'danger' },
};

const StatusBadge = ({ status }: { status: ClassSession['status'] }) => {
  const cfg = SESSION_STATUS_VN[status] || { label: status, variant: 'neutral' };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

export const ClassSessionsPage = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const clsId = parseInt(classId || '0', 10);

  const [cls, setCls] = useState<Class | null>(null);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);

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
      const [clsData, sessionsData] = await Promise.all([
        classesApi.get(clsId),
        classSessionsApi.list(clsId),
      ]);
      setCls(clsData);
      setSessions(sessionsData);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Không thể tải danh sách buổi học');
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
      } else {
        await classSessionsApi.create(clsId, payload);
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const handleCancel = async (session: ClassSession) => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy buổi học số ${session.session_number}?`)) return;
    try {
      await classSessionsApi.cancel(clsId, session.id);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Hủy buổi học không thành công');
    }
  };

  const columns: Column<ClassSession>[] = [
    { header: 'Buổi số', accessorKey: 'session_number', className: 'w-20 font-semibold' },
    {
      header: 'Ngày học',
      cell: (item) => new Date(item.session_date).toLocaleDateString('vi-VN'),
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
            className="flex items-center gap-1 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
            title="Điểm danh buổi học này"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Điểm danh</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openModal(item);
            }}
            title="Chỉnh sửa buổi học"
          >
            <Edit className="w-4 h-4" />
          </Button>
          {item.status === 'SCHEDULED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCancel(item);
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

  return (
    <PageContainer>
      <div className="mb-4">
        <button
          onClick={() => navigate('/classes')}
          className="inline-flex items-center text-xs font-semibold text-gray-500 hover:text-blue-600 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Quay lại danh sách lớp học
        </button>
      </div>

      <PageHeader
        title={`Buổi học: ${cls?.class_name || `Lớp #${clsId}`}`}
        description={`Quản lý toàn bộ lịch học và phiếu điểm danh chuyên cần của lớp (${cls?.class_code || ''})`}
        actions={
          <Button onClick={() => openModal()} variant="primary" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Thêm buổi học mới
          </Button>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm">{error}</div>}

      <DataTable
        columns={columns}
        data={sessions}
        isLoading={loading}
        emptyMessage="Chưa có buổi học nào được tạo cho lớp này."
      />

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">
                {editingSession ? 'Chỉnh sửa Buổi học' : 'Tạo Buổi học Mới'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
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
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                    Trạng thái buổi học
                  </label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="SCHEDULED">Đã lên lịch</option>
                    <option value="COMPLETED">Đã hoàn thành</option>
                    <option value="CANCELLED">Đã hủy</option>
                  </select>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>
                  Hủy
                </Button>
                <Button variant="primary" type="submit">
                  {editingSession ? 'Lưu thay đổi' : 'Tạo buổi học'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
