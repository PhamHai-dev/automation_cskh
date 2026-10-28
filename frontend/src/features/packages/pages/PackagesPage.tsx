import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { packagesApi } from '../api/packages.api';
import { Package, CreatePackageDTO, UpdatePackageDTO } from '../types/packages.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { FilterBar } from '../../../components/common/FilterBar';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useQuery, invalidateQueries } from '../../../hooks/useQuery';
import { Edit, Plus, Search } from 'lucide-react';

export const PackagesPage: React.FC = () => {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 300);
  const [page, setPage] = useState<number>(() => Math.max(1, Number(searchParams.get('page')) || 1));
  const [pageSize, setPageSize] = useState<number>(
    () => Math.max(1, Number(searchParams.get('pageSize')) || 25)
  );

  useEffect(() => {
    const q = searchParams.get('search') || '';
    if (q !== searchTerm) {
      setSearchTerm(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isFirstFilterRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstFilterRenderRef.current) {
      isFirstFilterRenderRef.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (searchTerm.trim()) {
      next.set('search', searchTerm.trim());
    } else {
      next.delete('search');
    }
    if (page > 1) next.set('page', String(page));
    else next.delete('page');
    if (pageSize !== 25) next.set('pageSize', String(pageSize));
    else next.delete('pageSize');

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [searchTerm, page, pageSize, searchParams, setSearchParams]);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
    }),
    [page, pageSize, debouncedSearch]
  );

  const {
    data: paginatedResult,
    isLoading: loading,
  } = useQuery({
    queryKey: ['packages', 'paginated', queryParams],
    queryFn: (signal) => packagesApi.listPaginated(queryParams, signal),
    staleTime: 5 * 60 * 1000,
    keepPreviousData: true,
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách gói học');
    },
  });

  const packages = useMemo(() => paginatedResult?.data || [], [paginatedResult]);
  const meta = paginatedResult?.meta;

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
        toast.success('Cập nhật gói học thành công!');
      } else {
        const payload: CreatePackageDTO = {
          code: formData.code,
          name: formData.name,
          default_total_sessions: formData.default_total_sessions ? parseInt(formData.default_total_sessions, 10) : undefined,
          description: formData.description,
        };
        await packagesApi.create(payload);
        toast.success('Tạo gói học mới thành công!');
      }
      closeModal();
      invalidateQueries('packages');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Thao tác không thành công');
    }
  };

  const columns: Column<Package>[] = [
    { header: 'Mã gói', accessorKey: 'code', className: 'font-bold text-slate-900 text-xs' },
    { header: 'Tên gói học', accessorKey: 'name', cell: (item) => <span className="font-semibold text-xs text-slate-800">{item.name || '—'}</span> },
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
            <Edit className="w-4 h-4 text-slate-500 hover:text-blue-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Gói học"
        actions={
          <Button
            onClick={() => openModal()}
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Thêm gói học mới
          </Button>
        }
      />

      <FilterBar
        title="Tìm kiếm gói học"
        activeCount={searchTerm ? 1 : 0}
        onClear={() => setSearchTerm('')}
        gridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end"
      >
        <div className="max-w-md">
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Tìm theo Mã hoặc Tên gói
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nhập mã gói hoặc tên gói..."
              className="w-full h-9 pl-9 pr-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-xs transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={packages}
        isLoading={loading}
        serverPagination={true}
        page={page}
        pageSize={pageSize}
        total={meta?.total ?? packages.length}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        emptyMessage="Chưa có gói học nào trong hệ thống."
      />

      {/* Modal Thêm/Sửa */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingPackage ? 'Chỉnh sửa Gói học' : 'Thêm Gói học Mới'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={closeModal}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" form="package-form" type="submit">
              {editingPackage ? 'Lưu thay đổi' : 'Tạo gói học'}
            </Button>
          </div>
        }
      >
        <form id="package-form" onSubmit={handleSubmit} className="space-y-4">
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
          <Textarea
            label="Mô tả / Ghi chú"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Mô tả nội dung chương trình học..."
            rows={3}
          />

          {editingPackage && (
            <div className="flex items-center pt-2">
              <input
                id="package-active"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <label htmlFor="package-active" className="ml-2 block text-xs font-semibold text-slate-700">
                Đang hoạt động (Áp dụng cho ghi danh mới)
              </label>
            </div>
          )}
        </form>
      </Modal>
    </PageContainer>
  );
};
