/**
 * profile-sheet.util.ts
 * -----------------------------------------------------------------------------
 * Layout Catalog + Column Mapping Config cho backup Web -> Sheet:
 *   - KAIWA  : `1.Chăm sóc` (60 cột A..BH, header row 3) + `3.Chấm buổi` (28 cột
 *              cố định A..AB, header row 2, block tháng từ AC) + `Điểm danh chốt` (12 cột A..L)
 *   - JLPT   : `Data JLPT_Inhouse` (52 cột A..AZ, header row 2) + `Chấm buổi`
 *              (12 cột cố định A..L, header row 2, block tháng từ M) + `Điểm danh chốt` (12 cột A..L)
 *   - TEACHER: `2026 スケジュール` (6 cột cố định A..F, header row 2, block tháng từ G)
 *
 * Bộ fieldKey ở đây là HỢP ĐỒNG giữa 3 phía:
 *   1. Bảng cấu hình cột Admin (AppSetting `SHEET_BACKUP_COLUMN_CONFIG`)
 *   2. Engine backup (sheet-backup.service.ts) resolve giá trị từ DB
 *   3. UI "Cấu hình cột" (GET /imports/sheet-backup/column-config)
 * Chiều đọc Sheet -> Web đối xứng trong sheet-sync.parser.ts
 * (parseJlptSheetRows / parseKaiwaSheetRows).
 * -----------------------------------------------------------------------------
 */

import { Prisma } from '@prisma/client';

import { prisma } from '../../prisma/client';
import { AppError } from '../../middlewares/error.middleware';
import { createLogger } from '../../shared/logger/logger';
import { colNumberToLetter } from './attendance-sheet.util';

const log = createLogger('profile-sheet.util');

/* ------------------------------ Types ------------------------------ */

export type BackupProgramType = 'KAIWA' | 'JLPT';
export type BackupSheetKind = 'profile' | 'attendance';

export interface SheetColumnConfigItem {
  fieldKey: string;
  title: string;
  group: string;
  defaultCol: number;
  col: number;
  colLetter: string;
  enabled: boolean;
  hasDbSource: boolean;
  isKey?: boolean;
  isFormulaPreserved?: boolean;
}

export interface SheetColumnMappingConfig {
  sheetKind: BackupSheetKind;
  defaultSheetName: string;
  headerRow: number;
  firstDataRow: number;
  columns: SheetColumnConfigItem[];
}

export interface ProgramColumnMappingConfig {
  programType: BackupProgramType;
  profile: SheetColumnMappingConfig;
  attendance: SheetColumnMappingConfig;
}

export interface GlobalBackupColumnConfigMap {
  KAIWA: ProgramColumnMappingConfig;
  JLPT: ProgramColumnMappingConfig;
  updatedAt?: string;
}

export const BACKUP_COLUMN_CONFIG_SETTING_KEY = 'SHEET_BACKUP_COLUMN_CONFIG';

export const COLUMN_GROUPS = {
  profile: 'Hồ sơ & Học phí',
  class: 'Lớp & Lịch học',
  care: 'Nhật ký chăm sóc',
  exam: 'Kiểm tra & Thi',
  attendance: 'Điểm danh & Tổng kết',
} as const;

/* --------------------------- Column helpers ------------------------- */

export function colLetterToNumber(letter: string): number {
  const clean = String(letter || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!clean) return 0;
  let n = 0;
  for (const ch of clean) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

type ColEntry = [
  col: number,
  fieldKey: string,
  title: string,
  group: string,
  extra?: Partial<Pick<SheetColumnConfigItem, 'enabled' | 'hasDbSource' | 'isKey' | 'isFormulaPreserved'>>
];

function buildCols(entries: ColEntry[]): SheetColumnConfigItem[] {
  return entries.map(([col, fieldKey, title, group, extra]) => ({
    fieldKey,
    title,
    group,
    defaultCol: col,
    col,
    colLetter: colNumberToLetter(col),
    enabled: extra?.enabled ?? true,
    hasDbSource: extra?.hasDbSource ?? true,
    ...(extra?.isKey ? { isKey: true } : {}),
    ...(extra?.isFormulaPreserved ? { isFormulaPreserved: true } : {}),
  }));
}

const G = COLUMN_GROUPS;
const KEEP = 'keep';
const NO_DB = { hasDbSource: false };

export function isKeepFieldKey(fieldKey?: string | null): boolean {
  const k = String(fieldKey || '').trim();
  return k === KEEP || k.startsWith('keep.');
}

/* ----------------------- KAIWA: 1.Chăm sóc (60) ---------------------- */

const KAIWA_PROFILE_COLS = buildCols([
  [1, 'student.external_id', 'ID', G.profile, { isKey: true }],
  [2, 'enr.paid_at', 'Ngày nộp học phí', G.profile],
  [3, 'enr.sale_name', 'Sale', G.profile],
  [4, 'enr.student_source_status', 'Trạng thái HV', G.profile],
  [5, 'student.full_name', 'Họ tên HV', G.profile],
  [6, 'student.gender', 'Giới tính', G.profile],
  [7, 'student.phone', 'SĐT', G.profile],
  [8, 'student.email', 'Email', G.profile],
  [9, 'enr.course_content', 'Nội dung khoá', G.profile],
  [10, 'enr.payment_status', 'Trạng thái thanh toán', G.profile],
  [11, 'pkg.code', 'Gói học', G.profile],
  [12, 'enr.course_teacher_type', 'Khoá học', G.profile],
  [13, 'enr.level', 'Trình độ', G.profile],
  [14, 'enr.total_sessions', 'Tổng số buổi', G.class],
  [15, 'enr.class_model', 'Mô hình lớp', G.class],
  [16, 'enr.sales_note', 'Ghi chú sale', G.profile],
  [17, 'student.date_of_birth', 'DOB', G.profile],
  [18, 'student.occupation', 'Nghề nghiệp', G.profile],
  [19, 'cvht.staff_code', 'CVHT', G.class],
  [20, 'stats.remaining_sessions', 'Số buổi còn lại', G.attendance, { isFormulaPreserved: true }],
  [21, 'enr.start_date', 'Ngày bắt đầu học', G.class],
  [22, 'enr.status_label', 'Trạng thái', G.class],
  [23, 'enr.end_date', 'Ngày kết thúc/Bảo lưu', G.class],
  [24, 'schedule.start_time', 'Giờ học (1)', G.class],
  [25, 'schedule.schedule_pattern', 'Lịch học (1)', G.class],
  [26, 'schedule.duration_minutes', 'Thời lượng buổi học (1)', G.class],
  [27, 'keep.start_time_2', 'Giờ học (2)', G.class, NO_DB],
  [28, 'keep.schedule_pattern_2', 'Lịch học (2)', G.class, NO_DB],
  [29, 'keep.duration_minutes_2', 'Thời lượng buổi học (2)', G.class, NO_DB],
  [30, 'keep.loop_pattern', 'Vòng lặp', G.class, NO_DB],
  [31, 'keep.study_days_note', 'Ngày học', G.class, NO_DB],
  [32, 'teacher.name', 'Giáo viên', G.class],
  [33, 'teacher.code', 'Mã GV', G.class],
  [34, 'class.class_name', 'Tên lớp', G.class],
  [35, 'enr.attended_previous_years', 'Tổng số buổi đã học năm trước', G.attendance],
  [36, 'stats.attended_current_year', 'Tổng số buổi đã học trong năm', G.attendance, { isFormulaPreserved: true }],
  [37, 'enr.study_report_url', 'Báo cáo học tập', G.care],
  [38, 'enr.exchange_info', 'Thông tin trao đổi với HV', G.care],
  [39, 'enr.callback_note', 'Lịch hẹn gọi', G.care],
  [40, 'enr.hot_issue_note', 'Điểm nóng', G.care],
  [41, 'care.1', 'Nội dung chăm sóc sau buổi 1', G.care],
  [42, 'care.3', 'Nội dung chăm sóc sau buổi 3', G.care],
  [43, 'care.10', 'Nội dung chăm sóc sau buổi 10', G.care],
  [44, 'care.15', 'Nội dung chăm sóc sau buổi 15', G.care],
  [45, 'care.20', 'Nội dung chăm sóc sau buổi 20', G.care],
  [46, 'care.25', 'Nội dung chăm sóc sau buổi 25', G.care],
  [47, 'care.29', 'Nội dung chăm sóc sau buổi 29', G.care],
  [48, 'care.30', 'Nội dung chăm sóc sau buổi 30', G.care],
  [49, 'care.35', 'Nội dung chăm sóc sau buổi 35', G.care],
  [50, 'care.45', 'Nội dung chăm sóc sau buổi 45', G.care],
  [51, 'care.55', 'Nội dung chăm sóc sau buổi 55', G.care],
  [52, 'care.59', 'Nội dung chăm sóc sau buổi 59', G.care],
  [53, 'care.60', 'Nội dung chăm sóc sau buổi 60', G.care],
  [54, 'care.89', 'Nội dung chăm sóc sau buổi 89', G.care],
  [55, 'care.90', 'Nội dung chăm sóc sau buổi 90', G.care],
  [56, 'enr.post_course_care', 'Chăm sóc sau kết thúc', G.care],
  [57, 'enr.end_date_mirror', 'Ngày kết thúc (cột phụ)', G.class, NO_DB],
  [58, 'enr.handed_over_at', 'Ngày bàn giao', G.profile],
  [59, 'enr.paid_month', 'Tháng nộp học phí', G.profile],
  [60, 'enr.account_created_at', 'Ngày tạo tài khoản', G.profile],
]);

/* ---------------------- KAIWA: 3.Chấm buổi (28) ---------------------- */

const KAIWA_ATTENDANCE_COLS = buildCols([
  [1, 'student.external_id', 'ID', G.profile, { isKey: true }],
  [2, 'student.full_name', 'Họ tên HV', G.profile],
  [3, 'pkg.code', 'Gói học', G.profile],
  [4, 'enr.course_content', 'Nội dung khoá', G.profile],
  [5, 'enr.total_sessions', 'Tổng số buổi', G.class],
  [6, 'enr.course_teacher_type', 'Khoá học', G.class],
  [7, 'student.email', 'Email', G.profile],
  [8, 'enr.class_model', 'Mô hình', G.class],
  [9, 'stats.remaining_sessions', 'Số buổi còn lại', G.attendance, { isFormulaPreserved: true }],
  [10, 'enr.start_date', 'Ngày bắt đầu học', G.class],
  [11, 'enr.status_label', 'Trạng thái', G.class],
  [12, 'enr.end_date', 'Ngày kết thúc/Bảo lưu', G.class],
  [13, 'schedule.start_time', 'Giờ học (1)', G.class],
  [14, 'schedule.schedule_pattern', 'Lịch học (1)', G.class],
  [15, 'schedule.duration_minutes', 'Thời lượng buổi học (1)', G.class],
  [16, 'keep.start_time_2', 'Giờ học (2)', G.class, NO_DB],
  [17, 'keep.schedule_pattern_2', 'Lịch học (2)', G.class, NO_DB],
  [18, 'keep.duration_minutes_2', 'Thời lượng buổi học (2)', G.class, NO_DB],
  [19, 'keep.loop_pattern', 'Vòng lặp', G.class, NO_DB],
  [20, 'keep.study_days_note', 'Ngày học', G.class, NO_DB],
  [21, 'teacher.name', 'Giáo viên', G.class],
  [22, 'teacher.code', 'Mã GV', G.class],
  [23, 'class.class_name', 'Tên lớp', G.class],
  [24, 'stats.attended_all_time', 'Tổng số buổi đã học', G.attendance, { isFormulaPreserved: true }],
  [25, 'stats.attended_current_year', 'Tổng số buổi đã học (năm)', G.attendance, { isFormulaPreserved: true }],
  [26, 'stats.absent_a', 'Tổng số buổi HV nghỉ có phép', G.attendance, { isFormulaPreserved: true }],
  [27, 'stats.absent_c', 'Tổng số buổi HV nghỉ không phép', G.attendance, { isFormulaPreserved: true }],
  [28, 'stats.teacher_d', 'Tổng số buổi GV nghỉ', G.attendance, { isFormulaPreserved: true }],
]);

/* ------------------- JLPT: Data JLPT_Inhouse (52) -------------------- */

const JLPT_PROFILE_COLS = buildCols([
  [1, 'student.external_id', 'ID', G.profile, { isKey: true }],
  [2, 'enr.sale_name', 'Sale', G.profile],
  [3, 'enr.student_source_status', 'Tình trạng', G.profile],
  [4, 'enr.paid_at', 'Ngày nộp học phí', G.profile],
  [5, 'student.full_name', 'Họ tên HV', G.profile],
  [6, 'student.gender', 'Giới tính', G.profile],
  [7, 'student.phone', 'SĐT', G.profile],
  [8, 'student.email', 'Email', G.profile],
  [9, 'enr.class_model', 'Mã gói', G.profile],
  [10, 'enr.level', 'Gói SP', G.profile],
  [11, 'meta.tuition_fee', 'Học phí thực nộp', G.profile],
  [12, 'enr.payment_status', 'Trạng thái thanh toán', G.profile],
  [13, 'enr.sales_note', 'Ghi chú', G.profile],
  [14, 'meta.expected_start_date', 'Ngày khai giảng dự kiến', G.class],
  [15, 'meta.active_state', 'Tình trạng', G.class],
  [16, 'cvht.staff_code', 'CVHT', G.class],
  [17, 'pkg.code', 'Mã khóa học', G.profile],
  [18, 'enr.start_date', 'Ngày bắt đầu học', G.class],
  [19, 'enr.status_label', 'Trạng thái', G.class],
  [20, 'schedule.start_time', 'Giờ học', G.class],
  [21, 'schedule.schedule_pattern', 'Buổi học', G.class],
  [22, 'teacher.name', 'Giáo viên', G.class],
  [23, 'class.class_code', 'Mã lớp', G.class],
  [24, 'class.class_name', 'Tên lớp', G.class],
  [25, 'enr.exchange_info', 'Tóm tắt chung thông tin trao đổi', G.care],
  [26, 'enr.callback_note', 'Lịch hẹn tái chăm ( để lọc)', G.care],
  [27, 'meta.satisfaction_score_b18', 'Điểm hài lòng của học viên ( buổi 18)', G.care],
  [28, 'meta.exam_score', 'Điểm thi thật', G.exam],
  [29, 'meta.exam_result', 'Tình trạng thi thật', G.exam],
  [30, 'enr.hot_issue_note', 'Điểm nóng', G.care],
  [31, 'care.1', 'Nội dung chăm sóc sau buổi 1', G.care],
  [32, 'care.15', 'Nội dung chăm sóc sau buổi 15', G.care],
  [33, 'care.25', 'Nội dung chăm sóc sau buổi 25', G.care],
  [34, 'care.30', 'Nội dung chăm sóc sau buổi 30', G.care],
  [35, 'care.35', 'Nội dung chăm sóc sau buổi 35', G.care],
  [36, 'care.40', 'Nội dung chăm sóc cuối khóa', G.care],
  [37, 'enr.post_course_care', 'Chăm sóc sau khi khóa học kết thúc', G.care],
  [38, 'test.1', 'Kiểm tra lần 1', G.exam],
  [39, 'test.2', 'Kiểm tra lần 2', G.exam],
  [40, 'test.3', 'Kiểm tra lần 3', G.exam],
  [41, 'test.4', 'Kiểm tra lần 4', G.exam],
  [42, 'test.5', 'Kiểm tra lần 5', G.exam],
  [43, 'test.6', 'Kiểm tra lần 6', G.exam],
  [44, 'test.7', 'Kiểm tra lần 7', G.exam],
  [45, 'special.1', 'HT đặc biệt lần 1', G.exam],
  [46, 'special.2', 'HT đặc biệt lần 2', G.exam],
  [47, 'special.3', 'HT đặc biệt lần 3', G.exam],
  [48, 'meta.renewal_note', 'Tái tục', G.care],
  [49, 'meta.latest_class_code', 'Mã lớp gần nhất', G.class],
  [50, 'enr.paid_month_year', 'Tháng nộp học phí', G.profile],
  [51, 'meta.exam_registration', 'Tình trạng đăng ký thi', G.exam],
  [52, 'meta.exam_status_final', 'Tình trạng thi', G.exam],
]);

/* ----------------------- JLPT: Chấm buổi (12) ------------------------ */

const JLPT_ATTENDANCE_COLS = buildCols([
  [1, 'class.class_code', 'Mã lớp', G.class, { isKey: true }],
  [2, 'student.external_id', 'ID học viên', G.profile, { isKey: true }],
  [3, 'student.full_name', 'Tên học viên', G.profile],
  [4, 'enr.status_label', 'Trạng thái', G.class],
  [5, 'schedule.start_time', 'Giờ học', G.class],
  [6, 'keep.col_f', 'Cột phụ F (ẩn)', G.class, { ...NO_DB, enabled: false }],
  [7, 'cvht.staff_code', 'CVHT', G.class],
  [8, 'schedule.schedule_pattern', 'Lịch học', G.class],
  [9, 'schedule.duration_minutes', 'Thời lượng buổi học', G.class],
  [10, 'teacher.code', 'Mã GV', G.class],
  [11, 'enr.total_sessions', 'Tổng số buổi', G.class],
  [12, 'stats.attended_all_time', 'Số buổi đã học', G.attendance, { isFormulaPreserved: true }],
]);

/* -------------------- TEACHER: 2026 スケジュール (6) ------------------ */

const TEACHER_ATTENDANCE_COLS = buildCols([
  [1, 'teacher_sheet.class_model', 'Mô hình lớp', G.class],
  [2, 'student.external_id', 'Mã học viên/Mã lớp', G.profile, { isKey: true }],
  [3, 'student.full_name', 'Họ tên học viên', G.profile],
  [4, 'enr.total_sessions', 'Tổng số buổi', G.class],
  [5, 'stats.remaining_sessions', 'Số buổi còn lại', G.attendance, { isFormulaPreserved: true }],
  [6, 'schedule.time_range', 'Thời gian', G.class],
]);

export function getTeacherAttendanceColumnMapping(): SheetColumnMappingConfig {
  return {
    sheetKind: 'attendance',
    defaultSheetName: '2026 スケジュール',
    headerRow: 2,
    firstDataRow: 3,
    columns: TEACHER_ATTENDANCE_COLS.map((c) => ({ ...c })),
  };
}

export function getFinalAttendanceColumnMapping(): SheetColumnMappingConfig {
  return {
    sheetKind: 'attendance',
    defaultSheetName: 'Điểm danh chốt',
    headerRow: 2,
    firstDataRow: 3,
    columns: JLPT_ATTENDANCE_COLS.map((c) => ({ ...c })),
  };
}

/* ------------------------- Default config map ------------------------ */

function programDefaults(programType: BackupProgramType): ProgramColumnMappingConfig {
  if (programType === 'KAIWA') {
    return {
      programType: 'KAIWA',
      profile: {
        sheetKind: 'profile',
        defaultSheetName: '1.Chăm sóc',
        headerRow: 3,
        firstDataRow: 4,
        columns: KAIWA_PROFILE_COLS.map((c) => ({ ...c })),
      },
      attendance: {
        sheetKind: 'attendance',
        defaultSheetName: '3.Chấm buổi',
        headerRow: 2,
        firstDataRow: 3,
        columns: KAIWA_ATTENDANCE_COLS.map((c) => ({ ...c })),
      },
    };
  }
  return {
    programType: 'JLPT',
    profile: {
      sheetKind: 'profile',
      defaultSheetName: 'Data JLPT_Inhouse',
      headerRow: 2,
      firstDataRow: 3,
      columns: JLPT_PROFILE_COLS.map((c) => ({ ...c })),
    },
    attendance: {
      sheetKind: 'attendance',
      defaultSheetName: 'Chấm buổi',
      headerRow: 2,
      firstDataRow: 3,
      columns: JLPT_ATTENDANCE_COLS.map((c) => ({ ...c })),
    },
  };
}

export function getDefaultGlobalBackupColumnConfig(): GlobalBackupColumnConfigMap {
  return {
    KAIWA: programDefaults('KAIWA'),
    JLPT: programDefaults('JLPT'),
  };
}

/* ------------------------ Validation helpers ------------------------- */

function normalizeColumnSet(defaults: SheetColumnMappingConfig, stored?: Partial<SheetColumnMappingConfig>): SheetColumnMappingConfig {
  const byFieldKey = new Map<string, SheetColumnConfigItem>();
  for (const col of stored?.columns || []) {
    if (col && typeof col.fieldKey === 'string') byFieldKey.set(col.fieldKey, col);
  }

  const columns: SheetColumnConfigItem[] = defaults.columns.map((def) => {
    const saved = byFieldKey.get(def.fieldKey);
    const rawCol = saved && Number.isFinite(Number(saved.col)) ? Number(saved.col) : def.defaultCol;
    const col = Math.max(1, Math.min(200, Math.round(rawCol)));
    return {
      ...def,
      ...(saved || {}),
      fieldKey: def.fieldKey,
      title: typeof saved?.title === 'string' && saved.title.trim() ? saved.title : def.title,
      group: typeof saved?.group === 'string' && saved.group.trim() ? saved.group : def.group,
      defaultCol: def.defaultCol,
      col,
      colLetter: colNumberToLetter(col),
      enabled: saved?.enabled === undefined ? def.enabled : Boolean(saved.enabled),
      hasDbSource: def.hasDbSource,
      isKey: def.isKey,
      isFormulaPreserved: def.isFormulaPreserved,
    };
  });

  for (const saved of byFieldKey.values()) {
    if (defaults.columns.some((d) => d.fieldKey === saved.fieldKey)) continue;
    const col = Math.max(1, Math.min(200, Math.round(Number(saved.col) || saved.defaultCol || 1)));
    columns.push({ ...saved, col, colLetter: colNumberToLetter(col), defaultCol: saved.defaultCol || col });
  }

  const headerRow = Number.isFinite(Number(stored?.headerRow)) && Number(stored?.headerRow) >= 1
    ? Math.round(Number(stored!.headerRow))
    : defaults.headerRow;

  return {
    sheetKind: defaults.sheetKind,
    defaultSheetName:
      typeof stored?.defaultSheetName === 'string' && stored.defaultSheetName.trim()
        ? stored.defaultSheetName.trim()
        : defaults.defaultSheetName,
    headerRow,
    firstDataRow: headerRow + 1,
    columns,
  };
}

function normalizeProgramConfig(stored: Partial<ProgramColumnMappingConfig> | undefined, programType: BackupProgramType): ProgramColumnMappingConfig {
  const defaults = programDefaults(programType);
  return {
    programType,
    profile: normalizeColumnSet(defaults.profile, stored?.profile),
    attendance: normalizeColumnSet(defaults.attendance, stored?.attendance),
  };
}

function normalizeGlobalConfig(stored: Partial<GlobalBackupColumnConfigMap> | undefined | null): GlobalBackupColumnConfigMap {
  return {
    KAIWA: normalizeProgramConfig(stored?.KAIWA, 'KAIWA'),
    JLPT: normalizeProgramConfig(stored?.JLPT, 'JLPT'),
    updatedAt: typeof stored?.updatedAt === 'string' ? stored.updatedAt : undefined,
  };
}

export function findDuplicateEnabledCols(cfg: ProgramColumnMappingConfig): Array<{ sheetKind: BackupSheetKind; col: number; fieldKeys: string[] }> {
  const dupes: Array<{ sheetKind: BackupSheetKind; col: number; fieldKeys: string[] }> = [];
  for (const sheet of [cfg.profile, cfg.attendance]) {
    const seen = new Map<number, string[]>();
    for (const c of sheet.columns) {
      if (!c.enabled || isKeepFieldKey(c.fieldKey)) continue;
      const bucket = seen.get(c.col);
      if (bucket) bucket.push(c.fieldKey);
      else seen.set(c.col, [c.fieldKey]);
    }
    for (const [col, fieldKeys] of seen) {
      if (fieldKeys.length > 1) dupes.push({ sheetKind: sheet.sheetKind, col, fieldKeys });
    }
  }
  return dupes;
}

export function getEnabledColumns(sheet: SheetColumnMappingConfig): SheetColumnConfigItem[] {
  return sheet.columns.filter((c) => c.enabled && !isKeepFieldKey(c.fieldKey));
}

export function validateGlobalBackupColumnConfig(input: GlobalBackupColumnConfigMap): void {
  for (const programType of ['KAIWA', 'JLPT'] as BackupProgramType[]) {
    const cfg = input[programType];
    if (!cfg) throw new AppError(400, `Thiếu cấu hình cột cho chương trình ${programType}`);
    for (const sheet of [cfg.profile, cfg.attendance]) {
      if (!sheet || !Array.isArray(sheet.columns)) {
        throw new AppError(400, `Cấu hình sheet ${programType}.${sheet?.sheetKind || '?'} thiếu danh sách cột`);
      }
      for (const c of sheet.columns) {
        if (!c.fieldKey) throw new AppError(400, `Cột thiếu fieldKey (${programType}.${sheet.sheetKind})`);
        if (!Number.isInteger(c.col) || c.col < 1 || c.col > 200) {
          throw new AppError(400, `Vị trí cột không hợp lệ cho "${c.title || c.fieldKey}" (col=${c.col}, phải 1..200)`);
        }
      }
    }
    const dupes = findDuplicateEnabledCols(cfg);
    if (dupes.length) {
      const d = dupes[0];
      throw new AppError(400, `Trùng vị trí cột ${colNumberToLetter(d.col)} giữa ${d.fieldKeys.join(', ')} (${programType}.${d.sheetKind})`);
    }
  }
}

/* --------------------------- AppSetting IO --------------------------- */

export async function getGlobalBackupColumnConfig(): Promise<GlobalBackupColumnConfigMap> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: BACKUP_COLUMN_CONFIG_SETTING_KEY } });
    if (!row || !row.value) return getDefaultGlobalBackupColumnConfig();
    return normalizeGlobalConfig(row.value as Partial<GlobalBackupColumnConfigMap>);
  } catch (err: any) {
    log.warn('Không đọc được cấu hình cột từ AppSetting, dùng mặc định', { error: err?.message });
    return getDefaultGlobalBackupColumnConfig();
  }
}

function toStoredShape(input: GlobalBackupColumnConfigMap): Prisma.InputJsonValue {
  const strip = (sheet: SheetColumnMappingConfig) => ({
    sheetKind: sheet.sheetKind,
    defaultSheetName: sheet.defaultSheetName,
    headerRow: sheet.headerRow,
    firstDataRow: sheet.firstDataRow,
    columns: sheet.columns.map((c) => ({
      fieldKey: c.fieldKey,
      title: c.title,
      group: c.group,
      defaultCol: c.defaultCol,
      col: c.col,
      colLetter: c.colLetter,
      enabled: c.enabled,
      hasDbSource: c.hasDbSource,
      ...(c.isKey ? { isKey: true } : {}),
      ...(c.isFormulaPreserved ? { isFormulaPreserved: true } : {}),
    })),
  });
  const payload: Record<string, unknown> = {
    KAIWA: { programType: 'KAIWA', profile: strip(input.KAIWA.profile), attendance: strip(input.KAIWA.attendance) },
    JLPT: { programType: 'JLPT', profile: strip(input.JLPT.profile), attendance: strip(input.JLPT.attendance) },
    updatedAt: new Date().toISOString(),
  };
  return payload as unknown as Prisma.InputJsonValue;
}

export async function saveGlobalBackupColumnConfig(
  input: Partial<GlobalBackupColumnConfigMap>,
  userId?: number
): Promise<GlobalBackupColumnConfigMap> {
  const current = await getGlobalBackupColumnConfig();
  const mergedRaw: Partial<GlobalBackupColumnConfigMap> = {
    KAIWA: (input.KAIWA as ProgramColumnMappingConfig) || current.KAIWA,
    JLPT: (input.JLPT as ProgramColumnMappingConfig) || current.JLPT,
  };
  const merged = normalizeGlobalConfig(mergedRaw);
  validateGlobalBackupColumnConfig(merged);

  await prisma.appSetting.upsert({
    where: { key: BACKUP_COLUMN_CONFIG_SETTING_KEY },
    update: { value: toStoredShape(merged), updated_by_id: userId || null },
    create: {
      key: BACKUP_COLUMN_CONFIG_SETTING_KEY,
      value: toStoredShape(merged),
      updated_by_id: userId || null,
    },
  });
  log.info('Đã lưu cấu hình cột backup toàn cục', { userId: userId || null });
  return merged;
}

export async function resetGlobalBackupColumnConfig(
  programType?: string | null,
  userId?: number
): Promise<GlobalBackupColumnConfigMap> {
  const current = await getGlobalBackupColumnConfig();
  const program = String(programType || '').trim().toUpperCase();
  const next: GlobalBackupColumnConfigMap = {
    KAIWA: program === 'KAIWA' || !program ? programDefaults('KAIWA') : current.KAIWA,
    JLPT: program === 'JLPT' || !program ? programDefaults('JLPT') : current.JLPT,
  };
  await prisma.appSetting.upsert({
    where: { key: BACKUP_COLUMN_CONFIG_SETTING_KEY },
    update: { value: toStoredShape(next), updated_by_id: userId || null },
    create: { key: BACKUP_COLUMN_CONFIG_SETTING_KEY, value: toStoredShape(next), updated_by_id: userId || null },
  });
  log.info('Đã khôi phục cấu hình cột mặc định', { programType: program || 'ALL', userId: userId || null });
  return getGlobalBackupColumnConfig();
}

/* ------------------------------ Resolver ------------------------------ */

export interface BackupMonthStats {
  attendedCurrentYear: number;
  attendedAllTime: number;
  remainingSessions: number;
  absentACount: number;
  leaveBCount: number;
  absentCCount: number;
  teacherDCount: number;
  techErrorECount: number;
}

export interface BackupRowResolveContext {
  student: any;
  enrollment: any;
  pkg: any;
  cls: any;
  schedule: any;
  teacher: any;
  csStaffCode: string | null;
  maskSensitiveData: boolean;
  stats: BackupMonthStats;
  careByMilestone: Map<number, string>;
}

/** Giá trị mới nhất cho mỗi mốc buổi (after_session_number) — log mới thắng. */
export function buildCareMilestoneMap(
  careLogs: Array<{ after_session_number?: number | null; content?: string | null; created_at?: Date | string | null }>
): Map<number, string> {
  const map = new Map<number, string>();
  const sorted = [...(careLogs || [])].sort((a, b) => {
    const ta = a?.created_at ? new Date(a.created_at as any).getTime() : 0;
    const tb = b?.created_at ? new Date(b.created_at as any).getTime() : 0;
    return ta - tb;
  });
  for (const logRow of sorted) {
    const n = Number(logRow?.after_session_number);
    if (!Number.isInteger(n) || n <= 0) continue;
    const content = String(logRow?.content || '').trim();
    if (!content) continue;
    map.set(n, content);
  }
  return map;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtDate(val: unknown): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(String(val));
  if (isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function fmtMonth(val: unknown): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(String(val));
  if (isNaN(d.getTime())) return '';
  return String(d.getUTCMonth() + 1);
}

function fmtMonthYear(val: unknown): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(String(val));
  if (isNaN(d.getTime())) return '';
  return `${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function fmtGender(gender?: string | null): string {
  const g = String(gender || '').trim().toLowerCase();
  if (!g) return '';
  if (g.startsWith('n') && (g.includes('am') || g === 'nam' || g === 'm' || g === 'male')) return 'Nam';
  if (g === 'nu' || g.startsWith('nữ') || g.startsWith('女') || g === 'female' || g === 'f' || g.startsWith('nữ')) return 'Nữ';
  if (g === 'female') return 'Nữ';
  return String(gender || '').trim();
}

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  STUDYING: 'Đang học',
  WAITING_CLASS: 'Chờ lớp',
  PAUSED: 'Bảo lưu',
  FINISHED: 'Kết thúc',
  UPCOMING: 'Sắp học',
  NOT_STARTED: 'Chưa học',
  CANCELLED: 'Đã hủy',
};

function fmtStatusLabel(status?: string | null): string {
  return ENROLLMENT_STATUS_LABELS[String(status || '').toUpperCase()] || 'Đang học';
}

function maskPhone(phone?: string | null, mask = false): string {
  const trimmed = String(phone || '').trim();
  if (!trimmed) return '';
  if (!mask || trimmed.length < 6) return trimmed;
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-3)}`;
}

function maskEmail(email?: string | null, mask = false): string {
  const trimmed = String(email || '').trim();
  if (!trimmed) return '';
  if (!mask || !trimmed.includes('@')) return trimmed;
  const [local, domain] = trimmed.split('@');
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function metaValue(enrollment: any, key: string): unknown {
  const meta = enrollment?.program_metadata;
  if (!meta || typeof meta !== 'object') return null;
  const record = meta as Record<string, unknown>;
  if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  return null;
}

function fmtTeacherClassModel(cls: any, enr: any): string {
  const rawModel = String(cls?.model_type || enr?.class_model || '').toUpperCase();
  if (rawModel.includes('1:2') || rawModel.includes('1-2') || rawModel === 'ONE_TO_TWO') return '1-2';
  if (rawModel.includes('1:N') || rawModel.includes('1-N') || rawModel === 'ONE_TO_N') return '1-n';
  return '1-1';
}

function fmtScheduleTimeRange(schedule: any): string {
  const start = String(schedule?.start_time || '').trim();
  if (!start) return '';
  if (start.includes('-')) return start;
  const match = start.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return start;
  const dur = Number(schedule?.duration_minutes) || 30;
  const totalMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + dur;
  const endH = Math.floor((totalMin % 1440) / 60);
  const endM = totalMin % 60;
  return `${pad2(parseInt(match[1], 10))}:${match[2]} - ${pad2(endH)}:${pad2(endM)}`;
}

export function resolveBackupFieldValue(
  fieldKey: string,
  ctx: BackupRowResolveContext
): { value: string | number; hasValue: boolean } {
  const none = { value: '', hasValue: false } as const;
  const key = String(fieldKey || '').trim();
  if (!key || isKeepFieldKey(key)) return none;

  const { student, enrollment: enr, pkg, cls, schedule, teacher, csStaffCode, maskSensitiveData, stats, careByMilestone } = ctx;

  const ok = (value: string | number): { value: string | number; hasValue: boolean } => ({ value, hasValue: true });
  const okText = (raw: unknown): { value: string | number; hasValue: boolean } => {
    if (raw === null || raw === undefined) return none;
    const text = typeof raw === 'object' ? (raw as any).toString?.() ?? '' : String(raw);
    const trimmed = (text || '').trim();
    return trimmed ? ok(trimmed) : none;
  };

  // --- student ---
  switch (key) {
    case 'student.external_id': return okText(student?.external_id ?? enr?.external_id);
    case 'student.full_name': return okText(student?.full_name);
    case 'student.gender': { const g = fmtGender(student?.gender); return g ? ok(g) : none; }
    case 'student.phone': { const p = maskPhone(student?.phone, maskSensitiveData); return p ? ok(p) : none; }
    case 'student.email': { const e = maskEmail(student?.email, maskSensitiveData); return e ? ok(e) : none; }
    case 'student.date_of_birth': { const d = fmtDate(student?.date_of_birth); return d ? ok(d) : none; }
    case 'student.occupation': return okText(student?.occupation);

    // --- enrollment ---
    case 'enr.paid_at': { const d = fmtDate(enr?.paid_at); return d ? ok(d) : none; }
    case 'enr.sale_name': return okText(enr?.sale_name ?? enr?.sale?.name);
    case 'enr.student_source_status': return okText(enr?.student_source_status);
    case 'enr.course_content': return okText(enr?.course_content);
    case 'enr.payment_status': return okText(enr?.payment_status);
    case 'enr.course_teacher_type': return okText(enr?.course_teacher_type);
    case 'enr.level': return okText(enr?.level);
    case 'enr.total_sessions': return enr?.total_sessions === null || enr?.total_sessions === undefined ? none : ok(Number(enr.total_sessions));
    case 'enr.class_model': return okText(enr?.class_model);
    case 'enr.sales_note': return okText(enr?.sales_note);
    case 'enr.start_date': { const d = fmtDate(enr?.start_date); return d ? ok(d) : none; }
    case 'enr.status_label': return ok(fmtStatusLabel(enr?.status));
    case 'enr.end_date': { const d = fmtDate(enr?.end_date); return d ? ok(d) : none; }
    case 'enr.end_date_mirror': { const d = fmtDate(enr?.end_date); return d ? ok(d) : none; }
    case 'enr.paid_month': { const m = fmtMonth(enr?.paid_at); return m ? ok(m) : none; }
    case 'enr.paid_month_year': { const m = fmtMonthYear(enr?.paid_at); return m ? ok(m) : none; }
    case 'enr.handed_over_at': { const d = fmtDate(enr?.handed_over_at ?? enr?.paid_at); return d ? ok(d) : none; }
    case 'enr.account_created_at': { const d = fmtDate(enr?.account_created_at ?? enr?.created_at); return d ? ok(d) : none; }
    case 'enr.study_report_url': return okText(enr?.study_report_url);
    case 'enr.exchange_info': return okText(enr?.exchange_info);
    case 'enr.callback_note': return okText(enr?.callback_note);
    case 'enr.hot_issue_note': return okText(enr?.hot_issue_note);
    case 'enr.post_course_care': return okText(enr?.post_course_care);
    case 'enr.attended_previous_years': return ok(Number(enr?.attended_previous_years ?? 0));

    // --- package / class / schedule / teacher / cvht ---
    case 'pkg.code': return okText(pkg?.code);
    case 'class.class_code': return okText(cls?.class_code ?? cls?.class_name);
    case 'class.class_name': return okText(cls?.class_name ?? cls?.class_code);
    case 'schedule.start_time': return okText(schedule?.start_time);
    case 'schedule.time_range': { const tr = fmtScheduleTimeRange(schedule); return tr ? ok(tr) : none; }
    case 'schedule.schedule_pattern': return okText(schedule?.schedule_pattern);
    case 'schedule.duration_minutes':
      return schedule?.duration_minutes === null || schedule?.duration_minutes === undefined ? none : ok(Number(schedule.duration_minutes));
    case 'teacher.name': return okText(teacher?.name);
    case 'teacher.code': return okText(teacher?.code ?? teacher?.name);
    case 'cvht.staff_code': return okText(csStaffCode);
    case 'teacher_sheet.class_model': return ok(fmtTeacherClassModel(cls, enr));

    // --- stats ---
    case 'stats.attended_current_year': return ok(Number(stats?.attendedCurrentYear ?? 0));
    case 'stats.attended_all_time': return ok(Number(stats?.attendedAllTime ?? 0));
    case 'stats.remaining_sessions': return ok(Number(stats?.remainingSessions ?? 0));
    case 'stats.absent_a': return ok(Number(stats?.absentACount ?? 0));
    case 'stats.absent_c': return ok(Number(stats?.absentCCount ?? 0));
    case 'stats.teacher_d': return ok(Number(stats?.teacherDCount ?? 0));
    default:
      break;
  }

  // --- care.N (fallback milestone: 29<-27 Kaiwa, 45<-40 JLPT) ---
  if (key.startsWith('care.')) {
    const n = Number(key.slice(5));
    if (!Number.isFinite(n)) return none;
    let content = careByMilestone?.get(n);
    if (!content && n === 29) content = careByMilestone?.get(27);
    if (!content && n === 45) content = careByMilestone?.get(40);
    return content ? ok(content) : none;
  }

  // --- test.N / special.N (program_metadata.test_scores / special_support) ---
  if (key.startsWith('test.') || key.startsWith('special.')) {
    const isTest = key.startsWith('test.');
    const n = Number(isTest ? key.slice(5) : key.slice(8));
    if (!Number.isFinite(n) || n < 1) return none;
    const bucket = metaValue(enr, isTest ? 'test_scores' : 'special_support') as Record<string, unknown> | null;
    if (!bucket) return none;
    return okText(bucket[`l${n}`] ?? bucket[String(n)] ?? bucket[`${isTest ? 'lan' : 'ht'}${n}`]);
  }

  // --- meta.<key> ---
  if (key.startsWith('meta.')) {
    const raw = metaValue(enr, key.slice(5));
    if (raw === null) return none;
    if (raw instanceof Date || typeof raw === 'number') return okText(raw);
    if (typeof raw === 'object') {
      try { return ok(JSON.stringify(raw)); } catch { return none; }
    }
    return okText(raw);
  }

  log.warn('fieldKey không được engine hỗ trợ (bỏ qua ô)', { fieldKey: key });
  return none;
}
