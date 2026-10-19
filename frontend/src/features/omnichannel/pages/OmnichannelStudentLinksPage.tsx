import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../api/client';
import { automationApi } from '../../automation/api/automation.api';
import { lineApi } from '../../line/api/line.api';
import {
  omnichannelApi,
  type CareGroupSyncReport,
  type LinkedStudentCareGroupItem,
  type UnlinkedStudentCareGroupItem,
} from '../api/omnichannel.api';
import { CareGroupSyncReportCard } from '../components/CareGroupSyncReportCard';
import { StudentZaloLinkPage } from '../../zalo/pages/StudentZaloLinkPage';
import { StudentLineLinkPage } from '../../line/pages/StudentLineLinkPage';
import { useSocket } from '../../../hooks/useSocket';
import { useToast } from '../../../components/ui/Toast';
import {
  Link2,
  Sparkles,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Smartphone,
  Bot,
  Copy,
  Check,
  Info,
  UserCheck,
} from 'lucide-react';

type LinksWorkspaceTab = 'MATRIX' | 'ZALO' | 'LINE';

interface StudentCoverageRow {
  id: number;
  external_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  cs_name: string | null;
  cs_code: string | null;
  cs_display: string;
  suggested_group_name: string | null;
  zalo_uid: string | null;
  line_uid: string | null;
  zaloLinked: boolean;
  zaloGroupName: string | null;
  lineLinked: boolean;
  lineGroupName: string | null;
  newlyLinked: boolean;
}

function extractCsNumberFromCode(csCode?: string | null): string | null {
  if (!csCode) return null;
  const match = csCode.toUpperCase().match(/CVHT[-_\s]*(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (Number.isFinite(num) && num > 0) {
      return String(num).padStart(2, '0');
    }
  }
  const digits = csCode.match(/(\d+)/);
  if (digits) {
    const num = parseInt(digits[1], 10);
    if (Number.isFinite(num) && num > 0) {
      return String(num).padStart(2, '0');
    }
  }
  return null;
}

function buildSuggestedGroupName(
  csCode?: string | null,
  externalId?: string | null,
  fullName?: string | null,
): string | null {
  const ext = (externalId || '').trim();
  if (!ext) return null;
  const csNum = extractCsNumberFromCode(csCode) || '01';
  const name = (fullName || '').trim();
  return name ? `${csNum} - ${ext} ${name}` : `${csNum} - ${ext}`;
}

export const OmnichannelStudentLinksPage: React.FC<{ initialTab?: LinksWorkspaceTab }> = ({
  initialTab,
}) => {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { on, off } = useSocket();

  const resolvedInitial = useMemo<LinksWorkspaceTab>(() => {
    if (initialTab) return initialTab;
    const ch = (searchParams.get('channel') || '').toUpperCase();
    if (ch === 'ZALO') return 'ZALO';
    if (ch === 'LINE') return 'LINE';
    return 'MATRIX';
  }, [initialTab, searchParams]);

  const [tab, setTab] = useState<LinksWorkspaceTab>(resolvedInitial);
  const [students, setStudents] = useState<StudentCoverageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [careReport, setCareReport] = useState<CareGroupSyncReport | null>(null);
  const [syncingCareGroups, setSyncingCareGroups] = useState(false);
  const [liveSyncStage, setLiveSyncStage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deepLinkModal, setDeepLinkModal] = useState<{
    studentName: string;
    linkCode: string;
    deepLinkUrl: string;
  } | null>(null);

  const loadCoverageMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const [studentsRes, zaloUnlinkedRes, lineUnlinkedRes, reportRes] = await Promise.all([
        apiClient.get('/students').catch(() => ({ data: { data: [] } })),
        automationApi.getUnlinkedStudents({ limit: 200 }).catch(() => ({ items: [] })),
        lineApi.listUnlinkedStudents({ limit: 200 }).catch(() => ({ items: [] })),
        omnichannelApi.getCareGroupReport().catch(() => null),
      ]);

      if (reportRes) {
        setCareReport(reportRes);
      }

      const linkedMap = new Map<number, LinkedStudentCareGroupItem>();
      const unlinkedMap = new Map<number, UnlinkedStudentCareGroupItem>();
      if (reportRes) {
        for (const item of reportRes.linkedItems ?? []) {
          linkedMap.set(Number(item.studentId), item);
        }
        for (const item of reportRes.unlinkedItems ?? []) {
          unlinkedMap.set(Number(item.studentId), item);
        }
      }

      const rawStudents: any[] =
        studentsRes.data?.data ?? studentsRes.data?.students ?? studentsRes.data ?? [];
      const zaloUnlinkedIds = new Set(
        (zaloUnlinkedRes.items ?? []).map((s: any) => Number(s.id)),
      );
      const lineUnlinkedIds = new Set(
        (lineUnlinkedRes.items ?? []).map((s: any) => Number(s.id)),
      );

      const rows: StudentCoverageRow[] = (Array.isArray(rawStudents) ? rawStudents : []).map(
        (s: any) => {
          const studentId = Number(s.id);
          const linkedReportItem = linkedMap.get(studentId);
          const unlinkedReportItem = unlinkedMap.get(studentId);

          const firstEnr = Array.isArray(s.enrollments) ? s.enrollments[0] : null;
          const csObj = firstEnr?.cs;
          const csName =
            linkedReportItem?.csName ??
            unlinkedReportItem?.csName ??
            csObj?.name ??
            firstEnr?.sale_name ??
            null;
          const csCode =
            linkedReportItem?.csCode ??
            unlinkedReportItem?.csCode ??
            csObj?.code ??
            null;

          let csDisplay = 'Chưa phân công';
          if (csName && csCode) {
            csDisplay = csName.toUpperCase().includes(csCode.toUpperCase())
              ? csName
              : `${csName} - ${csCode}`;
          } else if (csName || csCode || csObj?.email) {
            csDisplay = csName || csCode || csObj?.email;
          }

          const externalId =
            s.external_id ||
            linkedReportItem?.studentExternalId ||
            unlinkedReportItem?.studentExternalId ||
            firstEnr?.external_id ||
            null;

          const suggestedGroupName =
            unlinkedReportItem?.suggestedGroupName ||
            linkedReportItem?.zaloGroupName ||
            linkedReportItem?.lineGroupName ||
            buildSuggestedGroupName(csCode, externalId, s.full_name);

          const zaloGroupName = linkedReportItem?.zaloGroupName || null;
          const lineGroupName = linkedReportItem?.lineGroupName || null;

          const zaloLinked =
            Boolean(linkedReportItem?.zaloLinked) ||
            Boolean(zaloGroupName) ||
            Boolean(s.zalo_uid) ||
            !zaloUnlinkedIds.has(studentId);

          const lineLinked =
            Boolean(linkedReportItem?.lineLinked) ||
            Boolean(lineGroupName) ||
            Boolean(s.line_uid) ||
            !lineUnlinkedIds.has(studentId);

          return {
            id: studentId,
            external_id: externalId,
            full_name: s.full_name,
            phone: s.phone || null,
            email: s.email || null,
            cs_name: csName,
            cs_code: csCode,
            cs_display: csDisplay,
            suggested_group_name: suggestedGroupName,
            zalo_uid: s.zalo_uid || null,
            line_uid: s.line_uid || null,
            zaloLinked,
            zaloGroupName,
            lineLinked,
            lineGroupName,
            newlyLinked: Boolean(linkedReportItem?.newlyLinked),
          };
        },
      );

      setStudents(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'MATRIX') {
      loadCoverageMatrix();
    }
  }, [tab, loadCoverageMatrix]);

  const handleSyncAndMatchCareGroups = useCallback(async () => {
    setSyncingCareGroups(true);
    setLiveSyncStage(
      'Đang đồng bộ danh sách Nhóm & Danh bạ mới nhất từ Zalo/LINE SDK...',
    );
    try {
      const report = await omnichannelApi.syncAndMatchCareGroups({
        refreshLiveGroups: true,
      });
      setCareReport(report);
      toast.success(
        `Đã đồng bộ & đối sánh Nhóm Chăm sóc: Khớp thành công ${report.linkedStudentsCount}/${report.totalEligibleStudents} học viên (+${report.newlyLinkedZaloCount} Zalo, +${report.newlyLinkedLineCount} LINE)!`,
      );
      await loadCoverageMatrix();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          'Không thể đồng bộ Nhóm Chăm sóc Zalo/LINE',
      );
    } finally {
      setSyncingCareGroups(false);
      setLiveSyncStage(null);
    }
  }, [loadCoverageMatrix, toast]);

  // Listen to Socket.IO live sync events
  useEffect(() => {
    const onSyncProgress = (payload: any) => {
      setSyncingCareGroups(true);
      if (payload?.message || payload?.stage) {
        setLiveSyncStage(String(payload.message || payload.stage));
      }
    };

    const onSyncComplete = (payload: any) => {
      setSyncingCareGroups(false);
      setLiveSyncStage(null);
      const reportPayload = payload?.report ?? payload;
      if (reportPayload && typeof reportPayload.totalEligibleStudents === 'number') {
        setCareReport(reportPayload as CareGroupSyncReport);
      }
      loadCoverageMatrix();
    };

    on('omnichannel:sync-progress', onSyncProgress);
    on('omnichannel:sync-complete', onSyncComplete);
    on('import:sync-progress', onSyncProgress);

    return () => {
      off('omnichannel:sync-progress', onSyncProgress);
      off('omnichannel:sync-complete', onSyncComplete);
      off('import:sync-progress', onSyncProgress);
    };
  }, [on, off, loadCoverageMatrix]);

  const handleOmnichannelAutoSuggest = async () => {
    setSuggesting(true);
    try {
      const [zaloSug, lineSug] = await Promise.all([
        automationApi.autoSuggestLinks({}).catch(() => ({ items: [] })),
        lineApi.autoSuggestLinks({}).catch(() => ({ items: [], total: 0 })),
      ]);
      const zCount = zaloSug?.items?.length ?? 0;
      const lCount = lineSug?.items?.length ?? 0;
      toast.success(
        `Đã đối chiếu SĐT toàn hệ thống: Tìm thấy ${zCount} gợi ý Zalo và ${lCount} gợi ý LINE!`,
      );
      await handleSyncAndMatchCareGroups();
    } finally {
      setSuggesting(false);
    }
  };

  const handleGenerateLineQr = async (student: StudentCoverageRow) => {
    try {
      const lineAccs = await lineApi.listAccounts();
      const targetAcc = lineAccs.find((a) => a.account_type === 'OA') || lineAccs[0];
      if (!targetAcc) {
        toast.error('Vui lòng thêm ít nhất 1 tài khoản LINE trước khi tạo mã QR');
        return;
      }
      const res = await lineApi.generateDeepLink({
        student_id: student.id,
        line_account_id: targetAcc.id,
      });
      setDeepLinkModal({
        studentName: student.full_name,
        linkCode: res.linkCode,
        deepLinkUrl: res.deepLinkUrl,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Không thể tạo mã QR LINE');
    }
  };

  const handleCopySuggestedName = (studentId: number, groupName: string) => {
    navigator.clipboard.writeText(groupName);
    setCopiedId(studentId);
    toast.success(`Đã sao chép tên Group chuẩn: "${groupName}"`);
    setTimeout(() => {
      setCopiedId((prev) => (prev === studentId ? null : prev));
    }, 2000);
  };

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.external_id && s.external_id.toLowerCase().includes(q)) ||
        (s.cs_display && s.cs_display.toLowerCase().includes(q)) ||
        (s.suggested_group_name && s.suggested_group_name.toLowerCase().includes(q)) ||
        (s.zaloGroupName && s.zaloGroupName.toLowerCase().includes(q)) ||
        (s.lineGroupName && s.lineGroupName.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q)) ||
        (s.zalo_uid && s.zalo_uid.toLowerCase().includes(q)) ||
        (s.line_uid && s.line_uid.toLowerCase().includes(q)),
    );
  }, [students, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Top Omnichannel Header & Mode Switcher */}
      <div className="mx-4 mt-4 p-3.5 rounded-2xl bg-surface border border-border shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 text-white flex items-center justify-center">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary">
              Liên kết Học viên Đa kênh 360° (Student ↔ Zalo & LINE Care Groups)
            </h1>
            <p className="text-xs text-text-muted">
              Tự động nhận diện và đồng bộ Nhóm Chăm sóc Học viên trên Zalo và LINE theo quy tắc Mã CVHT & Mã Học viên
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-surface-muted p-1 rounded-xl border border-border">
          <button
            onClick={() => setTab('MATRIX')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === 'MATRIX'
                ? 'bg-surface text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ma trận 360° (Zalo + LINE)
          </button>
          <button
            onClick={() => setTab('ZALO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === 'ZALO'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Liên kết HV ↔ Zalo
          </button>
          <button
            onClick={() => setTab('LINE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === 'LINE'
                ? 'bg-[#06C755] text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Liên kết HV ↔ LINE (QR 2-Chạm)
          </button>
        </div>
      </div>

      {/* Quy tắc đặt tên Group tự động Banner */}
      <div className="mx-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-emerald-50/80 p-3.5 flex items-start gap-3 shadow-2xs">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-800 leading-relaxed">
          Quy tắc tự động nhận diện Nhóm Chăm sóc Học viên trên Zalo &amp; LINE:{' '}
          <strong className="font-mono bg-white border border-blue-200 text-blue-900 px-2 py-0.5 rounded-md">
            [Số thứ tự CVHT] - [Mã Học viên external_id] Tên Học viên
          </strong>{' '}
          (Ví dụ:{' '}
          <strong className="font-mono bg-emerald-100/80 border border-emerald-300 text-emerald-900 px-2 py-0.5 rounded-md">
            01 - 427901798 Nguyễn Văn An
          </strong>{' '}
          — trong đó <code className="font-mono font-bold text-blue-700">01</code> là mã của{' '}
          <code className="font-mono font-bold text-blue-700">CVHT01</code>,{' '}
          <code className="font-mono font-bold text-emerald-700">427901798</code> là Mã HV).
        </div>
      </div>

      {tab === 'ZALO' ? (
        <StudentZaloLinkPage />
      ) : tab === 'LINE' ? (
        <StudentLineLinkPage />
      ) : (
        <div className="px-4 pb-6 space-y-4">
          {/* Care Group Sync Report Card */}
          <CareGroupSyncReportCard
            report={careReport}
            isSyncing={syncingCareGroups}
            syncStageMessage={liveSyncStage}
            onResync={handleSyncAndMatchCareGroups}
          />

          {/* Search & Action Bar */}
          <div className="p-4 rounded-2xl bg-surface border border-border flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-64 max-w-md">
              <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm Mã HV (external_id), tên học viên, CSKH, tên Group, SĐT..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-border bg-surface-muted/60 focus:bg-surface focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSyncAndMatchCareGroups}
                disabled={syncingCareGroups}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingCareGroups ? 'animate-spin' : ''}`} />
                {syncingCareGroups
                  ? 'Đang đồng bộ Nhóm Zalo + LINE...'
                  : 'Đồng bộ Nhóm Chăm sóc (Mã CS - Mã HV)'}
              </button>
              <button
                onClick={handleOmnichannelAutoSuggest}
                disabled={suggesting || syncingCareGroups}
                className="px-3.5 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {suggesting ? 'Đang quét SĐT...' : 'Gợi ý Khớp SĐT Đa kênh'}
              </button>
              <button
                onClick={loadCoverageMatrix}
                className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium flex items-center gap-1.5 hover:bg-surface-muted"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Làm mới
              </button>
            </div>
          </div>

          {/* Coverage Table */}
          <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-muted/70 border-b border-border text-[11px] font-bold text-text-muted uppercase">
                    <th className="py-3 px-4">Mã Học viên</th>
                    <th className="py-3 px-4">Học viên</th>
                    <th className="py-3 px-4">CS phụ trách</th>
                    <th className="py-3 px-4">Tên Group Chuẩn</th>
                    <th className="py-3 px-4">Nhóm Chăm sóc Zalo</th>
                    <th className="py-3 px-4">Nhóm Chăm sóc LINE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-text-muted">
                        Đang tải ma trận liên kết học viên...
                      </td>
                    </tr>
                  ) : filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-text-muted">
                        Không tìm thấy học viên nào.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((st) => (
                      <tr key={st.id} className="hover:bg-surface-muted/40 transition-colors">
                        {/* Mã Học viên (external_id) */}
                        <td className="py-3 px-4 font-mono font-bold text-primary whitespace-nowrap">
                          {st.external_id ? (
                            <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                              {st.external_id}
                            </span>
                          ) : (
                            <span className="text-text-muted font-normal italic">#{st.id}</span>
                          )}
                        </td>

                        {/* Học viên (full_name + phone) */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-text-primary">{st.full_name}</div>
                          <div className="text-[11px] text-text-muted">
                            {st.phone || <span className="italic">Chưa có SĐT</span>}
                          </div>
                        </td>

                        {/* CS phụ trách (Họ tên - CVHTxx) */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 text-text-secondary font-medium">
                            <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{st.cs_display}</span>
                          </div>
                        </td>

                        {/* Tên Group Chuẩn (01 - 427901798 ... + nút Copy) */}
                        <td className="py-3 px-4">
                          {st.suggested_group_name ? (
                            <div className="inline-flex items-center gap-1.5 bg-surface-muted border border-border rounded-lg px-2.5 py-1">
                              <code className="font-mono font-semibold text-text-primary text-[11px]">
                                {st.suggested_group_name}
                              </code>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopySuggestedName(st.id, st.suggested_group_name!)
                                }
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-border hover:bg-primary/10 text-text-secondary hover:text-primary font-semibold text-[10px] transition-colors"
                                title="Sao chép tên Group chuẩn"
                              >
                                {copiedId === st.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    Đã chép
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    Copy
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-text-muted italic text-[11px]">
                              Thiếu Mã HV để tạo tên chuẩn
                            </span>
                          )}
                        </td>

                        {/* Nhóm Chăm sóc Zalo */}
                        <td className="py-3 px-4">
                          {st.zaloGroupName ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 font-semibold text-[11px] w-fit">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                {st.zaloGroupName}
                              </span>
                              {st.newlyLinked && (
                                <span className="text-[10px] text-emerald-600 font-bold pl-1">
                                  ★ Mới gắn tự động
                                </span>
                              )}
                            </div>
                          ) : st.zaloLinked ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              Đã liên kết Zalo {st.zalo_uid ? `(${st.zalo_uid})` : ''}
                            </span>
                          ) : (
                            <button
                              onClick={() => setTab('ZALO')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 font-medium text-[11px]"
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              Chưa gắn Zalo · Gắn
                            </button>
                          )}
                        </td>

                        {/* Nhóm Chăm sóc LINE */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {st.lineGroupName ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 font-semibold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                {st.lineGroupName}
                              </span>
                            ) : st.lineLinked ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 font-semibold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                Đã liên kết LINE {st.line_uid ? `(${st.line_uid.slice(0, 10)}...)` : ''}
                              </span>
                            ) : (
                              <button
                                onClick={() => setTab('LINE')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-muted text-text-secondary hover:bg-emerald-500/10 hover:text-emerald-700 font-medium text-[11px]"
                              >
                                <AlertCircle className="w-3.5 h-3.5" />
                                Gắn LINE
                              </button>
                            )}
                            <button
                              onClick={() => handleGenerateLineQr(st)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#06C755]/10 text-[#06C755] hover:bg-[#06C755] hover:text-white font-semibold text-[11px] transition-colors"
                              title="Tạo mã QR LINE 2-Chạm"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              QR
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2-Tap LINE OA QR Modal */}
      {deepLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-border shadow-xl max-w-md w-full p-5 space-y-4 text-center">
            <h3 className="text-sm font-bold text-text-primary">
              Mã QR Liên kết LINE 2-Chạm cho {deepLinkModal.studentName}
            </h3>
            <p className="text-xs text-text-muted">
              Phụ huynh / Học viên quét mã QR dưới đây và bấm Gửi tin nhắn có sẵn mã{' '}
              <strong className="text-primary">{deepLinkModal.linkCode}</strong> để tự động liên kết
              tức thì (0 Quota)!
            </p>
            <div className="flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  deepLinkModal.deepLinkUrl,
                )}`}
                alt="LINE Deep Link QR"
                className="w-48 h-48 rounded-xl border border-border p-2 bg-white"
              />
            </div>
            <div className="p-2.5 rounded-xl bg-surface-muted text-[11px] font-mono break-all flex items-center justify-between gap-2">
              <span className="truncate">{deepLinkModal.deepLinkUrl}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(deepLinkModal.deepLinkUrl);
                  toast.success('Đã sao chép đường dẫn liên kết LINE!');
                }}
                className="p-1.5 rounded-lg bg-surface border border-border hover:bg-primary-soft shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setDeepLinkModal(null)}
              className="w-full py-2 rounded-xl bg-primary text-white text-xs font-semibold"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
