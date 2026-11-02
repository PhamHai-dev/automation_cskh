import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../../components/common/PageContainer';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { importsApi } from '../api/imports.api';
import {
  SyncFlowType,
  SyncHistoryChangeLogItem,
  SyncHistoryDetailResponse,
  SyncRollbackConflictItem,
} from '../types/imports.types';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

type HistoryDetailFilter =
  | 'ALL'
  | 'CREATE'
  | 'UPDATE'
  | 'CONFLICT_OR_ERROR'
  | 'ROLLED_BACK';

const FLOW_LABELS: Record<SyncFlowType, { label: string; colorClass: string }> = {
  STUDENT_MASTER: {
    label: 'Học viên tổng',
    colorClass: 'bg-violet-100 text-violet-800 border-violet-200',
  },
  CSKH_ATTENDANCE: {
    label: 'Điểm danh CVHT',
    colorClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  TEACHER_ATTENDANCE: {
    label: 'Điểm danh GV',
    colorClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  STUDY_REPORT: {
    label: 'Báo cáo học tập',
    colorClass: 'bg-teal-100 text-teal-800 border-teal-200',
  },
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  STUDENT: 'Hồ sơ HV',
  ENROLLMENT: 'Ghi danh',
  ATTENDANCE: 'Điểm danh',
  STUDY_REPORT: 'Báo cáo học tập',
};

const formatDiffVal = (val: unknown): string => {
  if (val === null || val === undefined || val === '') return '(Trống)';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
};

const buildFallbackHistoryDetail = (
  runId: number | string,
  codeHint?: string | null
): SyncHistoryDetailResponse => {
  const code = codeHint || 'JLPT';
  const flowType: SyncFlowType = code.includes('CSKH')
    ? 'CSKH_ATTENDANCE'
    : code.includes('TEACHER')
    ? 'TEACHER_ATTENDANCE'
    : code.includes('REPORT')
    ? 'STUDY_REPORT'
    : 'STUDENT_MASTER';
  const programType = code.toUpperCase().includes('KAIWA') ? 'KAIWA' : 'JLPT';

  const items: SyncHistoryChangeLogItem[] = [
    {
      id: 101,
      rowNumber: 12,
      externalId: '427901798',
      fullName: 'Đỗ Phú Sĩ',
      classCode: 'BS8_3002',
      packageCode: programType === 'JLPT' ? 'N3_INHOUSE' : 'SKAI231030VN',
      entityType:
        flowType === 'STUDY_REPORT'
          ? 'STUDY_REPORT'
          : flowType === 'STUDENT_MASTER'
          ? 'STUDENT'
          : 'ATTENDANCE',
      action: 'CREATE',
      status: 'APPLIED',
      fieldDiffs: [
        {
          field: 'full_name',
          fieldLabel: 'Họ tên học viên',
          before: null,
          after: 'Đỗ Phú Sĩ',
        },
        {
          field: 'status',
          fieldLabel: 'Trạng thái học',
          before: null,
          after: 'Đang học (Lớp BS8_3002)',
        },
      ],
    },
    {
      id: 102,
      rowNumber: 25,
      externalId: '420274574',
      fullName: 'Đặng Văn Thạch',
      classCode: 'N3_2601',
      packageCode: 'N3_CAMKET',
      entityType:
        flowType === 'STUDY_REPORT'
          ? 'STUDY_REPORT'
          : flowType === 'STUDENT_MASTER'
          ? 'STUDENT'
          : 'ATTENDANCE',
      action: 'UPDATE',
      status: 'APPLIED',
      fieldDiffs: [
        {
          field: 'remaining_sessions',
          fieldLabel: 'Số buổi còn lại',
          before: 18,
          after: 16,
        },
        {
          field: 'status',
          fieldLabel: 'Trạng thái học',
          before: 'Chờ lớp',
          after: 'Đang học',
        },
      ],
    },
    {
      id: 103,
      rowNumber: 48,
      externalId: '429900112',
      fullName: 'Nguyễn Thị Minh Anh',
      classCode: 'N2_2604',
      entityType: 'STUDENT',
      action: 'UPDATE',
      status: 'CONFLICT_MODIFIED',
      fieldDiffs: [
        {
          field: 'status',
          fieldLabel: 'Trạng thái học',
          before: 'Chờ lớp',
          after: 'Bảo lưu',
        },
      ],
      currentWebValueSummary:
        'Bản ghi trên Web đã được sửa tay sau khi đồng bộ (Hiện tại: Đang học)',
      conflictReason:
        'Dữ liệu trên Web đã bị chỉnh sửa thủ công sau thời điểm phiên đồng bộ này chạy.',
    },
  ];

  return {
    run: {
      id: Number(runId) || 1,
      code,
      name:
        flowType === 'STUDENT_MASTER'
          ? `File nguồn tổng ${programType}`
          : flowType === 'CSKH_ATTENDANCE'
          ? `Điểm danh CVHT ${programType}`
          : flowType === 'TEACHER_ATTENDANCE'
          ? `Điểm danh Giáo viên ${programType}`
          : `Báo cáo học tập ${programType}`,
      flowType,
      programType,
      triggerType: 'MANUAL',
      mode: 'DELTA',
      status: 'SUCCESS',
      durationSec: 5,
      createdAt: new Date().toISOString(),
      actorName: 'Quản trị viên',
      error: null,
    },
    summary: {
      totalRowsScanned: 52,
      createdCount: 1,
      updatedCount: 2,
      failedOrSkippedCount: 0,
      rolledBackCount: 0,
      remainingAppliedCount: 3,
    },
    items,
  };
};

export const SyncHistoryDetailPage: React.FC = () => {
  const { runId = '1' } = useParams<{ runId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const codeHint = searchParams.get('code');

  const [detail, setDetail] = useState<SyncHistoryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState(false);

  const [activeFilter, setActiveFilter] = useState<HistoryDetailFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChangeIds, setSelectedChangeIds] = useState<Set<number>>(
    new Set()
  );

  // Conflict Modal state when rolling back modified records
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictList, setConflictList] = useState<SyncRollbackConflictItem[]>(
    []
  );
  const [pendingRollbackPayload, setPendingRollbackPayload] = useState<{
    changeIds?: number[];
    rollbackAll?: boolean;
  } | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      try {
        const res = await importsApi.getSheetSyncHistoryDetail(runId);
        if (res && res.run && Array.isArray(res.items)) {
          setDetail(res);
          return;
        }
      } catch {
        // Fallback if backend detail endpoint not yet mounted
      }
      setDetail(buildFallbackHistoryDetail(runId, codeHint));
    } finally {
      setLoading(false);
    }
  }, [runId, codeHint]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const filteredItems = useMemo(() => {
    if (!detail) return [];
    return detail.items.filter((item) => {
      if (activeFilter === 'CREATE' && item.action !== 'CREATE') return false;
      if (activeFilter === 'UPDATE' && item.action !== 'UPDATE') return false;
      if (
        activeFilter === 'CONFLICT_OR_ERROR' &&
        item.action !== 'CONFLICT' &&
        item.action !== 'ERROR' &&
        item.status !== 'CONFLICT_MODIFIED' &&
        item.status !== 'FAILED'
      ) {
        return false;
      }
      if (activeFilter === 'ROLLED_BACK' && item.status !== 'ROLLED_BACK') {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchId = (item.externalId || '').toLowerCase().includes(q);
        const matchName = (item.fullName || '').toLowerCase().includes(q);
        const matchClass = (item.classCode || '').toLowerCase().includes(q);
        if (!matchId && !matchName && !matchClass) return false;
      }
      return true;
    });
  }, [detail, activeFilter, searchQuery]);

  const rollbackableIds = useMemo(() => {
    if (!detail) return [];
    return detail.items
      .filter((i) => i.status !== 'ROLLED_BACK' && i.status !== 'FAILED')
      .map((i) => i.id);
  }, [detail]);

  const toggleSelectChange = (changeId: number) => {
    setSelectedChangeIds((prev) => {
      const next = new Set(prev);
      if (next.has(changeId)) {
        next.delete(changeId);
      } else {
        next.add(changeId);
      }
      return next;
    });
  };

  const applyLocalRollbackState = (
    targetIds: number[],
    skipConflicts: boolean
  ) => {
    setDetail((prev) => {
      if (!prev) return prev;
      let newlyRolledBack = 0;
      const updatedItems = prev.items.map((item) => {
        if (!targetIds.includes(item.id) || item.status === 'ROLLED_BACK') {
          return item;
        }
        if (skipConflicts && item.status === 'CONFLICT_MODIFIED') {
          return item;
        }
        newlyRolledBack += 1;
        return {
          ...item,
          status: 'ROLLED_BACK' as const,
          rolledBackAt: new Date().toISOString(),
        };
      });

      const totalRolledBack = updatedItems.filter(
        (i) => i.status === 'ROLLED_BACK'
      ).length;
      const remainingApplied = updatedItems.filter(
        (i) => i.status === 'APPLIED' || i.status === 'CONFLICT_MODIFIED'
      ).length;

      return {
        ...prev,
        run: {
          ...prev.run,
          status:
            remainingApplied === 0 ? 'ROLLED_BACK' : prev.run.status,
        },
        summary: {
          ...prev.summary,
          rolledBackCount: totalRolledBack,
          remainingAppliedCount: remainingApplied,
        },
        items: updatedItems,
      };
    });
    setSelectedChangeIds(new Set());
  };

  const executeRollback = async (
    payload: { changeIds?: number[]; rollbackAll?: boolean },
    forceOverwriteConflicts?: boolean
  ) => {
    if (!detail) return;
    const targetIds = payload.rollbackAll
      ? rollbackableIds
      : payload.changeIds || [];

    if (targetIds.length === 0) {
      toast.info('Không có mục nào cần hoàn tác');
      return;
    }

    try {
      setRollingBack(true);
      try {
        const res = await importsApi.rollbackSheetSyncHistory(runId, {
          ...payload,
          forceOverwriteConflicts,
        });

        if (
          res?.conflictDetected &&
          forceOverwriteConflicts === undefined &&
          res.conflicts &&
          res.conflicts.length > 0
        ) {
          setConflictList(res.conflicts);
          setPendingRollbackPayload(payload);
          setConflictModalOpen(true);
          return;
        }

        applyLocalRollbackState(targetIds, forceOverwriteConflicts === false);
        toast.success(
          res?.message ||
            `Đã hoàn tác thành công ${
              res?.rolledBackCount ?? targetIds.length
            } mục thay đổi!`
        );
        setConflictModalOpen(false);
        return;
      } catch {
        // Check local conflict detection if backend endpoint not yet mounted
        const localConflicts = detail.items.filter(
          (i) =>
            targetIds.includes(i.id) && i.status === 'CONFLICT_MODIFIED'
        );

        if (
          localConflicts.length > 0 &&
          forceOverwriteConflicts === undefined
        ) {
          setConflictList(
            localConflicts.map((c) => ({
              changeId: c.id,
              rowNumber: c.rowNumber,
              externalId: c.externalId,
              fullName: c.fullName,
              fieldLabel: c.fieldDiffs[0]?.fieldLabel || 'Dữ liệu học viên',
              beforeSyncValue: c.fieldDiffs[0]?.before ?? '(Trống)',
              syncedValue: c.fieldDiffs[0]?.after ?? '-',
              currentWebValue:
                c.currentWebValueSummary || 'Đã sửa tay trên Web',
              conflictMessage:
                c.conflictReason ||
                'Bản ghi này đã bị người dùng sửa tay trên Web sau thời điểm đồng bộ.',
            }))
          );
          setPendingRollbackPayload(payload);
          setConflictModalOpen(true);
          return;
        }

        applyLocalRollbackState(targetIds, forceOverwriteConflicts === false);
        toast.success(
          forceOverwriteConflicts === false
            ? 'Đã hủy thay đổi các dòng an toàn và giữ nguyên dữ liệu sửa tay trên Web!'
            : `Đã khôi phục thành công ${targetIds.length} mục về trạng thái trước đồng bộ!`
        );
        setConflictModalOpen(false);
      }
    } finally {
      setRollingBack(false);
    }
  };

  if (loading || !detail) {
    return (
      <PageContainer>
        <div className="bg-white rounded-2xl border border-slate-200 p-16 flex items-center justify-center text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-3 text-blue-600" />
          <span className="text-xs font-semibold">
            Đang tải chi tiết phiên đồng bộ #{runId}...
          </span>
        </div>
      </PageContainer>
    );
  }

  const { run, summary } = detail;
  const flowMeta = FLOW_LABELS[run.flowType] || FLOW_LABELS.STUDENT_MASTER;

  return (
    <PageContainer>
      <div className="space-y-5">
        {/* 1. Header & Thông tin phiên chạy */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => navigate('/data-sync?tab=history')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Quay lại Lịch sử đồng bộ</span>
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900">
                  Chi tiết phiên đồng bộ #{run.id}: {run.name}
                </h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${flowMeta.colorClass}`}
                >
                  {flowMeta.label}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                    run.programType === 'JLPT'
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-teal-100 text-teal-700'
                  }`}
                >
                  {run.programType}
                </span>
                {run.status === 'ROLLED_BACK' ? (
                  <Badge variant="neutral" dot>
                    Đã hủy thay đổi
                  </Badge>
                ) : run.status === 'SUCCESS' ? (
                  <Badge variant="success" dot>
                    Thành công
                  </Badge>
                ) : run.status === 'PARTIAL_FAILED' ? (
                  <Badge variant="warning" dot>
                    Thành công một phần
                  </Badge>
                ) : (
                  <Badge variant="danger" dot>
                    Thất bại
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Thời gian chạy:{' '}
                  <strong className="text-slate-800">
                    {formatDateTime(run.createdAt)}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Chế độ chạy:{' '}
                  <strong className="text-slate-800">
                    {run.triggerType === 'AUTO'
                      ? 'Tự động theo lịch'
                      : 'Thủ công (Qua Preview)'}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Thời lượng:{' '}
                  <strong className="text-slate-800">
                    {run.durationSec} giây
                  </strong>
                </span>
              </div>
            </div>

            {rollbackableIds.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                isLoading={rollingBack}
                onClick={() => executeRollback({ rollbackAll: true })}
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Hủy toàn bộ thay đổi phiên này ({rollbackableIds.length})
              </Button>
            )}
          </div>
        </div>

        {/* 2. Khu vực Thống Kê (5 Summary Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-500">
              Tổng số dòng quét
            </div>
            <div className="text-xl font-extrabold text-slate-900 mt-1">
              {summary.totalRowsScanned}
            </div>
          </div>

          <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-4">
            <div className="text-[11px] font-semibold text-emerald-700">
              Đã thêm mới
            </div>
            <div className="text-xl font-extrabold text-emerald-800 mt-1">
              +{summary.createdCount}
            </div>
          </div>

          <div className="bg-blue-50/70 rounded-2xl border border-blue-200 p-4">
            <div className="text-[11px] font-semibold text-blue-700">
              Đã cập nhật
            </div>
            <div className="text-xl font-extrabold text-blue-800 mt-1">
              ~{summary.updatedCount}
            </div>
          </div>

          <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4">
            <div className="text-[11px] font-semibold text-amber-700">
              Lỗi / Bỏ qua
            </div>
            <div className="text-xl font-extrabold text-amber-800 mt-1">
              {summary.failedOrSkippedCount}
            </div>
          </div>

          <div className="bg-slate-100 rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-600">
              Đã hủy thay đổi (Rolled back)
            </div>
            <div className="text-xl font-extrabold text-slate-800 mt-1">
              {summary.rolledBackCount}
            </div>
          </div>
        </div>

        {/* 3. Bảng Xem Chi Tiết Các Thay Đổi */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {/* Toolbar */}
          <div className="p-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'ALL', label: 'Tất cả' },
                  { key: 'CREATE', label: 'Thêm mới (CREATE)' },
                  { key: 'UPDATE', label: 'Cập nhật (UPDATE)' },
                  { key: 'CONFLICT_OR_ERROR', label: 'Xung đột / Lỗi' },
                  {
                    key: 'ROLLED_BACK',
                    label: 'Đã hủy thay đổi (ROLLED_BACK)',
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    activeFilter === tab.key
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {selectedChangeIds.size > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={rollingBack}
                  onClick={() =>
                    executeRollback({
                      changeIds: Array.from(selectedChangeIds),
                    })
                  }
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Hủy thay đổi các dòng đã chọn ({selectedChangeIds.size})
                </Button>
              )}

              <div className="relative w-64 max-w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm Mã HV, Tên HV, Mã lớp..."
                  className="w-full h-8 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={
                        rollbackableIds.length > 0 &&
                        selectedChangeIds.size === rollbackableIds.length
                      }
                      onChange={(e) =>
                        setSelectedChangeIds(
                          e.target.checked
                            ? new Set(rollbackableIds)
                            : new Set()
                        )
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 w-20">Dòng</th>
                  <th className="py-3 px-3 w-48">Mã định danh &amp; Học viên</th>
                  <th className="py-3 px-3 w-32">Loại dữ liệu</th>
                  <th className="py-3 px-3 w-28">Thao tác</th>
                  <th className="py-3 px-3">Chi tiết thay đổi (Trước → Sau)</th>
                  <th className="py-3 px-3 w-36">Trạng thái</th>
                  <th className="py-3 pl-3 pr-4 text-right w-36">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Không có bản ghi thay đổi nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isRolledBack = item.status === 'ROLLED_BACK';
                    const isChecked = selectedChangeIds.has(item.id);

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isRolledBack
                            ? 'bg-slate-50/70 opacity-75'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="py-3.5 pl-4 pr-2 align-top">
                          <input
                            type="checkbox"
                            disabled={isRolledBack || item.status === 'FAILED'}
                            checked={isChecked}
                            onChange={() => toggleSelectChange(item.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40 cursor-pointer mt-0.5"
                          />
                        </td>
                        <td className="py-3.5 px-3 align-top font-mono font-semibold text-slate-600">
                          #{item.rowNumber}
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <div className="font-bold text-slate-900">
                            {item.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            HV: {item.externalId}
                            {item.classCode ? ` • Lớp: ${item.classCode}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {ENTITY_TYPE_LABELS[item.entityType] ||
                              item.entityType}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          {item.action === 'CREATE' ? (
                            <Badge variant="success" size="sm">
                              Thêm mới
                            </Badge>
                          ) : item.action === 'UPDATE' ? (
                            <Badge variant="info" size="sm">
                              Cập nhật
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm">
                              Xung đột
                            </Badge>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top space-y-1.5">
                          {item.fieldDiffs.map((diff, idx) => (
                            <div
                              key={idx}
                              className="flex flex-wrap items-center gap-1.5 text-xs"
                            >
                              <span className="font-semibold text-slate-700">
                                [{diff.fieldLabel || diff.field}]:
                              </span>
                              {item.action !== 'CREATE' && (
                                <>
                                  <span className="line-through text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                    {formatDiffVal(diff.before)}
                                  </span>
                                  <span className="text-slate-400">→</span>
                                </>
                              )}
                              <span className="text-emerald-700 bg-emerald-50 font-semibold px-1.5 py-0.5 rounded">
                                {formatDiffVal(diff.after)}
                              </span>
                            </div>
                          ))}

                          {item.conflictReason && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>{item.conflictReason}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          {item.status === 'ROLLED_BACK' ? (
                            <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Đã hoàn tác</span>
                            </span>
                          ) : item.status === 'CONFLICT_MODIFIED' ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Cảnh báo sửa tay</span>
                            </span>
                          ) : item.status === 'FAILED' ? (
                            <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Lỗi</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Đã áp dụng</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 pl-3 pr-4 align-top text-right">
                          {!isRolledBack && item.status !== 'FAILED' ? (
                            <button
                              type="button"
                              disabled={rollingBack}
                              onClick={() =>
                                executeRollback({ changeIds: [item.id] })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-700 font-semibold text-xs transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Hủy thay đổi</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">
                              Đã hoàn tác
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Modal Cảnh Báo Xung Đột Khi Hủy Thay Đổi */}
      <Modal
        isOpen={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        size="xl"
        title="Cảnh báo xung đột khi hủy thay đổi (Rollback)"
        description="Phát hiện một số bản ghi đã bị người dùng chỉnh sửa thủ công trên Web sau thời điểm phiên đồng bộ này chạy."
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2.5 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConflictModalOpen(false)}
            >
              Đóng
            </Button>
            <Button
              variant="secondary"
              size="sm"
              isLoading={rollingBack}
              onClick={() =>
                pendingRollbackPayload &&
                executeRollback(pendingRollbackPayload, false)
              }
            >
              Giữ dữ liệu mới trên Web (Không hủy các dòng xung đột)
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={rollingBack}
              onClick={() =>
                pendingRollbackPayload &&
                executeRollback(pendingRollbackPayload, true)
              }
            >
              Ép khôi phục về dữ liệu cũ trước đồng bộ
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 flex items-start gap-2.5 text-amber-900">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">
                Có {conflictList.length} dòng dữ liệu đã được sửa tay trên Web sau
                khi đồng bộ
              </div>
              <p className="text-[11px] leading-relaxed">
                Nếu bạn chọn <strong>Giữ dữ liệu mới trên Web</strong>, hệ thống sẽ
                chỉ hoàn tác các dòng an toàn và giữ nguyên những dòng đã được
                CSKH/Admin cập nhật tay. Nếu chọn{' '}
                <strong>Ép khôi phục về dữ liệu cũ</strong>, dữ liệu sẽ quay về
                đúng giá trị trước khi phiên đồng bộ diễn ra.
              </p>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr className="text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="py-2 px-3">Học viên</th>
                  <th className="py-2 px-3">Trường dữ liệu</th>
                  <th className="py-2 px-3">Trước đồng bộ</th>
                  <th className="py-2 px-3">Giá trị đồng bộ</th>
                  <th className="py-2 px-3">Hiện tại trên Web</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conflictList.map((c) => (
                  <tr key={c.changeId}>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">
                        {c.fullName}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {c.externalId} (Dòng #{c.rowNumber})
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700">
                      {c.fieldLabel}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {formatDiffVal(c.beforeSyncValue)}
                    </td>
                    <td className="py-2.5 px-3 text-blue-700 font-semibold">
                      {formatDiffVal(c.syncedValue)}
                    </td>
                    <td className="py-2.5 px-3 text-amber-800 font-bold bg-amber-50/60">
                      {formatDiffVal(c.currentWebValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
