import React, { useEffect, useState } from 'react';
import { classesApi } from '../api/classes.api';
import { Class, CreateClassDTO, UpdateClassDTO } from '../types/classes.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Edit } from 'lucide-react';

export const ClassesPage = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({ 
    class_code: '', 
    class_name: '', 
    level: '', 
    model_type: 'ONE_TO_ONE' as 'ONE_TO_ONE' | 'GROUP', 
    attendance_source: 'LEARNING_SYSTEM' as 'LEARNING_SYSTEM' | 'ZOOM',
    active: true
  });

  const fetchClasses = async () => {
    try {
      const data = await classesApi.list();
      setClasses(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch classes');
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
        class_code: cls.class_code || '',
        class_name: cls.class_name,
        level: cls.level || '',
        model_type: cls.model_type,
        attendance_source: cls.attendance_source,
        active: cls.active
      });
    } else {
      setEditingClass(null);
      setFormData({ 
        class_code: '', class_name: '', level: '', model_type: 'ONE_TO_ONE', attendance_source: 'LEARNING_SYSTEM', active: true
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
        await classesApi.update(editingClass.id, formData as UpdateClassDTO);
      } else {
        await classesApi.create(formData as CreateClassDTO);
      }
      closeModal();
      fetchClasses();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Operation failed');
    }
  };

  const columns: Column<Class>[] = [
    { 
      header: 'Class', 
      cell: (item) => (
        <div>
          <div className="font-semibold">{item.class_name}</div>
          <div className="text-gray-500 text-xs">{item.class_code || '-'}</div>
        </div>
      )
    },
    { header: 'Level', accessorKey: 'level' },
    { 
      header: 'Type', 
      cell: (item) => (
        <Badge variant={item.model_type === 'GROUP' ? 'info' : 'neutral'}>
          {item.model_type.replace('_', ' ')}
        </Badge>
      )
    },
    { 
      header: 'Attendance Source', 
      cell: (item) => <span className="text-xs">{item.attendance_source}</span>
    },
    { 
      header: 'Teachers', 
      cell: (item) => {
        const main = item.class_teachers?.find(t => t.role === 'MAIN')?.teacher;
        return main ? main.name : <span className="text-gray-400 italic">None</span>;
      }
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
        title="Classes" 
        description="Manage classes, class models, and assignments."
        actions={
          <Button onClick={() => openModal()} variant="primary">
            Create Class
          </Button>
        }
      />

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">{error}</div>}

      <DataTable 
        columns={columns} 
        data={classes} 
        isLoading={loading}
        emptyMessage="No classes found."
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">{editingClass ? 'Edit Class' : 'Create Class'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-500">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <Input 
                label="Class Name *" 
                required 
                value={formData.class_name} 
                onChange={e => setFormData({...formData, class_name: e.target.value})} 
              />
              <Input 
                label="Class Code" 
                value={formData.class_code} 
                onChange={e => setFormData({...formData, class_code: e.target.value})} 
              />
              <Input 
                label="Level" 
                value={formData.level} 
                onChange={e => setFormData({...formData, level: e.target.value})} 
              />
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model Type</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.model_type}
                    onChange={e => setFormData({...formData, model_type: e.target.value as any})}
                  >
                    <option value="ONE_TO_ONE">1:1</option>
                    <option value="GROUP">Group</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Attendance</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.attendance_source}
                    onChange={e => setFormData({...formData, attendance_source: e.target.value as any})}
                  >
                    <option value="LEARNING_SYSTEM">LMS</option>
                    <option value="ZOOM">Zoom</option>
                  </select>
                </div>
              </div>

              {editingClass && (
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
                <Button variant="primary" type="submit">Save Class</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
