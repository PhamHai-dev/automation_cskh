import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { classesApi } from '../api/classes.api';
import { Class, CreateClassDTO, UpdateClassDTO } from '../types/classes.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Edit, Plus, Calendar } from 'lucide-react';

const MODEL_LABELS: Record<string, string> = {
  ONE_TO_ONE: '1 kèm 1',
  GROUP: 'Lớp nhóm',
};

const SOURCE_LABELS: Record<string, string> = {
  LEARNING_SYSTEM: 'Hệ thống (LMS)',
  ZOOM: 'Học qua Zoom',
};

export const ClassesPage = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    class_name: '',
    class_code: '',
    model_type: 'ONE_TO_ONE' as 'ONE_TO_ONE' | 'GROUP',
    attendance_source: 'LEARNING_SYSTEM' as 'LEARNING_SYSTEM' | 'ZOOM',
    level: '',
    active: true,
  });

  const fetchClasses = async () => {
    try {
      const data = await classesApi.list();
      setClasses(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Không thể tải danh sách lớp học');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const openModal = (cls?: Class) => {
    if (cls) {
      setEditingClass(cls);
      setFormData({
        class_name: cls.class_name,
        class_code: cls.class_code || '',
        model_type: cls.model_type,
        attendance_source: cls.attendance_source,
        level: cls.level || '',
        active: cls.active,
      });
    } else {
      setEditingClass(null);
      setFormData({
        class_name: '',
        class_code: '',
        model_type: 'ONE_TO_ONE',
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
    try {
      if (editingClass) {
        const payload: UpdateClassDTO = {
          class_name: formData.class_name,
          class_code: formData.class_code || undefined,
          model_type: formData.model_type,
          attendance_source: formData.attendance_source,
          level: formData.level || undefined,
          active: formData.active,
        };
        await classesApi.update(editingClass.id, payload);
      } else {
        const payload: CreateClassDTO = {
          class_name: formData.class_name,
          class_code: formData.class_code || undefined,
          model_type: formData.model_type,
          attendance_source: formData.attendance_source,
          level: formData.level || undefined,
        };
        await classesApi.create(payload);
      }
      closeModal();
      fetchClasses();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const columns: Column<Class>[] = [
    {
      header: 'Lớp học & Mã lớp',
      cell: (item) => (
        <div>
          <div className="font-semibold text-gray-900">{item.class_name}</div>
          <div className="text-gray-500 text-xs">{item.class_code || '—'}</div>
        </div>
      ),
    },
    { header: 'Cấp độ / Trình độ', accessorKey: 'level', cell: (item) => item.level || '—' },
    {
      header: 'Hình thức học',
      cell: (item) => (
        <Badge variant={item.model_type === 'GROUP' ? 'info' : 'neutral'}>
          {MODEL_LABELS[item.model_type] || item.model_type}
        </Badge>
      ),
    },
    {
      header: 'Nguồn điểm danh',
      cell: (item) => <span className="text-xs text-gray-600">{SOURCE_LABELS[item.attendance_source] || item.attendance_source}</span>,
    },
    {
      header: 'Giáo viên phụ trách',
      cell: (item) => {
        const main = item.class_teachers?.find((t) => t.role === 'MAIN')?.teacher;
        return main ? main.name : <span className="text-gray-400 italic">Chưa phân công</span>;
      },
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <Badge variant={item.active ? 'success' : 'danger'}>
          {item.active ? 'Đang mở' : 'Đã đóng'}
        </Badge>
      ),
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      cell: (item) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/classes/${item.id}/sessions`);
            }}
            title="Xem danh sách buổi học"
            className="flex items-center gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Buổi học</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openModal(item);
            }}
            title="Chỉnh sửa lớp học"
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
        title="Quản lý Lớp học"
        description="Quản lý danh sách lớp học, mô hình 1:1 hoặc nhóm, nguồn điểm danh và phân công giáo viên"
        actions={
          <Button onClick={() => openModal()} variant="primary" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Thêm lớp học mới
          </Button>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm">{error}</div>}

      <DataTable
        columns={columns}
        data={classes}
        isLoading={loading}
        emptyMessage="Chưa có lớp học nào trong hệ thống."
      />

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">
                {editingClass ? 'Chỉnh sửa Lớp học' : 'Tạo Lớp học Mới'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <Input
                label="Tên lớp học *"
                required
                value={formData.class_name}
                onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                placeholder="VD: Lớp Tiếng Nhật N5 - K01..."
              />
              <Input
                label="Mã lớp học"
                value={formData.class_code}
                onChange={(e) => setFormData({ ...formData, class_code: e.target.value })}
                placeholder="VD: JP_N5_01..."
              />
              <Input
                label="Trình độ / Level"
                value={formData.level}
                onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                placeholder="VD: N5, N4, Giao tiếp..."
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                    Hình thức lớp
                  </label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.model_type}
                    onChange={(e) => setFormData({ ...formData, model_type: e.target.value as any })}
                  >
                    <option value="ONE_TO_ONE">1 kèm 1</option>
                    <option value="GROUP">Lớp nhóm</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                    Nguồn điểm danh
                  </label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.attendance_source}
                    onChange={(e) => setFormData({ ...formData, attendance_source: e.target.value as any })}
                  >
                    <option value="LEARNING_SYSTEM">Hệ thống (LMS)</option>
                    <option value="ZOOM">Học qua Zoom</option>
                  </select>
                </div>
              </div>

              {editingClass && (
                <div className="flex items-center pt-2">
                  <input
                    id="class-active"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  />
                  <label htmlFor="class-active" className="ml-2 block text-xs font-medium text-gray-700">
                    Đang mở lớp hoạt động
                  </label>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>
                  Hủy
                </Button>
                <Button variant="primary" type="submit">
                  {editingClass ? 'Lưu thay đổi' : 'Tạo lớp học'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
