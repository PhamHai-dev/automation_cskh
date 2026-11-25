import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  CheckCheck,
  Search,
  RefreshCw,
  Calendar,
  AlertCircle,
  HelpCircle,
  History,
  UserRoundX,
} from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar, ActiveFilterChip } from '../../../components/common/FilterBar';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { HorizontalTabs, HorizontalTabItem } from '../../../components/ui/HorizontalTabs';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
  cleanClassIdentifier,
  formatClassCode,
  formatScheduleTimeDisplay,
} from '../../classes/types/classes.types';
import { classesApi } from '../../classes/api/classes.api';
import { Class } from '../../classes/types/classes.types';
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

const statusLabels: Record<
  AttendanceStatus,
  {
    code: string;
    label: string;
    chipLabel: string;
    variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
  }
> = {
  ATTENDED: {
    code: '1',
    label: 'Có mặt',
    chipLabel: '1 · Có mặt',
    variant: 'success',
  },
  ABSENT_APPROVED_A: {
    code: 'A',
    label: 'Nghỉ phép (A)',
    chipLabel: 'A · Nghỉ phép (A)',
    variant: 'accent',
  },
  LEAVE_B: {
    code: 'B',
    label: 'Bảo lưu (B)',
    chipLabel: 'B · Bảo lưu (B)',
    variant: 'neutral',
  },
  ABSENT_UNAPPROVED_C: {
    code: 'C',
    label: 'Nghỉ sai QĐ (C)',
    chipLabel: 'C · Nghỉ sai QĐ (C)',
    variant: 'danger',
  },
  TEACHER_ABSENT_D: {
    code: 'D',
    label: 'GV nghỉ (D)',
    chipLabel: 'D · GV nghỉ (D)',
    variant: 'warning',
  },
  TECH_ERROR_E: {
    code: 'E',
    label: 'Lỗi kỹ thuật (E)',
    chipLabel: 'E · Lỗi kỹ thuật (E)',
    variant: 'info',
  },
};

const historyActionLabels: Record<
  ReconciliationHistoryAction,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }
> = {
  ATTENDANCE_CS_MARK: { label: 'CVHT ghi nhận', variant: 'info' },
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<ReconciliationTab>(() => {
    const t = searchParams.get('tab');
    return t === 'pending' || t === 'history' ? t : 'conflicts';
  });
  const [isLoading, setIsLoading] = useState(false);

  // Filters (shared across tabs)
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [appliedSearch, setAppliedSearch] = useState(() => searchParams.get('search') || '');
  const [programType, setProgramType] = useState<'ALL' | 'KAIWA' | 'JLPT'>(() => {
    const value = (searchParams.get('programType') || '').toUpperCase();
    return value === 'KAIWA' || value === 'JLPT' ? value : 'ALL';
  });
  const [classId, setClassId] = useState<number | undefined>(() => {
    const cid = Number(searchParams.get('classId'));
    return cid > 0 ? cid : undefined;
  });
  const [classesList, setClassesList] = useState<Class[]>([]);
  const [startDate, setStartDate] = useState(() => searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(() => searchParams.get('endDate') || '');

  // Pending sub filter
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>(() => {
    const pf = searchParams.get('pendingFilter');
    return pf === 'PENDING_CS' || pf === 'PENDING_TEACHER' ? pf : 'all';
  });

  useEffect(() => {
    classesApi
      .list()
      .then((items) => setClassesList(items || []))
      .catch(() => {});
  }, []);

  const currentUrlFilterSignatureRef = React.useRef('');
  currentUrlFilterSignatureRef.current = JSON.stringify({
    activeTab,
    search,
    programType,
    classId,
    startDate,
    endDate,
    pendingFilter,
  });
  const skipUrlWriteAfterRestoreRef = React.useRef(false);

  // Restore external URL changes (Back/Forward or links shared by another user).
  useEffect(() => {
    const queryValue = (key: string) => searchParams.get(key) || '';
    const tabParam = queryValue('tab');
    const nextTab: ReconciliationTab =
      tabParam === 'pending' || tabParam === 'history' ? tabParam : 'conflicts';
    const programParam = queryValue('programType').toUpperCase();
    const nextProgram: 'ALL' | 'KAIWA' | 'JLPT' =
      programParam === 'KAIWA' || programParam === 'JLPT' ? programParam : 'ALL';
    const parsedClassId = Number(queryValue('classId'));
    const nextClassId = parsedClassId > 0 ? parsedClassId : undefined;
    const pendingParam = queryValue('pendingFilter');
    const nextPending: PendingFilter =
      pendingParam === 'PENDING_CS' || pendingParam === 'PENDING_TEACHER'
        ? pendingParam
        : 'all';
    const nextSignature = JSON.stringify({
      activeTab: nextTab,
      search: queryValue('search'),
      programType: nextProgram,
      classId: nextClassId,
      startDate: queryValue('startDate'),
      endDate: queryValue('endDate'),
      pendingFilter: nextPending,
    });

    if (nextSignature === currentUrlFilterSignatureRef.current) return;
    skipUrlWriteAfterRestoreRef.current = true;
    setActiveTab(nextTab);
    setSearch(queryValue('search'));
    setAppliedSearch(queryValue('search').trim());
    setProgramType(nextProgram);
    setClassId(nextClassId);
    setStartDate(queryValue('startDate'));
    setEndDate(queryValue('endDate'));
    setPendingFilter(nextPending);
    setConflictPage(1);
    setPendingPage(1);
    setHistoryPage(1);
  }, [searchParams]);

  // Sync local filter state to URL after quick filters change.
  useEffect(() => {
    if (skipUrlWriteAfterRestoreRef.current) {
      skipUrlWriteAfterRestoreRef.current = false;
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (activeTab !== 'conflicts') next.set('tab', activeTab);
    else next.delete('tab');
    if (search.trim()) next.set('search', search.trim());
    else next.delete('search');
    if (programType !== 'ALL') next.set('programType', programType);
    else next.delete('programType');
    if (classId) next.set('classId', String(classId));
    else next.delete('classId');
    if (startDate) next.set('startDate', startDate);
    else next.delete('startDate');
    if (endDate) next.set('endDate', endDate);
    else next.delete('endDate');
    if (pendingFilter !== 'all') next.set('pendingFilter', pendingFilter);
    else next.delete('pendingFilter');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, search, programType, classId, startDate, endDate, pendingFilter, searchParams, setSearchParams]);

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
  const [conflictPageSize, setConflictPageSize] = useState(25);

  const [pendingItems, setPendingItems] = useState<AttendanceRecord[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(25);

  const [historyItems, setHistoryItems] = useState<ReconciliationHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);

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
    const f: Record<string, any> = {};
    if (appliedSearch) f.search = appliedSearch;
    if (programType !== 'ALL') f.programType = programType;
    if (classId) f.classId = classId;
    if (startDate) f.startDate = startDate;
    if (endDate) f.endDate = endDate;
    return f;
  }, [appliedSearch, programType, classId, startDate, endDate]);

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
      toast.success('Đã ghi nhận điểm danh CVHT thành công!');
      setIsCSMarkModalOpen(false);
      await refreshAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi ghi nhận điểm danh CVHT');
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

  const studentCell = (r: AttendanceRecord) => {
    const st = r.enrollment_class?.enrollment?.student;
    const cls = r.enrollment_class?.class;
    const stCode = st?.external_id || (st?.id ? `HV_${st.id}` : '—');
    const cName =
      cleanClassIdentifier(cls?.class_name) ||
      cleanClassIdentifier((cls as any)?.class_code) ||
      cls?.class_name ||
      '—';
    const cCode = formatClassCode((cls as any)?.class_code, cls?.id);
    return (
      <div className="space-y-0.5">
        <div className="font-bold text-text-primary">{st?.full_name || '—'}</div>
        <div className="text-xs text-text-muted flex items-center gap-1.5 flex-wrap">
          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
            {stCode}
          </span>
          {st?.phone && <span>• {st.phone}</span>}
        </div>
        <div className="text-xs text-teal-700 font-semibold">
          Lớp: {cName}
          {cCode && cCode !== '—' && cCode !== cName ? ` (${cCode})` : ''}
        </div>
      </div>
    );
  };

  const sessionCell = (r: AttendanceRecord) => {
    const startFmt = formatScheduleTimeDisplay(r.class_session?.start_time);
    const endFmt = formatScheduleTimeDisplay(r.class_session?.end_time);
    return (
      <div className="space-y-0.5 whitespace-nowrap">
        <div className="font-bold text-text-primary">
          Buổi {r.class_session?.session_number ?? '—'}
        </div>
        <div className="text-xs text-text-secondary flex items-center gap-1 font-medium">
          <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          <span>{formatDate(r.class_session?.session_date)}</span>
        </div>
        {startFmt && (
          <div className="font-mono text-[11px] text-text-muted">
            {startFmt}
            {endFmt ? ` - ${endFmt}` : ''}
          </div>
        )}
      </div>
    );
  };

  // Columns for Conflicts Table
  const conflictColumns: Column<AttendanceRecord>[] = useMemo(
    () => [
      { align: 'left' as const, wrap: true, header: 'Học viên & Lớp học', cell: studentCell },
      { align: 'center' as const, wrap: false, header: 'Buổi học / Ngày', cell: sessionCell },
      {
        align: 'left' as const, wrap: true, header: 'Giáo viên báo cáo',
        cell: (r) => {
          const cfg = r.teacher_status ? statusLabels[r.teacher_status] : null;
          return (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-bold text-amber-800">Ý kiến GV:</span>
                {cfg ? (
                  <Badge variant={cfg.variant} size="sm">
                    {cfg.chipLabel}
                  </Badge>
                ) : (
                  <span className="text-xs text-text-muted italic">Chưa chấm</span>
                )}
              </div>
              {r.lesson_topic && (
                <div className="text-xs text-text-primary font-semibold">
                  Bài học: <span className="text-teal-700">{r.lesson_topic}</span>
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
        align: 'left' as const, wrap: true, header: 'CVHT ghi nhận',
        cell: (r) => {
          const cfg = r.cs_status ? statusLabels[r.cs_status] : null;
          return (
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-bold text-blue-800">Ý kiến CVHT:</span>
                {cfg ? (
                  <Badge variant={cfg.variant} size="sm">
                    {cfg.chipLabel}
                  </Badge>
                ) : (
                  <span className="text-xs text-text-muted italic">Chưa chấm</span>
                )}
              </div>
              {r.cs_note && (
                <div className="text-xs text-text-secondary italic">"{r.cs_note}"</div>
              )}
              <div className="text-[10px] text-text-muted mt-1">
                Bởi: {r.cs_user?.name || r.enrollment_class?.enrollment?.cs?.name || 'CVHT'}
              </div>
            </div>
          );
        },
      },
      {
        align: 'center' as const, wrap: false, header: 'Thao tác',
        className: 'text-right',
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
              variant="outline"
              onClick={() => handleOpenCSMark(r)}
              className="whitespace-nowrap"
            >
              Ghi nhận CVHT
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
            <div className="font-semibold text-text-primary">{teacher.name}</div>
            <div className="font-mono text-[11px] text-text-muted">
              {teacher.code}
              {teacher.email ? ` • ${teacher.email}` : ''}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const pendingColumns: Column<AttendanceRecord>[] = useMemo(() => {
    const commonColumns: Column<AttendanceRecord>[] = [
      { align: 'left' as const, wrap: true, header: 'Học viên & Lớp học', cell: studentCell },
      { align: 'center' as const, wrap: false, header: 'Buổi học / Ngày', cell: sessionCell },
      { align: 'left' as const, wrap: true, header: 'Giáo viên', cell: teacherCell },
    ];

    const teacherReportColumn: Column<AttendanceRecord> = {
      align: 'center' as const, wrap: false, header: 'Điểm danh GV',
      cell: (r) => {
        const cfg = r.teacher_status ? statusLabels[r.teacher_status] : null;
        return cfg ? (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={cfg.variant} size="sm">
              {cfg.chipLabel}
            </Badge>
            {r.lesson_topic && (
              <span className="text-xs text-teal-700 font-semibold">
                Bài học: {r.lesson_topic}
              </span>
            )}
            {r.teacher_note && (
              <span className="text-xs text-text-secondary italic">"{r.teacher_note}"</span>
            )}
            <span className="text-[11px] text-text-muted">
              {formatDateTime(r.teacher_submitted_at)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-text-muted italic">Chưa chấm</span>
        );
      },
    };

    const csReportColumn: Column<AttendanceRecord> = {
      align: 'left' as const, wrap: true, header: 'Điểm danh CVHT',
      cell: (r) => {
        const cfg = r.cs_status ? statusLabels[r.cs_status] : null;
        return cfg ? (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={cfg.variant} size="sm">
              {cfg.chipLabel}
            </Badge>
            {r.cs_note && (
              <span className="text-xs text-text-secondary italic">"{r.cs_note}"</span>
            )}
            <span className="text-[11px] text-text-muted">
              {formatDateTime(r.cs_submitted_at)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-text-muted italic">Chưa chấm</span>
        );
      },
    };

    const csActionColumn: Column<AttendanceRecord> = {
      align: 'center' as const, wrap: false, header: 'Thao tác',
      className: 'text-right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleApproveOne(r)}
            disabled={isSubmitting}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Khớp theo GV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleOpenCSMark(r)}
            disabled={isSubmitting}
          >
            Ghi nhận khác
          </Button>
        </div>
      ),
    };

    if (pendingFilter === 'PENDING_CS') {
      return [
        {
          align: 'center' as const, wrap: false, header: (
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border-strong accent-primary cursor-pointer"
              checked={
                pendingItems.length > 0 && selectedPendingIds.length === pendingItems.length
              }
              onChange={toggleSelectAllPending}
              aria-label="Chọn tất cả chờ CVHT"
            />
          ),
          width: '40px',
          cell: (r) => (
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border-strong accent-primary cursor-pointer"
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
          align: 'center' as const, wrap: false, header: 'Trạng thái chờ',
          cell: () => (
            <Badge variant="info" size="sm" dot>
              Chờ GV chấm
            </Badge>
          ),
        },
      ];
    }

    return [
      ...commonColumns,
      teacherReportColumn,
      csReportColumn,
      {
        align: 'center' as const, wrap: false, header: 'Trạng thái chờ',
        cell: (r) =>
          !r.teacher_status && !r.cs_status ? (
            <Badge variant="neutral" size="sm" dot>
              Chưa bên nào chấm
            </Badge>
          ) : r.reconciliation_state === 'PENDING_CS' ? (
            <Badge variant="warning" size="sm" dot>
              Chờ CVHT chấm
            </Badge>
          ) : (
            <Badge variant="info" size="sm" dot>
              Chờ GV chấm
            </Badge>
          ),
      },
      {
        align: 'center' as const, wrap: false, header: 'Thao tác',
        className: 'text-right',
        cell: (r) =>
          !r.teacher_status && !r.cs_status ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOpenCSMark(r)}
                disabled={isSubmitting}
              >
                Chấm điểm danh
              </Button>
            </div>
          ) : r.reconciliation_state === 'PENDING_CS' ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleApproveOne(r)}
                disabled={isSubmitting}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Khớp theo GV
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleOpenCSMark(r)}
                disabled={isSubmitting}
              >
                Ghi nhận khác
              </Button>
            </div>
          ) : (
            <span className="text-xs text-text-muted italic">Chờ GV chấm</span>
          ),
      },
    ];
  }, [pendingFilter, pendingItems, selectedPendingIds, isSubmitting]);

  // Columns for History Table
  const historyColumns: Column<ReconciliationHistoryItem>[] = useMemo(
    () => [
      {
        align: 'center' as const, wrap: false, header: 'Thời gian',
        cell: (h) => (
          <span className="text-xs font-medium text-text-primary whitespace-nowrap">
            {formatDateTime(h.created_at)}
          </span>
        ),
      },
      {
        align: 'left' as const, wrap: true, header: 'Học viên & Lớp học',
        cell: (h) => {
          const stCode =
            h.student?.external_id || (h.student?.id ? `HV_${h.student.id}` : '—');
          const cleanedCls = cleanClassIdentifier(h.class_name) || h.class_name || '—';
          return (
            <div className="space-y-0.5">
              <div className="font-bold text-text-primary">
                {h.student?.full_name || '—'}
              </div>
              <div className="text-xs text-text-muted flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
                  {stCode}
                </span>
                {cleanedCls !== '—' && (
                  <span className="font-semibold text-teal-700">• Lớp: {cleanedCls}</span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        align: 'center' as const, wrap: false, header: 'Buổi học / Ngày',
        cell: (h) =>
          h.session ? (
            <div className="space-y-0.5 whitespace-nowrap">
              <div className="font-bold text-text-primary">
                Buổi {h.session.session_number}
              </div>
              <div className="text-xs text-text-secondary flex items-center gap-1 font-medium">
                <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                {formatDate(h.session.session_date)}
              </div>
            </div>
          ) : (
            <span className="text-xs text-text-muted italic">Buổi đã xóa</span>
          ),
      },
      {
        align: 'center' as const, wrap: false, header: 'Thao tác đối soát',
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
        align: 'center' as const, wrap: false, header: 'Thay đổi trạng thái',
        cell: (h) => {
          const from = h.from_status ? statusLabels[h.from_status as AttendanceStatus] : null;
          const to = h.to_status ? statusLabels[h.to_status as AttendanceStatus] : null;
          return (
            <div className="flex items-center gap-1.5 flex-wrap">
              {from ? (
                <Badge variant={from.variant} size="sm">
                  {from.chipLabel}
                </Badge>
              ) : (
                <span className="text-xs text-text-muted italic">—</span>
              )}
              <span className="text-text-muted text-xs">→</span>
              {to ? (
                <Badge variant={to.variant} size="sm">
                  {to.chipLabel}
                </Badge>
              ) : (
                <span className="text-xs text-text-muted italic">—</span>
              )}
            </div>
          );
        },
      },
      {
        align: 'left' as const, wrap: true, header: 'Người thực hiện',
        cell: (h) => (
          <span className="text-xs text-text-primary font-semibold">{h.performed_by}</span>
        ),
      },
      {
        align: 'left' as const, wrap: true, header: 'Lý do / Ghi chú',
        cell: (h) => (
          <span className="text-xs text-text-secondary italic">
            {h.note ? `"${h.note}"` : '—'}
          </span>
        ),
      },
    ],
    []
  );

  const tabItems: HorizontalTabItem<ReconciliationTab>[] = [
    {
      value: 'conflicts',
      label: 'Lệch điểm danh',
      icon: <AlertTriangle className="w-4 h-4" />,
      badge: stats.conflictCount,
    },
    {
      value: 'pending',
      label: 'Chờ đối soát',
      icon: <Clock className="w-4 h-4" />,
      badge: stats.pendingCsCount + stats.pendingTeacherCount,
    },
    {
      value: 'history',
      label: 'Lịch sử đối soát',
      icon: <History className="w-4 h-4" />,
    },
  ];

  const pendingFilterButtons: { value: PendingFilter; label: string; count: number }[] = [
    { value: 'all', label: 'Tất cả', count: stats.pendingCsCount + stats.pendingTeacherCount },
    { value: 'PENDING_CS', label: 'Chờ CVHT', count: stats.pendingCsCount },
    { value: 'PENDING_TEACHER', label: 'Chờ GV', count: stats.pendingTeacherCount },
  ];

  const activeFiltersCount = useMemo(
    () =>
      (search.trim() ? 1 : 0) +
      (programType !== 'ALL' ? 1 : 0) +
      (classId ? 1 : 0) +
      (startDate || endDate ? 1 : 0) +
      (activeTab === 'pending' && pendingFilter !== 'all' ? 1 : 0),
    [search, programType, classId, startDate, endDate, activeTab, pendingFilter]
  );

  const resetListPages = () => {
    setConflictPage(1);
    setPendingPage(1);
    setHistoryPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setProgramType('ALL');
    setClassId(undefined);
    setStartDate('');
    setEndDate('');
    setPendingFilter('all');
    resetListPages();
  };

  const selectedClassLabel = useMemo(() => {
    const selectedClass = classesList.find((item) => item.id === classId);
    if (!selectedClass) return classId ? `#${classId}` : '';
    const cleaned = cleanClassIdentifier(selectedClass.class_name) || selectedClass.class_name;
    const code = formatClassCode(selectedClass.class_code, selectedClass.id);
    return code && code !== '—' && code !== cleaned ? `${cleaned} (${code})` : cleaned;
  }, [classId, classesList]);

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (search.trim()) {
      chips.push({
        id: 'search',
        label: 'Tìm kiếm',
        value: search.trim(),
        onRemove: () => {
          setSearch('');
          setAppliedSearch('');
          resetListPages();
        },
      });
    }
    if (programType !== 'ALL') {
      chips.push({
        id: 'program',
        label: 'Chương trình',
        value: programType === 'KAIWA' ? 'Kaiwa' : 'JLPT',
        tone: programType === 'KAIWA' ? 'kaiwa' : 'jlpt',
        onRemove: () => {
          setProgramType('ALL');
          resetListPages();
        },
      });
    }
    if (classId) {
      chips.push({
        id: 'class',
        label: 'Lớp',
        value: selectedClassLabel,
        onRemove: () => {
          setClassId(undefined);
          resetListPages();
        },
      });
    }
    if (activeTab === 'pending' && pendingFilter !== 'all') {
      chips.push({
        id: 'pending-state',
        label: 'Trạng thái',
        value: pendingFilter === 'PENDING_CS' ? 'Chờ CVHT duyệt' : 'Chờ GV điểm danh',
        tone: 'warning',
        onRemove: () => {
          setPendingFilter('all');
          setPendingPage(1);
        },
      });
    }
    if (startDate || endDate) {
      chips.push({
        id: 'date-range',
        label: 'Ngày học',
        value: `${startDate || 'Từ đầu'} – ${endDate || 'Đến nay'}`,
        onRemove: () => handleDateChange('', ''),
      });
    }
    return chips;
  }, [search, programType, classId, selectedClassLabel, activeTab, pendingFilter, startDate, endDate]);

  return (
    <PageContainer>
      <PageHeader title="Đối soát Điểm danh" />

      {/* 3 Tab lớn ngay dưới PageHeader đồng bộ toàn hệ thống */}
      <HorizontalTabs
        items={tabItems}
        value={activeTab}
        onChange={(val) => setActiveTab(val)}
        ariaLabel="Chế độ đối soát điểm danh"
        className="mb-4"
      />

      <FilterBar
        variant="toolbar"
        title="Bộ lọc đối soát điểm danh"
        activeCount={activeFiltersCount}
        chips={activeFilterChips}
        onClear={handleResetFilters}
      >
        <div className="relative min-w-[240px] flex-1 xl:min-w-[300px]">
          <label htmlFor="reconciliation-search" className="sr-only">
            Tìm kiếm học viên hoặc lớp học
          </label>
          <input
            id="reconciliation-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tên, mã HV, SĐT, email, khóa, gói, lớp..."
            className="h-9 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-xs font-medium text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" aria-hidden="true" />
        </div>

        <div className="w-[138px] shrink-0">
          <label htmlFor="reconciliation-program-filter" className="sr-only">
            Chương trình
          </label>
          <select
            id="reconciliation-program-filter"
            value={programType}
            onChange={(event) => {
              setProgramType(event.target.value as 'ALL' | 'KAIWA' | 'JLPT');
              resetListPages();
            }}
            className="h-9 w-full cursor-pointer rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">Tất cả chương trình</option>
            <option value="KAIWA">Kaiwa</option>
            <option value="JLPT">JLPT</option>
          </select>
        </div>

        <div className="min-w-[190px] flex-1 xl:max-w-[270px]">
          <label htmlFor="reconciliation-class-filter" className="sr-only">
            Lớp học
          </label>
          <select
            id="reconciliation-class-filter"
            value={classId ?? ''}
            onChange={(event) => {
              setClassId(event.target.value ? Number(event.target.value) : undefined);
              resetListPages();
            }}
            className="h-9 w-full cursor-pointer rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Tất cả lớp học</option>
            {classesList.map((cls) => {
              const cleaned = cleanClassIdentifier(cls.class_name) || cls.class_name;
              const code = formatClassCode(cls.class_code, cls.id);
              return (
                <option key={cls.id} value={cls.id}>
                  {cleaned}
                  {code && code !== '—' && code !== cleaned ? ` (${code})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {activeTab === 'pending' && (
          <div className="w-[190px] shrink-0">
            <label htmlFor="reconciliation-pending-filter" className="sr-only">
              Trạng thái chờ đối soát
            </label>
            <select
              id="reconciliation-pending-filter"
              value={pendingFilter}
              onChange={(event) => {
                setPendingFilter(event.target.value as PendingFilter);
                setPendingPage(1);
              }}
              className="h-9 w-full cursor-pointer rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">
                Tất cả trạng thái ({stats.pendingCsCount + stats.pendingTeacherCount})
              </option>
              <option value="PENDING_CS">Chờ CVHT duyệt ({stats.pendingCsCount})</option>
              <option value="PENDING_TEACHER">Chờ GV điểm danh ({stats.pendingTeacherCount})</option>
            </select>
          </div>
        )}

        <div className="w-[145px] shrink-0">
          <label htmlFor="reconciliation-start-date" className="sr-only">
            Từ ngày
          </label>
          <input
            id="reconciliation-start-date"
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => handleDateChange(event.target.value, endDate)}
            className="h-9 w-full rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary"
            title="Từ ngày"
          />
        </div>

        <div className="w-[145px] shrink-0">
          <label htmlFor="reconciliation-end-date" className="sr-only">
            Đến ngày
          </label>
          <input
            id="reconciliation-end-date"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => handleDateChange(startDate, event.target.value)}
            className="h-9 w-full rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary"
            title="Đến ngày"
          />
        </div>
      </FilterBar>

      {/* Khung Bảng chuẩn Design System kèm Thanh công cụ KPI trên đầu bảng */}
      <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
        {/* Table Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/80 bg-surface-subtle/60 p-3 sm:px-4 text-xs">
          {/* Bên trái: Các chip KPI lọc nhanh */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('conflicts')}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'conflicts'
                  ? 'border-rose-400 bg-rose-50 text-rose-800 shadow-2xs ring-1 ring-rose-300'
                  : 'border-rose-200/80 bg-rose-50/40 text-rose-700 hover:bg-rose-50'
              }`}
              title="Xem các buổi GV và CVHT chấm lệch nhau"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Lệch điểm danh:</span>
              <strong className="font-extrabold text-rose-900">{stats.conflictCount}</strong>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('pending');
                setPendingFilter('PENDING_CS');
                setPendingPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'pending' && pendingFilter === 'PENDING_CS'
                  ? 'border-amber-400 bg-amber-50 text-amber-800 shadow-2xs ring-1 ring-amber-300'
                  : 'border-amber-200/80 bg-amber-50/40 text-amber-700 hover:bg-amber-50'
              }`}
              title="GV đã báo — đang chờ CVHT xác nhận"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
              <span>Chờ CVHT duyệt:</span>
              <strong className="font-extrabold text-amber-900">{stats.pendingCsCount}</strong>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('pending');
                setPendingFilter('PENDING_TEACHER');
                setPendingPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'pending' && pendingFilter === 'PENDING_TEACHER'
                  ? 'border-sky-400 bg-sky-50 text-sky-800 shadow-2xs ring-1 ring-sky-300'
                  : 'border-sky-200/80 bg-sky-50/40 text-sky-700 hover:bg-sky-50'
              }`}
              title="CVHT đã ghi nhận — đang chờ GV điểm danh"
            >
              <UserRoundX className="w-3.5 h-3.5 text-sky-600" />
              <span>Chờ GV chấm:</span>
              <strong className="font-extrabold text-sky-900">{stats.pendingTeacherCount}</strong>
            </button>
          </div>

          {/* Bên phải: Bộ chuyển phân loại chờ + Thao tác duyệt hàng loạt + Làm mới */}
          <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
            {activeTab === 'pending' && (
              <div
                className="inline-flex max-w-full flex-wrap items-center p-1 bg-surface-muted rounded-xl border border-border/90 gap-1"
                role="tablist"
                aria-label="Chọn phân loại chờ đối soát"
              >
                <span className="px-2 text-[11px] font-semibold text-text-muted select-none">
                  Hiển thị:
                </span>
                {pendingFilterButtons.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => {
                      setPendingFilter(f.value);
                      setPendingPage(1);
                    }}
                    className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      pendingFilter === f.value
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-surface/60 text-text-secondary hover:bg-surface hover:text-text-primary'
                    }`}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'pending' && pendingFilter === 'PENDING_CS' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkApprove}
                disabled={isSubmitting || selectedPendingIds.length === 0}
                className="h-9 px-3 text-xs font-bold"
              >
                <CheckCheck className="w-4 h-4 mr-1.5" />
                {selectedPendingIds.length > 0
                  ? `Khớp theo GV (${selectedPendingIds.length})`
                  : 'Khớp theo GV'}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={isLoading}
              title="Làm mới dữ liệu"
              aria-label="Làm mới dữ liệu"
              className="h-9 px-2.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Content Table */}
        {activeTab === 'conflicts' && (
          <DataTable
            columns={conflictColumns}
            data={conflicts}
            isLoading={isLoading}
            emptyMessage="Hiện tại không có buổi học nào bị lệch điểm danh giữa Giáo viên và CVHT."
            serverPagination
            total={conflictTotal}
            page={conflictPage}
            pageSize={conflictPageSize}
            onPageChange={setConflictPage}
            onPageSizeChange={setConflictPageSize}
            bare
          />
        )}
        {activeTab === 'pending' && (
          <DataTable
            columns={pendingColumns}
            data={pendingItems}
            isLoading={isLoading}
            emptyMessage="Không có buổi học nào đang chờ đối soát."
            serverPagination
            total={pendingTotal}
            page={pendingPage}
            pageSize={pendingPageSize}
            onPageChange={setPendingPage}
            onPageSizeChange={setPendingPageSize}
            bare
          />
        )}
        {activeTab === 'history' && (
          <DataTable
            columns={historyColumns}
            data={historyItems}
            isLoading={isLoading}
            emptyMessage="Chưa có lịch sử đối soát hoặc phân xử điểm danh."
            serverPagination
            total={historyTotal}
            page={historyPage}
            pageSize={historyPageSize}
            onPageChange={setHistoryPage}
            onPageSizeChange={setHistoryPageSize}
            bare
          />
        )}
      </div>

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
                  <span className="text-xs font-bold text-blue-700">CVHT GHI NHẬN</span>
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
                  <option value="ATTENDED">1 · Có mặt (Tính buổi học viên & GV)</option>
                  <option value="ABSENT_APPROVED_A">
                    A · Nghỉ phép (A) (Lớp 1:1 không trừ buổi, học bù sau)
                  </option>
                  <option value="LEAVE_B">B · Bảo lưu (B)</option>
                  <option value="ABSENT_UNAPPROVED_C">
                    C · Nghỉ sai QĐ (C) (Trừ buổi học viên)
                  </option>
                  <option value="TEACHER_ABSENT_D">D · GV nghỉ (D) (Không tính buổi)</option>
                  <option value="TECH_ERROR_E">E · Lỗi kỹ thuật (E) (Không tính buổi)</option>
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

      {/* MODAL 2: Ghi nhận điểm danh CVHT */}
      <Modal
        isOpen={isCSMarkModalOpen}
        onClose={() => setIsCSMarkModalOpen(false)}
        title="Ghi nhận điểm danh CVHT"
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
          {selectedRecord && (
            <div className="rounded-xl border border-border/70 bg-surface-muted/60 p-3 text-xs space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-text-primary text-sm">
                    {selectedRecord.enrollment_class?.enrollment?.student?.full_name}
                  </p>
                  <p className="text-text-muted mt-0.5">
                    Mã HV: {selectedRecord.enrollment_class?.enrollment?.student?.external_id || 'N/A'} •{' '}
                    Lớp: {selectedRecord.enrollment_class?.class?.class_name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-semibold text-text-primary">
                    Buổi {selectedRecord.class_session?.session_number}
                  </span>
                  <p className="text-text-muted">
                    {formatDate(selectedRecord.class_session?.session_date)}
                  </p>
                </div>
              </div>
              <div className="border-t border-border/60 pt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-amber-700">Ý kiến GV:</span>
                  {selectedRecord.teacher_status ? (
                    <Badge
                      variant={statusLabels[selectedRecord.teacher_status]?.variant || 'neutral'}
                      size="sm"
                    >
                      {statusLabels[selectedRecord.teacher_status]?.label}
                    </Badge>
                  ) : (
                    <span className="text-text-muted italic">GV chưa điểm danh</span>
                  )}
                  {selectedRecord.lesson_topic && (
                    <span className="text-teal-700 font-medium">
                      • Bài: {selectedRecord.lesson_topic}
                    </span>
                  )}
                </div>
                {selectedRecord.teacher_note && (
                  <p className="text-text-secondary italic mt-1">
                    Ghi chú GV: "{selectedRecord.teacher_note}"
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Trạng thái điểm danh CVHT
            </label>
            <Select
              value={csStatus}
              onChange={(e) => setCsStatus(e.target.value as AttendanceStatus)}
            >
              <option value="ATTENDED">1 · Có mặt</option>
              <option value="ABSENT_APPROVED_A">A · Nghỉ phép (A)</option>
              <option value="LEAVE_B">B · Bảo lưu (B)</option>
              <option value="ABSENT_UNAPPROVED_C">C · Nghỉ sai QĐ (C)</option>
              <option value="TEACHER_ABSENT_D">D · GV nghỉ (D)</option>
              <option value="TECH_ERROR_E">E · Lỗi kỹ thuật (E)</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Ghi chú của CVHT
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
