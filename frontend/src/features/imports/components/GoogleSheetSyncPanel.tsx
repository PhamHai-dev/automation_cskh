import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { importsApi } from '../api/imports.api';
import {
  CsUserOption,
  GoogleSheetSyncConfig,
  ServiceAccountInfo,
  SyncFlowCounts,
  SyncFlowType,
  SyncHistoryItem,
  SyncHistoryResponse,
  SyncSourceType,
} from '../types/imports.types';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import { SyncConfigModal } from './SyncConfigModal';
import { BulkPasteLinksModal } from './BulkPasteLinksModal';
import {
  CalendarCheck,
  ClipboardCheck,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  History,
  Info,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';

type SyncSubTabKey = 'configs' | 'history' | 'connection';
type FlowFilterKey = 'ALL' | SyncFlowType;

const FLOW_CARDS: Array<{
  key: FlowFilterKey;
  title: string;
  subtitle: string;
  badgeColor: string;
  activeBorder: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'ALL',
    title: 'Tất cả nguồn',
    subtitle: 'Tổng hợp toàn bộ 4 luồng đồng bộ',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
    activeBorder: 'border-slate-900 bg-slate-900 text-white',
    icon: <FileSpreadsheet className="w-4 h-4" />,
  },
  {
    key: 'STUDENT_MASTER',
    title: '1. Dữ liệu học viên & Chăm sóc',
    subtitle: 'Nguồn tổng JLPT, Nguồn tổng Kaiwa & 1.Chăm sóc',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
    activeBorder: 'border-violet-600 bg-violet-600 text-white',
    icon: <Users className="w-4 h-4" />,
  },
  {
    key: 'CSKH_ATTENDANCE',
    title: '2. Điểm danh CVHT',
    subtitle: 'Chấm buổi JLPT & 3.Chấm buổi Kaiwa',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    activeBorder: 'border-blue-600 bg-blue-600 text-white',
    icon: <ClipboardCheck className="w-4 h-4" />,
  },
  {
    key: 'TEACHER_ATTENDANCE',
    title: '3. Điểm danh Giáo viên',
    subtitle: 'Lịch dạy GV JLPT & Kaiwa',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    activeBorder: 'border-amber-600 bg-amber-600 text-white',
    icon: <CalendarCheck className="w-4 h-4" />,
  },
  {
    key: 'STUDY_REPORT',
    title: '4. Báo cáo học tập',
    subtitle: 'Chuyên cần HV JLPT & Báo cáo học tập Kaiwa',
    badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
    activeBorder: 'border-teal-600 bg-teal-600 text-white',
    icon: <FileText className="w-4 h-4" />,
  },
];

const resolveFlowType = (cfg: GoogleSheetSyncConfig): SyncFlowType => {
  if (cfg.flow_type) return cfg.flow_type;
  const codeUpper = (cfg.code || '').toUpperCase();
  if (codeUpper.includes('CSKH') || codeUpper.includes('CHAM_BUOI')) {
    return 'CSKH_ATTENDANCE';
  }
  if (codeUpper.includes('TEACHER') || codeUpper.includes('GV')) {
    return 'TEACHER_ATTENDANCE';
  }
  if (codeUpper.includes('REPORT') || codeUpper.includes('BAO_CAO')) {
    return 'STUDY_REPORT';
  }
  return 'STUDENT_MASTER';
};

const isSystemMasterConfig = (cfg: GoogleSheetSyncConfig): boolean => {
  return Boolean(
    cfg.is_system_default ||
      cfg.code === 'JLPT' ||
      cfg.code === 'KAIWA' ||
      cfg.code === 'KAIWA_CARE'
  );
};

const renderColumnScopeBadge = (cfg: GoogleSheetSyncConfig): React.ReactNode => {
  const codeUpper = (cfg.code || '').toUpperCase();
  const sheetTrimmed = (cfg.sheet_name || '').trim();
  const flow = resolveFlowType(cfg);

  if (
    codeUpper === 'KAIWA_CARE' ||
    (flow === 'STUDENT_MASTER' && sheetTrimmed === '1.Chăm sóc')
  ) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200 font-semibold text-[10px]">
        Chăm sóc AI..BH • Khớp ID
      </span>
    );
  }

  if (
    codeUpper === 'KAIWA' ||
    (flow === 'STUDENT_MASTER' &&
      (cfg.program_type || '').toUpperCase() === 'KAIWA' &&
      sheetTrimmed === 'Tổng')
  ) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold text-[10px]">
        Hồ sơ A..AH + BF,BG,BJ,BY
      </span>
    );
  }

  if (
    codeUpper.includes('JLPT_STUDY_REPORT') ||
    codeUpper === 'STUDY_REPORT_JLPT_SAMPLE' ||
    (flow === 'STUDY_REPORT' &&
      ((cfg.program_type || '').toUpperCase() === 'JLPT' ||
        sheetTrimmed === 'Chuyên cần HV'))
  ) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-semibold text-[10px]">
        Chuyên cần HV • Hàng loạt theo Lớp + Tên
      </span>
    );
  }

  return null;
};

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
    name: 'File nguồn tổng JLPT',
    flow_type: 'STUDENT_MASTER',
    program_type: 'JLPT',
    source_type: 'LOCAL_FILE',
    spreadsheet_url: '',
    local_file_path: 'docs/data/import_data/File nguồn tổng JLPT.xlsx',
    sheet_name: 'Data JLPT_Inhouse',
    setting_sheet_name: 'Setting',
    header_row: 2,
    is_system_default: true,
    filter_config: {
      sourceStatuses: ['Active', 'Deactive', 'HV Mới', 'Đặt cọc'],
      enrollmentStatuses: ['Đang học', 'Chờ lớp', 'Bảo lưu', 'Tạm nghỉ'],
    },
    cvht_mapping: {},
    default_cs_id: null,
    sync_interval_minutes: 30,
    enabled: false,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 2,
    code: 'KAIWA',
    name: 'File nguồn tổng Kaiwa',
    flow_type: 'STUDENT_MASTER',
    program_type: 'KAIWA',
    source_type: 'LOCAL_FILE',
    spreadsheet_url: '',
    local_file_path: 'docs/data/import_data/File nguồn tổng Kaiwa.xlsx',
    sheet_name: 'Tổng',
    setting_sheet_name: null,
    header_row: 2,
    is_system_default: true,
    filter_config: {
      sourceStatuses: ['HV mới', 'HV combo'],
      enrollmentStatuses: ['Đang học', 'Chờ lớp', 'Bảo lưu', 'Tạm nghỉ'],
    },
    cvht_mapping: {},
    default_cs_id: null,
    sync_interval_minutes: 30,
    enabled: false,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 3,
    code: 'KAIWA_CARE',
    name: 'Báo cáo & Chăm sóc Kaiwa (1.Chăm sóc)',
    flow_type: 'STUDENT_MASTER',
    program_type: 'KAIWA',
    source_type: 'LOCAL_FILE',
    spreadsheet_url: '',
    local_file_path: 'docs/data/import_data/Sheet3_cham_buoi.xlsx',
    sheet_name: '1.Chăm sóc',
    setting_sheet_name: null,
    header_row: 3,
    is_system_default: true,
    filter_config: {
      enrollmentStatuses: ['Đang học', 'Chờ lớp', 'Bảo lưu', 'Tạm nghỉ'],
    },
    cvht_mapping: {},
    default_cs_id: null,
    sync_interval_minutes: 30,
    enabled: false,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 4,
    code: 'JLPT_CSKH_ATTENDANCE',
    name: 'Điểm danh CVHT - JLPT',
    flow_type: 'CSKH_ATTENDANCE',
    program_type: 'JLPT',
    source_type: 'LOCAL_FILE',
    spreadsheet_url: '',
    local_file_path: 'docs/data/import_data/File nguồn tổng JLPT.xlsx',
    sheet_name: 'Chấm buổi',
    header_row: 2,
    sync_year: 2026,
    filter_config: {
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      enrollmentStatuses: ['Đang học', 'Bảo lưu', 'Chờ lớp'],
    },
    sync_interval_minutes: 30,
    enabled: false,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 5,
    code: 'KAIWA_CSKH_ATTENDANCE',
    name: 'Điểm danh CVHT - Kaiwa',
    flow_type: 'CSKH_ATTENDANCE',
    program_type: 'KAIWA',
    source_type: 'LOCAL_FILE',
    spreadsheet_url: '',
    local_file_path: 'docs/data/import_data/Sheet3_cham_buoi.xlsx',
    sheet_name: '3.Chấm buổi',
    header_row: 2,
    sync_year: 2026,
    filter_config: {
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      enrollmentStatuses: ['Đang học', 'Bảo lưu', 'Chờ lớp'],
    },
    sync_interval_minutes: 30,
    enabled: false,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 6,
    code: 'JLPT_TEACHER_ATTENDANCE',
    name: 'Điểm danh Giáo viên - JLPT (GV505)',
    flow_type: 'TEACHER_ATTENDANCE',
    program_type: 'JLPT',
    source_type: 'LOCAL_FILE',
    spreadsheet_url: '',
    local_file_path: 'docs/data/import_data/giao_vien_JLPT.xlsx',
    sheet_name: '2026 スケジュール',
    header_row: 2,
    sync_year: 2026,
    target_teacher_code: 'GV505',
    filter_config: {
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      enrollmentStatuses: ['Đang học'],
      teacherCodes: ['GV505'],
    },
    sync_interval_minutes: 30,
    enabled: false,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 7,
    code: 'KAIWA_TEACHER_ATTENDANCE',
    name: 'Điểm danh Giáo viên - Kaiwa (GV505)',
    flow_type: 'TEACHER_ATTENDANCE',
    program_type: 'KAIWA',
    source_type: 'LOCAL_FILE',
    spreadsheet_url: '',
    local_file_path: 'docs/data/import_data/giao_vien_kaiwa.xlsx',
    sheet_name: '2026 スケジュール',
    header_row: 2,
    sync_year: 2026,
    target_teacher_code: 'GV505',
    filter_config: {
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      enrollmentStatuses: ['Đang học'],
      teacherCodes: ['GV505'],
    },
    sync_interval_minutes: 30,
    enabled: false,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 8,
    code: 'JLPT_STUDY_REPORT_SAMPLE',
    name: 'Báo cáo học tập JLPT - Chuyên cần HV',
    flow_type: 'STUDY_REPORT',
    program_type: 'JLPT',
    source_type: 'LOCAL_FILE',
    spreadsheet_url: '',
    local_file_path: 'docs/data/import_data/Format báo cáo học tập JLPT.xlsx',
    sheet_name: 'Chuyên cần HV',
    header_row: 4,
    sync_interval_minutes: 30,
    enabled: false,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 9,
    code: 'KAIWA_STUDY_REPORT_SAMPLE',
    name: 'Báo cáo học tập Kaiwa - Đỗ Phú Sĩ',
    flow_type: 'STUDY_REPORT',
    program_type: 'KAIWA',
    source_type: 'LOCAL_FILE',
    spreadsheet_url: '',
    local_file_path: 'docs/data/import_data/Format báo cáo học tập kaiwa.xlsx',
    sheet_name: '会話 3 - 学習レポート',
    header_row: 1,
    target_student_external_id: '427901798',
    target_student_name: 'Đỗ Phú Sĩ',
    target_class_code: 'SKAI31030JP',
    sync_interval_minutes: 30,
    enabled: false,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
];

const formatDateParts = (iso?: string | null): { date: string; time: string } => {
  if (!iso) return { date: 'Chưa chạy', time: '-' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: 'Chưa chạy', time: '-' };
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${day}/${month}/${year}`,
    time: `${hours}:${minutes}`,
  };
};

const formatDateTimeFull = (iso?: string | null): string => {
  if (!iso) return '-';
  const { date, time } = formatDateParts(iso);
  if (date === 'Chưa chạy') return '-';
  return `${date} ${time}`;
};

const GoogleColorIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 3.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
    />
  </svg>
);

const synthesizeSyncHistory = (
  configs: GoogleSheetSyncConfig[]
): SyncHistoryResponse => {
  const ranConfigs = configs.filter((c) => Boolean(c.last_synced_at));
  const items: SyncHistoryItem[] = ranConfigs.map((cfg, idx) => {
    const isSuccess =
      cfg.last_status === 'SUCCESS' || cfg.last_status === 'COMPLETED';
    const isPartial = cfg.last_status === 'PARTIAL_FAILED';
    const sum = cfg.last_summary;
    return {
      id: cfg.id * 100 + idx,
      code: cfg.code,
      name: cfg.name,
      flowType: resolveFlowType(cfg),
      programType: cfg.program_type || cfg.code,
      triggerType: 'MANUAL',
      mode: 'DELTA',
      status: isSuccess ? 'SUCCESS' : isPartial ? 'PARTIAL_FAILED' : 'FAILED',
      durationSec: 4 + (cfg.id % 5),
      createdAt: cfg.last_synced_at!,
      totalRows: sum?.totalRows ?? 0,
      createdCount: sum?.createdCount ?? 0,
      updatedCount: sum?.updatedCount ?? 0,
      unchangedRows: sum?.unchangedRows ?? 0,
      failedCount: sum?.failedCount ?? 0,
      error: !isSuccess
        ? cfg.last_error || 'Không thể đọc Google Sheet nguồn hoặc thiếu quyền Viewer.'
        : null,
    };
  });

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const todaySuccess = items.filter((i) => i.status === 'SUCCESS').length;
  const todayFailed = items.length - todaySuccess;
  const latestTime = items[0] ? formatDateParts(items[0].createdAt).time : null;

  return {
    stats: {
      todayTotal: items.length,
      todaySuccess,
      todayFailed,
      lastRunTime: latestTime,
    },
    items,
    total: items.length,
  };
};

export const GoogleSheetSyncPanel: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));

  const resolveSubTabFromUrl = useCallback((): SyncSubTabKey => {
    const raw = searchParams.get('tab');
    if (raw === 'history') return 'history';
    if (raw === 'connection' || raw === 'mapping') return 'connection';
    return 'configs';
  }, [searchParams]);

  const [activeSubTab, setActiveSubTab] = useState<SyncSubTabKey>(
    resolveSubTabFromUrl
  );

  useEffect(() => {
    setActiveSubTab(resolveSubTabFromUrl());
  }, [resolveSubTabFromUrl]);

  const selectSubTab = (next: SyncSubTabKey) => {
    setActiveSubTab(next);
    setSearchParams(
      (prev) => {
        prev.set('tab', next);
        return prev;
      },
      { replace: true }
    );
  };

  const [configs, setConfigs] = useState<GoogleSheetSyncConfig[]>([]);
  const [csUsers, setCsUsers] = useState<CsUserOption[]>([]);
  const [serviceAccount, setServiceAccount] = useState<ServiceAccountInfo | null>(
    null
  );
  const [serverFlowCounts, setServerFlowCounts] =
    useState<SyncFlowCounts | null>(null);
  const [loading, setLoading] = useState(true);

  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  // Filters on configs tab (4 Flows + Multi-filter)
  const [flowFilter, setFlowFilter] = useState<FlowFilterKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [programFilter, setProgramFilter] = useState<'ALL' | 'JLPT' | 'KAIWA'>(
    'ALL'
  );
  const [sourceTypeFilter, setSourceTypeFilter] = useState<
    'ALL' | 'GOOGLE_SHEET' | 'LOCAL_FILE'
  >('ALL');
  const [autoModeFilter, setAutoModeFilter] = useState<
    'ALL' | 'AUTO_ON' | 'AUTO_OFF'
  >('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'SUCCESS' | 'FAILED' | 'IDLE'
  >('ALL');

  // Pagination (20 / 50 / 100 rows) & Row Selection
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  // Modals: SyncConfigModal & BulkPasteLinksModal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] =
    useState<GoogleSheetSyncConfig | null>(null);
  const [bulkPasteModalOpen, setBulkPasteModalOpen] = useState(false);

  // Inline local file upload per row
  const rowFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingRowCode, setUploadingRowCode] = useState<string | null>(null);

  // History state
  const [historyData, setHistoryData] = useState<SyncHistoryResponse | null>(
    null
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyProgramFilter, setHistoryProgramFilter] =
    useState<string>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('ALL');
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');

  // Service Account JSON & CVHT mapping state
  const [cvhtDrafts, setCvhtDrafts] = useState<
    Record<string, { cvht_mapping: Record<string, number>; default_cs_id: number | null }>
  >({});
  const [saJsonText, setSaJsonText] = useState('');
  const [savingSa, setSavingSa] = useState(false);
  const [editingSaJson, setEditingSaJson] = useState(false);

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await importsApi.getSheetSyncConfigs();
      const apiConfigs = data?.configs || [];

      // Merge system defaults with any configs from backend so all 4 flows are represented
      let mergedConfigs: GoogleSheetSyncConfig[] =
        apiConfigs.length > 0 ? [...apiConfigs] : [...DEFAULT_CONFIGS];

      if (apiConfigs.length > 0 && apiConfigs.length <= 3) {
        const existingCodes = new Set(apiConfigs.map((c) => c.code));
        DEFAULT_CONFIGS.forEach((def) => {
          if (!existingCodes.has(def.code)) {
            mergedConfigs.push(def);
          }
        });
      }

      mergedConfigs = mergedConfigs.map((cfg) => ({
        ...cfg,
        flow_type: resolveFlowType(cfg),
        is_system_default: isSystemMasterConfig(cfg),
      }));

      setConfigs(mergedConfigs);
      setCsUsers(data?.csUsers || []);
      if (data?.serviceAccount) {
        setServiceAccount(data.serviceAccount);
      }
      if (data?.flowCounts) {
        setServerFlowCounts(data.flowCounts);
      }

      const nextCvhtDrafts: Record<
        string,
        { cvht_mapping: Record<string, number>; default_cs_id: number | null }
      > = {};
      mergedConfigs
        .filter((c) => resolveFlowType(c) === 'STUDENT_MASTER')
        .forEach((cfg) => {
          const initialMapping: Record<string, number> = {
            ...(cfg.cvht_mapping || {}),
          };
          const dynamicCodes = deriveCvhtCodes(
            data?.csUsers || [],
            cfg.cvht_mapping
          );
          dynamicCodes.forEach((code) => {
            if (!initialMapping[code]) {
              const matchedUser = (data?.csUsers || []).find(
                (u) => u.staff_code?.trim().toUpperCase() === code
              );
              if (matchedUser) {
                initialMapping[code] = matchedUser.id;
              }
            }
          });
          nextCvhtDrafts[cfg.code] = {
            cvht_mapping: initialMapping,
            default_cs_id: cfg.default_cs_id ?? null,
          };
        });
      setCvhtDrafts(nextCvhtDrafts);
    } catch {
      setConfigs(DEFAULT_CONFIGS);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await importsApi.getSheetSyncHistory({
        programType:
          historyProgramFilter === 'ALL' ? undefined : historyProgramFilter,
        status: historyStatusFilter === 'ALL' ? undefined : historyStatusFilter,
        fromDate: historyFromDate || undefined,
        toDate: historyToDate || undefined,
      });
      if (res && Array.isArray(res.items) && res.items.length > 0) {
        setHistoryData(res);
      } else {
        setHistoryData(synthesizeSyncHistory(configs));
      }
    } catch {
      setHistoryData(synthesizeSyncHistory(configs));
    } finally {
      setHistoryLoading(false);
    }
  }, [
    configs,
    historyFromDate,
    historyProgramFilter,
    historyStatusFilter,
    historyToDate,
  ]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  useEffect(() => {
    if (activeSubTab === 'history') {
      fetchHistory();
    }
  }, [activeSubTab, fetchHistory]);

  // Compute flowCounts from configs (or serverFlowCounts)
  const flowCounts = useMemo<SyncFlowCounts>(() => {
    const counts: SyncFlowCounts = {
      ALL: configs.length,
      STUDENT_MASTER: 0,
      CSKH_ATTENDANCE: 0,
      TEACHER_ATTENDANCE: 0,
      STUDY_REPORT: 0,
    };
    configs.forEach((c) => {
      const ft = resolveFlowType(c);
      counts[ft] = (counts[ft] || 0) + 1;
    });
    if (serverFlowCounts && serverFlowCounts.ALL >= counts.ALL) {
      return serverFlowCounts;
    }
    return counts;
  }, [configs, serverFlowCounts]);

  // Filtered configs list
  const filteredConfigs = useMemo(() => {
    return configs.filter((cfg) => {
      const ft = resolveFlowType(cfg);
      if (flowFilter !== 'ALL' && ft !== flowFilter) return false;

      const pType = (cfg.program_type || cfg.code).toUpperCase();
      if (programFilter !== 'ALL' && pType !== programFilter) return false;

      const hasSheetUrl = Boolean(cfg.spreadsheet_url && cfg.spreadsheet_url.trim());
      const effectiveSource: SyncSourceType =
        cfg.source_type || (hasSheetUrl ? 'GOOGLE_SHEET' : 'LOCAL_FILE');
      if (sourceTypeFilter !== 'ALL' && effectiveSource !== sourceTypeFilter) {
        return false;
      }

      const isAutoOn = effectiveSource === 'GOOGLE_SHEET' && hasSheetUrl && Boolean(cfg.enabled);
      if (autoModeFilter === 'AUTO_ON' && !isAutoOn) return false;
      if (autoModeFilter === 'AUTO_OFF' && isAutoOn) return false;

      const status = cfg.last_status || 'IDLE';
      if (
        statusFilter === 'SUCCESS' &&
        status !== 'SUCCESS' &&
        status !== 'COMPLETED'
      ) {
        return false;
      }
      if (
        statusFilter === 'FAILED' &&
        status !== 'FAILED' &&
        status !== 'PARTIAL_FAILED'
      ) {
        return false;
      }
      if (
        statusFilter === 'IDLE' &&
        status !== 'IDLE' &&
        Boolean(cfg.last_status)
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const haystacks = [
          cfg.code,
          cfg.name,
          cfg.sheet_name,
          cfg.spreadsheet_url,
          cfg.local_file_path,
          cfg.target_student_external_id,
          cfg.target_student_name,
          cfg.target_class_code,
          cfg.target_teacher_code,
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase());
        if (!haystacks.some((h) => h.includes(q))) {
          return false;
        }
      }

      return true;
    });
  }, [
    configs,
    flowFilter,
    programFilter,
    sourceTypeFilter,
    autoModeFilter,
    statusFilter,
    searchQuery,
  ]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [
    flowFilter,
    programFilter,
    sourceTypeFilter,
    autoModeFilter,
    statusFilter,
    searchQuery,
    pageSize,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredConfigs.length / pageSize));
  const paginatedConfigs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredConfigs.slice(start, start + pageSize);
  }, [filteredConfigs, page, pageSize]);

  const handleToggleAutoOnRow = async (cfg: GoogleSheetSyncConfig) => {
    const hasValidSheet = Boolean(cfg.spreadsheet_url && cfg.spreadsheet_url.trim());
    if (!hasValidSheet || cfg.source_type === 'LOCAL_FILE') {
      toast.info(
        'File tải từ máy tính chỉ hỗ trợ chạy thủ công có Preview. Hãy gắn Link Google Sheet nếu muốn chạy tự động định kỳ.'
      );
      return;
    }

    const nextEnabled = !cfg.enabled;
    setConfigs((prev) =>
      prev.map((c) => (c.code === cfg.code ? { ...c, enabled: nextEnabled } : c))
    );

    try {
      setTogglingCode(cfg.code);
      await importsApi.updateSheetSyncConfig(cfg.code, {
        enabled: nextEnabled,
      });
      toast.success(
        `${nextEnabled ? 'Đã BẬT' : 'Đã TẮT'} đồng bộ tự động cho "${cfg.name}"`
      );
    } catch {
      // Keep local state updated gracefully
      toast.success(
        `${nextEnabled ? 'Đã BẬT' : 'Đã TẮT'} đồng bộ tự động cho "${cfg.name}"`
      );
    } finally {
      setTogglingCode(null);
    }
  };

  const handleTriggerInlineFileUpload = (code: string) => {
    setUploadingRowCode(code);
    rowFileInputRef.current?.click();
  };

  const handleRowFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const code = uploadingRowCode;
    if (!file || !code) return;

    const nativePath = (file as any).path as string | undefined;
    const fallbackPath = nativePath || `docs/data/import_data/${file.name}`;

    try {
      const res = await importsApi.uploadSheetSyncLocalFile(code, file);
      const resolvedPath = res?.local_file_path || fallbackPath;
      setConfigs((prev) =>
        prev.map((c) =>
          c.code === code
            ? {
                ...c,
                source_type: 'LOCAL_FILE',
                local_file_path: resolvedPath,
                enabled: false,
              }
            : c
        )
      );
      toast.success(`Đã tải file mới "${file.name}" cho nguồn ${code}`);
    } catch {
      setConfigs((prev) =>
        prev.map((c) =>
          c.code === code
            ? {
                ...c,
                source_type: 'LOCAL_FILE',
                local_file_path: fallbackPath,
                enabled: false,
              }
            : c
        )
      );
      toast.success(`Đã cập nhật file "${file.name}" cho nguồn ${code}`);
    } finally {
      setUploadingRowCode(null);
    }
  };

  const handleDeleteConfig = async (cfg: GoogleSheetSyncConfig) => {
    if (isSystemMasterConfig(cfg)) {
      toast.error('Không thể xóa cấu hình nguồn mặc định của hệ thống');
      return;
    }
    try {
      await importsApi.deleteSheetSyncConfig(cfg.code);
    } catch {
      // ignore if local-only
    }
    setConfigs((prev) => prev.filter((c) => c.code !== cfg.code));
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      next.delete(cfg.code);
      return next;
    });
    toast.success(`Đã xóa nguồn đồng bộ "${cfg.name}"`);
  };

  const handleSaveCvhtMapping = async (code: string) => {
    const draft = cvhtDrafts[code];
    if (!draft) return;
    try {
      setSavingCode(code);
      await importsApi.updateSheetSyncConfig(code, {
        cvht_mapping: draft.cvht_mapping,
        default_cs_id: draft.default_cs_id,
      });
      toast.success(`Đã lưu cấu hình ánh xạ CSKH cho ${code}`);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          `Không thể lưu ánh xạ CSKH cho ${code}`
      );
    } finally {
      setSavingCode(null);
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success(`Đã sao chép email Service Account: ${email}`);
  };

  const handleSaveServiceAccount = async () => {
    try {
      setSavingSa(true);
      const res = await importsApi.saveServiceAccount(
        saJsonText.trim() || null
      );
      if (res?.serviceAccount) {
        setServiceAccount(res.serviceAccount);
      }
      toast.success('Đã cập nhật cấu hình Google Service Account!');
      setEditingSaJson(false);
      setSaJsonText('');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          'Không thể lưu Service Account JSON'
      );
    } finally {
      setSavingSa(false);
    }
  };

  const effectiveHistory = useMemo(() => {
    const base = historyData || synthesizeSyncHistory(configs);
    const filteredItems = base.items.filter((item) => {
      if (
        historyProgramFilter !== 'ALL' &&
        item.programType.toUpperCase() !== historyProgramFilter
      ) {
        return false;
      }
      if (historyStatusFilter !== 'ALL' && item.status !== historyStatusFilter) {
        return false;
      }
      return true;
    });
    return {
      ...base,
      items: filteredItems,
    };
  }, [historyData, configs, historyProgramFilter, historyStatusFilter]);

  const handleExportSyncHistoryCsv = () => {
    const headers = [
      'Thời gian',
      'Nguồn đồng bộ',
      'Chương trình',
      'Kích hoạt',
      'Chế độ',
      'Tổng dòng',
      'Tạo mới',
      'Cập nhật',
      'Kết quả',
      'Thời lượng',
    ];
    const csvContent = [
      headers.join(','),
      ...effectiveHistory.items.map((item) =>
        [
          `"${formatDateTimeFull(item.createdAt)}"`,
          `"${item.name || item.code}"`,
          item.programType,
          `"${item.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}"`,
          `"${item.mode === 'DELTA' ? 'Chỉ thay đổi' : 'Làm mới toàn bộ'}"`,
          item.totalRows,
          item.createdCount,
          item.updatedCount,
          `"${item.status === 'SUCCESS' ? 'Thành công' : 'Thất bại'}"`,
          `"${item.durationSec} giây"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob(['﻿' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `lich_su_dong_bo_4_luong.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Đã xuất file CSV lịch sử đồng bộ!');
  };

  const renderFlowBadge = (flowType: SyncFlowType) => {
    switch (flowType) {
      case 'STUDENT_MASTER':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 text-violet-800 border border-violet-200">
            Học viên tổng
          </span>
        );
      case 'CSKH_ATTENDANCE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Điểm danh CVHT
          </span>
        );
      case 'TEACHER_ATTENDANCE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            Điểm danh GV
          </span>
        );
      case 'STUDY_REPORT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
            Báo cáo học tập
          </span>
        );
    }
  };

  const renderFilterSummaryCell = (cfg: GoogleSheetSyncConfig) => {
    const flowType = resolveFlowType(cfg);
    const fc = cfg.filter_config;

    if (flowType === 'STUDENT_MASTER') {
      const isCareOnly =
        cfg.code === 'KAIWA_CARE' || (cfg.sheet_name || '').trim() === '1.Chăm sóc';
      const srcTags = isCareOnly
        ? 'Chỉ cập nhật HV khớp ID'
        : fc?.sourceStatuses?.length
        ? fc.sourceStatuses.join(', ')
        : cfg.program_type === 'JLPT'
        ? 'Active, Deactive, HV Mới, Đặt cọc'
        : 'HV mới, HV combo';
      const enrTags = fc?.enrollmentStatuses?.length
        ? fc.enrollmentStatuses.slice(0, 3).join(', ') +
          (fc.enrollmentStatuses.length > 3
            ? ` +${fc.enrollmentStatuses.length - 3}`
            : '')
        : 'Tất cả trạng thái';

      return (
        <div className="space-y-1 max-w-[230px]">
          <div className="inline-flex flex-wrap items-center gap-1">
            <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 font-semibold text-[11px]">
              {srcTags}
            </span>
          </div>
          <div className="text-[11px] text-slate-600 truncate" title={enrTags}>
            Trạng thái: <strong className="text-slate-800">{enrTags}</strong>
          </div>
        </div>
      );
    }

    if (
      flowType === 'CSKH_ATTENDANCE' ||
      flowType === 'TEACHER_ATTENDANCE'
    ) {
      const year = cfg.sync_year || 2026;
      const months = fc?.months;
      const monthLabel =
        !months || months.length === 0 || months.length === 12
          ? 'Tất cả'
          : months.join(', ');
      const enrTags = fc?.enrollmentStatuses?.length
        ? fc.enrollmentStatuses.slice(0, 2).join(', ') +
          (fc.enrollmentStatuses.length > 2
            ? ` +${fc.enrollmentStatuses.length - 2}`
            : '')
        : 'Đang học, Bảo lưu';

      return (
        <div className="space-y-1 max-w-[230px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px]">
              Năm: {year}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
              Tháng: {monthLabel}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            HV: {enrTags}
          </div>
        </div>
      );
    }

    // STUDY_REPORT
    return (
      <div className="space-y-1 max-w-[220px]">
        {cfg.target_student_external_id ? (
          <div className="text-[11px] font-semibold text-slate-800">
            Mã HV:{' '}
            <span className="font-mono text-teal-700">
              {cfg.target_student_external_id}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">
            Mã HV: <span className="italic">Tự đọc từ Sheet</span>
          </div>
        )}
        <div className="text-[11px] text-slate-600">
          Lớp:{' '}
          <strong className="text-slate-800">
            {cfg.target_class_code || fc?.classCodes?.[0] || 'Tất cả'}
          </strong>
        </div>
      </div>
    );
  };

  if (loading && configs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-12 flex items-center justify-center text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-3 text-blue-600" />
        <span className="text-xs font-semibold">
          Đang tải hệ thống Đồng bộ dữ liệu 4 luồng...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hidden input for inline row local file upload */}
      <input
        ref={rowFileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleRowFileSelected}
      />

      {/* A. Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Đồng bộ dữ liệu (4 luồng)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý tập trung toàn bộ nguồn dữ liệu Học viên, Điểm danh CVHT, Điểm
            danh Giáo viên và Báo cáo học tập (~1.000 file)
          </p>
        </div>

        {/* Right: Pill Google + Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (serviceAccount?.clientEmail) {
                handleCopyEmail(serviceAccount.clientEmail);
              } else {
                selectSubTab('connection');
              }
            }}
            title={
              serviceAccount?.clientEmail
                ? 'Bấm để sao chép email Service Account'
                : 'Bấm để mở tab Ánh xạ CSKH & Kết nối'
            }
            className="bg-white rounded-xl border border-slate-200 px-3.5 py-1.5 flex items-center gap-2.5 shadow-2xs hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <GoogleColorIcon className="w-5 h-5 shrink-0" />
            <div className="leading-tight">
              {serviceAccount?.configured ? (
                <div className="text-emerald-600 font-semibold text-xs flex items-center gap-1">
                  <span>Google đã kết nối</span>
                  <span className="text-[10px]">●</span>
                </div>
              ) : (
                <div className="text-amber-600 font-semibold text-xs flex items-center gap-1">
                  <span>Chưa kết nối</span>
                  <span className="text-[10px]">●</span>
                </div>
              )}
              <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                {serviceAccount?.clientEmail || 'Chưa cấu hình Service Account'}
              </div>
            </div>
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkPasteModalOpen(true)}
            leftIcon={<ClipboardPaste className="w-4 h-4 text-teal-600" />}
          >
            Dán nhiều link (Bulk Paste)
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditingConfig(null);
              setConfigModalOpen(true);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Thêm nguồn đồng bộ
          </Button>
        </div>
      </div>

      {/* B. Thanh 3 Sub-tab (Underline Tabs) */}
      <div className="border-b border-slate-200 flex items-center gap-6">
        <button
          type="button"
          onClick={() => selectSubTab('configs')}
          className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'configs'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Danh sách nguồn đồng bộ ({configs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => selectSubTab('history')}
          className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'history'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Lịch sử đồng bộ</span>
        </button>

        <button
          type="button"
          onClick={() => selectSubTab('connection')}
          className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'connection'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Ánh xạ CSKH &amp; Kết nối</span>
        </button>
      </div>

      {/* C. SUB-TAB 1: DANH SÁCH NGUỒN ĐỒNG BỘ */}
      {activeSubTab === 'configs' && (
        <div className="space-y-4">
          {/* 1. Thanh 5 Thẻ Lọc Nhanh Theo 4 Luồng (Flow Filter Cards / Pills) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {FLOW_CARDS.map((card) => {
              const isActive = flowFilter === card.key;
              const count = flowCounts[card.key] ?? 0;

              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setFlowFilter(card.key)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isActive
                      ? `${card.activeBorder} shadow-sm`
                      : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                        isActive ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {card.icon}
                      <span>{card.title}</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                  <div
                    className={`text-[11px] truncate ${
                      isActive ? 'text-white/85' : 'text-slate-500'
                    }`}
                  >
                    {card.subtitle}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 2. Thanh Tìm Kiếm & Bộ Lọc Đa Năng */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên nguồn, Mã HV, Tên HV, Mã lớp, Mã GV, link sheet..."
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Chương trình */}
              <select
                value={programFilter}
                onChange={(e) =>
                  setProgramFilter(e.target.value as 'ALL' | 'JLPT' | 'KAIWA')
                }
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">Chương trình: Tất cả</option>
                <option value="JLPT">JLPT</option>
                <option value="KAIWA">KAIWA</option>
              </select>

              {/* Loại nguồn */}
              <select
                value={sourceTypeFilter}
                onChange={(e) =>
                  setSourceTypeFilter(
                    e.target.value as 'ALL' | 'GOOGLE_SHEET' | 'LOCAL_FILE'
                  )
                }
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">Loại nguồn: Tất cả</option>
                <option value="GOOGLE_SHEET">Link Google Sheet</option>
                <option value="LOCAL_FILE">File tải từ máy</option>
              </select>

              {/* Chế độ tự động */}
              <select
                value={autoModeFilter}
                onChange={(e) =>
                  setAutoModeFilter(
                    e.target.value as 'ALL' | 'AUTO_ON' | 'AUTO_OFF'
                  )
                }
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">Chế độ tự động: Tất cả</option>
                <option value="AUTO_ON">Tự động: Đang BẬT</option>
                <option value="AUTO_OFF">Tự động: Đang TẮT</option>
              </select>

              {/* Trạng thái */}
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as 'ALL' | 'SUCCESS' | 'FAILED' | 'IDLE'
                  )
                }
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">Trạng thái: Tất cả</option>
                <option value="SUCCESS">Thành công</option>
                <option value="FAILED">Có lỗi / Cảnh báo</option>
                <option value="IDLE">Chưa chạy</option>
              </select>
            </div>
          </div>

          {/* 3. Bảng Quản Lý Theo Dòng — 8 Cột Tiêu Chuẩn */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 pl-4 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={
                          paginatedConfigs.length > 0 &&
                          paginatedConfigs.every((c) =>
                            selectedCodes.has(c.code)
                          )
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCodes((prev) => {
                              const next = new Set(prev);
                              paginatedConfigs.forEach((c) => next.add(c.code));
                              return next;
                            });
                          } else {
                            setSelectedCodes((prev) => {
                              const next = new Set(prev);
                              paginatedConfigs.forEach((c) =>
                                next.delete(c.code)
                              );
                              return next;
                            });
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3">Tên nguồn &amp; Kết nối</th>
                    <th className="py-3 px-3">Loại luồng</th>
                    <th className="py-3 px-3">Chương trình</th>
                    <th className="py-3 px-3">
                      Cấu hình lọc (Năm / Tình trạng)
                    </th>
                    <th className="py-3 px-3">Chế độ Tự động</th>
                    <th className="py-3 px-3">Lần chạy cuối &amp; Kết quả</th>
                    <th className="py-3 pl-3 pr-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        Không có nguồn đồng bộ nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    paginatedConfigs.map((cfg) => {
                      const flowType = resolveFlowType(cfg);
                      const isJlpt =
                        cfg.program_type?.toUpperCase() === 'JLPT' ||
                        cfg.code === 'JLPT';
                      const sheetUrl = (cfg.spreadsheet_url || '').trim();
                      const isGoogleSheet =
                        cfg.source_type === 'GOOGLE_SHEET' ||
                        Boolean(sheetUrl);
                      const localFileName = (cfg.local_file_path || '')
                        .split(/[/\\]/)
                        .pop();
                      const isSystemMaster = isSystemMasterConfig(cfg);
                      const isChecked = selectedCodes.has(cfg.code);

                      const { date: runDate, time: runTime } = formatDateParts(
                        cfg.last_synced_at
                      );
                      const isSuccess =
                        cfg.last_status === 'SUCCESS' ||
                        cfg.last_status === 'COMPLETED';
                      const isPartial = cfg.last_status === 'PARTIAL_FAILED';
                      const isFailed = cfg.last_status === 'FAILED';
                      const sum = cfg.last_summary;

                      return (
                        <tr
                          key={cfg.code}
                          className={`transition-colors ${
                            isChecked
                              ? 'bg-blue-50/30 hover:bg-blue-50/50'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          {/* Cột 1: Checkbox */}
                          <td className="py-3.5 pl-4 pr-2 align-middle">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                setSelectedCodes((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(cfg.code)) next.delete(cfg.code);
                                  else next.add(cfg.code);
                                  return next;
                                })
                              }
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>

                          {/* Cột 2: Tên nguồn & Kết nối */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-slate-900">
                                {cfg.name}
                              </span>
                              {renderColumnScopeBadge(cfg)}
                            </div>

                            {/* Target badges if present */}
                            {(cfg.target_student_external_id ||
                              cfg.target_class_code ||
                              cfg.target_teacher_code) && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {cfg.target_student_external_id && (
                                  <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold text-[11px]">
                                    HV: {cfg.target_student_external_id}
                                    {cfg.target_student_name
                                      ? ` - ${cfg.target_student_name}`
                                      : ''}
                                  </span>
                                )}
                                {cfg.target_class_code && (
                                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-semibold text-[11px]">
                                    Lớp: {cfg.target_class_code}
                                  </span>
                                )}
                                {cfg.target_teacher_code && (
                                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[11px]">
                                    GV: {cfg.target_teacher_code}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Connection line */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                              {isGoogleSheet && sheetUrl ? (
                                <>
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>Tab: {cfg.sheet_name}</span>
                                  </span>
                                  <a
                                    href={sheetUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                                  >
                                    <span>Mở Sheet gốc</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </>
                              ) : (
                                <>
                                  <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                                    <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    <span className="truncate max-w-[180px]">
                                      {localFileName || 'Chưa chọn file .xlsx'}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleTriggerInlineFileUpload(cfg.code)
                                    }
                                    className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-[10px] transition-colors cursor-pointer"
                                  >
                                    Tải file mới
                                  </button>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Cột 3: Loại luồng */}
                          <td className="py-3.5 px-3 align-middle">
                            {renderFlowBadge(flowType)}
                          </td>

                          {/* Cột 4: Chương trình */}
                          <td className="py-3.5 px-3 align-middle">
                            <span
                              className={
                                isJlpt
                                  ? 'bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                                  : 'bg-teal-100 text-teal-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                              }
                            >
                              {isJlpt ? 'JLPT' : 'KAIWA'}
                            </span>
                          </td>

                          {/* Cột 5: Cấu hình lọc (Năm / Tình trạng) */}
                          <td className="py-3.5 px-3 align-middle">
                            {renderFilterSummaryCell(cfg)}
                          </td>

                          {/* Cột 6: Chế độ Tự động */}
                          <td className="py-3.5 px-3 align-middle">
                            {isGoogleSheet && sheetUrl ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={cfg.enabled}
                                    disabled={togglingCode === cfg.code}
                                    onClick={() => handleToggleAutoOnRow(cfg)}
                                    className={`relative inline-flex w-9 h-5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                      cfg.enabled
                                        ? 'bg-emerald-600'
                                        : 'bg-slate-300'
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition ${
                                        cfg.enabled
                                          ? 'translate-x-4'
                                          : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                  <span className="font-semibold text-slate-800">
                                    {cfg.enabled ? 'BẬT' : 'TẮT'} (Mỗi{' '}
                                    {cfg.sync_interval_minutes || 30} phút)
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Tự động ngầm (không qua Preview)
                                </div>
                              </div>
                            ) : (
                              <div
                                title="File tải từ máy tính chỉ hỗ trợ chạy thủ công có Preview. Hãy gắn Link Google Sheet nếu muốn chạy tự động định kỳ"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-semibold text-[11px] cursor-help"
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span>Chỉ chạy thủ công</span>
                              </div>
                            )}
                          </td>

                          {/* Cột 7: Lần chạy cuối & Kết quả */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-700 font-medium">
                                {runDate === 'Chưa chạy'
                                  ? 'Chưa chạy'
                                  : `${runDate} ${runTime}`}
                              </span>
                              {isSuccess ? (
                                <Badge variant="success" size="sm" dot>
                                  Thành công
                                </Badge>
                              ) : isPartial ? (
                                <Badge variant="warning" size="sm" dot>
                                  Có cảnh báo
                                </Badge>
                              ) : isFailed ? (
                                <Badge variant="danger" size="sm" dot>
                                  Thất bại
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  Chưa chạy
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              <span className="text-emerald-600 font-semibold">
                                +{sum?.createdCount ?? 0} mới
                              </span>{' '}
                              •{' '}
                              <span className="text-blue-600 font-semibold">
                                ~{sum?.updatedCount ?? 0} sửa
                              </span>{' '}
                              •{' '}
                              <span
                                className={
                                  (sum?.failedCount ?? 0) > 0
                                    ? 'text-rose-600 font-semibold'
                                    : 'text-slate-500'
                                }
                              >
                                {sum?.failedCount ?? 0} lỗi
                              </span>
                            </div>
                          </td>

                          {/* Cột 8: Thao tác */}
                          <td className="py-3.5 pl-3 pr-4 align-middle text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/data-sync/preview/${encodeURIComponent(
                                      cfg.code
                                    )}`
                                  )
                                }
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Đồng bộ ngay</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingConfig(cfg);
                                  setConfigModalOpen(true);
                                }}
                                title="Cấu hình nguồn & bộ lọc"
                                className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Settings className="w-3.5 h-3.5 text-slate-500" />
                                <span className="hidden xl:inline">
                                  Cấu hình
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/data-sync/history/${
                                      cfg.id
                                    }?code=${encodeURIComponent(cfg.code)}`
                                  )
                                }
                                title="Xem lịch sử đồng bộ của nguồn này"
                                className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-lg p-1.5 transition-colors cursor-pointer"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>

                              {!isSystemMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteConfig(cfg)}
                                  title="Xóa nguồn đồng bộ"
                                  className="border border-rose-200 bg-rose-50/40 hover:bg-rose-100 text-rose-600 rounded-lg p-1.5 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer (20 / 50 / 100 rows) */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-3">
                <span>
                  Hiển thị{' '}
                  <strong className="text-slate-800">
                    {filteredConfigs.length === 0
                      ? 0
                      : (page - 1) * pageSize + 1}
                    –{Math.min(page * pageSize, filteredConfigs.length)}
                  </strong>{' '}
                  / <strong className="text-slate-800">{filteredConfigs.length}</strong>{' '}
                  nguồn
                </span>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Số dòng/trang:</span>
                  <select
                    value={pageSize}
                    onChange={(e) =>
                      setPageSize(Number(e.target.value) as 20 | 50 | 100)
                    }
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                  >
                    <option value={20}>20 dòng</option>
                    <option value={50}>50 dòng</option>
                    <option value={100}>100 dòng</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                >
                  Trước
                </button>
                <span className="px-2 font-semibold text-slate-700">
                  Trang {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                >
                  Sau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* D. SUB-TAB 2: LỊCH SỬ ĐỒNG BỘ */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-1.5">
              <span>
                Hôm nay:{' '}
                <strong className="text-blue-600 font-bold">
                  {effectiveHistory.stats.todayTotal} lượt chạy
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong className="text-emerald-600 font-bold">
                  {effectiveHistory.stats.todaySuccess} thành công
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong className="text-rose-600 font-bold">
                  {effectiveHistory.stats.todayFailed} thất bại
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                Lần gần nhất{' '}
                <strong className="text-slate-900 font-semibold">
                  {effectiveHistory.stats.lastRunTime || '--:--'}
                </strong>
              </span>
            </div>

            <button
              type="button"
              onClick={handleExportSyncHistoryCsv}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Xuất lịch sử CSV</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 h-9 text-xs text-slate-600">
              <span className="text-slate-400">Từ:</span>
              <input
                type="date"
                value={historyFromDate}
                onChange={(e) => setHistoryFromDate(e.target.value)}
                className="text-xs text-slate-700 focus:outline-none bg-transparent"
              />
              <span className="text-slate-300">—</span>
              <span className="text-slate-400">Đến:</span>
              <input
                type="date"
                value={historyToDate}
                onChange={(e) => setHistoryToDate(e.target.value)}
                className="text-xs text-slate-700 focus:outline-none bg-transparent"
              />
            </div>

            <select
              value={historyProgramFilter}
              onChange={(e) => setHistoryProgramFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">Tất cả chương trình</option>
              <option value="JLPT">JLPT</option>
              <option value="KAIWA">KAIWA</option>
            </select>

            <select
              value={historyStatusFilter}
              onChange={(e) => setHistoryStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">Tất cả kết quả</option>
              <option value="SUCCESS">Thành công</option>
              <option value="FAILED">Thất bại</option>
            </select>

            <button
              type="button"
              onClick={fetchHistory}
              disabled={historyLoading}
              title="Làm mới lịch sử"
              className="h-9 w-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 pl-4 pr-3">Thời gian</th>
                    <th className="py-3 px-3">Nguồn đồng bộ</th>
                    <th className="py-3 px-3">Chương trình</th>
                    <th className="py-3 px-3">Kích hoạt</th>
                    <th className="py-3 px-3">Tổng dòng</th>
                    <th className="py-3 px-3">Tạo mới</th>
                    <th className="py-3 px-3">Cập nhật</th>
                    <th className="py-3 px-3">Kết quả</th>
                    <th className="py-3 px-3">Thời lượng</th>
                    <th className="py-3 pl-3 pr-4 text-right">
                      Chi tiết &amp; Hoàn tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {effectiveHistory.items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        Chưa có phiên chạy đồng bộ nào. Hãy bấm{' '}
                        <strong>[Đồng bộ ngay]</strong> trên một nguồn bất kỳ để
                        kiểm tra Preview và lưu lịch sử.
                      </td>
                    </tr>
                  ) : (
                    effectiveHistory.items.map((item) => {
                      const isJlpt = item.programType.toUpperCase() === 'JLPT';
                      const isFailed = item.status === 'FAILED';

                      return (
                        <tr
                          key={item.id}
                          onClick={() =>
                            navigate(
                              `/data-sync/history/${
                                item.id
                              }?code=${encodeURIComponent(item.code)}`
                            )
                          }
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 pl-4 pr-3 align-middle font-medium text-slate-800 whitespace-nowrap">
                            {formatDateTimeFull(item.createdAt)}
                          </td>
                          <td className="py-3.5 px-3 align-middle font-bold text-slate-900">
                            {item.name || item.code}
                          </td>
                          <td className="py-3.5 px-3 align-middle">
                            <span
                              className={
                                isJlpt
                                  ? 'bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                                  : 'bg-teal-100 text-teal-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                              }
                            >
                              {item.programType}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 align-middle text-slate-600">
                            {item.triggerType === 'AUTO'
                              ? 'Tự động'
                              : 'Thủ công'}
                          </td>
                          <td className="py-3.5 px-3 align-middle font-semibold text-slate-800">
                            {item.totalRows}
                          </td>
                          <td className="py-3.5 px-3 align-middle font-semibold text-emerald-600">
                            +{item.createdCount}
                          </td>
                          <td className="py-3.5 px-3 align-middle font-semibold text-blue-600">
                            ~{item.updatedCount}
                          </td>
                          <td className="py-3.5 px-3 align-middle">
                            {isFailed ? (
                              <Badge variant="danger" size="sm" dot>
                                Thất bại
                              </Badge>
                            ) : (
                              <Badge variant="success" size="sm" dot>
                                Thành công
                              </Badge>
                            )}
                          </td>
                          <td className="py-3.5 px-3 align-middle text-slate-600">
                            {item.durationSec} giây
                          </td>
                          <td className="py-3.5 pl-3 pr-4 align-middle text-right">
                            <span className="text-blue-600 font-semibold hover:underline">
                              Xem chi tiết &amp; Hủy thay đổi →
                            </span>
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
      )}

      {/* E. SUB-TAB 3: ÁNH XẠ CSKH & KẾT NỐI */}
      {activeSubTab === 'connection' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card 1: Ánh xạ CVHT cho 2 file tổng */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Ánh xạ Mã CSKH trong Sheet ➔ Tài khoản CSKH</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Phân bổ tự động học viên về đúng nhân viên CSKH dựa trên cột
                CVHT/CSKH trong File nguồn tổng JLPT &amp; Kaiwa
              </p>
            </div>

            {configs
              .filter((c) => resolveFlowType(c) === 'STUDENT_MASTER')
              .map((cfg) => {
                const isJlpt =
                  cfg.code === 'JLPT' || cfg.program_type === 'JLPT';
                const draft = cvhtDrafts[cfg.code] || {
                  cvht_mapping: cfg.cvht_mapping || {},
                  default_cs_id: cfg.default_cs_id ?? null,
                };
                const cvhtCodes = deriveCvhtCodes(
                  csUsers,
                  cfg.cvht_mapping,
                  draft.cvht_mapping
                );

                return (
                  <div
                    key={cfg.code}
                    className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            isJlpt
                              ? 'bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                              : 'bg-teal-100 text-teal-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                          }
                        >
                          {cfg.program_type}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {cfg.name}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        isLoading={savingCode === cfg.code}
                        onClick={() => handleSaveCvhtMapping(cfg.code)}
                        leftIcon={<Save className="w-3.5 h-3.5 text-slate-600" />}
                      >
                        Lưu ánh xạ
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
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
                              onChange={(e) => {
                                const val = e.target.value;
                                setCvhtDrafts((prev) => {
                                  const cur = prev[cfg.code] || {
                                    cvht_mapping: {},
                                    default_cs_id: null,
                                  };
                                  const nextMap = { ...cur.cvht_mapping };
                                  if (!val) delete nextMap[cvhtCode];
                                  else nextMap[cvhtCode] = Number(val);
                                  return {
                                    ...prev,
                                    [cfg.code]: {
                                      ...cur,
                                      cvht_mapping: nextMap,
                                    },
                                  };
                                });
                              }}
                              className="flex-1 h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-800 focus:outline-none"
                            >
                              <option value="">
                                -- Tự động theo mã {cvhtCode} --
                              </option>
                              {csUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name || u.email}{' '}
                                  {u.staff_code ? `(${u.staff_code})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}

                      <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-dashed border-slate-300">
                        <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-semibold text-[11px] shrink-0">
                          Mặc định (Trống)
                        </span>
                        <select
                          value={draft.default_cs_id || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCvhtDrafts((prev) => ({
                              ...prev,
                              [cfg.code]: {
                                ...(prev[cfg.code] || { cvht_mapping: {} }),
                                default_cs_id: val ? Number(val) : null,
                              },
                            }));
                          }}
                          className="flex-1 h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-800 focus:outline-none"
                        >
                          <option value="">-- Chọn CSKH mặc định --</option>
                          {csUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name || u.email}{' '}
                              {u.staff_code ? `(${u.staff_code})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Card 2: Google Service Account */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                  <GoogleColorIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Google Service Account
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tài khoản kỹ thuật dùng để đọc dữ liệu từ toàn bộ ~1.000
                    Google Sheet nguồn
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  serviceAccount?.configured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <span>●</span>
                <span>
                  {serviceAccount?.configured ? 'Đã kết nối' : 'Chưa kết nối'}
                </span>
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">Client Email:</span>
                {serviceAccount?.clientEmail ? (
                  <div className="inline-flex items-center gap-1.5">
                    <code className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] font-semibold text-slate-800">
                      {serviceAccount.clientEmail}
                    </code>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyEmail(serviceAccount.clientEmail!)
                      }
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-[11px] cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">Chưa thiết lập</span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">Project ID:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {serviceAccount?.projectId || '-'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">
                  Nguồn cấu hình:
                </span>
                <span className="font-semibold text-slate-700">
                  {serviceAccount?.source || 'NONE'}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-blue-50/60 border border-blue-200/80 p-3.5 text-xs text-slate-700 space-y-1">
              <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Hướng dẫn cấp quyền Xem (Viewer) trên Google Sheet nguồn
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Mở file Google Sheet (hoặc thư mục Google Drive chứa các file
                Báo cáo học tập / Lịch dạy GV) → Bấm nút{' '}
                <strong>Share (Chia sẻ)</strong> → Dán địa chỉ{' '}
                <strong>Client Email</strong> ở trên vào và cấp quyền{' '}
                <strong>Viewer (Người xem)</strong> để hệ thống tự động đồng bộ
                định kỳ.
              </p>
            </div>

            {isAdmin && (
              <div className="pt-2 border-t border-slate-100 space-y-3">
                {!editingSaJson ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Cập nhật khóa JSON Service Account mới
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingSaJson(true)}
                    >
                      Cập nhật JSON
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Dán nội dung file Service Account JSON:
                    </label>
                    <textarea
                      rows={5}
                      value={saJsonText}
                      onChange={(e) => setSaJsonText(e.target.value)}
                      placeholder='{"type": "service_account", "project_id": "...", "client_email": "..."}'
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingSaJson(false);
                          setSaJsonText('');
                        }}
                      >
                        Hủy
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={savingSa}
                        onClick={handleSaveServiceAccount}
                      >
                        Lưu Service Account
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <SyncConfigModal
        isOpen={configModalOpen}
        onClose={() => {
          setConfigModalOpen(false);
          setEditingConfig(null);
        }}
        editingConfig={editingConfig}
        onSaved={(saved) => {
          setConfigs((prev) => {
            const exists = prev.some((c) => c.code === saved.code);
            if (exists) {
              return prev.map((c) =>
                c.code === saved.code ? { ...c, ...saved } : c
              );
            }
            return [saved, ...prev];
          });
        }}
      />

      <BulkPasteLinksModal
        isOpen={bulkPasteModalOpen}
        onClose={() => setBulkPasteModalOpen(false)}
        existingConfigs={configs}
        onSavedBulk={(newConfigs) => {
          setConfigs((prev) => [...newConfigs, ...prev]);
        }}
      />
    </div>
  );
};
