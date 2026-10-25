/**
 * Unit tests for the care-milestone session ordinal (D1 APPROVED 2026-10-25,
 * basis K7): FINAL ATTENDED rows (MATCHED/RESOLVED, not soft-deleted) each get
 * their own increasing ordinal, ordered by (session_date, created_at, id), so
 * two valid same-day sessions count twice instead of colliding on one number.
 *
 * Mock-only: prisma.attendance.count is backed by a tiny in-memory evaluator
 * that interprets exactly the where-clause shape emitted by
 * resolveEnrollmentSessionNumber (via handleAttendanceEvent). No DB is touched.
 */

jest.mock('../../../prisma/client', () => ({
  prisma: {
    attendance: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    enrollment: {
      findUnique: jest.fn(),
    },
    automationStep: {
      findMany: jest.fn(),
    },
    messageDelivery: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    zaloContactRelation: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../automation-bullmq-adapter', () => ({
  enqueueDelivery: jest.fn(),
  cancelDelivery: jest.fn(),
}));

import { prisma } from '../../../prisma/client';
import { enqueueDelivery } from '../automation-bullmq-adapter';
import { handleAttendanceEvent } from '../automation-trigger.service';

// ─── In-memory FINAL-ATTENDED row store ──────────────────────────────────────

interface FakeRow {
  id: number;
  enrollment_id: number;
  session_date: Date;
  created_at: Date;
  status: string;
  reconciliation_state: string;
  deleted_at: Date | null;
}

let rows: FakeRow[] = [];

const sameDate = (a: Date, b: Date) => a.getTime() === b.getTime();

/**
 * Interprets the exact `where` shape produced by
 * resolveEnrollmentSessionNumber: base filters + OR [date-lt,
 * same-day created_at-lt, same-day same created_at id-lt].
 */
function fakeCount(where: any): number {
  return rows.filter((r) => {
    if (r.enrollment_id !== where.enrollment_class.enrollment_id) return false;
    if (r.status !== where.status) return false;
    if (!where.reconciliation_state.in.includes(r.reconciliation_state)) return false;
    if ((r.deleted_at ?? null) !== where.deleted_at) return false;
    return where.OR.some((branch: any) => {
      if (branch.class_session.session_date.lt !== undefined) {
        return r.session_date < branch.class_session.session_date.lt;
      }
      const day = branch.class_session.session_date;
      if (!sameDate(r.session_date, day)) return false;
      if (branch.created_at?.lt !== undefined) return r.created_at < branch.created_at.lt;
      return sameDate(r.created_at, branch.created_at) && r.id < branch.id.lt;
    });
  }).length;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DAY1 = new Date('2026-10-17T00:00:00Z');
const DAY2 = new Date('2026-10-18T00:00:00Z');

const milestoneStep = {
  id: 42,
  workflow_id: 7,
  session_number: 5,
  trigger_event: 'ATTENDED' as const,
  delay_minutes: 5,
  channel: 'ZALO_PERSONAL' as const,
  target_group_id: null as number | null,
  message_content: 'Mừng HV {{student_name}} hoàn thành buổi {{session_number}}!',
  message_variables: ['student_name', 'session_number'],
  active: true,
  workflow: { id: 7, name: 'Care milestone', owner_cs_id: 50 },
};

function attendanceFixture(overrides: {
  id: number;
  sessionDate: Date;
  createdAt: Date;
  status?: string;
  reconciliationState?: string;
}) {
  return {
    id: overrides.id,
    status: overrides.status ?? 'ATTENDED',
    reconciliation_state: overrides.reconciliationState ?? 'MATCHED',
    created_at: overrides.createdAt,
    enrollment_class: {
      enrollment: {
        id: 300,
        student_id: 400,
        cs_id: 50,
        total_sessions: 24,
        auto_message_enabled: true,
        student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563' },
        cs: { id: 50, name: 'CS Hương' },
        package: { name: 'Gói N3' },
        enrollment_classes: [{ class: { id: 20, class_name: 'N3-K12' } }],
      },
      class: { id: 20, class_name: 'N3-K12' },
    },
    class_session: {
      session_date: overrides.sessionDate,
      class: {
        class_name: 'N3-K12',
        class_teachers: [{ teacher: { id: 5, name: 'Sensei Tanaka' } }],
      },
    },
  };
}

function rowFixture(
  id: number,
  sessionDate: Date,
  createdAt: Date,
  overrides?: Partial<Pick<FakeRow, 'status' | 'reconciliation_state' | 'deleted_at'>>,
): FakeRow {
  return {
    id,
    enrollment_id: 300,
    session_date: sessionDate,
    created_at: createdAt,
    status: overrides?.status ?? 'ATTENDED',
    reconciliation_state: overrides?.reconciliation_state ?? 'MATCHED',
    deleted_at: overrides?.deleted_at ?? null,
  };
}

/** Captures the session_number that findMatchingSteps was queried with. */
function querySessionNumber(): number | undefined {
  const call = (prisma.automationStep.findMany as jest.Mock).mock.calls.at(-1);
  return call?.[0]?.where?.session_number;
}

describe('Care-milestone session ordinal (D1/K7, same-day finals)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rows = [];
    (prisma.attendance.count as jest.Mock).mockImplementation(async ({ where }) => fakeCount(where));
    (prisma.enrollment.findUnique as jest.Mock).mockResolvedValue({
      student_id: 400,
      student: { id: 400, line_uid: null },
    });
    (prisma.zaloContactRelation.findFirst as jest.Mock).mockResolvedValue({
      id: 10,
      student_id: 400,
      zalo_account_id: 12,
      relation_status: 'FRIEND',
    });
    (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.messageDelivery.create as jest.Mock).mockImplementation(async ({ data }) => ({ id: 9000, ...data }));
    (prisma.messageDelivery.update as jest.Mock).mockResolvedValue({});
    (enqueueDelivery as jest.Mock).mockResolvedValue('automation:delivery:9000');
  });

  it('second same-day FINAL session gets its own next ordinal (4 then 5, not 4 twice)', async () => {
    // Day-1 history: 3 qualifying finals across earlier dates.
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
    ];

    // First session on DAY2 (id 901) is FINAL; second one (id 902) still pending.
    rows.push(rowFixture(901, DAY2, new Date('2026-10-18T01:00:00Z')));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: new Date('2026-10-18T01:00:00Z') }),
    );
    (prisma.automationStep.findMany as jest.Mock).mockResolvedValue([]);

    await handleAttendanceEvent(901);
    expect(querySessionNumber()).toBe(4); // 3 earlier-day + itself

    // Second same-day session (id 902, later created_at) becomes FINAL.
    rows.push(rowFixture(902, DAY2, new Date('2026-10-18T09:00:00Z')));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: new Date('2026-10-18T09:00:00Z') }),
    );

    await handleAttendanceEvent(902);
    expect(querySessionNumber()).toBe(5); // earlier-day + same-day 901 + itself
  });

  it('counts strictly-earlier dates and FINAL/non-deleted filters like the canonical K7 basis', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      // Provisional / non-consuming / deleted rows must NOT advance the ordinal:
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T02:00:00Z'), { reconciliation_state: 'CONFLICT' }),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z'), { status: 'ABSENT_UNAPPROVED_C' }),
      rowFixture(804, DAY1, new Date('2026-10-17T02:00:00Z'), { deleted_at: new Date('2026-10-18T00:00:00Z') }),
      rowFixture(805, DAY1, new Date('2026-10-17T03:00:00Z')),
      // Another enrollment's rows are irrelevant.
      { ...rowFixture(806, DAY1, new Date('2026-10-17T04:00:00Z')), enrollment_id: 301 },
    ];

    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 910, sessionDate: new Date('2026-10-19T00:00:00Z'), createdAt: new Date('2026-10-19T01:00:00Z') }),
    );
    (prisma.automationStep.findMany as jest.Mock).mockResolvedValue([]);

    await handleAttendanceEvent(910);
    // Qualifying before 10-19: 801 + 805 = 2 → ordinal 3 (count-before + 1, unchanged).
    expect(querySessionNumber()).toBe(3);
  });

  it('milestone-crossing fires exactly once when a second same-day session reaches the step', async () => {
    // Milestone step is configured for session_number 5.
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, new Date('2026-10-18T01:00:00Z')),
    ];

    // Step matching is driven by the queried session_number, as in the repo.
    (prisma.automationStep.findMany as jest.Mock).mockImplementation(async ({ where }) =>
      where.session_number === milestoneStep.session_number ? [milestoneStep] : [],
    );

    // First same-day session: ordinal 4 → milestone NOT reached → no delivery.
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: new Date('2026-10-18T01:00:00Z') }),
    );
    const res1 = await handleAttendanceEvent(901);
    expect(res1.deliveriesCreated).toBe(0);

    // Second same-day session becomes FINAL: ordinal 5 → milestone crossed →
    // exactly ONE delivery, keyed to the crossing row (902).
    rows.push(rowFixture(902, DAY2, new Date('2026-10-18T09:00:00Z')));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: new Date('2026-10-18T09:00:00Z') }),
    );
    const res2 = await handleAttendanceEvent(902);
    expect(res2.deliveriesCreated).toBe(1);
    expect(prisma.messageDelivery.create).toHaveBeenCalledTimes(1);
    expect(prisma.messageDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ attendance_id: 902, automation_step_id: 42 }),
    });
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);
  });

  it('re-triggering the same attendance+step stays deduped via (attendance, step) unique', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, new Date('2026-10-18T01:00:00Z')),
      rowFixture(902, DAY2, new Date('2026-10-18T09:00:00Z')),
    ];
    (prisma.automationStep.findMany as jest.Mock).mockImplementation(async ({ where }) =>
      where.session_number === milestoneStep.session_number ? [milestoneStep] : [],
    );
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: new Date('2026-10-18T09:00:00Z') }),
    );

    // Delivery for (902, step 42) already exists (e.g. event replay) → skipped.
    (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({ id: 9000 });
    const res = await handleAttendanceEvent(902);
    expect(res.deliveriesCreated).toBe(0);
    expect(res.deliveriesSkipped).toBe(1);
    expect(res.details[0]).toEqual(
      expect.objectContaining({ stepId: 42, status: 'SKIPPED_DUPLICATE' }),
    );
  });
});
