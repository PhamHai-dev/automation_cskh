import { ImportBatchStatus, ImportRowStatus, ImportType } from '@prisma/client';

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

export interface SaveMappingDTO {
  sheetName?: string;
  headerRowIndex?: number;
  columnMapping: Record<string, string>;
}

export interface ConfirmImportDTO {
  skipErrors?: boolean;
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
  uploaded_by: {
    id: number;
    name: string | null;
    email: string;
  };
}
