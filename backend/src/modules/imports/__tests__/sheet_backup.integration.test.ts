import request from 'supertest';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import {
  AttendanceSource,
  AttendanceSourceType,
  AttendanceStatus,
  ClassModelType,
  ClassSessionStatus,
  EnrollmentClassStatus,
  EnrollmentStatus,
} from '@prisma/client';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { detectJlptMonthBlocks } from '../attendance-sheet.util';

/**
 * Program Sheet Backup (JLPT + KAIWA -> local "Chấm buổi" workbooks) integration test.
 *
 * Covers the new per-program contract:
 *  - ensureConfigs/listConfigs create exactly 2 configs per CS (JLPT + KAIWA) and scope CS users to their own rows
 *  - runBackupForConfig writes the attendance mark into the correct day column of the correct month block
 *    (timezone regression: 05/10 mid-month must not drift, 31/10 month-end must not spill into T11)
 *  - year filter (year=2025) writes 0 attendance cells when all sessions are in 2026
 *  - an idempotent re-run reports unchangedRows === totalStudents and updatedCellsCount === 0
 *  - cross-CS access (CVHT02 touching CVHT01's config) is rejected with 403 by the engine
 */
describe('Program Sheet Backup (JLPT & KAIWA "Chấm buổi") Integration', () => {
  let adminToken: string;
  let cvht01Token: string;
  let cvht02Token: string;
  let adminId: number;
  let cvht01Id: number;
  let cvht02Id: number;

  let testClassId: number;
  let testEnrollmentClass1Id: number; // JLPT
  let testEnrollmentClass2Id: number; // KAIWA
  let testEnrollment1Id: number;
  let testEnrollment2Id: number;
  let testStudent1Id: number;
  let testStudent2Id: number;

  const EXTERNAL_ID_JLPT = 'HV_SBKPG_JLPT_001';
  const EXTERNAL_ID_KAIWA = 'HV_SBKPG_KAIWA_001';
  const SYNC_KEY_JLPT = 'SBKPG_TEST::HV_SBKPG_JLPT_001::JLPT_SBK_TEST';
  const SYNC_KEY_KAIWA = 'SBKPG_TEST::HV_SBKPG_KAIWA_001::KAIWA_SBK_TEST';

  let jlptConfigId: number;
  let kaiwaConfigId: number;

  beforeAll(async () => {
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_sheet_backup_test@example.com' },
      update: { active: true, roles: ['ADMIN'] },
      create: {
        email: 'admin_sheet_backup_test@example.com',
        name: 'Admin Backup Test',
        password_hash: 'dummy',
        roles: ['ADMIN'],
        active: true,
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    const u1 = await prisma.user.upsert({
      where: { email: 'cskh1@gmail.com' },
      update: { staff_code: 'CVHT01', active: true, roles: ['CS'] },
      create: {
        email: 'cskh1@gmail.com',
        name: 'CVHT01 - CSKH 1',
        staff_code: 'CVHT01',
        password_hash: 'dummy',
        roles: ['CS'],
        active: true,
      },
    });
    cvht01Id = u1.id;
    cvht01Token = signTestToken(cvht01Id, ['CS']);

    const u2 = await prisma.user.upsert({
      where: { email: 'cskh2@gmail.com' },
      update: { staff_code: 'CVHT02', active: true, roles: ['CS'] },
      create: {
        email: 'cskh2@gmail.com',
        name: 'CVHT02 - CSKH 2',
        staff_code: 'CVHT02',
        password_hash: 'dummy',
        roles: ['CS'],
        active: true,
      },
    });
    cvht02Id = u2.id;
    cvht02Token = signTestToken(cvht02Id, ['CS']);

    // ---- Temp seed data -------------------------------------------------
    const pkgJlpt = await prisma.package.upsert({
      where: { code: 'JLPT_SBK_TEST' },
      update: { default_total_sessions: 12, active: true },
      create: { code: 'JLPT_SBK_TEST', name: 'Gói JLPT Backup Test', default_total_sessions: 12, active: true },
    });
    const pkgKaiwa = await prisma.package.upsert({
      where: { code: 'KAIWA_SBK_TEST' },
      update: { default_total_sessions: 30, active: true },
      create: {
        code: 'KAIWA_SBK_TEST',
        name: 'Gói Kaiwa Backup Test',
        default_total_sessions: 30,
        active: true,
      },
    });

    const teacher = await prisma.teacher.upsert({
      where: { code: 'GV_SBKPG_01' },
      update: { name: 'Sensei Backup Program 01', active: true },
      create: { code: 'GV_SBKPG_01', name: 'Sensei Backup Program 01', active: true },
    });

    // One class shared by both test enrollments (each gets its own EnrollmentClass).
    const cls = await prisma.class.create({
      data: {
        class_code: 'CLS_SBKPG_CVHT01',
        class_name: 'Lớp Backup Program Test CVHT01',
        level: 'N4',
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: AttendanceSourceType.LEARNING_SYSTEM,
        active: true,
      },
    });
    testClassId = cls.id;

    await prisma.classTeacher.create({
      data: { class_id: cls.id, teacher_id: teacher.id, role: 'MAIN', active: true },
    });
    await prisma.classSchedule.create({
      data: {
        class_id: cls.id,
        schedule_pattern: 'T2-T4-T6',
        start_time: '20:00',
        duration_minutes: 50,
        active: true,
      },
    });

    const student1 = await prisma.student.upsert({
      where: { external_id: EXTERNAL_ID_JLPT },
      update: { full_name: 'Nguyễn Văn SBK JLPT' },
      create: {
        external_id: EXTERNAL_ID_JLPT,
        full_name: 'Nguyễn Văn SBK JLPT',
        gender: 'Nam',
        phone: '0912340001',
        email: 'hv_sbkpg_jlpt@example.com',
      },
    });
    testStudent1Id = student1.id;

    const student2 = await prisma.student.upsert({
      where: { external_id: EXTERNAL_ID_KAIWA },
      update: { full_name: 'Trần Thị SBK KAIWA' },
      create: {
        external_id: EXTERNAL_ID_KAIWA,
        full_name: 'Trần Thị SBK KAIWA',
        gender: 'Nữ',
        phone: '0912340002',
        email: 'hv_sbkpg_kaiwa@example.com',
      },
    });
    testStudent2Id = student2.id;

    const enrJlpt = await prisma.enrollment.upsert({
      where: { external_sync_key: SYNC_KEY_JLPT },
      update: { cs_id: cvht01Id, student_id: student1.id, package_id: pkgJlpt.id, status: EnrollmentStatus.STUDYING },
      create: {
        external_id: EXTERNAL_ID_JLPT,
        external_sync_key: SYNC_KEY_JLPT,
        program_type: 'JLPT',
        student_id: student1.id,
        package_id: pkgJlpt.id,
        cs_id: cvht01Id,
        paid_at: new Date('2026-09-01T00:00:00.000Z'),
        sale_name: 'Sale A',
        student_source_status: 'HV mới',
        course_content: 'Thường',
        payment_status: 'Full phí',
        course_teacher_type: 'GV Việt Nam',
        level: 'N4',
        total_sessions: 12,
        class_model: 'Lớp 1-1',
        start_date: new Date('2026-10-01T00:00:00.000Z'),
        status: EnrollmentStatus.STUDYING,
      },
    });
    testEnrollment1Id = enrJlpt.id;

    const enrKaiwa = await prisma.enrollment.upsert({
      where: { external_sync_key: SYNC_KEY_KAIWA },
      update: {
        cs_id: cvht01Id,
        student_id: student2.id,
        package_id: pkgKaiwa.id,
        status: EnrollmentStatus.STUDYING,
      },
      create: {
        external_id: EXTERNAL_ID_KAIWA,
        external_sync_key: SYNC_KEY_KAIWA,
        program_type: 'KAIWA',
        student_id: student2.id,
        package_id: pkgKaiwa.id,
        cs_id: cvht01Id,
        paid_at: new Date('2026-09-01T00:00:00.000Z'),
        sale_name: 'Sale B',
        student_source_status: 'HV mới',
        course_content: 'Thường',
        payment_status: 'Full phí',
        course_teacher_type: 'GV Việt Nam',
        level: 'N4',
        total_sessions: 30,
        class_model: 'Lớp 1-1',
        start_date: new Date('2026-10-01T00:00:00.000Z'),
        status: EnrollmentStatus.STUDYING,
      },
    });
    testEnrollment2Id = enrKaiwa.id;

    const ec1 = await prisma.enrollmentClass.upsert({
      where: {
        enrollment_id_class_id_sequence_no: { enrollment_id: enrJlpt.id, class_id: cls.id, sequence_no: 1 },
      },
      update: { status: EnrollmentClassStatus.ACTIVE },
      create: {
        enrollment_id: enrJlpt.id,
        class_id: cls.id,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });
    testEnrollmentClass1Id = ec1.id;

    const ec2 = await prisma.enrollmentClass.upsert({
      where: {
        enrollment_id_class_id_sequence_no: { enrollment_id: enrKaiwa.id, class_id: cls.id, sequence_no: 2 },
      },
      update: { status: EnrollmentClassStatus.ACTIVE },
      create: {
        enrollment_id: enrKaiwa.id,
        class_id: cls.id,
        sequence_no: 2,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });
    testEnrollmentClass2Id = ec2.id;

    // JLPT session on 2026-10-05 -> attendance ABSENT_UNAPPROVED_C (cell value 'C')
    const sessionJlpt = await prisma.classSession.upsert({
      where: { class_id_session_number: { class_id: cls.id, session_number: 101 } },
      update: { session_date: new Date('2026-10-05T00:00:00.000Z'), status: ClassSessionStatus.COMPLETED },
      create: {
        class_id: cls.id,
        session_number: 101,
        session_date: new Date('2026-10-05T00:00:00.000Z'),
        status: ClassSessionStatus.COMPLETED,
        created_by_id: adminId,
      },
    });
    await prisma.attendance.upsert({
      where: {
        enrollment_class_id_class_session_id: {
          enrollment_class_id: ec1.id,
          class_session_id: sessionJlpt.id,
        },
      },
      update: { status: AttendanceStatus.ABSENT_UNAPPROVED_C, deleted_at: null },
      create: {
        enrollment_class_id: ec1.id,
        class_session_id: sessionJlpt.id,
        status: AttendanceStatus.ABSENT_UNAPPROVED_C,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
      },
    });

    // KAIWA session on 2026-10-31 (month-end) -> attendance ATTENDED (cell value '1')
    const sessionKaiwa = await prisma.classSession.upsert({
      where: { class_id_session_number: { class_id: cls.id, session_number: 102 } },
      update: { session_date: new Date('2026-10-31T00:00:00.000Z'), status: ClassSessionStatus.COMPLETED },
      create: {
        class_id: cls.id,
        session_number: 102,
        session_date: new Date('2026-10-31T00:00:00.000Z'),
        status: ClassSessionStatus.COMPLETED,
        created_by_id: adminId,
      },
    });
    await prisma.attendance.upsert({
      where: {
        enrollment_class_id_class_session_id: {
          enrollment_class_id: ec2.id,
          class_session_id: sessionKaiwa.id,
        },
      },
      update: { status: AttendanceStatus.ATTENDED, deleted_at: null },
      create: {
        enrollment_class_id: ec2.id,
        class_session_id: sessionKaiwa.id,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
      },
    });
  });

  afterAll(async () => {
    // Cleanup temp seed data only (configs are engine-managed and re-created by ensureConfigs).
    try {
      const enrollmentClassIds = [testEnrollmentClass1Id, testEnrollmentClass2Id].filter(Boolean);
      await prisma.attendance.deleteMany({ where: { enrollment_class_id: { in: enrollmentClassIds } } });
      await prisma.enrollmentClass.deleteMany({ where: { enrollment_id: { in: [testEnrollment1Id, testEnrollment2Id] } } });
      await prisma.careLog.deleteMany({ where: { enrollment_id: { in: [testEnrollment1Id, testEnrollment2Id] } } });
      await prisma.classSession.deleteMany({ where: { class_id: testClassId } });
      await prisma.classSchedule.deleteMany({ where: { class_id: testClassId } });
      await prisma.classTeacher.deleteMany({ where: { class_id: testClassId } });
      await prisma.class.deleteMany({ where: { id: testClassId } });
      await prisma.enrollment.deleteMany({ where: { id: { in: [testEnrollment1Id, testEnrollment2Id] } } });
      await prisma.student.deleteMany({ where: { id: { in: [testStudent1Id, testStudent2Id] } } });
    } catch {
      // ignore cleanup error
    }
    await prisma.$disconnect();
  });

  const resolveBackupPath = (p: string): string =>
    path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);

  // Structural mirror of the month-block shape returned by detectJlptMonthBlocks(),
  // so the assertions stay readable even though the helper lives in the engine module.
  type MonthBlockLite = {
    month: number;
    year: number;
    label?: string;
    startCol: number;
    endCol: number;
    dailyCols: Array<{ colNumber: number; colLetter?: string; date: string }>;
    summaryCols?: Record<string, number>;
  };

  const monthBlocks = (ws: ExcelJS.Worksheet): MonthBlockLite[] =>
    detectJlptMonthBlocks(ws) as unknown as MonthBlockLite[];

  const findStudentRow = (ws: ExcelJS.Worksheet, externalId: string, headerRow = 2): ExcelJS.Row | null => {
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      // Template gốc: cột A = Mã lớp, cột B = ID học viên (khoá dòng)
      const idVal = String(row.getCell(2).value || '').trim();
      if (idVal === externalId) return row;
    }
    return null;
  };

  it('1. ensureConfigs creates 2 configs per CS (JLPT + KAIWA); CS sees only own configs, admin sees all', async () => {
    const adminRes = await request(app)
      .get('/api/v1/imports/sheet-backup/configs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    const configs = adminRes.body.data.configs as any[];
    expect(Array.isArray(configs)).toBe(true);

    const forCs1 = configs.filter((c) => c.cs_user_id === cvht01Id);
    expect(forCs1.map((c) => c.program_type).sort()).toEqual(['JLPT', 'KAIWA']);

    const jlpt = forCs1.find((c) => c.program_type === 'JLPT')!;
    const kaiwa = forCs1.find((c) => c.program_type === 'KAIWA')!;
    expect(jlpt.sheet_name).toBe('Chấm buổi');
    expect(kaiwa.sheet_name).toBe('3.Chấm buổi');
    expect(String(jlpt.local_backup_path)).toContain('hoc_vien_jlpt_CVHT01');
    expect(String(kaiwa.local_backup_path)).toContain('hoc_vien_kaiwa_CVHT01');
    expect(jlpt.schedule_times).toEqual(['12:00', '21:00']);
    expect(jlpt.enabled).toBe(true);
    expect(jlpt.require_private_sheet).toBe(true);
    expect(jlpt.mask_sensitive_data).toBe(false);
    expect(jlpt.backup_year).toBeNull();
    expect(jlpt.cs_user.staff_code).toBe('CVHT01');
    expect(jlpt.cs_user).toEqual({ id: cvht01Id, name: expect.any(String), email: expect.any(String), staff_code: 'CVHT01' });
    expect(jlpt.student_counts.total).toBeGreaterThanOrEqual(1);
    expect(adminRes.body.data.serviceAccount).toBeDefined();
    expect(Array.isArray(adminRes.body.data.availableYears)).toBe(true);

    jlptConfigId = jlpt.id;
    kaiwaConfigId = kaiwa.id;

    // CVHT01 (CS) only sees their own 2 configs
    const cs1Res = await request(app)
      .get('/api/v1/imports/sheet-backup/configs')
      .set('Authorization', `Bearer ${cvht01Token}`);
    expect(cs1Res.status).toBe(200);
    const cs1Configs = cs1Res.body.data.configs as any[];
    expect(cs1Configs).toHaveLength(2);
    expect(cs1Configs.every((c) => c.cs_user_id === cvht01Id)).toBe(true);
  });

  it('2. runBackupForConfig(JLPT) writes "C" into the 05/10/2026 column of the T10/2026 block', async () => {
    const runRes = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${cvht01Token}`)
      .send({ forceFullRewrite: true });

    expect(runRes.status).toBe(200);
    const summary = runRes.body.data;
    expect(summary.csUserId).toBe(cvht01Id);
    expect(summary.staffCode).toBe('CVHT01');
    expect(summary.programType).toBe('JLPT');
    expect(summary.status).toBe('SUCCESS');
    expect(summary.totalStudents).toBeGreaterThanOrEqual(1);
    expect(summary.attendanceCellsWritten).toBeGreaterThanOrEqual(1);

    const absFile = resolveBackupPath(summary.localFilePath);
    expect(fs.existsSync(absFile)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(absFile);
    const ws = wb.getWorksheet('Chấm buổi');
    expect(ws).toBeDefined();

    const blocks = monthBlocks(ws!);
    const oct = blocks.find((b) => b.month === 10 && b.year === 2026);
    expect(oct).toBeDefined();
    // 05/10/2026 -> 'C'
    const day05 = oct!.dailyCols.find((d) => d.date.slice(0, 10) === '2026-10-05');
    expect(day05).toBeDefined();
    const row = findStudentRow(ws!, EXTERNAL_ID_JLPT);
    expect(row).not.toBeNull();
    expect(String(row!.getCell(day05!.colNumber).value)).toBe('C');
    // 04/10/2026 -> empty
    const day04 = oct!.dailyCols.find((d) => d.date.slice(0, 10) === '2026-10-04');
    expect(day04).toBeDefined();
    expect(String(row!.getCell(day04!.colNumber).value || '')).toBe('');
    // Timezone guard: file fresh giữ đủ 24 block template; dữ liệu 05/10 KHÔNG được
    // rò rỉ sang block T9/2026 (local-midnight shift sẽ ghi vào 04/09 hoặc 05/09)
    const sep = blocks.find((b) => b.month === 9 && b.year === 2026);
    expect(sep).toBeDefined();
    if (sep) {
      for (const d of sep.dailyCols) {
        expect(String(row!.getCell(d.colNumber).value || '')).toBe('');
      }
    }
  }, 60000);

  it('3. runBackupForConfig(KAIWA) writes "1" into the 31/10/2026 column and does NOT spill into T11', async () => {
    const runRes = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${kaiwaConfigId}/run`)
      .set('Authorization', `Bearer ${cvht01Token}`)
      .send({ forceFullRewrite: true });

    expect(runRes.status).toBe(200);
    const summary = runRes.body.data;
    expect(summary.programType).toBe('KAIWA');
    expect(summary.status).toBe('SUCCESS');
    expect(summary.attendanceCellsWritten).toBeGreaterThanOrEqual(1);

    const absFile = resolveBackupPath(summary.localFilePath);
    expect(fs.existsSync(absFile)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(absFile);
    const ws = wb.getWorksheet('3.Chấm buổi');
    expect(ws).toBeDefined();

    const blocks = monthBlocks(ws!);
    const oct = blocks.find((b) => b.month === 10 && b.year === 2026);
    expect(oct).toBeDefined();
    const day31 = oct!.dailyCols.find((d) => d.date.slice(0, 10) === '2026-10-31');
    expect(day31).toBeDefined();
    const row = findStudentRow(ws!, EXTERNAL_ID_KAIWA);
    expect(row).not.toBeNull();
    expect(String(row!.getCell(day31!.colNumber).value)).toBe('1');
    // 31/10 must not leak into a November block (local-midnight shift would write into Nov 1)
    expect(String(row!.getCell(oct!.endCol + 1).value || '')).toBe('');
  }, 60000);

  it('4. year=2025 filter writes zero attendance cells (all test sessions are in 2026)', async () => {
    const runRes = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${cvht01Token}`)
      .send({ year: 2025 });

    expect(runRes.status).toBe(200);
    expect(runRes.body.data.status).toBe('SUCCESS');
    expect(runRes.body.data.yearFilter).toBe(2025);
    expect(runRes.body.data.attendanceCellsWritten).toBe(0);
  }, 60000);

  it('5. Re-running with unchanged data yields unchangedRows === totalStudents and updatedCellsCount === 0', async () => {
    const runRes = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${cvht01Token}`)
      .send({ forceFullRewrite: false });

    expect(runRes.status).toBe(200);
    const summary = runRes.body.data;
    expect(summary.status).toBe('SUCCESS');
    expect(summary.updatedCellsCount).toBe(0);
    expect(summary.updatedRows).toBe(0);
    expect(summary.appendedRows).toBe(0);
    expect(summary.unchangedRows).toBe(summary.totalStudents);
  }, 60000);

  it('6. CVHT02 cannot run or download CVHT01 config (403); CVHT01 can download own backup', async () => {
    const forbiddenRun = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${cvht02Token}`)
      .send({});
    expect(forbiddenRun.status).toBe(403);

    const forbiddenDownload = await request(app)
      .get(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/download`)
      .set('Authorization', `Bearer ${cvht02Token}`);
    expect(forbiddenDownload.status).toBe(403);

    const allowedDownload = await request(app)
      .get(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/download`)
      .set('Authorization', `Bearer ${cvht01Token}`);
    expect(allowedDownload.status).toBe(200);
    expect(allowedDownload.headers['content-disposition']).toContain('hoc_vien_jlpt_CVHT01');
  });
});
