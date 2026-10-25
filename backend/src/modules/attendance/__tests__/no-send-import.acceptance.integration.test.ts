// ACCEPTANCE: NO_SEND historical import lane must create NO outward messages.
// The importer's historical lane is the attendance workbook commit path
// (POST /attendance-reconciliation/import-excel/preview -> /confirm); its
// delivery policy defaults to NO_SEND — "Historical imports must explicitly
// opt in to SEND; default stays NO_SEND" (reconciliation.schema.ts). Under
// NO_SEND runAttendancePostCommit suppresses handleAttendanceEvent entirely
// (attendance-lifecycle.ts), so no MessageDelivery row may appear even when
// the committed row becomes FINAL (MATCHED) and an active automation workflow
// + matching step + resolvable Zalo target exist.
//
// To keep the assertion NON-VACUOUS, the fixture attaches a real active
// workflow (ZALO_PERSONAL step with an ACTIVE Zalo account + FRIEND relation
// so resolveDeliveryTarget succeeds) to two parallel enrollments:
//   - enrollment A: confirm WITHOUT deliveryPolicy (default NO_SEND) -> the
//     attendance reaches MATCHED but ZERO delivery rows.
//   - enrollment B: same NO_SEND commit (zero rows), then handleAttendanceEvent
//     invoked DIRECTLY as the non-vacuity control -> exactly ONE SCHEDULED
//     delivery row appears, proving the suppression (not missing workflow or
//     target config) is what kept A at zero. The direct invocation is
//     deliberately outside the swallowed post-commit wrapper so a pool error
//     fails loudly instead of mimicking "NO_SEND worked".
// Outbound channels are neutralized at two levels: (1) the BullMQ adapter is
// jest-module-mocked (existing idiom, automation-session-number.test.ts) so no
// queue job can be enqueued to Redis from tests; (2) no worker process is ever
// started, so even a persisted SCHEDULED row is never picked up or sent. Zalo/
// LINE SDKs are never invoked from this path.
//
// Fixtures namespaced `_acc_nosend_20261025`, .env.test DB only, removed in
// afterAll (deliveries -> attendances -> sessions -> ec -> enrollment/students
// -> workflow/step -> zalo relation/account -> users, honoring RESTRICT FKs).

jest.mock('../../automation/automation-bullmq-adapter', () => ({
  enqueueDelivery: jest.fn().mockResolvedValue(null),
  cancelDelivery: jest.fn().mockResolvedValue(undefined),
  closeAutomationQueue: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { handleAttendanceEvent } from '../../automation/automation-trigger.service';
import ExcelJS from 'exceljs';
import {
  AttendanceStatus,
  ReconciliationState,
  ClassModelType,
  EnrollmentStatus,
  EnrollmentClassStatus,
  AttendanceSource,
  ZaloAccountStatus,
  ZaloContactRelationStatus,
  AutomationTriggerEvent,
  AutomationChannel,
} from '@prisma/client';

const NS = 'acc_nosend_20261025';

async function buildTeacherWorkbook(externalId: string, fullName: string, timeSlot: string, dateStr: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('2026 スケジュール');
  ws.addRow([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  ws.addRow(['Mô hình lớp', 'Mã học viên/Mã lớp', 'Họ tên học viên', 'Tổng số buổi', 'Số buổi còn lại', 'Thời gian', 'Số giờ hoàn thành', 'Số buổi học thành công', dateStr]);
  ws.addRow(['1-1', externalId, fullName, 10, 8, timeSlot, 1, 1, '1']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Acceptance: NO_SEND historical import lane emits no outbound messages', () => {
  let adminId: number, csId: number;
  let adminToken: string;
  let packageId: number, classId: number;
  let studentAId: number, studentBId: number;
  let enrollmentAId: number, enrollmentBId: number;
  let attendanceAId: number, attendanceBId: number;
  let workflowId: number, zaloAccountId: number;

  async function previewConfirm(buffer: Buffer, extraFields: Record<string, string> = {}) {
    const previewRes = await request(app)
      .post('/api/v1/attendance-reconciliation/import-excel/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('source', 'TEACHER')
      .field('targetYear', '2026')
      .attach('file', buffer, 'lichday.xlsx');
    expect(previewRes.status).toBe(200);
    const items = previewRes.body.data.items as any[];
    expect(items.length).toBe(1);
    const actions: Record<string, string> = { [items[0].id]: 'APPLY' };
    const confirmRes = await request(app)
      .post('/api/v1/attendance-reconciliation/import-excel/confirm')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('source', 'TEACHER')
      .field('targetYear', '2026')
      .field('actions', JSON.stringify(actions))
      .attach('file', buffer, 'lichday.xlsx');
    return confirmRes;
  }

  beforeAll(async () => {
    const admin = await prisma.user.create({ data: { email: `admin_${NS}@example.com`, name: 'NS Admin', password_hash: 'x', roles: ['ADMIN'] } });
    const cs = await prisma.user.create({ data: { email: `cs_${NS}@example.com`, name: 'NS CVHT', password_hash: 'x', roles: ['CS'] } });
    adminId = admin.id; csId = cs.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    const pkg = await prisma.package.create({ data: { code: `PKG_${NS}`, name: 'NS Package', default_total_sessions: 10 } });
    packageId = pkg.id;
    const cls = await prisma.class.create({
      data: { class_name: `Lớp NS ${NS}`, class_code: `CLSNS_${NS}`, model_type: ClassModelType.ONE_TO_ONE, attendance_source: 'LEARNING_SYSTEM' },
    });
    classId = cls.id;

    const studentA = await prisma.student.create({ data: { external_id: `HVA_${NS}`, full_name: 'NS Learner A' } });
    const studentB = await prisma.student.create({ data: { external_id: `HVB_${NS}`, full_name: 'NS Learner B' } });
    studentAId = studentA.id; studentBId = studentB.id;

    const enrollmentA = await prisma.enrollment.create({ data: { student_id: studentAId, package_id: packageId, cs_id: csId, total_sessions: 10, status: EnrollmentStatus.STUDYING } });
    const enrollmentB = await prisma.enrollment.create({ data: { student_id: studentBId, package_id: packageId, cs_id: csId, total_sessions: 10, status: EnrollmentStatus.STUDYING } });
    enrollmentAId = enrollmentA.id; enrollmentBId = enrollmentB.id;

    const ecA = await prisma.enrollmentClass.create({ data: { enrollment_id: enrollmentAId, class_id: classId, sequence_no: 1, status: EnrollmentClassStatus.ACTIVE } });
    const ecB = await prisma.enrollmentClass.create({ data: { enrollment_id: enrollmentBId, class_id: classId, sequence_no: 1, status: EnrollmentClassStatus.ACTIVE } });

    // Pre-existing sessions with CS-side opinion already ATTENDED (teacher side
    // open). The historical TEACHER-source workbook then fills the teacher
    // opinion -> the committed row is FINAL (MATCHED), i.e. exactly the state
    // under which SEND would schedule messages. NO_SEND must still emit none.
    const sessionA = await prisma.classSession.create({
      data: { class_id: classId, session_number: 1, session_date: new Date('2026-10-18T00:00:00Z'), start_time: '19:00', end_time: '19:30', created_by_id: adminId },
    });
    const sessionB = await prisma.classSession.create({
      data: { class_id: classId, session_number: 2, session_date: new Date('2026-10-18T00:00:00Z'), start_time: '20:00', end_time: '20:30', created_by_id: adminId },
    });
    const attendanceA = await prisma.attendance.create({
      data: { enrollment_class_id: ecA.id, class_session_id: sessionA.id, status: AttendanceStatus.ATTENDED, source: AttendanceSource.MANUAL, cs_status: AttendanceStatus.ATTENDED, reconciliation_state: ReconciliationState.PENDING_TEACHER, created_by_id: adminId, cs_user_id: csId },
    });
    const attendanceB = await prisma.attendance.create({
      data: { enrollment_class_id: ecB.id, class_session_id: sessionB.id, status: AttendanceStatus.ATTENDED, source: AttendanceSource.MANUAL, cs_status: AttendanceStatus.ATTENDED, reconciliation_state: ReconciliationState.PENDING_TEACHER, created_by_id: adminId, cs_user_id: csId },
    });
    attendanceAId = attendanceA.id; attendanceBId = attendanceB.id;

    // Active workflow with a step that WILL match the FINAL ATTENDED row and a
    // resolvable Zalo target, so the NO_SEND suppression is the only thing
    // standing between the commit and a delivery row.
    const workflow = await prisma.automationWorkflow.create({
      data: { name: `NS Workflow ${NS}`, owner_cs_id: csId, active: true },
    });
    workflowId = workflow.id;
    await prisma.automationStep.create({
      data: { workflow_id: workflowId, session_number: 1, trigger_event: AutomationTriggerEvent.ATTENDED, delay_minutes: 0, channel: AutomationChannel.ZALO_PERSONAL, message_content: 'Chao {{student_name}}, ban hoc buoi {{session_number}}', message_variables: [] as any, active: true },
    });
    await prisma.automationEnrollment.createMany({
      data: [{ workflow_id: workflowId, enrollment_id: enrollmentAId, added_by: adminId }, { workflow_id: workflowId, enrollment_id: enrollmentBId, added_by: adminId }],
    });
    const zalo = await prisma.zaloAccount.upsert({
      where: { zalo_uid: `zalo_${NS}` },
      update: { status: ZaloAccountStatus.ACTIVE, cs_id: csId },
      create: { cs_id: csId, zalo_uid: `zalo_${NS}`, display_name: 'NS Nick', status: ZaloAccountStatus.ACTIVE },
    });
    zaloAccountId = zalo.id;
    await ensureZaloFriendLinks();
  });

  afterAll(async () => {
    // FK-safe children-before-parents order (deliveries -> attendances ->
    // sessions; automation rows -> workflows; zalo relations -> accounts;
    // enrollments -> students; audit/auth -> users).
    const enrollmentIds = [enrollmentAId, enrollmentBId];
    const attendanceIds = (await prisma.attendance.findMany({
      where: { enrollment_class: { enrollment_id: { in: enrollmentIds } } },
      select: { id: true },
    })).map((a) => a.id);
    if (attendanceIds.length > 0) {
      await prisma.messageDelivery.deleteMany({ where: { attendance_id: { in: attendanceIds } } });
    }
    await prisma.attendance.deleteMany({ where: { enrollment_class: { enrollment_id: { in: enrollmentIds } } } });
    await prisma.classSession.deleteMany({ where: { class_id: classId } });
    await prisma.enrollmentClass.deleteMany({ where: { enrollment_id: { in: enrollmentIds } } });
    await prisma.careLog.deleteMany({ where: { enrollment_id: { in: enrollmentIds } } });
    await prisma.careTask.deleteMany({ where: { enrollment_id: { in: enrollmentIds } } });
    await prisma.automationEnrollment.deleteMany({ where: { enrollment_id: { in: enrollmentIds } } });
    await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
    await prisma.automationStep.deleteMany({ where: { workflow_id: workflowId } });
    await prisma.automationEnrollment.deleteMany({ where: { workflow_id: workflowId } });
    await prisma.automationWorkflow.deleteMany({ where: { id: workflowId } });
    await prisma.zaloContactRelation.deleteMany({ where: { student_id: { in: [studentAId, studentBId] } } });
    await prisma.zaloAccount.deleteMany({ where: { id: zaloAccountId } });
    await prisma.student.deleteMany({ where: { id: { in: [studentAId, studentBId] } } });
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.authSession.deleteMany({ where: { user_id: { in: [adminId, csId] } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: [adminId, csId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, csId] } } });
    await prisma.$disconnect();
  });

  // Re-establish the delivery-target precondition for this suite's students.
  // Concurrent integration workers share the test DB; the relation row can be
  // swept between beforeAll and a late assertion (observed intermittently),
  // which would make the "NO_SEND emitted nothing" assertion vacuous (no
  // resolvable link -> nothing to create either way). Re-upserting immediately
  // before each observation removes that coupling.
  async function ensureZaloFriendLinks() {
    const account = await prisma.zaloAccount.upsert({
      where: { zalo_uid: `zalo_${NS}` },
      update: { status: ZaloAccountStatus.ACTIVE, cs_id: csId },
      create: { cs_id: csId, zalo_uid: `zalo_${NS}`, display_name: 'NS Nick', status: ZaloAccountStatus.ACTIVE },
    });
    zaloAccountId = account.id;
    for (const sid of [studentAId, studentBId]) {
      await prisma.zaloContactRelation.upsert({
        where: { student_id_zalo_account_id: { student_id: sid, zalo_account_id: account.id } },
        update: { relation_status: ZaloContactRelationStatus.FRIEND },
        // display_name + friend_zalo_uid are set (like real synced rows) so the
        // care-group matcher's global "orphan relation" sweep — which deletes
        // relations with null group AND null friend UID AND null display_name,
        // and which other suites' import approvals can trigger concurrently
        // against the shared test DB — does not classify our fixtures as orphans.
        create: {
          student_id: sid,
          zalo_account_id: account.id,
          relation_status: ZaloContactRelationStatus.FRIEND,
          display_name: 'NS Friend Link',
          friend_zalo_uid: `friend_${NS}_${sid}`,
        },
      });
    }
  }

  it('NO_SEND (default) historical commit reaches MATCHED without creating any delivery row', async () => {
    // Prove the SEND control WOULD have had a resolvable target at this moment:
    // active workflow+step attached and a FRIEND Zalo relation for this student.
    // Without this, "0 deliveries" could be vacuously true.
    await ensureZaloFriendLinks();
    expect(await prisma.zaloContactRelation.count({
      where: { student_id: studentAId, relation_status: ZaloContactRelationStatus.FRIEND, zalo_account: { cs_id: csId, status: ZaloAccountStatus.ACTIVE } },
    })).toBe(1);
    expect(await prisma.automationEnrollment.count({ where: { enrollment_id: enrollmentAId, workflow: { active: true } } })).toBe(1);

    const buffer = await buildTeacherWorkbook(`HVA_${NS}`, 'NS Learner A', '19:00 - 19:30', '2026-10-18');
    const confirmRes = await previewConfirm(buffer);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.updatedAttendances).toBe(1);

    const att = await prisma.attendance.findUnique({ where: { id: attendanceAId } });
    expect(att?.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(att?.teacher_status).toBe(AttendanceStatus.ATTENDED);

    // The gate: historical lane emitted NO outbound message artifacts.
    expect(await prisma.messageDelivery.count({ where: { attendance_id: attendanceAId } })).toBe(0);
    expect(await prisma.messageDelivery.count({ where: { enrollment_id: enrollmentAId } })).toBe(0);
  });

  it('non-vacuity control: with the policy suppression removed, the SAME fixture machinery does create a delivery row', async () => {
    // First commit enrollment B's row through the importer under the DEFAULT
    // (NO_SEND) policy: still zero deliveries through the import lane.
    const buffer = await buildTeacherWorkbook(`HVB_${NS}`, 'NS Learner B', '20:00 - 20:30', '2026-10-18');
    const confirmRes = await previewConfirm(buffer);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.updatedAttendances).toBe(1);
    const att = await prisma.attendance.findUnique({ where: { id: attendanceBId } });
    expect(att?.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(await prisma.messageDelivery.count({ where: { enrollment_id: enrollmentBId } })).toBe(0);

    // Control: invoke the trigger directly — the exact call the lifecycle
    // suppresses under NO_SEND. Calling it outside the swallowed post-commit
    // wrapper keeps the assertion deterministic (a pool/timeout failure errors
    // loudly instead of silently producing 0 rows, which is itself the
    // production risk this suite flags). If this creates a delivery, the
    // zero-rows assertion above was caused by the NO_SEND policy, not by
    // missing workflow/target configuration.
    await ensureZaloFriendLinks();
    const result = await handleAttendanceEvent(attendanceBId);
    if (result.deliveriesCreated !== 1) {
      const relDbg = await prisma.zaloContactRelation.findMany({
        where: { student_id: studentBId },
        select: { id: true, relation_status: true, zalo_account_id: true, zalo_account: { select: { cs_id: true, status: true } } },
      });
      const enrDbg = await prisma.enrollment.findUnique({
        where: { id: enrollmentBId },
        select: { cs_id: true, student_id: true },
      });
      console.log('CONTROL_DIAG', JSON.stringify({ result, enrollmentB: enrDbg, studentBId, relations: relDbg, csId }));
    }
    expect(result.deliveriesCreated).toBe(1);

    const deliveries = await prisma.messageDelivery.findMany({ where: { enrollment_id: enrollmentBId } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe('SCHEDULED');
    // Adapter mocked -> enqueueDelivery returned null; nothing was pushed to Redis.
    expect(deliveries[0].queue_job_id).toBeNull();

    // The NO_SEND enrollment A still has zero rows.
    expect(await prisma.messageDelivery.count({ where: { enrollment_id: enrollmentAId } })).toBe(0);
  });
});
