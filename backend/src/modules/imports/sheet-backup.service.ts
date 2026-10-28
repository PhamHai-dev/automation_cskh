/**
 * SheetBackupService - backup ĐIỂM DANH & HỒ SƠ từ WEB về Google Sheet / file Excel.
 * -----------------------------------------------------------------------------
 * Hỗ trợ 3 loại chương trình / đối tượng backup:
 *   1. KAIWA (mỗi CSKH): 3 sheets (`1.Chăm sóc` + `3.Chấm buổi` + `Điểm danh chốt`)
 *   2. JLPT  (mỗi CSKH): 3 sheets (`Data JLPT_Inhouse` + `Chấm buổi` + `Điểm danh chốt`)
 *   3. TEACHER (mỗi Giáo viên): 1 sheet (`2026 スケジュール` theo mẫu `docs/data/giao_vien.xlsx`)
 *
 * Nguồn dữ liệu điểm danh được tách bạch rõ ràng:
 *   - Chế độ 'CS' (`3.Chấm buổi` / `Chấm buổi`): chỉ ghi bản ghi có `att.cs_status !== null`.
 *     Giá trị ô ngày ưu tiên `att.cs_raw_value` (nếu khác rỗng), ngược lại '1' hoặc A/B/C/D/E.
 *   - Chế độ 'FINAL' (`Điểm danh chốt` trong cả Kaiwa & JLPT): chỉ ghi bản ghi đã đối soát
 *     (`reconciliation_state === 'MATCHED' || reconciliation_state === 'RESOLVED'`).
 *   - Chế độ 'TEACHER' (`2026 スケジュール`): chỉ ghi bản ghi có `att.teacher_status !== null`
 *     với công thức ghi như hệ thống hiện tại (`lesson_topic || '1'` cho ATTENDED, A/B/C/D/E cho nghỉ).
 * -----------------------------------------------------------------------------
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import cron from 'node-cron';
import {
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
  ReconciliationState,
} from '@prisma/client';

import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';
import { isConsumedAttendance } from '../enrollments/enrollment-entitlement';
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
  loadOrExtractAttendanceWorkbook,
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
  getFinalAttendanceColumnMapping,
  getGlobalBackupColumnConfig,
  getTeacherAttendanceColumnMapping,
  resetGlobalBackupColumnConfig,
  resolveBackupFieldValue,
  saveGlobalBackupColumnConfig,
} from './profile-sheet.util';

const log = createLogger('SheetBackupService');

export const PROGRAM_TYPES = ['JLPT', 'KAIWA'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number] | 'TEACHER';

export const DEFAULT_SHEET_NAME_BY_PROGRAM: Record<string, string> = {
  JLPT: 'Chấm buổi',
  KAIWA: '3.Chấm buổi',
  TEACHER: '2026 スケジュール',
};

/** Sheet HỒ SƠ mặc định theo chương trình (cùng workbook backup). */
export const DEFAULT_PROFILE_SHEET_NAME_BY_PROGRAM: Record<string, string> = {
  JLPT: 'Data JLPT_Inhouse',
  KAIWA: '1.Chăm sóc',
  TEACHER: '',
};

export const DEFAULT_PROFILE_HEADER_ROW_BY_PROGRAM: Record<string, number> = {
  JLPT: 2,
  KAIWA: 3,
  TEACHER: 2,
};

export const DEFAULT_FINAL_SHEET_NAME = 'Điểm danh chốt';
export const DEFAULT_FINAL_HEADER_ROW = 2;
const FINAL_META_SETTING_KEY = 'SHEET_BACKUP_FINAL_META';

export function isTeacherProgramType(programType?: string | null): boolean {
  const norm = String(programType || '').trim().toUpperCase();
  return norm === 'TEACHER' || norm.startsWith('GV:');
}

export function defaultProfileSheetFor(programType: string): string {
  if (isTeacherProgramType(programType)) return '';
  return DEFAULT_PROFILE_SHEET_NAME_BY_PROGRAM[normalizeProgramType(programType)] || '1.Chăm sóc';
}

export function defaultProfileHeaderRowFor(programType: string): number {
  return DEFAULT_PROFILE_HEADER_ROW_BY_PROGRAM[normalizeProgramType(programType)] ?? 3;
}

export const DEFAULT_SCHEDULE_TIMES = ['12:00', '21:00'];

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

/** Cột cuối của vùng cố định (L) - block tháng đầu tiên bắt đầu sau cột này. */
const FIXED_LAST_COL = 12;

/** Nhãn header gốc của các cột tổng kết trong mỗi block tháng. */
const SUMMARY_HEADERS: Record<string, string> = {
  completedHours: 'Số giờ hoàn thành\n完了時間数',
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
  final_sheet_name: string;
  final_header_row: number;
  final_enabled: boolean;
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
  final_sheet_name?: string;
  final_header_row?: number;
  final_enabled?: boolean;
  schedule_times?: string[];
  backup_year?: number | null;
  enabled?: boolean;
  require_private_sheet?: boolean;
  mask_sensitive_data?: boolean;
}

/** Stats delta của RIÊNG một sheet trong workbook. */
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
  configId?: number;
  configName?: string;
  batchId?: string;
  triggerType?: 'MANUAL' | 'AUTO';
  mode?: 'DELTA' | 'FULL';
  durationMs?: number;
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
  error?: string | null;
  /** null khi profile_enabled = false. */
  profile?: SheetBackupStats | null;
  attendance?: SheetBackupStats | null;
  finalAttendance?: SheetBackupStats | null;
}

export interface BackupHistoryItem {
  id: number;
  configId: number;
  configName: string;
  programType: string;
  staffCode: string | null;
  staffName: string | null;
  triggerType: 'MANUAL' | 'AUTO';
  status: 'SUCCESS' | 'FAILED';
  mode: 'DELTA' | 'FULL';
  syncedToGoogleSheet: boolean;
  localFilePath: string;
  totalStudents: number;
  unchangedRows: number;
  updatedRows: number;
  appendedRows: number;
  updatedCellsCount: number;
  attendanceCellsWritten: number;
  durationMs: number;
  durationSec: number;
  backedUpAt: string;
  createdAt: string;
  error: string | null;
  profile: SheetBackupStats | null;
  attendance: SheetBackupStats | null;
  finalAttendance: SheetBackupStats | null;
}

export interface BackupHistoryBatch {
  batchId: string;
  triggerType: 'MANUAL' | 'AUTO';
  mode: 'DELTA' | 'FULL';
  startedAt: string;
  durationMs: number;
  durationSec: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  totalConfigs: number;
  successConfigs: number;
  failedConfigs: number;
  successCount: number;
  failedCount: number;
  totalStudents: number;
  updatedCellsCount: number;
  attendanceCellsWritten: number;
  items: BackupHistoryItem[];
}

export function normalizeProgramType(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

function translateFormulaRow(formula: string, fromRow: number, toRow: number): string {
  return formula.replace(/([A-Z]{1,3})(\d+)/g, (whole, col, digits) => {
    const rowNum = parseInt(digits, 10);
    if (rowNum === fromRow) return `${col}${toRow}`;
    return whole;
  });
}

function buildBatchId(date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `#BK-${mm}${dd}-${hh}${min}`;
}

async function loadEnrollments(csUserId: number, programType: string) {
  return prisma.enrollment.findMany({
    where: { cs_id: csUserId, program_type: programType },
    include: {
      student: true,
      package: true,
      cs: { select: { id: true, name: true, staff_code: true } },
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

async function loadTeacherEnrollments(teacherId: number) {
  return prisma.enrollment.findMany({
    where: {
      enrollment_classes: {
        some: {
          class: {
            class_teachers: {
              some: { teacher_id: teacherId },
            },
          },
        },
      },
    },
    include: {
      student: true,
      package: true,
      cs: { select: { id: true, name: true, staff_code: true } },
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

let templateYearsCache: Promise<number[]> | null = null;

async function getTemplateYears(): Promise<number[]> {
  if (!templateYearsCache) {
    templateYearsCache = (async () => {
      try {
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

type AttendanceWriteMode = 'CS' | 'FINAL' | 'TEACHER';

interface FinalMetaEntry {
  final_sheet_name?: string;
  final_header_row?: number;
  final_enabled?: boolean;
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
    if (isTeacherProgramType(programType)) return '2026 スケジュール';
    return DEFAULT_SHEET_NAME_BY_PROGRAM[normalizeProgramType(programType)] || 'Chấm buổi';
  }

  public relativeBackupPathFor(staffLabel: string, programType: string): string {
    if (isTeacherProgramType(programType)) {
      const code = programType.toUpperCase().startsWith('GV:')
        ? programType.slice(3).trim() || staffLabel
        : staffLabel;
      return `backups/giao_vien/diem_danh_gv_${code}.xlsx`;
    }
    const slug = normalizeProgramType(programType).toLowerCase() || 'cham_buoi';
    return `backups/cskh/hoc_vien_${slug}_${staffLabel}.xlsx`;
  }

  /* --------------------------- A. Config bootstrap ----------------------- */

  /**
   * Đảm bảo:
   *  - Mỗi CSKH đang hoạt động có đúng 2 config (JLPT + KAIWA).
   *  - Mỗi Giáo viên (Teacher.active = true) có 1 config backup điểm danh GV (`2026 スケジュール`).
   */
  public async ensureConfigs(): Promise<void> {
    const allUsers = await prisma.user.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
    const csUsers = allUsers.filter((u) => {
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      return roles.includes('CS') || Boolean(u.staff_code && u.staff_code.toUpperCase().startsWith('CVHT'));
    });

    const fallbackOwner =
      allUsers.find((u) => Array.isArray(u.roles) && (u.roles as string[]).includes('ADMIN')) ||
      allUsers[0] ||
      null;

    const existing = await prisma.programSheetBackupConfig.findMany({
      select: { id: true, cs_user_id: true, program_type: true, local_backup_path: true },
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
            if (err?.code !== 'P2002') {
              log.warn('ensureConfigs: không tạo được config CS', {
                cs_user_id: user.id,
                program_type: program,
                error: err?.message || String(err),
              });
            }
          });
        seen.add(key);
      }
    }

    // Teacher configs
    try {
      const teachers = await (prisma as any).teacher?.findMany?.({
        where: { active: true },
        orderBy: { id: 'asc' },
      });
      if (Array.isArray(teachers) && teachers.length > 0 && fallbackOwner) {
        const existingTeacherCodes = new Set<string>();
        for (const c of existing) {
          const pt = normalizeProgramType(c.program_type);
          if (pt.startsWith('GV:')) existingTeacherCodes.add(pt.slice(3).toUpperCase());
          const m = String(c.local_backup_path || '').match(/diem_danh_gv_([^.\/\\]+)\.xlsx$/i);
          if (m) existingTeacherCodes.add(m[1].toUpperCase());
        }

        for (const teacher of teachers) {
          const tCode = String(teacher.code || `GV${teacher.id}`).trim();
          if (existingTeacherCodes.has(tCode.toUpperCase())) continue;

          const ownerUserId: number = teacher.user_id ? Number(teacher.user_id) : fallbackOwner.id;
          const programTypeForDb = teacher.user_id
            ? 'TEACHER'
            : `GV:${tCode}`.slice(0, 20);
          const key = `${ownerUserId}::${normalizeProgramType(programTypeForDb)}`;
          if (seen.has(key)) continue;

          await prisma.programSheetBackupConfig
            .create({
              data: {
                cs_user_id: ownerUserId,
                program_type: programTypeForDb,
                name: `Backup Điểm danh GV - ${tCode} (${teacher.name || tCode})`,
                local_backup_path: `backups/giao_vien/diem_danh_gv_${tCode}.xlsx`,
                sheet_name: '2026 スケジュール',
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
                profile_sheet_name: '',
                profile_header_row: 2,
                profile_enabled: false,
              });
            })
            .catch((err: any) => {
              if (err?.code !== 'P2002') {
                log.warn('ensureConfigs: không tạo được config GV', {
                  teacher: tCode,
                  error: err?.message || String(err),
                });
              }
            });

          seen.add(key);
          existingTeacherCodes.add(tCode.toUpperCase());
        }
      }
    } catch {
      /* ignore if teacher table is mocked out in unit tests */
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

  private async loadFinalMetaMap(): Promise<Record<string, FinalMetaEntry>> {
    try {
      const row = await prisma.appSetting?.findUnique?.({ where: { key: FINAL_META_SETTING_KEY } });
      if (row && row.value && typeof row.value === 'object') {
        return row.value as Record<string, FinalMetaEntry>;
      }
    } catch {
      /* ignore */
    }
    return {};
  }

  private async saveFinalMetaPatch(id: number, patch: FinalMetaEntry): Promise<void> {
    try {
      const current = await this.loadFinalMetaMap();
      const prev = current[String(id)] || {};
      const next: Record<string, FinalMetaEntry> = {
        ...current,
        [String(id)]: {
          ...prev,
          ...(patch.final_sheet_name !== undefined ? { final_sheet_name: patch.final_sheet_name } : {}),
          ...(patch.final_header_row !== undefined ? { final_header_row: patch.final_header_row } : {}),
          ...(patch.final_enabled !== undefined ? { final_enabled: patch.final_enabled } : {}),
        },
      };
      await prisma.appSetting?.upsert?.({
        where: { key: FINAL_META_SETTING_KEY },
        update: { value: next as unknown as Prisma.InputJsonValue },
        create: { key: FINAL_META_SETTING_KEY, value: next as unknown as Prisma.InputJsonValue },
      });
    } catch (err: any) {
      log.warn('saveFinalMetaPatch warning', { id, error: err?.message });
    }
  }

  /** Tra cứu bản ghi Teacher gắn với 1 config Giáo viên. */
  private resolveTeacherForConfig(
    cfg: { cs_user_id: number; program_type: string; local_backup_path?: string | null; name?: string | null },
    teachers: Array<{ id: number; code: string; name: string; email: string | null; user_id: number | null }>
  ): { id: number; code: string; name: string; email: string | null; user_id: number | null } | null {
    const rawPt = String(cfg.program_type || '').trim();
    if (rawPt.toUpperCase().startsWith('GV:')) {
      const code = rawPt.slice(3).trim().toUpperCase();
      const byCode = teachers.find((t) => t.code.toUpperCase() === code);
      if (byCode) return byCode;
    }
    const byUser = teachers.find((t) => t.user_id && Number(t.user_id) === Number(cfg.cs_user_id));
    if (byUser) return byUser;

    const pathMatch = String(cfg.local_backup_path || '').match(/diem_danh_gv_([^.\/\\]+)\.xlsx$/i);
    if (pathMatch) {
      const code = pathMatch[1].toUpperCase();
      const byPath = teachers.find((t) => t.code.toUpperCase() === code);
      if (byPath) return byPath;
    }
    return null;
  }

  /* ------------------------------- B. Listing ---------------------------- */

  private toConfigItem(
    cfg: any,
    counts: { total: number; attending: number },
    profileMeta?: { profile_sheet_name: string | null; profile_header_row: number | null; profile_enabled: number | boolean | null } | null,
    finalMeta?: FinalMetaEntry | null,
    teacher?: { id: number; code: string; name: string; email: string | null; user_id: number | null } | null
  ): ProgramBackupConfigItem {
    const rawProgram = normalizeProgramType(cfg.program_type);
    const isTeacher = isTeacherProgramType(rawProgram);
    const apiProgramType = isTeacher ? 'TEACHER' : rawProgram;

    const staffCode = isTeacher
      ? teacher?.code || (rawProgram.startsWith('GV:') ? rawProgram.slice(3) : cfg.cs_user?.staff_code || 'GV')
      : cfg.cs_user?.staff_code || null;

    const relPath =
      cfg.local_backup_path ||
      this.relativeBackupPathFor(staffCode || `CS${cfg.cs_user_id}`, rawProgram);
    const scheduleTimes =
      Array.isArray(cfg.schedule_times) && cfg.schedule_times.length > 0
        ? (cfg.schedule_times as string[]).map(String)
        : [...DEFAULT_SCHEDULE_TIMES];

    const profileEnabled = isTeacher
      ? false
      : profileMeta?.profile_enabled === undefined || profileMeta?.profile_enabled === null
        ? cfg.profile_enabled === undefined
          ? true
          : Boolean(cfg.profile_enabled)
        : Boolean(Number(profileMeta.profile_enabled));

    const finalEnabled = isTeacher
      ? false
      : finalMeta?.final_enabled === undefined
        ? true
        : Boolean(finalMeta.final_enabled);

    return {
      id: cfg.id,
      cs_user_id: cfg.cs_user_id,
      program_type: apiProgramType,
      name: cfg.name,
      target_spreadsheet_url: cfg.target_spreadsheet_url ?? null,
      target_spreadsheet_id: cfg.target_spreadsheet_id ?? null,
      local_backup_path: relPath.replace(/\\/g, '/'),
      sheet_name: cfg.sheet_name || this.defaultSheetNameFor(rawProgram),
      header_row: cfg.header_row || 2,
      profile_sheet_name: isTeacher
        ? ''
        : profileMeta?.profile_sheet_name ?? cfg.profile_sheet_name ?? defaultProfileSheetFor(rawProgram),
      profile_header_row:
        Number(profileMeta?.profile_header_row ?? cfg.profile_header_row) || defaultProfileHeaderRowFor(rawProgram),
      profile_enabled: profileEnabled,
      final_sheet_name: finalMeta?.final_sheet_name || DEFAULT_FINAL_SHEET_NAME,
      final_header_row: Number(finalMeta?.final_header_row) || DEFAULT_FINAL_HEADER_ROW,
      final_enabled: finalEnabled,
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
      cs_user: isTeacher
        ? {
            id: teacher?.user_id || cfg.cs_user_id,
            name: teacher?.name || cfg.name,
            email: teacher?.email || cfg.cs_user?.email || '',
            staff_code: staffCode || 'GV',
          }
        : {
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
   * Liệt kê config theo vai trò:
   *  - ADMIN / MANAGE: thấy toàn bộ (CS + GV)
   *  - CS: thấy các config CS của mình (JLPT, KAIWA)
   *  - TEACHER: thấy config GV của mình
   */
  public async listConfigs(actor: {
    id: number;
    roles: string[];
  }): Promise<{ configs: ProgramBackupConfigItem[]; serviceAccount: ServiceAccountInfo; availableYears: number[] }> {
    await this.ensureConfigs();
    const { info: serviceAccount } = await this.sheetSyncService.getServiceAccountKey();

    const isAdminOrManage = actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE');
    const isTeacherRole = actor.roles.includes('TEACHER') && !actor.roles.includes('CS') && !isAdminOrManage;
    const isCsOnlyRole = actor.roles.includes('CS') && !actor.roles.includes('TEACHER') && !isAdminOrManage;

    const whereClause = isAdminOrManage ? {} : { cs_user_id: actor.id };

    const [rawConfigsAll, allTeachers] = await Promise.all([
      prisma.programSheetBackupConfig.findMany({
        where: whereClause,
        include: {
          cs_user: { select: { id: true, name: true, email: true, staff_code: true } },
        },
        orderBy: [{ cs_user_id: 'asc' }, { program_type: 'asc' }],
      }),
      (prisma as any).teacher?.findMany?.({
        where: { active: true },
        select: { id: true, code: true, name: true, email: true, user_id: true },
      }) || Promise.resolve([]),
    ]);

    const teachersList: Array<{ id: number; code: string; name: string; email: string | null; user_id: number | null }> =
      Array.isArray(allTeachers) ? allTeachers : [];

    const rawConfigs = rawConfigsAll.filter((c) => {
      if (isAdminOrManage) return true;
      const isT = isTeacherProgramType(c.program_type);
      if (isTeacherRole) return isT;
      if (isCsOnlyRole) return !isT;
      return true;
    });

    // student_counts per (cs, program) + per teacher
    const csUserIds = [...new Set(rawConfigs.filter((c) => !isTeacherProgramType(c.program_type)).map((c) => c.cs_user_id))];
    const programNames = ['JLPT', 'KAIWA'];
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

    // Teacher student counts
    const countsByTeacherId = new Map<number, { total: number; attending: number }>();
    const hasTeacherConfigs = rawConfigs.some((c) => isTeacherProgramType(c.program_type));
    if (hasTeacherConfigs && teachersList.length > 0) {
      try {
        const teacherEnrollments = await prisma.enrollment.findMany({
          where: {
            enrollment_classes: {
              some: {
                class: {
                  class_teachers: {
                    some: { teacher_id: { in: teachersList.map((t) => t.id) } },
                  },
                },
              },
            },
          },
          select: {
            id: true,
            status: true,
            enrollment_classes: {
              select: {
                class: {
                  select: {
                    class_teachers: { select: { teacher_id: true } },
                  },
                },
              },
            },
          },
        });
        for (const t of teachersList) countsByTeacherId.set(t.id, { total: 0, attending: 0 });
        for (const enr of teacherEnrollments) {
          const tIds = new Set<number>();
          for (const ec of enr.enrollment_classes || []) {
            for (const ct of ec.class?.class_teachers || []) {
              tIds.add(ct.teacher_id);
            }
          }
          const isAttending =
            enr.status === EnrollmentStatus.STUDYING ||
            enr.status === EnrollmentStatus.WAITING_CLASS ||
            enr.status === EnrollmentStatus.UPCOMING;
          for (const tid of tIds) {
            const b = countsByTeacherId.get(tid);
            if (!b) continue;
            b.total++;
            if (isAttending) b.attending++;
          }
        }
      } catch {
        /* ignore if relation mocked out */
      }
    }

    // availableYears = template row 1 (2025,2026,...) ∪ năm các buổi học của HV
    const years = new Set<number>(await getTemplateYears());
    years.add(new Date().getFullYear());
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

    const [profileMetaMap, finalMetaMap] = await Promise.all([
      this.loadProfileMetaMap(rawConfigs.map((c) => c.id)),
      this.loadFinalMetaMap(),
    ]);

    return {
      configs: rawConfigs.map((cfg) => {
        const isT = isTeacherProgramType(cfg.program_type);
        const teacher = isT ? this.resolveTeacherForConfig(cfg, teachersList) : null;
        const counts = isT
          ? (teacher && countsByTeacherId.get(teacher.id)) || { total: 0, attending: 0 }
          : countsByScope.get(`${cfg.cs_user_id}::${normalizeProgramType(cfg.program_type)}`) || {
              total: 0,
              attending: 0,
            };
        return this.toConfigItem(
          cfg,
          counts,
          profileMetaMap.get(cfg.id) || null,
          finalMetaMap[String(cfg.id)] || null,
          teacher
        );
      }),
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
    const finalPatch: FinalMetaEntry = {};

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
    if (dto.final_sheet_name !== undefined) {
      finalPatch.final_sheet_name = String(dto.final_sheet_name || '').trim() || DEFAULT_FINAL_SHEET_NAME;
    }
    if (dto.final_header_row !== undefined) {
      const fhr = Number(dto.final_header_row);
      if (!Number.isInteger(fhr) || fhr < 1 || fhr > 20) {
        throw new AppError(400, 'final_header_row không hợp lệ (1..20)');
      }
      finalPatch.final_header_row = fhr;
    }
    if (dto.final_enabled !== undefined) {
      finalPatch.final_enabled = Boolean(dto.final_enabled);
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
    if (Object.keys(finalPatch).length > 0) {
      await this.saveFinalMetaPatch(id, finalPatch);
    }

    const cfg = await prisma.programSheetBackupConfig.findUnique({
      where: { id },
      include: { cs_user: { select: { id: true, name: true, email: true, staff_code: true } } },
    });
    if (!cfg) throw new AppError(404, 'Không tìm thấy cấu hình sao lưu sau khi cập nhật');

    const [counts, profileMetaMap, finalMetaMap, allTeachers] = await Promise.all([
      this.countsForConfig(cfg.cs_user_id, cfg.program_type),
      this.loadProfileMetaMap([cfg.id]),
      this.loadFinalMetaMap(),
      (prisma as any).teacher?.findMany?.({
        where: { active: true },
        select: { id: true, code: true, name: true, email: true, user_id: true },
      }) || Promise.resolve([]),
    ]);
    const teacher = isTeacherProgramType(cfg.program_type)
      ? this.resolveTeacherForConfig(cfg, Array.isArray(allTeachers) ? allTeachers : [])
      : null;
    return this.toConfigItem(
      cfg,
      counts,
      profileMetaMap.get(cfg.id) || null,
      finalMetaMap[String(cfg.id)] || null,
      teacher
    );
  }

  private async countsForConfig(csUserId: number, programType: string): Promise<{ total: number; attending: number }> {
    if (isTeacherProgramType(programType)) {
      return { total: 0, attending: 0 };
    }
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

  /** Tháng thực sự có buổi học của các enrollment đang xét (lọc theo year & mode). */
  private scopedMonths(
    enrollments: Awaited<ReturnType<typeof loadEnrollments>>,
    year: number | null,
    mode?: AttendanceWriteMode
  ): Array<{ year: number; month: number }> {
    const keys = new Set<string>();
    for (const enr of enrollments) {
      for (const ec of enr.enrollment_classes) {
        for (const att of ec.attendance || []) {
          if (att.deleted_at) continue;
          if (!this.shouldIncludeAttendanceForMode(att, mode)) continue;
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

  /**
   * Kiểm tra một bản ghi điểm danh có thuộc nguồn dữ liệu của sheet đang ghi hay không:
   *  - 'CS': ưu tiên `cs_status !== null`; nếu cả `cs_status` và `teacher_status` đều `undefined`
   *    (ví dụ dữ liệu fixture/legacy chưa tách cột), fallback sang `status !== null`.
   *  - 'FINAL': chỉ ghi bản ghi đã đối soát (`MATCHED` hoặc `RESOLVED`).
   *  - 'TEACHER': chỉ ghi bản ghi có `teacher_status !== null` (fallback `status` nếu cả hai undefined).
   */
  private shouldIncludeAttendanceForMode(att: any, mode?: AttendanceWriteMode): boolean {
    if (!att || att.deleted_at) return false;
    if (!mode) return true;

    const hasDualFields = att.cs_status !== undefined || att.teacher_status !== undefined;

    if (mode === 'CS') {
      if (hasDualFields) return att.cs_status !== null && att.cs_status !== undefined;
      return Boolean(att.status);
    }
    if (mode === 'FINAL') {
      return (
        att.reconciliation_state === ReconciliationState.MATCHED ||
        att.reconciliation_state === ReconciliationState.RESOLVED
      );
    }
    if (mode === 'TEACHER') {
      if (hasDualFields) return att.teacher_status !== null && att.teacher_status !== undefined;
      return Boolean(att.status);
    }
    return true;
  }

  private effectiveStatusForMode(att: any, mode: AttendanceWriteMode): AttendanceStatus | null {
    if (!att) return null;
    const hasDualFields = att.cs_status !== undefined || att.teacher_status !== undefined;
    if (mode === 'CS') {
      return (hasDualFields ? att.cs_status : att.status) || null;
    }
    if (mode === 'TEACHER') {
      return (hasDualFields ? att.teacher_status : att.status) || null;
    }
    return att.status || null;
  }

  /**
   * Giá trị ghi vào 1 cột ngày theo chế độ sheet:
   *  - 'CS': nếu `cs_raw_value` có sẵn thì dùng `cs_raw_value.trim()`; ngược lại ATTENDED -> '1', nghỉ -> A..E.
   *  - 'FINAL': giống hệ thống hiện tại (`status === 'ATTENDED'` -> `lesson_topic || '1'`, nghỉ -> A..E).
   *  - 'TEACHER': giống hệ thống hiện tại (`teacher_status === 'ATTENDED'` -> `lesson_topic || '1'`, nghỉ -> A..E).
   */
  private attendanceCellValueForMode(att: any, mode: AttendanceWriteMode): string {
    if (!att || !this.shouldIncludeAttendanceForMode(att, mode)) return '';
    const status = this.effectiveStatusForMode(att, mode);
    if (!status) return '';

    if (mode === 'CS') {
      const raw = String(att.cs_raw_value ?? '').trim();
      if (raw) return raw;
      switch (status) {
        case AttendanceStatus.ATTENDED:
          return '1';
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

    // Mode 'FINAL' & 'TEACHER': ghi theo hệ thống hiện tại (lesson_topic || '1', hoặc A/B/C/D/E)
    switch (status) {
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
   * Dựng 1 block tháng mới ở cuối sheet (chỉ dùng khi template/baseline KHÔNG có
   * block đó).
   */
  private appendMonthBlock(
    ws: ExcelJS.Worksheet,
    afterBlock: AttendanceMonthBlock | null,
    templateBlock: AttendanceMonthBlock,
    year: number,
    month: number,
    headerRow: number,
    fixedLastColForProgram: number
  ): AttendanceMonthBlock {
    const startCol = afterBlock ? afterBlock.endCol + 1 : fixedLastColForProgram + 1;
    const donor = templateBlock.summaryCols;

    const summaryCols: AttendanceMonthBlock['summaryCols'] = {};
    let cursor = startCol;
    if (donor.completedHours !== undefined) {
      summaryCols.completedHours = cursor++;
    }
    summaryCols.attended = cursor++;
    const donorKeys = (Object.keys(donor) as Array<keyof AttendanceSummaryCols>).filter(
      (k) => k !== 'attended' && k !== 'completedHours' && donor[k] !== undefined
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

    ws.getRow(1).getCell(startCol).value = `THÁNG ${this.pad2(month)}/${year}`;

    const headerRowObj = ws.getRow(headerRow);
    for (const key of Object.keys(summaryCols) as Array<keyof AttendanceSummaryCols>) {
      const col = summaryCols[key];
      if (col) headerRowObj.getCell(col).value = SUMMARY_HEADERS[key] || '';
    }
    for (const d of dailyCols) {
      headerRowObj.getCell(d.colNumber).value = this.excelDay(year, month, d.day);
    }

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
      if (!col || !code || key === 'attended' || key === 'completedHours') continue;
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

  private cellCurrentText(cell: ExcelJS.Cell): string {
    const raw: any = cell.value;
    if (raw && typeof raw === 'object' && (raw.formula || raw.sharedFormula)) {
      if (raw.result === undefined || raw.result === null) return '';
      return normalizeCellComparable(raw.result);
    }
    return normalizeCellComparable(raw);
  }

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
    let consumedSessions = 0;
    let consumedInScopedYear = 0;
    let absentACount = 0;
    let leaveBCount = 0;
    let absentCCount = 0;
    let teacherDCount = 0;
    let techErrorECount = 0;
    let nonDeletedWebRows = 0;

    for (const ec of enr.enrollment_classes) {
      for (const att of ec.attendance || []) {
        if (att.deleted_at) continue;
        nonDeletedWebRows++;
        const dayKey = dateKeyUtc(att.class_session?.session_date);
        const inScopedYear = yearFilter === null || (dayKey && Number(dayKey.slice(0, 4)) === yearFilter);

        if (isConsumedAttendance(att)) {
          consumedSessions++;
          if (inScopedYear) consumedInScopedYear++;
        }

        switch (att.status) {
          case AttendanceStatus.ABSENT_UNAPPROVED_C:
            absentCCount++;
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
    const hasWebAttendance = nonDeletedWebRows > 0;

    const remainingSessions = hasWebAttendance
      ? totalSessions - consumedSessions
      : enr.external_remaining_sessions !== null && enr.external_remaining_sessions !== undefined
        ? Number(enr.external_remaining_sessions)
        : Math.max(0, totalSessions - attendedPrevYears);

    return {
      attendedCurrentYear: hasWebAttendance
        ? consumedInScopedYear
        : Math.max(0, totalSessions - attendedPrevYears - remainingSessions),
      attendedAllTime: hasWebAttendance
        ? attendedPrevYears + consumedSessions
        : Math.max(0, totalSessions - remainingSessions),
      remainingSessions,
      absentACount,
      leaveBCount,
      absentCCount,
      teacherDCount,
      techErrorECount,
    };
  }

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
    batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }>,
    headerRangesBySheet: Map<string, Array<{ range: string; values: GoogleSafeValue[][] }>>
  ): SheetBackupStats {
    const firstDataRow = headerRow + 1;
    const enabledCols = getEnabledColumns(profileCfg);
    const maxConfiguredCol = enabledCols.reduce((m, c) => Math.max(m, c.col), profileMaxCol || 52);

    this.captureSheetHeaderRanges(ws, headerRow, maxConfiguredCol, headerRangesBySheet);

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
        csStaffCode: config.cs_user.staff_code || (enr as any).cs?.staff_code || null,
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
   * Ghi 1 sheet Điểm danh (`3.Chấm buổi`, `Chấm buổi`, `Điểm danh chốt`, hoặc `2026 スケジュール`)
   * theo chế độ nguồn điểm danh `mode` ('CS' | 'FINAL' | 'TEACHER').
   */
  private async runAttendanceSheetBackup(opts: {
    ws: ExcelJS.Worksheet;
    headerRow: number;
    initialMaxCol: number;
    sheetCfg: SheetColumnMappingConfig;
    defaultFixedLastCol: number;
    enrollments: Awaited<ReturnType<typeof loadEnrollments>>;
    config: { cs_user: { staff_code: string | null }; mask_sensitive_data: boolean };
    yearFilter: number | null;
    mode: AttendanceWriteMode;
    teacherIdFilter?: number | null;
    batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }>;
    headerRangesBySheet: Map<string, Array<{ range: string; values: GoogleSafeValue[][] }>>;
  }): Promise<SheetBackupStats> {
    const {
      ws,
      headerRow,
      initialMaxCol,
      sheetCfg,
      defaultFixedLastCol,
      enrollments,
      config,
      yearFilter,
      mode,
      teacherIdFilter,
      batchRanges,
      headerRangesBySheet,
    } = opts;

    const months = this.scopedMonths(enrollments, yearFilter, mode);
    const monthSet = new Set(months.map((m) => `${m.year}-${m.month}`));

    const blocks = detectJlptMonthBlocks(ws, headerRow).sort((a, b) => a.startCol - b.startCol);

    let donor: AttendanceMonthBlock | null = blocks[blocks.length - 1] || null;
    if (!donor && months.length > 0) {
      try {
        const tpl = await readTemplateAttendanceWorksheet(
          ws.name,
          mode === 'TEACHER' ? 'TEACHER' : 'JLPT'
        );
        const tplBlocks = detectJlptMonthBlocks(tpl, headerRow);
        donor = tplBlocks[tplBlocks.length - 1] || null;
      } catch {
        donor = null;
      }
    }

    const enabledAttCols = getEnabledColumns(sheetCfg);
    const fixedLastCol = enabledAttCols.reduce((m, c) => Math.max(m, c.col), defaultFixedLastCol);

    let tail: AttendanceMonthBlock | null = blocks[blocks.length - 1] || null;
    if (donor) {
      for (const m of months) {
        if (blocks.some((b) => b.year === m.year && b.month === m.month)) continue;
        const created = this.appendMonthBlock(
          ws,
          tail,
          donor,
          m.year,
          m.month,
          headerRow,
          fixedLastCol
        );
        blocks.push(created);
        tail = created;
      }
      blocks.sort((a, b) => a.startCol - b.startCol);
    }

    const lastCol = Math.max(initialMaxCol, tail ? tail.endCol : 0, fixedLastCol);
    const firstDataRow = headerRow + 1;

    this.captureSheetHeaderRanges(ws, headerRow, lastCol, headerRangesBySheet);

    const indexed = this.indexSheetRowsByMapping(ws, headerRow, sheetCfg);
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

      const matchingEc = teacherIdFilter
        ? enr.enrollment_classes.find((ec) =>
            ec.class?.class_teachers?.some((ct) => ct.teacher_id === teacherIdFilter)
          )
        : null;
      const activeEc =
        matchingEc ||
        enr.enrollment_classes.find((ec) => ec.status === 'ACTIVE') ||
        enr.enrollment_classes[enr.enrollment_classes.length - 1] ||
        null;
      const cls = activeEc?.class || null;
      const schedule = cls?.class_schedules.find((sc) => sc.active) || cls?.class_schedules[0] || null;
      const mainCt =
        (teacherIdFilter
          ? cls?.class_teachers.find((ct) => ct.teacher_id === teacherIdFilter)
          : null) ||
        cls?.class_teachers.find((ct) => ct.role === 'MAIN' && ct.active) ||
        cls?.class_teachers[0] ||
        null;
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
        csStaffCode: config.cs_user.staff_code || (enr as any).cs?.staff_code || null,
        maskSensitiveData: Boolean(config.mask_sensitive_data),
        stats,
        careByMilestone,
      };

      // Điểm danh theo ngày (UTC key cho @db.Date) lọc theo đúng nguồn mode
      const byDay = new Map<string, any>();
      for (const ec of enr.enrollment_classes) {
        if (teacherIdFilter && !ec.class?.class_teachers?.some((ct) => ct.teacher_id === teacherIdFilter)) {
          continue;
        }
        for (const att of ec.attendance || []) {
          if (!this.shouldIncludeAttendanceForMode(att, mode)) continue;
          const dayKey = dateKeyUtc(att.class_session?.session_date);
          if (dayKey) byDay.set(dayKey, att);
        }
      }

      const key = this.buildEnrollmentRowKey(sheetCfg, ctx, externalId);
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

      // --- Vùng cột cố định ---
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
      const sessionHours = (Number(schedule?.duration_minutes) || 30) / 60;
      for (const block of blocks) {
        const mk = `${block.year}-${block.month}`;
        if (!monthSet.has(mk)) continue;
        rowMaxColWritten = Math.max(rowMaxColWritten, block.endCol);

        let mAttendedCount = 0;
        let mA = 0;
        let mB = 0;
        let mC = 0;
        let mD = 0;
        let mE = 0;

        for (const d of block.dailyCols) {
          const att = byDay.get(d.date);
          const desired = this.attendanceCellValueForMode(att, mode);
          const effStatus = this.effectiveStatusForMode(att, mode);
          if (att && effStatus) {
            switch (effStatus) {
              case AttendanceStatus.ATTENDED:
                mAttendedCount++;
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

        const completedHoursVal = Math.round(mAttendedCount * sessionHours * 100) / 100;
        const summaryCounts: Array<[keyof NonNullable<AttendanceMonthBlock['summaryCols']>, number]> = [
          ['completedHours', completedHoursVal],
          ['attended', mAttendedCount],
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

    return {
      sheetName: ws.name,
      totalEnrollments: enrollments.length,
      unchangedRows,
      updatedRows,
      appendedRows,
      updatedCellsCount,
      attendanceCellsWritten,
    };
  }

  private captureSheetHeaderRanges(
    ws: ExcelJS.Worksheet,
    headerRow: number,
    maxCol: number,
    headerRangesBySheet: Map<string, Array<{ range: string; values: GoogleSafeValue[][] }>>
  ): void {
    const rows: GoogleSafeValue[][] = [];
    for (let r = 1; r <= headerRow; r++) {
      rows.push(this.readRowValues(ws.getRow(r), maxCol));
    }
    headerRangesBySheet.set(ws.name, [
      {
        range: `'${ws.name}'!A1:${colNumberToLetter(maxCol)}${headerRow}`,
        values: rows,
      },
    ]);
  }

  /**
   * Chạy backup cho MỘT config (CSKH x chương trình hoặc Giáo viên).
   * Thứ tự ưu tiên năm: opts.year > config.backup_year > tất cả.
   */
  public async runBackupForConfig(
    configId: number,
    opts: {
      forceFullRewrite?: boolean;
      year?: number | null;
      actorId?: number;
      actorRoles?: string[];
      batchId?: string;
      triggerType?: 'MANUAL' | 'AUTO';
    } = {}
  ): Promise<ProgramBackupSummary> {
    const startMs = Date.now();
    await this.ensureConfigs();
    const config = await this.loadConfigOrThrow(configId);
    this.assertConfigScope(config, opts.actorId, opts.actorRoles);

    const rawProgramType = normalizeProgramType(config.program_type);
    const isTeacher = isTeacherProgramType(rawProgramType);
    const programType = isTeacher ? 'TEACHER' : rawProgramType;
    const yearFilter = opts.year === undefined || opts.year === null ? (config.backup_year ?? null) : opts.year;
    const forceFullRewrite = Boolean(opts.forceFullRewrite);
    const batchId = opts.batchId || buildBatchId();
    const triggerType: 'MANUAL' | 'AUTO' = opts.triggerType || (opts.actorId ? 'MANUAL' : 'AUTO');
    const mode: 'DELTA' | 'FULL' = forceFullRewrite ? 'FULL' : 'DELTA';

    const [columnConfigMap, profileMetaMap, finalMetaMap, allTeachers] = await Promise.all([
      getGlobalBackupColumnConfig(),
      this.loadProfileMetaMap([config.id]),
      this.loadFinalMetaMap(),
      isTeacher
        ? (prisma as any).teacher?.findMany?.({
            where: { active: true },
            select: { id: true, code: true, name: true, email: true, user_id: true },
          }) || Promise.resolve([])
        : Promise.resolve([]),
    ]);

    const profileMeta = profileMetaMap.get(config.id) || null;
    const finalMeta = finalMetaMap[String(config.id)] || null;
    const teacherRecord = isTeacher
      ? this.resolveTeacherForConfig(config, Array.isArray(allTeachers) ? allTeachers : [])
      : null;

    const effectiveStaffCode = isTeacher
      ? teacherRecord?.code || (rawProgramType.startsWith('GV:') ? rawProgramType.slice(3) : config.cs_user.staff_code || 'GV')
      : config.cs_user.staff_code;

    const absPath = this.resolveLocalBackupPath(
      config.local_backup_path ||
        this.relativeBackupPathFor(effectiveStaffCode || `CS${config.cs_user_id}`, rawProgramType)
    );

    await prisma.programSheetBackupConfig.update({
      where: { id: config.id },
      data: { last_status: 'RUNNING', last_error: null },
    });

    try {
      const batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }> = [];
      const headerRangesBySheet = new Map<string, Array<{ range: string; values: GoogleSafeValue[][] }>>();

      let profileStats: SheetBackupStats | null = null;
      let attendanceStats: SheetBackupStats;
      let finalStats: SheetBackupStats | null = null;
      let totalStudents = 0;

      if (isTeacher) {
        // --- CHẾ ĐỘ TEACHER: 1 sheet `2026 スケジュール` ---
        const teacherSheetName = config.sheet_name || '2026 スケジュール';
        const teacherHeaderRow = config.header_row || 2;
        const teacherCols = getTeacherAttendanceColumnMapping();

        const enrollments = teacherRecord
          ? await loadTeacherEnrollments(teacherRecord.id)
          : [];
        totalStudents = enrollments.length;

        const wbLoaded = await loadOrExtractAttendanceWorkbook(
          absPath,
          teacherSheetName,
          teacherHeaderRow,
          forceFullRewrite,
          'TEACHER'
        );

        attendanceStats = await this.runAttendanceSheetBackup({
          ws: wbLoaded.worksheet,
          headerRow: teacherHeaderRow,
          initialMaxCol: wbLoaded.maxCol,
          sheetCfg: teacherCols,
          defaultFixedLastCol: 6,
          enrollments,
          config: {
            cs_user: { staff_code: effectiveStaffCode },
            mask_sensitive_data: Boolean(config.mask_sensitive_data),
          },
          yearFilter,
          mode: 'TEACHER',
          teacherIdFilter: teacherRecord?.id ?? null,
          batchRanges,
          headerRangesBySheet,
        });

        const dir = path.dirname(absPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        await wbLoaded.workbook.xlsx.writeFile(absPath);
      } else {
        // --- CHẾ ĐỘ CSKH (KAIWA / JLPT): 3 sheets (Hồ sơ + Chấm buổi CS + Điểm danh chốt) ---
        const programCols: ProgramColumnMappingConfig =
          programType === 'KAIWA' ? columnConfigMap.KAIWA : columnConfigMap.JLPT;

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

        const finalSheetName = finalMeta?.final_sheet_name || DEFAULT_FINAL_SHEET_NAME;
        const finalHeaderRow = Number(finalMeta?.final_header_row) || DEFAULT_FINAL_HEADER_ROW;
        const finalEnabled = finalMeta?.final_enabled === undefined ? true : Boolean(finalMeta.final_enabled);

        const enrollments = await loadEnrollments(config.cs_user_id, programType);
        totalStudents = enrollments.length;

        const wbLoaded = await loadOrExtractProgramWorkbook({
          absPath,
          programType,
          profileSheetName,
          profileHeaderRow,
          attendanceSheetName,
          attendanceHeaderRow,
          finalSheetName,
          finalHeaderRow,
          forceFresh: forceFullRewrite,
        });

        // 1. Sheet Hồ sơ
        if (profileEnabled && wbLoaded.profileWorksheet) {
          profileStats = this.runProfileSheetBackup(
            wbLoaded.profileWorksheet,
            profileHeaderRow,
            wbLoaded.profileMaxCol,
            programCols.profile,
            enrollments,
            config,
            yearFilter,
            batchRanges,
            headerRangesBySheet
          );
        }

        // 2. Sheet Chấm buổi của CSKH (chỉ ghi `cs_status !== null`)
        attendanceStats = await this.runAttendanceSheetBackup({
          ws: wbLoaded.attendanceWorksheet,
          headerRow: attendanceHeaderRow,
          initialMaxCol: wbLoaded.attendanceMaxCol,
          sheetCfg: programCols.attendance,
          defaultFixedLastCol: programType === 'KAIWA' ? 28 : FIXED_LAST_COL,
          enrollments,
          config,
          yearFilter,
          mode: 'CS',
          batchRanges,
          headerRangesBySheet,
        });

        // 3. Sheet Điểm danh chốt (chỉ ghi `MATCHED` / `RESOLVED`)
        if (finalEnabled && wbLoaded.finalWorksheet) {
          const finalCols = getFinalAttendanceColumnMapping();
          finalStats = await this.runAttendanceSheetBackup({
            ws: wbLoaded.finalWorksheet,
            headerRow: finalHeaderRow,
            initialMaxCol: wbLoaded.finalMaxCol || FIXED_LAST_COL,
            sheetCfg: finalCols,
            defaultFixedLastCol: FIXED_LAST_COL,
            enrollments,
            config,
            yearFilter,
            mode: 'FINAL',
            batchRanges,
            headerRangesBySheet,
          });
        }

        const dir = path.dirname(absPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        await wbLoaded.workbook.xlsx.writeFile(absPath);
      }

      // Đẩy delta lên Google Sheet (nếu có đích)
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
        await pushDeltaToGoogleSheet(targetId, auth.accessToken, batchRanges, headerRangesBySheet);
        syncedToGoogleSheet = true;
      }

      const durationMs = Math.max(1, Date.now() - startMs);
      const summary: ProgramBackupSummary = {
        configId: config.id,
        configName: config.name,
        batchId,
        triggerType,
        mode,
        durationMs,
        csUserId: config.cs_user_id,
        staffCode: effectiveStaffCode,
        programType,
        status: 'SUCCESS',
        syncedToGoogleSheet,
        localFilePath: path.relative(process.cwd(), absPath).replace(/\\/g, '/'),
        totalStudents,
        unchangedRows: attendanceStats.unchangedRows,
        updatedRows: attendanceStats.updatedRows,
        appendedRows: attendanceStats.appendedRows,
        updatedCellsCount:
          attendanceStats.updatedCellsCount +
          (profileStats?.updatedCellsCount ?? 0) +
          (finalStats?.updatedCellsCount ?? 0),
        attendanceCellsWritten:
          (attendanceStats.attendanceCellsWritten ?? 0) + (finalStats?.attendanceCellsWritten ?? 0),
        yearFilter,
        backedUpAt: new Date().toISOString(),
        profile: profileStats,
        attendance: attendanceStats,
        finalAttendance: finalStats,
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
      const durationMs = Math.max(1, Date.now() - startMs);
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
            after_data: {
              configId: config.id,
              configName: config.name,
              batchId,
              triggerType,
              mode,
              durationMs,
              csUserId: config.cs_user_id,
              staffCode: effectiveStaffCode,
              programType,
              status: 'FAILED',
              error: message,
              backedUpAt: new Date().toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        })
        .catch(() => {});
      if (err instanceof AppError) throw err;
      throw new AppError(500, `Backup thất bại (${programType}/${effectiveStaffCode || config.cs_user_id}): ${message}`);
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
    opts: {
      forceFullRewrite?: boolean;
      year?: number | null;
      programType?: string | null;
      actorId?: number;
      triggerType?: 'MANUAL' | 'AUTO';
    } = {}
  ): Promise<{ results: ProgramBackupSummary[] }> {
    await this.ensureConfigs();
    const program = normalizeProgramType(opts.programType);

    const allConfigs = await prisma.programSheetBackupConfig.findMany({
      where: { enabled: true },
      include: { cs_user: { select: { staff_code: true } } },
      orderBy: [{ cs_user_id: 'asc' }, { program_type: 'asc' }],
    });

    const configs = allConfigs.filter((c) => {
      if (!program) return true;
      if (program === 'TEACHER') return isTeacherProgramType(c.program_type);
      return normalizeProgramType(c.program_type) === program;
    });

    const batchId = buildBatchId();
    const triggerType: 'MANUAL' | 'AUTO' = opts.triggerType || 'MANUAL';

    const results: ProgramBackupSummary[] = [];
    for (const cfg of configs) {
      try {
        const summary = await this.runBackupForConfig(cfg.id, {
          forceFullRewrite: opts.forceFullRewrite,
          year: opts.year,
          actorId: opts.actorId,
          batchId,
          triggerType,
        });
        results.push(summary);
      } catch (err: any) {
        results.push({
          configId: cfg.id,
          configName: cfg.name,
          batchId,
          triggerType,
          mode: opts.forceFullRewrite ? 'FULL' : 'DELTA',
          csUserId: cfg.cs_user_id,
          staffCode: cfg.cs_user?.staff_code || null,
          programType: isTeacherProgramType(cfg.program_type) ? 'TEACHER' : normalizeProgramType(cfg.program_type),
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
          error: err?.message || 'Backup thất bại',
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

    const rawProgramType = normalizeProgramType(config.program_type);
    const absPath = this.resolveLocalBackupPath(
      config.local_backup_path ||
        this.relativeBackupPathFor(config.cs_user.staff_code || `CS${config.cs_user_id}`, rawProgramType)
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

  /* --------------------------- E. Backup History -------------------------- */

  public async getBackupHistory(
    actor: { id: number; roles: string[] },
    query: { programType?: string; status?: string; fromDate?: string; toDate?: string; limit?: number } = {}
  ): Promise<{
    stats: {
      todayTotal: number;
      todaySuccess: number;
      todayFailed: number;
      lastRunTime: string | null;
    };
    batches: BackupHistoryBatch[];
    total: number;
  }> {
    const { configs } = await this.listConfigs(actor);
    const configById = new Map<number, ProgramBackupConfigItem>(configs.map((c) => [c.id, c]));
    const allowedConfigIds = new Set(configs.map((c) => c.id));

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const filterProgram = query.programType && query.programType !== 'ALL' ? normalizeProgramType(query.programType) : null;
    const filterStatus = query.status && query.status !== 'ALL' ? String(query.status).toUpperCase() : null;
    const fromDateStr = query.fromDate ? String(query.fromDate).slice(0, 10) : null;
    const toDateStr = query.toDate ? String(query.toDate).slice(0, 10) : null;

    const logs = await prisma.auditLog.findMany({
      where: {
        action: 'CS_PROGRAM_BACKUP',
        entity_type: 'ProgramSheetBackupConfig',
      },
      orderBy: { created_at: 'desc' },
      take: 400,
    });

    const items: Array<BackupHistoryItem & { batchId: string; triggerType: 'MANUAL' | 'AUTO' }> = [];
    const seenConfigIdsInLogs = new Set<number>();

    for (const row of logs) {
      const cfgId = Number(row.entity_id);
      if (!allowedConfigIds.has(cfgId)) continue;
      const cfg = configById.get(cfgId);
      const after = (row.after_data && typeof row.after_data === 'object' ? row.after_data : {}) as Record<string, any>;

      const programType = isTeacherProgramType(after.programType || cfg?.program_type)
        ? 'TEACHER'
        : normalizeProgramType(after.programType || cfg?.program_type || 'JLPT');

      const status: 'SUCCESS' | 'FAILED' = after.status === 'FAILED' ? 'FAILED' : 'SUCCESS';
      const backedUpAt = String(after.backedUpAt || row.created_at.toISOString());
      const dt = new Date(backedUpAt);
      const batchId = String(after.batchId || buildBatchId(isNaN(dt.getTime()) ? row.created_at : dt));
      const triggerType: 'MANUAL' | 'AUTO' = after.triggerType === 'AUTO' ? 'AUTO' : 'MANUAL';
      const mode: 'DELTA' | 'FULL' = after.mode === 'FULL' ? 'FULL' : 'DELTA';
      const durationMs = Number(after.durationMs || 850);
      const durationSec = Math.max(1, Math.round(durationMs / 1000));

      seenConfigIdsInLogs.add(cfgId);
      items.push({
        id: row.id,
        configId: cfgId,
        configName: String(after.configName || cfg?.name || `Config #${cfgId}`),
        programType,
        staffCode: after.staffCode ?? cfg?.cs_user?.staff_code ?? null,
        staffName: cfg?.cs_user?.name ?? null,
        status,
        mode,
        syncedToGoogleSheet: Boolean(after.syncedToGoogleSheet),
        localFilePath: String(after.localFilePath || cfg?.local_backup_path || ''),
        totalStudents: Number(after.totalStudents || 0),
        unchangedRows: Number(after.unchangedRows || 0),
        updatedRows: Number(after.updatedRows || 0),
        appendedRows: Number(after.appendedRows || 0),
        updatedCellsCount: Number(after.updatedCellsCount || 0),
        attendanceCellsWritten: Number(after.attendanceCellsWritten || 0),
        durationMs,
        durationSec,
        backedUpAt,
        createdAt: backedUpAt,
        error: after.error ? String(after.error) : null,
        profile: after.profile || null,
        attendance: after.attendance || null,
        finalAttendance: after.finalAttendance || null,
        batchId,
        triggerType,
      });
    }

    // Fallback từ các config đã có last_backup_at nhưng chưa có trong AuditLog
    for (const cfg of configs) {
      if (seenConfigIdsInLogs.has(cfg.id) || !cfg.last_backup_at) continue;
      const sum = (cfg.last_summary && typeof cfg.last_summary === 'object' ? cfg.last_summary : {}) as Record<string, any>;
      const status: 'SUCCESS' | 'FAILED' = cfg.last_status === 'FAILED' ? 'FAILED' : 'SUCCESS';
      const dt = new Date(cfg.last_backup_at);
      const iso = dt.toISOString();
      const durationMs = Number(sum.durationMs || 900);
      const durationSec = Math.max(1, Math.round(durationMs / 1000));
      items.push({
        id: -cfg.id,
        configId: cfg.id,
        configName: cfg.name,
        programType: cfg.program_type,
        staffCode: cfg.cs_user.staff_code,
        staffName: cfg.cs_user.name,
        status,
        mode: sum.mode === 'FULL' ? 'FULL' : 'DELTA',
        syncedToGoogleSheet: Boolean(sum.syncedToGoogleSheet),
        localFilePath: cfg.local_backup_path || '',
        totalStudents: Number(sum.totalStudents ?? cfg.student_counts.total ?? 0),
        unchangedRows: Number(sum.unchangedRows || 0),
        updatedRows: Number(sum.updatedRows || 0),
        appendedRows: Number(sum.appendedRows || 0),
        updatedCellsCount: Number(sum.updatedCellsCount || 0),
        attendanceCellsWritten: Number(sum.attendanceCellsWritten || 0),
        durationMs,
        durationSec,
        backedUpAt: iso,
        createdAt: iso,
        error: cfg.last_error || null,
        profile: sum.profile || null,
        attendance: sum.attendance || null,
        finalAttendance: sum.finalAttendance || null,
        batchId: String(sum.batchId || buildBatchId(dt)),
        triggerType: sum.triggerType === 'AUTO' ? 'AUTO' : 'MANUAL',
      });
    }

    // Tính stats hôm nay
    const now = new Date();
    const todayPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let todayTotal = 0;
    let todaySuccess = 0;
    let todayFailed = 0;
    let latestIso: string | null = null;

    for (const it of items) {
      if (!latestIso || it.backedUpAt > latestIso) latestIso = it.backedUpAt;
      const d = new Date(it.backedUpAt);
      const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (dayStr === todayPrefix) {
        todayTotal++;
        if (it.status === 'SUCCESS') todaySuccess++;
        else todayFailed++;
      }
    }

    let lastRunTime: string | null = null;
    if (latestIso) {
      const ld = new Date(latestIso);
      lastRunTime = isNaN(ld.getTime())
        ? latestIso
        : `${String(ld.getHours()).padStart(2, '0')}:${String(ld.getMinutes()).padStart(2, '0')}`;
    }

    // Lọc theo query
    const filteredItems = items.filter((it) => {
      if (filterProgram && it.programType !== filterProgram) return false;
      if (filterStatus && it.status !== filterStatus) return false;
      if (fromDateStr || toDateStr) {
        const d = new Date(it.backedUpAt);
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (fromDateStr && dayKey < fromDateStr) return false;
        if (toDateStr && dayKey > toDateStr) return false;
      }
      return true;
    });

    // Gom nhóm theo batchId
    const batchMap = new Map<string, BackupHistoryBatch>();
    for (const it of filteredItems) {
      let b = batchMap.get(it.batchId);
      if (!b) {
        b = {
          batchId: it.batchId,
          triggerType: it.triggerType,
          mode: it.mode,
          startedAt: it.backedUpAt,
          durationMs: 0,
          durationSec: 0,
          status: 'SUCCESS',
          totalConfigs: 0,
          successConfigs: 0,
          failedConfigs: 0,
          successCount: 0,
          failedCount: 0,
          totalStudents: 0,
          updatedCellsCount: 0,
          attendanceCellsWritten: 0,
          items: [],
        };
        batchMap.set(it.batchId, b);
      }
      b.items.push(it);
      b.totalConfigs++;
      if (it.status === 'SUCCESS') {
        b.successConfigs++;
        b.successCount++;
      } else {
        b.failedConfigs++;
        b.failedCount++;
      }
      b.totalStudents += it.totalStudents;
      b.updatedCellsCount += it.updatedCellsCount;
      b.attendanceCellsWritten += it.attendanceCellsWritten;
      b.durationMs += it.durationMs;
      b.durationSec = Math.max(1, Math.round(b.durationMs / 1000));
      if (it.backedUpAt > b.startedAt) b.startedAt = it.backedUpAt;
      b.status =
        b.failedConfigs === 0
          ? 'SUCCESS'
          : b.successConfigs > 0
            ? 'PARTIAL'
            : 'FAILED';
    }

    const allBatches = [...batchMap.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return {
      stats: {
        todayTotal: todayTotal || items.length,
        todaySuccess: todayTotal ? todaySuccess : items.filter((i) => i.status === 'SUCCESS').length,
        todayFailed: todayTotal ? todayFailed : items.filter((i) => i.status === 'FAILED').length,
        lastRunTime,
      },
      batches: allBatches.slice(0, limit),
      total: allBatches.length,
    };
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
      const batchId = buildBatchId(now);

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
          .runBackupForConfig(cfg.id, { batchId, triggerType: 'AUTO' })
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
