import React, { useEffect, useState } from 'react';
import { packagesApi } from '../api/packages.api';
import { Package, CreatePackageDTO, UpdatePackageDTO } from '../types/packages.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Edit } from 'lucide-react';

export const PackagesPage = () => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({ 
    code: '', 
    name: '', 
    default_total_sessions: '',
    description: '',
    active: true
  });

  const fetchPackages = async () => {
    try {
      const data = await packagesApi.list();
      setPackages(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to fetch packages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  const openModal = (pkg?: Package) => {
    if (pkg) {
      setEditingPackage(pkg);
      setFormData({ 
        code: pkg.code, 
        name: pkg.name || '', 
        default_total_sessions: pkg.default_total_sessions ? String(pkg.default_total_sessions) : '',
        description: pkg.description || '',
        active: pkg.active
      });
    } else {
      setEditingPackage(null);
      setFormData({ code: '', name: '', default_total_sessions: '', description: '', active: true });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPackage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        default_total_sessions: formData.default_total_sessions ? parseInt(formData.default_total_sessions) : undefined
      };

      if (editingPackage) {
        await packagesApi.update(editingPackage.id, payload as UpdatePackageDTO);
      } else {
        await packagesApi.create(payload as CreatePackageDTO);
      }
      closeModal();
      fetchPackages();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Operation failed');
    }
  };

  const columns: Column<Package>[] = [
    { header: 'Code', accessorKey: 'code', className: 'font-semibold' },
    { header: 'Name', accessorKey: 'name' },
    { 
      header: 'Default Sessions', 
      cell: (item) => item.default_total_sessions ? `${item.default_total_sessions} sessions` : 'N/A' 
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
        title="Packages" 
        description="Manage study packages and default configurations."
        actions={
          <Button onClick={() => openModal()} variant="primary">
            Create Package
          </Button>
        }
      />

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">{error}</div>}

      <DataTable 
        columns={columns} 
        data={packages} 
        isLoading={loading}
        emptyMessage="No packages found."
      />

      {/* Basic Modal Implementation */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">{editingPackage ? 'Edit Package' : 'Create Package'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-500">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Input 
                label="Package Code *" 
                required 
                value={formData.code} 
                onChange={e => setFormData({...formData, code: e.target.value})} 
                placeholder="e.g. PKG_IELTS_1"
              />
              <Input 
                label="Package Name" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                placeholder="e.g. IELTS Foundation"
              />
              <Input 
                label="Default Total Sessions" 
                type="number" 
                min="1"
                value={formData.default_total_sessions} 
                onChange={e => setFormData({...formData, default_total_sessions: e.target.value})} 
              />
              
              {editingPackage && (
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

              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" type="button" onClick={closeModal}>Cancel</Button>
                <Button variant="primary" type="submit">Save Package</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
