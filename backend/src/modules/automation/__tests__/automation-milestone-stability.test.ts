/**
 * Care-milestone ordinal STABILITY scenarios (owner item #4 — pin actual
 * behavior, NOT a D1 re-decision; basis locked in
 * automation-session-number.test.ts).
 *
 * Mock-only: same in-memory FINAL-ATTENDED row store + fakeCount evaluator as
 * automation-session-number.test.ts, extended with a stateful delivery store
 * that emulates the real unique constraint
 * `@@unique([attendance_id, automation_step_id])`
 * (schema.prisma MessageDelivery; idempotency lookup =
 * automation-repository.findDeliveryForIdempotency). `findUnique` on the
 * composite key throws the same P2002 shape Prisma 5 throws for a violating
 * `create`, so the read-check + unique-index double protection is exercised
 * exactly as production would see it.
 *
 * Semantics recap (resolveEnrollmentSessionNumber, automation-trigger.service.ts):
 * ordinal = 1 + count of FINAL (MATCHED/RESOLVED, not soft-deleted) ATTENDED
 * rows STRICTLY BEFORE this row in (session_date, created_at, id) order,
 * evaluated from DB state AT EVENT TIME. Rows finalizing out of that order can
 * therefore observe a PREVIOUSLY FINALIZED later row while not counting an
 * earlier row that is still non-FINAL — the ordinal is a function of
 * finalization timing, not of the stable total order. The scenarios below pin
 * what the pipeline does in those cases.
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
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
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

// ─── In-memory FINAL-ATTENDED row store (same harness as session-number tests) ─

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

// ─── Stateful delivery store emulating @@unique([attendance_id, automation_step_id]) ─

interface FakeDelivery {
  id: number;
  attendance_id: number;
  automation_step_id: number;
  rendered_content: string;
  variables_snapshot: Record<string, any>;
}

let deliveries: FakeDelivery[] = [];
let deliverySeq = 9000;

const p2002 = () =>
  Object.assign(new Error('Unique constraint failed on the fields, `(attendance_id, automation_step_id)`'), {
    code: 'P2002',
    meta: { target: ['attendance_id', 'automation_step_id'] },
  });

const uniqKey = (attendanceId: number, stepId: number) => `${attendanceId}:${stepId}`;

function findDeliveryRow(attendanceId: number, stepId: number): FakeDelivery | null {
  return deliveries.find((d) => d.attendance_id === attendanceId && d.automation_step_id === stepId) ?? null;
}

// ─── Fixtures (mirroring automation-session-number.test.ts) ─────────────────

const DAY1 = new Date('2026-10-17T00:00:00Z');
const DAY2 = new Date('2026-10-18T00:00:00Z');

function stepFixture(sessionNumber: number, id: number) {
  return {
    id,
    workflow_id: 7,
    session_number: sessionNumber,
    trigger_event: 'ATTENDED' as const,
    delay_minutes: 5,
    channel: 'ZALO_PERSONAL' as const,
    target_group_id: null as number | null,
    message_content: `Mừng HV {{student_name}} hoàn thành buổi ${sessionNumber}!`,
    message_variables: ['student_name', 'session_number'],
    active: true,
    workflow: { id: 7, name: 'Care milestone', owner_cs_id: 50 },
  };
}

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
function lastQuerySessionNumber(): number | undefined {
  const call = (prisma.automationStep.findMany as jest.Mock).mock.calls.at(-1);
  return call?.[0]?.where?.session_number;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Care-milestone ordinal stability (item #4) — out-of-order finalization', () => {
  // Stable total order for DAY2 rows: A id=901 @01:00, B id=902 @09:00.
  const A_CREATED = new Date('2026-10-18T01:00:00Z');
  const B_CREATED = new Date('2026-10-18T09:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    rows = [];
    deliveries = [];
    deliverySeq = 9000;

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

    // Composite-unique findUnique over the store; any other where shape is a
    // harness bug → fail loudly.
    (prisma.messageDelivery.findUnique as jest.Mock).mockImplementation(async ({ where }) => {
      const comp = where?.attendance_id_automation_step_id;
      if (comp) {
        return findDeliveryRow(comp.attendance_id, comp.automation_step_id);
      }
      const byId = where?.id;
      if (byId !== undefined) return deliveries.find((d) => d.id === byId) ?? null;
      throw new Error(`fake delivery findUnique: unsupported where shape ${JSON.stringify(where)}`);
    });
    // `by` lookup used only to verify post-race persistence state.
    (prisma.messageDelivery.findFirst as jest.Mock).mockImplementation(async ({ where }) =>
      where?.attendance_id !== undefined && where?.automation_step_id !== undefined
        ? findDeliveryRow(where.attendance_id, where.automation_step_id)
        : null,
    );
    (prisma.messageDelivery.create as jest.Mock).mockImplementation(async ({ data }) => {
      if (findDeliveryRow(data.attendance_id, data.automation_step_id)) throw p2002();
      const d = {
        id: ++deliverySeq,
        attendance_id: data.attendance_id,
        automation_step_id: data.automation_step_id,
        rendered_content: data.rendered_content,
        variables_snapshot: data.variables_snapshot,
      };
      deliveries.push(d);
      return d;
    });
    (prisma.messageDelivery.createMany as jest.Mock).mockImplementation(async ({ data }) => {
      const list = Array.isArray(data) ? data : [data];
      for (const x of list) if (findDeliveryRow(x.attendance_id, x.automation_step_id)) throw p2002();
      for (const x of list) {
        deliveries.push({
          id: ++deliverySeq,
          attendance_id: x.attendance_id,
          automation_step_id: x.automation_step_id,
          rendered_content: x.rendered_content,
          variables_snapshot: x.variables_snapshot,
        });
      }
      return { count: list.length };
    });
    (prisma.messageDelivery.update as jest.Mock).mockResolvedValue({});
    (enqueueDelivery as jest.Mock).mockImplementation(async () => `automation:delivery:${++deliverySeq}`);
  });

  it('S1a late row A recomputes the SAME ordinal B already used (5) and the dedupe does NOT stop a second (A, milestone) delivery — pins the cross-row duplicate milestone as the actual behavior', async () => {
    // 4 earlier-day finals, so the stable total order would be A=5, B=6.
    rows = [
      rowFixture(801, new Date('2026-10-14T00:00:00Z'), new Date('2026-10-14T01:00:00Z')),
      rowFixture(802, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(803, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(804, DAY1, new Date('2026-10-17T01:00:00Z')),
    ];
    // Milestone step configured at session_number 5 (the number B observes
    // first, and that A will ALSO observe when it finalizes late).
    const step5 = stepFixture(5, 41);
    const step6 = stepFixture(6, 42);
    (prisma.automationStep.findMany as jest.Mock).mockImplementation(async ({ where }) => {
      const out: any[] = [];
      if (where.session_number === 5) out.push(step5);
      if (where.session_number === 6) out.push(step6);
      return out;
    });

    // ── B (id 902, created 09:00) goes MATCHED FIRST; A is still non-FINAL.
    rows.push(rowFixture(902, DAY2, B_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB = await handleAttendanceEvent(902);

    // B strictly-before count = 4 (A not FINAL and not in store; nothing else
    // same-day precedes B among FINAL rows) → ordinal 5.
    expect(lastQuerySessionNumber()).toBe(5);
    // Milestone 5 fires once, keyed to (902, 41).
    expect(resB.deliveriesCreated).toBe(1);
    expect(deliveries.map((d) => [d.attendance_id, d.automation_step_id])).toEqual([[902, 41]]);

    // ── A (id 901, created 01:00) finalizes AFTER B.
    rows.push(rowFixture(901, DAY2, A_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const resA = await handleAttendanceEvent(901);

    // FINDING (pinned, reported — not redesigned): A's strictly-before count is
    // also 4 — B comes AFTER A in (created_at) so it never counts for A — so A
    // recomputes the SAME ordinal 5 that B already consumed. The idempotency
    // lookup queries (901, 41), finds nothing (the existing delivery is keyed
    // to 902), and a SECOND delivery for milestone 5 is created for the same
    // enrollment+number. The unique key (attendance_id, automation_step_id)
    // only dedupes per-row, never per-milestone.
    expect(lastQuerySessionNumber()).toBe(5);
    expect(resA.deliveriesCreated).toBe(1);
    expect(deliveries.map((d) => d.attendance_id).sort()).toEqual([901, 902]);
    expect(deliveries.filter((d) => d.automation_step_id === 41).length).toBe(2);

    // Meanwhile milestone 6 (B's stable-order ordinal) has NOT fired yet: the
    // CONFLICT/late-finalization transitions themselves emit no events for
    // other rows — only a NEW event on B re-evaluates B (see S2c for the same
    // neighbour-shift gap).
    expect(deliveries.some((d) => d.automation_step_id === 42)).toBe(false);

    // Stable invariant that IS guaranteed: no (attendance, step) pair is ever
    // created twice. A further event on B recomputes from live state — now A is
    // FINAL and strictly precedes B, so B observes ordinal 6 and the SAME event
    // self-heals the skipped milestone 6 while milestone 5 stays double-delivered
    // ((902,41) + (901,41)) — cross-row duplication is NOT prevented by the
    // per-row unique key.
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB2 = await handleAttendanceEvent(902);
    expect(lastQuerySessionNumber()).toBe(6);
    expect(resB2.deliveriesCreated).toBe(1);
    expect(deliveries.map((d) => [d.attendance_id, d.automation_step_id])).toEqual([
      [902, 41],
      [901, 41],
      [902, 42],
    ]);

    // Third event on B → its (902,42) hits the unique → SKIPPED_DUPLICATE,
    // store frozen.
    const resB3 = await handleAttendanceEvent(902);
    expect(resB3.deliveriesCreated).toBe(0);
    expect(resB3.deliveriesSkipped).toBe(1);
    expect(resB3.details[0]).toEqual(expect.objectContaining({ stepId: 42, status: 'SKIPPED_DUPLICATE' }));
    expect(deliveries.length).toBe(3);
    const pairs = deliveries.map((d) => uniqKey(d.attendance_id, d.automation_step_id));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('S1b in-order finalization keeps ordinals monotonic (A=4 fires step4 once, B=5 fires step5 once) — each row gets exactly one delivery per step', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
    ];
    const step4 = stepFixture(4, 41);
    const step5 = stepFixture(5, 42);
    (prisma.automationStep.findMany as jest.Mock).mockImplementation(async ({ where }) => {
      const out: any[] = [];
      if (where.session_number === 4) out.push(step4);
      if (where.session_number === 5) out.push(step5);
      return out;
    });

    // A finalizes first (its natural position in the total order).
    rows.push(rowFixture(901, DAY2, A_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const resA = await handleAttendanceEvent(901);
    expect(lastQuerySessionNumber()).toBe(4);
    expect(resA.deliveriesCreated).toBe(1);

    // B finalizes second: A is FINAL and strictly precedes B → ordinal 5.
    rows.push(rowFixture(902, DAY2, B_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB = await handleAttendanceEvent(902);
    expect(lastQuerySessionNumber()).toBe(5);
    expect(resB.deliveriesCreated).toBe(1);

    // Exactly one delivery per (row, step) — milestone 4 fired once,
    // milestone 5 fired once, no cross-row duplication because ordinals were
    // observed monotonically.
    expect(deliveries.map((d) => [d.attendance_id, d.automation_step_id])).toEqual([
      [901, 41],
      [902, 42],
    ]);
    expect(enqueueDelivery).toHaveBeenCalledTimes(2);
  });

  it('S1c replay storm: per-row (attendance, step) dedupe is the stable guarantee — replays never grow the delivery set', async () => {
    // 4 earlier-day finals + row 901 FINAL: ordinal 5.
    rows = [
      rowFixture(801, new Date('2026-10-14T00:00:00Z'), new Date('2026-10-14T01:00:00Z')),
      rowFixture(802, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(803, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(804, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, A_CREATED),
    ];
    const step5 = stepFixture(5, 41);
    const step6 = stepFixture(6, 42);
    (prisma.automationStep.findMany as jest.Mock).mockImplementation(async ({ where }) => {
      const out: any[] = [];
      if (where.session_number === 5) out.push(step5);
      if (where.session_number === 6) out.push(step6);
      return out;
    });

    // 901's first event → one delivery (901, 41).
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const res1 = await handleAttendanceEvent(901);
    expect(res1.deliveriesCreated).toBe(1);

    // Replay 901 five more times: ordinal stays 5, (901,41) exists → every hit
    // is SKIPPED_DUPLICATE, store frozen.
    for (let i = 0; i < 5; i++) {
      const res = await handleAttendanceEvent(901);
      expect(res.deliveriesCreated).toBe(0);
      expect(res.deliveriesSkipped).toBe(1);
      expect(res.details[0]).toEqual(
        expect.objectContaining({ stepId: 41, status: 'SKIPPED_DUPLICATE' }),
      );
    }
    expect(deliveries.length).toBe(1);
    expect(prisma.messageDelivery.create).toHaveBeenCalledTimes(1);
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);

    // Now the out-of-order neighbour B (created 09:00) finalizes. A replay of
    // 901 after that still dedupes for step 5, and B's own ordinal (6) lands on
    // its own step without ever duplicating a pair — the per-row invariant
    // survives the late arrival; cross-row milestone re-firing is pinned in S1a.
    rows.push(rowFixture(902, DAY2, B_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB = await handleAttendanceEvent(902);
    expect(resB.deliveriesCreated).toBe(1); // (902, step6)
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const resA2 = await handleAttendanceEvent(901); // 901 replay post-B-arrival
    expect(resA2.deliveriesCreated).toBe(0);
    expect(resA2.deliveriesSkipped).toBe(1); // (901,41) unique hit
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB2 = await handleAttendanceEvent(902);
    expect(resB2.deliveriesCreated).toBe(0);
    expect(resB2.deliveriesSkipped).toBe(1); // (902,42) unique hit
    const pairs = deliveries.map((d) => uniqKey(d.attendance_id, d.automation_step_id));
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(deliveries.length).toBe(2);
  });
});

describe('Care-milestone ordinal stability (item #4) — FINAL → CONFLICT → FINAL', () => {
  const C_CREATED = new Date('2026-10-18T01:00:00Z');
  const D_CREATED = new Date('2026-10-18T09:00:00Z');

  beforeEach(() => {
    // Reuse the identical harness setup.
    jest.clearAllMocks();
    rows = [];
    deliveries = [];
    deliverySeq = 9000;

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
    (prisma.messageDelivery.findUnique as jest.Mock).mockImplementation(async ({ where }) => {
      const comp = where?.attendance_id_automation_step_id;
      if (comp) return findDeliveryRow(comp.attendance_id, comp.automation_step_id);
      const byId = where?.id;
      if (byId !== undefined) return deliveries.find((d) => d.id === byId) ?? null;
      throw new Error(`fake delivery findUnique: unsupported where shape ${JSON.stringify(where)}`);
    });
    (prisma.messageDelivery.findFirst as jest.Mock).mockImplementation(async ({ where }) =>
      where?.attendance_id !== undefined && where?.automation_step_id !== undefined
        ? findDeliveryRow(where.attendance_id, where.automation_step_id)
        : null,
    );
    (prisma.messageDelivery.create as jest.Mock).mockImplementation(async ({ data }) => {
      if (findDeliveryRow(data.attendance_id, data.automation_step_id)) throw p2002();
      const d = {
        id: ++deliverySeq,
        attendance_id: data.attendance_id,
        automation_step_id: data.automation_step_id,
        rendered_content: data.rendered_content,
        variables_snapshot: data.variables_snapshot,
      };
      deliveries.push(d);
      return d;
    });
    (prisma.messageDelivery.createMany as jest.Mock).mockImplementation(async ({ data }) => {
      const list = Array.isArray(data) ? data : [data];
      for (const x of list) if (findDeliveryRow(x.attendance_id, x.automation_step_id)) throw p2002();
      for (const x of list) {
        deliveries.push({
          id: ++deliverySeq,
          attendance_id: x.attendance_id,
          automation_step_id: x.automation_step_id,
          rendered_content: x.rendered_content,
          variables_snapshot: x.variables_snapshot,
        });
      }
      return { count: list.length };
    });
    (prisma.messageDelivery.update as jest.Mock).mockResolvedValue({});
    (enqueueDelivery as jest.Mock).mockImplementation(async () => `automation:delivery:${++deliverySeq}`);
  });

  it('S2a CONFLICT recompute: C drops out, D recomputes down from 5 to 4 on its own next event; already-created deliveries are never re-created or undone', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, C_CREATED), // C — same-day, strictly before D
      rowFixture(902, DAY2, D_CREATED), // D
    ];
    const step4 = stepFixture(4, 41);
    const step5 = stepFixture(5, 42);
    (prisma.automationStep.findMany as jest.Mock).mockImplementation(async ({ where }) => {
      const out: any[] = [];
      if (where.session_number === 4) out.push(step4);
      if (where.session_number === 5) out.push(step5);
      return out;
    });

    // Both FINAL, in order: C=4 fires step4 (C,41); D=5 fires step5 (D,42).
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED }),
    );
    const resC = await handleAttendanceEvent(901);
    expect(lastQuerySessionNumber()).toBe(4);
    expect(resC.deliveriesCreated).toBe(1);
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: D_CREATED }),
    );
    const resD = await handleAttendanceEvent(902);
    expect(lastQuerySessionNumber()).toBe(5);
    expect(resD.deliveriesCreated).toBe(1);
    expect(deliveries.map((d) => [d.attendance_id, d.automation_step_id])).toEqual([
      [901, 41],
      [902, 42],
    ]);

    // ── Reconciliation flips C to CONFLICT (C stops qualifying).
    rows = rows.map((r) => (r.id === 901 ? { ...r, reconciliation_state: 'CONFLICT' } : r));
    // A NEW event on D (e.g. re-mark / updateAttendance) recomputes from live
    // state: strictly-before = 801,802,803 (C excluded) → ordinal 4 again.
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: D_CREATED }),
    );
    const resD2 = await handleAttendanceEvent(902);
    expect(lastQuerySessionNumber()).toBe(4);
    // Progress recomputes correctly: D now sits on step 4 (41)...
    expect(prisma.automationStep.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ session_number: 4 }) }),
    );
    // ...and the (D,41) pair has no delivery yet, so the code creates one —
    // pinned actual behavior. The already-created (901,41) and (902,42)
    // deliveries are NOT touched (no cancel, no duplicate, no undo).
    expect(resD2.deliveriesCreated).toBe(1);
    expect(deliveries.map((d) => [d.attendance_id, d.automation_step_id])).toEqual([
      [901, 41],
      [902, 42],
      [902, 41],
    ]);
  });

  it('S2b re-finalization of the SAME (attendance, step) after CONFLICT→MATCHED is deduped: SKIPPED_DUPLICATE, zero new deliveries', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, C_CREATED),
    ];
    const step4 = stepFixture(4, 41);
    (prisma.automationStep.findMany as jest.Mock).mockImplementation(async ({ where }) =>
      where.session_number === 4 ? [step4] : [],
    );

    // C FINAL: ordinal 4 → delivery (901, 41).
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED }),
    );
    const res1 = await handleAttendanceEvent(901);
    expect(res1.deliveriesCreated).toBe(1);
    expect(deliveries.length).toBe(1);

    // C → CONFLICT: events on C now short-circuit before step matching
    // (automation-trigger.service.ts:91) — NO delivery created, NO cancel
    // (pinned: the pipeline only ever ADDs; undoing pending deliveries needs a
    // separate cancelPendingDeliveries call, which handleAttendanceEvent does
    // not make). Assert via DELTAS: the first FINAL event already queried
    // steps and created one delivery, so call counts must not increase.
    const stepQueriesAfterRes1 = (prisma.automationStep.findMany as jest.Mock).mock.calls.length;
    const createsAfterRes1 = (prisma.messageDelivery.create as jest.Mock).mock.calls.length;
    rows = rows.map((r) => (r.id === 901 ? { ...r, reconciliation_state: 'CONFLICT' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({
        id: 901,
        sessionDate: DAY2,
        createdAt: C_CREATED,
        reconciliationState: 'CONFLICT',
      }),
    );
    const res2 = await handleAttendanceEvent(901);
    expect(res2.deliveriesCreated).toBe(0);
    expect(res2.deliveriesSkipped).toBe(0);
    expect(res2.details).toEqual([]);
    expect((prisma.automationStep.findMany as jest.Mock).mock.calls.length).toBe(stepQueriesAfterRes1);
    expect((prisma.messageDelivery.create as jest.Mock).mock.calls.length).toBe(createsAfterRes1);
    expect(deliveries.length).toBe(1);

    // C → RESOLVED (FINAL again) + re-finalization event: recomputed ordinal is
    // 4 again → same (attendance, step) → SKIPPED_DUPLICATE via the unique.
    rows = rows.map((r) => (r.id === 901 ? { ...r, reconciliation_state: 'RESOLVED' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({
        id: 901,
        sessionDate: DAY2,
        createdAt: C_CREATED,
        reconciliationState: 'RESOLVED',
      }),
    );
    const res3 = await handleAttendanceEvent(901);
    expect(res3.deliveriesCreated).toBe(0);
    expect(res3.deliveriesSkipped).toBe(1);
    expect(res3.details[0]).toEqual(
      expect.objectContaining({ stepId: 41, status: 'SKIPPED_DUPLICATE' }),
    );
    expect(deliveries.length).toBe(1);
    expect(prisma.messageDelivery.create).toHaveBeenCalledTimes(1);
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);
  });

  it('S2c FINDING (pinned): after a CONFLICT shift, a DIFFERENT row that now occupies the milestone number is not re-evaluated by the event that caused the shift — milestone stays unfired until an unrelated later event lands it', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
    ];
    const step4 = stepFixture(4, 41);
    (prisma.automationStep.findMany as jest.Mock).mockImplementation(async ({ where }) =>
      where.session_number === 4 ? [step4] : [],
    );

    // E (905, @01:00) FINAL first: ordinal 4 → milestone fires on E.
    rows.push(rowFixture(905, DAY2, C_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 905, sessionDate: DAY2, createdAt: C_CREATED }),
    );
    const resE = await handleAttendanceEvent(905);
    expect(lastQuerySessionNumber()).toBe(4);
    expect(resE.deliveriesCreated).toBe(1);
    expect(deliveries.map((d) => [d.attendance_id, d.automation_step_id])).toEqual([[905, 41]]);

    // G (906, @09:00) FINAL: ordinal 5 → step 4 does not match (no step at 5
    // configured) → nothing fires. Correct at this point.
    rows.push(rowFixture(906, DAY2, D_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 906, sessionDate: DAY2, createdAt: D_CREATED }),
    );
    const resG = await handleAttendanceEvent(906);
    expect(lastQuerySessionNumber()).toBe(5);
    expect(resG.deliveriesCreated).toBe(0);

    // E drops to CONFLICT. No re-event happens → the milestone-4 slot is now
    // occupied by G (G's stable ordinal drops to 4), but NOTHING fires:
    // the CONFLICT transition itself emits no handleAttendanceEvent for E or
    // G, and handleAttendanceEvent only ever evaluates the row it is called
    // with (it never re-evaluates shifted neighbours).
    rows = rows.map((r) => (r.id === 905 ? { ...r, reconciliation_state: 'CONFLICT' } : r));
    expect(deliveries.length).toBe(1); // no delivery for G yet — pinned gap
    expect(prisma.messageDelivery.create).toHaveBeenCalledTimes(1);

    // The milestone only lands when an UNRELATED later event hits G (e.g.
    // re-mark/updateAttendance): the recompute happens inside that event and
    // fires step 4 exactly once for (906, 41).
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 906, sessionDate: DAY2, createdAt: D_CREATED }),
    );
    const resG2 = await handleAttendanceEvent(906);
    expect(lastQuerySessionNumber()).toBe(4);
    expect(resG2.deliveriesCreated).toBe(1);
    expect(deliveries.map((d) => [d.attendance_id, d.automation_step_id])).toEqual([
      [905, 41],
      [906, 41],
    ]);
    // The already-delivered milestone on the now-CONFLICT row E is never
    // undone by these transitions (add-only semantics).
  });
});

describe('Care-milestone ordinal stability (item #4) — idempotency race', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rows = [];
    deliveries = [];
    deliverySeq = 9000;
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
    (prisma.messageDelivery.create as jest.Mock).mockImplementation(async ({ data }) => {
      if (findDeliveryRow(data.attendance_id, data.automation_step_id)) throw p2002();
      const d = {
        id: ++deliverySeq,
        attendance_id: data.attendance_id,
        automation_step_id: data.automation_step_id,
        rendered_content: data.rendered_content,
        variables_snapshot: data.variables_snapshot,
      };
      deliveries.push(d);
      return d;
    });
    (prisma.messageDelivery.createMany as jest.Mock).mockImplementation(async ({ data }) => {
      const list = Array.isArray(data) ? data : [data];
      for (const x of list) if (findDeliveryRow(x.attendance_id, x.automation_step_id)) throw p2002();
      for (const x of list) {
        deliveries.push({
          id: ++deliverySeq,
          attendance_id: x.attendance_id,
          automation_step_id: x.automation_step_id,
          rendered_content: x.rendered_content,
          variables_snapshot: x.variables_snapshot,
        });
      }
      return { count: list.length };
    });
    (prisma.messageDelivery.update as jest.Mock).mockResolvedValue({});
    (enqueueDelivery as jest.Mock).mockResolvedValue('automation:delivery:9000');
  });

  it('S3 concurrent double event on the same (attendance, step): the read-check loses the race but the DB unique index rejects the duplicate — no second delivery persists, no enqueue (and handleAttendanceEvent survives the error)', async () => {
    // Both parallel invocations read findUnique → null (check-then-create TOCT
    // window), then both attempt create; the store's unique emulation throws
    // P2002 for the loser. The trigger catches it at the outer try/catch
    // (automation-trigger.service.ts:237) and returns without incrementing
    // deliveriesCreated.
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, new Date('2026-10-18T01:00:00Z')),
    ];
    const step4 = stepFixture(4, 41);
    (prisma.automationStep.findMany as jest.Mock).mockResolvedValue([step4]);
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: new Date('2026-10-18T01:00:00Z') }),
    );

    const [r1, r2] = await Promise.all([handleAttendanceEvent(901), handleAttendanceEvent(901)]);

    // Exactly ONE delivery row persisted for (901, 41); one call "created" it,
    // the other failed on the unique constraint and reported zero (no throw
    // escapes — the whole loop for the second call aborts inside the catch).
    const forPair = deliveries.filter(
      (d) => d.attendance_id === 901 && d.automation_step_id === 41,
    );
    expect(forPair.length).toBe(1);
    expect([r1.deliveriesCreated, r2.deliveriesCreated].sort()).toEqual([0, 1]);
    // Only the winning delivery is enqueued — the loser never reaches
    // enqueueDelivery for this step.
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);
    // A sequential retry of the losing event now sees the persisted delivery →
    // clean SKIPPED_DUPLICATE (dedupe converges).
    (prisma.messageDelivery.findUnique as jest.Mock).mockImplementation(async ({ where }) => {
      const comp = where?.attendance_id_automation_step_id;
      return comp ? findDeliveryRow(comp.attendance_id, comp.automation_step_id) : null;
    });
    const r3 = await handleAttendanceEvent(901);
    expect(r3.deliveriesCreated).toBe(0);
    expect(r3.deliveriesSkipped).toBe(1);
    expect(deliveries.length).toBe(1);
  });
});
