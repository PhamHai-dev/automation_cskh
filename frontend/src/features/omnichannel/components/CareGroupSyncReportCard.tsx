import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  Users,
  Link2,
  Unlink2,
  Loader2,
  Search,
} from 'lucide-react';
import type { CareGroupSyncReport } from '../api/omnichannel.api';
import { useToast } from '../../../components/ui/Toast';

interface CareGroupSyncReportCardProps {
  report: CareGroupSyncReport | null;
  isSyncing?: boolean;
  syncStageMessage?: string | null;
  onResync?: () => void;
  title?: string;
}

const SYNC_STAGES = [
  'Đang tải danh sách nhóm mới nhất từ các tài khoản Zalo và LINE đang kết nối...',
  'Đang đối chiếu tên nhóm theo quy tắc: [Số thứ tự CSKH] - [Mã học viên] [Họ và tên]...',
  'Đang tự động gắn Nhóm Chăm sóc vào hồ sơ của từng học viên...',
];

function formatCsLabel(csName?: string | null, csCode?: string | null): string {
  const name = (csName || '').trim();
  const code = (csCode || '').trim();
  if (name && code) {
    if (name.toUpperCase().includes(code.toUpperCase())) return name;
    return `${name} - ${code}`;
  }
  return name || code || 'Chưa phân công CSKH';
}

export const CareGroupSyncReportCard: React.FC<CareGroupSyncReportCardProps> = ({
  report,
  isSyncing = false,
  syncStageMessage,
  onResync,
  title = 'Kết quả Tự động Gắn Nhóm Chăm sóc (Zalo & LINE)',
}) => {
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'UNLINKED' | 'LINKED'>('UNLINKED');
  const [stageIdx, setStageIdx] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isSyncing) {
      setStageIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setStageIdx((prev) => (prev + 1) % SYNC_STAGES.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [isSyncing]);

  useEffect(() => {
    if (report) {
      const validLinked = (report.linkedItems ?? []).filter(
        (item) => Boolean(item.zaloGroupName?.trim() || item.lineGroupName?.trim()),
      );
      if ((report.unlinkedItems?.length ?? 0) === 0 && validLinked.length > 0) {
        setActiveSubTab('LINKED');
      }
    }
  }, [report]);

  const handleCopyGroupName = (groupName: string, key: string) => {
    if (!groupName) return;
    navigator.clipboard.writeText(groupName);
    setCopiedKey(key);
    toast.success(`Đã sao chép tên nhóm chuẩn: "${groupName}"`);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  // Only treat an item as linked to a care group if zaloGroupName or lineGroupName is non-empty
  const authoritativeLinkedItems = (report?.linkedItems ?? []).filter((item) =>
    Boolean(item.zaloGroupName?.trim() || item.lineGroupName?.trim()),
  );
  const authoritativeUnlinkedItems = report?.unlinkedItems ?? [];

  const totalEligible =
    report?.totalEligibleStudents ??
    authoritativeLinkedItems.length + authoritativeUnlinkedItems.length;
  const linkedCount = authoritativeLinkedItems.length;
  const unlinkedCount = authoritativeUnlinkedItems.length;
  const linkedRatioPct =
    totalEligible > 0 ? Math.round((linkedCount / totalEligible) * 100) : 0;

  const unlinkedItems = authoritativeUnlinkedItems.filter((item) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (item.studentName && item.studentName.toLowerCase().includes(q)) ||
      (item.studentExternalId && item.studentExternalId.toLowerCase().includes(q)) ||
      (item.csName && item.csName.toLowerCase().includes(q)) ||
      (item.csCode && item.csCode.toLowerCase().includes(q)) ||
      (item.suggestedGroupName && item.suggestedGroupName.toLowerCase().includes(q))
    );
  });

  const linkedItems = authoritativeLinkedItems.filter((item) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (item.studentName && item.studentName.toLowerCase().includes(q)) ||
      (item.studentExternalId && item.studentExternalId.toLowerCase().includes(q)) ||
      (item.csName && item.csName.toLowerCase().includes(q)) ||
      (item.csCode && item.csCode.toLowerCase().includes(q)) ||
      (item.zaloGroupName && item.zaloGroupName.toLowerCase().includes(q)) ||
      (item.lineGroupName && item.lineGroupName.toLowerCase().includes(q))
    );
  });

  if (!isSyncing && !report) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-2xs overflow-hidden text-left space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">{title}</h3>
            <p className="text-[11px] text-text-muted">
              Cách đặt tên nhóm để hệ thống tự động nhận diện:{' '}
              <code className="font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                [Số thứ tự CSKH] - [Mã học viên] [Tên học viên]
              </code>{' '}
              (Ví dụ:{' '}
              <span className="font-mono font-semibold text-text-secondary">
                01 - HV_001 Nguyễn Văn An
              </span>
              )
            </p>
          </div>
        </div>

        {onResync && (
          <button
            type="button"
            onClick={onResync}
            disabled={isSyncing}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs disabled:opacity-60 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Đang đồng bộ & gắn nhóm...' : 'Đồng bộ & Tự động Gắn Nhóm'}
          </button>
        )}
      </div>

      {/* Processing Banner */}
      {isSyncing && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-emerald-50/80 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-bold text-blue-900">
                {syncStageMessage || SYNC_STAGES[stageIdx]}
              </div>
              <div className="text-[11px] text-blue-700 mt-0.5">
                Hệ thống đang làm mới danh sách nhóm Zalo/LINE và tự động đối chiếu theo mã học viên...
              </div>
            </div>
          </div>
          {/* Progress Bar & Stages */}
          <div className="w-full h-2 rounded-full bg-blue-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(100, (stageIdx + 1) * 34)}%` }}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
            {SYNC_STAGES.map((stageText, idx) => {
              const isCurrent = idx === stageIdx;
              const isDone = idx < stageIdx;
              return (
                <div
                  key={stageText}
                  className={`flex items-start gap-1.5 p-2 rounded-lg border ${
                    isCurrent
                      ? 'border-blue-300 bg-white text-blue-900 font-semibold shadow-2xs'
                      : isDone
                        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                        : 'border-transparent bg-white/50 text-slate-500'
                  }`}
                >
                  <span className="font-bold shrink-0">{idx + 1}.</span>
                  <span>{stageText}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      {report && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Tổng số học viên */}
            <div className="rounded-xl border border-border p-3.5 bg-surface-muted/30">
              <div className="flex items-center justify-between text-xs text-text-muted font-medium">
                <span>Tổng số học viên</span>
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary">{totalEligible}</span>
                <span className="text-[11px] text-text-muted">học viên</span>
              </div>
              <div className="mt-1 text-[11px] text-text-muted">
                Đã quét <b>{report.totalZaloGroupsScanned ?? 0}</b> nhóm Zalo &{' '}
                <b>{report.totalLineGroupsScanned ?? 0}</b> nhóm LINE
              </div>
            </div>

            {/* Card 2: Đã gắn nhóm chăm sóc */}
            <div className="rounded-xl border border-emerald-200/80 p-3.5 bg-emerald-50/40">
              <div className="flex items-center justify-between text-xs text-emerald-800 font-medium">
                <span>Đã gắn nhóm chăm sóc</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700">
                  {linkedRatioPct}%
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-700">{linkedCount}</span>
                <span className="text-[11px] text-emerald-700 font-medium">học viên</span>
              </div>
              <div className="mt-1 text-[11px] text-emerald-700/80 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                Đã liên kết nhóm Zalo hoặc LINE
              </div>
            </div>

            {/* Card 3: Mới gắn tự động */}
            <div className="rounded-xl border border-blue-200/80 p-3.5 bg-blue-50/40">
              <div className="flex items-center justify-between text-xs text-blue-800 font-medium">
                <span>Mới gắn trong lần đồng bộ này</span>
                <Link2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-blue-600 text-white text-xs font-bold">
                  +{report.newlyLinkedZaloCount ?? 0} Nhóm Zalo
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[#06C755] text-white text-xs font-bold">
                  +{report.newlyLinkedLineCount ?? 0} Nhóm LINE
                </span>
              </div>
              <div className="mt-1.5 text-[11px] text-blue-700/80">
                Thời gian xử lý: {report.durationMs ?? 0}ms
              </div>
            </div>

            {/* Card 4: Chưa có nhóm */}
            <div
              className={`rounded-xl border p-3.5 ${
                unlinkedCount > 0
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-border bg-surface-muted/30'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-amber-800">
                <span>Chưa liên kết (Cần gắn nhóm)</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    unlinkedCount > 0
                      ? 'bg-amber-500/20 text-amber-800'
                      : 'bg-emerald-500/15 text-emerald-700'
                  }`}
                >
                  {unlinkedCount > 0 ? 'Cần đặt tên nhóm' : 'Hoàn tất 100%'}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold ${
                    unlinkedCount > 0 ? 'text-amber-700' : 'text-text-primary'
                  }`}
                >
                  {unlinkedCount}
                </span>
                <span className="text-[11px] text-amber-800">học viên</span>
              </div>
              <div className="mt-1 text-[11px] text-amber-800/80 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Sao chép tên nhóm chuẩn bên dưới để đặt tên
              </div>
            </div>
          </div>

          {/* 2 Switchable Sub-Tabs & Search */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 bg-surface-muted p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setActiveSubTab('UNLINKED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeSubTab === 'UNLINKED'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Unlink2 className="w-3.5 h-3.5" />
                Chưa gắn nhóm ({authoritativeUnlinkedItems.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('LINKED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeSubTab === 'LINKED'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Đã gắn nhóm thành công ({authoritativeLinkedItems.length})
              </button>
            </div>

            <div className="relative min-w-56">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo mã học viên, họ tên, CSKH, tên nhóm..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-border bg-surface-muted/60 focus:bg-surface focus:outline-none"
              />
            </div>
          </div>

          {/* Sub-Tab A: Unlinked Students */}
          {activeSubTab === 'UNLINKED' && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface-muted sticky top-0 z-10 border-b border-border text-[11px] font-bold text-text-muted uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Mã học viên</th>
                      <th className="py-2.5 px-3">Họ và tên</th>
                      <th className="py-2.5 px-3">CSKH phụ trách</th>
                      <th className="py-2.5 px-3">Tên nhóm chuẩn (Bấm Sao chép để đặt tên nhóm)</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {unlinkedItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-text-muted">
                          Tuyệt vời! Tất cả học viên đủ điều kiện đều đã được gắn Nhóm Chăm sóc.
                        </td>
                      </tr>
                    ) : (
                      unlinkedItems.map((item) => {
                        const copyId = `unlinked-${item.studentId}`;
                        const isCopied = copiedKey === copyId;
                        return (
                          <tr key={item.studentId} className="hover:bg-surface-muted/40">
                            <td className="py-2.5 px-3 font-mono font-bold text-primary whitespace-nowrap">
                              {item.studentExternalId || (
                                <span className="text-danger">Chưa có mã</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-text-primary">
                              {item.studentName}
                            </td>
                            <td className="py-2.5 px-3 text-text-secondary whitespace-nowrap">
                              {formatCsLabel(item.csName, item.csCode)}
                            </td>
                            <td className="py-2.5 px-3">
                              {item.suggestedGroupName ? (
                                <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                                  <code className="font-mono font-bold text-amber-900 text-xs">
                                    {item.suggestedGroupName}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyGroupName(item.suggestedGroupName, copyId)
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-semibold text-[11px] transition-colors"
                                    title="Sao chép tên này để đặt tên nhóm trên Zalo / LINE"
                                  >
                                    {isCopied ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        Đã chép
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        Sao chép
                                      </>
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-text-muted italic">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-amber-700">{item.reason}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-Tab B: Linked Students */}
          {activeSubTab === 'LINKED' && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface-muted sticky top-0 z-10 border-b border-border text-[11px] font-bold text-text-muted uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Mã học viên</th>
                      <th className="py-2.5 px-3">Họ và tên</th>
                      <th className="py-2.5 px-3">CSKH phụ trách</th>
                      <th className="py-2.5 px-3">Tên nhóm chuẩn (Bấm Sao chép để đặt tên nhóm)</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {linkedItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-text-muted">
                          Chưa có học viên nào được gắn Nhóm Chăm sóc.
                        </td>
                      </tr>
                    ) : (
                      linkedItems.map((item) => {
                        const copyId = `linked-${item.studentId}`;
                        const isCopied = copiedKey === copyId;
                        const primaryGroupName =
                          item.zaloGroupName || item.lineGroupName || '';
                        return (
                          <tr key={item.studentId} className="hover:bg-surface-muted/40">
                            <td className="py-2.5 px-3 font-mono font-bold text-primary whitespace-nowrap">
                              {item.studentExternalId || `#${item.studentId}`}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-text-primary">
                              {item.studentName}
                            </td>
                            <td className="py-2.5 px-3 text-text-secondary whitespace-nowrap">
                              {formatCsLabel(item.csName, item.csCode)}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {item.zaloGroupName && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 font-semibold text-[11px]">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    Zalo: {item.zaloGroupName}
                                  </span>
                                )}
                                {item.lineGroupName && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 font-semibold text-[11px]">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    LINE: {item.lineGroupName}
                                  </span>
                                )}
                                {primaryGroupName && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyGroupName(primaryGroupName, copyId)
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface border border-border hover:bg-surface-muted text-text-secondary font-semibold text-[11px] transition-colors"
                                    title="Sao chép tên nhóm"
                                  >
                                    {isCopied ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        Đã chép
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        Sao chép
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {item.newlyLinked ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                                  <Sparkles className="w-3 h-3" />
                                  Mới gắn tự động
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-semibold text-[10px]">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Đã gắn nhóm
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
          )}
        </>
      )}
    </div>
  );
};
