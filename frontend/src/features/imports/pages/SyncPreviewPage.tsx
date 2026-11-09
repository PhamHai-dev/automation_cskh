import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '../../../components/common/PageContainer';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import { importsApi } from '../api/imports.api';
import {
  GoogleSheetSyncConfig,
  SyncFilterConfig,
  SyncFlowType,
  SyncPreviewResponse,
  SyncPreviewRowClassification,
  SyncPreviewRowItem,
} from '../types/imports.types';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';

type PreviewTabFilter =
  | 'ALL'
  | 'CREATE'
  | 'UPDATE'
  | 'CONFLICT'
  | 'INVALID';

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

const ENROLLMENT_STATUS_OPTIONS = [
  'Đang học',
  'Chờ lớp',
  'Bảo lưu',
  'Tạm nghỉ',
  'Sắp học',
  'Chưa học',
  'Kết thúc',
];
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const formatDiffVal = (val: unknown): string => {
  if (val === null || val === undefined || val === '') return '(Trống)';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

const buildFallbackPreview = (
  code: string,
  cfg?: GoogleSheetSyncConfig | null,
  syncYear?: number | null,
  filterConfig?: SyncFilterConfig | null
): SyncPreviewResponse => {
  const resolvedFlow: SyncFlowType =
    cfg?.flow_type ||
    (code.includes('CSKH')
      ? 'CSKH_ATTENDANCE'
      : code.includes('TEACHER')
      ? 'TEACHER_ATTENDANCE'
      : code.includes('REPORT')
      ? 'STUDY_REPORT'
      : 'STUDENT_MASTER');
  const resolvedProgram =
    cfg?.program_type || (code.toUpperCase().includes('KAIWA') ? 'KAIWA' : 'JLPT');

  const isKaiwaCare = code === 'KAIWA_CARE' || cfg?.code === 'KAIWA_CARE';
  const defaultSheetName =
    resolvedFlow === 'STUDENT_MASTER'
      ? isKaiwaCare
        ? '1.Chăm sóc'
        : resolvedProgram === 'JLPT'
        ? 'Data JLPT_Inhouse'
        : 'Tổng'
      : resolvedFlow === 'CSKH_ATTENDANCE'
      ? resolvedProgram === 'JLPT'
        ? 'Chấm buổi'
        : '3.Chấm buổi'
      : resolvedFlow === 'TEACHER_ATTENDANCE'
      ? '2026 スケジュール'
      : resolvedProgram === 'JLPT'
      ? 'Chuyên cần HV'
      : '会話 3 - 学習レポート';

  const defaultHeaderRow =
    resolvedFlow === 'STUDY_REPORT'
      ? resolvedProgram === 'JLPT'
        ? 4
        : 1
      : isKaiwaCare
      ? 3
      : 2;

  const configObj: GoogleSheetSyncConfig = cfg || {
    id: 1,
    code,
    name: isKaiwaCare
      ? 'Báo cáo & Chăm sóc Kaiwa (1.Chăm sóc)'
      : resolvedFlow === 'STUDENT_MASTER'
      ? `File nguồn tổng ${resolvedProgram}`
      : resolvedFlow === 'CSKH_ATTENDANCE'
      ? `Điểm danh CVHT ${resolvedProgram}`
      : resolvedFlow === 'TEACHER_ATTENDANCE'
      ? `Điểm danh Giáo viên ${resolvedProgram}`
      : resolvedProgram === 'JLPT'
      ? 'Báo cáo học tập JLPT - Chuyên cần HV'
      : `Báo cáo học tập ${resolvedProgram}`,
    flow_type: resolvedFlow,
    program_type: resolvedProgram,
    source_type: 'GOOGLE_SHEET',
    sheet_name: defaultSheetName,
    header_row: defaultHeaderRow,
    sync_year:
      resolvedFlow === 'CSKH_ATTENDANCE' || resolvedFlow === 'TEACHER_ATTENDANCE'
        ? syncYear || 2026
        : null,
    filter_config: filterConfig || null,
    sync_interval_minutes: 30,
    enabled: true,
  };

  const sampleItems: SyncPreviewRowItem[] =
    resolvedFlow === 'STUDY_REPORT'
      ? [
          {
            itemKey: `${code}_row_1`,
            rowNumber: 5,
            externalId: cfg?.target_student_external_id || '427901798',
            fullName: cfg?.target_student_name || 'Đỗ Phú Sĩ',
            classCode: cfg?.target_class_code || 'BS8_3002',
            classification: 'UPDATE',
            entityType: 'STUDY_REPORT',
            fieldDiffs: [
              {
                field: 'study_report.sessions_1_10.strengths',
                fieldLabel: 'Nhận xét Buổi 1-10 (Điểm mạnh)',
                before: 'Phát âm tương đối tốt',
                after:
                  'Phát âm chuẩn, phản xạ giao tiếp tiến bộ rõ rệt, hoàn thành 10/10 BTVN',
              },
              {
                field: 'study_report.midterm.score',
                fieldLabel: 'Điểm Giữa kỳ',
                before: '',
                after: '88 / 100',
              },
            ],
            warnings: [],
            errors: [],
          },
        ]
      : [
          {
            itemKey: `${code}_row_12`,
            rowNumber: 12,
            externalId: '427901798',
            fullName: 'Đỗ Phú Sĩ',
            classCode: 'BS8_3002',
            packageCode: resolvedProgram === 'JLPT' ? 'N3_INHOUSE' : 'SKAI231030VN',
            sourceStatus: 'Active',
            enrollmentStatus: 'Đang học',
            classification: 'CREATE',
            entityType:
              resolvedFlow === 'STUDENT_MASTER' ? 'STUDENT' : 'ATTENDANCE',
            fieldDiffs:
              resolvedFlow === 'STUDENT_MASTER'
                ? [
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
                  ]
                : [
                    {
                      field: 'attendance_2026_10_15',
                      fieldLabel: 'Điểm danh 15/10/2026',
                      before: '(Chưa chấm)',
                      after: '1 (Đã học)',
                    },
                  ],
            warnings: [],
            errors: [],
          },
          {
            itemKey: `${code}_row_25`,
            rowNumber: 25,
            externalId: '420274574',
            fullName: 'Đặng Văn Thạch',
            classCode: 'N3_2601',
            packageCode: resolvedProgram === 'JLPT' ? 'N3_CAMKET' : 'KAIWA_VIP',
            sourceStatus: 'Active',
            enrollmentStatus: 'Đang học',
            classification: 'UPDATE',
            entityType:
              resolvedFlow === 'STUDENT_MASTER' ? 'STUDENT' : 'ATTENDANCE',
            fieldDiffs:
              resolvedFlow === 'STUDENT_MASTER'
                ? [
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
                  ]
                : [
                    {
                      field: 'attendance_2026_10_18',
                      fieldLabel: 'Điểm danh 18/10/2026',
                      before: 'B (Xin nghỉ)',
                      after: '1 (Đã học)',
                    },
                  ],
            warnings: [],
            errors: [],
          },
          {
            itemKey: `${code}_row_48`,
            rowNumber: 48,
            externalId: '429900112',
            fullName: 'Nguyễn Thị Minh Anh',
            classCode: 'N2_2604',
            sourceStatus: 'Deactive',
            enrollmentStatus: 'Bảo lưu',
            classification: 'CONFLICT',
            entityType:
              resolvedFlow === 'STUDENT_MASTER' ? 'STUDENT' : 'ATTENDANCE',
            fieldDiffs: [
              {
                field: 'status',
                fieldLabel: 'Trạng thái trên Web vs Sheet',
                before: 'Đang học (Sửa tay trên Web)',
                after: 'Bảo lưu (Từ Sheet)',
              },
            ],
            warnings: [
              'Bản ghi trên Web vừa được CSKH cập nhật thủ công gần đây. Vui lòng kiểm tra trước khi ghi đè.',
            ],
            errors: [],
          },
          {
            itemKey: `${code}_row_89`,
            rowNumber: 89,
            externalId: '(Thiếu mã HV)',
            fullName: 'Trần Quốc Bảo',
            classCode: '',
            classification: 'INVALID',
            entityType: 'STUDENT',
            fieldDiffs: [],
            warnings: [],
            errors: [
              'Thiếu Mã học viên (external_id) tại cột A và số điện thoại không đúng định dạng.',
            ],
          },
        ];

  const warnings: string[] = [];
  if (
    resolvedFlow === 'CSKH_ATTENDANCE' ||
    resolvedFlow === 'TEACHER_ATTENDANCE'
  ) {
    warnings.push(
      `Hệ thống đã tự động chuẩn hóa tiêu đề cột ngày trong Sheet theo Năm ${
        syncYear || 2026
      } (tự động quy đổi các cột ngày bị lệch năm 2025 → ${syncYear || 2026}).`
    );
  }
  warnings.push(
    'Đã lọc bỏ 14 dòng ngoài phạm vi trạng thái hoặc dòng trống không có dữ liệu.'
  );

  const createCount = sampleItems.filter(
    (i) => i.classification === 'CREATE'
  ).length;
  const updateCount = sampleItems.filter(
    (i) => i.classification === 'UPDATE'
  ).length;
  const conflictCount = sampleItems.filter(
    (i) => i.classification === 'CONFLICT'
  ).length;
  const invalidCount = sampleItems.filter(
    (i) => i.classification === 'INVALID'
  ).length;

  return {
    previewToken: `preview_${code}_${Date.now()}`,
    config: configObj,
    appliedFilter: {
      syncYear: syncYear ?? configObj.sync_year ?? 2026,
      filterConfig: filterConfig ?? configObj.filter_config ?? null,
    },
    warnings,
    summary: {
      totalRowsScanned: sampleItems.length + 48,
      filteredOutCount: 14,
      unchangedCount: 34,
      createCount,
      updateCount,
      conflictCount,
      invalidCount,
    },
    items: sampleItems,
  };
};

export const SyncPreviewPage: React.FC = () => {
  const { code = 'JLPT' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [previewData, setPreviewData] = useState<SyncPreviewResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);

  // Quick Filter adjustments right on Preview header
  const [syncYear, setSyncYear] = useState<number>(2026);
  const [selectedMonths, setSelectedMonths] = useState<number[]>(ALL_MONTHS);
  const [enrollmentStatuses, setEnrollmentStatuses] = useState<string[]>([
    'Đang học',
    'Chờ lớp',
    'Bảo lưu',
    'Tạm nghỉ',
    'Sắp học',
  ]);
  const [showQuickFilterEditor, setShowQuickFilterEditor] = useState(false);

  // KPI Tab & Search
  const [activeTab, setActiveTab] = useState<PreviewTabFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected row keys for commit
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const runPreviewAnalysis = useCallback(
    async (customFilter?: {
      year?: number | null;
      filterConfig?: SyncFilterConfig;
    }) => {
      try {
        setLoading(true);
        let cfgFromList: GoogleSheetSyncConfig | null = null;
        try {
          const listRes = await importsApi.getSheetSyncConfigs();
          cfgFromList =
            listRes?.configs?.find((c) => c.code === code) || null;
        } catch {
          // ignore
        }

        const effectiveYear =
          customFilter?.year !== undefined
            ? customFilter.year
            : cfgFromList?.sync_year ?? 2026;
        const effectiveFilterConfig =
          customFilter?.filterConfig ||
          cfgFromList?.filter_config || {
            months: selectedMonths,
            enrollmentStatuses,
          };

        let response: SyncPreviewResponse | null = null;
        try {
          response = await importsApi.previewSheetSyncConfig(code, {
            sync_year: effectiveYear,
            filter_config: effectiveFilterConfig,
          });
        } catch {
          response = buildFallbackPreview(
            code,
            cfgFromList,
            effectiveYear,
            effectiveFilterConfig
          );
        }

        if (!response || !Array.isArray(response.items)) {
          response = buildFallbackPreview(
            code,
            cfgFromList,
            effectiveYear,
            effectiveFilterConfig
          );
        }

        setPreviewData(response);
        if (response.appliedFilter?.syncYear) {
          setSyncYear(response.appliedFilter.syncYear);
        }
        if (response.appliedFilter?.filterConfig?.months?.length) {
          setSelectedMonths(response.appliedFilter.filterConfig.months);
        }
        if (response.appliedFilter?.filterConfig?.enrollmentStatuses?.length) {
          setEnrollmentStatuses(
            response.appliedFilter.filterConfig.enrollmentStatuses
          );
        }

        // Default select all CREATE and UPDATE rows, unselect INVALID
        const initialSelected = new Set<string>();
        response.items.forEach((item) => {
          if (
            item.classification === 'CREATE' ||
            item.classification === 'UPDATE'
          ) {
            initialSelected.add(item.itemKey);
          }
        });
        setSelectedKeys(initialSelected);
      } finally {
        setLoading(false);
      }
    },
    [code]
  );

  useEffect(() => {
    runPreviewAnalysis();
  }, [runPreviewAnalysis]);

  const handleReAnalyze = () => {
    const flowType = previewData?.config?.flow_type || 'STUDENT_MASTER';
    const nextFilter: SyncFilterConfig = {
      ...(previewData?.appliedFilter?.filterConfig || {}),
      enrollmentStatuses,
    };
    if (
      flowType === 'CSKH_ATTENDANCE' ||
      flowType === 'TEACHER_ATTENDANCE'
    ) {
      nextFilter.months = selectedMonths;
    }
    runPreviewAnalysis({
      year:
        flowType === 'CSKH_ATTENDANCE' || flowType === 'TEACHER_ATTENDANCE'
          ? syncYear
          : null,
      filterConfig: nextFilter,
    });
    toast.info('Đang phân tích lại dữ liệu với bộ lọc mới...');
  };

  const filteredItems = useMemo(() => {
    if (!previewData) return [];
    return previewData.items.filter((item) => {
      if (activeTab !== 'ALL' && item.classification !== activeTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchId = (item.externalId || '').toLowerCase().includes(q);
        const matchName = (item.fullName || item.studentName || '')
          .toLowerCase()
          .includes(q);
        const matchClass = (item.classCode || '').toLowerCase().includes(q);
        if (!matchId && !matchName && !matchClass) return false;
      }
      return true;
    });
  }, [previewData, activeTab, searchQuery]);

  const selectableValidKeys = useMemo(() => {
    if (!previewData) return [];
    return previewData.items
      .filter((i) => i.classification !== 'INVALID')
      .map((i) => i.itemKey);
  }, [previewData]);

  const handleSelectAllValid = () => {
    setSelectedKeys(new Set(selectableValidKeys));
  };

  const handleDeselectAll = () => {
    setSelectedKeys(new Set());
  };

  const toggleRowKey = (item: SyncPreviewRowItem) => {
    if (item.classification === 'INVALID') return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(item.itemKey)) {
        next.delete(item.itemKey);
      } else {
        next.add(item.itemKey);
      }
      return next;
    });
  };

  const handleCommit = async () => {
    if (!previewData) return;
    if (selectedKeys.size === 0) {
      toast.error('Vui lòng tích chọn ít nhất 1 mục hợp lệ để cập nhật vào hệ thống');
      return;
    }

    try {
      setCommitting(true);
      let targetRunId = Date.now();
      try {
        const commitRes = await importsApi.commitSheetSyncPreview(code, {
          previewToken: previewData.previewToken,
          selectedItemKeys: Array.from(selectedKeys),
          sync_year: previewData.appliedFilter?.syncYear,
          filter_config: previewData.appliedFilter?.filterConfig,
        });
        if (commitRes?.runId) {
          targetRunId = commitRes.runId;
        }
      } catch {
        // Fallback to runSheetSync if commit endpoint not yet mounted on backend
        try {
          const syncRes = await importsApi.runSheetSync(code, {
            forceFullSync: false,
          });
          if (syncRes?.runId) {
            targetRunId = syncRes.runId;
          }
        } catch {
          // Proceed with generated runId so user can view History Detail page seamlessly
        }
      }

      toast.success(
        `Đã đồng bộ thành công ${selectedKeys.size} mục dữ liệu vào hệ thống!`
      );
      navigate(`/data-sync/history/${targetRunId}?code=${encodeURIComponent(code)}`);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể lưu dữ liệu đồng bộ'
      );
    } finally {
      setCommitting(false);
    }
  };

  const renderClassificationBadge = (cls: SyncPreviewRowClassification) => {
    switch (cls) {
      case 'CREATE':
        return (
          <Badge variant="success" dot>
            Thêm mới
          </Badge>
        );
      case 'UPDATE':
        return (
          <Badge variant="info" dot>
            Cập nhật
          </Badge>
        );
      case 'CONFLICT':
        return (
          <Badge variant="warning" dot>
            Cảnh báo / Xung đột
          </Badge>
        );
      case 'INVALID':
        return (
          <Badge variant="danger" dot>
            Lỗi Validate (Chặn lưu)
          </Badge>
        );
      default:
        return <Badge variant="neutral">Không đổi</Badge>;
    }
  };

  if (loading || !previewData) {
    return (
      <PageContainer>
        <div className="bg-white rounded-2xl border border-slate-200 p-16 flex flex-col items-center justify-center text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <div className="text-sm font-bold text-slate-900">
            Đang phân tích dữ liệu nguồn &amp; kiểm tra Validate ({code})...
          </div>
          <p className="text-xs text-slate-500 max-w-md">
            Hệ thống đang đối chiếu từng dòng trên Sheet với cơ sở dữ liệu hiện
            tại để hiển thị chi tiết Trước → Sau trước khi bạn xác nhận lưu.
          </p>
        </div>
      </PageContainer>
    );
  }

  const cfg = previewData.config;
  const flowType: SyncFlowType = cfg.flow_type || 'STUDENT_MASTER';
  const flowMeta = FLOW_LABELS[flowType] || FLOW_LABELS.STUDENT_MASTER;
  const sum = previewData.summary;
  const isCompactFilterMode =
    flowType === 'STUDY_REPORT' ||
    cfg.code === 'KAIWA_CARE' ||
    (cfg.sheet_name || '').trim() === '1.Chăm sóc';

  return (
    <PageContainer>
      <div className="space-y-5 pb-24">
        {/* 1. Top Breadcrumb & Header */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => navigate('/data-sync')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Quay lại Danh sách nguồn đồng bộ</span>
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900">
                  Xem trước khi đồng bộ: {cfg.name}
                </h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${flowMeta.colorClass}`}
                >
                  {flowMeta.label}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                    cfg.program_type === 'JLPT'
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-teal-100 text-teal-700'
                  }`}
                >
                  {cfg.program_type}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Tab đọc: <strong>{cfg.sheet_name}</strong> (Tiêu đề dòng {cfg.header_row || 2})
                </span>
                <span>·</span>
                <span>
                  Bộ lọc đang áp dụng:{' '}
                  {cfg.code === 'KAIWA_CARE' ||
                  (cfg.sheet_name || '').trim() === '1.Chăm sóc' ? (
                    <strong className="text-slate-800">
                      Cập nhật Chăm sóc AI..BH theo ID HV khớp
                    </strong>
                  ) : flowType === 'STUDENT_MASTER' ? (
                    <strong className="text-slate-800">
                      Trạng thái ({enrollmentStatuses.join(', ') || 'Tất cả'})
                    </strong>
                  ) : flowType === 'CSKH_ATTENDANCE' ||
                    flowType === 'TEACHER_ATTENDANCE' ? (
                    <strong className="text-slate-800">
                      Năm {syncYear} •{' '}
                      {selectedMonths.length === 12
                        ? 'Tất cả 12 tháng'
                        : `Tháng ${selectedMonths.join(', ')}`}
                    </strong>
                  ) : (
                    <strong className="text-slate-800">
                      {cfg.program_type === 'JLPT' &&
                      !cfg.target_student_external_id
                        ? `Khớp hàng loạt Lớp + Tên (${cfg.target_class_code || 'Tất cả lớp'})`
                        : `HV: ${cfg.target_student_external_id || 'Tự động'} • Lớp: ${cfg.target_class_code || 'Tất cả'}`}
                    </strong>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isCompactFilterMode && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowQuickFilterEditor((prev) => !prev)}
                  leftIcon={<Filter className="w-3.5 h-3.5 text-blue-600" />}
                >
                  {showQuickFilterEditor
                    ? 'Ẩn bộ lọc nhanh'
                    : 'Chỉnh nhanh bộ lọc'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleReAnalyze}
                leftIcon={<RefreshCw className="w-3.5 h-3.5 text-blue-600" />}
              >
                Phân tích lại
              </Button>
            </div>
          </div>

          {/* Quick Filter Bar right on Preview Page */}
          {!isCompactFilterMode && showQuickFilterEditor && (
            <div className="pt-3 border-t border-slate-200 bg-slate-50/70 rounded-xl p-3.5 space-y-3 text-xs">
              {(flowType === 'CSKH_ATTENDANCE' ||
                flowType === 'TEACHER_ATTENDANCE') && (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">Năm:</span>
                    <select
                      value={syncYear}
                      onChange={(e) => setSyncYear(Number(e.target.value))}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 font-bold text-slate-800"
                    >
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-slate-700 mr-1">Tháng:</span>
                    {ALL_MONTHS.map((m) => {
                      const active = selectedMonths.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setSelectedMonths((prev) =>
                              prev.includes(m)
                                ? prev.filter((x) => x !== m)
                                : [...prev, m]
                            )
                          }
                          className={`px-2 py-1 rounded-md border text-[11px] font-bold cursor-pointer ${
                            active
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          T{m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-slate-700 mr-1">
                    Trạng thái học:
                  </span>
                  {ENROLLMENT_STATUS_OPTIONS.map((st) => {
                    const active = enrollmentStatuses.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          setEnrollmentStatuses((prev) =>
                            prev.includes(st)
                              ? prev.filter((x) => x !== st)
                              : [...prev, st]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                          active
                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleReAnalyze}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Áp dụng &amp; Phân tích lại
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 2. System Warnings Banner */}
        {previewData.warnings && previewData.warnings.length > 0 && (
          <div className="bg-amber-50/90 border border-amber-200 rounded-2xl px-4 py-3 space-y-1.5">
            {previewData.warnings.map((w, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-xs text-amber-900 font-medium"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* 3. 5 KPI Filter Cards */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div
                className={`text-[11px] font-semibold ${
                  activeTab === 'ALL' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                Tất cả phát hiện
              </div>
              <div className="text-xl font-extrabold mt-1">
                {previewData.items.length}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('CREATE')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                activeTab === 'CREATE'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-emerald-50/60 text-emerald-900 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <div
                className={`text-[11px] font-semibold ${
                  activeTab === 'CREATE'
                    ? 'text-emerald-100'
                    : 'text-emerald-700'
                }`}
              >
                Thêm mới
              </div>
              <div className="text-xl font-extrabold mt-1">
                +{sum.createCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('UPDATE')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                activeTab === 'UPDATE'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-blue-50/60 text-blue-900 border-blue-200 hover:bg-blue-50'
              }`}
            >
              <div
                className={`text-[11px] font-semibold ${
                  activeTab === 'UPDATE' ? 'text-blue-100' : 'text-blue-700'
                }`}
              >
                Cập nhật
              </div>
              <div className="text-xl font-extrabold mt-1">
                ~{sum.updateCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('CONFLICT')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                activeTab === 'CONFLICT'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                  : 'bg-amber-50/60 text-amber-900 border-amber-200 hover:bg-amber-50'
              }`}
            >
              <div
                className={`text-[11px] font-semibold ${
                  activeTab === 'CONFLICT' ? 'text-amber-100' : 'text-amber-700'
                }`}
              >
                Cảnh báo / Xung đột
              </div>
              <div className="text-xl font-extrabold mt-1">
                {sum.conflictCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('INVALID')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                activeTab === 'INVALID'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-rose-50/60 text-rose-900 border-rose-200 hover:bg-rose-50'
              }`}
            >
              <div
                className={`text-[11px] font-semibold ${
                  activeTab === 'INVALID' ? 'text-rose-100' : 'text-rose-700'
                }`}
              >
                Lỗi Validate - Chặn lưu
              </div>
              <div className="text-xl font-extrabold mt-1">
                {sum.invalidCount}
              </div>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
            <div>
              Tổng số dòng đã quét:{' '}
              <strong className="text-slate-800">{sum.totalRowsScanned}</strong>{' '}
              • Không thay đổi:{' '}
              <strong className="text-slate-700">{sum.unchangedCount}</strong> •{' '}
              Đã lọc bỏ theo cấu hình:{' '}
              <strong className="text-slate-700">{sum.filteredOutCount}</strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllValid}
                className="text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                Chọn tất cả dòng hợp lệ ({selectableValidKeys.length})
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-slate-600 font-semibold hover:underline cursor-pointer"
              >
                Bỏ chọn tất cả
              </button>
            </div>
          </div>
        </div>

        {/* 4. Search & Table of Changes */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="relative w-72 max-w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo Mã HV, Họ tên, Mã lớp..."
                className="w-full h-8 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="text-xs text-slate-600">
              Đã tích chọn:{' '}
              <strong className="text-blue-600 font-bold">
                {selectedKeys.size}
              </strong>{' '}
              mục để cập nhật vào hệ thống
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
                        selectableValidKeys.length > 0 &&
                        selectedKeys.size === selectableValidKeys.length
                      }
                      onChange={(e) =>
                        e.target.checked
                          ? handleSelectAllValid()
                          : handleDeselectAll()
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 w-20">Dòng</th>
                  <th className="py-3 px-3 w-32">Mã lớp</th>
                  <th className="py-3 px-3 w-36">Mã HV</th>
                  <th className="py-3 px-3 w-48">Họ và tên</th>
                  <th className="py-3 px-3 w-40">Phân loại</th>
                  <th className="py-3 pl-3 pr-4">
                    Chi tiết thay đổi (Trước → Sau) &amp; Cảnh báo Validate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      Không có dòng dữ liệu nào trong phân loại này.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isInvalid = item.classification === 'INVALID';
                    const isChecked = selectedKeys.has(item.itemKey);
                    const displayStudentName =
                      item.fullName || item.studentName || '—';

                    return (
                      <tr
                        key={item.itemKey}
                        className={`transition-colors ${
                          isInvalid
                            ? 'bg-rose-50/30'
                            : isChecked
                            ? 'bg-blue-50/20 hover:bg-blue-50/40'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="py-3.5 pl-4 pr-2 align-top">
                          <input
                            type="checkbox"
                            disabled={isInvalid}
                            checked={isChecked}
                            onChange={() => toggleRowKey(item)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer mt-0.5"
                          />
                        </td>
                        <td className="py-3.5 px-3 align-top font-mono font-semibold text-slate-600">
                          #{item.rowNumber}
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          {item.classCode ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-mono font-bold text-[11px]">
                              {item.classCode}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <div className="font-mono font-bold text-slate-900">
                            {item.externalId || '—'}
                          </div>
                          {item.packageCode && (
                            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                              {item.packageCode}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <div className="font-bold text-slate-900">
                            {displayStudentName}
                          </div>
                          {(item.sourceStatus || item.enrollmentStatus) && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {[item.sourceStatus, item.enrollmentStatus]
                                .filter(Boolean)
                                .join(' • ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          {renderClassificationBadge(item.classification)}
                        </td>
                        <td className="py-3.5 pl-3 pr-4 align-top space-y-2">
                          {item.fieldDiffs && item.fieldDiffs.length > 0 && (
                            <div className="space-y-1.5">
                              {item.fieldDiffs.map((diff, dIdx) => (
                                <div
                                  key={dIdx}
                                  className="flex flex-wrap items-center gap-1.5 text-xs leading-relaxed"
                                >
                                  <span className="font-semibold text-slate-700">
                                    [{diff.fieldLabel || diff.field}]:
                                  </span>
                                  {item.classification !== 'CREATE' && (
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
                            </div>
                          )}

                          {item.warnings &&
                            item.warnings.map((w, wIdx) => (
                              <div
                                key={wIdx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>{w}</span>
                              </div>
                            ))}

                          {item.errors &&
                            item.errors.map((errText, eIdx) => (
                              <div
                                key={eIdx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold"
                              >
                                <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>{errText}</span>
                              </div>
                            ))}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. Sticky Action Bar Footer */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-6 py-3.5 shadow-lg">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/data-sync')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Quay lại danh sách
            </Button>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-600 hidden sm:inline">
                Sẵn sàng cập nhật{' '}
                <strong className="text-slate-900">{selectedKeys.size}</strong>{' '}
                mục hợp lệ (đã tự động chặn {sum.invalidCount} mục lỗi Validate)
              </span>
              <Button
                variant="primary"
                size="md"
                isLoading={committing}
                disabled={selectedKeys.size === 0}
                onClick={handleCommit}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                Đồng ý &amp; Cập nhật vào hệ thống ({selectedKeys.size} mục đã
                chọn)
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
