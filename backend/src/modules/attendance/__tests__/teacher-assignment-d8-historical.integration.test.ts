// D8 — owner verdict 2026-10-26 (acceptance case #14, docs/khao-sat/AI_REVIEW/06):
// "GV đã thôi assignment vẫn mark được ca mình đã dạy trong thời gian hiệu lực."
//
// A teacher whose ClassTeacher row was DEACTIVATED (active=false) AFTER a
// session date that still falls inside [start_date, end_date] must be able to
// self-mark that past session. A teacher whose window does NOT contain the
// session date (end_date before it) still gets 403 -> Admin-assisted path.
//
// Real HTTP API + real DB (.env.test -> automation_cskh_test). The BullMQ
// adapter is jest-module-mocked so no queue job / Redis write occurs and no
// worker is started. Own namespace `d8_hist_20261026`; teardown deletes
// children before users (RESTRICT FK edges).

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

const NS = 'd8_hist_20261026';
const emails = {
  admin: `admin_${NS}@example.com`,
  cs: `cs_${NS}@example.com`,
  teacher: `teacher_${NS}@example.com`,
};

describe('D8 historical-assignment authorization (owner verdict 2026-10-26)', () => {
  let adminId: number;
  let adminToken: string;
  let csId: number;
  let teacherUserId: number;
  let teacherRecId: number;
  let teacherToken: string;

  let studentId: number;
  let packageId: number;
  let enrollmentId: number;

  // Class the teacher WAS assigned to, with a window covering the session date;
  // the assignment row is later set active=false.
  let revokedClassId: number;
  let revokedSessionId: number;
  let revokedAttendanceId: number;

  // Class whose assignment window ENDED before the session date -> must stay 403.
  let expiredClassId: number;
  let expiredSessionId: number;
  let expiredAttendanceId: number;

  let revokedClassTeacherId: number;

  beforeAll(async () => {
    const admin = await prisma.user.create({ data: { email: emails.admin, name: 'D8 Admin', password_hash: 'x', roles: ['ADMIN'] } });
    const cs = await prisma.user.create({ data: { email: emails.cs, name: 'D8 CVHT', password_hash: 'x', roles: ['CS'] } });
    const teacherUser = await prisma.user.create({ data: { email: emails.teacher, name: 'D8 Teacher', password_hash: 'x', roles: ['TEACHER'] } });
    adminId = admin.id; csId = cs.id; teacherUserId = teacherUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);
    teacherToken = signTestToken(teacherUserId, ['TEACHER']);

    const teacherRec = await prisma.teacher.create({
      data: { user_id: teacherUserId, code: `GV_${NS}`, name: 'D8 Teacher Rec', active: true },
    });
    teacherRecId = teacherRec.id;

    const student = await prisma.student.create({ data: { external_id: `HV_${NS}`, full_name: 'D8 Learner' } });
    studentId = student.id;
    const pkg = await prisma.package.create({ data: { code: `PKG_${NS}`, name: 'D8 Package', default_total_sessions: 10 } });
    packageId = pkg.id;
    const enrollment = await prisma.enrollment.create({
      data: { student_id: studentId, package_id: packageId, cs_id: csId, total_sessions: 10, status: EnrollmentStatus.STUDYING },
    });
    enrollmentId = enrollment.id;

    // --- Class A: window covers the session date; row later revoked ---------
    const revokedClass = await prisma.class.create({
      data: { class_name: `Lớp D8 Revoked ${NS}`, class_code: `CLSRVK_${NS}`, model_type: ClassModelType.ONE_TO_ONE, attendance_source: 'LEARNING_SYSTEM' },
    });
    revokedClassId = revokedClass.id;
    const revokedCT = await prisma.classTeacher.create({
      data: {
        class_id: revokedClassId,
        teacher_id: teacherRecId,
        role: 'MAIN',
        active: true,
        start_date: new Date('2026-01-01T00:00:00.000Z'),
        end_date: new Date('2026-12-31T00:00:00.000Z'),
      },
    });
    revokedClassTeacherId = revokedCT.id;
    const revokedEc = await prisma.enrollmentClass.create({
      data: { enrollment_id: enrollmentId, class_id: revokedClassId, sequence_no: 1, status: EnrollmentClassStatus.ACTIVE },
    });
    const revokedSession = await prisma.classSession.create({
      data: { class_id: revokedClassId, session_number: 1, session_date: new Date('2026-06-15T00:00:00.000Z'), created_by_id: adminId },
    });
    revokedSessionId = revokedSession.id;
    const revokedAttendance = await prisma.attendance.create({
      data: {
        enrollment_class_id: revokedEc.id,
        class_session_id: revokedSessionId,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
        reconciliation_state: ReconciliationState.PENDING_TEACHER,
      },
    });
    revokedAttendanceId = revokedAttendance.id;

    // --- Class B: window ended before the session date -> still 403 ---------
    const expiredClass = await prisma.class.create({
      data: { class_name: `Lớp D8 Expired ${NS}`, class_code: `CLSEXP_${NS}`, model_type: ClassModelType.ONE_TO_ONE, attendance_source: 'LEARNING_SYSTEM' },
    });
    expiredClassId = expiredClass.id;
    await prisma.classTeacher.create({
      data: {
        class_id: expiredClassId,
        teacher_id: teacherRecId,
        role: 'MAIN',
        active: true,
        start_date: new Date('2026-01-01T00:00:00.000Z'),
        end_date: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
    const expiredEc = await prisma.enrollmentClass.create({
      data: { enrollment_id: enrollmentId, class_id: expiredClassId, sequence_no: 2, status: EnrollmentClassStatus.ACTIVE },
    });
    const expiredSession = await prisma.classSession.create({
      data: { class_id: expiredClassId, session_number: 1, session_date: new Date('2026-06-15T00:00:00.000Z'), created_by_id: adminId },
    });
    expiredSessionId = expiredSession.id;
    const expiredAttendance = await prisma.attendance.create({
      data: {
        enrollment_class_id: expiredEc.id,
        class_session_id: expiredSessionId,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
        reconciliation_state: ReconciliationState.PENDING_TEACHER,
      },
    });
    expiredAttendanceId = expiredAttendance.id;
  });

  afterAll(async () => {
    // Children before users. Class A's row was mutated; delete by ids.
    await prisma.messageDelivery.deleteMany({ where: { attendance_id: { in: [revokedAttendanceId, expiredAttendanceId] } } });
    await prisma.attendance.deleteMany({ where: { id: { in: [revokedAttendanceId, expiredAttendanceId] } } });
    const classIds = [revokedClassId, expiredClassId];
    await prisma.classSession.deleteMany({ where: { class_id: { in: classIds } } });
    await prisma.classTeacher.deleteMany({ where: { class_id: { in: classIds } } });
    await prisma.enrollmentClass.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.careLog.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.careTask.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.enrollment.deleteMany({ where: { id: enrollmentId } });
    await prisma.student.deleteMany({ where: { id: studentId } });
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    await prisma.teacher.deleteMany({ where: { id: teacherRecId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    const userIds = [adminId, csId, teacherUserId];
    await prisma.automationStep.deleteMany({ where: { workflow: { owner_cs_id: { in: userIds } } } });
    await prisma.automationWorkflow.deleteMany({ where: { owner_cs_id: { in: userIds } } });
    await prisma.authSession.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('BEFORE revocation: teacher marks the in-window session (sanity, 200)', async () => {
    const res = await request(app)
      .post(`/api/v1/attendance-reconciliation/${revokedAttendanceId}/teacher-mark`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: AttendanceStatus.ATTENDED, lessonTopic: 'D8 buổi trong window' });
    expect(res.status).toBe(200);
    expect(res.body.data.reconciliation_state).toBe(ReconciliationState.PENDING_CS);

    // Reset the teacher opinion so the post-revocation case starts from PENDING_TEACHER.
    await prisma.attendance.update({
      where: { id: revokedAttendanceId },
      data: { teacher_status: null, teacher_raw_value: null, lesson_topic: null, teacher_note: null, teacher_submitted_at: null, teacher_user_id: null, reconciliation_state: ReconciliationState.PENDING_TEACHER },
    });
  });

  it('AFTER revocation (active=false, window still covers session date): teacher CAN still mark that past session -> 200', async () => {
    await prisma.classTeacher.update({ where: { id: revokedClassTeacherId }, data: { active: false } });

    const res = await request(app)
      .post(`/api/v1/attendance-reconciliation/${revokedAttendanceId}/teacher-mark`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: AttendanceStatus.ABSENT_APPROVED_A, lessonTopic: 'D8 bổ sung sau khi thôi assignment' });

    expect(res.status).toBe(200);
    expect(res.body.data.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    expect(res.body.data.teacher_status).toBe(AttendanceStatus.ABSENT_APPROVED_A);

    const row = await prisma.attendance.findUnique({ where: { id: revokedAttendanceId } });
    expect(row?.teacher_user_id).toBe(teacherUserId);
  });

  it('window ended BEFORE session date: teacher still gets 403 (-> Admin-assisted path)', async () => {
    const res = await request(app)
      .post(`/api/v1/attendance-reconciliation/${expiredAttendanceId}/teacher-mark`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: AttendanceStatus.ATTENDED });
    expect(res.status).toBe(403);
  });

  it('Admin-assisted mark uses the SAME session-date window rule (owner ruling A 2026-10-26)', async () => {
    // The privileged assist-mark branch is NOT a blind bypass: condition 2
    // requires the target teacher's assignment to be effective AT the session
    // date (D8 window rule). revokedCT is active=false with window
    // [2026-01-01, 2026-12-31] (end AFTER session date) -> ADMIN assist allowed.
    const assistInWindow = await request(app)
      .post(`/api/v1/attendance-reconciliation/${revokedAttendanceId}/teacher-mark`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AttendanceStatus.LEAVE_B, teacherId: teacherUserId, note: 'D8 admin assist trong window' });
    expect(assistInWindow.status).toBe(200);

    // The expired class's window ENDED (2026-05-01) BEFORE the session date
    // (2026-06-15): even for ADMIN assist the teacher was not assigned at the
    // session date -> 403 (this expectation CHANGED with ruling A: the old
    // active:true lookup would have allowed it because the row was still
    // active:true despite the expired window).
    const assistOutOfWindow = await request(app)
      .post(`/api/v1/attendance-reconciliation/${expiredAttendanceId}/teacher-mark`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AttendanceStatus.ATTENDED, teacherId: teacherUserId });
    expect(assistOutOfWindow.status).toBe(403);
    expect(assistOutOfWindow.body.message).toBe(
      'Giáo viên được chọn không phụ trách lớp này tại ngày dạy của buổi học'
    );
  });
});
