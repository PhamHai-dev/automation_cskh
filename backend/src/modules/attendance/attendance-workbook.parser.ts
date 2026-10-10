import ExcelJS from 'exceljs';
import { AttendanceStatus } from '@prisma/client';
import { parseAttendanceValue, parseTimeSlot, normalizeDateOnly } from './attendance.utils';

export type AttendanceWorkbookSource = 'TEACHER' | 'CS';

export interface AttendanceWorkbookCell {
  source: AttendanceWorkbookSource;
  sheetName: string;
  cellAddress: string;
  rowNumber: number;
  columnNumber: number;
  studentExternalId?: string;
  studentName?: string;
  classReference?: string;
  startTime?: string;
  endTime?: string;
  sessionDate: Date;
  rawValue: string;
  status?: AttendanceStatus;
  lessonTopic?: string;
  error?: string;
}

export interface AttendanceWorkbookParseResult {
  sheetName: string;
  headerRowNumber: number;
  dateColumnCount: number;
  cells: AttendanceWorkbookCell[];
}

function cellText(cell: ExcelJS.Cell): string {
  return String(cell.text || cell.value || '').trim();
}

function headerDate(cell: ExcelJS.Cell): Date | undefined {
  const value = cell.value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return normalizeDateOnly(value) || value;
  }
  return undefined;
}

function findHeader(sheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(10, sheet.rowCount); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const dateColumns: Array<{ columnNumber: number; date: Date }> = [];
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const date = headerDate(cell);
      if (date) dateColumns.push({ columnNumber, date });
    });
    if (dateColumns.length >= 7) return { rowNumber, dateColumns };
  }
  return undefined;
}

function findSheet(workbook: ExcelJS.Workbook, source: AttendanceWorkbookSource) {
  if (source === 'TEACHER') {
    return workbook.worksheets.find((sheet) => /スケジュール|schedule|lịch dạy/i.test(sheet.name));
  }
  return workbook.worksheets.find((sheet) => /chấm\s*buổi|điểm\s*danh|attendance/i.test(sheet.name));
}

function parseTeacherRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  const time = parseTimeSlot(cellText(row.getCell(6)));
  return {
    studentExternalId: cellText(row.getCell(2)).replace(/\.0$/, '') || undefined,
    studentName: cellText(row.getCell(3)) || undefined,
    classReference: cellText(row.getCell(1)) || undefined,
    startTime: time.startTime,
    endTime: time.endTime,
  };
}

function parseCSRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  const rawStartTime = cellText(row.getCell(13));
  const normalizedStartTime = rawStartTime
    .replace(/\s+/g, '')
    .replace(/^(\d{1,2})h(\d{2})$/i, '$1:$2');
  const time = parseTimeSlot(normalizedStartTime);
  return {
    studentExternalId: cellText(row.getCell(1)).replace(/\.0$/, '') || undefined,
    studentName: cellText(row.getCell(2)) || undefined,
    classReference: cellText(row.getCell(23)) || cellText(row.getCell(8)) || undefined,
    startTime: time.startTime || (/^\d{1,2}:\d{2}$/.test(normalizedStartTime) ? normalizedStartTime : undefined),
    endTime: time.endTime,
  };
}

export async function parseAttendanceWorkbook(
  fileBuffer: Buffer,
  source: AttendanceWorkbookSource,
): Promise<AttendanceWorkbookParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as any);
  const sheet = findSheet(workbook, source);
  if (!sheet) throw new Error(source === 'TEACHER' ? 'Không tìm thấy sheet lịch dạy' : 'Không tìm thấy sheet chấm buổi');

  const header = findHeader(sheet);
  if (!header) throw new Error('Không tìm thấy hàng tiêu đề có các cột ngày hợp lệ');

  const cells: AttendanceWorkbookCell[] = [];
  for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const identity = source === 'TEACHER'
      ? parseTeacherRow(sheet, rowNumber)
      : parseCSRow(sheet, rowNumber);
    if (!identity.studentExternalId) continue;

    for (const dateColumn of header.dateColumns) {
      const cell = sheet.getRow(rowNumber).getCell(dateColumn.columnNumber);
      const rawValue = cellText(cell);
      if (!rawValue || (source === 'CS' && Number(rawValue) === 0)) continue;

      const parsed = parseAttendanceValue(rawValue);
      const studentExternalId = parsed.studentExternalId || identity.studentExternalId;
      const mismatch = parsed.studentExternalId
        && parsed.studentExternalId !== identity.studentExternalId;
      cells.push({
        source,
        sheetName: sheet.name,
        cellAddress: cell.address,
        rowNumber,
        columnNumber: dateColumn.columnNumber,
        ...identity,
        studentExternalId,
        sessionDate: dateColumn.date,
        rawValue,
        status: parsed.status || undefined,
        lessonTopic: parsed.lessonTopic || undefined,
        error: mismatch
          ? `Mã học viên trong ô (${parsed.studentExternalId}) không khớp mã của dòng (${identity.studentExternalId})`
          : parsed.status ? undefined : 'Giá trị điểm danh không hợp lệ',
      });
    }
  }

  return {
    sheetName: sheet.name,
    headerRowNumber: header.rowNumber,
    dateColumnCount: header.dateColumns.length,
    cells,
  };
}
