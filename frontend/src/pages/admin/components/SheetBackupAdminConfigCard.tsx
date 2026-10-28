import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Info,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
} from 'lucide-react';

/* ------------------------------- Types ---------------------------------- */

type ProgramType = 'KAIWA' | 'JLPT';
type SheetKind = 'profile' | 'attendance';

interface SheetColumnConfigItem {
  fieldKey: string;
  title: string;
  group: string;
  defaultCol: number;
  col: number;
  colLetter: string;
  enabled: boolean;
  hasDbSource: boolean;
  isKey?: boolean;
  isFormulaPreserved?: boolean;
}

interface SheetColumnMappingConfig {
  sheetKind: SheetKind;
  defaultSheetName: string;
  headerRow: number;
  firstDataRow: number;
  columns: SheetColumnConfigItem[];
}

interface ProgramColumnMappingConfig {
  programType: ProgramType;
  profile: SheetColumnMappingConfig;
  attendance: SheetColumnMappingConfig;
}

type ColumnMappingByProgram = Record<ProgramType, ProgramColumnMappingConfig>;

interface ServiceAccountInfo {
  configured: boolean;
  clientEmail: string | null;
  projectId: string | null;
  source: 'DB' | 'ENV_FILE' | 'ENV_VARS' | 'NONE';
}

/* ------------------------------ Constants -------------------------------- */

const PROGRAM_TABS: Array<{
  value: ProgramType;
  title: string;
  fileName: string;
  sheets: string;
}> = [
  {
    value: 'KAIWA',
    title: 'Học viên Kaiwa',
    fileName: 'cham_soc_hoc_vien.xlsx',
    sheets: 'Sheet 1: 1.Chăm sóc (60 cột) · Sheet 3: 3.Chấm buổi (28 cột cố định + lịch tháng)',
  },
  {
    value: 'JLPT',
    title: 'Học viên JLPT',
    fileName: 'hoc_vien_jlpt.xlsx',
    sheets: 'Sheet 1: Data JLPT_Inhouse (52 cột) · Sheet 2: Chấm buổi (12 cột cố định + lịch tháng)',
  },
];

const SHEET_TAB_LABELS: Record<ProgramType, Record<SheetKind, string>> = {
  KAIWA: {
    profile: 'Sheet 1: 1.Chăm sóc (Hồ sơ & CSKH)',
    attendance: 'Sheet 3: 3.Chấm buổi (Điểm danh)',
  },
  JLPT: {
    profile: 'Sheet 1: Data JLPT_Inhouse (Hồ sơ & Điểm thi)',
    attendance: 'Sheet 2: Chấm buổi (Điểm danh)',
  },
};

const GROUP_ALL = '__ALL__';
const BASE_GROUP_FILTERS = [
  'Hồ sơ & Học phí',
  'Lớp & Lịch học',
  'Nhật ký chăm sóc',
  'Kiểm tra & Thi',
  'Điểm danh & Tổng kết',
];

const SOURCE_LABELS: Record<ServiceAccountInfo['source'], string> = {
  DB: 'DB (mã hóa AES-256-GCM)',
  ENV_FILE: 'ENV (file JSON)',
  ENV_VARS: 'ENV (biến môi trường)',
  NONE: 'Chưa có nguồn cấu hình',
};

/* --------------------------- Column letter utils -------------------------- */

const MAX_SHEET_COLS = 200; // Đồng bộ với giới hạn cột cố định/hồ sơ phía Backend (1..200)

function colNumberToLetter(col: number): string {
  if (!Number.isFinite(col) || col < 1 || col > MAX_SHEET_COLS) return '';
  let n = Math.floor(col);
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function colLetterToNumber(letters: string): number | null {
  const clean = (letters || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!clean) return null;
  let n = 0;
  for (const ch of clean) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
    if (n > MAX_SHEET_COLS) return null;
  }
  return n;
}

const parseColInput = (raw: string): number | null => {
  const value = (raw || '').trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const n = parseInt(value, 10);
    return n >= 1 && n <= MAX_SHEET_COLS ? n : null;
  }
  return colLetterToNumber(value);
};

/* ------------------------------ Sub-components ---------------------------- */

interface ColInputCellProps {
  col: number;
  defaultCol: number;
  disabled?: boolean;
  hasConflict: boolean;
  onChange: (nextCol: number) => void;
}

const ColInputCell: React.FC<ColInputCellProps> = ({ col, defaultCol, disabled, hasConflict, onChange }) => {
  const [text, setText] = useState<string>(colNumberToLetter(col));

  useEffect(() => {
    setText(colNumberToLetter(col));
  }, [col]);

  const commit = () => {
    const next = parseColInput(text);
    if (next === null) {
      setText(colNumberToLetter(col));
      return;
    }
    if (next !== col) onChange(next);
    setText(colNumberToLetter(next));
  };

  const drifted = col !== defaultCol;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          className={`w-16 px-2 py-1 border rounded-lg text-xs font-mono font-bold uppercase bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-slate-50 disabled:text-slate-400 ${
            hasConflict ? 'border-rose-400 ring-2 ring-rose-200 text-rose-700' : 'border-slate-300 text-slate-800'
          }`}
          title="Nhập chữ cái cột (A, B, ... AA, BH) hoặc số thứ tự cột"
        />
        <span className="text-[11px] text-text-muted font-mono">
          #{colNumberToLetter(col) ? col : '—'}
        </span>
      </div>
      {drifted && (
        <Badge variant="warning" size="sm" className="self-start">
          Mặc định: Cột {colNumberToLetter(defaultCol)} ({defaultCol})
        </Badge>
      )}
      {hasConflict && (
        <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Trùng vị trí cột!
        </span>
      )}
    </div>
  );
};

/* --------------------------------- Card ---------------------------------- */

export const SheetBackupAdminConfigCard: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles?.some((r) => r === 'ADMIN'));

  // Shared state
  const [loading, setLoading] = useState<boolean>(true);
  const [serviceAccount, setServiceAccount] = useState<ServiceAccountInfo | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Service account editor
  const [showSaEditor, setShowSaEditor] = useState<boolean>(false);
  const [saJsonDraft, setSaJsonDraft] = useState<string>('');
  const [savingSa, setSavingSa] = useState<boolean>(false);

  // Column config drafts
  const [columnConfig, setColumnConfig] = useState<ColumnMappingByProgram | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const [activeProgram, setActiveProgram] = useState<ProgramType>('KAIWA');
  const [activeKind, setActiveKind] = useState<SheetKind>('profile');
  const [search, setSearch] = useState<string>('');
  const [groupFilter, setGroupFilter] = useState<string>(GROUP_ALL);
  const [savingColumns, setSavingColumns] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);

  /* ------------------------------ Data loading ---------------------------- */

  const applyColumnConfig = (cfg: ColumnMappingByProgram | null) => {
    if (!cfg) return;
    setColumnConfig(cfg);
    setSavedSnapshot(JSON.stringify(cfg));
  };

  const fetchServiceAccountFallback = async (): Promise<ServiceAccountInfo | null> => {
    try {
      const res = await apiClient.get('/imports/sheet-sync/configs');
      return res.data?.data?.serviceAccount ?? null;
    } catch {
      return null;
    }
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/imports/sheet-backup/column-config');
      const data = res.data?.data;

      setColumnConfig((data?.columnConfig as ColumnMappingByProgram) ?? null);
      setSavedSnapshot(data?.columnConfig ? JSON.stringify(data.columnConfig) : '');
      setUpdatedAt((data?.columnConfig as any)?.updatedAt ?? null);

      let sa: ServiceAccountInfo | null = data?.serviceAccount ?? null;
      if (!sa) sa = await fetchServiceAccountFallback();
      setServiceAccount(sa);
    } catch (err: any) {
      const sa = await fetchServiceAccountFallback();
      if (sa) setServiceAccount(sa);
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể tải cấu hình cột & Service Account'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ Derived data ---------------------------- */

  const programCfg: ProgramColumnMappingConfig | null = columnConfig ? columnConfig[activeProgram] : null;
  const sheetCfg: SheetColumnMappingConfig | null = programCfg ? programCfg[activeKind] : null;

  const isDirty = useMemo(() => {
    if (!columnConfig) return false;
    return JSON.stringify(columnConfig) !== savedSnapshot;
  }, [columnConfig, savedSnapshot]);

  const groupOptions = useMemo(() => {
    const found = new Set<string>(BASE_GROUP_FILTERS);
    (['KAIWA', 'JLPT'] as ProgramType[]).forEach((p) => {
      const cfg = columnConfig?.[p];
      if (!cfg) return;
      [...cfg.profile.columns, ...cfg.attendance.columns].forEach((c) => {
        if (c.group) found.add(c.group);
      });
    });
    return Array.from(found);
  }, [columnConfig]);

  const visibleColumns = useMemo(() => {
    if (!sheetCfg) return [];
    const q = search.trim().toLowerCase();
    return sheetCfg.columns.filter((c) => {
      const matchGroup = groupFilter === GROUP_ALL || c.group === groupFilter;
      const matchSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.fieldKey.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        colNumberToLetter(c.col).toLowerCase() === q;
      return matchGroup && matchSearch;
    });
  }, [sheetCfg, search, groupFilter]);

  const duplicateCols = useMemo(() => {
    const seen = new Map<number, number>();
    (sheetCfg?.columns ?? []).forEach((c) => {
      if (!c.enabled || c.fieldKey === 'keep' || c.fieldKey.startsWith('keep.')) return;
      seen.set(c.col, (seen.get(c.col) || 0) + 1);
    });
    const dupes = new Set<number>();
    seen.forEach((count, col) => {
      if (count > 1) dupes.add(col);
    });
    return dupes;
  }, [sheetCfg]);

  const enabledCount = sheetCfg?.columns.filter((c) => c.enabled).length ?? 0;
  const conflictCount = duplicateCols.size;

  /* ----------------------------- Mutations -------------------------------- */

  const patchSheet = (
    program: ProgramType,
    kind: SheetKind,
    updater: (sheet: SheetColumnMappingConfig) => SheetColumnMappingConfig
  ) => {
    setColumnConfig((prev) => {
      if (!prev) return prev;
      const prog = prev[program];
      if (!prog) return prev;
      return { ...prev, [program]: { ...prog, [kind]: updater(prog[kind]) } };
    });
  };

  const patchColumn = (
    program: ProgramType,
    kind: SheetKind,
    fieldKey: string,
    patch: Partial<SheetColumnConfigItem>
  ) => {
    patchSheet(program, kind, (sheet) => ({
      ...sheet,
      columns: sheet.columns.map((c) => (c.fieldKey === fieldKey ? { ...c, ...patch } : c)),
    }));
  };

  const setSheetName = (name: string) =>
    patchSheet(activeProgram, activeKind, (sheet) => ({ ...sheet, defaultSheetName: name }));

  const setHeaderRow = (row: number) =>
    patchSheet(activeProgram, activeKind, (sheet) => ({
      ...sheet,
      headerRow: row,
      firstDataRow: row + 1,
    }));

  const setAllEnabled = (enabled: boolean, onlyOptional = false) =>
    patchSheet(activeProgram, activeKind, (sheet) => ({
      ...sheet,
      columns: sheet.columns.map((c) => {
        if (c.isKey) return { ...c, enabled: true };
        if (onlyOptional && c.hasDbSource) return c;
        return { ...c, enabled };
      }),
    }));

  const restoreSheetDefaults = () =>
    patchSheet(activeProgram, activeKind, (sheet) => ({
      ...sheet,
      headerRow: sheet.headerRow,
      firstDataRow: sheet.headerRow + 1,
      columns: sheet.columns.map((c) => ({ ...c, col: c.defaultCol })),
    }));

  const handleSaveServiceAccount = async (json: string | null) => {
    try {
      setSavingSa(true);
      const res = await apiClient.put('/imports/sheet-sync/service-account', { service_account_json: json });
      const next: ServiceAccountInfo | undefined = res.data?.data?.serviceAccount;
      if (next) setServiceAccount(next);
      return next;
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể lưu Google Service Account JSON'
      );
      return null;
    } finally {
      setSavingSa(false);
    }
  };

  const handleSubmitSa = async () => {
    const trimmed = saJsonDraft.trim();
    if (trimmed) {
      try {
        JSON.parse(trimmed);
      } catch {
        toast.error('Nội dung không phải JSON hợp lệ. Vui lòng dán toàn bộ nội dung file .json');
        return;
      }
    }
    const next = await handleSaveServiceAccount(trimmed || null);
    if (!next) return;
    setSaJsonDraft('');
    setShowSaEditor(false);
    toast.success(
      next.configured
        ? `Đã mã hóa AES-256-GCM và lưu Service Account (${next.clientEmail})!`
        : 'Đã xóa cấu hình Google Service Account.'
    );
  };

  const handleDeleteSa = async () => {
    const next = await handleSaveServiceAccount(null);
    if (!next) return;
    setSaJsonDraft('');
    setShowSaEditor(false);
    toast.success('Đã xóa Key trên DB (hệ thống sẽ quay về nguồn ENV nếu có).');
  };

  const handleCopyEmail = async () => {
    const email = serviceAccount?.clientEmail;
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      toast.success(`Đã copy email ${email} — hãy cấp quyền Người chỉnh sửa (Editor) trên Google Sheet.`);
    } catch {
      toast.warning('Trình duyệt không cho phép copy tự động, vui lòng bôi đen và copy thủ công.');
    }
  };

  const handleSaveColumnConfig = async () => {
    if (!columnConfig) return;
    if (conflictCount > 0) {
      toast.error(`Đang có ${conflictCount} vị trí cột bị trùng giữa các cột đang BẬT. Vui lòng sửa trước khi lưu.`);
      return;
    }
    try {
      setSavingColumns(true);
      const res = await apiClient.put('/imports/sheet-backup/column-config', {
        KAIWA: columnConfig.KAIWA,
        JLPT: columnConfig.JLPT,
      });
      const data = res.data?.data;
      if (data?.columnConfig) {
        applyColumnConfig(data.columnConfig as ColumnMappingByProgram);
        setUpdatedAt((data.columnConfig as any)?.updatedAt ?? new Date().toISOString());
      }
      if (data?.serviceAccount) setServiceAccount(data.serviceAccount);
      toast.success('Đã lưu cấu hình cột Web → Sheet Backup cho cả 2 chương trình!');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Lưu cấu hình cột thất bại'
      );
    } finally {
      setSavingColumns(false);
    }
  };

  const handleResetProgram = async () => {
    if (!isAdmin) return;
    try {
      setResetting(true);
      const res = await apiClient.post('/imports/sheet-backup/column-config/reset', {
        programType: activeProgram,
      });
      const data = res.data?.data;
      if (data?.columnConfig) {
        applyColumnConfig(data.columnConfig as ColumnMappingByProgram);
        setUpdatedAt((data.columnConfig as any)?.updatedAt ?? null);
      }
      toast.success(`Đã khôi phục cấu hình cột mặc định cho chương trình ${activeProgram}.`);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể khôi phục cấu hình mặc định'
      );
    } finally {
      setResetting(false);
    }
  };

  /* -------------------------------- Render -------------------------------- */

  const saReady = Boolean(serviceAccount?.configured);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ============================ KHỐI 1: SERVICE ACCOUNT ============================ */}
      <Card className="border-border/80 bg-surface shadow-soft">
        <CardHeader className="border-b border-border/60 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg flex flex-wrap items-center gap-2">
                  Google Service Account JSON
                  <Badge variant={loading ? 'neutral' : saReady ? 'success' : 'warning'} size="sm" dot>
                    {loading ? 'Đang tải...' : saReady ? 'Đã sẵn sàng' : 'Chưa cấu hình'}
                  </Badge>
                  {!loading && serviceAccount?.source && serviceAccount.source !== 'NONE' && (
                    <Badge variant="info" size="sm">
                      Nguồn: {SOURCE_LABELS[serviceAccount.source]}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-0.5">
                  Key dùng chung cho <strong>Đồng bộ Google Sheet → Web</strong> và <strong>Backup Web → Sheet</strong>.
                  Chỉ tài khoản <strong>ADMIN</strong> được cấu hình tại trang này.
                </CardDescription>
              </div>
            </div>

            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSaEditor((prev) => !prev)}
                leftIcon={<KeyRound className="w-3.5 h-3.5 text-indigo-600" />}
                className="shrink-0"
              >
                {showSaEditor
                  ? 'Đóng cấu hình Key'
                  : saReady
                  ? 'Đổi Service Account JSON'
                  : 'Cấu hình Service Account JSON'}
              </Button>
            )}
          </div>

          {!loading && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              {saReady && serviceAccount?.clientEmail ? (
                <>
                  <span className="text-text-muted font-semibold">Client Email:</span>
                  <code className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] font-bold text-indigo-700">
                    {serviceAccount.clientEmail}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-semibold text-[11px] transition-colors cursor-pointer"
                    title="Copy Email để cấp quyền Editor (Người chỉnh sửa) trên Google Sheet đích"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Email để cấp quyền Editor (Người chỉnh sửa)
                  </button>
                </>
              ) : (
                <span className="text-slate-600 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  Chưa gắn Service Account JSON — hệ thống vẫn xuất file Excel chuẩn trên server, nhưng chưa đẩy được
                  lên Google Sheet.
                </span>
              )}
              {serviceAccount?.projectId && (
                <span className="text-text-muted font-semibold ml-1">
                  Project ID: <code className="font-mono text-[11px] text-slate-700">{serviceAccount.projectId}</code>
                </span>
              )}
            </div>
          )}

          {!isAdmin && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Bạn không có vai trò <strong>ADMIN</strong> nên chỉ xem được trạng thái kết nối. Việc lưu / xóa
                Service Account JSON và cấu hình cột chỉ dành cho Quản trị viên.
              </span>
            </div>
          )}
        </CardHeader>

        {showSaEditor && isAdmin && (
          <CardContent className="p-5 sm:p-6 pt-5 space-y-3 border-t border-border/60">
            <div className="text-xs text-slate-700 space-y-1">
              <p className="font-bold text-slate-900">
                Cấu hình Google Service Account JSON (mã hóa AES-256-GCM trước khi lưu DB):
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-600">
                <li>
                  Vào <strong>Google Cloud Console → IAM &amp; Admin → Service Accounts</strong>, tạo 1 Service Account
                  và bật <strong>Google Sheets API</strong> + <strong>Google Drive API</strong>.
                </li>
                <li>
                  Mở tab <strong>Keys → Add Key → Create new key (JSON)</strong> để tải file{' '}
                  <code className="font-mono">.json</code> về máy, sau đó dán <em>toàn bộ nội dung</em> file vào ô bên
                  dưới.
                </li>
                <li>
                  Sau khi lưu, bấm <strong>Copy Email</strong> và mở từng file Google Sheet đích →{' '}
                  <strong>Chia sẻ (Share)</strong> → cấp quyền <strong>Người chỉnh sửa (Editor)</strong> cho email đó.
                </li>
              </ol>
            </div>
            <textarea
              rows={6}
              value={saJsonDraft}
              onChange={(e) => setSaJsonDraft(e.target.value)}
              placeholder={'Dán toàn bộ nội dung file service-account.json vào đây:\n{"type": "service_account", "project_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----...", "client_email": "...@...iam.gserviceaccount.com"}'}
              className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {saReady && (
                <Button variant="outline" size="sm" onClick={handleDeleteSa} isLoading={savingSa} leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}>
                  Xóa Key trên DB
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitSa}
                isLoading={savingSa}
                disabled={!saJsonDraft.trim() && !saReady}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                Lưu Service Account JSON
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ============================ KHỐI 2: CỘT WEB → SHEET ============================ */}
      <Card className="border-border/80 bg-surface shadow-soft">
        <CardHeader className="border-b border-border/60 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg flex flex-wrap items-center gap-2">
                  Cấu hình Cột trước khi đổ data (Web → Sheet Backup)
                  {updatedAt && (
                    <Badge variant="neutral" size="sm">
                      Cập nhật: {new Date(updatedAt).toLocaleString('vi-VN')}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-0.5">
                  Chọn cột nào được ghi ra Sheet, ghi vào vị trí cột nào, và tiêu đề tham chiếu trên Sheet. Hệ thống
                  chỉ ghi các cột đang <strong>BẬT</strong>.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-primary" />}
              {!loading && isDirty && (
                <Badge variant="warning" size="sm">
                  Chưa lưu thay đổi
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetProgram}
                disabled={!isAdmin || loading || resetting}
                isLoading={resetting}
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Khôi phục mặc định {activeProgram}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveColumnConfig}
                disabled={!isAdmin || loading || !isDirty}
                isLoading={savingColumns}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Lưu cấu hình cột
              </Button>
            </div>
          </div>

          {/* Program selector */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROGRAM_TABS.map((p) => {
              const selected = activeProgram === p.value;
              const cfg = columnConfig?.[p.value];
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    setActiveProgram(p.value);
                    setSearch('');
                    setGroupFilter(GROUP_ALL);
                  }}
                  className={`text-left p-3.5 rounded-xl border transition-all ${
                    selected
                      ? 'border-emerald-500 bg-emerald-50/70 shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UserCog
                      className={`w-4 h-4 shrink-0 ${selected ? 'text-emerald-700' : 'text-slate-400'}`}
                    />
                    <span
                      className={`text-sm font-bold ${selected ? 'text-emerald-900' : 'text-text-primary'}`}
                    >
                      {p.title}
                    </span>
                    {selected && <CheckCircle2 className="w-4 h-4 text-emerald-600 ml-auto" />}
                  </div>
                  <div className="mt-1 text-[11px] font-mono text-slate-600">{p.fileName}</div>
                  <div className="mt-1 text-[11px] text-text-muted leading-relaxed">
                    {p.sheets}
                    {cfg && (
                      <span className="ml-1 font-semibold text-slate-600">
                        ({cfg.profile.columns.length} + {cfg.attendance.columns.length} cột)
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sheet sub-tabs */}
          <div className="mt-4 flex flex-wrap gap-2">
            {(['profile', 'attendance'] as SheetKind[]).map((kind) => {
              const selected = activeKind === kind;
              const cfg = columnConfig?.[activeProgram]?.[kind];
              const on = cfg?.columns.filter((c) => c.enabled).length ?? 0;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    setActiveKind(kind);
                    setSearch('');
                    setGroupFilter(GROUP_ALL);
                  }}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border ${
                    selected
                      ? 'bg-primary text-white border-primary shadow-xs'
                      : 'bg-surface-muted text-text-secondary border-border/60 hover:bg-slate-200/70'
                  }`}
                >
                  {kind === 'attendance' ? (
                    <CalendarCheck className="w-3.5 h-3.5" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                  {SHEET_TAB_LABELS[activeProgram][kind]}
                  {cfg && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                        selected ? 'bg-white/20 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {on}/{cfg.columns.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center text-text-muted gap-2 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              <span>Đang tải cấu hình cột Web → Sheet Backup...</span>
            </div>
          ) : !sheetCfg ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span>Chưa nhận được cấu hình cột từ server. Bấm thử lại hoặc kiểm tra endpoint</span>
              <code className="font-mono text-[11px]">GET /imports/sheet-backup/column-config</code>
              <Button variant="outline" size="sm" onClick={fetchAll}>
                Tải lại
              </Button>
            </div>
          ) : (
            <>
              {/* Sheet meta row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                    Tên Sheet mặc định
                  </label>
                  <input
                    type="text"
                    value={sheetCfg.defaultSheetName}
                    disabled={!isAdmin}
                    onChange={(e) => setSheetName(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-slate-100 disabled:text-slate-500"
                    placeholder="VD: 1.Chăm sóc"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                    Dòng tiêu đề (headerRow)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    step={1}
                    value={sheetCfg.headerRow}
                    disabled={!isAdmin}
                    onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                    Dòng bắt đầu đổ data
                  </label>
                  <div className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold bg-white/60 text-emerald-700">
                    firstDataRow = {sheetCfg.headerRow + 1}
                  </div>
                </div>
              </div>

              {/* Attendance month note */}
              {activeKind === 'attendance' && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 text-blue-900 text-xs flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    Các cột bên trên là <strong>vùng cột cố định</strong>. Các block tháng (6 cột tổng kết{' '}
                    <strong>Số buổi đã học / A / B / C / D / E</strong> + các cột ngày <strong>01..31</strong> của từng
                    tháng) được hệ thống <strong>tự động nhận diện từ dòng tiêu đề của Sheet</strong>.
                  </div>
                </div>
              )}

              {/* Quick toolbar */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-1">
                <div className="relative flex-1 min-w-[180px]">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm theo tên cột, fieldKey, nhóm hoặc chữ cái cột (VD: AE)..."
                    className="w-full h-9 pl-9 pr-3 border border-border rounded-xl text-xs bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>

                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="h-9 px-3 border border-border rounded-xl text-xs bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value={GROUP_ALL}>Tất cả nhóm</option>
                  {groupOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAllEnabled(true)}
                    disabled={!isAdmin}
                    leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  >
                    Bật tất cả
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAllEnabled(false, true)}
                    disabled={!isAdmin}
                    title="Tắt toàn bộ cột không có dữ liệu từ Web (chỉ giữ cột Khóa dòng và cột có nguồn dữ liệu)"
                  >
                    Tắt các cột không bắt buộc
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={restoreSheetDefaults}
                    disabled={!isAdmin}
                    leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                    title="Đưa tất cả cột về đúng vị trí cột mặc định của Sheet"
                  >
                    về vị trí mặc định
                  </Button>
                </div>
              </div>

              {conflictCount > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Cảnh báo: đang có <strong>{conflictCount}</strong> vị trí cột bị trùng giữa các cột đang BẬT ở{' '}
                    <strong>{SHEET_TAB_LABELS[activeProgram][activeKind]}</strong>. Vui lòng đổi vị trí trước khi lưu.
                  </span>
                </div>
              )}

              {/* Column table */}
              <div className="border border-border/80 rounded-xl overflow-hidden">
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-50 border-b border-border">
                      <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                        <th className="px-3 py-2.5 w-[110px]">Trạng thái</th>
                        <th className="px-3 py-2.5 w-[190px]">Vị trí cột Excel</th>
                        <th className="px-3 py-2.5">Tiêu đề cột trên Sheet</th>
                        <th className="px-3 py-2.5 w-[340px]">Trường dữ liệu Web &amp; Nhóm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleColumns.map((c) => {
                        const locked = Boolean(c.isKey);
                        const conflict = c.enabled && duplicateCols.has(c.col);
                        return (
                          <tr
                            key={c.fieldKey}
                            className={`border-b border-slate-100 last:border-b-0 align-top ${
                              c.enabled ? 'bg-white' : 'bg-slate-50/60'
                            } ${conflict ? 'bg-rose-50/60' : ''}`}
                          >
                            <td className="px-3 py-2.5">
                              <label
                                className={`inline-flex items-center gap-2 ${
                                  locked ? 'cursor-not-allowed' : isAdmin ? 'cursor-pointer' : 'cursor-not-allowed'
                                }`}
                                title={locked ? 'Cột này là khóa dòng, luôn bật và không thể tắt' : undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={locked ? true : c.enabled}
                                  disabled={!isAdmin || locked}
                                  onChange={(e) =>
                                    patchColumn(activeProgram, activeKind, c.fieldKey, {
                                      enabled: e.target.checked,
                                    })
                                  }
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-60"
                                />
                                {locked ? (
                                  <Badge variant="accent" size="sm">
                                    Khóa dòng
                                  </Badge>
                                ) : (
                                  <span className={`text-[11px] ${c.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    {c.enabled ? 'Đang ghi' : 'Không ghi'}
                                  </span>
                                )}
                              </label>
                            </td>

                            <td className="px-3 py-2.5">
                              <ColInputCell
                                col={c.col}
                                defaultCol={c.defaultCol}
                                disabled={!isAdmin}
                                hasConflict={conflict}
                                onChange={(next) => patchColumn(activeProgram, activeKind, c.fieldKey, { col: next })}
                              />
                            </td>

                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                value={c.title}
                                disabled={!isAdmin}
                                onChange={(e) =>
                                  patchColumn(activeProgram, activeKind, c.fieldKey, { title: e.target.value })
                                }
                                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-slate-50 disabled:text-slate-500"
                                placeholder="Tiêu đề cột hiển thị trên Sheet"
                              />
                              <div className="mt-1 text-[10px] text-text-muted">
                                Thứ tự: {c.col} · Chữ cái:{' '}
                                <code className="font-mono font-bold text-slate-600">
                                  {c.colLetter || colNumberToLetter(c.col)}
                                </code>
                              </div>
                            </td>

                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <code className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[11px] font-bold text-slate-700">
                                  {c.fieldKey}
                                </code>
                                <Badge variant="neutral" size="sm">
                                  {c.group || 'Chưa phân nhóm'}
                                </Badge>
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {c.isFormulaPreserved && (
                                  <Badge variant="info" size="sm">
                                    Giữ công thức Excel
                                  </Badge>
                                )}
                                {!c.hasDbSource && (
                                  <Badge variant="warning" size="sm">
                                    Giữ nguyên nếu Web trống
                                  </Badge>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {visibleColumns.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-xs text-text-muted">
                            Không có cột nào khớp bộ lọc tìm kiếm / nhóm hiện tại.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2 bg-slate-50 border-t border-border text-[11px] text-text-muted flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Đang hiển thị <strong>{visibleColumns.length}</strong> / {sheetCfg.columns.length} cột · Tổng cột
                    BẬT: <strong>{enabledCount}</strong>
                  </span>
                  {!isAdmin && <span>Chỉ tài khoản ADMIN được phép chỉnh sửa cấu hình cột.</span>}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SheetBackupAdminConfigCard;
