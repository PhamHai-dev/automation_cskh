import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { ImportBatchStatus, ImportRowStatus, ImportType, AttendanceStatus, AttendanceSource, EnrollmentStatus, EnrollmentClassStatus } from '@prisma/client';
import { ImportsRepository } from './imports.repository';
import { SheetPreviewData, UploadResponse, ValidationReport, ValidationErrorItem, ValidationWarningItem, SaveMappingDTO, ImportBatchSummary } from './imports.types';
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

  // Upload file and initialize draft batch
  async uploadFile(userId: number, file: Express.Multer.File, importType: ImportType): Promise<UploadResponse> {
    if (!file) {
      throw new AppError(400, 'Không tìm thấy file upload');
    }

    const batch = await this.repo.createBatch({
      uploaded_by_id: userId,
      file_name: file.originalname,
      import_type: importType,
      status: ImportBatchStatus.PREVIEW,
    });

    const targetPath = this.getUploadFilePath(batch.id, file.originalname);
    fs.writeFileSync(targetPath, file.buffer);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(targetPath);

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
  async getPreview(importId: number, sheetName?: string, limit = 10): Promise<SheetPreviewData> {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(meta.filePath);

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
  async saveMapping(importId: number, dto: SaveMappingDTO) {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    if (dto.sheetName) meta.selectedSheet = dto.sheetName;
    if (dto.headerRowIndex) meta.headerRowIdx = dto.headerRowIndex;
    meta.columnMapping = { ...meta.columnMapping, ...dto.columnMapping };

    this.saveMeta(importId, meta);
    return { success: true, columnMapping: meta.columnMapping };
  }

  // Validate import rows
  async validate(importId: number): Promise<ValidationReport> {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(meta.filePath);

    const worksheet = workbook.getWorksheet(meta.selectedSheet);
    if (!worksheet) throw new AppError(400, `Không tìm thấy sheet ${meta.selectedSheet}`);

    const mapping = meta.columnMapping || {};
    const headerRowIdx = meta.headerRowIdx || 1;

    const errors: ValidationErrorItem[] = [];
    const warnings: ValidationWarningItem[] = [];
    const seenExternalIds = new Set<string>();

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

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowIdx) return;
        const extIdRaw = row.getCell(extIdCol).value;
        const extId = extIdRaw !== undefined && extIdRaw !== null ? String(extIdRaw).trim() : '';

        if (!extId) return;
        totalDataRows++;

        let rowHasError = false;

        // Check attendance entries in date columns
        for (const dc of dateCols) {
          const val = row.getCell(dc.col).value;
          if (val !== undefined && val !== null && String(val).trim()) {
            const strVal = String(val).trim().toUpperCase();
            const validCodes = ['1', '1.0', '2', '2.0', '3', '3.0', '0', '0.0', 'A', 'B', 'C', 'D', 'E', 'X', 'ĐÃ HỌC'];
            if (!validCodes.includes(strVal)) {
              errors.push({
                rowNumber,
                field: `Cột ${dc.col}`,
                message: `Giá trị điểm danh không hợp lệ: "${String(val).trim()}" tại ngày ${dc.date.toISOString().split('T')[0]}`,
              });
              rowHasError = true;
            }
          }
        }

        if (rowHasError) invalidRowsCount++;
      });
    }

    const report: ValidationReport = {
      totalRows: totalDataRows,
      validRows: Math.max(0, totalDataRows - invalidRowsCount),
      invalidRows: invalidRowsCount,
      errors,
      warnings,
    };

    meta.validationReport = report;
    this.saveMeta(importId, meta);

    return report;
  }

  // Execute import
  async confirmImport(importId: number, userId: number, skipErrors = true) {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

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

      for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const extIdRaw = row.getCell(extIdCol).value;
        const extId = extIdRaw !== undefined && extIdRaw !== null ? String(extIdRaw).trim() : '';

        if (!extId) continue;

        const rawData: Record<string, any> = {};
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          rawData[worksheet.getColumn(colNumber).letter] = cell.value;
        });

        try {
          const student = await this.repo.findStudentByExternalId(extId);
          if (!student) {
            throw new Error(`Học viên với ID [${extId}] không tìm thấy trong hệ thống`);
          }

          let enrollmentClass = await this.repo.findActiveEnrollmentClassByStudentId(student.id);
          if (!enrollmentClass) {
            // Find enrollment
            const enrollment = student.enrollments[0];
            if (!enrollment) {
              throw new Error(`Học viên [${student.full_name}] chưa có gói học nào`);
            }
            const defaultClass = await this.repo.createClassIfNotExist(`Lớp ${student.full_name}`);
            enrollmentClass = await this.repo.createEnrollmentClass({
              enrollment_id: enrollment.id,
              class_id: defaultClass.id,
              sequence_no: 1,
              status: EnrollmentClassStatus.ACTIVE,
            }) as any;
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
            entity_id: `Student_${student.id}_marked_${markedCount}`,
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
  async getBatch(importId: number) {
    const batch = await this.repo.findBatchById(importId);
    if (!batch) throw new AppError(404, 'Không tìm thấy import batch');
    return batch;
  }

  // List batches
  async listBatches(limit = 20, offset = 0) {
    const [items, total] = await Promise.all([
      this.repo.listBatches(limit, offset),
      this.repo.countBatches(),
    ]);
    return { items, total };
  }

  // Get error rows or generate error excel
  async getErrors(importId: number, download = false) {
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
  async exportStudents(): Promise<ExcelJS.Buffer> {
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
  async exportAttendance(): Promise<ExcelJS.Buffer> {
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
}
