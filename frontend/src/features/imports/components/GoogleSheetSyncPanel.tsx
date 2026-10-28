import React, { useEffect, useState } from 'react';
import { importsApi } from '../api/imports.api';
import {
  GoogleSheetSyncConfig,
  CsUserOption,
  UpdateGoogleSheetSyncConfigDTO,
  ServiceAccountInfo,
} from '../types/imports.types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Save,
  ShieldCheck,
  FileSpreadsheet,
  Users,
  Link2,
  Layers,
  RotateCcw,
  KeyRound,
  Copy,
} from 'lucide-react';

/**
 * Build the ordered list of CVHT codes from loaded CS users (`staff_code`)
 * unioned with any codes already stored in the config/draft `cvht_mapping`.
 */
const deriveCvhtCodes = (
  users: CsUserOption[],
  ...mappings: Array<Record<string, number> | undefined | null>
): string[] => {
  const seen = new Set<string>();
  const add = (raw?: string | null) => {
    const code = raw?.trim().toUpperCase();
    if (code) seen.add(code);
  };
  users.forEach((u) => add(u.staff_code));
  mappings.forEach((m) => {
    if (m) Object.keys(m).forEach((k) => add(k));
  });
  return Array.from(seen).sort();
};

const DEFAULT_CONFIGS: GoogleSheetSyncConfig[] = [
  {
    id: 1,
    code: 'JLPT',
    name: 'Khóa Luyện thi JLPT',
    program_type: 'JLPT',
    spreadsheet_url: '',
    local_file_path: 'docs/data/hoc_vien/hoc_vien_jlpt.xlsx',
    sheet_name: 'Data JLPT_Inhouse',
    setting_sheet_name: 'Setting',
    header_row: 2,
    cvht_mapping: {},
    default_cs_id: null,
    sync_interval_minutes: 10,
    enabled: true,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 2,
    code: 'KAIWA',
    name: 'Khóa Giao tiếp Kaiwa',
    program_type: 'KAIWA',
    spreadsheet_url: '',
    local_file_path: 'docs/data/hoc_vien/hoc_vien_kaiwa.xlsx',
    sheet_name: 'Tổng',
    setting_sheet_name: null,
    header_row: 2,
    cvht_mapping: {},
    default_cs_id: null,
    sync_interval_minutes: 10,
    enabled: true,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
];

export const GoogleSheetSyncPanel: React.FC = () => {
  const toast = useToast();
  const [configs, setConfigs] = useState<GoogleSheetSyncConfig[]>([]);
  const [csUsers, setCsUsers] = useState<CsUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [syncingCode, setSyncingCode] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // Service Account state for Private / Restricted Google Sheets
  const [serviceAccount, setServiceAccount] = useState<ServiceAccountInfo | null>(null);
  const [showSaEditor, setShowSaEditor] = useState(false);
  const [saJsonDraft, setSaJsonDraft] = useState('');
  const [savingSa, setSavingSa] = useState(false);

  // Local editable drafts keyed by config.code
  const [drafts, setDrafts] = useState<Record<string, UpdateGoogleSheetSyncConfigDTO>>({});

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const data = await importsApi.getSheetSyncConfigs();
      const loadedConfigs =
        data?.configs && data.configs.length > 0 ? data.configs : DEFAULT_CONFIGS;
      const loadedUsers = data?.csUsers || [];

      setConfigs(loadedConfigs);
      setCsUsers(loadedUsers);
      if (data?.serviceAccount) {
        setServiceAccount(data.serviceAccount);
      }

      const nextDrafts: Record<string, UpdateGoogleSheetSyncConfigDTO> = {};
      loadedConfigs.forEach((cfg) => {
        // Pre-populate CVHT mapping from staff_code if empty
        const initialMapping: Record<string, number> = { ...(cfg.cvht_mapping || {}) };
        const dynamicCodes = deriveCvhtCodes(loadedUsers, cfg.cvht_mapping);
        dynamicCodes.forEach((code) => {
          if (!initialMapping[code]) {
            const matchedUser = loadedUsers.find(
              (u) => u.staff_code?.trim().toUpperCase() === code
            );
            if (matchedUser) {
              initialMapping[code] = matchedUser.id;
            }
          }
        });

        nextDrafts[cfg.code] = {
          spreadsheet_url: cfg.spreadsheet_url || '',
          local_file_path: cfg.local_file_path || '',
          sheet_name: cfg.sheet_name,
          setting_sheet_name: cfg.setting_sheet_name || '',
          cvht_mapping: initialMapping,
          default_cs_id: cfg.default_cs_id ?? null,
          sync_interval_minutes: cfg.sync_interval_minutes || 15,
          enabled: cfg.enabled,
        };
      });
      setDrafts(nextDrafts);
    } catch (err: any) {
      // Fallback to default configs so UI still renders cleanly if backend is starting
      setConfigs(DEFAULT_CONFIGS);
      const fallbackDrafts: Record<string, UpdateGoogleSheetSyncConfigDTO> = {};
      DEFAULT_CONFIGS.forEach((cfg) => {
        fallbackDrafts[cfg.code] = {
          spreadsheet_url: cfg.spreadsheet_url || '',
          local_file_path: cfg.local_file_path || '',
          sheet_name: cfg.sheet_name,
          setting_sheet_name: cfg.setting_sheet_name || '',
          cvht_mapping: cfg.cvht_mapping || {},
          default_cs_id: cfg.default_cs_id ?? null,
          sync_interval_minutes: cfg.sync_interval_minutes || 15,
          enabled: cfg.enabled,
        };
      });
      setDrafts(fallbackDrafts);
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể tải cấu hình đồng bộ Google Sheet'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const updateDraft = (code: string, patch: Partial<UpdateGoogleSheetSyncConfigDTO>) => {
    setDrafts((prev) => ({
      ...prev,
      [code]: {
        ...(prev[code] || {}),
        ...patch,
      },
    }));
  };

  const updateCvhtMapping = (code: string, cvhtCode: string, userIdStr: string) => {
    setDrafts((prev) => {
      const current = prev[code]?.cvht_mapping || {};
      const nextMapping = { ...current };
      if (!userIdStr) {
        delete nextMapping[cvhtCode];
      } else {
        nextMapping[cvhtCode] = Number(userIdStr);
      }
      return {
        ...prev,
        [code]: {
          ...(prev[code] || {}),
          cvht_mapping: nextMapping,
        },
      };
    });
  };

  const handleSaveConfig = async (code: string) => {
    const draft = drafts[code];
    if (!draft) return;
    try {
      setSavingCode(code);
      const payload: UpdateGoogleSheetSyncConfigDTO = {
        spreadsheet_url: draft.spreadsheet_url?.trim() || null,
        local_file_path: draft.local_file_path?.trim() || null,
        sheet_name: draft.sheet_name?.trim() || undefined,
        setting_sheet_name: draft.setting_sheet_name?.trim() || null,
        cvht_mapping: draft.cvht_mapping || {},
        default_cs_id: draft.default_cs_id ? Number(draft.default_cs_id) : null,
        sync_interval_minutes: Number(draft.sync_interval_minutes) || 15,
        enabled: Boolean(draft.enabled),
      };
      await importsApi.updateSheetSyncConfig(code, payload);
      toast.success(`Đã lưu cấu hình đồng bộ cho khóa ${code}!`);
      await fetchConfigs();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Không thể lưu cấu hình khóa ${code}`
      );
    } finally {
      setSavingCode(null);
    }
  };

  const handleRunSync = async (code: string, forceFullSync = false) => {
    try {
      setSyncingCode(`${code}_${forceFullSync ? 'full' : 'diff'}`);
      // Save draft first if user changed settings
      const draft = drafts[code];
      if (draft) {
        await importsApi.updateSheetSyncConfig(code, {
          spreadsheet_url: draft.spreadsheet_url?.trim() || null,
          sheet_name: draft.sheet_name?.trim() || undefined,
          setting_sheet_name: draft.setting_sheet_name?.trim() || null,
          cvht_mapping: draft.cvht_mapping || {},
          default_cs_id: draft.default_cs_id ? Number(draft.default_cs_id) : null,
          sync_interval_minutes: Number(draft.sync_interval_minutes) || 15,
          enabled: Boolean(draft.enabled),
        });
      }

      const res = await importsApi.runSheetSync(code, { forceFullSync });
      const summary = res?.summary || res;
      const created = summary?.createdCount ?? 0;
      const updated = summary?.updatedCount ?? 0;
      const unchanged = summary?.unchangedRows ?? 0;
      toast.success(
        `Đồng bộ ${code} hoàn tất: Tạo mới ${created}, Cập nhật ${updated}, Bỏ qua ${unchanged} dòng không đổi.`
      );
      await fetchConfigs();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Đồng bộ khóa ${code} thất bại`
      );
    } finally {
      setSyncingCode(null);
    }
  };

  const handleSaveServiceAccount = async () => {
    try {
      setSavingSa(true);
      const res = await importsApi.saveServiceAccount(saJsonDraft.trim() || null);
      setServiceAccount(res.serviceAccount);
      setShowSaEditor(false);
      setSaJsonDraft('');
      toast.success(
        res.serviceAccount.configured
          ? `Đã lưu Google Service Account (${res.serviceAccount.clientEmail})!`
          : 'Đã xóa cấu hình Google Service Account trên DB.'
      );
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể lưu Google Service Account JSON'
      );
    } finally {
      setSavingSa(false);
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success(`Đã sao chép email: ${email}`);
  };

  const handleSyncAll = async (forceFullSync = false) => {
    try {
      setSyncingAll(true);
      const res = await importsApi.runSheetSyncAll({ forceFullSync });
      const count = res?.results?.length || 2;
      toast.success(
        forceFullSync
          ? `Đã quét và làm mới toàn bộ ${count} khóa (JLPT & Kaiwa)!`
          : `Đã đồng bộ thay đổi cả ${count} khóa (JLPT & Kaiwa)!`
      );
      await fetchConfigs();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Đồng bộ toàn bộ thất bại'
      );
    } finally {
      setSyncingAll(false);
    }
  };

  const renderStatusBadge = (status?: string | null) => {
    if (!status || status === 'IDLE') return <Badge variant="neutral">Chưa chạy</Badge>;
    if (status === 'RUNNING' || status === 'SYNCING') {
      return (
        <Badge variant="info">
          <span className="inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Đang chạy
          </span>
        </Badge>
      );
    }
    if (status === 'SUCCESS' || status === 'COMPLETED') {
      return (
        <Badge variant="success">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Thành công
          </span>
        </Badge>
      );
    }
    if (status === 'PARTIAL_FAILED') {
      return (
        <Badge variant="warning">
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Có dòng lỗi
          </span>
        </Badge>
      );
    }
    return (
      <Badge variant="danger">
        <span className="inline-flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          Thất bại
        </span>
      </Badge>
    );
  };

  if (loading && configs.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border/80 p-12 flex items-center justify-center text-text-muted">
        <RefreshCw className="w-5 h-5 animate-spin mr-3 text-primary" />
        <span className="text-xs font-semibold">
          Đang tải cấu hình đồng bộ Google Sheet (JLPT & Kaiwa)...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Smart Sync Banner */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50/70 to-teal-50/70 rounded-2xl border border-blue-200/80 p-4 sm:p-5 shadow-soft">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              Đồng bộ Google Sheet Tự động: Khóa Luyện thi (JLPT) & Khóa Giao tiếp (Kaiwa)
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSyncAll(true)}
              isLoading={syncingAll}
              leftIcon={<RotateCcw className="w-4 h-4 text-amber-600" />}
              className="bg-white border-amber-300 text-amber-900 hover:bg-amber-50 font-bold"
            >
              Đồng bộ lại toàn bộ
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleSyncAll(false)}
              isLoading={syncingAll}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              className="font-bold shadow-sm"
            >
              Đồng bộ cả 2 khóa
            </Button>
          </div>
        </div>

        {/* Private Sheet / Service Account Authentication Bar */}
        <div className="mt-4 pt-3.5 border-t border-blue-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 text-xs">
            <KeyRound className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold text-slate-800">
                Xác thực Google Sheet Riêng tư (Restricted):{' '}
              </span>
              {serviceAccount?.configured && serviceAccount.clientEmail ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Badge variant="success" size="sm">Đã kết nối Service Account</Badge>
                  <code className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] font-bold text-indigo-700">
                    {serviceAccount.clientEmail}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyEmail(serviceAccount.clientEmail!)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-semibold text-[11px] transition-colors"
                    title="Copy email này và bấm Share (Viewer) trên file Google Sheet"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Email để Share quyền xem
                  </button>
                </span>
              ) : (
                <span className="text-slate-600">
                  Chưa cấu hình Service Account (Hiện đang dùng file local <code className="font-mono text-[11px] bg-white px-1 rounded">docs/data/hoc_vien/</code> hoặc link công khai). Nếu file Google Sheet khóa riêng tư, hãy gắn Service Account JSON.
                </span>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSaEditor((prev) => !prev)}
            leftIcon={<KeyRound className="w-3.5 h-3.5 text-indigo-600" />}
            className="bg-white text-xs shrink-0"
          >
            {showSaEditor ? 'Đóng cấu hình Key' : serviceAccount?.configured ? 'Đổi Service Account JSON' : 'Cấu hình Service Account JSON'}
          </Button>
        </div>

        {showSaEditor && (
          <div className="mt-3 p-4 bg-white rounded-xl border border-indigo-200 space-y-3">
            <div className="text-xs text-slate-700 space-y-1">
              <p className="font-bold text-slate-900">
                Hướng dẫn kết nối file Google Sheet chỉ người có quyền mới xem được:
              </p>
              <ol className="list-decimal list-inside space-y-0.5 text-slate-600">
                <li>
                  Vào <strong>Google Cloud Console → IAM &amp; Admin → Service Accounts</strong>, tạo 1 Service Account và bật <strong>Google Drive API</strong>.
                </li>
                <li>
                  Vào tab <strong>Keys → Add Key → Create new key (JSON)</strong> để tải file <code className="font-mono">.json</code> về máy và dán nội dung vào ô bên dưới.
                </li>
                <li>
                  Copy địa chỉ <code className="font-mono text-indigo-700">client_email</code> của Service Account, mở 2 file Google Sheet (JLPT &amp; Kaiwa) → bấm <strong>Chia sẻ (Share)</strong> → thêm email đó với quyền <strong>Người xem (Viewer)</strong>.
                </li>
              </ol>
            </div>
            <textarea
              rows={5}
              value={saJsonDraft}
              onChange={(e) => setSaJsonDraft(e.target.value)}
              placeholder='Dán toàn bộ nội dung file service-account.json vào đây: {"type": "service_account", "project_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----...", "client_email": "...@...iam.gserviceaccount.com"}'
              className="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <div className="flex items-center justify-end gap-2">
              {serviceAccount?.configured && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSaJsonDraft('');
                    handleSaveServiceAccount();
                  }}
                  isLoading={savingSa}
                >
                  Xóa Key trên DB
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveServiceAccount}
                isLoading={savingSa}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                Lưu Service Account JSON
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 2 Cards Grid: JLPT & KAIWA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {configs.map((cfg) => {
          const isJlpt = cfg.code === 'JLPT' || cfg.program_type === 'JLPT';
          const draft = drafts[cfg.code] || {
            spreadsheet_url: cfg.spreadsheet_url || '',
            sheet_name: cfg.sheet_name,
            setting_sheet_name: cfg.setting_sheet_name || '',
            cvht_mapping: cfg.cvht_mapping || {},
            default_cs_id: cfg.default_cs_id ?? null,
            sync_interval_minutes: cfg.sync_interval_minutes || 15,
            enabled: cfg.enabled,
          };
          const summary = cfg.last_summary;
          const byCvht = summary?.byCvht || {};
          const cvhtCodes = deriveCvhtCodes(csUsers, cfg.cvht_mapping, draft.cvht_mapping);

          return (
            <div
              key={cfg.code}
              className={`bg-surface rounded-2xl border shadow-soft overflow-hidden flex flex-col justify-between ${
                isJlpt ? 'border-indigo-200/90' : 'border-teal-200/90'
              }`}
            >
              <div>
                {/* Card Header */}
                <div
                  className={`px-5 py-4 border-b flex items-start justify-between gap-3 ${
                    isJlpt
                      ? 'bg-indigo-50/60 border-indigo-200/70'
                      : 'bg-teal-50/60 border-teal-200/70'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                        isJlpt
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-teal-600 text-white shadow-xs'
                      }`}
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold tracking-wide ${
                            isJlpt
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                              : 'bg-teal-100 text-teal-800 border border-teal-300'
                          }`}
                        >
                          {cfg.code}
                        </span>
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          {isJlpt
                            ? 'Khóa Luyện thi JLPT (Data JLPT_Inhouse)'
                            : 'Khóa Giao tiếp Kaiwa (Sheet Tổng)'}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {isJlpt
                          ? 'Sheet chính: Data JLPT_Inhouse • Sheet quy chiếu số buổi: Setting'
                          : 'Sheet chính: Tổng • Chuẩn 60 cột theo dõi chăm sóc & lịch học'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateDraft(cfg.code, { enabled: !draft.enabled })}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                        draft.enabled
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          draft.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                        }`}
                      />
                      <span>{draft.enabled ? 'Đang bật tự động' : 'Tạm tắt'}</span>
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 space-y-4 text-xs">
                  {/* Status & Latest Sync Summary */}
                  <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Lần đồng bộ gần nhất:</span>
                        <strong className="text-slate-900">
                          {cfg.last_synced_at
                            ? new Date(cfg.last_synced_at).toLocaleString('vi-VN')
                            : 'Chưa đồng bộ'}
                        </strong>
                      </div>
                      {renderStatusBadge(cfg.last_status)}
                    </div>

                    {/* Stats Counters */}
                    <div className="grid grid-cols-5 gap-2 pt-1">
                      <div className="bg-white rounded-lg border border-slate-200/80 p-2 text-center">
                        <span className="block text-[10px] text-slate-500 font-semibold">
                          Tổng dòng
                        </span>
                        <strong className="text-sm font-extrabold text-slate-900">
                          {summary?.totalRows ?? 0}
                        </strong>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200/80 p-2 text-center">
                        <span className="block text-[10px] text-slate-500 font-semibold">
                          Không đổi
                        </span>
                        <strong className="text-sm font-extrabold text-slate-600">
                          {summary?.unchangedRows ?? 0}
                        </strong>
                      </div>
                      <div className="bg-emerald-50/70 rounded-lg border border-emerald-200/80 p-2 text-center">
                        <span className="block text-[10px] text-emerald-700 font-semibold">
                          Tạo mới
                        </span>
                        <strong className="text-sm font-extrabold text-emerald-700">
                          +{summary?.createdCount ?? 0}
                        </strong>
                      </div>
                      <div className="bg-blue-50/70 rounded-lg border border-blue-200/80 p-2 text-center">
                        <span className="block text-[10px] text-blue-700 font-semibold">
                          Cập nhật
                        </span>
                        <strong className="text-sm font-extrabold text-blue-700">
                          {summary?.updatedCount ?? 0}
                        </strong>
                      </div>
                      <div className="bg-rose-50/70 rounded-lg border border-rose-200/80 p-2 text-center">
                        <span className="block text-[10px] text-rose-700 font-semibold">
                          Lỗi
                        </span>
                        <strong className="text-sm font-extrabold text-rose-700">
                          {summary?.failedCount ?? 0}
                        </strong>
                      </div>
                    </div>

                    {/* CSKH Breakdown */}
                    <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                        <span>Phân bổ học viên theo mã CSKH:</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {Object.keys(byCvht).length > 0 ? (
                          Object.entries(byCvht).map(([cvhtKey, count]) => (
                            <span
                              key={cvhtKey}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-300 text-[11px] font-bold text-slate-800 shadow-2xs"
                            >
                              <span className="text-blue-700 font-mono">{cvhtKey}:</span>
                              <span>{count} HV</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Chưa có thống kê CSKH (Hãy bấm Đồng bộ)
                          </span>
                        )}
                      </div>
                    </div>

                    {cfg.last_error && (
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">
                        <strong>Lỗi gần nhất:</strong> {cfg.last_error}
                      </div>
                    )}
                  </div>

                  {/* Quick Configuration Form */}
                  <div className="space-y-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <Link2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Link Google Sheet (URL chia sẻ hoặc Export)</span>
                      </label>
                      <Input
                        placeholder={
                          isJlpt
                            ? 'https://docs.google.com/spreadsheets/d/... (Để trống sẽ đọc từ docs/data/hoc_vien/hoc_vien_jnpt.xlsx)'
                            : 'https://docs.google.com/spreadsheets/d/... (Để trống sẽ đọc từ docs/data/hoc_vien/hoc_vien_kawa.xlsx)'
                        }
                        value={draft.spreadsheet_url || ''}
                        onChange={(e) =>
                          updateDraft(cfg.code, { spreadsheet_url: e.target.value })
                        }
                      />
                      <span className="block text-[10px] text-slate-500 mt-1">
                        Ghi chú: Để trống sẽ tự động đọc từ file nguồn cục bộ{' '}
                        <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">
                          {cfg.local_file_path ||
                            (isJlpt
                              ? 'docs/data/hoc_vien/hoc_vien_jnpt.xlsx'
                              : 'docs/data/hoc_vien/hoc_vien_kawa.xlsx')}
                        </code>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Tên Sheet chính</span>
                        </label>
                        <Input
                          value={draft.sheet_name || ''}
                          onChange={(e) =>
                            updateDraft(cfg.code, { sheet_name: e.target.value })
                          }
                          placeholder={isJlpt ? 'Data JLPT_Inhouse' : 'Tổng'}
                        />
                      </div>

                      {isJlpt ? (
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Sheet Setting (Số buổi)
                          </label>
                          <Input
                            value={draft.setting_sheet_name || ''}
                            onChange={(e) =>
                              updateDraft(cfg.code, { setting_sheet_name: e.target.value })
                            }
                            placeholder="Setting"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Dòng tiêu đề (Header)
                          </label>
                          <Input
                            type="number"
                            disabled
                            value={cfg.header_row || 2}
                          />
                        </div>
                      )}

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Chu kỳ kiểm tra (phút)
                        </label>
                        <select
                          value={draft.sync_interval_minutes || 15}
                          onChange={(e) =>
                            updateDraft(cfg.code, {
                              sync_interval_minutes: Number(e.target.value),
                            })
                          }
                          className="w-full h-9 px-3 border border-border rounded-xl text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value={5}>Mỗi 5 phút</option>
                          <option value={10}>Mỗi 10 phút</option>
                          <option value={15}>Mỗi 15 phút</option>
                          <option value={30}>Mỗi 30 phút</option>
                          <option value={60}>Mỗi 60 phút</option>
                        </select>
                      </div>
                    </div>

                    {/* CSKH Role Mapping Table */}
                    <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-blue-600" />
                          <span>
                            Ánh xạ Phân quyền Mã CSKH (Cột trong Sheet ➔ Tài khoản CSKH)
                          </span>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {cvhtCodes.map((cvhtCode) => {
                          const selectedId = draft.cvht_mapping?.[cvhtCode] || '';
                          return (
                            <div
                              key={cvhtCode}
                              className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200/90"
                            >
                              <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold text-[11px] shrink-0">
                                {cvhtCode}
                              </span>
                              <select
                                value={selectedId}
                                onChange={(e) =>
                                  updateCvhtMapping(cfg.code, cvhtCode, e.target.value)
                                }
                                className="flex-1 h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-primary"
                              >
                                <option value="">-- Tự động theo mã {cvhtCode} --</option>
                                {csUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name || u.email} {u.staff_code ? `(${u.staff_code})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}

                        {/* Default CS when CVHT column is blank */}
                        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-dashed border-slate-300">
                          <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-semibold text-[11px] shrink-0">
                            Mặc định (Trống)
                          </span>
                          <select
                            value={draft.default_cs_id || ''}
                            onChange={(e) =>
                              updateDraft(cfg.code, {
                                default_cs_id: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            className="flex-1 h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-primary"
                          >
                            <option value="">-- Chọn CSKH mặc định --</option>
                            {csUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name || u.email} {u.staff_code ? `(${u.staff_code})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSaveConfig(cfg.code)}
                  isLoading={savingCode === cfg.code}
                  leftIcon={<Save className="w-3.5 h-3.5 text-slate-600" />}
                >
                  Lưu cấu hình
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRunSync(cfg.code, true)}
                    isLoading={syncingCode === `${cfg.code}_full`}
                    leftIcon={<RotateCcw className="w-3.5 h-3.5 text-amber-600" />}
                    className="border-amber-300 text-amber-900 hover:bg-amber-50"
                  >
                    Quét lại toàn bộ
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRunSync(cfg.code, false)}
                    isLoading={syncingCode === `${cfg.code}_diff`}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Đồng bộ thay đổi
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
