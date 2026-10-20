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

export interface GoogleSheetSyncConfig {
  id: number;
  code: 'JLPT' | 'KAIWA' | string;
  name: string;
  program_type: 'JLPT' | 'KAIWA' | string;
  spreadsheet_url?: string | null;
  spreadsheet_id?: string | null;
  local_file_path?: string | null;
  sheet_name: string;
  setting_sheet_name?: string | null;
  header_row: number;
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

export interface UpdateGoogleSheetSyncConfigDTO {
  spreadsheet_url?: string | null;
  local_file_path?: string | null;
  sheet_name?: string;
  setting_sheet_name?: string | null;
  cvht_mapping?: Record<string, number>;
  default_cs_id?: number | null;
  sync_interval_minutes?: number;
  enabled?: boolean;
}

export interface ServiceAccountInfo {
  configured: boolean;
  clientEmail: string | null;
  projectId: string | null;
  source: 'DB' | 'ENV_FILE' | 'ENV_VARS' | 'NONE';
}

export interface SheetSyncResult {
  code?: string;
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
  totalEnrollments: number;
  unchangedRows: number;
  updatedRows: number;
  appendedRows: number;
  updatedCellsCount: number;
}

export interface CsSheetBackupSummary {
  csUserId?: number;
  staffCode?: string;
  status?: string;
  syncedToGoogleSheet?: boolean;
  localFilePath?: string;
  sheet1?: SheetBackupSheetStats;
  sheet3?: SheetBackupSheetStats;
  backedUpAt?: string;
}

export interface CsSheetBackupConfigItem {
  id: number;
  cs_user_id: number;
  name: string;
  target_spreadsheet_url?: string | null;
  target_spreadsheet_id?: string | null;
  local_backup_path?: string | null;
  sheet1_name: string;
  sheet3_name: string;
  schedule_times?: string[] | null; // e.g. ["12:00", "21:00"]
  enabled: boolean;
  require_private_sheet: boolean;
  mask_sensitive_data: boolean;
  last_backup_at?: string | null;
  last_status?: string | null;
  last_summary?: CsSheetBackupSummary | null;
  last_error?: string | null;
  hasLocalBackupFile?: boolean;
  cs_user: {
    id: number;
    name: string | null;
    email: string;
    staff_code: string | null;
  };
  studentCounts: {
    total: number;
    kaiwa: number;
    jlpt: number;
  };
}

export interface UpdateCsSheetBackupConfigDTO {
  target_spreadsheet_url?: string | null;
  sheet1_name?: string;
  sheet3_name?: string;
  schedule_times?: string[];
  enabled?: boolean;
  require_private_sheet?: boolean;
  mask_sensitive_data?: boolean;
}


