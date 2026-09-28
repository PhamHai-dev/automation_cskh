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
import { Edit, Plus, Calendar, Search, Sparkles } from 'lucide-react';

const MODEL_CONFIG: Record<string, { label: string; className: string }> = {
  '1:1': { label: '1:1', className: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' },
  '1:2': { label: '1:2', className: 'bg-purple-50 text-purple-700 border-purple-200 font-bold' },
  '1:n': { label: '1:n', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' },
  ONE_TO_ONE: { label: '1:1', className: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' },
  ONE_TO_TWO: { label: '1:2', className: 'bg-purple-50 text-purple-700 border-purple-200 font-bold' },
  ONE_TO_N: { label: '1:n', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' },
  GROUP: { label: '1:n', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' },
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
    model_type: '1:1' as '1:1' | '1:2' | '1:n',
    attendance_source: 'LEARNING_SYSTEM' as 'LEARNING_SYSTEM' | 'ZOOM',
    level: '',
    active: true,
  });

  const generateRandomCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = 'CLS_';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

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
      const normalizedModel =
        cls.model_type === 'ONE_TO_TWO' || cls.model_type === '1:2'
          ? '1:2'
          : cls.model_type === 'ONE_TO_N' || cls.model_type === '1:n' || cls.model_type === 'GROUP'
          ? '1:n'
          : '1:1';

      setFormData({
        class_name: cls.class_name,
        class_code: cls.class_code || '',
        model_type: normalizedModel,
        attendance_source: cls.attendance_source,
        level: cls.level || '',
        active: cls.active,
      });
    } else {
      setEditingClass(null);
      setFormData({
        class_name: '',
        class_code: '',
        model_type: '1:1',
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
    if (!formData.class_name.trim()) {
      toast.warning('Vui lòng nhập tên lớp học.');
      return;
    }
    if (!formData.model_type) {
      toast.warning('Vui lòng chọn mô hình lớp.');
      return;
    }

    try {
      if (editingClass) {
        const payload: UpdateClassDTO = {
          class_name: formData.class_name.trim(),
          class_code: formData.class_code.trim() || undefined,
          model_type: formData.model_type,
          attendance_source: formData.attendance_source,
          level: formData.level.trim() || undefined,
          active: formData.active,
        };
        await classesApi.update(editingClass.id, payload);
        toast.success('Cập nhật lớp học thành công!');
      } else {
        const payload: CreateClassDTO = {
          class_name: formData.class_name.trim(),
          class_code: formData.class_code.trim() || undefined,
          model_type: formData.model_type,
          attendance_source: formData.attendance_source,
          level: formData.level.trim() || undefined,
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

      const modelNormalized =
        c.model_type === 'ONE_TO_ONE'
          ? '1:1'
          : c.model_type === 'ONE_TO_TWO'
          ? '1:2'
          : c.model_type === 'ONE_TO_N' || c.model_type === 'GROUP'
          ? '1:n'
          : c.model_type;

      const matchModel = !modelFilter || modelNormalized === modelFilter || c.model_type === modelFilter;

      return matchSearch && matchModel;
    });
  }, [classes, searchTerm, modelFilter]);

  const activeFiltersCount = (searchTerm ? 1 : 0) + (modelFilter ? 1 : 0);

  // Table columns structured per requirement:
  // "mã lớp, Tên lớp, Trình độ, Mô hình, Nguồn điểm danh, Giáo viên"
  const columns: Column<Class>[] = [
    {
      header: 'mã lớp',
      cell: (item) => (
        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200/80 shadow-2xs">
          {item.class_code || '—'}
        </span>
      ),
    },
    {
      header: 'Tên lớp',
      cell: (item) => (
        <div>
          <div className="font-bold text-slate-900 text-xs hover:text-blue-600 transition-colors">
            {item.class_name}
          </div>
        </div>
      ),
    },
    {
      header: 'Trình độ',
      accessorKey: 'level',
      cell: (item) => <span className="text-xs text-slate-700 font-medium">{item.level || '—'}</span>,
    },
    {
      header: 'Mô hình',
      cell: (item) => {
        const conf = MODEL_CONFIG[item.model_type] || {
          label: item.model_type || '1:1',
          className: 'bg-slate-100 text-slate-700 border-slate-200 font-bold',
        };
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${conf.className}`}>
            {conf.label}
          </span>
        );
      },
    },
    {
      header: 'Nguồn điểm danh',
      cell: (item) => (
        <span className="text-xs text-slate-600 font-medium">
          {SOURCE_LABELS[item.attendance_source] || item.attendance_source}
        </span>
      ),
    },
    {
      header: 'Giáo viên',
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
            leftIcon={<Calendar className="w-3.5 h-3.5" />}
            className="text-xs text-teal-600 border-teal-200 hover:bg-teal-50"
          >
            Điểm danh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/classes/${item.id}/sessions`);
            }}
            title="Xem danh sách buổi học"
            leftIcon={<Calendar className="w-3.5 h-3.5" />}
            className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            Buổi học
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openModal(item);
            }}
            leftIcon={<Edit className="w-4 h-4 text-slate-500 hover:text-blue-600" />}
            title="Chỉnh sửa lớp học"
          />
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Lớp học"
        actions={
          <Button
            onClick={() => openModal()}
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
          >
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
        gridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end"
      >
        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Tìm theo Tên hoặc Mã lớp
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nhập tên hoặc mã lớp..."
              className="w-full h-9 pl-9 pr-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Mô hình lớp
          </label>
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
          >
            <option value="">Tất cả mô hình</option>
            <option value="1:1">1:1</option>
            <option value="1:2">1:2</option>
            <option value="1:n">1:n</option>
          </select>
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

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">Mã lớp học (ID lớp)</label>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, class_code: generateRandomCode() }))}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                title="Tạo mã ngẫu nhiên dạng CLS_XXXXXX"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tạo mã ngẫu nhiên</span>
              </button>
            </div>
            <Input
              value={formData.class_code}
              onChange={(e) => setFormData({ ...formData, class_code: e.target.value })}
              placeholder="Để trống để hệ thống tự tạo ngẫu nhiên (VD: CLS_X7K9P2)..."
            />
            <p className="text-[11px] text-slate-500 mt-1">
              * Nếu không nhập mã, hệ thống sẽ tự động tạo mã ngẫu nhiên duy nhất khi lưu.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Mô hình lớp *"
              required
              value={formData.model_type}
              onChange={(e) => setFormData({ ...formData, model_type: e.target.value as any })}
              options={[
                { value: '1:1', label: '1:1' },
                { value: '1:2', label: '1:2' },
                { value: '1:n', label: '1:n' },
              ]}
            />
            <Input
              label="Trình độ / Level"
              value={formData.level}
              onChange={(e) => setFormData({ ...formData, level: e.target.value })}
              placeholder="VD: N5, N4, Giao tiếp..."
            />
          </div>

          <Select
            label="Nguồn điểm danh"
            value={formData.attendance_source}
            onChange={(e) => setFormData({ ...formData, attendance_source: e.target.value as any })}
            options={[
              { value: 'LEARNING_SYSTEM', label: 'Hệ thống (LMS)' },
              { value: 'ZOOM', label: 'Học qua Zoom' },
            ]}
          />

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
