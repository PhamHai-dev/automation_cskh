import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import cron from 'node-cron';
import {
  AttendanceSourceType,
  EnrollmentClassStatus,
  ImportBatchStatus,
  ImportType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';
import {
  NormalizedSheetRow,
  loadOptimizedWorkbook,
  mapClassModelType,
  parseJlptSheetRows,
  parseKaiwaSheetRows,
} from './sheet-sync.parser';

const log = createLogger('SheetSyncService');

export interface SheetSyncResult {
  code: string;
  programType: string;
  skipped: boolean;
  reason?: string;
  totalRows: number;
  unchangedRows: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  byCvht: Record<string, number>;
  syncedAt: string;
}

export interface UpdateSyncConfigDTO {
  spreadsheet_url?: string | null;
  local_file_path?: string | null;
  sheet_name?: string;
  setting_sheet_name?: string | null;
  cvht_mapping?: Record<string, number>;
  default_cs_id?: number | null;
  sync_interval_minutes?: number;
  enabled?: boolean;
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

const SERVICE_ACCOUNT_SETTING_KEY = 'GOOGLE_SERVICE_ACCOUNT_JSON';
let cachedAccessToken: { token: string; expiresAtMs: number; clientEmail: string } | null = null;

export class SheetSyncService {
  /**
   * Load Google Service Account credentials from DB (AppSetting) or Environment Variables
   */
  public async getServiceAccountKey(): Promise<{ key: ParsedServiceAccountKey | null; info: ServiceAccountInfo }> {
    // 1. Check AppSetting in DB first (configured via Admin UI)
    try {
      const setting = await prisma.appSetting.findUnique({
        where: { key: SERVICE_ACCOUNT_SETTING_KEY },
      });
      if (setting && setting.value && typeof setting.value === 'object') {
        const val = setting.value as Record<string, any>;
        if (val.client_email && val.private_key) {
          return {
            key: {
              client_email: String(val.client_email).trim(),
              private_key: String(val.private_key).replace(/\\n/g, '\n'),
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
      // Ignore DB lookup errors and fallback to env
    }

    // 2. Check GOOGLE_SERVICE_ACCOUNT_JSON_PATH
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

    // 3. Check GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
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

  /**
   * Save or clear Google Service Account JSON via Admin UI
   */
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

    await prisma.appSetting.upsert({
      where: { key: SERVICE_ACCOUNT_SETTING_KEY },
      update: {
        value: parsed as Prisma.InputJsonValue,
        updated_by_id: userId || null,
      },
      create: {
        key: SERVICE_ACCOUNT_SETTING_KEY,
        value: parsed as Prisma.InputJsonValue,
        updated_by_id: userId || null,
      },
    });

    const { info } = await this.getServiceAccountKey();
    return info;
  }

  /**
   * Generate OAuth2 Bearer access_token from Service Account using native Node.js crypto RS256
   */
  private async getGoogleAccessToken(sa: ParsedServiceAccountKey): Promise<string> {
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
      scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
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
  /**
   * Compute SHA-256 hex digest of a Buffer or string
   */
  public sha256(data: Buffer | string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Extract Google Spreadsheet ID from URL
   */
  public extractSpreadsheetId(url?: string | null): string | null {
    if (!url) return null;
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  /**
   * Resolve default CVHT -> User ID mapping from DB users
   */
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

    // Also auto-backfill staff_code if missing on cskh1/2/3@gmail.com
    for (const code of ['CVHT01', 'CVHT02', 'CVHT03']) {
      const uid = mapping[code];
      if (uid) {
        const u = allUsers.find((x) => x.id === uid);
        if (u && !u.staff_code) {
          await prisma.user.update({
            where: { id: uid },
            data: { staff_code: code },
          }).catch(() => {});
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

  /**
   * Ensure default JLPT and KAIWA configs exist in DB
   */
  public async ensureDefaultConfigs() {
    const { mapping, defaultCsId } = await this.buildDefaultCvhtMapping();

    const existing = await prisma.googleSheetSyncConfig.findMany({
      orderBy: { id: 'asc' },
    });
    const byCode = new Map(existing.map((c) => [c.code.toUpperCase(), c]));

    if (!byCode.has('JLPT')) {
      await prisma.googleSheetSyncConfig.create({
        data: {
          code: 'JLPT',
          name: 'Dữ liệu Học viên JLPT',
          program_type: 'JLPT',
          local_file_path: 'docs/data/hoc_vien/hoc_vien_jlpt.xlsx',
          sheet_name: 'Data JLPT_Inhouse',
          setting_sheet_name: 'Setting',
          header_row: 2,
          cvht_mapping: mapping,
          default_cs_id: defaultCsId,
          sync_interval_minutes: 10,
          enabled: true,
          last_status: 'IDLE',
        },
      });
    }

    if (!byCode.has('KAIWA')) {
      await prisma.googleSheetSyncConfig.create({
        data: {
          code: 'KAIWA',
          name: 'Dữ liệu Học viên Kaiwa',
          program_type: 'KAIWA',
          local_file_path: 'docs/data/hoc_vien/hoc_vien_kaiwa.xlsx',
          sheet_name: 'Tổng',
          setting_sheet_name: null,
          header_row: 2,
          cvht_mapping: mapping,
          default_cs_id: defaultCsId,
          sync_interval_minutes: 10,
          enabled: true,
          last_status: 'IDLE',
        },
      });
    }
  }

  /**
   * Get all sync configs + CS users + Service Account status for UI
   */
  public async getConfigs() {
    await this.ensureDefaultConfigs();
    const { csUsers, mapping, defaultCsId } = await this.buildDefaultCvhtMapping();
    const { info: serviceAccount } = await this.getServiceAccountKey();
    const configs = await prisma.googleSheetSyncConfig.findMany({
      orderBy: { id: 'asc' },
    });

    // Ensure cvht_mapping is populated if null
    for (const cfg of configs) {
      if (!cfg.cvht_mapping || Object.keys(cfg.cvht_mapping as object).length === 0) {
        const updated = await prisma.googleSheetSyncConfig.update({
          where: { id: cfg.id },
          data: {
            cvht_mapping: mapping,
            default_cs_id: cfg.default_cs_id || defaultCsId,
          },
        });
        Object.assign(cfg, updated);
      }
    }

    return { configs, csUsers, serviceAccount };
  }

  /**
   * Update a specific sync config by code ("JLPT" | "KAIWA")
   */
  public async updateConfig(code: string, dto: UpdateSyncConfigDTO) {
    await this.ensureDefaultConfigs();
    const upperCode = code.trim().toUpperCase();
    const existing = await prisma.googleSheetSyncConfig.findUnique({
      where: { code: upperCode },
    });
    if (!existing) {
      throw new AppError(404, `Không tìm thấy cấu hình đồng bộ cho mã [${upperCode}]`);
    }

    const spreadsheetId = dto.spreadsheet_url !== undefined
      ? this.extractSpreadsheetId(dto.spreadsheet_url)
      : existing.spreadsheet_id;

    return prisma.googleSheetSyncConfig.update({
      where: { id: existing.id },
      data: {
        ...(dto.spreadsheet_url !== undefined ? { spreadsheet_url: dto.spreadsheet_url, spreadsheet_id: spreadsheetId } : {}),
        ...(dto.local_file_path !== undefined ? { local_file_path: dto.local_file_path } : {}),
        ...(dto.sheet_name !== undefined ? { sheet_name: dto.sheet_name } : {}),
        ...(dto.setting_sheet_name !== undefined ? { setting_sheet_name: dto.setting_sheet_name } : {}),
        ...(dto.cvht_mapping !== undefined ? { cvht_mapping: dto.cvht_mapping as Prisma.InputJsonValue } : {}),
        ...(dto.default_cs_id !== undefined ? { default_cs_id: dto.default_cs_id } : {}),
        ...(dto.sync_interval_minutes !== undefined ? { sync_interval_minutes: dto.sync_interval_minutes } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
  }

  /**
   * Load workbook buffer from Google Drive API (with Service Account for private sheets),
   * public export URL, or local file path fallback
   */
  private async loadWorkbookBuffer(config: {
    spreadsheet_url?: string | null;
    spreadsheet_id?: string | null;
    local_file_path?: string | null;
  }): Promise<{ buffer: Buffer; sourceLabel: string }> {
    const sheetId = config.spreadsheet_id || this.extractSpreadsheetId(config.spreadsheet_url);
    if (sheetId) {
      const { key: saKey } = await this.getServiceAccountKey();

      // 1. Authenticated download via Google Service Account (works for Restricted / Private sheets)
      if (saKey) {
        const accessToken = await this.getGoogleAccessToken(saKey);
        const authHeaders = { Authorization: `Bearer ${accessToken}` };
        const driveUrls = [
          `https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`,
          `https://www.googleapis.com/drive/v3/files/${sheetId}?alt=media&supportsAllDrives=true`,
        ];

        let lastStatus = 0;
        for (const url of driveUrls) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          try {
            const resp = await fetch(url, { headers: authHeaders, signal: controller.signal });
            clearTimeout(timeout);
            lastStatus = resp.status;
            if (resp.ok) {
              const arrayBuf = await resp.arrayBuffer();
              const buf = Buffer.from(arrayBuf);
              if (buf.length > 100 && buf[0] === 0x50 && buf[1] === 0x4b) {
                return { buffer: buf, sourceLabel: `GoogleSheet:${sheetId}` };
              }
            }
          } catch (err) {
            clearTimeout(timeout);
            throw err;
          }
        }

        if (lastStatus === 403 || lastStatus === 404) {
          throw new AppError(
            403,
            `File Google Sheet (${sheetId}) đang khóa riêng tư và chưa cấp quyền cho Service Account. Vui lòng mở Google Sheet -> bấm nút Chia sẻ (Share) -> thêm email "${saKey.client_email}" với quyền Người xem (Viewer).`
          );
        }

        throw new AppError(
          400,
          `Không thể tải dữ liệu từ Google Sheet (${sheetId}) qua Service Account (HTTP ${lastStatus}).`
        );
      }

      // 2. Unauthenticated public export URL (only works if "Anyone with the link can view" is enabled)
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
    }

    if (!config.local_file_path) {
      throw new AppError(400, 'Chưa cấu hình đường dẫn file local hoặc Google Sheet URL hợp lệ');
    }

    const candidates = [
      path.resolve(process.cwd(), config.local_file_path),
      path.resolve(process.cwd(), '..', config.local_file_path),
      path.resolve(__dirname, '../../../../', config.local_file_path),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const buffer = fs.readFileSync(candidate);
        return { buffer, sourceLabel: path.basename(candidate) };
      }
    }

    throw new AppError(404, `Không tìm thấy file dữ liệu nguồn tại: ${config.local_file_path}`);
  }

  /**
   * Synchronize a single config ("JLPT" | "KAIWA") with SHA-256 Row Hash Diffing
   */
  public async syncConfigByCode(
    code: string,
    options?: { forceFullSync?: boolean; limit?: number; actorId?: number }
  ): Promise<SheetSyncResult> {
    await this.ensureDefaultConfigs();
    const upperCode = code.trim().toUpperCase();
    const config = await prisma.googleSheetSyncConfig.findUnique({
      where: { code: upperCode },
    });
    if (!config) {
      throw new AppError(404, `Không tìm thấy cấu hình đồng bộ [${upperCode}]`);
    }

    const forceFullSync = Boolean(options?.forceFullSync);
    const limit = options?.limit;

    await prisma.googleSheetSyncConfig.update({
      where: { id: config.id },
      data: { last_status: 'SYNCING', last_error: null },
    });

    try {
      const { buffer, sourceLabel } = await this.loadWorkbookBuffer(config);
      const fileHash = this.sha256(buffer);

      // Fast path: if file hash hasn't changed and not forceFullSync and no custom limit
      if (!forceFullSync && !limit && config.last_file_hash === fileHash && config.last_summary) {
        const prevSummary = config.last_summary as Record<string, any>;
        const totalRows = Number(prevSummary.totalRows) || 0;
        const byCvht = (prevSummary.byCvht as Record<string, number>) || {};
        const nowIso = new Date().toISOString();

        await prisma.googleSheetSyncConfig.update({
          where: { id: config.id },
          data: {
            last_status: 'SUCCESS',
            last_synced_at: new Date(),
          },
        });

        return {
          code: config.code,
          programType: config.program_type,
          skipped: true,
          reason: 'NO_FILE_CHANGE',
          totalRows,
          unchangedRows: totalRows,
          createdCount: 0,
          updatedCount: 0,
          failedCount: 0,
          byCvht,
          syncedAt: nowIso,
        };
      }

      const programType = (config.program_type?.toUpperCase() === 'JLPT' ? 'JLPT' : 'KAIWA') as 'JLPT' | 'KAIWA';
      const targetSheets = programType === 'JLPT'
        ? [config.sheet_name || 'Data JLPT_Inhouse', config.setting_sheet_name || 'Setting', 'Điểm học tập']
        : [config.sheet_name || 'Tổng'];
      const workbook = await loadOptimizedWorkbook(buffer, targetSheets);

      const parsedRows: NormalizedSheetRow[] = programType === 'JLPT'
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

      // Load existing row states in 1 query
      const existingStates = await prisma.googleSheetRowState.findMany({
        where: { config_id: config.id },
      });
      const stateMap = new Map(existingStates.map((s) => [s.sync_key, s]));

      // Resolve CVHT -> user.id mapping
      const { mapping: defaultMapping, defaultCsId: fallbackDefaultCsId } = await this.buildDefaultCvhtMapping();
      const configuredMapping = (config.cvht_mapping && typeof config.cvht_mapping === 'object')
        ? (config.cvht_mapping as Record<string, number>)
        : {};
      const cvhtToCsId: Record<string, number> = {
        ...defaultMapping,
        ...configuredMapping,
      };
      const effectiveDefaultCsId = config.default_cs_id || fallbackDefaultCsId;

      // Preload caches to avoid N+1 queries
      const [allPackages, allSales, allTeachers, allClasses, allStudents, allEnrollments] = await Promise.all([
        prisma.package.findMany(),
        prisma.sale.findMany(),
        prisma.teacher.findMany(),
        prisma.class.findMany({
          include: {
            class_schedules: true,
            class_teachers: true,
          },
        }),
        prisma.student.findMany(),
        prisma.enrollment.findMany({
          include: {
            enrollment_classes: true,
            care_logs: true,
          },
        }),
      ]);

      const packageCache = new Map(allPackages.map((p) => [p.code.toUpperCase(), p]));
      const saleCache = new Map(allSales.map((s) => [s.code.toUpperCase(), s]));
      const teacherByCodeCache = new Map(allTeachers.map((t) => [t.code.toUpperCase(), t]));
      const teacherByNameCache = new Map(allTeachers.map((t) => [t.name.toUpperCase(), t]));
      const classCache = new Map<string, (typeof allClasses)[number]>();
      for (const cls of allClasses) {
        if (cls.class_code) classCache.set(cls.class_code.toUpperCase(), cls);
        if (cls.class_name) classCache.set(cls.class_name.toUpperCase(), cls);
      }
      const studentByExtId = new Map<string, (typeof allStudents)[number]>();
      for (const s of allStudents) {
        if (s.external_id) studentByExtId.set(s.external_id, s);
      }
      const enrollmentBySyncKey = new Map<string, (typeof allEnrollments)[number]>();
      const enrollmentByStudentAndPkg = new Map<string, (typeof allEnrollments)[number]>();
      for (const e of allEnrollments) {
        if (e.external_sync_key) enrollmentBySyncKey.set(e.external_sync_key, e);
        if (e.student_id && e.package_id) {
          enrollmentByStudentAndPkg.set(`${e.student_id}::${e.package_id}`, e);
        }
      }

      let unchangedRows = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let failedCount = 0;

      for (const row of parsedRows) {
        const rowHash = this.sha256(JSON.stringify(row));
        const prevState = stateMap.get(row.syncKey);

        if (!forceFullSync && prevState && prevState.row_hash === rowHash) {
          unchangedRows++;
          continue;
        }

        try {
          const targetCsId = (row.cvhtCode && cvhtToCsId[row.cvhtCode.toUpperCase()])
            ? cvhtToCsId[row.cvhtCode.toUpperCase()]
            : effectiveDefaultCsId;

          // 1. Ensure Package
          const pkgKey = row.packageCode.toUpperCase();
          let pkg = packageCache.get(pkgKey);
          if (!pkg) {
            pkg = await prisma.package.upsert({
              where: { code: row.packageCode },
              update: {},
              create: {
                code: row.packageCode,
                name: `Gói ${row.packageCode}`,
                default_total_sessions: row.totalSessions || 30,
                active: true,
              },
            });
            packageCache.set(pkgKey, pkg);
          }

          // 2. Ensure Sale
          let saleId: number | null = null;
          if (row.saleName) {
            const saleKey = row.saleName.toUpperCase();
            let sale = saleCache.get(saleKey);
            if (!sale) {
              sale = await prisma.sale.upsert({
                where: { code: row.saleName },
                update: {},
                create: {
                  code: row.saleName,
                  name: row.saleName,
                  active: true,
                },
              });
              saleCache.set(saleKey, sale);
            }
            saleId = sale.id;
          }

          // 3. Upsert Student
          let student = studentByExtId.get(row.externalId);
          const dobDate = row.dateOfBirth ? new Date(row.dateOfBirth) : null;
          if (!student) {
            student = await prisma.student.upsert({
              where: { external_id: row.externalId },
              update: {
                full_name: row.fullName,
                ...(row.gender ? { gender: row.gender } : {}),
                ...(row.phone ? { phone: row.phone } : {}),
                ...(row.email ? { email: row.email } : {}),
                ...(dobDate ? { date_of_birth: dobDate } : {}),
                ...(row.occupation ? { occupation: row.occupation } : {}),
              },
              create: {
                external_id: row.externalId,
                full_name: row.fullName,
                gender: row.gender,
                phone: row.phone,
                email: row.email,
                date_of_birth: dobDate,
                occupation: row.occupation,
                note: row.salesNote,
              },
            });
            studentByExtId.set(row.externalId, student);
          } else {
            student = await prisma.student.update({
              where: { id: student.id },
              data: {
                full_name: row.fullName || student.full_name,
                gender: row.gender ?? student.gender,
                phone: row.phone ?? student.phone,
                email: row.email ?? student.email,
                date_of_birth: dobDate ?? student.date_of_birth,
                occupation: row.occupation ?? student.occupation,
              },
            });
            studentByExtId.set(row.externalId, student);
          }

          // 4. Upsert Enrollment
          let existingEnrollment = enrollmentBySyncKey.get(row.syncKey);
          if (!existingEnrollment) {
            const fallbackCandidate = enrollmentByStudentAndPkg.get(`${student.id}::${pkg.id}`);
            if (fallbackCandidate && (!fallbackCandidate.external_sync_key || fallbackCandidate.external_sync_key === row.syncKey)) {
              existingEnrollment = fallbackCandidate;
            }
          }

          const paidAtDate = row.paidAt ? new Date(row.paidAt) : null;
          const startDateObj = row.startDate ? new Date(row.startDate) : null;
          const endDateObj = row.endDate ? new Date(row.endDate) : null;
          const handedOverObj = row.handedOverAt ? new Date(row.handedOverAt) : null;

          const enrollmentPayload = {
            external_id: row.externalId,
            external_sync_key: row.syncKey,
            program_type: row.programType,
            program_metadata: row.programMetadata as Prisma.InputJsonValue,
            student_id: student.id,
            package_id: pkg.id,
            cs_id: targetCsId,
            paid_at: paidAtDate,
            sale_id: saleId,
            sale_name: row.saleName,
            student_source_status: row.studentSourceStatus,
            course_content: row.courseContent,
            payment_status: row.paymentStatus,
            course_teacher_type: row.courseTeacherType,
            level: row.level,
            total_sessions: row.totalSessions,
            class_model: row.classModel,
            sales_note: row.salesNote,
            study_report_url: row.studyReportUrl,
            exchange_info: row.exchangeInfo,
            callback_note: row.callbackNote,
            hot_issue_note: row.hotIssueNote,
            post_course_care: row.postCourseCare,
            start_date: startDateObj,
            end_date: endDateObj,
            status: row.status,
            attended_previous_years: row.attendedPreviousYears,
            external_remaining_sessions: row.remainingSessions,
            handed_over_at: handedOverObj,
            external_synced_at: new Date(),
          };

          let enrollmentId: number;
          let isNewEnrollment = false;

          if (!existingEnrollment) {
            const createdEnr = await prisma.enrollment.create({
              data: enrollmentPayload,
              include: { enrollment_classes: true, care_logs: true },
            });
            enrollmentId = createdEnr.id;
            existingEnrollment = createdEnr;
            isNewEnrollment = true;
            createdCount++;
          } else {
            const updatedEnr = await prisma.enrollment.update({
              where: { id: existingEnrollment.id },
              data: enrollmentPayload,
              include: { enrollment_classes: true, care_logs: true },
            });
            enrollmentId = updatedEnr.id;
            existingEnrollment = updatedEnr;
            updatedCount++;
          }

          enrollmentBySyncKey.set(row.syncKey, existingEnrollment);
          enrollmentByStudentAndPkg.set(`${student.id}::${pkg.id}`, existingEnrollment);

          // 5. Class, Schedule, Teacher & EnrollmentClass
          if (row.className || row.classCode || row.schedulePattern) {
            const resolvedClassName = row.className || row.classCode || `Lớp ${row.fullName}`;
            const resolvedClassCode = row.classCode || resolvedClassName;
            const lookupKey = resolvedClassCode.toUpperCase();
            let cls = classCache.get(lookupKey) || classCache.get(resolvedClassName.toUpperCase());

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
                include: {
                  class_schedules: true,
                  class_teachers: true,
                },
              });
              classCache.set(lookupKey, cls);
              classCache.set(resolvedClassName.toUpperCase(), cls);
            }

            // Ensure schedule if provided
            if (row.schedulePattern && cls.class_schedules.length === 0) {
              const sched = await prisma.classSchedule.create({
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
              cls.class_schedules.push(sched);
            }

            // Ensure teacher if provided
            if (row.teacherName || row.teacherCode) {
              const tCodeRaw = (row.teacherCode || row.teacherName || '').trim();
              const tNameRaw = (row.teacherName || row.teacherCode || '').trim();
              const tKey = tCodeRaw.toUpperCase();
              let teacher = teacherByCodeCache.get(tKey) || teacherByNameCache.get(tNameRaw.toUpperCase());
              if (!teacher && tCodeRaw) {
                const safeCode = tCodeRaw.slice(0, 60);
                teacher = await prisma.teacher.upsert({
                  where: { code: safeCode },
                  update: {},
                  create: {
                    code: safeCode,
                    name: tNameRaw || safeCode,
                    active: true,
                  },
                });
                teacherByCodeCache.set(safeCode.toUpperCase(), teacher);
                teacherByNameCache.set(teacher.name.toUpperCase(), teacher);
              }
              if (teacher && !cls.class_teachers.some((ct) => ct.teacher_id === teacher!.id)) {
                const ct = await prisma.classTeacher.create({
                  data: {
                    class_id: cls.id,
                    teacher_id: teacher.id,
                    role: 'MAIN',
                    active: true,
                  },
                });
                cls.class_teachers.push(ct);
              }
            }

            // Ensure EnrollmentClass
            const hasEc = existingEnrollment.enrollment_classes.some((ec) => ec.class_id === cls!.id);
            if (!hasEc) {
              const nextSeq = existingEnrollment.enrollment_classes.length + 1;
              const ec = await prisma.enrollmentClass.create({
                data: {
                  enrollment_id: enrollmentId,
                  class_id: cls.id,
                  sequence_no: nextSeq,
                  start_date: startDateObj,
                  end_date: endDateObj,
                  status: EnrollmentClassStatus.ACTIVE,
                },
              });
              existingEnrollment.enrollment_classes.push(ec);
            }
          }

          // 6. Care Logs
          if (row.careLogs.length > 0) {
            const existingLogsBySession = new Map(
              existingEnrollment.care_logs
                .filter((cl) => cl.after_session_number !== null)
                .map((cl) => [cl.after_session_number!, cl])
            );

            for (const cl of row.careLogs) {
              const found = existingLogsBySession.get(cl.after_session_number);
              if (!found) {
                const createdLog = await prisma.careLog.create({
                  data: {
                    enrollment_id: enrollmentId,
                    cs_id: targetCsId,
                    after_session_number: cl.after_session_number,
                    content: cl.content,
                    outcome: cl.outcome,
                    created_by_id: options?.actorId || targetCsId,
                  },
                });
                existingEnrollment.care_logs.push(createdLog);
                existingLogsBySession.set(cl.after_session_number, createdLog);
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

          // 7. Save Row State
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
              enrollment_id: enrollmentId,
            },
            create: {
              config_id: config.id,
              sync_key: row.syncKey,
              row_number: row.rowNumber,
              row_hash: rowHash,
              student_id: student.id,
              enrollment_id: enrollmentId,
            },
          });

          if (!isNewEnrollment && !prevState) {
            // Counted in updatedCount above
          }
        } catch (rowErr: any) {
          failedCount++;
          log.warn(`Failed to sync row ${row.rowNumber} (${row.syncKey})`, {
            error: rowErr?.message || String(rowErr),
          });
        }
      }

      const now = new Date();
      const result: SheetSyncResult = {
        code: config.code,
        programType: config.program_type,
        skipped: false,
        totalRows: parsedRows.length,
        unchangedRows,
        createdCount,
        updatedCount,
        failedCount,
        byCvht,
        syncedAt: now.toISOString(),
      };

      const finalStatus = failedCount > 0
        ? (createdCount + updatedCount > 0 ? 'PARTIAL_FAILED' : 'FAILED')
        : 'SUCCESS';

      await prisma.googleSheetSyncConfig.update({
        where: { id: config.id },
        data: {
          // Only cache file hash when doing an unlimited sync with 0 failures
          ...(limit ? {} : { last_file_hash: failedCount === 0 ? fileHash : null }),
          last_synced_at: now,
          last_status: finalStatus,
          last_summary: result as unknown as Prisma.InputJsonValue,
          last_error: null,
        },
      });

      // Record ImportBatch if there were changes
      if (createdCount > 0 || updatedCount > 0 || failedCount > 0) {
        const uploaderId = options?.actorId || effectiveDefaultCsId;
        await prisma.importBatch.create({
          data: {
            uploaded_by_id: uploaderId,
            file_name: `[${config.code}] ${sourceLabel}`,
            import_type: ImportType.GOOGLE_SHEET_SYNC,
            total_rows: parsedRows.length,
            success_rows: createdCount + updatedCount,
            failed_rows: failedCount,
            status: failedCount > 0
              ? (createdCount + updatedCount > 0 ? ImportBatchStatus.PARTIAL_FAILED : ImportBatchStatus.FAILED)
              : ImportBatchStatus.COMPLETED,
            completed_at: now,
          },
        }).catch((err) => {
          log.warn('Failed to create ImportBatch for Google Sheet sync', { error: String(err) });
        });
      }

      return result;
    } catch (err: any) {
      await prisma.googleSheetSyncConfig.update({
        where: { id: config.id },
        data: {
          last_status: 'FAILED',
          last_error: err?.message || String(err),
        },
      });
      throw err;
    }
  }

  /**
   * Sync all enabled configs ("JLPT" & "KAIWA")
   */
  public async syncAll(options?: { forceFullSync?: boolean; limit?: number; actorId?: number }) {
    await this.ensureDefaultConfigs();
    const configs = await prisma.googleSheetSyncConfig.findMany({
      orderBy: { id: 'asc' },
    });

    const results: SheetSyncResult[] = [];
    for (const cfg of configs) {
      const res = await this.syncConfigByCode(cfg.code, options);
      results.push(res);
    }
    return { results };
  }

  /**
   * Process due configs for background cron scheduler
   */
  public async processDueSyncConfigs(): Promise<void> {
    await this.ensureDefaultConfigs();
    const configs = await prisma.googleSheetSyncConfig.findMany({
      where: { enabled: true },
    });

    const now = Date.now();
    for (const cfg of configs) {
      if (cfg.last_status === 'SYNCING') continue;
      const intervalMs = Math.max(1, cfg.sync_interval_minutes || 10) * 60 * 1000;
      const lastSyncMs = cfg.last_synced_at ? cfg.last_synced_at.getTime() : 0;
      if (now - lastSyncMs >= intervalMs) {
        try {
          await this.syncConfigByCode(cfg.code, { forceFullSync: false });
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
