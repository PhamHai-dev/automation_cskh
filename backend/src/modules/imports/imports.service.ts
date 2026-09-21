import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { ImportBatchStatus, ImportRowStatus, ImportType, AttendanceStatus, AttendanceSource, EnrollmentStatus, EnrollmentClassStatus, ImportCreateRequestStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { ImportsRepository } from './imports.repository';
import { SheetPreviewData, UploadResponse, ValidationReport, ValidationErrorItem, ValidationWarningItem, SaveMappingDTO, ImportBatchSummary, RequestActor, ReconcileItem, LogicalSheet } from './imports.types';
import { AppError } from '../../middlewares/error.middleware';

export class ImportsService {
  private repo: ImportsRepository;
  private uploadsDir: string;

  constructor(repo?: ImportsRepository) {
    this.repo = repo || new ImportsRepository();
    this.uploadsDir = path.resolve(process.cwd(), 'uploads', 'imports');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  private getMetaFilePath(importId: number): string {
    return path.join(this.uploadsDir, `import_${importId}.meta.json`);
  }

  private getUploadFilePath(importId: number, originalName: string): string {
    const ext = path.extname(originalName) || '.xlsx';
    return path.join(this.uploadsDir, `import_${importId}${ext}`);
  }

  private saveMeta(importId: number, data: any) {
    fs.writeFileSync(this.getMetaFilePath(importId), JSON.stringify(data, null, 2), 'utf-8');
  }

  private loadMeta(importId: number): any {
    const p = this.getMetaFilePath(importId);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }

  // Helper to parse Excel dates safely
  public parseExcelDate(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val;
    }
    if (typeof val === 'number') {
      // Excel serial date to JS Date
      // Excel epoch: Dec 30 1899
      const ms = Math.round((val - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      // Try YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) return d;
      }
      // Try DD/MM/YYYY
      const parts = trimmed.split(/[/.-]/);
      if (parts.length === 3) {
        if (parts[0].length === 2 && parts[2].length === 4) {
          const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          if (!isNaN(d.getTime())) return d;
        }
      }
      const parsedNum = parseFloat(trimmed);
      if (!isNaN(parsedNum) && parsedNum > 30000 && parsedNum < 70000) {
        return this.parseExcelDate(parsedNum);
      }
    }
    return null;
  }

  // Auto-detect header row and column mappings
  private detectColumns(worksheet: ExcelJS.Worksheet, importType: ImportType) {
    let headerRowIdx = 1;
    let maxMatches = 0;
    const sheet1Keywords = ['id', 'họ tên', 'sđt', 'email', 'gói học', 'khóa học', 'trạng thái'];
    const sheet3Keywords = ['id', 'họ tên', 'gói học', 'tên lớp', 'tổng số buổi đã học', 'giáo viên'];

    const targetKeywords = importType === ImportType.STUDENT_ENROLLMENT ? sheet1Keywords : sheet3Keywords;

    // Scan first 10 rows to find best header row
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 10) return;
      let matches = 0;
      row.eachCell((cell) => {
        const text = String(cell.value || '').toLowerCase();
        for (const kw of targetKeywords) {
          if (text.includes(kw)) {
            matches++;
            break;
          }
        }
      });
      if (matches > maxMatches) {
        maxMatches = matches;
        headerRowIdx = rowNumber;
      }
    });

    const headers: { col: string; title: string }[] = [];
    const suggestedMapping: Record<string, string> = {};
    const headerRow = worksheet.getRow(headerRowIdx);

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const colLetter = worksheet.getColumn(colNumber).letter;
      let rawTitle = '';
      if (typeof cell.value === 'object' && cell.value !== null && 'richText' in cell.value) {
        rawTitle = (cell.value as any).richText.map((t: any) => t.text).join('');
      } else {
        rawTitle = String(cell.value || '').trim();
      }

      headers.push({ col: colLetter, title: rawTitle });

      const lower = rawTitle.toLowerCase();
      if (lower === 'id' || lower === 'id hv') {
        suggestedMapping['external_id'] = colLetter;
      } else if (lower.includes('họ tên') || lower.includes('tên hv')) {
        suggestedMapping['full_name'] = colLetter;
      } else if (lower.includes('sđt') || lower.includes('điện thoại')) {
        suggestedMapping['phone'] = colLetter;
      } else if (lower.includes('email')) {
        suggestedMapping['email'] = colLetter;
      } else if (lower.includes('giới tính')) {
        suggestedMapping['gender'] = colLetter;
      } else if (lower.includes('dob') || lower.includes('ngày sinh')) {
        suggestedMapping['date_of_birth'] = colLetter;
      } else if (lower.includes('nghề nghiệp')) {
        suggestedMapping['occupation'] = colLetter;
      } else if (lower.includes('gói học')) {
        suggestedMapping['package_code'] = colLetter;
      } else if (lower.includes('trình độ')) {
        suggestedMapping['level'] = colLetter;
      } else if (lower.includes('tổng số buổi') && !lower.includes('đã học')) {
        suggestedMapping['total_sessions'] = colLetter;
      } else if (lower.includes('số buổi còn lại')) {
        suggestedMapping['remaining_sessions'] = colLetter;
      } else if (lower.includes('ngày bắt đầu')) {
        suggestedMapping['start_date'] = colLetter;
      } else if (lower.includes('ngày kết thúc') || lower.includes('kết thúc/bảo lưu')) {
        suggestedMapping['end_date'] = colLetter;
      } else if (lower === 'trạng thái' || lower === 'trạng thái hv') {
        suggestedMapping['status'] = colLetter;
      } else if (lower.includes('mô hình')) {
        suggestedMapping['class_model'] = colLetter;
      } else if (lower.includes('nội dung')) {
        suggestedMapping['course_content'] = colLetter;
      } else if (lower.includes('thanh toán')) {
        suggestedMapping['payment_status'] = colLetter;
      } else if (lower.includes('sale') && !lower.includes('ghi chú')) {
        suggestedMapping['sale_name'] = colLetter;
      } else if (lower.includes('ghi chú sale')) {
        suggestedMapping['sales_note'] = colLetter;
      } else if (lower.includes('ngày nộp học phí')) {
        suggestedMapping['paid_at'] = colLetter;
      } else if (lower.includes('tên lớp')) {
        suggestedMapping['class_name'] = colLetter;
      }
    });

    return { headerRowIdx, headers, suggestedMapping };
  }

  private cellText(cell: ExcelJS.Cell): string {
    let value: any = cell.value;
    if (value && typeof value === 'object') {
      if ('result' in value) value = value.result;
      else if ('text' in value) value = value.text;
      else if ('richText' in value) value = value.richText.map((part: any) => part.text).join('');
    }
    return value === undefined || value === null ? '' : String(value).trim();
  }

  private buildPreview(worksheet: ExcelJS.Worksheet, logical: LogicalSheet, limit = 10): SheetPreviewData {
    const type = logical === 'studentEnrollment' ? ImportType.STUDENT_ENROLLMENT : ImportType.ATTENDANCE;
    const { headerRowIdx, headers, suggestedMapping } = this.detectColumns(worksheet, type);
    const rows: Record<string, unknown>[] = [];
    for (let r = headerRowIdx + 1; r <= worksheet.rowCount && rows.length < limit; r++) {
      const row = worksheet.getRow(r);
      const item: Record<string, unknown> = { _rowNumber: r };
      row.eachCell({ includeEmpty: false }, (cell, col) => { item[worksheet.getColumn(col).letter] = this.cellText(cell); });
      if (Object.keys(item).length > 1) rows.push(item);
    }
    return { sheet: logical, sheetName: worksheet.name, headerRowIndex: headerRowIdx, headers, rows, totalRows: Math.max(0, worksheet.rowCount - headerRowIdx), suggestedMapping };
  }

  private async assertBatchAccess(importId: number, actor?: RequestActor, write = false) {
    if (!actor) return;
    const batch = await this.repo.findBatchById(importId);
    if (!batch) throw new AppError(404, 'Không tìm thấy import batch');
    if (write && batch.uploaded_by_id !== actor.id) throw new AppError(403, 'Chỉ người upload được thay đổi batch');
    if (actor.roles.includes('CS') && batch.uploaded_by_id !== actor.id) throw new AppError(403, 'Batch không thuộc phạm vi dữ liệu');
  }

  private readSheetRows(worksheet: ExcelJS.Worksheet, headerRow: number, mapping: Record<string, string>) {
    const rows: Array<{ rowNumber: number; values: Record<string, string>; raw: Record<string, unknown> }> = [];
    for (let r = headerRow + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const values: Record<string, string> = {};
      for (const [field, col] of Object.entries(mapping)) values[field] = this.cellText(row.getCell(col));
      if (!values.external_id && !values.package_code && !values.full_name) continue;
      const raw: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: false }, (cell, col) => { raw[worksheet.getColumn(col).letter] = this.cellText(cell); });
      rows.push({ rowNumber: r, values, raw });
    }
    return rows;
  }

  private statusFromText(value?: string): EnrollmentStatus {
    const status = (value || '').toLowerCase();
    if (status.includes('bảo lưu')) return EnrollmentStatus.PAUSED;
    if (status.includes('kết thúc') || status.includes('hoàn thành')) return EnrollmentStatus.FINISHED;
    if (status.includes('chờ') || status.includes('sắp học')) return EnrollmentStatus.NOT_STARTED;
    if (status.includes('hủy')) return EnrollmentStatus.CANCELLED;
    return EnrollmentStatus.STUDYING;
  }

  private attendanceStatus(value: string): AttendanceStatus | null {
    const code = value.trim().toUpperCase();
    if (['1', '1.0', '2', '2.0', '3', '3.0', 'X', 'ĐÃ HỌC'].includes(code)) return AttendanceStatus.ATTENDED;
    if (code === 'A') return AttendanceStatus.ABSENT_APPROVED_A;
    if (code === 'B') return AttendanceStatus.LEAVE_B;
    if (code === 'C') return AttendanceStatus.ABSENT_UNAPPROVED_C;
    if (code === 'D') return AttendanceStatus.TEACHER_ABSENT_D;
    if (code === 'E') return AttendanceStatus.TECH_ERROR_E;
    return null;
  }

  // Upload file and initialize draft batch
  async uploadFile(actor: RequestActor, file: Express.Multer.File, importType: ImportType): Promise<UploadResponse> {
    if (!file) {
      throw new AppError(400, 'Không tìm thấy file upload');
    }

    const batch = await this.repo.createBatch({
      uploaded_by_id: actor.id,
      file_name: file.originalname,
      import_type: importType,
      status: ImportBatchStatus.PREVIEW,
    });

    const targetPath = this.getUploadFilePath(batch.id, file.originalname);
    fs.writeFileSync(targetPath, file.buffer);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(targetPath);

    if (importType === ImportType.WORKBOOK) {
      const studentSheet = workbook.worksheets.find((ws) => ws.name.toLowerCase().includes('chăm sóc') || ws.name.startsWith('1.'));
      const attendanceSheet = workbook.worksheets.find((ws) => ws.name.toLowerCase().includes('chấm buổi') || ws.name.startsWith('3.'));
      if (!studentSheet || !attendanceSheet) throw new AppError(400, 'Workbook bắt buộc có đủ sheet 1.Chăm sóc và 3.Chấm buổi');
      const sheets = {
        studentEnrollment: this.buildPreview(studentSheet, 'studentEnrollment'),
        attendance: this.buildPreview(attendanceSheet, 'attendance'),
      };
      this.saveMeta(batch.id, {
        importId: batch.id, fileName: file.originalname, filePath: targetPath, importType, sheets: {
          studentEnrollment: { sheetName: studentSheet.name, headerRowIdx: sheets.studentEnrollment.headerRowIndex, columnMapping: sheets.studentEnrollment.suggestedMapping },
          attendance: { sheetName: attendanceSheet.name, headerRowIdx: sheets.attendance.headerRowIndex, columnMapping: sheets.attendance.suggestedMapping },
        }
      });
      await this.repo.updateBatch(batch.id, { total_rows: sheets.studentEnrollment.totalRows + sheets.attendance.totalRows });
      return { importId: batch.id, fileName: file.originalname, importType, sheets };
    }

    const sheetNames = workbook.worksheets.map((s) => s.name);
    let selectedSheetName = sheetNames[0];

    if (importType === ImportType.STUDENT_ENROLLMENT) {
      const s1 = sheetNames.find((n) => n.toLowerCase().includes('chăm sóc') || n.startsWith('1.'));
      if (s1) selectedSheetName = s1;
    } else if (importType === ImportType.ATTENDANCE) {
      const s3 = sheetNames.find((n) => n.toLowerCase().includes('chấm buổi') || n.startsWith('3.'));
      if (s3) selectedSheetName = s3;
    }

    const worksheet = workbook.getWorksheet(selectedSheetName);
    if (!worksheet) {
      throw new AppError(400, `Không thể mở sheet ${selectedSheetName}`);
    }

    const { headerRowIdx, headers, suggestedMapping } = this.detectColumns(worksheet, importType);

    const previewRows: Record<string, any>[] = [];
    const totalRows = Math.max(0, worksheet.rowCount - headerRowIdx);

    let rowsCount = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIdx) return;
      if (rowsCount >= 10) return;

      const rowObj: Record<string, any> = { _rowNumber: rowNumber };
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const colLetter = worksheet.getColumn(colNumber).letter;
        let val = cell.value;
        if (typeof val === 'object' && val !== null) {
          if ('result' in val) val = (val as any).result;
          else if ('text' in val) val = (val as any).text;
          else if ('richText' in val) val = (val as any).richText.map((t: any) => t.text).join('');
        }
        rowObj[colLetter] = val;
      });

      // Only include if row has at least one cell with value
      if (Object.keys(rowObj).length > 1) {
        previewRows.push(rowObj);
        rowsCount++;
      }
    });

    const meta = {
      importId: batch.id,
      fileName: file.originalname,
      filePath: targetPath,
      importType,
      selectedSheet: selectedSheetName,
      headerRowIdx,
      columnMapping: suggestedMapping,
      headers,
    };
    this.saveMeta(batch.id, meta);

    await this.repo.updateBatch(batch.id, { total_rows: totalRows });

    return {
      importId: batch.id,
      fileName: file.originalname,
      importType,
      sheets: sheetNames,
      selectedSheet: selectedSheetName,
      totalRows,
      preview: {
        sheetName: selectedSheetName,
        headerRowIndex: headerRowIdx,
        headers,
        rows: previewRows,
        totalRows,
        suggestedMapping,
      },
    };
  }

  // Preview specific sheet or reload preview
  async getPreview(importId: number, sheetName?: string, limit = 10, actor?: RequestActor): Promise<SheetPreviewData> {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    await this.assertBatchAccess(importId, actor, true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(meta.filePath);
    if (meta.importType === ImportType.WORKBOOK) {
      const logical = (sheetName || 'studentEnrollment') as LogicalSheet;
      const sheetMeta = meta.sheets?.[logical];
      if (!sheetMeta) throw new AppError(400, 'Sheet logic không hợp lệ');
      const ws = workbook.getWorksheet(sheetMeta.sheetName);
      if (!ws) throw new AppError(400, `Không tìm thấy sheet ${sheetMeta.sheetName}`);
      return this.buildPreview(ws, logical, limit);
    }

    const targetSheet = sheetName || meta.selectedSheet;
    const worksheet = workbook.getWorksheet(targetSheet);
    if (!worksheet) throw new AppError(400, `Không tìm thấy sheet ${targetSheet}`);

    const { headerRowIdx, headers, suggestedMapping } = this.detectColumns(worksheet, meta.importType);

    const previewRows: Record<string, any>[] = [];
    let rowsCount = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIdx) return;
      if (rowsCount >= limit) return;

      const rowObj: Record<string, any> = { _rowNumber: rowNumber };
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const colLetter = worksheet.getColumn(colNumber).letter;
        let val = cell.value;
        if (typeof val === 'object' && val !== null) {
          if ('result' in val) val = (val as any).result;
          else if ('text' in val) val = (val as any).text;
          else if ('richText' in val) val = (val as any).richText.map((t: any) => t.text).join('');
        }
        rowObj[colLetter] = val;
      });

      if (Object.keys(rowObj).length > 1) {
        previewRows.push(rowObj);
        rowsCount++;
      }
    });

    meta.selectedSheet = targetSheet;
    meta.headerRowIdx = headerRowIdx;
    meta.headers = headers;
    this.saveMeta(importId, meta);

    const totalRows = Math.max(0, worksheet.rowCount - headerRowIdx);

    return {
      sheetName: targetSheet,
      headerRowIndex: headerRowIdx,
      headers,
      rows: previewRows,
      totalRows,
      suggestedMapping,
    };
  }

  // Save column mapping
  async saveMapping(importId: number, dto: SaveMappingDTO, actor?: RequestActor) {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    await this.assertBatchAccess(importId, actor, true);
    if (meta.importType === ImportType.WORKBOOK) {
      if (!dto.sheet || !meta.sheets?.[dto.sheet]) throw new AppError(400, 'sheet phải là studentEnrollment hoặc attendance');
      if (!dto.columnMapping.external_id || !dto.columnMapping.package_code) throw new AppError(400, 'ID và Gói học là mapping bắt buộc');
      meta.sheets[dto.sheet].headerRowIdx = dto.headerRowIndex || meta.sheets[dto.sheet].headerRowIdx;
      meta.sheets[dto.sheet].columnMapping = { ...meta.sheets[dto.sheet].columnMapping, ...dto.columnMapping };
      this.saveMeta(importId, meta);
      return { success: true, columnMapping: meta.sheets[dto.sheet].columnMapping };
    }

    if (dto.sheetName) meta.selectedSheet = dto.sheetName;
    if (dto.headerRowIndex) meta.headerRowIdx = dto.headerRowIndex;
    meta.columnMapping = { ...meta.columnMapping, ...dto.columnMapping };

    this.saveMeta(importId, meta);
    return { success: true, columnMapping: meta.columnMapping };
  }

  // Validate import rows
  async validate(importId: number, actor?: RequestActor): Promise<ValidationReport> {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    await this.assertBatchAccess(importId, actor, true);
    if (meta.importType === ImportType.WORKBOOK) return this.validateWorkbook(importId, meta);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(meta.filePath);

    const worksheet = workbook.getWorksheet(meta.selectedSheet);
    if (!worksheet) throw new AppError(400, `Không tìm thấy sheet ${meta.selectedSheet}`);

    const mapping = meta.columnMapping || {};
    const headerRowIdx = meta.headerRowIdx || 1;

    const errors: ValidationErrorItem[] = [];
    const warnings: ValidationWarningItem[] = [];
    const seenExternalIds = new Set<string>();
    let newStudentsList: { externalId?: string; fullName: string; className?: string; rowNumber: number }[] | undefined = undefined;
    let matchedStudentsCount: number | undefined = undefined;

    let totalDataRows = 0;
    let invalidRowsCount = 0;

    if (meta.importType === ImportType.STUDENT_ENROLLMENT) {
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowIdx) return;

        const getColVal = (field: string) => {
          const colLetter = mapping[field];
          if (!colLetter) return null;
          const cell = row.getCell(colLetter);
          let val = cell.value;
          if (typeof val === 'object' && val !== null) {
            if ('result' in val) val = (val as any).result;
            else if ('text' in val) val = (val as any).text;
            else if ('richText' in val) val = (val as any).richText.map((t: any) => t.text).join('');
          }
          return val !== undefined && val !== null ? String(val).trim() : null;
        };

        const fullName = getColVal('full_name');
        const extId = getColVal('external_id');
        const email = getColVal('email');
        const phone = getColVal('phone');
        const totalSessions = getColVal('total_sessions');

        // Check if row is completely empty
        if (!fullName && !extId && !email && !phone) return;
        totalDataRows++;

        let rowHasError = false;

        if (!fullName) {
          errors.push({ rowNumber, field: 'full_name', message: 'Họ tên học viên là bắt buộc' });
          rowHasError = true;
        }

        if (extId) {
          if (seenExternalIds.has(extId)) {
            errors.push({ rowNumber, field: 'external_id', message: `Trùng lặp ID học viên [${extId}] trong file Excel` });
            rowHasError = true;
          } else {
            seenExternalIds.add(extId);
          }
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          warnings.push({ rowNumber, field: 'email', message: `Email không đúng định dạng chuẩn: ${email}` });
        }

        if (totalSessions && isNaN(parseInt(totalSessions, 10))) {
          errors.push({ rowNumber, field: 'total_sessions', message: `Tổng số buổi phải là số nguyên: ${totalSessions}` });
          rowHasError = true;
        }

        if (rowHasError) invalidRowsCount++;
      });
    } else if (meta.importType === ImportType.ATTENDANCE) {
      // Find date columns in header row
      const dateCols: { col: string; date: Date }[] = [];
      const headerRow = worksheet.getRow(headerRowIdx);
      headerRow.eachCell((cell, colNumber) => {
        const colLetter = worksheet.getColumn(colNumber).letter;
        const parsedDate = this.parseExcelDate(cell.value);
        if (parsedDate) {
          dateCols.push({ col: colLetter, date: parsedDate });
        }
      });

      const extIdCol = mapping['external_id'] || 'A';
      const fullNameCol = mapping['full_name'] || 'B';
      const classNameCol = mapping['class_name'] || 'W';

      newStudentsList = [];
      matchedStudentsCount = 0;

      for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const extIdRaw = row.getCell(extIdCol).value;
        const extId = extIdRaw !== undefined && extIdRaw !== null ? String(extIdRaw).trim() : '';

        const fullNameRaw = row.getCell(fullNameCol).value;
        const fullName = fullNameRaw !== undefined && fullNameRaw !== null ? String(fullNameRaw).trim() : '';

        const classNameRaw = row.getCell(classNameCol).value;
        const className = classNameRaw !== undefined && classNameRaw !== null ? String(classNameRaw).trim() : '';

        if (!extId && !fullName) continue;
        totalDataRows++;

        let rowHasError = false;

        // Check if student exists in database
        const existingStudent = await this.repo.findStudentByExternalIdOrName(extId, fullName);
        if (existingStudent) {
          matchedStudentsCount++;
        } else {
          newStudentsList.push({
            externalId: extId || undefined,
            fullName: fullName || extId || `Học viên dòng ${r}`,
            className: className || undefined,
            rowNumber: r,
          });
        }

        // Check attendance entries in date columns
        for (const dc of dateCols) {
          const val = row.getCell(dc.col).value;
          if (val !== undefined && val !== null && String(val).trim()) {
            const strVal = String(val).trim().toUpperCase();
            const validCodes = ['1', '1.0', '2', '2.0', '3', '3.0', '0', '0.0', 'A', 'B', 'C', 'D', 'E', 'X', 'ĐÃ HỌC'];
            if (!validCodes.includes(strVal)) {
              errors.push({
                rowNumber: r,
                field: `Cột ${dc.col}`,
                message: `Giá trị điểm danh không hợp lệ: "${String(val).trim()}" tại ngày ${dc.date.toISOString().split('T')[0]}`,
              });
              rowHasError = true;
            }
          }
        }

        if (rowHasError) invalidRowsCount++;
      }
    }

    const report: ValidationReport = {
      totalRows: totalDataRows,
      validRows: Math.max(0, totalDataRows - invalidRowsCount),
      invalidRows: invalidRowsCount,
      errors,
      warnings,
      newStudents: newStudentsList && newStudentsList.length > 0 ? newStudentsList : undefined,
      matchedCount: matchedStudentsCount,
    };

    meta.validationReport = report;
    this.saveMeta(importId, meta);

    return report;
  }

  private async validateWorkbook(importId: number, meta: any): Promise<ValidationReport> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(meta.filePath);
    const s1 = meta.sheets.studentEnrollment;
    const s3 = meta.sheets.attendance;
    const ws1 = workbook.getWorksheet(s1.sheetName)!;
    const ws3 = workbook.getWorksheet(s3.sheetName)!;
    const rows1 = this.readSheetRows(ws1, s1.headerRowIdx, s1.columnMapping);
    const rows3 = this.readSheetRows(ws3, s3.headerRowIdx, s3.columnMapping);
    const byKey1 = new Map<string, typeof rows1[number]>();
    const byKey3 = new Map<string, typeof rows3[number]>();
    const duplicateKeys = new Set<string>();
    const add = (map: Map<string, any>, row: any) => {
      const key = `${row.values.external_id}::${row.values.package_code}`;
      if (map.has(key)) duplicateKeys.add(key); else map.set(key, row);
    };
    rows1.forEach((row) => add(byKey1, row)); rows3.forEach((row) => add(byKey3, row));
    const keys = new Set([...byKey1.keys(), ...byKey3.keys()]);
    const items: ReconcileItem[] = [];
    for (const key of keys) {
      const one = byKey1.get(key); const three = byKey3.get(key);
      const source = one || three;
      if (!source) continue;
      const externalId = source.values.external_id; const packageCode = source.values.package_code;
      const errors: string[] = []; const warnings: string[] = [];
      if (!externalId || !packageCode) errors.push('ID và Gói học là bắt buộc');
      if (!one) errors.push('Thiếu khóa tương ứng ở Sheet 1');
      if (duplicateKeys.has(key)) errors.push('Trùng ID + Gói học trong cùng sheet');
      if (one && three && one.values.full_name && three.values.full_name && one.values.full_name !== three.values.full_name) warnings.push('Họ tên giữa hai sheet khác nhau; ưu tiên Sheet 1');
      const student = externalId ? await prisma.student.findUnique({ where: { external_id: externalId }, include: { enrollments: { where: { package: { code: packageCode } }, include: { package: true, enrollment_classes: { include: { class: true } } }, orderBy: { created_at: 'desc' } } } }) : null;
      const pkg = packageCode ? await prisma.package.findUnique({ where: { code: packageCode } }) : null;
      const enrollment = student?.enrollments[0];
      if (student && student.enrollments.length > 1) errors.push('Có nhiều ghi danh cùng ID + Gói học');
      const snapshot: Record<string, unknown> = { ...(one?.values || {}), class_name: three?.values.class_name || one?.values.class_name || '', attendance: [] };
      const header = ws3.getRow(s3.headerRowIdx);
      const attendance: any[] = [];
      if (three) header.eachCell((cell, col) => { const date = this.parseExcelDate(cell.value); if (date) attendance.push({ date: date.toISOString(), value: this.cellText(ws3.getRow(three.rowNumber).getCell(col)) }); });
      snapshot.attendance = attendance;
      const diffs: any[] = [];
      const compare = (entity: string, field: string, before: unknown, after: unknown) => { if ((before ?? '') !== (after ?? '')) diffs.push({ entity, field, before, after: after === '' ? null : after, action: after === '' ? 'NULLIFY' : 'UPDATE' }); };
      if (student) { compare('Student', 'full_name', student.full_name, snapshot.full_name); compare('Student', 'phone', student.phone, snapshot.phone); compare('Student', 'email', student.email, snapshot.email); }
      if (enrollment) { compare('Enrollment', 'total_sessions', enrollment.total_sessions, Number(snapshot.total_sessions) || 0); compare('Enrollment', 'external_remaining_sessions', enrollment.external_remaining_sessions, snapshot.remaining_sessions === '' ? null : Number(snapshot.remaining_sessions)); }
      let classification: any = errors.length ? 'INVALID' : (!student || !enrollment || !pkg) ? 'REQUEST_CREATE' : 'UPDATE';
      if (student && !enrollment) classification = 'REQUEST_CREATE';
      items.push({ key, externalId, packageCode, classification, sheet1Row: one?.rowNumber, sheet3Row: three?.rowNumber, snapshot, baseline: student ? { studentId: student.id, studentUpdatedAt: student.updated_at.toISOString(), enrollmentId: enrollment?.id, enrollmentUpdatedAt: enrollment?.updated_at.toISOString() } : undefined, diffs, attendanceDiffs: attendance.map((a) => ({ entity: 'Attendance', field: a.date.slice(0, 10), before: null, after: a.value || null, action: a.value ? 'UPSERT' : 'SOFT_DELETE' })), warnings, errors });
    }
    const summary = { totalKeys: items.length, willUpdate: items.filter(i => i.classification === 'UPDATE').length, willRequestCreate: items.filter(i => i.classification === 'REQUEST_CREATE').length, conflict: items.filter(i => i.classification === 'CONFLICT').length, invalid: items.filter(i => i.classification === 'INVALID').length };
    const report: ValidationReport = { summary, items };
    meta.validationReport = report; this.saveMeta(importId, meta); return report;
  }

  private async applyAttendance(tx: Prisma.TransactionClient, enrollmentClassId: number, classId: number, entries: any[], userId: number) {
    for (const entry of entries || []) {
      const date = new Date(entry.date); if (isNaN(date.getTime())) continue;
      let session = await tx.classSession.findFirst({ where: { class_id: classId, session_date: date } });
      if (!session && entry.value) {
        const last = await tx.classSession.findFirst({ where: { class_id: classId }, orderBy: { session_number: 'desc' } });
        session = await tx.classSession.create({ data: { class_id: classId, session_number: (last?.session_number || 0) + 1, session_date: date, created_by_id: userId } });
      }
      if (!session) continue;
      const status = this.attendanceStatus(entry.value || '');
      if (status) await tx.attendance.upsert({ where: { enrollment_class_id_class_session_id: { enrollment_class_id: enrollmentClassId, class_session_id: session.id } }, update: { status, source: AttendanceSource.EXCEL_IMPORT, deleted_at: null, deleted_by_id: null }, create: { enrollment_class_id: enrollmentClassId, class_session_id: session.id, status, source: AttendanceSource.EXCEL_IMPORT, created_by_id: userId } });
      else await tx.attendance.updateMany({ where: { enrollment_class_id: enrollmentClassId, class_session_id: session.id, deleted_at: null }, data: { deleted_at: new Date(), deleted_by_id: userId } });
    }
  }

  private async confirmWorkbook(importId: number, actor: RequestActor, skipErrors: boolean, meta: any) {
    const report: ValidationReport = meta.validationReport || await this.validateWorkbook(importId, meta);
    const items = report.items || [];
    if (!skipErrors && items.some(i => i.classification === 'INVALID' || i.classification === 'CONFLICT')) throw new AppError(400, 'Còn khóa lỗi hoặc conflict');
    await this.repo.updateBatch(importId, { status: ImportBatchStatus.PROCESSING }); await this.repo.clearPendingImportRows(importId);
    let successRows = 0, failedRows = 0;
    for (const item of items) {
      if (item.classification === 'INVALID' || item.classification === 'CONFLICT') { failedRows++; continue; }
      try {
        if (item.classification === 'REQUEST_CREATE') {
          await prisma.importCreateRequest.upsert({ where: { import_batch_id_external_id_package_code: { import_batch_id: importId, external_id: item.externalId, package_code: item.packageCode } }, update: { snapshot: item.snapshot as Prisma.InputJsonValue, baseline: item.baseline as Prisma.InputJsonValue | undefined, requested_by_id: actor.id, assigned_cs_id: actor.id, status: ImportCreateRequestStatus.PENDING, version: { increment: 1 } }, create: { import_batch_id: importId, external_id: item.externalId, package_code: item.packageCode, requested_by_id: actor.id, assigned_cs_id: actor.id, snapshot: item.snapshot as Prisma.InputJsonValue, baseline: item.baseline as Prisma.InputJsonValue | undefined } });
        } else await prisma.$transaction(async (tx) => {
          const student = await tx.student.findUnique({ where: { external_id: item.externalId } }); if (!student) throw new Error('Student không còn tồn tại');
          const pkg = await tx.package.findUnique({ where: { code: item.packageCode } }); if (!pkg) throw new Error('Gói học không tồn tại');
          const enrollment = await tx.enrollment.findFirst({ where: { student_id: student.id, package_id: pkg.id }, include: { enrollment_classes: { include: { class: true }, orderBy: { sequence_no: 'desc' } } }, orderBy: { created_at: 'desc' } }); if (!enrollment) throw new Error('Ghi danh không tồn tại');
          const snap: any = item.snapshot;
          await tx.student.update({ where: { id: student.id }, data: { full_name: snap.full_name || student.full_name, phone: snap.phone || null, email: snap.email || null, gender: snap.gender || null, occupation: snap.occupation || null } });
          await tx.enrollment.update({ where: { id: enrollment.id }, data: { total_sessions: Number(snap.total_sessions) || enrollment.total_sessions, external_remaining_sessions: snap.remaining_sessions === '' ? null : Number(snap.remaining_sessions), level: snap.level || null, status: this.statusFromText(snap.status), start_date: this.parseExcelDate(snap.start_date), end_date: this.parseExcelDate(snap.end_date), external_synced_at: new Date() } });
          let ec = enrollment.enrollment_classes[0];
          if (snap.class_name && (!ec || ec.class.class_name !== snap.class_name)) { let cls = await tx.class.findFirst({ where: { OR: [{ class_name: snap.class_name }, { class_code: snap.class_name }] } }); if (!cls) cls = await tx.class.create({ data: { class_name: snap.class_name, class_code: snap.class_name, model_type: 'ONE_TO_ONE', attendance_source: 'LEARNING_SYSTEM' } }); ec = await tx.enrollmentClass.create({ data: { enrollment_id: enrollment.id, class_id: cls.id, sequence_no: (ec?.sequence_no || 0) + 1, status: EnrollmentClassStatus.ACTIVE }, include: { class: true } }); }
          if (ec) await this.applyAttendance(tx, ec.id, ec.class_id, snap.attendance, actor.id);
        });
        successRows++;
      } catch (error: any) { failedRows++; await this.repo.createImportRows([{ import_batch_id: importId, row_number: item.sheet1Row || item.sheet3Row || 0, raw_data: item.snapshot, status: ImportRowStatus.FAILED, error_message: error.message }]); }
    }
    const status = failedRows ? (successRows ? ImportBatchStatus.PARTIAL_FAILED : ImportBatchStatus.FAILED) : ImportBatchStatus.COMPLETED;
    return this.repo.updateBatch(importId, { status, total_rows: items.length, success_rows: successRows, failed_rows: failedRows, completed_at: new Date() });
  }

  // Execute import
  async confirmImport(importId: number, actor: RequestActor, skipErrors = true, createMissingStudents = false) {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    await this.assertBatchAccess(importId, actor, true);
    if (meta.importType === ImportType.WORKBOOK) return this.confirmWorkbook(importId, actor, skipErrors, meta);

    const batch = await this.repo.findBatchById(importId);
    if (!batch) throw new AppError(404, 'Không tìm thấy import batch trong cơ sở dữ liệu');

    await this.repo.updateBatch(importId, { status: ImportBatchStatus.PROCESSING });
    await this.repo.clearPendingImportRows(importId);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(meta.filePath);

    const worksheet = workbook.getWorksheet(meta.selectedSheet);
    if (!worksheet) throw new AppError(400, `Không tìm thấy sheet ${meta.selectedSheet}`);

    const mapping = meta.columnMapping || {};
    const headerRowIdx = meta.headerRowIdx || 1;

    let successRows = 0;
    let failedRows = 0;
    const defaultCS = await this.repo.findDefaultCSUser();
    const userId = actor.id;
    const fallbackCSId = defaultCS ? defaultCS.id : userId;

    if (meta.importType === ImportType.STUDENT_ENROLLMENT) {
      // Process rows
      const rowPromises: Promise<any>[] = [];

      for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const getColVal = (field: string) => {
          const colLetter = mapping[field];
          if (!colLetter) return null;
          const cell = row.getCell(colLetter);
          let val = cell.value;
          if (typeof val === 'object' && val !== null) {
            if ('result' in val) val = (val as any).result;
            else if ('text' in val) val = (val as any).text;
            else if ('richText' in val) val = (val as any).richText.map((t: any) => t.text).join('');
          }
          return val !== undefined && val !== null ? String(val).trim() : null;
        };

        const fullName = getColVal('full_name');
        const extId = getColVal('external_id');
        const email = getColVal('email');
        const phone = getColVal('phone');

        if (!fullName && !extId && !email && !phone) continue;

        const rawData: Record<string, any> = {};
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          rawData[worksheet.getColumn(colNumber).letter] = cell.value;
        });

        if (!fullName) {
          failedRows++;
          await this.repo.createImportRows([{
            import_batch_id: importId,
            row_number: r,
            raw_data: rawData,
            status: ImportRowStatus.FAILED,
            error_message: 'Họ tên học viên là bắt buộc',
          }]);
          continue;
        }

        try {
          const gender = getColVal('gender');
          const occupation = getColVal('occupation');
          const dob = this.parseExcelDate(getColVal('date_of_birth'));
          const salesNote = getColVal('sales_note');
          const note = salesNote ? `Ghi chú sale: ${salesNote}` : null;

          // 1. Upsert Student
          const student = await this.repo.upsertStudent({
            external_id: extId || undefined,
            full_name: fullName,
            gender: gender || null,
            phone: phone || null,
            email: email || null,
            date_of_birth: dob,
            occupation: occupation || null,
            note,
          });

          // 2. Package
          const packageCode = getColVal('package_code') || 'DEFAULT';
          const totalSessionsRaw = parseInt(getColVal('total_sessions') || '30', 10);
          const totalSessions = isNaN(totalSessionsRaw) ? 30 : totalSessionsRaw;
          const pkg = await this.repo.createPackageIfNotExist(packageCode, totalSessions);

          // 3. Status mapping
          const statusRaw = (getColVal('status') || '').toLowerCase();
          let status: EnrollmentStatus = EnrollmentStatus.STUDYING;
          if (statusRaw.includes('bảo lưu')) status = EnrollmentStatus.PAUSED;
          else if (statusRaw.includes('kết thúc') || statusRaw.includes('hoàn thành')) status = EnrollmentStatus.FINISHED;
          else if (statusRaw.includes('chờ') || statusRaw.includes('sắp học')) status = EnrollmentStatus.NOT_STARTED;
          else if (statusRaw.includes('hủy')) status = EnrollmentStatus.CANCELLED;

          const startDate = this.parseExcelDate(getColVal('start_date'));
          const endDate = this.parseExcelDate(getColVal('end_date'));
          const paidAt = this.parseExcelDate(getColVal('paid_at'));
          const remainingSessionsRaw = parseInt(getColVal('remaining_sessions') || '0', 10);
          const remainingSessions = isNaN(remainingSessionsRaw) ? null : remainingSessionsRaw;

          // 4. Create Enrollment
          const enrollment = await this.repo.createEnrollment({
            external_id: extId || undefined,
            student_id: student.id,
            package_id: pkg.id,
            cs_id: fallbackCSId,
            paid_at: paidAt,
            sale_name: getColVal('sale_name'),
            student_source_status: getColVal('student_source_status'),
            course_content: getColVal('course_content'),
            payment_status: getColVal('payment_status'),
            course_teacher_type: getColVal('course_teacher_type'),
            level: getColVal('level'),
            total_sessions: totalSessions,
            class_model: getColVal('class_model'),
            sales_note: salesNote,
            start_date: startDate,
            end_date: endDate,
            status,
            external_remaining_sessions: remainingSessions,
          });

          // 5. Class & EnrollmentClass
          const className = getColVal('class_name') || `Lớp ${student.full_name}`;
          const cls = await this.repo.createClassIfNotExist(className, getColVal('level') || undefined);

          await this.repo.createEnrollmentClass({
            enrollment_id: enrollment.id,
            class_id: cls.id,
            sequence_no: 1,
            start_date: startDate,
            end_date: endDate,
            status: EnrollmentClassStatus.ACTIVE,
          });

          successRows++;
          await this.repo.createImportRows([{
            import_batch_id: importId,
            row_number: r,
            raw_data: rawData,
            status: ImportRowStatus.SUCCESS,
            entity_type: 'Enrollment',
            entity_id: String(enrollment.id),
          }]);
        } catch (err: any) {
          failedRows++;
          await this.repo.createImportRows([{
            import_batch_id: importId,
            row_number: r,
            raw_data: rawData,
            status: ImportRowStatus.FAILED,
            error_message: err.message || 'Lỗi không xác định khi lưu dòng',
          }]);
        }
      }
    } else if (meta.importType === ImportType.ATTENDANCE) {
      // Find date columns
      const dateCols: { col: string; date: Date }[] = [];
      const headerRow = worksheet.getRow(headerRowIdx);
      headerRow.eachCell((cell, colNumber) => {
        const colLetter = worksheet.getColumn(colNumber).letter;
        const parsedDate = this.parseExcelDate(cell.value);
        if (parsedDate) {
          dateCols.push({ col: colLetter, date: parsedDate });
        }
      });

      const extIdCol = mapping['external_id'] || 'A';
      const fullNameCol = mapping['full_name'] || 'B';
      const classNameCol = mapping['class_name'] || 'W';

      for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const extIdRaw = row.getCell(extIdCol).value;
        const extId = extIdRaw !== undefined && extIdRaw !== null ? String(extIdRaw).trim() : '';

        const fullNameRaw = row.getCell(fullNameCol).value;
        const fullName = fullNameRaw !== undefined && fullNameRaw !== null ? String(fullNameRaw).trim() : '';

        const classNameRaw = row.getCell(classNameCol).value;
        const className = classNameRaw !== undefined && classNameRaw !== null ? String(classNameRaw).trim() : '';

        if (!extId && !fullName) continue;

        const rawData: Record<string, any> = {};
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          rawData[worksheet.getColumn(colNumber).letter] = cell.value;
        });

        try {
          let student = await this.repo.findStudentByExternalIdOrName(extId, fullName);
          if (!student) {
            if (createMissingStudents) {
              const studentName = fullName || extId || `Học viên dòng ${r}`;
              await this.repo.upsertStudent({
                external_id: extId || undefined,
                full_name: studentName,
              });

              student = await this.repo.findStudentByExternalIdOrName(extId, fullName);
              if (!student) {
                throw new Error(`Không thể khởi tạo thông tin cho học viên [${studentName}]`);
              }

              const pkg = await this.repo.createPackageIfNotExist('DEFAULT', 30);
              const enrollment = await this.repo.createEnrollment({
                external_id: extId || undefined,
                student_id: student.id,
                package_id: pkg.id,
                cs_id: fallbackCSId,
                total_sessions: 30,
                status: EnrollmentStatus.STUDYING,
              });
              const clsName = className || `Lớp ${studentName}`;
              const cls = await this.repo.createClassIfNotExist(clsName);
              await this.repo.createEnrollmentClass({
                enrollment_id: enrollment.id,
                class_id: cls.id,
                sequence_no: 1,
                status: EnrollmentClassStatus.ACTIVE,
              });

              student = await this.repo.findStudentByExternalIdOrName(extId, fullName);
            } else {
              throw new Error(`Học viên với ID [${extId || fullName}] không tìm thấy trong hệ thống`);
            }
          }

          let enrollmentClass = await this.repo.findActiveEnrollmentClassByStudentId(student!.id);
          if (!enrollmentClass) {
            // Find enrollment
            const enrollment = student!.enrollments[0];
            if (!enrollment) {
              throw new Error(`Học viên [${student!.full_name}] chưa có gói học nào`);
            }
            const defaultClass = await this.repo.createClassIfNotExist(className || `Lớp ${student!.full_name}`);
            enrollmentClass = (await this.repo.createEnrollmentClass({
              enrollment_id: enrollment.id,
              class_id: defaultClass.id,
              sequence_no: 1,
              status: EnrollmentClassStatus.ACTIVE,
            })) as any;
          }

          let markedCount = 0;
          for (const dc of dateCols) {
            const val = row.getCell(dc.col).value;
            if (val !== undefined && val !== null && String(val).trim()) {
              const strVal = String(val).trim().toUpperCase();
              let attStatus: AttendanceStatus | null = null;

              if (['1', '1.0', '2', '2.0', '3', '3.0', 'X', 'ĐÃ HỌC'].includes(strVal)) {
                attStatus = AttendanceStatus.ATTENDED;
              } else if (strVal === 'A') {
                attStatus = AttendanceStatus.ABSENT_APPROVED_A;
              } else if (strVal === 'B') {
                attStatus = AttendanceStatus.LEAVE_B;
              } else if (strVal === 'C') {
                attStatus = AttendanceStatus.ABSENT_UNAPPROVED_C;
              } else if (strVal === 'D') {
                attStatus = AttendanceStatus.TEACHER_ABSENT_D;
              } else if (strVal === 'E') {
                attStatus = AttendanceStatus.TECH_ERROR_E;
              }

              if (attStatus) {
                const session = await this.repo.findOrCreateClassSession(
                  enrollmentClass!.class_id,
                  dc.date,
                  userId
                );

                await this.repo.upsertAttendance({
                  enrollment_class_id: enrollmentClass!.id,
                  class_session_id: session.id,
                  status: attStatus,
                  source: AttendanceSource.EXCEL_IMPORT,
                  created_by_id: userId,
                });
                markedCount++;
              }
            }
          }

          successRows++;
          await this.repo.createImportRows([{
            import_batch_id: importId,
            row_number: r,
            raw_data: rawData,
            status: ImportRowStatus.SUCCESS,
            entity_type: 'Attendance',
            entity_id: `Student_${student!.id}_marked_${markedCount}`,
          }]);
        } catch (err: any) {
          failedRows++;
          await this.repo.createImportRows([{
            import_batch_id: importId,
            row_number: r,
            raw_data: rawData,
            status: ImportRowStatus.FAILED,
            error_message: err.message || 'Lỗi không xác định khi điểm danh',
          }]);
        }
      }
    }

    const totalProcessed = successRows + failedRows;
    let finalStatus: ImportBatchStatus = ImportBatchStatus.COMPLETED;
    if (failedRows > 0 && successRows > 0) {
      finalStatus = ImportBatchStatus.PARTIAL_FAILED;
    } else if (failedRows > 0 && successRows === 0) {
      finalStatus = ImportBatchStatus.FAILED;
    }

    const updatedBatch = await this.repo.updateBatch(importId, {
      status: finalStatus,
      total_rows: totalProcessed,
      success_rows: successRows,
      failed_rows: failedRows,
      completed_at: new Date(),
    });

    await this.repo.createAuditLog({
      user_id: userId,
      action: 'IMPORT_EXECUTE',
      entity_type: 'ImportBatch',
      entity_id: String(importId),
      after_data: {
        total: totalProcessed,
        success: successRows,
        failed: failedRows,
        status: finalStatus,
      },
    });

    return updatedBatch;
  }

  // Get batch by ID
  async getBatch(importId: number, actor?: RequestActor) {
    const batch = await this.repo.findBatchById(importId);
    if (!batch) throw new AppError(404, 'Không tìm thấy import batch');
    return batch;
  }

  // List batches
  async listBatches(limit = 20, offset = 0, actor?: RequestActor) {
    const [items, total] = await Promise.all([
      this.repo.listBatches(limit, offset),
      this.repo.countBatches(),
    ]);
    return { items, total };
  }

  // Get error rows or generate error excel
  async getErrors(importId: number, download = false, actor?: RequestActor) {
    const batch = await this.repo.findBatchById(importId);
    if (!batch) throw new AppError(404, 'Không tìm thấy import batch');

    const errorRows = await this.repo.findImportRows(importId, ImportRowStatus.FAILED);

    if (!download) {
      return errorRows;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Lỗi Import');

    worksheet.columns = [
      { header: 'Dòng Excel', key: 'row_number', width: 12 },
      { header: 'Nguyên nhân lỗi', key: 'error_message', width: 45 },
      { header: 'Dữ liệu gốc (JSON)', key: 'raw_data', width: 60 },
    ];

    errorRows.forEach((r) => {
      worksheet.addRow({
        row_number: r.row_number,
        error_message: r.error_message || '',
        raw_data: JSON.stringify(r.raw_data),
      });
    });

    // Style headers
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE53E3E' },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  // Generate standard templates for Sheet 1 and Sheet 3
  async getTemplate(type: string): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();

    if (type === 'student_enrollment') {
      const ws = workbook.addWorksheet('1.Chăm sóc');
      ws.addRow(['ID', 'Ngày nộp học phí', 'Sale', 'Trạng thái HV', 'Họ tên HV', 'Giới tính', 'SĐT', 'Email', 'Gói học', 'Trình độ', 'Tổng số buổi', 'Số buổi còn lại', 'Ngày bắt đầu học', 'Trạng thái', 'Ngày kết thúc/Bảo lưu', 'Tên lớp']);
      ws.addRow(['420274574', '2026-01-15', 'SaleA', 'HV mới', 'Nguyễn Văn A', 'Nam', '0912345678', 'nguyenvana@gmail.com', 'SKAI231030VN', 'Kaiwa 1', 30, 30, '2026-01-20', 'Đang học', '', 'Lớp Kaiwa 1 N3']);
      ws.getRow(1).font = { bold: true };
    } else {
      const ws = workbook.addWorksheet('3.Chấm buổi');
      ws.addRow(['ID', 'Họ tên HV', 'Gói học', 'Tên lớp', '2026-01-20', '2026-01-22', '2026-01-24', '2026-01-26']);
      ws.addRow(['420274574', 'Nguyễn Văn A', 'SKAI231030VN', 'Lớp Kaiwa 1 N3', '1', '1', 'A', '1']);
      ws.getRow(1).font = { bold: true };
    }

    return workbook.xlsx.writeBuffer();
  }

  // Export current students & enrollments
  async exportStudents(actor?: RequestActor): Promise<ExcelJS.Buffer> {
    const students = await this.repo.getAllStudentsWithEnrollments();
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Danh sách học viên');

    ws.columns = [
      { header: 'ID (External)', key: 'external_id', width: 16 },
      { header: 'Họ tên', key: 'full_name', width: 25 },
      { header: 'SĐT', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Giới tính', key: 'gender', width: 10 },
      { header: 'Gói học', key: 'package', width: 18 },
      { header: 'Tổng buổi', key: 'total_sessions', width: 12 },
      { header: 'Buổi còn lại', key: 'remaining_sessions', width: 14 },
      { header: 'Trạng thái', key: 'status', width: 15 },
      { header: 'CS phụ trách', key: 'cs_name', width: 20 },
      { header: 'Lớp hiện tại', key: 'class_name', width: 20 },
      { header: 'Ngày bắt đầu', key: 'start_date', width: 14 },
    ];

    students.forEach((s) => {
      const enr = s.enrollments[0];
      const enrClass = enr?.enrollment_classes[0];
      ws.addRow({
        external_id: s.external_id || '',
        full_name: s.full_name,
        phone: s.phone || '',
        email: s.email || '',
        gender: s.gender || '',
        package: enr?.package?.code || '',
        total_sessions: enr?.total_sessions || 0,
        remaining_sessions: enr?.external_remaining_sessions ?? '',
        status: enr?.status || '',
        cs_name: enr?.cs?.name || '',
        class_name: enrClass?.class?.class_name || '',
        start_date: enr?.start_date ? enr.start_date.toISOString().split('T')[0] : '',
      });
    });

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };

    return workbook.xlsx.writeBuffer();
  }

  // Export current attendance
  async exportAttendance(actor?: RequestActor): Promise<ExcelJS.Buffer> {
    const attendances = await this.repo.getAllAttendances();
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Danh sách điểm danh');

    ws.columns = [
      { header: 'ID Học viên', key: 'external_id', width: 16 },
      { header: 'Tên học viên', key: 'student_name', width: 25 },
      { header: 'Lớp học', key: 'class_name', width: 20 },
      { header: 'Buổi số', key: 'session_number', width: 12 },
      { header: 'Ngày học', key: 'session_date', width: 15 },
      { header: 'Trạng thái điểm danh', key: 'status', width: 22 },
      { header: 'Nguồn điểm danh', key: 'source', width: 16 },
      { header: 'Người thực hiện', key: 'created_by', width: 20 },
    ];

    attendances.forEach((a) => {
      const student = a.enrollment_class.enrollment.student;
      ws.addRow({
        external_id: student.external_id || '',
        student_name: student.full_name,
        class_name: a.enrollment_class.class.class_name,
        session_number: a.class_session.session_number,
        session_date: a.class_session.session_date.toISOString().split('T')[0],
        status: a.status,
        source: a.source,
        created_by: a.created_by.name || a.created_by.email,
      });
    });

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };

    return workbook.xlsx.writeBuffer();
  }
  private async requestScope(actor: RequestActor): Promise<Prisma.ImportCreateRequestWhereInput> {
    if (actor.roles.includes('ADMIN')) return {};
    if (actor.roles.includes('CS')) return { OR: [{ requested_by_id: actor.id }, { assigned_cs_id: actor.id }] };
    if (actor.roles.includes('MANAGE')) {
      const members = await prisma.cSGroupMember.findMany({ where: { cs_group: { assignments: { some: { manage_user_id: actor.id } } } }, select: { user_id: true } });
      const ids = members.map((x) => x.user_id);
      return { OR: [{ requested_by_id: { in: ids } }, { assigned_cs_id: { in: ids } }] };
    }
    return { id: -1 };
  }

  private ensureReviewer(actor: RequestActor) {
    if (!actor.roles.some((r) => r === 'ADMIN' || r === 'MANAGE')) throw new AppError(403, 'Không có quyền duyệt yêu cầu');
  }

  async listCreateRequests(actor: RequestActor, status?: ImportCreateRequestStatus, page = 1, pageSize = 20) {
    const where = { ...(await this.requestScope(actor)), ...(status ? { status } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.importCreateRequest.findMany({ where, take: pageSize, skip: (page - 1) * pageSize, orderBy: { created_at: 'desc' }, include: { requested_by: { select: { id: true, name: true, email: true } }, assigned_cs: { select: { id: true, name: true, email: true } } } }),
      prisma.importCreateRequest.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getCreateRequest(id: number, actor: RequestActor) {
    const item = await prisma.importCreateRequest.findFirst({ where: { id, ...(await this.requestScope(actor)) }, include: { requested_by: { select: { id: true, name: true, email: true } }, assigned_cs: { select: { id: true, name: true, email: true } }, reviewed_by: { select: { id: true, name: true, email: true } } } });
    if (!item) throw new AppError(404, 'Không tìm thấy yêu cầu trong phạm vi dữ liệu');
    return item;
  }

  async updateCreateRequest(id: number, actor: RequestActor, dto: { version: number; snapshot?: Record<string, unknown>; assignedCsId?: number | null }) {
    this.ensureReviewer(actor);
    const before = await this.getCreateRequest(id, actor);
    if (before.status !== ImportCreateRequestStatus.PENDING || before.version !== dto.version) throw new AppError(409, 'Yêu cầu đã thay đổi, vui lòng tải lại');
    const after = await prisma.importCreateRequest.update({ where: { id }, data: { snapshot: dto.snapshot as Prisma.InputJsonValue | undefined, assigned_cs_id: dto.assignedCsId, version: { increment: 1 } } });
    await this.repo.createAuditLog({ user_id: actor.id, action: 'IMPORT_REQUEST_UPDATED', entity_type: 'ImportCreateRequest', entity_id: String(id), before_data: before, after_data: after });
    return after;
  }

  async rejectCreateRequest(id: number, actor: RequestActor, dto: { version: number; reason: string }) {
    this.ensureReviewer(actor);
    const before = await this.getCreateRequest(id, actor);
    if (before.status !== ImportCreateRequestStatus.PENDING || before.version !== dto.version) throw new AppError(409, 'Yêu cầu đã thay đổi, vui lòng tải lại');
    const after = await prisma.importCreateRequest.update({ where: { id }, data: { status: ImportCreateRequestStatus.REJECTED, review_reason: dto.reason, reviewed_by_id: actor.id, reviewed_at: new Date(), version: { increment: 1 } } });
    await this.repo.createAuditLog({ user_id: actor.id, action: 'IMPORT_REQUEST_REJECTED', entity_type: 'ImportCreateRequest', entity_id: String(id), before_data: before, after_data: after });
    return after;
  }

  async approveCreateRequest(id: number, actor: RequestActor, dto: { version: number; assignedCsId?: number }) {
    this.ensureReviewer(actor);
    const before = await this.getCreateRequest(id, actor);
    if (before.status !== ImportCreateRequestStatus.PENDING || before.version !== dto.version) throw new AppError(409, 'Yêu cầu đã thay đổi, vui lòng tải lại');
    const existing = await prisma.student.findUnique({ where: { external_id: before.external_id } });
    if (existing) {
      await prisma.importCreateRequest.update({ where: { id }, data: { status: ImportCreateRequestStatus.CONFLICT, review_reason: 'Student đã tồn tại', reviewed_by_id: actor.id, reviewed_at: new Date(), version: { increment: 1 } } });
      throw new AppError(409, 'Dữ liệu nền đã thay đổi');
    }
    const snapshot: any = before.snapshot;
    const pkg = await prisma.package.findUnique({ where: { code: before.package_code } });
    const csId = dto.assignedCsId || before.assigned_cs_id;
    if (!pkg || !csId) throw new AppError(409, 'Gói học hoặc CS phụ trách chưa hợp lệ');
    return prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          external_id: before.external_id,
          full_name: snapshot.full_name || before.external_id,
          phone: snapshot.phone || null,
          email: snapshot.email || null,
          gender: snapshot.gender || null,
          occupation: snapshot.occupation || null,
        },
      });
      const enrollment = await tx.enrollment.create({
        data: {
          external_id: before.external_id,
          student_id: student.id,
          package_id: pkg.id,
          cs_id: csId,
          total_sessions: Number(snapshot.total_sessions) || pkg.default_total_sessions || 0,
          external_remaining_sessions: snapshot.remaining_sessions === '' ? null : Number(snapshot.remaining_sessions),
          level: snapshot.level || null,
          start_date: this.parseExcelDate(snapshot.start_date),
          end_date: this.parseExcelDate(snapshot.end_date),
          status: this.statusFromText(snapshot.status),
          external_synced_at: new Date(),
        },
      });
      let enrollmentClass = null;
      if (snapshot.class_name) {
        let cls = await tx.class.findFirst({ where: { OR: [{ class_name: snapshot.class_name }, { class_code: snapshot.class_name }] } });
        if (!cls) cls = await tx.class.create({ data: { class_name: snapshot.class_name, class_code: snapshot.class_name, level: snapshot.level || null, model_type: 'ONE_TO_ONE', attendance_source: 'LEARNING_SYSTEM' } });
        enrollmentClass = await tx.enrollmentClass.create({ data: { enrollment_id: enrollment.id, class_id: cls.id, sequence_no: 1, start_date: this.parseExcelDate(snapshot.start_date), end_date: this.parseExcelDate(snapshot.end_date), status: EnrollmentClassStatus.ACTIVE } });
        await this.applyAttendance(tx, enrollmentClass.id, cls.id, snapshot.attendance || [], actor.id);
      }
      const request = await tx.importCreateRequest.update({ where: { id }, data: { status: ImportCreateRequestStatus.APPROVED, assigned_cs_id: csId, reviewed_by_id: actor.id, reviewed_at: new Date(), version: { increment: 1 } } });
      await tx.auditLog.create({ data: { user_id: actor.id, action: 'IMPORT_REQUEST_APPROVED', entity_type: 'ImportCreateRequest', entity_id: String(id), before_data: before as any, after_data: request as any } });
      return { student, enrollment, enrollmentClass, request };
    });
  }

}

