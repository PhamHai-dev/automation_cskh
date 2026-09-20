import React, { useEffect, useState } from 'react';
import { studentsApi } from '../api/students.api';
import { Student, CreateStudentDTO, UpdateStudentDTO } from '../types/students.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Edit, Plus } from 'lucide-react';

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Nam',
  FEMALE: 'Nữ',
  OTHER: 'Khác',
};

export const StudentsPage = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    external_id: '',
    full_name: '',
    phone: '',
    email: '',
    gender: 'OTHER' as 'MALE' | 'FEMALE' | 'OTHER',
    date_of_birth: '',
    parent_name: '',
    parent_phone: '',
    school: '',
    occupation: '',
    zalo_uid: '',
    note: '',
  });

  const fetchStudents = async () => {
    try {
      const data = await studentsApi.list();
      setStudents(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Không thể tải danh sách học viên');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const openModal = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      setFormData({
        external_id: student.external_id || '',
        full_name: student.full_name,
        phone: student.phone || '',
        email: student.email || '',
        gender: (student.gender as any) || 'OTHER',
        date_of_birth: student.date_of_birth ? new Date(student.date_of_birth).toISOString().split('T')[0] : '',
        parent_name: student.parent_name || '',
        parent_phone: student.parent_phone || '',
        school: student.school || '',
        occupation: student.occupation || '',
        zalo_uid: student.zalo_uid || '',
        note: student.note || '',
      });
    } else {
      setEditingStudent(null);
      setFormData({
        external_id: '',
        full_name: '',
        phone: '',
        email: '',
        gender: 'OTHER',
        date_of_birth: '',
        parent_name: '',
        parent_phone: '',
        school: '',
        occupation: '',
        zalo_uid: '',
        note: '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingStudent(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStudent) {
        const payload: UpdateStudentDTO = {
          ...formData,
          date_of_birth: formData.date_of_birth || undefined,
        };
        await studentsApi.update(editingStudent.id, payload);
      } else {
        const payload: CreateStudentDTO = {
          ...formData,
          date_of_birth: formData.date_of_birth || undefined,
        };
        await studentsApi.create(payload);
      }
      closeModal();
      fetchStudents();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const columns: Column<Student>[] = [
    {
      header: 'Học viên & Mã định danh',
      cell: (item) => (
        <div>
          <div className="font-semibold text-gray-900">{item.full_name}</div>
          <div className="text-gray-500 text-xs">{item.external_id || `ID: ${item.id}`}</div>
        </div>
      ),
    },
    { header: 'Số điện thoại', accessorKey: 'phone', cell: (item) => item.phone || '—' },
    { header: 'Địa chỉ Email', accessorKey: 'email', cell: (item) => item.email || '—' },
    {
      header: 'Giới tính',
      cell: (item) => (item.gender ? GENDER_LABELS[item.gender] || item.gender : '—'),
    },
    {
      header: 'Ngày sinh',
      cell: (item) => (item.date_of_birth ? new Date(item.date_of_birth).toLocaleDateString('vi-VN') : '—'),
    },
    {
      header: 'Zalo UID',
      cell: (item) => item.zalo_uid || '—',
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
        title="Quản lý Học viên"
        description="Quản lý cơ sở dữ liệu học viên, phụ huynh, thông tin liên lạc và định danh hệ thống"
        actions={
          <Button onClick={() => openModal()} variant="primary" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Thêm học viên mới
          </Button>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm">{error}</div>}

      <DataTable
        columns={columns}
        data={students}
        isLoading={loading}
        emptyMessage="Chưa có học viên nào trong danh sách."
      />

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">
                {editingStudent ? 'Chỉnh sửa Thông tin Học viên' : 'Thêm Học viên Mới'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Họ và tên học viên *"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Nguyễn Văn A"
                />
                <Input
                  label="Mã học viên (External ID)"
                  value={formData.external_id}
                  onChange={(e) => setFormData({ ...formData, external_id: e.target.value })}
                  placeholder="VD: HV_001, MS1234..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Số điện thoại"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0901234567"
                />
                <Input
                  label="Địa chỉ Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="hocvien@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                    Giới tính
                  </label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                  >
                    <option value="MALE">Nam</option>
                    <option value="FEMALE">Nữ</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </div>
                <Input
                  label="Ngày sinh"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Tên phụ huynh"
                  value={formData.parent_name}
                  onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                  placeholder="Phụ huynh em..."
                />
                <Input
                  label="SĐT phụ huynh"
                  value={formData.parent_phone}
                  onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                  placeholder="0987654321"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Trường học / Nơi làm việc"
                  value={formData.school}
                  onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                  placeholder="Trường / Cơ quan..."
                />
                <Input
                  label="Zalo UID"
                  value={formData.zalo_uid}
                  onChange={(e) => setFormData({ ...formData, zalo_uid: e.target.value })}
                  placeholder="Định danh Zalo..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                  Ghi chú hồ sơ
                </label>
                <textarea
                  className="flex min-h-[70px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="Ghi chú về học viên..."
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>
                  Hủy
                </Button>
                <Button variant="primary" type="submit">
                  {editingStudent ? 'Lưu thay đổi' : 'Tạo học viên'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
