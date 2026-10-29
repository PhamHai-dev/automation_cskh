import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { automationApi } from '../api/automation.api';
import type { AutomationWorkflow, AssignableCsUser } from '../types/automation.types';
import { BroadcastCampaignsPanel } from '../components/BroadcastCampaignsPanel';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { HorizontalTabs, HorizontalTabItem } from '../../../components/ui/HorizontalTabs';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Plus,
  Zap,
  Search,
  Pencil,
  Trash2,
  Power,
  Users,
  ListChecks,
  RefreshCw,
  Send,
  CalendarClock,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';

type AutomationWorkspaceMode = 'workflows' | 'broadcast';

export const AutomationWorkflowsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdminOrManage = useMemo(
    () => Boolean(user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE')),
    [user?.roles],
  );
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialMode = useMemo<AutomationWorkspaceMode>(() => {
    const tabParam = (searchParams.get('tab') || '').toLowerCase();
    if (tabParam === 'broadcast' || tabParam === 'broadcasts' || tabParam === 'campaigns') {
      return 'broadcast';
    }
    return 'workflows';
  }, [searchParams]);

  const [mode, setMode] = useState<AutomationWorkspaceMode>(initialMode);
  const [broadcastCreateTrigger, setBroadcastCreateTrigger] = useState(0);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleModeChange = (nextMode: AutomationWorkspaceMode) => {
    setMode(nextMode);
    const nextParams = new URLSearchParams(searchParams);
    if (nextMode === 'broadcast') {
      nextParams.set('tab', 'broadcast');
    } else {
      nextParams.delete('tab');
    }
    setSearchParams(nextParams, { replace: true });
  };

  // ─── Event Trigger Workflows State ──────────────────────────────────────────
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [csUsers, setCsUsers] = useState<AssignableCsUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create/Edit modal (Admin / Manage)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationWorkflow | null>(null);
  const [form, setForm] = useState<{
    name: string;
    description: string;
    assigned_cs_ids: number[];
  }>({ name: '', description: '', assigned_cs_ids: [] });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AutomationWorkflow | null>(null);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const res = await automationApi.listWorkflows({ search: search || undefined, limit: 100 });
      setWorkflows(res.items);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách kịch bản tự động');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
    if (isAdminOrManage) {
      automationApi
        .listCsUsers()
        .then((res) => setCsUsers(res.items))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminOrManage]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      description: '',
      assigned_cs_ids: csUsers.map((u) => u.id),
    });
    setIsModalOpen(true);
  };

  const openEdit = (wf: AutomationWorkflow) => {
    setEditing(wf);
    setForm({
      name: wf.name,
      description: wf.description ?? '',
      assigned_cs_ids: wf.assigned_cs_ids ?? [],
    });
    setIsModalOpen(true);
  };

  const toggleCsIdInForm = (csId: number) => {
    setForm((prev) => ({
      ...prev,
      assigned_cs_ids: prev.assigned_cs_ids.includes(csId)
        ? prev.assigned_cs_ids.filter((id) => id !== csId)
        : [...prev.assigned_cs_ids, csId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.warning('Vui lòng nhập tên kịch bản');
      return;
    }
    try {
      setSubmitting(true);
      if (editing) {
        await automationApi.updateWorkflow(editing.id, {
          name: form.name,
          description: form.description,
          assigned_cs_ids: form.assigned_cs_ids,
        });
        toast.success('Đã lưu cập nhật kịch bản & phân quyền CSKH');
      } else {
        await automationApi.createWorkflow({
          name: form.name,
          description: form.description,
          assigned_cs_ids: form.assigned_cs_ids,
        });
        toast.success('Đã tạo kịch bản tự động mới');
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
      toast.success(wf.active ? 'Đã tắt kịch bản' : 'Đã bật kịch bản');
      fetchWorkflows();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thay đổi trạng thái');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await automationApi.deleteWorkflow(deleteTarget.id);
      toast.success('Đã xóa kịch bản');
      setDeleteTarget(null);
      fetchWorkflows();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa kịch bản');
    }
  };

  const columns: Column<AutomationWorkflow>[] = [
    {
      header: 'Kịch bản tự động',
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
      header: isAdminOrManage ? 'Học viên áp dụng' : 'Học viên của bạn',
      cell: (item) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
          <Users className="w-3.5 h-3.5 text-primary" />
          {item._count?.enrollments ?? 0} HV
        </span>
      ),
    },
    {
      header: 'CSKH được phân quyền',
      cell: (item) => {
        const assignedUsers = item.assigned_cs_users ?? [];
        if (assignedUsers.length === 0) {
          return (
            <span className="text-xs text-amber-600 font-medium">
              Chưa phân quyền CSKH
            </span>
          );
        }
        return (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {assignedUsers.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
              >
                <UserCheck className="w-3 h-3" />
                {u.name || u.email}
                {u.staff_code ? ` (${u.staff_code})` : ''}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
            item.active
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              item.active ? 'bg-emerald-500' : 'bg-slate-400'
            }`}
          />
          {item.active ? 'Đang chạy' : 'Tạm tắt'}
        </span>
      ),
    },
    {
      header: 'Cập nhật',
      cell: (item) => new Date(item.updated_at).toLocaleDateString('vi-VN'),
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      cell: (item) =>
        isAdminOrManage ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(item);
              }}
              title="Chỉnh sửa & Phân quyền CSKH"
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
              title={item.active ? 'Tắt kịch bản' : 'Bật kịch bản'}
            >
              <Power
                className={`w-4 h-4 ${item.active ? 'text-emerald-500' : 'text-slate-400'}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(item);
              }}
              title="Xóa kịch bản"
            >
              <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/automation/${item.id}`);
              }}
            >
              Quản lý học viên
            </Button>
          </div>
        ),
    },
  ];

  const tabItems: HorizontalTabItem<AutomationWorkspaceMode>[] = [
    {
      value: 'workflows',
      label: 'Kịch bản tự động theo buổi học',
      icon: <Zap className="w-4 h-4" />,
      badge: workflows.length,
    },
    {
      value: 'broadcast',
      label: 'Chiến dịch gửi tin & hẹn giờ (Zalo & LINE)',
      icon: <CalendarClock className="w-4 h-4" />,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Trung tâm Tự động hóa & Chiến dịch Đa kênh (Zalo & LINE)"
        description={
          mode === 'workflows'
            ? isAdminOrManage
              ? 'Tạo, cấu hình cụm trigger theo buổi học và phân quyền CSKH tham gia áp dụng cho học viên'
              : 'Xem các kịch bản tự động bạn được phân quyền và thêm danh sách học viên do bạn phụ trách'
            : 'Phát thông báo đồng loạt hoặc hẹn giờ gửi tin tự động vào Nhóm chăm sóc học viên, Nhóm Zalo và Nhóm LINE'
        }
        actions={
          mode === 'workflows' ? (
            <div className="flex gap-2">
              <Button
                onClick={fetchWorkflows}
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Làm mới
              </Button>
              {isAdminOrManage && (
                <Button
                  onClick={openCreate}
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  Tạo kịch bản tự động
                </Button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={() => setBroadcastCreateTrigger((c) => c + 1)}
                variant="primary"
                size="sm"
                leftIcon={<Send className="w-4 h-4" />}
              >
                Tạo chiến dịch gửi tin
              </Button>
            </div>
          )
        }
      />

      {/* Mode Switcher */}
      <div className="mb-5">
        <HorizontalTabs
          items={tabItems}
          value={mode}
          onChange={handleModeChange}
          ariaLabel="Chế độ tự động hóa"
        />
      </div>

      {mode === 'broadcast' ? (
        <BroadcastCampaignsPanel externalCreateTrigger={broadcastCreateTrigger} />
      ) : (
        <>
          {/* Info banner */}
          <div className="mb-5 p-4 bg-surface rounded-2xl border border-border/80 shadow-soft text-xs text-text-secondary leading-relaxed">
            {isAdminOrManage ? (
              <>
                <strong className="text-text-primary">Phân quyền & Vận hành:</strong> Admin và Quản
                lý tạo kịch bản, cấu hình các <strong>cụm trigger</strong> theo buổi học (Có mặt /
                Vắng A / Nghỉ B / Vắng C / GV vắng D / Lỗi E) và{' '}
                <strong>phân quyền các CSKH tham gia</strong>. Mỗi CSKH được phân quyền sẽ tự thêm
                danh sách học viên do mình phụ trách vào kịch bản và tin nhắn sẽ tự động gửi từ tài
                khoản Zalo/LINE riêng của CSKH đó.
              </>
            ) : (
              <>
                <strong className="text-text-primary">Kịch bản được phân quyền:</strong> Bạn đang
                xem các kịch bản tự động theo buổi học đã được Admin/Quản lý phân quyền cho bạn.
                Nhấn vào từng kịch bản để xem cấu hình cụm trigger và{' '}
                <strong>thêm/gỡ danh sách học viên do bạn phụ trách</strong>. Dữ liệu học viên và
                tài khoản Zalo/LINE của từng CSKH hoàn toàn độc lập.
              </>
            )}
          </div>

          {/* Search */}
          <div className="mb-4 w-full sm:w-80">
            <Input
              placeholder="Tìm kịch bản theo tên..."
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
            emptyMessage={
              isAdminOrManage
                ? "Chưa có kịch bản tự động nào. Nhấn 'Tạo kịch bản tự động' để bắt đầu."
                : 'Bạn chưa được phân quyền vào kịch bản tự động nào.'
            }
            onRowClick={(item) => navigate(`/automation/${item.id}`)}
          />

          {/* Create/Edit Modal (Admin / Manage) */}
          {isAdminOrManage && (
            <Modal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              title={
                editing
                  ? 'Chỉnh sửa kịch bản & Phân quyền CSKH'
                  : 'Tạo kịch bản tự động mới'
              }
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Tên kịch bản *"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: Chăm sóc học viên sau buổi học"
                  required
                />
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Mô tả
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Mô tả mục đích kịch bản..."
                    rows={3}
                    className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-text-muted/70"
                  />
                </div>

                {/* CSKH Assignment Picker */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                      Phân quyền CSKH tham gia kịch bản ({form.assigned_cs_ids.length}/
                      {csUsers.length})
                    </label>
                    {csUsers.length > 0 && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              assigned_cs_ids: csUsers.map((u) => u.id),
                            }))
                          }
                          className="text-primary font-semibold hover:underline"
                        >
                          Chọn tất cả
                        </button>
                        <span className="text-text-muted">·</span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              assigned_cs_ids: [],
                            }))
                          }
                          className="text-text-muted hover:text-text-primary hover:underline"
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="border border-border/80 rounded-xl divide-y divide-border/60 max-h-48 overflow-y-auto bg-surface-muted/40">
                    {csUsers.length === 0 ? (
                      <div className="p-3 text-xs text-text-muted text-center">
                        Không có tài khoản CSKH nào đang hoạt động.
                      </div>
                    ) : (
                      csUsers.map((cs) => {
                        const checked = form.assigned_cs_ids.includes(cs.id);
                        return (
                          <label
                            key={cs.id}
                            className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer text-xs transition-colors ${
                              checked ? 'bg-indigo-50/70' : 'hover:bg-surface-subtle/50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCsIdInForm(cs.id)}
                                className="rounded text-primary focus:ring-primary/30"
                              />
                              <div>
                                <div className="font-semibold text-text-primary">
                                  {cs.name || cs.email}
                                  {cs.staff_code && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold">
                                      {cs.staff_code}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-text-muted">{cs.email}</div>
                              </div>
                            </div>
                            {checked && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                                Được tham gia
                              </span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-text-muted">
                    CSKH được chọn sẽ nhìn thấy kịch bản này và được phép thêm học viên do mình phụ
                    trách vào kịch bản.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border/80">
                  <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                    Hủy
                  </Button>
                  <Button variant="primary" type="submit" isLoading={submitting}>
                    {editing ? 'Lưu thay đổi' : 'Tạo kịch bản'}
                  </Button>
                </div>
              </form>
            </Modal>
          )}

          {/* Delete Confirm */}
          {isAdminOrManage && deleteTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
              <div className="bg-surface rounded-2xl shadow-soft-xl w-full max-w-sm overflow-hidden border border-border/80">
                <div className="p-6 text-center">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 className="w-6 h-6 text-red-500" />
                  </div>
                  <h3 className="text-base font-bold text-text-primary mb-2">Xóa kịch bản?</h3>
                  <p className="text-sm text-text-secondary">
                    Kịch bản <strong>{deleteTarget.name}</strong> và toàn bộ cụm trigger, học viên
                    áp dụng sẽ bị xóa vĩnh viễn.
                  </p>
                </div>
                <div className="px-6 py-3 bg-surface-subtle/50 border-t border-border/80 flex justify-center gap-3">
                  <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                    Hủy
                  </Button>
                  <Button variant="danger" onClick={handleDelete}>
                    Xóa kịch bản
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
};
