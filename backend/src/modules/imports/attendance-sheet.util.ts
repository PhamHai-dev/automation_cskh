/**
 * attendance-sheet.util.ts
 * -----------------------------------------------------------------------------
 * Engine helpers for the per-CSKH "Chấm buổi" (attendance) backup feature.
 *
 * Responsibilities:
 *  1. `extractAttendanceTemplate()` - build a clean .xlsx template that contains
 *     ONLY the attendance sheet (headers + month blocks, no student rows) so a
 *     backup file can be created for every (CSKH x program) config.
 *  2. `detectJlptMonthBlocks()` - parse the "THÁNG X/YYYY" column groups of the
 *     sheet and tell apart summary columns (Số buổi đã học / A / B / C / D / E)
 *     from day columns (row 2 = a real date).
 *  3. Date-key helpers - the class of timezone bugs where a local-midnight Excel
 *     date was keyed with `toISOString()` and silently shifted one day back
 *     (UTC+7). Header dates MUST use local components, `@db.Date` DB values MUST
 *     use UTC components.
 *  4. Google Sheets push helpers (`verifyTargetSpreadsheetSecurity`,
 *     `pushDeltaToGoogleSheet`) relocated here from sheet-backup.service.ts so
 *     that both the legacy sync service and the new program backup service can
 *     share them with an unchanged signature.
 * -----------------------------------------------------------------------------
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

import { AppError } from '../../middlewares/error.middleware';
import { createLogger } from '../../shared/logger/logger';
import { loadOptimizedWorkbook, extractCellValue } from './sheet-sync.parser';
import { dbDateKey, excelDateKey } from './attendance-sheet.utils';

const log = createLogger('attendance-sheet.util');

/* ========================================================================== *
 * 1. Date keys
 * ========================================================================== */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Calendar key for an EXCEL header date (e.g. the day columns in row 2).
 * Uses LOCAL components: the value is a civil date, not an instant, so
 * `toISOString()` would drift back one day on a UTC+7 server.
 */
export function dateKeyLocal(d: Date | null | undefined): string {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Calendar key for a Prisma `@db.Date` value (session_date, start_date, ...).
 * MySQL DATE arrives as UTC midnight, so UTC components are the correct read.
 */
export function dateKeyUtc(d: Date | string | null | undefined): string {
  return dbDateKey(d) || '';
}

/** Alias kept for readability at call sites that use excelDateKey semantics. */
export const dateKeyExcel = (d: unknown): string => excelDateKey(d) || '';

/* ========================================================================== *
 * 2. Month block detection
 * ========================================================================== */

export interface AttendanceSummaryCols {
  /** "Số buổi đã học" (per-month attended count) */
  attended?: number;
  /** "Số buổi xin nghỉ có phép A" */
  absentA?: number;
  /** "Số buổi bảo lưu B" */
  leaveB?: number;
  /** "Số buổi nghỉ sai quy định C" */
  absentC?: number;
  /** "Số buổi GV xin nghỉ D" */
  teacherD?: number;
  /** "Số buổi lỗi kĩ thuật E" */
  techErrorE?: number;
}

export interface AttendanceDayCol {
  colNumber: number;
  colLetter: string;
  /** `YYYY-MM-DD` built from LOCAL header components (see dateKeyLocal). */
  date: string;
  /** 1-based day-of-month, handy for logging. */
  day: number;
  year: number;
  month: number;
}

export interface AttendanceMonthBlock {
  month: number;
  year: number;
  label: string;
  startCol: number;
  endCol: number;
  totalDays: number;
  summaryCols: AttendanceSummaryCols;
  dailyCols: AttendanceDayCol[];
}

const MONTH_LABEL_RE = /TH[ÁA]NG\s*(\d{1,2})\s*[\/\-.]\s*((?:19|20)\d{2})/i;
/** `Tháng 1` / `THÁNG 01` without an explicit year (file Sổ CSKH marks the
 *  year once in row 1, e.g. ô Y1 = 2026; the day headers in row 2 carry it). */
const MONTH_LABEL_NO_YEAR_RE = /^TH[ÁA]NG\s*(\d{1,2})$/i;

/**
 * Fold Vietnamese text for header matching: strip diacritics (NFD + combining
 * marks), normalise `đ -> d`, lowercase and collapse whitespace. The real sheet
 * headers carry line breaks and inconsistent spacing
 * ("Số buổi nghỉ sai quy định\nC"), so matching must be accent-insensitive.
 */
export function foldHeaderText(text: string): string {
  return String(text || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      // Drop combining diacritical marks (U+0300 - U+036F).
      return code < 0x300 || code > 0x36f;
    })
    .join('')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const LETTER_TO_SUMMARY_KEY: Record<string, keyof AttendanceSummaryCols> = {
  a: 'absentA',
  b: 'leaveB',
  c: 'absentC',
  d: 'teacherD',
  e: 'techErrorE',
};

/**
 * Identify one of the 6 monthly summary columns from its row-2 header.
 * The trailing letter (A/B/C/D/E) is authoritative; some months in the real
 * workbook simply do not have the `B` (bảo lưu) column.
 */
function classifySummaryHeader(text: string): keyof AttendanceSummaryCols | null {
  const folded = foldHeaderText(text);
  if (!folded) return null;

  if (/^so buoi da hoc$/.test(folded)) return 'attended';

  if (/so buoi/.test(folded)) {
    const trailing = folded.match(/\s([abcde])$/);
    if (trailing) return LETTER_TO_SUMMARY_KEY[trailing[1]];
  }

  if (/co phep/.test(folded)) return 'absentA';
  if (/bao luu/.test(folded)) return 'leaveB';
  if (/sai quy dinh/.test(folded)) return 'absentC';
  if (/gv xin nghi|giao vien xin nghi/.test(folded)) return 'teacherD';
  if (/loi ki thuat/.test(folded)) return 'techErrorE';
  return null;
}

function cellKeyText(cell: ExcelJS.Cell): string {
  return String(cell.text || '').replace(/\s+/g, ' ').trim();
}

function cellDate(cell: ExcelJS.Cell): Date | null {
  const raw = extractCellValue(cell.value);
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Excel serial -> civil date (UTC midnight keeps the day components stable).
    return new Date(Math.round((raw - 25569) * 86400000));
  }
  return null;
}

export function colNumberToLetter(col: number): string {
  let temp = col;
  let letter = '';
  while (temp > 0) {
    const rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

/**
 * Detect every `THÁNG X/YYYY` block of an attendance worksheet.
 *
 * Layout of the real học-viện sheets (JLPT `Chấm buổi`, KAIWA `3.Chấm buổi`):
 *   - row 1 carries the block label at the FIRST column of the block
 *     (e.g. `THÁNG 10/2026` in ACW1);
 *   - row 2 carries, inside the block, the 6 summary headers
 *     (`Số buổi đã học`, `...A`, `...B`, `...C`, `...D`, `...E`) followed by the
 *     day columns whose row-2 value is a date. Note the day columns start at a
 *     variable offset: some months in the real file omit the `B` (bảo lưu)
 *     column, so we must NOT assume "6 summary columns then days".
 *
 * Algorithm: split the sheet by row-1 block labels, then within each block scan
 * row 2 - a column is a summary column when its header text matches a known
 * summary label, otherwise if its row-2 value is a date it is a day column.
 * Columns whose header is neither (trailing notes) are ignored.
 */
export function detectJlptMonthBlocks(
  ws: ExcelJS.Worksheet,
  headerRow = 2
): AttendanceMonthBlock[] {
  const row1 = ws.getRow(1);
  const row2 = ws.getRow(headerRow);
  const maxCol = Math.max(ws.columnCount, row2.cellCount || 0);

  // ---- 1. block anchors from row 1 -----------------------------------------
  const anchors: Array<{ col: number; month: number; year: number; label: string }> = [];
  for (let c = 1; c <= maxCol; c++) {
    const text = cellKeyText(row1.getCell(c));
    const m = text.match(MONTH_LABEL_RE);
    if (m) {
      anchors.push({
        col: c,
        month: parseInt(m[1], 10),
        year: parseInt(m[2], 10),
        label: text,
      });
      continue;
    }
    // KAIWA `3.Chấm buổi` (cham_soc_hoc_vien.xlsx) labels blocks `Tháng 1`
    // (no year in the label). year = 0 is a safe placeholder: the block year
    // below prefers dailyCols[0].year (the row-2 date headers carry the real
    // year), so the placeholder is only used if the block has no date cells.
    const mNoYear = text.match(MONTH_LABEL_NO_YEAR_RE);
    if (mNoYear) {
      const month = parseInt(mNoYear[1], 10);
      if (month >= 1 && month <= 12) {
        anchors.push({ col: c, month, year: 0, label: text });
      }
      continue;
    }
    // KAIWA `3.Chấm buổi` (cham_soc_hoc_vien.xlsx): months 4..12 store a Date
    // cell in row 1 (e.g. 2026-10-01 at col MR) while row 2 at the same column
    // is the "Số buổi đã học" summary header.
    const d1 = cellDate(row1.getCell(c));
    if (d1 && classifySummaryHeader(cellKeyText(row2.getCell(c))) === 'attended') {
      const mNum = d1.getMonth() + 1;
      const yNum = d1.getFullYear();
      anchors.push({
        col: c,
        month: mNum,
        year: yNum,
        label: `Tháng ${mNum}/${yNum}`,
      });
    }
  }
  if (anchors.length === 0) return [];

  // ---- 2. classify each column inside a block ------------------------------
  const blocks: AttendanceMonthBlock[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const cur = anchors[i];
    const next = anchors[i + 1];
    const endCol = next ? next.col - 1 : maxCol;

    const summaryCols: AttendanceSummaryCols = {};
    const dailyCols: AttendanceDayCol[] = [];
    let prevDate: Date | null = null;

    for (let c = cur.col; c <= endCol; c++) {
      const cell2 = row2.getCell(c);
      const headerText = cellKeyText(cell2);

      const summaryKey = classifySummaryHeader(headerText);
      if (summaryKey && summaryCols[summaryKey] === undefined) {
        summaryCols[summaryKey] = c;
        continue;
      }

      const d = cellDate(cell2);
      if (d) {
        prevDate = d;
        dailyCols.push({
          colNumber: c,
          colLetter: colNumberToLetter(c),
          date: dateKeyLocal(d),
          day: d.getDate(),
          year: d.getFullYear(),
          month: d.getMonth() + 1,
        });
        continue;
      }

      // Shared/normalised formula date (e.g. `ACW2+1`): ExcelJS usually resolves
      // the cached result, but fall back to "previous header + 1 day" so a month
      // whose trailing days are formulas is not silently truncated.
      if (prevDate && headerText === '') {
        const raw = cell2.value as any;
        if (raw && typeof raw === 'object' && (raw.formula || raw.sharedFormula)) {
          const plus = String(raw.formula || '').match(/\+\s*(\d+)/);
          const step = plus ? parseInt(plus[1], 10) : 1;
          const inferred: Date = new Date(
            prevDate.getFullYear(),
            prevDate.getMonth(),
            prevDate.getDate() + step
          );
          prevDate = inferred;
          dailyCols.push({
            colNumber: c,
            colLetter: colNumberToLetter(c),
            date: dateKeyLocal(inferred),
            day: inferred.getDate(),
            year: inferred.getFullYear(),
            month: inferred.getMonth() + 1,
          });
        }
      }
    }

    if (dailyCols.length === 0) continue;

    // Prefer the year actually carried by the day headers (authoritative),
    // fall back to the row-1 label.
    const year = dailyCols[0].year || cur.year;
    const month = dailyCols[0].month || cur.month;

    blocks.push({
      month,
      year,
      label: `Tháng ${month}/${year}`,
      startCol: cur.col,
      endCol,
      totalDays: dailyCols.length,
      summaryCols,
      dailyCols,
    });
  }

  return blocks;
}

/** Distinct years present in the sheet, ascending (used for availableYears). */
export function detectSheetYears(ws: ExcelJS.Worksheet, headerRow = 2): number[] {
  const years = new Set<number>();
  for (const b of detectJlptMonthBlocks(ws, headerRow)) years.add(b.year);
  return [...years].sort((a, b) => a - b);
}

/* ========================================================================== *
 * Cell helpers (shared by the backup engine)
 * ========================================================================== */

/** Normalised comparable text for an arbitrary cell/DB value (diff counting). */
export function normalizeCellComparable(val: unknown): string {
  if (val === undefined || val === null) return '';
  const extracted = extractCellValue(val);
  if (extracted === undefined || extracted === null) return '';
  if (extracted instanceof Date) {
    if (isNaN(extracted.getTime())) return '';
    return dateKeyLocal(extracted);
  }
  if (typeof extracted === 'object') {
    const obj = extracted as Record<string, unknown>;
    if (obj.result !== undefined && obj.result !== null) return normalizeCellComparable(obj.result);
    if ('text' in obj) return String(obj.text || '').trim();
    if ('hyperlink' in obj) return String(obj.hyperlink || '').trim();
    return '';
  }
  return String(extracted).trim();
}

/**
 * Write a value into a cell without destroying its formula: for formula cells we
 * only refresh the cached result so Excel/Sheets keeps the SUM/COUNTIF logic.
 */
export function setCellValuePreservingFormula(cell: ExcelJS.Cell, newValue: string | number): void {
  const raw = cell.value as unknown;
  if (raw && typeof raw === 'object' && 'formula' in raw && (raw as any).formula) {
    cell.value = {
      ...(raw as any),
      result: newValue === '' ? 0 : newValue,
    } as any;
  } else {
    cell.value = newValue;
  }
}

/* ========================================================================== *
 * 2b. Google Sheets value sanitizer
 * ========================================================================== */

/** Any value Google `values:batchUpdate` accepts inside a `values` matrix. */
export type GoogleSafeValue = string | number | boolean;

const EXCEL_ERROR_TEXTS = new Set([
  '#N/A',
  '#REF!',
  '#VALUE!',
  '#DIV/0!',
  '#NAME?',
  '#NULL!',
  '#NUM!',
  '#GETTING_DATA',
]);

/**
 * Nén một ô Excel thành giá trị an toàn cho Google Sheets `values:batchUpdate`.
 *
 * LÝ DO HÀM NÀY TỒN TẠI (bug đã reproduce): ô công thức có cached result là
 * object lỗi `{ error: '#N/A' }` (hoặc hyperlink / rich text / array) được đẩy
 * nguyên trạng lên API -> Google trả 400
 * `Invalid values[2][5]: struct_value {key:"error", string_value:"#N/A"}`.
 * API chỉ nhận string | number | boolean, nên mọi object phải về text, mọi
 * object lỗi phải về '' (KHÔNG bao giờ là `{}`), Date về `YYYY-MM-DD` local.
 *
 * Quy tắc:
 *  - null/undefined/NaN/Infinity  -> ''
 *  - number / boolean             -> giữ nguyên (không ép chuỗi, Sheets tự hiểu)
 *  - Date                         -> dateKeyLocal (tránh lệch múi giờ UTC+7)
 *  - formula / sharedFormula      -> đệ quy trên `result` (kể cả result rỗng)
 *  - `{ error: '#X' }`            -> cell.text nếu có, ngược lại ''
 *  - `{ text, hyperlink }`        -> text (hyperlink chỉ là metadata)
 *  - `{ richText: [...] }`        -> chuỗi ghép các part
 *  - array                        -> ghép text bằng dấu phẩy
 *  - object khác                  -> normalizeCellComparable (an toàn: chuỗi)
 */
export function toGoogleSafeValue(val: unknown): GoogleSafeValue {
  if (val === undefined || val === null) return '';

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '' : dateKeyLocal(val);
  }

  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : '';
  }
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val;

  if (Array.isArray(val)) {
    return val.map((item) => toGoogleSafeValue(item)).join(',');
  }

  if (typeof val === 'object') {
    const obj = val as Record<string, any>;

    // 1. Ô công thức: chỉ result mới là dữ liệu (formula là metadata của Excel).
    //    Trường hợp ExcelJS chuyển result sang `text` (formula + hyperlink) thì lấy text.
    if (obj.formula !== undefined || obj.sharedFormula !== undefined) {
      if (obj.result === undefined || obj.result === null) {
        if (typeof obj.text === 'string') return obj.text;
        return '';
      }
      return toGoogleSafeValue(obj.result);
    }
    // 2. result nằm trực tiếp trên value (một số reader trả { result } cho date).
    if (obj.result !== undefined) return toGoogleSafeValue(obj.result);

    // 3. Error cell: { error: '#N/A' } -> text hiển thị (nếu có) ngược lại ô trống.
    if (obj.error !== undefined) {
      if (typeof obj.text === 'string') return obj.text;
      const errText = String(obj.error || '').toUpperCase();
      if (EXCEL_ERROR_TEXTS.has(errText)) return '';
      return toGoogleSafeValue(obj.error);
    }

    // 4. Hyperlink / rich text.
    if (typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((part: any) => String(part?.text ?? '')).join('');
    }
    if (typeof obj.hyperlink === 'string') return obj.hyperlink;

    const fallback = normalizeCellComparable(val);
    return fallback === '' ? '' : fallback;
  }

  return String(val);
}

/* ========================================================================== *
 * 3. Template extraction
 * ========================================================================== */

/** Source workbooks that carry the canonical attendance sheet layout. */
const TEMPLATE_SOURCE_CANDIDATES = [
  'docs/data/hoc_vien/hoc_vien_jlpt.xlsx',
  '../docs/data/hoc_vien/hoc_vien_jlpt.xlsx',
];

/** KAIWA layout lives in the shared Sổ CSKH workbook (1.Chăm sóc + 3.Chấm buổi). */
const KAIWA_TEMPLATE_SOURCE_CANDIDATES = [
  'docs/data/cham_soc_hoc_vien.xlsx',
  '../docs/data/cham_soc_hoc_vien.xlsx',
  'docs/data/cham_soc_hoc_vien_mock.xlsx',
  '../docs/data/cham_soc_hoc_vien_mock.xlsx',
];

export function resolveProgramTemplateSource(programType: string): string {
  const program = String(programType || '').trim().toUpperCase();
  const rels = program === 'KAIWA' ? KAIWA_TEMPLATE_SOURCE_CANDIDATES : TEMPLATE_SOURCE_CANDIDATES;
  const roots = [process.cwd(), path.resolve(__dirname, '../../../..'), path.resolve(process.cwd(), '..')];
  for (const root of roots) {
    for (const rel of rels) {
      const p = path.resolve(root, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new AppError(
    500,
    `Không tìm thấy file template cho chương trình ${program} (${rels.join(', ')})`
  );
}

export function resolveAttendanceTemplateSource(): string {
  return resolveProgramTemplateSource('JLPT');
}

const STRUCTURE_SHEET_MARKER = '__CSKH_STRUCTURE__';

/**
 * Copy the structural rows of `sourceWs` into the worksheet `outWs`.
 *
 * ExcelJS's splice/`Row.commit()` paths silently corrupt rows whose cells use
 * *shared* formulas (the học-viện sheets have ~120k of them), so instead of
 * deleting rows we build a fresh workbook and only copy rows 1..headerRow plus
 * the sample formula row. A marker cell is appended after the header so the
 * backup engine knows exactly where data starts and can fill formula gaps when
 * appending a new row.
 *
 * `formulaRowMode`:
 *  - 'full'    : copy the whole sample row (attendance sheets: row 3 of
 *                `Chấm buổi` is almost pure formulas).
 *  - 'formula' : copy ONLY cells carrying a formula (profile sheets: the sample
 *                row is a real student - its text must not survive into the
 *                template or it becomes a ghost enrollment).
 */
function copyStructureRows(
  sourceWs: ExcelJS.Worksheet,
  outWs: ExcelJS.Worksheet,
  headerRow: number,
  formulaRowMode: 'full' | 'formula' = 'full'
): { maxCol: number; formulaRowNumber: number } {
  const maxCol = Math.max(sourceWs.columnCount, 1);
  const formulaRowNumber = headerRow + 1;

  const rowsToCopy: number[] = [];
  for (let r = 1; r <= headerRow; r++) rowsToCopy.push(r);
  if (sourceWs.rowCount >= formulaRowNumber) rowsToCopy.push(formulaRowNumber);

  for (const r of rowsToCopy) {
    const srcRow = sourceWs.getRow(r);
    const dstRow = outWs.getRow(r);
    if (srcRow.height) dstRow.height = srcRow.height;
    if (srcRow.hidden) dstRow.hidden = true;
    const isSampleRow = r === formulaRowNumber;
    for (let c = 1; c <= maxCol; c++) {
      const srcCell = srcRow.getCell(c);
      const val = srcCell.value;
      if (val === null || val === undefined || val === '') continue;
      const formulaStr =
        val && typeof val === 'object' && typeof (val as any).formula === 'string'
          ? String((val as any).formula)
          : '';
      const isFormula = formulaStr.length > 0;
      if (isSampleRow) {
        // Trên dòng mẫu (headerRow + 1), chỉ giữ công thức tính toán thực sự
        // (SUM, COUNTIF, SUMIF...), bỏ qua giá trị tĩnh của học viên mẫu và bỏ
        // qua công thức giả lập `__xludf.DUMMYFUNCTION` (Google Sheets export)
        // để học viên đầu tiên của CSKH luôn bắt đầu sạch ngay từ dòng headerRow + 1.
        if (!isFormula) continue;
        if (formulaStr.includes('DUMMYFUNCTION') || formulaStr.includes('!') || formulaStr.includes('#REF!')) {
          continue;
        }
      }
      const dstCell = dstRow.getCell(c);
      try {
        if (isSampleRow && isFormula) {
          dstCell.value = { formula: formulaStr, result: 0 } as any;
        } else {
          dstCell.value = val as any;
          if (isFormula) delete (dstCell.value as any).shared;
        }
      } catch {
        dstCell.value = normalizeCellComparable(val);
      }
      const style = srcCell.style;
      if (style && Object.keys(style).length > 0) {
        try {
          dstCell.style = style;
        } catch {
          /* style copy is best-effort */
        }
      }
    }
  }

  // Column widths / hidden flags (day columns stay narrow and hidden).
  for (let c = 1; c <= maxCol; c++) {
    const srcCol = sourceWs.getColumn(c);
    const dstCol = outWs.getColumn(c);
    if (srcCol.width) dstCol.width = srcCol.width;
    if (srcCol.hidden) dstCol.hidden = true;
  }

  // Sentinel marker: keeps rowCount >= structure row and flags this file as
  // engine-generated. The backup engine clears the column-1 data rows it writes.
  outWs.getRow(headerRow).getCell(1).note = STRUCTURE_SHEET_MARKER;

  return { maxCol, formulaRowNumber };
}

function buildStructureOnlyWorkbook(
  sourceWs: ExcelJS.Worksheet,
  sheetName: string,
  headerRow: number,
  formulaRowMode: 'full' | 'formula' = 'full'
): { workbook: ExcelJS.Workbook; worksheet: ExcelJS.Worksheet; maxCol: number; formulaRowNumber: number } {
  const outWb = new ExcelJS.Workbook();
  outWb.created = new Date();
  const outWs = outWb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', xSplit: 12, ySplit: headerRow }],
  });

  const { maxCol, formulaRowNumber } = copyStructureRows(sourceWs, outWs, headerRow, formulaRowMode);
  return { workbook: outWb, worksheet: outWs, maxCol, formulaRowNumber };
}

export interface AttendanceTemplateInfo {
  sheetName: string;
  maxCol: number;
  firstDataRow: number;
  years: number[];
}

/**
 * Read ONLY the attendance worksheet of the source template (structure rows are
 * enough) - used to list the calendar years available in the template without
 * materialising the 8.5 MB workbook.
 */
export async function readTemplateAttendanceWorksheet(
  sheetName = 'Chấm buổi'
): Promise<ExcelJS.Worksheet> {
  const sourcePath = resolveAttendanceTemplateSource();
  const buffer = fs.readFileSync(sourcePath);
  const wb = await loadOptimizedWorkbook(buffer, [sheetName, 'Chấm buổi', '3.Chấm buổi']);
  const ws =
    wb.getWorksheet(sheetName) || wb.getWorksheet('Chấm buổi') || wb.getWorksheet('3.Chấm buổi') || wb.worksheets[0];
  if (!ws) throw new AppError(500, `Không đọc được sheet "${sheetName}" từ file template học viện`);
  return ws;
}

/**
 * Build a template .xlsx at `destPath` containing a SINGLE worksheet named
 * `sheetName`, holding only the structural rows of the original `Chấm buổi`
 * sheet (row 1 = month labels, row 2 = per-column headers, row 3 = the sample
 * formula row) and no student data.
 *
 * Implementation note: the optimised loader (`loadOptimizedWorkbook`) prunes the
 * 8.5 MB source workbook down to the attendance worksheet before ExcelJS touches
 * it, then we rewrite a structure-only workbook. Some decoration (comments,
 * drawings, a few fills) is lost - acceptable for a backup file - while row 1 /
 * row 2 and every month summary + column L formula are preserved verbatim.
 */
export async function extractAttendanceTemplate(
  destPath: string,
  sheetName: string,
  headerRow = 2
): Promise<AttendanceTemplateInfo> {
  const sourcePath = resolveAttendanceTemplateSource();
  const buffer = fs.readFileSync(sourcePath);

  const sourceWb = await loadOptimizedWorkbook(buffer, [sheetName, 'Chấm buổi', '3.Chấm buổi']);
  const sourceWs =
    sourceWb.getWorksheet(sheetName) ||
    sourceWb.getWorksheet('Chấm buổi') ||
    sourceWb.getWorksheet('3.Chấm buổi') ||
    sourceWb.worksheets[0];

  if (!sourceWs) {
    throw new AppError(500, `Không đọc được sheet "${sheetName}" từ file template học viện`);
  }

  const { workbook, worksheet, maxCol } = buildStructureOnlyWorkbook(sourceWs, sheetName, headerRow);

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await workbook.xlsx.writeFile(destPath);

  const years = detectSheetYears(worksheet, headerRow);
  log.info('Attendance template extracted', { destPath, sheetName, maxCol, years });

  return { sheetName, maxCol, firstDataRow: headerRow + 1, years };
}

/**
 * Load an existing backup workbook, creating it from the template when the file
 * is missing or when its attendance sheet has been lost.
 */
export async function loadOrExtractAttendanceWorkbook(
  absPath: string,
  sheetName: string,
  headerRow = 2,
  forceFresh = false
): Promise<{
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  maxCol: number;
  firstDataRow: number;
  isFresh: boolean;
}> {
  const open = async (): Promise<{ workbook: ExcelJS.Workbook; worksheet: ExcelJS.Worksheet } | null> => {
    if (!fs.existsSync(absPath)) return null;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(absPath);
    const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
    if (!worksheet) return null;
    return { workbook, worksheet };
  };

  let loaded = forceFresh ? null : await open();

  if (loaded) {
    const maxCol = Math.max(loaded.worksheet.columnCount, 1);
    if (maxCol >= 100) {
      return {
        workbook: loaded.workbook,
        worksheet: loaded.worksheet,
        maxCol,
        firstDataRow: headerRow + 1,
        isFresh: false,
      };
    }
    log.warn('Backup file looks truncated (missing month columns), rebuilding from template', {
      absPath,
      maxCol,
    });
  }

  const info = await extractAttendanceTemplate(absPath, sheetName, headerRow);
  const reopened = await open();
  if (!reopened) {
    throw new AppError(500, `Không mở được file backup vừa tạo: ${absPath}`);
  }
  return {
    workbook: reopened.workbook,
    worksheet: reopened.worksheet,
    maxCol: info.maxCol,
    firstDataRow: info.firstDataRow,
    isFresh: true,
  };
}

/* ========================================================================== *
 * 3b. Program workbook (profile sheet + attendance sheet, ONE file)
 * ========================================================================== */

export interface ProgramWorkbookResult {
  workbook: ExcelJS.Workbook;
  profileWorksheet: ExcelJS.Worksheet;
  attendanceWorksheet: ExcelJS.Worksheet;
  profileMaxCol: number;
  attendanceMaxCol: number;
  profileFirstDataRow: number;
  attendanceFirstDataRow: number;
  isFresh: boolean;
}

/**
 * Load the per-(CSKH x program) backup workbook containing BOTH sheets:
 *   KAIWA: `1.Chăm sóc` (header row 3) + `3.Chấm buổi` (header row 2)
 *   JLPT : `Data JLPT_Inhouse` (header row 2) + `Chấm buổi` (header row 2)
 *
 * When the file is missing, was produced by the old single-sheet engine, or is
 * force-refreshed, rebuild it from the program template
 * (`resolveProgramTemplateSource`) keeping every structural row of both sheets
 * (month blocks + sample formula row). The profile sample row keeps ONLY its
 * formula cells so no ghost student text survives into the template.
 */
export async function loadOrExtractProgramWorkbook(opts: {
  absPath: string;
  programType: string;
  profileSheetName: string;
  profileHeaderRow: number;
  attendanceSheetName: string;
  attendanceHeaderRow: number;
  forceFresh?: boolean;
}): Promise<ProgramWorkbookResult> {
  const {
    absPath,
    programType,
    profileSheetName,
    profileHeaderRow,
    attendanceSheetName,
    attendanceHeaderRow,
    forceFresh,
  } = opts;

  const open = async (): Promise<{ workbook: ExcelJS.Workbook; profileWorksheet: ExcelJS.Worksheet; attendanceWorksheet: ExcelJS.Worksheet } | null> => {
    if (!fs.existsSync(absPath)) return null;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(absPath);
    const profileWorksheet = workbook.getWorksheet(profileSheetName);
    const attendanceWorksheet = workbook.getWorksheet(attendanceSheetName);
    if (!profileWorksheet || !attendanceWorksheet) return null;
    return { workbook, profileWorksheet, attendanceWorksheet };
  };

  if (!forceFresh) {
    const loaded = await open();
    if (loaded) {
      const attendanceMaxCol = Math.max(loaded.attendanceWorksheet.columnCount, 1);
      const profileMaxCol = Math.max(loaded.profileWorksheet.columnCount, 1);
      if (attendanceMaxCol >= 100 && profileMaxCol >= 40) {
        return {
          workbook: loaded.workbook,
          profileWorksheet: loaded.profileWorksheet,
          attendanceWorksheet: loaded.attendanceWorksheet,
          profileMaxCol,
          attendanceMaxCol,
          profileFirstDataRow: profileHeaderRow + 1,
          attendanceFirstDataRow: attendanceHeaderRow + 1,
          isFresh: false,
        };
      }
      log.warn('Backup workbook thiếu cột (month block / profile), rebuild từ template', {
        absPath,
        attendanceMaxCol,
        profileMaxCol,
      });
    }
  }

  // ---- Rebuild from the program template ----------------------------------
  const sourcePath = resolveProgramTemplateSource(programType);
  const buffer = fs.readFileSync(sourcePath);
  const sourceWb = await loadOptimizedWorkbook(buffer, [
    profileSheetName,
    attendanceSheetName,
    '1.Chăm sóc',
    'Data JLPT_Inhouse',
    'Chấm buổi',
    '3.Chấm buổi',
  ]);

  const sourceProfile =
    sourceWb.getWorksheet(profileSheetName) ||
    (programType === 'KAIWA' ? sourceWb.getWorksheet('1.Chăm sóc') : sourceWb.getWorksheet('Data JLPT_Inhouse'));
  const sourceAttendance =
    sourceWb.getWorksheet(attendanceSheetName) ||
    (programType === 'KAIWA' ? sourceWb.getWorksheet('3.Chấm buổi') : sourceWb.getWorksheet('Chấm buổi'));

  if (!sourceProfile) {
    throw new AppError(500, `Template ${programType} (${path.basename(sourcePath)}) thiếu sheet hồ sơ "${profileSheetName}"`);
  }
  if (!sourceAttendance) {
    throw new AppError(500, `Template ${programType} (${path.basename(sourcePath)}) thiếu sheet điểm danh "${attendanceSheetName}"`);
  }

  const outWb = new ExcelJS.Workbook();
  outWb.created = new Date();
  const outProfile = outWb.addWorksheet(profileSheetName, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: profileHeaderRow }],
  });
  const outAttendance = outWb.addWorksheet(attendanceSheetName, {
    views: [{ state: 'frozen', xSplit: 12, ySplit: attendanceHeaderRow }],
  });

  const profileStruct = copyStructureRows(sourceProfile, outProfile, profileHeaderRow, 'formula');
  const attendanceStruct = copyStructureRows(sourceAttendance, outAttendance, attendanceHeaderRow, 'full');

  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await outWb.xlsx.writeFile(absPath);

  const reopened = await open();
  if (!reopened) {
    throw new AppError(500, `Không mở được file backup vừa tạo: ${absPath}`);
  }
  log.info('Program workbook (2 sheet) rebuilt from template', {
    absPath,
    programType,
    profileSheetName,
    attendanceSheetName,
    profileMaxCol: profileStruct.maxCol,
    attendanceMaxCol: attendanceStruct.maxCol,
  });

  return {
    workbook: reopened.workbook,
    profileWorksheet: reopened.profileWorksheet,
    attendanceWorksheet: reopened.attendanceWorksheet,
    profileMaxCol: profileStruct.maxCol,
    attendanceMaxCol: attendanceStruct.maxCol,
    profileFirstDataRow: profileHeaderRow + 1,
    attendanceFirstDataRow: attendanceHeaderRow + 1,
    isFresh: true,
  };
}

/* ========================================================================== *
 * 4. Google Sheets push helpers (relocated from sheet-backup.service.ts)
 *    Signatures are UNCHANGED so callers keep working.
 * ========================================================================== */

export async function verifyTargetSpreadsheetSecurity(
  spreadsheetId: string,
  accessToken: string,
  requirePrivateSheet: boolean
): Promise<void> {
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=id,name,permissions&supportsAllDrives=true`;
  const driveResp = await fetch(driveUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (driveResp.ok) {
    const data = (await driveResp.json()) as {
      id?: string;
      name?: string;
      permissions?: Array<{ type?: string; role?: string }>;
    };

    if (requirePrivateSheet && Array.isArray(data.permissions)) {
      const hasPublicWrite = data.permissions.some(
        (p) => p.type === 'anyone' && (p.role === 'writer' || p.role === 'organizer' || p.role === 'fileOrganizer')
      );
      if (hasPublicWrite) {
        throw new AppError(
          403,
          'Chặn bảo mật: File Google Sheet đích đang bật quyền cho phép bất kỳ ai trên Internet chỉnh sửa (Anyone can edit). Vui lòng đổi về Hạn chế (Restricted) để chống rò rỉ dữ liệu học viên.'
        );
      }
    }
    return;
  }

  const driveErrText = await driveResp.text().catch(() => '');

  if (
    driveErrText.includes('SERVICE_DISABLED') ||
    driveErrText.includes('accessNotConfigured') ||
    driveErrText.includes('drive.googleapis.com')
  ) {
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties.title`;
    const sheetsResp = await fetch(sheetsUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!sheetsResp.ok) {
      if (sheetsResp.status === 403 || sheetsResp.status === 404) {
        throw new AppError(
          403,
          `Không thể truy cập Google Sheet đích (${spreadsheetId}). Vui lòng Share quyền Người chỉnh sửa (Editor) cho email Google Service Account.`
        );
      }
      const sheetsErrText = await sheetsResp.text().catch(() => '');
      throw new AppError(
        400,
        `Lỗi kết nối Google Sheets API (${spreadsheetId}): ${sheetsErrText || sheetsResp.statusText}`
      );
    }
    return;
  }

  if (driveResp.status === 403 || driveResp.status === 404) {
    throw new AppError(
      403,
      `Không thể truy cập Google Sheet đích (${spreadsheetId}). Vui lòng Share quyền Người chỉnh sửa (Editor) cho email Google Service Account.`
    );
  }

  throw new AppError(
    400,
    `Lỗi kiểm tra bảo mật Google Sheet (${spreadsheetId}): ${driveErrText || driveResp.statusText}`
  );
}

export async function pushDeltaToGoogleSheet(
  spreadsheetId: string,
  accessToken: string,
  batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }>
): Promise<void> {
  if (batchRanges.length === 0) return;

  // 1. Make sure the target grid is big enough for the ranges we are about to write.
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties)`;
    const metaResp = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (metaResp.ok) {
      const meta = (await metaResp.json()) as {
        sheets?: Array<{
          properties?: {
            sheetId?: number;
            title?: string;
            gridProperties?: { rowCount?: number; columnCount?: number };
          };
        }>;
      };

      const sheetPropsByName = new Map<string, { sheetId: number; rowCount: number; columnCount: number }>();
      for (const s of meta.sheets || []) {
        const p = s.properties;
        if (p && p.title !== undefined && p.sheetId !== undefined) {
          sheetPropsByName.set(p.title, {
            sheetId: p.sheetId,
            rowCount: p.gridProperties?.rowCount || 1000,
            columnCount: p.gridProperties?.columnCount || 26,
          });
        }
      }

      const neededBySheet = new Map<string, { maxRow: number; maxCol: number }>();
      for (const item of batchRanges) {
        const match = item.range.match(/^'?([^'!]+)'?!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
        if (!match) continue;
        const title = match[1];
        const rowEnd = parseInt(match[5] || match[3], 10);
        const colCount = item.values?.[0]?.length || 60;
        const prev = neededBySheet.get(title) || { maxRow: 0, maxCol: 0 };
        neededBySheet.set(title, {
          maxRow: Math.max(prev.maxRow, rowEnd),
          maxCol: Math.max(prev.maxCol, colCount),
        });
      }

      const dimensionRequests: any[] = [];
      for (const [title, needed] of neededBySheet.entries()) {
        const prop = sheetPropsByName.get(title);
        if (!prop) continue;
        if (needed.maxRow > prop.rowCount) {
          dimensionRequests.push({
            appendDimension: {
              sheetId: prop.sheetId,
              dimension: 'ROWS',
              length: needed.maxRow - prop.rowCount + 50,
            },
          });
        }
        if (needed.maxCol > prop.columnCount) {
          dimensionRequests.push({
            appendDimension: {
              sheetId: prop.sheetId,
              dimension: 'COLUMNS',
              length: needed.maxCol - prop.columnCount + 10,
            },
          });
        }
      }

      if (dimensionRequests.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests: dimensionRequests }),
        });
      }
    }
  } catch {
    // Non-fatal: values:batchUpdate below will surface real errors.
  }

  // 2. Push changed rows in chunks of 200 ranges.
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const chunkSize = 200;
  for (let i = 0; i < batchRanges.length; i += chunkSize) {
    const chunk = batchRanges.slice(i, i + chunkSize);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: chunk }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new AppError(
        400,
        `Đồng bộ Google Sheets API v4 thất bại (${spreadsheetId}): ${errText || resp.statusText}`
      );
    }
  }
}
