export type ImportType = 'WORKBOOK' | 'STUDENT_ENROLLMENT' | 'ATTENDANCE';
export type LogicalSheet = 'studentEnrollment' | 'attendance';
export type ImportBatchStatus = 'PREVIEW' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL_FAILED' | 'FAILED' | 'ROLLED_BACK';

export interface MonthAttendanceBlock {
  month: number;
  year: number;
  label: string;
  startCol: number;
  endCol: number;
  totalDays: number;
  summaryCols: {
    attendedCol: number;
    absentACol: number;
    leaveBCol: number;
    absentCCol: number;
    teacherDCol: number;
    techErrorECol: number;
  };
  dailyCols: Array<{
    colNumber: number;
    colLetter: string;
    date: string;
  }>;
}

export interface SheetPreviewData {
  sheet: LogicalSheet;
  sheetName: string;
  headerRowIndex: number;
  headers: { col: string; title: string }[];
  rows: Record<string, unknown>[];
  totalRows: number;
  suggestedMapping: Record<string, string>;
  availableMonths?: MonthAttendanceBlock[];
  selectedMonth?: number;
  selectedYear?: number;
}
export interface UploadResponse {
  importId: number;
  fileName: string;
  importType: ImportType;
  sheets: Partial<Record<LogicalSheet, SheetPreviewData>>;
  selectedSheet?: string;
  preview?: SheetPreviewData;
  totalRows?: number;
  assignedCsId?: number;
}
export interface FieldDiff { entity: string; field: string; before: unknown; after: unknown; action: string }
export interface ReconcileItem {
  key: string; externalId: string; packageCode: string;
  classification: 'UPDATE' | 'CREATE' | 'REQUEST_CREATE' | 'REQUEST_TRANSFER' | 'CONFLICT' | 'INVALID' | 'SKIPPED_SCOPE';
  sheet1Row?: number; sheet3Row?: number; diffs: FieldDiff[]; attendanceDiffs: FieldDiff[];
  warnings: string[]; errors: string[];
}
export interface ValidationReport {
  summary: {
    totalKeys: number;
    willUpdate: number;
    willCreate?: number;
    willTransfer?: number;
    willRequestCreate?: number;
    skippedOutOfScope?: number;
    conflict: number;
    invalid: number;
    assignedCsId?: number;
  };
  items: ReconcileItem[];
}
export interface ImportBatchSummary {
  id: number; file_name: string; import_type: ImportType; status: ImportBatchStatus;
  total_rows: number; success_rows: number; failed_rows: number; conflict_attendances?: number; created_at: string; completed_at: string | null;
  uploaded_by: { id: number; name: string | null; email: string };
  care_group_sync_report?: any;
}
export interface ImportRowItem { id: number; row_number: number; raw_data: Record<string, unknown>; status: 'PENDING' | 'SUCCESS' | 'FAILED'; error_message?: string | null; entity_type?: string | null; entity_id?: string | null }
export interface ImportCreateRequest {
  id: number; external_id: string; package_code: string; snapshot: Record<string, unknown>; baseline?: Record<string, unknown>;
  version: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONFLICT'; review_reason?: string; created_at: string;
  requested_by: { id: number; name: string | null; email: string }; assigned_cs?: { id: number; name: string | null; email: string };
}

export interface CsUserOption {
  id: number;
  name: string | null;
  email: string;
  staff_code: string | null;
}

export interface GoogleSheetSyncSummary {
  totalRows?: number;
  unchangedRows?: number;
  createdCount?: number;
  updatedCount?: number;
  failedCount?: number;
  byCvht?: Record<string, number>;
  skipped?: boolean;
}

export type SyncSourceType = 'GOOGLE_SHEET' | 'LOCAL_FILE';

export type SyncFlowType =
  | 'STUDENT_MASTER'
  | 'CSKH_ATTENDANCE'
  | 'TEACHER_ATTENDANCE'
  | 'STUDY_REPORT';

export interface SyncFilterConfig {
  sourceStatuses?: string[];
  enrollmentStatuses?: string[];
  months?: number[];
  cvhtCodes?: string[];
  teacherCodes?: string[];
  classCodes?: string[];
}

export interface SyncFlowCounts {
  ALL: number;
  STUDENT_MASTER: number;
  CSKH_ATTENDANCE: number;
  TEACHER_ATTENDANCE: number;
  STUDY_REPORT: number;
}

export interface GoogleSheetSyncConfig {
  id: number;
  code: 'JLPT' | 'KAIWA' | string;
  name: string;
  flow_type?: SyncFlowType;
  program_type: 'JLPT' | 'KAIWA' | string;
  source_type?: SyncSourceType;
  spreadsheet_url?: string | null;
  spreadsheet_id?: string | null;
  local_file_path?: string | null;
  sheet_name: string;
  setting_sheet_name?: string | null;
  header_row: number;
  sync_year?: number | null;
  filter_config?: SyncFilterConfig | null;
  target_student_external_id?: string | null;
  target_student_name?: string | null;
  target_class_code?: string | null;
  target_teacher_code?: string | null;
  is_system_default?: boolean;
  cvht_mapping?: Record<string, number> | null;
  default_cs_id?: number | null;
  sync_interval_minutes: number;
  enabled: boolean;
  last_file_hash?: string | null;
  last_synced_at?: string | null;
  last_status?: string | null;
  last_summary?: GoogleSheetSyncSummary | null;
  last_error?: string | null;
}

export interface CreateGoogleSheetSyncConfigDTO {
  code?: string;
  name: string;
  flow_type: SyncFlowType;
  program_type: 'JLPT' | 'KAIWA' | string;
  source_type?: SyncSourceType;
  spreadsheet_url?: string | null;
  local_file_path?: string | null;
  sheet_name?: string;
  setting_sheet_name?: string | null;
  header_row?: number;
  sync_year?: number | null;
  filter_config?: SyncFilterConfig | null;
  target_student_external_id?: string | null;
  target_student_name?: string | null;
  target_class_code?: string | null;
  target_teacher_code?: string | null;
  cvht_mapping?: Record<string, number>;
  default_cs_id?: number | null;
  sync_interval_minutes?: number;
  enabled?: boolean;
}

export interface UpdateGoogleSheetSyncConfigDTO {
  name?: string;
  flow_type?: SyncFlowType;
  program_type?: 'JLPT' | 'KAIWA' | string;
  source_type?: SyncSourceType;
  spreadsheet_url?: string | null;
  local_file_path?: string | null;
  sheet_name?: string;
  setting_sheet_name?: string | null;
  header_row?: number;
  sync_year?: number | null;
  filter_config?: SyncFilterConfig | null;
  target_student_external_id?: string | null;
  target_student_name?: string | null;
  target_class_code?: string | null;
  target_teacher_code?: string | null;
  cvht_mapping?: Record<string, number>;
  default_cs_id?: number | null;
  sync_interval_minutes?: number;
  enabled?: boolean;
}

export interface BulkPasteLinkItemResult {
  lineNumber: number;
  rawLine: string;
  status: 'VALID' | 'DUPLICATE' | 'INVALID_URL';
  spreadsheetUrl?: string;
  spreadsheetId?: string;
  studentExternalId?: string | null;
  studentName?: string | null;
  classCode?: string | null;
  teacherCode?: string | null;
  matchedStudentId?: number | null;
  matchedClassId?: number | null;
  matchedTeacherId?: number | null;
  existingConfigCode?: string | null;
  message?: string;
}

export interface BulkPasteLinksResponse {
  mode: 'VALIDATE_ONLY' | 'CREATE';
  totalLines: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  createdCount?: number;
  items: BulkPasteLinkItemResult[];
  createdConfigs?: GoogleSheetSyncConfig[];
}

export type SyncPreviewRowClassification =
  | 'CREATE'
  | 'UPDATE'
  | 'CONFLICT'
  | 'INVALID'
  | 'UNCHANGED';

export interface SyncFieldDiffItem {
  field: string;
  fieldLabel: string;
  before: unknown;
  after: unknown;
  entityType?: 'STUDENT' | 'ENROLLMENT' | 'ATTENDANCE' | 'STUDY_REPORT' | string;
}

export interface SyncPreviewRowItem {
  itemKey: string;
  rowNumber: number;
  externalId: string;
  fullName: string;
  studentName?: string | null;
  classCode?: string | null;
  packageCode?: string | null;
  teacherCode?: string | null;
  sourceStatus?: string | null;
  enrollmentStatus?: string | null;
  classification: SyncPreviewRowClassification;
  entityType: 'STUDENT' | 'ATTENDANCE' | 'STUDY_REPORT' | string;
  fieldDiffs: SyncFieldDiffItem[];
  warnings: string[];
  errors: string[];
}

export interface SyncPreviewResponse {
  previewToken: string;
  config: GoogleSheetSyncConfig;
  appliedFilter: {
    syncYear?: number | null;
    filterConfig?: SyncFilterConfig | null;
  };
  warnings: string[];
  summary: {
    totalRowsScanned: number;
    filteredOutCount: number;
    unchangedCount: number;
    createCount: number;
    updateCount: number;
    conflictCount: number;
    invalidCount: number;
  };
  items: SyncPreviewRowItem[];
}

export interface SyncCommitResponse {
  runId: number;
  code: string;
  status: 'SUCCESS' | 'PARTIAL_FAILED' | 'FAILED';
  appliedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  message?: string;
}

export interface ServiceAccountInfo {
  configured: boolean;
  clientEmail: string | null;
  projectId: string | null;
  source: 'DB' | 'ENV_FILE' | 'ENV_VARS' | 'NONE';
}

export interface SheetSyncResult {
  runId?: number;
  code?: string;
  flow_type?: SyncFlowType;
  program_type?: string;
  status?: string;
  totalRows?: number;
  unchangedRows?: number;
  createdCount?: number;
  updatedCount?: number;
  failedCount?: number;
  byCvht?: Record<string, number>;
  skipped?: boolean;
  summary?: GoogleSheetSyncSummary;
  config?: GoogleSheetSyncConfig;
  error?: string | null;
}

export interface SheetBackupSheetStats {
  sheetName?: string;
  totalEnrollments: number;
  unchangedRows: number;
  updatedRows: number;
  appendedRows: number;
  updatedCellsCount: number;
  attendanceCellsWritten?: number;
}

export interface CsSheetBackupSummary {
  configId?: number;
  csUserId?: number;
  staffCode?: string | null;
  programType?: 'JLPT' | 'KAIWA' | 'TEACHER' | string;
  status?: 'SUCCESS' | 'FAILED' | string;
  syncedToGoogleSheet?: boolean;
  localFilePath?: string;
  totalStudents?: number;
  unchangedRows?: number;
  updatedRows?: number;
  appendedRows?: number;
  updatedCellsCount?: number;
  attendanceCellsWritten?: number;
  yearFilter?: number | null;
  backedUpAt?: string;
  profile?: SheetBackupSheetStats;
  attendance?: SheetBackupSheetStats;
  finalAttendance?: SheetBackupSheetStats | null;
  // alias tương thích ngược
  sheet1?: SheetBackupSheetStats;
  sheet3?: SheetBackupSheetStats;
}

export interface CsSheetBackupConfigItem {
  id: number;
  cs_user_id: number;
  program_type: 'JLPT' | 'KAIWA' | 'TEACHER' | string;
  name: string;
  target_spreadsheet_url?: string | null;
  target_spreadsheet_id?: string | null;
  local_backup_path?: string | null;
  profile_sheet_name: string;   // KAIWA: '1.Chăm sóc', JLPT: 'Data JLPT_Inhouse'
  profile_header_row: number;   // KAIWA: 3, JLPT: 2
  profile_enabled: boolean;
  sheet_name: string;           // KAIWA: '3.Chấm buổi', JLPT: 'Chấm buổi', TEACHER: '2026 スケジュール'
  header_row: number;           // 2
  final_sheet_name?: string;    // mặc định 'Điểm danh chốt'
  final_header_row?: number;    // mặc định 2
  final_enabled?: boolean;      // mặc định true cho KAIWA/JLPT
  local_enabled?: boolean;
  keep_daily_snapshots?: boolean;
  max_snapshots?: number;
  schedule_times?: string[] | null;
  backup_year?: number | null;
  enabled: boolean;
  require_private_sheet: boolean;
  mask_sensitive_data: boolean;
  last_backup_at?: string | null;
  last_status?: string | null;
  last_summary?: CsSheetBackupSummary | null;
  last_error?: string | null;
  has_local_backup_file?: boolean;
  cs_user: {
    id: number;
    name: string | null;
    email: string;
    staff_code: string | null;
  };
  student_counts: {
    total: number;
    attending: number;
  };
}

export interface UpdateCsSheetBackupConfigDTO {
  name?: string;
  target_spreadsheet_url?: string | null;
  local_backup_path?: string | null;
  local_enabled?: boolean;
  keep_daily_snapshots?: boolean;
  max_snapshots?: number;
  profile_sheet_name?: string;
  profile_header_row?: number;
  profile_enabled?: boolean;
  sheet_name?: string;
  header_row?: number;
  final_sheet_name?: string;
  final_header_row?: number;
  final_enabled?: boolean;
  schedule_times?: string[];
  backup_year?: number | null;
  enabled?: boolean;
  require_private_sheet?: boolean;
  mask_sensitive_data?: boolean;
}

export interface CreateCsSheetBackupConfigDTO extends UpdateCsSheetBackupConfigDTO {
  cs_user_id?: number;
  program_type: string;
}

export interface BackupHistoryItem {
  id: number;
  configId: number;
  configName?: string;
  staffCode: string | null;
  staffName: string | null;
  programType: string;
  triggerType: 'AUTO' | 'MANUAL';
  mode: 'DELTA' | 'FULL';
  status: 'SUCCESS' | 'FAILED';
  syncedToGoogleSheet?: boolean;
  localFilePath?: string;
  totalStudents?: number;
  unchangedRows?: number;
  updatedRows?: number;
  appendedRows?: number;
  updatedCellsCount?: number;
  attendanceCellsWritten?: number;
  durationMs?: number;
  durationSec: number;
  backedUpAt?: string;
  createdAt: string;
  error?: string | null;
  summary?: CsSheetBackupSummary | null;
  profile?: SheetBackupSheetStats | null;
  attendance?: SheetBackupSheetStats | null;
  finalAttendance?: SheetBackupSheetStats | null;
}

export interface BackupHistoryBatch {
  batchId: string;
  startedAt: string;
  triggerType: 'AUTO' | 'MANUAL';
  mode: 'DELTA' | 'FULL';
  status?: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  totalConfigs: number;
  successConfigs?: number;
  failedConfigs?: number;
  successCount: number;
  failedCount: number;
  totalStudents?: number;
  updatedCellsCount?: number;
  attendanceCellsWritten?: number;
  durationMs?: number;
  durationSec: number;
  items: BackupHistoryItem[];
}

export interface BackupHistoryResponse {
  stats: {
    todayTotal: number;
    todaySuccess: number;
    todayFailed: number;
    lastRunTime: string | null;
  };
  batches: BackupHistoryBatch[];
  total: number;
}

export interface SyncHistoryItem {
  id: number;
  code: string;
  name?: string;
  flowType?: SyncFlowType;
  programType: string;
  triggerType: 'AUTO' | 'MANUAL';
  mode: 'DELTA' | 'FULL';
  status: 'SUCCESS' | 'PARTIAL_FAILED' | 'FAILED' | 'ROLLED_BACK';
  durationSec: number;
  createdAt: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedRows: number;
  failedCount: number;
  rolledBackCount?: number;
  error?: string | null;
}

export interface SyncHistoryResponse {
  stats: {
    todayTotal: number;
    todaySuccess: number;
    todayFailed: number;
    lastRunTime: string | null;
  };
  items: SyncHistoryItem[];
  total: number;
}

export type SyncHistoryChangeStatus =
  | 'APPLIED'
  | 'ROLLED_BACK'
  | 'CONFLICT_MODIFIED'
  | 'FAILED';

export interface SyncHistoryChangeLogItem {
  id: number;
  rowNumber: number;
  externalId: string;
  fullName: string;
  classCode?: string | null;
  packageCode?: string | null;
  entityType: 'STUDENT' | 'ATTENDANCE' | 'STUDY_REPORT' | string;
  action: 'CREATE' | 'UPDATE' | 'CONFLICT' | 'ERROR';
  status: SyncHistoryChangeStatus;
  fieldDiffs: SyncFieldDiffItem[];
  currentWebValueSummary?: string | null;
  conflictReason?: string | null;
  rolledBackAt?: string | null;
}

export interface SyncHistoryDetailResponse {
  run: {
    id: number;
    code: string;
    name: string;
    flowType: SyncFlowType;
    programType: 'JLPT' | 'KAIWA' | string;
    triggerType: 'AUTO' | 'MANUAL';
    mode: 'DELTA' | 'FULL';
    status: 'SUCCESS' | 'PARTIAL_FAILED' | 'FAILED' | 'ROLLED_BACK';
    durationSec: number;
    createdAt: string;
    actorName?: string | null;
    error?: string | null;
  };
  summary: {
    totalRowsScanned: number;
    createdCount: number;
    updatedCount: number;
    conflictCount?: number;
    failedOrSkippedCount: number;
    rolledBackCount: number;
    remainingAppliedCount: number;
  };
  items: SyncHistoryChangeLogItem[];
}

export interface SyncRollbackConflictItem {
  changeId: number;
  rowNumber: number;
  externalId: string;
  fullName: string;
  fieldLabel: string;
  beforeSyncValue: unknown;
  syncedValue: unknown;
  currentWebValue: unknown;
  conflictMessage: string;
}

export interface SyncRollbackResponse {
  runId: number;
  conflictDetected: boolean;
  rolledBackCount: number;
  skippedConflictCount: number;
  conflicts?: SyncRollbackConflictItem[];
  message?: string;
}
