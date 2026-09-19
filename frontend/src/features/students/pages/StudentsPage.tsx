import React, { useEffect, useState } from 'react';
import { studentsApi } from '../api/students.api';
import { Student, CreateStudentDTO, UpdateStudentDTO } from '../types/students.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Edit } from 'lucide-react';

export const StudentsPage = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({ 
    full_name: '', phone: '', email: '', gender: '', date_of_birth: '', occupation: '', note: ''
  });

  const fetchStudents = async () => {
    try {
      const data = await studentsApi.list();
      setStudents(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch students');
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
        full_name: student.full_name,
        phone: student.phone || '',
        email: student.email || '',
        gender: student.gender || '',
        date_of_birth: student.date_of_birth ? new Date(student.date_of_birth).toISOString().split('T')[0] : '',
        occupation: student.occupation || '',
        note: student.note || ''
      });
    } else {
      setEditingStudent(null);
      setFormData({ 
        full_name: '', phone: '', email: '', gender: '', date_of_birth: '', occupation: '', note: ''
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
      const payload = {
        ...formData,
        date_of_birth: formData.date_of_birth || undefined
      };
      
      if (editingStudent) {
        await studentsApi.update(editingStudent.id, payload as UpdateStudentDTO);
      } else {
        await studentsApi.create(payload as CreateStudentDTO);
      }
      closeModal();
      fetchStudents();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Operation failed');
    }
  };

  const columns: Column<Student>[] = [
    { header: 'Full Name', accessorKey: 'full_name', className: 'font-semibold' },
    { header: 'Phone', accessorKey: 'phone' },
    { header: 'Email', accessorKey: 'email' },
    { header: 'Gender', accessorKey: 'gender' },
    { 
      header: 'DOB', 
      cell: (item) => item.date_of_birth ? new Date(item.date_of_birth).toLocaleDateString() : '-' 
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
        title="Students" 
        description="Manage students information and database."
        actions={
          <Button onClick={() => openModal()} variant="primary">
            Add Student
          </Button>
        }
      />

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">{error}</div>}

      <DataTable 
        columns={columns} 
        data={students} 
        isLoading={loading}
        emptyMessage="No students found."
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">{editingStudent ? 'Edit Student' : 'Add Student'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-500">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <Input 
                label="Full Name *" 
                required 
                value={formData.full_name} 
                onChange={e => setFormData({...formData, full_name: e.target.value})} 
              />
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Phone" 
                  value={formData.phone} 
                  onChange={e => setFormData({...formData, phone: e.target.value})} 
                />
                <Input 
                  label="Email" 
                  type="email"
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.gender}
                    onChange={e => setFormData({...formData, gender: e.target.value})}
                  >
                    <option value="">Select...</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <Input 
                  label="Date of Birth" 
                  type="date"
                  value={formData.date_of_birth} 
                  onChange={e => setFormData({...formData, date_of_birth: e.target.value})} 
                />
              </div>
              <Input 
                label="Occupation" 
                value={formData.occupation} 
                onChange={e => setFormData({...formData, occupation: e.target.value})} 
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea 
                  className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={formData.note} 
                  onChange={e => setFormData({...formData, note: e.target.value})} 
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>Cancel</Button>
                <Button variant="primary" type="submit">Save Student</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
