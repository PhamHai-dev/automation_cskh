import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  CheckCheck,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { HorizontalTabs, HorizontalTabItem } from '../../../components/ui/HorizontalTabs';
import { useToast } from '../../../components/ui/Toast';
import { reconciliationApi } from '../api/reconciliation.api';
import { AttendanceRecord, AttendanceStatus } from '../types/reconciliation.types';

const statusLabels: Record<AttendanceStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }> = {
  ATTENDED: { label: 'Đã học', variant: 'success' },
  ABSENT_APPROVED_A: { label: 'Nghỉ có phép (A)', variant: 'accent' },
  LEAVE_B: { label: 'Bảo lưu (B)', variant: 'neutral' },
  ABSENT_UNAPPROVED_C: { label: 'Nghỉ không phép (C)', variant: 'danger' },
  TEACHER_ABSENT_D: { label: 'Giáo viên nghỉ (D)', variant: 'warning' },
  TECH_ERROR_E: { label: 'Lỗi kỹ thuật (E)', variant: 'info' },
};

export const AttendanceReconciliationPage: React.FC = () => {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'conflicts' | 'pending'>('conflicts');
  const [isLoading, setIsLoading] = useState(false);

  // Data states
  const [conflicts, setConflicts] = useState<AttendanceRecord[]>([]);
  const [totalConflicts, setTotalConflicts] = useState(0);
  const [pendingItems, setPendingItems] = useState<AttendanceRecord[]>([]);
  const [totalPending, setTotalPending] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Bulk selection
  const [selectedPendingIds, setSelectedPendingIds] = useState<number[]>([]);

  // Resolution modal state
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [finalStatus, setFinalStatus] = useState<AttendanceStatus>('ATTENDED');

  const [resolutionNote, setResolutionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CS Quick Mark Modal
  const [isCSMarkModalOpen, setIsCSMarkModalOpen] = useState(false);
  const [csStatus, setCsStatus] = useState<AttendanceStatus>('ATTENDED');
  const [csNote, setCsNote] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters = {
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      };
      const [conflictsRes, pendingRes] = await Promise.all([
        reconciliationApi.getConflicts(filters),
        reconciliationApi.getPending(filters),
      ]);
      setConflicts(conflictsRes.items || []);
      setTotalConflicts(conflictsRes.total || 0);
      setPendingItems(pendingRes.items || []);
      setTotalPending(pendingRes.total || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải dữ liệu đối soát');
    } finally {
      setIsLoading(false);
    }
  }, [search, startDate, endDate, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenResolve = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    // Default finalStatus to teacher_status or cs_status
    setFinalStatus(record.teacher_status || record.cs_status || 'ATTENDED');

    setResolutionNote('');
    setIsResolveModalOpen(true);
  };

  const handleConfirmResolve = async () => {
    if (!selectedRecord) return;
    if (!resolutionNote.trim()) {
      toast.warning('Vui lòng nhập lý do giải trình bắt buộc');
      return;
    }

    setIsSubmitting(true);
    try {
      await reconciliationApi.resolveConflict(selectedRecord.id, {
        finalStatus,
        resolutionNote: resolutionNote.trim(),
      });
      toast.success('Phân xử buổi học thành công! Trạng thái đã được chốt.');
      setIsResolveModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể phân xử xung đột');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkApprove = async () => {
    const idsToApprove =
      selectedPendingIds.length > 0
        ? selectedPendingIds
        : pendingItems.filter((i) => i.teacher_status).map((i) => i.id);

    if (idsToApprove.length === 0) {
      toast.info('Không có buổi học nào đủ điều kiện để duyệt nhanh');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await reconciliationApi.bulkApprovePending(idsToApprove);
      toast.success(`Đã duyệt thành công ${res.approvedCount} buổi học!`);
      setSelectedPendingIds([]);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi duyệt hàng loạt');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenCSMark = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    setCsStatus('ATTENDED');
    setCsNote('');
    setIsCSMarkModalOpen(true);
  };

  const handleConfirmCSMark = async () => {
    if (!selectedRecord) return;
    setIsSubmitting(true);
    try {
      await reconciliationApi.markByCS(selectedRecord.id, {
        status: csStatus,
        note: csNote.trim() || undefined,
      });
      toast.success('Đã ghi nhận điểm danh CSKH thành công!');
      setIsCSMarkModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi ghi nhận điểm danh CSKH');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle selection for pending
  const toggleSelectPending = (id: number) => {
    setSelectedPendingIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPending = () => {
    if (selectedPendingIds.length === pendingItems.length) {
      setSelectedPendingIds([]);
    } else {
      setSelectedPendingIds(pendingItems.map((i) => i.id));
    }
  };

  // Columns for Conflicts Table
  const conflictColumns: Column<AttendanceRecord>[] = useMemo(
    () => [
      {
        header: 'Học viên',
        cell: (r) => (
          <div>
            <div className="font-semibold text-text-primary">
              {r.enrollment_class?.enrollment?.student?.full_name}
            </div>
            <div className="text-xs text-text-muted flex gap-2">
              <span>ID: {r.enrollment_class?.enrollment?.student?.external_id || 'N/A'}</span>
              <span>•</span>
              <span>{r.enrollment_class?.enrollment?.student?.phone || 'Chưa có SĐT'}</span>
            </div>
            <div className="text-xs text-teal-600 font-medium mt-0.5">
              Lớp: {r.enrollment_class?.class?.class_name}
            </div>
          </div>
        ),
      },
      {
        header: 'Buổi học / Ngày',
        cell: (r) => (
          <div>
            <div className="font-medium text-text-primary">
              Buổi {r.class_session?.session_number}
            </div>
            <div className="text-xs text-text-muted flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(r.class_session?.session_date).toLocaleDateString('vi-VN')}
            </div>
            {r.class_session?.start_time && (
              <div className="text-[11px] text-text-muted">
                {r.class_session.start_time} - {r.class_session.end_time || ''}
              </div>
            )}
          </div>
        ),
      },
      {
        header: 'Giáo viên báo cáo',
        cell: (r) => {
          const cfg = r.teacher_status ? statusLabels[r.teacher_status] : null;
          return (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-semibold text-amber-700">Ý kiến GV:</span>
                {cfg ? (
                  <Badge variant={cfg.variant} size="sm">
                    {cfg.label}
                  </Badge>
                ) : (
                  <span className="text-xs text-text-muted italic">Chưa báo</span>
                )}
              </div>
              {r.lesson_topic && (
                <div className="text-xs text-text-primary font-medium">
                  Bài học: <span className="text-teal-600">{r.lesson_topic}</span>
                </div>
              )}
              {r.teacher_note && (
                <div className="text-xs text-text-secondary mt-0.5 italic">
                  "{r.teacher_note}"
                </div>
              )}
              <div className="text-[10px] text-text-muted mt-1">
                Bởi: {r.teacher_user?.name || 'Giáo viên'}
              </div>
            </div>
          );
        },
      },
      {
        header: 'CSKH ghi nhận',
        cell: (r) => {
          const cfg = r.cs_status ? statusLabels[r.cs_status] : null;
          return (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-semibold text-blue-700">Ý kiến CS:</span>
                {cfg ? (
                  <Badge variant={cfg.variant} size="sm">
                    {cfg.label}
                  </Badge>
                ) : (
                  <span className="text-xs text-text-muted italic">Chưa ghi nhận</span>
                )}
              </div>
              {r.cs_note && (
                <div className="text-xs text-text-secondary italic">"{r.cs_note}"</div>
              )}
              <div className="text-[10px] text-text-muted mt-1">
                Bởi: {r.cs_user?.name || r.enrollment_class?.enrollment?.cs?.name || 'CSKH'}
              </div>
            </div>
          );
        },
      },
      {
        header: 'Trạng thái',
        cell: () => (
          <Badge variant="danger" size="md" dot>
            Lệch ý kiến
          </Badge>
        ),
      },
      {
        header: 'Hành động',
        cell: (r) => (
          <Button
            size="sm"
            variant="primary"
            onClick={() => handleOpenResolve(r)}
            className="whitespace-nowrap"
          >
            <AlertCircle className="w-4 h-4 mr-1.5" />
            Phân xử
          </Button>
        ),
      },
    ],
    []
  );

  // Columns for Pending Table
  const pendingColumns: Column<AttendanceRecord>[] = useMemo(
    () => [
      {
        header: (
          <input
            type="checkbox"
            className="rounded border-border"
            checked={pendingItems.length > 0 && selectedPendingIds.length === pendingItems.length}
            onChange={toggleSelectAllPending}
          />
        ),
        width: '40px',
        cell: (r) => (
          <input
            type="checkbox"
            className="rounded border-border"
            checked={selectedPendingIds.includes(r.id)}
            onChange={() => toggleSelectPending(r.id)}
          />
        ),
      },
      {
        header: 'Học viên',
        cell: (r) => (
          <div>
            <div className="font-semibold text-text-primary">
              {r.enrollment_class?.enrollment?.student?.full_name}
            </div>
            <div className="text-xs text-text-muted">
              ID: {r.enrollment_class?.enrollment?.student?.external_id || 'N/A'} • Lớp:{' '}
              {r.enrollment_class?.class?.class_name}
            </div>
          </div>
        ),
      },
      {
        header: 'Buổi học & Ngày',
        cell: (r) => (
          <div>
            <div className="font-medium text-text-primary">
              Buổi {r.class_session?.session_number}
            </div>
            <div className="text-xs text-text-muted flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(r.class_session?.session_date).toLocaleDateString('vi-VN')}
            </div>
          </div>
        ),
      },
      {
        header: 'Giáo viên báo cáo',
        cell: (r) => {
          if (!r.teacher_status) {
            return <span className="text-xs text-text-muted italic">Chưa nhập</span>;
          }
          const cfg = statusLabels[r.teacher_status];
          return (
            <div className="flex flex-col gap-0.5">
              <Badge variant={cfg?.variant || 'neutral'} size="sm">
                {cfg?.label || r.teacher_status}
              </Badge>
              {r.lesson_topic && (
                <span className="text-xs text-teal-600 font-medium">Bài: {r.lesson_topic}</span>
              )}
            </div>
          );
        },
      },
      {
        header: 'CSKH',
        cell: (r) => {
          if (!r.cs_status) {
            return (
              <Badge variant="warning" size="sm">
                Đang chờ CSKH
              </Badge>
            );
          }
          const cfg = statusLabels[r.cs_status];
          return (
            <Badge variant={cfg?.variant || 'neutral'} size="sm">
              {cfg?.label || r.cs_status}
            </Badge>
          );
        },
      },
      {
        header: 'Hành động',
        cell: (r) => (
          <div className="flex items-center gap-2">
            {r.teacher_status && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await reconciliationApi.bulkApprovePending([r.id]);
                    toast.success('Đã duyệt theo giáo viên thành công!');
                    loadData();
                  } catch (err: any) {
                    toast.error(err.message || 'Lỗi khi duyệt buổi học');
                  }
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Duyệt nhanh
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleOpenCSMark(r)}
            >
              Ghi nhận CS
            </Button>
          </div>
        ),
      },
    ],
    [pendingItems, selectedPendingIds, loadData, toast]
  );

  const tabItems: HorizontalTabItem<'conflicts' | 'pending'>[] = [
    {
      value: 'conflicts',
      label: 'Lệch thông tin (Conflicts)',
      icon: <AlertTriangle className="w-4 h-4 text-rose-500" />,
      badge: (
        <span
          className={`ml-1 px-1.5 py-0.5 text-xs rounded-full font-bold ${
            totalConflicts > 0 ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-700'
          }`}
        >
          {totalConflicts}
        </span>
      ),
    },
    {
      value: 'pending',
      label: 'Chờ duyệt / Chờ đối soát',
      icon: <Clock className="w-4 h-4 text-amber-500" />,
      badge: (
        <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-500 text-white font-bold">
          {totalPending}
        </span>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Trung tâm Đối soát Điểm danh"
        description="So khớp dữ liệu 2 chiều (Giáo viên vs CSKH), giải quyết các ca lệch thông tin và duyệt buổi học."
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="border-l-4 border-l-rose-500 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted font-bold">
                Buổi học bị Lệch (Cần xử lý)
              </p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1">{totalConflicts}</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Đang bị treo — chưa trừ buổi học viên
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-amber-500 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted font-bold">
                Chờ xác nhận / Đối soát
              </p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{totalPending}</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Chờ 1 trong 2 bên ghi nhận
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted font-bold">
                Quy tắc Hai Bên Khớp Nhau
              </p>
              <h3 className="text-sm font-semibold text-emerald-700 mt-1">Tự động Chốt & Trừ buổi</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Tự động gửi thông báo Zalo khi khớp 100%
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex-1 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Tìm tên học viên, mã học viên, SĐT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4 text-text-muted" />}
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 text-xs"
              />
              <span className="text-text-muted text-xs">đến</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'pending' && (
              <Button
                variant="primary"
                onClick={handleBulkApprove}
                disabled={isSubmitting || pendingItems.length === 0}
              >
                <CheckCheck className="w-4 h-4 mr-1.5" />
                {selectedPendingIds.length > 0
                  ? `Duyệt nhanh (${selectedPendingIds.length})`
                  : 'Duyệt nhanh tất cả'}
              </Button>
            )}
            <Button variant="outline" onClick={loadData} disabled={isLoading}>
              <Filter className="w-4 h-4 mr-1.5" />
              Làm mới
            </Button>
          </div>
        </div>
      </Card>

      {/* Tab Navigation */}
      <div className="mb-4">
        <HorizontalTabs
          items={tabItems}
          value={activeTab}
          onChange={(val) => setActiveTab(val)}
          ariaLabel="Reconciliation Tabs"
        />
      </div>

      {/* Content Table */}
      {activeTab === 'conflicts' ? (
        <DataTable
          columns={conflictColumns}
          data={conflicts}
          isLoading={isLoading}
          emptyMessage="Tuyệt vời! Hiện tại không có buổi học nào bị lệch thông tin."
        />
      ) : (
        <DataTable
          columns={pendingColumns}
          data={pendingItems}
          isLoading={isLoading}
          emptyMessage="Không có buổi học nào đang chờ duyệt."
        />
      )}

      {/* MODAL 1: Phân xử xung đột (Resolve Conflict) */}
      <Modal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-rose-600 font-bold">
            <AlertTriangle className="w-5 h-5" />
            <span>Phân xử Lệch Điểm Danh (Conflict Resolution)</span>
          </div>
        }
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setIsResolveModalOpen(false)}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmResolve}
              disabled={isSubmitting || !resolutionNote.trim()}
            >
              {isSubmitting ? 'Đang lưu...' : 'Xác nhận Chốt Kết Quả'}
            </Button>
          </div>
        }
      >
        {selectedRecord && (
          <div className="space-y-4">
            {/* Student context box */}
            <div className="bg-surface-muted/60 p-3.5 rounded-xl border border-border/70 flex justify-between items-start text-xs">
              <div>
                <p className="font-bold text-text-primary text-sm">
                  {selectedRecord.enrollment_class?.enrollment?.student?.full_name}
                </p>
                <p className="text-text-muted mt-0.5">
                  Mã HV: {selectedRecord.enrollment_class?.enrollment?.student?.external_id || 'N/A'} •{' '}
                  Lớp: {selectedRecord.enrollment_class?.class?.class_name}
                </p>
              </div>
              <div className="text-right">
                <span className="font-semibold text-text-primary">
                  Buổi {selectedRecord.class_session?.session_number}
                </span>
                <p className="text-text-muted">
                  {new Date(selectedRecord.class_session?.session_date).toLocaleDateString('vi-VN')}
                </p>
              </div>
            </div>

            {/* Comparison cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-amber-700">GIÁO VIÊN BÁO CÁO</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] px-2"
                    onClick={() => {
                      if (selectedRecord.teacher_status) setFinalStatus(selectedRecord.teacher_status);
                    }}
                  >
                    Chọn cái này
                  </Button>
                </div>
                <div className="mt-2">
                  {selectedRecord.teacher_status ? (
                    <Badge variant={statusLabels[selectedRecord.teacher_status]?.variant || 'neutral'}>
                      {statusLabels[selectedRecord.teacher_status]?.label}
                    </Badge>
                  ) : (
                    <span className="text-xs text-text-muted italic">Chưa nhập</span>
                  )}
                </div>
                {selectedRecord.lesson_topic && (
                  <p className="text-xs text-text-primary mt-1 font-medium">
                    Bài: {selectedRecord.lesson_topic}
                  </p>
                )}
                {selectedRecord.teacher_note && (
                  <p className="text-xs text-text-secondary mt-1 italic">
                    "{selectedRecord.teacher_note}"
                  </p>
                )}
              </div>

              <div className="border border-blue-500/30 bg-blue-500/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-blue-700">CSKH GHI NHẬN</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] px-2"
                    onClick={() => {
                      if (selectedRecord.cs_status) setFinalStatus(selectedRecord.cs_status);
                    }}
                  >
                    Chọn cái này
                  </Button>
                </div>
                <div className="mt-2">
                  {selectedRecord.cs_status ? (
                    <Badge variant={statusLabels[selectedRecord.cs_status]?.variant || 'neutral'}>
                      {statusLabels[selectedRecord.cs_status]?.label}
                    </Badge>
                  ) : (
                    <span className="text-xs text-text-muted italic">Chưa ghi nhận</span>
                  )}
                </div>
                {selectedRecord.cs_note && (
                  <p className="text-xs text-text-secondary mt-1 italic">
                    "{selectedRecord.cs_note}"
                  </p>
                )}
              </div>
            </div>

            {/* Final decision input form */}
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Trạng thái chốt cuối cùng <span className="text-rose-500">*</span>
                </label>
                <Select
                  value={finalStatus}
                  onChange={(e) => setFinalStatus(e.target.value as AttendanceStatus)}
                >
                  <option value="ATTENDED">Đã học (ATTENDED - Tính buổi học viên & GV)</option>
                  <option value="ABSENT_APPROVED_A">
                    Nghỉ có phép (A) - Lớp 1-1 không trừ buổi, tiếp tục học bù sau
                  </option>
                  <option value="LEAVE_B">Bảo lưu (B)</option>
                  <option value="ABSENT_UNAPPROVED_C">
                    Nghỉ không phép (C) - Trừ buổi học viên
                  </option>
                  <option value="TEACHER_ABSENT_D">Giáo viên nghỉ (D) - Không tính buổi</option>
                  <option value="TECH_ERROR_E">Lỗi kỹ thuật (E) - Không tính buổi</option>
                </Select>
              </div>



              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Lý do giải trình phân xử <span className="text-rose-500">* (Bắt buộc)</span>
                </label>
                <Textarea
                  placeholder="Ví dụ: Học viên đã nhắn tin xin phép trước 2 tiếng qua Zalo nhưng GV bận nên chưa kịp đọc; hoặc Học viên báo vào nhầm link Zoom..."
                  rows={3}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                />
                <p className="text-[11px] text-text-muted mt-1 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Lý do này sẽ được lưu vào lịch sử đối soát và phục vụ chấm công, giải quyết khiếu nại.
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 2: CS Quick Mark Modal */}
      <Modal
        isOpen={isCSMarkModalOpen}
        onClose={() => setIsCSMarkModalOpen(false)}
        title="Ghi nhận điểm danh CSKH"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setIsCSMarkModalOpen(false)}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmCSMark}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu điểm danh'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Trạng thái điểm danh CSKH
            </label>
            <Select
              value={csStatus}
              onChange={(e) => setCsStatus(e.target.value as AttendanceStatus)}
            >
              <option value="ATTENDED">Đã học (ATTENDED)</option>
              <option value="ABSENT_APPROVED_A">Nghỉ có phép (A)</option>
              <option value="LEAVE_B">Bảo lưu (B)</option>
              <option value="ABSENT_UNAPPROVED_C">Nghỉ không phép (C)</option>
              <option value="TEACHER_ABSENT_D">Giáo viên nghỉ (D)</option>
              <option value="TECH_ERROR_E">Lỗi kỹ thuật (E)</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Ghi chú của CSKH
            </label>
            <Textarea
              placeholder="Ghi chú thêm nếu có..."
              value={csNote}
              onChange={(e) => setCsNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
