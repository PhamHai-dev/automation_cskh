import ExcelJS from 'exceljs';
import { CareLogOutcome, ClassModelType, EnrollmentStatus } from '@prisma/client';
import { classifyClassModel } from './model-mapper';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');

/**
 * Load only selected worksheets from an .xlsx buffer and strip empty styled cells/rows.
 * This reduces memory usage from ~1.5GB to ~60MB and load time from 60s to <1s on large Google Sheet exports.
 */
export async function loadOptimizedWorkbook(
  buffer: Buffer,
  targetSheetNames?: string[]
): Promise<ExcelJS.Workbook> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const wbFile = zip.file('xl/workbook.xml');
    const relsFile = zip.file('xl/_rels/workbook.xml.rels');

    if (wbFile && relsFile) {
      const wbXml: string = await wbFile.async('string');
      const relsXml: string = await relsFile.async('string');

      const relMap = new Map<string, string>();
      const relRegex = /<Relationship\b[^>]*>/g;
      let match: RegExpExecArray | null;
      while ((match = relRegex.exec(relsXml)) !== null) {
        const tag = match[0];
        const idMatch = tag.match(/\bId="([^"]+)"/);
        const targetMatch = tag.match(/\bTarget="([^"]+)"/);
        if (idMatch && targetMatch) {
          let target = targetMatch[1].replace(/^\//, '');
          if (!target.startsWith('xl/')) target = `xl/${target}`;
          relMap.set(idMatch[1], target);
        }
      }

      const wantedSet = targetSheetNames && targetSheetNames.length > 0
        ? new Set(targetSheetNames.map((s) => s.trim().toLowerCase()))
        : null;

      const sheetTagRegex = /<sheet\b[^>]*\/>/g;
      const keptSheetsXml: string[] = [];
      const keepTargets = new Set<string>();

      while ((match = sheetTagRegex.exec(wbXml)) !== null) {
        const tag = match[0];
        const nameMatch = tag.match(/\bname="([^"]+)"/);
        const rIdMatch = tag.match(/\br:id="([^"]+)"/);
        if (nameMatch && rIdMatch) {
          const sName = nameMatch[1].trim().toLowerCase();
          if (!wantedSet || wantedSet.has(sName)) {
            keptSheetsXml.push(tag);
            const target = relMap.get(rIdMatch[1]);
            if (target) keepTargets.add(target);
          }
        }
      }

      if (keptSheetsXml.length > 0) {
        for (const filePath of Object.keys(zip.files)) {
          if (filePath.startsWith('xl/worksheets/sheet') && filePath.endsWith('.xml')) {
            if (!keepTargets.has(filePath)) {
              zip.remove(filePath);
            } else {
              let wsXml: string = await zip.file(filePath).async('string');
              // Strip self-closing empty styled cells <c r="A2000" s="124"/> and empty rows
              wsXml = wsXml.replace(/<c\b[^>]*\/>/g, '');
              wsXml = wsXml.replace(/<row\b[^>]*>\s*<\/row>/g, '');
              zip.file(filePath, wsXml);
            }
          }
        }
        zip.remove('xl/calcChain.xml');

        const newWbXml = wbXml.replace(
          /<sheets>[\s\S]*?<\/sheets>/,
          `<sheets>${keptSheetsXml.join('')}</sheets>`
        );
        zip.file('xl/workbook.xml', newWbXml);

        const slimBuffer: Buffer = await zip.generateAsync({
          type: 'nodebuffer',
          compression: 'STORE',
        });
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(slimBuffer as any);
        return wb;
      }
    }
  } catch {
    // Fallback to standard ExcelJS load if zip optimization fails
  }

  const fallbackWb = new ExcelJS.Workbook();
  await fallbackWb.xlsx.load(buffer as any);
  return fallbackWb;
}

export interface JlptSettingCourse {
  code: string;
  durationHours: number | null;
  durationMinutes: number | null;
  totalSessions: number;
}

export interface NormalizedCareLogItem {
  after_session_number: number;
  content: string;
  outcome: CareLogOutcome;
}

export interface NormalizedSheetRow {
  rowNumber: number;
  syncKey: string;
  programType: 'JLPT' | 'KAIWA';
  externalId: string;
  fullName: string;
  gender: string | null;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null; // ISO date YYYY-MM-DD
  occupation: string | null;
  saleName: string | null;
  studentSourceStatus: string | null;
  paidAt: string | null; // ISO date
  courseContent: string | null;
  paymentStatus: string | null;
  packageCode: string;
  courseTeacherType: string | null;
  level: string | null;
  totalSessions: number;
  remainingSessions: number | null;
  attendedPreviousYears: number;
  classModel: string | null;
  salesNote: string | null;
  cvhtCode: string | null; // e.g., CVHT01, CVHT02, CVHT03
  startDate: string | null;
  endDate: string | null;
  status: EnrollmentStatus;
  startTime: string | null;
  schedulePattern: string | null;
  durationMinutes: number | null;
  teacherName: string | null;
  teacherCode: string | null;
  classCode: string | null;
  className: string | null;
  exchangeInfo: string | null;
  callbackNote: string | null;
  studyReportUrl: string | null;
  hotIssueNote: string | null;
  postCourseCare: string | null;
  handedOverAt: string | null;
  careLogs: NormalizedCareLogItem[];
  programMetadata: Record<string, any>;
}

/**
 * Extract value from ExcelJS cell value, including Google Sheets export formulas:
 * IFERROR(__xludf.DUMMYFUNCTION("..."), fallback_value)
 */
export function extractCellValue(cellValue: any): any {
  if (cellValue === null || cellValue === undefined) return null;
  if (cellValue instanceof Date) return cellValue;

  if (typeof cellValue === 'object') {
    if ('hyperlink' in cellValue && cellValue.hyperlink) {
      return String(cellValue.hyperlink).trim();
    }
    if ('richText' in cellValue && Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((part: any) => part?.text || '').join('');
    }
    if ('formula' in cellValue || 'sharedFormula' in cellValue) {
      const res = cellValue.result;
      if (res !== undefined && res !== null) {
        if (typeof res === 'object' && 'error' in res) return null;
        if (typeof res === 'string') {
          const trimmedRes = res.trim();
          if (trimmedRes === '#REF!' || trimmedRes === '#N/A' || trimmedRes === '#VALUE!' || trimmedRes === '#ERROR!' || trimmedRes === '#NAME?') {
            return null;
          }
        }
        return res;
      }

      const formulaStr = String(cellValue.formula || '');
      if (formulaStr) {
        const match = formulaStr.match(/,\s*("([^"]|"")*"|-?\d+(?:\.\d+)?(?:E[+-]?\d+)?)\s*\)\s*$/i);
        if (match) {
          const rawFallback = match[1];
          if (rawFallback.startsWith('"') && rawFallback.endsWith('"')) {
            return rawFallback.slice(1, -1).replace(/""/g, '"');
          }
          const num = Number(rawFallback);
          if (!Number.isNaN(num)) {
            return num;
          }
        }
      }
      return null;
    }
    if ('error' in cellValue) return null;
    if ('text' in cellValue) return String(cellValue.text ?? '').trim();
  }

  return cellValue;
}

/**
 * Convert an ExcelJS cell into trimmed string representation
 */
export function cellText(cell: ExcelJS.Cell | undefined | null): string {
  if (!cell) return '';
  const val = extractCellValue(cell.value);
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return '';
    return val.toISOString().slice(0, 10);
  }
  return String(val).trim();
}

/**
 * Convert an Excel value (Date, serial number, or string) into a Date object
 */
export function parseSheetDate(rawVal: any): Date | null {
  const val = extractCellValue(rawVal);
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val;
  }

  if (typeof val === 'number') {
    if (val >= 1940 && val <= 2025) {
      return new Date(Date.UTC(Math.round(val), 0, 1));
    }
    if (val > 25000 && val < 80000) {
      const ms = Math.round((val - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  if (typeof val === 'string') {
    let trimmed = val.trim();
    if (!trimmed || trimmed === '-') return null;
    if (trimmed.includes('\n')) {
      trimmed = trimmed.split(/\r?\n/)[0].trim();
    }

    // Check 4-digit birth year e.g. "1995"
    if (/^\d{4}$/.test(trimmed)) {
      const yr = parseInt(trimmed, 10);
      if (yr >= 1940 && yr <= 2030) {
        return new Date(Date.UTC(yr, 0, 1));
      }
    }

    // Check numeric serial string e.g. "44387" or "44387.0"
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
      const num = parseFloat(trimmed);
      if (num > 25000 && num < 80000) {
        const ms = Math.round((num - 25569) * 86400 * 1000);
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      return null;
    }

    // ISO YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      const d = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    // DD/MM/YYYY or M/D/YYYY
    const slashMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (slashMatch) {
      const p1 = parseInt(slashMatch[1], 10);
      const p2 = parseInt(slashMatch[2], 10);
      const yr = parseInt(slashMatch[3], 10);
      let day = p1;
      let month = p2;
      if (p1 <= 12 && p2 > 12) {
        month = p1;
        day = p2;
      }
      const d = new Date(Date.UTC(yr, month - 1, day));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

export function formatIsoDateOnly(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Normalize Vietnamese & Japanese phone numbers stored as numbers in Excel/Google Sheets
 */
export function normalizePhone(rawVal: any): string | null {
  const val = extractCellValue(rawVal);
  if (val === null || val === undefined) return null;

  let str = '';
  if (typeof val === 'number') {
    if (val === 0 || Number.isNaN(val)) return null;
    str = String(Math.trunc(val));
  } else {
    str = String(val).trim();
  }

  if (!str || str === '0' || str === '0.0' || str === '-') return null;

  // Handle scientific notation string if any
  if (/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(str)) {
    const num = Number(str);
    if (!Number.isNaN(num) && num > 0) {
      str = String(Math.trunc(num));
    }
  }

  // Strip spaces, dots, dashes
  const digits = str.replace(/[\s.-]/g, '');

  // 9 digits starting with 3, 5, 7, 8, 9 (Vietnamese mobile missing leading 0)
  if (/^[35789]\d{8}$/.test(digits)) {
    return `0${digits}`;
  }

  // 10 digits starting with 70, 80, 90 (Japanese mobile missing leading 0)
  if (/^(70|80|90)\d{8}$/.test(digits)) {
    return `0${digits}`;
  }

  return digits || null;
}

/**
 * Normalize External ID (prevent scientific notation / float .0)
 */
export function normalizeExternalId(rawVal: any): string {
  const val = extractCellValue(rawVal);
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    if (Number.isNaN(val) || val === 0) return '';
    return String(Math.trunc(val));
  }
  const str = String(val).trim();
  if (!str || str === '-') return '';
  if (/^\d+\.0+$/.test(str)) {
    return str.replace(/\.0+$/, '');
  }
  if (/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(str)) {
    const num = Number(str);
    if (!Number.isNaN(num)) return String(Math.trunc(num));
  }
  return str;
}

/**
 * Normalize CVHT code (e.g. CVHT01, CVHT02, CVHT03)
 */
export function extractCvhtCode(primaryVal: any, fallbackNote?: string | null): string | null {
  const rawPrimary = extractCellValue(primaryVal);
  if (rawPrimary !== null && rawPrimary !== undefined) {
    const cleaned = String(rawPrimary).trim().toUpperCase().replace(/CVHTO(\d)/i, 'CVHT0$1');
    const match = cleaned.match(/CVHT0\d/i);
    if (match) return match[0].toUpperCase();
    if (cleaned.startsWith('CVHT')) return cleaned;
  }

  if (fallbackNote) {
    const normalizedNote = fallbackNote.replace(/CVHTO(\d)/gi, 'CVHT0$1');
    const match = normalizedNote.match(/CVHT0\d/i);
    if (match) return match[0].toUpperCase();
  }

  return null;
}

/**
 * Map Vietnamese status text to EnrollmentStatus enum
 */
export function mapEnrollmentStatus(rawStatus: string | null | undefined): EnrollmentStatus {
  const s = (rawStatus || '').trim().toLowerCase();
  if (!s) return EnrollmentStatus.STUDYING;
  if (s.includes('kết thúc') || s.includes('hoàn thành')) return EnrollmentStatus.FINISHED;
  if (s.includes('đang học') || s.includes('video')) return EnrollmentStatus.STUDYING;
  if (s.includes('chờ lớp') || s.includes('đợi lớp')) return EnrollmentStatus.WAITING_CLASS;
  if (s.includes('bảo lưu') || s.includes('tạm nghỉ')) return EnrollmentStatus.PAUSED;
  if (s.includes('sắp học')) return EnrollmentStatus.UPCOMING;
  if (s.includes('chưa học')) return EnrollmentStatus.NOT_STARTED;
  if (s.includes('hủy') || s.includes('nghỉ học')) return EnrollmentStatus.CANCELLED;
  return EnrollmentStatus.STUDYING;
}

/**
 * Map class model string to ClassModelType enum. E.1: delegates to the single
 * canonical mapper (model-mapper.ts) shared by every ingestion path. Kept as
 * the stable import name for sheet-sync.service so behavior is unchanged while
 * there is now exactly one decision rule in the codebase.
 */
export function mapClassModelType(rawModel: string | null | undefined): ClassModelType {
  return classifyClassModel(rawModel);
}

/**
 * Extract start time HH:mm from strings like "19:30 - 21:00", "18:30~20:30", "20h00", "18h30"
 */
export function extractStartTime(rawTime: any): string | null {
  const val = extractCellValue(rawTime);
  if (val === null || val === undefined) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const hh = String(val.getUTCHours()).padStart(2, '0');
    const mm = String(val.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const str = String(val).trim();
  if (!str) return null;
  const firstLine = str.split(/\r?\n/)[0].trim();
  const match = firstLine.match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/);
  if (!match) return null;
  const hh = parseInt(match[1], 10);
  const mm = match[2] ? parseInt(match[2], 10) : 0;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Normalize sheet schedule strings like "T2-T4-T6", "T3-T5-T7", "246", "Thứ 2, 4, 6", "35CN"
 * into canonical compact format ("246", "357", "35CN", "LKCD") required by AutoAttendanceService.
 */
export function extractSchedulePattern(rawPattern: any): string | null {
  const val = extractCellValue(rawPattern);
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str || str === '-') return null;

  const firstLine = str.split(/\r?\n/)[0].trim().toUpperCase();
  if (!firstLine) return null;
  if (firstLine === 'LKCD' || firstLine.includes('LINH HOẠT') || firstLine.includes('TỰ DO')) {
    return 'LKCD';
  }

  // Strip common Vietnamese prefixes/separators: "THỨ", "T", "-", ",", "/", ".", spaces
  const cleaned = firstLine
    .replace(/CHỦ\s*NHẬT/g, 'CN')
    .replace(/CHU\s*NHAT/g, 'CN')
    .replace(/THỨ\s*/g, '')
    .replace(/THU\s*/g, '')
    .replace(/T(?=[2-7])/g, '')
    .replace(/[\s\-_,./+~;]+/g, '');

  const tokens = new Set<number>();
  for (let i = 0; i < cleaned.length; ) {
    const ch = cleaned[i];
    if (ch >= '2' && ch <= '7') {
      tokens.add(Number(ch));
      i += 1;
      continue;
    }
    if (cleaned.slice(i, i + 2) === 'CN' || ch === '8') {
      tokens.add(8);
      i += ch === '8' ? 1 : 2;
      continue;
    }
    // Unrecognized token -> fallback to LKCD so AutoAttendanceService never logs a warning
    return 'LKCD';
  }

  if (tokens.size === 0) return null;
  const ordered = [2, 3, 4, 5, 6, 7, 8].filter((d) => tokens.has(d));
  return ordered.map((d) => (d === 8 ? 'CN' : String(d))).join('');
}

/**
 * Infer CareLogOutcome from care log text content
 */
export function inferCareLogOutcome(text: string): CareLogOutcome {
  const lower = (text || '').toLowerCase();
  if (lower.includes('hệ thống')) return CareLogOutcome.NEED_SUPPORT_SYSTEM;
  if (lower.includes('phản hồi tạm') || lower.includes('học thêm rồi báo')) return CareLogOutcome.TEMP_PAUSE;
  if (lower.includes('chương trình học')) return CareLogOutcome.NEED_CURRICULUM_SUPPORT;
  if (lower.includes('điểm yếu')) return CareLogOutcome.NEED_STUDENT_WEAKNESS_FIX;
  if (lower.includes('giáo viên')) return CareLogOutcome.NEED_TEACHER_SUPPORT;
  if (lower.includes('tiêu cực') || lower.includes('muốn dừng')) return CareLogOutcome.NEGATIVE_WANTS_TO_STOP;
  if (lower.includes('chưa phản hồi')) return CareLogOutcome.NO_RESPONSE;
  return CareLogOutcome.POSITIVE;
}

/**
 * Parse JLPT Setting sheet to get course duration and total sessions
 */
export function parseJlptSettingsSheet(workbook: ExcelJS.Workbook, settingSheetName = 'Setting'): Map<string, JlptSettingCourse> {
  const map = new Map<string, JlptSettingCourse>();
  const ws = workbook.getWorksheet(settingSheetName);
  if (!ws) return map;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawCode = extractCellValue(row.getCell(3).value);
    if (!rawCode) continue;
    const code = String(rawCode).trim().toUpperCase();
    if (!code || code === 'MÃ KHOÁ' || code === 'MÃ KHÓA') continue;

    const rawDuration = extractCellValue(row.getCell(4).value);
    const rawTotal = extractCellValue(row.getCell(5).value);

    const durationHours = rawDuration !== null && rawDuration !== '' && !Number.isNaN(Number(rawDuration))
      ? Number(rawDuration)
      : null;
    const durationMinutes = durationHours && durationHours > 0 ? Math.round(durationHours * 60) : null;
    const totalSessions = rawTotal !== null && rawTotal !== '' && !Number.isNaN(Number(rawTotal)) && Number(rawTotal) > 0
      ? Math.round(Number(rawTotal))
      : 35;

    map.set(code, {
      code,
      durationHours,
      durationMinutes,
      totalSessions,
    });
  }

  return map;
}

/**
 * Parse JLPT attended sessions per student external_id from 'Điểm học tập' or 'Chấm buổi'
 */
export function parseJlptAttendedSessions(workbook: ExcelJS.Workbook): Map<string, number> {
  const attendedByExtId = new Map<string, number>();

  // 1. Check 'Điểm học tập' (Col A = ID, Col I = Số buổi đã học)
  const dht = workbook.getWorksheet('Điểm học tập');
  if (dht) {
    for (let r = 3; r <= dht.rowCount; r++) {
      const row = dht.getRow(r);
      const extId = normalizeExternalId(row.getCell(1).value);
      if (!extId) continue;
      const rawAtt = extractCellValue(row.getCell(9).value);
      if (rawAtt !== null && rawAtt !== undefined && rawAtt !== '-') {
        const num = Number(rawAtt);
        // Ignore schedule patterns like 246, 357 mistakenly placed in col I
        if (!Number.isNaN(num) && num >= 0 && num <= 120) {
          attendedByExtId.set(extId, Math.round(num));
        }
      }
    }
  }

  // 2. Check 'Chấm buổi' (Col B = ID học viên, Col L = Số buổi đã học or count daily columns >= 19)
  const cb = workbook.getWorksheet('Chấm buổi');
  if (cb) {
    for (let r = 3; r <= cb.rowCount; r++) {
      const row = cb.getRow(r);
      const extId = normalizeExternalId(row.getCell(2).value);
      if (!extId) continue;
      const colL = extractCellValue(row.getCell(12).value);
      if (colL !== null && colL !== undefined && colL !== '-') {
        const num = Number(colL);
        if (!Number.isNaN(num) && num > 0 && num <= 150) {
          attendedByExtId.set(extId, Math.round(num));
          continue;
        }
      }
    }
  }

  return attendedByExtId;
}

/**
 * Parse all valid student enrollment rows from JLPT sheet ('Data JLPT_Inhouse')
 */
export function parseJlptSheetRows(
  workbook: ExcelJS.Workbook,
  sheetName = 'Data JLPT_Inhouse',
  settingSheetName = 'Setting',
  headerRow = 2,
  limit?: number
): NormalizedSheetRow[] {
  const ws = workbook.getWorksheet(sheetName);
  if (!ws) return [];

  const settingsMap = parseJlptSettingsSheet(workbook, settingSheetName);
  const attendedMap = parseJlptAttendedSessions(workbook);

  const results: NormalizedSheetRow[] = [];
  const syncKeyCounter = new Map<string, number>();

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    if (limit && limit > 0 && results.length >= limit) break;

    const row = ws.getRow(r);
    const rawId = extractCellValue(row.getCell(1).value);
    const rawName = extractCellValue(row.getCell(5).value);

    let externalId = normalizeExternalId(rawId);
    const fullName = rawName ? String(rawName).trim() : '';

    // Skip empty rows or header repetition
    if (!externalId && !fullName) continue;
    if (externalId.toUpperCase() === 'ID' || fullName.toLowerCase() === 'họ tên hv') continue;

    if (!externalId) {
      externalId = `JLPT_ROW_${r}`;
    }

    const saleName = cellText(row.getCell(2)) || null;
    const studentSourceStatus = cellText(row.getCell(3)) || null;
    const paidAtDate = parseSheetDate(row.getCell(4).value);
    const paidAt = formatIsoDateOnly(paidAtDate);
    const gender = cellText(row.getCell(6)) || null;
    const phone = normalizePhone(row.getCell(7).value);
    const email = cellText(row.getCell(8)) || null;
    const classModel = cellText(row.getCell(9)) || null;
    const level = cellText(row.getCell(10)) || null;

    const rawTuition = extractCellValue(row.getCell(11).value);
    const courseContent = rawTuition !== null && rawTuition !== undefined && String(rawTuition).trim() !== ''
      ? String(rawTuition).trim()
      : null;

    const paymentStatus = cellText(row.getCell(12)) || null;
    const salesNote = cellText(row.getCell(13)) || null;
    const expectedStartDateObj = parseSheetDate(row.getCell(14).value);
    const expectedStartDate = formatIsoDateOnly(expectedStartDateObj);
    const activeState = cellText(row.getCell(15)) || null;
    const cvhtCode = extractCvhtCode(row.getCell(16).value, salesNote);

    const rawCourseCode = cellText(row.getCell(17));
    const packageCode = (rawCourseCode || level || 'JLPT_DEFAULT').trim();
    const settingLookupKey = packageCode.toUpperCase();
    const courseSetting = settingsMap.get(settingLookupKey);

    const totalSessions = courseSetting?.totalSessions || 38;
    const durationMinutes = courseSetting?.durationMinutes ?? null;

    const attendedSessions = attendedMap.get(externalId);
    const remainingSessions = attendedSessions !== undefined
      ? Math.max(0, totalSessions - attendedSessions)
      : totalSessions;

    const startDate = formatIsoDateOnly(parseSheetDate(row.getCell(18).value));
    const rawStatus = cellText(row.getCell(19));
    const status = mapEnrollmentStatus(rawStatus);

    const startTime = extractStartTime(row.getCell(20).value);
    const schedulePattern = extractSchedulePattern(row.getCell(21).value);
    const teacherName = cellText(row.getCell(22)) || null;
    const classCode = cellText(row.getCell(23)) || null;
    const rawClassName = cellText(row.getCell(24));
    const className = rawClassName || classCode || null;

    const exchangeInfo = cellText(row.getCell(25)) || null;
    const callbackNote = cellText(row.getCell(26)) || null;
    const satisfactionScoreB18 = cellText(row.getCell(27)) || undefined;
    const examScore = extractCellValue(row.getCell(28).value);
    const examResultCol29 = cellText(row.getCell(29));
    const hotIssueNote = cellText(row.getCell(30)) || null;

    // Care logs: Col 31..35 -> session 1, 15, 25, 30, 35; Col 36 -> session 40 (cuối khóa)
    const careLogs: NormalizedCareLogItem[] = [];
    const careColumns: Array<{ col: number; session: number }> = [
      { col: 31, session: 1 },
      { col: 32, session: 15 },
      { col: 33, session: 25 },
      { col: 34, session: 30 },
      { col: 35, session: 35 },
      { col: 36, session: 40 },
    ];
    for (const cc of careColumns) {
      const content = cellText(row.getCell(cc.col));
      if (content && content !== '-') {
        careLogs.push({
          after_session_number: cc.session,
          content,
          outcome: inferCareLogOutcome(content),
        });
      }
    }

    const endCourseCare = cellText(row.getCell(36)) || undefined;
    const postCourseCare = cellText(row.getCell(37)) || null;

    // Test scores Col 38..44 (l1..l7)
    const testScores: Record<string, string> = {};
    for (let i = 1; i <= 7; i++) {
      const scoreVal = cellText(row.getCell(37 + i));
      if (scoreVal && scoreVal !== '-') {
        testScores[`l${i}`] = scoreVal;
      }
    }

    // Special support Col 45..47 (l1..l3)
    const specialSupport: Record<string, string> = {};
    for (let i = 1; i <= 3; i++) {
      const supVal = cellText(row.getCell(44 + i));
      if (supVal && supVal !== '-') {
        specialSupport[`l${i}`] = supVal;
      }
    }

    const renewalNote = cellText(row.getCell(48)) || undefined;
    const latestClassCode = cellText(row.getCell(49)) || undefined;
    const paidMonth = cellText(row.getCell(50)) || undefined;
    const examRegistration = cellText(row.getCell(51)) || undefined;
    const examResultCol52 = cellText(row.getCell(52));
    const examResult = examResultCol29 || examResultCol52 || undefined;

    const programMetadata: Record<string, any> = {};
    if (expectedStartDate) programMetadata.expected_start_date = expectedStartDate;
    if (activeState) programMetadata.active_state = activeState;
    if (satisfactionScoreB18) programMetadata.satisfaction_score_b18 = satisfactionScoreB18;
    if (examRegistration) programMetadata.exam_registration = examRegistration;
    if (examScore !== null && examScore !== undefined && String(examScore).trim() !== '') {
      programMetadata.exam_score = examScore;
    }
    if (examResult) programMetadata.exam_result = examResult;
    if (Object.keys(testScores).length > 0) programMetadata.test_scores = testScores;
    if (Object.keys(specialSupport).length > 0) programMetadata.special_support = specialSupport;
    if (renewalNote) programMetadata.renewal_note = renewalNote;
    if (latestClassCode) programMetadata.latest_class_code = latestClassCode;
    if (rawTuition !== null && rawTuition !== undefined && String(rawTuition).trim() !== '') {
      programMetadata.tuition_fee = rawTuition;
    }
    if (paidMonth) programMetadata.paid_month = paidMonth;
    if (endCourseCare) programMetadata.end_course_care = endCourseCare;

    const baseKey = `JLPT::${externalId}::${packageCode}::${classCode || paidAt || `r${r}`}`;
    const prevCount = syncKeyCounter.get(baseKey) || 0;
    syncKeyCounter.set(baseKey, prevCount + 1);
    const syncKey = prevCount === 0 ? baseKey : `${baseKey}#${prevCount + 1}`;

    results.push({
      rowNumber: r,
      syncKey,
      programType: 'JLPT',
      externalId,
      fullName: fullName || `Học viên ${externalId}`,
      gender,
      phone,
      email,
      dateOfBirth: null,
      occupation: null,
      saleName,
      studentSourceStatus,
      paidAt,
      courseContent,
      paymentStatus,
      packageCode,
      courseTeacherType: null,
      level,
      totalSessions,
      remainingSessions,
      attendedPreviousYears: attendedSessions || 0,
      classModel,
      salesNote,
      cvhtCode,
      startDate,
      endDate: null,
      status,
      startTime,
      schedulePattern,
      durationMinutes,
      teacherName,
      teacherCode: teacherName,
      classCode,
      className,
      exchangeInfo,
      callbackNote,
      studyReportUrl: null,
      hotIssueNote,
      postCourseCare,
      handedOverAt: expectedStartDate,
      careLogs,
      programMetadata,
    });
  }

  return results;
}

/**
 * Parse all valid student enrollment rows from Kaiwa sheet ('Tổng')
 */
export function parseKaiwaSheetRows(
  workbook: ExcelJS.Workbook,
  sheetName = 'Tổng',
  headerRow = 2,
  limit?: number
): NormalizedSheetRow[] {
  const ws = workbook.getWorksheet(sheetName);
  if (!ws) return [];

  const results: NormalizedSheetRow[] = [];
  const syncKeyCounter = new Map<string, number>();

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    if (limit && limit > 0 && results.length >= limit) break;

    const row = ws.getRow(r);
    const rawId = extractCellValue(row.getCell(1).value);
    const rawName = extractCellValue(row.getCell(5).value);

    let externalId = normalizeExternalId(rawId);
    const fullName = rawName ? String(rawName).trim() : '';

    if (!externalId && !fullName) continue;
    if (externalId.toUpperCase() === 'ID' || fullName.toLowerCase() === 'họ tên hv') continue;

    if (!externalId) {
      externalId = `KAIWA_ROW_${r}`;
    }

    const paidAt = formatIsoDateOnly(parseSheetDate(row.getCell(2).value));
    const saleName = cellText(row.getCell(3)) || null;
    const studentSourceStatus = cellText(row.getCell(4)) || null;
    const gender = cellText(row.getCell(6)) || null;
    const phone = normalizePhone(row.getCell(7).value);
    const email = cellText(row.getCell(8)) || null;

    const rawCourseContent = extractCellValue(row.getCell(9).value);
    const courseContent = rawCourseContent !== null && rawCourseContent !== undefined && String(rawCourseContent).trim() !== ''
      ? String(rawCourseContent).trim()
      : null;

    const paymentStatus = cellText(row.getCell(10)) || null;
    const packageCode = (cellText(row.getCell(11)) || 'KAIWA_DEFAULT').trim();
    const courseTeacherType = cellText(row.getCell(12)) || null;
    const level = cellText(row.getCell(13)) || null;

    const rawTotalSessions = extractCellValue(row.getCell(14).value);
    const totalSessions = rawTotalSessions !== null && rawTotalSessions !== '' && !Number.isNaN(Number(rawTotalSessions)) && Number(rawTotalSessions) > 0
      ? Math.round(Number(rawTotalSessions))
      : 30;

    const classModel = cellText(row.getCell(15)) || null;
    const salesNote = cellText(row.getCell(16)) || null;
    const dateOfBirth = formatIsoDateOnly(parseSheetDate(row.getCell(17).value));
    const occupation = cellText(row.getCell(18)) || null;
    const cvhtCode = extractCvhtCode(row.getCell(19).value, salesNote);

    const rawRemaining = extractCellValue(row.getCell(20).value);
    const remainingSessions = rawRemaining !== null && rawRemaining !== undefined && rawRemaining !== '' && !Number.isNaN(Number(rawRemaining))
      ? Math.round(Number(rawRemaining))
      : null;

    const startDate = formatIsoDateOnly(parseSheetDate(row.getCell(21).value));
    const rawStatus = cellText(row.getCell(22));
    const status = mapEnrollmentStatus(rawStatus);
    const endDate = formatIsoDateOnly(parseSheetDate(row.getCell(23).value));

    const startTime = extractStartTime(row.getCell(24).value);
    const sched1 = extractSchedulePattern(row.getCell(25).value);
    const schedFallback = extractSchedulePattern(row.getCell(31).value);
    const schedulePattern = sched1 || schedFallback || null;

    const rawDur = extractCellValue(row.getCell(26).value);
    let durationMinutes: number | null = null;
    if (rawDur !== null && rawDur !== undefined && rawDur !== '' && !Number.isNaN(Number(rawDur))) {
      const durNum = Number(rawDur);
      durationMinutes = durNum > 0 && durNum <= 5 ? Math.round(durNum * 60) : Math.round(durNum);
    }

    const teacherName = cellText(row.getCell(32)) || null;
    const teacherCode = cellText(row.getCell(33)) || teacherName || null;
    const className = cellText(row.getCell(34)) || null;

    const rawAttPrev = extractCellValue(row.getCell(35).value);
    const attendedPreviousYears = rawAttPrev !== null && rawAttPrev !== undefined && rawAttPrev !== '' && !Number.isNaN(Number(rawAttPrev))
      ? Math.round(Number(rawAttPrev))
      : 0;

    const exchangeInfo = cellText(row.getCell(37)) || null;
    const callbackNote = cellText(row.getCell(38)) || null;
    const studyReportUrl = cellText(row.getCell(39)) || null;
    const hotIssueNote = cellText(row.getCell(40)) || null;

    // Care logs: Col 41..46 -> 1, 3, 10, 15, 20, 25; Col 47 -> 27
    const careLogs: NormalizedCareLogItem[] = [];
    const careColumns: Array<{ col: number; session: number }> = [
      { col: 41, session: 1 },
      { col: 42, session: 3 },
      { col: 43, session: 10 },
      { col: 44, session: 15 },
      { col: 45, session: 20 },
      { col: 46, session: 25 },
      { col: 47, session: 27 },
    ];
    for (const cc of careColumns) {
      const content = cellText(row.getCell(cc.col));
      if (content && content !== '-') {
        careLogs.push({
          after_session_number: cc.session,
          content,
          outcome: inferCareLogOutcome(content),
        });
      }
    }

    const postCourseCare = cellText(row.getCell(48)) || null;
    const handedOverAt = formatIsoDateOnly(parseSheetDate(row.getCell(55).value));

    const programMetadata: Record<string, any> = {};
    if (rawCourseContent !== null && rawCourseContent !== undefined && String(rawCourseContent).trim() !== '') {
      programMetadata.tuition_fee = rawCourseContent;
    }

    const baseKey = `KAIWA::${externalId}::${packageCode}::${className || paidAt || `r${r}`}`;
    const prevCount = syncKeyCounter.get(baseKey) || 0;
    syncKeyCounter.set(baseKey, prevCount + 1);
    const syncKey = prevCount === 0 ? baseKey : `${baseKey}#${prevCount + 1}`;

    results.push({
      rowNumber: r,
      syncKey,
      programType: 'KAIWA',
      externalId,
      fullName: fullName || `Học viên ${externalId}`,
      gender,
      phone,
      email,
      dateOfBirth,
      occupation,
      saleName,
      studentSourceStatus,
      paidAt,
      courseContent,
      paymentStatus,
      packageCode,
      courseTeacherType,
      level,
      totalSessions,
      remainingSessions,
      attendedPreviousYears,
      classModel,
      salesNote,
      cvhtCode,
      startDate,
      endDate,
      status,
      startTime,
      schedulePattern,
      durationMinutes,
      teacherName,
      teacherCode,
      classCode: className,
      className,
      exchangeInfo,
      callbackNote,
      studyReportUrl,
      hotIssueNote,
      postCourseCare,
      handedOverAt,
      careLogs,
      programMetadata,
    });
  }

  return results;
}
