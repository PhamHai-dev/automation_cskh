import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { classSessionsApi } from '../api/sessions.api';
import { classesApi } from '../api/classes.api';
import { Class, ClassSession, CreateClassSessionDTO, UpdateClassSessionDTO, SESSION_STATUS_LABELS } from '../types/classes.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Edit, ArrowLeft, ClipboardCheck, CalendarPlus } from 'lucide-react';

const StatusBadge = ({ status }: { status: ClassSession['status'] }) => {
  let variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' = 'neutral';
  if (status === 'SCHEDULED') variant = 'info';
  if (status === 'COMPLETED') variant = 'success';
  if (status === 'CANCELLED') variant = 'danger';
  return <Badge variant={variant}>{SESSION_STATUS_LABELS[status]}</Badge>;
};

export const ClassSessionsPage = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const clsId = parseInt(classId || '0');

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
      setError(err.response?.data?.error?.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clsId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clsId]);

  const openModal = (session?: ClassSession) => {
    if (session) {
      setEditingSession(session);
      setFormData({
        session_number: String(session.session_number),
        session_date: session.session_date,
        start_time: session.start_time || '',
        end_time: session.end_time || '',
        teacher_id: session.teacher_id ? String(session.teacher_id) : '',
        status: session.status,
      });
    } else {
      const nextNumber = sessions.length ? Math.max(...sessions.map(s => s.session_number)) + 1 : 1;
      setEditingSession(null);
      setFormData({
        session_number: String(nextNumber),
        session_date: new Date().toISOString().split('T')[0],
        start_time: '',
        end_time: '',
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
        session_number: parseInt(formData.session_number),
        session_date: formData.session_date,
        start_time: formData.start_time || undefined,
        end_time: formData.end_time || undefined,
        teacher_id: formData.teacher_id ? parseInt(formData.teacher_id) : undefined,
      };
      if (editingSession) {
        const updatePayload: UpdateClassSessionDTO = { ...payload, status: formData.status };
        await classSessionsApi.update(clsId, editingSession.id, updatePayload);
      } else {
        await classSessionsApi.create(clsId, payload);
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Operation failed');
    }
  };

  const handleCancel = async (session: ClassSession) => {
    if (!window.confirm(`Hủy buổi học số ${session.session_number}?`)) return;
    try {
      await classSessionsApi.cancel(clsId, session.id);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Cancel failed');
    }
  };

  const columns: Column<ClassSession>[] = [
    { header: 'Buổi', accessorKey: 'session_number', className: 'w-16' },
    {
      header: 'Ngày',
      cell: (item) => new Date(item.session_date).toLocaleDateString('vi-VN')
    },
    {
      header: 'Giờ',
      cell: (item) => (item.start_time ? `${item.start_time}${item.end_time ? ` - ${item.end_time}` : ''}` : '-')
    },
    {
      header: 'Trạng thái',
      cell: (item) => <StatusBadge status={item.status} />
    },
    {
      header: 'Điểm danh',
      className: 'text-right',
      cell: (item) => (
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" disabled={item.status !== 'SCHEDULED'} onClick={(e) => { e.stopPropagation(); navigate(`/classes/${clsId}/sessions/${item.id}/attendance`); }}>
            <ClipboardCheck className="w-3.5 h-3.5 mr-1" /> Điểm danh
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openModal(item); }}>
            <Edit className="w-4 h-4" />
          </Button>
          {item.status === 'SCHEDULED' && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleCancel(item); }}>
              Hủy
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title={cls ? `Buổi học - ${cls.class_name}` : 'Buổi học'}
        description={cls ? `Mã lớp: ${cls.class_code || '-'} · ${cls.model_type} · ${cls.attendance_source}` : 'Danh sách các buổi học của lớp.'}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/classes')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Lớp học
            </Button>
            <Button onClick={() => openModal()} variant="primary">
              <CalendarPlus className="w-4 h-4 mr-1" /> Thêm buổi học
            </Button>
          </>
        }
      />

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">{error}</div>}

      <DataTable
        columns={columns}
        data={sessions}
        isLoading={loading}
        emptyMessage="Chưa có buổi học nào."
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">{editingSession ? 'Sửa buổi học' : 'Thêm buổi học'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-500">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Buổi số *"
                  required
                  type="number"
                  min={1}
                  value={formData.session_number}
                  onChange={e => setFormData({ ...formData, session_number: e.target.value })}
                />
                <Input
                  label="Ngày *"
                  required
                  type="date"
                  value={formData.session_date}
                  onChange={e => setFormData({ ...formData, session_date: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Giờ bắt đầu"
                  type="time"
                  value={formData.start_time}
                  onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                />
                <Input
                  label="Giờ kết thúc"
                  type="time"
                  value={formData.end_time}
                  onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>

              <Input
                label="Teacher ID"
                type="number"
                value={formData.teacher_id}
                onChange={e => setFormData({ ...formData, teacher_id: e.target.value })}
              />

              {editingSession && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="SCHEDULED">Chưa diễn ra</option>
                    <option value="COMPLETED">Đã hoàn thành</option>
                    <option value="CANCELLED">Đã hủy</option>
                  </select>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>Hủy</Button>
                <Button variant="primary" type="submit">Lưu</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
