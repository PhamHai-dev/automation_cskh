import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { Edit, UserX, UserCheck, KeyRound } from 'lucide-react';

interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

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
      setError(err.response?.data?.message || 'Failed to fetch users');
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
    setFormData(prev => ({
      ...prev,
      roles: prev.roles.includes(role) 
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role]
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
      alert(err.response?.data?.message || 'Operation failed');
    }
  };

  const toggleUserStatus = async (user: User) => {
    if (!window.confirm(`Are you sure you want to ${user.active ? 'disable' : 'enable'} this user?`)) return;
    try {
      const action = user.active ? 'disable' : 'enable';
      await apiClient.post(`/settings/users/${user.id}/${action}`);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Operation failed');
    }
  };

  const revokeSessions = async (user: User) => {
    if (!window.confirm('Are you sure you want to revoke all active sessions for this user?')) return;
    try {
      await apiClient.post(`/settings/users/${user.id}/revoke-sessions`);
      alert('Sessions revoked successfully');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Operation failed');
    }
  };

  if (loading) return <div className="p-6">Loading users...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
        <button 
          onClick={() => openModal()}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add New User
        </button>
      </div>

      {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name / Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roles</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map(user => (
              <tr key={user.id} className={!user.active ? 'bg-gray-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{user.name}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-1">
                    {user.roles.map(role => (
                      <span key={role} className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {user.active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => openModal(user)} className="text-blue-600 hover:text-blue-900 mx-2" title="Edit">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => toggleUserStatus(user)} className={`${user.active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'} mx-2`} title={user.active ? 'Disable User' : 'Enable User'}>
                    {user.active ? <UserX size={18} /> : <UserCheck size={18} />}
                  </button>
                  <button onClick={() => revokeSessions(user)} className="text-yellow-600 hover:text-yellow-900 mx-2" title="Revoke Sessions">
                    <KeyRound size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">{editingUser ? 'Edit User' : 'Create User'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input required type="email" value={formData.email} disabled={!!editingUser} onChange={e => setFormData({...formData, email: e.target.value})} className="mt-1 w-full border rounded px-3 py-2 disabled:bg-gray-100" />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <input required minLength={6} type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="mt-1 w-full border rounded px-3 py-2" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Roles</label>
                <div className="space-y-2">
                  {['ADMIN', 'MANAGE', 'CS', 'TEACHER'].map(role => (
                    <label key={role} className="flex items-center">
                      <input type="checkbox" checked={formData.roles.includes(role)} onChange={() => handleRoleToggle(role)} className="mr-2" />
                      {role}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={closeModal} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={formData.roles.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
