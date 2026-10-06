import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { AttendanceStatus, ReconciliationState, ClassModelType, EnrollmentStatus, EnrollmentClassStatus, AttendanceSource } from '@prisma/client';
import ExcelJS from 'exceljs';

describe('Two-Party Attendance Reconciliation Integration Tests', () => {
  let adminToken: string;
  let adminId: number;

  let csUser: any;
  let csToken: string;

  let otherCsUser: any;
  let otherCsToken: string;

  let teacherUser: any;
  let teacherToken: string;

  let student: any;
  let pkg: any;
  let enrollment: any;
  let testClass: any;
  let ec: any;
  let session1: any;
  let session2: any;
  let attendance1: any;
  let attendance2: any;

  beforeAll(async () => {
    // 1. Users
    const admin = await prisma.user.upsert({
      where: { email: 'admin_recon_test@example.com' },
      update: {},
      create: {
        email: 'admin_recon_test@example.com',
        name: 'Admin Recon',
        password_hash: 'hash',
        roles: ['ADMIN'],
      },
    });
    adminId = admin.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    csUser = await prisma.user.upsert({
      where: { email: 'cs_recon_test@example.com' },
      update: {},
      create: {
        email: 'cs_recon_test@example.com',
        name: 'CS Recon Assigned',
        password_hash: 'hash',
        roles: ['CS'],
      },
    });
    csToken = signTestToken(csUser.id, ['CS']);

    otherCsUser = await prisma.user.upsert({
      where: { email: 'other_cs_recon_test@example.com' },
      update: {},
      create: {
        email: 'other_cs_recon_test@example.com',
        name: 'Other CS Recon',
        password_hash: 'hash',
        roles: ['CS'],
      },
    });
    otherCsToken = signTestToken(otherCsUser.id, ['CS']);

    teacherUser = await prisma.user.upsert({
      where: { email: 'teacher_recon_test@example.com' },
      update: {},
      create: {
        email: 'teacher_recon_test@example.com',
        name: 'Teacher Recon',
        password_hash: 'hash',
        roles: ['TEACHER'],
      },
    });
    teacherToken = signTestToken(teacherUser.id, ['TEACHER']);

    const teacherRec = await prisma.teacher.upsert({
      where: { code: 'GV_RECON_99' },
      update: {},
      create: {
        user_id: teacherUser.id,
        code: 'GV_RECON_99',
        name: 'Teacher Recon Test',
        active: true,
      },
    });

    // 2. Student & Enrollment
    student = await prisma.student.upsert({
      where: { external_id: 'HV_RECON_001' },
      update: {},
      create: {
        external_id: 'HV_RECON_001',
        full_name: 'Nguyen Van Recon',
        phone: '0988776655',
      },
    });

    pkg = await prisma.package.upsert({
      where: { code: 'PKG_RECON_1' },
      update: {},
      create: {
        code: 'PKG_RECON_1',
        name: 'Gói Kaiwa Recon',
        default_total_sessions: 30,
      },
    });

    enrollment = await prisma.enrollment.create({
      data: {
        student_id: student.id,
        package_id: pkg.id,
        cs_id: csUser.id,
        status: EnrollmentStatus.STUDYING,
        total_sessions: 30,
      },
    });

    testClass = await prisma.class.create({
      data: {
        class_name: 'Lớp 1-1 Recon Test',
        class_code: 'CLS_RECON_1',
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: 'LEARNING_SYSTEM',
      },
    });

    await prisma.classTeacher.create({
      data: {
        class_id: testClass.id,
        teacher_id: teacherRec.id,
        role: 'MAIN',
        active: true,
      },
    });

    ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollment.id,
        class_id: testClass.id,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });

    session1 = await prisma.classSession.create({
      data: {
        class_id: testClass.id,
        session_number: 1,
        session_date: new Date('2026-10-01T00:00:00Z'),
        created_by_id: adminId,
      },
    });

    session2 = await prisma.classSession.create({
      data: {
        class_id: testClass.id,
        session_number: 2,
        session_date: new Date('2026-10-03T00:00:00Z'),
        created_by_id: adminId,
      },
    });

    attendance1 = await prisma.attendance.create({
      data: {
        enrollment_class_id: ec.id,
        class_session_id: session1.id,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
      },
    });

    attendance2 = await prisma.attendance.create({
      data: {
        enrollment_class_id: ec.id,
        class_session_id: session2.id,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
      },
    });
  });

  afterAll(async () => {
    await prisma.attendance.deleteMany({
      where: { enrollment_class_id: ec.id },
    });
    await prisma.classSession.deleteMany({
      where: { class_id: testClass.id },
    });
    await prisma.classTeacher.deleteMany({
      where: { class_id: testClass.id },
    });
    await prisma.enrollmentClass.deleteMany({
      where: { enrollment_id: enrollment.id },
    });
    await prisma.enrollment.deleteMany({
      where: { id: enrollment.id },
    });
    await prisma.student.deleteMany({
      where: { id: student.id },
    });
    await prisma.class.deleteMany({
      where: { id: testClass.id },
    });
    await prisma.package.deleteMany({
      where: { id: pkg.id },
    });
    await prisma.teacher.deleteMany({
      where: { user_id: teacherUser.id },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'admin_recon_test@example.com',
            'cs_recon_test@example.com',
            'other_cs_recon_test@example.com',
            'teacher_recon_test@example.com',
          ],
        },
      },
    });
    await prisma.$disconnect();
  });

  it('Flow 1: Teacher marks attendance -> PENDING_CS; then CS marks identical -> MATCHED', async () => {
    // 1. Teacher marks ATTENDED with lesson topic 'Kaiwa 2 Bài 4'
    const teacherRes = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance1.id}/teacher-mark`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        status: AttendanceStatus.ATTENDED,
        lessonTopic: 'Kaiwa 2 Bài 4',
        rawValue: 'HV_RECON_001-K2 L4',
        sessionCount: 1,
      });

    expect(teacherRes.status).toBe(200);
    expect(teacherRes.body.data.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    expect(teacherRes.body.data.teacher_status).toBe(AttendanceStatus.ATTENDED);
    expect(teacherRes.body.data.lesson_topic).toBe('Kaiwa 2 Bài 4');

    // Verify in pending list
    const pendingRes = await request(app)
      .get('/api/v1/attendance-reconciliation/pending')
      .set('Authorization', `Bearer ${csToken}`);
    expect(pendingRes.status).toBe(200);
    const itemInPending = pendingRes.body.data.items.find((i: any) => i.id === attendance1.id);
    expect(itemInPending).toBeDefined();

    // 2. CS marks identical status ATTENDED
    const csRes = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance1.id}/cs-mark`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({
        status: AttendanceStatus.ATTENDED,
        sessionCount: 1,
      });

    expect(csRes.status).toBe(200);
    expect(csRes.body.data.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(csRes.body.data.status).toBe(AttendanceStatus.ATTENDED);
  });

  it('Flow 2: Teacher marks ATTENDED, CS marks ABSENT_UNAPPROVED_C -> CONFLICT; unassigned CS cannot resolve', async () => {
    // 1. Teacher marks ATTENDED
    await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance2.id}/teacher-mark`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        status: AttendanceStatus.ATTENDED,
        rawValue: 'HV_RECON_001-K2 L5',
      });

    // 2. CS marks conflicting status ABSENT_UNAPPROVED_C
    const csRes = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance2.id}/cs-mark`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({
        status: AttendanceStatus.ABSENT_UNAPPROVED_C,
        note: 'Học viên không vào lớp, không liên lạc được',
      });

    expect(csRes.status).toBe(200);
    expect(csRes.body.data.reconciliation_state).toBe(ReconciliationState.CONFLICT);

    // 3. Verify record appears in conflicts list
    const conflictsRes = await request(app)
      .get('/api/v1/attendance-reconciliation/conflicts')
      .set('Authorization', `Bearer ${csToken}`);
    expect(conflictsRes.status).toBe(200);
    const conflictItem = conflictsRes.body.data.items.find((i: any) => i.id === attendance2.id);
    expect(conflictItem).toBeDefined();

    // 4. Other CS (unassigned) attempts to resolve -> 403 Forbidden
    const unauthResolveRes = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance2.id}/resolve-conflict`)
      .set('Authorization', `Bearer ${otherCsToken}`)
      .send({
        finalStatus: AttendanceStatus.ABSENT_APPROVED_A,
        resolutionNote: 'Giải quyết hộ',
      });
    expect(unauthResolveRes.status).toBe(403);

    // 5. Assigned CS resolves with mandatory note -> 200 OK, RESOLVED
    const validResolveRes = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance2.id}/resolve-conflict`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({
        finalStatus: AttendanceStatus.ABSENT_APPROVED_A,
        resolutionNote: 'Học viên đã nhắn tin xin phép trước 2 tiếng qua Zalo nhưng GV chưa đọc',
      });
    expect(validResolveRes.status).toBe(200);
    expect(validResolveRes.body.data.reconciliation_state).toBe(ReconciliationState.RESOLVED);
    expect(validResolveRes.body.data.status).toBe(AttendanceStatus.ABSENT_APPROVED_A);
    expect(validResolveRes.body.data.resolution_note).toBe(
      'Học viên đã nhắn tin xin phép trước 2 tiếng qua Zalo nhưng GV chưa đọc'
    );
  });

  it('Flow 3: Bulk approve pending teacher attendances', async () => {
    // Create new session & attendance
    const session3 = await prisma.classSession.create({
      data: {
        class_id: testClass.id,
        session_number: 3,
        session_date: new Date('2026-10-05T00:00:00Z'),
        created_by_id: adminId,
      },
    });

    const attendance3 = await prisma.attendance.create({
      data: {
        enrollment_class_id: ec.id,
        class_session_id: session3.id,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        teacher_status: AttendanceStatus.ATTENDED,
        reconciliation_state: ReconciliationState.PENDING_CS,
        created_by_id: teacherUser.id,
      },
    });

    const bulkRes = await request(app)
      .post('/api/v1/attendance-reconciliation/bulk-approve')
      .set('Authorization', `Bearer ${csToken}`)
      .send({
        attendanceIds: [attendance3.id],
      });

    expect(bulkRes.status).toBe(200);
    expect(bulkRes.body.data.approvedCount).toBe(1);

    const check = await prisma.attendance.findUnique({ where: { id: attendance3.id } });
    expect(check?.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(check?.status).toBe(AttendanceStatus.ATTENDED);
    expect(check?.cs_status).toBe(AttendanceStatus.ATTENDED);

    // Clean up session3 & attendance3
    await prisma.attendance.delete({ where: { id: attendance3.id } });
    await prisma.classSession.delete({ where: { id: session3.id } });
  });

  it('Flow 4: Teacher uploads Excel schedule file (giao_vien.xlsx structure)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('2026 スケジュール');

    // Row 1: numbering
    ws.addRow([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    // Row 2: Headers with Date columns
    ws.addRow([
      'Mô hình lớp',
      'Mã học viên/Mã lớp',
      'Họ tên học viên',
      'Tổng số buổi',
      'Số buổi còn lại',
      'Thời gian',
      'Số giờ hoàn thành',
      'Số buổi học thành công',
      'A',
      'B',
      'C',
      'D',
      'E',
      '2026-10-10',
    ]);
    // Row 3: Student row with attendance cell 'HV_RECON_001-K2 L6'
    ws.addRow([
      '1-1',
      'HV_RECON_001',
      'Nguyen Van Recon',
      30,
      25,
      '19:00 - 19:30',
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      'HV_RECON_001-K2 L6',
    ]);

    const buffer = await wb.xlsx.writeBuffer();

    const uploadRes = await request(app)
      .post('/api/v1/attendance-reconciliation/upload-teacher-excel')
      .set('Authorization', `Bearer ${teacherToken}`)
      .attach('file', Buffer.from(buffer), 'giao_vien_test.xlsx');

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.data.processedCount).toBeGreaterThanOrEqual(1);

    // Verify session and attendance created
    const createdSession = await prisma.classSession.findFirst({
      where: {
        class_id: testClass.id,
        session_date: new Date('2026-10-10T00:00:00Z'),
      },
      include: { attendance: true },
    });

    expect(createdSession).toBeDefined();
    expect(createdSession?.start_time).toBe('19:00');
    expect(createdSession?.end_time).toBe('19:30');
    expect(createdSession?.attendance[0]?.teacher_status).toBe(AttendanceStatus.ATTENDED);
    expect(createdSession?.attendance[0]?.lesson_topic).toBe('K2 L6');

    // Clean up
    await prisma.attendance.deleteMany({
      where: { class_session_id: createdSession!.id },
    });
    await prisma.classSession.delete({
      where: { id: createdSession!.id },
    });
  });
});
