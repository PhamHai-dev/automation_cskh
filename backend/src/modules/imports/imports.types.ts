import { ImportBatchStatus, ImportType } from '@prisma/client';

export type LogicalSheet = 'studentEnrollment' | 'attendance';
export type ReconcileClassification = 'UPDATE' | 'REQUEST_CREATE' | 'CONFLICT' | 'INVALID';

export interface SheetPreviewData {
  sheet?: LogicalSheet;
  sheetName: string;
  headerRowIndex: number;
  headers: { col: string; title: string }[];
  rows: Record<string, unknown>[];
  totalRows: number;
  suggestedMapping: Record<string, string>;
}

export interface UploadResponse {
  importId: number;
  fileName: string;
  importType: ImportType;
  sheets: Record<LogicalSheet, SheetPreviewData> | string[];
  selectedSheet?: string;
  totalRows?: number;
  preview?: SheetPreviewData;
}

export interface SaveMappingDTO {
  sheet?: LogicalSheet;
  sheetName?: string;
  headerRowIndex?: number;
  columnMapping: Record<string, string>;
}

export interface ValidationErrorItem {
  rowNumber: number;
  field?: string;
  message: string;
  rawData?: Record<string, unknown>;
}

export interface ValidationWarningItem {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface FieldDiff {
  entity: 'Student' | 'Enrollment' | 'EnrollmentClass' | 'Attendance';
  field: string;
  before: unknown;
  after: unknown;
  action: 'UPDATE' | 'NULLIFY' | 'UPSERT' | 'SOFT_DELETE';
}

export interface ReconcileItem {
  key: string;
  externalId: string;
  packageCode: string;
  classification: ReconcileClassification;
  sheet1Row?: number;
  sheet3Row?: number;
  snapshot: Record<string, unknown>;
  baseline?: Record<string, unknown>;
  diffs: FieldDiff[];
  attendanceDiffs: FieldDiff[];
  warnings: string[];
  errors: string[];
}

export interface ValidationReport {
  summary?: {
    totalKeys: number;
    willUpdate: number;
    willRequestCreate: number;
    conflict: number;
    invalid: number;
  };
  items?: ReconcileItem[];
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  errors?: ValidationErrorItem[];
  warnings?: ValidationWarningItem[];
  newStudents?: { externalId?: string; fullName: string; className?: string; rowNumber: number }[];
  matchedCount?: number;
}

export interface ImportBatchSummary {
  id: number;
  file_name: string;
  import_type: ImportType;
  status: ImportBatchStatus;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  created_at: Date;
  completed_at: Date | null;
  uploaded_by: { id: number; name: string | null; email: string };
}

export interface RequestActor {
  id: number;
  roles: string[];
}
