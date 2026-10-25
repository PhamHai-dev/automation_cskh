// ACCEPTANCE (gate before merge): end-to-end attendance flow through the real
// HTTP API + DB (.env.test database automation_cskh_test), pinning the CURRENT
// contract:
//   1. GV (TEACHER) creates two sessions the SAME day for one enrollment via
//      POST /classes/:classId/sessions/actual (per-intent idempotency key;
//      each mints its own session + neutral skeleton attendance).
//   2. GV marks both; CVHT (assigned CS) confirms one via cs-mark -> MATCHED
//      (FINAL). The other is made to differ -> CONFLICT; Admin resolves
//      (D2: resolve-conflict is ADMIN-only) -> RESOLVED (FINAL).
//   3. Re-read: dashboard reader counts both finals and the entitlement
//      calculator (modules/enrollments/enrollment-entitlement.ts, Q-002)
//      consumes 2 (ATTENDED and ABSENT_UNAPPROVED_C both consume; each FINAL
//      row = exactly 1 session — two deliberate same-day finals count 2).
//   4. Roles outside scope get 403 at API level: CS who is not the enrollment
//      owner, MANAGE outside the CS's group, TEACHER whose assignment is not
//      effective at the session date (D8 window).
// Outbound channels: the BullMQ adapter is jest-module-mocked (same idiom as
// automation-session-number.test.ts) so NO queue job/Redis write can occur in
// this suite; delivery rows are DB-only observations. No worker is started.

jest.mock('../../automation/automation-bullmq-adapter', () => ({
  enqueueDelivery: jest.fn().mockResolvedValue(null),
  cancelDelivery: jest.fn().mockResolvedValue(undefined),
  closeAutomationQueue: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import {
  AttendanceStatus,
  ReconciliationState,
  ClassModelType,
  EnrollmentStatus,
  EnrollmentClassStatus,
  AttendanceSource,
} from '@prisma/client';
import { calculateEnrollmentEntitlement, isConsumedAttendance } from '../../enrollments/enrollment-entitlement';

const E2E = 'acc_e2e_20261025';
const emails = {
  admin: `admin_${E2E}@example.com`,
  cs: `cs_${E2E}@example.com`,
  foreignCs: `foreign_cs_${E2E}@example.com`,
  manage: `manage_${E2E}@example.com`,
  teacher: `teacher_${E2E}@example.com`,
};

describe('Acceptance: E2E attendance flow (GV actual sessions -> CVHT -> conflict -> Admin resolve -> readers)', () => {
  let adminId: number, csId: number, foreignCsId: number, manageId: number, teacherUserId: number, teacherRecId: number;
  let adminToken: string, csToken: string, foreignCsToken: string, manageToken: string, teacherToken: string;
  let studentId: number, packageId: number, enrollmentId: number, classId: number, ecId: number;
  let sessionAId: number, sessionBId: number;
  let attendanceAId: number, attendanceBId: number;
  let otherClassId: number | null = null;

  async function createActualSession(idemKey: string, startTime: string, endTime: string) {
    const res = await request(app)
      .post(`/api/v1/classes/${classId}/sessions/actual`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        idempotency_key: idemKey,
        enrollment_class_id: ecId,
        session_date: '2026-10-20',
        start_time: startTime,
        end_time: endTime,
      });
    expect(res.status).toBe(201);
    return res.body.data as { id: number; attendance: Array<{ id: number }> };
  }

  beforeAll(async () => {
    const admin = await prisma.user.create({ data: { email: emails.admin, name: 'E2E Admin', password_hash: 'x', roles: ['ADMIN'] } });
    const cs = await prisma.user.create({ data: { email: emails.cs, name: 'E2E CVHT', password_hash: 'x', roles: ['CS'] } });
    const foreignCs = await prisma.user.create({ data: { email: emails.foreignCs, name: 'E2E Foreign CVHT', password_hash: 'x', roles: ['CS'] } });
    const manage = await prisma.user.create({ data: { email: emails.manage, name: 'E2E MANAGE', password_hash: 'x', roles: ['MANAGE'] } });
    const teacherUser = await prisma.user.create({ data: { email: emails.teacher, name: 'E2E Teacher', password_hash: 'x', roles: ['TEACHER'] } });
    adminId = admin.id; csId = cs.id; foreignCsId = foreignCs.id; manageId = manage.id; teacherUserId = teacherUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);
    csToken = signTestToken(csId, ['CS']);
    foreignCsToken = signTestToken(foreignCsId, ['CS']);
    manageToken = signTestToken(manageId, ['MANAGE']);
    teacherToken = signTestToken(teacherUserId, ['TEACHER']);

    const teacherRec = await prisma.teacher.create({
      data: { user_id: teacherUserId, code: `GV_${E2E}`, name: 'E2E Teacher Rec', active: true },
    });
    teacherRecId = teacherRec.id;

    const student = await prisma.student.create({ data: { external_id: `HV_${E2E}`, full_name: 'E2E Learner' } });
    studentId = student.id;
    const pkg = await prisma.package.create({ data: { code: `PKG_${E2E}`, name: 'E2E Package', default_total_sessions: 10 } });
    packageId = pkg.id;
    const enrollment = await prisma.enrollment.create({
      data: { student_id: studentId, package_id: packageId, cs_id: csId, total_sessions: 10, status: EnrollmentStatus.STUDYING },
    });
    enrollmentId = enrollment.id;

    const cls = await prisma.class.create({
      data: { class_name: `Lớp E2E ${E2E}`, class_code: `CLS_${E2E}`, model_type: ClassModelType.ONE_TO_ONE, attendance_source: 'LEARNING_SYSTEM' },
    });
    classId = cls.id;
    await prisma.classTeacher.create({
      data: { class_id: classId, teacher_id: teacherRecId, role: 'MAIN', active: true, start_date: new Date('2026-09-01T00:00:00Z'), end_date: new Date('2026-10-31T00:00:00Z') },
    });
    const ec = await prisma.enrollmentClass.create({
      data: { enrollment_id: enrollmentId, class_id: classId, sequence_no: 1, status: EnrollmentClassStatus.ACTIVE },
    });
    ecId = ec.id;
  });

  afterAll(async () => {
    // Children before users (RESTRICT edges: attendances.created_by_id,
    // class_sessions.created_by_id, enrollments.cs_id, audit_logs.user_id,
    // message_deliveries.* -> attendance, care_logs.cs_id...).
    const attendanceIds = (await prisma.attendance.findMany({
      where: { enrollment_class: { enrollment_id: enrollmentId } },
      select: { id: true },
    })).map((a) => a.id);
    if (attendanceIds.length > 0) {
      await prisma.messageDelivery.deleteMany({ where: { attendance_id: { in: attendanceIds } } });
    }
    await prisma.attendance.deleteMany({ where: { enrollment_class: { enrollment_id: enrollmentId } } });
    const fixtureClassIds = [classId, ...(otherClassId ? [otherClassId] : [])];
    await prisma.classSession.deleteMany({ where: { class_id: { in: fixtureClassIds } } });
    await prisma.classTeacher.deleteMany({ where: { class_id: { in: fixtureClassIds } } });
    await prisma.enrollmentClass.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.careLog.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.careTask.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.enrollment.deleteMany({ where: { id: enrollmentId } });
    await prisma.student.deleteMany({ where: { id: studentId } });
    await prisma.class.deleteMany({ where: { id: { in: fixtureClassIds } } });
    await prisma.teacher.deleteMany({ where: { id: teacherRecId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    const userIds = [adminId, csId, foreignCsId, manageId, teacherUserId];
    await prisma.automationStep.deleteMany({ where: { workflow: { owner_cs_id: { in: userIds } } } });
    await prisma.automationWorkflow.deleteMany({ where: { owner_cs_id: { in: userIds } } });
    await prisma.authSession.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('GV creates two same-day sessions via /actual (skeletons, teacher lane open)', async () => {
    const a = await createActualSession(`${E2E}-A-1`, '19:00', '19:30');
    sessionAId = a.id;
    attendanceAId = a.attendance[0].id;
    const b = await createActualSession(`${E2E}-B-1`, '20:00', '20:30');
    sessionBId = b.id;
    attendanceBId = b.attendance[0].id;
    expect(attendanceAId).not.toBe(attendanceBId);

    const rows = await prisma.attendance.findMany({ where: { id: { in: [attendanceAId, attendanceBId] } } });
    // Neutral skeleton: no teacher claim yet, PENDING_TEACHER.
    for (const row of rows) {
      expect(row.teacher_status).toBeNull();
      expect(row.cs_status).toBeNull();
      expect(row.reconciliation_state).toBe(ReconciliationState.PENDING_TEACHER);
    }
  });

  it('role-scope 403s: foreign CVHT, out-of-group MANAGE, teacher outside assignment window', async () => {
    // CS who is not the enrollment owner cannot record the CVHT opinion.
    const foreign = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceAId}/cs-mark`)
      .set('Authorization', `Bearer ${foreignCsToken}`)
      .send({ status: AttendanceStatus.ATTENDED });
    expect(foreign.status).toBe(403);

    // MANAGE without a group assignment covering this enrollment's CS is out of scope.
    const manage = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceAId}/cs-mark`)
      .set('Authorization', `Bearer ${manageToken}`)
      .send({ status: AttendanceStatus.ATTENDED });
    expect(manage.status).toBe(403);

    // D8: teacher assignment must be effective AT THE SESSION DATE. Create a
    // second class whose assignment ended before the session date, then have
    // the teacher mark there.
    const otherClass = await prisma.class.create({
      data: { class_name: `Lớp E2E Expired ${E2E}`, class_code: `CLSEXP_${E2E}`, model_type: ClassModelType.ONE_TO_ONE, attendance_source: 'LEARNING_SYSTEM' },
    });
    otherClassId = otherClass.id;
    await prisma.classTeacher.create({
      data: { class_id: otherClass.id, teacher_id: teacherRecId, role: 'MAIN', active: true, start_date: new Date('2026-01-01T00:00:00Z'), end_date: new Date('2026-06-30T00:00:00Z') },
    });
    const otherEc = await prisma.enrollmentClass.create({
      data: { enrollment_id: enrollmentId, class_id: otherClass.id, sequence_no: 2, status: EnrollmentClassStatus.ACTIVE },
    });
    const otherSession = await prisma.classSession.create({
      data: { class_id: otherClass.id, session_number: 1, session_date: new Date('2026-10-20T00:00:00Z'), created_by_id: adminId },
    });
    const expiredAttendance = await prisma.attendance.create({
      data: {
        enrollment_class_id: otherEc.id,
        class_session_id: otherSession.id,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
        reconciliation_state: ReconciliationState.PENDING_TEACHER,
      },
    });
    const expired = await request(app)
      .post(`/api/v1/attendance-reconciliation/${expiredAttendance.id}/teacher-mark`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: AttendanceStatus.ATTENDED });
    expect(expired.status).toBe(403);

    // CS not self-resolving a conflict is covered in the resolve step below;
    // here also pin that only ADMIN may enter the resolve route at all.
    const csOnResolveRoute = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceAId}/resolve-conflict`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({ finalStatus: AttendanceStatus.ATTENDED, resolutionNote: 'thử phân xử' });
    expect(csOnResolveRoute.status).toBe(403);
  });

  it('GV marks both -> CVHT confirms one (MATCHED) -> other differs (CONFLICT) -> Admin resolves (RESOLVED)', async () => {
    // GV teacher-marks both same-day sessions.
    for (const id of [attendanceAId, attendanceBId]) {
      const r = await request(app)
        .post(`/api/v1/attendance-reconciliation/${id}/teacher-mark`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ status: AttendanceStatus.ATTENDED, lessonTopic: 'E2E buổi cùng ngày' });
      expect(r.status).toBe(200);
      expect(r.body.data.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    }

    // CVHT confirms session A identically -> MATCHED (FINAL).
    const confirmA = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceAId}/cs-mark`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({ status: AttendanceStatus.ATTENDED });
    expect(confirmA.status).toBe(200);
    expect(confirmA.body.data.reconciliation_state).toBe(ReconciliationState.MATCHED);

    // Session B differs: CVHT records ABSENT_UNAPPROVED_C -> CONFLICT (provisional).
    const confirmB = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceBId}/cs-mark`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({ status: AttendanceStatus.ABSENT_UNAPPROVED_C, note: 'Không vào lớp, không liên lạc được' });
    expect(confirmB.status).toBe(200);
    expect(confirmB.body.data.reconciliation_state).toBe(ReconciliationState.CONFLICT);

    // A provisional CONFLICT row is not consumed by the entitlement reader yet.
    const midEntitlement = await entitlementFromDb();
    expect(midEntitlement.consumedSessions).toBe(1);

    // The assigned CS must NOT self-resolve (D2). ADMIN does.
    const csResolve = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceBId}/resolve-conflict`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({ finalStatus: AttendanceStatus.ABSENT_UNAPPROVED_C, resolutionNote: 'CVHT xác nhận nghỉ không phép' });
    expect(csResolve.status).toBe(403);

    const adminResolve = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceBId}/resolve-conflict`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ finalStatus: AttendanceStatus.ABSENT_UNAPPROVED_C, resolutionNote: 'Admin phân xử: C (nghỉ không phép)' });
    expect(adminResolve.status).toBe(200);
    expect(adminResolve.body.data.reconciliation_state).toBe(ReconciliationState.RESOLVED);
    expect(adminResolve.body.data.status).toBe(AttendanceStatus.ABSENT_UNAPPROVED_C);
  });

  it('re-read readers: dashboard counts both finals; entitlement consumes 2 (Q-002), same-day rows count 2 (D7)', async () => {
    const dash = await request(app)
      .get(`/api/v1/dashboard/attendance?class_id=${classId}`)
      .set('Authorization', `Bearer ${csToken}`);
    expect(dash.status).toBe(200);
    expect(dash.body.data.total_attendances).toBe(2);
    expect(dash.body.data.breakdown[AttendanceStatus.ATTENDED]).toBe(1);
    expect(dash.body.data.breakdown[AttendanceStatus.ABSENT_UNAPPROVED_C]).toBe(1);

    const ent = await entitlementFromDb();
    // Two FINAL rows (MATCHED ATTENDED + RESOLVED ABSENT_UNAPPROVED_C), each
    // consuming one session, both on the SAME calendar day -> counts 2.
    expect(ent.consumedSessions).toBe(2);
    expect(ent.remainingSessions).toBe(8);
  });

  it('no outward delivery rows were created for the fixture enrollments (no workflow attached; adapter mocked)', async () => {
    const deliveries = await prisma.messageDelivery.count({
      where: { enrollment_id: enrollmentId },
    });
    expect(deliveries).toBe(0);
  });

  async function entitlementFromDb() {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { enrollment_classes: { include: { attendance: true } } },
    });
    return calculateEnrollmentEntitlement(enrollment!);
  }
});
