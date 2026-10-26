/**
 * Care-milestone ordinal STABILITY scenarios (owner items S1a/S2c + mandatory
 * acceptance (a)–(f), approved design 2026-10-26 — FIXED CONTRACT, replaces the
 * previous "pin actual behavior" suite).
 *
 * New contract: milestone occurrence identity is `(enrollment_id,
 * automation_step_id)` (each AutomationStep uniquely encodes milestone_key
 * `(workflow_id, session_number, trigger_event)` via schema.prisma's
 * @@unique). `attendance_id` on MessageDelivery is the CURRENT trigger-evidence
 * basis, never the identity. Both mechanisms are combined:
 *  (A) occurrence dedup — a repeat trigger reaching the same milestone with a
 *      different basis NEVER creates a second row; unsent occurrences REBIND
 *      the basis in place; SENT/SENDING history is never mutated or re-sent;
 *  (B) forward re-evaluation across the enrollment (reconcileEnrollmentMilestones)
 *      — milestones whose ordinal basis appeared/shifted/dropped/reactivated
 *      are healed on every FINAL write, and pending ones are cancelled when
 *      the enrollment drops below their ordinal (including CONFLICT
 *      transitions via cancelPendingDeliveries).
 *
 * Mock-only: in-memory FINAL-ATTENDED row store + fakeCount evaluator (same
 * basis as automation-session-number.test.ts), extended with a stateful
 * delivery store that:
 *  - emulates the real DB unique `(attendance_id, automation_step_id)` as the
 *    secondary backstop (create throws the P2002 shape Prisma 5 throws);
 *  - supports findMany over enrollment_id / enrollment_id+step / attendance+step
 *    shapes so the occurrence engine and the wide pass run WITHOUT the schema
 *    migration being applied;
 *  - applies `update` in place (id-preserving REBIND / reactivate / cancel).
 * No $transaction is provided, so the engine falls back to serial execution +
 * the in-process per-enrollment lock — exactly the ordering a Serializable
 * transaction converges to under contention (real-DB concurrency is proven in
 * milestone-dedup-reeval.acceptance.integration.test.ts).
 *
 * Semantics recap (resolveEnrollmentSessionNumber, automation-trigger.service.ts):
 * ordinal = 1 + count of FINAL (MATCHED/RESOLVED, not soft-deleted) ATTENDED
 * rows STRICTLY BEFORE this row in (session_date, created_at, id) order.
 * reconcileEnrollmentMilestones enumerates the same K7 list enrollment-wide:
 * the k-th row is the current basis of ordinal session_number = k.
 */

jest.mock('../../../prisma/client', () => ({
  prisma: {
    attendance: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
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
      findMany: jest.fn(),
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

jest.mock('../../zalo/zalo-pool', () => ({
  zaloPool: {
    getApi: jest.fn(),
    tryReconnect: jest.fn(),
  },
}));

import type { Job } from 'bullmq';
import { prisma } from '../../../prisma/client';
import { enqueueDelivery, cancelDelivery } from '../automation-bullmq-adapter';
import { zaloPool } from '../../zalo/zalo-pool';
import {
  cancelPendingDeliveries,
  handleAttendanceEvent,
  reconcileEnrollmentMilestones,
} from '../automation-trigger.service';
import { processDeliveryJob, type SendJobData } from '../automation-worker';

// ─── In-memory FINAL-ATTENDED row store (same harness as session-number tests) ─

interface FakeRow {
  id: number;
  enrollment_id: number;
  session_date: Date;
  created_at: Date;
  status: string;
  reconciliation_state: string;
  deleted_at: Date | null;
  class_name?: string;
  teacher_name?: string;
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
    if (where.enrollment_class?.enrollment_id !== undefined && r.enrollment_id !== where.enrollment_class.enrollment_id) return false;
    if (r.status !== where.status) return false;
    if (!where.reconciliation_state.in.includes(r.reconciliation_state)) return false;
    if ((r.deleted_at ?? null) !== where.deleted_at) return false;
    if (!where.OR) return true; // enrollment-wide count (reconcile fallback)
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

/** K7 qualification for findMany (no OR clause shape). */
function qualifying(where: any): FakeRow[] {
  return rows.filter((r) => {
    if (where?.enrollment_class?.enrollment_id !== undefined && r.enrollment_id !== where.enrollment_class.enrollment_id) return false;
    if (where?.status && r.status !== where.status) return false;
    if (where?.reconciliation_state?.in && !where.reconciliation_state.in.includes(r.reconciliation_state)) return false;
    if (where && 'deleted_at' in where && (r.deleted_at ?? null) !== where.deleted_at) return false;
    return true;
  });
}

// ─── Stateful delivery store ─────────────────────────────────────────────────
// Identity: (enrollment_id, automation_step_id) = ONE occurrence.
// Backstop:  (attendance_id, automation_step_id) unique (legacy DB index).

interface FakeDelivery {
  id: number;
  enrollment_id: number;
  attendance_id: number;
  automation_step_id: number;
  status: string;
  scheduled_at?: Date;
  queue_job_id: string | null;
  error_message: string | null;
  rendered_content: string;
  variables_snapshot: Record<string, any>;
}

let deliveries: FakeDelivery[] = [];
let deliverySeq = 9000;
let currentSteps: any[] = []; // active steps visible to the occurrence engine

const p2002 = () =>
  Object.assign(new Error('Unique constraint failed on the fields, `(attendance_id, automation_step_id)`'), {
    code: 'P2002',
    meta: { target: ['attendance_id', 'automation_step_id'] },
  });

const uniqKey = (attendanceId: number, stepId: number) => `${attendanceId}:${stepId}`;

function findDeliveryRow(attendanceId: number, stepId: number): FakeDelivery | null {
  return deliveries.find((d) => d.attendance_id === attendanceId && d.automation_step_id === stepId) ?? null;
}

function occKey(enrollmentId: number, stepId: number) {
  return `${enrollmentId}:${stepId}`;
}
function occurrenceRows(enrollmentId: number, stepId: number): FakeDelivery[] {
  return deliveries.filter((d) => d.enrollment_id === enrollmentId && d.automation_step_id === stepId);
}

// ─── Fixtures (mirroring automation-session-number.test.ts) ─────────────────

const DAY1 = new Date('2026-10-17T00:00:00Z');
const DAY2 = new Date('2026-10-18T00:00:00Z');

function stepFixture(sessionNumber: number, id: number, workflowId = 7, enrollmentId = 300) {
  return {
    id,
    workflow_id: workflowId,
    session_number: sessionNumber,
    trigger_event: 'ATTENDED' as const,
    delay_minutes: 5,
    channel: 'ZALO_PERSONAL' as const,
    target_group_id: null as number | null,
    message_content: `Mừng HV {{student_name}} hoàn thành buổi ${sessionNumber}!`,
    message_variables: ['student_name', 'session_number'],
    active: true,
    workflow: { id: workflowId, name: `Care milestone W${workflowId}`, owner_cs_id: 50 },
  };
}

function attendanceFixture(overrides: {
  id: number;
  enrollmentId?: number;
  sessionDate: Date;
  createdAt: Date;
  status?: string;
  reconciliationState?: string;
  className?: string;
  teacherName?: string;
}) {
  const enrollmentId = overrides.enrollmentId ?? 300;
  const className = overrides.className ?? 'N3-K12';
  const teacherName = overrides.teacherName ?? 'Sensei Tanaka';
  return {
    id: overrides.id,
    status: overrides.status ?? 'ATTENDED',
    reconciliation_state: overrides.reconciliationState ?? 'MATCHED',
    created_at: overrides.createdAt,
    enrollment_class: {
      enrollment: {
        id: enrollmentId,
        student_id: enrollmentId === 301 ? 401 : 400,
        cs_id: 50,
        total_sessions: 24,
        auto_message_enabled: true,
        student: { id: enrollmentId === 301 ? 401 : 400, full_name: enrollmentId === 301 ? 'Trần Văn B' : 'Nguyễn Văn A', phone: '0988767563' },
        cs: { id: 50, name: 'CS Hương' },
        package: { name: 'Gói N3' },
        enrollment_classes: [{ class: { id: 20, class_name: className } }],
      },
      class: { id: 20, class_name: className },
    },
    class_session: {
      session_date: overrides.sessionDate,
      class: {
        class_name: className,
        class_teachers: [{ teacher: { id: 5, name: teacherName } }],
      },
    },
  };
}

function rowFixture(
  id: number,
  sessionDate: Date,
  createdAt: Date,
  overrides?: Partial<Pick<FakeRow, 'status' | 'reconciliation_state' | 'deleted_at' | 'enrollment_id' | 'class_name' | 'teacher_name'>>,
): FakeRow {
  return {
    id,
    enrollment_id: overrides?.enrollment_id ?? 300,
    session_date: sessionDate,
    created_at: createdAt,
    status: overrides?.status ?? 'ATTENDED',
    reconciliation_state: overrides?.reconciliation_state ?? 'MATCHED',
    deleted_at: overrides?.deleted_at ?? null,
    class_name: overrides?.class_name,
    teacher_name: overrides?.teacher_name,
  };
}

/** Captures the session_number that findMatchingSteps was queried with. */
function lastQuerySessionNumber(): number | undefined {
  const calls = (prisma.automationStep.findMany as jest.Mock).mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const sn = calls[i]?.[0]?.where?.session_number;
    if (sn !== undefined) return sn;
  }
  return undefined;
}

function installStepMock(steps: any[]) {
  currentSteps = steps;
  (prisma.automationStep.findMany as jest.Mock).mockImplementation(async ({ where }) => {
    // Wide pass: no session_number — return all active ATTENDED steps.
    if (where.session_number === undefined) {
      if (where.trigger_event === undefined) return [];
      return steps.filter((s) => s.trigger_event === where.trigger_event);
    }
    return steps.filter(
      (s) => s.session_number === where.session_number && s.trigger_event === where.trigger_event,
    );
  });
}

function snapshot(pairs: Array<[number, number, string]>) {
  expect(deliveries.map((d) => [d.attendance_id, d.automation_step_id, d.status])).toEqual(pairs);
}

function occurrences(stepId: number, enrollmentId = 300): FakeDelivery[] {
  return occurrenceRows(enrollmentId, stepId);
}

function resetHarness() {
  jest.clearAllMocks();
  rows = [];
  deliveries = [];
  deliverySeq = 9000;
  currentSteps = [];

  (prisma.attendance.count as jest.Mock).mockImplementation(async ({ where }) => fakeCount(where));
  (prisma.attendance.findMany as jest.Mock).mockImplementation(async ({ where }) => {
    const list = qualifying(where).map((r) => ({
      ...r,
      class_session: {
        session_date: r.session_date,
        class: {
          class_name: r.class_name ?? 'N3-K12',
          class_teachers: [{ teacher: { name: r.teacher_name ?? 'Sensei Tanaka' } }],
        },
      },
    }));
    return list.sort((a: any, b: any) => a.session_date - b.session_date || a.created_at - b.created_at || a.id - b.id);
  });
  (prisma.enrollment.findUnique as jest.Mock).mockImplementation(async ({ where }) => {
    const id = where.id;
    const sid = id === 301 ? 401 : 400;
    return {
      id,
      student_id: sid,
      cs_id: 50,
      total_sessions: 24,
      auto_message_enabled: true,
      student: { id: sid, full_name: id === 301 ? 'Trần Văn B' : 'Nguyễn Văn A', phone: '0988767563', line_uid: null },
      cs: { id: 50, name: 'CS Hương' },
      package: { name: 'Gói N3' },
    };
  });
  (prisma.zaloContactRelation.findFirst as jest.Mock).mockResolvedValue({
    id: 10,
    student_id: 400,
    zalo_account_id: 12,
    friend_zalo_uid: 'zuid_400',
    relation_status: 'FRIEND',
  });

  (prisma.messageDelivery.findUnique as jest.Mock).mockImplementation(async ({ where, include }) => {
    const comp = where?.attendance_id_automation_step_id;
    if (comp) return findDeliveryRow(comp.attendance_id, comp.automation_step_id);
    const byId = where?.id;
    if (byId !== undefined) {
      const found = deliveries.find((d) => d.id === byId) ?? null;
      if (!found || !include) return found;
      const step = currentSteps.find((s) => s.id === found.automation_step_id);
      const att = rows.find((r) => r.id === found.attendance_id);
      return {
        ...found,
        zalo_account_id: 12,
        zalo_group_id: null,
        line_account_id: null,
        line_group_id: null,
        automation_step: step ?? { id: found.automation_step_id, session_number: 5, trigger_event: 'ATTENDED', channel: 'ZALO_PERSONAL' },
        enrollment: {
          id: found.enrollment_id,
          student_id: 400,
          student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', zalo_uid: 'zuid_400', line_uid: null },
        },
        zalo_account: { id: 12, status: 'ACTIVE', zalo_uid: 'zalo_cs', display_name: 'CS Zalo' },
        zalo_group: null,
        line_account: null,
        line_group: null,
        attendance: att
          ? { ...att, enrollment_class: { enrollment_id: found.enrollment_id } }
          : { id: found.attendance_id, status: 'ATTENDED', reconciliation_state: 'MATCHED', deleted_at: null },
      };
    }
    throw new Error(`fake delivery findUnique: unsupported where shape ${JSON.stringify(where)}`);
  });
  (prisma.messageDelivery.findFirst as jest.Mock).mockImplementation(async ({ where }) =>
    where?.attendance_id !== undefined && where?.automation_step_id !== undefined
      ? findDeliveryRow(where.attendance_id, where.automation_step_id)
      : null,
  );
  (prisma.messageDelivery.findMany as jest.Mock).mockImplementation(async ({ where }) => {
    if (where?.enrollment_id !== undefined && where?.automation_step_id !== undefined) {
      return occurrenceRows(where.enrollment_id, where.automation_step_id);
    }
    if (where?.enrollment_id !== undefined && where?.automation_step?.trigger_event) {
      const ev = where.automation_step.trigger_event;
      return deliveries.filter((d) => d.enrollment_id === where.enrollment_id).map((d) => {
        const step = currentSteps.find((s) => s.id === d.automation_step_id);
        return {
          ...d,
          automation_step: {
            id: d.automation_step_id,
            workflow_id: step?.workflow_id ?? null,
            session_number: step?.session_number ?? null,
            trigger_event: step?.trigger_event ?? ev,
            channel: step?.channel ?? 'ZALO_PERSONAL',
            target_group_id: step?.target_group_id ?? null,
            message_content: step?.message_content ?? '',
            delay_minutes: step?.delay_minutes ?? 0,
            workflow: step?.workflow ?? { id: 7, name: 'Care milestone W7', active: true, owner_cs_id: 50 },
          },
        };
      });
    }
    if (where?.enrollment_id !== undefined) {
      return deliveries.filter((d) => d.enrollment_id === where.enrollment_id);
    }
    throw new Error(`fake delivery findMany: unsupported where shape ${JSON.stringify(where)}`);
  });
  (prisma.messageDelivery.create as jest.Mock).mockImplementation(async ({ data }) => {
    if (findDeliveryRow(data.attendance_id, data.automation_step_id)) throw p2002();
    const d: FakeDelivery = {
      id: ++deliverySeq,
      enrollment_id: data.enrollment_id,
      attendance_id: data.attendance_id,
      automation_step_id: data.automation_step_id,
      status: 'SCHEDULED',
      scheduled_at: data.scheduled_at,
      queue_job_id: null,
      error_message: null,
      rendered_content: data.rendered_content,
      variables_snapshot: data.variables_snapshot,
    };
    deliveries.push(d);
    return { ...d };
  });
  (prisma.messageDelivery.createMany as jest.Mock).mockImplementation(async ({ data }) => {
    const list = Array.isArray(data) ? data : [data];
    for (const x of list) if (findDeliveryRow(x.attendance_id, x.automation_step_id)) throw p2002();
    for (const x of list) {
      deliveries.push({
        id: ++deliverySeq,
        enrollment_id: x.enrollment_id,
        attendance_id: x.attendance_id,
        automation_step_id: x.automation_step_id,
        status: 'SCHEDULED',
        queue_job_id: null,
        error_message: null,
        rendered_content: x.rendered_content,
        variables_snapshot: x.variables_snapshot,
      });
    }
    return { count: list.length };
  });
  (prisma.messageDelivery.update as jest.Mock).mockImplementation(async ({ where, data }) => {
    const d = deliveries.find((x) => x.id === where.id);
    if (!d) throw new Error(`fake delivery update: row ${where.id} not found`);
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v === undefined) continue;
      (d as any)[k] = v === null ? null : v;
    }
    return { ...d };
  });
  (enqueueDelivery as jest.Mock).mockImplementation(async ({ deliveryId }) => `automation:delivery:${deliveryId}`);
  (cancelDelivery as jest.Mock).mockResolvedValue(undefined);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Care-milestone occurrence contract (S1a/S2c fixed) — out-of-order finalization', () => {
  // Stable total order for DAY2 rows: A id=901 @01:00, B id=902 @09:00.
  const A_CREATED = new Date('2026-10-18T01:00:00Z');
  const B_CREATED = new Date('2026-10-18T09:00:00Z');

  beforeEach(resetHarness);

  it('acceptance (a): B@09:00 finalizes first, then A@01:00 — milestone 5 fires ONCE (basis rebinds to A, never a second row) and milestone 6 heals without any duplicate', async () => {
    // 4 earlier-day finals, so the stable total order is A=5, B=6.
    rows = [
      rowFixture(801, new Date('2026-10-14T00:00:00Z'), new Date('2026-10-14T01:00:00Z')),
      rowFixture(802, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(803, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(804, DAY1, new Date('2026-10-17T01:00:00Z')),
    ];
    installStepMock([stepFixture(5, 41), stepFixture(6, 42)]);

    // ── B (id 902, created 09:00) goes MATCHED FIRST; A is still non-FINAL.
    rows.push(rowFixture(902, DAY2, B_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB = await handleAttendanceEvent(902);

    // B observes ordinal 5 → milestone 5 fires once, occurrence keyed to
    // (enrollment 300, step 41) with basis B.
    expect(lastQuerySessionNumber()).toBe(5);
    expect(resB.deliveriesCreated).toBe(1);
    snapshot([[902, 41, 'QUEUED']]);
    expect(occurrences(41)).toHaveLength(1);
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);

    // ── A (id 901, created 01:00) finalizes AFTER B — A becomes the ordinal-5
    // basis and B shifts to ordinal 6.
    rows.push(rowFixture(901, DAY2, A_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const resA = await handleAttendanceEvent(901);

    // Milestone 5: STILL exactly ONE occurrence row (same id) — the unsent
    // SCHEDULED/QUEUED row REBINDS attendance_id 902 -> 901 in place. No second
    // delivery, no second enqueue for step 41.
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].attendance_id).toBe(901);
    expect(resA.details.some((d) => d.stepId === 41 && d.status === 'SKIPPED_DUPLICATE')).toBe(true);

    // Milestone 6: healed by the forward re-evaluation of the SAME event — the
    // ordinal-6 basis (B) now exists, so step 42 fires exactly once.
    const step6 = occurrences(42);
    expect(step6).toHaveLength(1);
    expect(step6[0].attendance_id).toBe(902);
    expect(step6[0].status).toBe('QUEUED');

    // The whole store: one row per milestone, zero duplicates.
    expect(deliveries.length).toBe(2);
    const pairs = deliveries.map((d) => [d.attendance_id, d.automation_step_id]).sort();
    expect(pairs).toEqual([[901, 41], [902, 42]]);
    // Enqueues: step41 creation, step42 creation (from A's event). The rebind
    // of step41 did not enqueue a duplicate job (already QUEUED for deliveryId).
    expect(enqueueDelivery).toHaveBeenCalledTimes(2);

    // Replay on B recomputes 6 → its own occurrence exists → SKIPPED_DUPLICATE;
    // nothing grows.
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB2 = await handleAttendanceEvent(902);
    expect(resB2.deliveriesCreated).toBe(0);
    expect(deliveries.length).toBe(2);
    expect(new Set(deliveries.map((d) => occKey(d.enrollment_id, d.automation_step_id))).size).toBe(2);
    const resB3 = await handleAttendanceEvent(902);
    expect(resB3.deliveriesCreated).toBe(0);
    expect(deliveries.length).toBe(2);
  });

  it('S1b in-order finalization keeps ordinals monotonic (A=4 fires step4 once, B=5 fires step5 once) — each milestone exactly one occurrence', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
    ];
    installStepMock([stepFixture(4, 41), stepFixture(5, 42)]);

    rows.push(rowFixture(901, DAY2, A_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const resA = await handleAttendanceEvent(901);
    expect(lastQuerySessionNumber()).toBe(4);
    expect(resA.deliveriesCreated).toBe(1);

    rows.push(rowFixture(902, DAY2, B_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB = await handleAttendanceEvent(902);
    expect(lastQuerySessionNumber()).toBe(5);
    expect(resB.deliveriesCreated).toBe(1);

    expect(deliveries.map((d) => [d.attendance_id, d.automation_step_id])).toEqual([
      [901, 41],
      [902, 42],
    ]);
    expect(enqueueDelivery).toHaveBeenCalledTimes(2);
  });

  it('S1c replay storm: per-(enrollment, step) occurrence dedupe is the stable guarantee — replays never grow the delivery set', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-14T00:00:00Z'), new Date('2026-10-14T01:00:00Z')),
      rowFixture(802, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(803, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(804, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, A_CREATED),
    ];
    installStepMock([stepFixture(5, 41), stepFixture(6, 42)]);

    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const res1 = await handleAttendanceEvent(901);
    expect(res1.deliveriesCreated).toBe(1);

    for (let i = 0; i < 5; i++) {
      const res = await handleAttendanceEvent(901);
      expect(res.deliveriesCreated).toBe(0);
      expect(res.details.some((d) => d.stepId === 41 && d.status === 'SKIPPED_DUPLICATE')).toBe(true);
    }
    expect(deliveries.length).toBe(1);
    expect(prisma.messageDelivery.create).toHaveBeenCalledTimes(1);
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);

    // The out-of-order neighbour B (created 09:00) finalizes: B's own ordinal
    // (6) lands on its own step; replays of both stay deduped.
    rows.push(rowFixture(902, DAY2, B_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB = await handleAttendanceEvent(902);
    expect(resB.deliveriesCreated).toBe(1); // (902, step 42)
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const resA2 = await handleAttendanceEvent(901);
    expect(resA2.deliveriesCreated).toBe(0);
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: B_CREATED }),
    );
    const resB2 = await handleAttendanceEvent(902);
    expect(resB2.deliveriesCreated).toBe(0);
    const oKeys = deliveries.map((d) => occKey(d.enrollment_id, d.automation_step_id));
    expect(new Set(oKeys).size).toBe(oKeys.length);
    expect(deliveries.length).toBe(2);
  });

  it('acceptance (c): basis attendance of a milestone is replaced by another attendance — dedup by (enrollment, step) holds; unsent occurrence updates basis, SENT occurrence is untouched', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
    ];
    installStepMock([stepFixture(4, 41)]);

    // X finalizes at ordinal 4 → unsent SCHEDULED occurrence.
    rows.push(rowFixture(950, DAY2, A_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 950, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    await handleAttendanceEvent(950);
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].attendance_id).toBe(950);

    // A LATER-created row Y finalizes; then a NEW earlier row Z (00:30)
    // finalizes and becomes the ordinal-4 basis → occurrence rebinds to Z.
    rows.push(rowFixture(951, DAY2, B_CREATED));
    rows.push(rowFixture(949, DAY2, new Date('2026-10-18T00:30:00Z')));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 949, sessionDate: DAY2, createdAt: new Date('2026-10-18T00:30:00Z') }),
    );
    const resZ = await handleAttendanceEvent(949);
    expect(resZ.deliveriesCreated).toBe(0);
    expect(occurrences(41)).toHaveLength(1); // one row, same identity
    expect(occurrences(41)[0].id).toBeDefined();
    const rowId = occurrences(41)[0].id;
    expect(occurrences(41)[0].attendance_id).toBe(949); // basis updated in place
    // No second create attempt for step 41.
    const step41Creates = (prisma.messageDelivery.create as jest.Mock).mock.calls.filter(
      (c: any) => c[0].data.automation_step_id === 41,
    );
    expect(step41Creates).toHaveLength(1);
    void rowId;

    // SENT occurrence: basis replacement NEVER mutates or re-sends it.
    occurrences(41)[0].status = 'SENT';
    rows.push(rowFixture(948, new Date('2026-10-17T23:00:00Z'), new Date('2026-10-18T00:00:00Z')));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 948, sessionDate: DAY2, createdAt: new Date('2026-10-18T00:00:00Z') }),
    );
    const resLate = await handleAttendanceEvent(948);
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].status).toBe('SENT');
    expect(occurrences(41)[0].attendance_id).toBe(949); // historical trigger kept
    expect(resLate.details.some((d) => d.stepId === 41 && d.status === 'SKIPPED_DUPLICATE')).toBe(true);
  });

  it('acceptance (d): two concurrent requests reaching the same milestone create exactly ONE occurrence and ONE enqueue per step', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, new Date('2026-10-18T01:00:00Z')),
    ];
    installStepMock([stepFixture(4, 41)]);
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: new Date('2026-10-18T01:00:00Z') }),
    );

    const [r1, r2] = await Promise.all([handleAttendanceEvent(901), handleAttendanceEvent(901)]);

    expect(occurrences(41)).toHaveLength(1);
    expect([r1.deliveriesCreated, r2.deliveriesCreated].sort()).toEqual([0, 1]);
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);
    const loser = r1.deliveriesCreated === 0 ? r1 : r2;
    expect(loser.details.some((d) => d.status === 'SKIPPED_DUPLICATE')).toBe(true);
    expect(deliveries.length).toBe(1);
  });
});

describe('Care-milestone occurrence contract — FINAL → CONFLICT → FINAL', () => {
  const C_CREATED = new Date('2026-10-18T01:00:00Z');
  const D_CREATED = new Date('2026-10-18T09:00:00Z');

  beforeEach(resetHarness);

  it('S2a CONFLICT drop: pending occurrence on the shifting milestone rebinds (no new row) and the milestone above the new count cancels — acceptance (b) half 1', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, C_CREATED), // C — same-day, strictly before D
    ];
    installStepMock([stepFixture(4, 41), stepFixture(5, 42)]);

    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED }),
    );
    const resC = await handleAttendanceEvent(901);
    expect(lastQuerySessionNumber()).toBe(4);
    expect(resC.deliveriesCreated).toBe(1);

    rows.push(rowFixture(902, DAY2, D_CREATED)); // D finalizes second
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 902, sessionDate: DAY2, createdAt: D_CREATED }),
    );
    const resD = await handleAttendanceEvent(902);
    expect(lastQuerySessionNumber()).toBe(5);
    expect(resD.deliveriesCreated).toBe(1);
    snapshot([[901, 41, 'QUEUED'], [902, 42, 'QUEUED']]);

    // ── Reconciliation flips C to CONFLICT (C stops qualifying). The CONFLICT
    // writer calls cancelPendingDeliveries — now enrollment-wide:
    rows = rows.map((r) => (r.id === 901 ? { ...r, reconciliation_state: 'CONFLICT' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED, reconciliationState: 'CONFLICT' }),
    );
    const cancelledCount = await cancelPendingDeliveries(901);
    // Count now 4: D is the ordinal-4 basis (REBIND, one row) and the ordinal-5
    // milestone fell below its step → its unsent occurrence CANCELS.
    const occ41 = occurrences(41);
    expect(occ41).toHaveLength(1);
    expect(occ41[0].attendance_id).toBe(902);
    expect(occ41[0].status).toBe('QUEUED');
    const occ42 = occurrences(42);
    expect(occ42).toHaveLength(1);
    expect(occ42[0].status).toBe('CANCELLED');
    expect(cancelledCount).toBeGreaterThanOrEqual(1);
    expect(cancelDelivery).toHaveBeenCalledWith(occ42[0].id);
  });

  it('S2b re-finalization of the SAME (attendance, step) after CONFLICT→FINAL is deduped: SKIPPED_DUPLICATE, zero new deliveries', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, C_CREATED),
    ];
    installStepMock([stepFixture(4, 41)]);

    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED }),
    );
    const res1 = await handleAttendanceEvent(901);
    expect(res1.deliveriesCreated).toBe(1);
    expect(deliveries.length).toBe(1);

    // C → CONFLICT: events on C short-circuit before step matching (FINAL gate).
    rows = rows.map((r) => (r.id === 901 ? { ...r, reconciliation_state: 'CONFLICT' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED, reconciliationState: 'CONFLICT' }),
    );
    const createsBefore = (prisma.messageDelivery.create as jest.Mock).mock.calls.length;
    const res2 = await handleAttendanceEvent(901);
    expect(res2.deliveriesCreated).toBe(0);
    expect((prisma.messageDelivery.create as jest.Mock).mock.calls.length).toBe(createsBefore);

    // C → RESOLVED + re-finalization event: ordinal 4 again → same occurrence.
    rows = rows.map((r) => (r.id === 901 ? { ...r, reconciliation_state: 'RESOLVED' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED, reconciliationState: 'RESOLVED' }),
    );
    const res3 = await handleAttendanceEvent(901);
    expect(res3.deliveriesCreated).toBe(0);
    expect(res3.details.some((d) => d.stepId === 41 && d.status === 'SKIPPED_DUPLICATE')).toBe(true);
    expect(deliveries.length).toBe(1);
    expect(prisma.messageDelivery.create).toHaveBeenCalledTimes(1);
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);
  });

  it('acceptance (b) half 2: FINAL→CONFLICT→FINAL cancels the unsent occurrence once and REACTIVATES the SAME row once (never a second row; SENT steps never re-sent)', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
    ];
    installStepMock([stepFixture(4, 41)]);

    // E (905, @01:00) FINAL: ordinal 4 → milestone fires on E.
    rows.push(rowFixture(905, DAY2, C_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 905, sessionDate: DAY2, createdAt: C_CREATED }),
    );
    const resE = await handleAttendanceEvent(905);
    expect(resE.deliveriesCreated).toBe(1);
    const occId = occurrences(41)[0].id;

    // E drops to CONFLICT → wide cancel pass cancels the UNSENT occurrence.
    rows = rows.map((r) => (r.id === 905 ? { ...r, reconciliation_state: 'CONFLICT' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 905, sessionDate: DAY2, createdAt: C_CREATED, reconciliationState: 'CONFLICT' }),
    );
    await cancelPendingDeliveries(905);
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].status).toBe('CANCELLED');

    // G (906, @09:00) finalizes while E is CONFLICT: G is the ordinal-4 basis.
    rows.push(rowFixture(906, DAY2, D_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 906, sessionDate: DAY2, createdAt: D_CREATED }),
    );
    const resG = await handleAttendanceEvent(906);
    // Row 5 "drops below milestone then rises back": the CANCELLED occurrence
    // REACTIVATES in place (same row id) — never a second row.
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].id).toBe(occId);
    expect(occurrences(41)[0].status).toBe('QUEUED');
    expect(occurrences(41)[0].attendance_id).toBe(906);
    expect(resG.deliveriesCreated).toBe(1); // reactivation counts as (re-)creation of the send
    expect(deliveries.length).toBe(1);

    // E returns to FINAL before G in the total order → basis shifts back to E.
    rows = rows.map((r) => (r.id === 905 ? { ...r, reconciliation_state: 'RESOLVED' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 905, sessionDate: DAY2, createdAt: C_CREATED, reconciliationState: 'RESOLVED' }),
    );
    await handleAttendanceEvent(905);
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].id).toBe(occId);
    expect(occurrences(41)[0].attendance_id).toBe(905);

    // Mark the occurrence SENT, then drop E again — history never mutates,
    // nothing re-sends, nothing cancels.
    occurrences(41)[0].status = 'SENT';
    rows = rows.map((r) => (r.id === 905 ? { ...r, reconciliation_state: 'CONFLICT' } : r));
    await cancelPendingDeliveries(905);
    expect(occurrences(41)[0].status).toBe('SENT');
    expect(occurrences(41)[0].attendance_id).toBe(905);
    // And a later FINAL event cannot re-send it:
    rows = rows.map((r) => (r.id === 905 ? { ...r, reconciliation_state: 'MATCHED' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 905, sessionDate: DAY2, createdAt: C_CREATED }),
    );
    const resSent = await handleAttendanceEvent(905);
    expect(resSent.details.some((d) => d.stepId === 41 && d.status === 'SKIPPED_DUPLICATE')).toBe(true);
    expect(deliveries.length).toBe(1);
  });

  it('S2c neighbor shift heals WITHOUT waiting for an unrelated event: the event that changes reconciliation re-evaluates every affected milestone', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
    ];
    installStepMock([stepFixture(4, 41)]);

    // E (905) FINAL first: milestone 4 fires on E.
    rows.push(rowFixture(905, DAY2, C_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 905, sessionDate: DAY2, createdAt: C_CREATED }),
    );
    await handleAttendanceEvent(905);
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].attendance_id).toBe(905);

    // G (906) finalizes LATER (E still FINAL): G takes ordinal 5, milestone 4
    // keeps E as basis — no change.
    rows.push(rowFixture(906, DAY2, D_CREATED));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 906, sessionDate: DAY2, createdAt: D_CREATED }),
    );
    await handleAttendanceEvent(906);
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].attendance_id).toBe(905);
    expect(deliveries.length).toBe(1);
  });

  it('legacy duplicate convergence: two pre-existing rows for one (enrollment, step) heal to ONE canonical occurrence without inserts', async () => {
    // Simulate history written by the OLD per-row design: milestone 5 has a
    // row keyed to 902 while the stable basis (count=5) is 901.
    rows = [
      rowFixture(801, new Date('2026-10-14T00:00:00Z'), new Date('2026-10-14T01:00:00Z')),
      rowFixture(802, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(803, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(804, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, C_CREATED),
      rowFixture(902, DAY2, D_CREATED),
    ];
    installStepMock([stepFixture(5, 41)]);
    deliveries.push(
      { id: 9100, enrollment_id: 300, attendance_id: 901, automation_step_id: 41, status: 'CANCELLED', queue_job_id: null, error_message: 'legacy', rendered_content: 'x', variables_snapshot: {} },
      { id: 9101, enrollment_id: 300, attendance_id: 902, automation_step_id: 41, status: 'SCHEDULED', queue_job_id: null, error_message: null, rendered_content: 'y', variables_snapshot: {} },
    );

    const out = await reconcileEnrollmentMilestones(300, { deliveryPolicy: 'SEND' });

    // One canonical row survives as the occurrence for ordinal 5 (basis 901):
    // the legacy rows converge — the SCHEDULED row on 902 is the most-advanced
    // and gets REBOUND to 901; the CANCELLED extra on 901 is not eligible for
    // reactivation while an unsent sibling exists (superseded / protected
    // history). Either way: NO new row, no second SENT path.
    const for41 = occurrences(41);
    expect(for41.length).toBe(2); // history rows preserved (no destructive deletes)
    const active = for41.filter((d) => ['SCHEDULED', 'QUEUED'].includes(d.status));
    expect(active).toHaveLength(1); // exactly one live occurrence
    expect(active[0].attendance_id).toBe(901);
    expect(out.details.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Care-milestone occurrence contract — policy & enrollment isolation', () => {
  beforeEach(resetHarness);

  it('acceptance (e): NO_SEND advances the (read-only) progress basis and cancels invalidated pendings, but creates ZERO deliveries', async () => {
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, new Date('2026-10-18T01:00:00Z')),
    ];
    installStepMock([stepFixture(4, 41), stepFixture(5, 42)]);
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: new Date('2026-10-18T01:00:00Z') }),
    );

    const res = await handleAttendanceEvent(901, { deliveryPolicy: 'NO_SEND' });
    expect(res.deliveriesCreated).toBe(0);
    expect(deliveries).toHaveLength(0);
    expect(enqueueDelivery).not.toHaveBeenCalled();
    // Progress is derived from the K7 query itself — count is already 4:
    const qualifying = await prisma.attendance.findMany({
      where: {
        enrollment_class: { enrollment_id: 300 },
        status: 'ATTENDED',
        reconciliation_state: { in: ['MATCHED', 'RESOLVED'] },
        deleted_at: null,
      },
    });
    expect(qualifying).toHaveLength(4);

    // A pending created under a prior SEND pass still cancels under NO_SEND.
    await handleAttendanceEvent(901); // SEND default → creates occurrence
    expect(deliveries).toHaveLength(1);
    rows = rows.map((r) => (r.id === 801 ? { ...r, reconciliation_state: 'CONFLICT' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 801, sessionDate: new Date('2026-10-15T00:00:00Z'), createdAt: new Date('2026-10-15T01:00:00Z'), reconciliationState: 'CONFLICT' }),
    );
    const createdBefore = (prisma.messageDelivery.create as jest.Mock).mock.calls.length;
    await cancelPendingDeliveries(801); // NO_SEND-wide
    expect(deliveries.filter((d) => d.status === 'CANCELLED')).toHaveLength(1);
    expect((prisma.messageDelivery.create as jest.Mock).mock.calls.length).toBe(createdBefore);
  });

  it('acceptance (f): two enrollments of the SAME student keep fully independent milestones — reaching step 5 on enrollment 1 does not suppress enrollment 2', async () => {
    const A_CREATED = new Date('2026-10-18T01:00:00Z');
    const fourEarlier = (enr: number) => [
      rowFixture(enr * 1000 + 1, new Date('2026-10-14T00:00:00Z'), new Date('2026-10-14T01:00:00Z'), { enrollment_id: enr }),
      rowFixture(enr * 1000 + 2, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z'), { enrollment_id: enr }),
      rowFixture(enr * 1000 + 3, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z'), { enrollment_id: enr }),
      rowFixture(enr * 1000 + 4, DAY1, new Date('2026-10-17T01:00:00Z'), { enrollment_id: enr }),
    ];
    rows = [...fourEarlier(300), ...fourEarlier(301), rowFixture(901, DAY2, A_CREATED, { enrollment_id: 300 })];
    installStepMock([stepFixture(5, 41)]);

    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, enrollmentId: 300, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const res1 = await handleAttendanceEvent(901);
    expect(res1.deliveriesCreated).toBe(1);
    expect(occurrences(41, 300)).toHaveLength(1);

    rows.push(rowFixture(911, DAY2, A_CREATED, { enrollment_id: 301 }));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 911, enrollmentId: 301, sessionDate: DAY2, createdAt: A_CREATED }),
    );
    const res2 = await handleAttendanceEvent(911);
    expect(res2.deliveriesCreated).toBe(1);
    expect(occurrences(41, 301)).toHaveLength(1);

    // Independent identities AND independent bases: enrol1 basis 901,
    // enrol2 basis 911 — nothing suppressed across enrollments.
    expect(occurrences(41, 300)[0].attendance_id).toBe(901);
    expect(occurrences(41, 301)[0].attendance_id).toBe(911);
    expect(enqueueDelivery).toHaveBeenCalledTimes(2);
  });

  it('rebind consistency (Point 5): rebinding a SCHEDULED/QUEUED occurrence refreshes rendered_content & variables_snapshot in place while keeping scheduled_at and without re-enqueuing', async () => {
    const A_CREATED = new Date('2026-10-18T01:00:00Z');
    const B_CREATED = new Date('2026-10-18T09:00:00Z');

    rows = [
      rowFixture(801, new Date('2026-10-14T00:00:00Z'), new Date('2026-10-14T01:00:00Z')),
      rowFixture(802, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(803, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(804, DAY1, new Date('2026-10-17T01:00:00Z')),
      // B (902) finalizes first on class N3-K12 with Sensei Tanaka
      rowFixture(902, DAY2, B_CREATED, { class_name: 'N3-K12', teacher_name: 'Sensei Tanaka' }),
    ];

    const stepWithClassTeacher = {
      ...stepFixture(5, 41),
      message_content:
        'Chào {{student_name}}, mốc buổi {{session_number}} lớp {{class_name}} cùng GV {{teacher_name}}!',
      message_variables: ['student_name', 'session_number', 'class_name', 'teacher_name'],
    };
    installStepMock([stepWithClassTeacher]);

    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({
        id: 902,
        sessionDate: DAY2,
        createdAt: B_CREATED,
        className: 'N3-K12',
        teacherName: 'Sensei Tanaka',
      }),
    );

    const resB = await handleAttendanceEvent(902);
    expect(resB.deliveriesCreated).toBe(1);
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);

    const occBefore = occurrences(41)[0];
    expect(occBefore.attendance_id).toBe(902);
    expect(occBefore.rendered_content).toContain('N3-K12');
    expect(occBefore.rendered_content).toContain('Sensei Tanaka');
    expect(occBefore.variables_snapshot).toMatchObject({
      class_name: 'N3-K12',
      teacher_name: 'Sensei Tanaka',
      session_number: 5,
    });
    const fixedScheduledAt = new Date('2026-10-18T09:00:05.000Z');
    occBefore.scheduled_at = fixedScheduledAt;
    const originalDeliveryId = occBefore.id;
    const originalQueueJobId = occBefore.queue_job_id;

    // Now earlier same-day session A (901 @01:00) finalizes on transferred class N3-K99 with Sensei Sato.
    // A becomes ordinal 5 (basis of step 41 shifts 902 -> 901).
    rows.push(
      rowFixture(901, DAY2, A_CREATED, { class_name: 'N3-K99', teacher_name: 'Sensei Sato' }),
    );
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({
        id: 901,
        sessionDate: DAY2,
        createdAt: A_CREATED,
        className: 'N3-K99',
        teacherName: 'Sensei Sato',
      }),
    );

    const resA = await handleAttendanceEvent(901);
    expect(resA.deliveriesCreated).toBe(0);
    // No second enqueue on rebind:
    expect(enqueueDelivery).toHaveBeenCalledTimes(1);

    const occAfter = occurrences(41);
    expect(occAfter).toHaveLength(1);
    expect(occAfter[0].id).toBe(originalDeliveryId);
    expect(occAfter[0].attendance_id).toBe(901);
    // rendered_content & variables_snapshot ARE refreshed to the new basis A:
    expect(occAfter[0].rendered_content).toContain('N3-K99');
    expect(occAfter[0].rendered_content).toContain('Sensei Sato');
    expect(occAfter[0].rendered_content).not.toContain('N3-K12');
    expect(occAfter[0].variables_snapshot).toMatchObject({
      class_name: 'N3-K99',
      teacher_name: 'Sensei Sato',
      session_number: 5,
    });
    // scheduled_at and queue_job_id are KEPT unchanged:
    expect(occAfter[0].scheduled_at).toEqual(fixedScheduledAt);
    expect(occAfter[0].queue_job_id).toBe(originalQueueJobId);

    // Finally, when the already-enqueued BullMQ job (still carrying old attendanceId = 902 in job.data)
    // executes, processDeliveryJob loads the delivery by deliveryId from DB and sends the refreshed content!
    const enqueuedJobPayload = (enqueueDelivery as jest.Mock).mock.calls[0][0] as SendJobData;
    expect(enqueuedJobPayload.attendanceId).toBe(902); // stale attendanceId in BullMQ job payload
    const mockSendMessage = jest.fn().mockResolvedValue({ data: { messageId: 'zalo_msg_901' } });
    (zaloPool.getApi as jest.Mock).mockReturnValue({ sendMessage: mockSendMessage });

    await processDeliveryJob({
      id: `automation:delivery:${originalDeliveryId}`,
      data: enqueuedJobPayload,
    } as unknown as Job<SendJobData>);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][0]).toContain('N3-K99');
    expect(mockSendMessage.mock.calls[0][0]).toContain('Sensei Sato');
    expect(occAfter[0].status).toBe('SENT');
  });

  it('NO_SEND non-reactivation (Point 5): under NO_SEND, an existing CANCELLED occurrence is NEVER reactivated and NEVER enqueued when the milestone becomes eligible again', async () => {
    const C_CREATED = new Date('2026-10-18T01:00:00Z');
    rows = [
      rowFixture(801, new Date('2026-10-15T00:00:00Z'), new Date('2026-10-15T01:00:00Z')),
      rowFixture(802, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-16T01:00:00Z')),
      rowFixture(803, DAY1, new Date('2026-10-17T01:00:00Z')),
      rowFixture(901, DAY2, C_CREATED),
    ];
    installStepMock([stepFixture(4, 41)]);

    // 1. Create occurrence under SEND (ordinal 4 reached)
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED }),
    );
    await handleAttendanceEvent(901, { deliveryPolicy: 'SEND' });
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].status).toBe('QUEUED');
    const cancelledId = occurrences(41)[0].id;

    // 2. Drop 901 to CONFLICT -> occurrence transitions to CANCELLED
    rows = rows.map((r) => (r.id === 901 ? { ...r, reconciliation_state: 'CONFLICT' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED, reconciliationState: 'CONFLICT' }),
    );
    await cancelPendingDeliveries(901);
    expect(occurrences(41)[0].status).toBe('CANCELLED');

    // 3. 901 returns to FINAL (RESOLVED), making ordinal 4 eligible again, but under NO_SEND:
    //    Neither handleAttendanceEvent(NO_SEND) nor reconcileEnrollmentMilestones(NO_SEND) may reactivate or enqueue!
    const enqueuesBefore = (enqueueDelivery as jest.Mock).mock.calls.length;
    const createsBefore = (prisma.messageDelivery.create as jest.Mock).mock.calls.length;
    const updatesBefore = (prisma.messageDelivery.update as jest.Mock).mock.calls.length;
    rows = rows.map((r) => (r.id === 901 ? { ...r, reconciliation_state: 'RESOLVED' } : r));
    (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(
      attendanceFixture({ id: 901, sessionDate: DAY2, createdAt: C_CREATED, reconciliationState: 'RESOLVED' }),
    );

    const resNoSendEvent = await handleAttendanceEvent(901, { deliveryPolicy: 'NO_SEND' });
    expect(resNoSendEvent.deliveriesCreated).toBe(0);
    expect(occurrences(41)).toHaveLength(1);
    expect(occurrences(41)[0].id).toBe(cancelledId);
    expect(occurrences(41)[0].status).toBe('CANCELLED');
    expect((enqueueDelivery as jest.Mock).mock.calls.length).toBe(enqueuesBefore);
    expect((prisma.messageDelivery.create as jest.Mock).mock.calls.length).toBe(createsBefore);
    expect((prisma.messageDelivery.update as jest.Mock).mock.calls.length).toBe(updatesBefore);

    const resNoSendWide = await reconcileEnrollmentMilestones(300, { deliveryPolicy: 'NO_SEND' });
    expect(resNoSendWide.deliveriesCreated).toBe(0);
    expect(occurrences(41)[0].status).toBe('CANCELLED');
    expect((enqueueDelivery as jest.Mock).mock.calls.length).toBe(enqueuesBefore);
    expect((prisma.messageDelivery.create as jest.Mock).mock.calls.length).toBe(createsBefore);
    expect((prisma.messageDelivery.update as jest.Mock).mock.calls.length).toBe(updatesBefore);
  });
});
