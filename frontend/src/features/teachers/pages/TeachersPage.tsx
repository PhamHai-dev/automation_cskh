import React, { useEffect, useState } from 'react';
import { teachersApi } from '../api/teachers.api';
import { Teacher, CreateTeacherDTO, UpdateTeacherDTO } from '../types/teachers.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Edit } from 'lucide-react';

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
    active: true
  });

  const fetchTeachers = async () => {
    try {
      const data = await teachersApi.list();
      setTeachers(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch teachers');
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
        active: teacher.active
      });
    } else {
      setEditingTeacher(null);
      setFormData({ 
        email: '', name: '', password: '', phone: '', teacher_code: '', teacher_type: 'VIETNAMESE', active: true 
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
          active: formData.active
        };
        await teachersApi.update(editingTeacher.id, payload);
      } else {
        const payload: CreateTeacherDTO = {
          email: formData.email,
          name: formData.name,
          password: formData.password || undefined,
          phone: formData.phone,
          teacher_code: formData.teacher_code,
          teacher_type: formData.teacher_type
        };
        await teachersApi.create(payload);
      }
      closeModal();
      fetchTeachers();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Operation failed');
    }
  };

  const columns: Column<Teacher>[] = [
    { 
      header: 'Teacher', 
      cell: (item) => (
        <div>
          <div className="font-semibold">{item.name}</div>
          <div className="text-gray-500 text-xs">{item.email}</div>
        </div>
      )
    },
    { 
      header: 'Code', 
      cell: (item) => item.teacher_profile?.teacher_code || '-' 
    },
    { 
      header: 'Type', 
      cell: (item) => {
        const type = item.teacher_profile?.teacher_type;
        return type ? <Badge variant="info">{type}</Badge> : '-';
      }
    },
    { 
      header: 'Phone', 
      accessorKey: 'phone'
    },
    { 
      header: 'Status', 
      cell: (item) => (
        <Badge variant={item.active ? 'success' : 'danger'}>
          {item.active ? 'Active' : 'Inactive'}
        </Badge>
      ) 
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (item) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openModal(item); }}>
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <PageContainer>
      <PageHeader 
        title="Teachers" 
        description="Manage teachers and their profiles."
        actions={
          <Button onClick={() => openModal()} variant="primary">
            Add Teacher
          </Button>
        }
      />

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">{error}</div>}

      <DataTable 
        columns={columns} 
        data={teachers} 
        isLoading={loading}
        emptyMessage="No teachers found."
      />

      {/* Basic Modal Implementation */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">{editingTeacher ? 'Edit Teacher' : 'Add Teacher'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-500">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <Input 
                label="Full Name *" 
                required 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
              />
              <Input 
                label="Email *" 
                type="email"
                required 
                disabled={!!editingTeacher}
                value={formData.email} 
                onChange={e => setFormData({...formData, email: e.target.value})} 
              />
              {!editingTeacher && (
                <Input 
                  label="Password" 
                  type="password"
                  placeholder="Leave blank to auto-generate"
                  value={formData.password} 
                  onChange={e => setFormData({...formData, password: e.target.value})} 
                />
              )}
              <Input 
                label="Phone" 
                value={formData.phone} 
                onChange={e => setFormData({...formData, phone: e.target.value})} 
              />
              <Input 
                label="Teacher Code" 
                value={formData.teacher_code} 
                onChange={e => setFormData({...formData, teacher_code: e.target.value})} 
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teacher Type</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.teacher_type}
                  onChange={e => setFormData({...formData, teacher_type: e.target.value as any})}
                >
                  <option value="VIETNAMESE">Vietnamese</option>
                  <option value="JAPANESE">Japanese</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              
              {editingTeacher && (
                <div className="flex items-center mt-4">
                  <input
                    id="active-status"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                    checked={formData.active}
                    onChange={(e) => setFormData({...formData, active: e.target.checked})}
                  />
                  <label htmlFor="active-status" className="ml-2 block text-sm text-gray-900">
                    Active Status
                  </label>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>Cancel</Button>
                <Button variant="primary" type="submit">Save Teacher</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
