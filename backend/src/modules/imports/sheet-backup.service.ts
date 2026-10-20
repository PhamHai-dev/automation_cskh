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
import { MonthAttendanceBlock } from './imports.types';
import { SheetSyncService, ServiceAccountInfo } from './sheet-sync.service';
import { extractCellValue } from './sheet-sync.parser';

const log = createLogger('SheetBackupService');

export const SHEET1_CARE_MILESTONES = [1, 3, 10, 15, 20, 25, 29, 30, 35, 45, 55, 59, 60, 89, 90] as const;

export interface SheetDiffStats {
  totalEnrollments: number;
  unchangedRows: number;
  updatedRows: number;
  appendedRows: number;
  updatedCellsCount: number;
}

export interface CsSheetBackupResult {
  csUserId: number;
  staffCode: string;
  status: 'SUCCESS' | 'FAILED';
  syncedToGoogleSheet: boolean;
  localFilePath: string;
  sheet1: SheetDiffStats;
  sheet3: SheetDiffStats;
  backedUpAt: string;
}

export interface CsSheetBackupConfigItem {
  id: number;
  cs_user_id: number;
  name: string;
  target_spreadsheet_url: string | null;
  target_spreadsheet_id: string | null;
  local_backup_path: string | null;
  sheet1_name: string;
  sheet3_name: string;
  schedule_times: string[];
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
  studentCounts: {
    total: number;
    kaiwa: number;
    jlpt: number;
  };
  hasLocalBackupFile: boolean;
}

export interface UpdateBackupConfigDTO {
  target_spreadsheet_url?: string | null;
  sheet1_name?: string;
  sheet3_name?: string;
  schedule_times?: string[];
  enabled?: boolean;
  require_private_sheet?: boolean;
  mask_sensitive_data?: boolean;
}

export class SheetBackupService {
  private sheetSyncService: SheetSyncService;
  private importsService: ImportsService;

  constructor(sheetSyncService?: SheetSyncService, importsService?: ImportsService) {
    this.sheetSyncService = sheetSyncService || new SheetSyncService();
    this.importsService = importsService || new ImportsService();
  }

  /**
   * Resolve absolute path for local backup file
   */
  public resolveLocalBackupPath(relativeOrAbsPath: string): string {
    if (path.isAbsolute(relativeOrAbsPath)) return relativeOrAbsPath;
    return path.resolve(process.cwd(), relativeOrAbsPath);
  }

  /**
   * Locate template workbook (cham_soc_hoc_vien_mock.xlsx or cham_soc_hoc_vien.xlsx)
   */
  private resolveTemplateWorkbookPath(): string {
    const candidates = [
      path.resolve(process.cwd(), 'docs/data/cham_soc_hoc_vien_mock.xlsx'),
      path.resolve(process.cwd(), '../docs/data/cham_soc_hoc_vien_mock.xlsx'),
      path.resolve(__dirname, '../../../../docs/data/cham_soc_hoc_vien_mock.xlsx'),
      path.resolve(process.cwd(), 'docs/data/cham_soc_hoc_vien.xlsx'),
      path.resolve(process.cwd(), '../docs/data/cham_soc_hoc_vien.xlsx'),
      path.resolve(__dirname, '../../../../docs/data/cham_soc_hoc_vien.xlsx'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new AppError(500, 'Không tìm thấy file template mẫu docs/data/cham_soc_hoc_vien_mock.xlsx');
  }

  /**
   * A. Ensure backup configs exist for all active CS users
   */
  public async ensureBackupConfigs(): Promise<void> {
    await this.sheetSyncService.buildDefaultCvhtMapping();

    const allUsers = await prisma.user.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
    });

    const csUsers = allUsers.filter((u) => {
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      return roles.includes('CS') || Boolean(u.staff_code && u.staff_code.toUpperCase().startsWith('CVHT'));
    });

    const existingConfigs = await prisma.csSheetBackupConfig.findMany();
    const byUserId = new Map(existingConfigs.map((c) => [c.cs_user_id, c]));

    for (const user of csUsers) {
      if (!byUserId.has(user.id)) {
        const staffLabel = user.staff_code || `CS${user.id}`;
        await prisma.csSheetBackupConfig.create({
          data: {
            cs_user_id: user.id,
            name: `Backup Sổ CSKH - ${user.staff_code || user.name || user.email}`,
            local_backup_path: `backups/cskh/cham_soc_hoc_vien_${staffLabel}.xlsx`,
            sheet1_name: '1.Chăm sóc',
            sheet3_name: '3.Chấm buổi',
            schedule_times: ['12:00', '21:00'],
            enabled: true,
            require_private_sheet: true,
            mask_sensitive_data: false,
            last_status: 'IDLE',
          },
        }).catch(() => {});
      }
    }
  }

  /**
   * List backup configs with role/data scope filtering
   */
  public async getConfigs(actor: { id: number; roles: string[] }): Promise<{
    configs: CsSheetBackupConfigItem[];
    serviceAccount: ServiceAccountInfo;
  }> {
    await this.ensureBackupConfigs();
    const { info: serviceAccount } = await this.sheetSyncService.getServiceAccountKey();

    const isAdminOrManage = actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE');
    const whereClause = isAdminOrManage ? {} : { cs_user_id: actor.id };

    const rawConfigs = await prisma.csSheetBackupConfig.findMany({
      where: whereClause,
      include: {
        cs_user: {
          select: {
            id: true,
            name: true,
            email: true,
            staff_code: true,
          },
        },
      },
      orderBy: { cs_user_id: 'asc' },
    });

    const csUserIds = rawConfigs.map((c) => c.cs_user_id);
    const enrollments = csUserIds.length > 0
      ? await prisma.enrollment.findMany({
          where: { cs_id: { in: csUserIds } },
          select: { id: true, cs_id: true, program_type: true },
        })
      : [];

    const countsByCs = new Map<number, { total: number; kaiwa: number; jlpt: number }>();
    for (const uid of csUserIds) {
      countsByCs.set(uid, { total: 0, kaiwa: 0, jlpt: 0 });
    }
    for (const enr of enrollments) {
      const bucket = countsByCs.get(enr.cs_id) || { total: 0, kaiwa: 0, jlpt: 0 };
      bucket.total++;
      if ((enr.program_type || '').toUpperCase() === 'JLPT') {
        bucket.jlpt++;
      } else {
        bucket.kaiwa++;
      }
      countsByCs.set(enr.cs_id, bucket);
    }

    const configs: CsSheetBackupConfigItem[] = rawConfigs.map((cfg) => {
      const staffLabel = cfg.cs_user.staff_code || `CS${cfg.cs_user_id}`;
      const relPath = cfg.local_backup_path || `backups/cskh/cham_soc_hoc_vien_${staffLabel}.xlsx`;
      const absPath = this.resolveLocalBackupPath(relPath);
      const scheduleTimes = Array.isArray(cfg.schedule_times)
        ? (cfg.schedule_times as string[]).map(String)
        : ['12:00', '21:00'];

      return {
        id: cfg.id,
        cs_user_id: cfg.cs_user_id,
        name: cfg.name,
        target_spreadsheet_url: cfg.target_spreadsheet_url,
        target_spreadsheet_id: cfg.target_spreadsheet_id,
        local_backup_path: relPath,
        sheet1_name: cfg.sheet1_name,
        sheet3_name: cfg.sheet3_name,
        schedule_times: scheduleTimes,
        enabled: cfg.enabled,
        require_private_sheet: cfg.require_private_sheet,
        mask_sensitive_data: cfg.mask_sensitive_data,
        last_backup_at: cfg.last_backup_at,
        last_status: cfg.last_status,
        last_summary: cfg.last_summary,
        last_error: cfg.last_error,
        created_at: cfg.created_at,
        updated_at: cfg.updated_at,
        cs_user: cfg.cs_user,
        studentCounts: countsByCs.get(cfg.cs_user_id) || { total: 0, kaiwa: 0, jlpt: 0 },
        hasLocalBackupFile: fs.existsSync(absPath),
      };
    });

    return { configs, serviceAccount };
  }

  /**
   * Update a CS user's backup config
   */
  public async updateConfig(csUserId: number, dto: UpdateBackupConfigDTO): Promise<CsSheetBackupConfigItem> {
    await this.ensureBackupConfigs();
    const existing = await prisma.csSheetBackupConfig.findUnique({
      where: { cs_user_id: csUserId },
    });
    if (!existing) {
      throw new AppError(404, `Không tìm thấy cấu hình sao lưu cho tài khoản CS (ID=${csUserId})`);
    }

    const targetSpreadsheetId = dto.target_spreadsheet_url !== undefined
      ? this.sheetSyncService.extractSpreadsheetId(dto.target_spreadsheet_url)
      : existing.target_spreadsheet_id;

    let cleanScheduleTimes: string[] | undefined;
    if (dto.schedule_times !== undefined) {
      cleanScheduleTimes = (Array.isArray(dto.schedule_times) ? dto.schedule_times : [])
        .map((t) => String(t).trim())
        .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
        .map((t) => {
          const [hh, mm] = t.split(':');
          return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
        });
    }

    await prisma.csSheetBackupConfig.update({
      where: { id: existing.id },
      data: {
        ...(dto.target_spreadsheet_url !== undefined
          ? {
              target_spreadsheet_url: dto.target_spreadsheet_url,
              target_spreadsheet_id: targetSpreadsheetId,
            }
          : {}),
        ...(dto.sheet1_name !== undefined ? { sheet1_name: dto.sheet1_name.trim() || '1.Chăm sóc' } : {}),
        ...(dto.sheet3_name !== undefined ? { sheet3_name: dto.sheet3_name.trim() || '3.Chấm buổi' } : {}),
        ...(cleanScheduleTimes !== undefined ? { schedule_times: cleanScheduleTimes as Prisma.InputJsonValue } : {}),
        ...(dto.enabled !== undefined ? { enabled: Boolean(dto.enabled) } : {}),
        ...(dto.require_private_sheet !== undefined ? { require_private_sheet: Boolean(dto.require_private_sheet) } : {}),
        ...(dto.mask_sensitive_data !== undefined ? { mask_sensitive_data: Boolean(dto.mask_sensitive_data) } : {}),
      },
    });

    const { configs } = await this.getConfigs({ id: csUserId, roles: ['ADMIN'] });
    const item = configs.find((c) => c.cs_user_id === csUserId);
    if (!item) {
      throw new AppError(404, `Không tìm thấy cấu hình sao lưu sau khi cập nhật`);
    }
    return item;
  }

  public formatDate(val?: Date | string | null): string {
    if (!val) return '';
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  public formatGender(gender?: string | null): string {
    if (!gender) return '';
    const g = gender.trim().toLowerCase();
    if (g === 'nam' || g === 'male' || g === 'm') return 'Nam';
    if (g === 'nữ' || g === 'nu' || g === 'female' || g === 'f') return 'Nữ';
    return gender.trim();
  }

  public formatStatusLabel(status?: EnrollmentStatus | string | null): string {
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

  public maskPhoneIfEnabled(phone?: string | null, mask = false): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    if (!mask || trimmed.length < 6) return trimmed;
    return `${trimmed.slice(0, 3)}****${trimmed.slice(-3)}`;
  }

  public maskEmailIfEnabled(email?: string | null, mask = false): string {
    if (!email) return '';
    const trimmed = email.trim();
    if (!mask || !trimmed.includes('@')) return trimmed;
    const [local, domain] = trimmed.split('@');
    if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  }

  private normalizeCellComparable(val: unknown): string {
    if (val === undefined || val === null) return '';
    const extracted = extractCellValue(val);
    if (extracted === undefined || extracted === null) return '';
    if (extracted instanceof Date) {
      if (isNaN(extracted.getTime())) return '';
      return extracted.toISOString().slice(0, 10);
    }
    if (typeof extracted === 'object') {
      if ('result' in (extracted as any) && (extracted as any).result !== undefined && (extracted as any).result !== null) {
        return this.normalizeCellComparable((extracted as any).result);
      }
      if ('text' in (extracted as any)) {
        return String((extracted as any).text || '').trim();
      }
      if ('hyperlink' in (extracted as any)) {
        return String((extracted as any).hyperlink || '').trim();
      }
      return '';
    }
    return String(extracted).trim();
  }

  private setCellValuePreservingFormula(cell: ExcelJS.Cell, newValue: string | number): void {
    const raw = cell.value;
    if (raw && typeof raw === 'object' && 'formula' in raw && (raw as any).formula) {
      cell.value = {
        ...(raw as any),
        result: newValue === '' ? 0 : newValue,
      };
    } else {
      cell.value = newValue;
    }
  }

  /**
   * Load existing local backup workbook or initialize clean workbook from template
   */
  private async loadOrInitializeWorkbook(
    absBackupPath: string,
    sheet1Name: string,
    sheet3Name: string,
    forceFullRewrite = false
  ): Promise<{ workbook: ExcelJS.Workbook; isFreshFromTemplate: boolean }> {
    const workbook = new ExcelJS.Workbook();

    if (!forceFullRewrite && fs.existsSync(absBackupPath)) {
      await workbook.xlsx.readFile(absBackupPath);
      const ws1 = workbook.getWorksheet(sheet1Name) || workbook.worksheets[0];
      const ws3 = workbook.getWorksheet(sheet3Name) || workbook.worksheets[1];
      if (ws1 && ws3) {
        return { workbook, isFreshFromTemplate: false };
      }
    }

    const templatePath = this.resolveTemplateWorkbookPath();
    await workbook.xlsx.readFile(templatePath);

    const ws1 = workbook.getWorksheet('1.Chăm sóc') || workbook.worksheets[0];
    const ws3 = workbook.getWorksheet('3.Chấm buổi') || workbook.worksheets[1];

    if (ws1 && ws1.name !== sheet1Name) {
      ws1.name = sheet1Name;
    }
    if (ws3 && ws3.name !== sheet3Name) {
      ws3.name = sheet3Name;
    }

      // Strip sample student rows from template (keep header rows 1..3 in Sheet 1, and 1..2 in Sheet 3)
      if (ws1 && ws1.rowCount >= 4) {
        ws1.spliceRows(4, ws1.rowCount);
      }
      if (ws3 && ws3.rowCount >= 3) {
        ws3.spliceRows(3, ws3.rowCount);
      }

      return { workbook, isFreshFromTemplate: true };
  }

  /**
   * Layer 2 Security check: Verify Google Sheet access via Sheets API v4,
   * and check "Anyone can edit" via Drive API v3 if Drive API is enabled on the project.
   */
  public async verifyTargetSpreadsheetSecurity(
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

    // If Drive API is simply not enabled in Google Cloud project, fallback to Google Sheets API v4 directly!
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

  /**
   * Convert 1-based column index to Excel column letter (e.g. 1 -> A, 27 -> AA, 60 -> BH)
   */
  public colNumberToLetter(col: number): string {
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
   * Ensure Google Sheet tabs have enough rows and columns before values:batchUpdate,
   * then push changed/appended rows via Sheets API v4.
   */
  private async pushDeltaToGoogleSheet(
    spreadsheetId: string,
    accessToken: string,
    batchRanges: Array<{ range: string; values: (string | number)[][] }>
  ): Promise<void> {
    if (batchRanges.length === 0) return;

    // 1. Check current sheet grid dimensions (rowCount & columnCount) and auto-expand if needed
    try {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties)`;
      const metaResp = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
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

        const sheetPropsByName = new Map<
          string,
          { sheetId: number; rowCount: number; columnCount: number }
        >();
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

        // Determine max row & col needed per sheet title from batchRanges
        const neededBySheet = new Map<string, { maxRow: number; maxCol: number }>();
        for (const item of batchRanges) {
          const match = item.range.match(/^'?([^'!]+)'?!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
          if (match) {
            const title = match[1];
            const rowEnd = parseInt(match[5] || match[3], 10);
            const colCount = item.values?.[0]?.length || 60;
            const prev = neededBySheet.get(title) || { maxRow: 0, maxCol: 0 };
            neededBySheet.set(title, {
              maxRow: Math.max(prev.maxRow, rowEnd),
              maxCol: Math.max(prev.maxCol, colCount),
            });
          }
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
      // Non-fatal: proceed to values:batchUpdate
    }

    // 2. Push values in chunks of 200 ranges to stay well within Google Sheets payload limits
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
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: chunk,
        }),
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

  /**
   * Execute backup for a specific CS user
   */
  public async runBackupForCs(
    csUserId: number,
    options?: { forceFullRewrite?: boolean; actorId?: number }
  ): Promise<CsSheetBackupResult> {
    await this.ensureBackupConfigs();

    const config = await prisma.csSheetBackupConfig.findUnique({
      where: { cs_user_id: csUserId },
      include: { cs_user: true },
    });

    if (!config) {
      throw new AppError(404, `Không tìm thấy cấu hình sao lưu cho tài khoản CSKH (ID=${csUserId})`);
    }

    const csUser = config.cs_user;
    const staffCode = csUser.staff_code || `CS${csUser.id}`;
    const relBackupPath = config.local_backup_path || `backups/cskh/cham_soc_hoc_vien_${staffCode}.xlsx`;
    const absBackupPath = this.resolveLocalBackupPath(relBackupPath);
    const forceFullRewrite = Boolean(options?.forceFullRewrite);

    await prisma.csSheetBackupConfig.update({
      where: { id: config.id },
      data: { last_status: 'RUNNING', last_error: null },
    });

    try {
      // 1. Load all enrollments belonging strictly to this CS user
      const enrollments = await prisma.enrollment.findMany({
        where: { cs_id: csUserId },
        include: {
          student: true,
          package: true,
          sale: true,
          cs: true,
          care_logs: {
            orderBy: { id: 'asc' },
          },
          enrollment_classes: {
            include: {
              class: {
                include: {
                  class_teachers: {
                    include: { teacher: true },
                    orderBy: { id: 'asc' },
                  },
                  class_schedules: {
                    orderBy: { id: 'asc' },
                  },
                },
              },
              attendance: {
                where: { deleted_at: null },
                include: {
                  class_session: true,
                },
              },
            },
            orderBy: { sequence_no: 'asc' },
          },
        },
        orderBy: { id: 'asc' },
      });

      // 2. Load baseline local workbook or initialize from template
      const sheet1Name = config.sheet1_name || '1.Chăm sóc';
      const sheet3Name = config.sheet3_name || '3.Chấm buổi';
      const { workbook } = await this.loadOrInitializeWorkbook(
        absBackupPath,
        sheet1Name,
        sheet3Name,
        forceFullRewrite
      );

      const ws1 = workbook.getWorksheet(sheet1Name) || workbook.worksheets[0];
      const ws3 = workbook.getWorksheet(sheet3Name) || workbook.worksheets[1];
      if (!ws1 || !ws3) {
        throw new AppError(500, 'Workbook thiếu sheet 1.Chăm sóc hoặc 3.Chấm buổi');
      }

      // 3. Index existing rows in Sheet 1 (header row = 3, data starts at row 4)
      const sheet1RowMap = new Map<string, number>();
      let lastNonEmptyRow1 = 3;
      for (let r = 4; r <= ws1.rowCount; r++) {
        const row = ws1.getRow(r);
        const extId = this.normalizeCellComparable(row.getCell(1).value);
        const fullName = this.normalizeCellComparable(row.getCell(5).value);
        const pkgCode = this.normalizeCellComparable(row.getCell(11).value) || 'DEFAULT';
        if (extId && fullName) {
          const key = `${extId.toUpperCase()}::${pkgCode.toUpperCase()}`;
          if (!sheet1RowMap.has(key)) {
            sheet1RowMap.set(key, r);
          }
          lastNonEmptyRow1 = r;
        }
      }
      let sheet1MaxRow = lastNonEmptyRow1;

      // 4. Index existing rows in Sheet 3 (header row = 2, data starts at row 3)
      const monthBlocks: MonthAttendanceBlock[] = this.importsService.detectAttendanceMonthBlocks(ws3);
      const sheet3TotalCols = Math.max(466, ws3.columnCount);
      const sheet3RowMap = new Map<string, number>();
      let lastNonEmptyRow3 = 2;
      for (let r = 3; r <= ws3.rowCount; r++) {
        const row = ws3.getRow(r);
        const extId = this.normalizeCellComparable(row.getCell(1).value);
        const fullName = this.normalizeCellComparable(row.getCell(2).value);
        const pkgCode = this.normalizeCellComparable(row.getCell(3).value) || 'DEFAULT';
        if (extId && fullName) {
          const key = `${extId.toUpperCase()}::${pkgCode.toUpperCase()}`;
          if (!sheet3RowMap.has(key)) {
            sheet3RowMap.set(key, r);
          }
          lastNonEmptyRow3 = r;
        }
      }
      let sheet3MaxRow = lastNonEmptyRow3;

      const sheet1Stats: SheetDiffStats = {
        totalEnrollments: enrollments.length,
        unchangedRows: 0,
        updatedRows: 0,
        appendedRows: 0,
        updatedCellsCount: 0,
      };

      const sheet3Stats: SheetDiffStats = {
        totalEnrollments: enrollments.length,
        unchangedRows: 0,
        updatedRows: 0,
        appendedRows: 0,
        updatedCellsCount: 0,
      };

      const googleBatchRanges: Array<{ range: string; values: (string | number)[][] }> = [];

      // 5. Process each Enrollment and compute cell-level diffs for Sheet 1 & Sheet 3
      for (const enr of enrollments) {
        const student = enr.student;
        const externalId = (student.external_id || enr.external_id || String(student.id)).trim();
        const pkgCode = (enr.package?.code || 'DEFAULT').trim();
        const lookupKey = `${externalId.toUpperCase()}::${pkgCode.toUpperCase()}`;

        // Active / latest EnrollmentClass
        const activeEc =
          enr.enrollment_classes.find((ec) => ec.status === 'ACTIVE') ||
          enr.enrollment_classes[enr.enrollment_classes.length - 1] ||
          null;
        const cls = activeEc?.class || null;
        const mainClassTeacher =
          cls?.class_teachers.find((ct) => ct.role === 'MAIN' && ct.active) ||
          cls?.class_teachers[0] ||
          null;
        const teacher = mainClassTeacher?.teacher || null;
        const schedule =
          cls?.class_schedules.find((sc) => sc.active) ||
          cls?.class_schedules[0] ||
          null;

        // Collect all non-deleted attendances across enrollment_classes
        const allAttendances = enr.enrollment_classes.flatMap((ec) => ec.attendance || []);
        const attendanceByDate = new Map<string, (typeof allAttendances)[number]>();
        let attendedCount = 0;
        let absentACount = 0;
        let leaveBCount = 0;
        let absentCCount = 0;
        let teacherDCount = 0;
        let techECount = 0;

        for (const att of allAttendances) {
          if (att.deleted_at) continue;
          const dateStr = this.formatDate(att.class_session?.session_date);
          if (dateStr) {
            attendanceByDate.set(dateStr, att);
          }
          switch (att.status) {
            case AttendanceStatus.ATTENDED:
              attendedCount++;
              break;
            case AttendanceStatus.ABSENT_APPROVED_A:
              absentACount++;
              break;
            case AttendanceStatus.LEAVE_B:
              leaveBCount++;
              break;
            case AttendanceStatus.ABSENT_UNAPPROVED_C:
              absentCCount++;
              break;
            case AttendanceStatus.TEACHER_ABSENT_D:
              teacherDCount++;
              break;
            case AttendanceStatus.TECH_ERROR_E:
              techECount++;
              break;
          }
        }

        const totalAttendedAndC = attendedCount + absentCCount;
        const attendedPrevYears = enr.attended_previous_years ?? 0;
        const hasWebAttendance = allAttendances.length > 0;
        const remainingSessions = hasWebAttendance
          ? Math.max(0, enr.total_sessions - totalAttendedAndC)
          : (enr.external_remaining_sessions ?? Math.max(0, enr.total_sessions - attendedPrevYears));
        const attendedInCurrentYear = hasWebAttendance
          ? totalAttendedAndC
          : Math.max(0, enr.total_sessions - attendedPrevYears - remainingSessions);

        // Map CareLogs to the 15 milestone columns [1, 3, 10, 15, 20, 25, 29, 30, 35, 45, 55, 59, 60, 89, 90]
        const careByMilestone = new Map<number, string>();
        for (const cl of enr.care_logs) {
          const content = (cl.content || '').trim();
          if (!content || cl.after_session_number === null || cl.after_session_number === undefined) continue;
          careByMilestone.set(cl.after_session_number, content);
        }
        // Fallback mapping for Kaiwa milestone 27 -> col 29, JLPT milestone 40 -> col 45
        if (!careByMilestone.has(29) && careByMilestone.has(27)) {
          careByMilestone.set(29, careByMilestone.get(27)!);
        }
        if (!careByMilestone.has(45) && careByMilestone.has(40)) {
          careByMilestone.set(45, careByMilestone.get(40)!);
        }

        const existingRow1Idx = sheet1RowMap.get(lookupKey);
        const targetRow1Idx = existingRow1Idx ?? ++sheet1MaxRow;
        const row1 = ws1.getRow(targetRow1Idx);

        // Preserve existing columns 27..31 (AA..AE) if present on Sheet 1
        const preservedCols1_27_31 = [27, 28, 29, 30, 31].map((colIdx) =>
          existingRow1Idx ? this.normalizeCellComparable(row1.getCell(colIdx).value) : ''
        );

        const courseContent = enr.course_content || (enr.program_type === 'JLPT' ? 'JLPT' : 'Thường');
        const courseTeacherType = enr.course_teacher_type || (enr.program_type === 'JLPT' ? 'JLPT Inhouse' : 'GV Việt Nam');
        const classModel = enr.class_model || 'Lớp 1-1';
        const statusLabel = this.formatStatusLabel(enr.status);
        const maskedPhone = this.maskPhoneIfEnabled(student.phone, config.mask_sensitive_data);
        const maskedEmail = this.maskEmailIfEnabled(student.email, config.mask_sensitive_data);
        const paidMonth: string | number = enr.paid_at ? new Date(enr.paid_at).getUTCMonth() + 1 : '';

        // Build 60-column array (1-indexed at index 0..59) for Sheet 1 (`1.Chăm sóc`)
        const sheet1Values: (string | number)[] = [
          externalId, // 1 (A): ID
          this.formatDate(enr.paid_at), // 2 (B): Ngày nộp học phí
          enr.sale_name || enr.sale?.name || '', // 3 (C): Sale
          enr.student_source_status || 'HV mới', // 4 (D): Trạng thái HV
          student.full_name || '', // 5 (E): Họ tên HV
          this.formatGender(student.gender), // 6 (F): Giới tính
          maskedPhone, // 7 (G): SĐT
          maskedEmail, // 8 (H): Email
          courseContent, // 9 (I): Nội dung khoá
          enr.payment_status || 'Full phí', // 10 (J): Trạng thái thanh toán
          pkgCode, // 11 (K): Gói học
          courseTeacherType, // 12 (L): Khoá học
          enr.level || '', // 13 (M): Trình độ
          enr.total_sessions, // 14 (N): Tổng số buổi
          classModel, // 15 (O): Mô hình lớp
          enr.sales_note || '', // 16 (P): Ghi chú sale
          this.formatDate(student.date_of_birth), // 17 (Q): DOB
          student.occupation || '', // 18 (R): Nghề nghiệp
          csUser.staff_code || classModel || '', // 19 (S): CVHT / Mô hình
          remainingSessions, // 20 (T): Số buổi còn lại
          this.formatDate(enr.start_date), // 21 (U): Ngày bắt đầu học
          statusLabel, // 22 (V): Trạng thái
          this.formatDate(enr.end_date), // 23 (W): Ngày kết thúc/Bảo lưu
          schedule?.start_time || '', // 24 (X): Giờ học (1)
          schedule?.schedule_pattern || '', // 25 (Y): Lịch học (1)
          schedule?.duration_minutes ?? '', // 26 (Z): Thời lượng buổi học (1)
          preservedCols1_27_31[0], // 27 (AA): Giờ học (2)
          preservedCols1_27_31[1], // 28 (AB): Lịch học (2)
          preservedCols1_27_31[2], // 29 (AC): Thời lượng buổi học (2)
          preservedCols1_27_31[3], // 30 (AD): Vòng lặp
          preservedCols1_27_31[4], // 31 (AE): Ngày học
          teacher?.name || '', // 32 (AF): Giáo viên
          teacher?.code || '', // 33 (AG): Mã GV
          cls?.class_name || '', // 34 (AH): Tên lớp
          attendedPrevYears, // 35 (AI): Tổng số buổi đã học năm trước
          attendedInCurrentYear, // 36 (AJ): Tổng số buổi đã học 2026
          enr.study_report_url || '', // 37 (AK): Báo cáo học tập
          enr.exchange_info || '', // 38 (AL): Thông tin trao đổi với HV
          enr.callback_note || '', // 39 (AM): Lịch hẹn gọi
          enr.hot_issue_note || '', // 40 (AN): Điểm nóng
          ...SHEET1_CARE_MILESTONES.map((m) => careByMilestone.get(m) || ''), // 41..55 (AO..BC)
          enr.post_course_care || '', // 56 (BD): Chăm sóc sau kết thúc
          this.formatDate(enr.end_date), // 57 (BE)
          this.formatDate(enr.handed_over_at || enr.paid_at), // 58 (BF): Ngày bàn giao
          paidMonth, // 59 (BG): Tháng nộp học phí
          this.formatDate(enr.account_created_at || enr.created_at), // 60 (BH): Ngày tạo tài khoản
        ];

        let row1ChangedCells = 0;
        for (let c = 1; c <= 60; c++) {
          const desired = sheet1Values[c - 1];
          const desiredStr = this.normalizeCellComparable(desired);
          const cell = row1.getCell(c);
          const currentStr = existingRow1Idx ? this.normalizeCellComparable(cell.value) : '';

          if (!existingRow1Idx) {
            cell.value = desired;
            if (desiredStr !== '') row1ChangedCells++;
          } else if (currentStr !== desiredStr) {
            this.setCellValuePreservingFormula(cell, desired);
            row1ChangedCells++;
          }
        }

        if (!existingRow1Idx) {
          sheet1RowMap.set(lookupKey, targetRow1Idx);
          sheet1Stats.appendedRows++;
          sheet1Stats.updatedCellsCount += row1ChangedCells;
          googleBatchRanges.push({
            range: `'${sheet1Name}'!A${targetRow1Idx}:BH${targetRow1Idx}`,
            values: [sheet1Values],
          });
        } else if (row1ChangedCells > 0) {
          sheet1Stats.updatedRows++;
          sheet1Stats.updatedCellsCount += row1ChangedCells;
          googleBatchRanges.push({
            range: `'${sheet1Name}'!A${targetRow1Idx}:BH${targetRow1Idx}`,
            values: [sheet1Values],
          });
        } else {
          sheet1Stats.unchangedRows++;
        }

        // --- Sheet 3 (`3.Chấm buổi`) ---
        const existingRow3Idx = sheet3RowMap.get(lookupKey);
        const targetRow3Idx = existingRow3Idx ?? ++sheet3MaxRow;
        const row3 = ws3.getRow(targetRow3Idx);

        const preservedCols3_16_20 = [16, 17, 18, 19, 20].map((colIdx) =>
          existingRow3Idx ? this.normalizeCellComparable(row3.getCell(colIdx).value) : ''
        );

        const sheet3Values = new Array<string | number>(sheet3TotalCols).fill('');
        if (existingRow3Idx) {
          for (let c = 1; c <= sheet3TotalCols; c++) {
            const existingText = this.normalizeCellComparable(row3.getCell(c).value);
            if (existingText !== '') {
              const numVal = Number(existingText);
              sheet3Values[c - 1] = !isNaN(numVal) && existingText !== '' && /^-?\d+(\.\d+)?$/.test(existingText)
                ? numVal
                : existingText;
            }
          }
        }

        // Columns 1 -> 25 (A -> Y)
        sheet3Values[0] = externalId; // Col 1 (A): ID
        sheet3Values[1] = student.full_name || ''; // Col 2 (B): Họ tên HV
        sheet3Values[2] = pkgCode; // Col 3 (C): Gói học
        sheet3Values[3] = courseContent; // Col 4 (D): Nội dung khoá
        sheet3Values[4] = enr.total_sessions; // Col 5 (E): Tổng số buổi
        sheet3Values[5] = courseTeacherType; // Col 6 (F): Khoá học
        sheet3Values[6] = maskedEmail; // Col 7 (G): Email
        sheet3Values[7] = classModel; // Col 8 (H): Mô hình
        sheet3Values[8] = remainingSessions; // Col 9 (I): Số buổi còn lại
        sheet3Values[9] = this.formatDate(enr.start_date); // Col 10 (J): Ngày bắt đầu học
        sheet3Values[10] = statusLabel; // Col 11 (K): Trạng thái
        sheet3Values[11] = this.formatDate(enr.end_date); // Col 12 (L): Ngày kết thúc/Bảo lưu
        sheet3Values[12] = schedule?.start_time || ''; // Col 13 (M): Giờ học (1)
        sheet3Values[13] = schedule?.schedule_pattern || ''; // Col 14 (N): Lịch học (1)
        sheet3Values[14] = schedule?.duration_minutes ?? ''; // Col 15 (O): Thời lượng buổi học (1)
        sheet3Values[15] = preservedCols3_16_20[0]; // Col 16 (P)
        sheet3Values[16] = preservedCols3_16_20[1]; // Col 17 (Q)
        sheet3Values[17] = preservedCols3_16_20[2]; // Col 18 (R)
        sheet3Values[18] = preservedCols3_16_20[3]; // Col 19 (S)
        sheet3Values[19] = preservedCols3_16_20[4]; // Col 20 (T)
        sheet3Values[20] = teacher?.name || ''; // Col 21 (U): Giáo viên
        sheet3Values[21] = teacher?.code || ''; // Col 22 (V): Mã GV
        sheet3Values[22] = cls?.class_name || ''; // Col 23 (W): Tên lớp
        sheet3Values[23] = attendedPrevYears + attendedInCurrentYear; // Col 24 (X): Tổng số buổi đã học
        sheet3Values[24] = attendedInCurrentYear; // Col 25 (Y): Tổng số buổi đã học (trong năm)

        // Columns 26, 27, 28 (Z, AA, AB): Tổng số buổi nghỉ A, C, D
        sheet3Values[25] = absentACount; // Col 26 (Z)
        sheet3Values[26] = absentCCount; // Col 27 (AA)
        sheet3Values[27] = teacherDCount; // Col 28 (AB)

        // Month blocks from Col 29 (AC) onwards
        for (const block of monthBlocks) {
          let mAttended = 0;
          let mAbsentA = 0;
          let mLeaveB = 0;
          let mAbsentC = 0;
          let mTeacherD = 0;
          let mTechE = 0;

          for (const dayCol of block.dailyCols) {
            const dayIso = dayCol.date.slice(0, 10);
            const att = attendanceByDate.get(dayIso);
            let cellVal: string | number = '';

            if (att) {
              switch (att.status) {
                case AttendanceStatus.ATTENDED:
                  cellVal = att.lesson_topic && att.lesson_topic.trim() ? att.lesson_topic.trim() : '1';
                  mAttended++;
                  break;
                case AttendanceStatus.ABSENT_APPROVED_A:
                  cellVal = 'A';
                  mAbsentA++;
                  break;
                case AttendanceStatus.LEAVE_B:
                  cellVal = 'B';
                  mLeaveB++;
                  break;
                case AttendanceStatus.ABSENT_UNAPPROVED_C:
                  cellVal = 'C';
                  mAbsentC++;
                  break;
                case AttendanceStatus.TEACHER_ABSENT_D:
                  cellVal = 'D';
                  mTeacherD++;
                  break;
                case AttendanceStatus.TECH_ERROR_E:
                  cellVal = 'E';
                  mTechE++;
                  break;
              }
            }

            sheet3Values[dayCol.colNumber - 1] = cellVal;
          }

          sheet3Values[block.summaryCols.attendedCol - 1] = mAttended;
          sheet3Values[block.summaryCols.absentACol - 1] = mAbsentA;
          sheet3Values[block.summaryCols.leaveBCol - 1] = mLeaveB;
          sheet3Values[block.summaryCols.absentCCol - 1] = mAbsentC;
          sheet3Values[block.summaryCols.teacherDCol - 1] = mTeacherD;
          sheet3Values[block.summaryCols.techErrorECol - 1] = mTechE;
        }

        let row3ChangedCells = 0;
        for (let c = 1; c <= sheet3TotalCols; c++) {
          const desired = sheet3Values[c - 1];
          const desiredStr = this.normalizeCellComparable(desired);
          const cell = row3.getCell(c);
          const currentStr = existingRow3Idx ? this.normalizeCellComparable(cell.value) : '';

          if (!existingRow3Idx) {
            if (desired !== '') {
              cell.value = desired;
              row3ChangedCells++;
            }
          } else if (currentStr !== desiredStr) {
            this.setCellValuePreservingFormula(cell, desired);
            row3ChangedCells++;
          }
        }

        const lastColLetter = this.colNumberToLetter(sheet3TotalCols);
        if (!existingRow3Idx) {
          sheet3RowMap.set(lookupKey, targetRow3Idx);
          sheet3Stats.appendedRows++;
          sheet3Stats.updatedCellsCount += row3ChangedCells;
          googleBatchRanges.push({
            range: `'${sheet3Name}'!A${targetRow3Idx}:${lastColLetter}${targetRow3Idx}`,
            values: [sheet3Values],
          });
        } else if (row3ChangedCells > 0) {
          sheet3Stats.updatedRows++;
          sheet3Stats.updatedCellsCount += row3ChangedCells;
          googleBatchRanges.push({
            range: `'${sheet3Name}'!A${targetRow3Idx}:${lastColLetter}${targetRow3Idx}`,
            values: [sheet3Values],
          });
        } else {
          sheet3Stats.unchangedRows++;
        }
      }

      // 6. Save updated workbook to disk
      const backupDir = path.dirname(absBackupPath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      await workbook.xlsx.writeFile(absBackupPath);

      // 7. Sync to Google Sheet via Google Sheets API v4 if target_spreadsheet_id is configured
      let syncedToGoogleSheet = false;
      const targetSpreadsheetId =
        config.target_spreadsheet_id || this.sheetSyncService.extractSpreadsheetId(config.target_spreadsheet_url);

      if (targetSpreadsheetId) {
        const auth = await this.sheetSyncService.getAuthorizedAccessToken();
        if (!auth) {
          throw new AppError(
            400,
            'Đã cấu hình Google Sheet đích nhưng chưa cấu hình Google Service Account JSON để ghi dữ liệu.'
          );
        }

        await this.verifyTargetSpreadsheetSecurity(
          targetSpreadsheetId,
          auth.accessToken,
          config.require_private_sheet
        );

        await this.pushDeltaToGoogleSheet(targetSpreadsheetId, auth.accessToken, googleBatchRanges);
        syncedToGoogleSheet = true;
      }

      const now = new Date();
      const result: CsSheetBackupResult = {
        csUserId,
        staffCode,
        status: 'SUCCESS',
        syncedToGoogleSheet,
        localFilePath: relBackupPath.replace(/\\/g, '/'),
        sheet1: sheet1Stats,
        sheet3: sheet3Stats,
        backedUpAt: now.toISOString(),
      };

      await prisma.csSheetBackupConfig.update({
        where: { id: config.id },
        data: {
          local_backup_path: relBackupPath.replace(/\\/g, '/'),
          last_backup_at: now,
          last_status: 'SUCCESS',
          last_summary: result as unknown as Prisma.InputJsonValue,
          last_error: null,
        },
      });

      // Record AuditLog
      const auditUserId = options?.actorId || csUserId;
      await prisma.auditLog.create({
        data: {
          user_id: auditUserId,
          action: 'CS_SHEET_BACKUP',
          entity_type: 'CsSheetBackupConfig',
          entity_id: String(config.id),
          after_data: result as unknown as Prisma.InputJsonValue,
        },
      }).catch((err) => {
        log.warn('Failed to write AuditLog for CS_SHEET_BACKUP', { error: String(err) });
      });

      // Record ImportBatch if any row was updated or appended
      const totalChangedRows =
        sheet1Stats.updatedRows + sheet1Stats.appendedRows + sheet3Stats.updatedRows + sheet3Stats.appendedRows;
      if (totalChangedRows > 0) {
        await prisma.importBatch.create({
          data: {
            uploaded_by_id: auditUserId,
            file_name: `[BACKUP-${staffCode}] ${path.basename(relBackupPath)}`,
            import_type: ImportType.GOOGLE_SHEET_BACKUP,
            total_rows: enrollments.length,
            success_rows: enrollments.length,
            failed_rows: 0,
            status: ImportBatchStatus.COMPLETED,
            completed_at: now,
          },
        }).catch(() => {});
      }

      return result;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      await prisma.csSheetBackupConfig.update({
        where: { id: config.id },
        data: {
          last_status: 'FAILED',
          last_error: errMsg,
        },
      });

      const auditUserId = options?.actorId || csUserId;
      await prisma.auditLog.create({
        data: {
          user_id: auditUserId,
          action: 'CS_SHEET_BACKUP',
          entity_type: 'CsSheetBackupConfig',
          entity_id: String(config.id),
          after_data: {
            csUserId,
            staffCode,
            status: 'FAILED',
            error: errMsg,
            failedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      }).catch(() => {});

      throw err;
    }
  }

  /**
   * Run backup for all CS users
   */
  public async runAllBackups(options?: { forceFullRewrite?: boolean; actorId?: number }): Promise<{
    results: CsSheetBackupResult[];
  }> {
    await this.ensureBackupConfigs();
    const configs = await prisma.csSheetBackupConfig.findMany({
      orderBy: { cs_user_id: 'asc' },
    });

    const results: CsSheetBackupResult[] = [];
    for (const cfg of configs) {
      const res = await this.runBackupForCs(cfg.cs_user_id, options);
      results.push(res);
    }
    return { results };
  }

  /**
   * Get local backup file path and staffCode for download (runs backup if missing or refresh=true)
   */
  public async getBackupFileForDownload(
    csUserId: number,
    options?: { refresh?: boolean; actorId?: number }
  ): Promise<{ absFilePath: string; fileName: string }> {
    await this.ensureBackupConfigs();
    const config = await prisma.csSheetBackupConfig.findUnique({
      where: { cs_user_id: csUserId },
      include: { cs_user: true },
    });
    if (!config) {
      throw new AppError(404, `Không tìm thấy cấu hình sao lưu cho tài khoản CSKH (ID=${csUserId})`);
    }

    const staffCode = config.cs_user.staff_code || `CS${config.cs_user.id}`;
    const relPath = config.local_backup_path || `backups/cskh/cham_soc_hoc_vien_${staffCode}.xlsx`;
    const absPath = this.resolveLocalBackupPath(relPath);

    if (options?.refresh || !fs.existsSync(absPath)) {
      await this.runBackupForCs(csUserId, { actorId: options?.actorId });
    }

    return {
      absFilePath: absPath,
      fileName: `cham_soc_hoc_vien_${staffCode}.xlsx`,
    };
  }

  /**
   * Process scheduled daily backup times (e.g. ["12:00", "21:00"])
   */
  public async processDueBackupConfigs(now = new Date()): Promise<void> {
    await this.ensureBackupConfigs();
    const configs = await prisma.csSheetBackupConfig.findMany({
      where: { enabled: true },
    });

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentHm = `${hh}:${mm}`;
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    for (const cfg of configs) {
      if (cfg.last_status === 'RUNNING') continue;
      const scheduleTimes = Array.isArray(cfg.schedule_times)
        ? (cfg.schedule_times as string[]).map(String)
        : ['12:00', '21:00'];

      if (!scheduleTimes.includes(currentHm)) continue;

      const slotKey = `${cfg.id}::${todayDateStr}::${currentHm}`;
      if (executedScheduleSlots.has(slotKey)) continue;

      executedScheduleSlots.add(slotKey);
      try {
        await this.runBackupForCs(cfg.cs_user_id, { forceFullRewrite: false });
      } catch (err: any) {
        log.warn(`Scheduled CS Sheet backup failed for cs_user_id=${cfg.cs_user_id}`, {
          error: err?.message || String(err),
        });
      }
    }
  }
}

const BACKUP_CRON_SCHEDULE = '* * * * *'; // Check every minute against schedule_times (e.g. ["12:00", "21:00"])
const executedScheduleSlots = new Set<string>();
let backupCronTask: ReturnType<typeof cron.schedule> | null = null;
let isBackupCycleRunning = false;
const sheetBackupServiceInstance = new SheetBackupService();

export function startCsSheetBackupScheduler(): void {
  if (backupCronTask) {
    log.info('CS Sheet backup scheduler already running');
    return;
  }

  backupCronTask = cron.schedule(BACKUP_CRON_SCHEDULE, async () => {
    if (isBackupCycleRunning) return;
    isBackupCycleRunning = true;
    try {
      await sheetBackupServiceInstance.processDueBackupConfigs(new Date());
    } catch (err: any) {
      log.error('Unexpected error in CS Sheet backup scheduler', {
        error: err?.message || String(err),
      });
    } finally {
      isBackupCycleRunning = false;
    }
  });

  log.info(`CS Sheet backup scheduler started, schedule="${BACKUP_CRON_SCHEDULE}"`);
}

export function stopCsSheetBackupScheduler(): void {
  if (backupCronTask) {
    backupCronTask.stop();
    backupCronTask = null;
    log.info('CS Sheet backup scheduler stopped');
  }
}
