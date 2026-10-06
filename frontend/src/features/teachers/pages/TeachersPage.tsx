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
import { Edit, Plus, Search, UserPlus, Key } from 'lucide-react';

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
  const [accountStatusFilter, setAccountStatusFilter] = useState('');

  // Modal states: Edit / Create Teacher Info
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  // Modal states: Provision Account
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
  const [provisioningTeacher, setProvisioningTeacher] = useState<Teacher | null>(null);
  const [provisionEmail, setProvisionEmail] = useState('');
  const [provisionPassword, setProvisionPassword] = useState('123456');
  const [isProvisioning, setIsProvisioning] = useState(false);

  // Form states: Teacher Info
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    phone: '',
    email: '',
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
        code: teacher.code,
        name: teacher.name,
        phone: teacher.phone || '',
        email: teacher.email || '',
        teacher_type: teacher.teacher_type || 'VIETNAMESE',
        active: teacher.active,
      });
    } else {
      setEditingTeacher(null);
      setFormData({
        code: '',
        name: '',
        phone: '',
        email: '',
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

  const openProvisionModal = (teacher: Teacher) => {
    setProvisioningTeacher(teacher);
    setProvisionEmail(teacher.email || `${teacher.code.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`);
    setProvisionPassword('123456');
    setIsProvisionModalOpen(true);
  };

  const closeProvisionModal = () => {
    setIsProvisionModalOpen(false);
    setProvisioningTeacher(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTeacher) {
        const payload: UpdateTeacherDTO = {
          code: formData.code,
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          teacher_type: formData.teacher_type,
          active: formData.active,
        };
        await teachersApi.update(editingTeacher.id, payload);
        toast.success('Cập nhật thông tin giáo viên thành công!');
      } else {
        const payload: CreateTeacherDTO = {
          code: formData.code,
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          teacher_type: formData.teacher_type,
          active: formData.active,
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

  const handleProvisionAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provisioningTeacher) return;
    try {
      setIsProvisioning(true);
      await teachersApi.provisionAccount(provisioningTeacher.id, {
        email: provisionEmail.trim(),
        password: provisionPassword || '123456',
      });
      toast.success(`Đã cấp tài khoản đăng nhập thành công cho ${provisioningTeacher.name}!`);
      closeProvisionModal();
      fetchTeachers();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Cấp tài khoản không thành công');
    } finally {
      setIsProvisioning(false);
    }
  };

  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const matchSearch =
        !searchTerm.trim() ||
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.email && t.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.phone && t.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.user?.email && t.user.email.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchType = !typeFilter || t.teacher_type === typeFilter;

      let matchAccount = true;
      if (accountStatusFilter === 'PROVISIONED') {
        matchAccount = Boolean(t.user);
      } else if (accountStatusFilter === 'UNPROVISIONED') {
        matchAccount = !t.user;
      }

      return matchSearch && matchType && matchAccount;
    });
  }, [teachers, searchTerm, typeFilter, accountStatusFilter]);

  const activeFiltersCount =
    (searchTerm ? 1 : 0) + (typeFilter ? 1 : 0) + (accountStatusFilter ? 1 : 0);

  const columns: Column<Teacher>[] = [
    {
      header: 'Họ tên Giáo viên',
      cell: (item) => (
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
            {item.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-xs">{item.name}</div>
            {item.email && <div className="text-slate-500 text-[11px]">{item.email}</div>}
          </div>
        </div>
      ),
    },
    {
      header: 'Mã giáo viên',
      cell: (item) => (
        <span className="font-mono text-xs text-slate-800 font-semibold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          {item.code || '—'}
        </span>
      ),
    },
    {
      header: 'Phân loại GV',
      cell: (item) => {
        const type = item.teacher_type;
        return type ? <Badge variant="info">{TEACHER_TYPE_LABELS[type] || type}</Badge> : '—';
      },
    },
    {
      header: 'Số điện thoại',
      accessorKey: 'phone',
      cell: (item) => item.phone || '—',
    },
    {
      header: 'Tài khoản đăng nhập',
      cell: (item) => {
        if (item.user) {
          return (
            <div className="flex flex-col gap-0.5">
              <Badge variant="success" size="sm">Đã cấp tài khoản</Badge>
              <span className="text-[11px] text-slate-600 font-mono">{item.user.email}</span>
            </div>
          );
        }
        return (
          <Badge variant="neutral" size="sm">Chưa cấp tài khoản</Badge>
        );
      },
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
        <div className="flex justify-end items-center gap-1.5">
          {!item.user && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openProvisionModal(item);
              }}
              className="text-xs h-7 px-2 text-teal-700 border-teal-300 hover:bg-teal-50"
              title="Cấp tài khoản đăng nhập"
              leftIcon={<Key className="w-3.5 h-3.5" />}
            >
              Cấp TK
            </Button>
          )}
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
        description="Quản lý danh sách hồ sơ giáo viên giảng dạy và cấp tài khoản đăng nhập vào hệ thống."
        actions={
          <Button
            onClick={() => openModal()}
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
          >
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
          setAccountStatusFilter('');
        }}
        gridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end"
      >
        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Tìm theo Tên, Email hoặc Mã GV
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nhập tên giáo viên..."
              className="w-full h-9 pl-9 pr-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Phân loại giáo viên
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
          >
            <option value="">Tất cả phân loại</option>
            <option value="VIETNAMESE">Giáo viên Việt</option>
            <option value="JAPANESE">Giáo viên Bản ngữ</option>
            <option value="OTHER">Khác</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Trạng thái tài khoản
          </label>
          <select
            value={accountStatusFilter}
            onChange={(e) => setAccountStatusFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="PROVISIONED">Đã cấp tài khoản</option>
            <option value="UNPROVISIONED">Chưa cấp tài khoản</option>
          </select>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filteredTeachers}
        isLoading={loading}
        emptyMessage="Không tìm thấy giáo viên nào phù hợp"
      />

      {/* Modal Thêm / Sửa Hồ sơ Giáo viên */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingTeacher ? 'Chỉnh sửa hồ sơ giáo viên' : 'Thêm hồ sơ giáo viên mới'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mã giáo viên <span className="text-slate-400 font-normal">(bỏ trống để tự sinh)</span>
            </label>
            <Input
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="VD: GV33, GV426, GV_MATSUO..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Họ tên giáo viên <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nhập họ và tên giáo viên"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email liên hệ <span className="text-slate-400 font-normal">(không bắt buộc)</span>
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Số điện thoại <span className="text-slate-400 font-normal">(không bắt buộc)</span>
            </label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0912345678"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Phân loại giáo viên
            </label>
            <Select
              value={formData.teacher_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  teacher_type: e.target.value as 'VIETNAMESE' | 'JAPANESE' | 'OTHER',
                })
              }
              options={[
                { value: 'VIETNAMESE', label: 'Giáo viên Việt' },
                { value: 'JAPANESE', label: 'Giáo viên Bản ngữ' },
                { value: 'OTHER', label: 'Khác' },
              ]}
            />
          </div>

          {editingTeacher && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="teacher-active-checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 text-primary rounded border-slate-300"
              />
              <label htmlFor="teacher-active-checkbox" className="text-sm font-medium text-slate-700">
                Đang còn giảng dạy
              </label>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={closeModal}>
              Hủy
            </Button>
            <Button type="submit" variant="primary">
              {editingTeacher ? 'Lưu thay đổi' : 'Tạo hồ sơ'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Cấp tài khoản đăng nhập */}
      <Modal
        isOpen={isProvisionModalOpen}
        onClose={closeProvisionModal}
        title={`Cấp tài khoản đăng nhập cho ${provisioningTeacher?.name || 'Giáo viên'}`}
      >
        <form onSubmit={handleProvisionAccount} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-lg leading-relaxed">
            Giáo viên sẽ sử dụng Email và Mật khẩu dưới đây để đăng nhập vào hệ thống CRM và theo dõi danh sách lớp học của mình.
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email đăng nhập <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              required
              value={provisionEmail}
              onChange={(e) => setProvisionEmail(e.target.value)}
              placeholder="giaovien@gmail.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mật khẩu khởi tạo <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              required
              value={provisionPassword}
              onChange={(e) => setProvisionPassword(e.target.value)}
              placeholder="VD: 123456"
            />
            <p className="text-xs text-slate-500 mt-1">Mặc định: 123456 (Giáo viên có thể đổi sau khi đăng nhập)</p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={closeProvisionModal}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" isLoading={isProvisioning} leftIcon={<UserPlus className="w-4 h-4" />}>
              Xác nhận cấp tài khoản
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
