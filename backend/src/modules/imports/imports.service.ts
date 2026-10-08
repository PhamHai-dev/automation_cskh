import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { ImportBatchStatus, ImportRowStatus, ImportType, AttendanceStatus, AttendanceSource, EnrollmentStatus, EnrollmentClassStatus, ImportCreateRequestStatus, ClassModelType, Prisma, CareLogOutcome, ReconciliationState } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { ImportsRepository } from './imports.repository';
import { SheetPreviewData, UploadResponse, ValidationReport, ValidationErrorItem, ValidationWarningItem, SaveMappingDTO, ImportBatchSummary, RequestActor, ReconcileItem, ReconcileClassification, LogicalSheet, MonthAttendanceBlock } from './imports.types';
import { AppError } from '../../middlewares/error.middleware';
import { normalizeDateOnly, attendanceStatusLabel } from '../attendance/attendance.utils';

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

  private cleanupTempFiles(importId: number, meta?: any) {
    try {
      const metaPath = this.getMetaFilePath(importId);
      const filePath = meta?.filePath || this.getUploadFilePath(importId, '.xlsx');
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }
    } catch {
      // Do not block completion if temporary file cleanup fails
    }
  }

  // Helper to parse Excel dates safely
  public parseExcelDate(val: any): Date | null {
    if (!val) return null;
    if (typeof val === 'object' && val !== null) {
      if ('result' in val && val.result !== undefined && val.result !== null) {
        val = val.result;
      }
    }
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
      let trimmed = val.trim();
      if (!trimmed) return null;
      if (trimmed.includes('\n')) {
        trimmed = trimmed.split('\n')[0].trim();
      }
      // Try YYYY-MM-DD or YYYY-MM-DD HH:mm:ss (or ISO)
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) return d;
      }
      // Try DD/MM/YYYY with optional time
      const dmyMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10) - 1;
        const year = parseInt(dmyMatch[3], 10);
        const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
        const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
        const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
        const d = new Date(year, month, day, hour, min, sec);
        if (!isNaN(d.getTime())) return d;
      }
      // Fallback: try new Date(trimmed)
      const directDate = new Date(trimmed);
      if (!isNaN(directDate.getTime()) && !/^\d+$/.test(trimmed)) {
        return directDate;
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
      } else if (lower.includes('gói học') || lower === 'gói' || lower.includes('mã gói') || lower.startsWith('gói')) {
        suggestedMapping['package_code'] = colLetter;
      } else if (lower.includes('trình độ')) {
        suggestedMapping['level'] = colLetter;
      } else if (lower.includes('tổng số buổi') && !lower.includes('đã học')) {
        suggestedMapping['total_sessions'] = colLetter;
      } else if (lower.includes('số buổi còn lại')) {
        suggestedMapping['remaining_sessions'] = colLetter;
      } else if (lower.includes('đã học năm trước') || lower.includes('buổi đã học năm trước')) {
        suggestedMapping['attended_previous_years'] = colLetter;
      } else if (lower.includes('ngày bắt đầu')) {
        suggestedMapping['start_date'] = colLetter;
      } else if (lower.includes('ngày kết thúc') || lower.includes('kết thúc/bảo lưu')) {
        suggestedMapping['end_date'] = colLetter;
      } else if (lower.includes('thanh toán')) {
        suggestedMapping['payment_status'] = colLetter;
      } else if (lower.includes('trạng thái hv') || lower.includes('trạng thái học viên') || lower.includes('nguồn hv')) {
        suggestedMapping['student_source_status'] = colLetter;
      } else if (lower.includes('trạng thái') || lower.includes('tình trạng')) {
        suggestedMapping['status'] = colLetter;
      } else if (lower.includes('mô hình')) {
        suggestedMapping['class_model'] = colLetter;
      } else if ((lower.includes('nội dung khoá') || lower.includes('nội dung khóa') || lower === 'nội dung' || lower.includes('nội dung')) && !lower.includes('chăm sóc')) {
        suggestedMapping['course_content'] = colLetter;
      } else if (lower.includes('sale') && !lower.includes('ghi chú')) {
        suggestedMapping['sale_name'] = colLetter;
      } else if (lower.includes('ghi chú sale')) {
        suggestedMapping['sales_note'] = colLetter;
      } else if (lower.includes('ngày nộp học phí')) {
        suggestedMapping['paid_at'] = colLetter;
      } else if (lower.includes('tên lớp') || lower === 'lớp' || lower.includes('lớp học') || lower.startsWith('lớp')) {
        suggestedMapping['class_name'] = colLetter;
      } else if (lower.includes('báo cáo học tập')) {
        suggestedMapping['study_report_url'] = colLetter;
      } else if (lower.includes('thông tin trao đổi') || lower.includes('trao đổi với hv') || lower.includes('trao đổi')) {
        suggestedMapping['exchange_info'] = colLetter;
      } else if (lower.includes('lịch hẹn gọi')) {
        suggestedMapping['callback_note'] = colLetter;
      } else if (lower.includes('điểm nóng')) {
        suggestedMapping['hot_issue_note'] = colLetter;
      } else if (lower.includes('chăm sóc sau kết thúc')) {
        suggestedMapping['post_course_care'] = colLetter;
      } else if (lower.includes('ngày bàn giao')) {
        suggestedMapping['handed_over_at'] = colLetter;
      } else if (lower.includes('ngày tạo tài khoản')) {
        suggestedMapping['account_created_at'] = colLetter;
      } else if (lower.includes('mã gv') || lower.includes('mã giáo viên')) {
        suggestedMapping['teacher_code'] = colLetter;
      } else if (lower.includes('giáo viên') || lower === 'gv' || lower.includes('tên gv') || lower.includes('gv phụ trách')) {
        suggestedMapping['teacher_name'] = colLetter;
      }
    });

    return { headerRowIdx, headers, suggestedMapping };
  }

  private cellText(cell: ExcelJS.Cell): string {
    let value: any = cell.value;
    if (value && typeof value === 'object') {
      if (value instanceof Date && !isNaN(value.getTime())) {
        const iso = value.toISOString();
        if (iso.endsWith('T00:00:00.000Z')) {
          return iso.slice(0, 10);
        }
        const pad = (n: number) => String(n).padStart(2, '0');
        const y = value.getFullYear();
        const m = pad(value.getMonth() + 1);
        const d = pad(value.getDate());
        const hh = pad(value.getHours());
        const mm = pad(value.getMinutes());
        const ss = pad(value.getSeconds());
        return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
      }
      if ('hyperlink' in value && value.hyperlink) return String(value.hyperlink).trim();
      if ('result' in value && value.result !== undefined && value.result !== null) {
        value = value.result;
      } else if ('text' in value) {
        value = value.text;
      } else if ('richText' in value) {
        value = value.richText.map((part: any) => part.text).join('');
      }
    }
    if (value instanceof Date && !isNaN(value.getTime())) {
      const iso = value.toISOString();
      if (iso.endsWith('T00:00:00.000Z')) {
        return iso.slice(0, 10);
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      const y = value.getFullYear();
      const m = pad(value.getMonth() + 1);
      const d = pad(value.getDate());
      const hh = pad(value.getHours());
      const mm = pad(value.getMinutes());
      const ss = pad(value.getSeconds());
      return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    }
    return value === undefined || value === null ? '' : String(value).trim();
  }

  public detectAttendanceMonthBlocks(worksheet: ExcelJS.Worksheet): MonthAttendanceBlock[] {
    const row1 = worksheet.getRow(1);
    const row2 = worksheet.getRow(2);

    let defaultYear = new Date().getFullYear();
    for (let c = 1; c <= 30; c++) {
      const val = row1.getCell(c).value;
      const num = Number(typeof val === 'object' && val !== null && 'result' in val ? (val as any).result : val);
      if (num >= 2020 && num <= 2035) {
        defaultYear = num;
        break;
      }
    }

    const rawMonths: Array<{ month: number; year: number; startCol: number }> = [];
    for (let c = 26; c <= worksheet.columnCount; c++) {
      const c1 = row1.getCell(c);
      const t1 = c1.text ? c1.text.trim() : '';
      let val1 = c1.value;
      if (val1 && typeof val1 === 'object' && 'result' in val1) {
        val1 = (val1 as any).result;
      }

      let m: number | null = null;
      let y = defaultYear;

      const matchThang = t1.match(/Tháng\s*(\d{1,2})/i);
      if (matchThang) {
        m = parseInt(matchThang[1], 10);
      } else if (val1 instanceof Date || (typeof val1 === 'string' && val1.length > 7 && !isNaN(Date.parse(val1)))) {
        const parsedDate = this.parseExcelDate(val1) || this.parseExcelDate(t1);
        if (parsedDate && parsedDate.getFullYear() >= 2020) {
          m = parsedDate.getMonth() + 1;
          y = parsedDate.getFullYear();
        }
      }

      if (m !== null && m >= 1 && m <= 12) {
        rawMonths.push({ month: m, year: y, startCol: c });
      }
    }

    const blocks: MonthAttendanceBlock[] = [];
    for (let i = 0; i < rawMonths.length; i++) {
      const cur = rawMonths[i];
      const endCol = i < rawMonths.length - 1 ? rawMonths[i + 1].startCol - 1 : worksheet.columnCount;

      const summaryCols = {
        attendedCol: cur.startCol,
        absentACol: cur.startCol + 1,
        leaveBCol: cur.startCol + 2,
        absentCCol: cur.startCol + 3,
        teacherDCol: cur.startCol + 4,
        techErrorECol: cur.startCol + 5,
      };

      const dailyCols: MonthAttendanceBlock['dailyCols'] = [];
      for (let c = cur.startCol + 6; c <= endCol; c++) {
        const c2 = row2.getCell(c);
        const parsedDate = this.parseExcelDate(c2.value) || this.parseExcelDate(c2.text);
        if (parsedDate) {
          dailyCols.push({
            colNumber: c,
            colLetter: worksheet.getColumn(c).letter,
            date: parsedDate.toISOString(),
          });
        }
      }

      if (dailyCols.length === 0) continue;

      const blockYear = new Date(dailyCols[0].date).getFullYear() || cur.year;

      blocks.push({
        month: cur.month,
        year: blockYear,
        label: `Tháng ${cur.month}/${blockYear}`,
        startCol: cur.startCol,
        endCol,
        totalDays: dailyCols.length,
        summaryCols,
        dailyCols,
      });
    }

    return blocks;
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
    const availableMonths = logical === 'attendance' ? this.detectAttendanceMonthBlocks(worksheet) : undefined;
    return {
      sheet: logical,
      sheetName: worksheet.name,
      headerRowIndex: headerRowIdx,
      headers,
      rows,
      totalRows: Math.max(0, worksheet.rowCount - headerRowIdx),
      suggestedMapping,
      availableMonths,
    };
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
    if (status.includes('chờ')) return EnrollmentStatus.WAITING_CLASS;
    if (status.includes('sắp học')) return EnrollmentStatus.UPCOMING;
    if (status.includes('bảo lưu')) return EnrollmentStatus.PAUSED;
    if (status.includes('kết thúc') || status.includes('hoàn thành')) return EnrollmentStatus.FINISHED;
    if (status.includes('chưa học')) return EnrollmentStatus.NOT_STARTED;
    if (status.includes('hủy')) return EnrollmentStatus.CANCELLED;
    return EnrollmentStatus.STUDYING;
  }

  public parseAttendanceValue(value: string): {
    status: AttendanceStatus | null;
    sessionCount: number;
    lessonTopic: string | null;
    studentExternalId?: string;
  } {
    if (!value || !value.trim()) {
      return { status: null, sessionCount: 1, lessonTopic: null };
    }

    const trimmed = value.trim();

    // 1. Check if format is [Mã HV]-[Tên bài / Mã A,B,C,D,E] (e.g. 420289324-K2 L4, HV_001-A)
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*[-]\s*(.+)$/i);
    if (match) {
      const studentExternalId = match[1];
      const remainder = match[2].trim();
      const codeUpper = remainder.toUpperCase();

      if (codeUpper === 'A') {
        return { status: AttendanceStatus.ABSENT_APPROVED_A, sessionCount: 1, lessonTopic: null, studentExternalId };
      }
      if (codeUpper === 'B') {
        return { status: AttendanceStatus.LEAVE_B, sessionCount: 1, lessonTopic: null, studentExternalId };
      }
      if (codeUpper === 'C') {
        return { status: AttendanceStatus.ABSENT_UNAPPROVED_C, sessionCount: 1, lessonTopic: null, studentExternalId };
      }
      if (codeUpper === 'D') {
        return { status: AttendanceStatus.TEACHER_ABSENT_D, sessionCount: 1, lessonTopic: null, studentExternalId };
      }
      if (codeUpper === 'E') {
        return { status: AttendanceStatus.TECH_ERROR_E, sessionCount: 1, lessonTopic: null, studentExternalId };
      }

      // Remainder is lesson topic (e.g. "K2 L4", "k1-l1")
      return { status: AttendanceStatus.ATTENDED, sessionCount: 1, lessonTopic: remainder, studentExternalId };
    }

    // 2. Direct single letter / code
    const codeUpper = trimmed.toUpperCase();
    if (codeUpper === 'A') return { status: AttendanceStatus.ABSENT_APPROVED_A, sessionCount: 1, lessonTopic: null };
    if (codeUpper === 'B') return { status: AttendanceStatus.LEAVE_B, sessionCount: 1, lessonTopic: null };
    if (codeUpper === 'C') return { status: AttendanceStatus.ABSENT_UNAPPROVED_C, sessionCount: 1, lessonTopic: null };
    if (codeUpper === 'D') return { status: AttendanceStatus.TEACHER_ABSENT_D, sessionCount: 1, lessonTopic: null };
    if (codeUpper === 'E') return { status: AttendanceStatus.TECH_ERROR_E, sessionCount: 1, lessonTopic: null };
    if (['X', 'ĐÃ HỌC'].includes(codeUpper)) return { status: AttendanceStatus.ATTENDED, sessionCount: 1, lessonTopic: null };

    // 3. Numeric values: 1, 1.0, 2, 2.0, 0.5...
    const num = Number(trimmed);
    if (!isNaN(num) && num > 0) {
      return { status: AttendanceStatus.ATTENDED, sessionCount: num, lessonTopic: null };
    }

    // 4. Tolerant fallback for lesson topic without ID prefix (e.g. "K2 L4", "k1-l1")
    if (trimmed.length >= 2 && isNaN(Number(trimmed))) {
      return { status: AttendanceStatus.ATTENDED, sessionCount: 1, lessonTopic: trimmed };
    }

    return { status: null, sessionCount: 1, lessonTopic: null };
  }

  private attendanceStatus(value: string): AttendanceStatus | null {
    return this.parseAttendanceValue(value).status;
  }

  // Upload file and initialize draft batch
  async uploadFile(actor: RequestActor, file: Express.Multer.File, importType: ImportType, assignedCsId?: number): Promise<UploadResponse> {
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

    const studentSheet = workbook.worksheets.find((ws) => ws.name.toLowerCase().includes('chăm sóc') || ws.name.startsWith('1.'));
    const attendanceSheet = workbook.worksheets.find((ws) => ws.name.toLowerCase().includes('chấm buổi') || ws.name.startsWith('3.'));

    const isExplicitSingle = importType === ImportType.STUDENT_ENROLLMENT || importType === ImportType.ATTENDANCE;
    const isWorkbook = !isExplicitSingle && (importType === ImportType.WORKBOOK || (!!studentSheet && !!attendanceSheet));

    const effectiveAssignedCsId = actor.roles.includes('CS') && !actor.roles.includes('ADMIN') && !actor.roles.includes('MANAGE')
      ? actor.id
      : assignedCsId;

    if (isWorkbook && (studentSheet || attendanceSheet)) {
      const sheets: any = {};
      let totalRows = 0;
      const metaSheets: any = {};
      if (studentSheet) {
        sheets.studentEnrollment = this.buildPreview(studentSheet, 'studentEnrollment');
        totalRows += sheets.studentEnrollment.totalRows;
        metaSheets.studentEnrollment = {
          sheetName: studentSheet.name,
          headerRowIdx: sheets.studentEnrollment.headerRowIndex,
          columnMapping: sheets.studentEnrollment.suggestedMapping,
        };
      }
      if (attendanceSheet) {
        sheets.attendance = this.buildPreview(attendanceSheet, 'attendance');
        totalRows += sheets.attendance.totalRows;
        metaSheets.attendance = {
          sheetName: attendanceSheet.name,
          headerRowIdx: sheets.attendance.headerRowIndex,
          columnMapping: sheets.attendance.suggestedMapping,
        };
      }
      this.saveMeta(batch.id, {
        importId: batch.id,
        fileName: file.originalname,
        filePath: targetPath,
        importType: ImportType.WORKBOOK,
        sheets: metaSheets,
        assignedCsId: effectiveAssignedCsId,
      });
      await this.repo.updateBatch(batch.id, { total_rows: totalRows, import_type: ImportType.WORKBOOK });
      const sheetList = workbook.worksheets.map((s) => s.name);
      const selectedSheetName = studentSheet?.name || attendanceSheet?.name || sheetList[0];
      const preview = sheets.studentEnrollment || sheets.attendance;
      return {
        importId: batch.id,
        fileName: file.originalname,
        importType: ImportType.WORKBOOK,
        sheets,
        selectedSheet: selectedSheetName,
        preview,
        totalRows,
        assignedCsId: effectiveAssignedCsId,
      };
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
      assignedCsId: effectiveAssignedCsId,
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
        availableMonths: importType === ImportType.ATTENDANCE ? this.detectAttendanceMonthBlocks(worksheet) : undefined,
      },
      assignedCsId: effectiveAssignedCsId,
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
      let logical: LogicalSheet | undefined;
      if (sheetName === 'studentEnrollment' || sheetName === 'attendance') {
        logical = sheetName;
      } else if (sheetName) {
        if (meta.sheets?.studentEnrollment?.sheetName === sheetName || sheetName.includes('chăm sóc') || sheetName.startsWith('1.')) {
          logical = 'studentEnrollment';
        } else if (meta.sheets?.attendance?.sheetName === sheetName || sheetName.includes('chấm buổi') || sheetName.startsWith('3.')) {
          logical = 'attendance';
        }
      }
      if (!logical) {
        logical = meta.sheets?.studentEnrollment ? 'studentEnrollment' : 'attendance';
      }

      const sheetMeta = meta.sheets?.[logical];
      if (!sheetMeta) throw new AppError(400, 'Sheet logic không hợp lệ');
      const ws = workbook.getWorksheet(sheetMeta.sheetName);
      if (!ws) throw new AppError(400, `Không tìm thấy sheet ${sheetMeta.sheetName}`);
      const p = this.buildPreview(ws, logical, limit);
      p.selectedMonth = sheetMeta.selectedMonth;
      p.selectedYear = sheetMeta.selectedYear;
      return p;
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
      availableMonths: meta.importType === ImportType.ATTENDANCE ? this.detectAttendanceMonthBlocks(worksheet) : undefined,
      selectedMonth: meta.selectedMonth,
      selectedYear: meta.selectedYear,
    };
  }

  // Save column mapping
  async saveMapping(importId: number, dto: SaveMappingDTO, actor?: RequestActor) {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    await this.assertBatchAccess(importId, actor, true);
    if (dto.assignedCsId !== undefined) {
      meta.assignedCsId = dto.assignedCsId;
    }
    if (meta.importType === ImportType.WORKBOOK) {
      let sheetKey: LogicalSheet | undefined = dto.sheet;
      if (!sheetKey && dto.sheetName) {
        if (dto.sheetName.includes('chăm sóc') || dto.sheetName.startsWith('1.')) {
          sheetKey = 'studentEnrollment';
        } else if (dto.sheetName.includes('chấm buổi') || dto.sheetName.startsWith('3.')) {
          sheetKey = 'attendance';
        }
      }
      if (!sheetKey) {
        sheetKey = meta.sheets?.studentEnrollment ? 'studentEnrollment' : 'attendance';
      }
      if (!meta.sheets?.[sheetKey]) throw new AppError(400, 'sheet phải là studentEnrollment hoặc attendance');
      meta.sheets[sheetKey].headerRowIdx = dto.headerRowIndex || meta.sheets[sheetKey].headerRowIdx;
      meta.sheets[sheetKey].columnMapping = { ...meta.sheets[sheetKey].columnMapping, ...dto.columnMapping };
      if (dto.selectedMonth !== undefined) meta.sheets[sheetKey].selectedMonth = dto.selectedMonth;
      if (dto.selectedYear !== undefined) meta.sheets[sheetKey].selectedYear = dto.selectedYear;
      this.saveMeta(importId, meta);
      return { success: true, columnMapping: meta.sheets[sheetKey].columnMapping, assignedCsId: meta.assignedCsId };
    }

    if (dto.sheetName) meta.selectedSheet = dto.sheetName;
    if (dto.headerRowIndex) meta.headerRowIdx = dto.headerRowIndex;
    meta.columnMapping = { ...meta.columnMapping, ...dto.columnMapping };
    if (dto.selectedMonth !== undefined) meta.selectedMonth = dto.selectedMonth;
    if (dto.selectedYear !== undefined) meta.selectedYear = dto.selectedYear;

    this.saveMeta(importId, meta);
    return { success: true, columnMapping: meta.columnMapping, assignedCsId: meta.assignedCsId };
  }

  // Validate import rows
  async validate(importId: number, actor?: RequestActor, assignedCsId?: number): Promise<ValidationReport> {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    await this.assertBatchAccess(importId, actor, true);
    if (assignedCsId !== undefined) {
      meta.assignedCsId = assignedCsId;
      this.saveMeta(importId, meta);
    }
    if (meta.importType === ImportType.WORKBOOK) return this.validateWorkbook(importId, meta, actor, assignedCsId);

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
      let monthBlocks = this.detectAttendanceMonthBlocks(worksheet);
      if (meta.selectedMonth) {
        monthBlocks = monthBlocks.filter(b => b.month === meta.selectedMonth && (!meta.selectedYear || b.year === meta.selectedYear));
      }

      const dateCols: { col: string; date: Date }[] = [];
      if (monthBlocks.length > 0) {
        for (const b of monthBlocks) {
          for (const d of b.dailyCols) {
            dateCols.push({ col: d.colLetter, date: new Date(d.date) });
          }
        }
      } else {
        const headerRow = worksheet.getRow(headerRowIdx);
        headerRow.eachCell((cell, colNumber) => {
          const colLetter = worksheet.getColumn(colNumber).letter;
          const parsedDate = this.parseExcelDate(cell.value);
          if (parsedDate) {
            dateCols.push({ col: colLetter, date: parsedDate });
          }
        });
      }

      const extIdCol = mapping['external_id'] || 'A';
      const fullNameCol = mapping['full_name'] || 'B';
      const classNameCol = mapping['class_name'] || 'W';

      newStudentsList = [];
      matchedStudentsCount = 0;

      for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const extId = this.cellText(row.getCell(extIdCol));
        const fullName = this.cellText(row.getCell(fullNameCol));
        const className = this.cellText(row.getCell(classNameCol));

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
          const val = this.cellText(row.getCell(dc.col));
          if (val) {
            const strVal = val.toUpperCase();
            const validCodes = ['1', '1.0', '2', '2.0', '3', '3.0', '0', '0.0', 'A', 'B', 'C', 'D', 'E', 'X', 'ĐÃ HỌC'];
            if (!validCodes.includes(strVal)) {
              errors.push({
                rowNumber: r,
                field: `Cột ${dc.col}`,
                message: `Giá trị điểm danh không hợp lệ: "${val}" tại ngày ${dc.date.toISOString().split('T')[0]}`,
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

  private async validateWorkbook(importId: number, meta: any, actor?: RequestActor, assignedCsId?: number): Promise<ValidationReport> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(meta.filePath);
    const s1 = meta.sheets?.studentEnrollment;
    const s3 = meta.sheets?.attendance;
    const ws1 = s1?.sheetName ? workbook.getWorksheet(s1.sheetName) : null;
    const ws3 = s3?.sheetName ? workbook.getWorksheet(s3.sheetName) : null;
    const rows1 = ws1 && s1 ? this.readSheetRows(ws1, s1.headerRowIdx, s1.columnMapping) : [];
    const rows3 = ws3 && s3 ? this.readSheetRows(ws3, s3.headerRowIdx, s3.columnMapping) : [];
    const byKey1 = new Map<string, typeof rows1[number]>();
    const byKey3 = new Map<string, typeof rows3[number]>();
    const duplicateKeys = new Set<string>();
    const add = (map: Map<string, any>, row: any) => {
      const key = `${row.values.external_id}::${row.values.package_code}`;
      if (map.has(key)) duplicateKeys.add(key); else map.set(key, row);
    };
    rows1.forEach((row) => add(byKey1, row));
    rows3.forEach((row) => add(byKey3, row));
    const keys = new Set([...byKey1.keys(), ...byKey3.keys()]);
    const items: ReconcileItem[] = [];

    // Scope checking setup
    const isCS = Boolean(actor?.roles?.includes('CS') && !actor?.roles?.includes('ADMIN') && !actor?.roles?.includes('MANAGE'));
    const isTeacher = Boolean(actor?.roles?.includes('TEACHER') && !actor?.roles?.includes('ADMIN') && !actor?.roles?.includes('MANAGE'));
    const targetCsId = isCS && actor ? actor.id : (assignedCsId || meta.assignedCsId || actor?.id);
    let teacherClassNames: string[] = [];
    if (isTeacher && actor) {
      teacherClassNames = await this.repo.getTeacherAssignedClassNames(actor.id);
    }

    let monthBlocks: MonthAttendanceBlock[] = [];
    if (ws3) {
      monthBlocks = this.detectAttendanceMonthBlocks(ws3);
      if (s3?.selectedMonth) {
        monthBlocks = monthBlocks.filter((b) => b.month === s3.selectedMonth && (!s3.selectedYear || b.year === s3.selectedYear));
      }
    }

    for (const key of keys) {
      const one = byKey1.get(key);
      const three = byKey3.get(key);
      const source = one || three;
      if (!source) continue;
      const externalId = source.values.external_id;
      const packageCode = source.values.package_code;
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!externalId || !packageCode) errors.push('ID và Gói học là bắt buộc');
      if (duplicateKeys.has(key)) errors.push('Trùng ID + Gói học trong cùng sheet');
      if (one && three && one.values.full_name && three.values.full_name && one.values.full_name !== three.values.full_name) {
        warnings.push('Họ tên giữa hai sheet khác nhau; ưu tiên Sheet 1');
      }

      // Check Teacher Scope for Sheet 3
      let isOutOfScope = false;
      if (isTeacher && actor) {
        if (!three) {
          isOutOfScope = true;
          warnings.push('Bỏ qua: Giáo viên không có quyền quản lý hồ sơ học viên ở Sheet 1');
        } else {
          const className = (three.values.class_name || '').toLowerCase().trim();
          const matchesClass = Boolean(
            className && teacherClassNames.some((tc) => tc && (className.includes(tc) || tc.includes(className)))
          );
          if (!matchesClass) {
            isOutOfScope = true;
            warnings.push(`Bỏ qua: Lớp học [${three.values.class_name || 'không tên'}] không thuộc phân công giảng dạy của GV`);
          }
        }
      }

      const student = externalId ? await prisma.student.findUnique({
        where: { external_id: externalId },
        include: {
          enrollments: {
            where: { package: { code: packageCode } },
            include: { package: true, cs: true, enrollment_classes: { include: { class: { include: { class_teachers: { include: { teacher: true } } } } } } },
            orderBy: { created_at: 'desc' },
          },
        },
      }) : null;
      const pkg = packageCode ? await prisma.package.findUnique({ where: { code: packageCode } }) : null;
      const enrollment = student?.enrollments[0];
      if (student && student.enrollments.length > 1) errors.push('Có nhiều ghi danh cùng ID + Gói học');

      const snapshot: Record<string, unknown> = {
        ...(one?.values || {}),
        class_name: three?.values.class_name || one?.values.class_name || '',
        attendance: [],
      };

      if (three && ws3 && s3) {
        const attendance: any[] = [];
        const sourceRow3 = ws3.getRow(three.rowNumber);

        if (monthBlocks.length > 0) {
          for (const block of monthBlocks) {
            let attendedInMonth = 0;
            let absentCInMonth = 0;

            for (const dayCol of block.dailyCols) {
              const rawVal = this.cellText(sourceRow3.getCell(dayCol.colNumber));
              if (rawVal) {
                attendance.push({
                  date: dayCol.date,
                  value: rawVal,
                });
                const status = this.attendanceStatus(rawVal);
                if (status === AttendanceStatus.ATTENDED) {
                  attendedInMonth++;
                } else if (status === AttendanceStatus.ABSENT_UNAPPROVED_C) {
                  absentCInMonth++;
                }
              }
            }

            // Reconciliation check against month summary column (Số buổi đã học = Sum + C)
            if (block.summaryCols.attendedCol) {
              const summaryAttendedText = this.cellText(sourceRow3.getCell(block.summaryCols.attendedCol));
              const summaryAttendedNum = Number(summaryAttendedText);
              if (!isNaN(summaryAttendedNum) && summaryAttendedText !== '') {
                const expectedTotal = attendedInMonth + absentCInMonth;
                if (summaryAttendedNum !== expectedTotal) {
                  warnings.push(
                    `${block.label}: Cột tổng kết đã học (${summaryAttendedNum}) lệch so với chi tiết điểm danh (${expectedTotal} = ${attendedInMonth} học + ${absentCInMonth} nghỉ không phép C).`
                  );
                }
              }
            }
          }
        } else {
          const header = ws3.getRow(s3.headerRowIdx);
          header.eachCell((cell, col) => {
            const date = this.parseExcelDate(cell.value);
            if (date) {
              const rawVal = this.cellText(sourceRow3.getCell(col));
              if (rawVal) {
                attendance.push({
                  date: date.toISOString(),
                  value: rawVal,
                });
              }
            }
          });
        }
        snapshot.attendance = attendance;

        // Check for reconciliation conflict against teacher marks in DB
        const ec = enrollment?.enrollment_classes?.[0];
        if (ec) {
          for (const att of attendance) {
            const parsed = this.parseAttendanceValue(att.value);
            if (parsed.status) {
              const normalizedDate = normalizeDateOnly(att.date);
              if (normalizedDate) {
                const existingSession = await prisma.classSession.findFirst({
                  where: { class_id: ec.class_id, session_date: normalizedDate },
                  include: {
                    attendance: {
                      where: { enrollment_class_id: ec.id },
                    },
                  },
                });

                const existingAtt = existingSession?.attendance?.[0];
                if (existingAtt?.teacher_status && existingAtt.teacher_status !== parsed.status) {
                  const dateFormatted = `${normalizedDate.getUTCDate().toString().padStart(2, '0')}/${(normalizedDate.getUTCMonth() + 1).toString().padStart(2, '0')}/${normalizedDate.getUTCFullYear()}`;
                  warnings.push(
                    `Ngày ${dateFormatted}: Xung đột điểm danh — Giáo viên đã chấm [${attendanceStatusLabel(existingAtt.teacher_status)}], trong file đang chấm [${attendanceStatusLabel(parsed.status)}]. Buổi học sẽ bị đóng băng chờ phân xử.`
                  );
                }
              }
            }
          }
        }
      }

      if (one && ws1 && s1) {
        const headerRow1 = ws1.getRow(s1.headerRowIdx);
        const sourceRow1 = ws1.getRow(one.rowNumber);
        const careLogs: Array<{ after_session_number: number; content: string }> = [];
        for (let col = 1; col <= ws1.columnCount; col++) {
          const headerCell = headerRow1.getCell(col);
          let headerTitle = '';
          if (typeof headerCell.value === 'object' && headerCell.value !== null && 'richText' in headerCell.value) {
            headerTitle = (headerCell.value as any).richText.map((t: any) => t.text).join('');
          } else {
            headerTitle = String(headerCell.value || '').trim();
          }
          const match = headerTitle.match(/chăm sóc sau buổi\s*(\d+)/i);
          if (match) {
            const sessionNum = parseInt(match[1], 10);
            const content = this.cellText(sourceRow1.getCell(col));
            if (content && !isNaN(sessionNum)) {
              careLogs.push({ after_session_number: sessionNum, content });
            }
          }
        }
        snapshot.careLogs = careLogs;
      }

      const diffs: any[] = [];
      const compare = (entity: string, field: string, before: unknown, after: unknown) => {
        if ((before ?? '') !== (after ?? '')) {
          diffs.push({ entity, field, before, after: after === '' ? null : after, action: after === '' ? 'NULLIFY' : 'UPDATE' });
        }
      };
      if (student) {
        compare('Student', 'full_name', student.full_name, snapshot.full_name);
        compare('Student', 'phone', student.phone, snapshot.phone);
        compare('Student', 'email', student.email, snapshot.email);
      }
      if (enrollment) {
        compare('Enrollment', 'total_sessions', enrollment.total_sessions, Number(snapshot.total_sessions) || 0);
        compare('Enrollment', 'external_remaining_sessions', enrollment.external_remaining_sessions, snapshot.remaining_sessions === '' ? null : Number(snapshot.remaining_sessions));

        const currentTeacher = (enrollment.enrollment_classes?.[0] as any)?.class?.class_teachers?.[0]?.teacher;
        const currentTeacherText = currentTeacher ? `${currentTeacher.name} (${currentTeacher.code})` : null;
        const newTeacherName = snapshot.teacher_name ? String(snapshot.teacher_name).trim() : null;
        const newTeacherCode = snapshot.teacher_code ? String(snapshot.teacher_code).trim() : null;
        const newTeacherText = newTeacherName || newTeacherCode ? `${newTeacherName || ''} ${newTeacherCode ? `(${newTeacherCode})` : ''}`.trim() : null;
        if (newTeacherText && currentTeacherText !== newTeacherText) {
          compare('ClassTeacher', 'teacher', currentTeacherText, newTeacherText);
        }
      } else if (snapshot.teacher_name || snapshot.teacher_code) {
        const newTeacherText = `${snapshot.teacher_name || ''} ${snapshot.teacher_code ? `(${snapshot.teacher_code})` : ''}`.trim();
        diffs.push({ entity: 'ClassTeacher', field: 'teacher', before: null, after: newTeacherText, action: 'UPDATE' });
      }

      let classification: ReconcileClassification;
      if (isOutOfScope) {
        classification = 'SKIPPED_SCOPE';
      } else if (errors.length) {
        classification = 'INVALID';
      } else if (student && enrollment) {
        if (isCS && actor && enrollment.cs_id && enrollment.cs_id !== actor.id) {
          classification = 'REQUEST_TRANSFER';
          warnings.push(`Học viên hiện thuộc CS [${enrollment.cs?.name || enrollment.cs_id}]. Yêu cầu điều chuyển CSKH sẽ được gửi tới Quản lý/Admin phê duyệt.`);
        } else {
          classification = 'UPDATE';
        }
      } else if (one) {
        // Not in DB yet, but has Sheet 1 -> Create directly per Q-013!
        classification = 'CREATE';
      } else {
        // Not in DB and NOT in Sheet 1 (only in Sheet 3) -> Cannot attend unknown student per Q-013
        classification = 'INVALID';
        errors.push('Học viên chưa có hồ sơ tại Sheet 1 và chưa tồn tại trong hệ thống, không thể ghi nhận điểm danh');
      }

      items.push({
        key,
        externalId,
        packageCode,
        classification,
        sheet1Row: one?.rowNumber,
        sheet3Row: three?.rowNumber,
        snapshot,
        baseline: student ? {
          studentId: student.id,
          studentUpdatedAt: student.updated_at.toISOString(),
          enrollmentId: enrollment?.id,
          enrollmentUpdatedAt: enrollment?.updated_at.toISOString(),
        } : undefined,
        diffs,
        attendanceDiffs: ((snapshot.attendance as any[]) || [])
          .filter((a) => a.value !== undefined && a.value !== null && String(a.value).trim() !== '')
          .map((a) => ({
            entity: 'Attendance',
            field: a.date.slice(0, 10),
            before: null,
            after: a.value,
            action: 'UPSERT',
          })),
        warnings,
        errors,
      });
    }

    const summary = {
      totalKeys: items.length,
      willUpdate: items.filter(i => i.classification === 'UPDATE').length,
      willCreate: items.filter(i => i.classification === 'CREATE').length,
      willTransfer: items.filter(i => i.classification === 'REQUEST_TRANSFER').length,
      willRequestCreate: 0,
      skippedOutOfScope: items.filter(i => i.classification === 'SKIPPED_SCOPE').length,
      conflict: items.filter(i => i.classification === 'CONFLICT').length,
      invalid: items.filter(i => i.classification === 'INVALID').length,
      assignedCsId: targetCsId,
    };
    const report: ValidationReport = {
      summary,
      items,
      totalRows: items.length,
      validRows: summary.willUpdate + summary.willCreate + summary.willTransfer,
      invalidRows: summary.invalid + summary.conflict,
      errors: items.filter((i) => i.errors && i.errors.length > 0).flatMap((i) => i.errors.map((err) => ({
        rowNumber: i.sheet1Row || i.sheet3Row || 0,
        message: err,
      }))),
      warnings: items.filter((i) => i.warnings && i.warnings.length > 0).flatMap((i) => i.warnings.map((warn) => ({
        rowNumber: i.sheet1Row || i.sheet3Row || 0,
        message: warn,
      }))),
    };
    meta.validationReport = report;
    this.saveMeta(importId, meta);
    return report;
  }

  private async applyAttendance(tx: Prisma.TransactionClient, enrollmentClassId: number, classId: number, entries: any[], userId: number): Promise<number> {
    let conflictCount = 0;
    for (const entry of entries || []) {
      const date = normalizeDateOnly(entry.date) || new Date(entry.date);
      if (isNaN(date.getTime())) continue;
      const parsed = this.parseAttendanceValue(entry.value || '');
      if (parsed.status) {
        let session = await tx.classSession.findFirst({ where: { class_id: classId, session_date: date } });
        if (!session) {
          const last = await tx.classSession.findFirst({ where: { class_id: classId }, orderBy: { session_number: 'desc' } });
          session = await tx.classSession.create({
            data: {
              class_id: classId,
              session_number: (last?.session_number || 0) + 1,
              session_date: date,
              created_by_id: userId,
            },
          });
        }

        const existing = await tx.attendance.findUnique({
          where: { enrollment_class_id_class_session_id: { enrollment_class_id: enrollmentClassId, class_session_id: session.id } },
        });

        let reconciliationState: ReconciliationState;
        if (!existing?.teacher_status) {
          reconciliationState = ReconciliationState.PENDING_TEACHER;
        } else if (existing.teacher_status === parsed.status) {
          reconciliationState = ReconciliationState.MATCHED;
        } else {
          reconciliationState = ReconciliationState.CONFLICT;
          conflictCount++;
        }

        await tx.attendance.upsert({
          where: { enrollment_class_id_class_session_id: { enrollment_class_id: enrollmentClassId, class_session_id: session.id } },
          update: {
            status: parsed.status,
            cs_status: parsed.status,
            cs_raw_value: String(entry.value || ''),
            cs_submitted_at: new Date(),
            cs_user_id: userId,
            lesson_topic: parsed.lessonTopic || existing?.lesson_topic || null,
            reconciliation_state: reconciliationState,
            source: AttendanceSource.EXCEL_IMPORT,
          },
          create: {
            enrollment_class_id: enrollmentClassId,
            class_session_id: session.id,
            status: parsed.status,
            cs_status: parsed.status,
            cs_raw_value: String(entry.value || ''),
            cs_submitted_at: new Date(),
            cs_user_id: userId,
            lesson_topic: parsed.lessonTopic,
            reconciliation_state: reconciliationState,
            source: AttendanceSource.EXCEL_IMPORT,
            created_by_id: userId,
          },
        });
      }
      // Note: Empty value in Excel does NOT wipe existing attendance (keeps old record per Q-013)
    }
    return conflictCount;
  }

  private async confirmWorkbook(importId: number, actor: RequestActor, skipErrors: boolean, meta: any, assignedCsId?: number) {
    const report: ValidationReport = meta.validationReport || await this.validateWorkbook(importId, meta, actor, assignedCsId);
    const items = report.items || [];
    if (!skipErrors && items.some(i => i.classification === 'INVALID' || i.classification === 'CONFLICT')) {
      throw new AppError(400, 'Còn khóa lỗi hoặc conflict');
    }
    await this.repo.updateBatch(importId, { status: ImportBatchStatus.PROCESSING });
    await this.repo.clearPendingImportRows(importId);
    let successRows = 0, failedRows = 0, totalConflictAttendances = 0;

    const isCS = Boolean(actor?.roles?.includes('CS') && !actor?.roles?.includes('ADMIN') && !actor?.roles?.includes('MANAGE'));
    const targetCsId = isCS ? actor.id : (assignedCsId || meta.assignedCsId || actor.id);

    for (const item of items) {
      if (item.classification === 'SKIPPED_SCOPE') {
        continue;
      }
      if (item.classification === 'INVALID' || item.classification === 'CONFLICT') {
        failedRows++;
        await this.repo.createImportRows([{
          import_batch_id: importId,
          row_number: item.sheet1Row || item.sheet3Row || 0,
          raw_data: item.snapshot,
          status: ImportRowStatus.FAILED,
          error_message: item.errors.join('; ') || 'Dữ liệu không hợp lệ',
        }]);
        continue;
      }

      if (item.classification === 'REQUEST_TRANSFER') {
        try {
          await prisma.importCreateRequest.upsert({
            where: {
              import_batch_id_external_id_package_code: {
                import_batch_id: importId,
                external_id: item.externalId,
                package_code: item.packageCode,
              },
            },
            update: {
              snapshot: item.snapshot as Prisma.InputJsonValue,
              assigned_cs_id: actor.id,
              status: ImportCreateRequestStatus.PENDING,
            },
            create: {
              import_batch_id: importId,
              external_id: item.externalId,
              package_code: item.packageCode,
              requested_by_id: actor.id,
              assigned_cs_id: actor.id,
              snapshot: item.snapshot as Prisma.InputJsonValue,
              status: ImportCreateRequestStatus.PENDING,
            },
          });
          successRows++;
          await this.repo.createImportRows([{
            import_batch_id: importId,
            row_number: item.sheet1Row || item.sheet3Row || 0,
            raw_data: item.snapshot,
            status: ImportRowStatus.SUCCESS,
            entity_type: 'TransferRequest',
            entity_id: item.key,
          }]);
        } catch (err: any) {
          failedRows++;
          await this.repo.createImportRows([{
            import_batch_id: importId,
            row_number: item.sheet1Row || item.sheet3Row || 0,
            raw_data: item.snapshot,
            status: ImportRowStatus.FAILED,
            error_message: err.message || 'Lỗi gửi yêu cầu điều chuyển',
          }]);
        }
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const snap: any = item.snapshot;

          // 1. Student
          let student = await tx.student.findUnique({ where: { external_id: item.externalId } });
          if (!student) {
            student = await tx.student.create({
              data: {
                external_id: item.externalId,
                full_name: snap.full_name || 'Học viên ' + item.externalId,
                phone: snap.phone ? String(snap.phone).trim() : null,
                email: snap.email ? String(snap.email).trim() : null,
                gender: snap.gender ? String(snap.gender).trim() : null,
                occupation: snap.occupation ? String(snap.occupation).trim() : null,
                date_of_birth: this.parseExcelDate(snap.date_of_birth),
              },
            });
          } else {
            // Overwrite student: blank cell sets to null per Decision 4
            await tx.student.update({
              where: { id: student.id },
              data: {
                full_name: snap.full_name || student.full_name,
                phone: snap.phone !== undefined ? (snap.phone ? String(snap.phone).trim() : null) : student.phone,
                email: snap.email !== undefined ? (snap.email ? String(snap.email).trim() : null) : student.email,
                gender: snap.gender !== undefined ? (snap.gender ? String(snap.gender).trim() : null) : student.gender,
                occupation: snap.occupation !== undefined ? (snap.occupation ? String(snap.occupation).trim() : null) : student.occupation,
                date_of_birth: snap.date_of_birth !== undefined ? this.parseExcelDate(snap.date_of_birth) : student.date_of_birth,
              },
            });
          }

          // 2. Package
          let pkg = await tx.package.findUnique({ where: { code: item.packageCode } });
          if (!pkg) {
            pkg = await tx.package.create({
              data: {
                code: item.packageCode,
                name: `Gói ${item.packageCode}`,
                default_total_sessions: Number(snap.total_sessions) || 30,
                active: true,
              },
            });
          }

          // 3. Sale record (independent from CS)
          let saleRecord = null;
          if (snap.sale_name && String(snap.sale_name).trim()) {
            saleRecord = await this.repo.findOrCreateSale(String(snap.sale_name).trim());
          }
          const saleId = saleRecord ? saleRecord.id : null;
          const saleName = snap.sale_name ? String(snap.sale_name).trim() : null;

          // 4. CS ID assignment
          const finalCsId = targetCsId;

          // 5. Enrollment
          let enrollment = await tx.enrollment.findFirst({
            where: { student_id: student.id, package_id: pkg.id },
            include: { enrollment_classes: { include: { class: true }, orderBy: { sequence_no: 'desc' } } },
            orderBy: { created_at: 'desc' },
          });

          if (!enrollment) {
            enrollment = await tx.enrollment.create({
              data: {
                external_id: item.externalId,
                student_id: student.id,
                package_id: pkg.id,
                cs_id: finalCsId,
                paid_at: this.parseExcelDate(snap.paid_at),
                sale_id: saleId,
                sale_name: saleName,
                student_source_status: snap.student_source_status || null,
                course_content: snap.course_content || null,
                payment_status: snap.payment_status || null,
                course_teacher_type: snap.course_teacher_type || null,
                level: snap.level || null,
                total_sessions: Number(snap.total_sessions) || 30,
                class_model: snap.class_model || null,
                sales_note: snap.sales_note || null,
                study_report_url: snap.study_report_url || null,
                exchange_info: snap.exchange_info || null,
                callback_note: snap.callback_note || null,
                hot_issue_note: snap.hot_issue_note || null,
                post_course_care: snap.post_course_care || null,
                handed_over_at: this.parseExcelDate(snap.handed_over_at),
                account_created_at: this.parseExcelDate(snap.account_created_at),
                start_date: this.parseExcelDate(snap.start_date),
                end_date: this.parseExcelDate(snap.end_date),
                status: this.statusFromText(snap.status),
                external_remaining_sessions: snap.remaining_sessions !== undefined && snap.remaining_sessions !== '' ? Number(snap.remaining_sessions) : null,
                attended_previous_years: snap.attended_previous_years !== undefined && snap.attended_previous_years !== '' ? Number(snap.attended_previous_years) : 0,
                external_synced_at: new Date(),
              },
              include: { enrollment_classes: { include: { class: true } } },
            });
          } else {
            // Overwrite enrollment: blank cell sets to null per Decision 4
            const updateData: any = {
              total_sessions: Number(snap.total_sessions) || enrollment.total_sessions,
              external_remaining_sessions: snap.remaining_sessions !== undefined && snap.remaining_sessions !== '' ? Number(snap.remaining_sessions) : null,
              attended_previous_years: snap.attended_previous_years !== undefined && snap.attended_previous_years !== '' ? Number(snap.attended_previous_years) : enrollment.attended_previous_years,
              level: snap.level !== undefined ? (snap.level || null) : enrollment.level,
              status: snap.status ? this.statusFromText(snap.status) : enrollment.status,
              start_date: snap.start_date !== undefined ? this.parseExcelDate(snap.start_date) : enrollment.start_date,
              end_date: snap.end_date !== undefined ? this.parseExcelDate(snap.end_date) : enrollment.end_date,
              paid_at: snap.paid_at !== undefined ? this.parseExcelDate(snap.paid_at) : enrollment.paid_at,
              sale_id: snap.sale_name !== undefined ? saleId : enrollment.sale_id,
              sale_name: snap.sale_name !== undefined ? saleName : enrollment.sale_name,
              sales_note: snap.sales_note !== undefined ? (snap.sales_note || null) : enrollment.sales_note,
              study_report_url: snap.study_report_url !== undefined ? (snap.study_report_url || null) : enrollment.study_report_url,
              exchange_info: snap.exchange_info !== undefined ? (snap.exchange_info || null) : enrollment.exchange_info,
              callback_note: snap.callback_note !== undefined ? (snap.callback_note || null) : enrollment.callback_note,
              hot_issue_note: snap.hot_issue_note !== undefined ? (snap.hot_issue_note || null) : enrollment.hot_issue_note,
              post_course_care: snap.post_course_care !== undefined ? (snap.post_course_care || null) : enrollment.post_course_care,
              handed_over_at: snap.handed_over_at !== undefined ? this.parseExcelDate(snap.handed_over_at) : enrollment.handed_over_at,
              account_created_at: snap.account_created_at !== undefined ? this.parseExcelDate(snap.account_created_at) : enrollment.account_created_at,
              external_synced_at: new Date(),
            };
            if (!isCS && (assignedCsId || meta.assignedCsId)) {
              updateData.cs_id = targetCsId;
            }
            await tx.enrollment.update({
              where: { id: enrollment.id },
              data: updateData,
            });
          }

          // 6. Class & EnrollmentClass
          let ec = enrollment.enrollment_classes?.[0];
          const className = snap.class_name || `Lớp ${student.full_name}`;
          let targetClassId = ec?.class_id;
          if (!ec || (snap.class_name && ec.class.class_name !== snap.class_name)) {
            let cls = await tx.class.findFirst({
              where: { OR: [{ class_name: className }, { class_code: className }] },
            });
            if (!cls) {
              cls = await tx.class.create({
                data: {
                  class_name: className,
                  class_code: className,
                  model_type: ClassModelType.ONE_TO_ONE,
                  attendance_source: 'LEARNING_SYSTEM',
                },
              });
            }
            targetClassId = cls.id;
            ec = await tx.enrollmentClass.create({
              data: {
                enrollment_id: enrollment.id,
                class_id: cls.id,
                sequence_no: (ec?.sequence_no || 0) + 1,
                status: EnrollmentClassStatus.ACTIVE,
              },
              include: { class: true },
            });
          }

          // 6.1 Assign Teacher if provided
          const teacherName = snap.teacher_name ? String(snap.teacher_name).trim() : null;
          const teacherCode = snap.teacher_code ? String(snap.teacher_code).trim() : null;
          if ((teacherName || teacherCode) && targetClassId) {
            const teacherRec = await this.repo.findOrCreateTeacher(teacherCode || undefined, teacherName || undefined);
            if (teacherRec) {
              const existingCT = await tx.classTeacher.findFirst({
                where: { class_id: targetClassId, role: 'MAIN' },
              });
              if (existingCT) {
                await tx.classTeacher.update({
                  where: { id: existingCT.id },
                  data: { teacher_id: teacherRec.id, active: true },
                });
              } else {
                await tx.classTeacher.create({
                  data: {
                    class_id: targetClassId,
                    teacher_id: teacherRec.id,
                    role: 'MAIN',
                    active: true,
                  },
                });
              }
            }
          }

          // 7. Attendance from Sheet 3
          if (ec && snap.attendance?.length) {
            const conflictsInSheet = await this.applyAttendance(tx, ec.id, ec.class_id, snap.attendance, actor.id);
            totalConflictAttendances += conflictsInSheet;
          }

          // 8. Care Logs from Sheet 1 (Chăm sóc sau buổi 1, 3, 10, ...)
          const careLogs = snap.careLogs as Array<{ after_session_number: number; content: string }> | undefined;
          if (Array.isArray(careLogs) && careLogs.length > 0) {
            for (const cl of careLogs) {
              if (cl.content && cl.after_session_number) {
                const existingLog = await tx.careLog.findFirst({
                  where: { enrollment_id: enrollment.id, after_session_number: cl.after_session_number },
                });
                if (existingLog) {
                  await tx.careLog.update({
                    where: { id: existingLog.id },
                    data: { content: cl.content },
                  });
                } else {
                  await tx.careLog.create({
                    data: {
                      enrollment_id: enrollment.id,
                      cs_id: finalCsId,
                      after_session_number: cl.after_session_number,
                      content: cl.content,
                      outcome: CareLogOutcome.POSITIVE,
                      created_by_id: actor.id,
                    },
                  });
                }
              }
            }
          }
        });

        successRows++;
        await this.repo.createImportRows([{
          import_batch_id: importId,
          row_number: item.sheet1Row || item.sheet3Row || 0,
          raw_data: item.snapshot,
          status: ImportRowStatus.SUCCESS,
          entity_type: item.classification === 'CREATE' ? 'EnrollmentCreate' : 'EnrollmentUpdate',
          entity_id: item.key,
        }]);
      } catch (error: any) {
        failedRows++;
        await this.repo.createImportRows([{
          import_batch_id: importId,
          row_number: item.sheet1Row || item.sheet3Row || 0,
          raw_data: item.snapshot,
          status: ImportRowStatus.FAILED,
          error_message: error.message || 'Lỗi xử lý dòng',
        }]);
      }
    }

    const status = failedRows ? (successRows ? ImportBatchStatus.PARTIAL_FAILED : ImportBatchStatus.FAILED) : ImportBatchStatus.COMPLETED;
    const updated = await this.repo.updateBatch(importId, {
      status,
      total_rows: items.length,
      success_rows: successRows,
      failed_rows: failedRows,
      completed_at: new Date(),
    });

    if (status === ImportBatchStatus.COMPLETED) {
      this.cleanupTempFiles(importId, meta);
    }

    return { ...updated, conflict_attendances: totalConflictAttendances };
  }

  // Execute import
  async confirmImport(importId: number, actor: RequestActor, skipErrors = true, createMissingStudents = false, assignedCsId?: number) {
    const meta = this.loadMeta(importId);
    if (!meta) throw new AppError(404, 'Không tìm thấy thông tin import batch');

    await this.assertBatchAccess(importId, actor, true);
    if (meta.importType === ImportType.WORKBOOK) return this.confirmWorkbook(importId, actor, skipErrors, meta, assignedCsId);

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
    let totalConflictAttendances = 0;
    const defaultCS = await this.repo.findDefaultCSUser();
    const userId = actor.id;
    const fallbackCSId = defaultCS ? defaultCS.id : userId;
    const isCS = Boolean(actor?.roles?.includes('CS') && !actor?.roles?.includes('ADMIN') && !actor?.roles?.includes('MANAGE'));
    const finalCSId = isCS ? actor.id : (assignedCsId || meta.assignedCsId || fallbackCSId);

    if (meta.importType === ImportType.STUDENT_ENROLLMENT) {
      // Process rows
      const rowPromises: Promise<any>[] = [];

      for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const getColVal = (field: string) => {
          const colLetter = mapping[field];
          if (!colLetter) return null;
          const text = this.cellText(row.getCell(colLetter));
          return text || null;
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
          if (statusRaw.includes('chờ')) status = EnrollmentStatus.WAITING_CLASS;
          else if (statusRaw.includes('sắp học')) status = EnrollmentStatus.UPCOMING;
          else if (statusRaw.includes('bảo lưu')) status = EnrollmentStatus.PAUSED;
          else if (statusRaw.includes('kết thúc') || statusRaw.includes('hoàn thành')) status = EnrollmentStatus.FINISHED;
          else if (statusRaw.includes('chưa học')) status = EnrollmentStatus.NOT_STARTED;
          else if (statusRaw.includes('hủy')) status = EnrollmentStatus.CANCELLED;

          const startDate = this.parseExcelDate(getColVal('start_date'));
          const endDate = this.parseExcelDate(getColVal('end_date'));
          const paidAt = this.parseExcelDate(getColVal('paid_at'));
          const remainingSessionsRaw = parseInt(getColVal('remaining_sessions') || '0', 10);
          const remainingSessions = isNaN(remainingSessionsRaw) ? null : remainingSessionsRaw;

          // 4. Create Enrollment
          const saleRaw = getColVal('sale_name');
          let saleId: number | null = null;
          if (saleRaw && saleRaw.trim()) {
            const saleRec = await this.repo.findOrCreateSale(saleRaw.trim());
            saleId = saleRec ? saleRec.id : null;
          }

          const enrollment = await this.repo.createEnrollment({
            external_id: extId || undefined,
            student_id: student.id,
            package_id: pkg.id,
            cs_id: finalCSId,
            paid_at: paidAt,
            sale_id: saleId,
            sale_name: saleRaw,
            student_source_status: getColVal('student_source_status'),
            course_content: getColVal('course_content'),
            payment_status: getColVal('payment_status'),
            course_teacher_type: getColVal('course_teacher_type'),
            level: getColVal('level'),
            total_sessions: totalSessions,
            class_model: getColVal('class_model'),
            sales_note: salesNote,
            study_report_url: getColVal('study_report_url'),
            exchange_info: getColVal('exchange_info'),
            callback_note: getColVal('callback_note'),
            hot_issue_note: getColVal('hot_issue_note'),
            post_course_care: getColVal('post_course_care'),
            handed_over_at: this.parseExcelDate(getColVal('handed_over_at')),
            account_created_at: this.parseExcelDate(getColVal('account_created_at')),
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

          // Assign Teacher in direct workbook import
          const directTeacherName = getColVal('teacher_name');
          const directTeacherCode = getColVal('teacher_code');
          if (directTeacherName || directTeacherCode) {
            const teacherRec = await this.repo.findOrCreateTeacher(directTeacherCode || undefined, directTeacherName || undefined);
            if (teacherRec) {
              const existingCT = await prisma.classTeacher.findFirst({
                where: { class_id: cls.id, role: 'MAIN' },
              });
              if (existingCT) {
                await prisma.classTeacher.update({
                  where: { id: existingCT.id },
                  data: { teacher_id: teacherRec.id, active: true },
                });
              } else {
                await prisma.classTeacher.create({
                  data: {
                    class_id: cls.id,
                    teacher_id: teacherRec.id,
                    role: 'MAIN',
                    active: true,
                  },
                });
              }
            }
          }

          // 6. Parse and save care logs from session columns (AO..BC)
          const headerRow = worksheet.getRow(headerRowIdx);
          headerRow.eachCell((cell: any, colNumber: number) => {
            const colLetter = worksheet.getColumn(colNumber).letter;
            let headerTitle = '';
            if (typeof cell.value === 'object' && cell.value !== null && 'richText' in cell.value) {
              headerTitle = (cell.value as any).richText.map((t: any) => t.text).join('');
            } else {
              headerTitle = String(cell.value || '').trim();
            }
            const match = headerTitle.match(/chăm sóc sau buổi\s*(\d+)/i);
            if (match) {
              const sessionNum = parseInt(match[1], 10);
              const logContent = String(rawData[colLetter] || '').trim();
              if (logContent && !isNaN(sessionNum)) {
                prisma.careLog.create({
                  data: {
                    enrollment_id: enrollment.id,
                    cs_id: finalCSId,
                    after_session_number: sessionNum,
                    content: logContent,
                    outcome: CareLogOutcome.POSITIVE,
                    created_by_id: actor?.id || finalCSId,
                  },
                }).catch(() => {});
              }
            }
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
      let monthBlocks = this.detectAttendanceMonthBlocks(worksheet);
      if (meta.selectedMonth) {
        monthBlocks = monthBlocks.filter((b) => b.month === meta.selectedMonth && (!meta.selectedYear || b.year === meta.selectedYear));
      }

      const dateCols: { col: string; date: Date }[] = [];
      if (monthBlocks.length > 0) {
        for (const b of monthBlocks) {
          for (const d of b.dailyCols) {
            dateCols.push({ col: d.colLetter, date: new Date(d.date) });
          }
        }
      } else {
        const headerRow = worksheet.getRow(headerRowIdx);
        headerRow.eachCell((cell, colNumber) => {
          const colLetter = worksheet.getColumn(colNumber).letter;
          const parsedDate = this.parseExcelDate(cell.value);
          if (parsedDate) {
            dateCols.push({ col: colLetter, date: parsedDate });
          }
        });
      }

      const extIdCol = mapping['external_id'] || 'A';
      const fullNameCol = mapping['full_name'] || 'B';
      const classNameCol = mapping['class_name'] || 'W';

      for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const extId = this.cellText(row.getCell(extIdCol));
        const fullName = this.cellText(row.getCell(fullNameCol));
        const className = this.cellText(row.getCell(classNameCol));

        if (!extId && !fullName) continue;

        const rawData: Record<string, any> = {};
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          rawData[worksheet.getColumn(colNumber).letter] = this.cellText(cell);
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
            const val = this.cellText(row.getCell(dc.col));
            if (val) {
              const parsed = this.parseAttendanceValue(val);

              if (parsed.status) {
                const sessionDate = normalizeDateOnly(dc.date) || dc.date;
                const session = await this.repo.findOrCreateClassSession(
                  enrollmentClass!.class_id,
                  sessionDate,
                  userId
                );

                const attRecord = await this.repo.upsertAttendance({
                  enrollment_class_id: enrollmentClass!.id,
                  class_session_id: session.id,
                  status: parsed.status,
                  source: AttendanceSource.EXCEL_IMPORT,
                  created_by_id: userId,
                  cs_status: parsed.status,
                  cs_raw_value: val,
                  cs_user_id: userId,
                  lesson_topic: parsed.lessonTopic || undefined,
                });
                if (attRecord.reconciliation_state === ReconciliationState.CONFLICT) {
                  totalConflictAttendances++;
                }
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

    if (finalStatus === ImportBatchStatus.COMPLETED) {
      this.cleanupTempFiles(importId, meta);
    }

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

    return { ...updatedBatch, conflict_attendances: totalConflictAttendances };
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
    const isCS = actor?.roles.includes('CS') && !actor?.roles.includes('ADMIN') && !actor?.roles.includes('MANAGE');
    const students = await this.repo.getAllStudentsWithEnrollments(isCS && actor ? { cs_id: actor.id } : undefined);
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
    const isCS = actor?.roles.includes('CS') && !actor?.roles.includes('ADMIN') && !actor?.roles.includes('MANAGE');
    const isTeacher = actor?.roles.includes('TEACHER') && !actor?.roles.includes('ADMIN') && !actor?.roles.includes('MANAGE');
    let classIds: number[] | undefined = undefined;
    if (isTeacher && actor) {
      classIds = await this.repo.getTeacherAssignedClassIds(actor.id);
    }
    const attendances = await this.repo.getAllAttendances({
      classIds,
      cs_id: isCS && actor ? actor.id : undefined,
    });
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

    const snapshot: any = before.snapshot;
    const pkg = await prisma.package.findUnique({ where: { code: before.package_code } });
    const csId = dto.assignedCsId || before.assigned_cs_id;
    if (!pkg || !csId) throw new AppError(409, 'Gói học hoặc CS phụ trách chưa hợp lệ');

    // Check if Sale exists
    let saleRecord = null;
    if (snapshot?.sale_name && String(snapshot.sale_name).trim()) {
      saleRecord = await this.repo.findOrCreateSale(String(snapshot.sale_name).trim());
    }
    const saleId = saleRecord ? saleRecord.id : null;
    const saleName = snapshot?.sale_name ? String(snapshot.sale_name).trim() : null;

    const existing = await prisma.student.findUnique({
      where: { external_id: before.external_id },
      include: {
        enrollments: {
          where: { package_id: pkg.id },
          include: { enrollment_classes: { include: { class: true } } },
        },
      },
    });

    if (existing && existing.enrollments.length > 0) {
      // Approved transfer of existing enrollment
      const enrollment = existing.enrollments[0];
      return prisma.$transaction(async (tx) => {
        const updateData: any = {
          cs_id: csId,
          external_synced_at: new Date(),
        };
        if (saleId) {
          updateData.sale_id = saleId;
          updateData.sale_name = saleName;
        }
        const updatedEnrollment = await tx.enrollment.update({
          where: { id: enrollment.id },
          data: updateData,
        });

        const request = await tx.importCreateRequest.update({
          where: { id },
          data: {
            status: ImportCreateRequestStatus.APPROVED,
            assigned_cs_id: csId,
            reviewed_by_id: actor.id,
            reviewed_at: new Date(),
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            user_id: actor.id,
            action: 'IMPORT_REQUEST_APPROVED_TRANSFER',
            entity_type: 'ImportCreateRequest',
            entity_id: String(id),
            before_data: before as any,
            after_data: request as any,
          },
        });

        return { student: existing, enrollment: updatedEnrollment, request };
      });
    }

    return prisma.$transaction(async (tx) => {
      let studentId = existing?.id;
      let student = existing as any;
      if (!studentId) {
        const created = await tx.student.create({
          data: {
            external_id: before.external_id,
            full_name: snapshot.full_name || before.external_id,
            phone: snapshot.phone || null,
            email: snapshot.email || null,
            gender: snapshot.gender || null,
            occupation: snapshot.occupation || null,
          },
        });
        studentId = created.id;
        student = created;
      }

      const enrollment = await tx.enrollment.create({
        data: {
          external_id: before.external_id,
          student_id: studentId,
          package_id: pkg.id,
          cs_id: csId,
          sale_id: saleId,
          sale_name: saleName,
          total_sessions: Number(snapshot.total_sessions) || pkg.default_total_sessions || 0,
          external_remaining_sessions: snapshot.remaining_sessions === '' ? null : Number(snapshot.remaining_sessions),
          attended_previous_years: snapshot.attended_previous_years !== undefined && snapshot.attended_previous_years !== '' ? Number(snapshot.attended_previous_years) : 0,
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
        if (!cls) cls = await tx.class.create({ data: { class_name: snapshot.class_name, class_code: snapshot.class_name, level: snapshot.level || null, model_type: ClassModelType.ONE_TO_ONE, attendance_source: 'LEARNING_SYSTEM' } });
        enrollmentClass = await tx.enrollmentClass.create({ data: { enrollment_id: enrollment.id, class_id: cls.id, sequence_no: 1, start_date: this.parseExcelDate(snapshot.start_date), end_date: this.parseExcelDate(snapshot.end_date), status: EnrollmentClassStatus.ACTIVE } });
        await this.applyAttendance(tx, enrollmentClass.id, cls.id, snapshot.attendance || [], actor.id);
      }

      const request = await tx.importCreateRequest.update({ where: { id }, data: { status: ImportCreateRequestStatus.APPROVED, assigned_cs_id: csId, reviewed_by_id: actor.id, reviewed_at: new Date(), version: { increment: 1 } } });
      await tx.auditLog.create({ data: { user_id: actor.id, action: 'IMPORT_REQUEST_APPROVED', entity_type: 'ImportCreateRequest', entity_id: String(id), before_data: before as any, after_data: request as any } });
      return { student, enrollment, enrollmentClass, request };
    });
  }

}

