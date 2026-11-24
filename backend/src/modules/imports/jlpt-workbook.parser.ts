import ExcelJS from 'exceljs';
import { AttendanceStatus, JlptRating } from '@prisma/client';

export interface ParsedJlptSessionColumn {
  column: number;
  sessionNumber: number;
  sourceHeader: string;
  proposedType: 'LESSON' | 'TEST';
  proposedTitle: string | null;
}

export interface ParsedJlptStudentBlock {
  sheetName: string;
  level: 'N2' | 'N3' | 'N4' | 'N5';
  rowNumber: number;
  teacherCode: string | null;
  classCode: string;
  studentName: string;
  values: Array<{
    session: ParsedJlptSessionColumn;
    rawAttendance: string | null;
    teacherStatus: AttendanceStatus | null;
    attendancePopulated: boolean;
    ambiguousAbsence: boolean;
    sourceNote: string | null;
    notePopulated: boolean;
    preparationRating: JlptRating | null;
    preparationPopulated: boolean;
    attitudeRating: JlptRating | null;
    attitudePopulated: boolean;
    homeworkCompleted: boolean | null;
    homeworkPopulated: boolean;
    testCorrectAnswers: number | null;
    testPopulated: boolean;
  }>;
}

export interface ParsedJlptWorkbook {
  blocks: ParsedJlptStudentBlock[];
  warnings: string[];
  errors: string[];
  externalIds: Map<string, string>;
}

const STATUS_MARKER = /\[STATUS:(ATTENDED|ABSENT_APPROVED_A|LEAVE_B|ABSENT_UNAPPROVED_C|TEACHER_ABSENT_D|TECH_ERROR_E)\]/i;
const CRITERIA = {
  attendance: ['chuyen can'],
  preparation: ['chuan bi bai o nha'],
  attitude: ['thai do hoc tap trong lop', 'thai do hoc tap'],
  homework: ['diem bai tap ve nha', 'bai tap ve nha'],
  test: ['diem kiem tra'],
  note: ['ghi chu'],
} as const;

export function normalizeJlptText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function identityKey(classCode: string, studentName: string): string {
  return `${normalizeJlptText(classCode)}::${normalizeJlptText(studentName)}`;
}

export function valueToText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

export function parseAttendanceValue(rawValue: unknown, rawNote: unknown): {
  raw: string | null;
  status: AttendanceStatus | null;
  ambiguous: boolean;
  cleanNote: string | null;
  populated: boolean;
} {
  const raw = valueToText(rawValue);
  const note = valueToText(rawNote);
  const marker = note?.match(STATUS_MARKER) ?? null;
  const cleanNote = note ? note.replace(STATUS_MARKER, '').replace(/^\s*[-–—:]\s*/, '').trim() || null : null;
  if (!raw) return { raw: null, status: null, ambiguous: false, cleanNote, populated: false };
  const normalized = raw.toUpperCase().replace(/\s+/g, '');
  if (normalized === 'O' || normalized === '0.5X') {
    return { raw, status: AttendanceStatus.ATTENDED, ambiguous: false, cleanNote, populated: true };
  }
  if (normalized === 'X') {
    if (marker) {
      return { raw, status: marker[1].toUpperCase() as AttendanceStatus, ambiguous: false, cleanNote, populated: true };
    }
    if (cleanNote) return { raw, status: null, ambiguous: true, cleanNote, populated: true };
    return { raw, status: AttendanceStatus.ABSENT_UNAPPROVED_C, ambiguous: false, cleanNote: null, populated: true };
  }
  return { raw, status: null, ambiguous: false, cleanNote, populated: true };
}

function parseRating(value: unknown): JlptRating | null {
  const text = valueToText(value)?.toUpperCase();
  return text === 'A' || text === 'B' || text === 'C' ? text as JlptRating : null;
}

function parseHomework(value: unknown): boolean | null {
  const text = normalizeJlptText(value);
  if (!text) return null;
  if (['co', 'yes', 'true', '1', 'dat', 'hoan thanh'].includes(text)) return true;
  if (['khong', 'no', 'false', '0', 'chua', 'khong hoan thanh'].includes(text)) return false;
  return null;
}

function parseScore(value: unknown): number | null {
  const text = valueToText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function criterionOf(value: unknown): keyof typeof CRITERIA | null {
  const normalized = normalizeJlptText(value);
  for (const [key, aliases] of Object.entries(CRITERIA)) {
    if ((aliases as readonly string[]).includes(normalized)) return key as keyof typeof CRITERIA;
  }
  return null;
}

export function parseSessionHeader(value: unknown, ordinal: number): ParsedJlptSessionColumn {
  const sourceHeader = valueToText(value) || `Buổi ${ordinal}`;
  const normalized = normalizeJlptText(sourceHeader);
  const isTest = /(^|\s)(kt|kiem tra)/.test(normalized);
  return {
    column: ordinal + 5,
    sessionNumber: ordinal,
    sourceHeader,
    proposedType: isTest ? 'TEST' : 'LESSON',
    proposedTitle: isTest ? sourceHeader : null,
  };
}

function findRowsByCriterion(sheet: ExcelJS.Worksheet, startRow: number): Map<keyof typeof CRITERIA, number> | null {
  const result = new Map<keyof typeof CRITERIA, number>();
  for (let row = startRow; row <= Math.min(sheet.rowCount, startRow + 5); row += 1) {
    const criterion = criterionOf(sheet.getCell(row, 5).value);
    if (criterion) result.set(criterion, row);
  }
  return result.size === 6 ? result : null;
}

function parseInfoExternalIds(workbook: ExcelJS.Workbook): Map<string, string> {
  const result = new Map<string, string>();
  const sheet = workbook.worksheets.find((item) => normalizeJlptText(item.name) === 'info');
  if (!sheet) return result;
  for (let row = 1; row <= Math.min(sheet.rowCount, 200); row += 1) {
    const headers: Record<string, number> = {};
    for (let column = 1; column <= Math.min(sheet.columnCount, 100); column += 1) {
      const text = normalizeJlptText(sheet.getCell(row, column).value);
      if (text.includes('ma hoc vien') || text === 'ma hv') headers.student = column;
      if (text.includes('ho va ten') || text === 'ho ten') headers.name = column;
      if (text.includes('ma lop')) headers.class = column;
    }
    if (!headers.student || !headers.name || !headers.class) continue;
    for (let dataRow = row + 1; dataRow <= sheet.rowCount; dataRow += 1) {
      const externalId = valueToText(sheet.getCell(dataRow, headers.student).value);
      const name = valueToText(sheet.getCell(dataRow, headers.name).value);
      const classCode = valueToText(sheet.getCell(dataRow, headers.class).value);
      if (externalId && name && classCode) result.set(identityKey(classCode, name), externalId);
    }
    break;
  }
  return result;
}

export async function parseJlptWorkbook(buffer: Buffer): Promise<ParsedJlptWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const blocks: ParsedJlptStudentBlock[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const sheet of workbook.worksheets) {
    const levelMatch = normalizeJlptText(sheet.name).match(/^nkht\s+(n[2-5])/i);
    if (!levelMatch) continue;
    const level = levelMatch[1].toUpperCase() as ParsedJlptStudentBlock['level'];
    const sessions: ParsedJlptSessionColumn[] = [];
    for (let column = 6; column <= sheet.columnCount; column += 1) {
      const header = valueToText(sheet.getCell(1, column).value);
      if (!header) continue;
      sessions.push({ ...parseSessionHeader(header, sessions.length + 1), column });
    }
    if (sessions.length === 0) {
      errors.push(`${sheet.name}: không tìm thấy cột Buổi/KT.`);
      continue;
    }

    for (let row = 2; row <= sheet.rowCount; row += 1) {
      if (criterionOf(sheet.getCell(row, 5).value) !== 'attendance') continue;
      const criteriaRows = findRowsByCriterion(sheet, row);
      if (!criteriaRows) {
        errors.push(`${sheet.name} dòng ${row}: nhóm học viên không đủ 6 tiêu chí.`);
        continue;
      }
      const classCode = valueToText(sheet.getCell(row, 3).value);
      const studentName = valueToText(sheet.getCell(row, 4).value);
      const teacherCode = valueToText(sheet.getCell(row, 2).value);
      if (!classCode && !studentName) continue;
      if (!classCode || !studentName) {
        errors.push(`${sheet.name} dòng ${row}: thiếu Mã lớp hoặc Họ và tên.`);
        continue;
      }
      const noteRow = criteriaRows.get('note')!;
      const values = sessions.map((session) => {
        const attendance = parseAttendanceValue(
          sheet.getCell(criteriaRows.get('attendance')!, session.column).value,
          sheet.getCell(noteRow, session.column).value,
        );
        const preparationRaw = sheet.getCell(criteriaRows.get('preparation')!, session.column).value;
        const attitudeRaw = sheet.getCell(criteriaRows.get('attitude')!, session.column).value;
        const homeworkRaw = sheet.getCell(criteriaRows.get('homework')!, session.column).value;
        const testRaw = sheet.getCell(criteriaRows.get('test')!, session.column).value;
        const preparationRating = parseRating(preparationRaw);
        const attitudeRating = parseRating(attitudeRaw);
        const homeworkCompleted = parseHomework(homeworkRaw);
        const testCorrectAnswers = parseScore(testRaw);
        if (attendance.populated && !attendance.status && !attendance.ambiguous) {
          errors.push(`${sheet.name} dòng ${row}, ${session.sourceHeader}: Chuyên cần chỉ nhận O, X hoặc 0.5X.`);
        }
        if (valueToText(preparationRaw) !== null && preparationRating === null) {
          errors.push(`${sheet.name} dòng ${criteriaRows.get('preparation')}, ${session.sourceHeader}: Chuẩn bị chỉ nhận A/B/C.`);
        }
        if (valueToText(attitudeRaw) !== null && attitudeRating === null) {
          errors.push(`${sheet.name} dòng ${criteriaRows.get('attitude')}, ${session.sourceHeader}: Thái độ chỉ nhận A/B/C.`);
        }
        if (valueToText(homeworkRaw) !== null && homeworkCompleted === null) {
          errors.push(`${sheet.name} dòng ${criteriaRows.get('homework')}, ${session.sourceHeader}: BTVN chỉ nhận Có/Không.`);
        }
        if (valueToText(testRaw) !== null && testCorrectAnswers === null) {
          errors.push(`${sheet.name} dòng ${criteriaRows.get('test')}, ${session.sourceHeader}: Điểm kiểm tra phải là số nguyên không âm.`);
        }
        return {
          session,
          rawAttendance: attendance.raw,
          teacherStatus: attendance.status,
          attendancePopulated: attendance.populated,
          ambiguousAbsence: attendance.ambiguous,
          sourceNote: attendance.cleanNote,
          notePopulated: valueToText(sheet.getCell(noteRow, session.column).value) !== null,
          preparationRating,
          preparationPopulated: valueToText(preparationRaw) !== null,
          attitudeRating,
          attitudePopulated: valueToText(attitudeRaw) !== null,
          homeworkCompleted,
          homeworkPopulated: valueToText(homeworkRaw) !== null,
          testCorrectAnswers,
          testPopulated: valueToText(testRaw) !== null,
        };
      });
      blocks.push({ sheetName: sheet.name, level, rowNumber: row, teacherCode, classCode, studentName, values });
      row += 5;
    }
  }

  if (blocks.length === 0) errors.push('Workbook không có dữ liệu học viên trong các sheet NKHT N2–N5.');
  return { blocks, warnings, errors, externalIds: parseInfoExternalIds(workbook) };
}

export function exportAttendanceValue(status: AttendanceStatus | null | undefined): 'O' | 'X' | null {
  if (!status) return null;
  return status === AttendanceStatus.ATTENDED ? 'O' : 'X';
}

export function exportNoteValue(status: AttendanceStatus | null | undefined, note: string | null | undefined): string | null {
  const clean = valueToText(note);
  if (!status || status === AttendanceStatus.ATTENDED) return clean;
  return clean ? `[STATUS:${status}] ${clean}` : `[STATUS:${status}]`;
}
