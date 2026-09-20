export type ImportType = 'STUDENT_ENROLLMENT' | 'ATTENDANCE' | 'TEACHER_ATTENDANCE';

export type ImportBatchStatus = 'PREVIEW' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL_FAILED' | 'FAILED' | 'ROLLED_BACK';

export interface SheetPreviewData {
  sheetName: string;
  headerRowIndex: number;
  headers: { col: string; title: string }[];
  rows: Record<string, any>[];
  totalRows: number;
  suggestedMapping: Record<string, string>;
}

export interface UploadResponse {
  importId: number;
  fileName: string;
  importType: ImportType;
  sheets: string[];
  selectedSheet: string;
  totalRows: number;
  preview: SheetPreviewData;
}

export interface ValidationErrorItem {
  rowNumber: number;
  field?: string;
  message: string;
  rawData?: Record<string, any>;
}

export interface ValidationWarningItem {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface ValidationReport {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: ValidationErrorItem[];
  warnings: ValidationWarningItem[];
}

export interface ImportBatchSummary {
  id: number;
  file_name: string;
  import_type: ImportType;
  status: ImportBatchStatus;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  created_at: string;
  completed_at: string | null;
  uploaded_by: {
    id: number;
    name: string | null;
    email: string;
  };
}

export interface ImportRowItem {
  id: number;
  row_number: number;
  raw_data: Record<string, any>;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  error_message?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
}
