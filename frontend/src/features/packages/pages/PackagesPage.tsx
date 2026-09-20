import React, { useEffect, useState } from 'react';
import { packagesApi } from '../api/packages.api';
import { Package, CreatePackageDTO, UpdatePackageDTO } from '../types/packages.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Edit, Plus } from 'lucide-react';

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
    active: true,
  });

  const fetchPackages = async () => {
    try {
      const data = await packagesApi.list();
      setPackages(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Không thể tải danh sách gói học');
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
        active: pkg.active,
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
      if (editingPackage) {
        const payload: UpdatePackageDTO = {
          name: formData.name,
          default_total_sessions: formData.default_total_sessions ? parseInt(formData.default_total_sessions, 10) : undefined,
          description: formData.description,
          active: formData.active,
        };
        await packagesApi.update(editingPackage.id, payload);
      } else {
        const payload: CreatePackageDTO = {
          code: formData.code,
          name: formData.name,
          default_total_sessions: formData.default_total_sessions ? parseInt(formData.default_total_sessions, 10) : undefined,
          description: formData.description,
        };
        await packagesApi.create(payload);
      }
      closeModal();
      fetchPackages();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const columns: Column<Package>[] = [
    { header: 'Mã gói', accessorKey: 'code', className: 'font-semibold text-gray-900' },
    { header: 'Tên gói học', accessorKey: 'name' },
    {
      header: 'Số buổi định mức',
      cell: (item) => (item.default_total_sessions ? `${item.default_total_sessions} buổi` : '—'),
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <Badge variant={item.active ? 'success' : 'danger'}>
          {item.active ? 'Đang hoạt động' : 'Ngừng áp dụng'}
        </Badge>
      ),
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
            title="Chỉnh sửa"
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
        title="Quản lý Gói học"
        description="Cấu hình danh mục các gói học, số buổi học định mức và trạng thái áp dụng"
        actions={
          <Button onClick={() => openModal()} variant="primary" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Thêm gói học mới
          </Button>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm">{error}</div>}

      <DataTable columns={columns} data={packages} isLoading={loading} emptyMessage="Chưa có gói học nào trong hệ thống." />

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">{editingPackage ? 'Chỉnh sửa Gói học' : 'Thêm Gói học Mới'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Input
                label="Mã gói học (Code) *"
                required
                disabled={!!editingPackage}
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="VD: PKG_10_BUOI, PKG_20_BUOI..."
              />
              <Input
                label="Tên gói học"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="VD: Gói Giao tiếp cơ bản 10 buổi..."
              />
              <Input
                label="Số buổi học định mức"
                type="number"
                min={1}
                value={formData.default_total_sessions}
                onChange={(e) => setFormData({ ...formData, default_total_sessions: e.target.value })}
                placeholder="VD: 10, 20, 30..."
              />
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                  Mô tả / Ghi chú
                </label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Mô tả nội dung chương trình học..."
                />
              </div>

              {editingPackage && (
                <div className="flex items-center pt-2">
                  <input
                    id="package-active"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  />
                  <label htmlFor="package-active" className="ml-2 block text-xs font-medium text-gray-700">
                    Đang hoạt động (Áp dụng cho ghi danh mới)
                  </label>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={closeModal}>
                  Hủy
                </Button>
                <Button variant="primary" type="submit">
                  {editingPackage ? 'Lưu thay đổi' : 'Tạo gói học'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
