import React, { useEffect, useState } from 'react';
import { enrollmentsApi } from '../api/enrollments.api';
import { Enrollment, CreateEnrollmentDTO, UpdateEnrollmentDTO } from '../types/enrollments.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Edit } from 'lucide-react';

export const EnrollmentsPage = () => {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({ 
    student_id: '', 
    package_id: '', 
    cs_id: '', 
    total_sessions: '',
    start_date: '',
    end_date: '',
    status: 'NOT_STARTED' as 'NOT_STARTED' | 'STUDYING' | 'PAUSED' | 'FINISHED' | 'CANCELLED'
  });

  const fetchEnrollments = async () => {
    try {
      const data = await enrollmentsApi.list();
      setEnrollments(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch enrollments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollments();
  }, []);

  const openModal = (enrollment?: Enrollment) => {
    if (enrollment) {
      setEditingEnrollment(enrollment);
      setFormData({ 
        student_id: String(enrollment.student_id),
        package_id: enrollment.package_id ? String(enrollment.package_id) : '',
        cs_id: String(enrollment.cs_id),
        total_sessions: String(enrollment.total_sessions),
        start_date: enrollment.start_date ? new Date(enrollment.start_date).toISOString().split('T')[0] : '',
        end_date: enrollment.end_date ? new Date(enrollment.end_date).toISOString().split('T')[0] : '',
        status: enrollment.status
      });
    } else {
      setEditingEnrollment(null);
      setFormData({ 
        student_id: '', package_id: '', cs_id: '', total_sessions: '', start_date: '', end_date: '', status: 'NOT_STARTED'
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEnrollment(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEnrollment) {
        const payload: UpdateEnrollmentDTO = {
          package_id: formData.package_id ? parseInt(formData.package_id) : undefined,
          total_sessions: parseInt(formData.total_sessions),
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
          status: formData.status
        };
        await enrollmentsApi.update(editingEnrollment.id, payload);
      } else {
        const payload: CreateEnrollmentDTO = {
          student_id: parseInt(formData.student_id),
          package_id: formData.package_id ? parseInt(formData.package_id) : undefined,
          cs_id: parseInt(formData.cs_id),
          total_sessions: parseInt(formData.total_sessions),
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined
        };
        await enrollmentsApi.create(payload);
      }
      closeModal();
      fetchEnrollments();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Operation failed');
    }
  };

  const columns: Column<Enrollment>[] = [
    { 
      header: 'Student', 
      cell: (item) => (
        <div>
          <div className="font-semibold">{item.student?.full_name || `ID: ${item.student_id}`}</div>
          <div className="text-gray-500 text-xs">{item.student?.phone}</div>
        </div>
      )
    },
    { 
      header: 'Package', 
      cell: (item) => item.package ? item.package.name : <span className="text-gray-400 italic">None</span>
    },
    { 
      header: 'Sessions', 
      accessorKey: 'total_sessions'
    },
    { 
      header: 'Status', 
      cell: (item) => {
        let variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' = 'neutral';
        switch (item.status) {
          case 'STUDYING': variant = 'success'; break;
          case 'PAUSED': variant = 'warning'; break;
          case 'CANCELLED': variant = 'danger'; break;
          case 'FINISHED': variant = 'info'; break;
        }
        return <Badge variant={variant}>{item.status.replace('_', ' ')}</Badge>;
      }
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
        title="Enrollments" 
        description="Manage student enrollments, statuses, and CS assignments."
        actions={
          <Button onClick={() => openModal()} variant="primary">
            Create Enrollment
          </Button>
        }
      />

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">{error}</div>}

      <DataTable 
        columns={columns} 
        data={enrollments} 
        isLoading={loading}
        emptyMessage="No enrollments found."
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">{editingEnrollment ? 'Edit Enrollment' : 'Create Enrollment'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-500">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {!editingEnrollment && (
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="Student ID *" 
                    required 
                    type="number"
                    value={formData.student_id} 
                    onChange={e => setFormData({...formData, student_id: e.target.value})} 
                  />
                  <Input 
                    label="CS ID *" 
                    required 
                    type="number"
                    value={formData.cs_id} 
                    onChange={e => setFormData({...formData, cs_id: e.target.value})} 
                  />
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Package ID" 
                  type="number"
                  value={formData.package_id} 
                  onChange={e => setFormData({...formData, package_id: e.target.value})} 
                />
                <Input 
                  label="Total Sessions *" 
                  required
                  type="number"
                  value={formData.total_sessions} 
                  onChange={e => setFormData({...formData, total_sessions: e.target.value})} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Start Date" 
                  type="date"
                  value={formData.start_date} 
                  onChange={e => setFormData({...formData, start_date: e.target.value})} 
                />
                <Input 
                  label="End Date" 
                  type="date"
                  value={formData.end_date} 
                  onChange={e => setFormData({...formData, end_date: e.target.value})} 
                />
              </div>

              {editingEnrollment && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value as any})}
                  >
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="STUDYING">Studying</option>
                    <option value="PAUSED">Paused</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="FINISHED">Finished</option>
                  </select>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>Cancel</Button>
                <Button variant="primary" type="submit">Save Enrollment</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
