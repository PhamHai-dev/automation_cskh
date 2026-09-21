export type ImportType = 'WORKBOOK';
export type LogicalSheet = 'studentEnrollment' | 'attendance';
export type ImportBatchStatus = 'PREVIEW' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL_FAILED' | 'FAILED' | 'ROLLED_BACK';

export interface SheetPreviewData {
  sheet: LogicalSheet;
  sheetName: string;
  headerRowIndex: number;
  headers: { col: string; title: string }[];
  rows: Record<string, unknown>[];
  totalRows: number;
  suggestedMapping: Record<string, string>;
}
export interface UploadResponse { importId: number; fileName: string; importType: ImportType; sheets: Record<LogicalSheet, SheetPreviewData> }
export interface FieldDiff { entity: string; field: string; before: unknown; after: unknown; action: string }
export interface ReconcileItem {
  key: string; externalId: string; packageCode: string;
  classification: 'UPDATE' | 'REQUEST_CREATE' | 'CONFLICT' | 'INVALID';
  sheet1Row?: number; sheet3Row?: number; diffs: FieldDiff[]; attendanceDiffs: FieldDiff[];
  warnings: string[]; errors: string[];
}
export interface ValidationReport {
  summary: { totalKeys: number; willUpdate: number; willRequestCreate: number; conflict: number; invalid: number };
  items: ReconcileItem[];
}
export interface ImportBatchSummary {
  id: number; file_name: string; import_type: ImportType; status: ImportBatchStatus;
  total_rows: number; success_rows: number; failed_rows: number; created_at: string; completed_at: string | null;
  uploaded_by: { id: number; name: string | null; email: string };
}
export interface ImportRowItem { id: number; row_number: number; raw_data: Record<string, unknown>; status: 'PENDING' | 'SUCCESS' | 'FAILED'; error_message?: string | null; entity_type?: string | null; entity_id?: string | null }
export interface ImportCreateRequest {
  id: number; external_id: string; package_code: string; snapshot: Record<string, unknown>; baseline?: Record<string, unknown>;
  version: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONFLICT'; review_reason?: string; created_at: string;
  requested_by: { id: number; name: string | null; email: string }; assigned_cs?: { id: number; name: string | null; email: string };
}
