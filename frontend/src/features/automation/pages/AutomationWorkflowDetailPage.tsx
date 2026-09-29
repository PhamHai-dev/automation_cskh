import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { automationApi } from '../api/automation.api';
import type {
  AutomationWorkflow,
  AutomationStep,
  AutomationEnrollment,
  AutomationTriggerEvent,
  AutomationChannel,
  MessageDelivery,
} from '../types/automation.types';
import {
  TRIGGER_EVENT_OPTIONS,
  TRIGGER_EVENT_LABELS,
  CHANNEL_LABELS,
  DELIVERY_STATUS_LABELS,
  TEMPLATE_VARIABLES,
} from '../types/automation.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import {
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
  Zap,
  Users,
  Clock,
  MessageSquare,
  Copy,
  BookOpen,
} from 'lucide-react';

type TabType = 'steps' | 'enrollments' | 'deliveries';

export const AutomationWorkflowDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const workflowId = Number(id);
  const toast = useToast();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<AutomationWorkflow | null>(null);
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [enrollments, setEnrollments] = useState<AutomationEnrollment[]>([]);
  const [deliveries, setDeliveries] = useState<MessageDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('steps');

  // Step modal (add/edit dùng chung form)
  const [isStepModalOpen, setIsStepModalOpen] = useState(false);
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [stepForm, setStepForm] = useState({
    session_number: 1,
    trigger_event: 'ATTENDED' as AutomationTriggerEvent,
    delay_minutes: 30,
    channel: 'ZALO_PERSONAL' as AutomationChannel,
    target_group_id: '',
    message_content: '',
  });
  const [stepSubmitting, setStepSubmitting] = useState(false);

  // Enrollment modal (popup chọn HV)
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [available, setAvailable] = useState<Array<{
    id: number;
    student: { id: number; full_name: string; phone: string | null; email: string | null };
    cs: { id: number; name: string } | null;
    package: { id: number; name: string } | null;
    enrollment_classes: Array<{
      id: number;
      class: {
        id: number; class_code: string | null; class_name: string;
        class_teachers: Array<{ teacher: { id: number; name: string | null } }>;
      };
    }>;
    start_date: string | null;
    status: string;
  }>>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [availSearch, setAvailSearch] = useState('');
  const [availPage, setAvailPage] = useState(1);
  const [availTotalPages, setAvailTotalPages] = useState(1);
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<number[]>([]);

  const AVAIL_PAGE_SIZE = 10;

  const loadAvailable = async (page = availPage, q = availSearch) => {
    try {
      setAvailLoading(true);
      const res = await automationApi.listAvailableEnrollments(workflowId, { q: q || undefined, page, limit: AVAIL_PAGE_SIZE });
      setAvailable(res.items as any);
      setAvailTotalPages(res.totalPages || 1);
      setAvailPage(res.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách học viên');
    } finally {
      setAvailLoading(false);
    }
  };

  const openEnrollModal = () => {
    setSelectedEnrollmentIds([]);
    setAvailSearch('');
    setAvailPage(1);
    setIsEnrollModalOpen(true);
    loadAvailable(1, '');
  };

  const toggleSelectEnrollment = (enrollmentId: number) => {
    setSelectedEnrollmentIds((prev) =>
      prev.includes(enrollmentId) ? prev.filter((id) => id !== enrollmentId) : [...prev, enrollmentId]
    );
  };

  const isSelected = (enrollmentId: number) => selectedEnrollmentIds.includes(enrollmentId);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [wfRes, enrollRes, delRes] = await Promise.all([
        automationApi.getWorkflow(workflowId),
        automationApi.listEnrollments(workflowId),
        automationApi.listDeliveries(workflowId, { limit: 100 }),
      ]);
      setWorkflow(wfRes.workflow);
      setSteps(wfRes.workflow.steps ?? []);
      setEnrollments(enrollRes.items);
      setDeliveries(delRes.items);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải workflow');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workflowId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // ─── Add Step ──────────────────────────────────────────────────────

  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setStepSubmitting(true);
      await automationApi.addStep(workflowId, {
        ...stepForm,
        target_group_id: stepForm.channel === 'ZALO_GROUP' && stepForm.target_group_id
          ? Number(stepForm.target_group_id)
          : undefined,
      } as any);
      toast.success('Đã thêm cụm trigger');
      setIsStepModalOpen(false);
      setEditingStepId(null);
      resetStepForm();
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thêm cụm trigger');
    } finally {
      setStepSubmitting(false);
    }
  };

  const resetStepForm = () => {
    setStepForm({
      session_number: 1,
      trigger_event: 'ATTENDED',
      delay_minutes: 30,
      channel: 'ZALO_PERSONAL',
      target_group_id: '',
      message_content: '',
    });
  };

  // ─── Edit Step ────────────────────────────────────────────────────────
  const openEditStep = (step: AutomationStep) => {
    setEditingStepId(step.id);
    setStepForm({
      session_number: step.session_number,
      trigger_event: step.trigger_event,
      delay_minutes: step.delay_minutes,
      channel: step.channel,
      target_group_id: step.target_group_id ? String(step.target_group_id) : '',
      message_content: step.message_content,
    });
    setIsStepModalOpen(true);
  };

  const handleUpdateStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStepId) return;
    try {
      setStepSubmitting(true);
      await automationApi.updateStep(editingStepId, {
        ...stepForm,
        target_group_id: stepForm.channel === 'ZALO_GROUP' && stepForm.target_group_id
          ? Number(stepForm.target_group_id)
          : null,
      } as any);
      toast.success('Đã cập nhật cụm trigger');
      setIsStepModalOpen(false);
      setEditingStepId(null);
      resetStepForm();
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể cập nhật cụm trigger');
    } finally {
      setStepSubmitting(false);
    }
  };

  const handleSubmitStep = (e: React.FormEvent) => {
    if (editingStepId) {
      handleUpdateStep(e);
    } else {
      handleAddStep(e);
    }
  };

  const handleDeleteStep = async (stepId: number) => {
    if (!confirm('Xóa cụm trigger này?')) return;
    try {
      await automationApi.deleteStep(stepId);
      toast.success('Đã xóa cụm trigger');
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa');
    }
  };

  // ─── Add Enrollment (popup chọn HV) ───────────────────────────────

  const handleAddEnrollment = async () => {
    if (selectedEnrollmentIds.length === 0) {
      toast.warning('Vui lòng chọn ít nhất 1 học viên');
      return;
    }
    try {
      setEnrollSubmitting(true);
      const res = await automationApi.addEnrollments(workflowId, selectedEnrollmentIds);
      if (res.errors.length > 0) {
        toast.warning(`Đã thêm ${res.enrolled}, ${res.errors.length} lỗi (trùng/lỗi)`);
      } else {
        toast.success(`Đã thêm ${res.enrolled} học viên vào workflow`);
      }
      setIsEnrollModalOpen(false);
      setSelectedEnrollmentIds([]);
      setAvailSearch('');
      setAvailPage(1);
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thêm học viên');
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const handleRemoveEnrollment = async (enrollmentId: number) => {
    if (!confirm('Gỡ học viên khỏi workflow này?')) return;
    try {
      await automationApi.removeEnrollment(workflowId, enrollmentId);
      toast.success('Đã gỡ học viên');
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể gỡ');
    }
  };

  // Group steps by session_number
  const stepsBySession = useMemo(() => {
    const sorted = [...steps].sort((a, b) => a.session_number - b.session_number || a.id - b.id);
    const map = new Map<number, AutomationStep[]>();
    for (const s of sorted) {
      if (!map.has(s.session_number)) map.set(s.session_number, []);
      map.get(s.session_number)!.push(s);
    }
    return map;
  }, [steps]);

  const insertVar = (varName: string) => {
    setStepForm((prev) => ({
      ...prev,
      message_content: prev.message_content + `{{${varName}}}`,
    }));
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <div className="text-text-muted text-sm">Đang tải...</div>
        </div>
      </PageContainer>
    );
  }

  if (!workflow) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <p className="text-text-muted">Workflow không tồn tại</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/automation')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            className="mt-4"
          >
            Quay lại
          </Button>
        </div>
      </PageContainer>
    );
  }

  const tabs: { key: TabType; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'steps', label: 'Cụm trigger', count: steps.length, icon: <Zap className="w-4 h-4" /> },
    { key: 'enrollments', label: 'Học viên áp dụng', count: enrollments.length, icon: <Users className="w-4 h-4" /> },
    { key: 'deliveries', label: 'Lịch sử gửi', count: deliveries.length, icon: <MessageSquare className="w-4 h-4" /> },
  ];

  return (
    <PageContainer>
      {/* Back + Header */}
      <div className="mb-5">
        <button
          onClick={() => navigate('/automation')}
          className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Danh sách automation
        </button>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white shadow-md">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary">{workflow.name}</h1>
              <p className="text-xs text-text-muted">{workflow.description || 'Không có mô tả'}</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
              workflow.active
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${workflow.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {workflow.active ? 'Đang chạy' : 'Tạm tắt'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/80 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t.icon}
            {t.label}
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-surface-muted text-[10px] font-bold">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ─── Tab: Steps ──────────────────────────────────────────────── */}
      {activeTab === 'steps' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setIsStepModalOpen(true)}
            >
              Thêm cụm trigger
            </Button>
          </div>

          {steps.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-sm">
              Chưa có cụm trigger nào. Thêm cụm trigger để bắt đầu.
            </div>
          ) : (
            Array.from(stepsBySession.entries()).map(([sessionNum, sessionSteps]) => (
              <div key={sessionNum} className="border border-border/80 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-surface-subtle/50 border-b border-border/80 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {sessionNum}
                  </span>
                  <span className="text-xs font-bold text-text-primary">
                    Buổi học #{sessionNum}
                  </span>
                  <span className="text-xs text-text-muted">
                    ({sessionSteps.length} cụm)
                  </span>
                </div>
                <div className="divide-y divide-border/60">
                  {sessionSteps.map((step) => (
                    <div key={step.id} className="px-4 py-3 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              step.trigger_event === 'ATTENDED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : step.trigger_event.includes('ABSENT')
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {TRIGGER_EVENT_LABELS[step.trigger_event]}
                          </span>
                          <span className="text-[10px] text-text-muted flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            +{step.delay_minutes} phút
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary font-medium">
                            {CHANNEL_LABELS[step.channel]}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-text-secondary line-clamp-2 whitespace-pre-wrap">
                          {step.message_content}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditStep(step)}
                          title="Sửa cụm"
                        >
                          <Pencil className="w-3.5 h-3.5 text-text-muted hover:text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteStep(step.id)}
                          title="Xóa cụm"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Tab: Enrollments ────────────────────────────────────────── */}
      {activeTab === 'enrollments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={openEnrollModal}
            >
              Thêm học viên
            </Button>
          </div>

          {enrollments.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-sm">
              Chưa áp dụng cho học viên nào. Nhấn "Thêm học viên" để bắt đầu.
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl overflow-hidden">
              <div className="divide-y divide-border/60">
                {enrollments.map((en) => {
                  const ec = en.enrollment?.enrollment_classes?.[0];
                  const cls = ec?.class;
                  const teacher = cls?.class_teachers?.[0]?.teacher?.name;
                  return (
                    <div key={en.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {en.enrollment?.student?.full_name?.charAt(0) ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-primary truncate">
                            {en.enrollment?.student?.full_name || `Enrollment #${en.enrollment_id}`}
                            <span className="ml-1.5 text-[10px] font-mono text-text-muted">#{en.enrollment?.student?.id ?? '—'}</span>
                          </div>
                          <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-1.5">
                            <span>SĐT: {en.enrollment?.student?.phone || '—'}</span>
                            {en.enrollment?.student?.email && <span>📧 {en.enrollment.student.email}</span>}
                            {en.enrollment?.cs && <span>• CS: {en.enrollment.cs.name}</span>}
                            {en.enrollment?.package?.name && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/5 text-primary text-[10px] font-bold">
                                {en.enrollment.package.name}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-1.5 mt-0.5">
                            <BookOpen className="w-3 h-3 text-indigo-500" />
                            {cls ? (
                              <span>
                                Lớp:{' '}
                                <strong className="text-text-secondary">
                                  {cls.class_name}
                                  {cls.class_code ? ` (${cls.class_code})` : ''}
                                </strong>
                              </span>
                            ) : (
                              <span className="text-text-muted/60">Chưa xếp lớp</span>
                            )}
                            {teacher && <span className="inline-flex items-center gap-0.5">• Giáo viên: {teacher}</span>}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveEnrollment(en.enrollment_id)}
                        title="Gỡ học viên"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Deliveries ─────────────────────────────────────────── */}
      {activeTab === 'deliveries' && (
        <div>
          {deliveries.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-sm">
              Chưa có tin nhắn nào được gửi. Tin nhắn sẽ xuất hiện khi điểm danh kích hoạt workflow.
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl overflow-hidden">
              <div className="divide-y divide-border/60">
                {deliveries.map((d) => {
                  const stConf = DELIVERY_STATUS_LABELS[d.status] || { label: d.status, variant: 'neutral' };
                  return (
                    <div key={d.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-text-primary">
                            {d.enrollment?.student?.full_name || `HV #${d.enrollment_id}`}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              stConf.variant === 'success'
                                ? 'bg-emerald-50 text-emerald-700'
                                : stConf.variant === 'danger'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-surface-muted text-text-secondary'
                            }`}
                          >
                            {stConf.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted">
                          {new Date(d.created_at).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary line-clamp-2 whitespace-pre-wrap">
                        {d.rendered_content}
                      </p>
                      {d.error_message && (
                        <p className="text-[10px] text-red-500 mt-1">{d.error_message}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Add Step Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={isStepModalOpen}
        onClose={() => {
          setIsStepModalOpen(false);
          setEditingStepId(null);
          resetStepForm();
        }}
        title={editingStepId ? 'Chỉnh sửa cụm trigger' : 'Thêm cụm trigger'}
      >
        <form onSubmit={handleSubmitStep} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Buổi học (session) *"
              type="number"
              min={1}
              value={stepForm.session_number}
              onChange={(e) => setStepForm({ ...stepForm, session_number: parseInt(e.target.value) || 1 })}
              required
            />
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Event trigger *</label>
              <select
                value={stepForm.trigger_event}
                onChange={(e) => setStepForm({ ...stepForm, trigger_event: e.target.value as AutomationTriggerEvent })}
                className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {TRIGGER_EVENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Delay (phút) *"
              type="number"
              min={0}
              value={stepForm.delay_minutes}
              onChange={(e) => setStepForm({ ...stepForm, delay_minutes: parseInt(e.target.value) || 0 })}
              required
            />
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Kênh gửi *</label>
              <select
                value={stepForm.channel}
                onChange={(e) => setStepForm({ ...stepForm, channel: e.target.value as AutomationChannel })}
                className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="ZALO_PERSONAL">Nhắn riêng (Zalo cá nhân)</option>
                <option value="ZALO_GROUP">Gửi vào nhóm Zalo</option>
              </select>
            </div>
          </div>

          {stepForm.channel === 'ZALO_GROUP' && (
            <Input
              label="Nhóm Zalo ID *"
              type="number"
              value={stepForm.target_group_id}
              onChange={(e) => setStepForm({ ...stepForm, target_group_id: e.target.value })}
              placeholder="ID nhóm Zalo"
              required
            />
          )}

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Nội dung tin nhắn *</label>
            <textarea
              value={stepForm.message_content}
              onChange={(e) => setStepForm({ ...stepForm, message_content: e.target.value })}
              rows={4}
              placeholder="VD: Chào {{student_name}}, buổi {{session_number}}..."
              className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 whitespace-pre-wrap font-mono text-xs leading-relaxed"
              required
            />
            {/* Variable chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVar(v.key)}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-primary/5 text-primary border border-primary/20 rounded-lg text-[10px] font-medium hover:bg-primary/10 transition-colors cursor-pointer"
                  title={`Chèn {{${v.key}}}`}
                >
                  <Copy className="w-2.5 h-2.5" />
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/80">
            <Button variant="outline" type="button" onClick={() => setIsStepModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" isLoading={stepSubmitting}>
              {editingStepId ? 'Lưu thay đổi' : 'Thêm cụm'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─── Add Enrollment Modal (popup chọn HV) ────────────────────── */}
      <Modal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        title="Chọn học viên áp dụng"
        size="lg"
      >
        <div className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-2">
            <input
              value={availSearch}
              onChange={(e) => { setAvailSearch(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setAvailPage(1); loadAvailable(1, availSearch); } }}
              placeholder="Tìm theo tên / SĐT / email..."
              className="flex-1 px-3.5 py-2.5 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button variant="outline" size="sm" onClick={() => { setAvailPage(1); loadAvailable(1, availSearch); }}>
              Tìm
            </Button>
          </div>

          {/* Table */}
          <div className="border border-border/80 rounded-xl overflow-hidden max-h-[320px] overflow-y-auto">
            {availLoading ? (
              <div className="text-center py-10 text-text-muted text-sm">Đang tải...</div>
            ) : available.length === 0 ? (
              <div className="text-center py-10 text-text-muted text-sm">Không có học viên nào khả dụng.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-subtle/60 text-[10px] uppercase tracking-wide text-text-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 font-semibold">Học viên</th>
                    <th className="px-3 py-2 font-semibold">Gói / Lớp / GV</th>
                    <th className="px-3 py-2 font-semibold">CS phụ trách</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {available.map((en) => (
                    <tr
                      key={en.id}
                      onClick={() => toggleSelectEnrollment(en.id)}
                      className={`cursor-pointer transition-colors ${isSelected(en.id) ? 'bg-primary/5' : 'hover:bg-surface-muted/60'}`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected(en.id)}
                          onChange={() => toggleSelectEnrollment(en.id)}
                          className="accent-primary w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-text-primary">
                          {en.student.full_name}
                          <span className="ml-1.5 text-[10px] font-mono text-text-muted">#{en.id}</span>
                        </div>
                        <div className="text-[10px] text-text-muted">SĐT: {en.student.phone || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[10px] text-text-secondary">
                        <div>{en.package?.name || '—'}</div>
                        {en.enrollment_classes?.[0]?.class && (
                          <div>Lớp: <strong>{en.enrollment_classes[0].class.class_name}</strong>{en.enrollment_classes[0].class.class_code ? ` (${en.enrollment_classes[0].class.class_code})` : ''}</div>
                        )}
                        {en.enrollment_classes?.[0]?.class?.class_teachers?.[0]?.teacher?.name && (
                          <div>GV: {en.enrollment_classes[0].class.class_teachers[0].teacher.name}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-secondary">{en.cs?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer: selected count + pagination */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted">
              Đã chọn <strong className="text-primary">{selectedEnrollmentIds.length}</strong> học viên
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={availPage <= 1 || availLoading}
                onClick={() => loadAvailable(availPage - 1)}
              >
                ←
              </Button>
              <span className="px-2 text-xs text-text-muted">
                {availPage} / {availTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={availPage >= availTotalPages || availLoading}
                onClick={() => loadAvailable(availPage + 1)}
              >
                →
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border/80">
            <Button variant="outline" onClick={() => setIsEnrollModalOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleAddEnrollment}
              isLoading={enrollSubmitting}
              disabled={selectedEnrollmentIds.length === 0}
            >
              Thêm {selectedEnrollmentIds.length > 0 ? `(${selectedEnrollmentIds.length})` : ''}
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
