import React, { useEffect, useState, useMemo } from 'react';
import { apiClient } from '../../api/client';
import { PageContainer } from '../../components/common/PageContainer';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { FilterBar } from '../../components/common/FilterBar';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { Edit, UserX, UserCheck, KeyRound, Plus, Search, AlertTriangle, Shield } from 'lucide-react';

interface User {
  id: number;
  code?: string | null;
  display_label?: string;
  name: string;
  email: string;
  phone?: string | null;
  staff_code?: string | null;
  roles: string[];
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  MANAGE: 'Quản lý nhóm',
  CS: 'Nhân viên CSKH',
  TEACHER: 'Giáo viên',
};

export const UsersPage: React.FC = () => {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToToggleStatus, setUserToToggleStatus] = useState<User | null>(null);
  const [userToRevokeSessions, setUserToRevokeSessions] = useState<User | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    staff_code: '',
    roles: [] as string[],
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/settings/users');
      setUsers(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openModal = (user?: User) => {
    if (user) {
      const unifiedCode = user.code || user.staff_code || '';
      setEditingUser(user);
      setFormData({
        code: unifiedCode,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        password: '',
        staff_code: unifiedCode.toUpperCase(),
        roles: user.roles,
      });
    } else {
      setEditingUser(null);
      setFormData({ code: '', name: '', email: '', phone: '', password: '', staff_code: '', roles: ['CS'] });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleRoleToggle = (role: string) => {
    setFormData((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const normalizedCode = formData.code.trim().toUpperCase();
      const syncedStaffCode = normalizedCode || formData.staff_code.trim().toUpperCase() || null;
      if (editingUser) {
        await apiClient.patch(`/settings/users/${editingUser.id}`, {
          code: normalizedCode || undefined,
          name: formData.name,
          phone: formData.phone || undefined,
          staff_code: syncedStaffCode,
          roles: formData.roles,
        });
        toast.success('Cập nhật tài khoản người dùng thành công!');
      } else {
        await apiClient.post('/settings/users', {
          ...formData,
          code: normalizedCode || undefined,
          phone: formData.phone || undefined,
          staff_code: syncedStaffCode,
        });
        toast.success('Tạo tài khoản người dùng mới thành công!');
      }
      closeModal();
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Thao tác không thành công');
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!userToToggleStatus) return;
    try {
      const action = userToToggleStatus.active ? 'disable' : 'enable';
      await apiClient.post(`/settings/users/${userToToggleStatus.id}/${action}`);
      toast.success(`Đã ${userToToggleStatus.active ? 'khóa' : 'kích hoạt'} tài khoản ${userToToggleStatus.name}`);
      setUserToToggleStatus(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Thao tác không thành công');
    }
  };

  const handleConfirmRevokeSessions = async () => {
    if (!userToRevokeSessions) return;
    try {
      await apiClient.post(`/settings/users/${userToRevokeSessions.id}/revoke-sessions`);
      toast.success(`Đã thu hồi toàn bộ phiên đăng nhập của ${userToRevokeSessions.name}`);
      setUserToRevokeSessions(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Thao tác không thành công');
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.code && u.code.toLowerCase().includes(q)) ||
        (u.staff_code && u.staff_code.toLowerCase().includes(q)) ||
        (u.display_label && u.display_label.toLowerCase().includes(q));

      const matchRole = !roleFilter || u.roles.includes(roleFilter);

      return matchSearch && matchRole;
    });
  }, [users, searchTerm, roleFilter]);

  const activeFiltersCount = (searchTerm ? 1 : 0) + (roleFilter ? 1 : 0);

  const columns: Column<User>[] = [
    {
      header: 'Mã NV / ID',
      cell: (item) => {
        const displayCode = item.code || item.staff_code;
        return displayCode ? (
          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md text-xs">
            {displayCode}
          </span>
        ) : (
          <span className="font-mono text-slate-400 text-xs">#{item.id}</span>
        );
      },
    },
    {
      header: 'Họ tên & Email',
      cell: (item) => (
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
            {item.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-xs">{item.name}</div>
            <div className="text-slate-500 text-[11px]">
              {item.email}
              {item.phone ? ` · ${item.phone}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Vai trò',
      cell: (item) => (
        <div className="flex flex-wrap gap-1">
          {item.roles.map((role) => (
            <Badge key={role} variant="info">
              {ROLE_LABELS[role] || role}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <Badge variant={item.active ? 'success' : 'danger'}>
          {item.active ? 'Đang hoạt động' : 'Đã khóa'}
        </Badge>
      ),
    },
    {
      header: 'Lần đăng nhập cuối',
      cell: (item) => (
        <span className="text-xs text-slate-500">
          {item.last_login_at ? new Date(item.last_login_at).toLocaleString('vi-VN') : 'Chưa từng đăng nhập'}
        </span>
      ),
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      cell: (item) => (
        <div className="flex justify-end items-center gap-1">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setUserToToggleStatus(item);
            }}
            className={item.active ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}
            title={item.active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
          >
            {item.active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setUserToRevokeSessions(item);
            }}
            className="text-amber-600 hover:bg-amber-50"
            title="Thu hồi phiên đăng nhập"
          >
            <KeyRound className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Người dùng & Phân quyền"
        actions={
          <Button
            onClick={() => openModal()}
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Thêm người dùng mới
          </Button>
        }
      />

      <>
        <FilterBar
          title="Tìm kiếm & Lọc người dùng"
          activeCount={activeFiltersCount}
          onClear={() => {
            setSearchTerm('');
            setRoleFilter('');
          }}
            gridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end"
          >
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                Tìm theo Tên hoặc Email
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nhập tên hoặc email..."
                  className="w-full h-9 pl-9 pr-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                Vai trò
              </label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition cursor-pointer"
              >
                <option value="">Tất cả vai trò</option>
                <option value="ADMIN">Quản trị viên (ADMIN)</option>
                <option value="MANAGE">Quản lý nhóm (MANAGE)</option>
                <option value="CS">Nhân viên CSKH (CS)</option>
                <option value="TEACHER">Giáo viên (TEACHER)</option>
              </select>
            </div>
          </FilterBar>

          <DataTable
            columns={columns}
            data={filteredUsers}
            isLoading={loading}
            emptyMessage="Không tìm thấy người dùng nào phù hợp."
          />
      </>

      {/* Modal Thêm/Sửa */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingUser ? 'Chỉnh sửa Tài khoản' : 'Tạo Tài khoản Mới'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={closeModal}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" form="user-form" type="submit" disabled={formData.roles.length === 0}>
              {editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </Button>
          </div>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Input
                label="Họ và tên *"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Trần Thị Hải Yến"
              />
            </div>
            <div>
              <Input
                label="Mã nhân viên / Mã CSKH"
                value={formData.code}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, code: val, staff_code: val.toUpperCase() });
                }}
                placeholder={formData.roles.includes('CS') ? 'Tự động: CSKH01...' : 'Tùy chọn'}
              />
            </div>
          </div>
          {formData.roles.includes('CS') && (
            <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
              Định dạng hiển thị chuẩn CSKH:{' '}
              <strong>
                {formData.name.trim() || 'Họ và tên'} -{' '}
                {formData.code.trim().toUpperCase() || 'CSKHxx (tự động cấp từ 01)'}
              </strong>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Địa chỉ Email *"
              required
              type="email"
              disabled={!!editingUser}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="user@example.com"
            />
            <Input
              label="Số điện thoại"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0912345678"
            />
          </div>
          {!editingUser && (
            <Input
              label="Mật khẩu khởi tạo *"
              required
              minLength={6}
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Tối thiểu 6 ký tự"
            />
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2 flex items-center">
              <Shield className="w-3.5 h-3.5 mr-1 text-blue-600" />
              Phân quyền vai trò hệ thống *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['ADMIN', 'MANAGE', 'CS', 'TEACHER'].map((role) => (
                <label
                  key={role}
                  className={`flex items-center gap-2 p-2.5 border rounded-xl text-xs cursor-pointer transition ${
                    formData.roles.includes(role)
                      ? 'border-blue-500 bg-blue-50/60 font-semibold text-blue-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.roles.includes(role)}
                    onChange={() => handleRoleToggle(role)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{ROLE_LABELS[role] || role}</span>
                </label>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Toggle Status Confirmation Modal */}
      <Modal
        isOpen={userToToggleStatus !== null}
        onClose={() => setUserToToggleStatus(null)}
        title={userToToggleStatus?.active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setUserToToggleStatus(null)}>
              Hủy
            </Button>
            <Button
              variant={userToToggleStatus?.active ? 'danger' : 'primary'}
              size="sm"
              onClick={handleConfirmToggleStatus}
            >
              {userToToggleStatus?.active ? 'Khóa tài khoản' : 'Mở khóa'}
            </Button>
          </div>
        }
      >
        <div className="flex items-start space-x-3 text-xs text-slate-700">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p>
            Bạn có chắc chắn muốn {userToToggleStatus?.active ? 'khóa' : 'mở khóa'} tài khoản{' '}
            <strong>{userToToggleStatus?.name}</strong> ({userToToggleStatus?.email})?
          </p>
        </div>
      </Modal>

      {/* Revoke Sessions Confirmation Modal */}
      <Modal
        isOpen={userToRevokeSessions !== null}
        onClose={() => setUserToRevokeSessions(null)}
        title="Thu hồi phiên đăng nhập"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setUserToRevokeSessions(null)}>
              Hủy
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmRevokeSessions}>
              Thu hồi tất cả
            </Button>
          </div>
        }
      >
        <div className="flex items-start space-x-3 text-xs text-slate-700">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p>
            Bạn có chắc chắn muốn thu hồi toàn bộ phiên đăng nhập hiện tại của{' '}
            <strong>{userToRevokeSessions?.name}</strong>? Người dùng sẽ phải đăng nhập lại từ đầu trên mọi thiết bị.
          </p>
        </div>
      </Modal>
    </PageContainer>
  );
};
