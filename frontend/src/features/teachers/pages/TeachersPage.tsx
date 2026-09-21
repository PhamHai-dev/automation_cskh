import React, { useEffect, useState, useMemo } from 'react';
import { teachersApi } from '../api/teachers.api';
import { Teacher, CreateTeacherDTO, UpdateTeacherDTO } from '../types/teachers.types';
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
import { Edit, Plus, Search } from 'lucide-react';

const TEACHER_TYPE_LABELS: Record<string, string> = {
  VIETNAMESE: 'Giáo viên Việt',
  JAPANESE: 'Giáo viên Bản ngữ',
  OTHER: 'Khác',
};

export const TeachersPage: React.FC = () => {
  const toast = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    phone: '',
    teacher_code: '',
    teacher_type: 'VIETNAMESE' as 'VIETNAMESE' | 'JAPANESE' | 'OTHER',
    active: true,
  });

  const fetchTeachers = async () => {
    try {
      setLoading(true);
      const data = await teachersApi.list();
      setTeachers(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách giáo viên');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const openModal = (teacher?: Teacher) => {
    if (teacher) {
      setEditingTeacher(teacher);
      setFormData({
        email: teacher.email,
        name: teacher.name,
        password: '',
        phone: teacher.phone || '',
        teacher_code: teacher.teacher_profile?.teacher_code || '',
        teacher_type: teacher.teacher_profile?.teacher_type || 'VIETNAMESE',
        active: teacher.active,
      });
    } else {
      setEditingTeacher(null);
      setFormData({
        email: '',
        name: '',
        password: '',
        phone: '',
        teacher_code: '',
        teacher_type: 'VIETNAMESE',
        active: true,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTeacher(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTeacher) {
        const payload: UpdateTeacherDTO = {
          name: formData.name,
          phone: formData.phone,
          teacher_code: formData.teacher_code,
          teacher_type: formData.teacher_type,
          active: formData.active,
        };
        await teachersApi.update(editingTeacher.id, payload);
        toast.success('Cập nhật thông tin giáo viên thành công!');
      } else {
        const payload: CreateTeacherDTO = {
          email: formData.email,
          name: formData.name,
          password: formData.password || 'Teacher@123',
          phone: formData.phone,
          teacher_code: formData.teacher_code,
          teacher_type: formData.teacher_type,
        };
        await teachersApi.create(payload);
        toast.success('Thêm giáo viên mới thành công!');
      }
      closeModal();
      fetchTeachers();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const matchSearch =
        !searchTerm.trim() ||
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.teacher_profile?.teacher_code &&
          t.teacher_profile.teacher_code.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchType = !typeFilter || t.teacher_profile?.teacher_type === typeFilter;

      return matchSearch && matchType;
    });
  }, [teachers, searchTerm, typeFilter]);

  const activeFiltersCount = (searchTerm ? 1 : 0) + (typeFilter ? 1 : 0);

  const columns: Column<Teacher>[] = [
    {
      header: 'Họ tên & Email',
      cell: (item) => (
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
            {item.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-xs">{item.name}</div>
            <div className="text-slate-500 text-[11px]">{item.email}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Mã giáo viên',
      cell: (item) => (
        <span className="font-mono text-xs text-slate-800 font-semibold">
          {item.teacher_profile?.teacher_code || '—'}
        </span>
      ),
    },
    {
      header: 'Phân loại GV',
      cell: (item) => {
        const type = item.teacher_profile?.teacher_type;
        return type ? <Badge variant="info">{TEACHER_TYPE_LABELS[type] || type}</Badge> : '—';
      },
    },
    {
      header: 'Số điện thoại',
      accessorKey: 'phone',
      cell: (item) => item.phone || '—',
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <Badge variant={item.active ? 'success' : 'danger'}>
          {item.active ? 'Đang giảng dạy' : 'Tạm ngừng'}
        </Badge>
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
            title="Chỉnh sửa thông tin"
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
        title="Quản lý Giáo viên"
        description="Quản lý danh sách giảng viên, thông tin liên hệ, mã giảng viên và phân loại giảng dạy"
        actions={
          <Button onClick={() => openModal()} variant="primary" size="sm" className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Thêm giáo viên mới
          </Button>
        }
      />

      <FilterBar
        title="Tìm kiếm & Lọc giáo viên"
        activeCount={activeFiltersCount}
        onClear={() => {
          setSearchTerm('');
          setTypeFilter('');
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Tìm theo Tên, Email hoặc Mã GV</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nhập tên giáo viên..."
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Phân loại giáo viên</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tất cả phân loại</option>
              <option value="VIETNAMESE">Giáo viên Việt</option>
              <option value="JAPANESE">Giáo viên Bản ngữ</option>
              <option value="OTHER">Khác</option>
            </select>
          </div>
        </div>
      </FilterBar>

      <DataTable columns={columns} data={filteredTeachers} isLoading={loading} emptyMessage="Chưa có giáo viên nào trong hệ thống." />

      {/* Modal Thêm/Sửa */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingTeacher ? 'Chỉnh sửa Thông tin Giáo viên' : 'Thêm Giáo viên Mới'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={closeModal}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" form="teacher-form" type="submit">
              {editingTeacher ? 'Lưu thay đổi' : 'Tạo giáo viên'}
            </Button>
          </div>
        }
      >
        <form id="teacher-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Họ và tên giáo viên *"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="VD: Thầy John Smith, Cô Mai..."
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Địa chỉ Email *"
              required
              type="email"
              disabled={!!editingTeacher}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="teacher@example.com"
            />
            <Input
              label="Số điện thoại"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0901234567"
            />
          </div>

          {!editingTeacher && (
            <Input
              label="Mật khẩu khởi tạo"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Mặc định: Teacher@123"
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Mã giáo viên"
              value={formData.teacher_code}
              onChange={(e) => setFormData({ ...formData, teacher_code: e.target.value })}
              placeholder="VD: GV_01, GV_JP_02..."
            />
            <Select
              label="Phân loại giáo viên"
              value={formData.teacher_type}
              onChange={(e) => setFormData({ ...formData, teacher_type: e.target.value as any })}
              options={[
                { value: 'VIETNAMESE', label: 'Giáo viên Việt Nam' },
                { value: 'JAPANESE', label: 'Giáo viên Bản ngữ' },
                { value: 'OTHER', label: 'Khác' },
              ]}
            />
          </div>

          {editingTeacher && (
            <div className="flex items-center pt-2">
              <input
                id="teacher-active"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <label htmlFor="teacher-active" className="ml-2 block text-xs font-semibold text-slate-700">
                Đang tham gia giảng dạy
              </label>
            </div>
          )}
        </form>
      </Modal>
    </PageContainer>
  );
};
