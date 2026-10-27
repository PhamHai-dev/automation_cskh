/**
 * ACCEPTANCE WALKTHROUGH (DB-backed, automation_cskh_test via .env.test):
 * Replicates the EXACT HTTP request sequences performed by the React UI across
 * all three operational roles (GV -> CVHT -> Admin) plus downstream readers:
 *
 *  1. GV (`MyTeachingSessionsPage.tsx`):
 *     - Lists assigned classes (`GET /api/v1/classes`) and current teaching
 *       sessions (`GET /api/v1/attendance-reconciliation/teacher-sessions`).
 *     - Creates 2 actual sessions on the SAME calendar day via
 *       `POST /api/v1/classes/:classId/sessions/actual` (with client
 *       `idempotency_key`, plus replay check returning 200 `meta.replayed=true`)
 *       and immediately chains `POST /api/v1/attendance-reconciliation/:id/teacher-mark`
 *       with `{ status, lessonTopic, note, rawValue: "${ecId}-${lessonTopic}" }`.
 *     - Reloads `GET /api/v1/attendance-reconciliation/teacher-sessions` and
 *       observes both same-day sessions with `PENDING_CS`.
 *
 *  2. CVHT (`AttendanceReconciliationPage.tsx`):
 *     - Loads the 4-call parallel refresh (`GET /stats`, `GET /conflicts`,
 *       `GET /pending`, `GET /history`).
 *     - Confirms Session 1 via `POST /api/v1/attendance-reconciliation/:id/cs-mark`
 *       (`ATTENDED`) -> `MATCHED` (FINAL, ordinal 1).
 *     - Records a differing opinion on Session 2 via `cs-mark`
 *       (`ABSENT_UNAPPROVED_C`) -> `CONFLICT` (provisional; not counted in
 *       consumed or K7 milestone ordinals).
 *     - Non-admin (`CS`, `MANAGE`) is blocked with 403 on `POST /:id/resolve-conflict`
 *       (in UI `isAdmin === false` shows 'Ghi ý kiến CS' instead of 'Phân xử').
 *
 *  3. Admin (`AttendanceReconciliationPage.tsx` + reader surfaces):
 *     - Reads `GET /api/v1/attendance-reconciliation/conflicts` and resolves
 *       Session 2 via `POST /api/v1/attendance-reconciliation/:id/resolve-conflict`
 *       (`finalStatus: ATTENDED`, `resolutionNote`) -> `RESOLVED` (FINAL, ordinal 2).
 *     - Preserves both side opinions (`teacher_status = ATTENDED`,
 *       `cs_status = ABSENT_UNAPPROVED_C`, notes, timestamps) + records
 *       `ATTENDANCE_CONFLICT_RESOLVED` in audit logs (`GET /history`).
 *     - Re-reads UI surfaces:
 *       * `AttendanceMatrix.tsx` feeds (`GET /api/v1/classes/:classId`,
 *         `GET /api/v1/classes/:classId/sessions`,
 *         `GET /api/v1/classes/:classId/sessions/:sessionId/attendance`,
 *         `GET /api/v1/enrollments`) show both same-day rows;
 *       * Canonical entitlement (`calculateEnrollmentEntitlement`) counts
 *         consumed = 2, remaining = total - 2 (unclamped);
 *       * K7 care-milestone ordinal progresses 1..2 across the two same-day
 *         FINAL ATTENDED sessions (verified via `automationRepository.findMilestoneBasisRows`
 *         and mocked-adapter `MessageDelivery` snapshots at ordinals 1 and 2);
 *       * Dashboard endpoints (`GET /api/v1/dashboard/attendance`,
 *         `GET /api/v1/dashboard/attendance-tab`, `GET /api/v1/dashboard/overview`)
 *         and `StudentStudyReportPage` (`GET /api/v1/students/:id`,
 *         `PATCH /api/v1/students/:id` with explicit `enrollment_id`, D11).
 *
 * Outbound channels (BullMQ, Zalo, LINE) are mocked so zero external sends or
 * Redis writes occur. All fixtures use namespace `trial_flow_20261026` and are
 * torn down in FK-safe children-before-users order with zero residue verified.
 */

jest.mock('../../automation/automation-bullmq-adapter', () => ({
  enqueueDelivery: jest.fn().mockImplementation(
    async ({ deliveryId }: { deliveryId: number }) => `automation:delivery:${deliveryId}`,
  ),
  cancelDelivery: jest.fn().mockResolvedValue(undefined),
  closeAutomationQueue: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../zalo/zalo-pool', () => ({
  zaloPool: {
    getApi: jest.fn(),
    tryReconnect: jest.fn(),
  },
}));

import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import {
  AttendanceSource,
  AttendanceStatus,
  AutomationChannel,
  AutomationTriggerEvent,
  ClassModelType,
  EnrollmentClassStatus,
  EnrollmentStatus,
  ReconciliationState,
  ZaloAccountStatus,
  ZaloContactRelationStatus,
} from '@prisma/client';
import {
  calculateEnrollmentEntitlement,
  isCareMilestoneAttendance,
  isConsumedAttendance,
} from '../../enrollments/enrollment-entitlement';
import { automationRepository } from '../../automation/automation-repository';
import { enqueueDelivery } from '../../automation/automation-bullmq-adapter';

const NS = 'trial_flow_20261026';
const SESSION_DATE = '2026-10-20';

const emails = {
  admin: `admin_${NS}@example.com`,
  cs: `cs_${NS}@example.com`,
  foreignCs: `foreign_cs_${NS}@example.com`,
  manage: `manage_${NS}@example.com`,
  teacher: `teacher_${NS}@example.com`,
};

describe('Acceptance walkthrough: Three-role UI call sequence (GV -> CVHT -> Admin -> Matrix/Dashboard/K7 readers)', () => {
  let adminId: number;
  let csId: number;
  let foreignCsId: number;
  let manageId: number;
  let teacherUserId: number;
  let teacherRecId: number;

  let adminToken: string;
  let csToken: string;
  let foreignCsToken: string;
  let manageToken: string;
  let teacherToken: string;

  let studentId: number;
  let packageId: number;
  let enrollmentId: number;
  let secondEnrollmentId: number;
  let classId: number;
  let otherClassId: number | null = null;
  let ecId: number;
  let pastEcId: number | null = null;

  let zaloAccountId: number;
  let workflowId: number;
  let step1Id: number;
  let step2Id: number;

  let session1Id: number;
  let session2Id: number;
  let attendance1Id: number;
  let attendance2Id: number;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { email: emails.admin, name: 'Trial Admin', password_hash: 'x', roles: ['ADMIN'] },
    });
    const cs = await prisma.user.create({
      data: { email: emails.cs, name: 'Trial CVHT', password_hash: 'x', roles: ['CS'] },
    });
    const foreignCs = await prisma.user.create({
      data: { email: emails.foreignCs, name: 'Trial Foreign CVHT', password_hash: 'x', roles: ['CS'] },
    });
    const manage = await prisma.user.create({
      data: { email: emails.manage, name: 'Trial MANAGE', password_hash: 'x', roles: ['MANAGE'] },
    });
    const teacherUser = await prisma.user.create({
      data: { email: emails.teacher, name: 'Trial Teacher', password_hash: 'x', roles: ['TEACHER'] },
    });

    adminId = admin.id;
    csId = cs.id;
    foreignCsId = foreignCs.id;
    manageId = manage.id;
    teacherUserId = teacherUser.id;

    adminToken = signTestToken(adminId, ['ADMIN']);
    csToken = signTestToken(csId, ['CS']);
    foreignCsToken = signTestToken(foreignCsId, ['CS']);
    manageToken = signTestToken(manageId, ['MANAGE']);
    teacherToken = signTestToken(teacherUserId, ['TEACHER']);

    const teacherRec = await prisma.teacher.create({
      data: { user_id: teacherUserId, code: `GV_${NS}`, name: 'Trial Teacher Rec', active: true },
    });
    teacherRecId = teacherRec.id;

    const student = await prisma.student.create({
      data: { external_id: `HV_${NS}`, full_name: 'Học Viên Chạy Thử', phone: '0901234567' },
    });
    studentId = student.id;

    const pkg = await prisma.package.create({
      data: { code: `PKG_${NS}`, name: 'Gói 1-1 Chạy Thử', default_total_sessions: 10 },
    });
    packageId = pkg.id;

    const enrollment = await prisma.enrollment.create({
      data: {
        student_id: studentId,
        package_id: packageId,
        cs_id: csId,
        total_sessions: 10,
        status: EnrollmentStatus.STUDYING,
        program_type: 'KAIWA',
        auto_message_enabled: true,
      },
    });
    enrollmentId = enrollment.id;

    // Second enrollment on the same student to exercise D11 explicit enrollment_id selection
    const secondEnrollment = await prisma.enrollment.create({
      data: {
        student_id: studentId,
        package_id: packageId,
        cs_id: csId,
        total_sessions: 20,
        status: EnrollmentStatus.STUDYING,
        program_type: 'JLPT',
        auto_message_enabled: false,
      },
    });
    secondEnrollmentId = secondEnrollment.id;

    const cls = await prisma.class.create({
      data: {
        class_name: `Lớp 1-1 ${NS}`,
        class_code: `CLS_${NS}`,
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: 'LEARNING_SYSTEM',
        active: true,
      },
    });
    classId = cls.id;

    await prisma.classTeacher.create({
      data: {
        class_id: classId,
        teacher_id: teacherRecId,
        role: 'MAIN',
        active: true,
        start_date: new Date('2026-09-01T00:00:00Z'),
        end_date: new Date('2026-10-31T00:00:00Z'),
      },
    });

    const ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollmentId,
        class_id: classId,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });
    ecId = ec.id;

    // Attach a mocked Zalo link + active workflow with steps at ordinal 1 and 2
    // so K7 ordinal progression 1..2 across two same-day sessions is directly observable.
    const zalo = await prisma.zaloAccount.create({
      data: {
        cs_id: csId,
        zalo_uid: `zalo_${NS}`,
        display_name: 'Zalo Trial CS',
        status: ZaloAccountStatus.ACTIVE,
      },
    });
    zaloAccountId = zalo.id;

    await prisma.zaloContactRelation.create({
      data: {
        student_id: studentId,
        zalo_account_id: zaloAccountId,
        relation_status: ZaloContactRelationStatus.FRIEND,
        display_name: 'Friend HV Trial',
        friend_zalo_uid: `zuid_${NS}`,
      },
    });

    const wf = await prisma.automationWorkflow.create({
      data: {
        name: `Workflow ${NS}`,
        owner_cs_id: csId,
        active: true,
      },
    });
    workflowId = wf.id;

    const s1 = await prisma.automationStep.create({
      data: {
        workflow_id: workflowId,
        session_number: 1,
        trigger_event: AutomationTriggerEvent.ATTENDED,
        delay_minutes: 5,
        channel: AutomationChannel.ZALO_PERSONAL,
        message_content: 'Mốc buổi {{session_number}} - còn {{remaining_sessions}} buổi',
        message_variables: ['session_number', 'remaining_sessions'] as any,
        active: true,
      },
    });
    const s2 = await prisma.automationStep.create({
      data: {
        workflow_id: workflowId,
        session_number: 2,
        trigger_event: AutomationTriggerEvent.ATTENDED,
        delay_minutes: 5,
        channel: AutomationChannel.ZALO_PERSONAL,
        message_content: 'Mốc buổi {{session_number}} - còn {{remaining_sessions}} buổi',
        message_variables: ['session_number', 'remaining_sessions'] as any,
        active: true,
      },
    });
    step1Id = s1.id;
    step2Id = s2.id;

    await prisma.automationEnrollment.create({
      data: {
        workflow_id: workflowId,
        enrollment_id: enrollmentId,
        added_by: adminId,
      },
    });
  });

  afterAll(async () => {
    const enrollmentIds = [enrollmentId, secondEnrollmentId].filter(Boolean);
    if (enrollmentIds.length > 0) {
      await prisma.messageDelivery.deleteMany({
        where: { enrollment_id: { in: enrollmentIds } },
      });
      await prisma.attendance.deleteMany({
        where: { enrollment_class: { enrollment_id: { in: enrollmentIds } } },
      });
      await prisma.automationEnrollment.deleteMany({
        where: { enrollment_id: { in: enrollmentIds } },
      });
      await prisma.careLog.deleteMany({
        where: { enrollment_id: { in: enrollmentIds } },
      });
      await prisma.careTask.deleteMany({
        where: { enrollment_id: { in: enrollmentIds } },
      });
      await prisma.enrollmentClass.deleteMany({
        where: { enrollment_id: { in: enrollmentIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { id: { in: enrollmentIds } },
      });
    }

    if (workflowId) {
      await prisma.automationStep.deleteMany({ where: { workflow_id: workflowId } });
      await prisma.automationEnrollment.deleteMany({ where: { workflow_id: workflowId } });
      await prisma.automationWorkflow.deleteMany({ where: { id: workflowId } });
    }

    if (studentId) {
      await prisma.zaloContactRelation.deleteMany({ where: { student_id: studentId } });
      await prisma.student.deleteMany({ where: { id: studentId } });
    }

    if (zaloAccountId) {
      await prisma.zaloAccount.deleteMany({ where: { id: zaloAccountId } });
    }

    const fixtureClassIds = [classId, ...(otherClassId ? [otherClassId] : [])].filter(Boolean);
    if (fixtureClassIds.length > 0) {
      await prisma.classSession.deleteMany({ where: { class_id: { in: fixtureClassIds } } });
      await prisma.classTeacher.deleteMany({ where: { class_id: { in: fixtureClassIds } } });
      await prisma.class.deleteMany({ where: { id: { in: fixtureClassIds } } });
    }

    if (teacherRecId) {
      await prisma.teacher.deleteMany({ where: { id: teacherRecId } });
    }

    if (packageId) {
      await prisma.package.deleteMany({ where: { id: packageId } });
    }

    const userIds = [adminId, csId, foreignCsId, manageId, teacherUserId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.authSession.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    // Confirm zero residue in automation_cskh_test
    const remainingUsers = await prisma.user.count({
      where: { email: { endsWith: `_${NS}@example.com` } },
    });
    const remainingClasses = await prisma.class.count({
      where: { class_code: `CLS_${NS}` },
    });
    const remainingStudents = await prisma.student.count({
      where: { external_id: `HV_${NS}` },
    });
    expect(remainingUsers).toBe(0);
    expect(remainingClasses).toBe(0);
    expect(remainingStudents).toBe(0);

    await prisma.$disconnect();
  });

  it('Step 1 (GV — MyTeachingSessionsPage): loads classes + teacher-sessions, creates 2 same-day actual sessions (with idempotency replay check), and chains teacher-mark on both', async () => {
    // 1a. Mount sequence of MyTeachingSessionsPage.tsx:
    //     GET /api/v1/classes (populates "Ghi ca thực học" class & student dropdowns)
    //     GET /api/v1/attendance-reconciliation/teacher-sessions?startDate=...&endDate=...
    const classesRes = await request(app)
      .get('/api/v1/classes')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(classesRes.status).toBe(200);
    const assignedClass = (classesRes.body.data as any[]).find((c) => c.id === classId);
    expect(assignedClass).toBeDefined();

    const initialSessionsRes = await request(app)
      .get('/api/v1/attendance-reconciliation/teacher-sessions')
      .query({ startDate: '2026-10-01', endDate: '2026-10-31' })
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(initialSessionsRes.status).toBe(200);
    expect(initialSessionsRes.body.data).toEqual([]);

    // 1b. GV records Actual Session 1 (19:00–19:30 on 2026-10-20) via handleCreateActualSession:
    //     POST /api/v1/classes/:classId/sessions/actual -> 201
    const idemKey1 = `actual-${NS}-session-1`;
    const createActual1 = await request(app)
      .post(`/api/v1/classes/${classId}/sessions/actual`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        idempotency_key: idemKey1,
        enrollment_class_id: ecId,
        session_date: SESSION_DATE,
        start_time: '19:00',
        end_time: '19:30',
      });
    expect(createActual1.status).toBe(201);
    expect(createActual1.body.meta).toEqual({ replayed: false });
    session1Id = createActual1.body.data.id;
    const matchedAtt1 = (createActual1.body.data.attendance as any[]).find(
      (item) => item.enrollment_class_id === ecId,
    );
    expect(matchedAtt1).toBeDefined();
    attendance1Id = matchedAtt1.id;

    // Retry with the exact same idempotency_key -> 200 replayed, no duplicate session minted
    const replayActual1 = await request(app)
      .post(`/api/v1/classes/${classId}/sessions/actual`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        idempotency_key: idemKey1,
        enrollment_class_id: ecId,
        session_date: SESSION_DATE,
        start_time: '19:00',
        end_time: '19:30',
      });
    expect(replayActual1.status).toBe(200);
    expect(replayActual1.body.meta).toEqual({ replayed: true });
    expect(replayActual1.body.data.id).toBe(session1Id);

    // Chain teacher-mark onto Session 1 skeleton (exact payload shape from MyTeachingSessionsPage.tsx:225)
    const topic1 = 'Bài 1: Hội thoại mở đầu';
    const mark1 = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance1Id}/teacher-mark`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        status: AttendanceStatus.ATTENDED,
        lessonTopic: topic1,
        note: 'HV phát âm tốt ca 1',
        rawValue: `${ecId}-${topic1}`,
      });
    expect(mark1.status).toBe(200);
    expect(mark1.body.data.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    expect(mark1.body.data.teacher_status).toBe(AttendanceStatus.ATTENDED);
    expect(mark1.body.data.cs_status).toBeNull();

    // 1c. GV records Actual Session 2 on the SAME day (20:00–20:30 on 2026-10-20) with a new intent key
    const idemKey2 = `actual-${NS}-session-2`;
    const createActual2 = await request(app)
      .post(`/api/v1/classes/${classId}/sessions/actual`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        idempotency_key: idemKey2,
        enrollment_class_id: ecId,
        session_date: SESSION_DATE,
        start_time: '20:00',
        end_time: '20:30',
      });
    expect(createActual2.status).toBe(201);
    expect(createActual2.body.meta).toEqual({ replayed: false });
    session2Id = createActual2.body.data.id;
    expect(session2Id).not.toBe(session1Id);

    const matchedAtt2 = (createActual2.body.data.attendance as any[]).find(
      (item) => item.enrollment_class_id === ecId,
    );
    expect(matchedAtt2).toBeDefined();
    attendance2Id = matchedAtt2.id;
    expect(attendance2Id).not.toBe(attendance1Id);

    const topic2 = 'Bài 2: Luyện phản xạ nâng cao';
    const mark2 = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance2Id}/teacher-mark`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        status: AttendanceStatus.ATTENDED,
        lessonTopic: topic2,
        note: 'HV học tiếp ca 2 cùng ngày',
        rawValue: `${ecId}-${topic2}`,
      });
    expect(mark2.status).toBe(200);
    expect(mark2.body.data.reconciliation_state).toBe(ReconciliationState.PENDING_CS);

    // 1d. GV reloads teacher-sessions (`loadSessions()` after mark) -> sees both same-day sessions
    const afterSessionsRes = await request(app)
      .get('/api/v1/attendance-reconciliation/teacher-sessions')
      .query({ startDate: '2026-10-01', endDate: '2026-10-31' })
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(afterSessionsRes.status).toBe(200);
    const returnedSessionIds = (afterSessionsRes.body.data as any[]).map((s) => s.id);
    expect(returnedSessionIds).toEqual(expect.arrayContaining([session1Id, session2Id]));
  });

  it('Step 2 (CVHT — AttendanceReconciliationPage): runs 4-call refreshAll, confirms Session 1 (MATCHED -> ordinal 1) and records differing opinion on Session 2 (CONFLICT); non-admin cannot resolve', async () => {
    // 2a. AttendanceReconciliationPage.tsx refreshAll() runs 4 parallel GETs:
    const [statsRes, conflictsRes, pendingRes, historyRes] = await Promise.all([
      request(app)
        .get('/api/v1/attendance-reconciliation/stats')
        .query({ startDate: '2026-10-01', endDate: '2026-10-31' })
        .set('Authorization', `Bearer ${csToken}`),
      request(app)
        .get('/api/v1/attendance-reconciliation/conflicts')
        .query({ startDate: '2026-10-01', endDate: '2026-10-31', page: 1, pageSize: 20 })
        .set('Authorization', `Bearer ${csToken}`),
      request(app)
        .get('/api/v1/attendance-reconciliation/pending')
        .query({ startDate: '2026-10-01', endDate: '2026-10-31', page: 1, pageSize: 20, state: 'PENDING_CS' })
        .set('Authorization', `Bearer ${csToken}`),
      request(app)
        .get('/api/v1/attendance-reconciliation/history')
        .query({ startDate: '2026-10-01', endDate: '2026-10-31', page: 1, pageSize: 20 })
        .set('Authorization', `Bearer ${csToken}`),
    ]);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.pendingCsCount).toBeGreaterThanOrEqual(2);
    expect(conflictsRes.status).toBe(200);
    expect(pendingRes.status).toBe(200);
    expect(historyRes.status).toBe(200);

    const pendingIds = (pendingRes.body.data.items as any[]).map((item) => item.id);
    expect(pendingIds).toEqual(expect.arrayContaining([attendance1Id, attendance2Id]));

    // Foreign CS cannot mark this enrollment's attendance
    const foreignAttempt = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance1Id}/cs-mark`)
      .set('Authorization', `Bearer ${foreignCsToken}`)
      .send({ status: AttendanceStatus.ATTENDED });
    expect(foreignAttempt.status).toBe(403);

    // 2b. CVHT confirms Session 1 via cs-mark (status = ATTENDED) -> MATCHED (FINAL)
    const csMark1 = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance1Id}/cs-mark`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({
        status: AttendanceStatus.ATTENDED,
        note: 'CVHT xác nhận HV có học ca 1',
      });
    expect(csMark1.status).toBe(200);
    expect(csMark1.body.data.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(csMark1.body.data.status).toBe(AttendanceStatus.ATTENDED);

    // 2c. CVHT records a differing opinion on Session 2 via cs-mark (status = ABSENT_UNAPPROVED_C) -> CONFLICT
    const csMark2 = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance2Id}/cs-mark`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({
        status: AttendanceStatus.ABSENT_UNAPPROVED_C,
        note: 'CVHT ghi nhận chưa thấy phản hồi ca 2',
      });
    expect(csMark2.status).toBe(200);
    expect(csMark2.body.data.reconciliation_state).toBe(ReconciliationState.CONFLICT);
    expect(csMark2.body.data.teacher_status).toBe(AttendanceStatus.ATTENDED);
    expect(csMark2.body.data.cs_status).toBe(AttendanceStatus.ABSENT_UNAPPROVED_C);

    // 2d. While Session 2 is in CONFLICT (provisional):
    //     - Only 1 session is consumed so far;
    //     - K7 milestone basis has only 1 qualifying row (Session 1 -> ordinal 1),
    //       so step 1 is QUEUED and step 2 has NOT been created yet.
    const midBasisRows = await automationRepository.findMilestoneBasisRows(enrollmentId);
    expect(midBasisRows.map((r: any) => r.id)).toEqual([attendance1Id]);

    const midDeliveries = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId },
      orderBy: { automation_step_id: 'asc' },
    });
    expect(midDeliveries).toHaveLength(1);
    expect(midDeliveries[0].automation_step_id).toBe(step1Id);
    expect(midDeliveries[0].attendance_id).toBe(attendance1Id);
    expect((midDeliveries[0].variables_snapshot as any)?.session_number).toBe(1);
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);

    // 2e. Non-admin roles (CS and MANAGE) cannot call resolve-conflict (D2: Admin-only;
    //     UI hides 'Phân xử' and shows 'Ghi ý kiến CS' when isAdmin === false)
    const csResolveAttempt = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance2Id}/resolve-conflict`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({
        finalStatus: AttendanceStatus.ATTENDED,
        resolutionNote: 'CVHT tự phân xử (phải bị chặn 403)',
      });
    expect(csResolveAttempt.status).toBe(403);

    const manageResolveAttempt = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance2Id}/resolve-conflict`)
      .set('Authorization', `Bearer ${manageToken}`)
      .send({
        finalStatus: AttendanceStatus.ATTENDED,
        resolutionNote: 'MANAGE tự phân xử (phải bị chặn 403)',
      });
    expect(manageResolveAttempt.status).toBe(403);
  });

  it('Step 3 (Admin — resolve-conflict): inspects conflict queue, resolves Session 2 to ATTENDED, preserves both side opinions, and writes audit history', async () => {
    // 3a. Admin fetches conflict queue (`GET /api/v1/attendance-reconciliation/conflicts`)
    const conflictsRes = await request(app)
      .get('/api/v1/attendance-reconciliation/conflicts')
      .query({ startDate: '2026-10-01', endDate: '2026-10-31', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(conflictsRes.status).toBe(200);
    const conflictRow = (conflictsRes.body.data.items as any[]).find((item) => item.id === attendance2Id);
    expect(conflictRow).toBeDefined();
    expect(conflictRow.teacher_status).toBe(AttendanceStatus.ATTENDED);
    expect(conflictRow.cs_status).toBe(AttendanceStatus.ABSENT_UNAPPROVED_C);

    // 3b. Admin resolves conflict (`POST /api/v1/attendance-reconciliation/:id/resolve-conflict`)
    const resolutionNote = 'Admin đối chiếu log lớp học: HV có học đủ ca 2 cùng ngày';
    const resolveRes = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendance2Id}/resolve-conflict`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        finalStatus: AttendanceStatus.ATTENDED,
        resolutionNote,
      });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.reconciliation_state).toBe(ReconciliationState.RESOLVED);
    expect(resolveRes.body.data.status).toBe(AttendanceStatus.ATTENDED);

    // Both original opinions + notes remain untouched for traceability
    expect(resolveRes.body.data.teacher_status).toBe(AttendanceStatus.ATTENDED);
    expect(resolveRes.body.data.cs_status).toBe(AttendanceStatus.ABSENT_UNAPPROVED_C);
    expect(resolveRes.body.data.teacher_note).toBe('HV học tiếp ca 2 cùng ngày');
    expect(resolveRes.body.data.cs_note).toBe('CVHT ghi nhận chưa thấy phản hồi ca 2');
    expect(resolveRes.body.data.resolved_by_id).toBe(adminId);
    expect(resolveRes.body.data.resolved_at).toBeTruthy();
    expect(resolveRes.body.data.resolution_note).toBe(resolutionNote);
    // Resolving Session 2 to ATTENDED reaches ordinal 2 and enqueues step 2 once
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);

    // 3c. Audit trail via GET /api/v1/attendance-reconciliation/history and prisma.auditLog
    const historyRes = await request(app)
      .get('/api/v1/attendance-reconciliation/history')
      .query({ startDate: '2026-10-01', endDate: '2026-10-31', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(historyRes.status).toBe(200);
    const resolvedHistoryEntry = (historyRes.body.data.items as any[]).find(
      (item) => item.attendance_id === attendance2Id && item.action === 'ATTENDANCE_CONFLICT_RESOLVED',
    );
    expect(resolvedHistoryEntry).toBeDefined();
    expect(resolvedHistoryEntry.to_status).toBe(AttendanceStatus.ATTENDED);
    expect(resolvedHistoryEntry.note).toBe(resolutionNote);

    const dbAudit = await prisma.auditLog.findFirst({
      where: {
        entity_type: 'Attendance',
        entity_id: String(attendance2Id),
        action: 'ATTENDANCE_CONFLICT_RESOLVED',
      },
    });
    expect(dbAudit).not.toBeNull();
    expect(dbAudit!.user_id).toBe(adminId);
  });

  it('Step 4 (Readers — Matrix, Canonical Entitlement, K7 Ordinal 1..2, Dashboard, StudentStudyReportPage): all surfaces reflect 2 same-day finals', async () => {
    // 4a. AttendanceSheetPage matrix feed:
    //     GET /api/v1/classes/:classId
    //     GET /api/v1/classes/:classId/sessions
    //     GET /api/v1/classes/:classId/sessions/:sessionId/attendance (per session)
    const classDetailRes = await request(app)
      .get(`/api/v1/classes/${classId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(classDetailRes.status).toBe(200);

    const sessionsListRes = await request(app)
      .get(`/api/v1/classes/${classId}/sessions`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sessionsListRes.status).toBe(200);
    const sameDaySessions = (sessionsListRes.body.data as any[]).filter(
      (s) => String(s.session_date).startsWith(SESSION_DATE),
    );
    expect(sameDaySessions).toHaveLength(2);

    const [attList1Res, attList2Res] = await Promise.all([
      request(app)
        .get(`/api/v1/classes/${classId}/sessions/${session1Id}/attendance`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .get(`/api/v1/classes/${classId}/sessions/${session2Id}/attendance`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);
    expect(attList1Res.status).toBe(200);
    expect(attList2Res.status).toBe(200);
    expect(attList1Res.body.data).toHaveLength(1);
    expect(attList2Res.body.data).toHaveLength(1);
    expect(attList1Res.body.data[0].id).toBe(attendance1Id);
    expect(attList2Res.body.data[0].id).toBe(attendance2Id);

    // 4b. EnrollmentsPage matrix feed: GET /api/v1/enrollments
    const enrollmentsRes = await request(app)
      .get('/api/v1/enrollments')
      .query({ cs_id: csId })
      .set('Authorization', `Bearer ${csToken}`);
    expect(enrollmentsRes.status).toBe(200);
    const targetEnrollment = (enrollmentsRes.body.data as any[]).find((e) => e.id === enrollmentId);
    expect(targetEnrollment).toBeDefined();
    const matrixAttendances = targetEnrollment.enrollment_classes.flatMap((ec: any) => ec.attendance);
    expect(matrixAttendances).toHaveLength(2);

    // 4c. Canonical entitlement calculator (D7 + D10):
    //     consumedSessions = 2, remainingSessions = 10 - 2 = 8 (unclamped)
    const ent = calculateEnrollmentEntitlement(targetEnrollment);
    expect(ent.totalSessions).toBe(10);
    expect(ent.consumedSessions).toBe(2);
    expect(ent.remainingSessions).toBe(8);

    // Also pin K5 vs K7 predicate distinction on an ABSENT_UNAPPROVED_C sample:
    expect(
      isConsumedAttendance({
        status: AttendanceStatus.ABSENT_UNAPPROVED_C,
        reconciliation_state: ReconciliationState.RESOLVED,
      }),
    ).toBe(true);
    expect(
      isCareMilestoneAttendance({
        status: AttendanceStatus.ABSENT_UNAPPROVED_C,
        reconciliation_state: ReconciliationState.RESOLVED,
      }),
    ).toBe(false);

    // 4d. K7 ordinal progression 1..2 across the two same-day FINAL ATTENDED sessions:
    const basisRows = await automationRepository.findMilestoneBasisRows(enrollmentId);
    expect(basisRows.map((r: any) => r.id)).toEqual([attendance1Id, attendance2Id]);

    const deliveries = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId },
      orderBy: { automation_step_id: 'asc' },
    });
    expect(deliveries).toHaveLength(2);

    const d1 = deliveries.find((d) => d.automation_step_id === step1Id)!;
    const d2 = deliveries.find((d) => d.automation_step_id === step2Id)!;
    expect(d1.attendance_id).toBe(attendance1Id);
    expect(d1.status).toBe('QUEUED');
    expect((d1.variables_snapshot as any)?.session_number).toBe(1);
    expect((d1.variables_snapshot as any)?.remaining_sessions).toBe(9);

    expect(d2.attendance_id).toBe(attendance2Id);
    expect(d2.status).toBe('QUEUED');
    expect((d2.variables_snapshot as any)?.session_number).toBe(2);
    expect((d2.variables_snapshot as any)?.remaining_sessions).toBe(8);
    // (Mock call counts are cleared between tests by the jest config — enqueue
    //  happened during steps 2/3; the QUEUED status above is the durable proof
    //  that enqueueDelivery ran and updateDeliveryStatus recorded the job id.)

    // 4e. Dashboard endpoints (`GET /api/v1/dashboard/attendance`, `/attendance-tab`, `/overview`)
    const dashAttRes = await request(app)
      .get('/api/v1/dashboard/attendance')
      .query({ class_id: classId })
      .set('Authorization', `Bearer ${csToken}`);
    expect(dashAttRes.status).toBe(200);
    expect(dashAttRes.body.data.total_attendances).toBe(2);
    expect(dashAttRes.body.data.breakdown[AttendanceStatus.ATTENDED]).toBe(2);

    const dashTabRes = await request(app)
      .get('/api/v1/dashboard/attendance-tab')
      .query({ date_from: '2026-10-01', date_to: '2026-10-31', cs_id: csId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dashTabRes.status).toBe(200);
    expect(dashTabRes.body.data.stats.total_attendances).toBeGreaterThanOrEqual(2);

    const dashOverviewRes = await request(app)
      .get('/api/v1/dashboard/overview')
      .query({ date_from: '2026-10-01', date_to: '2026-10-31', cs_id: csId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dashOverviewRes.status).toBe(200);

    // 4f. StudentStudyReportPage (D11 explicit enrollment_id selection):
    //     GET /api/v1/students/:id -> PATCH /api/v1/students/:id with enrollment_id
    const studentGetRes = await request(app)
      .get(`/api/v1/students/${studentId}`)
      .set('Authorization', `Bearer ${csToken}`);
    expect(studentGetRes.status).toBe(200);
    expect(studentGetRes.body.data.enrollments.length).toBeGreaterThanOrEqual(2);

    const reportPatchRes = await request(app)
      .patch(`/api/v1/students/${studentId}`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({
        enrollment_id: enrollmentId,
        program_type: 'KAIWA',
        program_metadata: {
          study_report: {
            sessions_1_10: 'Hoàn thành 2 ca thực học cùng ngày',
            exchange_with_student: 'HV phản hồi tích cực',
          },
        },
        exchange_info: 'HV phản hồi tích cực',
        study_report_url: `/students/${studentId}/study-report`,
      });
    expect(reportPatchRes.status).toBe(200);

    const [updatedFirstEnrollment, untouchedSecondEnrollment] = await Promise.all([
      prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } }),
      prisma.enrollment.findUniqueOrThrow({ where: { id: secondEnrollmentId } }),
    ]);
    expect((updatedFirstEnrollment.program_metadata as any)?.study_report?.sessions_1_10).toBe(
      'Hoàn thành 2 ca thực học cùng ngày',
    );
    expect((untouchedSecondEnrollment.program_metadata as any)?.study_report).toBeUndefined();
  });

  // Lane B's D8 fix (commit 4b0d113) IS on disk: the privileged assist branch
  // in reconciliation.service.markByTeacher now evaluates the target teacher's
  // assignment with findEffectiveAssignment at session_date over ALL
  // ClassTeacher rows (no current-active filter on the row). Assert the
  // on-disk behavior directly — inactive row whose window covers the session
  // date authorizes the assist mark; a date outside the window still gets 403.
  it('Step 5 (D8 assist branch): ADMIN teacher-mark for a teacher whose assignment is now inactive but whose window covered the session date succeeds; outside-window stays 403', async () => {
    const pastClass = await prisma.class.create({
      data: {
        class_name: `Lớp Hết Phân Công ${NS}`,
        class_code: `CLSPAST_${NS}`,
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: 'LEARNING_SYSTEM',
        active: true,
      },
    });
    otherClassId = pastClass.id;
    await prisma.classTeacher.create({
      data: {
        class_id: otherClassId,
        teacher_id: teacherRecId,
        role: 'MAIN',
        active: false,
        start_date: new Date('2026-10-01T00:00:00Z'),
        end_date: new Date('2026-10-25T00:00:00Z'),
      },
    });
    const pastEc = await prisma.enrollmentClass.create({
      data: { enrollment_id: enrollmentId, class_id: otherClassId, sequence_no: 3, status: EnrollmentClassStatus.ACTIVE },
    });
    pastEcId = pastEc.id;

    // Session INSIDE the old window (2026-10-20 <= end_date 2026-10-25)
    const pastSession = await prisma.classSession.create({
      data: { class_id: otherClassId, session_number: 901, session_date: new Date(`${SESSION_DATE}T00:00:00Z`), start_time: '08:00', end_time: '08:30', created_by_id: adminId },
    });
    const pastAttendance = await prisma.attendance.create({
      data: {
        enrollment_class_id: pastEc.id,
        class_session_id: pastSession.id,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
        reconciliation_state: ReconciliationState.PENDING_TEACHER,
      },
    });

    const assist = await request(app)
      .post(`/api/v1/attendance-reconciliation/${pastAttendance.id}/teacher-mark`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AttendanceStatus.ATTENDED, teacherId: teacherUserId, lessonTopic: 'Ca hỗ trợ D8' });
    expect(assist.status).toBe(200);
    expect(assist.body.data.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    expect(assist.body.data.teacher_status).toBe(AttendanceStatus.ATTENDED);

    // Negative control: session date AFTER the window end stays 403 even via assist.
    const outsideSession = await prisma.classSession.create({
      data: { class_id: otherClassId, session_number: 902, session_date: new Date('2026-11-05T00:00:00Z'), start_time: '08:00', end_time: '08:30', created_by_id: adminId },
    });
    const outsideAttendance = await prisma.attendance.create({
      data: {
        enrollment_class_id: pastEc.id,
        class_session_id: outsideSession.id,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
        reconciliation_state: ReconciliationState.PENDING_TEACHER,
      },
    });
    const assistOutside = await request(app)
      .post(`/api/v1/attendance-reconciliation/${outsideAttendance.id}/teacher-mark`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AttendanceStatus.ATTENDED, teacherId: teacherUserId });
    expect(assistOutside.status).toBe(403);
  });
});
