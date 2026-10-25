/**
 * E.3/C.4 focused regression tests — sheet-backup consumed/remaining now
 * derive from the merged enrollment entitlement calculator
 * (enrollment-entitlement.ts) instead of the old date-collapsed, status-only
 * counters.
 *
 * Mock-only: prisma + sibling services are jest mocks; the workbook is an
 * in-memory ExcelJS instance injected via a stubbed loadOrInitializeWorkbook,
 * written to an os.tmpdir path. No database, no app server, no Google API.
 *
 * Invariants under test:
 *  - Two FINAL consuming rows on the SAME session date count 2 consumed
 *    (they must not collapse through the date->one-record render map).
 *  - Deleted / non-FINAL / non-consuming rows never count.
 *  - With web attendance the displayed remaining is unclamped (negative is a
 *    deliberate "nợ buổi" ops signal).
 *  - external_remaining_sessions is only used when there is NO web attendance
 *    (clearly-labeled reconciliation value) and NEVER alters the computed
 *    value when web attendance exists.
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import {
  AttendanceStatus,
  ReconciliationState,
  EnrollmentStatus,
} from '@prisma/client';

jest.mock('../../../prisma/client', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    csSheetBackupConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    enrollment: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    importBatch: { create: jest.fn() },
  },
}));

jest.mock('../imports.service', () => ({
  ImportsService: jest.fn().mockImplementation(() => ({
    detectAttendanceMonthBlocks: jest.fn(() => []),
  })),
}));

jest.mock('../sheet-sync.service', () => ({
  SheetSyncService: jest.fn().mockImplementation(() => ({
    extractSpreadsheetId: jest.fn(() => null),
    getAuthorizedAccessToken: jest.fn(),
    buildDefaultCvhtMapping: jest.fn(),
    getServiceAccountKey: jest.fn(),
  })),
}));

import { prisma } from '../../../prisma/client';
import { SheetBackupService } from '../sheet-backup.service';

// ---------------------------------------------------------------------------
//  Fixture builders
// ---------------------------------------------------------------------------

const att = (
  id: number,
  sessionDate: string,
  status: AttendanceStatus,
  reconciliationState: ReconciliationState = ReconciliationState.MATCHED,
  deleted = false,
): any => ({
  id,
  status,
  reconciliation_state: reconciliationState,
  deleted_at: deleted ? new Date('2026-10-05T00:00:00.000Z') : null,
  lesson_topic: null,
  class_session: { session_date: new Date(`${sessionDate}T00:00:00.000Z`) },
});

const buildEnrollment = (attendances: any[], overrides: Record<string, unknown> = {}): any => ({
  id: 1,
  total_sessions: 10,
  status: EnrollmentStatus.STUDYING,
  external_id: null,
  attended_previous_years: 0,
  external_remaining_sessions: null,
  external_synced_at: null,
  student: { id: 7, full_name: 'Test Student', external_id: 'HV001', phone: '', email: '' },
  package: { code: 'PKG', name: 'PKG' },
  sale: null,
  cs: null,
  care_logs: [],
  enrollment_classes: [
    {
      id: 100,
      status: 'ACTIVE',
      sequence_no: 1,
      class: { class_name: 'L1', class_teachers: [], class_schedules: [] },
      attendance: attendances.map((a) => ({ ...a, enrollment_class_id: 100 })),
    },
  ],
  ...overrides,
});

const makeService = (
  tmpDir: string,
  workbooks: { ws1: ExcelJS.Worksheet; ws3: ExcelJS.Worksheet },
  enrollments: any[],
): SheetBackupService => {
  const service = new SheetBackupService(undefined as never, undefined as never);

  // Keep the run entirely offline:
  // - ensureBackupConfigs stubbed (would touch prisma.user + config creates)
  // - workbook injected in-memory; file write goes to a tmp dir
  (service as any).ensureBackupConfigs = jest.fn().mockResolvedValue(undefined);
  (service as any).loadOrInitializeWorkbook = jest.fn().mockResolvedValue({
    workbook: workbooks.ws1.workbook,
    isFreshFromTemplate: true,
  });

  (prisma.csSheetBackupConfig.findUnique as jest.Mock).mockResolvedValue({
    id: 1,
    cs_user_id: 42,
    cs_user: { id: 42, name: 'CS Tester', email: 'cs@test.local', staff_code: 'CVHT99' },
    local_backup_path: path.join(tmpDir, 'backup.xlsx').replace(/\\/g, '/'),
    sheet1_name: '1.Chăm sóc',
    sheet3_name: '3.Chấm buổi',
    target_spreadsheet_id: null,
    target_spreadsheet_url: null,
    require_private_sheet: false,
    mask_sensitive_data: false,
  });
  (prisma.csSheetBackupConfig.update as jest.Mock).mockResolvedValue({});
  (prisma.enrollment.findMany as jest.Mock).mockResolvedValue(enrollments);
  (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  (prisma.importBatch.create as jest.Mock).mockResolvedValue({});

  return service;
};

describe('E.3 sheet-backup consumed/remaining via entitlement calculator', () => {
  let tmpDir: string;
  let wb: ExcelJS.Workbook;
  let ws1: ExcelJS.Worksheet;
  let ws3: ExcelJS.Worksheet;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-backup-test-'));
    jest.clearAllMocks();
    wb = new ExcelJS.Workbook();
    ws1 = wb.addWorksheet('1.Chăm sóc');
    ws3 = wb.addWorksheet('3.Chấm buổi');
    // Minimal header scaffolding matching the reader loops (headers at row 3 / 2)
    ws1.addRow(['H1']);
    ws1.addRow(['H2']);
    ws1.addRow(['ID', 'paid', 'sale', 'status', 'name', 'gender', 'phone', 'email',
      'content', 'payment', 'pkg', 'course', 'level', 'total', 'model']);
    ws3.addRow(['H1']);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  const run = async (enrollments: any[]) => {
    const service = makeService(tmpDir, { ws1, ws3 }, enrollments);
    const result = await service.runBackupForCs(42);
    expect(result.status).toBe('SUCCESS');
    return { service };
  };

  /** Data row on Sheet 1 is appended at row 4 for a fresh workbook. */
  const sheet1Cell = (col: number) => ws1.getRow(4).getCell(col).value;
  const sheet3Cell = (col: number) => ws3.getRow(3).getCell(col).value;

  it('two FINAL rows on the same date count as 2 consumed (no date collapse)', async () => {
    const enrollments = [
      buildEnrollment([
        att(1, '2026-10-20', AttendanceStatus.ATTENDED),
        att(2, '2026-10-20', AttendanceStatus.ATTENDED, ReconciliationState.RESOLVED),
      ]),
    ];
    await run(enrollments);

    // Sheet 1 col 20 (T): Số buổi còn lại — 10 - 2 consumed
    expect(sheet1Cell(20)).toBe(8);
    // Sheet 1 col 36 (AJ): Tổng số buổi đã học 2026 — consumed count, not collapsed to 1
    expect(sheet1Cell(36)).toBe(2);
    // Sheet 3 col 9 (I) mirrors remaining; col 25 (Y) mirrors current-year attended
    expect(sheet3Cell(9)).toBe(8);
    expect(sheet3Cell(25)).toBe(2);
  });

  it('deleted, provisional and non-consuming FINAL rows never count', async () => {
    const enrollments = [
      buildEnrollment([
        att(1, '2026-10-10', AttendanceStatus.ATTENDED, ReconciliationState.MATCHED, true), // deleted
        att(2, '2026-10-11', AttendanceStatus.ATTENDED, ReconciliationState.PENDING_CS), // provisional
        att(3, '2026-10-12', AttendanceStatus.LEAVE_B), // FINAL but non-consuming
        att(4, '2026-10-13', AttendanceStatus.ABSENT_APPROVED_A), // FINAL but non-consuming
        att(5, '2026-10-14', AttendanceStatus.ABSENT_UNAPPROVED_C), // consuming
      ]),
    ];
    await run(enrollments);

    // Only row 5 consumes → remaining 9
    expect(sheet1Cell(20)).toBe(9);
    expect(sheet1Cell(36)).toBe(1);
  });

  it('computed remaining is NOT clamped (overshoot writes negative nợ buổi)', async () => {
    const enrollments = [
      buildEnrollment(
        [
          att(1, '2026-10-01', AttendanceStatus.ATTENDED),
          att(2, '2026-10-02', AttendanceStatus.ABSENT_UNAPPROVED_C),
          att(3, '2026-10-03', AttendanceStatus.ATTENDED, ReconciliationState.RESOLVED),
        ],
        { total_sessions: 2 },
      ),
    ];
    await run(enrollments);

    // consumed 3 > total 2 → -1 written (Math.max(0,...) clamp removed)
    expect(sheet1Cell(20)).toBe(-1);
    expect(sheet3Cell(9)).toBe(-1);
    expect(sheet1Cell(36)).toBe(3);
  });

  it('external balance NEVER alters computed remaining when web attendance exists', async () => {
    const enrollments = [
      buildEnrollment(
        [att(1, '2026-10-01', AttendanceStatus.ATTENDED)],
        { external_remaining_sessions: 99, attended_previous_years: 40 },
      ),
    ];
    await run(enrollments);

    // Web attendance present → computed path only: 10 - 1 = 9, external 99 must not leak in
    expect(sheet1Cell(20)).toBe(9);
    expect(sheet1Cell(35)).toBe(40); // AI: prev-years kept as separate label value
    expect(sheet1Cell(36)).toBe(1); // AJ: current-year consumed (not external)
  });

  it('without web attendance the external reconciliation value still displays (unchanged contract)', async () => {
    const enrollments = [
      buildEnrollment([], { external_remaining_sessions: 7 }),
    ];
    await run(enrollments);

    // No web rows → hasWebAttendance false → external stays the displayed value
    expect(sheet1Cell(20)).toBe(7);
  });
});
