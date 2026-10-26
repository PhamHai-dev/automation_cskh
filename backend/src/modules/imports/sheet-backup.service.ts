/**
 * SheetBackupService - backup ĐIỂM DANH từ WEB về Google Sheet / file Excel.
 * -----------------------------------------------------------------------------
 * Một config = một (CSKH x chương trình JLPT|KAIWA). Đích là sheet `Chấm buổi`
 * (JLPT) hoặc `3.Chấm buổi` (KAIWA). Không còn backup sheet hồ sơ `1.Chăm sóc`.
 *
 * Pipeline runBackupForConfig():
 *   1. Nạp enrollment của CSKH + chương trình (kèm lớp, lịch, buổi học, điểm danh).
 *   2. Baseline workbook = file backup local nếu còn hợp lệ, ngược lại trích
 *      template từ docs/data/hoc_vien/hoc_vien_jlpt.xlsx (giữ row 1 / row 2 +
 *      công thức dòng mẫu).
 *   3. Với từng block tháng (lọc theo backup_year / opts.year) tính giá trị ô,
 *      diff từng ô -> updatedCellsCount, attendanceCellsWritten.
 *   4. Ghi file local, rồi (nếu có Google Sheet đích) verify bảo mật + push delta.
 *   5. last_status / last_summary / last_backup_at + AuditLog CS_PROGRAM_BACKUP.
 *
 * DEVIATIONS so sánh với layout gốc của template `Chấm buổi`:
 *   - Cột A (header gốc "Mã lớp") được engine dùng làm KHOÁ DÒNG và ghi MÃ HỌC
 *     VIÊN; mã lớp ghi ở cột C. Tiêu đề 12 cột cố định được engine ghi lại khi
 *     tạo file mới nên sheet luôn tự giải thích (xem FIXED_HEADERS).
 *   - Các cột tổng kết tháng (Số buổi đã học / A / B / C / D / E) giữ nguyên công
 *     thức của dòng mẫu khi có, chỉ cập nhật cached result.
 * -----------------------------------------------------------------------------
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import cron from 'node-cron';
import {
  AttendanceStatus,
  EnrollmentStatus,
  ImportBatchStatus,
  ImportType,
  Prisma,
} from '@prisma/client';

import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';
import { ImportsService } from './imports.service';
import { SheetSyncService, ServiceAccountInfo } from './sheet-sync.service';
import {
  AttendanceMonthBlock,
  AttendanceSummaryCols,
  colNumberToLetter,
  dateKeyLocal,
  dateKeyUtc,
  detectJlptMonthBlocks,
  detectSheetYears,
  GoogleSafeValue,
  loadOrExtractProgramWorkbook,
  normalizeCellComparable,
  pushDeltaToGoogleSheet,
  readTemplateAttendanceWorksheet,
  setCellValuePreservingFormula,
  toGoogleSafeValue,
  verifyTargetSpreadsheetSecurity,
} from './attendance-sheet.util';
import {
  BackupRowResolveContext,
  BackupMonthStats,
  GlobalBackupColumnConfigMap,
  ProgramColumnMappingConfig,
  SheetColumnConfigItem,
  SheetColumnMappingConfig,
  buildCareMilestoneMap,
  getEnabledColumns,
  getGlobalBackupColumnConfig,
  resetGlobalBackupColumnConfig,
  resolveBackupFieldValue,
  saveGlobalBackupColumnConfig,
} from './profile-sheet.util';

const log = createLogger('SheetBackupService');

export const PROGRAM_TYPES = ['JLPT', 'KAIWA'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const DEFAULT_SHEET_NAME_BY_PROGRAM: Record<string, string> = {
  JLPT: 'Chấm buổi',
  KAIWA: '3.Chấm buổi',
};

/** Sheet HỒ SƠ mặc định theo chương trình (cùng workbook backup 2 sheet). */
export const DEFAULT_PROFILE_SHEET_NAME_BY_PROGRAM: Record<string, string> = {
  JLPT: 'Data JLPT_Inhouse',
  KAIWA: '1.Chăm sóc',
};

export const DEFAULT_PROFILE_HEADER_ROW_BY_PROGRAM: Record<string, number> = {
  JLPT: 2,
  KAIWA: 3,
};

export function defaultProfileSheetFor(programType: string): string {
  return DEFAULT_PROFILE_SHEET_NAME_BY_PROGRAM[normalizeProgramType(programType)] || '1.Chăm sóc';
}

export function defaultProfileHeaderRowFor(programType: string): number {
  return DEFAULT_PROFILE_HEADER_ROW_BY_PROGRAM[normalizeProgramType(programType)] ?? 3;
}

export const DEFAULT_SCHEDULE_TIMES = ['12:00', '21:00'];

/**
 * Cột cố định của sheet "Chấm buổi" - theo ĐÚNG header gốc của template
 * (docs/data/hoc_vien/hoc_vien_jlpt.xlsx, row 2). Engine KHÔNG ghi đè header,
 * chỉ ghi data rows; bảng này được suy ra từ header gốc nên khi template đổi
 * layout thì chỉ cần cập nhật ở đây.
 *
 * Row 2 template: A=Mã lớp, B=ID học viên, C=Tên học viên, D=Trạng thái,
 * E=Giờ học, F=(ẩn), G=CVHT, H=Lịch học, I=Thời lượng buổi học, J=Mã GV,
 * K=Tổng số buổi, L=Số buổi đã học (công thức), M..=các block tháng.
 */
export const ATTENDANCE_COLS = {
  classCode: 1, // A - Mã lớp
  externalId: 2, // B - ID học viên  (khoá tra dòng trong sheet)
  fullName: 3, // C - Tên học viên
  status: 4, // D - Trạng thái
  startTime: 5, // E - Giờ học
  cvht: 7, // G - CVHT (mã CSKH phụ trách)
  schedulePattern: 8, // H - Lịch học
  durationMinutes: 9, // I - Thời lượng buổi học
  teacherCode: 10, // J - Mã GV
  totalSessions: 11, // K - Tổng số buổi
  attendedTotal: 12, // L - Số buổi đã học (CÔNG THỨC, chỉ cập nhật cached result)
} as const;

/** Những cột engine được phép ghi ở vùng cố định (L thuộc về công thức). */
const FIXED_WRITABLE_COLS: number[] = [
  ATTENDANCE_COLS.classCode,
  ATTENDANCE_COLS.externalId,
  ATTENDANCE_COLS.fullName,
  ATTENDANCE_COLS.status,
  ATTENDANCE_COLS.startTime,
  ATTENDANCE_COLS.cvht,
  ATTENDANCE_COLS.schedulePattern,
  ATTENDANCE_COLS.durationMinutes,
  ATTENDANCE_COLS.teacherCode,
  ATTENDANCE_COLS.totalSessions,
];

/** Cột cuối của vùng cố định (L) - block tháng đầu tiên bắt đầu sau cột này. */
const FIXED_LAST_COL = 12;

/** Nhãn header gốc của vùng cố định - chỉ dùng khi tạo file hoàn toàn mới. */
const TEMPLATE_FIXED_HEADERS: Record<number, string> = {
  [ATTENDANCE_COLS.classCode]: 'Mã lớp',
  [ATTENDANCE_COLS.externalId]: 'ID học viên',
  [ATTENDANCE_COLS.fullName]: 'Tên học viên',
  [ATTENDANCE_COLS.status]: 'Trạng thái',
  [ATTENDANCE_COLS.startTime]: 'Giờ học',
  [ATTENDANCE_COLS.cvht]: 'CVHT',
  [ATTENDANCE_COLS.schedulePattern]: 'Lịch học',
  [ATTENDANCE_COLS.durationMinutes]: 'Thời lượng buổi học',
  [ATTENDANCE_COLS.teacherCode]: 'Mã GV',
  [ATTENDANCE_COLS.totalSessions]: 'Tổng số buổi',
  [ATTENDANCE_COLS.attendedTotal]: 'Số buổi đã học',
};

/** Nhãn header gốc của 6 cột tổng kết trong mỗi block tháng. */
const SUMMARY_HEADERS: Record<string, string> = {
  attended: 'Số buổi đã học',
  absentA: 'Số buổi xin nghỉ có phép\nA',
  leaveB: 'Số buổi bảo lưu\nB',
  absentC: 'Số buổi nghỉ sai quy định\nC',
  teacherD: 'Số buổi GV xin nghỉ\nD',
  techErrorE: 'Số buổi lỗi kĩ thuật \nE',
};


/* --------------------------------- Types ---------------------------------- */

export interface ProgramBackupConfigItem {
  id: number;
  cs_user_id: number;
  program_type: string;
  name: string;
  target_spreadsheet_url: string | null;
  target_spreadsheet_id: string | null;
  local_backup_path: string | null;
  sheet_name: string;
  header_row: number;
  profile_sheet_name: string;
  profile_header_row: number;
  profile_enabled: boolean;
  schedule_times: string[];
  backup_year: number | null;
  enabled: boolean;
  require_private_sheet: boolean;
  mask_sensitive_data: boolean;
  last_backup_at: Date | null;
  last_status: string | null;
  last_summary: any;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
  cs_user: {
    id: number;
    name: string | null;
    email: string;
    staff_code: string | null;
  };
  student_counts: { total: number; attending: number };
  has_local_backup_file: boolean;
}

export interface UpdateProgramBackupConfigDTO {
  target_spreadsheet_url?: string | null;
  sheet_name?: string;
  header_row?: number;
  profile_sheet_name?: string;
  profile_header_row?: number;
  profile_enabled?: boolean;
  schedule_times?: string[];
  backup_year?: number | null;
  enabled?: boolean;
  require_private_sheet?: boolean;
  mask_sensitive_data?: boolean;
}

/** Stats delta của RIÊNG một sheet trong workbook 2 sheet. */
export interface SheetBackupStats {
  sheetName: string;
  totalEnrollments: number;
  unchangedRows: number;
  updatedRows: number;
  appendedRows: number;
  updatedCellsCount: number;
  attendanceCellsWritten?: number;
}

export interface ProgramBackupSummary {
  csUserId: number;
  staffCode: string | null;
  programType: string;
  status: 'SUCCESS' | 'FAILED';
  syncedToGoogleSheet: boolean;
  localFilePath: string;
  totalStudents: number;
  unchangedRows: number;
  updatedRows: number;
  appendedRows: number;
  updatedCellsCount: number;
  attendanceCellsWritten: number;
  yearFilter: number | null;
  backedUpAt: string;
  /** null khi profile_enabled = false. */
  profile?: SheetBackupStats | null;
  attendance?: SheetBackupStats | null;
}

export function normalizeProgramType(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

/**
 * 1-based Excel column -> `A1` style reference (used to translate the sample
 * formula row onto the row we are appending).
 */
function translateFormulaRow(formula: string, fromRow: number, toRow: number): string {
  return formula.replace(/([A-Z]{1,3})(\d+)/g, (whole, col, digits) => {
    const rowNum = parseInt(digits, 10);
    // Absolute row references ($3) are written as `A$3` by ExcelJS and never
    // appear in these formulas; relative refs must move with the target row.
    if (rowNum === fromRow) return `${col}${toRow}`;
    return whole;
  });
}

async function loadEnrollments(csUserId: number, programType: string) {
  return prisma.enrollment.findMany({
    where: { cs_id: csUserId, program_type: programType },
    include: {
      student: true,
      package: true,
      cs: { select: { id: true, name: true, staff_code: true } },
      // care_logs nuôi các cột "Nội dung chăm sóc sau buổi N" / "Kiểm tra lần N"
      care_logs: { orderBy: { created_at: 'asc' } },
      enrollment_classes: {
        include: {
          class: {
            include: {
              class_teachers: {
                include: { teacher: true },
                orderBy: { id: 'asc' },
              },
              class_schedules: { orderBy: { id: 'asc' } },
            },
          },
          attendance: {
            where: { deleted_at: null },
            include: { class_session: true },
          },
        },
        orderBy: { sequence_no: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  });
}

/* ----------------------------- Template years ------------------------------ */

/** Cached calendar years present in the source template (row 1 block labels). */
let templateYearsCache: Promise<number[]> | null = null;

async function getTemplateYears(): Promise<number[]> {
  if (!templateYearsCache) {
    templateYearsCache = (async () => {
      try {
        const { readTemplateAttendanceWorksheet } = await import('./attendance-sheet.util');
        const ws = await readTemplateAttendanceWorksheet();
        return detectSheetYears(ws);
      } catch (err: any) {
        log.warn('Không đọc được năm từ template, dùng dữ liệu DB', { error: err?.message });
        return [];
      }
    })();
  }
  return templateYearsCache;
}

/* --------------------------------- Service -------------------------------- */

export class SheetBackupService {
  private sheetSyncService: SheetSyncService;
  private importsService: ImportsService;

  constructor(sheetSyncService?: SheetSyncService, importsService?: ImportsService) {
    this.sheetSyncService = sheetSyncService || new SheetSyncService();
    this.importsService = importsService || new ImportsService();
  }

  /** Relative or absolute path -> absolute path (relative to process.cwd()). */
  public resolveLocalBackupPath(relativeOrAbsPath: string): string {
    if (path.isAbsolute(relativeOrAbsPath)) return relativeOrAbsPath;
    return path.resolve(process.cwd(), relativeOrAbsPath);
  }

  public defaultSheetNameFor(programType: string): string {
    return DEFAULT_SHEET_NAME_BY_PROGRAM[normalizeProgramType(programType)] || 'Chấm buổi';
  }

  public relativeBackupPathFor(staffLabel: string, programType: string): string {
    const slug = normalizeProgramType(programType).toLowerCase() || 'cham_buoi';
    return `backups/cskh/hoc_vien_${slug}_${staffLabel}.xlsx`;
  }

  /* --------------------------- A. Config bootstrap ----------------------- */

  /**
   * Đảm bảo mỗi CSKH đang hoạt động có đúng 2 config (JLPT + KAIWA).
   */
  public async ensureConfigs(): Promise<void> {
    const allUsers = await prisma.user.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
    const csUsers = allUsers.filter((u) => {
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      return roles.includes('CS') || Boolean(u.staff_code && u.staff_code.toUpperCase().startsWith('CVHT'));
    });

    const existing = await prisma.programSheetBackupConfig.findMany({
      select: { cs_user_id: true, program_type: true },
    });
    const seen = new Set(existing.map((c) => `${c.cs_user_id}::${normalizeProgramType(c.program_type)}`));

    for (const user of csUsers) {
      for (const program of PROGRAM_TYPES) {
        const key = `${user.id}::${program}`;
        if (seen.has(key)) continue;
        const staffLabel = user.staff_code || `CS${user.id}`;
        await prisma.programSheetBackupConfig
          .create({
            data: {
              cs_user_id: user.id,
              program_type: program,
              name: `Backup ${program} - ${user.staff_code || user.name || user.email}`,
              local_backup_path: this.relativeBackupPathFor(staffLabel, program),
              sheet_name: this.defaultSheetNameFor(program),
              header_row: 2,
              schedule_times: DEFAULT_SCHEDULE_TIMES as unknown as Prisma.InputJsonValue,
              enabled: true,
              require_private_sheet: true,
              mask_sensitive_data: false,
              last_status: 'IDLE',
            },
          })
          .then(async (created) => {
            await this.setProfileMetaRaw(created.id, {
              profile_sheet_name: defaultProfileSheetFor(program),
              profile_header_row: defaultProfileHeaderRowFor(program),
              profile_enabled: true,
            });
          })
          .catch(async (err: any) => {
            // Unique violation (row created concurrently) is expected and harmless.
            if (err?.code !== 'P2002') {
              log.warn('ensureConfigs: không tạo được config', {
                cs_user_id: user.id,
                program_type: program,
                error: err?.message || String(err),
              });
            }
          });
        seen.add(key);
      }
    }
  }

  /**
   * Đọc/ghi 3 cột profile_* qua raw SQL để tương thích cả khi Prisma client
   * runtime chưa được `prisma generate` lại trên máy đang chạy dev server.
   */
  private async loadProfileMetaMap(
    ids: number[]
  ): Promise<Map<number, { profile_sheet_name: string | null; profile_header_row: number | null; profile_enabled: number | boolean | null }>> {
    const map = new Map<
      number,
      { profile_sheet_name: string | null; profile_header_row: number | null; profile_enabled: number | boolean | null }
    >();
    if (!ids.length) return map;
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: number;
          profile_sheet_name: string | null;
          profile_header_row: number | null;
          profile_enabled: number | boolean | null;
        }>
      >(
        `SELECT id, profile_sheet_name, profile_header_row, profile_enabled FROM program_sheet_backup_configs WHERE id IN (${ids
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n))
          .join(',')})`
      );
      for (const r of rows || []) map.set(Number(r.id), r);
    } catch {
      /* fallback dùng default theo program_type */
    }
    return map;
  }

  private async setProfileMetaRaw(
    id: number,
    patch: { profile_sheet_name?: string; profile_header_row?: number; profile_enabled?: boolean }
  ): Promise<void> {
    try {
      if (patch.profile_sheet_name !== undefined) {
        await prisma.$executeRaw`UPDATE program_sheet_backup_configs SET profile_sheet_name = ${patch.profile_sheet_name} WHERE id = ${id}`;
      }
      if (patch.profile_header_row !== undefined) {
        await prisma.$executeRaw`UPDATE program_sheet_backup_configs SET profile_header_row = ${patch.profile_header_row} WHERE id = ${id}`;
      }
      if (patch.profile_enabled !== undefined) {
        const flag = patch.profile_enabled ? 1 : 0;
        await prisma.$executeRaw`UPDATE program_sheet_backup_configs SET profile_enabled = ${flag} WHERE id = ${id}`;
      }
    } catch (err: any) {
      log.warn('setProfileMetaRaw warning', { id, error: err?.message });
    }
  }

  /* ------------------------------- B. Listing ---------------------------- */

  private toConfigItem(
    cfg: any,
    counts: { total: number; attending: number },
    profileMeta?: { profile_sheet_name: string | null; profile_header_row: number | null; profile_enabled: number | boolean | null } | null
  ): ProgramBackupConfigItem {
    const program = normalizeProgramType(cfg.program_type);
    const relPath =
      cfg.local_backup_path ||
      this.relativeBackupPathFor(cfg.cs_user?.staff_code || `CS${cfg.cs_user_id}`, program);
    const scheduleTimes =
      Array.isArray(cfg.schedule_times) && cfg.schedule_times.length > 0
        ? (cfg.schedule_times as string[]).map(String)
        : [...DEFAULT_SCHEDULE_TIMES];

    return {
      id: cfg.id,
      cs_user_id: cfg.cs_user_id,
      program_type: program,
      name: cfg.name,
      target_spreadsheet_url: cfg.target_spreadsheet_url ?? null,
      target_spreadsheet_id: cfg.target_spreadsheet_id ?? null,
      local_backup_path: relPath.replace(/\\/g, '/'),
      sheet_name: cfg.sheet_name || this.defaultSheetNameFor(program),
      header_row: cfg.header_row || 2,
      profile_sheet_name:
        profileMeta?.profile_sheet_name ?? cfg.profile_sheet_name ?? defaultProfileSheetFor(program),
      profile_header_row:
        Number(profileMeta?.profile_header_row ?? cfg.profile_header_row) || defaultProfileHeaderRowFor(program),
      profile_enabled:
        profileMeta?.profile_enabled === undefined || profileMeta?.profile_enabled === null
          ? cfg.profile_enabled === undefined
            ? true
            : Boolean(cfg.profile_enabled)
          : Boolean(Number(profileMeta.profile_enabled)),
      schedule_times: scheduleTimes,
      backup_year: cfg.backup_year ?? null,
      enabled: Boolean(cfg.enabled),
      require_private_sheet: Boolean(cfg.require_private_sheet),
      mask_sensitive_data: Boolean(cfg.mask_sensitive_data),
      last_backup_at: cfg.last_backup_at ?? null,
      last_status: cfg.last_status ?? null,
      last_summary: cfg.last_summary ?? null,
      last_error: cfg.last_error ?? null,
      created_at: cfg.created_at,
      updated_at: cfg.updated_at,
      cs_user: {
        id: cfg.cs_user?.id ?? cfg.cs_user_id,
        name: cfg.cs_user?.name ?? null,
        email: cfg.cs_user?.email ?? '',
        staff_code: cfg.cs_user?.staff_code ?? null,
      },
      student_counts: counts,
      has_local_backup_file: fs.existsSync(this.resolveLocalBackupPath(relPath)),
    };
  }

  /* ----------------------- B2. Global Column Config ----------------------- */

  public async getColumnConfigWithServiceAccount(): Promise<{
    columnConfig: GlobalBackupColumnConfigMap;
    serviceAccount: ServiceAccountInfo;
  }> {
    const [columnConfig, { info: serviceAccount }] = await Promise.all([
      getGlobalBackupColumnConfig(),
      this.sheetSyncService.getServiceAccountKey(),
    ]);
    return { columnConfig, serviceAccount };
  }

  public async saveColumnConfig(
    input: Partial<GlobalBackupColumnConfigMap>,
    userId?: number
  ): Promise<{ columnConfig: GlobalBackupColumnConfigMap; serviceAccount: ServiceAccountInfo }> {
    const columnConfig = await saveGlobalBackupColumnConfig(input, userId);
    const { info: serviceAccount } = await this.sheetSyncService.getServiceAccountKey();
    return { columnConfig, serviceAccount };
  }

  public async resetColumnConfig(
    programType?: string | null,
    userId?: number
  ): Promise<{ columnConfig: GlobalBackupColumnConfigMap }> {
    const columnConfig = await resetGlobalBackupColumnConfig(programType, userId);
    return { columnConfig };
  }

  /**
   * Liệt kê config theo vai trò: CS chỉ thấy config của mình, ADMIN/MANAGE thấy hết.
   */
  public async listConfigs(actor: {
    id: number;
    roles: string[];
  }): Promise<{ configs: ProgramBackupConfigItem[]; serviceAccount: ServiceAccountInfo; availableYears: number[] }> {
    await this.ensureConfigs();
    const { info: serviceAccount } = await this.sheetSyncService.getServiceAccountKey();

    const isAdminOrManage = actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE');
    const whereClause = isAdminOrManage ? {} : { cs_user_id: actor.id };

    const rawConfigs = await prisma.programSheetBackupConfig.findMany({
      where: whereClause,
      include: {
        cs_user: { select: { id: true, name: true, email: true, staff_code: true } },
      },
      orderBy: [{ cs_user_id: 'asc' }, { program_type: 'asc' }],
    });

    // student_counts per (cs, program)
    const csUserIds = [...new Set(rawConfigs.map((c) => c.cs_user_id))];
    const programNames = [...new Set(rawConfigs.map((c) => normalizeProgramType(c.program_type)))];
    const enrollments = csUserIds.length
      ? await prisma.enrollment.findMany({
          where: { cs_id: { in: csUserIds }, program_type: { in: programNames } },
          select: {
            cs_id: true,
            program_type: true,
            status: true,
            student: { select: { external_id: true, id: true } },
          },
        })
      : [];

    const countsByScope = new Map<string, { total: number; attending: number }>();
    for (const uid of csUserIds) {
      for (const program of programNames) {
        countsByScope.set(`${uid}::${program}`, { total: 0, attending: 0 });
      }
    }
    for (const enr of enrollments) {
      const key = `${enr.cs_id}::${normalizeProgramType(enr.program_type)}`;
      const bucket = countsByScope.get(key);
      if (!bucket) continue;
      bucket.total++;
      if (
        enr.status === EnrollmentStatus.STUDYING ||
        enr.status === EnrollmentStatus.WAITING_CLASS ||
        enr.status === EnrollmentStatus.UPCOMING
      ) {
        bucket.attending++;
      }
    }

    // availableYears = template row 1 (2025,2026,...) ∪ năm các buổi học của HV
    const years = new Set<number>(await getTemplateYears());
    const externalIds = enrollments
      .map((e: any) => (e.student?.external_id || '').trim())
      .filter(Boolean);
    if (externalIds.length) {
      const sessionDates = await prisma.classSession.findMany({
        where: {
          attendance: {
            some: {
              deleted_at: null,
              enrollment_class: {
                enrollment: {
                  student: { external_id: { in: externalIds } },
                },
              },
            },
          },
        },
        select: { session_date: true },
        take: 20000,
      });
      for (const s of sessionDates) {
        const key = dateKeyUtc(s.session_date);
        if (key) years.add(Number(key.slice(0, 4)));
      }
    }

    const profileMetaMap = await this.loadProfileMetaMap(rawConfigs.map((c) => c.id));

    return {
      configs: rawConfigs.map((cfg) =>
        this.toConfigItem(
          cfg,
          countsByScope.get(`${cfg.cs_user_id}::${normalizeProgramType(cfg.program_type)}`) || {
            total: 0,
            attending: 0,
          },
          profileMetaMap.get(cfg.id) || null
        )
      ),
      serviceAccount,
      availableYears: [...years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b),
    };
  }

  /* ------------------------------- C. Update ----------------------------- */

  public async updateConfig(
    id: number,
    dto: UpdateProgramBackupConfigDTO
  ): Promise<ProgramBackupConfigItem> {
    await this.ensureConfigs();

    const existing = await prisma.programSheetBackupConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, `Không tìm thấy cấu hình sao lưu điểm danh (ID=${id})`);
    }

    const data: Prisma.ProgramSheetBackupConfigUpdateInput = {};
    const profilePatch: { profile_sheet_name?: string; profile_header_row?: number; profile_enabled?: boolean } = {};

    if (dto.target_spreadsheet_url !== undefined) {
      const url = dto.target_spreadsheet_url === null ? null : String(dto.target_spreadsheet_url).trim() || null;
      data.target_spreadsheet_url = url;
      data.target_spreadsheet_id = this.sheetSyncService.extractSpreadsheetId(url);
    }
    if (dto.sheet_name !== undefined) {
      data.sheet_name = String(dto.sheet_name || '').trim() || this.defaultSheetNameFor(existing.program_type);
    }
    if (dto.header_row !== undefined) {
      const hr = Number(dto.header_row);
      if (!Number.isInteger(hr) || hr < 1 || hr > 20) {
        throw new AppError(400, 'header_row không hợp lệ (1..20)');
      }
      data.header_row = hr;
    }
    if (dto.profile_sheet_name !== undefined) {
      profilePatch.profile_sheet_name =
        String(dto.profile_sheet_name || '').trim() || defaultProfileSheetFor(existing.program_type);
    }
    if (dto.profile_header_row !== undefined) {
      const phr = Number(dto.profile_header_row);
      if (!Number.isInteger(phr) || phr < 1 || phr > 20) {
        throw new AppError(400, 'profile_header_row không hợp lệ (1..20)');
      }
      profilePatch.profile_header_row = phr;
    }
    if (dto.profile_enabled !== undefined) {
      profilePatch.profile_enabled = Boolean(dto.profile_enabled);
    }
    if (dto.schedule_times !== undefined) {
      const cleaned = (Array.isArray(dto.schedule_times) ? dto.schedule_times : [])
        .map((t) => String(t).trim())
        .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
        .map((t) => {
          const [hh, mm] = t.split(':');
          return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
        });
      data.schedule_times = cleaned as unknown as Prisma.InputJsonValue;
    }
    if (dto.backup_year !== undefined) {
      const y = dto.backup_year === null ? null : Number(dto.backup_year);
      if (y !== null && (!Number.isInteger(y) || y < 2000 || y > 2100)) {
        throw new AppError(400, 'backup_year không hợp lệ (VD: 2025, 2026)');
      }
      data.backup_year = y;
    }
    if (dto.enabled !== undefined) data.enabled = Boolean(dto.enabled);
    if (dto.require_private_sheet !== undefined) data.require_private_sheet = Boolean(dto.require_private_sheet);
    if (dto.mask_sensitive_data !== undefined) data.mask_sensitive_data = Boolean(dto.mask_sensitive_data);

    if (Object.keys(data).length > 0) {
      await prisma.programSheetBackupConfig.update({ where: { id }, data });
    }
    if (Object.keys(profilePatch).length > 0) {
      await this.setProfileMetaRaw(id, profilePatch);
    }

    const cfg = await prisma.programSheetBackupConfig.findUnique({
      where: { id },
      include: { cs_user: { select: { id: true, name: true, email: true, staff_code: true } } },
    });
    if (!cfg) throw new AppError(404, 'Không tìm thấy cấu hình sao lưu sau khi cập nhật');

    const [counts, profileMetaMap] = await Promise.all([
      this.countsForConfig(cfg.cs_user_id, cfg.program_type),
      this.loadProfileMetaMap([cfg.id]),
    ]);
    return this.toConfigItem(cfg, counts, profileMetaMap.get(cfg.id) || null);
  }

  private async countsForConfig(csUserId: number, programType: string): Promise<{ total: number; attending: number }> {
    const [total, attending] = await Promise.all([
      prisma.enrollment.count({ where: { cs_id: csUserId, program_type: normalizeProgramType(programType) } }),
      prisma.enrollment.count({
        where: {
          cs_id: csUserId,
          program_type: normalizeProgramType(programType),
          status: {
            in: [EnrollmentStatus.STUDYING, EnrollmentStatus.WAITING_CLASS, EnrollmentStatus.UPCOMING],
          },
        },
      }),
    ]);
    return { total, attending };
  }

  /* ========================= D. Backup engine ========================= * */

  /** Tháng thực sự có buổi học của các enrollment đang xét (lọc theo year). */
  private scopedMonths(
    enrollments: Awaited<ReturnType<typeof loadEnrollments>>,
    year: number | null
  ): Array<{ year: number; month: number }> {
    const keys = new Set<string>();
    for (const enr of enrollments) {
      for (const ec of enr.enrollment_classes) {
        for (const att of ec.attendance || []) {
          const dayKey = dateKeyUtc(att.class_session?.session_date);
          if (!dayKey) continue;
          const y = Number(dayKey.slice(0, 4));
          if (year !== null && y !== year) continue;
          keys.add(dayKey.slice(0, 7));
        }
      }
    }
    return [...keys].sort().map((k) => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) }));
  }

  /** Number of civil days in a month. */
  private daysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  private pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  /** Ngày giữa tháng, đủ để ExcelJS dựng số serial của cột ngày. */
  private excelDay(year: number, month: number, day: number): Date {
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  /**
   * Số buổi đã học trong năm `year` (đếm ATTENDED + nghỉ sai quy định C), gồm cả
   * các session nằm ngoài layout sheet. Dùng làm cached result cho cột L vì Google
   * Sheets không có sheet nguồn để tính lại VLOOKUP/SUM.
   */
  private attendedInYear(enr: Awaited<ReturnType<typeof loadEnrollments>>[number], year: number | null): number {
    let count = 0;
    for (const ec of enr.enrollment_classes) {
      for (const att of ec.attendance || []) {
        if (att.status !== AttendanceStatus.ATTENDED && att.status !== AttendanceStatus.ABSENT_UNAPPROVED_C) {
          continue;
        }
        const key = dateKeyUtc(att.class_session?.session_date);
        if (!key) continue;
        if (year !== null && Number(key.slice(0, 4)) !== year) continue;
        count++;
      }
    }
    return count;
  }

  private formatStatusLabel(status?: EnrollmentStatus | string | null): string {
    switch (status) {
      case EnrollmentStatus.STUDYING:
        return 'Đang học';
      case EnrollmentStatus.WAITING_CLASS:
        return 'Chờ lớp';
      case EnrollmentStatus.PAUSED:
        return 'Bảo lưu';
      case EnrollmentStatus.FINISHED:
        return 'Kết thúc';
      case EnrollmentStatus.UPCOMING:
        return 'Sắp học';
      case EnrollmentStatus.NOT_STARTED:
        return 'Chưa học';
      case EnrollmentStatus.CANCELLED:
        return 'Đã hủy';
      default:
        return 'Đang học';
    }
  }

  private maskPhone(phone?: string | null, mask = false): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    if (!mask || trimmed.length < 6) return trimmed;
    return `${trimmed.slice(0, 3)}****${trimmed.slice(-3)}`;
  }

  private maskEmail(email?: string | null, mask = false): string {
    if (!email) return '';
    const trimmed = email.trim();
    if (!mask || !trimmed.includes('@')) return trimmed;
    const [local, domain] = trimmed.split('@');
    if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  }

  /**
   * Giá trị ghi vào 1 cột ngày: '' (không có buổi học), '1'/tên bài (ATTENDED),
   * hoặc A/B/C/D/E theo trạng thái điểm danh.
   */
  private attendanceCellValue(att: any): string {
    if (!att) return '';
    switch (att.status) {
      case AttendanceStatus.ATTENDED: {
        const topic = String(att.lesson_topic || '').trim();
        return topic || '1';
      }
      case AttendanceStatus.ABSENT_APPROVED_A:
        return 'A';
      case AttendanceStatus.LEAVE_B:
        return 'B';
      case AttendanceStatus.ABSENT_UNAPPROVED_C:
        return 'C';
      case AttendanceStatus.TEACHER_ABSENT_D:
        return 'D';
      case AttendanceStatus.TECH_ERROR_E:
        return 'E';
      default:
        return '';
    }
  }

  /**
   * Dựng 1 block tháng mới ở cuối sheet (chỉ dùng khi template/baseline KHÔNG có
   * block đó). Layout - gồm cả việc block có cột B (bảo lưu) hay không - được Suy
   * từ block gần nhất của template, không hardcode theo số tháng.
   */
  private appendMonthBlock(
    ws: ExcelJS.Worksheet,
    afterBlock: AttendanceMonthBlock | null,
    templateBlock: AttendanceMonthBlock,
    year: number,
    month: number,
    headerRow: number
  ): AttendanceMonthBlock {
    const startCol = afterBlock ? afterBlock.endCol + 1 : FIXED_LAST_COL + 1;
    const donor = templateBlock.summaryCols;

    const summaryCols: AttendanceMonthBlock['summaryCols'] = {};
    let cursor = startCol;
    // 1 cột "Số buổi đã học" + các cột A/B/C/D/E mà block mẫu thật sự có.
    summaryCols.attended = cursor;
    cursor += 1;
    const donorKeys = (Object.keys(donor) as Array<keyof AttendanceSummaryCols>).filter(
      (k) => k !== 'attended' && donor[k] !== undefined
    );
    for (const key of donorKeys) summaryCols[key] = cursor++;

    const dailyCols: AttendanceMonthBlock['dailyCols'] = [];
    for (let day = 1; day <= this.daysInMonth(year, month); day++) {
      dailyCols.push({
        colNumber: cursor,
        colLetter: colNumberToLetter(cursor),
        date: `${year}-${this.pad2(month)}-${this.pad2(day)}`,
        day,
        year,
        month,
      });
      cursor += 1;
    }
    const endCol = cursor - 1;

    // row 1: nhãn block (theo đúng format template: "THÁNG MM/YYYY")
    ws.getRow(1).getCell(startCol).value = `THÁNG ${this.pad2(month)}/${year}`;

    // row 2: header các cột tổng kết + date cho các cột ngày
    const headerRowObj = ws.getRow(headerRow);
    for (const key of Object.keys(summaryCols) as Array<keyof AttendanceSummaryCols>) {
      const col = summaryCols[key];
      if (col) headerRowObj.getCell(col).value = SUMMARY_HEADERS[key] || '';
    }
    for (const d of dailyCols) {
      headerRowObj.getCell(d.colNumber).value = this.excelDay(year, month, d.day);
    }

    // row mẫu: công thức SUM/COUNTIF cho các cột tổng kết
    const letters = dailyCols.map((d) => d.colLetter);
    const dayRange = `${letters[0]}${headerRow + 1}:${letters[letters.length - 1]}${headerRow + 1}`;
    const sampleRow = ws.getRow(headerRow + 1);
    if (summaryCols.attended) {
      setCellValuePreservingFormula(sampleRow.getCell(summaryCols.attended), {
        formula: `SUM(${dayRange})`,
        result: 0,
      } as any);
    }
    const countifLetter: Partial<Record<keyof AttendanceSummaryCols, string>> = {
      absentA: 'A',
      leaveB: 'B',
      absentC: 'C',
      teacherD: 'D',
      techErrorE: 'E',
    };
    for (const key of Object.keys(summaryCols) as Array<keyof AttendanceSummaryCols>) {
      const col = summaryCols[key];
      const code = countifLetter[key];
      if (!col || !code || key === 'attended') continue;
      setCellValuePreservingFormula(sampleRow.getCell(col), {
        formula: `COUNTIF(${dayRange},"${code}")`,
        result: 0,
      } as any);
    }

    return {
      month,
      year,
      label: `Tháng ${month}/${year}`,
      startCol,
      endCol,
      totalDays: dailyCols.length,
      summaryCols,
      dailyCols,
    };
  }

  /**
   * Nhân bản bộ công thức của dòng mẫu (dòng data đầu tiên) sang dòng data mới.
   * Chỉ dịch tham chiếu dòng tương đối; bỏ qua công thức cross-sheet (Setting!,
   * 'Điểm học tập'!) vì chúng vô nghĩa trong file backup độc lập.
   */
  private copyFormulaRow(
    ws: ExcelJS.Worksheet,
    sampleRowNumber: number,
    targetRowNumber: number,
    lastCol: number
  ): void {
    if (targetRowNumber === sampleRowNumber) return;
    const sampleRow = ws.getRow(sampleRowNumber);
    const targetRow = ws.getRow(targetRowNumber);

    for (let c = 1; c <= lastCol; c++) {
      const raw = sampleRow.getCell(c).value as any;
      const formula = raw && typeof raw === 'object' ? raw.formula : null;
      if (!formula || typeof formula !== 'string') continue;
      if (formula.includes('!') || formula.includes('#REF!')) continue;
      targetRow.getCell(c).value = {
        formula: translateFormulaRow(formula, sampleRowNumber, targetRowNumber),
        result: 0,
      } as any;
    }
  }

  /**
   * Giá trị hiện có của ô dưới dạng text chuẩn hoá để so diff. Với ô công thức
   * chỉ lấy cached result (formula là metadata, không phải dữ liệu) — đảm bảo
   * 2 phía so sánh luôn cùng kiểu, tránh "lúc nào cũng khác" gây churn.
   *
   * QUAN TRỌNG (bug churn đã reproduce): ExcelJS tự xoá `result: 0` falsy khi
   * ghi file, nên lần đọc sau `raw.result === undefined`. Nếu truyền nguyên
   * object `{ formula }` vào `normalizeCellComparable` -> `extractCellValue` sẽ
   * lấy nhầm đối số cuối của công thức (`COUNTIF(range,"A")` -> `"A"`,
   * `IFERROR(SUM(...),"-")` -> `"-"`) làm giá trị ô, khiến mọi lần chạy lại đều
   * thấy "khác 0" và ghi lại (updatedCellsCount > 0 mãi). Với ô công thức không
   * cached result, coi là rỗng (blankEqualsZero sẽ đồng nhất '' và '0').
   */
  private cellCurrentText(cell: ExcelJS.Cell): string {
    const raw: any = cell.value;
    if (raw && typeof raw === 'object' && (raw.formula || raw.sharedFormula)) {
      if (raw.result === undefined || raw.result === null) return '';
      return normalizeCellComparable(raw.result);
    }
    return normalizeCellComparable(raw);
  }

  /**
   * QUY TẮC HỘI TỤ (idempotency): chỉ ghi khi trạng thái thực sự khác.
   * `blankEqualsZero` dùng cho các ô tổng kết: ô trống và '0' được coi là CÙNG
   * một trạng thái (công thức COUNTIF luôn hiển thị 0), nhờ đó lần chạy đầu tiên
   * đã ổn định — tránh kiểu "lần 1 viết '0', lần 2 thấy khác lại viết" gây churn.
   */
  private shouldWriteCell(current: string, desired: string, blankEqualsZero = false): boolean {
    if (current === desired) return false;
    if (blankEqualsZero) {
      const norm = (v: string) => (v === '' || v === '0' ? '' : v);
      return norm(current) !== norm(desired);
    }
    return true;
  }

  /* ------------------------------ D. Engine ------------------------------ */

  private async loadConfigOrThrow(configId: number) {
    const config = await prisma.programSheetBackupConfig.findUnique({
      where: { id: configId },
      include: { cs_user: { select: { id: true, name: true, email: true, staff_code: true } } },
    });
    if (!config) throw new AppError(404, `Không tìm thấy cấu hình backup #${configId}`);
    return config;
  }

  private assertConfigScope(config: { cs_user_id: number }, actorId?: number, actorRoles?: string[]): void {
    const isAdminOrManage = Array.isArray(actorRoles) && (actorRoles.includes('ADMIN') || actorRoles.includes('MANAGE'));
    if (!isAdminOrManage && actorId !== undefined && config.cs_user_id !== actorId) {
      throw new AppError(403, 'Bạn chỉ được phép sao lưu dữ liệu học viên thuộc tài khoản của mình');
    }
  }

  /**
   * Tính bộ thống kê buổi học & nghỉ của 1 enrollment để cung cấp cho resolver cột.
   */
  private computeEnrollmentStats(
    enr: Awaited<ReturnType<typeof loadEnrollments>>[number],
    yearFilter: number | null
  ): BackupMonthStats {
    let attendedAllTime = 0;
    let attendedCurrentYear = 0;
    let absentACount = 0;
    let leaveBCount = 0;
    let absentCCount = 0;
    let teacherDCount = 0;
    let techErrorECount = 0;
    let totalRecordedSessions = 0;

    for (const ec of enr.enrollment_classes) {
      for (const att of ec.attendance || []) {
        totalRecordedSessions++;
        const dayKey = dateKeyUtc(att.class_session?.session_date);
        const inScopedYear = yearFilter === null || (dayKey && Number(dayKey.slice(0, 4)) === yearFilter);

        switch (att.status) {
          case AttendanceStatus.ATTENDED:
            attendedAllTime++;
            if (inScopedYear) attendedCurrentYear++;
            break;
          case AttendanceStatus.ABSENT_UNAPPROVED_C:
            attendedAllTime++;
            absentCCount++;
            if (inScopedYear) attendedCurrentYear++;
            break;
          case AttendanceStatus.ABSENT_APPROVED_A:
            absentACount++;
            break;
          case AttendanceStatus.LEAVE_B:
            leaveBCount++;
            break;
          case AttendanceStatus.TEACHER_ABSENT_D:
            teacherDCount++;
            break;
          case AttendanceStatus.TECH_ERROR_E:
            techErrorECount++;
            break;
        }
      }
    }

    const totalSessions = Number(enr.total_sessions || 0);
    const attendedPrevYears = Number(enr.attended_previous_years ?? 0);
    let remainingSessions: number;
    if (totalRecordedSessions > 0) {
      remainingSessions = Math.max(0, totalSessions - (attendedPrevYears + attendedAllTime));
    } else if (enr.external_remaining_sessions !== null && enr.external_remaining_sessions !== undefined) {
      remainingSessions = Math.max(0, Number(enr.external_remaining_sessions));
    } else {
      remainingSessions = Math.max(0, totalSessions - attendedPrevYears);
    }

    return {
      attendedCurrentYear:
        totalRecordedSessions > 0
          ? attendedCurrentYear
          : Math.max(0, totalSessions - attendedPrevYears - remainingSessions),
      attendedAllTime:
        totalRecordedSessions > 0
          ? attendedPrevYears + attendedAllTime
          : Math.max(0, totalSessions - remainingSessions),
      remainingSessions,
      absentACount,
      leaveBCount,
      absentCCount,
      teacherDCount,
      techErrorECount,
    };
  }

  /**
   * Index các dòng hiện có của 1 worksheet theo các cột `isKey: true` (hoặc cột
   * `student.external_id`). Giữ danh sách occurrence theo thứ tự dòng tăng dần.
   */
  private indexSheetRowsByMapping(
    ws: ExcelJS.Worksheet,
    headerRow: number,
    sheetCfg: SheetColumnMappingConfig
  ): { rowsByKey: Map<string, number[]>; lastNonEmptyRow: number } {
    const rowsByKey = new Map<string, number[]>();
    let lastNonEmptyRow = headerRow;

    const extColCfg =
      sheetCfg.columns.find((c) => c.fieldKey === 'student.external_id') ||
      sheetCfg.columns.find((c) => c.isKey) ||
      sheetCfg.columns[0];
    const extCol = extColCfg ? extColCfg.col : 1;

    const keyCols = sheetCfg.columns.filter((c) => c.isKey && c.enabled);
    const effectiveKeyCols = keyCols.length > 0 ? keyCols : extColCfg ? [extColCfg] : [];

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const externalId = normalizeCellComparable(row.getCell(extCol).value);
      if (!externalId) continue;

      lastNonEmptyRow = r;
      const keyParts = effectiveKeyCols.map((kc) =>
        normalizeCellComparable(row.getCell(kc.col).value).toUpperCase()
      );
      const key = keyParts.join('::') || externalId.toUpperCase();
      const bucket = rowsByKey.get(key);
      if (bucket) bucket.push(r);
      else rowsByKey.set(key, [r]);
    }

    return { rowsByKey, lastNonEmptyRow };
  }

  private buildEnrollmentRowKey(
    sheetCfg: SheetColumnMappingConfig,
    ctx: BackupRowResolveContext,
    fallbackExternalId: string
  ): string {
    const keyCols = sheetCfg.columns.filter((c) => c.isKey && c.enabled);
    if (keyCols.length === 0) return fallbackExternalId.toUpperCase();
    const parts = keyCols.map((kc) => {
      if (kc.fieldKey === 'student.external_id') return fallbackExternalId.toUpperCase();
      const resolved = resolveBackupFieldValue(kc.fieldKey, ctx);
      return normalizeCellComparable(resolved.value).toUpperCase();
    });
    return parts.join('::') || fallbackExternalId.toUpperCase();
  }

  /**
   * Ghi Sheet HỒ SƠ (`1.Chăm sóc` cho KAIWA / `Data JLPT_Inhouse` cho JLPT) theo
   * cấu hình cột động `profileCfg`.
   */
  private runProfileSheetBackup(
    ws: ExcelJS.Worksheet,
    headerRow: number,
    profileMaxCol: number,
    profileCfg: SheetColumnMappingConfig,
    enrollments: Awaited<ReturnType<typeof loadEnrollments>>,
    config: { cs_user: { staff_code: string | null }; mask_sensitive_data: boolean },
    yearFilter: number | null,
    batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }>
  ): SheetBackupStats {
    const firstDataRow = headerRow + 1;
    const enabledCols = getEnabledColumns(profileCfg);
    const maxConfiguredCol = enabledCols.reduce((m, c) => Math.max(m, c.col), profileMaxCol || 52);

    const indexed = this.indexSheetRowsByMapping(ws, headerRow, profileCfg);
    const claimedRows = new Set<number>();
    const nextOccurrence = new Map<string, number>();
    let lastRow = indexed.lastNonEmptyRow;

    let unchangedRows = 0;
    let updatedRows = 0;
    let appendedRows = 0;
    let updatedCellsCount = 0;

    for (const enr of enrollments) {
      const student = enr.student;
      const externalId = String(student.external_id || enr.external_id || `HV_${student.id}`).trim();

      const activeEc =
        enr.enrollment_classes.find((ec) => ec.status === 'ACTIVE') ||
        enr.enrollment_classes[enr.enrollment_classes.length - 1] ||
        null;
      const cls = activeEc?.class || null;
      const schedule = cls?.class_schedules.find((sc) => sc.active) || cls?.class_schedules[0] || null;
      const mainCt =
        cls?.class_teachers.find((ct) => ct.role === 'MAIN' && ct.active) || cls?.class_teachers[0] || null;
      const teacher = mainCt?.teacher || null;

      const stats = this.computeEnrollmentStats(enr, yearFilter);
      const careByMilestone = buildCareMilestoneMap((enr as any).care_logs || []);

      const ctx: BackupRowResolveContext = {
        student,
        enrollment: enr,
        pkg: enr.package,
        cls,
        schedule,
        teacher,
        csStaffCode: config.cs_user.staff_code,
        maskSensitiveData: Boolean(config.mask_sensitive_data),
        stats,
        careByMilestone,
      };

      const key = this.buildEnrollmentRowKey(profileCfg, ctx, externalId);
      const bucket = indexed.rowsByKey.get(key);
      const seen = nextOccurrence.get(key) ?? 0;
      nextOccurrence.set(key, seen + 1);

      let targetRow: number | undefined = bucket && seen < bucket.length ? bucket[seen] : undefined;
      if (targetRow !== undefined && claimedRows.has(targetRow)) targetRow = undefined;
      let isNew = false;
      if (targetRow === undefined) {
        targetRow = ++lastRow;
        isNew = true;
        if (!bucket) indexed.rowsByKey.set(key, []);
        indexed.rowsByKey.get(key)!.push(targetRow);
      }
      claimedRows.add(targetRow);
      const row = ws.getRow(targetRow);
      if (isNew) {
        this.copyFormulaRow(ws, firstDataRow, targetRow, maxConfiguredCol);
      }

      let rowChanged = 0;
      let rowMaxColWritten = maxConfiguredCol;

      for (const colCfg of enabledCols) {
        const resolved =
          colCfg.fieldKey === 'student.external_id'
            ? { value: externalId, hasValue: true }
            : resolveBackupFieldValue(colCfg.fieldKey, ctx);

        // Nếu cột không có nguồn dữ liệu DB (hasDbSource=false) và trống -> giữ nguyên ô trên sheet.
        if (!resolved.hasValue && !colCfg.hasDbSource) continue;

        const desiredVal = resolved.hasValue ? resolved.value : '';
        const desiredStr = normalizeCellComparable(desiredVal);
        const cell = row.getCell(colCfg.col);
        const currentStr = this.cellCurrentText(cell);

        if (!this.shouldWriteCell(currentStr, desiredStr, Boolean(colCfg.isFormulaPreserved))) {
          continue;
        }

        if (colCfg.isFormulaPreserved) {
          setCellValuePreservingFormula(cell, desiredVal);
        } else {
          cell.value = desiredVal as any;
        }
        rowChanged++;
        rowMaxColWritten = Math.max(rowMaxColWritten, colCfg.col);
      }

      if (isNew) {
        appendedRows++;
      } else if (rowChanged > 0) {
        updatedRows++;
      } else {
        unchangedRows++;
      }
      updatedCellsCount += rowChanged;

      if (rowChanged > 0) {
        batchRanges.push({
          range: `'${ws.name}'!A${targetRow}:${colNumberToLetter(rowMaxColWritten)}${targetRow}`,
          values: [this.readRowValues(row, rowMaxColWritten)],
        });
      }
    }

    return {
      sheetName: ws.name,
      totalEnrollments: enrollments.length,
      unchangedRows,
      updatedRows,
      appendedRows,
      updatedCellsCount,
    };
  }

  /**
   * Chạy backup cả 2 sheet (Hồ sơ + Điểm danh) cho MỘT config (CSKH x chương trình).
   * Thứ tự ưu tiên năm: opts.year > config.backup_year > tất cả.
   */
  public async runBackupForConfig(
    configId: number,
    opts: { forceFullRewrite?: boolean; year?: number | null; actorId?: number; actorRoles?: string[] } = {}
  ): Promise<ProgramBackupSummary> {
    await this.ensureConfigs();
    const config = await this.loadConfigOrThrow(configId);
    this.assertConfigScope(config, opts.actorId, opts.actorRoles);

    const programType = normalizeProgramType(config.program_type);
    const yearFilter = opts.year === undefined || opts.year === null ? (config.backup_year ?? null) : opts.year;
    const forceFullRewrite = Boolean(opts.forceFullRewrite);

    const columnConfigMap = await getGlobalBackupColumnConfig();
    const programCols: ProgramColumnMappingConfig =
      programType === 'KAIWA' ? columnConfigMap.KAIWA : columnConfigMap.JLPT;

    // 3 cột profile_* đọc bằng raw SQL (Prisma client runtime có thể chưa regenerate)
    const profileMeta = (await this.loadProfileMetaMap([config.id])).get(config.id) || null;

    const attendanceHeaderRow = config.header_row || programCols.attendance.headerRow || 2;
    const attendanceSheetName =
      config.sheet_name || programCols.attendance.defaultSheetName || this.defaultSheetNameFor(programType);

    const profileHeaderRow =
      Number(profileMeta?.profile_header_row) ||
      programCols.profile.headerRow ||
      defaultProfileHeaderRowFor(programType);
    const profileSheetName =
      profileMeta?.profile_sheet_name ||
      programCols.profile.defaultSheetName ||
      defaultProfileSheetFor(programType);
    const profileEnabled =
      profileMeta?.profile_enabled === undefined || profileMeta?.profile_enabled === null
        ? true
        : Boolean(Number(profileMeta.profile_enabled));

    const absPath = this.resolveLocalBackupPath(
      config.local_backup_path || this.relativeBackupPathFor(config.cs_user.staff_code || `CS${config.cs_user_id}`, programType)
    );

    await prisma.programSheetBackupConfig.update({
      where: { id: config.id },
      data: { last_status: 'RUNNING', last_error: null },
    });

    try {
      const enrollments = await loadEnrollments(config.cs_user_id, programType);
      const months = this.scopedMonths(enrollments, yearFilter);
      const monthSet = new Set(months.map((m) => `${m.year}-${m.month}`));

      // 1. Nạp hoặc khởi tạo workbook 2 sheet (Sheet Hồ sơ + Sheet Điểm danh)
      const wbLoaded = await loadOrExtractProgramWorkbook({
        absPath,
        programType,
        profileSheetName,
        profileHeaderRow,
        attendanceSheetName,
        attendanceHeaderRow,
        forceFresh: forceFullRewrite,
      });

      const batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }> = [];

      // 2. Backup Sheet Hồ sơ (`1.Chăm sóc` cho KAIWA / `Data JLPT_Inhouse` cho JLPT)
      let profileStats: SheetBackupStats | null = null;
      if (profileEnabled) {
        profileStats = this.runProfileSheetBackup(
          wbLoaded.profileWorksheet,
          profileHeaderRow,
          wbLoaded.profileMaxCol,
          programCols.profile,
          enrollments,
          config,
          yearFilter,
          batchRanges
        );
      }

      // 3. Backup Sheet Điểm danh (`3.Chấm buổi` cho KAIWA / `Chấm buổi` cho JLPT)
      const ws = wbLoaded.attendanceWorksheet;
      const blocks = detectJlptMonthBlocks(ws, attendanceHeaderRow).sort((a, b) => a.startCol - b.startCol);

      let donor: AttendanceMonthBlock | null = blocks[blocks.length - 1] || null;
      if (!donor) {
        try {
          const tpl = await readTemplateAttendanceWorksheet(attendanceSheetName);
          const tplBlocks = detectJlptMonthBlocks(tpl, attendanceHeaderRow);
          donor = tplBlocks[tplBlocks.length - 1] || null;
        } catch {
          donor = null;
        }
      }

      const enabledAttCols = getEnabledColumns(programCols.attendance);
      const fixedLastCol = enabledAttCols.reduce(
        (m, c) => Math.max(m, c.col),
        programType === 'KAIWA' ? 28 : FIXED_LAST_COL
      );

      let tail: AttendanceMonthBlock | null = blocks[blocks.length - 1] || null;
      if (donor) {
        for (const m of months) {
          if (blocks.some((b) => b.year === m.year && b.month === m.month)) continue;
          const created = this.appendMonthBlock(ws, tail, donor, m.year, m.month, attendanceHeaderRow);
          blocks.push(created);
          tail = created;
        }
        blocks.sort((a, b) => a.startCol - b.startCol);
      }

      const lastCol = Math.max(wbLoaded.attendanceMaxCol, tail ? tail.endCol : 0, fixedLastCol);
      const firstDataRow = attendanceHeaderRow + 1;

      const indexed = this.indexSheetRowsByMapping(ws, attendanceHeaderRow, programCols.attendance);
      const claimedRows = new Set<number>();
      const nextOccurrence = new Map<string, number>();
      let lastRow = indexed.lastNonEmptyRow;

      let unchangedRows = 0;
      let updatedRows = 0;
      let appendedRows = 0;
      let updatedCellsCount = 0;
      let attendanceCellsWritten = 0;

      for (const enr of enrollments) {
        const student = enr.student;
        const externalId = String(student.external_id || enr.external_id || `HV_${student.id}`).trim();

        const activeEc =
          enr.enrollment_classes.find((ec) => ec.status === 'ACTIVE') ||
          enr.enrollment_classes[enr.enrollment_classes.length - 1] ||
          null;
        const cls = activeEc?.class || null;
        const schedule = cls?.class_schedules.find((sc) => sc.active) || cls?.class_schedules[0] || null;
        const mainCt = cls?.class_teachers.find((ct) => ct.role === 'MAIN' && ct.active) || cls?.class_teachers[0] || null;
        const teacher = mainCt?.teacher || null;

        const stats = this.computeEnrollmentStats(enr, yearFilter);
        const careByMilestone = buildCareMilestoneMap((enr as any).care_logs || []);

        const ctx: BackupRowResolveContext = {
          student,
          enrollment: enr,
          pkg: enr.package,
          cls,
          schedule,
          teacher,
          csStaffCode: config.cs_user.staff_code,
          maskSensitiveData: Boolean(config.mask_sensitive_data),
          stats,
          careByMilestone,
        };

        // Điểm danh theo ngày (UTC key cho @db.Date) — 1 buổi/ngày gần nhất thắng
        const byDay = new Map<string, any>();
        for (const ec of enr.enrollment_classes) {
          for (const att of ec.attendance || []) {
            const dayKey = dateKeyUtc(att.class_session?.session_date);
            if (dayKey) byDay.set(dayKey, att);
          }
        }

        // Xác định dòng đích theo khoá + occurrence thứ n (ổn định giữa các lần chạy)
        const key = this.buildEnrollmentRowKey(programCols.attendance, ctx, externalId);
        const bucket = indexed.rowsByKey.get(key);
        const seen = nextOccurrence.get(key) ?? 0;
        nextOccurrence.set(key, seen + 1);

        let targetRow: number | undefined = bucket && seen < bucket.length ? bucket[seen] : undefined;
        if (targetRow !== undefined && claimedRows.has(targetRow)) targetRow = undefined;
        let isNew = false;
        if (targetRow === undefined) {
          targetRow = ++lastRow;
          isNew = true;
          if (!bucket) indexed.rowsByKey.set(key, []);
          indexed.rowsByKey.get(key)!.push(targetRow);
        }
        claimedRows.add(targetRow);
        const row = ws.getRow(targetRow);
        if (isNew) {
          this.copyFormulaRow(ws, firstDataRow, targetRow, lastCol);
        }

        let rowChanged = 0;
        let rowAttChanged = 0;
        let rowMaxColWritten = fixedLastCol;

        // --- Vùng cột cố định theo cấu hình cột động (JLPT 12 cột, KAIWA 28 cột) ---
        for (const colCfg of enabledAttCols) {
          const resolved =
            colCfg.fieldKey === 'student.external_id'
              ? { value: externalId, hasValue: true }
              : resolveBackupFieldValue(colCfg.fieldKey, ctx);

          if (!resolved.hasValue && !colCfg.hasDbSource) continue;

          const desiredVal = resolved.hasValue ? resolved.value : '';
          const desiredStr = normalizeCellComparable(desiredVal);
          const cell = row.getCell(colCfg.col);
          const currentStr = this.cellCurrentText(cell);

          if (!this.shouldWriteCell(currentStr, desiredStr, Boolean(colCfg.isFormulaPreserved))) {
            continue;
          }

          if (colCfg.isFormulaPreserved) {
            setCellValuePreservingFormula(cell, desiredVal);
          } else {
            cell.value = desiredVal as any;
          }
          rowChanged++;
          rowMaxColWritten = Math.max(rowMaxColWritten, colCfg.col);
        }

        // --- Các block tháng nằm trong phạm vi ghi ---
        for (const block of blocks) {
          const mk = `${block.year}-${block.month}`;
          if (!monthSet.has(mk)) continue;
          rowMaxColWritten = Math.max(rowMaxColWritten, block.endCol);

          let mAttendedNumeric = 0;
          let mA = 0;
          let mB = 0;
          let mC = 0;
          let mD = 0;
          let mE = 0;

          for (const d of block.dailyCols) {
            const att = byDay.get(d.date);
            const desired = this.attendanceCellValue(att);
            if (att) {
              switch (att.status) {
                case AttendanceStatus.ATTENDED:
                  if (/^-?\d+(\.\d+)?$/.test(desired)) mAttendedNumeric++;
                  break;
                case AttendanceStatus.ABSENT_APPROVED_A:
                  mA++;
                  break;
                case AttendanceStatus.LEAVE_B:
                  mB++;
                  break;
                case AttendanceStatus.ABSENT_UNAPPROVED_C:
                  mC++;
                  break;
                case AttendanceStatus.TEACHER_ABSENT_D:
                  mD++;
                  break;
                case AttendanceStatus.TECH_ERROR_E:
                  mE++;
                  break;
              }
            }
            const current = this.cellCurrentText(row.getCell(d.colNumber));
            if (!this.shouldWriteCell(current, desired)) continue;
            setCellValuePreservingFormula(row.getCell(d.colNumber), desired);
            rowChanged++;
            if (desired !== '') rowAttChanged++;
          }

          const summaryCounts: Array<[keyof NonNullable<AttendanceMonthBlock['summaryCols']>, number]> = [
            ['attended', mAttendedNumeric + mC + mB + mA + mD + mE === 0 ? 0 : mAttendedNumeric],
            ['absentA', mA],
            ['leaveB', mB],
            ['absentC', mC],
            ['teacherD', mD],
            ['techErrorE', mE],
          ];
          for (const [skey, count] of summaryCounts) {
            const col = (block.summaryCols as Record<string, number | undefined>)[skey];
            if (!col) continue;
            const cell = row.getCell(col);
            const current = this.cellCurrentText(cell);
            if (!this.shouldWriteCell(current, String(count), true)) continue;
            setCellValuePreservingFormula(cell, count);
            rowChanged++;
          }
        }

        if (isNew) {
          appendedRows++;
        } else if (rowChanged > 0) {
          updatedRows++;
        } else {
          unchangedRows++;
        }
        updatedCellsCount += rowChanged;
        attendanceCellsWritten += rowAttChanged;

        if (rowChanged > 0) {
          batchRanges.push({
            range: `'${ws.name}'!A${targetRow}:${colNumberToLetter(rowMaxColWritten)}${targetRow}`,
            values: [this.readRowValues(row, rowMaxColWritten)],
          });
        }
      }

      const attendanceStats: SheetBackupStats = {
        sheetName: ws.name,
        totalEnrollments: enrollments.length,
        unchangedRows,
        updatedRows,
        appendedRows,
        updatedCellsCount,
        attendanceCellsWritten,
      };

      // 4. Ghi file local (1 workbook chứa cả 2 sheet)
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await wbLoaded.workbook.xlsx.writeFile(absPath);

      // 5. Đẩy delta lên Google Sheet (nếu có đích)
      let syncedToGoogleSheet = false;
      const targetId =
        config.target_spreadsheet_id || this.sheetSyncService.extractSpreadsheetId(config.target_spreadsheet_url);
      if (targetId && batchRanges.length > 0) {
        const auth = await this.sheetSyncService.getAuthorizedAccessToken();
        if (!auth) {
          throw new AppError(
            400,
            'Đã cấu hình Google Sheet đích nhưng chưa cấu hình Google Service Account JSON để ghi dữ liệu.'
          );
        }
        await verifyTargetSpreadsheetSecurity(targetId, auth.accessToken, config.require_private_sheet);
        await pushDeltaToGoogleSheet(targetId, auth.accessToken, batchRanges);
        syncedToGoogleSheet = true;
      }

      const summary: ProgramBackupSummary = {
        csUserId: config.cs_user_id,
        staffCode: config.cs_user.staff_code,
        programType,
        status: 'SUCCESS',
        syncedToGoogleSheet,
        localFilePath: path.relative(process.cwd(), absPath).replace(/\\/g, '/'),
        totalStudents: enrollments.length,
        unchangedRows,
        updatedRows,
        appendedRows,
        updatedCellsCount: updatedCellsCount + (profileStats?.updatedCellsCount ?? 0),
        attendanceCellsWritten,
        yearFilter,
        backedUpAt: new Date().toISOString(),
        profile: profileStats,
        attendance: attendanceStats,
      };

      await prisma.programSheetBackupConfig.update({
        where: { id: config.id },
        data: {
          last_status: 'SUCCESS',
          last_summary: summary as unknown as Prisma.InputJsonValue,
          last_backup_at: new Date(),
          last_error: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          user_id: opts.actorId ?? config.cs_user_id,
          action: 'CS_PROGRAM_BACKUP',
          entity_type: 'ProgramSheetBackupConfig',
          entity_id: String(config.id),
          after_data: summary as unknown as Prisma.InputJsonValue,
        },
      });

      return summary;
    } catch (err: any) {
      const message = err?.message || 'Lỗi backup không xác định';
      await prisma.programSheetBackupConfig
        .update({
          where: { id: config.id },
          data: { last_status: 'FAILED', last_error: message.slice(0, 1000), last_backup_at: new Date() },
        })
        .catch(() => {});
      await prisma.auditLog
        .create({
          data: {
            user_id: opts.actorId ?? config.cs_user_id,
            action: 'CS_PROGRAM_BACKUP',
            entity_type: 'ProgramSheetBackupConfig',
            entity_id: String(config.id),
            after_data: { status: 'FAILED', error: message } as unknown as Prisma.InputJsonValue,
          },
        })
        .catch(() => {});
      if (err instanceof AppError) throw err;
      throw new AppError(500, `Backup thất bại (${programType}/${config.cs_user.staff_code || config.cs_user_id}): ${message}`);
    }
  }

  /** Đọc giá trị hiện tại của 1 hàng (đã chuẩn hóa) để đẩy lên Google Sheets. */
  private readRowValues(row: ExcelJS.Row, maxCol: number): GoogleSafeValue[] {
    const values: GoogleSafeValue[] = [];
    for (let c = 1; c <= maxCol; c++) values.push(toGoogleSafeValue(row.getCell(c).value));
    return values;
  }

  /** Chạy backup cho mọi config (lọc theo chương trình nếu có). */
  public async runAllBackups(
    opts: { forceFullRewrite?: boolean; year?: number | null; programType?: string | null } = {}
  ): Promise<{ results: ProgramBackupSummary[] }> {
    await this.ensureConfigs();
    const where: Record<string, unknown> = { enabled: true };
    const program = normalizeProgramType(opts.programType);
    if (program) where.program_type = program;

    const configs = await prisma.programSheetBackupConfig.findMany({
      where: where as any,
      include: { cs_user: { select: { staff_code: true } } },
      orderBy: [{ cs_user_id: 'asc' }, { program_type: 'asc' }],
    });

    const results: ProgramBackupSummary[] = [];
    for (const cfg of configs) {
      try {
        const summary = await this.runBackupForConfig(cfg.id, {
          forceFullRewrite: opts.forceFullRewrite,
          year: opts.year,
        });
        results.push(summary);
      } catch (err: any) {
        results.push({
          csUserId: cfg.cs_user_id,
          staffCode: cfg.cs_user?.staff_code || null,
          programType: normalizeProgramType(cfg.program_type),
          status: 'FAILED',
          syncedToGoogleSheet: false,
          localFilePath: cfg.local_backup_path || '',
          totalStudents: 0,
          unchangedRows: 0,
          updatedRows: 0,
          appendedRows: 0,
          updatedCellsCount: 0,
          attendanceCellsWritten: 0,
          yearFilter: opts.year ?? cfg.backup_year ?? null,
          backedUpAt: new Date().toISOString(),
        });
        log.error('runAllBackups: config lỗi', { configId: cfg.id, error: err?.message });
      }
    }
    return { results };
  }

  /** Đường dẫn file backup của config; thiếu file thì auto-run trước khi trả. */
  public async getBackupFilePath(
    configId: number,
    opts: { forceRefresh?: boolean; actorId?: number; actorRoles?: string[] } = {}
  ): Promise<{ absPath: string; fileName: string }> {
    await this.ensureConfigs();
    const config = await this.loadConfigOrThrow(configId);
    this.assertConfigScope(config, opts.actorId, opts.actorRoles);

    const programType = normalizeProgramType(config.program_type);
    const absPath = this.resolveLocalBackupPath(
      config.local_backup_path ||
        this.relativeBackupPathFor(config.cs_user.staff_code || `CS${config.cs_user_id}`, programType)
    );

    if (!fs.existsSync(absPath) || opts.forceRefresh) {
      await this.runBackupForConfig(configId, {
        forceFullRewrite: Boolean(opts.forceRefresh),
        actorId: opts.actorId,
        actorRoles: opts.actorRoles,
      });
    }

    if (!fs.existsSync(absPath)) {
      throw new AppError(404, `File backup chưa được tạo cho config #${configId}`);
    }
    return { absPath, fileName: path.basename(absPath) };
  }
}

/* ------------------------------- Scheduler --------------------------------- */

let csBackupCronTask: ReturnType<typeof cron.schedule> | null = null;
const csBackupFiredKeys = new Set<string>();

/**
 * Mỗi phút kiểm tra: config nào enabled có `HH:mm` khớp giờ hiện tại và chưa chạy
 * trong khung giờ đó của hôm nay thì chạy backup (mặc định 12:00 & 21:00).
 */
export function startCsSheetBackupScheduler(intervalService?: SheetBackupService): void {
  if (csBackupCronTask) return;
  const service = intervalService || new SheetBackupService();

  csBackupCronTask = cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      await service.ensureConfigs();
      const configs = await prisma.programSheetBackupConfig.findMany({ where: { enabled: true } });
      for (const cfg of configs) {
        const times = Array.isArray(cfg.schedule_times) ? (cfg.schedule_times as unknown as string[]) : [];
        if (!times.includes(hhmm)) continue;
        const fireKey = `${cfg.id}|${today}|${hhmm}`;
        if (csBackupFiredKeys.has(fireKey)) continue;
        csBackupFiredKeys.add(fireKey);

        const alreadyRunThisHour =
          cfg.last_backup_at &&
          dateKeyUtc(cfg.last_backup_at).slice(0, 10) === today &&
          new Date(cfg.last_backup_at).getHours() === now.getHours();
        if (alreadyRunThisHour) continue;

        log.info('Scheduler: chạy backup định kỳ', { configId: cfg.id, hhmm });
        service
          .runBackupForConfig(cfg.id, {})
          .catch((err) => log.error('Scheduler backup lỗi', { configId: cfg.id, error: err?.message }));
      }

      // Dọn key cũ (chống phình bộ nhớ)
      for (const k of [...csBackupFiredKeys]) {
        const day = k.split('|')[1];
        if (day < today) csBackupFiredKeys.delete(k);
      }
    } catch (err: any) {
      log.error('Scheduler tick lỗi', { error: err?.message });
    }
  });
  log.info('CS program backup scheduler started (mỗi phút, debounce theo giờ trong ngày)');
}

export function stopCsSheetBackupScheduler(): void {
  if (csBackupCronTask) {
    csBackupCronTask.stop();
    csBackupCronTask = null;
  }
}
