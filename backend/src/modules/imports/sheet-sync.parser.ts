import ExcelJS from 'exceljs';
import { AttendanceStatus, CareLogOutcome, ClassModelType, EnrollmentStatus } from '@prisma/client';
import { classifyClassModel } from './model-mapper';
import { detectJlptMonthBlocks } from './attendance-sheet.util';

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
  activeState?: string | null; // Normalized "Active" | "Deactive"
  rawStatusText?: string | null;
  paidAt: string | null; // ISO date
  courseContent: string | null;
  paymentStatus: string | null;
  packageCode: string;
  courseTeacherType: string | null;
  level: string | null;
  totalSessions: number;
  totalAttended: number | null;
  remainingSessions: number | null;
  endHoldWeek: number | null;
  endHoldYear: number | null;
  handoverMonth: number | null;
  renewalDeadline: string | null;
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
  accountCreatedAt?: string | null;
  careLogs: NormalizedCareLogItem[];
  programMetadata: Record<string, any>;
}

/**
 * Normalize JLPT active state ("Deative" -> "Deactive")
 */
export function normalizeActiveState(rawVal: string | null | undefined): string | null {
  if (!rawVal) return null;
  const trimmed = String(rawVal).trim();
  if (!trimmed || trimmed === '-') return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'deative' || lower === 'deactive' || lower === 'inactive') {
    return 'Deactive';
  }
  if (lower === 'active') {
    return 'Active';
  }
  return trimmed;
}

/**
 * Extract hyperlink URL from an ExcelJS cell (if it has an actual hyperlink or HYPERLINK formula or http URL)
 * Never returns a plain student name as URL.
 */
export function extractCellHyperlink(cell: ExcelJS.Cell | undefined | null): string | null {
  if (!cell) return null;
  const val: any = cell.value;
  if (val === null || val === undefined) return null;

  if (typeof val === 'object') {
    if ('hyperlink' in val && val.hyperlink) {
      const link = String(val.hyperlink).trim();
      if (/^https?:\/\//i.test(link)) return link;
    }
    if ('formula' in val && val.formula) {
      const fStr = String(val.formula);
      const hlMatch = fStr.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
      if (hlMatch && /^https?:\/\//i.test(hlMatch[1].trim())) {
        return hlMatch[1].trim();
      }
      const urlMatch = fStr.match(/https?:\/\/[^\s"')]*/i);
      if (urlMatch) return urlMatch[0].trim();
    }
    if ('text' in val && val.text) {
      const t = String(val.text).trim();
      if (/^https?:\/\//i.test(t)) return t;
    }
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }

  if ((cell as any).hyperlink && typeof (cell as any).hyperlink === 'string') {
    const hl = String((cell as any).hyperlink).trim();
    if (/^https?:\/\//i.test(hl)) return hl;
  }

  return null;
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
          if (
            trimmedRes === '#REF!' ||
            trimmedRes === '#N/A' ||
            trimmedRes === '#VALUE!' ||
            trimmedRes === '#ERROR!' ||
            trimmedRes === '#NAME?'
          ) {
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
    if (!trimmed || trimmed === '-' || trimmed.toLowerCase().includes('invalid date')) return null;
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
export function parseOptionalInteger(rawVal: any): number | null {
  const val = extractCellValue(rawVal);
  if (val === null || val === undefined || val === '' || val === '-') return null;
  const num = Number(val);
  return Number.isFinite(num) ? Math.round(num) : null;
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
 * Map Vietnamese status text to EnrollmentStatus enum, reconciling with whether a class is already assigned
 */
export function mapEnrollmentStatus(
  rawStatus: string | null | undefined,
  hasAssignedClass?: boolean
): EnrollmentStatus {
  const s = (rawStatus || '').trim().toLowerCase();
  if (s.includes('kết thúc') || s.includes('hoàn thành')) return EnrollmentStatus.FINISHED;
  if (s.includes('bảo lưu') || s.includes('tạm nghỉ')) return EnrollmentStatus.PAUSED;
  if (s.includes('hủy') || s.includes('nghỉ học')) return EnrollmentStatus.CANCELLED;
  if (s.includes('sắp học')) return EnrollmentStatus.UPCOMING;
  if (s.includes('chưa học')) {
    return hasAssignedClass ? EnrollmentStatus.STUDYING : EnrollmentStatus.NOT_STARTED;
  }
  if (s.includes('chờ lớp') || s.includes('đợi lớp') || s.includes('chưa xếp') || s.includes('chưa có lớp')) {
    return hasAssignedClass ? EnrollmentStatus.STUDYING : EnrollmentStatus.WAITING_CLASS;
  }
  if (s.includes('đang học') || s.includes('video')) {
    return hasAssignedClass === false && !s.includes('video')
      ? EnrollmentStatus.WAITING_CLASS
      : EnrollmentStatus.STUDYING;
  }
  if (hasAssignedClass === false) return EnrollmentStatus.WAITING_CLASS;
  return EnrollmentStatus.STUDYING;
}

/**
 * Clean single-line class code / class name when Excel cells contain historical multiline entries
 */
export function cleanClassIdentifier(rawVal: string | null | undefined): string | null {
  if (!rawVal) return null;
  const lines = rawVal
    .split(/\r?\n/)
    .map((l) => l.replace(/\t+/g, ' ').trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  if (lines.length === 1) return lines[0];
  // Filter out note-like lines starting with '+' or '('
  const classLikeLines = lines.filter((l) => !/^[+(]/.test(l) && !l.toLowerCase().includes('tặng khóa'));
  const target = classLikeLines.length > 0 ? classLikeLines[classLikeLines.length - 1] : lines[0];
  return target.trim() || null;
}

/**
 * Clean leading escaped quote artifacts from Google Sheet formula fallbacks (e.g. '"""""""- Zalo...')
 */
export function cleanSheetNote(rawVal: string | null | undefined): string | null {
  if (!rawVal) return null;
  const cleaned = rawVal.replace(/^"+|"+$/g, '').trim();
  return cleaned || null;
}

/**
 * Map class model string to ClassModelType enum.
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
    .replace(/[\s\-_,./+~;()（）月火水木金土日・]+/g, '');

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

  // 2. Check 'Chấm buổi' (Col B = ID học viên, Col L = Số buổi đã học)
  const cb = workbook.getWorksheet('Chấm buổi');
  if (cb) {
    for (let r = 3; r <= cb.rowCount; r++) {
      const row = cb.getRow(r);
      const extId = normalizeExternalId(row.getCell(2).value);
      if (!extId) continue;
      const colL = extractCellValue(row.getCell(12).value);
      if (colL !== null && colL !== undefined && colL !== '-') {
        const num = Number(colL);
        if (!Number.isNaN(num) && num >= 0 && num <= 150) {
          // Chấm buổi is the authoritative JLPT attendance source when present.
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
    const sourcePackageCode = cellText(row.getCell(9)) || null;
    const classModel = sourcePackageCode;
    const level = cellText(row.getCell(10)) || null;

    const rawTuition = extractCellValue(row.getCell(11).value);
    const courseContent = null;

    const paymentStatus = cellText(row.getCell(12)) || null;
    const salesNote = cleanSheetNote(cellText(row.getCell(13)));
    const expectedStartDateObj = parseSheetDate(row.getCell(14).value);
    const expectedStartDate = formatIsoDateOnly(expectedStartDateObj);
    const activeState = normalizeActiveState(cellText(row.getCell(15)));
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

    const startTime = extractStartTime(row.getCell(20).value);
    const schedulePattern = extractSchedulePattern(row.getCell(21).value);
    const teacherName = cellText(row.getCell(22)) || null;
    const classCode = cleanClassIdentifier(cellText(row.getCell(23)));
    const rawClassName = cleanClassIdentifier(cellText(row.getCell(24)));
    const className = rawClassName || classCode || null;
    const hasAssignedClass = Boolean(classCode || className);
    const status = mapEnrollmentStatus(rawStatus, hasAssignedClass);

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
    if (sourcePackageCode) programMetadata.package_code = sourcePackageCode;
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
      activeState,
      rawStatusText: rawStatus || null,
      paidAt,
      courseContent,
      paymentStatus,
      packageCode,
      courseTeacherType: null,
      level,
      totalSessions,
      totalAttended: attendedSessions ?? null,
      remainingSessions,
      endHoldWeek: null,
      endHoldYear: null,
      handoverMonth: null,
      renewalDeadline: null,
      attendedPreviousYears: 0,
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
 * Parse all valid student enrollment rows from Kaiwa sheet ('Tổng' or '1.Chăm sóc')
 */
export function parseKaiwaSheetRows(
  workbook: ExcelJS.Workbook,
  sheetName = 'Tổng',
  headerRow = 2,
  limit?: number
): NormalizedSheetRow[] {
  let ws = workbook.getWorksheet(sheetName);
  if (!ws) {
    ws = workbook.getWorksheet('Tổng') || workbook.getWorksheet('1.Chăm sóc');
  }
  if (!ws) return [];

  // Auto-detect header row between row 2 ('Tổng') and row 3 ('1.Chăm sóc')
  let effectiveHeaderRow = headerRow;
  const r2Col1 = cellText(ws.getRow(2).getCell(1)).toUpperCase();
  const r3Col1 = cellText(ws.getRow(3).getCell(1)).toUpperCase();
  if (r3Col1 === 'ID' && r2Col1 !== 'ID') {
    effectiveHeaderRow = 3;
  } else if (r2Col1 === 'ID') {
    effectiveHeaderRow = 2;
  }

  const isChamSocLayout =
    ws.name.toLowerCase().includes('chăm sóc') ||
    ws.name.startsWith('1.') ||
    cellText(ws.getRow(effectiveHeaderRow).getCell(37)).toLowerCase().includes('báo cáo học tập');

  const results: NormalizedSheetRow[] = [];
  const syncKeyCounter = new Map<string, number>();

  for (let r = effectiveHeaderRow + 1; r <= ws.rowCount; r++) {
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
    const rawCourseContentText = rawCourseContent !== null && rawCourseContent !== undefined
      ? String(rawCourseContent).trim()
      : '';
    const isNumericTuitionCell = /^\d+(?:\.\d+)?$/.test(rawCourseContentText);
    const courseContent = rawCourseContentText && !isNumericTuitionCell
      ? rawCourseContentText
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
    const salesNote = cleanSheetNote(cellText(row.getCell(16)));
    const dateOfBirth = formatIsoDateOnly(parseSheetDate(row.getCell(17).value));
    const occupation = cellText(row.getCell(18)) || null;
    const cvhtCode = extractCvhtCode(row.getCell(19).value, salesNote);

    const rawRemaining = extractCellValue(row.getCell(20).value);
    const remainingSessions = rawRemaining !== null && rawRemaining !== undefined && rawRemaining !== '' && !Number.isNaN(Number(rawRemaining))
      ? Math.round(Number(rawRemaining))
      : null;

    const startDate = formatIsoDateOnly(parseSheetDate(row.getCell(21).value));
    const rawStatus = cellText(row.getCell(22));
    const endDate = formatIsoDateOnly(parseSheetDate(row.getCell(23).value));

    const startTime = extractStartTime(row.getCell(24).value);
    const sched1 = extractSchedulePattern(row.getCell(25).value);
    const schedFallback = !isChamSocLayout ? extractSchedulePattern(row.getCell(31).value) : null;
    const schedulePattern = sched1 || schedFallback || null;

    const rawDur = extractCellValue(row.getCell(26).value);
    let durationMinutes: number | null = null;
    if (rawDur !== null && rawDur !== undefined && rawDur !== '' && !Number.isNaN(Number(rawDur))) {
      const durNum = Number(rawDur);
      durationMinutes = durNum > 0 && durNum <= 5 ? Math.round(durNum * 60) : Math.round(durNum);
    }


    const teacherName = cellText(row.getCell(32)) || null;
    const teacherCode = cellText(row.getCell(33)) || teacherName || null;
    const className = cleanClassIdentifier(cellText(row.getCell(34)));
    const status = mapEnrollmentStatus(rawStatus, Boolean(className));

    // Kaiwa: col 36 (AJ) is always total attended; col 35 (AI) is preserved both as numeric prior-year count (when numeric) and raw text/value.
    const rawAttended = extractCellValue(row.getCell(36).value);
    const totalAttended = rawAttended !== null && rawAttended !== undefined && rawAttended !== '' && !Number.isNaN(Number(rawAttended))
      ? Math.round(Number(rawAttended))
      : null;
    const rawAttPrev = extractCellValue(row.getCell(35).value);
    const rawAttPrevText = rawAttPrev !== null && rawAttPrev !== undefined && String(rawAttPrev).trim() !== '' && String(rawAttPrev).trim() !== '-'
      ? String(rawAttPrev).trim()
      : null;
    const attendedPreviousYears = rawAttPrevText !== null && !Number.isNaN(Number(rawAttPrevText))
      ? Math.round(Number(rawAttPrevText))
      : 0;

    // In 'Tổng': Col 37 = Thông tin trao đổi với HV, Col 38 = Lịch hẹn gọi, Col 39 = Báo cáo học tập
    // In '1.Chăm sóc': Col 37 = Báo cáo học tập, Col 38 = Thông tin trao đổi với HV, Col 39 = Lịch hẹn gọi
    const exchangeInfo = cellText(row.getCell(isChamSocLayout ? 38 : 37)) || null;
    const callbackNote = cellText(row.getCell(isChamSocLayout ? 39 : 38)) || null;
    const studyReportUrl =
      extractCellHyperlink(row.getCell(isChamSocLayout ? 37 : 39)) ||
      extractCellHyperlink(row.getCell(isChamSocLayout ? 39 : 37)) ||
      null;
    const hotIssueNote = cellText(row.getCell(40)) || null;

    // Care logs:
    // In 'Tổng': Col 41..47 -> 1, 3, 10, 15, 20, 25, 27
    // In '1.Chăm sóc': Col 41..55 -> 1, 3, 10, 15, 20, 25, 29, 30, 35, 45, 55, 59, 60, 89, 90
    const careLogs: NormalizedCareLogItem[] = [];
    const careColumns: Array<{ col: number; session: number }> = isChamSocLayout
      ? [
          { col: 41, session: 1 },
          { col: 42, session: 3 },
          { col: 43, session: 10 },
          { col: 44, session: 15 },
          { col: 45, session: 20 },
          { col: 46, session: 25 },
          { col: 47, session: 29 },
          { col: 48, session: 30 },
          { col: 49, session: 35 },
          { col: 50, session: 45 },
          { col: 51, session: 55 },
          { col: 52, session: 59 },
          { col: 53, session: 60 },
          { col: 54, session: 89 },
          { col: 55, session: 90 },
        ]
      : [
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

    const postCourseCare = cellText(row.getCell(isChamSocLayout ? 56 : 48)) || null;
    const handedOverAt = formatIsoDateOnly(parseSheetDate(row.getCell(isChamSocLayout ? 58 : 55).value));
    // Approved Kaiwa Tổng mapping: BF/BG = end hold week/year, BJ = renewal deadline, BY = handover month.
    // Do not infer these fields from the secondary schedule or other similarly named columns.
    const endHoldWeek = parseOptionalInteger(row.getCell(58).value);
    const endHoldYear = parseOptionalInteger(row.getCell(59).value);
    const renewalDeadline = formatIsoDateOnly(parseSheetDate(row.getCell(62).value));
    const handoverMonth = parseOptionalInteger(row.getCell(77).value);
    const accountCreatedAt = isChamSocLayout
      ? formatIsoDateOnly(parseSheetDate(row.getCell(60).value))
      : null;

    const programMetadata: Record<string, any> = {};
    if (isNumericTuitionCell) {
      programMetadata.tuition_fee = rawCourseContent;
    }
    if (rawAttPrevText !== null) {
      programMetadata.attended_previous_years_raw = rawAttPrevText;
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
      rawStatusText: rawStatus || null,
      paidAt,
      courseContent,
      paymentStatus,
      packageCode,
      courseTeacherType,
      level,
      totalSessions,
      totalAttended,
      remainingSessions,
      endHoldWeek,
      endHoldYear,
      handoverMonth,
      renewalDeadline,
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
      accountCreatedAt,
      careLogs,
      programMetadata,
    });
  }

  return results;
}

/* ============================================================================
 * FLOW 2 & 3: ATTENDANCE PARSERS (CSKH_ATTENDANCE & TEACHER_ATTENDANCE)
 * ============================================================================ */

export interface ParsedAttendanceEntry {
  date: string; // YYYY-MM-DD
  colLetter: string;
  colNumber: number;
  rawValue: string;
  status: AttendanceStatus | null;
  lessonTopic: string | null;
  isValid: boolean;
  errorMessage?: string;
}

export interface ParsedStudentAttendanceRow {
  rowNumber: number;
  programType: 'JLPT' | 'KAIWA';
  externalId: string;
  studentName: string;
  packageCode: string | null;
  classCode: string | null;
  className: string | null;
  rawStatusText: string | null;
  startTime: string | null;
  schedulePattern: string | null;
  durationMinutes: number | null;
  cvhtCode: string | null;
  teacherCode: string | null;
  entries: ParsedAttendanceEntry[];
  warnings: string[];
  errors: string[];
}

export interface DiscoveredStudyReportLink {
  externalId: string;
  studentName: string;
  classCode: string | null;
  packageCode: string | null;
  programType: 'JLPT' | 'KAIWA';
  studyReportUrl: string;
}

/**
 * Parse raw attendance mark cell into AttendanceStatus & optional lessonTopic
 */
export function parseAttendanceCellMark(
  rawVal: string,
  expectedPrefix?: string | null
): {
  status: AttendanceStatus | null;
  lessonTopic: string | null;
  prefixCode: string | null;
  isValid: boolean;
  errorMessage?: string;
} {
  const trimmed = (rawVal || '').trim();
  if (!trimmed || trimmed === '0' || trimmed === '0.0' || trimmed === '-') {
    return { status: null, lessonTopic: null, prefixCode: null, isValid: true };
  }

  const upper = trimmed.toUpperCase();
  if (upper === '1' || upper === '1.0' || upper === '2' || upper === '2.0' || upper === 'X' || upper === 'ĐÃ HỌC') {
    return { status: AttendanceStatus.ATTENDED, lessonTopic: null, prefixCode: null, isValid: true };
  }
  if (upper === 'A') return { status: AttendanceStatus.ABSENT_APPROVED_A, lessonTopic: null, prefixCode: null, isValid: true };
  if (upper === 'B') return { status: AttendanceStatus.LEAVE_B, lessonTopic: null, prefixCode: null, isValid: true };
  if (upper === 'C') return { status: AttendanceStatus.ABSENT_UNAPPROVED_C, lessonTopic: null, prefixCode: null, isValid: true };
  if (upper === 'D') return { status: AttendanceStatus.TEACHER_ABSENT_D, lessonTopic: null, prefixCode: null, isValid: true };
  if (upper === 'E') return { status: AttendanceStatus.TECH_ERROR_E, lessonTopic: null, prefixCode: null, isValid: true };

  // Format: [Mã lớp hoặc Mã HV]-[Tên bài hoặc Mã nghỉ A/B/C/D/E]
  const dashIdx = trimmed.indexOf('-');
  if (dashIdx > 0) {
    const prefix = trimmed.slice(0, dashIdx).trim();
    const suffix = trimmed.slice(dashIdx + 1).trim();
    const suffixUpper = suffix.toUpperCase();
    if (!suffix) {
      return {
        status: null,
        lessonTopic: null,
        prefixCode: prefix,
        isValid: false,
        errorMessage: `Ô điểm danh "${trimmed}" thiếu mã buổi học hoặc mã nghỉ sau dấu "-"`,
      };
    }
    if (suffixUpper === 'A') return { status: AttendanceStatus.ABSENT_APPROVED_A, lessonTopic: null, prefixCode: prefix, isValid: true };
    if (suffixUpper === 'B') return { status: AttendanceStatus.LEAVE_B, lessonTopic: null, prefixCode: prefix, isValid: true };
    if (suffixUpper === 'C') return { status: AttendanceStatus.ABSENT_UNAPPROVED_C, lessonTopic: null, prefixCode: prefix, isValid: true };
    if (suffixUpper === 'D') return { status: AttendanceStatus.TEACHER_ABSENT_D, lessonTopic: null, prefixCode: prefix, isValid: true };
    if (suffixUpper === 'E') return { status: AttendanceStatus.TECH_ERROR_E, lessonTopic: null, prefixCode: prefix, isValid: true };
    return { status: AttendanceStatus.ATTENDED, lessonTopic: suffix, prefixCode: prefix, isValid: true };
  }

  if (expectedPrefix) {
    return {
      status: null,
      lessonTopic: null,
      prefixCode: null,
      isValid: false,
      errorMessage: `Giá trị điểm danh "${trimmed}" không đúng định dạng [Mã]-[Bài học/A/B/C/D/E]`,
    };
  }

  return {
    status: null,
    lessonTopic: null,
    prefixCode: null,
    isValid: false,
    errorMessage: `Mã điểm danh "${trimmed}" không hợp lệ (chỉ chấp nhận 1, A, B, C, D, E)`,
  };
}

/**
 * Filter daily columns of an attendance worksheet by syncYear and months[].
 * If the sheet has columns matching syncYear, ONLY take those columns.
 * Only if the entire sheet has 0 columns matching syncYear, remap the existing year to syncYear with a warning.
 */
export function selectAttendanceDayCols(
  ws: ExcelJS.Worksheet,
  syncYear: number,
  months?: number[],
  headerRow = 2
): {
  dayCols: Array<{ colNumber: number; colLetter: string; date: string; month: number; year: number }>;
  remappedFromYear: number | null;
  availableYears: number[];
} {
  const blocks = detectJlptMonthBlocks(ws, headerRow);
  const allCols: Array<{ colNumber: number; colLetter: string; date: string; month: number; year: number }> = [];
  const yearSet = new Set<number>();

  for (const b of blocks) {
    for (const dc of b.dailyCols) {
      yearSet.add(dc.year);
      allCols.push({
        colNumber: dc.colNumber,
        colLetter: dc.colLetter,
        date: dc.date,
        month: dc.month,
        year: dc.year,
      });
    }
  }

  const availableYears = [...yearSet].sort((a, b) => a - b);
  const monthFilter = months && months.length > 0 ? new Set(months.map(Number)) : null;

  const exactYearCols = allCols.filter((c) => c.year === syncYear);
  if (exactYearCols.length > 0) {
    const filtered = monthFilter ? exactYearCols.filter((c) => monthFilter.has(c.month)) : exactYearCols;
    return {
      dayCols: filtered,
      remappedFromYear: null,
      availableYears,
    };
  }

  // Fallback: if sheet has no columns matching syncYear (e.g., giao_vien_kaiwa.xlsx has 2025 headers in '2026 スケジュール')
  if (allCols.length > 0) {
    const sourceYear = availableYears[availableYears.length - 1];
    const remapped = allCols
      .filter((c) => c.year === sourceYear && (!monthFilter || monthFilter.has(c.month)))
      .map((c) => {
        const remappedDate = `${syncYear}${c.date.slice(4)}`;
        return {
          ...c,
          year: syncYear,
          date: remappedDate,
        };
      });
    return {
      dayCols: remapped,
      remappedFromYear: sourceYear,
      availableYears,
    };
  }

  return { dayCols: [], remappedFromYear: null, availableYears: [] };
}

/**
 * Parse CSKH Attendance sheet:
 * - JLPT 'Chấm buổi': Parent row per class (Col 1 = Mã lớp, Col 2 = empty) + Child rows (Col 1 = Mã lớp, Col 2 = ID học viên).
 *   Child rows inherit startTime, durationMinutes, teacherCode, cvhtCode, and daily attendance marks from Parent row when Child cell is empty.
 * - KAIWA '3.Chấm buổi': Col 1 = ID, Col 2 = Họ tên, Col 3 = Gói học, Col 11 = Trạng thái, Col 13 = Giờ học (1), Col 15 = Thời lượng (1), Col 22 = Mã GV, Col 23 = Tên lớp.
 */
export function parseCskhAttendanceSheet(
  workbook: ExcelJS.Workbook,
  options: {
    programType: 'JLPT' | 'KAIWA';
    sheetName?: string;
    headerRow?: number;
    syncYear: number;
    months?: number[];
    enrollmentStatuses?: string[];
    limit?: number;
  }
): {
  rows: ParsedStudentAttendanceRow[];
  warnings: string[];
  filteredOutCount: number;
  totalRowsScanned: number;
} {
  const { programType, syncYear, months, enrollmentStatuses, limit } = options;
  const headerRow = options.headerRow || 2;
  const defaultSheet = programType === 'JLPT' ? 'Chấm buổi' : '3.Chấm buổi';
  const ws =
    (options.sheetName ? workbook.getWorksheet(options.sheetName) : undefined) ||
    workbook.getWorksheet(defaultSheet) ||
    workbook.worksheets.find((w) => w.name.toLowerCase().includes('chấm buổi'));

  if (!ws) {
    return { rows: [], warnings: [`Không tìm thấy sheet điểm danh (${options.sheetName || defaultSheet})`], filteredOutCount: 0, totalRowsScanned: 0 };
  }

  const { dayCols, remappedFromYear } = selectAttendanceDayCols(ws, syncYear, months, headerRow);
  const warnings: string[] = [];
  if (remappedFromYear !== null && remappedFromYear !== syncYear) {
    warnings.push(`Đã tự động quy đổi năm tiêu đề cột ngày (${remappedFromYear} → ${syncYear}) theo cấu hình năm ${syncYear}`);
  }

  const allowedStatuses =
    enrollmentStatuses && enrollmentStatuses.length > 0
      ? new Set(enrollmentStatuses.map((s) => s.trim().toLowerCase()))
      : null;

  const rows: ParsedStudentAttendanceRow[] = [];
  let filteredOutCount = 0;
  let totalRowsScanned = 0;

  if (programType === 'JLPT') {
    interface JlptParentState {
      classCode: string;
      rawStatusText: string | null;
      startTime: string | null;
      schedulePattern: string | null;
      durationMinutes: number | null;
      cvhtCode: string | null;
      teacherCode: string | null;
      marksByCol: Map<number, string>;
    }

    const parentByClass = new Map<string, JlptParentState>();

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      if (limit && limit > 0 && rows.length >= limit) break;

      const row = ws.getRow(r);
      const rawClassCode = cleanClassIdentifier(cellText(row.getCell(1)));
      const externalId = normalizeExternalId(row.getCell(2).value);
      const studentName = cellText(row.getCell(3));
      const rawStatus = cellText(row.getCell(4)) || null;
      const startTime = extractStartTime(row.getCell(5).value);
      const cvhtCode = extractCvhtCode(row.getCell(7).value);
      const schedulePattern = extractSchedulePattern(row.getCell(8).value);
      const rawDur = extractCellValue(row.getCell(9).value);
      const durationMinutes =
        rawDur !== null && rawDur !== undefined && rawDur !== '' && !Number.isNaN(Number(rawDur))
          ? Math.round(Number(rawDur))
          : null;
      const teacherCode = cellText(row.getCell(10)) || null;

      if (!rawClassCode && !externalId && !studentName) continue;

      // Collect non-empty daily marks on this row
      const rowMarks = new Map<number, string>();
      for (const dc of dayCols) {
        const val = cellText(row.getCell(dc.colNumber));
        if (val && val !== '0' && val !== '0.0' && val !== '-' && !val.startsWith('#')) {
          rowMarks.set(dc.colNumber, val);
        }
      }

      // Parent Row of 1-n class: has classCode in Col 1, but Col 2 (externalId) is empty
      if (rawClassCode && !externalId) {
        parentByClass.set(rawClassCode.toUpperCase(), {
          classCode: rawClassCode,
          rawStatusText: rawStatus,
          startTime,
          schedulePattern,
          durationMinutes,
          cvhtCode,
          teacherCode,
          marksByCol: rowMarks,
        });
        continue;
      }

      if (!externalId) continue;
      totalRowsScanned++;

      const parent = rawClassCode ? parentByClass.get(rawClassCode.toUpperCase()) : undefined;
      const effectiveStatusText =
        rawStatus && !rawStatus.startsWith('#') ? rawStatus : parent?.rawStatusText || null;

      if (allowedStatuses) {
        const normSt = (effectiveStatusText || '').trim().toLowerCase();
        if (!normSt || !allowedStatuses.has(normSt)) {
          filteredOutCount++;
          continue;
        }
      }

      const effectiveStartTime = startTime || parent?.startTime || null;
      const effectiveSchedule = schedulePattern || parent?.schedulePattern || null;
      const effectiveDuration = durationMinutes ?? parent?.durationMinutes ?? null;
      const effectiveCvht = cvhtCode || parent?.cvhtCode || null;
      const effectiveTeacher = teacherCode || parent?.teacherCode || null;

      // Merge marks: Child cell takes precedence; if Child cell is empty, inherit from Parent of same classCode
      const entries: ParsedAttendanceEntry[] = [];
      const rowErrors: string[] = [];

      for (const dc of dayCols) {
        const childVal = rowMarks.get(dc.colNumber);
        const inheritedVal = childVal !== undefined ? childVal : parent?.marksByCol.get(dc.colNumber);
        if (!inheritedVal) continue;

        const parsedMark = parseAttendanceCellMark(inheritedVal);
        entries.push({
          date: dc.date,
          colLetter: dc.colLetter,
          colNumber: dc.colNumber,
          rawValue: inheritedVal,
          status: parsedMark.status,
          lessonTopic: parsedMark.lessonTopic,
          isValid: parsedMark.isValid,
          errorMessage: parsedMark.errorMessage,
        });
        if (!parsedMark.isValid && parsedMark.errorMessage) {
          rowErrors.push(`Cột ${dc.colLetter} (${dc.date}): ${parsedMark.errorMessage}`);
        }
      }

      if (entries.length === 0) continue;

      rows.push({
        rowNumber: r,
        programType: 'JLPT',
        externalId,
        studentName: studentName || `Học viên ${externalId}`,
        packageCode: null,
        classCode: rawClassCode,
        className: rawClassCode,
        rawStatusText: effectiveStatusText,
        startTime: effectiveStartTime,
        schedulePattern: effectiveSchedule,
        durationMinutes: effectiveDuration,
        cvhtCode: effectiveCvht,
        teacherCode: effectiveTeacher,
        entries,
        warnings: [],
        errors: rowErrors,
      });
    }
  } else {
    // KAIWA '3.Chấm buổi'
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      if (limit && limit > 0 && rows.length >= limit) break;

      const row = ws.getRow(r);
      const externalId = normalizeExternalId(row.getCell(1).value);
      const studentName = cellText(row.getCell(2));
      if (!externalId && !studentName) continue;
      if (!externalId || externalId.toUpperCase() === 'ID') continue;

      totalRowsScanned++;

      const packageCode = cellText(row.getCell(3)) || null;
      const rawStatus = cellText(row.getCell(11)) || null;

      if (allowedStatuses) {
        const normSt = (rawStatus || '').trim().toLowerCase();
        if (!normSt || !allowedStatuses.has(normSt)) {
          filteredOutCount++;
          continue;
        }
      }

      const startTime = extractStartTime(row.getCell(13).value);
      const schedulePattern = extractSchedulePattern(row.getCell(14).value);
      const rawDur = extractCellValue(row.getCell(15).value);
      const durationMinutes =
        rawDur !== null && rawDur !== undefined && rawDur !== '' && !Number.isNaN(Number(rawDur))
          ? Math.round(Number(rawDur))
          : null;
      const teacherCode = cellText(row.getCell(22)) || cellText(row.getCell(21)) || null;
      const className = cleanClassIdentifier(cellText(row.getCell(23)));

      const entries: ParsedAttendanceEntry[] = [];
      const rowErrors: string[] = [];

      for (const dc of dayCols) {
        const val = cellText(row.getCell(dc.colNumber));
        if (!val || val === '0' || val === '0.0' || val === '-' || val.startsWith('#')) continue;

        const parsedMark = parseAttendanceCellMark(val);
        entries.push({
          date: dc.date,
          colLetter: dc.colLetter,
          colNumber: dc.colNumber,
          rawValue: val,
          status: parsedMark.status,
          lessonTopic: parsedMark.lessonTopic,
          isValid: parsedMark.isValid,
          errorMessage: parsedMark.errorMessage,
        });
        if (!parsedMark.isValid && parsedMark.errorMessage) {
          rowErrors.push(`Cột ${dc.colLetter} (${dc.date}): ${parsedMark.errorMessage}`);
        }
      }

      if (entries.length === 0) continue;

      rows.push({
        rowNumber: r,
        programType: 'KAIWA',
        externalId,
        studentName: studentName || `Học viên ${externalId}`,
        packageCode,
        classCode: className,
        className,
        rawStatusText: rawStatus,
        startTime,
        schedulePattern,
        durationMinutes,
        cvhtCode: null,
        teacherCode,
        entries,
        warnings: [],
        errors: rowErrors,
      });
    }
  }

  return { rows, warnings, filteredOutCount, totalRowsScanned };
}

/**
 * Parse Teacher Info sheet ('Info' in giao_vien_JLPT.xlsx or 'Infoー情報' in giao_vien_kaiwa.xlsx)
 * to extract:
 *  1. classCode -> Set of student externalIds & student metadata
 *  2. Study report hyperlinks in the "Báo cáo học tập" column
 */
export function parseTeacherInfoSheet(
  workbook: ExcelJS.Workbook,
  programType: 'JLPT' | 'KAIWA'
): {
  studentsByClassCode: Map<string, Array<{ externalId: string; studentName: string; packageCode: string | null; cvhtCode: string | null; startTime: string | null }>>;
  studentInfoByExtId: Map<string, { externalId: string; studentName: string; classCode: string | null; packageCode: string | null; cvhtCode: string | null; startTime: string | null }>;
  studyReportLinks: DiscoveredStudyReportLink[];
} {
  const studentsByClassCode = new Map<string, Array<{ externalId: string; studentName: string; packageCode: string | null; cvhtCode: string | null; startTime: string | null }>>();
  const studentInfoByExtId = new Map<string, { externalId: string; studentName: string; classCode: string | null; packageCode: string | null; cvhtCode: string | null; startTime: string | null }>();
  const studyReportLinks: DiscoveredStudyReportLink[] = [];

  const ws =
    workbook.getWorksheet('Info') ||
    workbook.getWorksheet('Infoー情報') ||
    workbook.worksheets.find((w) => w.name.toLowerCase().includes('info'));

  if (!ws) {
    return { studentsByClassCode, studentInfoByExtId, studyReportLinks };
  }

  // Locate header row of "Danh sách học viên" table
  let tableHeaderRow = -1;
  let colClassCode = -1;
  let colStudentId = -1;
  let colStudentName = -1;
  let colPackage = -1;
  let colCvht = -1;
  let colStartTime = -1;
  let colReportLink = -1;

  for (let r = 1; r <= Math.min(80, ws.rowCount); r++) {
    const row = ws.getRow(r);
    let foundStudentHeader = false;
    for (let c = 1; c <= Math.min(20, ws.columnCount); c++) {
      const txt = cellText(row.getCell(c)).toLowerCase();
      if (txt.includes('mã học viên') || txt.includes('学籍番号')) {
        foundStudentHeader = true;
        break;
      }
    }
    if (foundStudentHeader) {
      tableHeaderRow = r;
      for (let c = 1; c <= Math.min(20, ws.columnCount); c++) {
        const txt = cellText(row.getCell(c)).toLowerCase();
        if (txt.includes('mã lớp') || txt.includes('クラスコード')) colClassCode = c;
        else if (txt.includes('mã học viên') || txt.includes('学籍番号')) colStudentId = c;
        else if (txt.includes('họ tên') || txt.includes('お名前')) colStudentName = c;
        else if (txt.includes('khoá') || txt.includes('khóa') || txt.includes('コース')) colPackage = c;
        else if (txt.includes('cố vấn') || txt.includes('cvht')) colCvht = c;
        else if (txt.includes('giờ học') || txt.includes('スケジュール')) colStartTime = c;
        else if (txt.includes('báo cáo học') || txt.includes('レポート')) colReportLink = c;
      }
      break;
    }
  }

  if (tableHeaderRow === -1) {
    return { studentsByClassCode, studentInfoByExtId, studyReportLinks };
  }

  for (let r = tableHeaderRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const extId = colStudentId > 0 ? normalizeExternalId(row.getCell(colStudentId).value) : '';
    const stuName = colStudentName > 0 ? cellText(row.getCell(colStudentName)) : '';
    const clsCode = colClassCode > 0 ? cleanClassIdentifier(cellText(row.getCell(colClassCode))) : null;

    if (!extId && !stuName) continue;
    if (!extId) continue;

    const pkgCode = colPackage > 0 ? cellText(row.getCell(colPackage)) || null : null;
    const cvht = colCvht > 0 ? extractCvhtCode(row.getCell(colCvht).value) : null;
    const startTime = colStartTime > 0 ? extractStartTime(row.getCell(colStartTime).value) : null;
    const reportUrl = colReportLink > 0 ? extractCellHyperlink(row.getCell(colReportLink)) : null;

    const item = {
      externalId: extId,
      studentName: stuName || `Học viên ${extId}`,
      classCode: clsCode,
      packageCode: pkgCode,
      cvhtCode: cvht,
      startTime,
    };

    studentInfoByExtId.set(extId, item);
    if (clsCode) {
      const upperCls = clsCode.toUpperCase();
      const list = studentsByClassCode.get(upperCls) || [];
      list.push(item);
      studentsByClassCode.set(upperCls, list);
    }

    if (reportUrl) {
      studyReportLinks.push({
        externalId: extId,
        studentName: item.studentName,
        classCode: clsCode,
        packageCode: pkgCode,
        programType,
        studyReportUrl: reportUrl,
      });
    }
  }

  return { studentsByClassCode, studentInfoByExtId, studyReportLinks };
}

/**
 * Parse Teacher Attendance sheet ('2026 スケジュール') for both JLPT and Kaiwa
 */
export function parseTeacherAttendanceSheet(
  workbook: ExcelJS.Workbook,
  options: {
    programType: 'JLPT' | 'KAIWA';
    sheetName?: string;
    headerRow?: number;
    syncYear: number;
    months?: number[];
    teacherCode?: string | null;
  }
): {
  rows: ParsedStudentAttendanceRow[];
  studyReportLinks: DiscoveredStudyReportLink[];
  warnings: string[];
  totalRowsScanned: number;
} {
  const { programType, syncYear, months, teacherCode } = options;
  const headerRow = options.headerRow || 2;

  const { studentsByClassCode, studentInfoByExtId, studyReportLinks } = parseTeacherInfoSheet(workbook, programType);

  const ws =
    (options.sheetName ? workbook.getWorksheet(options.sheetName) : undefined) ||
    workbook.getWorksheet(`${syncYear} スケジュール`) ||
    workbook.getWorksheet('2026 スケジュール') ||
    workbook.worksheets.find((w) => w.name.includes('スケジュール'));

  if (!ws) {
    return {
      rows: [],
      studyReportLinks,
      warnings: [`Không tìm thấy sheet lịch dạy giáo viên (${options.sheetName || '2026 スケジュール'})`],
      totalRowsScanned: 0,
    };
  }

  const { dayCols, remappedFromYear } = selectAttendanceDayCols(ws, syncYear, months, headerRow);
  const warnings: string[] = [];
  if (remappedFromYear !== null && remappedFromYear !== syncYear) {
    warnings.push(`Đã tự động quy đổi năm tiêu đề cột ngày (${remappedFromYear} → ${syncYear}) theo cấu hình năm`);
  }

  const rows: ParsedStudentAttendanceRow[] = [];
  let totalRowsScanned = 0;

  if (programType === 'JLPT') {
    // giao_vien_JLPT.xlsx: Col 1 = Mã khoá, Col 2 = Mã lớp, Col 5 = Thời gian học
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const packageCode = cellText(row.getCell(1)) || null;
      const classCode = cleanClassIdentifier(cellText(row.getCell(2)));
      const startTime = extractStartTime(row.getCell(5).value);

      if (!classCode) continue;
      totalRowsScanned++;

      const entries: ParsedAttendanceEntry[] = [];
      const rowErrors: string[] = [];

      for (const dc of dayCols) {
        const val = cellText(row.getCell(dc.colNumber));
        if (!val || val === '0' || val === '0.0' || val === '-' || val.startsWith('#')) continue;

        const parsedMark = parseAttendanceCellMark(val, classCode);
        entries.push({
          date: dc.date,
          colLetter: dc.colLetter,
          colNumber: dc.colNumber,
          rawValue: val,
          status: parsedMark.status,
          lessonTopic: parsedMark.lessonTopic,
          isValid: parsedMark.isValid,
          errorMessage: parsedMark.errorMessage,
        });
        if (!parsedMark.isValid && parsedMark.errorMessage) {
          rowErrors.push(`Cột ${dc.colLetter} (${dc.date}): ${parsedMark.errorMessage}`);
        }
      }

      if (entries.length === 0) continue;

      const infoStudents = studentsByClassCode.get(classCode.toUpperCase()) || [];
      if (infoStudents.length > 0) {
        for (const stu of infoStudents) {
          rows.push({
            rowNumber: r,
            programType: 'JLPT',
            externalId: stu.externalId,
            studentName: stu.studentName,
            packageCode: stu.packageCode || packageCode,
            classCode,
            className: classCode,
            rawStatusText: 'Đang học',
            startTime: startTime || stu.startTime,
            schedulePattern: null,
            durationMinutes: null,
            cvhtCode: stu.cvhtCode,
            teacherCode: teacherCode || null,
            entries,
            warnings: [],
            errors: rowErrors,
          });
        }
      } else {
        // Class has no students listed in Info sheet yet -> emit a class-level placeholder row so service can resolve students by EnrollmentClass in DB
        rows.push({
          rowNumber: r,
          programType: 'JLPT',
          externalId: `CLASS::${classCode}`,
          studentName: `Lớp ${classCode}`,
          packageCode,
          classCode,
          className: classCode,
          rawStatusText: 'Đang học',
          startTime,
          schedulePattern: null,
          durationMinutes: null,
          cvhtCode: null,
          teacherCode: teacherCode || null,
          entries,
          warnings: [],
          errors: rowErrors,
        });
      }
    }
  } else {
    // giao_vien_kaiwa.xlsx: Col 1 = Mô hình lớp, Col 2 = Mã học viên/Mã lớp, Col 3 = Họ tên học viên, Col 6 = Thời gian
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const externalId = normalizeExternalId(row.getCell(2).value);
      const studentName = cellText(row.getCell(3));
      const startTime = extractStartTime(row.getCell(6).value);

      if (!externalId && !studentName) continue;
      if (!externalId) continue;
      totalRowsScanned++;

      const entries: ParsedAttendanceEntry[] = [];
      const rowErrors: string[] = [];

      for (const dc of dayCols) {
        const val = cellText(row.getCell(dc.colNumber));
        if (!val || val === '0' || val === '0.0' || val === '-' || val.startsWith('#')) continue;

        const parsedMark = parseAttendanceCellMark(val, externalId);
        entries.push({
          date: dc.date,
          colLetter: dc.colLetter,
          colNumber: dc.colNumber,
          rawValue: val,
          status: parsedMark.status,
          lessonTopic: parsedMark.lessonTopic,
          isValid: parsedMark.isValid,
          errorMessage: parsedMark.errorMessage,
        });
        if (!parsedMark.isValid && parsedMark.errorMessage) {
          rowErrors.push(`Cột ${dc.colLetter} (${dc.date}): ${parsedMark.errorMessage}`);
        }
      }

      if (entries.length === 0) continue;

      const info = studentInfoByExtId.get(externalId);
      rows.push({
        rowNumber: r,
        programType: 'KAIWA',
        externalId,
        studentName: studentName || info?.studentName || `Học viên ${externalId}`,
        packageCode: info?.packageCode || null,
        classCode: info?.classCode || null,
        className: info?.classCode || null,
        rawStatusText: 'Đang học',
        startTime: startTime || info?.startTime || null,
        schedulePattern: null,
        durationMinutes: null,
        cvhtCode: info?.cvhtCode || null,
        teacherCode: teacherCode || null,
        entries,
        warnings: [],
        errors: rowErrors,
      });
    }
  }

  return { rows, studyReportLinks, warnings, totalRowsScanned };
}

/* ============================================================================
 * FLOW 4: STUDY REPORT PARSERS (KAIWA & JLPT)
 * ============================================================================ */

export interface KaiwaStudyReportSession1And3 {
  preparation: string;
  interaction: string;
  comprehension: string;
}

export interface KaiwaStudyReportMilestoneBlock {
  date_range: string;
  absent_excused: string;
  absent_unexcused: string;
  teacher_absent: string;
  preparation: string;
  homework_completion: string;
  homework_completed: string;
  interaction: string;
  comprehension: string;
  strengths_progress: string;
  strengths: string;
  weaknesses: string;
  additional_comments: string;
  additional_notes: string;
}

export interface KaiwaStudyReportExamBlock {
  vocabulary: string;
  grammar: string;
  pronunciation: string;
  intonation: string;
  fluency: string;
  total_score: string;
  score: string;
  additional_comments: string;
  additional_notes: string;
}

export interface KaiwaStudyReportData {
  exchange_with_student: string;
  session_1: KaiwaStudyReportSession1And3;
  session_3: KaiwaStudyReportSession1And3;
  sessions_1_10: KaiwaStudyReportMilestoneBlock;
  sessions_11_20: KaiwaStudyReportMilestoneBlock;
  sessions_21_30: KaiwaStudyReportMilestoneBlock;
  midterm: KaiwaStudyReportExamBlock;
  final_exam: KaiwaStudyReportExamBlock;
}

export interface JlptDailyReportItem {
  rowNumber: number;
  dateLabel: string;
  date: string;
  comment: string;
  summary_note: string;
  isTemplateOnly?: boolean;
}

export interface ParsedStudyReportResult {
  programType: 'JLPT' | 'KAIWA';
  sheetName: string;
  detectedStudentExternalId: string | null;
  detectedStudentName: string | null;
  detectedPackageCode: string | null;
  detectedTeacherName: string | null;
  kaiwaReport?: KaiwaStudyReportData;
  jlptDailyReports?: JlptDailyReportItem[];
  warnings: string[];
}

function extractValueAfterColon(raw: string): string {
  if (!raw) return '';
  const idx = raw.lastIndexOf(':');
  if (idx === -1) return raw.trim();
  const after = raw.slice(idx + 1).trim();
  // Ignore pure placeholders like ".../10", ".../100", "/100", ".../.../... - .../.../..."
  if (/^\.*\/\d+$/.test(after) || after === '/100' || after.includes('.../...')) {
    return '';
  }
  return after;
}

function cleanStudyReportCellValue(raw: string, stripLabelPrefix = false): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '.../10' || trimmed === '.../100' || trimmed === '/100') return '';
  if (stripLabelPrefix) {
    return extractValueAfterColon(trimmed);
  }
  if (trimmed.includes('.../.../...')) {
    const cleaned = trimmed
      .replace(/^Ngày từ\s*\(日付\)\s*/i, '')
      .replace(/\.\.\.\/\.\.\.\/\.\.\.\s*-\s*\.\.\.\/\.\.\.\/\.\.\./g, '')
      .trim();
    return cleaned;
  }
  if (/^Ngày từ\s*\(日付\)/i.test(trimmed)) {
    return trimmed.replace(/^Ngày từ\s*\(日付\)\s*/i, '').trim();
  }
  return trimmed;
}

/**
 * Parse Kaiwa Study Report ('Format báo cáo học tập kaiwa.xlsx' - Tab 1)
 */
export function parseKaiwaStudyReportWorkbook(
  workbook: ExcelJS.Workbook,
  preferredSheetName?: string
): ParsedStudyReportResult {
  const ws =
    (preferredSheetName ? workbook.getWorksheet(preferredSheetName) : undefined) ||
    workbook.worksheets.find((w) => w.name.includes('学習レポート') || w.name.toLowerCase().includes('báo cáo')) ||
    workbook.worksheets[0];

  if (!ws) {
    return {
      programType: 'KAIWA',
      sheetName: '',
      detectedStudentExternalId: null,
      detectedStudentName: null,
      detectedPackageCode: null,
      detectedTeacherName: null,
      warnings: ['Không tìm thấy tab Báo cáo học tập Kaiwa'],
    };
  }

  const getC2 = (r: number) => cellText(ws.getRow(r).getCell(2));
  const getC1 = (r: number) => cellText(ws.getRow(r).getCell(1));

  // Header info rows 4..7
  const rawNameLine = getC1(4) || getC2(4);
  const rawIdLine = getC1(5) || getC2(5);
  const rawCourseLine = getC1(6) || getC2(6);
  const rawTeacherLine = getC1(7) || getC2(7);

  const detectedStudentName = extractValueAfterColon(rawNameLine) || null;
  const rawExtId = extractValueAfterColon(rawIdLine);
  const detectedStudentExternalId = normalizeExternalId(rawExtId) || null;
  const detectedPackageCode = extractValueAfterColon(rawCourseLine) || null;
  const detectedTeacherName = extractValueAfterColon(rawTeacherLine) || null;

  // Row 8-9: Thông tin trao đổi với HV
  const r8C2 = getC2(8);
  const r9C1 = getC1(9);
  const r9C2 = getC2(9);
  const exchangeWithStudent =
    (r8C2 && !r8C2.toLowerCase().includes('thông tin trao đổi') ? r8C2 : '') ||
    r9C2 ||
    r9C1 ||
    '';

  const parseMilestone = (startRow: number): KaiwaStudyReportMilestoneBlock => {
    // startRow is the header row of the block: e.g. 22 for 1-10, 36 for 11-20, 50 for 21-30
    // +2 = date_range (row 24, 38, 52)
    // +3 = absent_excused (row 25, 39, 53)
    // +4 = absent_unexcused (row 26, 40, 54)
    // +5 = teacher_absent (row 27, 41, 55)
    // +6 = preparation (row 28, 42, 56)
    // +7 = homework_completion (row 29, 43, 57)
    // +8 = interaction (row 30, 44, 58)
    // +9 = comprehension (row 31, 45, 59)
    // +10 = strengths_progress (row 32, 46, 60)
    // +11 = weaknesses (row 33, 47, 61)
    // +12 = additional_comments (row 34, 48, 62)
    const hw = cleanStudyReportCellValue(getC2(startRow + 7));
    const strProg = cleanStudyReportCellValue(getC2(startRow + 10));
    const addComm = cleanStudyReportCellValue(getC2(startRow + 12));
    return {
      date_range: cleanStudyReportCellValue(getC2(startRow + 2)),
      absent_excused: cleanStudyReportCellValue(getC2(startRow + 3), true),
      absent_unexcused: cleanStudyReportCellValue(getC2(startRow + 4), true),
      teacher_absent: cleanStudyReportCellValue(getC2(startRow + 5), true),
      preparation: cleanStudyReportCellValue(getC2(startRow + 6)),
      homework_completion: hw,
      homework_completed: hw,
      interaction: cleanStudyReportCellValue(getC2(startRow + 8)),
      comprehension: cleanStudyReportCellValue(getC2(startRow + 9)),
      strengths_progress: strProg,
      strengths: strProg,
      weaknesses: cleanStudyReportCellValue(getC2(startRow + 11)),
      additional_comments: addComm,
      additional_notes: addComm,
    };
  };

  const parseExam = (startRow: number): KaiwaStudyReportExamBlock => {
    const pron = cleanStudyReportCellValue(getC2(startRow + 3), true);
    const totScore = cleanStudyReportCellValue(getC2(startRow + 5), true);
    const addComm = cleanStudyReportCellValue(getC2(startRow + 6));
    return {
      vocabulary: cleanStudyReportCellValue(getC2(startRow + 1), true),
      grammar: cleanStudyReportCellValue(getC2(startRow + 2), true),
      pronunciation: pron,
      intonation: pron,
      fluency: cleanStudyReportCellValue(getC2(startRow + 4), true),
      total_score: totScore,
      score: totScore,
      additional_comments: addComm,
      additional_notes: addComm,
    };
  };

  const kaiwaReport: KaiwaStudyReportData = {
    exchange_with_student: exchangeWithStudent,
    session_1: {
      preparation: cleanStudyReportCellValue(getC2(12)),
      interaction: cleanStudyReportCellValue(getC2(13)),
      comprehension: cleanStudyReportCellValue(getC2(14)),
    },
    session_3: {
      preparation: cleanStudyReportCellValue(getC2(18)),
      interaction: cleanStudyReportCellValue(getC2(19)),
      comprehension: cleanStudyReportCellValue(getC2(20)),
    },
    sessions_1_10: parseMilestone(22),
    sessions_11_20: parseMilestone(36),
    sessions_21_30: parseMilestone(50),
    midterm: parseExam(64),
    final_exam: parseExam(72),
  };

  return {
    programType: 'KAIWA',
    sheetName: ws.name,
    detectedStudentExternalId,
    detectedStudentName,
    detectedPackageCode,
    detectedTeacherName,
    kaiwaReport,
    warnings: [],
  };
}

/**
 * Parse JLPT Study Report ('Format báo cáo học tập JLPT.xlsx' - Tab 1: Col A = Ngày, Col B = Nhận xét)
 */
export function parseJlptStudyReportWorkbook(
  workbook: ExcelJS.Workbook,
  preferredSheetName?: string
): ParsedStudyReportResult {
  const ws =
    (preferredSheetName ? workbook.getWorksheet(preferredSheetName) : undefined) ||
    workbook.worksheets[0];

  if (!ws) {
    return {
      programType: 'JLPT',
      sheetName: '',
      detectedStudentExternalId: null,
      detectedStudentName: null,
      detectedPackageCode: null,
      detectedTeacherName: null,
      jlptDailyReports: [],
      warnings: ['Không tìm thấy tab Báo cáo học tập JLPT'],
    };
  }

  const jlptDailyReports: JlptDailyReportItem[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const colA = cellText(row.getCell(1));
    const colB = cellText(row.getCell(2));
    if (!colA && !colB) continue;

    // Extract date from Col A or from "vào Thứ ... ngày dd/mm như sau" inside Col B
    let dateLabel = colA;
    if (!dateLabel && colB) {
      const m = colB.match(/ngày\s+(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/i);
      if (m) {
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        dateLabel = m[3] ? `${dd}/${mm}/${m[3]}` : `${dd}/${mm}`;
      }
    }

    // Check if this row is an unfilled template row (e.g. "vào Thứ  ngày  như sau" with empty Ưu điểm / Nhược điểm)
    const isUnfilledTemplate =
      !dateLabel &&
      /vào\s+Thứ\s+ngày\s+như\s+sau/i.test(colB) &&
      /Ưu điểm:\s*\r?\n\s*📍\s*Nhược điểm:\s*\r?\n/i.test(colB);

    if (isUnfilledTemplate) {
      continue;
    }

    const resolvedDate = dateLabel || `Buổi ${jlptDailyReports.length + 1}`;
    jlptDailyReports.push({
      rowNumber: r,
      dateLabel: resolvedDate,
      date: resolvedDate,
      comment: colB,
      summary_note: colB,
    });
  }

  return {
    programType: 'JLPT',
    sheetName: ws.name,
    detectedStudentExternalId: null,
    detectedStudentName: null,
    detectedPackageCode: null,
    detectedTeacherName: null,
    jlptDailyReports,
    warnings: [],
  };
}
