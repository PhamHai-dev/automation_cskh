import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { Edit, UserX, UserCheck, KeyRound, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface User {
  id: number;
  name: string;
  email: string;
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

export const UsersPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form states
  const [formData, setFormData] = useState({ name: '', email: '', password: '', roles: [] as string[] });

  const fetchUsers = async () => {
    try {
      const res = await apiClient.get('/settings/users');
      setUsers(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thể tải danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({ name: user.name, email: user.email, password: '', roles: user.roles });
    } else {
      setEditingUser(null);
      setFormData({ name: '', email: '', password: '', roles: ['CS'] });
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
      if (editingUser) {
        await apiClient.patch(`/settings/users/${editingUser.id}`, {
          name: formData.name,
          roles: formData.roles,
        });
      } else {
        await apiClient.post('/settings/users', formData);
      }
      closeModal();
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Thao tác không thành công');
    }
  };

  const toggleUserStatus = async (user: User) => {
    const actionText = user.active ? 'khóa' : 'mở khóa';
    if (!window.confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản ${user.name}?`)) return;
    try {
      const action = user.active ? 'disable' : 'enable';
      await apiClient.post(`/settings/users/${user.id}/${action}`);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Thao tác không thành công');
    }
  };

  const revokeSessions = async (user: User) => {
    if (!window.confirm(`Bạn có chắc chắn muốn thu hồi toàn bộ phiên đăng nhập của ${user.name}?`)) return;
    try {
      await apiClient.post(`/settings/users/${user.id}/revoke-sessions`);
      alert('Đã thu hồi phiên đăng nhập thành công');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Thao tác không thành công');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Đang tải danh sách người dùng...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Người dùng & Phân quyền</h1>
          <p className="text-sm text-gray-500">Quản trị danh sách nhân viên, gán vai trò và quản lý trạng thái tài khoản</p>
        </div>
        <Button onClick={() => openModal()} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Thêm người dùng mới
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50/80">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Họ tên / Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Vai trò (Roles)
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Trạng thái
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Lần đăng nhập cuối
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className={`hover:bg-gray-50/60 transition-colors ${!user.active ? 'bg-gray-50/80' : ''}`}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-semibold text-gray-900">{user.name}</div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <span
                        key={role}
                        className="px-2 py-0.5 inline-flex text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {ROLE_LABELS[role] || role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2.5 py-0.5 inline-flex text-xs font-semibold rounded-full ${
                      user.active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {user.active ? 'Đang hoạt động' : 'Đã khóa'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                  {user.last_login_at
                    ? new Date(user.last_login_at).toLocaleString('vi-VN')
                    : 'Chưa từng đăng nhập'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => openModal(user)}
                    className="text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50 transition"
                    title="Chỉnh sửa thông tin"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => toggleUserStatus(user)}
                    className={`p-1.5 rounded transition ${
                      user.active
                        ? 'text-rose-600 hover:text-rose-800 hover:bg-rose-50'
                        : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                    }`}
                    title={user.active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                  >
                    {user.active ? <UserX size={16} /> : <UserCheck size={16} />}
                  </button>
                  <button
                    onClick={() => revokeSessions(user)}
                    className="text-amber-600 hover:text-amber-800 p-1.5 rounded hover:bg-amber-50 transition"
                    title="Thu hồi phiên đăng nhập"
                  >
                    <KeyRound size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-2">
              {editingUser ? 'Chỉnh sửa Tài khoản' : 'Tạo Tài khoản Mới'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                  Họ và tên
                </label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nguyễn Văn A"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                  Địa chỉ Email
                </label>
                <input
                  required
                  type="email"
                  value={formData.email}
                  disabled={!!editingUser}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                    Mật khẩu khởi tạo
                  </label>
                  <input
                    required
                    minLength={6}
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">
                  Phân quyền Vai trò
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['ADMIN', 'MANAGE', 'CS', 'TEACHER'].map((role) => (
                    <label key={role} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg text-xs cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={formData.roles.includes(role)}
                        onChange={() => handleRoleToggle(role)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{ROLE_LABELS[role] || role}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>
                  Hủy
                </Button>
                <Button type="submit" disabled={formData.roles.length === 0}>
                  {editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
