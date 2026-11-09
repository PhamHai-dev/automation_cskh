import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { importsApi } from '../api/imports.api';
import {
  BackupHistoryBatch,
  CsSheetBackupConfigItem,
  ServiceAccountInfo,
  UpdateCsSheetBackupConfigDTO,
} from '../types/imports.types';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { SheetBackupAdminConfigCard } from '../../../pages/admin/components/SheetBackupAdminConfigCard';
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  History,
  Link2,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

type SubTabKey = 'configs' | 'history' | 'connection';
type BackupFlowGroup = 'ALL' | 'ADMIN' | 'CSKH' | 'TEACHER' | 'REPORT';

const FLOW_CARDS: Array<{
  key: BackupFlowGroup;
  title: string;
  subtitle: string;
  activeClass: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'ALL',
    title: 'Tất cả sổ',
    subtitle: 'Toàn bộ cấu hình',
    activeClass: 'border-slate-900 bg-slate-900 text-white',
    icon: <FileSpreadsheet className="w-4 h-4" />,
  },
  {
    key: 'ADMIN',
    title: '1. Admin Master',
    subtitle: 'Kaiwa · JLPT · Đối soát',
    activeClass: 'border-violet-600 bg-violet-600 text-white',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  {
    key: 'CSKH',
    title: '2. Sổ CSKH',
    subtitle: '1.Chăm sóc · Chấm buổi · Chốt',
    activeClass: 'border-blue-600 bg-blue-600 text-white',
    icon: <Users className="w-4 h-4" />,
  },
  {
    key: 'TEACHER',
    title: '3. Giáo viên',
    subtitle: '2026 スケジュール',
    activeClass: 'border-amber-600 bg-amber-600 text-white',
    icon: <CalendarCheck className="w-4 h-4" />,
  },
  {
    key: 'REPORT',
    title: '4. Báo cáo HV',
    subtitle: 'BC Kaiwa (61 cột) · Chuyên cần JLPT',
    activeClass: 'border-teal-600 bg-teal-600 text-white',
    icon: <FileText className="w-4 h-4" />,
  },
];

function classifyBackupFlow(programType?: string): Exclude<BackupFlowGroup, 'ALL'> {
  const pt = String(programType || '').toUpperCase();
  if (pt.startsWith('ADMIN_')) return 'ADMIN';
  if (pt.startsWith('REPORT_')) return 'REPORT';
  if (pt === 'TEACHER' || pt.startsWith('GV:')) return 'TEACHER';
  return 'CSKH';
}

function getSheetsBadges(cfg: CsSheetBackupConfigItem, selectedYear: number | null): string[] {
  const pt = String(cfg.program_type || '').toUpperCase();
  const y = selectedYear || cfg.backup_year || new Date().getFullYear();
  if (pt === 'ADMIN_KAIWA') {
    return ['1.Chăm sóc', 'Báo cáo học tập Kaiwa', `Điểm danh chốt ${y}`];
  }
  if (pt === 'ADMIN_JLPT') {
    return ['Data JLPT_Inhouse', 'Chuyên cần HV', `Điểm danh chốt ${y}`];
  }
  if (pt === 'ADMIN_RECONCILIATION') {
    return ['Tổng hợp Đối soát', 'Thống kê Lệch & Chờ duyệt'];
  }
  if (pt === 'REPORT_KAIWA') {
    return ['Báo cáo học tập Kaiwa (61 cột)'];
  }
  if (pt === 'REPORT_JLPT') {
    return ['Chuyên cần HV (24 cột)', 'Nhật ký nhận xét buổi học'];
  }
  if (pt === 'TEACHER' || pt.startsWith('GV:')) {
    return [cfg.sheet_name || '2026 スケジュール'];
  }
  if (pt === 'JLPT') {
    return ['Data JLPT_Inhouse', 'Chấm buổi', 'Điểm danh chốt'];
  }
  return ['1.Chăm sóc', '3.Chấm buổi', 'Điểm danh chốt'];
}

function getProgramBadge(programType?: string): { label: string; className: string } {
  const pt = String(programType || '').toUpperCase();
  if (pt === 'ADMIN_KAIWA') return { label: 'ADMIN KAIWA', className: 'bg-violet-100 text-violet-700' };
  if (pt === 'ADMIN_JLPT') return { label: 'ADMIN JLPT', className: 'bg-indigo-100 text-indigo-700' };
  if (pt === 'ADMIN_RECONCILIATION') return { label: 'ĐỐI SOÁT', className: 'bg-rose-100 text-rose-700' };
  if (pt === 'REPORT_KAIWA') return { label: 'BC KAIWA', className: 'bg-teal-100 text-teal-700' };
  if (pt === 'REPORT_JLPT') return { label: 'BC JLPT', className: 'bg-cyan-100 text-cyan-700' };
  if (pt === 'TEACHER' || pt.startsWith('GV:')) return { label: 'GIÁO VIÊN', className: 'bg-amber-100 text-amber-800' };
  if (pt === 'JLPT') return { label: 'CSKH JLPT', className: 'bg-blue-100 text-blue-700' };
  return { label: 'CSKH KAIWA', className: 'bg-emerald-100 text-emerald-700' };
}

function getDisplayTitle(cfg: CsSheetBackupConfigItem): string {
  const flow = classifyBackupFlow(cfg.program_type);
  if (flow === 'ADMIN' || flow === 'REPORT') return cfg.name;
  const code = cfg.cs_user?.staff_code || '';
  const person = cfg.cs_user?.name || '';
  if (code && person) return `${code} · ${person}`;
  return code || person || cfg.name;
}

function getDownloadFilename(cfg: CsSheetBackupConfigItem): string {
  const pt = String(cfg.program_type || '').toUpperCase();
  if (pt === 'ADMIN_KAIWA') return 'backup_admin_kaiwa.xlsx';
  if (pt === 'ADMIN_JLPT') return 'backup_admin_jlpt.xlsx';
  if (pt === 'ADMIN_RECONCILIATION') return 'backup_admin_doi_soat.xlsx';
  if (pt === 'REPORT_KAIWA') return 'backup_bao_cao_hoc_tap_kaiwa.xlsx';
  if (pt === 'REPORT_JLPT') return 'backup_bao_cao_hoc_tap_jlpt.xlsx';
  const staff = cfg.cs_user?.staff_code || `ID${cfg.id}`;
  if (pt === 'TEACHER' || pt.startsWith('GV:')) return `diem_danh_gv_${staff}.xlsx`;
  return `backup_cskh_${pt.toLowerCase()}_${staff}.xlsx`;
}

function formatShortDateTime(iso?: string | null): string {
  if (!iso) return 'Chưa chạy';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Chưa chạy';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

export const CsSheetBackupPanel: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canManage = Boolean(user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE'));
  const canViewConnection = Boolean(
    user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE' || r === 'CS')
  );

  const subTabParam = searchParams.get('sub') || searchParams.get('tab');
  const [subTab, setSubTab] = useState<SubTabKey>(() => {
    if (subTabParam === 'history' || subTabParam === 'connection') return subTabParam;
    return 'configs';
  });

  useEffect(() => {
    const raw = searchParams.get('sub') || searchParams.get('tab');
    if (raw === 'history' || raw === 'connection' || raw === 'configs') {
      setSubTab(raw);
    }
  }, [searchParams]);

  const changeSubTab = (next: SubTabKey) => {
    setSubTab(next);
    setSearchParams(
      (prev) => {
        prev.set('tab', next);
        return prev;
      },
      { replace: true }
    );
  };

  const [flowFilter, setFlowFilter] = useState<BackupFlowGroup>('ALL');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState<number | null>(new Date().getFullYear());
  const [configs, setConfigs] = useState<CsSheetBackupConfigItem[]>([]);
  const [serviceAccount, setServiceAccount] = useState<ServiceAccountInfo | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([2025, 2026]);
  const [history, setHistory] = useState<BackupHistoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [draftLinks, setDraftLinks] = useState<Record<number, string>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Bulk paste modal
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await importsApi.getSheetBackupConfigs();
      const list = res.configs || [];
      setConfigs(list);
      setServiceAccount(res.serviceAccount || null);
      if (res.availableYears && res.availableYears.length > 0) {
        setAvailableYears(res.availableYears);
      }
      setDraftLinks(
        Object.fromEntries(list.map((c) => [c.id, c.target_spreadsheet_url || '']))
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không tải được cấu hình backup');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await importsApi.getSheetBackupHistory({ limit: 30 });
      setHistory(res.batches || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không tải được lịch sử backup');
    } finally {
      setHistoryLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (subTab === 'history') void loadHistory();
  }, [subTab, loadHistory]);

  const flowCounts = useMemo(() => {
    const counts: Record<BackupFlowGroup, number> = {
      ALL: configs.length,
      ADMIN: 0,
      CSKH: 0,
      TEACHER: 0,
      REPORT: 0,
    };
    for (const c of configs) {
      counts[classifyBackupFlow(c.program_type)]++;
    }
    return counts;
  }, [configs]);

  const filteredConfigs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return configs.filter((c) => {
      const flow = classifyBackupFlow(c.program_type);
      if (flowFilter !== 'ALL' && flow !== flowFilter) return false;
      if (!q) return true;
      const haystack = `${c.name} ${c.cs_user?.staff_code || ''} ${c.cs_user?.name || ''} ${c.program_type}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [configs, flowFilter, search]);

  const handleSaveLink = async (cfg: CsSheetBackupConfigItem) => {
    try {
      setSavingId(cfg.id);
      const url = (draftLinks[cfg.id] ?? '').trim() || null;
      const payload: UpdateCsSheetBackupConfigDTO = { target_spreadsheet_url: url };
      await importsApi.updateSheetBackupConfig(cfg.id, payload);
      toast.success('Đã lưu link Sheet');
      await loadConfigs();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không lưu được link');
    } finally {
      setSavingId(null);
    }
  };

  const handleRunOne = async (cfg: CsSheetBackupConfigItem) => {
    try {
      setRunningId(String(cfg.id));
      const summary = await importsApi.runSheetBackup(cfg.id, { year });
      toast.success(
        summary.syncedToGoogleSheet
          ? 'Đã backup ra Excel & đẩy lên Google Sheet!'
          : 'Đã xuất file Excel trên server!'
      );
      await loadConfigs();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Backup thất bại');
    } finally {
      setRunningId(null);
    }
  };

  const handleRunAll = async () => {
    try {
      setRunningId('ALL');
      const programParam = flowFilter === 'ALL' ? null : flowFilter;
      await importsApi.runSheetBackupAll({ year, programType: programParam });
      toast.success('Đã chạy backup hàng loạt!');
      await loadConfigs();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Backup hàng loạt thất bại');
    } finally {
      setRunningId(null);
    }
  };

  const handleDownloadExcel = async (cfg: CsSheetBackupConfigItem) => {
    try {
      setDownloadingId(cfg.id);
      await importsApi.downloadCsSheetBackupExcel(cfg.id, getDownloadFilename(cfg));
      toast.success('Đã tải file Excel');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không tải được file Excel');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleBulkSave = async () => {
    if (!bulkText.trim()) return;
    try {
      setBulkSaving(true);
      const res = await importsApi.bulkPasteSheetBackupLinks(bulkText);
      toast.success(`Đã gắn ${res.updatedCount} link (bỏ qua ${res.skippedCount} dòng)`);
      setBulkOpen(false);
      setBulkText('');
      await loadConfigs();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không thể dán link hàng loạt');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleCopySaEmail = async () => {
    if (!serviceAccount?.clientEmail) return;
    try {
      await navigator.clipboard.writeText(serviceAccount.clientEmail);
      toast.success(`Đã copy: ${serviceAccount.clientEmail}`);
    } catch {
      toast.warning('Không thể copy tự động');
    }
  };

  return (
    <div className="space-y-4">
      {/* HEADER BAR GỌN */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface p-4 rounded-2xl border border-border/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-text-primary">Backup Dữ liệu (Web → Sheet / Excel)</h1>
            <Badge variant={serviceAccount?.configured ? 'success' : 'warning'} size="sm" dot>
              {serviceAccount?.configured ? 'Đã kết nối Sheet API' : 'Chỉ lưu Excel Local'}
            </Badge>
          </div>
          {serviceAccount?.clientEmail && (
            <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
              <span>Service Account:</span>
              <code className="font-mono text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                {serviceAccount.clientEmail}
              </code>
              <button
                type="button"
                onClick={handleCopySaEmail}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chọn Năm */}
          <select
            value={year === null ? 'ALL' : String(year)}
            onChange={(e) => setYear(e.target.value === 'ALL' ? null : Number(e.target.value))}
            className="h-9 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="ALL">Tất cả năm</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </select>

          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkOpen(true)}
              leftIcon={<ClipboardPaste className="w-3.5 h-3.5" />}
            >
              Dán nhiều Link
            </Button>
          )}

          {canManage && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunAll}
              isLoading={runningId === 'ALL'}
              leftIcon={<Play className="w-3.5 h-3.5" />}
            >
              Backup tất cả
            </Button>
          )}
        </div>
      </div>

      {/* 3 SUB-TABS GIỐNG TRANG ĐỒNG BỘ */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
        <div className="flex gap-1.5">
          {[
            { key: 'configs' as SubTabKey, label: 'Danh sách nguồn Backup', icon: <Link2 className="w-3.5 h-3.5" />, show: true },
            { key: 'history' as SubTabKey, label: 'Lịch sử Backup', icon: <History className="w-3.5 h-3.5" />, show: true },
            { key: 'connection' as SubTabKey, label: 'Cấu hình Cột & Kết nối', icon: <Settings className="w-3.5 h-3.5" />, show: canViewConnection },
          ]
            .filter((t) => t.show)
            .map((t) => {
            const active = subTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => changeSubTab(t.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-secondary hover:bg-slate-100'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>

        {subTab === 'configs' && (
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã CVHT, GV, tên sổ..."
              className="w-full h-8 pl-8 pr-3 rounded-xl border border-border bg-white text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}
      </div>

      {/* TAB 1: DANH SÁCH BACKUP */}
      {subTab === 'configs' && (
        <div className="space-y-4">
          {/* 5 THẺ FLOW CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {FLOW_CARDS.filter((f) => canManage || (f.key !== 'ADMIN' && f.key !== 'REPORT')).map((card) => {
              const active = flowFilter === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setFlowFilter(card.key)}
                  className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? card.activeClass
                      : 'bg-surface border-border/80 hover:border-slate-300 text-text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate">{card.title}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {flowCounts[card.key]}
                    </span>
                  </div>
                  <p className={`mt-1 text-[11px] truncate ${active ? 'text-white/85' : 'text-text-muted'}`}>
                    {card.subtitle}
                  </p>
                </button>
              );
            })}
          </div>

          {/* DANH SÁCH CẤU HÌNH */}
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-text-muted bg-surface rounded-2xl border border-border/70">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" /> Đang tải...
            </div>
          ) : filteredConfigs.length === 0 ? (
            <div className="py-10 text-center text-xs text-text-muted bg-surface rounded-2xl border border-border/70">
              Không có sổ backup nào khớp bộ lọc.
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-border/80 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border/80 text-left text-[11px] uppercase tracking-wider text-text-muted font-bold">
                      <th className="px-4 py-3 w-[250px]">Sổ Backup</th>
                      <th className="px-3 py-3 w-[260px]">Các Sheet trong File</th>
                      <th className="px-3 py-3">Link Google Sheet đích</th>
                      <th className="px-3 py-3 w-[130px]">Trạng thái</th>
                      <th className="px-4 py-3 w-[180px] text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredConfigs.map((cfg) => {
                      const badge = getProgramBadge(cfg.program_type);
                      const sheets = getSheetsBadges(cfg, year);
                      const draft = draftLinks[cfg.id] ?? cfg.target_spreadsheet_url ?? '';
                      const isDirty = draft.trim() !== (cfg.target_spreadsheet_url || '').trim();
                      const isOk = cfg.last_status === 'SUCCESS';
                      const isErr = cfg.last_status === 'FAILED';

                      return (
                        <tr key={cfg.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Cột 1: Tên sổ */}
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.className}`}>
                                {badge.label}
                              </span>
                              <span className="text-[11px] text-text-muted font-mono">
                                {cfg.student_counts?.total ?? 0} HV
                              </span>
                            </div>
                            <div className="mt-1 font-bold text-text-primary text-xs truncate max-w-[230px]" title={cfg.name}>
                              {getDisplayTitle(cfg)}
                            </div>
                          </td>

                          {/* Cột 2: Các Sheet */}
                          <td className="px-3 py-3 align-middle">
                            <div className="flex flex-wrap gap-1">
                              {sheets.map((s) => (
                                <span
                                  key={s}
                                  className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-medium text-[11px]"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Cột 3: Ô dán Link */}
                          <td className="px-3 py-3 align-middle">
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={draft}
                                onChange={(e) =>
                                  setDraftLinks((prev) => ({ ...prev, [cfg.id]: e.target.value }))
                                }
                                placeholder="Dán link Google Sheet..."
                                className="h-8 text-xs flex-1 min-w-[180px]"
                              />
                              {isDirty && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleSaveLink(cfg)}
                                  isLoading={savingId === cfg.id}
                                  leftIcon={<Save className="w-3 h-3" />}
                                >
                                  Lưu
                                </Button>
                              )}
                              {draft.trim() && (
                                <a
                                  href={draft.trim()}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Mở Google Sheet"
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border text-slate-600 hover:bg-slate-100 shrink-0"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Cột 4: Trạng thái */}
                          <td className="px-3 py-3 align-middle">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={isOk ? 'success' : isErr ? 'danger' : 'neutral'}
                                size="sm"
                                dot
                              >
                                {isOk ? 'Thành công' : isErr ? 'Lỗi' : 'Chưa chạy'}
                              </Badge>
                            </div>
                            <div className="mt-1 text-[11px] text-text-muted">
                              {formatShortDateTime(cfg.last_backup_at)}
                            </div>
                          </td>

                          {/* Cột 5: Thao tác */}
                          <td className="px-4 py-3 align-middle text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadExcel(cfg)}
                                isLoading={downloadingId === cfg.id}
                                leftIcon={<Download className="w-3.5 h-3.5" />}
                                title="Tải file Excel (.xlsx)"
                              >
                                .xlsx
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRunOne(cfg)}
                                isLoading={runningId === String(cfg.id)}
                                leftIcon={<Play className="w-3.5 h-3.5" />}
                              >
                                Chạy
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LỊCH SỬ BACKUP */}
      {subTab === 'history' && (
        <div className="bg-surface rounded-2xl border border-border/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary">Lịch sử các đợt chạy Backup</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHistory}
              isLoading={historyLoading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Làm mới
            </Button>
          </div>

          {history.length === 0 ? (
            <div className="py-10 text-center text-xs text-text-muted">Chưa có lịch sử chạy backup.</div>
          ) : (
            <div className="space-y-2.5">
              {history.map((batch) => (
                <div key={batch.batchId} className="rounded-xl border border-border/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-indigo-700">{batch.batchId}</span>
                      <span className="text-xs text-text-secondary">{formatShortDateTime(batch.startedAt)}</span>
                      <Badge variant="neutral" size="sm">
                        {batch.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}
                      </Badge>
                    </div>
                    <Badge variant={batch.failedCount === 0 ? 'success' : 'warning'} size="sm">
                      {batch.successCount}/{batch.totalConfigs} thành công · {batch.updatedCellsCount} ô cập nhật
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-xs">
                    {batch.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/70"
                      >
                        <span className="font-medium text-slate-700 truncate">
                          {it.staffCode || it.programType} · {it.configName}
                        </span>
                        <span
                          className={`font-bold ml-2 shrink-0 ${
                            it.status === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {it.status === 'SUCCESS' ? `+${it.updatedCellsCount} ô` : 'Lỗi'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: KẾT NỐI & CẤU HÌNH CỘT */}
      {subTab === 'connection' && <SheetBackupAdminConfigCard />}

      {/* MODAL DÁN HÀNG LOẠT LINK */}
      <Modal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Dán hàng loạt Link Google Sheet Backup"
      >
        <div className="space-y-3 text-xs">
          <p className="text-text-secondary">
            Mỗi dòng 1 link theo cú pháp: <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">Mã | Chương trình | Link Google Sheet</code>
          </p>
          <pre className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 overflow-x-auto">
{`ADMIN_KAIWA | https://docs.google.com/spreadsheets/d/1abc...
ADMIN_JLPT | https://docs.google.com/spreadsheets/d/1def...
ADMIN_RECONCILIATION | https://docs.google.com/spreadsheets/d/1ghi...
CVHT01 | KAIWA | https://docs.google.com/spreadsheets/d/1jkl...
CVHT01 | JLPT | https://docs.google.com/spreadsheets/d/1mno...
GV505 | https://docs.google.com/spreadsheets/d/1pqr...`}
          </pre>
          <textarea
            rows={7}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Dán danh sách link vào đây..."
            className="w-full p-2.5 rounded-xl border border-border font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(false)}>
              Đóng
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleBulkSave}
              isLoading={bulkSaving}
              disabled={!bulkText.trim()}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
            >
              Lưu tất cả Link
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CsSheetBackupPanel;
