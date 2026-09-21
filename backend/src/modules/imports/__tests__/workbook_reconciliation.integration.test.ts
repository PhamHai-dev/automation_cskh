import request from 'supertest';
import ExcelJS from 'exceljs';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { AttendanceStatus } from '@prisma/client';

describe('Workbook Reconciliation, Sale Table & CS Assignment (Decision 32)', () => {
  let adminToken: string;
  let adminId: number;
  let csToken: string;
  let csId: number;
  let cs2Token: string;
  let cs2Id: number;
  let teacherToken: string;
  let teacherId: number;
  let testClassId: number;

  beforeAll(async () => {
    // 1. Setup Admin
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_wb_test@example.com' },
      update: {},
      create: {
        email: 'admin_wb_test@example.com',
        name: 'Admin WB Test',
        password_hash: 'dummy',
        roles: ['ADMIN'],
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    // 2. Setup CS user 1
    const csUser = await prisma.user.upsert({
      where: { email: 'cs_wb_test@example.com' },
      update: {},
      create: {
        email: 'cs_wb_test@example.com',
        name: 'CS WB Test',
        password_hash: 'dummy',
        roles: ['CS'],
      },
    });
    csId = csUser.id;
    csToken = signTestToken(csId, ['CS']);

    // 3. Setup CS user 2
    const cs2User = await prisma.user.upsert({
      where: { email: 'cs2_wb_test@example.com' },
      update: {},
      create: {
        email: 'cs2_wb_test@example.com',
        name: 'CS2 WB Test',
        password_hash: 'dummy',
        roles: ['CS'],
      },
    });
    cs2Id = cs2User.id;
    cs2Token = signTestToken(cs2Id, ['CS']);

    // 4. Setup Teacher user
    const teacherUser = await prisma.user.upsert({
      where: { email: 'teacher_wb_test@example.com' },
      update: {},
      create: {
        email: 'teacher_wb_test@example.com',
        name: 'Teacher WB Test',
        password_hash: 'dummy',
        roles: ['TEACHER'],
      },
    });
    teacherId = teacherUser.id;
    teacherToken = signTestToken(teacherId, ['TEACHER']);

    // 5. Setup Class assigned to Teacher
    const cls = await prisma.class.create({
      data: {
        class_name: 'Lớp Teacher WB Assigned',
        class_code: 'CLS_TEACHER_WB',
        model_type: 'ONE_TO_ONE',
        attendance_source: 'LEARNING_SYSTEM',
        class_teachers: {
          create: { teacher_id: teacherId, role: 'MAIN' },
        },
      },
    });
    testClassId = cls.id;

    // 6. Pre-create an existing student & enrollment owned by CS 1
    const pkg = await prisma.package.upsert({
      where: { code: 'PKG_WB_1' },
      update: {},
      create: { code: 'PKG_WB_1', name: 'Gói WB 1', default_total_sessions: 30, active: true },
    });

    const student = await prisma.student.create({
      data: {
        external_id: 'HV_WB_001',
        full_name: 'HV WB 001 Original',
        phone: '0900000001',
        email: 'old_email@example.com',
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        external_id: 'HV_WB_001',
        student_id: student.id,
        package_id: pkg.id,
        cs_id: csId,
        total_sessions: 30,
        sale_name: 'SALE_ORIG',
        status: 'STUDYING',
      },
    });

    const ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollment.id,
        class_id: testClassId,
        sequence_no: 1,
        status: 'ACTIVE',
      },
    });

    // Existing attendance session & attendance record on 2026-09-02
    const session = await prisma.classSession.create({
      data: {
        class_id: testClassId,
        session_number: 1,
        session_date: new Date('2026-09-02T00:00:00.000Z'),
        created_by_id: adminId,
      },
    });

    await prisma.attendance.create({
      data: {
        enrollment_class_id: ec.id,
        class_session_id: session.id,
        status: AttendanceStatus.ABSENT_APPROVED_A,
        source: 'MANUAL',
        created_by_id: adminId,
      },
    });
  });

  afterAll(async () => {
    // Teardown test data
    await prisma.importCreateRequest.deleteMany({
      where: { external_id: { in: ['HV_WB_001', 'HV_WB_NEW', 'HV_WB_CS1'] } },
    });
    await prisma.attendance.deleteMany({
      where: {
        enrollment_class: {
          enrollment: {
            student: { external_id: { in: ['HV_WB_001', 'HV_WB_NEW', 'HV_WB_CS1'] } },
          },
        },
      },
    });
    await prisma.classSession.deleteMany({
      where: { class: { class_code: { in: ['CLS_TEACHER_WB', 'Lớp Test WB'] } } },
    });
    await prisma.classTeacher.deleteMany({
      where: { teacher_id: teacherId },
    });
    await prisma.enrollmentClass.deleteMany({
      where: {
        enrollment: {
          student: { external_id: { in: ['HV_WB_001', 'HV_WB_NEW', 'HV_WB_CS1'] } },
        },
      },
    });
    await prisma.class.deleteMany({
      where: { class_code: { in: ['CLS_TEACHER_WB', 'Lớp Test WB'] } },
    });
    await prisma.enrollment.deleteMany({
      where: {
        student: { external_id: { in: ['HV_WB_001', 'HV_WB_NEW', 'HV_WB_CS1'] } },
      },
    });
    await prisma.student.deleteMany({
      where: { external_id: { in: ['HV_WB_001', 'HV_WB_NEW', 'HV_WB_CS1'] } },
    });
    await prisma.package.deleteMany({
      where: { code: { in: ['PKG_WB_1'] } },
    });
    await prisma.sale.deleteMany({
      where: { code: { in: ['SALE_WB_01', 'SALE_WB_02', 'SALE_ORIG'] } },
    });
    await prisma.importRow.deleteMany({
      where: { import_batch: { uploaded_by_id: { in: [adminId, csId, cs2Id, teacherId] } } },
    });
    await prisma.importBatch.deleteMany({
      where: { uploaded_by_id: { in: [adminId, csId, cs2Id, teacherId] } },
    });
    await prisma.auditLog.deleteMany({
      where: { user_id: { in: [adminId, csId, cs2Id, teacherId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, csId, cs2Id, teacherId] } },
    });
    await prisma.$disconnect();
  });

  const createWorkbookBuffer = async () => {
    const wb = new ExcelJS.Workbook();

    // Sheet 1: 1.Chăm sóc
    const ws1 = wb.addWorksheet('1.Chăm sóc');
    ws1.addRow(['ID', 'Lớp', 'Ngày bắt đầu', 'Ngày kết thúc', 'Họ tên', 'Tình trạng', 'SĐT', 'Email', 'Gói học', 'Sale']);
    // Row 2: Overwrite existing student HV_WB_001; email is empty to test nullify! Sale code: SALE_WB_01
    ws1.addRow(['HV_WB_001', 'Lớp Teacher WB Assigned', '2026-09-01', '2026-12-01', 'HV WB 001 Overwritten', 'Đang học', '0911111111', '', 'PKG_WB_1', 'SALE_WB_01']);
    // Row 3: Brand new student HV_WB_NEW -> Should be CREATE directly! Sale code: SALE_WB_02
    ws1.addRow(['HV_WB_NEW', 'Lớp Teacher WB Assigned', '2026-09-01', '2026-12-01', 'HV WB New Direct', 'Đang học', '0922222222', 'new@example.com', 'PKG_WB_1', 'SALE_WB_02']);

    // Sheet 3: 3.Chấm buổi
    const ws3 = wb.addWorksheet('3.Chấm buổi');
    ws3.addRow(['ID', 'Họ tên', 'Gói', 'Lớp', '2026-09-01', '2026-09-02']);
    // Row 2: Attendance for HV_WB_001: 2026-09-01 is 'X', 2026-09-02 is empty (must preserve old A!)
    ws3.addRow(['HV_WB_001', 'HV WB 001 Overwritten', 'PKG_WB_1', 'Lớp Teacher WB Assigned', 'X', '']);
    // Row 3: Attendance for HV_WB_NEW
    ws3.addRow(['HV_WB_NEW', 'HV WB New Direct', 'PKG_WB_1', 'Lớp Teacher WB Assigned', 'X', 'B']);

    return await wb.xlsx.writeBuffer();
  };

  it('Admin: uploads workbook with assigned_cs_id, creates Sale table records and links sale_id', async () => {
    const buffer = await createWorkbookBuffer();

    const uploadRes = await request(app)
      .post('/api/v1/imports/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('assigned_cs_id', csId)
      .attach('file', Buffer.from(buffer), 'cham_soc_test.xlsx');

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.importType).toBe('WORKBOOK');
    expect(uploadRes.body.assignedCsId).toBe(csId);

    const importId = uploadRes.body.importId;

    // Validate
    const validateRes = await request(app)
      .post(`/api/v1/imports/${importId}/validate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assigned_cs_id: csId });

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.summary).toBeDefined();
    expect(validateRes.body.summary.willUpdate).toBe(1);
    expect(validateRes.body.summary.willCreate).toBe(1);
    expect(validateRes.body.summary.invalid).toBe(0);

    const updateItem = validateRes.body.items.find((i: any) => i.externalId === 'HV_WB_001');
    expect(updateItem.classification).toBe('UPDATE');

    const createItem = validateRes.body.items.find((i: any) => i.externalId === 'HV_WB_NEW');
    expect(createItem.classification).toBe('CREATE');

    // Confirm
    const confirmRes = await request(app)
      .post(`/api/v1/imports/${importId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ skipErrors: true, assigned_cs_id: csId });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('COMPLETED');
    expect(confirmRes.body.success_rows).toBe(2);

    // Verify DB: Sale record creation and linking
    const sale1 = await prisma.sale.findUnique({ where: { code: 'SALE_WB_01' } });
    expect(sale1).toBeDefined();
    expect(sale1?.code).toBe('SALE_WB_01');

    const sale2 = await prisma.sale.findUnique({ where: { code: 'SALE_WB_02' } });
    expect(sale2).toBeDefined();
    expect(sale2?.code).toBe('SALE_WB_02');

    // Check Enrollment has sale_id linked and cs_id assigned
    const enr1 = await prisma.enrollment.findFirst({
      where: { external_id: 'HV_WB_001' },
      include: { sale: true },
    });
    expect(enr1?.sale_id).toBe(sale1?.id);
    expect(enr1?.sale_name).toBe('SALE_WB_01');
    expect(enr1?.cs_id).toBe(csId);

    const enr2 = await prisma.enrollment.findFirst({
      where: { external_id: 'HV_WB_NEW' },
      include: { sale: true },
    });
    expect(enr2?.sale_id).toBe(sale2?.id);
    expect(enr2?.sale_name).toBe('SALE_WB_02');
    expect(enr2?.cs_id).toBe(csId);

    // Verify Attendance preserved
    const attendances = await prisma.attendance.findMany({
      where: {
        enrollment_class: {
          enrollment: { student: { external_id: 'HV_WB_001' } },
        },
      },
      include: { class_session: true },
    });

    const session1Attendance = attendances.find((a) => a.class_session.session_date.toISOString().startsWith('2026-09-01'));
    expect(session1Attendance?.status).toBe('ATTENDED');

    const session2Attendance = attendances.find((a) => a.class_session.session_date.toISOString().startsWith('2026-09-02'));
    expect(session2Attendance?.status).toBe('ABSENT_APPROVED_A');
  });

  it('CS Role: uploads new student and own student, automatically assigned to CS actor', async () => {
    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('1.Chăm sóc');
    ws1.addRow(['ID', 'Lớp', 'Ngày bắt đầu', 'Ngày kết thúc', 'Họ tên', 'Tình trạng', 'SĐT', 'Email', 'Gói học', 'Sale']);
    // Own existing student HV_WB_001
    ws1.addRow(['HV_WB_001', 'Lớp Teacher WB Assigned', '2026-09-01', '2026-12-01', 'HV WB 001 CS1 Own', 'Đang học', '0911111111', '', 'PKG_WB_1', 'SALE_WB_01']);
    // New student HV_WB_CS1
    ws1.addRow(['HV_WB_CS1', 'Lớp Teacher WB Assigned', '2026-09-01', '2026-12-01', 'HV WB CS1 Direct', 'Đang học', '0944444444', 'cs1@example.com', 'PKG_WB_1', 'SALE_WB_01']);

    const ws3 = wb.addWorksheet('3.Chấm buổi');
    ws3.addRow(['ID', 'Họ tên', 'Gói', 'Lớp']);
    ws3.addRow(['HV_WB_001', 'HV WB 001 CS1 Own', 'PKG_WB_1', 'Lớp Teacher WB Assigned']);
    ws3.addRow(['HV_WB_CS1', 'HV WB CS1 Direct', 'PKG_WB_1', 'Lớp Teacher WB Assigned']);

    const buffer = await wb.xlsx.writeBuffer();

    const uploadRes = await request(app)
      .post('/api/v1/imports/upload')
      .set('Authorization', `Bearer ${csToken}`)
      .attach('file', Buffer.from(buffer), 'cs1_upload.xlsx');

    expect(uploadRes.status).toBe(200);
    const importId = uploadRes.body.importId;

    const valRes = await request(app)
      .post(`/api/v1/imports/${importId}/validate`)
      .set('Authorization', `Bearer ${csToken}`);

    expect(valRes.status).toBe(200);
    expect(valRes.body.summary.willUpdate).toBe(1);
    expect(valRes.body.summary.willCreate).toBe(1);
    expect(valRes.body.summary.willTransfer).toBe(0);

    await request(app)
      .post(`/api/v1/imports/${importId}/confirm`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({ skipErrors: true });

    // Verify HV_WB_CS1 assigned to CS1
    const enrCS1 = await prisma.enrollment.findFirst({
      where: { external_id: 'HV_WB_CS1' },
    });
    expect(enrCS1).toBeDefined();
    expect(enrCS1?.cs_id).toBe(csId);
  });

  it('CS Role: uploads student owned by OTHER CS -> Triggers REQUEST_TRANSFER and Admin can approve', async () => {
    // CS2 tries to upload HV_WB_001 (which is currently owned by CS1)
    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('1.Chăm sóc');
    ws1.addRow(['ID', 'Lớp', 'Ngày bắt đầu', 'Ngày kết thúc', 'Họ tên', 'Tình trạng', 'SĐT', 'Email', 'Gói học', 'Sale']);
    ws1.addRow(['HV_WB_001', 'Lớp Teacher WB Assigned', '2026-09-01', '2026-12-01', 'HV WB 001 Transfer Attempt', 'Đang học', '0911111111', '', 'PKG_WB_1', 'SALE_WB_01']);

    const ws3 = wb.addWorksheet('3.Chấm buổi');
    ws3.addRow(['ID', 'Họ tên', 'Gói', 'Lớp']);
    ws3.addRow(['HV_WB_001', 'HV WB 001 Transfer Attempt', 'PKG_WB_1', 'Lớp Teacher WB Assigned']);

    const buffer = await wb.xlsx.writeBuffer();

    const uploadRes = await request(app)
      .post('/api/v1/imports/upload')
      .set('Authorization', `Bearer ${cs2Token}`)
      .attach('file', Buffer.from(buffer), 'cs2_transfer_test.xlsx');

    expect(uploadRes.status).toBe(200);
    const importId = uploadRes.body.importId;

    const valRes = await request(app)
      .post(`/api/v1/imports/${importId}/validate`)
      .set('Authorization', `Bearer ${cs2Token}`);

    expect(valRes.status).toBe(200);
    expect(valRes.body.summary.willTransfer).toBe(1);

    const item = valRes.body.items.find((i: any) => i.externalId === 'HV_WB_001');
    expect(item.classification).toBe('REQUEST_TRANSFER');
    expect(item.warnings.some((w: string) => w.includes('điều chuyển'))).toBe(true);

    // Confirm: Creates pending ImportCreateRequest for transfer
    const confirmRes = await request(app)
      .post(`/api/v1/imports/${importId}/confirm`)
      .set('Authorization', `Bearer ${cs2Token}`)
      .send({ skipErrors: true });

    expect(confirmRes.status).toBe(200);

    // Check pending request in database
    const transferRequest = await prisma.importCreateRequest.findFirst({
      where: {
        external_id: 'HV_WB_001',
        package_code: 'PKG_WB_1',
        status: 'PENDING',
      },
    });
    expect(transferRequest).toBeDefined();
    expect(transferRequest?.requested_by_id).toBe(cs2Id);
    expect(transferRequest?.assigned_cs_id).toBe(cs2Id);

    // Prior to approval, enrollment is still owned by CS1
    const beforeApproval = await prisma.enrollment.findFirst({ where: { external_id: 'HV_WB_001' } });
    expect(beforeApproval?.cs_id).toBe(csId);

    // Admin approves the transfer request!
    const approveRes = await request(app)
      .post(`/api/v1/imports/create-requests/${transferRequest!.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ version: transferRequest!.version, assignedCsId: cs2Id });

    expect(approveRes.status).toBe(200);

    // After approval, enrollment cs_id is transferred to CS2!
    const afterApproval = await prisma.enrollment.findFirst({ where: { external_id: 'HV_WB_001' } });
    expect(afterApproval?.cs_id).toBe(cs2Id);
  });

  it('Teacher Role: skips attendance outside assigned classes', async () => {
    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('1.Chăm sóc');
    ws1.addRow(['ID', 'Lớp', 'Ngày bắt đầu', 'Ngày kết thúc', 'Họ tên', 'Tình trạng', 'SĐT', 'Email', 'Gói học', 'Sale']);
    ws1.addRow(['HV_WB_001', 'Lớp Unassigned Teacher', '2026-09-01', '2026-12-01', 'HV WB 001', 'Đang học', '0911111111', '', 'PKG_WB_1', 'SALE_WB_01']);

    const ws3 = wb.addWorksheet('3.Chấm buổi');
    ws3.addRow(['ID', 'Họ tên', 'Gói', 'Lớp', '2026-09-01']);
    ws3.addRow(['HV_WB_001', 'HV WB 001', 'PKG_WB_1', 'Lớp Unassigned Teacher', 'X']);

    const buffer = await wb.xlsx.writeBuffer();

    const uploadRes = await request(app)
      .post('/api/v1/imports/upload')
      .set('Authorization', `Bearer ${teacherToken}`)
      .attach('file', Buffer.from(buffer), 'teacher_scope_test.xlsx');

    expect(uploadRes.status).toBe(200);
    const importId = uploadRes.body.importId;

    const valRes = await request(app)
      .post(`/api/v1/imports/${importId}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(valRes.status).toBe(200);
    expect(valRes.body.summary.skippedOutOfScope).toBe(1);

    const item = valRes.body.items.find((i: any) => i.externalId === 'HV_WB_001');
    expect(item.classification).toBe('SKIPPED_SCOPE');
    expect(item.warnings.some((w: string) => w.includes('phân công'))).toBe(true);
  });
});
