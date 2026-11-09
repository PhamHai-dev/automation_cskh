import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import cron from 'node-cron';
import {
  AttendanceSource,
  AttendanceSourceType,
  AttendanceStatus,
  ClassSessionStatus,
  EnrollmentClassStatus,
  EnrollmentStatus,
  ImportBatchStatus,
  ImportType,
  Prisma,
  ReconciliationState,
} from '@prisma/client';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';
import { encrypt, decrypt } from '../../shared/crypto/aes-gcm';
import { attendanceStatusLabel } from '../attendance/attendance.utils';
import {
  DiscoveredStudyReportLink,
  JlptChuyenCanReportRow,
  NormalizedSheetRow,
  ParsedStudentAttendanceRow,
  loadOptimizedWorkbook,
  mapClassModelType,
  normalizeActiveState,
  parseCskhAttendanceSheet,
  parseJlptSheetRows,
  parseJlptStudyReportWorkbook,
  parseKaiwaSheetRows,
  parseKaiwaStudyReportWorkbook,
  parseTeacherAttendanceSheet,
} from './sheet-sync.parser';
import { cleanJlptClassCode } from '../students/jlpt-attendance-report.util';

const log = createLogger('SheetSyncService');

export type SyncFlowType =
  | 'STUDENT_MASTER'
  | 'CSKH_ATTENDANCE'
  | 'TEACHER_ATTENDANCE'
  | 'STUDY_REPORT';

export type SyncSourceType = 'GOOGLE_SHEET' | 'LOCAL_FILE';

export interface SyncFilterConfig {
  sourceStatuses?: string[];
  activeStates?: string[];
  enrollmentStatuses?: string[];
  months?: number[];
}

export interface SheetSyncFieldDiff {
  field: string;
  label: string;
  fieldLabel?: string;
  before: any;
  after: any;
}

export interface SheetSyncPreviewItem {
  itemKey: string;
  rowNumber: number;
  externalId: string;
  studentName: string;
  fullName?: string;
  classCode: string | null;
  programType: string;
  entityType: 'StudentEnrollment' | 'Attendance' | 'StudyReport';
  action: 'CREATE' | 'UPDATE' | 'CONFLICT' | 'INVALID';
  classification?: 'CREATE' | 'UPDATE' | 'CONFLICT' | 'INVALID';
  defaultSelected: boolean;
  summaryText: string;
  fieldDiffs: SheetSyncFieldDiff[];
  warnings: string[];
  errors: string[];
  /** Internal payload used when committing */
  _payload?: any;
}

export interface SheetSyncPreviewResponse {
  previewToken: string;
  config: any;
  appliedFilter?: {
    syncYear: number | null;
    filterConfig: SyncFilterConfig;
  };
  sheetName: string;
  syncYear: number | null;
  filterConfig: SyncFilterConfig;
  warnings: string[];
  summary: {
    totalRowsScanned: number;
    FilteredOutCount: number;
    filteredOutCount: number;
    createCount: number;
    updateCount: number;
    conflictCount: number;
    invalidCount: number;
    unchangedCount: number;
  };
  items: SheetSyncPreviewItem[];
}

export interface SheetSyncResult {
  runId?: number;
  code: string;
  programType: string;
  flowType?: string;
  skipped: boolean;
  reason?: string;
  totalRows: number;
  unchangedRows: number;
  createdCount: number;
  updatedCount: number;
  conflictCount?: number;
  failedCount: number;
  byCvht: Record<string, number>;
  syncedAt: string;
  durationMs?: number;
  triggerType?: 'MANUAL' | 'AUTO';
  mode?: 'DELTA' | 'FULL';
}

export interface SheetSyncHistoryItem {
  id: number;
  runId: number;
  configId?: number;
  code: string;
  name: string;
  flowType: string;
  programType: string;
  status: 'SUCCESS' | 'PARTIAL_FAILED' | 'FAILED' | 'ROLLED_BACK' | 'PARTIAL_ROLLED_BACK';
  triggerType: 'MANUAL' | 'AUTO';
  mode: 'DELTA' | 'FULL';
  syncYear?: number | null;
  skipped: boolean;
  reason?: string | null;
  totalRows: number;
  unchangedRows: number;
  createdCount: number;
  updatedCount: number;
  conflictCount: number;
  failedCount: number;
  rolledBackCount: number;
  byCvht: Record<string, number>;
  durationMs: number;
  durationSec: number;
  syncedAt: string;
  createdAt: string;
  completedAt?: string | null;
  rolledBackAt?: string | null;
  error: string | null;
}

export interface CreateSyncConfigDTO {
  code?: string;
  name: string;
  flow_type?: SyncFlowType;
  program_type: 'JLPT' | 'KAIWA';
  source_type?: SyncSourceType;
  spreadsheet_url?: string | null;
  local_file_path?: string | null;
  sheet_name?: string;
  setting_sheet_name?: string | null;
  header_row?: number;
  sync_year?: number | null;
  filter_config?: SyncFilterConfig | null;
  target_student_external_id?: string | null;
  target_student_name?: string | null;
  target_class_code?: string | null;
  target_teacher_code?: string | null;
  cvht_mapping?: Record<string, number>;
  default_cs_id?: number | null;
  sync_interval_minutes?: number;
  enabled?: boolean;
}

export interface UpdateSyncConfigDTO {
  name?: string;
  flow_type?: SyncFlowType;
  program_type?: 'JLPT' | 'KAIWA';
  source_type?: SyncSourceType;
  spreadsheet_url?: string | null;
  local_file_path?: string | null;
  sheet_name?: string;
  setting_sheet_name?: string | null;
  header_row?: number;
  sync_year?: number | null;
  filter_config?: SyncFilterConfig | null;
  target_student_external_id?: string | null;
  target_student_name?: string | null;
  target_class_code?: string | null;
  target_teacher_code?: string | null;
  cvht_mapping?: Record<string, number>;
  default_cs_id?: number | null;
  sync_interval_minutes?: number;
  enabled?: boolean;
}

export interface BulkLinksDTO {
  mode: 'VALIDATE_ONLY' | 'CREATE';
  flow_type: SyncFlowType;
  program_type: 'JLPT' | 'KAIWA';
  sync_year?: number | null;
  enabled?: boolean;
  sync_interval_minutes?: number;
  raw_text?: string;
  items?: Array<{
    url: string;
    name?: string;
    sheet_name?: string;
    target_student_external_id?: string;
    target_student_name?: string;
    target_class_code?: string;
    target_teacher_code?: string;
  }>;
}

export interface ServiceAccountInfo {
  configured: boolean;
  clientEmail: string | null;
  projectId: string | null;
  source: 'DB' | 'ENV_FILE' | 'ENV_VARS' | 'NONE';
}

interface ParsedServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
}

interface CachedPreviewSession {
  previewToken: string;
  configId: number;
  configCode: string;
  createdAtMs: number;
  syncYear: number | null;
  filterConfig: SyncFilterConfig;
  sheetName: string;
  fileHash: string;
  sourceLabel: string;
  totalRowsScanned: number;
  filteredOutCount: number;
  unchangedCount: number;
  warnings: string[];
  items: SheetSyncPreviewItem[];
  discoveredReportLinks: DiscoveredStudyReportLink[];
}

const SERVICE_ACCOUNT_SETTING_KEY = 'GOOGLE_SERVICE_ACCOUNT_JSON';
const SYNC_SOURCE_TYPES_SETTING_KEY = 'SHEET_SYNC_SOURCE_TYPES';
const PREVIEW_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const previewCache = new Map<string, CachedPreviewSession>();

let cachedAccessToken: { token: string; expiresAtMs: number; clientEmail: string } | null = null;
let schemaEnsured = false;

export const ENROLLMENT_STATUS_VN_MAP: Record<EnrollmentStatus, string> = {
  [EnrollmentStatus.STUDYING]: 'Đang học',
  [EnrollmentStatus.WAITING_CLASS]: 'Chờ lớp',
  [EnrollmentStatus.PAUSED]: 'Bảo lưu',
  [EnrollmentStatus.FINISHED]: 'Kết thúc',
  [EnrollmentStatus.UPCOMING]: 'Sắp học',
  [EnrollmentStatus.NOT_STARTED]: 'Chưa học',
  [EnrollmentStatus.CANCELLED]: 'Hủy',
};

export function enrollmentStatusMatchesFilter(
  rowStatus: EnrollmentStatus,
  rawStatusText: string | null | undefined,
  allowedStatuses?: string[]
): boolean {
  if (!allowedStatuses || allowedStatuses.length === 0) return true;
  const allowedLower = allowedStatuses.map((s) => s.trim().toLowerCase());
  const rawLower = (rawStatusText || '').trim().toLowerCase();
  if (rawLower && allowedLower.includes(rawLower)) return true;

  const mappedVn = (ENROLLMENT_STATUS_VN_MAP[rowStatus] || '').toLowerCase();
  if (mappedVn && allowedLower.includes(mappedVn)) return true;

  // Special case: "Tạm nghỉ" maps to PAUSED ("Bảo lưu")
  if (rowStatus === EnrollmentStatus.PAUSED && (allowedLower.includes('bảo lưu') || allowedLower.includes('tạm nghỉ'))) {
    return true;
  }
  return false;
}

export class SheetSyncService {
  /**
   * Ensure new columns and tables exist on MySQL database even if migration hasn't been run manually
   */
  public async ensureSchema(): Promise<void> {
    if (schemaEnsured) return;
    schemaEnsured = true;
    try {
      const existingCols = (await prisma
        .$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'google_sheet_sync_configs'`
        )
        .catch(() => [])) as Array<{ COLUMN_NAME: string }>;
      const colSet = new Set(existingCols.map((c) => String(c.COLUMN_NAME).toLowerCase()));

      const neededColumns: Array<{ name: string; ddl: string }> = [
        { name: 'flow_type', ddl: `ALTER TABLE google_sheet_sync_configs ADD COLUMN flow_type VARCHAR(191) NOT NULL DEFAULT 'STUDENT_MASTER'` },
        { name: 'source_type', ddl: `ALTER TABLE google_sheet_sync_configs ADD COLUMN source_type VARCHAR(191) NOT NULL DEFAULT 'GOOGLE_SHEET'` },
        { name: 'sheet_gid', ddl: `ALTER TABLE google_sheet_sync_configs ADD COLUMN sheet_gid VARCHAR(191) NULL` },
        { name: 'sync_year', ddl: `ALTER TABLE google_sheet_sync_configs ADD COLUMN sync_year INT NULL` },
        { name: 'filter_config', ddl: `ALTER TABLE google_sheet_sync_configs ADD COLUMN filter_config JSON NULL` },
        { name: 'target_student_external_id', ddl: `ALTER TABLE google_sheet_sync_configs ADD COLUMN target_student_external_id VARCHAR(191) NULL` },
        { name: 'target_student_name', ddl: `ALTER TABLE google_sheet_sync_configs ADD COLUMN target_student_name VARCHAR(191) NULL` },
        { name: 'target_class_code', ddl: `ALTER TABLE google_sheet_sync_configs ADD COLUMN target_class_code VARCHAR(191) NULL` },
        { name: 'target_teacher_code', ddl: `ALTER TABLE google_sheet_sync_configs ADD COLUMN target_teacher_code VARCHAR(191) NULL` },
      ];
      for (const col of neededColumns) {
        if (!colSet.has(col.name)) {
          await prisma.$executeRawUnsafe(col.ddl).catch(() => {});
        }
      }

      await prisma
        .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS google_sheet_sync_runs (
          id INT NOT NULL AUTO_INCREMENT,
          config_id INT NOT NULL,
          config_code VARCHAR(191) NOT NULL,
          config_name VARCHAR(191) NOT NULL,
          flow_type VARCHAR(191) NOT NULL,
          program_type VARCHAR(191) NOT NULL,
          trigger_type VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
          status VARCHAR(191) NOT NULL DEFAULT 'SUCCESS',
          sync_year INT NULL,
          filter_snapshot JSON NULL,
          total_rows INT NOT NULL DEFAULT 0,
          created_count INT NOT NULL DEFAULT 0,
          updated_count INT NOT NULL DEFAULT 0,
          unchanged_count INT NOT NULL DEFAULT 0,
          conflict_count INT NOT NULL DEFAULT 0,
          failed_count INT NOT NULL DEFAULT 0,
          rolled_back_count INT NOT NULL DEFAULT 0,
          duration_ms INT NOT NULL DEFAULT 0,
          error_message TEXT NULL,
          triggered_by_id INT NULL,
          started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          completed_at DATETIME(3) NULL,
          rolled_back_at DATETIME(3) NULL,
          PRIMARY KEY (id),
          INDEX google_sheet_sync_runs_config_id_started_at_idx (config_id, started_at),
          INDEX google_sheet_sync_runs_flow_type_program_type_started_at_idx (flow_type, program_type, started_at),
          INDEX google_sheet_sync_runs_status_idx (status)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `)
        .catch(() => {});

      await prisma
        .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS google_sheet_sync_run_items (
          id INT NOT NULL AUTO_INCREMENT,
          run_id INT NOT NULL,
          \`row_number\` INT NULL,
          external_id VARCHAR(191) NULL,
          student_name VARCHAR(191) NULL,
          class_code VARCHAR(191) NULL,
          entity_type VARCHAR(191) NOT NULL,
          entity_id VARCHAR(191) NULL,
          action VARCHAR(191) NOT NULL,
          status VARCHAR(191) NOT NULL DEFAULT 'APPLIED',
          summary_text TEXT NULL,
          field_diffs JSON NULL,
          before_snapshot JSON NULL,
          after_snapshot JSON NULL,
          warnings JSON NULL,
          error_message TEXT NULL,
          rolled_back_at DATETIME(3) NULL,
          rolled_back_by_id INT NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          INDEX google_sheet_sync_run_items_run_id_action_idx (run_id, action),
          INDEX google_sheet_sync_run_items_external_id_idx (external_id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `)
        .catch(() => {});
    } catch {
      // Ignore schema ensure errors
    }
  }

  /**
   * Load Google Service Account credentials from DB (AppSetting) or Environment Variables
   */
  public async getServiceAccountKey(): Promise<{ key: ParsedServiceAccountKey | null; info: ServiceAccountInfo }> {
    try {
      const setting = await prisma.appSetting.findUnique({
        where: { key: SERVICE_ACCOUNT_SETTING_KEY },
      });
      if (setting && setting.value && typeof setting.value === 'object') {
        const val = setting.value as Record<string, any>;
        if (val.client_email && val.private_key) {
          const rawKey = String(val.private_key);
          let decryptedKey = rawKey;
          if (!rawKey.includes('-----BEGIN') && !rawKey.includes('PRIVATE KEY')) {
            try {
              decryptedKey = decrypt(rawKey, process.env.JWT_SECRET || 'default-secret');
            } catch {
              decryptedKey = rawKey;
            }
          }
          return {
            key: {
              client_email: String(val.client_email).trim(),
              private_key: decryptedKey.replace(/\\n/g, '\n'),
              project_id: val.project_id ? String(val.project_id) : undefined,
              token_uri: val.token_uri ? String(val.token_uri) : undefined,
            },
            info: {
              configured: true,
              clientEmail: String(val.client_email).trim(),
              projectId: val.project_id ? String(val.project_id) : null,
              source: 'DB',
            },
          };
        }
      }
    } catch {
      // Ignore DB lookup errors
    }

    const jsonPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH?.trim();
    if (jsonPath) {
      const candidates = [
        path.resolve(process.cwd(), jsonPath),
        path.resolve(process.cwd(), '..', jsonPath),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          try {
            const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (raw.client_email && raw.private_key) {
              return {
                key: {
                  client_email: String(raw.client_email).trim(),
                  private_key: String(raw.private_key).replace(/\\n/g, '\n'),
                  project_id: raw.project_id,
                  token_uri: raw.token_uri,
                },
                info: {
                  configured: true,
                  clientEmail: String(raw.client_email).trim(),
                  projectId: raw.project_id || null,
                  source: 'ENV_FILE',
                },
              };
            }
          } catch {
            // Invalid JSON file
          }
        }
      }
    }

    const envEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    const envKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
    if (envEmail && envKey) {
      return {
        key: {
          client_email: envEmail,
          private_key: envKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n'),
        },
        info: {
          configured: true,
          clientEmail: envEmail,
          projectId: null,
          source: 'ENV_VARS',
        },
      };
    }

    return {
      key: null,
      info: {
        configured: false,
        clientEmail: null,
        projectId: null,
        source: 'NONE',
      },
    };
  }

  public async saveServiceAccountJson(rawJson: string | Record<string, any> | null, userId?: number): Promise<ServiceAccountInfo> {
    cachedAccessToken = null;

    if (!rawJson || (typeof rawJson === 'string' && !rawJson.trim())) {
      await prisma.appSetting.deleteMany({
        where: { key: SERVICE_ACCOUNT_SETTING_KEY },
      });
      const { info } = await this.getServiceAccountKey();
      return info;
    }

    let parsed: Record<string, any>;
    try {
      parsed = typeof rawJson === 'string' ? JSON.parse(rawJson.trim()) : rawJson;
    } catch {
      throw new AppError(400, 'Nội dung JSON Service Account không hợp lệ. Vui lòng dán nguyên nội dung file .json tải từ Google Cloud.');
    }

    if (!parsed.client_email || !parsed.private_key || !String(parsed.private_key).includes('PRIVATE KEY')) {
      throw new AppError(400, 'File JSON thiếu trường "client_email" hoặc "private_key" hợp lệ của Google Service Account.');
    }

    const encryptedKey = encrypt(
      String(parsed.private_key).replace(/\\n/g, '\n'),
      process.env.JWT_SECRET || 'default-secret'
    );
    const toStore = {
      ...parsed,
      private_key: encryptedKey,
      private_key_encrypted: true,
    };

    await prisma.appSetting.upsert({
      where: { key: SERVICE_ACCOUNT_SETTING_KEY },
      update: {
        value: toStore as Prisma.InputJsonValue,
        updated_by_id: userId || null,
      },
      create: {
        key: SERVICE_ACCOUNT_SETTING_KEY,
        value: toStore as Prisma.InputJsonValue,
        updated_by_id: userId || null,
      },
    });

    const { info } = await this.getServiceAccountKey();
    return info;
  }

  public async getGoogleAccessToken(sa: ParsedServiceAccountKey, _writable = false): Promise<string> {
    const nowSec = Math.floor(Date.now() / 1000);
    if (
      cachedAccessToken &&
      cachedAccessToken.clientEmail === sa.client_email &&
      cachedAccessToken.expiresAtMs > Date.now() + 60_000
    ) {
      return cachedAccessToken.token;
    }

    const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets',
      aud: tokenUri,
      iat: nowSec,
      exp: nowSec + 3600,
    };

    const base64UrlEncode = (obj: object) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer
      .sign(sa.private_key, 'base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const assertion = `${unsignedToken}.${signature}`;

    const resp = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new AppError(
        401,
        `Xác thực Google Service Account (${sa.client_email}) thất bại: ${errText || resp.statusText}`
      );
    }

    const tokenData = (await resp.json()) as { access_token: string; expires_in?: number };
    cachedAccessToken = {
      token: tokenData.access_token,
      clientEmail: sa.client_email,
      expiresAtMs: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };

    return tokenData.access_token;
  }

  public async getAuthorizedAccessToken(): Promise<{ accessToken: string; clientEmail: string } | null> {
    const { key } = await this.getServiceAccountKey();
    if (!key) return null;
    const accessToken = await this.getGoogleAccessToken(key, true);
    return { accessToken, clientEmail: key.client_email };
  }

  public sha256(data: Buffer | string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  public extractSpreadsheetId(url?: string | null): string | null {
    if (!url) return null;
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  public extractSheetGid(url?: string | null): string | null {
    if (!url) return null;
    const match = url.match(/[?&#]gid=(\d+)/);
    return match ? match[1] : null;
  }

  public async buildDefaultCvhtMapping(): Promise<{
    mapping: Record<string, number>;
    defaultCsId: number;
    csUsers: Array<{ id: number; name: string | null; email: string; staff_code: string | null }>;
  }> {
    const allUsers = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, staff_code: true, roles: true },
      orderBy: { id: 'asc' },
    });

    const csUsers = allUsers.filter((u) => {
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      return roles.includes('CS') || (u.staff_code && u.staff_code.toUpperCase().startsWith('CVHT'));
    });

    const mapping: Record<string, number> = {};

    for (const u of allUsers) {
      if (u.staff_code) {
        mapping[u.staff_code.trim().toUpperCase()] = u.id;
      }
      const emailLower = u.email.toLowerCase();
      if (emailLower === 'cskh1@gmail.com' && !mapping.CVHT01) mapping.CVHT01 = u.id;
      if (emailLower === 'cskh2@gmail.com' && !mapping.CVHT02) mapping.CVHT02 = u.id;
      if (emailLower === 'cskh3@gmail.com' && !mapping.CVHT03) mapping.CVHT03 = u.id;
    }

    for (const code of ['CVHT01', 'CVHT02', 'CVHT03']) {
      const uid = mapping[code];
      if (uid) {
        const u = allUsers.find((x) => x.id === uid);
        if (u && !u.staff_code) {
          await prisma.user
            .update({
              where: { id: uid },
              data: { staff_code: code },
            })
            .catch(() => {});
          u.staff_code = code;
        }
      }
    }

    const defaultCsId = mapping.CVHT01 || csUsers[0]?.id || allUsers[0]?.id || 1;

    return {
      mapping,
      defaultCsId,
      csUsers: csUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        staff_code: u.staff_code,
      })),
    };
  }

  private resolveExistingSampleFile(candidates: string[]): string {
    for (const rel of candidates) {
      const absCandidates = [
        path.resolve(process.cwd(), rel),
        path.resolve(process.cwd(), '..', rel),
        path.resolve(__dirname, '../../../../', rel),
      ];
      if (absCandidates.some((p) => fs.existsSync(p))) {
        return rel;
      }
    }
    return candidates[0];
  }

  /**
   * Ensure default configs across all 4 flows exist in DB
   */
  public async ensureDefaultConfigs() {
    await this.ensureSchema();
    const { mapping, defaultCsId } = await this.buildDefaultCvhtMapping();

    const existing = await prisma.googleSheetSyncConfig.findMany({
      orderBy: { id: 'asc' },
    });
    const byCode = new Map(existing.map((c) => [c.code.toUpperCase(), c]));

    const jlptMasterFile = this.resolveExistingSampleFile([
      'docs/data/hoc_vien/hoc_vien_jlpt.xlsx',
      'docs/data/import_data/File nguồn tổng JLPT.xlsx',
    ]);
    const kaiwaMasterFile = this.resolveExistingSampleFile([
      'docs/data/hoc_vien/hoc_vien_kaiwa.xlsx',
      'docs/data/import_data/File nguồn tổng Kaiwa.xlsx',
    ]);
    const jlptAttendanceFile = this.resolveExistingSampleFile([
      'docs/data/import_data/File nguồn tổng JLPT.xlsx',
      'docs/data/hoc_vien/hoc_vien_jlpt.xlsx',
    ]);
    const kaiwaAttendanceFile = this.resolveExistingSampleFile([
      'docs/data/import_data/Sheet3_cham_buoi.xlsx',
    ]);

    const defaults: Array<Prisma.GoogleSheetSyncConfigCreateInput> = [
      {
        code: 'JLPT',
        name: 'File nguồn tổng JLPT',
        flow_type: 'STUDENT_MASTER',
        source_type: 'LOCAL_FILE',
        program_type: 'JLPT',
        local_file_path: jlptMasterFile,
        sheet_name: 'Data JLPT_Inhouse',
        setting_sheet_name: 'Setting',
        header_row: 2,
        sync_year: null,
        filter_config: {
          activeStates: ['Active', 'Deactive'],
          enrollmentStatuses: ['Đang học', 'Chờ lớp', 'Bảo lưu', 'Tạm nghỉ', 'Kết thúc'],
        },
        cvht_mapping: mapping,
        default_cs_id: defaultCsId,
        sync_interval_minutes: 30,
        enabled: false,
        last_status: 'IDLE',
      },
      {
        code: 'KAIWA',
        name: 'File nguồn tổng Kaiwa',
        flow_type: 'STUDENT_MASTER',
        source_type: 'LOCAL_FILE',
        program_type: 'KAIWA',
        local_file_path: kaiwaMasterFile,
        sheet_name: 'Tổng',
        setting_sheet_name: null,
        header_row: 2,
        sync_year: null,
        filter_config: {
          sourceStatuses: ['HV mới', 'HV combo'],
          enrollmentStatuses: ['Đang học', 'Chờ lớp', 'Bảo lưu', 'Kết thúc'],
        },
        cvht_mapping: mapping,
        default_cs_id: defaultCsId,
        sync_interval_minutes: 30,
        enabled: false,
        last_status: 'IDLE',
      },
      {
        code: 'KAIWA_CARE',
        name: 'Báo cáo & Chăm sóc Kaiwa (1.Chăm sóc)',
        flow_type: 'STUDENT_MASTER',
        source_type: 'LOCAL_FILE',
        program_type: 'KAIWA',
        local_file_path: 'docs/data/import_data/Sheet3_cham_buoi.xlsx',
        sheet_name: '1.Chăm sóc',
        setting_sheet_name: null,
        header_row: 3,
        sync_year: null,
        filter_config: {},
        cvht_mapping: mapping,
        default_cs_id: defaultCsId,
        sync_interval_minutes: 30,
        enabled: false,
        last_status: 'IDLE',
      },
      {
        code: 'JLPT_CSKH_ATTENDANCE',
        name: 'Điểm danh CVHT - JLPT',
        flow_type: 'CSKH_ATTENDANCE',
        source_type: 'LOCAL_FILE',
        program_type: 'JLPT',
        local_file_path: jlptAttendanceFile,
        sheet_name: 'Chấm buổi',
        header_row: 2,
        sync_year: 2026,
        filter_config: {
          months: [],
          enrollmentStatuses: ['Đang học', 'Bảo lưu', 'Kết thúc'],
        },
        cvht_mapping: mapping,
        default_cs_id: defaultCsId,
        sync_interval_minutes: 30,
        enabled: false,
        last_status: 'IDLE',
      },
      {
        code: 'KAIWA_CSKH_ATTENDANCE',
        name: 'Điểm danh CVHT - Kaiwa',
        flow_type: 'CSKH_ATTENDANCE',
        source_type: 'LOCAL_FILE',
        program_type: 'KAIWA',
        local_file_path: kaiwaAttendanceFile,
        sheet_name: '3.Chấm buổi',
        header_row: 2,
        sync_year: 2026,
        filter_config: {
          months: [],
          enrollmentStatuses: ['Đang học', 'Bảo lưu', 'Kết thúc'],
        },
        cvht_mapping: mapping,
        default_cs_id: defaultCsId,
        sync_interval_minutes: 30,
        enabled: false,
        last_status: 'IDLE',
      },
      {
        code: 'JLPT_TEACHER_ATTENDANCE',
        name: 'Điểm danh Giáo viên - JLPT (GV505)',
        flow_type: 'TEACHER_ATTENDANCE',
        source_type: 'LOCAL_FILE',
        program_type: 'JLPT',
        local_file_path: 'docs/data/import_data/giao_vien_JLPT.xlsx',
        sheet_name: '2026 スケジュール',
        header_row: 2,
        sync_year: 2026,
        target_teacher_code: 'GV505',
        filter_config: { months: [] },
        cvht_mapping: mapping,
        default_cs_id: defaultCsId,
        sync_interval_minutes: 30,
        enabled: false,
        last_status: 'IDLE',
      },
      {
        code: 'KAIWA_TEACHER_ATTENDANCE',
        name: 'Điểm danh Giáo viên - Kaiwa (GV505)',
        flow_type: 'TEACHER_ATTENDANCE',
        source_type: 'LOCAL_FILE',
        program_type: 'KAIWA',
        local_file_path: 'docs/data/import_data/giao_vien_kaiwa.xlsx',
        sheet_name: '2026 スケジュール',
        header_row: 2,
        sync_year: 2026,
        target_teacher_code: 'GV505',
        filter_config: { months: [] },
        cvht_mapping: mapping,
        default_cs_id: defaultCsId,
        sync_interval_minutes: 30,
        enabled: false,
        last_status: 'IDLE',
      },
      {
        code: 'JLPT_STUDY_REPORT_SAMPLE',
        name: 'Báo cáo học tập JLPT - Chuyên cần HV',
        flow_type: 'STUDY_REPORT',
        source_type: 'LOCAL_FILE',
        program_type: 'JLPT',
        local_file_path: 'docs/data/import_data/Format báo cáo học tập JLPT.xlsx',
        sheet_name: 'Chuyên cần HV',
        header_row: 4,
        target_student_external_id: null,
        target_student_name: null,
        target_class_code: null,
        cvht_mapping: mapping,
        default_cs_id: defaultCsId,
        sync_interval_minutes: 30,
        enabled: false,
        last_status: 'IDLE',
      },
      {
        code: 'KAIWA_STUDY_REPORT_SAMPLE',
        name: 'Báo cáo học tập Kaiwa - Đỗ Phú Sĩ',
        flow_type: 'STUDY_REPORT',
        source_type: 'LOCAL_FILE',
        program_type: 'KAIWA',
        local_file_path: 'docs/data/import_data/Format báo cáo học tập kaiwa.xlsx',
        sheet_name: '会話 3 - 学習レポート',
        header_row: 1,
        target_student_external_id: '427901798',
        target_student_name: 'Đỗ Phú Sĩ',
        target_class_code: 'SKAI31030JP',
        cvht_mapping: mapping,
        default_cs_id: defaultCsId,
        sync_interval_minutes: 30,
        enabled: false,
        last_status: 'IDLE',
      },
    ];

    for (const def of defaults) {
      const existingCfg = byCode.get(def.code.toUpperCase());
      if (!existingCfg) {
        await prisma.googleSheetSyncConfig.create({ data: def }).catch(() => {});
      } else {
        const needsLegacyJlptReportMigrate =
          def.code.toUpperCase() === 'JLPT_STUDY_REPORT_SAMPLE' &&
          existingCfg.sheet_name === 'Trang tính1';

        const needsFilePathFix =
          def.local_file_path &&
          (!existingCfg.local_file_path ||
            existingCfg.local_file_path.includes('hoc_vien/') ||
            !this.doesLocalFileExist(existingCfg.local_file_path));

        if (needsLegacyJlptReportMigrate || needsFilePathFix) {
          await prisma.googleSheetSyncConfig
            .update({
              where: { id: existingCfg.id },
              data: {
                ...(needsFilePathFix
                  ? {
                      local_file_path: def.local_file_path,
                      ...(!existingCfg.spreadsheet_url ? { source_type: 'LOCAL_FILE' } : {}),
                    }
                  : {}),
                ...(needsLegacyJlptReportMigrate
                  ? {
                      name: 'Báo cáo học tập JLPT - Chuyên cần HV',
                      sheet_name: 'Chuyên cần HV',
                      header_row: 4,
                      target_student_external_id: null,
                      target_student_name: null,
                      target_class_code: null,
                    }
                  : {}),
              },
            })
            .catch(() => {});
        }
      }
    }
  }

  private doesLocalFileExist(relOrAbsPath: string): boolean {
    if (!relOrAbsPath || !relOrAbsPath.trim()) return false;
    const p = relOrAbsPath.trim();
    const candidates = path.isAbsolute(p)
      ? [p]
      : [
          path.resolve(process.cwd(), p),
          path.resolve(process.cwd(), '..', p),
          path.resolve(__dirname, '../../../../', p),
        ];
    return candidates.some((c) => fs.existsSync(c));
  }

  public async getSourceTypeMap(): Promise<Record<string, SyncSourceType>> {
    try {
      const setting = await prisma.appSetting.findUnique({
        where: { key: SYNC_SOURCE_TYPES_SETTING_KEY },
      });
      if (setting && setting.value && typeof setting.value === 'object') {
        return setting.value as Record<string, SyncSourceType>;
      }
    } catch {
      // Ignore lookup errors
    }
    return {};
  }

  public async setSourceType(code: string, sourceType: SyncSourceType, userId?: number): Promise<void> {
    const upperCode = code.trim().toUpperCase();
    const current = await this.getSourceTypeMap();
    const next: Record<string, SyncSourceType> = {
      ...current,
      [upperCode]: sourceType === 'GOOGLE_SHEET' ? 'GOOGLE_SHEET' : 'LOCAL_FILE',
    };
    await prisma.appSetting
      .upsert({
        where: { key: SYNC_SOURCE_TYPES_SETTING_KEY },
        update: {
          value: next as Prisma.InputJsonValue,
          updated_by_id: userId || null,
        },
        create: {
          key: SYNC_SOURCE_TYPES_SETTING_KEY,
          value: next as Prisma.InputJsonValue,
          updated_by_id: userId || null,
        },
      })
      .catch(() => {});
  }

  public resolveConfigSourceType(
    cfg: { code: string; source_type?: string | null; spreadsheet_url?: string | null; local_file_path?: string | null },
    sourceTypeMap: Record<string, SyncSourceType>
  ): SyncSourceType {
    const hasSpreadsheetUrl = Boolean(cfg.spreadsheet_url && cfg.spreadsheet_url.trim());
    const hasLocalFile = Boolean(cfg.local_file_path && cfg.local_file_path.trim());
    const upper = cfg.code.trim().toUpperCase();
    const explicit = sourceTypeMap[upper];

    if (explicit === 'LOCAL_FILE') {
      return 'LOCAL_FILE';
    }
    if (explicit === 'GOOGLE_SHEET') {
      if (hasSpreadsheetUrl) return 'GOOGLE_SHEET';
      if (hasLocalFile) return 'LOCAL_FILE';
      return 'GOOGLE_SHEET';
    }
    if (hasSpreadsheetUrl) {
      return 'GOOGLE_SHEET';
    }
    if (cfg.source_type === 'LOCAL_FILE' || hasLocalFile) {
      return 'LOCAL_FILE';
    }
    return 'GOOGLE_SHEET';
  }

  public isConfigReady(
    cfg: {
      code: string;
      source_type?: string | null;
      spreadsheet_url?: string | null;
      local_file_path?: string | null;
      sheet_name?: string | null;
    },
    sourceTypeMap: Record<string, SyncSourceType>
  ): boolean {
    const sheetName = (cfg.sheet_name || '').trim();
    if (!sheetName) return false;

    const sourceType = this.resolveConfigSourceType(cfg, sourceTypeMap);
    if (sourceType === 'GOOGLE_SHEET') {
      return Boolean(this.extractSpreadsheetId(cfg.spreadsheet_url) || (cfg.spreadsheet_url || '').trim());
    }
    return Boolean((cfg.local_file_path || '').trim());
  }

  /**
   * Find a config by either numeric id or string code
   */
  public async findConfigByIdOrCode(idOrCode: string | number) {
    await this.ensureDefaultConfigs();
    const str = String(idOrCode).trim();
    if (/^\d+$/.test(str)) {
      const byId = await prisma.googleSheetSyncConfig.findUnique({
        where: { id: parseInt(str, 10) },
      });
      if (byId) return byId;
    }
    const upper = str.toUpperCase();
    const byCode = await prisma.googleSheetSyncConfig.findUnique({
      where: { code: upper },
    });
    if (byCode) return byCode;

    const byCaseInsensitive = await prisma.googleSheetSyncConfig.findFirst({
      where: { code: str },
    });
    if (byCaseInsensitive) return byCaseInsensitive;

    throw new AppError(404, `Không tìm thấy cấu hình đồng bộ cho mã [${str}]`);
  }

  /**
   * Auto-upsert a STUDY_REPORT config when a student's studyReportUrl is discovered from STUDENT_MASTER or TEACHER_ATTENDANCE
   */
  public async autoUpsertStudyReportConfig(link: DiscoveredStudyReportLink, defaultCsId?: number | null): Promise<void> {
    if (!link.studyReportUrl || !link.externalId) return;
    const sheetId = this.extractSpreadsheetId(link.studyReportUrl);
    if (!sheetId) return;
    const gid = this.extractSheetGid(link.studyReportUrl);

    const code = `SR_${link.programType}_${link.externalId}`.toUpperCase();
    const defaultSheetName = link.programType === 'JLPT' ? 'Chuyên cần HV' : '会話 3 - 学習レポート';
    const defaultHeaderRow = link.programType === 'JLPT' ? 4 : 1;
    const name = `Báo cáo học tập ${link.programType} - ${link.studentName || link.externalId}`;

    try {
      const existing = await prisma.googleSheetSyncConfig.findFirst({
        where: {
          OR: [
            { code },
            {
              flow_type: 'STUDY_REPORT',
              program_type: link.programType,
              target_student_external_id: link.externalId,
            },
          ],
        },
      });

      if (existing) {
        await prisma.googleSheetSyncConfig.update({
          where: { id: existing.id },
          data: {
            spreadsheet_url: link.studyReportUrl,
            spreadsheet_id: sheetId,
            sheet_gid: gid,
            source_type: 'GOOGLE_SHEET',
            target_student_external_id: link.externalId,
            target_student_name: link.studentName || existing.target_student_name,
            target_class_code: link.classCode || existing.target_class_code,
          },
        });
      } else {
        await prisma.googleSheetSyncConfig.create({
          data: {
            code,
            name,
            flow_type: 'STUDY_REPORT',
            source_type: 'GOOGLE_SHEET',
            program_type: link.programType,
            spreadsheet_url: link.studyReportUrl,
            spreadsheet_id: sheetId,
            sheet_gid: gid,
            sheet_name: defaultSheetName,
            header_row: defaultHeaderRow,
            target_student_external_id: link.externalId,
            target_student_name: link.studentName,
            target_class_code: link.classCode,
            default_cs_id: defaultCsId || null,
            sync_interval_minutes: 60,
            enabled: true,
            last_status: 'IDLE',
          },
        });
      }
    } catch {
      // Non-blocking auto-discovery
    }
  }

  /**
   * GET /api/v1/imports/sheet-sync/configs
   */
  public async getConfigs(query?: {
    search?: string;
    flowType?: string;
    programType?: string;
    sourceType?: string;
    enabled?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    await this.ensureDefaultConfigs();
    const { csUsers, mapping, defaultCsId } = await this.buildDefaultCvhtMapping();
    const { info: serviceAccount } = await this.getServiceAccountKey();
    const sourceTypeMap = await this.getSourceTypeMap();
    const allConfigs = await prisma.googleSheetSyncConfig.findMany({
      orderBy: { id: 'asc' },
    });

    const enrichedAll = [];
    const flowCounts = {
      ALL: 0,
      STUDENT_MASTER: 0,
      CSKH_ATTENDANCE: 0,
      TEACHER_ATTENDANCE: 0,
      STUDY_REPORT: 0,
    };

    for (const cfg of allConfigs) {
      const effectiveSourceType = this.resolveConfigSourceType(cfg, sourceTypeMap);
      const isReady = this.isConfigReady(cfg, sourceTypeMap);
      const needsMappingInit = !cfg.cvht_mapping || Object.keys(cfg.cvht_mapping as object).length === 0;
      // Local file without spreadsheet_url cannot have Auto Sync enabled
      const hasValidGoogleSheet = effectiveSourceType === 'GOOGLE_SHEET' && Boolean(this.extractSpreadsheetId(cfg.spreadsheet_url));
      const needsDisable = (!isReady || !hasValidGoogleSheet) && cfg.enabled;

      if (needsMappingInit || needsDisable || cfg.source_type !== effectiveSourceType) {
        const updated = await prisma.googleSheetSyncConfig.update({
          where: { id: cfg.id },
          data: {
            source_type: effectiveSourceType,
            ...(needsMappingInit
              ? {
                  cvht_mapping: mapping,
                  default_cs_id: cfg.default_cs_id || defaultCsId,
                }
              : {}),
            ...(needsDisable ? { enabled: false } : {}),
          },
        });
        Object.assign(cfg, updated);
      }

      const flowKey = (cfg.flow_type || 'STUDENT_MASTER') as SyncFlowType;
      flowCounts.ALL++;
      if (flowKey in flowCounts) {
        flowCounts[flowKey]++;
      }

      enrichedAll.push({
        ...cfg,
        flow_type: flowKey,
        source_type: effectiveSourceType,
      });
    }

    // Apply filtering
    const searchLower = query?.search ? query.search.trim().toLowerCase() : '';
    const flowFilter = query?.flowType && query.flowType !== 'ALL' ? query.flowType.toUpperCase() : null;
    const progFilter = query?.programType && query.programType !== 'ALL' ? query.programType.toUpperCase() : null;
    const srcFilter = query?.sourceType && query.sourceType !== 'ALL' ? query.sourceType.toUpperCase() : null;
    const enabledFilter =
      query?.enabled === 'true' ? true : query?.enabled === 'false' ? false : null;
    const statusFilter = query?.status && query.status !== 'ALL' ? query.status.toUpperCase() : null;

    const filtered = enrichedAll.filter((c) => {
      if (flowFilter && c.flow_type.toUpperCase() !== flowFilter) return false;
      if (progFilter && c.program_type.toUpperCase() !== progFilter) return false;
      if (srcFilter && c.source_type.toUpperCase() !== srcFilter) return false;
      if (enabledFilter !== null && c.enabled !== enabledFilter) return false;
      if (statusFilter && (c.last_status || 'IDLE').toUpperCase() !== statusFilter) return false;
      if (searchLower) {
        const haystack = [
          c.code,
          c.name,
          c.sheet_name,
          c.target_student_external_id,
          c.target_student_name,
          c.target_class_code,
          c.target_teacher_code,
          c.spreadsheet_url,
          c.local_file_path,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      return true;
    });

    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(query?.pageSize) || 100), 500);
    const pagedConfigs = query?.page
      ? filtered.slice((page - 1) * pageSize, page * pageSize)
      : filtered;

    return {
      configs: pagedConfigs,
      total: filtered.length,
      page,
      pageSize,
      flowCounts,
      csUsers,
      serviceAccount,
      filterOptions: {
        jlptSourceStatuses: ['HV Mới', 'Đặt cọc'],
        jlptActiveStates: ['Active', 'Deactive'],
        kaiwaSourceStatuses: ['HV mới', 'HV combo'],
        enrollmentStatuses: ['Đang học', 'Chờ lớp', 'Bảo lưu', 'Tạm nghỉ', 'Sắp học', 'Chưa học', 'Kết thúc'],
        availableYears: [2024, 2025, 2026, 2027],
      },
    };
  }

  /**
   * POST /api/v1/imports/sheet-sync/configs
   */
  public async createConfig(dto: CreateSyncConfigDTO, userId?: number) {
    await this.ensureDefaultConfigs();
    const { mapping, defaultCsId } = await this.buildDefaultCvhtMapping();

    const flowType: SyncFlowType = dto.flow_type || 'STUDENT_MASTER';
    const programType: 'JLPT' | 'KAIWA' = dto.program_type?.toUpperCase() === 'JLPT' ? 'JLPT' : 'KAIWA';
    const spreadsheetUrl = dto.spreadsheet_url?.trim() || null;
    const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);
    const sheetGid = this.extractSheetGid(spreadsheetUrl);

    const sourceType: SyncSourceType =
      dto.source_type || (spreadsheetUrl ? 'GOOGLE_SHEET' : 'LOCAL_FILE');

    let defaultSheetName = 'Tổng';
    if (flowType === 'STUDENT_MASTER') {
      defaultSheetName = programType === 'JLPT' ? 'Data JLPT_Inhouse' : 'Tổng';
    } else if (flowType === 'CSKH_ATTENDANCE') {
      defaultSheetName = programType === 'JLPT' ? 'Chấm buổi' : '3.Chấm buổi';
    } else if (flowType === 'TEACHER_ATTENDANCE') {
      defaultSheetName = `${dto.sync_year || 2026} スケジュール`;
    } else if (flowType === 'STUDY_REPORT') {
      defaultSheetName = programType === 'JLPT' ? 'Chuyên cần HV' : '会話 3 - 学習レポート';
    }

    const sheetName = (dto.sheet_name || defaultSheetName).trim();
    const rawCode =
      dto.code?.trim().toUpperCase() ||
      `${flowType.slice(0, 3)}_${programType}_${Date.now().toString(36).toUpperCase()}`;

    // Local file or missing Google Sheet URL forces enabled = false
    const canEnableAutoSync = sourceType === 'GOOGLE_SHEET' && Boolean(spreadsheetId);
    const enabled = canEnableAutoSync ? Boolean(dto.enabled ?? true) : false;

    const syncYear =
      flowType === 'CSKH_ATTENDANCE' || flowType === 'TEACHER_ATTENDANCE'
        ? dto.sync_year || 2026
        : dto.sync_year ?? null;

    const defaultHeaderRow =
      flowType === 'STUDY_REPORT'
        ? programType === 'JLPT'
          ? 4
          : 1
        : sheetName === '1.Chăm sóc'
          ? 3
          : 2;

    const created = await prisma.googleSheetSyncConfig.create({
      data: {
        code: rawCode,
        name: (dto.name || `Đồng bộ ${programType} - ${sheetName}`).trim(),
        flow_type: flowType,
        source_type: sourceType,
        program_type: programType,
        spreadsheet_url: spreadsheetUrl,
        spreadsheet_id: spreadsheetId,
        sheet_gid: sheetGid,
        local_file_path: dto.local_file_path || null,
        sheet_name: sheetName,
        setting_sheet_name: dto.setting_sheet_name ?? (programType === 'JLPT' && flowType === 'STUDENT_MASTER' ? 'Setting' : null),
        header_row: dto.header_row || defaultHeaderRow,
        sync_year: syncYear,
        filter_config: (dto.filter_config || {}) as Prisma.InputJsonValue,
        target_student_external_id: dto.target_student_external_id?.trim() || null,
        target_student_name: dto.target_student_name?.trim() || null,
        target_class_code: dto.target_class_code?.trim() || null,
        target_teacher_code: dto.target_teacher_code?.trim() || null,
        cvht_mapping: (dto.cvht_mapping || mapping) as Prisma.InputJsonValue,
        default_cs_id: dto.default_cs_id || defaultCsId,
        sync_interval_minutes: dto.sync_interval_minutes || 30,
        enabled,
        last_status: 'IDLE',
      },
    });

    await this.setSourceType(created.code, sourceType, userId);
    return created;
  }

  /**
   * DELETE /api/v1/imports/sheet-sync/configs/:code
   */
  public async deleteConfig(idOrCode: string | number) {
    const existing = await this.findConfigByIdOrCode(idOrCode);
    await prisma.googleSheetSyncConfig.delete({
      where: { id: existing.id },
    });
    return { deleted: true, id: existing.id, code: existing.code };
  }

  /**
   * POST /api/v1/imports/sheet-sync/configs/bulk-links
   * Bulk paste & validate multiple Google Sheet links
   */
  public async bulkPasteLinks(dto: BulkLinksDTO, userId?: number) {
    await this.ensureDefaultConfigs();
    const { mapping, defaultCsId } = await this.buildDefaultCvhtMapping();
    const flowType: SyncFlowType = dto.flow_type || 'STUDY_REPORT';
    const programType: 'JLPT' | 'KAIWA' = dto.program_type?.toUpperCase() === 'JLPT' ? 'JLPT' : 'KAIWA';

    interface RawCandidate {
      lineNumber: number;
      url: string;
      name?: string;
      sheet_name?: string;
      target_student_external_id?: string;
      target_student_name?: string;
      target_class_code?: string;
      target_teacher_code?: string;
    }

    const candidates: RawCandidate[] = [];

    if (Array.isArray(dto.items) && dto.items.length > 0) {
      dto.items.forEach((it, idx) => {
        candidates.push({
          lineNumber: idx + 1,
          url: (it.url || '').trim(),
          name: it.name,
          sheet_name: it.sheet_name,
          target_student_external_id: it.target_student_external_id,
          target_student_name: it.target_student_name,
          target_class_code: it.target_class_code,
          target_teacher_code: it.target_teacher_code,
        });
      });
    } else if (dto.raw_text) {
      const lines = dto.raw_text.split(/\r?\n/);
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const urlMatch = trimmed.match(/https?:\/\/[^\s|,;]+/i);
        const url = urlMatch ? urlMatch[0].trim() : trimmed;
        const rest = trimmed.replace(url, '').trim();
        const parts = rest
          .split(/[\t|,;]+/)
          .map((p) => p.trim())
          .filter(Boolean);

        let extId: string | undefined;
        let stuName: string | undefined;
        let clsCode: string | undefined;

        for (const p of parts) {
          if (/^\d{6,15}$/.test(p) && !extId) {
            extId = p;
          } else if (/^[A-Z0-9_]{4,20}$/i.test(p) && /\d/.test(p) && !clsCode) {
            clsCode = p;
          } else if (!stuName) {
            stuName = p;
          }
        }

        candidates.push({
          lineNumber: idx + 1,
          url,
          target_student_external_id: extId,
          target_student_name: stuName,
          target_class_code: clsCode,
        });
      });
    }

    const existingConfigs = await prisma.googleSheetSyncConfig.findMany({
      where: { flow_type: flowType, program_type: programType },
    });
    const existingBySheetId = new Map<string, (typeof existingConfigs)[number]>();
    for (const c of existingConfigs) {
      const sid = c.spreadsheet_id || this.extractSpreadsheetId(c.spreadsheet_url);
      if (sid) existingBySheetId.set(`${sid}::${c.sheet_gid || ''}`, c);
    }

    const students = await prisma.student.findMany({
      include: {
        enrollments: {
          include: {
            package: true,
            enrollment_classes: { include: { class: true } },
          },
        },
      },
    });
    const studentByExtId = new Map(
      students.filter((s) => s.external_id).map((s) => [s.external_id!, s])
    );

    const seenInBatch = new Set<string>();
    const validatedItems: Array<Record<string, any>> = [];

    for (const cand of candidates) {
      const sheetId = this.extractSpreadsheetId(cand.url);
      const gid = this.extractSheetGid(cand.url);
      const invalidUrl = !sheetId;
      const batchKey = sheetId ? `${sheetId}::${gid || ''}` : cand.url;
      const dupBatch = Boolean(sheetId && seenInBatch.has(batchKey));
      if (sheetId) seenInBatch.add(batchKey);

      const existing = sheetId ? existingBySheetId.get(batchKey) : undefined;
      const alreadyExists = Boolean(existing);

      let extId = cand.target_student_external_id?.trim() || null;
      let stuName = cand.target_student_name?.trim() || null;
      let clsCode = cand.target_class_code?.trim() || null;
      const teacherCode = cand.target_teacher_code?.trim() || null;

      let studentMatched = false;
      let matchedStudentId: number | null = null;
      if (extId && studentByExtId.has(extId)) {
        const stu = studentByExtId.get(extId)!;
        studentMatched = true;
        matchedStudentId = stu.id;
        if (!stuName) stuName = stu.full_name;
        const enr = stu.enrollments.find((e) => e.program_type === programType) || stu.enrollments[0];
        if (!clsCode && enr) {
          clsCode = enr.enrollment_classes?.[0]?.class?.class_code || enr.package?.code || null;
        }
      }

      const resolvedName =
        cand.name?.trim() ||
        (stuName ? `Báo cáo ${programType} - ${stuName}` : null) ||
        (clsCode ? `Đồng bộ ${programType} - Lớp ${clsCode}` : null) ||
        (teacherCode ? `Điểm danh GV ${programType} - ${teacherCode}` : null) ||
        `Nguồn ${programType} #${cand.lineNumber}`;

      let message = 'Hợp lệ, sẵn sàng thêm';
      if (invalidUrl) message = 'Link Google Sheet không hợp lệ (thiếu /spreadsheets/d/...)';
      else if (dupBatch) message = 'Trùng lặp link ngay trong danh sách vừa dán';
      else if (alreadyExists) message = `Đã tồn tại trong hệ thống (${existing?.code}) — sẽ cập nhật nếu xác nhận`;
      else if (extId && !studentMatched) message = `Mã HV ${extId} chưa có trên Web (vẫn có thể lưu cấu hình)`;

      const status: 'VALID' | 'DUPLICATE' | 'INVALID_URL' = invalidUrl
        ? 'INVALID_URL'
        : dupBatch || alreadyExists
        ? 'DUPLICATE'
        : 'VALID';

      validatedItems.push({
        lineNumber: cand.lineNumber,
        rawLine: cand.url,
        status,
        url: cand.url,
        spreadsheetUrl: cand.url,
        spreadsheet_id: sheetId,
        spreadsheetId: sheetId,
        sheet_gid: gid,
        valid: !invalidUrl && !dupBatch,
        duplicate_in_batch: dupBatch,
        already_exists: alreadyExists,
        invalid_url: invalidUrl,
        student_matched: studentMatched,
        matchedStudentId,
        existingConfigCode: existing?.code || null,
        target_student_external_id: extId,
        studentExternalId: extId,
        target_student_name: stuName,
        studentName: stuName,
        target_class_code: clsCode,
        classCode: clsCode,
        target_teacher_code: teacherCode,
        teacherCode: teacherCode,
        resolved_name: resolvedName,
        message,
      });
    }

    if (dto.mode === 'VALIDATE_ONLY') {
      return {
        mode: 'VALIDATE_ONLY',
        totalCount: validatedItems.length,
        totalLines: validatedItems.length,
        validCount: validatedItems.filter((i) => i.valid).length,
        invalidCount: validatedItems.filter((i) => i.invalid_url).length,
        duplicateCount: validatedItems.filter((i) => i.duplicate_in_batch || i.already_exists).length,
        items: validatedItems,
      };
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const createdConfigs: any[] = [];

    for (const item of validatedItems) {
      if (!item.valid || !item.spreadsheet_id) {
        skippedCount++;
        continue;
      }

      const batchKey = `${item.spreadsheet_id}::${item.sheet_gid || ''}`;
      const existing = existingBySheetId.get(batchKey);
      const defaultSheet =
        flowType === 'STUDY_REPORT'
          ? programType === 'JLPT'
            ? 'Chuyên cần HV'
            : '会話 3 - 学習レポート'
          : flowType === 'TEACHER_ATTENDANCE'
            ? `${dto.sync_year || 2026} スケジュール`
            : flowType === 'CSKH_ATTENDANCE'
              ? programType === 'JLPT'
                ? 'Chấm buổi'
                : '3.Chấm buổi'
              : programType === 'JLPT'
                ? 'Data JLPT_Inhouse'
                : 'Tổng';

      if (existing) {
        const upd = await prisma.googleSheetSyncConfig.update({
          where: { id: existing.id },
          data: {
            name: item.resolved_name || existing.name,
            spreadsheet_url: item.url,
            spreadsheet_id: item.spreadsheet_id,
            sheet_gid: item.sheet_gid,
            source_type: 'GOOGLE_SHEET',
            target_student_external_id: item.target_student_external_id || existing.target_student_external_id,
            target_student_name: item.target_student_name || existing.target_student_name,
            target_class_code: item.target_class_code || existing.target_class_code,
            target_teacher_code: item.target_teacher_code || existing.target_teacher_code,
            enabled: dto.enabled ?? existing.enabled,
          },
        });
        createdConfigs.push(upd);
        updatedCount++;
      } else {
        const code = `${flowType.slice(0, 2)}_${programType}_${item.target_student_external_id || item.spreadsheet_id.slice(0, 6)}_${Date.now().toString(36).slice(-3)}`.toUpperCase();
        const created = await prisma.googleSheetSyncConfig.create({
          data: {
            code,
            name: item.resolved_name,
            flow_type: flowType,
            source_type: 'GOOGLE_SHEET',
            program_type: programType,
            spreadsheet_url: item.url,
            spreadsheet_id: item.spreadsheet_id,
            sheet_gid: item.sheet_gid,
            sheet_name: defaultSheet,
            header_row: flowType === 'STUDY_REPORT' ? (programType === 'JLPT' ? 4 : 1) : 2,
            sync_year:
              flowType === 'CSKH_ATTENDANCE' || flowType === 'TEACHER_ATTENDANCE'
                ? dto.sync_year || 2026
                : null,
            target_student_external_id: item.target_student_external_id,
            target_student_name: item.target_student_name,
            target_class_code: item.target_class_code,
            target_teacher_code: item.target_teacher_code,
            cvht_mapping: mapping as Prisma.InputJsonValue,
            default_cs_id: defaultCsId,
            sync_interval_minutes: dto.sync_interval_minutes || 30,
            enabled: dto.enabled ?? true,
            last_status: 'IDLE',
          },
        });
        await this.setSourceType(code, 'GOOGLE_SHEET', userId);
        createdConfigs.push(created);
        createdCount++;
      }
    }

    return {
      mode: 'CREATE',
      totalCount: validatedItems.length,
      totalLines: validatedItems.length,
      validCount: validatedItems.filter((i) => i.valid).length,
      invalidCount: validatedItems.filter((i) => i.invalid_url).length,
      duplicateCount: validatedItems.filter((i) => i.duplicate_in_batch || i.already_exists).length,
      createdCount,
      updatedCount,
      skippedCount,
      items: validatedItems,
      createdConfigs,
    };
  }

  /**
   * PUT /api/v1/imports/sheet-sync/configs/:code
   */
  public async updateConfig(idOrCode: string, dto: UpdateSyncConfigDTO, userId?: number) {
    const existing = await this.findConfigByIdOrCode(idOrCode);
    const upperCode = existing.code.toUpperCase();

    if (dto.source_type === 'GOOGLE_SHEET' || dto.source_type === 'LOCAL_FILE') {
      await this.setSourceType(upperCode, dto.source_type, userId);
    }

    const sourceTypeMap = await this.getSourceTypeMap();
    const nextSpreadsheetUrl = dto.spreadsheet_url !== undefined ? dto.spreadsheet_url : existing.spreadsheet_url;
    const nextLocalFilePath = dto.local_file_path !== undefined ? dto.local_file_path : existing.local_file_path;
    const nextSheetName = dto.sheet_name !== undefined ? dto.sheet_name : existing.sheet_name;
    const effectiveSourceType =
      dto.source_type ||
      this.resolveConfigSourceType(
        {
          code: upperCode,
          source_type: existing.source_type,
          spreadsheet_url: nextSpreadsheetUrl,
          local_file_path: nextLocalFilePath,
        },
        sourceTypeMap
      );

    // Enforce rule: LOCAL_FILE cannot enable Auto Sync unless converted to GOOGLE_SHEET with a valid URL
    const spreadsheetId =
      dto.spreadsheet_url !== undefined
        ? this.extractSpreadsheetId(dto.spreadsheet_url)
        : existing.spreadsheet_id;
    const sheetGid =
      dto.spreadsheet_url !== undefined
        ? this.extractSheetGid(dto.spreadsheet_url)
        : existing.sheet_gid;

    if (dto.enabled === true && (effectiveSourceType === 'LOCAL_FILE' || !spreadsheetId)) {
      throw new AppError(
        400,
        'Nguồn dữ liệu từ file tải lên máy tính (LOCAL_FILE) không hỗ trợ Tự động đồng bộ (Auto Sync). Vui lòng gắn Link Google Sheet hợp lệ để bật Auto Sync.'
      );
    }

    const isReadyAfterUpdate = this.isConfigReady(
      {
        code: upperCode,
        source_type: effectiveSourceType,
        spreadsheet_url: nextSpreadsheetUrl,
        local_file_path: nextLocalFilePath,
        sheet_name: nextSheetName,
      },
      sourceTypeMap
    );

    const nextEnabled =
      isReadyAfterUpdate && effectiveSourceType === 'GOOGLE_SHEET' && Boolean(spreadsheetId)
        ? dto.enabled !== undefined
          ? dto.enabled
          : existing.enabled
        : false;

    const updated = await prisma.googleSheetSyncConfig.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.flow_type !== undefined ? { flow_type: dto.flow_type } : {}),
        ...(dto.program_type !== undefined ? { program_type: dto.program_type } : {}),
        source_type: effectiveSourceType,
        ...(dto.spreadsheet_url !== undefined
          ? { spreadsheet_url: dto.spreadsheet_url, spreadsheet_id: spreadsheetId, sheet_gid: sheetGid }
          : {}),
        ...(dto.local_file_path !== undefined ? { local_file_path: dto.local_file_path } : {}),
        ...(dto.sheet_name !== undefined ? { sheet_name: dto.sheet_name } : {}),
        ...(dto.setting_sheet_name !== undefined ? { setting_sheet_name: dto.setting_sheet_name } : {}),
        ...(dto.header_row !== undefined ? { header_row: dto.header_row } : {}),
        ...(dto.sync_year !== undefined ? { sync_year: dto.sync_year } : {}),
        ...(dto.filter_config !== undefined ? { filter_config: dto.filter_config as Prisma.InputJsonValue } : {}),
        ...(dto.target_student_external_id !== undefined
          ? { target_student_external_id: dto.target_student_external_id }
          : {}),
        ...(dto.target_student_name !== undefined ? { target_student_name: dto.target_student_name } : {}),
        ...(dto.target_class_code !== undefined ? { target_class_code: dto.target_class_code } : {}),
        ...(dto.target_teacher_code !== undefined ? { target_teacher_code: dto.target_teacher_code } : {}),
        ...(dto.cvht_mapping !== undefined ? { cvht_mapping: dto.cvht_mapping as Prisma.InputJsonValue } : {}),
        ...(dto.default_cs_id !== undefined ? { default_cs_id: dto.default_cs_id } : {}),
        ...(dto.sync_interval_minutes !== undefined ? { sync_interval_minutes: dto.sync_interval_minutes } : {}),
        enabled: nextEnabled,
      },
    });

    return {
      ...updated,
      source_type: effectiveSourceType,
    };
  }

  /**
   * POST /api/v1/imports/sheet-sync/configs/:code/upload-file
   */
  public async saveUploadedLocalFile(
    idOrCode: string,
    file: Express.Multer.File,
    userId?: number
  ): Promise<{ local_file_path: string; file_name: string; config: any }> {
    const existing = await this.findConfigByIdOrCode(idOrCode);
    const upperCode = existing.code.toUpperCase();

    const safeOriginal = path
      .basename(file.originalname || `sync_${upperCode.toLowerCase()}.xlsx`)
      .replace(/[^a-zA-Z0-9._-À-ɏḀ-ỿ ]/g, '_');

    const rootCandidates = [
      path.resolve(process.cwd(), '..', 'docs/data/hoc_vien'),
      path.resolve(process.cwd(), 'docs/data/hoc_vien'),
      path.resolve(process.cwd(), 'uploads/sheet-sync'),
    ];
    const targetDir = rootCandidates.find((d) => fs.existsSync(path.dirname(d))) || rootCandidates[0];
    fs.mkdirSync(targetDir, { recursive: true });

    const destPath = path.join(targetDir, safeOriginal);
    fs.writeFileSync(destPath, file.buffer);

    const relPath = `docs/data/hoc_vien/${safeOriginal}`;
    await this.setSourceType(upperCode, 'LOCAL_FILE', userId);
    const updated = await prisma.googleSheetSyncConfig.update({
      where: { id: existing.id },
      data: {
        source_type: 'LOCAL_FILE',
        local_file_path: relPath,
        enabled: false, // Local uploaded files are always locked from Auto Sync
        last_file_hash: null,
      },
    });

    return {
      local_file_path: relPath,
      file_name: safeOriginal,
      config: {
        ...updated,
        source_type: 'LOCAL_FILE' as SyncSourceType,
      },
    };
  }

  private async fetchWorkbookBufferViaSheetsApi(
    sheetId: string,
    accessToken: string,
    preferredSheets: string[]
  ): Promise<Buffer> {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
    const metaResp = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaResp.ok) {
      const errText = await metaResp.text().catch(() => '');
      if (metaResp.status === 403 || metaResp.status === 404) {
        throw new AppError(
          403,
          `Không có quyền truy cập file Google Sheet (${sheetId}). Vui lòng mở Google Sheet -> bấm Chia sẻ (Share) -> cấp quyền Người xem (Viewer) hoặc Người chỉnh sửa (Editor) cho email Service Account.`
        );
      }
      throw new AppError(400, `Lỗi đọc Google Sheets API (${sheetId}): ${errText || metaResp.statusText}`);
    }

    const meta = (await metaResp.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
    const availableTitles = (meta.sheets || [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => Boolean(t));

    const wantedSet = new Set(preferredSheets.map((s) => s.trim().toLowerCase()));
    let sheetsToFetch = availableTitles.filter((t) => wantedSet.has(t.trim().toLowerCase()));
    if (sheetsToFetch.length === 0) {
      sheetsToFetch = availableTitles.slice(0, 3);
    }

    const params = new URLSearchParams();
    params.set('valueRenderOption', 'UNFORMATTED_VALUE');
    params.set('dateTimeRenderOption', 'SERIAL_NUMBER');
    for (const title of sheetsToFetch) {
      params.append('ranges', `'${title.replace(/'/g, "''")}'!A1:ZZ10000`);
    }

    const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params.toString()}`;
    const valResp = await fetch(valuesUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!valResp.ok) {
      const errText = await valResp.text().catch(() => '');
      throw new AppError(400, `Không thể tải dữ liệu các tab từ Google Sheets API (${sheetId}): ${errText}`);
    }

    const valData = (await valResp.json()) as {
      valueRanges?: Array<{ range?: string; values?: any[][] }>;
    };

    const wb = new ExcelJS.Workbook();
    const valueRanges = valData.valueRanges || [];
    for (let i = 0; i < sheetsToFetch.length; i++) {
      const sheetTitle = sheetsToFetch[i];
      const rows = valueRanges[i]?.values || [];
      const ws = wb.addWorksheet(sheetTitle);
      if (rows.length > 0) {
        ws.addRows(rows);
      }
    }

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out);
  }

  private async loadWorkbookBuffer(config: {
    source_type?: string | null;
    spreadsheet_url?: string | null;
    spreadsheet_id?: string | null;
    local_file_path?: string | null;
    sheet_name?: string;
    setting_sheet_name?: string | null;
    program_type?: string;
    flow_type?: string;
  }): Promise<{ buffer: Buffer; sourceLabel: string }> {
    const useGoogleSheet = config.source_type !== 'LOCAL_FILE';
    const sheetId = useGoogleSheet
      ? config.spreadsheet_id || this.extractSpreadsheetId(config.spreadsheet_url)
      : null;
    if (sheetId) {
      const { key: saKey } = await this.getServiceAccountKey();

      if (saKey) {
        const accessToken = await this.getGoogleAccessToken(saKey);
        const authHeaders = { Authorization: `Bearer ${accessToken}` };
        const driveUrls = [
          `https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`,
          `https://www.googleapis.com/drive/v3/files/${sheetId}?alt=media&supportsAllDrives=true`,
        ];

        for (const url of driveUrls) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25000);
          try {
            const resp = await fetch(url, { headers: authHeaders, signal: controller.signal });
            clearTimeout(timeout);
            if (resp.ok) {
              const arrayBuf = await resp.arrayBuffer();
              const buf = Buffer.from(arrayBuf);
              if (buf.length > 100 && buf[0] === 0x50 && buf[1] === 0x4b) {
                return { buffer: buf, sourceLabel: `GoogleSheet:${sheetId}` };
              }
            }
          } catch {
            clearTimeout(timeout);
          }
        }

        const preferredSheets = this.getTargetSheetNamesForConfig(config);
        const sheetsApiBuf = await this.fetchWorkbookBufferViaSheetsApi(sheetId, accessToken, preferredSheets);
        return { buffer: sheetsApiBuf, sourceLabel: `GoogleSheetsAPI:${sheetId}` };
      }

      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const resp = await fetch(exportUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          if (buf.length > 100 && buf[0] === 0x50 && buf[1] === 0x4b) {
            return { buffer: buf, sourceLabel: exportUrl };
          }
        }
        throw new AppError(
          403,
          `File Google Sheet (${sheetId}) đang để chế độ Riêng tư (chỉ người có quyền mới xem được). Vui lòng cấu hình Google Service Account JSON ở khung phía trên rồi Share quyền Xem cho email Service Account đó.`
        );
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        log.warn(`Failed to download Google Sheet (${sheetId}), falling back to local file`, {
          error: err?.message || String(err),
        });
      }
    } else if (config.source_type === 'GOOGLE_SHEET' && !config.local_file_path) {
      throw new AppError(400, 'Vui lòng nhập Link Google Sheet hợp lệ');
    }

    const cleanedLocalPath = (config.local_file_path || '').trim().replace(/^["']|["']$/g, '');
    if (!cleanedLocalPath) {
      throw new AppError(400, 'Chưa cấu hình đường dẫn file local hoặc Google Sheet URL hợp lệ');
    }

    const candidates = path.isAbsolute(cleanedLocalPath)
      ? [cleanedLocalPath]
      : [
          path.resolve(process.cwd(), cleanedLocalPath),
          path.resolve(process.cwd(), '..', cleanedLocalPath),
          path.resolve(__dirname, '../../../../', cleanedLocalPath),
        ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const buffer = fs.readFileSync(candidate);
        return { buffer, sourceLabel: path.basename(candidate) };
      }
    }

    throw new AppError(404, `Không tìm thấy file dữ liệu nguồn tại: ${cleanedLocalPath}`);
  }

  private getTargetSheetNamesForConfig(config: {
    flow_type?: string | null;
    program_type?: string | null;
    sheet_name?: string | null;
    setting_sheet_name?: string | null;
  }): string[] {
    const flowType = (config.flow_type || 'STUDENT_MASTER').toUpperCase();
    const programType = (config.program_type || 'KAIWA').toUpperCase();
    const sheetName = config.sheet_name || '';

    if (flowType === 'STUDENT_MASTER') {
      return programType === 'JLPT'
        ? [sheetName || 'Data JLPT_Inhouse', config.setting_sheet_name || 'Setting', 'Điểm học tập', 'Chấm buổi']
        : [sheetName || 'Tổng', '1.Chăm sóc'];
    }
    if (flowType === 'CSKH_ATTENDANCE') {
      return [sheetName || (programType === 'JLPT' ? 'Chấm buổi' : '3.Chấm buổi')];
    }
    if (flowType === 'TEACHER_ATTENDANCE') {
      return [sheetName || '2026 スケジュール', 'Info', 'Infoー情報', 'Setting'];
    }
    if (flowType === 'STUDY_REPORT' && programType === 'JLPT') {
      return [sheetName || 'Chuyên cần HV'];
    }
    // STUDY_REPORT: load all sheets or preferred sheet
    return sheetName ? [sheetName] : [];
  }

  /* ==========================================================================
   * PREVIEW ENGINE (POST /api/v1/imports/sheet-sync/configs/:code/preview)
   * ========================================================================== */

  public async previewConfig(
    idOrCode: string,
    options?: {
      sync_year?: number | null;
      filter_config?: SyncFilterConfig;
      limit?: number;
    }
  ): Promise<SheetSyncPreviewResponse> {
    const config = await this.findConfigByIdOrCode(idOrCode);
    const sourceTypeMap = await this.getSourceTypeMap();
    const effectiveSourceType = this.resolveConfigSourceType(config, sourceTypeMap);

    const { buffer, sourceLabel } = await this.loadWorkbookBuffer({
      ...config,
      source_type: effectiveSourceType,
    });
    const fileHash = this.sha256(buffer);

    const flowType = (config.flow_type || 'STUDENT_MASTER').toUpperCase() as SyncFlowType;
    const programType = (config.program_type?.toUpperCase() === 'JLPT' ? 'JLPT' : 'KAIWA') as 'JLPT' | 'KAIWA';

    const effectiveSyncYear =
      options?.sync_year !== undefined
        ? options.sync_year
        : config.sync_year ?? (flowType === 'CSKH_ATTENDANCE' || flowType === 'TEACHER_ATTENDANCE' ? 2026 : null);

    const storedFilter =
      config.filter_config && typeof config.filter_config === 'object'
        ? (config.filter_config as SyncFilterConfig)
        : {};
    const effectiveFilter: SyncFilterConfig = {
      ...storedFilter,
      ...(options?.filter_config || {}),
    };

    const targetSheets =
      flowType === 'STUDY_REPORT' && programType !== 'JLPT'
        ? undefined
        : this.getTargetSheetNamesForConfig(config);
    const workbook = await loadOptimizedWorkbook(buffer, targetSheets);

    let session: CachedPreviewSession;

    if (flowType === 'STUDENT_MASTER') {
      session = await this.buildStudentMasterPreview(
        config,
        workbook,
        programType,
        effectiveFilter,
        fileHash,
        sourceLabel,
        options?.limit
      );
    } else if (flowType === 'CSKH_ATTENDANCE') {
      session = await this.buildAttendancePreview(
        config,
        workbook,
        'CSKH_ATTENDANCE',
        programType,
        effectiveSyncYear || 2026,
        effectiveFilter,
        fileHash,
        sourceLabel,
        options?.limit
      );
    } else if (flowType === 'TEACHER_ATTENDANCE') {
      session = await this.buildAttendancePreview(
        config,
        workbook,
        'TEACHER_ATTENDANCE',
        programType,
        effectiveSyncYear || 2026,
        effectiveFilter,
        fileHash,
        sourceLabel,
        options?.limit
      );
    } else {
      session = await this.buildStudyReportPreview(
        config,
        workbook,
        programType,
        effectiveFilter,
        fileHash,
        sourceLabel
      );
    }

    // Cleanup expired sessions & store preview token
    const now = Date.now();
    for (const [k, v] of previewCache.entries()) {
      if (now - v.createdAtMs > PREVIEW_CACHE_TTL_MS) {
        previewCache.delete(k);
      }
    }
    previewCache.set(session.previewToken, session);

    const createCount = session.items.filter((i) => i.action === 'CREATE').length;
    const updateCount = session.items.filter((i) => i.action === 'UPDATE').length;
    const conflictCount = session.items.filter((i) => i.action === 'CONFLICT').length;
    const invalidCount = session.items.filter((i) => i.action === 'INVALID').length;

    // Strip internal _payload before returning to HTTP response and include FE-friendly field aliases
    const publicItems = session.items.map(({ _payload, ...rest }) => ({
      ...rest,
      fullName: rest.studentName,
      classification: rest.action,
      fieldDiffs: (rest.fieldDiffs || []).map((fd) => ({
        ...fd,
        fieldLabel: fd.label,
      })),
    }));

    return {
      previewToken: session.previewToken,
      config: {
        ...config,
        source_type: effectiveSourceType,
      },
      appliedFilter: {
        syncYear: session.syncYear,
        filterConfig: session.filterConfig,
      },
      sheetName: session.sheetName,
      syncYear: session.syncYear,
      filterConfig: session.filterConfig,
      warnings: session.warnings,
      summary: {
        totalRowsScanned: session.totalRowsScanned,
        FilteredOutCount: session.filteredOutCount,
        filteredOutCount: session.filteredOutCount,
        createCount,
        updateCount,
        conflictCount,
        invalidCount,
        unchangedCount: session.unchangedCount,
      },
      items: publicItems,
    };
  }

  /**
   * Build Preview for Flow 1: STUDENT_MASTER
   */
  private async buildStudentMasterPreview(
    config: any,
    workbook: ExcelJS.Workbook,
    programType: 'JLPT' | 'KAIWA',
    filterConfig: SyncFilterConfig,
    fileHash: string,
    sourceLabel: string,
    limit?: number
  ): Promise<CachedPreviewSession> {
    const parsedRows: NormalizedSheetRow[] =
      programType === 'JLPT'
        ? parseJlptSheetRows(
            workbook,
            config.sheet_name || 'Data JLPT_Inhouse',
            config.setting_sheet_name || 'Setting',
            config.header_row || 2,
            limit
          )
        : parseKaiwaSheetRows(
            workbook,
            config.sheet_name || 'Tổng',
            config.header_row || 2,
            limit
          );

    const [allPackages, allStudents, allEnrollments, defaultCvht] = await Promise.all([
      prisma.package.findMany(),
      prisma.student.findMany(),
      prisma.enrollment.findMany({
        include: {
          package: true,
          cs: { select: { id: true, code: true, staff_code: true, name: true } },
          enrollment_classes: { include: { class: true } },
          care_logs: true,
        },
      }),
      this.buildDefaultCvhtMapping(),
    ]);

    const configuredMapping =
      config.cvht_mapping && typeof config.cvht_mapping === 'object'
        ? (config.cvht_mapping as Record<string, number>)
        : {};
    const cvhtToCsId: Record<string, number> = {
      ...defaultCvht.mapping,
      ...configuredMapping,
    };
    const effectiveDefaultCsId = config.default_cs_id || defaultCvht.defaultCsId;

    const pkgByCode = new Map(allPackages.map((p) => [p.code.toUpperCase(), p]));
    const studentByExtId = new Map<string, (typeof allStudents)[number]>();
    for (const s of allStudents) {
      if (s.external_id) studentByExtId.set(s.external_id, s);
    }

    const enrollmentBySyncKey = new Map<string, (typeof allEnrollments)[number]>();
    const enrollmentByStudentAndPkg = new Map<string, (typeof allEnrollments)[number]>();
    const kaiwaEnrollmentsByStudentId = new Map<number, Array<(typeof allEnrollments)[number]>>();
    for (const e of allEnrollments) {
      if (e.external_sync_key) enrollmentBySyncKey.set(e.external_sync_key, e);
      if (e.student_id && e.package_id) {
        enrollmentByStudentAndPkg.set(`${e.student_id}::${e.package_id}`, e);
      }
      if (e.student_id && e.program_type === 'KAIWA') {
        const list = kaiwaEnrollmentsByStudentId.get(e.student_id) || [];
        list.push(e);
        kaiwaEnrollmentsByStudentId.set(e.student_id, list);
      }
    }
    for (const list of kaiwaEnrollmentsByStudentId.values()) {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const allowedSourceStatuses =
      filterConfig.sourceStatuses && filterConfig.sourceStatuses.length > 0
        ? new Set(filterConfig.sourceStatuses.map((s) => s.trim().toLowerCase()))
        : null;
    const allowedActiveStates =
      filterConfig.activeStates && filterConfig.activeStates.length > 0
        ? new Set(filterConfig.activeStates.map((s) => (normalizeActiveState(s) || s).toLowerCase()))
        : null;

    let filteredOutCount = 0;
    let unchangedCount = 0;
    const items: SheetSyncPreviewItem[] = [];
    const discoveredReportLinks: DiscoveredStudyReportLink[] = [];

    for (const row of parsedRows) {
      if (row.studyReportUrl && this.extractSpreadsheetId(row.studyReportUrl)) {
        discoveredReportLinks.push({
          externalId: row.externalId,
          studentName: row.fullName,
          classCode: row.classCode || row.className,
          packageCode: row.packageCode,
          programType: row.programType,
          studyReportUrl: row.studyReportUrl,
        });
      }

      const existingStudent = studentByExtId.get(row.externalId);
      const pkg = pkgByCode.get(row.packageCode.toUpperCase());
      let existingEnrollment = enrollmentBySyncKey.get(row.syncKey);

      if (row.isKaiwaCareOnly) {
        if (existingStudent) {
          const stuKaiwaEnrs = kaiwaEnrollmentsByStudentId.get(existingStudent.id) || [];
          existingEnrollment =
            (pkg ? stuKaiwaEnrs.find((e) => e.package_id === pkg.id) : undefined) ||
            stuKaiwaEnrs.find((e) => e.package?.code?.toUpperCase() === row.packageCode.toUpperCase()) ||
            stuKaiwaEnrs[0];
        } else {
          existingEnrollment = undefined;
        }
      } else if (!existingEnrollment && existingStudent && pkg) {
        const candidate = enrollmentByStudentAndPkg.get(`${existingStudent.id}::${pkg.id}`);
        if (candidate && (!candidate.external_sync_key || candidate.external_sync_key === row.syncKey)) {
          existingEnrollment = candidate;
        }
      }

      // Special rule for KAIWA_CARE (1.Chăm sóc): ONLY update when matching an existing Kaiwa student enrollment by externalId
      if (row.isKaiwaCareOnly) {
        if (!existingStudent || !existingEnrollment) {
          items.push({
            itemKey: row.syncKey,
            rowNumber: row.rowNumber,
            externalId: row.externalId,
            studentName: row.fullName,
            classCode: row.packageCode,
            programType: row.programType,
            entityType: 'StudentEnrollment',
            action: 'INVALID',
            defaultSelected: false,
            summaryText: 'Học viên chưa có hồ sơ gốc trên Web (cấu hình 1.Chăm sóc chỉ cập nhật báo cáo & chăm sóc khi khớp ID)',
            fieldDiffs: [],
            warnings: [],
            errors: ['Học viên chưa có hồ sơ gốc trên Web (cấu hình 1.Chăm sóc chỉ cập nhật báo cáo & chăm sóc khi khớp ID)'],
            _payload: { row },
          });
          continue;
        }

        const diffs: SheetSyncFieldDiff[] = [];
        const addCareDiff = (field: string, label: string, beforeVal: any, afterVal: any) => {
          const bStr = beforeVal === null || beforeVal === undefined ? '' : String(beforeVal).trim();
          const aStr = afterVal === null || afterVal === undefined ? '' : String(afterVal).trim();
          if (bStr !== aStr && aStr !== '') {
            diffs.push({ field, label, before: beforeVal ?? null, after: afterVal });
          }
        };

        const existingMeta = (existingEnrollment.program_metadata || {}) as Record<string, any>;
        const rawPrevYears = row.programMetadata?.attended_previous_years_raw ?? null;
        if (rawPrevYears !== null) {
          addCareDiff(
            'attended_previous_years_raw',
            'Tổng buổi năm trước (AI)',
            existingMeta.attended_previous_years_raw ?? existingEnrollment.attended_previous_years ?? null,
            rawPrevYears
          );
        }
        if (row.totalAttended !== null) {
          addCareDiff(
            'total_attended',
            'Tổng số buổi đã học (AJ)',
            (existingEnrollment as any).total_attended,
            row.totalAttended
          );
        }
        addCareDiff('study_report_url', 'Link Báo cáo học tập', existingEnrollment.study_report_url, row.studyReportUrl);
        addCareDiff('exchange_info', 'Thông tin trao đổi', existingEnrollment.exchange_info, row.exchangeInfo);
        addCareDiff('callback_note', 'Lịch hẹn gọi', existingEnrollment.callback_note, row.callbackNote);
        addCareDiff('hot_issue_note', 'Điểm nóng', existingEnrollment.hot_issue_note, row.hotIssueNote);
        addCareDiff('post_course_care', 'Chăm sóc sau kết thúc', existingEnrollment.post_course_care, row.postCourseCare);
        const existingHandedOverIso = existingEnrollment.handed_over_at
          ? new Date(existingEnrollment.handed_over_at).toISOString().slice(0, 10)
          : null;
        addCareDiff('handed_over_at', 'Ngày bàn giao', existingHandedOverIso, row.handedOverAt);
        const existingAccCreatedIso = (existingEnrollment as any).account_created_at
          ? new Date((existingEnrollment as any).account_created_at).toISOString().slice(0, 10)
          : null;
        addCareDiff('account_created_at', 'Ngày tạo tài khoản', existingAccCreatedIso, row.accountCreatedAt);

        if (row.careLogs.length > 0) {
          const existingLogsBySession = new Map(
            (existingEnrollment.care_logs || [])
              .filter((cl) => cl.after_session_number !== null)
              .map((cl) => [cl.after_session_number!, cl])
          );
          const changedSessions: string[] = [];
          const prevSummaryParts: string[] = [];
          for (const cl of row.careLogs) {
            const prevLog = existingLogsBySession.get(cl.after_session_number);
            if (!prevLog || (prevLog.content || '').trim() !== cl.content.trim()) {
              changedSessions.push(`B.${cl.after_session_number}`);
              if (prevLog) prevSummaryParts.push(`B.${cl.after_session_number}`);
            }
          }
          if (changedSessions.length > 0) {
            diffs.push({
              field: 'care_logs',
              label: 'Nội dung chăm sóc theo buổi',
              before: prevSummaryParts.length > 0 ? `Đã có (${prevSummaryParts.join(', ')})` : null,
              after: `Cập nhật ${changedSessions.length} mốc (${changedSessions.join(', ')})`,
            });
          }
        }

        if (diffs.length === 0) {
          unchangedCount++;
          continue;
        }

        const existingClsCode = existingEnrollment.enrollment_classes?.[0]?.class?.class_code || null;
        items.push({
          itemKey: row.syncKey,
          rowNumber: row.rowNumber,
          externalId: row.externalId,
          studentName: existingStudent.full_name || row.fullName,
          classCode: existingClsCode || existingEnrollment.package?.code || row.packageCode,
          programType: row.programType,
          entityType: 'StudentEnrollment',
          action: 'UPDATE',
          defaultSelected: true,
          summaryText: `Cập nhật chăm sóc & báo cáo (${diffs.map((d) => d.label).join(', ')})`,
          fieldDiffs: diffs,
          warnings: [],
          errors: [],
          _payload: {
            row,
            existingEnrollmentId: existingEnrollment.id,
            existingStudentId: existingStudent.id,
          },
        });
        continue;
      }

      // Smart filter rule:
      // If filter_config has status filters:
      // - New student/enrollment NOT in Web DB is only created if it matches filter_config.
      // - Existing student/enrollment ALREADY in Web DB is STILL UPDATED even if its sheet status changed outside filter_config!
      let matchesFilter = true;
      if (allowedSourceStatuses) {
        const srcLower = (row.studentSourceStatus || '').trim().toLowerCase();
        if (!srcLower || !allowedSourceStatuses.has(srcLower)) {
          matchesFilter = false;
        }
      }
      if (matchesFilter && allowedActiveStates && programType === 'JLPT') {
        const actLower = (row.activeState || '').trim().toLowerCase();
        if (!actLower || !allowedActiveStates.has(actLower)) {
          matchesFilter = false;
        }
      }
      if (matchesFilter && filterConfig.enrollmentStatuses && filterConfig.enrollmentStatuses.length > 0) {
        if (!enrollmentStatusMatchesFilter(row.status, row.rawStatusText, filterConfig.enrollmentStatuses)) {
          matchesFilter = false;
        }
      }

      if (!matchesFilter && !existingEnrollment) {
        filteredOutCount++;
        continue;
      }

      // Validate required fields
      const rowErrors: string[] = [];
      const rowWarnings: string[] = [];
      if (!row.fullName || row.fullName.startsWith('Học viên JLPT_ROW_') || row.fullName.startsWith('Học viên KAIWA_ROW_')) {
        rowErrors.push('Thiếu Họ tên học viên');
      }
      if (row.externalId.startsWith('JLPT_ROW_') || row.externalId.startsWith('KAIWA_ROW_')) {
        rowWarnings.push(`Dòng ${row.rowNumber} thiếu Mã học viên (ID), hệ thống tạm gán mã ${row.externalId}`);
      }
      if (!matchesFilter && existingEnrollment) {
        rowWarnings.push(
          `Học viên đã có trên Web chuyển sang trạng thái "${row.rawStatusText || row.activeState || ENROLLMENT_STATUS_VN_MAP[row.status]}" (ngoài bộ lọc) — hệ thống vẫn cập nhật để đồng bộ trạng thái`
        );
      }

      if (rowErrors.length > 0) {
        items.push({
          itemKey: row.syncKey,
          rowNumber: row.rowNumber,
          externalId: row.externalId,
          studentName: row.fullName,
          classCode: row.classCode || row.className,
          programType: row.programType,
          entityType: 'StudentEnrollment',
          action: 'INVALID',
          defaultSelected: false,
          summaryText: rowErrors.join('; '),
          fieldDiffs: [],
          warnings: rowWarnings,
          errors: rowErrors,
          _payload: { row },
        });
        continue;
      }

      if (!existingEnrollment) {
        items.push({
          itemKey: row.syncKey,
          rowNumber: row.rowNumber,
          externalId: row.externalId,
          studentName: row.fullName,
          classCode: row.classCode || row.className,
          programType: row.programType,
          entityType: 'StudentEnrollment',
          action: 'CREATE',
          defaultSelected: true,
          summaryText: `Thêm mới HV ${row.fullName} (${row.externalId}) - Gói ${row.packageCode}${row.classCode ? ` - Lớp ${row.classCode}` : ''}`,
          fieldDiffs: [
            { field: 'full_name', label: 'Họ tên HV', before: null, after: row.fullName },
            { field: 'package_code', label: 'Gói học', before: null, after: row.packageCode },
            { field: 'status', label: 'Trạng thái', before: null, after: ENROLLMENT_STATUS_VN_MAP[row.status] },
            ...(row.classCode ? [{ field: 'class_code', label: 'Lớp học', before: null, after: row.classCode }] : []),
            ...(row.cvhtCode ? [{ field: 'cvht_code', label: 'CVHT', before: null, after: row.cvhtCode }] : []),
          ],
          warnings: rowWarnings,
          errors: [],
          _payload: { row },
        });
      } else {
        const diffs: SheetSyncFieldDiff[] = [];
        const addDiff = (field: string, label: string, beforeVal: any, afterVal: any) => {
          const bStr = beforeVal === null || beforeVal === undefined ? '' : String(beforeVal).trim();
          const aStr = afterVal === null || afterVal === undefined ? '' : String(afterVal).trim();
          if (bStr !== aStr && aStr !== '') {
            diffs.push({ field, label, before: beforeVal ?? null, after: afterVal });
          }
        };

        if (existingStudent) {
          addDiff('full_name', 'Họ tên HV', existingStudent.full_name, row.fullName);
          addDiff('phone', 'Số điện thoại', existingStudent.phone, row.phone);
          addDiff('email', 'Email', existingStudent.email, row.email);
        }
        addDiff(
          'status',
          'Trạng thái học',
          ENROLLMENT_STATUS_VN_MAP[existingEnrollment.status] || existingEnrollment.status,
          ENROLLMENT_STATUS_VN_MAP[row.status] || row.status
        );
        addDiff('total_sessions', 'Tổng số buổi', existingEnrollment.total_sessions, row.totalSessions);
        if (!row.isKaiwaMasterOnly && row.totalAttended !== null) {
          addDiff('total_attended', 'Tổng số buổi đã học', (existingEnrollment as any).total_attended, row.totalAttended);
        }
        if (row.remainingSessions !== null) {
          addDiff('external_remaining_sessions', 'Số buổi còn lại', existingEnrollment.external_remaining_sessions, row.remainingSessions);
        }
        const existingClsCode = existingEnrollment.enrollment_classes?.[0]?.class?.class_code || null;
        if (row.classCode && row.classCode !== existingClsCode) {
          addDiff('class_code', 'Mã lớp', existingClsCode, row.classCode);
        }
        const existingMeta = (existingEnrollment.program_metadata || {}) as Record<string, any>;
        const targetCsId =
          row.cvhtCode && cvhtToCsId[row.cvhtCode.toUpperCase()]
            ? cvhtToCsId[row.cvhtCode.toUpperCase()]
            : effectiveDefaultCsId;
        if (existingMeta.cs_reassigned_on_web === true && targetCsId !== existingEnrollment.cs_id) {
          rowWarnings.push(
            'CVHT của học viên này đã được chuyển trên Web nên hệ thống ưu tiên giữ nguyên CVHT trên Web (không ghi đè theo Google Sheet)'
          );
        } else if (row.cvhtCode && targetCsId && targetCsId !== existingEnrollment.cs_id) {
          const prevCvhtLabel =
            (existingEnrollment as any).cs?.staff_code ||
            (existingEnrollment as any).cs?.code ||
            (existingEnrollment as any).cs?.name ||
            `CS #${existingEnrollment.cs_id}`;
          addDiff('cvht_code', 'CVHT', prevCvhtLabel, row.cvhtCode);
        }
        if (row.activeState && existingMeta.active_state !== row.activeState) {
          addDiff('active_state', 'Tình trạng Active', existingMeta.active_state || null, row.activeState);
        }
        if (!row.isKaiwaMasterOnly) {
          addDiff('exchange_info', 'Thông tin trao đổi', existingEnrollment.exchange_info, row.exchangeInfo);
          addDiff('callback_note', 'Lịch hẹn gọi', existingEnrollment.callback_note, row.callbackNote);
          addDiff('hot_issue_note', 'Điểm nóng', existingEnrollment.hot_issue_note, row.hotIssueNote);
          addDiff('study_report_url', 'Link Báo cáo học tập', existingEnrollment.study_report_url, row.studyReportUrl);

          if (row.careLogs.length > 0) {
            const existingLogsBySession = new Map(
              (existingEnrollment.care_logs || [])
                .filter((cl) => cl.after_session_number !== null)
                .map((cl) => [cl.after_session_number!, cl])
            );
            const changedSessions: string[] = [];
            const prevSummaryParts: string[] = [];
            for (const cl of row.careLogs) {
              const prevLog = existingLogsBySession.get(cl.after_session_number);
              if (!prevLog || (prevLog.content || '').trim() !== cl.content.trim()) {
                changedSessions.push(`B.${cl.after_session_number}`);
                if (prevLog) prevSummaryParts.push(`B.${cl.after_session_number}`);
              }
            }
            if (changedSessions.length > 0) {
              diffs.push({
                field: 'care_logs',
                label: 'Nội dung chăm sóc theo buổi',
                before: prevSummaryParts.length > 0 ? `Đã có (${prevSummaryParts.join(', ')})` : null,
                after: `Cập nhật ${changedSessions.length} mốc (${changedSessions.join(', ')})`,
              });
            }
          }
        }

        if (diffs.length === 0) {
          unchangedCount++;
          continue;
        }

        items.push({
          itemKey: row.syncKey,
          rowNumber: row.rowNumber,
          externalId: row.externalId,
          studentName: row.fullName,
          classCode: row.classCode || existingClsCode,
          programType: row.programType,
          entityType: 'StudentEnrollment',
          action: 'UPDATE',
          defaultSelected: true,
          summaryText: `Cập nhật ${diffs.length} trường (${diffs.map((d) => d.label).join(', ')})`,
          fieldDiffs: diffs,
          warnings: rowWarnings,
          errors: [],
          _payload: { row, existingEnrollmentId: existingEnrollment.id, existingStudentId: existingStudent?.id },
        });
      }
    }

    const previewToken = crypto.randomBytes(16).toString('hex');
    return {
      previewToken,
      configId: config.id,
      configCode: config.code,
      createdAtMs: Date.now(),
      syncYear: null,
      filterConfig,
      sheetName: config.sheet_name,
      fileHash,
      sourceLabel,
      totalRowsScanned: parsedRows.length,
      filteredOutCount,
      unchangedCount,
      warnings: [],
      items,
      discoveredReportLinks,
    };
  }

  /**
   * Build Preview for Flow 2 (CSKH_ATTENDANCE) & Flow 3 (TEACHER_ATTENDANCE)
   */
  private async buildAttendancePreview(
    config: any,
    workbook: ExcelJS.Workbook,
    flowType: 'CSKH_ATTENDANCE' | 'TEACHER_ATTENDANCE',
    programType: 'JLPT' | 'KAIWA',
    syncYear: number,
    filterConfig: SyncFilterConfig,
    fileHash: string,
    sourceLabel: string,
    limit?: number
  ): Promise<CachedPreviewSession> {
    let parsedRows: ParsedStudentAttendanceRow[] = [];
    let warnings: string[] = [];
    let filteredOutCount = 0;
    let totalRowsScanned = 0;
    let discoveredReportLinks: DiscoveredStudyReportLink[] = [];

    if (flowType === 'CSKH_ATTENDANCE') {
      const res = parseCskhAttendanceSheet(workbook, {
        programType,
        sheetName: config.sheet_name,
        headerRow: config.header_row || 2,
        syncYear,
        months: filterConfig.months,
        enrollmentStatuses: filterConfig.enrollmentStatuses,
        limit,
      });
      parsedRows = res.rows;
      warnings = res.warnings;
      filteredOutCount = res.filteredOutCount;
      totalRowsScanned = res.totalRowsScanned;
    } else {
      const res = parseTeacherAttendanceSheet(workbook, {
        programType,
        sheetName: config.sheet_name,
        headerRow: config.header_row || 2,
        syncYear,
        months: filterConfig.months,
        teacherCode: config.target_teacher_code,
      });
      parsedRows = res.rows;
      discoveredReportLinks = res.studyReportLinks;
      warnings = res.warnings;
      totalRowsScanned = res.totalRowsScanned;
    }

    // Load DB students, enrollments, classes, sessions, and attendances for comparison
    const students = await prisma.student.findMany({
      include: {
        enrollments: {
          where: { program_type: programType },
          include: {
            package: true,
            enrollment_classes: {
              include: {
                class: true,
                attendance: {
                  include: { class_session: true },
                },
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    const studentByExtId = new Map<string, (typeof students)[number]>();
    for (const s of students) {
      if (s.external_id) studentByExtId.set(s.external_id, s);
    }

    // Also map classCode -> enrollments for Teacher JLPT class-level rows
    const enrollmentsByClassCode = new Map<string, Array<{ student: (typeof students)[number]; enrollment: any; ec: any }>>();
    const addEnrollmentToClassMap = (key: string | undefined | null, entry: { student: (typeof students)[number]; enrollment: any; ec: any }) => {
      if (!key) return;
      const upper = key.trim().toUpperCase();
      if (!upper) return;
      const list = enrollmentsByClassCode.get(upper) || [];
      if (!list.some((x) => x.enrollment.id === entry.enrollment.id)) {
        list.push(entry);
        enrollmentsByClassCode.set(upper, list);
      }
    };

    for (const s of students) {
      for (const enr of s.enrollments) {
        const meta = (enr.program_metadata || {}) as Record<string, any>;
        const cleanedMetaLatest = cleanJlptClassCode(meta.latest_class_code);
        if (cleanedMetaLatest) {
          addEnrollmentToClassMap(cleanedMetaLatest, { student: s, enrollment: enr, ec: enr.enrollment_classes?.[0] });
        }
        for (const ec of enr.enrollment_classes) {
          const cCode = ec.class?.class_code?.trim();
          const cName = ec.class?.class_name?.trim();
          addEnrollmentToClassMap(cCode, { student: s, enrollment: enr, ec });
          addEnrollmentToClassMap(cName, { student: s, enrollment: enr, ec });
          addEnrollmentToClassMap(cleanJlptClassCode(cCode), { student: s, enrollment: enr, ec });
          addEnrollmentToClassMap(cleanJlptClassCode(cName), { student: s, enrollment: enr, ec });
        }
      }
    }

    // Expand any `CLASS::...` rows from teacher sheet using DB enrollments if Info sheet didn't list them
    const expandedRows: ParsedStudentAttendanceRow[] = [];
    for (const r of parsedRows) {
      if (r.externalId.startsWith('CLASS::') && r.classCode) {
        const cleanedRowCls = cleanJlptClassCode(r.classCode).toUpperCase();
        const dbMembers =
          enrollmentsByClassCode.get(r.classCode.toUpperCase()) ||
          (cleanedRowCls ? enrollmentsByClassCode.get(cleanedRowCls) : undefined) ||
          [];
        if (dbMembers.length > 0) {
          for (const m of dbMembers) {
            expandedRows.push({
              ...r,
              externalId: m.student.external_id || String(m.student.id),
              studentName: m.student.full_name,
            });
          }
        } else {
          expandedRows.push(r);
        }
      } else {
        expandedRows.push(r);
      }
    }

    const items: SheetSyncPreviewItem[] = [];
    let unchangedCount = 0;

    for (const row of expandedRows) {
      const itemKey = `${flowType}::${programType}::${row.externalId}::${row.classCode || row.packageCode || `r${row.rowNumber}`}`;
      const student = studentByExtId.get(row.externalId);

      // Attendance sync NEVER creates new Student or Enrollment
      if (!student || student.enrollments.length === 0) {
        items.push({
          itemKey,
          rowNumber: row.rowNumber,
          externalId: row.externalId,
          studentName: row.studentName,
          classCode: row.classCode,
          programType,
          entityType: 'Attendance',
          action: 'INVALID',
          defaultSelected: false,
          summaryText: `Học viên ${row.studentName} (${row.externalId}) chưa tồn tại trong danh sách ${programType} trên Web`,
          fieldDiffs: [],
          warnings: row.warnings,
          errors: [
            `Học viên [${row.externalId} - ${row.studentName}] chưa có hồ sơ khóa học ${programType} trên Web. Vui lòng đồng bộ Dữ liệu học viên trước.`,
          ],
          _payload: { row },
        });
        continue;
      }

      // Match best enrollment & enrollment_class
      let matchedEnr = student.enrollments[0];
      if (row.classCode) {
        const targetRawUpper = row.classCode.toUpperCase();
        const targetCleanUpper = cleanJlptClassCode(row.classCode).toUpperCase();
        const byCls = student.enrollments.find((e) => {
          const metaLatestClean = cleanJlptClassCode((e.program_metadata as any)?.latest_class_code).toUpperCase();
          if (metaLatestClean && (metaLatestClean === targetRawUpper || metaLatestClean === targetCleanUpper)) {
            return true;
          }
          return e.enrollment_classes.some((ec) => {
            const cCodeUpper = ec.class?.class_code?.toUpperCase() || '';
            const cNameUpper = ec.class?.class_name?.toUpperCase() || '';
            const cCodeClean = cleanJlptClassCode(ec.class?.class_code).toUpperCase();
            const cNameClean = cleanJlptClassCode(ec.class?.class_name).toUpperCase();
            return (
              cCodeUpper === targetRawUpper ||
              cNameUpper === targetRawUpper ||
              (targetCleanUpper && (cCodeClean === targetCleanUpper || cNameClean === targetCleanUpper))
            );
          });
        });
        if (byCls) matchedEnr = byCls;
      } else if (row.packageCode) {
        const byPkg = student.enrollments.find(
          (e) => e.package?.code?.toUpperCase() === row.packageCode?.toUpperCase()
        );
        if (byPkg) matchedEnr = byPkg;
      }

      const ec =
        (row.classCode
          ? matchedEnr.enrollment_classes.find((x) => {
              const targetRawUpper = row.classCode!.toUpperCase();
              const targetCleanUpper = cleanJlptClassCode(row.classCode).toUpperCase();
              const cCodeUpper = x.class?.class_code?.toUpperCase() || '';
              const cNameUpper = x.class?.class_name?.toUpperCase() || '';
              const cCodeClean = cleanJlptClassCode(x.class?.class_code).toUpperCase();
              const cNameClean = cleanJlptClassCode(x.class?.class_name).toUpperCase();
              return (
                cCodeUpper === targetRawUpper ||
                cNameUpper === targetRawUpper ||
                (targetCleanUpper && (cCodeClean === targetCleanUpper || cNameClean === targetCleanUpper))
              );
            })
          : undefined) || matchedEnr.enrollment_classes[0];

      // Validate startTime
      const existingStartTime = ec?.class ? undefined : null;
      const effectiveStartTime = row.startTime || existingStartTime || '19:00';
      if (!row.startTime && !ec) {
        row.warnings.push('Dòng điểm danh chưa ghi Giờ học, mặc định sử dụng khung 19:00');
      }

      if (row.errors.length > 0) {
        items.push({
          itemKey,
          rowNumber: row.rowNumber,
          externalId: row.externalId,
          studentName: student.full_name || row.studentName,
          classCode: row.classCode || ec?.class?.class_code || null,
          programType,
          entityType: 'Attendance',
          action: 'INVALID',
          defaultSelected: false,
          summaryText: row.errors.join('; '),
          fieldDiffs: [],
          warnings: row.warnings,
          errors: row.errors,
          _payload: { row },
        });
        continue;
      }

      // Compare each attendance entry with existing DB attendance by session_date
      const existingAttByDate = new Map<string, any>();
      if (ec) {
        for (const att of ec.attendance || []) {
          if (att.deleted_at) continue;
          const dKey = att.class_session?.session_date
            ? new Date(att.class_session.session_date).toISOString().slice(0, 10)
            : '';
          if (dKey) existingAttByDate.set(dKey, att);
        }
      }

      const fieldDiffs: SheetSyncFieldDiff[] = [];
      const itemWarnings = [...row.warnings];
      let hasNewMarks = false;
      let hasUpdatedMarks = false;
      let hasConflict = false;

      for (const entry of row.entries) {
        if (!entry.status) continue;
        const existingAtt = existingAttByDate.get(entry.date);
        const sideStatus = flowType === 'CSKH_ATTENDANCE' ? existingAtt?.cs_status : existingAtt?.teacher_status;
        const otherSideStatus = flowType === 'CSKH_ATTENDANCE' ? existingAtt?.teacher_status : existingAtt?.cs_status;
        const sideTopic = flowType === 'TEACHER_ATTENDANCE' ? existingAtt?.lesson_topic : null;

        if (!existingAtt) {
          hasNewMarks = true;
          fieldDiffs.push({
            field: entry.date,
            label: `Ngày ${entry.date}`,
            before: null,
            after: `${attendanceStatusLabel(entry.status)}${entry.lessonTopic ? ` (${entry.lessonTopic})` : ''}`,
          });
        } else if (sideStatus !== entry.status || (flowType === 'TEACHER_ATTENDANCE' && entry.lessonTopic && sideTopic !== entry.lessonTopic)) {
          hasUpdatedMarks = true;
          fieldDiffs.push({
            field: entry.date,
            label: `Ngày ${entry.date}`,
            before: sideStatus ? attendanceStatusLabel(sideStatus) : 'Chưa chấm',
            after: `${attendanceStatusLabel(entry.status)}${entry.lessonTopic ? ` (${entry.lessonTopic})` : ''}`,
          });
        }

        if (otherSideStatus && otherSideStatus !== entry.status) {
          hasConflict = true;
          const otherRoleLabel = flowType === 'CSKH_ATTENDANCE' ? 'Giáo viên' : 'CVHT';
          itemWarnings.push(
            `Ngày ${entry.date}: Lệch điểm danh với ${otherRoleLabel} (${otherRoleLabel}: ${attendanceStatusLabel(otherSideStatus)} vs Sheet: ${attendanceStatusLabel(entry.status)})`
          );
        }
      }

      if (fieldDiffs.length === 0) {
        unchangedCount++;
        continue;
      }

      const action: 'CREATE' | 'UPDATE' | 'CONFLICT' = hasConflict
        ? 'CONFLICT'
        : hasNewMarks && !hasUpdatedMarks
          ? 'CREATE'
          : 'UPDATE';

      items.push({
        itemKey,
        rowNumber: row.rowNumber,
        externalId: row.externalId,
        studentName: student.full_name || row.studentName,
        classCode: row.classCode || ec?.class?.class_code || null,
        programType,
        entityType: 'Attendance',
        action,
        defaultSelected: true,
        summaryText: `${action === 'CREATE' ? 'Thêm' : action === 'CONFLICT' ? 'Xung đột' : 'Cập nhật'} ${fieldDiffs.length} buổi điểm danh (${flowType === 'CSKH_ATTENDANCE' ? 'CVHT' : 'Giáo viên'})`,
        fieldDiffs,
        warnings: itemWarnings,
        errors: [],
        _payload: {
          row: { ...row, startTime: effectiveStartTime },
          flowType,
          studentId: student.id,
          enrollmentId: matchedEnr.id,
          enrollmentClassId: ec?.id || null,
          classId: ec?.class_id || null,
        },
      });
    }

    const previewToken = crypto.randomBytes(16).toString('hex');
    return {
      previewToken,
      configId: config.id,
      configCode: config.code,
      createdAtMs: Date.now(),
      syncYear,
      filterConfig,
      sheetName: config.sheet_name,
      fileHash,
      sourceLabel,
      totalRowsScanned,
      filteredOutCount,
      unchangedCount,
      warnings,
      items,
      discoveredReportLinks,
    };
  }

  /**
   * Build Preview for Flow 4: STUDY_REPORT
   */
  private async buildStudyReportPreview(
    config: any,
    workbook: ExcelJS.Workbook,
    programType: 'JLPT' | 'KAIWA',
    filterConfig: SyncFilterConfig,
    fileHash: string,
    sourceLabel: string
  ): Promise<CachedPreviewSession> {
    const parsed =
      programType === 'KAIWA'
        ? parseKaiwaStudyReportWorkbook(workbook, config.sheet_name)
        : parseJlptStudyReportWorkbook(workbook, config.sheet_name);

    // Branch 1: JLPT multi-student 'Chuyên cần HV' sheet (22 columns A..V matched by (Mã lớp + Họ và tên))
    if (programType === 'JLPT' && parsed.jlptChuyenCanRows && parsed.jlptChuyenCanRows.length > 0) {
      const normalizePersonName = (name?: string | null) =>
        String(name || '')
          .trim()
          .replace(/\s+/g, ' ')
          .toLowerCase();

      const targetClassFilter = config.target_class_code
        ? cleanJlptClassCode(config.target_class_code).toUpperCase()
        : '';
      const targetStudentNameFilter = config.target_student_name
        ? normalizePersonName(config.target_student_name)
        : '';

      const allJlptStudents = await prisma.student.findMany({
        where: {
          enrollments: {
            some: { program_type: 'JLPT' },
          },
        },
        include: {
          enrollments: {
            where: { program_type: 'JLPT' },
            include: {
              package: true,
              enrollment_classes: { include: { class: true } },
            },
            orderBy: { created_at: 'desc' },
          },
        },
      });

      const items: SheetSyncPreviewItem[] = [];
      let unchangedCount = 0;
      let filteredOutCount = 0;

      for (const row of parsed.jlptChuyenCanRows) {
        const rowClassUpper = cleanJlptClassCode(row.classCode).toUpperCase();
        const rowNameNorm = normalizePersonName(row.studentName);

        if (targetClassFilter && rowClassUpper !== targetClassFilter) {
          filteredOutCount++;
          continue;
        }
        if (targetStudentNameFilter && rowNameNorm !== targetStudentNameFilter) {
          filteredOutCount++;
          continue;
        }

        // Match student + JLPT enrollment strictly by (Mã lớp + Họ và tên)
        let matchedStudent: (typeof allJlptStudents)[number] | undefined;
        let matchedEnrollment: (typeof allJlptStudents)[number]['enrollments'][number] | undefined;

        for (const stu of allJlptStudents) {
          if (normalizePersonName(stu.full_name) !== rowNameNorm) continue;
          const enr = stu.enrollments.find((e) => {
            const meta = (e.program_metadata || {}) as Record<string, any>;
            const metaCls = cleanJlptClassCode(meta.latest_class_code).toUpperCase();
            if (metaCls && metaCls === rowClassUpper) return true;
            return e.enrollment_classes.some((ec) => {
              const cCode = cleanJlptClassCode(ec.class?.class_code).toUpperCase();
              const cName = cleanJlptClassCode(ec.class?.class_name).toUpperCase();
              return cCode === rowClassUpper || cName === rowClassUpper;
            });
          });
          if (enr) {
            matchedStudent = stu;
            matchedEnrollment = enr;
            break;
          }
        }

        const itemKey = `STUDY_REPORT::JLPT::${row.classCode}::${row.studentName}::r${row.rowNumber}`;

        if (!matchedStudent || !matchedEnrollment) {
          const errMsg = `Không tìm thấy học viên [${row.studentName}] thuộc lớp [${row.classCode}] trên Web`;
          items.push({
            itemKey,
            rowNumber: row.rowNumber,
            externalId: `JLPT_${row.classCode}_r${row.rowNumber}`,
            studentName: row.studentName,
            classCode: row.classCode,
            programType: 'JLPT',
            entityType: 'StudyReport',
            action: 'INVALID',
            defaultSelected: false,
            summaryText: errMsg,
            fieldDiffs: [],
            warnings: [],
            errors: [errMsg],
            _payload: { jlptChuyenCanRow: row },
          });
          continue;
        }

        const existingMeta =
          matchedEnrollment.program_metadata && typeof matchedEnrollment.program_metadata === 'object'
            ? (matchedEnrollment.program_metadata as Record<string, any>)
            : {};
        const prevChuyenCan =
          existingMeta.jlpt_chuyen_can && typeof existingMeta.jlpt_chuyen_can === 'object'
            ? (existingMeta.jlpt_chuyen_can as Record<string, any>)
            : null;
        const prevOverrides =
          existingMeta.jlpt_chuyen_can_overrides && typeof existingMeta.jlpt_chuyen_can_overrides === 'object'
            ? (existingMeta.jlpt_chuyen_can_overrides as Record<string, any>)
            : {};

        const diffs: SheetSyncFieldDiff[] = [];
        const addMetricDiff = (field: string, label: string, beforeVal: any, afterVal: any) => {
          const bStr = beforeVal === null || beforeVal === undefined ? '' : String(beforeVal).trim();
          const aStr = afterVal === null || afterVal === undefined ? '' : String(afterVal).trim();
          if (bStr !== aStr && aStr !== '') {
            diffs.push({ field, label, before: beforeVal ?? null, after: afterVal });
          }
        };

        addMetricDiff(
          'attended_sessions',
          'Số buổi tham gia (C)',
          prevOverrides.attended_sessions ?? prevChuyenCan?.attendedSessions ?? (matchedEnrollment as any).total_attended,
          row.attendedSessions
        );
        addMetricDiff(
          'total_marked_sessions',
          'Tổng buổi đã điểm danh (D)',
          prevOverrides.total_marked_sessions ?? prevChuyenCan?.totalMarkedSessions,
          row.totalMarkedSessions
        );
        addMetricDiff(
          'attendance_rate',
          'Tỷ lệ tham gia (E)',
          prevChuyenCan?.attendanceRate,
          row.attendanceRate
        );
        addMetricDiff(
          'average_exam_score',
          'Điểm KT trung bình (F)',
          prevOverrides.average_exam_score ?? prevChuyenCan?.averageExamScore,
          row.averageExamScore
        );
        addMetricDiff(
          'homework_completed_sessions',
          'Số buổi đã làm bài (G)',
          prevOverrides.homework_completed_sessions ?? prevChuyenCan?.homeworkCompletedSessions,
          row.homeworkCompletedSessions
        );
        addMetricDiff(
          'max_consecutive_absent',
          'Chuỗi vắng liên tiếp tối đa (H)',
          prevOverrides.max_consecutive_absent ?? prevChuyenCan?.maxConsecutiveAbsent,
          row.maxConsecutiveAbsent
        );
        addMetricDiff(
          'absent_warning',
          'Cảnh báo vắng (I)',
          prevChuyenCan?.absentWarning,
          row.absentWarning
        );
        addMetricDiff(
          'max_consecutive_no_homework',
          'Chuỗi không làm bài tối đa (J)',
          prevOverrides.max_consecutive_no_homework ?? prevChuyenCan?.maxConsecutiveNoHomework,
          row.maxConsecutiveNoHomework
        );
        addMetricDiff(
          'no_homework_warning',
          'Cảnh báo không làm bài (K)',
          prevChuyenCan?.noHomeworkWarning,
          row.noHomeworkWarning
        );
        addMetricDiff(
          'exchange_info',
          'Thông tin trao đổi (L)',
          matchedEnrollment.exchange_info ?? prevChuyenCan?.exchangeInfo,
          row.exchangeInfo
        );
        addMetricDiff(
          'course_track',
          'Khoá (O)',
          existingMeta.course_track ?? prevChuyenCan?.courseTrack,
          row.courseTrack
        );
        addMetricDiff('last_exam_name', 'KT gần nhất (P)', prevChuyenCan?.lastExamName, row.lastExamName);
        addMetricDiff('last_exam_session', 'Buổi KT gần nhất (Q)', prevChuyenCan?.lastExamSession, row.lastExamSession);
        addMetricDiff(
          'sessions_since_last_exam',
          'Cách đây (buổi) (R)',
          prevChuyenCan?.sessionsSinceLastExam,
          row.sessionsSinceLastExam
        );
        addMetricDiff('next_exam_name', 'KT tiếp theo (S)', prevChuyenCan?.nextExamName, row.nextExamName);
        addMetricDiff('next_exam_session', 'Buổi KT tiếp theo (T)', prevChuyenCan?.nextExamSession, row.nextExamSession);
        addMetricDiff(
          'sessions_until_next_exam',
          'Còn (buổi) (U)',
          prevChuyenCan?.sessionsUntilNextExam,
          row.sessionsUntilNextExam
        );
        addMetricDiff(
          'exam_schedule_warning',
          'Cảnh báo lịch KT (V)',
          prevChuyenCan?.examScheduleWarning,
          row.examScheduleWarning
        );

        if (diffs.length === 0) {
          unchangedCount++;
          continue;
        }

        const isFirstSync = !prevChuyenCan;
        items.push({
          itemKey,
          rowNumber: row.rowNumber,
          externalId: matchedStudent.external_id || String(matchedStudent.id),
          studentName: matchedStudent.full_name,
          classCode: row.classCode,
          programType: 'JLPT',
          entityType: 'StudyReport',
          action: isFirstSync ? 'CREATE' : 'UPDATE',
          defaultSelected: true,
          summaryText: `Đồng bộ Chuyên cần JLPT (${diffs.length} chỉ số: ${diffs
            .slice(0, 4)
            .map((d) => d.label)
            .join(', ')}${diffs.length > 4 ? '...' : ''})`,
          fieldDiffs: diffs,
          warnings: [],
          errors: [],
          _payload: {
            enrollmentId: matchedEnrollment.id,
            studentId: matchedStudent.id,
            jlptChuyenCanRow: row,
            parsed,
          },
        });
      }

      const previewToken = crypto.randomBytes(16).toString('hex');
      return {
        previewToken,
        configId: config.id,
        configCode: config.code,
        createdAtMs: Date.now(),
        syncYear: null,
        filterConfig,
        sheetName: parsed.sheetName || config.sheet_name,
        fileHash,
        sourceLabel,
        totalRowsScanned: parsed.jlptChuyenCanRows.length,
        filteredOutCount,
        unchangedCount,
        warnings: parsed.warnings,
        items,
        discoveredReportLinks: [],
      };
    }

    const extId = config.target_student_external_id || parsed.detectedStudentExternalId || '';
    const stuName = config.target_student_name || parsed.detectedStudentName || `Học viên ${extId || config.code}`;
    const clsCode = config.target_class_code || parsed.detectedPackageCode || null;

    const items: SheetSyncPreviewItem[] = [];
    let unchangedCount = 0;

    // Locate target student & enrollment in DB
    let student = extId
      ? await prisma.student.findUnique({
          where: { external_id: extId },
          include: {
            enrollments: {
              include: {
                package: true,
                enrollment_classes: { include: { class: true } },
              },
              orderBy: { created_at: 'desc' },
            },
          },
        })
      : null;

    if (!student && stuName) {
      student = await prisma.student.findFirst({
        where: { full_name: stuName },
        include: {
          enrollments: {
            include: {
              package: true,
              enrollment_classes: { include: { class: true } },
            },
            orderBy: { created_at: 'desc' },
          },
        },
      });
    }

    const itemKey = `STUDY_REPORT::${programType}::${extId || config.code}`;

    if (!student || student.enrollments.length === 0) {
      items.push({
        itemKey,
        rowNumber: 1,
        externalId: extId || 'UNKNOWN',
        studentName: stuName,
        classCode: clsCode,
        programType,
        entityType: 'StudyReport',
        action: 'INVALID',
        defaultSelected: false,
        summaryText: `Không tìm thấy hồ sơ học viên [${extId || stuName}] trên Web để gắn Báo cáo học tập`,
        fieldDiffs: [],
        warnings: parsed.warnings,
        errors: [
          `Học viên [${extId} - ${stuName}] chưa tồn tại trên Web. Vui lòng đồng bộ Dữ liệu học viên trước.`,
        ],
        _payload: { parsed },
      });
    } else {
      // Match best enrollment for programType and package/classCode
      let enrollment =
        student.enrollments.find(
          (e) =>
            e.program_type === programType &&
            clsCode &&
            (e.package?.code?.toUpperCase() === clsCode.toUpperCase() ||
              e.enrollment_classes.some((ec) => ec.class?.class_code?.toUpperCase() === clsCode.toUpperCase()))
        ) ||
        student.enrollments.find((e) => e.program_type === programType) ||
        student.enrollments[0];

      const existingMeta =
        enrollment.program_metadata && typeof enrollment.program_metadata === 'object'
          ? (enrollment.program_metadata as Record<string, any>)
          : {};
      const existingReport = existingMeta.study_report || null;

      const diffs: SheetSyncFieldDiff[] = [];

      if (programType === 'KAIWA' && parsed.kaiwaReport) {
        const nr = parsed.kaiwaReport;
        const er = (existingReport || {}) as Record<string, any>;
        if (JSON.stringify(er) !== JSON.stringify(nr)) {
          diffs.push({
            field: 'study_report',
            label: 'Báo cáo học tập Kaiwa (Tab 1)',
            before: existingReport ? 'Đã có dữ liệu' : null,
            after: `Cập nhật báo cáo Kaiwa (${stuName})`,
          });
        }
      } else if (programType === 'JLPT' && parsed.jlptDailyReports) {
        const prevCount = Array.isArray(existingReport?.jlpt_daily_reports)
          ? existingReport.jlpt_daily_reports.length
          : 0;
        const nextCount = parsed.jlptDailyReports.length;
        if (JSON.stringify(existingReport?.jlpt_daily_reports || []) !== JSON.stringify(parsed.jlptDailyReports)) {
          diffs.push({
            field: 'jlpt_daily_reports',
            label: 'Nhận xét buổi học JLPT',
            before: prevCount > 0 ? `${prevCount} buổi nhận xét` : null,
            after: `${nextCount} buổi nhận xét (${parsed.jlptDailyReports.map((d) => d.dateLabel).slice(0, 4).join(', ')}${nextCount > 4 ? '...' : ''})`,
          });
        }
      }

      if (diffs.length === 0) {
        unchangedCount = 1;
      } else {
        const isFirstReport = !existingReport;
        items.push({
          itemKey,
          rowNumber: 1,
          externalId: student.external_id || extId,
          studentName: student.full_name,
          classCode: clsCode || enrollment.package?.code || null,
          programType,
          entityType: 'StudyReport',
          action: isFirstReport ? 'CREATE' : 'UPDATE',
          defaultSelected: true,
          summaryText: diffs[0].after,
          fieldDiffs: diffs,
          warnings: parsed.warnings,
          errors: [],
          _payload: {
            enrollmentId: enrollment.id,
            studentId: student.id,
            parsed,
          },
        });
      }
    }

    const previewToken = crypto.randomBytes(16).toString('hex');
    return {
      previewToken,
      configId: config.id,
      configCode: config.code,
      createdAtMs: Date.now(),
      syncYear: null,
      filterConfig,
      sheetName: parsed.sheetName || config.sheet_name,
      fileHash,
      sourceLabel,
      totalRowsScanned: programType === 'JLPT' ? parsed.jlptDailyReports?.length || 1 : 1,
      filteredOutCount: 0,
      unchangedCount,
      warnings: parsed.warnings,
      items,
      discoveredReportLinks: [],
    };
  }

  /* ==========================================================================
   * COMMIT ENGINE (POST /api/v1/imports/sheet-sync/configs/:code/commit)
   * ========================================================================== */

  public async commitConfigSync(
    idOrCode: string,
    options?: {
      previewToken?: string;
      selectedItemKeys?: string[];
      sync_year?: number | null;
      filter_config?: SyncFilterConfig;
      actorId?: number;
      triggerType?: 'MANUAL' | 'AUTO';
      limit?: number;
    }
  ) {
    const startMs = Date.now();
    const config = await this.findConfigByIdOrCode(idOrCode);
    const triggerType: 'MANUAL' | 'AUTO' = options?.triggerType || 'MANUAL';

    let session = options?.previewToken ? previewCache.get(options.previewToken) : undefined;
    if (!session || session.configId !== config.id) {
      // Build fresh preview session
      await this.previewConfig(config.code, {
        sync_year: options?.sync_year,
        filter_config: options?.filter_config,
        limit: options?.limit,
      });
      // Find latest session for this config
      for (const s of previewCache.values()) {
        if (s.configId === config.id) {
          session = s;
        }
      }
    }

    if (!session) {
      throw new AppError(400, 'Không thể khởi tạo phiên đồng bộ');
    }

    const selectedSet =
      Array.isArray(options?.selectedItemKeys) && options!.selectedItemKeys.length > 0
        ? new Set(options!.selectedItemKeys)
        : null;

    await prisma.googleSheetSyncConfig.update({
      where: { id: config.id },
      data: { last_status: 'SYNCING', last_error: null },
    });

    // Create GoogleSheetSyncRun record
    const run = await prisma.googleSheetSyncRun.create({
      data: {
        config_id: config.id,
        config_code: config.code,
        config_name: config.name,
        flow_type: config.flow_type || 'STUDENT_MASTER',
        program_type: config.program_type,
        trigger_type: triggerType,
        status: 'SUCCESS',
        sync_year: session.syncYear,
        filter_snapshot: session.filterConfig as Prisma.InputJsonValue,
        total_rows: session.totalRowsScanned,
        unchanged_count: session.unchangedCount,
        triggered_by_id: options?.actorId || null,
      },
    });

    let createdCount = 0;
    let updatedCount = 0;
    let conflictCount = 0;
    let failedCount = 0;
    const byCvht: Record<string, number> = {};

    const { mapping: defaultMapping, defaultCsId: fallbackDefaultCsId } = await this.buildDefaultCvhtMapping();
    const configuredMapping =
      config.cvht_mapping && typeof config.cvht_mapping === 'object'
        ? (config.cvht_mapping as Record<string, number>)
        : {};
    const cvhtToCsId: Record<string, number> = {
      ...defaultMapping,
      ...configuredMapping,
    };
    const effectiveDefaultCsId = config.default_cs_id || fallbackDefaultCsId;

    // Auto-upsert discovered Study Report configs
    for (const link of session.discoveredReportLinks) {
      await this.autoUpsertStudyReportConfig(link, effectiveDefaultCsId);
    }

    for (const item of session.items) {
      // In AUTO mode or when selectedSet is not provided: skip INVALID items, apply CREATE/UPDATE/CONFLICT
      const isSelected = selectedSet ? selectedSet.has(item.itemKey) : item.defaultSelected;

      if (item.action === 'INVALID') {
        failedCount++;
        await prisma.googleSheetSyncRunItem.create({
          data: {
            run_id: run.id,
            row_number: item.rowNumber,
            external_id: item.externalId,
            student_name: item.studentName,
            class_code: item.classCode,
            entity_type: item.entityType,
            action: 'INVALID',
            status: 'FAILED',
            summary_text: item.summaryText,
            field_diffs: item.fieldDiffs as unknown as Prisma.InputJsonValue,
            warnings: item.warnings as unknown as Prisma.InputJsonValue,
            error_message: item.errors.join('; ') || item.summaryText,
          },
        });
        continue;
      }

      if (!isSelected) {
        await prisma.googleSheetSyncRunItem.create({
          data: {
            run_id: run.id,
            row_number: item.rowNumber,
            external_id: item.externalId,
            student_name: item.studentName,
            class_code: item.classCode,
            entity_type: item.entityType,
            action: item.action,
            status: 'SKIPPED',
            summary_text: `Bỏ qua theo lựa chọn người dùng: ${item.summaryText}`,
            field_diffs: item.fieldDiffs as unknown as Prisma.InputJsonValue,
            warnings: item.warnings as unknown as Prisma.InputJsonValue,
          },
        });
        continue;
      }

      try {
        if (item.entityType === 'StudentEnrollment') {
          const applied = await this.applyStudentEnrollmentItem(
            config,
            item,
            cvhtToCsId,
            effectiveDefaultCsId,
            options?.actorId
          );
          const cvhtKey = item._payload?.row?.cvhtCode || 'UNASSIGNED';
          byCvht[cvhtKey] = (byCvht[cvhtKey] || 0) + 1;
          if (item.action === 'CREATE') createdCount++;
          else updatedCount++;

          await prisma.googleSheetSyncRunItem.create({
            data: {
              run_id: run.id,
              row_number: item.rowNumber,
              external_id: item.externalId,
              student_name: item.studentName,
              class_code: item.classCode,
              entity_type: 'StudentEnrollment',
              entity_id: String(applied.enrollmentId),
              action: item.action,
              status: 'APPLIED',
              summary_text: item.summaryText,
              field_diffs: item.fieldDiffs as unknown as Prisma.InputJsonValue,
              before_snapshot: applied.beforeSnapshot as Prisma.InputJsonValue,
              after_snapshot: applied.afterSnapshot as Prisma.InputJsonValue,
              warnings: item.warnings as unknown as Prisma.InputJsonValue,
            },
          });
        } else if (item.entityType === 'Attendance') {
          const applied = await this.applyAttendanceItem(
            config,
            item,
            effectiveDefaultCsId,
            options?.actorId
          );
          if (item.action === 'CONFLICT') conflictCount++;
          if (item.action === 'CREATE') createdCount++;
          else updatedCount++;

          await prisma.googleSheetSyncRunItem.create({
            data: {
              run_id: run.id,
              row_number: item.rowNumber,
              external_id: item.externalId,
              student_name: item.studentName,
              class_code: item.classCode,
              entity_type: 'Attendance',
              entity_id: String(applied.enrollmentClassId),
              action: item.action,
              status: 'APPLIED',
              summary_text: item.summaryText,
              field_diffs: item.fieldDiffs as unknown as Prisma.InputJsonValue,
              before_snapshot: applied.beforeSnapshot as Prisma.InputJsonValue,
              after_snapshot: applied.afterSnapshot as Prisma.InputJsonValue,
              warnings: item.warnings as unknown as Prisma.InputJsonValue,
            },
          });
        } else if (item.entityType === 'StudyReport') {
          const applied = await this.applyStudyReportItem(config, item);
          if (item.action === 'CREATE') createdCount++;
          else updatedCount++;

          await prisma.googleSheetSyncRunItem.create({
            data: {
              run_id: run.id,
              row_number: item.rowNumber,
              external_id: item.externalId,
              student_name: item.studentName,
              class_code: item.classCode,
              entity_type: 'StudyReport',
              entity_id: String(applied.enrollmentId),
              action: item.action,
              status: 'APPLIED',
              summary_text: item.summaryText,
              field_diffs: item.fieldDiffs as unknown as Prisma.InputJsonValue,
              before_snapshot: applied.beforeSnapshot as Prisma.InputJsonValue,
              after_snapshot: applied.afterSnapshot as Prisma.InputJsonValue,
              warnings: item.warnings as unknown as Prisma.InputJsonValue,
            },
          });
        }
      } catch (err: any) {
        failedCount++;
        await prisma.googleSheetSyncRunItem.create({
          data: {
            run_id: run.id,
            row_number: item.rowNumber,
            external_id: item.externalId,
            student_name: item.studentName,
            class_code: item.classCode,
            entity_type: item.entityType,
            action: item.action,
            status: 'FAILED',
            summary_text: item.summaryText,
            field_diffs: item.fieldDiffs as unknown as Prisma.InputJsonValue,
            warnings: item.warnings as unknown as Prisma.InputJsonValue,
            error_message: err?.message || String(err),
          },
        });
      }
    }

    const now = new Date();
    const durationMs = Math.max(1, Date.now() - startMs);
    const finalStatus =
      failedCount > 0
        ? createdCount + updatedCount > 0
          ? 'PARTIAL_FAILED'
          : 'FAILED'
        : 'SUCCESS';

    const updatedRun = await prisma.googleSheetSyncRun.update({
      where: { id: run.id },
      data: {
        status: finalStatus,
        created_count: createdCount,
        updated_count: updatedCount,
        conflict_count: conflictCount,
        failed_count: failedCount,
        duration_ms: durationMs,
        completed_at: now,
      },
    });

    const summaryResult: SheetSyncResult = {
      runId: updatedRun.id,
      code: config.code,
      programType: config.program_type,
      flowType: config.flow_type,
      skipped: false,
      totalRows: session.totalRowsScanned,
      unchangedRows: session.unchangedCount,
      createdCount,
      updatedCount,
      conflictCount,
      failedCount,
      byCvht,
      syncedAt: now.toISOString(),
      durationMs,
      triggerType,
      mode: 'DELTA',
    };

    const updatedConfig = await prisma.googleSheetSyncConfig.update({
      where: { id: config.id },
      data: {
        last_file_hash: failedCount === 0 ? session.fileHash : null,
        last_synced_at: now,
        last_status: finalStatus,
        last_summary: summaryResult as unknown as Prisma.InputJsonValue,
        last_error: null,
      },
    });

    await prisma.auditLog
      ?.create?.({
        data: {
          user_id: options?.actorId || effectiveDefaultCsId || 1,
          action: 'GOOGLE_SHEET_SYNC',
          entity_type: 'GoogleSheetSyncConfig',
          entity_id: config.code,
          after_data: {
            ...summaryResult,
            name: config.name,
            status: finalStatus,
          } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});

    if (options?.previewToken) {
      previewCache.delete(options.previewToken);
    }

    return {
      runId: updatedRun.id,
      status: finalStatus,
      summary: summaryResult,
      config: updatedConfig,
      ...summaryResult,
    };
  }

  /**
   * Apply a single StudentEnrollment item and return before/after snapshots for Rollback
   */
  private async applyStudentEnrollmentItem(
    config: any,
    item: SheetSyncPreviewItem,
    cvhtToCsId: Record<string, number>,
    effectiveDefaultCsId: number,
    actorId?: number
  ): Promise<{ enrollmentId: number; beforeSnapshot: any; afterSnapshot: any }> {
    const row: NormalizedSheetRow = item._payload.row;
    const rowHash = this.sha256(JSON.stringify(row));
    const targetCsId =
      row.cvhtCode && cvhtToCsId[row.cvhtCode.toUpperCase()]
        ? cvhtToCsId[row.cvhtCode.toUpperCase()]
        : effectiveDefaultCsId;

    // Special branch: KAIWA_CARE (1.Chăm sóc) ONLY updates care & report fields (AI..BH) on an existing Kaiwa enrollment
    if (row.isKaiwaCareOnly) {
      const existingStudent = await prisma.student.findUnique({
        where: { external_id: row.externalId },
      });
      if (!existingStudent) {
        throw new AppError(
          400,
          'Học viên chưa có hồ sơ gốc trên Web (cấu hình 1.Chăm sóc chỉ cập nhật báo cáo & chăm sóc khi khớp ID)'
        );
      }

      const stuKaiwaEnrs = await prisma.enrollment.findMany({
        where: { student_id: existingStudent.id, program_type: 'KAIWA' },
        include: { package: true, care_logs: true },
        orderBy: { created_at: 'desc' },
      });
      const existingEnrollment =
        (item._payload.existingEnrollmentId
          ? stuKaiwaEnrs.find((e) => e.id === Number(item._payload.existingEnrollmentId))
          : undefined) ||
        stuKaiwaEnrs.find((e) => e.package?.code?.toUpperCase() === row.packageCode.toUpperCase()) ||
        stuKaiwaEnrs[0];

      if (!existingEnrollment) {
        throw new AppError(
          400,
          'Học viên chưa có hồ sơ gốc trên Web (cấu hình 1.Chăm sóc chỉ cập nhật báo cáo & chăm sóc khi khớp ID)'
        );
      }

      const beforeSnapshot = {
        existed: true,
        studentId: existingStudent.id,
        studentExisted: true,
        studentData: null,
        enrollmentId: existingEnrollment.id,
        enrollmentData: {
          status: existingEnrollment.status,
          total_sessions: existingEnrollment.total_sessions,
          total_attended: (existingEnrollment as any).total_attended,
          attended_previous_years: existingEnrollment.attended_previous_years,
          external_remaining_sessions: existingEnrollment.external_remaining_sessions,
          exchange_info: existingEnrollment.exchange_info,
          callback_note: existingEnrollment.callback_note,
          hot_issue_note: existingEnrollment.hot_issue_note,
          post_course_care: existingEnrollment.post_course_care,
          study_report_url: existingEnrollment.study_report_url,
          handed_over_at: existingEnrollment.handed_over_at,
          account_created_at: (existingEnrollment as any).account_created_at,
          program_metadata: existingEnrollment.program_metadata,
        },
      };

      const prevMeta =
        existingEnrollment.program_metadata && typeof existingEnrollment.program_metadata === 'object'
          ? (existingEnrollment.program_metadata as Record<string, any>)
          : {};
      const mergedMeta = {
        ...prevMeta,
        ...(row.programMetadata.attended_previous_years_raw !== undefined
          ? { attended_previous_years_raw: row.programMetadata.attended_previous_years_raw }
          : {}),
      };

      const rawPrevStr = row.programMetadata.attended_previous_years_raw;
      const isNumericPrev =
        rawPrevStr !== undefined &&
        rawPrevStr !== null &&
        String(rawPrevStr).trim() !== '' &&
        !Number.isNaN(Number(rawPrevStr));
      const nextAttendedPrevYears = isNumericPrev
        ? Math.round(Number(rawPrevStr))
        : existingEnrollment.attended_previous_years;

      const handedOverObj = row.handedOverAt ? new Date(row.handedOverAt) : existingEnrollment.handed_over_at;
      const accountCreatedObj = row.accountCreatedAt
        ? new Date(row.accountCreatedAt)
        : (existingEnrollment as any).account_created_at;

      const savedEnrollment = await prisma.enrollment.update({
        where: { id: existingEnrollment.id },
        data: {
          program_metadata: mergedMeta as Prisma.InputJsonValue,
          attended_previous_years: nextAttendedPrevYears,
          ...(row.totalAttended !== null ? { total_attended: row.totalAttended } : {}),
          ...(row.studyReportUrl ? { study_report_url: row.studyReportUrl } : {}),
          ...(row.exchangeInfo !== null ? { exchange_info: row.exchangeInfo } : {}),
          ...(row.callbackNote !== null ? { callback_note: row.callbackNote } : {}),
          ...(row.hotIssueNote !== null ? { hot_issue_note: row.hotIssueNote } : {}),
          ...(row.postCourseCare !== null ? { post_course_care: row.postCourseCare } : {}),
          ...(handedOverObj ? { handed_over_at: handedOverObj } : {}),
          ...(accountCreatedObj ? { account_created_at: accountCreatedObj } : {}),
          external_synced_at: new Date(),
        },
        include: { care_logs: true },
      });

      if (row.careLogs.length > 0) {
        const existingLogsBySession = new Map(
          savedEnrollment.care_logs
            .filter((cl) => cl.after_session_number !== null)
            .map((cl) => [cl.after_session_number!, cl])
        );
        const csForLog = savedEnrollment.cs_id || effectiveDefaultCsId;

        for (const cl of row.careLogs) {
          const found = existingLogsBySession.get(cl.after_session_number);
          if (!found) {
            await prisma.careLog.create({
              data: {
                enrollment_id: savedEnrollment.id,
                cs_id: csForLog,
                after_session_number: cl.after_session_number,
                content: cl.content,
                outcome: cl.outcome,
                created_by_id: actorId || csForLog,
              },
            });
          } else if (found.content !== cl.content || found.outcome !== cl.outcome) {
            await prisma.careLog.update({
              where: { id: found.id },
              data: {
                content: cl.content,
                outcome: cl.outcome,
              },
            });
          }
        }
      }

      await prisma.googleSheetRowState.upsert({
        where: {
          config_id_sync_key: {
            config_id: config.id,
            sync_key: row.syncKey,
          },
        },
        update: {
          row_number: row.rowNumber,
          row_hash: rowHash,
          student_id: existingStudent.id,
          enrollment_id: savedEnrollment.id,
        },
        create: {
          config_id: config.id,
          sync_key: row.syncKey,
          row_number: row.rowNumber,
          row_hash: rowHash,
          student_id: existingStudent.id,
          enrollment_id: savedEnrollment.id,
        },
      });

      const afterSnapshot = {
        studentId: existingStudent.id,
        enrollmentId: savedEnrollment.id,
        syncKey: row.syncKey,
        enrollmentData: {
          status: savedEnrollment.status,
          total_sessions: savedEnrollment.total_sessions,
          total_attended: (savedEnrollment as any).total_attended,
          attended_previous_years: savedEnrollment.attended_previous_years,
          external_remaining_sessions: savedEnrollment.external_remaining_sessions,
          exchange_info: savedEnrollment.exchange_info,
          callback_note: savedEnrollment.callback_note,
          hot_issue_note: savedEnrollment.hot_issue_note,
          post_course_care: savedEnrollment.post_course_care,
          study_report_url: savedEnrollment.study_report_url,
          handed_over_at: savedEnrollment.handed_over_at,
          account_created_at: (savedEnrollment as any).account_created_at,
          program_metadata: savedEnrollment.program_metadata,
        },
      };

      return {
        enrollmentId: savedEnrollment.id,
        beforeSnapshot,
        afterSnapshot,
      };
    }

    // 1. Package
    const pkg = await prisma.package.upsert({
      where: { code: row.packageCode },
      update: {},
      create: {
        code: row.packageCode,
        name: `Gói ${row.packageCode}`,
        default_total_sessions: row.totalSessions || 30,
        active: true,
      },
    });

    // 2. Sale
    let saleId: number | null = null;
    if (row.saleName) {
      const sale = await prisma.sale.upsert({
        where: { code: row.saleName },
        update: {},
        create: {
          code: row.saleName,
          name: row.saleName,
          active: true,
        },
      });
      saleId = sale.id;
    }

    // 3. Student before snapshot & upsert
    const existingStudent = await prisma.student.findUnique({
      where: { external_id: row.externalId },
    });
    const dobDate = row.dateOfBirth ? new Date(row.dateOfBirth) : null;

    const student = await prisma.student.upsert({
      where: { external_id: row.externalId },
      update: {
        full_name: row.fullName || existingStudent?.full_name || `Học viên ${row.externalId}`,
        ...(row.gender ? { gender: row.gender } : {}),
        ...(row.phone ? { phone: row.phone } : {}),
        ...(row.email ? { email: row.email } : {}),
        ...(dobDate ? { date_of_birth: dobDate } : {}),
        ...(row.occupation ? { occupation: row.occupation } : {}),
      },
      create: {
        external_id: row.externalId,
        full_name: row.fullName || `Học viên ${row.externalId}`,
        gender: row.gender,
        phone: row.phone,
        email: row.email,
        date_of_birth: dobDate,
        occupation: row.occupation,
        note: row.salesNote,
      },
    });

    // 4. Enrollment before snapshot & upsert
    let existingEnrollment = await prisma.enrollment.findUnique({
      where: { external_sync_key: row.syncKey },
      include: { enrollment_classes: true, care_logs: true },
    });
    if (!existingEnrollment) {
      existingEnrollment = await prisma.enrollment.findFirst({
        where: { student_id: student.id, package_id: pkg.id },
        include: { enrollment_classes: true, care_logs: true },
      });
    }

    const beforeSnapshot = existingEnrollment
      ? {
          existed: true,
          studentId: student.id,
          studentExisted: Boolean(existingStudent),
          studentData: existingStudent
            ? {
                full_name: existingStudent.full_name,
                gender: existingStudent.gender,
                phone: existingStudent.phone,
                email: existingStudent.email,
                occupation: existingStudent.occupation,
              }
            : null,
          enrollmentId: existingEnrollment.id,
          enrollmentData: {
            status: existingEnrollment.status,
            total_sessions: existingEnrollment.total_sessions,
            total_attended: (existingEnrollment as any).total_attended,
            attended_previous_years: existingEnrollment.attended_previous_years,
            external_remaining_sessions: existingEnrollment.external_remaining_sessions,
            exchange_info: existingEnrollment.exchange_info,
            callback_note: existingEnrollment.callback_note,
            hot_issue_note: existingEnrollment.hot_issue_note,
            post_course_care: existingEnrollment.post_course_care,
            study_report_url: existingEnrollment.study_report_url,
            handed_over_at: existingEnrollment.handed_over_at,
            account_created_at: (existingEnrollment as any).account_created_at,
            program_metadata: existingEnrollment.program_metadata,
          },
        }
      : {
          existed: false,
          studentId: student.id,
          studentExisted: Boolean(existingStudent),
        };

    const paidAtDate = row.paidAt ? new Date(row.paidAt) : null;
    const startDateObj = row.startDate ? new Date(row.startDate) : null;
    const endDateObj = row.endDate ? new Date(row.endDate) : null;
    const handedOverObj = row.handedOverAt ? new Date(row.handedOverAt) : null;
    const accountCreatedObj = row.accountCreatedAt ? new Date(row.accountCreatedAt) : null;

    // Preserve existing study_report inside program_metadata if already present
    const prevMeta =
      existingEnrollment?.program_metadata && typeof existingEnrollment.program_metadata === 'object'
        ? (existingEnrollment.program_metadata as Record<string, any>)
        : {};
    const mergedMeta = {
      ...prevMeta,
      ...row.programMetadata,
    };

    // Web reassignment priority: if CS was reassigned on Web, do NOT overwrite cs_id back to old Sheet CVHT
    const keepWebReassignedCs =
      Boolean(existingEnrollment) &&
      prevMeta.cs_reassigned_on_web === true &&
      targetCsId !== existingEnrollment!.cs_id;
    const effectiveCsId = keepWebReassignedCs ? existingEnrollment!.cs_id : targetCsId;
    const effectiveHandedOverAt =
      row.isKaiwaMasterOnly && existingEnrollment
        ? existingEnrollment.handed_over_at
        : keepWebReassignedCs
          ? existingEnrollment!.handed_over_at ?? handedOverObj
          : handedOverObj;

    const preserveCareFields = Boolean(row.isKaiwaMasterOnly && existingEnrollment);

    const enrollmentPayload = {
      external_id: row.externalId,
      external_sync_key: row.syncKey,
      program_type: row.programType,
      program_metadata: mergedMeta as Prisma.InputJsonValue,
      student_id: student.id,
      package_id: pkg.id,
      cs_id: effectiveCsId,
      paid_at: paidAtDate,
      sale_id: saleId,
      sale_name: row.saleName,
      student_source_status: row.studentSourceStatus,
      course_content: row.courseContent,
      payment_status: row.paymentStatus,
      course_teacher_type: row.courseTeacherType,
      level: row.level,
      total_sessions: row.totalSessions,
      total_attended: preserveCareFields ? (existingEnrollment as any).total_attended : row.totalAttended,
      class_model: row.classModel,
      sales_note: row.salesNote,
      study_report_url: preserveCareFields
        ? existingEnrollment!.study_report_url
        : row.studyReportUrl || existingEnrollment?.study_report_url || null,
      exchange_info: preserveCareFields ? existingEnrollment!.exchange_info : row.exchangeInfo,
      callback_note: preserveCareFields ? existingEnrollment!.callback_note : row.callbackNote,
      hot_issue_note: preserveCareFields ? existingEnrollment!.hot_issue_note : row.hotIssueNote,
      post_course_care: preserveCareFields ? existingEnrollment!.post_course_care : row.postCourseCare,
      start_date: startDateObj,
      end_date: endDateObj,
      end_hold_week: row.endHoldWeek,
      end_hold_year: row.endHoldYear,
      handover_month: row.handoverMonth,
      renewal_deadline: row.renewalDeadline ? new Date(row.renewalDeadline) : null,
      status: row.status,
      attended_previous_years: preserveCareFields
        ? existingEnrollment!.attended_previous_years
        : row.attendedPreviousYears,
      external_remaining_sessions: row.remainingSessions,
      handed_over_at: effectiveHandedOverAt,
      ...(!preserveCareFields && accountCreatedObj ? { account_created_at: accountCreatedObj } : {}),
      external_synced_at: new Date(),
    };

    const savedEnrollment = existingEnrollment
      ? await prisma.enrollment.update({
          where: { id: existingEnrollment.id },
          data: enrollmentPayload,
          include: { enrollment_classes: true, care_logs: true },
        })
      : await prisma.enrollment.create({
          data: enrollmentPayload,
          include: { enrollment_classes: true, care_logs: true },
        });

    // 5. Class, Schedule, Teacher & EnrollmentClass
    if (row.className || row.classCode || row.schedulePattern) {
      const resolvedClassName = row.className || row.classCode || `Lớp ${row.fullName}`;
      const resolvedClassCode = row.classCode || resolvedClassName;
      let cls = await prisma.class.findFirst({
        where: {
          OR: [{ class_code: resolvedClassCode }, { class_name: resolvedClassName }],
        },
        include: { class_schedules: true, class_teachers: true },
      });

      if (!cls) {
        cls = await prisma.class.create({
          data: {
            class_code: resolvedClassCode,
            class_name: resolvedClassName,
            level: row.level,
            model_type: mapClassModelType(row.classModel),
            attendance_source: AttendanceSourceType.LEARNING_SYSTEM,
            active: true,
          },
          include: { class_schedules: true, class_teachers: true },
        });
      }

      if (row.schedulePattern && cls.class_schedules.length === 0) {
        await prisma.classSchedule.create({
          data: {
            class_id: cls.id,
            schedule_pattern: row.schedulePattern,
            start_time: row.startTime,
            duration_minutes: row.durationMinutes,
            valid_from: startDateObj,
            valid_to: endDateObj,
            active: true,
          },
        });
      }

      if (row.teacherName || row.teacherCode) {
        const tCodeRaw = (row.teacherCode || row.teacherName || '').trim().slice(0, 60);
        const tNameRaw = (row.teacherName || row.teacherCode || '').trim();
        if (tCodeRaw) {
          const teacher = await prisma.teacher.upsert({
            where: { code: tCodeRaw },
            update: {},
            create: {
              code: tCodeRaw,
              name: tNameRaw || tCodeRaw,
              active: true,
            },
          });
          if (!cls.class_teachers.some((ct) => ct.teacher_id === teacher.id)) {
            await prisma.classTeacher.create({
              data: {
                class_id: cls.id,
                teacher_id: teacher.id,
                role: 'MAIN',
                active: true,
              },
            });
          }
        }
      }

      const hasEc = savedEnrollment.enrollment_classes.some((ec) => ec.class_id === cls!.id);
      if (!hasEc) {
        await prisma.enrollmentClass.create({
          data: {
            enrollment_id: savedEnrollment.id,
            class_id: cls.id,
            sequence_no: savedEnrollment.enrollment_classes.length + 1,
            start_date: startDateObj,
            end_date: endDateObj,
            status: EnrollmentClassStatus.ACTIVE,
          },
        });
      }
    }

    // 6. Care Logs
    if (row.careLogs.length > 0) {
      const existingLogsBySession = new Map(
        savedEnrollment.care_logs
          .filter((cl) => cl.after_session_number !== null)
          .map((cl) => [cl.after_session_number!, cl])
      );

      for (const cl of row.careLogs) {
        const found = existingLogsBySession.get(cl.after_session_number);
        if (!found) {
          await prisma.careLog.create({
            data: {
              enrollment_id: savedEnrollment.id,
              cs_id: targetCsId,
              after_session_number: cl.after_session_number,
              content: cl.content,
              outcome: cl.outcome,
              created_by_id: actorId || targetCsId,
            },
          });
        } else if (found.content !== cl.content || found.outcome !== cl.outcome) {
          await prisma.careLog.update({
            where: { id: found.id },
            data: {
              content: cl.content,
              outcome: cl.outcome,
              cs_id: targetCsId,
            },
          });
        }
      }
    }

    // 7. Row State
    await prisma.googleSheetRowState.upsert({
      where: {
        config_id_sync_key: {
          config_id: config.id,
          sync_key: row.syncKey,
        },
      },
      update: {
        row_number: row.rowNumber,
        row_hash: rowHash,
        student_id: student.id,
        enrollment_id: savedEnrollment.id,
      },
      create: {
        config_id: config.id,
        sync_key: row.syncKey,
        row_number: row.rowNumber,
        row_hash: rowHash,
        student_id: student.id,
        enrollment_id: savedEnrollment.id,
      },
    });

    const afterSnapshot = {
      studentId: student.id,
      studentData: {
        full_name: student.full_name,
        gender: student.gender,
        phone: student.phone,
        email: student.email,
        occupation: student.occupation,
      },
      enrollmentId: savedEnrollment.id,
      syncKey: row.syncKey,
      enrollmentData: {
        status: savedEnrollment.status,
        total_sessions: savedEnrollment.total_sessions,
        total_attended: (savedEnrollment as any).total_attended,
        attended_previous_years: savedEnrollment.attended_previous_years,
        external_remaining_sessions: savedEnrollment.external_remaining_sessions,
        exchange_info: savedEnrollment.exchange_info,
        callback_note: savedEnrollment.callback_note,
        hot_issue_note: savedEnrollment.hot_issue_note,
        post_course_care: savedEnrollment.post_course_care,
        study_report_url: savedEnrollment.study_report_url,
        handed_over_at: savedEnrollment.handed_over_at,
        account_created_at: (savedEnrollment as any).account_created_at,
        program_metadata: savedEnrollment.program_metadata,
      },
    };

    return {
      enrollmentId: savedEnrollment.id,
      beforeSnapshot,
      afterSnapshot,
    };
  }

  /**
   * Apply a single Attendance row (CSKH_ATTENDANCE or TEACHER_ATTENDANCE) and return before/after snapshots for Rollback
   */
  private async applyAttendanceItem(
    config: any,
    item: SheetSyncPreviewItem,
    effectiveDefaultCsId: number,
    actorId?: number
  ): Promise<{ enrollmentClassId: number; beforeSnapshot: any; afterSnapshot: any }> {
    const payload = item._payload;
    const row: ParsedStudentAttendanceRow = payload.row;
    const flowType: 'CSKH_ATTENDANCE' | 'TEACHER_ATTENDANCE' = payload.flowType;
    const userId = actorId || effectiveDefaultCsId || 1;

    let enrollmentClassId: number | null = payload.enrollmentClassId;
    let classId: number | null = payload.classId;

    if (!enrollmentClassId || !classId) {
      const resolvedClassCode = row.classCode || `CLASS_${row.externalId}`;
      let cls = await prisma.class.findFirst({
        where: { OR: [{ class_code: resolvedClassCode }, { class_name: resolvedClassCode }] },
      });
      if (!cls) {
        cls = await prisma.class.create({
          data: {
            class_code: resolvedClassCode,
            class_name: resolvedClassCode,
            model_type: mapClassModelType('1-1'),
            attendance_source: AttendanceSourceType.LEARNING_SYSTEM,
            active: true,
          },
        });
      }
      classId = cls.id;
      const ec = await prisma.enrollmentClass.create({
        data: {
          enrollment_id: payload.enrollmentId,
          class_id: cls.id,
          sequence_no: 1,
          status: EnrollmentClassStatus.ACTIVE,
        },
      });
      enrollmentClassId = ec.id;
    }

    const beforeRecords: Array<{
      date: string;
      existed: boolean;
      attendanceId?: number;
      status?: AttendanceStatus | null;
      cs_status?: AttendanceStatus | null;
      cs_raw_value?: string | null;
      teacher_status?: AttendanceStatus | null;
      teacher_raw_value?: string | null;
      lesson_topic?: string | null;
      reconciliation_state?: ReconciliationState | null;
    }> = [];

    const afterRecords: Array<{
      date: string;
      attendanceId: number;
      status: AttendanceStatus;
      cs_status: AttendanceStatus | null;
      teacher_status: AttendanceStatus | null;
      lesson_topic: string | null;
      reconciliation_state: ReconciliationState;
    }> = [];

    // Get current max session_number for this class
    const maxSessionAgg = await prisma.classSession.aggregate({
      where: { class_id: classId },
      _max: { session_number: true },
    });
    let nextSessionNum = (maxSessionAgg._max.session_number || 0) + 1;

    for (const entry of row.entries) {
      if (!entry.status) continue;
      const sessionDate = new Date(`${entry.date}T00:00:00.000Z`);
      if (Number.isNaN(sessionDate.getTime())) continue;

      let session = await prisma.classSession.findFirst({
        where: {
          class_id: classId,
          session_date: sessionDate,
        },
      });

      if (!session) {
        session = await prisma.classSession.create({
          data: {
            class_id: classId,
            session_number: nextSessionNum++,
            session_date: sessionDate,
            start_time: row.startTime || '19:00',
            status: ClassSessionStatus.COMPLETED,
            created_by_id: userId,
          },
        });
      }

      const existingAtt = await prisma.attendance.findUnique({
        where: {
          enrollment_class_id_class_session_id: {
            enrollment_class_id: enrollmentClassId,
            class_session_id: session.id,
          },
        },
      });

      beforeRecords.push({
        date: entry.date,
        existed: Boolean(existingAtt),
        attendanceId: existingAtt?.id,
        status: existingAtt?.status,
        cs_status: existingAtt?.cs_status,
        cs_raw_value: existingAtt?.cs_raw_value,
        teacher_status: existingAtt?.teacher_status,
        teacher_raw_value: existingAtt?.teacher_raw_value,
        lesson_topic: existingAtt?.lesson_topic,
        reconciliation_state: existingAtt?.reconciliation_state,
      });

      let reconciliationState: ReconciliationState;
      let finalStatus: AttendanceStatus = entry.status;

      if (flowType === 'CSKH_ATTENDANCE') {
        const teacherSt = existingAtt?.teacher_status;
        if (!teacherSt) {
          reconciliationState = ReconciliationState.PENDING_TEACHER;
          finalStatus = entry.status;
        } else if (teacherSt === entry.status) {
          reconciliationState = ReconciliationState.MATCHED;
          finalStatus = entry.status;
        } else {
          reconciliationState = ReconciliationState.CONFLICT;
          finalStatus = existingAtt?.status || entry.status;
        }

        const saved = await prisma.attendance.upsert({
          where: {
            enrollment_class_id_class_session_id: {
              enrollment_class_id: enrollmentClassId,
              class_session_id: session.id,
            },
          },
          update: {
            cs_status: entry.status,
            cs_raw_value: entry.rawValue,
            cs_submitted_at: new Date(),
            cs_user_id: userId,
            reconciliation_state: reconciliationState,
            status: finalStatus,
            deleted_at: null,
          },
          create: {
            enrollment_class_id: enrollmentClassId,
            class_session_id: session.id,
            cs_status: entry.status,
            cs_raw_value: entry.rawValue,
            cs_submitted_at: new Date(),
            cs_user_id: userId,
            reconciliation_state: reconciliationState,
            status: finalStatus,
            source: AttendanceSource.EXCEL_IMPORT,
            created_by_id: userId,
          },
        });

        afterRecords.push({
          date: entry.date,
          attendanceId: saved.id,
          status: saved.status,
          cs_status: saved.cs_status,
          teacher_status: saved.teacher_status,
          lesson_topic: saved.lesson_topic,
          reconciliation_state: saved.reconciliation_state,
        });
      } else {
        // TEACHER_ATTENDANCE
        const csSt = existingAtt?.cs_status;
        if (!csSt) {
          reconciliationState = ReconciliationState.PENDING_CS;
          finalStatus = entry.status;
        } else if (csSt === entry.status) {
          reconciliationState = ReconciliationState.MATCHED;
          finalStatus = entry.status;
        } else {
          reconciliationState = ReconciliationState.CONFLICT;
          finalStatus = existingAtt?.status || entry.status;
        }

        const saved = await prisma.attendance.upsert({
          where: {
            enrollment_class_id_class_session_id: {
              enrollment_class_id: enrollmentClassId,
              class_session_id: session.id,
            },
          },
          update: {
            teacher_status: entry.status,
            teacher_raw_value: entry.rawValue,
            lesson_topic: entry.lessonTopic || existingAtt?.lesson_topic || null,
            teacher_submitted_at: new Date(),
            teacher_user_id: userId,
            reconciliation_state: reconciliationState,
            status: finalStatus,
            deleted_at: null,
          },
          create: {
            enrollment_class_id: enrollmentClassId,
            class_session_id: session.id,
            teacher_status: entry.status,
            teacher_raw_value: entry.rawValue,
            lesson_topic: entry.lessonTopic || null,
            teacher_submitted_at: new Date(),
            teacher_user_id: userId,
            reconciliation_state: reconciliationState,
            status: finalStatus,
            source: AttendanceSource.TEACHER_UPLOAD,
            created_by_id: userId,
          },
        });

        afterRecords.push({
          date: entry.date,
          attendanceId: saved.id,
          status: saved.status,
          cs_status: saved.cs_status,
          teacher_status: saved.teacher_status,
          lesson_topic: saved.lesson_topic,
          reconciliation_state: saved.reconciliation_state,
        });
      }
    }

    return {
      enrollmentClassId,
      beforeSnapshot: {
        flowType,
        enrollmentId: payload.enrollmentId,
        enrollmentClassId,
        records: beforeRecords,
      },
      afterSnapshot: {
        flowType,
        enrollmentId: payload.enrollmentId,
        enrollmentClassId,
        records: afterRecords,
      },
    };
  }

  /**
   * Apply a single StudyReport item and return before/after snapshots for Rollback
   */
  private async applyStudyReportItem(
    _config: any,
    item: SheetSyncPreviewItem
  ): Promise<{ enrollmentId: number; beforeSnapshot: any; afterSnapshot: any }> {
    const payload = item._payload;
    const enrollmentId: number = payload.enrollmentId;
    const parsed = payload.parsed;
    const jlptChuyenCanRow: JlptChuyenCanReportRow | undefined = payload.jlptChuyenCanRow;

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment) {
      throw new AppError(404, `Không tìm thấy gói học #${enrollmentId}`);
    }

    const prevMeta =
      enrollment.program_metadata && typeof enrollment.program_metadata === 'object'
        ? (enrollment.program_metadata as Record<string, any>)
        : {};

    const beforeSnapshot = {
      enrollmentId,
      exchange_info: enrollment.exchange_info,
      study_report: prevMeta.study_report ?? null,
      jlpt_chuyen_can_overrides: prevMeta.jlpt_chuyen_can_overrides ?? null,
      jlpt_chuyen_can: prevMeta.jlpt_chuyen_can ?? null,
      course_track: prevMeta.course_track ?? null,
      had_jlpt_chuyen_can: Boolean(prevMeta.jlpt_chuyen_can),
    };

    if (jlptChuyenCanRow) {
      const nextOverrides = {
        attended_sessions: jlptChuyenCanRow.attendedSessions,
        total_marked_sessions: jlptChuyenCanRow.totalMarkedSessions,
        average_exam_score: jlptChuyenCanRow.averageExamScore,
        homework_completed_sessions: jlptChuyenCanRow.homeworkCompletedSessions,
        max_consecutive_absent: jlptChuyenCanRow.maxConsecutiveAbsent,
        max_consecutive_no_homework: jlptChuyenCanRow.maxConsecutiveNoHomework,
      };
      const nextCourseTrack = jlptChuyenCanRow.courseTrack || prevMeta.course_track || undefined;
      const nextStudyReport = {
        ...(prevMeta.study_report && typeof prevMeta.study_report === 'object' ? prevMeta.study_report : {}),
        jlpt_chuyen_can: jlptChuyenCanRow,
      };
      const nextExchangeInfo =
        jlptChuyenCanRow.exchangeInfo && jlptChuyenCanRow.exchangeInfo.trim() !== ''
          ? jlptChuyenCanRow.exchangeInfo.trim()
          : enrollment.exchange_info;

      const nextMeta = {
        ...prevMeta,
        jlpt_chuyen_can_overrides: nextOverrides,
        ...(nextCourseTrack ? { course_track: nextCourseTrack } : {}),
        jlpt_chuyen_can: jlptChuyenCanRow,
        study_report: nextStudyReport,
        study_report_synced_at: new Date().toISOString(),
      };

      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          program_metadata: nextMeta as unknown as Prisma.InputJsonValue,
          exchange_info: nextExchangeInfo,
        },
      });

      const afterSnapshot = {
        enrollmentId,
        exchange_info: nextExchangeInfo,
        study_report: nextStudyReport,
        jlpt_chuyen_can_overrides: nextOverrides,
        jlpt_chuyen_can: jlptChuyenCanRow,
        course_track: nextCourseTrack ?? null,
      };

      return {
        enrollmentId,
        beforeSnapshot,
        afterSnapshot,
      };
    }

    const nextStudyReport =
      parsed.programType === 'KAIWA'
        ? parsed.kaiwaReport
        : {
            ...(prevMeta.study_report && typeof prevMeta.study_report === 'object' ? prevMeta.study_report : {}),
            jlpt_daily_reports: parsed.jlptDailyReports || [],
          };

    const nextExchangeInfo =
      parsed.programType === 'KAIWA' && parsed.kaiwaReport?.exchange_with_student
        ? parsed.kaiwaReport.exchange_with_student
        : enrollment.exchange_info;

    const nextMeta = {
      ...prevMeta,
      study_report: nextStudyReport,
      study_report_synced_at: new Date().toISOString(),
    };

    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        program_metadata: nextMeta as Prisma.InputJsonValue,
        exchange_info: nextExchangeInfo,
      },
    });

    const afterSnapshot = {
      enrollmentId,
      exchange_info: nextExchangeInfo,
      study_report: nextStudyReport,
    };

    return {
      enrollmentId,
      beforeSnapshot,
      afterSnapshot,
    };
  }

  /* ==========================================================================
   * LEGACY / AUTO SYNC ENTRYPOINT (syncConfigByCode & syncAll)
   * ========================================================================== */

  public async syncConfigByCode(
    code: string,
    options?: { forceFullSync?: boolean; limit?: number; actorId?: number; triggerType?: 'MANUAL' | 'AUTO' }
  ): Promise<SheetSyncResult> {
    const startMs = Date.now();
    const config = await this.findConfigByIdOrCode(code);
    const sourceTypeMap = await this.getSourceTypeMap();
    const effectiveSourceType = this.resolveConfigSourceType(config, sourceTypeMap);

    const forceFullSync = Boolean(options?.forceFullSync);
    const limit = options?.limit;
    const triggerType: 'MANUAL' | 'AUTO' = options?.triggerType || (options?.actorId ? 'MANUAL' : 'AUTO');
    const mode: 'DELTA' | 'FULL' = forceFullSync ? 'FULL' : 'DELTA';
    const flowType = (config.flow_type || 'STUDENT_MASTER').toUpperCase() as SyncFlowType;

    // For non-STUDENT_MASTER flows, delegate directly to preview + commit pipeline
    if (flowType !== 'STUDENT_MASTER') {
      const committed = await this.commitConfigSync(config.code, {
        actorId: options?.actorId,
        triggerType,
        limit,
      });
      return committed.summary;
    }

    await prisma.googleSheetSyncConfig.update({
      where: { id: config.id },
      data: { last_status: 'SYNCING', last_error: null },
    });

    try {
      const { buffer, sourceLabel } = await this.loadWorkbookBuffer({
        ...config,
        source_type: effectiveSourceType,
      });
      const fileHash = this.sha256(buffer);

      if (!forceFullSync && !limit && config.last_file_hash === fileHash && config.last_summary) {
        const prevSummary = config.last_summary as Record<string, any>;
        const totalRows = Number(prevSummary.totalRows) || 0;
        const byCvht = (prevSummary.byCvht as Record<string, number>) || {};
        const nowIso = new Date().toISOString();
        const durationMs = Math.max(1, Date.now() - startMs);

        const skippedResult: SheetSyncResult = {
          code: config.code,
          programType: config.program_type,
          flowType,
          skipped: true,
          reason: 'NO_FILE_CHANGE',
          totalRows,
          unchangedRows: totalRows,
          createdCount: 0,
          updatedCount: 0,
          failedCount: 0,
          byCvht,
          syncedAt: nowIso,
          durationMs,
          triggerType,
          mode,
        };

        await prisma.googleSheetSyncConfig.update({
          where: { id: config.id },
          data: {
            last_status: 'SUCCESS',
            last_synced_at: new Date(),
            last_summary: skippedResult as unknown as Prisma.InputJsonValue,
          },
        });

        return skippedResult;
      }

      const programType = (config.program_type?.toUpperCase() === 'JLPT' ? 'JLPT' : 'KAIWA') as 'JLPT' | 'KAIWA';
      const targetSheets =
        programType === 'JLPT'
          ? [config.sheet_name || 'Data JLPT_Inhouse', config.setting_sheet_name || 'Setting', 'Điểm học tập']
          : [config.sheet_name || 'Tổng', '1.Chăm sóc'];
      const workbook = await loadOptimizedWorkbook(buffer, targetSheets);

      const parsedRows: NormalizedSheetRow[] =
        programType === 'JLPT'
          ? parseJlptSheetRows(
              workbook,
              config.sheet_name || 'Data JLPT_Inhouse',
              config.setting_sheet_name || 'Setting',
              config.header_row || 2,
              limit
            )
          : parseKaiwaSheetRows(
              workbook,
              config.sheet_name || 'Tổng',
              config.header_row || 2,
              limit
            );

      const byCvht: Record<string, number> = {};
      for (const r of parsedRows) {
        const k = r.cvhtCode || 'UNASSIGNED';
        byCvht[k] = (byCvht[k] || 0) + 1;
      }

      const existingStates = await prisma.googleSheetRowState.findMany({
        where: { config_id: config.id },
      });
      const stateMap = new Map(existingStates.map((s) => [s.sync_key, s]));

      const { mapping: defaultMapping, defaultCsId: fallbackDefaultCsId } = await this.buildDefaultCvhtMapping();
      const configuredMapping =
        config.cvht_mapping && typeof config.cvht_mapping === 'object'
          ? (config.cvht_mapping as Record<string, number>)
          : {};
      const cvhtToCsId: Record<string, number> = {
        ...defaultMapping,
        ...configuredMapping,
      };
      const effectiveDefaultCsId = config.default_cs_id || fallbackDefaultCsId;

      // Create Run record
      const run = await prisma.googleSheetSyncRun.create({
        data: {
          config_id: config.id,
          config_code: config.code,
          config_name: config.name,
          flow_type: flowType,
          program_type: programType,
          trigger_type: triggerType,
          status: 'SUCCESS',
          total_rows: parsedRows.length,
          triggered_by_id: options?.actorId || null,
        },
      });

      let unchangedRows = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let failedCount = 0;

      for (const row of parsedRows) {
        if (row.studyReportUrl && this.extractSpreadsheetId(row.studyReportUrl)) {
          await this.autoUpsertStudyReportConfig(
            {
              externalId: row.externalId,
              studentName: row.fullName,
              classCode: row.classCode || row.className,
              packageCode: row.packageCode,
              programType: row.programType,
              studyReportUrl: row.studyReportUrl,
            },
            effectiveDefaultCsId
          );
        }

        // For KAIWA_CARE (1.Chăm sóc), skip students who do not exist on Web DB or have no Kaiwa enrollment
        if (row.isKaiwaCareOnly) {
          const existingStu = await prisma.student.findUnique({
            where: { external_id: row.externalId },
            include: {
              enrollments: {
                where: { program_type: 'KAIWA' },
                select: { id: true },
              },
            },
          });
          if (!existingStu || existingStu.enrollments.length === 0) {
            continue;
          }
        }

        const rowHash = this.sha256(JSON.stringify(row));
        const prevState = stateMap.get(row.syncKey);

        if (!forceFullSync && prevState && prevState.row_hash === rowHash) {
          unchangedRows++;
          continue;
        }

        try {
          const existedBefore = Boolean(prevState?.enrollment_id);
          const item: SheetSyncPreviewItem = {
            itemKey: row.syncKey,
            rowNumber: row.rowNumber,
            externalId: row.externalId,
            studentName: row.fullName,
            classCode: row.classCode || row.className,
            programType: row.programType,
            entityType: 'StudentEnrollment',
            action: existedBefore ? 'UPDATE' : 'CREATE',
            defaultSelected: true,
            summaryText: `${existedBefore ? 'Cập nhật' : 'Thêm mới'} HV ${row.fullName} (${row.externalId})`,
            fieldDiffs: [],
            warnings: [],
            errors: [],
            _payload: { row },
          };

          const applied = await this.applyStudentEnrollmentItem(
            config,
            item,
            cvhtToCsId,
            effectiveDefaultCsId,
            options?.actorId
          );

          if (!applied.beforeSnapshot.existed) {
            createdCount++;
          } else {
            updatedCount++;
          }

          await prisma.googleSheetSyncRunItem.create({
            data: {
              run_id: run.id,
              row_number: row.rowNumber,
              external_id: row.externalId,
              student_name: row.fullName,
              class_code: row.classCode || row.className,
              entity_type: 'StudentEnrollment',
              entity_id: String(applied.enrollmentId),
              action: !applied.beforeSnapshot.existed ? 'CREATE' : 'UPDATE',
              status: 'APPLIED',
              summary_text: item.summaryText,
              before_snapshot: applied.beforeSnapshot as Prisma.InputJsonValue,
              after_snapshot: applied.afterSnapshot as Prisma.InputJsonValue,
            },
          });
        } catch (rowErr: any) {
          failedCount++;
          log.warn(`Failed to sync row ${row.rowNumber} (${row.syncKey})`, {
            error: rowErr?.message || String(rowErr),
          });
        }
      }

      const now = new Date();
      const durationMs = Math.max(1, Date.now() - startMs);
      const finalStatus =
        failedCount > 0
          ? createdCount + updatedCount > 0
            ? 'PARTIAL_FAILED'
            : 'FAILED'
          : 'SUCCESS';

      await prisma.googleSheetSyncRun.update({
        where: { id: run.id },
        data: {
          status: finalStatus,
          created_count: createdCount,
          updated_count: updatedCount,
          unchanged_count: unchangedRows,
          failed_count: failedCount,
          duration_ms: durationMs,
          completed_at: now,
        },
      });

      const result: SheetSyncResult = {
        runId: run.id,
        code: config.code,
        programType: config.program_type,
        flowType,
        skipped: false,
        totalRows: parsedRows.length,
        unchangedRows,
        createdCount,
        updatedCount,
        failedCount,
        byCvht,
        syncedAt: now.toISOString(),
        durationMs,
        triggerType,
        mode,
      };

      await prisma.googleSheetSyncConfig.update({
        where: { id: config.id },
        data: {
          ...(limit ? {} : { last_file_hash: failedCount === 0 ? fileHash : null }),
          last_synced_at: now,
          last_status: finalStatus,
          last_summary: result as unknown as Prisma.InputJsonValue,
          last_error: null,
        },
      });

      await prisma.auditLog
        ?.create?.({
          data: {
            user_id: options?.actorId || effectiveDefaultCsId || 1,
            action: 'GOOGLE_SHEET_SYNC',
            entity_type: 'GoogleSheetSyncConfig',
            entity_id: config.code,
            after_data: {
              ...result,
              name: config.name,
              status: finalStatus,
            } as unknown as Prisma.InputJsonValue,
          },
        })
        .catch(() => {});

      if (createdCount > 0 || updatedCount > 0 || failedCount > 0) {
        const uploaderId = options?.actorId || effectiveDefaultCsId;
        await prisma.importBatch
          .create({
            data: {
              uploaded_by_id: uploaderId,
              file_name: `[${config.code}] ${sourceLabel}`,
              import_type: ImportType.GOOGLE_SHEET_SYNC,
              total_rows: parsedRows.length,
              success_rows: createdCount + updatedCount,
              failed_rows: failedCount,
              status:
                failedCount > 0
                  ? createdCount + updatedCount > 0
                    ? ImportBatchStatus.PARTIAL_FAILED
                    : ImportBatchStatus.FAILED
                  : ImportBatchStatus.COMPLETED,
              completed_at: now,
            },
          })
          .catch(() => {});
      }

      return result;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      await prisma.googleSheetSyncConfig.update({
        where: { id: config.id },
        data: {
          last_status: 'FAILED',
          last_error: errMsg,
        },
      });
      throw err;
    }
  }

  public async syncAll(options?: { forceFullSync?: boolean; limit?: number; actorId?: number; flowType?: string }) {
    await this.ensureDefaultConfigs();
    const sourceTypeMap = await this.getSourceTypeMap();
    const configs = await prisma.googleSheetSyncConfig.findMany({
      orderBy: { id: 'asc' },
    });

    const readyConfigs = configs.filter((cfg) => {
      if (options?.flowType && options.flowType !== 'ALL' && cfg.flow_type !== options.flowType) {
        return false;
      }
      // Keep backward compatibility for JLPT & KAIWA master configs
      if (!options?.flowType && (cfg.code === 'JLPT' || cfg.code === 'KAIWA')) {
        return this.isConfigReady(cfg, sourceTypeMap);
      }
      return cfg.enabled && this.isConfigReady(cfg, sourceTypeMap);
    });

    if (readyConfigs.length === 0) {
      throw new AppError(400, 'Chưa có nguồn đồng bộ nào được cấu hình đủ dữ liệu');
    }

    const results: SheetSyncResult[] = [];
    for (const cfg of readyConfigs) {
      const res = await this.syncConfigByCode(cfg.code, options);
      results.push(res);
    }
    return { results };
  }

  /* ==========================================================================
   * HISTORY, RUN DETAILS & ROLLBACK
   * ========================================================================== */

  public async getSyncHistory(
    query: {
      configId?: number;
      code?: string;
      flowType?: string;
      programType?: string;
      triggerType?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
      search?: string;
      limit?: number;
      page?: number;
    } = {}
  ): Promise<{
    stats: {
      todayTotal: number;
      todaySuccess: number;
      todayFailed: number;
      lastRunTime: string | null;
    };
    items: SheetSyncHistoryItem[];
    total: number;
  }> {
    await this.ensureDefaultConfigs();

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const filterCode = query.code && query.code !== 'ALL' ? String(query.code).toUpperCase() : null;
    const filterFlow = query.flowType && query.flowType !== 'ALL' ? String(query.flowType).toUpperCase() : null;
    const filterProg = query.programType && query.programType !== 'ALL' ? String(query.programType).toUpperCase() : null;
    const filterTrigger = query.triggerType && query.triggerType !== 'ALL' ? String(query.triggerType).toUpperCase() : null;
    const filterStatus = query.status && query.status !== 'ALL' ? String(query.status).toUpperCase() : null;
    const fromDateStr = query.fromDate ? String(query.fromDate).slice(0, 10) : null;
    const toDateStr = query.toDate ? String(query.toDate).slice(0, 10) : null;
    const searchLower = query.search ? query.search.trim().toLowerCase() : '';

    const runs = await prisma.googleSheetSyncRun.findMany({
      where: {
        ...(query.configId ? { config_id: Number(query.configId) } : {}),
      },
      orderBy: { started_at: 'desc' },
      take: 300,
    });

    const items: SheetSyncHistoryItem[] = [];
    for (const r of runs) {
      const syncedAt = (r.completed_at || r.started_at).toISOString();
      const durationMs = r.duration_ms || 500;
      const durationSec = Math.max(1, Math.round(durationMs / 1000));

      items.push({
        id: r.id,
        runId: r.id,
        configId: r.config_id,
        code: r.config_code,
        name: r.config_name,
        flowType: r.flow_type || 'STUDENT_MASTER',
        programType: r.program_type,
        status: (r.status as any) || 'SUCCESS',
        triggerType: r.trigger_type === 'AUTO' ? 'AUTO' : 'MANUAL',
        mode: 'DELTA',
        syncYear: r.sync_year,
        skipped: false,
        reason: null,
        totalRows: r.total_rows,
        unchangedRows: r.unchanged_count,
        createdCount: r.created_count,
        updatedCount: r.updated_count,
        conflictCount: r.conflict_count,
        failedCount: r.failed_count,
        rolledBackCount: r.rolled_back_count,
        byCvht: {},
        durationMs,
        durationSec,
        syncedAt,
        createdAt: r.started_at.toISOString(),
        completedAt: r.completed_at ? r.completed_at.toISOString() : null,
        rolledBackAt: r.rolled_back_at ? r.rolled_back_at.toISOString() : null,
        error: r.error_message || null,
      });
    }

    const now = new Date();
    const todayPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let todayTotal = 0;
    let todaySuccess = 0;
    let todayFailed = 0;
    let latestIso: string | null = null;

    for (const it of items) {
      if (!latestIso || it.syncedAt > latestIso) latestIso = it.syncedAt;
      const d = new Date(it.syncedAt);
      const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (dayStr === todayPrefix) {
        todayTotal++;
        if (it.status === 'FAILED') todayFailed++;
        else todaySuccess++;
      }
    }

    let lastRunTime: string | null = null;
    if (latestIso) {
      const ld = new Date(latestIso);
      lastRunTime = Number.isNaN(ld.getTime())
        ? latestIso
        : `${String(ld.getHours()).padStart(2, '0')}:${String(ld.getMinutes()).padStart(2, '0')}`;
    }

    const filtered = items.filter((it) => {
      if (filterCode && it.code.toUpperCase() !== filterCode && it.programType.toUpperCase() !== filterCode) return false;
      if (filterFlow && it.flowType.toUpperCase() !== filterFlow) return false;
      if (filterProg && it.programType.toUpperCase() !== filterProg) return false;
      if (filterTrigger && it.triggerType.toUpperCase() !== filterTrigger) return false;
      if (filterStatus && it.status.toUpperCase() !== filterStatus) return false;
      if (fromDateStr || toDateStr) {
        const d = new Date(it.syncedAt);
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (fromDateStr && dayKey < fromDateStr) return false;
        if (toDateStr && dayKey > toDateStr) return false;
      }
      if (searchLower) {
        const hay = `${it.code} ${it.name} ${it.flowType} ${it.programType}`.toLowerCase();
        if (!hay.includes(searchLower)) return false;
      }
      return true;
    });

    return {
      stats: {
        todayTotal: todayTotal || items.length,
        todaySuccess: todayTotal ? todaySuccess : items.filter((i) => i.status !== 'FAILED').length,
        todayFailed: todayTotal ? todayFailed : items.filter((i) => i.status === 'FAILED').length,
        lastRunTime,
      },
      items: filtered.slice(0, limit),
      total: filtered.length,
    };
  }

  /**
   * GET /api/v1/imports/sheet-sync/history/:runId
   */
  public async getSyncRunDetail(
    runId: number,
    query?: { action?: string; status?: string; search?: string }
  ) {
    await this.ensureSchema();
    const run = await prisma.googleSheetSyncRun.findUnique({
      where: { id: runId },
      include: {
        items: {
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!run) {
      throw new AppError(404, `Không tìm thấy phiên đồng bộ #${runId}`);
    }

    const statsByEntity: Record<string, { created: number; updated: number; failed: number; rolledBack: number }> = {};

    const actionFilter = query?.action && query.action !== 'ALL' ? query.action.toUpperCase() : null;
    const statusFilter = query?.status && query.status !== 'ALL' ? query.status.toUpperCase() : null;
    const searchLower = query?.search ? query.search.trim().toLowerCase() : '';

    const enrichedItems = [];

    for (const it of run.items) {
      if (!statsByEntity[it.entity_type]) {
        statsByEntity[it.entity_type] = { created: 0, updated: 0, failed: 0, rolledBack: 0 };
      }
      if (it.status === 'ROLLED_BACK') statsByEntity[it.entity_type].rolledBack++;
      else if (it.status === 'FAILED') statsByEntity[it.entity_type].failed++;
      else if (it.action === 'CREATE') statsByEntity[it.entity_type].created++;
      else if (it.action === 'UPDATE' || it.action === 'CONFLICT') statsByEntity[it.entity_type].updated++;

      if (actionFilter && it.action.toUpperCase() !== actionFilter) continue;
      if (statusFilter && it.status.toUpperCase() !== statusFilter) continue;
      if (searchLower) {
        const hay = [it.external_id, it.student_name, it.class_code, it.summary_text]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(searchLower)) continue;
      }

      const conflictCheck = await this.checkItemPostSyncConflict(it);
      const rawDiffs = Array.isArray(it.field_diffs) ? (it.field_diffs as any[]) : [];
      const mappedDiffs = rawDiffs.map((fd) => ({
        ...fd,
        label: fd.label || fd.fieldLabel || fd.field,
        fieldLabel: fd.fieldLabel || fd.label || fd.field,
      }));
      const effectiveStatus =
        it.status === 'APPLIED' && conflictCheck.hasConflict ? 'CONFLICT_MODIFIED' : it.status;

      enrichedItems.push({
        id: it.id,
        rowNumber: it.row_number || 1,
        externalId: it.external_id || '',
        studentName: it.student_name || '',
        fullName: it.student_name || '',
        classCode: it.class_code,
        entityType: it.entity_type,
        entityId: it.entity_id,
        action: it.action === 'INVALID' ? 'ERROR' : it.action,
        status: effectiveStatus,
        summaryText: it.summary_text,
        fieldDiffs: mappedDiffs,
        warnings: Array.isArray(it.warnings) ? it.warnings : [],
        errorMessage: it.error_message,
        rolledBackAt: it.rolled_back_at ? it.rolled_back_at.toISOString() : null,
        hasPostSyncConflict: conflictCheck.hasConflict,
        postSyncConflictReason: conflictCheck.reason,
        conflictReason: conflictCheck.reason,
        currentWebValueSummary: conflictCheck.reason,
      });
    }

    const remainingAppliedCount = run.items.filter((i) => i.status === 'APPLIED').length;

    return {
      run: {
        id: run.id,
        configId: run.config_id,
        configCode: run.config_code,
        code: run.config_code,
        configName: run.config_name,
        name: run.config_name,
        flowType: run.flow_type,
        programType: run.program_type,
        triggerType: run.trigger_type,
        mode: 'DELTA',
        status: run.status,
        syncYear: run.sync_year,
        filterSnapshot: run.filter_snapshot,
        totalRows: run.total_rows,
        createdCount: run.created_count,
        updatedCount: run.updated_count,
        unchangedCount: run.unchanged_count,
        conflictCount: run.conflict_count,
        failedCount: run.failed_count,
        rolledBackCount: run.rolled_back_count,
        durationSec: Math.max(1, Math.round((run.duration_ms || 500) / 1000)),
        errorMessage: run.error_message,
        error: run.error_message,
        startedAt: run.started_at.toISOString(),
        createdAt: run.started_at.toISOString(),
        completedAt: run.completed_at ? run.completed_at.toISOString() : null,
        rolledBackAt: run.rolled_back_at ? run.rolled_back_at.toISOString() : null,
      },
      summary: {
        totalRowsScanned: run.total_rows,
        createdCount: run.created_count,
        updatedCount: run.updated_count,
        failedOrSkippedCount: run.failed_count + run.conflict_count,
        rolledBackCount: run.rolled_back_count,
        remainingAppliedCount,
      },
      statsByEntity,
      items: enrichedItems,
    };
  }

  /**
   * Check whether a RunItem's target record was manually modified on Web after the sync run completed
   */
  private async checkItemPostSyncConflict(item: any): Promise<{ hasConflict: boolean; reason: string | null }> {
    if (item.status !== 'APPLIED' || !item.after_snapshot) {
      return { hasConflict: false, reason: null };
    }
    const after = item.after_snapshot as Record<string, any>;

    try {
      if (item.entity_type === 'StudentEnrollment' && after.enrollmentId) {
        const enr = await prisma.enrollment.findUnique({
          where: { id: Number(after.enrollmentId) },
        });
        if (!enr) return { hasConflict: false, reason: null };
        const expected = after.enrollmentData || {};
        if (expected.status && enr.status !== expected.status) {
          return {
            hasConflict: true,
            reason: `Trạng thái học trên Web hiện tại (${enr.status}) đã bị chỉnh sửa khác với lúc đồng bộ (${expected.status})`,
          };
        }
        if (
          expected.exchange_info !== undefined &&
          (enr.exchange_info || '') !== (expected.exchange_info || '')
        ) {
          return {
            hasConflict: true,
            reason: 'Thông tin trao đổi với HV trên Web đã được cập nhật thủ công sau phiên đồng bộ',
          };
        }
      } else if (item.entity_type === 'Attendance' && Array.isArray(after.records)) {
        for (const rec of after.records) {
          if (!rec.attendanceId) continue;
          const att = await prisma.attendance.findUnique({ where: { id: Number(rec.attendanceId) } });
          if (!att) continue;
          if (after.flowType === 'CSKH_ATTENDANCE' && att.cs_status !== rec.cs_status) {
            return {
              hasConflict: true,
              reason: `Điểm danh ngày ${rec.date} đã được sửa trên Web (${att.cs_status}) sau phiên đồng bộ`,
            };
          }
          if (after.flowType === 'TEACHER_ATTENDANCE' && att.teacher_status !== rec.teacher_status) {
            return {
              hasConflict: true,
              reason: `Điểm danh Giáo viên ngày ${rec.date} đã được sửa trên Web (${att.teacher_status}) sau phiên đồng bộ`,
            };
          }
        }
      } else if (item.entity_type === 'StudyReport' && after.enrollmentId) {
        const enr = await prisma.enrollment.findUnique({
          where: { id: Number(after.enrollmentId) },
        });
        if (enr) {
          const curMeta = (enr.program_metadata || {}) as Record<string, any>;
          if (JSON.stringify(curMeta.study_report || null) !== JSON.stringify(after.study_report || null)) {
            return {
              hasConflict: true,
              reason: 'Báo cáo học tập trên Web đã được chỉnh sửa sau thời điểm đồng bộ',
            };
          }
        }
      }
    } catch {
      // Ignore conflict check errors
    }

    return { hasConflict: false, reason: null };
  }

  /**
   * POST /api/v1/imports/sheet-sync/history/:runId/rollback
   */
  public async rollbackSyncRun(
    runId: number,
    options?: {
      itemIds?: number[];
      forceOverwriteConflicts?: boolean;
      actorId?: number;
    }
  ) {
    await this.ensureSchema();
    const run = await prisma.googleSheetSyncRun.findUnique({
      where: { id: runId },
      include: { items: true },
    });
    if (!run) {
      throw new AppError(404, `Không tìm thấy phiên đồng bộ #${runId}`);
    }

    const wantedIds =
      Array.isArray(options?.itemIds) && options!.itemIds.length > 0
        ? new Set(options!.itemIds.map(Number))
        : null;

    const targetItems = run.items.filter(
      (it) => it.status === 'APPLIED' && (!wantedIds || wantedIds.has(it.id))
    );

    if (targetItems.length === 0) {
      throw new AppError(400, 'Không có bản ghi nào ở trạng thái APPLIED để hoàn tác (Rollback)');
    }

    // Step 1: Check for manual edits after sync if forceOverwriteConflicts !== true
    if (!options?.forceOverwriteConflicts) {
      const conflicts: Array<Record<string, any>> = [];
      for (const it of targetItems) {
        const check = await this.checkItemPostSyncConflict(it);
        if (check.hasConflict && check.reason) {
          const firstDiff = Array.isArray(it.field_diffs) && (it.field_diffs as any[]).length > 0
            ? (it.field_diffs as any[])[0]
            : null;
          conflicts.push({
            itemId: it.id,
            changeId: it.id,
            rowNumber: it.row_number || 1,
            externalId: it.external_id || '',
            studentName: it.student_name || '',
            fullName: it.student_name || '',
            fieldLabel: firstDiff?.label || firstDiff?.fieldLabel || it.entity_type,
            beforeSyncValue: firstDiff?.before ?? '(Trước đồng bộ)',
            syncedValue: firstDiff?.after ?? it.summary_text ?? '(Giá trị lúc đồng bộ)',
            currentWebValue: '(Đã chỉnh sửa trên Web)',
            reason: check.reason,
            conflictMessage: check.reason,
          });
        }
      }
      if (conflicts.length > 0) {
        return {
          runId: run.id,
          status: 'CONFLICT_DETECTED',
          conflictDetected: true,
          rolledBackCount: 0,
          skippedConflictCount: conflicts.length,
          conflicts,
          message: `Phát hiện ${conflicts.length} dòng dữ liệu đã được chỉnh sửa trên Web sau thời điểm đồng bộ. Bạn muốn giữ dữ liệu mới trên Web hay ép khôi phục về dữ liệu cũ?`,
        };
      }
    }

    // Step 2: Execute Rollback
    let rolledBackNow = 0;
    const now = new Date();

    for (const it of targetItems) {
      const before = (it.before_snapshot || {}) as Record<string, any>;
      const after = (it.after_snapshot || {}) as Record<string, any>;

      if (it.entity_type === 'StudentEnrollment') {
        if (before.existed && before.enrollmentId) {
          // Restore Enrollment & Student to before_snapshot
          if (before.studentData && before.studentId) {
            await prisma.student
              .update({
                where: { id: Number(before.studentId) },
                data: before.studentData,
              })
              .catch(() => {});
          }
          if (before.enrollmentData) {
            await prisma.enrollment
              .update({
                where: { id: Number(before.enrollmentId) },
                data: {
                  ...before.enrollmentData,
                  program_metadata: (before.enrollmentData.program_metadata ?? Prisma.JsonNull) as any,
                },
              })
              .catch(() => {});
          }
        } else if (after.enrollmentId) {
          // Was newly created -> mark CANCELLED and remove row_state so next sync can re-evaluate
          await prisma.enrollment
            .update({
              where: { id: Number(after.enrollmentId) },
              data: { status: EnrollmentStatus.CANCELLED },
            })
            .catch(() => {});
        }

        if (after.syncKey) {
          await prisma.googleSheetRowState
            .deleteMany({
              where: { config_id: run.config_id, sync_key: String(after.syncKey) },
            })
            .catch(() => {});
        }
      } else if (it.entity_type === 'Attendance') {
        const records = Array.isArray(before.records) ? before.records : [];
        const afterRecords = Array.isArray(after.records) ? after.records : [];
        const afterByDate = new Map(afterRecords.map((r: any) => [r.date, r]));

        for (const rec of records) {
          const matchedAfter = afterByDate.get(rec.date);
          const attId = rec.attendanceId || matchedAfter?.attendanceId;
          if (!attId) continue;

          if (!rec.existed) {
            // Did not exist before this sync run -> delete if other side is empty, or clear only this flow's side
            const curAtt = await prisma.attendance.findUnique({ where: { id: Number(attId) } });
            if (curAtt) {
              if (before.flowType === 'CSKH_ATTENDANCE') {
                if (!curAtt.teacher_status) {
                  await prisma.attendance.delete({ where: { id: curAtt.id } }).catch(() => {});
                } else {
                  await prisma.attendance.update({
                    where: { id: curAtt.id },
                    data: {
                      cs_status: null,
                      cs_raw_value: null,
                      status: curAtt.teacher_status,
                      reconciliation_state: ReconciliationState.PENDING_CS,
                    },
                  });
                }
              } else {
                if (!curAtt.cs_status) {
                  await prisma.attendance.delete({ where: { id: curAtt.id } }).catch(() => {});
                } else {
                  await prisma.attendance.update({
                    where: { id: curAtt.id },
                    data: {
                      teacher_status: null,
                      teacher_raw_value: null,
                      lesson_topic: null,
                      status: curAtt.cs_status,
                      reconciliation_state: ReconciliationState.PENDING_TEACHER,
                    },
                  });
                }
              }
            }
          } else {
            // Restore previous attendance fields
            await prisma.attendance
              .update({
                where: { id: Number(attId) },
                data: {
                  status: rec.status,
                  cs_status: rec.cs_status ?? null,
                  cs_raw_value: rec.cs_raw_value ?? null,
                  teacher_status: rec.teacher_status ?? null,
                  teacher_raw_value: rec.teacher_raw_value ?? null,
                  lesson_topic: rec.lesson_topic ?? null,
                  reconciliation_state: rec.reconciliation_state || ReconciliationState.PENDING_CS,
                },
              })
              .catch(() => {});
          }
        }
      } else if (it.entity_type === 'StudyReport' && before.enrollmentId) {
        const enr = await prisma.enrollment.findUnique({
          where: { id: Number(before.enrollmentId) },
        });
        if (enr) {
          const curMeta =
            enr.program_metadata && typeof enr.program_metadata === 'object'
              ? { ...(enr.program_metadata as Record<string, any>) }
              : {};
          if (before.study_report === null || before.study_report === undefined) {
            delete curMeta.study_report;
          } else {
            curMeta.study_report = before.study_report;
          }
          if ('jlpt_chuyen_can_overrides' in before) {
            if (before.jlpt_chuyen_can_overrides === null || before.jlpt_chuyen_can_overrides === undefined) {
              delete curMeta.jlpt_chuyen_can_overrides;
            } else {
              curMeta.jlpt_chuyen_can_overrides = before.jlpt_chuyen_can_overrides;
            }
          }
          if ('jlpt_chuyen_can' in before) {
            if (before.jlpt_chuyen_can === null || before.jlpt_chuyen_can === undefined) {
              delete curMeta.jlpt_chuyen_can;
            } else {
              curMeta.jlpt_chuyen_can = before.jlpt_chuyen_can;
            }
          }
          if ('course_track' in before) {
            if (before.course_track === null || before.course_track === undefined) {
              delete curMeta.course_track;
            } else {
              curMeta.course_track = before.course_track;
            }
          }
          await prisma.enrollment.update({
            where: { id: enr.id },
            data: {
              program_metadata: curMeta as Prisma.InputJsonValue,
              exchange_info: before.exchange_info ?? null,
            },
          });
        }
      }

      await prisma.googleSheetSyncRunItem.update({
        where: { id: it.id },
        data: {
          status: 'ROLLED_BACK',
          rolled_back_at: now,
          rolled_back_by_id: options?.actorId || null,
        },
      });
      rolledBackNow++;
    }

    const allItemsAfter = await prisma.googleSheetSyncRunItem.findMany({
      where: { run_id: run.id },
    });
    const totalRolledBack = allItemsAfter.filter((x) => x.status === 'ROLLED_BACK').length;
    const remainingApplied = allItemsAfter.filter((x) => x.status === 'APPLIED').length;
    const nextRunStatus = remainingApplied === 0 ? 'ROLLED_BACK' : 'PARTIAL_ROLLED_BACK';

    const updatedRun = await prisma.googleSheetSyncRun.update({
      where: { id: run.id },
      data: {
        status: nextRunStatus,
        rolled_back_count: totalRolledBack,
        rolled_back_at: now,
      },
    });

    // Clear last_file_hash on config so next sync won't skip
    await prisma.googleSheetSyncConfig
      .update({
        where: { id: run.config_id },
        data: { last_file_hash: null },
      })
      .catch(() => {});

    return {
      status: nextRunStatus,
      conflictDetected: false,
      rolledBackCount: rolledBackNow,
      totalRolledBackCount: totalRolledBack,
      runId: updatedRun.id,
      message: `Đã hoàn tác thành công ${rolledBackNow} dòng dữ liệu về trạng thái trước đồng bộ.`,
    };
  }

  /**
   * Process due configs for background cron scheduler (Auto Sync only runs on GOOGLE_SHEET configs with enabled=true)
   */
  public async processDueSyncConfigs(): Promise<void> {
    await this.ensureDefaultConfigs();
    const sourceTypeMap = await this.getSourceTypeMap();
    const configs = await prisma.googleSheetSyncConfig.findMany({
      where: { enabled: true },
    });

    const now = Date.now();
    for (const cfg of configs) {
      if (cfg.last_status === 'SYNCING') continue;
      const effectiveSource = this.resolveConfigSourceType(cfg, sourceTypeMap);
      if (effectiveSource !== 'GOOGLE_SHEET' || !this.isConfigReady(cfg, sourceTypeMap)) {
        await prisma.googleSheetSyncConfig
          .update({
            where: { id: cfg.id },
            data: { enabled: false },
          })
          .catch(() => {});
        continue;
      }
      const intervalMs = Math.max(1, cfg.sync_interval_minutes || 30) * 60 * 1000;
      const lastSyncMs = cfg.last_synced_at ? cfg.last_synced_at.getTime() : 0;
      if (now - lastSyncMs >= intervalMs) {
        try {
          await this.syncConfigByCode(cfg.code, { forceFullSync: false, triggerType: 'AUTO' });
        } catch (err: any) {
          log.warn(`Scheduled Google Sheet sync failed for ${cfg.code}`, {
            error: err?.message || String(err),
          });
        }
      }
    }
  }
}

const CRON_SCHEDULE = '*/5 * * * *'; // Every 5 minutes
let syncCronTask: ReturnType<typeof cron.schedule> | null = null;
let isSyncCycleRunning = false;
const sheetSyncServiceInstance = new SheetSyncService();

export function startGoogleSheetSyncScheduler(): void {
  if (syncCronTask) {
    log.info('Google Sheet sync scheduler already running');
    return;
  }

  syncCronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (isSyncCycleRunning) return;
    isSyncCycleRunning = true;
    try {
      await sheetSyncServiceInstance.processDueSyncConfigs();
    } catch (err: any) {
      log.error('Unexpected error in Google Sheet sync scheduler', {
        error: err?.message || String(err),
      });
    } finally {
      isSyncCycleRunning = false;
    }
  });

  log.info(`Google Sheet sync scheduler started, schedule="${CRON_SCHEDULE}"`);
}

export function stopGoogleSheetSyncScheduler(): void {
  if (syncCronTask) {
    syncCronTask.stop();
    syncCronTask = null;
    log.info('Google Sheet sync scheduler stopped');
  }
}
