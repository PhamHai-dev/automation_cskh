import React, { useEffect, useState } from 'react';
import { teachersApi } from '../api/teachers.api';
import { Teacher, CreateTeacherDTO, UpdateTeacherDTO } from '../types/teachers.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Edit, Plus } from 'lucide-react';

const TEACHER_TYPE_LABELS: Record<string, string> = {
  VIETNAMESE: 'Giáo viên Việt',
  JAPANESE: 'Giáo viên Bản ngữ',
  OTHER: 'Khác',
};

export const TeachersPage = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      const data = await teachersApi.list();
      setTeachers(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Không thể tải danh sách giáo viên');
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
      }
      closeModal();
      fetchTeachers();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const columns: Column<Teacher>[] = [
    {
      header: 'Họ tên & Email',
      cell: (item) => (
        <div>
          <div className="font-semibold text-gray-900">{item.name}</div>
          <div className="text-gray-500 text-xs">{item.email}</div>
        </div>
      ),
    },
    {
      header: 'Mã giáo viên',
      cell: (item) => item.teacher_profile?.teacher_code || '—',
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
            <Edit className="w-4 h-4" />
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
          <Button onClick={() => openModal()} variant="primary" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Thêm giáo viên mới
          </Button>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm">{error}</div>}

      <DataTable columns={columns} data={teachers} isLoading={loading} emptyMessage="Chưa có giáo viên nào trong hệ thống." />

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">
                {editingTeacher ? 'Chỉnh sửa Thông tin Giáo viên' : 'Thêm Giáo viên Mới'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
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
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                    Phân loại giáo viên
                  </label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.teacher_type}
                    onChange={(e) => setFormData({ ...formData, teacher_type: e.target.value as any })}
                  >
                    <option value="VIETNAMESE">Giáo viên Việt Nam</option>
                    <option value="JAPANESE">Giáo viên Bản ngữ</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </div>
              </div>

              {editingTeacher && (
                <div className="flex items-center pt-2">
                  <input
                    id="teacher-active"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  />
                  <label htmlFor="teacher-active" className="ml-2 block text-xs font-medium text-gray-700">
                    Đang tham gia giảng dạy
                  </label>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>
                  Hủy
                </Button>
                <Button variant="primary" type="submit">
                  {editingTeacher ? 'Lưu thay đổi' : 'Tạo giáo viên'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
