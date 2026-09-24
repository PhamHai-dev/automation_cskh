import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { automationApi } from '../api/automation.api';
import type { AutomationWorkflow } from '../types/automation.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { Plus, Zap, Search, Pencil, Trash2, Power, Users, ListChecks } from 'lucide-react';

export const AutomationWorkflowsPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();

  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create/Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationWorkflow | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AutomationWorkflow | null>(null);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const res = await automationApi.listWorkflows({ search: search || undefined, limit: 100 });
      setWorkflows(res.items);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách automation workflow');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '' });
    setIsModalOpen(true);
  };

  const openEdit = (wf: AutomationWorkflow) => {
    setEditing(wf);
    setForm({ name: wf.name, description: wf.description ?? '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.warning('Vui lòng nhập tên workflow');
      return;
    }
    try {
      setSubmitting(true);
      if (editing) {
        await automationApi.updateWorkflow(editing.id, { name: form.name, description: form.description });
        toast.success('Đã cập nhật workflow');
      } else {
        await automationApi.createWorkflow({ name: form.name, description: form.description });
        toast.success('Đã tạo workflow mới');
      }
      setIsModalOpen(false);
      fetchWorkflows();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (wf: AutomationWorkflow) => {
    try {
      await automationApi.updateWorkflow(wf.id, { active: !wf.active });
      toast.success(wf.active ? 'Đã tắt workflow' : 'Đã bật workflow');
      fetchWorkflows();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thay đổi trạng thái');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await automationApi.deleteWorkflow(deleteTarget.id);
      toast.success('Đã xóa workflow');
      setDeleteTarget(null);
      fetchWorkflows();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa workflow');
    }
  };

  const columns: Column<AutomationWorkflow>[] = [
    {
      header: 'Workflow',
      cell: (item) => (
        <button
          className="text-left flex items-start gap-3 group"
          onClick={() => navigate(`/automation/${item.id}`)}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white shadow-sm shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-text-primary group-hover:text-primary transition-colors">
              {item.name}
            </div>
            <div className="text-xs text-text-muted line-clamp-1 max-w-md">
              {item.description || 'Không có mô tả'}
            </div>
          </div>
        </button>
      ),
    },
    {
      header: 'Cụm trigger',
      cell: (item) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
          <ListChecks className="w-3.5 h-3.5 text-primary" />
          {item._count?.steps ?? 0} cụm
        </span>
      ),
    },
    {
      header: 'Học viên áp dụng',
      cell: (item) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
          <Users className="w-3.5 h-3.5 text-primary" />
          {item._count?.enrollments ?? 0} HV
        </span>
      ),
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${item.active
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${item.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {item.active ? 'Đang chạy' : 'Tạm tắt'}
        </span>
      ),
    },
    {
      header: 'Người tạo',
      cell: (item) => item.owner?.name || `CS #${item.owner_cs_id}`,
    },
    {
      header: 'Cập nhật',
      cell: (item) => new Date(item.updated_at).toLocaleDateString('vi-VN'),
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      cell: (item) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(item);
            }}
            title="Chỉnh sửa"
          >
            <Pencil className="w-4 h-4 text-slate-500 hover:text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleActive(item);
            }}
            title={item.active ? 'Tắt' : 'Bật'}
          >
            <Power className={`w-4 h-4 ${item.active ? 'text-emerald-500' : 'text-slate-400'}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(item);
            }}
            title="Xóa"
          >
            <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Automation Workflow"
        description="Tạo luồng tự động gửi tin Zalo theo kết quả điểm danh từng buổi học (A/B/C/D/E)"
        actions={
          <div className="flex gap-2">
            <Button onClick={fetchWorkflows} variant="outline" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Làm mới
            </Button>
            <Button onClick={openCreate} variant="primary" className="flex items-center gap-2" leftIcon={<Plus className="w-4 h-4" />}>
              Tạo workflow
            </Button>
          </div>
        }
      />

      {/* Info banner */}
      <div className="mb-5 p-4 bg-surface rounded-2xl border border-border/80 shadow-soft text-xs text-text-secondary leading-relaxed">
        <strong className="text-text-primary">Cách hoạt động:</strong> Mỗi workflow gồm nhiều <strong>cụm trigger</strong> — mỗi cụm = 1 buổi học (session) + 1 event điểm danh (Có mặt / Vắng A / Nghỉ B / Vắng C / GV vắng D / Lỗi E) + thời gian delay (gửi sau bao lâu) + nội dung tin nhắn (hỗ trợ biến <code className="bg-surface-muted px-1 py-0.5 rounded text-primary font-mono">{'{{student_name}}'}</code>,{' '}
        <code className="bg-surface-muted px-1 py-0.5 rounded text-primary font-mono">{'{{session_number}}'}</code>...). Sau đó thêm học viên vào workflow để áp dụng.
      </div>

      {/* Search */}
      <div className="mb-4 w-full sm:w-80">
        <Input
          placeholder="Tìm workflow theo tên..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4 text-text-muted" />}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fetchWorkflows();
          }}
        />
      </div>

      <DataTable
        data={workflows}
        columns={columns}
        isLoading={loading}
        emptyMessage="Chưa có automation workflow nào. Bấm 'Tạo workflow' để bắt đầu."
        onRowClick={(item) => navigate(`/automation/${item.id}`)}
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Chỉnh sửa workflow' : 'Tạo workflow mới'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Tên workflow *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: Chăm sóc sau buổi học"
            required
          />
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Mô tả</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Mô tả mục đích workflow..."
              rows={3}
              className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-text-muted/70"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border/80">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" isLoading={submitting}>
              {editing ? 'Lưu thay đổi' : 'Tạo workflow'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-soft-xl w-full max-w-sm overflow-hidden border border-border/80">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-text-primary mb-2">Xóa workflow?</h3>
              <p className="text-sm text-text-secondary">
                Workflow <strong>{deleteTarget.name}</strong> và toàn bộ cụm trigger, học viên áp dụng sẽ bị xóa vĩnh viễn.
              </p>
            </div>
            <div className="px-6 py-3 bg-surface-subtle/50 border-t border-border/80 flex justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Hủy
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Xóa workflow
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
