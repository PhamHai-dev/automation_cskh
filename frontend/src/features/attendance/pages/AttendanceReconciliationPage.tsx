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
  History,
  UserRoundX,
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
import { useAuth } from '../../../contexts/AuthContext';
import { reconciliationApi } from '../api/reconciliation.api';
import {
  AttendanceRecord,
  AttendanceStatus,
  ReconciliationStats,
  ReconciliationHistoryItem,
  ReconciliationHistoryAction,
} from '../types/reconciliation.types';

type ReconciliationTab = 'conflicts' | 'pending' | 'history';
type PendingFilter = 'all' | 'PENDING_CS' | 'PENDING_TEACHER';

const statusLabels: Record<AttendanceStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }> = {
  ATTENDED: { label: 'Đã học', variant: 'success' },
  ABSENT_APPROVED_A: { label: 'Nghỉ có phép (A)', variant: 'accent' },
  LEAVE_B: { label: 'Bảo lưu (B)', variant: 'neutral' },
  ABSENT_UNAPPROVED_C: { label: 'Nghỉ không phép (C)', variant: 'danger' },
  TEACHER_ABSENT_D: { label: 'Giáo viên nghỉ (D)', variant: 'warning' },
  TECH_ERROR_E: { label: 'Lỗi kỹ thuật (E)', variant: 'info' },
};

const historyActionLabels: Record<ReconciliationHistoryAction, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }> = {
  ATTENDANCE_CS_MARK: { label: 'CSKH ghi nhận', variant: 'info' },
  ATTENDANCE_BULK_APPROVED: { label: 'Duyệt theo GV', variant: 'success' },
  ATTENDANCE_CONFLICT_RESOLVED: { label: 'Phân xử lệch', variant: 'danger' },
};

const formatDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('vi-VN') : '—';

const formatDateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('vi-VN', { hour12: false }) : '—';

export const AttendanceReconciliationPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  // D2 (owner-confirmed): resolution authority is ADMIN only. CS submits an
  // opinion (cs-mark); MANAGE/CS must not see or trigger resolve-conflict.
  const isAdmin = Boolean(user?.roles.includes('ADMIN'));

  const [activeTab, setActiveTab] = useState<ReconciliationTab>('conflicts');
  const [isLoading, setIsLoading] = useState(false);

  // Filters (shared across tabs)
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pending sub filter
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>('all');

  // Stats (KPI cards, independent of pagination)
  const [stats, setStats] = useState<ReconciliationStats>({
    conflictCount: 0,
    pendingCsCount: 0,
    pendingTeacherCount: 0,
  });

  // Tab data + server-side pagination
  const [conflicts, setConflicts] = useState<AttendanceRecord[]>([]);
  const [conflictTotal, setConflictTotal] = useState(0);
  const [conflictPage, setConflictPage] = useState(1);
  const [conflictPageSize, setConflictPageSize] = useState(20);

  const [pendingItems, setPendingItems] = useState<AttendanceRecord[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(20);

  const [historyItems, setHistoryItems] = useState<ReconciliationHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(20);

  // Bulk selection (pending tab)
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

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch(search.trim());
      setConflictPage(1);
      setPendingPage(1);
      setHistoryPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const baseFilters = useMemo(() => {
    const f: Record<string, string> = {};
    if (appliedSearch) f.search = appliedSearch;
    if (startDate) f.startDate = startDate;
    if (endDate) f.endDate = endDate;
    return f;
  }, [appliedSearch, startDate, endDate]);

  const loadStats = useCallback(async () => {
    try {
      const data = await reconciliationApi.getStats(baseFilters);
      setStats(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải số liệu đối soát');
    }
  }, [baseFilters, toast]);

  const loadConflicts = useCallback(async () => {
    try {
      const res = await reconciliationApi.getConflicts({
        ...baseFilters,
        page: conflictPage,
        pageSize: conflictPageSize,
      });
      setConflicts(res.items || []);
      setConflictTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách lệch điểm danh');
    }
  }, [baseFilters, conflictPage, conflictPageSize, toast]);

  const loadPending = useCallback(async () => {
    try {
      const res = await reconciliationApi.getPending({
        ...baseFilters,
        page: pendingPage,
        pageSize: pendingPageSize,
        ...(pendingFilter !== 'all' ? { state: pendingFilter } : {}),
      });
      setPendingItems(res.items || []);
      setPendingTotal(res.total || 0);
      setSelectedPendingIds([]);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách chờ duyệt');
    }
  }, [baseFilters, pendingPage, pendingPageSize, pendingFilter, toast]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await reconciliationApi.getHistory({
        ...baseFilters,
        page: historyPage,
        pageSize: historyPageSize,
      });
      setHistoryItems(res.items || []);
      setHistoryTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải lịch sử đối soát');
    }
  }, [baseFilters, historyPage, historyPageSize, toast]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadStats(), loadConflicts(), loadPending(), loadHistory()]);
    } finally {
      setIsLoading(false);
    }
  }, [loadStats, loadConflicts, loadPending, loadHistory]);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshAll]);

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setConflictPage(1);
    setPendingPage(1);
    setHistoryPage(1);
  };

  const handleOpenResolve = (record: AttendanceRecord) => {
    setSelectedRecord(record);
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
      await refreshAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể phân xử xung đột');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedPendingIds.length === 0) {
      toast.info('Vui lòng tích chọn ít nhất 1 buổi học để duyệt theo giáo viên');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await reconciliationApi.bulkApprovePending(selectedPendingIds);
      toast.success(`Đã duyệt thành công ${res.approvedCount} buổi học!`);
      setSelectedPendingIds([]);
      await refreshAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi duyệt hàng loạt');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveOne = async (record: AttendanceRecord) => {
    try {
      await reconciliationApi.bulkApprovePending([record.id]);
      toast.success('Đã duyệt theo giáo viên thành công!');
      await refreshAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi duyệt buổi học');
    }
  };

  const handleOpenCSMark = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    setCsStatus(record.cs_status || 'ATTENDED');
    setCsNote(record.cs_note || '');
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
      await refreshAll();
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

  const studentCell = (r: AttendanceRecord) => (
    <div>
      <div className="font-semibold text-text-primary">
        {r.enrollment_class?.enrollment?.student?.full_name}
      </div>
      <div className="text-xs text-text-muted flex gap-2 flex-wrap">
        <span>ID: {r.enrollment_class?.enrollment?.student?.external_id || 'N/A'}</span>
        <span>•</span>
        <span>{r.enrollment_class?.enrollment?.student?.phone || 'Chưa có SĐT'}</span>
      </div>
      <div className="text-xs text-teal-600 font-medium mt-0.5">
        Lớp: {r.enrollment_class?.class?.class_name}
      </div>
    </div>
  );

  const sessionCell = (r: AttendanceRecord) => (
    <div>
      <div className="font-medium text-text-primary">
        Buổi {r.class_session?.session_number}
      </div>
      <div className="text-xs text-text-muted flex items-center gap-1">
        <Calendar className="w-3.5 h-3.5" />
        {formatDate(r.class_session?.session_date)}
      </div>
      {r.class_session?.start_time && (
        <div className="text-[11px] text-text-muted">
          {r.class_session.start_time} - {r.class_session.end_time || ''}
        </div>
      )}
    </div>
  );

  // Columns for Conflicts Table
  const conflictColumns: Column<AttendanceRecord>[] = useMemo(
    () => [
      { header: 'Học viên', cell: studentCell },
      { header: 'Buổi học / Ngày', cell: sessionCell },
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
        header: 'Hành động',
        cell: (r) =>
          isAdmin ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleOpenResolve(r)}
              className="whitespace-nowrap"
            >
              <AlertCircle className="w-4 h-4 mr-1.5" />
              Phân xử
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleOpenCSMark(r)}
              className="whitespace-nowrap"
            >
              Ghi ý kiến CS
            </Button>
          ),
      },
    ],
    [isAdmin]
  );

  const teacherCell = (r: AttendanceRecord) => {
    const teachers = r.assigned_teachers || [];
    if (teachers.length === 0) {
      return <span className="text-xs text-text-muted italic">Chưa phân công</span>;
    }
    return (
      <div className="space-y-1">
        {teachers.map((teacher) => (
          <div key={teacher.id} className="text-xs">
            <div className="font-medium text-text-primary">{teacher.name}</div>
            <div className="text-text-muted">{teacher.code}{teacher.email ? ` • ${teacher.email}` : ''}</div>
          </div>
        ))}
      </div>
    );
  };

  const pendingColumns: Column<AttendanceRecord>[] = useMemo(() => {
    const commonColumns: Column<AttendanceRecord>[] = [
      { header: 'Học viên', cell: studentCell },
      { header: 'Buổi học / Ngày', cell: sessionCell },
      { header: 'Giáo viên', cell: teacherCell },
    ];

    const teacherReportColumn: Column<AttendanceRecord> = {
      header: 'GV đã báo',
      cell: (r) => {
        const cfg = r.teacher_status ? statusLabels[r.teacher_status] : null;
        return cfg ? (
          <div className="flex flex-col gap-1">
            <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
            {r.lesson_topic && <span className="text-xs text-teal-600 font-medium">Bài: {r.lesson_topic}</span>}
            <span className="text-[11px] text-text-muted">{formatDateTime(r.teacher_submitted_at)}</span>
          </div>
        ) : <span className="text-xs text-text-muted italic">Chưa nhập</span>;
      },
    };

    const csReportColumn: Column<AttendanceRecord> = {
      header: 'CSKH đã ghi nhận',
      cell: (r) => {
        const cfg = r.cs_status ? statusLabels[r.cs_status] : null;
        return cfg ? (
          <div className="flex flex-col gap-1">
            <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
            <span className="text-[11px] text-text-muted">{formatDateTime(r.cs_submitted_at)}</span>
          </div>
        ) : <span className="text-xs text-text-muted italic">Chưa ghi nhận</span>;
      },
    };

    const csActionColumn: Column<AttendanceRecord> = {
      header: 'Hành động',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleApproveOne(r)}
            disabled={isSubmitting}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Duyệt theo GV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleOpenCSMark(r)} disabled={isSubmitting}>
            Ghi nhận khác
          </Button>
        </div>
      ),
    };

    if (pendingFilter === 'PENDING_CS') {
      return [
        {
          header: (
            <input
              type="checkbox"
              className="rounded border-border"
              checked={pendingItems.length > 0 && selectedPendingIds.length === pendingItems.length}
              onChange={toggleSelectAllPending}
              aria-label="Chọn tất cả chờ CSKH"
            />
          ),
          width: '40px',
          cell: (r) => (
            <input
              type="checkbox"
              className="rounded border-border"
              checked={selectedPendingIds.includes(r.id)}
              onChange={() => toggleSelectPending(r.id)}
              aria-label={`Chọn buổi ${r.class_session?.session_number}`}
            />
          ),
        },
        ...commonColumns,
        teacherReportColumn,
        csActionColumn,
      ];
    }

    if (pendingFilter === 'PENDING_TEACHER') {
      return [
        ...commonColumns,
        csReportColumn,
        {
          header: 'Trạng thái',
          cell: () => <Badge variant="info" size="sm" dot>Đang chờ giáo viên</Badge>,
        },
      ];
    }

    return [
      ...commonColumns,
      teacherReportColumn,
      csReportColumn,
      {
        header: 'Đang chờ',
        cell: (r) => r.reconciliation_state === 'PENDING_CS'
          ? <Badge variant="accent" size="sm" dot>CSKH</Badge>
          : <Badge variant="info" size="sm" dot>Giáo viên</Badge>,
      },
      {
        header: 'Hành động',
        cell: (r) => r.reconciliation_state === 'PENDING_CS'
          ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => handleApproveOne(r)} disabled={isSubmitting}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Duyệt theo GV
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleOpenCSMark(r)} disabled={isSubmitting}>
                Ghi nhận khác
              </Button>
            </div>
          )
          : <span className="text-xs text-text-muted italic">Chờ GV báo</span>,
      },
    ];
  }, [pendingFilter, pendingItems, selectedPendingIds, isSubmitting]);

  // Columns for History Table
  const historyColumns: Column<ReconciliationHistoryItem>[] = useMemo(
    () => [
      {
        header: 'Thời gian',
        cell: (h) => (
          <span className="text-xs text-text-secondary whitespace-nowrap">
            {formatDateTime(h.created_at)}
          </span>
        ),
      },
      {
        header: 'Học viên',
        cell: (h) => (
          <div>
            <div className="font-semibold text-text-primary">{h.student?.full_name || 'N/A'}</div>
            <div className="text-xs text-text-muted">
              ID: {h.student?.external_id || 'N/A'}
              {h.class_name ? ` • Lớp: ${h.class_name}` : ''}
            </div>
          </div>
        ),
      },
      {
        header: 'Buổi học',
        cell: (h) =>
          h.session ? (
            <div>
              <div className="font-medium text-text-primary">Buổi {h.session.session_number}</div>
              <div className="text-xs text-text-muted flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(h.session.session_date)}
              </div>
            </div>
          ) : (
            <span className="text-xs text-text-muted italic">Buổi đã xóa</span>
          ),
      },
      {
        header: 'Hành động',
        cell: (h) => {
          const cfg = historyActionLabels[h.action];
          return cfg ? (
            <Badge variant={cfg.variant} size="sm">
              {cfg.label}
            </Badge>
          ) : (
            <Badge variant="neutral" size="sm">
              {h.action}
            </Badge>
          );
        },
      },
      {
        header: 'Thay đổi',
        cell: (h) => {
          const from = h.from_status ? statusLabels[h.from_status as AttendanceStatus] : null;
          const to = h.to_status ? statusLabels[h.to_status as AttendanceStatus] : null;
          return (
            <div className="flex items-center gap-1.5 flex-wrap">
              {from ? (
                <Badge variant={from.variant} size="sm">
                  {from.label}
                </Badge>
              ) : (
                <span className="text-xs text-text-muted italic">—</span>
              )}
              <span className="text-text-muted text-xs">→</span>
              {to ? (
                <Badge variant={to.variant} size="sm">
                  {to.label}
                </Badge>
              ) : (
                <span className="text-xs text-text-muted italic">—</span>
              )}
            </div>
          );
        },
      },
      {
        header: 'Người thực hiện',
        cell: (h) => (
          <span className="text-xs text-text-primary font-medium">{h.performed_by}</span>
        ),
      },
      {
        header: 'Lý do / Ghi chú',
        cell: (h) => (
          <span className="text-xs text-text-secondary italic">{h.note ? `"${h.note}"` : '—'}</span>
        ),
      },
    ],
    []
  );

  const tabItems: HorizontalTabItem<ReconciliationTab>[] = [
    {
      value: 'conflicts',
      label: 'Lệch điểm danh',
      icon: <AlertTriangle className="w-4 h-4 text-rose-500" />,
      badge: stats.conflictCount,
    },
    {
      value: 'pending',
      label: 'Chờ duyệt',
      icon: <Clock className="w-4 h-4 text-amber-500" />,
      badge: stats.pendingCsCount + stats.pendingTeacherCount,
    },
    {
      value: 'history',
      label: 'Lịch sử',
      icon: <History className="w-4 h-4 text-sky-500" />,
    },
  ];

  const pendingFilterButtons: { value: PendingFilter; label: string; count: number }[] = [
    { value: 'all', label: 'Tất cả', count: stats.pendingCsCount + stats.pendingTeacherCount },
    { value: 'PENDING_CS', label: 'Chờ CSKH', count: stats.pendingCsCount },
    { value: 'PENDING_TEACHER', label: 'Chờ GV', count: stats.pendingTeacherCount },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Đối Soát Điểm Danh"
        description="So khớp dữ liệu hai chiều (Giáo viên vs CSKH), phân xử ca lệch và duyệt buổi học."
      />

      {/* Tab Navigation (ngay dưới title theo convention các trang khác) */}
      <div className="mb-4">
        <HorizontalTabs
          items={tabItems}
          value={activeTab}
          onChange={(val) => setActiveTab(val)}
          ariaLabel="Tabs đối soát điểm danh"
        />
      </div>

      {/* KPI Overview Cards (độc lập phân trang — luôn là tổng toàn bộ theo bộ lọc) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <Card
          className={`border-l-4 border-l-rose-500 p-4 cursor-pointer transition-shadow hover:shadow-md ${
            activeTab === 'conflicts' ? 'ring-2 ring-rose-500/30' : ''
          }`}
          onClick={() => setActiveTab('conflicts')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted font-bold">
                Lệch điểm danh
              </p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1">{stats.conflictCount}</h3>
              <p className="text-xs text-text-secondary mt-0.5">Đang chờ phân xử — chưa chốt buổi</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </Card>

        <Card
          className={`border-l-4 border-l-amber-500 p-4 cursor-pointer transition-shadow hover:shadow-md ${
            activeTab === 'pending' && pendingFilter === 'PENDING_CS' ? 'ring-2 ring-amber-500/30' : ''
          }`}
          onClick={() => {
            setActiveTab('pending');
            setPendingFilter('PENDING_CS');
            setPendingPage(1);
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted font-bold">
                Chờ CSKH duyệt
              </p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{stats.pendingCsCount}</h3>
              <p className="text-xs text-text-secondary mt-0.5">GV đã báo — CSKH chưa ghi nhận</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </Card>

        <Card
          className={`border-l-4 border-l-sky-500 p-4 cursor-pointer transition-shadow hover:shadow-md ${
            activeTab === 'pending' && pendingFilter === 'PENDING_TEACHER' ? 'ring-2 ring-sky-500/30' : ''
          }`}
          onClick={() => {
            setActiveTab('pending');
            setPendingFilter('PENDING_TEACHER');
            setPendingPage(1);
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted font-bold">
                Chờ giáo viên báo
              </p>
              <h3 className="text-2xl font-bold text-sky-600 mt-1">{stats.pendingTeacherCount}</h3>
              <p className="text-xs text-text-secondary mt-0.5">CSKH đã ghi nhận — GV chưa báo</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-600">
              <UserRoundX className="w-6 h-6" />
            </div>
          </div>
        </Card>
      </div>

      <p className="text-xs text-text-muted mb-4 flex items-center gap-1.5">
        <HelpCircle className="w-3.5 h-3.5" />
        Hai bên khớp nhau → hệ thống tự chốt, trừ buổi và gửi thông báo Zalo. Lệch ý kiến → cần phân xử.
      </p>

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
                onChange={(e) => handleDateChange(e.target.value, endDate)}
                className="w-36 text-xs"
              />
              <span className="text-text-muted text-xs">đến</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => handleDateChange(startDate, e.target.value)}
                className="w-36 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === 'pending' && pendingFilter === 'PENDING_CS' && (
              <Button
                variant="primary"
                onClick={handleBulkApprove}
                disabled={isSubmitting || selectedPendingIds.length === 0}
              >
                <CheckCheck className="w-4 h-4 mr-1.5" />
                {selectedPendingIds.length > 0
                  ? `Duyệt theo GV (${selectedPendingIds.length})`
                  : 'Duyệt theo GV'}
              </Button>
            )}
            <Button variant="outline" onClick={refreshAll} disabled={isLoading}>
              <Filter className="w-4 h-4 mr-1.5" />
              Làm mới
            </Button>
          </div>
        </div>

        {/* Pending sub-filter */}
        {activeTab === 'pending' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
            <span className="text-xs font-semibold text-text-muted">Lọc:</span>
            {pendingFilterButtons.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={pendingFilter === f.value ? 'primary' : 'outline'}
                onClick={() => {
                  setPendingFilter(f.value);
                  setPendingPage(1);
                }}
              >
                {f.label} ({f.count})
              </Button>
            ))}
          </div>
        )}
      </Card>

      {/* Content Table */}
      {activeTab === 'conflicts' && (
        <DataTable
          columns={conflictColumns}
          data={conflicts}
          isLoading={isLoading}
          emptyMessage="Tuyệt vời! Hiện tại không có buổi học nào bị lệch thông tin."
          serverPagination
          total={conflictTotal}
          page={conflictPage}
          pageSize={conflictPageSize}
          onPageChange={setConflictPage}
          onPageSizeChange={setConflictPageSize}
        />
      )}
      {activeTab === 'pending' && (
        <DataTable
          columns={pendingColumns}
          data={pendingItems}
          isLoading={isLoading}
          emptyMessage="Không có buổi học nào đang chờ duyệt."
          serverPagination
          total={pendingTotal}
          page={pendingPage}
          pageSize={pendingPageSize}
          onPageChange={setPendingPage}
          onPageSizeChange={setPendingPageSize}
        />
      )}
      {activeTab === 'history' && (
        <DataTable
          columns={historyColumns}
          data={historyItems}
          isLoading={isLoading}
          emptyMessage="Chưa có thay đổi nào sau khi điểm danh lần 1."
          serverPagination
          total={historyTotal}
          page={historyPage}
          pageSize={historyPageSize}
          onPageChange={setHistoryPage}
          onPageSizeChange={setHistoryPageSize}
        />
      )}

      {/* MODAL 1: Phân xử lệch điểm danh */}
      <Modal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-rose-600 font-bold">
            <AlertTriangle className="w-5 h-5" />
            <span>Phân Xử Lệch Điểm Danh</span>
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
                  {formatDate(selectedRecord.class_session?.session_date)}
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
                  Lý do này sẽ được lưu vào tab Lịch sử và phục vụ chấm công, giải quyết khiếu nại.
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 2: Ghi nhận điểm danh CSKH */}
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
