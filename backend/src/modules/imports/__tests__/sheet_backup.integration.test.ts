import request from 'supertest';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import {
  AttendanceSource,
  AttendanceSourceType,
  AttendanceStatus,
  CareLogOutcome,
  ClassModelType,
  ClassSessionStatus,
  EnrollmentClassStatus,
  EnrollmentStatus,
} from '@prisma/client';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { ImportsService } from '../imports.service';

describe('CS Sheet Backup (Web -> 1.Chăm sóc & 3.Chấm buổi) Integration', () => {
  let adminToken: string;
  let cvht01Token: string;
  let cvht02Token: string;
  let adminId: number;
  let cvht01Id: number;
  let cvht02Id: number;
  let cvht03Id: number;

  let testEnrollment1Id: number;
  let testStudent1Id: number;
  let testEnrollmentClass1Id: number;
  let testClass1Id: number;

  let testEnrollment2Id: number;
  let testStudent2Id: number;

  const importsService = new ImportsService();

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

    const u3 = await prisma.user.upsert({
      where: { email: 'cskh3@gmail.com' },
      update: { staff_code: 'CVHT03', active: true, roles: ['CS'] },
      create: {
        email: 'cskh3@gmail.com',
        name: 'CVHT03 - CSKH 3',
        staff_code: 'CVHT03',
        password_hash: 'dummy',
        roles: ['CS'],
        active: true,
      },
    });
    cvht03Id = u3.id;

    // Ensure test package, teacher, class, student & enrollment for CVHT01 and CVHT02
    const pkg = await prisma.package.upsert({
      where: { code: 'KAIWA_BK_TEST' },
      update: { default_total_sessions: 30, active: true },
      create: {
        code: 'KAIWA_BK_TEST',
        name: 'Gói Kaiwa Backup Test',
        default_total_sessions: 30,
        active: true,
      },
    });

    const teacher = await prisma.teacher.upsert({
      where: { code: 'GV_BK_01' },
      update: { name: 'Sensei Backup 01', active: true },
      create: {
        code: 'GV_BK_01',
        name: 'Sensei Backup 01',
        active: true,
      },
    });

    const cls = await prisma.class.create({
      data: {
        class_code: 'CLS_BK_CVHT01',
        class_name: 'Lớp Kaiwa Backup CVHT01',
        level: 'N4',
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: AttendanceSourceType.LEARNING_SYSTEM,
        active: true,
      },
    });
    testClass1Id = cls.id;

    await prisma.classTeacher.create({
      data: {
        class_id: cls.id,
        teacher_id: teacher.id,
        role: 'MAIN',
        active: true,
      },
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
      where: { external_id: 'HV_BK_CVHT01_001' },
      update: {
        full_name: 'Nguyễn Văn Backup 01',
        gender: 'Nam',
        phone: '0912345678',
        email: 'hv_bk_01@example.com',
        occupation: 'Kỹ sư',
      },
      create: {
        external_id: 'HV_BK_CVHT01_001',
        full_name: 'Nguyễn Văn Backup 01',
        gender: 'Nam',
        phone: '0912345678',
        email: 'hv_bk_01@example.com',
        occupation: 'Kỹ sư',
      },
    });
    testStudent1Id = student1.id;

    const enr1 = await prisma.enrollment.upsert({
      where: { external_sync_key: 'BACKUP_TEST::HV_BK_CVHT01_001::KAIWA_BK_TEST' },
      update: {
        cs_id: cvht01Id,
        student_id: student1.id,
        package_id: pkg.id,
        total_sessions: 30,
        status: EnrollmentStatus.STUDYING,
        exchange_info: 'Trao đổi ban đầu lần 1',
      },
      create: {
        external_id: 'HV_BK_CVHT01_001',
        external_sync_key: 'BACKUP_TEST::HV_BK_CVHT01_001::KAIWA_BK_TEST',
        program_type: 'KAIWA',
        student_id: student1.id,
        package_id: pkg.id,
        cs_id: cvht01Id,
        paid_at: new Date('2026-01-10T00:00:00.000Z'),
        sale_name: 'Sale A',
        student_source_status: 'HV mới',
        course_content: 'Thường',
        payment_status: 'Full phí',
        course_teacher_type: 'GV Việt Nam',
        level: 'N4',
        total_sessions: 30,
        class_model: 'Lớp 1-1',
        exchange_info: 'Trao đổi ban đầu lần 1',
        start_date: new Date('2026-01-12T00:00:00.000Z'),
        status: EnrollmentStatus.STUDYING,
      },
    });
    testEnrollment1Id = enr1.id;

    const ec1 = await prisma.enrollmentClass.upsert({
      where: {
        enrollment_id_class_id_sequence_no: {
          enrollment_id: enr1.id,
          class_id: cls.id,
          sequence_no: 1,
        },
      },
      update: { status: EnrollmentClassStatus.ACTIVE },
      create: {
        enrollment_id: enr1.id,
        class_id: cls.id,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });
    testEnrollmentClass1Id = ec1.id;

    // Create a ClassSession & Attendance on 2026-09-15 for Student 1
    const session1 = await prisma.classSession.upsert({
      where: {
        class_id_session_number: {
          class_id: cls.id,
          session_number: 1,
        },
      },
      update: {
        session_date: new Date('2026-09-15T00:00:00.000Z'),
        status: ClassSessionStatus.COMPLETED,
      },
      create: {
        class_id: cls.id,
        session_number: 1,
        session_date: new Date('2026-09-15T00:00:00.000Z'),
        status: ClassSessionStatus.COMPLETED,
        created_by_id: adminId,
      },
    });

    await prisma.attendance.upsert({
      where: {
        enrollment_class_id_class_session_id: {
          enrollment_class_id: ec1.id,
          class_session_id: session1.id,
        },
      },
      update: {
        status: AttendanceStatus.ATTENDED,
        lesson_topic: 'K1 L1',
        deleted_at: null,
      },
      create: {
        enrollment_class_id: ec1.id,
        class_session_id: session1.id,
        status: AttendanceStatus.ATTENDED,
        lesson_topic: 'K1 L1',
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
      },
    });

    // Create a second student strictly for CVHT02 to verify scope isolation
    const student2 = await prisma.student.upsert({
      where: { external_id: 'HV_BK_CVHT02_999' },
      update: { full_name: 'Trần Thị Riêng Biệt CVHT02' },
      create: {
        external_id: 'HV_BK_CVHT02_999',
        full_name: 'Trần Thị Riêng Biệt CVHT02',
        gender: 'Nữ',
        phone: '0988777666',
        email: 'hv_bk_02@example.com',
      },
    });
    testStudent2Id = student2.id;

    const enr2 = await prisma.enrollment.upsert({
      where: { external_sync_key: 'BACKUP_TEST::HV_BK_CVHT02_999::KAIWA_BK_TEST' },
      update: { cs_id: cvht02Id, student_id: student2.id, package_id: pkg.id },
      create: {
        external_id: 'HV_BK_CVHT02_999',
        external_sync_key: 'BACKUP_TEST::HV_BK_CVHT02_999::KAIWA_BK_TEST',
        program_type: 'KAIWA',
        student_id: student2.id,
        package_id: pkg.id,
        cs_id: cvht02Id,
        total_sessions: 30,
        status: EnrollmentStatus.STUDYING,
      },
    });
    testEnrollment2Id = enr2.id;
  });

  afterAll(async () => {
    try {
      await prisma.careLog.deleteMany({ where: { enrollment_id: { in: [testEnrollment1Id, testEnrollment2Id] } } });
      await prisma.attendance.deleteMany({ where: { enrollment_class_id: testEnrollmentClass1Id } });
      await prisma.enrollmentClass.deleteMany({ where: { id: testEnrollmentClass1Id } });
      await prisma.classSession.deleteMany({ where: { class_id: testClass1Id } });
      await prisma.classSchedule.deleteMany({ where: { class_id: testClass1Id } });
      await prisma.classTeacher.deleteMany({ where: { class_id: testClass1Id } });
      await prisma.class.deleteMany({ where: { id: testClass1Id } });
      await prisma.enrollment.deleteMany({ where: { id: { in: [testEnrollment1Id, testEnrollment2Id] } } });
      await prisma.student.deleteMany({ where: { id: { in: [testStudent1Id, testStudent2Id] } } });
    } catch {
      // ignore cleanup error
    }
    await prisma.$disconnect();
  });

  it('1. Auto-initializes backup configs for CVHT01, CVHT02, CVHT03 and enforces CS data scope on GET /configs', async () => {
    // Admin sees all CS configs
    const adminRes = await request(app)
      .get('/api/v1/imports/sheet-backup/configs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    const configs = adminRes.body.data.configs as any[];
    expect(configs.length).toBeGreaterThanOrEqual(3);

    const staffCodes = configs.map((c) => c.cs_user.staff_code);
    expect(staffCodes).toContain('CVHT01');
    expect(staffCodes).toContain('CVHT02');
    expect(staffCodes).toContain('CVHT03');

    // CVHT01 only sees their own config
    const cs1Res = await request(app)
      .get('/api/v1/imports/sheet-backup/configs')
      .set('Authorization', `Bearer ${cvht01Token}`);

    expect(cs1Res.status).toBe(200);
    expect(cs1Res.body.data.configs).toHaveLength(1);
    expect(cs1Res.body.data.configs[0].cs_user_id).toBe(cvht01Id);
    expect(cs1Res.body.data.configs[0].cs_user.staff_code).toBe('CVHT01');
  });

  it('2. Updates backup config schedule & options via PUT /api/v1/imports/sheet-backup/configs/:csUserId', async () => {
    const res = await request(app)
      .put(`/api/v1/imports/sheet-backup/configs/${cvht01Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        schedule_times: ['12:00', '21:00'],
        enabled: true,
        require_private_sheet: true,
        mask_sensitive_data: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.cs_user_id).toBe(cvht01Id);
    expect(res.body.data.schedule_times).toEqual(['12:00', '21:00']);
  });

  it('3. Runs first full backup for CVHT01 and creates cham_soc_hoc_vien_CVHT01.xlsx with 60 cols in 1.Chăm sóc and 466 cols in 3.Chấm buổi', async () => {
    const run1 = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${cvht01Id}/run`)
      .set('Authorization', `Bearer ${cvht01Token}`)
      .send({ forceFullRewrite: true });

    expect(run1.status).toBe(200);
    const data = run1.body.data;
    expect(data.csUserId).toBe(cvht01Id);
    expect(data.staffCode).toBe('CVHT01');
    expect(data.status).toBe('SUCCESS');
    expect(data.sheet1.totalEnrollments).toBeGreaterThanOrEqual(1);
    expect(data.sheet1.appendedRows).toBe(data.sheet1.totalEnrollments);
    expect(data.sheet1.unchangedRows).toBe(0);

    const absFile = path.resolve(process.cwd(), data.localFilePath);
    expect(fs.existsSync(absFile)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(absFile);

    const ws1 = wb.getWorksheet('1.Chăm sóc');
    const ws3 = wb.getWorksheet('3.Chấm buổi');
    expect(ws1).toBeDefined();
    expect(ws3).toBeDefined();
    expect(ws1!.columnCount).toBeGreaterThanOrEqual(60);
    expect(ws3!.columnCount).toBeGreaterThanOrEqual(466);

    // Verify HV_BK_CVHT01_001 is present in 1.Chăm sóc and HV_BK_CVHT02_999 is NOT present
    let foundRow1: ExcelJS.Row | null = null;
    let foundCvht02InSheet1 = false;
    for (let r = 4; r <= ws1!.rowCount; r++) {
      const row = ws1!.getRow(r);
      const idVal = String(row.getCell(1).value || '').trim();
      if (idVal === 'HV_BK_CVHT01_001') foundRow1 = row;
      if (idVal === 'HV_BK_CVHT02_999') foundCvht02InSheet1 = true;
    }
    expect(foundRow1).not.toBeNull();
    expect(foundCvht02InSheet1).toBe(false);
    expect(String(foundRow1!.getCell(5).value)).toBe('Nguyễn Văn Backup 01');
    expect(String(foundRow1!.getCell(11).value)).toBe('KAIWA_BK_TEST');
    expect(String(foundRow1!.getCell(19).value)).toBe('CVHT01');
    expect(String(foundRow1!.getCell(34).value)).toBe('Lớp Kaiwa Backup CVHT01');
    expect(String(foundRow1!.getCell(38).value)).toBe('Trao đổi ban đầu lần 1');

    // Verify 3.Chấm buổi has attendance on 2026-09-15
    const blocks = importsService.detectAttendanceMonthBlocks(ws3!);
    const sepBlock = blocks.find((b) => b.month === 9 && b.year === 2026);
    expect(sepBlock).toBeDefined();
    const sep15Col = sepBlock!.dailyCols.find((d) => d.date.slice(0, 10) === '2026-09-15');
    expect(sep15Col).toBeDefined();

    let foundRow3: ExcelJS.Row | null = null;
    for (let r = 3; r <= ws3!.rowCount; r++) {
      const row = ws3!.getRow(r);
      if (String(row.getCell(1).value || '').trim() === 'HV_BK_CVHT01_001') {
        foundRow3 = row;
        break;
      }
    }
    expect(foundRow3).not.toBeNull();
    expect(String(foundRow3!.getCell(sep15Col!.colNumber).value)).toBe('K1 L1');
    expect(Number(foundRow3!.getCell(sepBlock!.summaryCols.attendedCol).value)).toBe(1);
  }, 30000);

  it('4. Second backup run when Web data is unchanged yields unchangedRows === totalEnrollments and updatedCellsCount === 0', async () => {
    const run2 = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${cvht01Id}/run`)
      .set('Authorization', `Bearer ${cvht01Token}`)
      .send({ forceFullRewrite: false });

    expect(run2.status).toBe(200);
    const data = run2.body.data;
    expect(data.sheet1.unchangedRows).toBe(data.sheet1.totalEnrollments);
    expect(data.sheet1.updatedRows).toBe(0);
    expect(data.sheet1.appendedRows).toBe(0);
    expect(data.sheet1.updatedCellsCount).toBe(0);

    expect(data.sheet3.unchangedRows).toBe(data.sheet3.totalEnrollments);
    expect(data.sheet3.updatedRows).toBe(0);
    expect(data.sheet3.appendedRows).toBe(0);
    expect(data.sheet3.updatedCellsCount).toBe(0);
  }, 30000);

  it('5. Modifying 1 student on Web (exchange_info + CareLog milestone 1 + new Attendance) updates ONLY that row & cells on next backup', async () => {
    await prisma.enrollment.update({
      where: { id: testEnrollment1Id },
      data: {
        exchange_info: 'Đã gọi điện chăm sóc cập nhật mới',
      },
    });

    await prisma.careLog.create({
      data: {
        enrollment_id: testEnrollment1Id,
        cs_id: cvht01Id,
        after_session_number: 1,
        outcome: CareLogOutcome.POSITIVE,
        content: 'HV phản hồi buổi 1 rất tốt',
        created_by_id: cvht01Id,
      },
    });

    // Add a second attendance on 2026-09-17 (Absent A)
    const session2 = await prisma.classSession.upsert({
      where: {
        class_id_session_number: {
          class_id: testClass1Id,
          session_number: 2,
        },
      },
      update: {
        session_date: new Date('2026-09-17T00:00:00.000Z'),
        status: ClassSessionStatus.COMPLETED,
      },
      create: {
        class_id: testClass1Id,
        session_number: 2,
        session_date: new Date('2026-09-17T00:00:00.000Z'),
        status: ClassSessionStatus.COMPLETED,
        created_by_id: adminId,
      },
    });

    await prisma.attendance.upsert({
      where: {
        enrollment_class_id_class_session_id: {
          enrollment_class_id: testEnrollmentClass1Id,
          class_session_id: session2.id,
        },
      },
      update: { status: AttendanceStatus.ABSENT_APPROVED_A, deleted_at: null },
      create: {
        enrollment_class_id: testEnrollmentClass1Id,
        class_session_id: session2.id,
        status: AttendanceStatus.ABSENT_APPROVED_A,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
      },
    });

    const run3 = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${cvht01Id}/run`)
      .set('Authorization', `Bearer ${cvht01Token}`)
      .send({ forceFullRewrite: false });

    expect(run3.status).toBe(200);
    const data = run3.body.data;

    // Exactly 1 row updated in Sheet 1 (exchange_info + CareLog milestone 1 = 2 cells)
    expect(data.sheet1.updatedRows).toBe(1);
    expect(data.sheet1.appendedRows).toBe(0);
    expect(data.sheet1.unchangedRows).toBe(data.sheet1.totalEnrollments - 1);
    expect(data.sheet1.updatedCellsCount).toBe(2);

    // Exactly 1 row updated in Sheet 3 (2026-09-17 cell 'A' + month summary absentA + year summary absentA = 3 cells)
    expect(data.sheet3.updatedRows).toBe(1);
    expect(data.sheet3.appendedRows).toBe(0);
    expect(data.sheet3.unchangedRows).toBe(data.sheet3.totalEnrollments - 1);
    expect(data.sheet3.updatedCellsCount).toBe(3);
  }, 30000);

  it('6. Enforces strict 403 Forbidden when CVHT01 attempts to run backup or download file of CVHT02', async () => {
    const forbiddenRun = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${cvht02Id}/run`)
      .set('Authorization', `Bearer ${cvht01Token}`)
      .send({});

    expect(forbiddenRun.status).toBe(403);

    const forbiddenDownload = await request(app)
      .get(`/api/v1/imports/sheet-backup/configs/${cvht02Id}/download`)
      .set('Authorization', `Bearer ${cvht01Token}`);

    expect(forbiddenDownload.status).toBe(403);

    // CVHT01 downloading their own backup succeeds
    const allowedDownload = await request(app)
      .get(`/api/v1/imports/sheet-backup/configs/${cvht01Id}/download`)
      .set('Authorization', `Bearer ${cvht01Token}`);

    expect(allowedDownload.status).toBe(200);
    expect(allowedDownload.headers['content-disposition']).toContain('cham_soc_hoc_vien_CVHT01.xlsx');
  });
});
