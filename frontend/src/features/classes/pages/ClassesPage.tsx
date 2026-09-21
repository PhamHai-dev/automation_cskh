import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { classesApi } from '../api/classes.api';
import { Class, CreateClassDTO, UpdateClassDTO } from '../types/classes.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { FilterBar } from '../../../components/common/FilterBar';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { Edit, Plus, Calendar, Search } from 'lucide-react';

const MODEL_LABELS: Record<string, string> = {
  ONE_TO_ONE: '1 kèm 1',
  GROUP: 'Lớp nhóm',
};

const SOURCE_LABELS: Record<string, string> = {
  LEARNING_SYSTEM: 'Hệ thống (LMS)',
  ZOOM: 'Học qua Zoom',
};

export const ClassesPage: React.FC = () => {
  const toast = useToast();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState('');
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
      setLoading(true);
      const data = await classesApi.list();
      setClasses(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách lớp học');
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
        toast.success('Cập nhật lớp học thành công!');
      } else {
        const payload: CreateClassDTO = {
          class_name: formData.class_name,
          class_code: formData.class_code || undefined,
          model_type: formData.model_type,
          attendance_source: formData.attendance_source,
          level: formData.level || undefined,
        };
        await classesApi.create(payload);
        toast.success('Tạo lớp học mới thành công!');
      }
      closeModal();
      fetchClasses();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  // Filtered classes
  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      const matchSearch =
        !searchTerm.trim() ||
        c.class_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.class_code && c.class_code.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchModel = !modelFilter || c.model_type === modelFilter;

      return matchSearch && matchModel;
    });
  }, [classes, searchTerm, modelFilter]);

  const activeFiltersCount = (searchTerm ? 1 : 0) + (modelFilter ? 1 : 0);

  const columns: Column<Class>[] = [
    {
      header: 'Lớp học & Mã lớp',
      cell: (item) => (
        <div>
          <div className="font-bold text-slate-900 text-xs">{item.class_name}</div>
          <div className="text-slate-500 font-mono text-[11px]">{item.class_code || '—'}</div>
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
      cell: (item) => <span className="text-xs text-slate-600">{SOURCE_LABELS[item.attendance_source] || item.attendance_source}</span>,
    },
    {
      header: 'Giáo viên phụ trách',
      cell: (item) => {
        const main = item.class_teachers?.find((t) => t.role === 'MAIN')?.teacher;
        return main ? (
          <span className="font-semibold text-slate-800 text-xs">{main.name}</span>
        ) : (
          <span className="text-slate-400 italic text-xs">Chưa phân công</span>
        );
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
        <div className="flex justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/classes/${item.id}/attendance`);
            }}
            title="Xem ma trận điểm danh theo ngày"
            className="flex items-center gap-1 text-xs text-teal-600 border-teal-200 hover:bg-teal-50"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Điểm danh</span>
          </Button>
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
            <Edit className="w-4 h-4 text-slate-500 hover:text-blue-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Lớp học"
        description="Quản lý danh sách lớp học, mô hình 1 kèm 1 hoặc lớp nhóm, nguồn điểm danh và phân công giáo viên"
        actions={
          <Button onClick={() => openModal()} variant="primary" size="sm" className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Thêm lớp học mới
          </Button>
        }
      />

      <FilterBar
        title="Tìm kiếm & Lọc lớp học"
        activeCount={activeFiltersCount}
        onClear={() => {
          setSearchTerm('');
          setModelFilter('');
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Tìm theo Tên hoặc Mã lớp</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nhập tên lớp..."
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Hình thức lớp</label>
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tất cả hình thức</option>
              <option value="ONE_TO_ONE">1 kèm 1</option>
              <option value="GROUP">Lớp nhóm</option>
            </select>
          </div>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filteredClasses}
        isLoading={loading}
        emptyMessage="Chưa có lớp học nào trong hệ thống."
      />

      {/* Modal Thêm/Sửa */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingClass ? 'Chỉnh sửa Lớp học' : 'Tạo Lớp học Mới'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={closeModal}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" form="class-form" type="submit">
              {editingClass ? 'Lưu thay đổi' : 'Tạo lớp học'}
            </Button>
          </div>
        }
      >
        <form id="class-form" onSubmit={handleSubmit} className="space-y-4">
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
            <Select
              label="Hình thức lớp"
              value={formData.model_type}
              onChange={(e) => setFormData({ ...formData, model_type: e.target.value as any })}
              options={[
                { value: 'ONE_TO_ONE', label: '1 kèm 1' },
                { value: 'GROUP', label: 'Lớp nhóm' },
              ]}
            />
            <Select
              label="Nguồn điểm danh"
              value={formData.attendance_source}
              onChange={(e) => setFormData({ ...formData, attendance_source: e.target.value as any })}
              options={[
                { value: 'LEARNING_SYSTEM', label: 'Hệ thống (LMS)' },
                { value: 'ZOOM', label: 'Học qua Zoom' },
              ]}
            />
          </div>

          {editingClass && (
            <div className="flex items-center pt-2">
              <input
                id="class-active"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <label htmlFor="class-active" className="ml-2 block text-xs font-semibold text-slate-700">
                Đang mở lớp hoạt động
              </label>
            </div>
          )}
        </form>
      </Modal>
    </PageContainer>
  );
};
