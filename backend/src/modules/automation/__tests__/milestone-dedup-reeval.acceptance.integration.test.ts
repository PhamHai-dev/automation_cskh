/**
 * ACCEPTANCE (DB-backed, automation_cskh_test via .env.test):
 * Owner-approved S1a/S2c milestone occurrence dedup + forward re-evaluation
 * (2026-10-26) — proves all 6 mandatory acceptance scenarios (a)–(f) plus the
 * worker send-time eligibility re-check against real MySQL + Prisma 5:
 *
 *  (a) Out-of-order same-day finalization: B @09:00 finalizes before A @01:00.
 *      Neither misses a milestone (step 5 and step 6 both covered when count
 *      reaches 5 then 6) NOR duplicates a delivery for step 5 (1 occurrence
 *      row per (enrollment_id, step_id), basis rebound in place to A).
 *  (b) FINAL → CONFLICT → FINAL:
 *      - an unsent SCHEDULED/QUEUED delivery is cancelled on drop to CONFLICT
 *        and reactivated once (same row id, never duplicated) on return to
 *        FINAL;
 *      - a milestone already SENT is never cancelled and never re-sent.
 *  (c) Basis attendance replacement: when a milestone's basis attendance is
 *      replaced by another qualifying attendance (e.g. original basis drops to
 *      CONFLICT while a neighbour shifts into that ordinal, or an earlier-date
 *      session finalizes), dedup by (enrollment_id, step_id) holds (1 row,
 *      updated basis if unsent, untouched if SENT).
 *  (d) Concurrency guard: two concurrent requests reaching the same milestone
 *      create only ONE occurrence / ONE delivery per step and ONE
 *      enqueueDelivery call, even without the schema unique migration applied.
 *  (e) NO_SEND: progress (K7 count/ordinals) advances and invalidated pending
 *      deliveries still cancel, but 0 new deliveries are created.
 *  (f) Enrollment isolation: two different enrollments of the SAME student have
 *      completely independent milestones (reaching step 5 on enrollment 1 does
 *      not suppress step 5 on enrollment 2).
 *
 * Outbound channels (BullMQ/Zalo/LINE) are mocked so zero network/Redis traffic
 * occurs. Fixtures use namespace `acc_ms_dedup_20261026` and are cleaned up in
 * FK-safe children-before-users order with zero residue verified in afterAll.
 */

jest.mock('../automation-bullmq-adapter', () => ({
  enqueueDelivery: jest.fn(),
  cancelDelivery: jest.fn(),
  closeAutomationQueue: jest.fn(),
}));

jest.mock('../../zalo/zalo-pool', () => ({
  zaloPool: {
    getApi: jest.fn(),
    tryReconnect: jest.fn(),
  },
}));

import type { Job } from 'bullmq';
import { prisma } from '../../../prisma/client';
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
import { enqueueDelivery, cancelDelivery } from '../automation-bullmq-adapter';
import { zaloPool } from '../../zalo/zalo-pool';
import {
  cancelPendingDeliveries,
  handleAttendanceEvent,
  reconcileEnrollmentMilestones,
} from '../automation-trigger.service';
import { runAttendancePostCommit } from '../../attendance/attendance-lifecycle';
import { processDeliveryJob, type SendJobData } from '../automation-worker';

const NS = 'acc_ms_dedup_20261026';

describe('Acceptance (DB): S1a/S2c milestone occurrence dedup & forward re-evaluation', () => {
  let adminId: number;
  let csId: number;
  let packageId: number;
  let classId: number;
  let zaloAccountId: number;
  let workflowId: number;
  let step5Id: number;
  let step6Id: number;

  const createdStudentIds: number[] = [];
  const createdEnrollmentIds: number[] = [];
  const createdEnrollmentClassIds: number[] = [];
  const createdSessionIds: number[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `admin_${NS}@example.com`,
        name: 'MS Dedup Admin',
        password_hash: 'x',
        roles: ['ADMIN'],
      },
    });
    const cs = await prisma.user.create({
      data: {
        email: `cs_${NS}@example.com`,
        name: 'MS Dedup CS',
        password_hash: 'x',
        roles: ['CS'],
      },
    });
    adminId = admin.id;
    csId = cs.id;

    const pkg = await prisma.package.create({
      data: {
        code: `PKG_${NS}`,
        name: 'Gói N3 Milestone Acceptance',
        default_total_sessions: 24,
      },
    });
    packageId = pkg.id;

    const cls = await prisma.class.create({
      data: {
        class_name: `Lớp ${NS}`,
        class_code: `CLS_${NS}`,
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: 'LEARNING_SYSTEM',
      },
    });
    classId = cls.id;

    const zalo = await prisma.zaloAccount.upsert({
      where: { zalo_uid: `zalo_${NS}` },
      update: { status: ZaloAccountStatus.ACTIVE, cs_id: csId },
      create: {
        cs_id: csId,
        zalo_uid: `zalo_${NS}`,
        display_name: 'Zalo Acceptance CS',
        status: ZaloAccountStatus.ACTIVE,
      },
    });
    zaloAccountId = zalo.id;

    const wf = await prisma.automationWorkflow.create({
      data: {
        name: `Workflow ${NS}`,
        owner_cs_id: csId,
        active: true,
      },
    });
    workflowId = wf.id;

    const s5 = await prisma.automationStep.create({
      data: {
        workflow_id: workflowId,
        session_number: 5,
        trigger_event: AutomationTriggerEvent.ATTENDED,
        delay_minutes: 5,
        channel: AutomationChannel.ZALO_PERSONAL,
        message_content: 'Chúc mừng {{student_name}} hoàn thành mốc buổi {{session_number}}!',
        message_variables: ['student_name', 'session_number'] as any,
        active: true,
      },
    });
    const s6 = await prisma.automationStep.create({
      data: {
        workflow_id: workflowId,
        session_number: 6,
        trigger_event: AutomationTriggerEvent.ATTENDED,
        delay_minutes: 5,
        channel: AutomationChannel.ZALO_PERSONAL,
        message_content: 'Chúc mừng {{student_name}} hoàn thành mốc buổi {{session_number}}!',
        message_variables: ['student_name', 'session_number'] as any,
        active: true,
      },
    });
    step5Id = s5.id;
    step6Id = s6.id;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (enqueueDelivery as jest.Mock).mockImplementation(
      async ({ deliveryId }: { deliveryId: number }) => `automation:delivery:${deliveryId}`,
    );
    (cancelDelivery as jest.Mock).mockResolvedValue(undefined);
  });

  afterAll(async () => {
    // FK-safe teardown: children before parents, then verify zero residue.
    if (createdEnrollmentIds.length > 0) {
      await prisma.messageDelivery.deleteMany({
        where: { enrollment_id: { in: createdEnrollmentIds } },
      });
      await prisma.attendance.deleteMany({
        where: { enrollment_class: { enrollment_id: { in: createdEnrollmentIds } } },
      });
      await prisma.automationEnrollment.deleteMany({
        where: { enrollment_id: { in: createdEnrollmentIds } },
      });
      await prisma.careLog.deleteMany({
        where: { enrollment_id: { in: createdEnrollmentIds } },
      });
      await prisma.careTask.deleteMany({
        where: { enrollment_id: { in: createdEnrollmentIds } },
      });
    }
    if (createdSessionIds.length > 0) {
      await prisma.classSession.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
    }
    if (createdEnrollmentClassIds.length > 0) {
      await prisma.enrollmentClass.deleteMany({
        where: { id: { in: createdEnrollmentClassIds } },
      });
    }
    if (createdEnrollmentIds.length > 0) {
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
    }
    if (workflowId) {
      await prisma.automationStep.deleteMany({ where: { workflow_id: workflowId } });
      await prisma.automationEnrollment.deleteMany({ where: { workflow_id: workflowId } });
      await prisma.automationWorkflow.deleteMany({ where: { id: workflowId } });
    }
    if (createdStudentIds.length > 0) {
      await prisma.zaloContactRelation.deleteMany({
        where: { student_id: { in: createdStudentIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds } },
      });
    }
    if (zaloAccountId) {
      await prisma.zaloAccount.deleteMany({ where: { id: zaloAccountId } });
    }
    if (classId) {
      await prisma.classSession.deleteMany({ where: { class_id: classId } });
      await prisma.class.deleteMany({ where: { id: classId } });
    }
    if (packageId) {
      await prisma.package.deleteMany({ where: { id: packageId } });
    }
    const userIds = [adminId, csId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.authSession.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    // Verify zero residue
    const remUsers = await prisma.user.count({
      where: { email: { endsWith: `_${NS}@example.com` } },
    });
    expect(remUsers).toBe(0);
    await prisma.$disconnect();
  });

  async function createStudentAndEnrollment(tag: string, existingStudentId?: number) {
    let studentId = existingStudentId;
    if (!studentId) {
      const student = await prisma.student.create({
        data: {
          external_id: `HV_${tag}_${NS}`,
          full_name: `Học Viên ${tag}`,
          phone: '0988767563',
        },
      });
      studentId = student.id;
      createdStudentIds.push(studentId);
    }

    await prisma.zaloContactRelation.upsert({
      where: {
        student_id_zalo_account_id: {
          student_id: studentId,
          zalo_account_id: zaloAccountId,
        },
      },
      update: {
        relation_status: ZaloContactRelationStatus.FRIEND,
        display_name: `Friend ${tag}`,
        friend_zalo_uid: `zuid_${tag}_${NS}`,
      },
      create: {
        student_id: studentId,
        zalo_account_id: zaloAccountId,
        relation_status: ZaloContactRelationStatus.FRIEND,
        display_name: `Friend ${tag}`,
        friend_zalo_uid: `zuid_${tag}_${NS}`,
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        student_id: studentId,
        package_id: packageId,
        cs_id: csId,
        total_sessions: 24,
        status: EnrollmentStatus.STUDYING,
        auto_message_enabled: true,
      },
    });
    createdEnrollmentIds.push(enrollment.id);

    const ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollment.id,
        class_id: classId,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });
    createdEnrollmentClassIds.push(ec.id);

    await prisma.automationEnrollment.create({
      data: {
        workflow_id: workflowId,
        enrollment_id: enrollment.id,
        added_by: adminId,
      },
    });

    return { studentId, enrollmentId: enrollment.id, ecId: ec.id };
  }

  let sessionSeq = 100;
  async function createAttendanceRow(params: {
    ecId: number;
    sessionDate: string;
    createdAt: Date;
    status?: AttendanceStatus;
    reconciliationState?: ReconciliationState;
  }) {
    const session = await prisma.classSession.create({
      data: {
        class_id: classId,
        session_number: ++sessionSeq,
        session_date: new Date(`${params.sessionDate}T00:00:00.000Z`),
        start_time: '19:00',
        end_time: '19:30',
        created_by_id: adminId,
      },
    });
    createdSessionIds.push(session.id);

    const status = params.status ?? AttendanceStatus.ATTENDED;
    const state = params.reconciliationState ?? ReconciliationState.MATCHED;
    const att = await prisma.attendance.create({
      data: {
        enrollment_class_id: params.ecId,
        class_session_id: session.id,
        status,
        teacher_status: status,
        cs_status: state === ReconciliationState.MATCHED ? status : null,
        source: AttendanceSource.MANUAL,
        reconciliation_state: state,
        created_by_id: adminId,
        cs_user_id: csId,
        created_at: params.createdAt,
      },
    });
    return att;
  }

  it('(a) two same-day sessions finalized out of order (B @09:00 then A @01:00): neither misses step 5/6 nor duplicates step 5', async () => {
    const { enrollmentId, ecId } = await createStudentAndEnrollment('S1A');

    // 4 earlier FINAL ATTENDED rows on prior dates (ordinals 1..4)
    const earlierDates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
    for (let i = 0; i < earlierDates.length; i++) {
      await createAttendanceRow({
        ecId,
        sessionDate: earlierDates[i],
        createdAt: new Date(`${earlierDates[i]}T01:00:00.000Z`),
      });
    }

    // Same-day sessions on 2026-10-18:
    // A created at 01:00 (initially PENDING_CS), B created at 09:00 (MATCHED first).
    const attA = await createAttendanceRow({
      ecId,
      sessionDate: '2026-10-18',
      createdAt: new Date('2026-10-18T01:00:00.000Z'),
      reconciliationState: ReconciliationState.PENDING_CS,
    });
    const attB = await createAttendanceRow({
      ecId,
      sessionDate: '2026-10-18',
      createdAt: new Date('2026-10-18T09:00:00.000Z'),
      reconciliationState: ReconciliationState.MATCHED,
    });

    // 1. B finalizes first -> reaches ordinal 5 -> creates 1 delivery for step 5.
    const resB = await handleAttendanceEvent(attB.id);
    expect(resB.deliveriesCreated).toBe(1);

    let deliveries = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId },
      orderBy: { automation_step_id: 'asc' },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].automation_step_id).toBe(step5Id);
    expect(deliveries[0].attendance_id).toBe(attB.id);
    expect(deliveries[0].status).toBe('QUEUED');
    const step5DeliveryId = deliveries[0].id;

    // 2. A finalizes second (out of order) -> A is now ordinal 5 and B shifts to ordinal 6!
    await prisma.attendance.update({
      where: { id: attA.id },
      data: {
        cs_status: AttendanceStatus.ATTENDED,
        reconciliation_state: ReconciliationState.MATCHED,
      },
    });
    const resA = await handleAttendanceEvent(attA.id);

    // Step 6 is created once (for B), while step 5 is NOT duplicated (rebound to A in place).
    expect(resA.deliveriesCreated).toBe(1);

    deliveries = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId },
      orderBy: { automation_step_id: 'asc' },
    });
    expect(deliveries).toHaveLength(2);

    const dStep5 = deliveries.find((d) => d.automation_step_id === step5Id)!;
    const dStep6 = deliveries.find((d) => d.automation_step_id === step6Id)!;
    expect(dStep5.id).toBe(step5DeliveryId); // same occurrence row preserved
    expect(dStep5.attendance_id).toBe(attA.id); // basis rebound to A
    expect(dStep5.status).toBe('QUEUED');

    expect(dStep6.attendance_id).toBe(attB.id); // B is now basis for step 6
    expect(dStep6.status).toBe('QUEUED');

    // Total enqueueDelivery calls: 1 for step 5 + 1 for step 6 = 2.
    expect(enqueueDelivery).toHaveBeenCalledTimes(2);
  });

  it('(b) FINAL → CONFLICT → FINAL: unsent delivery cancels on drop and reactivates once on return; SENT delivery is never cancelled or re-sent + worker send-time recheck cancels stale job', async () => {
    const { enrollmentId, ecId } = await createStudentAndEnrollment('S2B');

    const earlierDates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
    for (const d of earlierDates) {
      await createAttendanceRow({
        ecId,
        sessionDate: d,
        createdAt: new Date(`${d}T01:00:00.000Z`),
      });
    }

    // 5th session reaches FINAL -> creates unsent QUEUED delivery for step 5
    const att5 = await createAttendanceRow({
      ecId,
      sessionDate: '2026-10-18',
      createdAt: new Date('2026-10-18T01:00:00.000Z'),
      reconciliationState: ReconciliationState.MATCHED,
    });
    await runAttendancePostCommit({
      attendanceId: att5.id,
      reconciliationState: ReconciliationState.MATCHED,
      deliveryPolicy: 'SEND',
    });

    let rows = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId, automation_step_id: step5Id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('QUEUED');
    const originalDeliveryId = rows[0].id;

    // Flip att5 to CONFLICT -> post-commit cancels unsent delivery and removes BullMQ job
    await prisma.attendance.update({
      where: { id: att5.id },
      data: {
        cs_status: AttendanceStatus.ABSENT_UNAPPROVED_C,
        reconciliation_state: ReconciliationState.CONFLICT,
      },
    });
    await runAttendancePostCommit({
      attendanceId: att5.id,
      reconciliationState: ReconciliationState.CONFLICT,
      deliveryPolicy: 'SEND',
      invalidatePendingDeliveries: true,
    });

    rows = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId, automation_step_id: step5Id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(originalDeliveryId);
    expect(rows[0].status).toBe('CANCELLED');
    expect(cancelDelivery).toHaveBeenCalledWith(originalDeliveryId);

    // Return att5 to FINAL (RESOLVED as ATTENDED) -> reactivates the SAME row in place (no duplicate row)
    await prisma.attendance.update({
      where: { id: att5.id },
      data: {
        status: AttendanceStatus.ATTENDED,
        reconciliation_state: ReconciliationState.RESOLVED,
      },
    });
    await runAttendancePostCommit({
      attendanceId: att5.id,
      reconciliationState: ReconciliationState.RESOLVED,
      deliveryPolicy: 'SEND',
    });

    rows = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId, automation_step_id: step5Id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(originalDeliveryId);
    expect(rows[0].status).toBe('QUEUED');

    // Worker send-time recheck: if att5 drops to CONFLICT in DB right before worker processes the job
    // (before cancelPendingDeliveries runs), worker checkInvariants catches it and marks CANCELLED without sending!
    const mockSendMessage = jest.fn();
    (zaloPool.getApi as jest.Mock).mockReturnValue({ sendMessage: mockSendMessage });
    await prisma.attendance.update({
      where: { id: att5.id },
      data: { reconciliation_state: ReconciliationState.CONFLICT },
    });
    await processDeliveryJob({
      id: `automation:delivery:${originalDeliveryId}`,
      data: {
        deliveryId: originalDeliveryId,
        automationStepId: step5Id,
        enrollmentId,
        attendanceId: att5.id,
      },
    } as unknown as Job<SendJobData>);

    expect(mockSendMessage).not.toHaveBeenCalled();
    const afterWorker = await prisma.messageDelivery.findUnique({ where: { id: originalDeliveryId } });
    expect(afterWorker?.status).toBe('CANCELLED');
    expect(afterWorker?.error_message).toBe('Milestone no longer eligible at send time');

    // Now mark the delivery as SENT and verify FINAL -> CONFLICT -> FINAL never cancels or re-sends it
    await prisma.attendance.update({
      where: { id: att5.id },
      data: { reconciliation_state: ReconciliationState.MATCHED },
    });
    await prisma.messageDelivery.update({
      where: { id: originalDeliveryId },
      data: { status: 'SENT', sent_at: new Date(), error_message: null },
    });

    const enqueuesBeforeSentCycle = (enqueueDelivery as jest.Mock).mock.calls.length;
    await prisma.attendance.update({
      where: { id: att5.id },
      data: { reconciliation_state: ReconciliationState.CONFLICT },
    });
    await cancelPendingDeliveries(att5.id);
    expect((await prisma.messageDelivery.findUnique({ where: { id: originalDeliveryId } }))?.status).toBe('SENT');

    await prisma.attendance.update({
      where: { id: att5.id },
      data: { reconciliation_state: ReconciliationState.RESOLVED },
    });
    const resAfterSent = await handleAttendanceEvent(att5.id);
    expect(resAfterSent.deliveriesCreated).toBe(0);
    expect((enqueueDelivery as jest.Mock).mock.calls.length).toBe(enqueuesBeforeSentCycle);
    expect(
      await prisma.messageDelivery.count({
        where: { enrollment_id: enrollmentId, automation_step_id: step5Id },
      }),
    ).toBe(1);
  });

  it('(c) basis attendance of a milestone is replaced by another attendance: dedup by (enrollment_id, step_id) holds', async () => {
    const { enrollmentId, ecId } = await createStudentAndEnrollment('S2C');

    const earlierDates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
    for (const d of earlierDates) {
      await createAttendanceRow({
        ecId,
        sessionDate: d,
        createdAt: new Date(`${d}T01:00:00.000Z`),
      });
    }

    // E (01:00) and G (09:00) on 2026-10-18:
    // E finalizes at ordinal 5 -> creates step 5 delivery bound to E.
    // G finalizes at ordinal 6 -> creates step 6 delivery bound to G.
    const attE = await createAttendanceRow({
      ecId,
      sessionDate: '2026-10-18',
      createdAt: new Date('2026-10-18T01:00:00.000Z'),
      reconciliationState: ReconciliationState.MATCHED,
    });
    await handleAttendanceEvent(attE.id);

    const attG = await createAttendanceRow({
      ecId,
      sessionDate: '2026-10-18',
      createdAt: new Date('2026-10-18T09:00:00.000Z'),
      reconciliationState: ReconciliationState.MATCHED,
    });
    await handleAttendanceEvent(attG.id);

    const beforeDrop = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId },
    });
    expect(beforeDrop).toHaveLength(2);
    const step5RowBefore = beforeDrop.find((d) => d.automation_step_id === step5Id)!;
    expect(step5RowBefore.attendance_id).toBe(attE.id);

    // Now E drops to CONFLICT -> G shifts down to ordinal 5 (replacing E as basis of step 5),
    // and step 6 (no longer eligible) is cancelled!
    await prisma.attendance.update({
      where: { id: attE.id },
      data: { reconciliation_state: ReconciliationState.CONFLICT },
    });
    await runAttendancePostCommit({
      attendanceId: attE.id,
      reconciliationState: ReconciliationState.CONFLICT,
      deliveryPolicy: 'SEND',
      invalidatePendingDeliveries: true,
    });

    const afterDrop = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId },
    });
    expect(afterDrop).toHaveLength(2); // still 1 row for step 5 + 1 row for step 6

    const step5RowAfter = afterDrop.find((d) => d.automation_step_id === step5Id)!;
    const step6RowAfter = afterDrop.find((d) => d.automation_step_id === step6Id)!;
    expect(step5RowAfter.id).toBe(step5RowBefore.id); // same occurrence row id
    expect(step5RowAfter.attendance_id).toBe(attG.id); // basis rebound from E to G
    expect(step5RowAfter.status).toBe('QUEUED');
    expect(step6RowAfter.status).toBe('CANCELLED');
  });

  it('(d) two concurrent requests reaching the same milestone create only ONE occurrence and ONE enqueueDelivery call', async () => {
    const { enrollmentId, ecId } = await createStudentAndEnrollment('CONC');

    const earlierDates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
    for (const d of earlierDates) {
      await createAttendanceRow({
        ecId,
        sessionDate: d,
        createdAt: new Date(`${d}T01:00:00.000Z`),
      });
    }

    const att5 = await createAttendanceRow({
      ecId,
      sessionDate: '2026-10-18',
      createdAt: new Date('2026-10-18T01:00:00.000Z'),
      reconciliationState: ReconciliationState.MATCHED,
    });

    // Fire two concurrent handleAttendanceEvent calls reaching step 5 at the same time
    const [r1, r2] = await Promise.all([
      handleAttendanceEvent(att5.id),
      handleAttendanceEvent(att5.id),
    ]);

    expect([r1.deliveriesCreated, r2.deliveriesCreated].sort()).toEqual([0, 1]);
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);

    const dbRows = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId, automation_step_id: step5Id },
    });
    expect(dbRows).toHaveLength(1);
    expect(dbRows[0].attendance_id).toBe(att5.id);
    expect(dbRows[0].status).toBe('QUEUED');
  });

  it('(e) NO_SEND: K7 progress advances and invalidated pending deliveries cancel, but 0 new deliveries are created', async () => {
    const { enrollmentId, ecId } = await createStudentAndEnrollment('NOSEND');

    const dates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'];
    const createdAtts = [];
    for (const d of dates) {
      const att = await createAttendanceRow({
        ecId,
        sessionDate: d,
        createdAt: new Date(`${d}T01:00:00.000Z`),
        reconciliationState: ReconciliationState.MATCHED,
      });
      createdAtts.push(att);
      await runAttendancePostCommit({
        attendanceId: att.id,
        reconciliationState: ReconciliationState.MATCHED,
        deliveryPolicy: 'NO_SEND',
      });
    }

    // K7 progress count is 5, but 0 deliveries created under NO_SEND
    const k7Count = await prisma.attendance.count({
      where: {
        enrollment_class: { enrollment_id: enrollmentId },
        status: AttendanceStatus.ATTENDED,
        reconciliation_state: { in: [ReconciliationState.MATCHED, ReconciliationState.RESOLVED] },
        deleted_at: null,
      },
    });
    expect(k7Count).toBe(5);
    expect(await prisma.messageDelivery.count({ where: { enrollment_id: enrollmentId } })).toBe(0);
    expect(enqueueDelivery).not.toHaveBeenCalled();

    // Now create the delivery under SEND, then drop the 5th row to CONFLICT under NO_SEND -> must cancel!
    await reconcileEnrollmentMilestones(enrollmentId, { deliveryPolicy: 'SEND' });
    expect(
      await prisma.messageDelivery.count({
        where: { enrollment_id: enrollmentId, status: 'QUEUED' },
      }),
    ).toBe(1);

    const fifthAtt = createdAtts[4];
    await prisma.attendance.update({
      where: { id: fifthAtt.id },
      data: { reconciliation_state: ReconciliationState.CONFLICT },
    });
    await runAttendancePostCommit({
      attendanceId: fifthAtt.id,
      reconciliationState: ReconciliationState.CONFLICT,
      deliveryPolicy: 'NO_SEND',
      invalidatePendingDeliveries: true,
    });

    const afterCancel = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId },
    });
    expect(afterCancel).toHaveLength(1);
    expect(afterCancel[0].status).toBe('CANCELLED');
    const cancelledId = afterCancel[0].id;

    // Owner Point 5: under NO_SEND, if the 5th row returns to FINAL (making step 5 eligible again),
    // the existing CANCELLED occurrence must NOT be reactivated or enqueued!
    const enqueuesBeforeNoSendReactivate = (enqueueDelivery as jest.Mock).mock.calls.length;
    await prisma.attendance.update({
      where: { id: fifthAtt.id },
      data: { reconciliation_state: ReconciliationState.MATCHED },
    });
    await runAttendancePostCommit({
      attendanceId: fifthAtt.id,
      reconciliationState: ReconciliationState.MATCHED,
      deliveryPolicy: 'NO_SEND',
    });
    await handleAttendanceEvent(fifthAtt.id, { deliveryPolicy: 'NO_SEND' });
    await reconcileEnrollmentMilestones(enrollmentId, { deliveryPolicy: 'NO_SEND' });

    const afterNoSendReeligible = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enrollmentId },
    });
    expect(afterNoSendReeligible).toHaveLength(1);
    expect(afterNoSendReeligible[0].id).toBe(cancelledId);
    expect(afterNoSendReeligible[0].status).toBe('CANCELLED');
    expect((enqueueDelivery as jest.Mock).mock.calls.length).toBe(enqueuesBeforeNoSendReactivate);
  });

  it('(f) two different enrollments of the SAME student have completely independent milestones', async () => {
    const enr1 = await createStudentAndEnrollment('SAME_STU_E1');
    const enr2 = await createStudentAndEnrollment('SAME_STU_E2', enr1.studentId);
    expect(enr1.studentId).toBe(enr2.studentId);
    expect(enr1.enrollmentId).not.toBe(enr2.enrollmentId);

    const dates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'];
    let lastAtt1Id = 0;
    let lastAtt2Id = 0;
    for (const d of dates) {
      const a1 = await createAttendanceRow({
        ecId: enr1.ecId,
        sessionDate: d,
        createdAt: new Date(`${d}T01:00:00.000Z`),
      });
      lastAtt1Id = a1.id;
      const a2 = await createAttendanceRow({
        ecId: enr2.ecId,
        sessionDate: d,
        createdAt: new Date(`${d}T02:00:00.000Z`),
      });
      lastAtt2Id = a2.id;
    }

    const res1 = await handleAttendanceEvent(lastAtt1Id);
    const res2 = await handleAttendanceEvent(lastAtt2Id);
    expect(res1.deliveriesCreated).toBe(1);
    expect(res2.deliveriesCreated).toBe(1);

    const deliv1 = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enr1.enrollmentId, automation_step_id: step5Id },
    });
    const deliv2 = await prisma.messageDelivery.findMany({
      where: { enrollment_id: enr2.enrollmentId, automation_step_id: step5Id },
    });
    expect(deliv1).toHaveLength(1);
    expect(deliv2).toHaveLength(1);
    expect(deliv1[0].id).not.toBe(deliv2[0].id);
    expect(deliv1[0].attendance_id).toBe(lastAtt1Id);
    expect(deliv2[0].attendance_id).toBe(lastAtt2Id);
  });

  it('(g) Rebind consistency (Owner Point 5): rebinding a SCHEDULED/QUEUED occurrence refreshes rendered_content & variables_snapshot in place, keeps scheduled_at, and stale BullMQ job payload reads fresh content from DB at send time', async () => {
    const { enrollmentId, ecId } = await createStudentAndEnrollment('REBIND_CONS');

    // Second class to observe class_name change in rendered_content & variables_snapshot on rebind
    const cls2 = await prisma.class.create({
      data: {
        class_name: `Lớp Chuyển ${NS}`,
        class_code: `CLS2_${NS}`,
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: 'LEARNING_SYSTEM',
      },
    });
    const ec2 = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollmentId,
        class_id: cls2.id,
        sequence_no: 2,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });
    createdEnrollmentClassIds.push(ec2.id);

    // Temporarily include {{class_name}} in step 5 template to verify render refresh on rebind
    await prisma.automationStep.update({
      where: { id: step5Id },
      data: {
        message_content:
          'Chúc mừng {{student_name}} hoàn thành mốc buổi {{session_number}} tại {{class_name}}!',
        message_variables: ['student_name', 'session_number', 'class_name'] as any,
      },
    });

    try {
      const earlierDates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
      for (const d of earlierDates) {
        await createAttendanceRow({
          ecId,
          sessionDate: d,
          createdAt: new Date(`${d}T01:00:00.000Z`),
        });
      }

      // A @01:00 on transferred class cls2 (initially PENDING_CS); B @09:00 on original class (MATCHED first)
      const sA = await prisma.classSession.create({
        data: {
          class_id: cls2.id,
          session_number: ++sessionSeq,
          session_date: new Date('2026-10-18T00:00:00.000Z'),
          start_time: '08:00',
          end_time: '08:30',
          created_by_id: adminId,
        },
      });
      createdSessionIds.push(sA.id);
      const attA = await prisma.attendance.create({
        data: {
          enrollment_class_id: ec2.id,
          class_session_id: sA.id,
          status: AttendanceStatus.ATTENDED,
          teacher_status: AttendanceStatus.ATTENDED,
          cs_status: null,
          source: AttendanceSource.MANUAL,
          reconciliation_state: ReconciliationState.PENDING_CS,
          created_by_id: adminId,
          cs_user_id: csId,
          created_at: new Date('2026-10-18T01:00:00.000Z'),
        },
      });

      const attB = await createAttendanceRow({
        ecId,
        sessionDate: '2026-10-18',
        createdAt: new Date('2026-10-18T09:00:00.000Z'),
        reconciliationState: ReconciliationState.MATCHED,
      });

      // 1. B finalizes first -> creates step 5 occurrence with class_name = `Lớp ${NS}`
      await handleAttendanceEvent(attB.id);
      const beforeRebind = await prisma.messageDelivery.findFirstOrThrow({
        where: { enrollment_id: enrollmentId, automation_step_id: step5Id },
      });
      expect(beforeRebind.attendance_id).toBe(attB.id);
      expect(beforeRebind.rendered_content).toContain(`Lớp ${NS}`);
      expect((beforeRebind.variables_snapshot as any)?.class_name).toBe(`Lớp ${NS}`);
      const originalScheduledAt = beforeRebind.scheduled_at.getTime();
      const capturedJobPayload = (enqueueDelivery as jest.Mock).mock.calls[0][0] as SendJobData;
      expect(capturedJobPayload.attendanceId).toBe(attB.id);

      // 2. A finalizes second -> step 5 occurrence rebinds in place from attB to attA (`Lớp Chuyển ${NS}`)
      await prisma.attendance.update({
        where: { id: attA.id },
        data: {
          cs_status: AttendanceStatus.ATTENDED,
          reconciliation_state: ReconciliationState.MATCHED,
        },
      });
      await handleAttendanceEvent(attA.id);

      const afterRebind = await prisma.messageDelivery.findUniqueOrThrow({
        where: { id: beforeRebind.id },
      });
      expect(afterRebind.attendance_id).toBe(attA.id);
      expect(afterRebind.rendered_content).toContain(`Lớp Chuyển ${NS}`);
      expect((afterRebind.variables_snapshot as any)?.class_name).toBe(`Lớp Chuyển ${NS}`);
      expect(afterRebind.scheduled_at.getTime()).toBe(originalScheduledAt);

      // 3. Execute the already-enqueued BullMQ job (still carrying old attendanceId = attB.id in job.data):
      //    processDeliveryJob loads delivery by deliveryId from DB and sends the refreshed rendered_content!
      const mockSendMessage = jest.fn().mockResolvedValue({ data: { messageId: 'pmid_rebind_1' } });
      (zaloPool.getApi as jest.Mock).mockReturnValue({ sendMessage: mockSendMessage });
      await processDeliveryJob({
        id: `automation:delivery:${beforeRebind.id}`,
        data: capturedJobPayload, // stale attendanceId = attB.id
      } as unknown as Job<SendJobData>);

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage.mock.calls[0][0]).toContain(`Lớp Chuyển ${NS}`);
      const sentRow = await prisma.messageDelivery.findUniqueOrThrow({ where: { id: beforeRebind.id } });
      expect(sentRow.status).toBe('SENT');
      expect(sentRow.provider_message_id).toBe('pmid_rebind_1');
    } finally {
      await prisma.automationStep.update({
        where: { id: step5Id },
        data: {
          message_content: 'Chúc mừng {{student_name}} hoàn thành mốc buổi {{session_number}}!',
          message_variables: ['student_name', 'session_number'] as any,
        },
      });
      await prisma.messageDelivery.deleteMany({ where: { enrollment_id: enrollmentId } });
      await prisma.attendance.deleteMany({ where: { enrollment_class_id: ec2.id } });
      await prisma.classSession.deleteMany({ where: { class_id: cls2.id } });
      await prisma.enrollmentClass.deleteMany({ where: { id: ec2.id } });
      await prisma.class.deleteMany({ where: { id: cls2.id } });
    }
  });
});
