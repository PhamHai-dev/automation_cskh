jest.mock('../../../prisma/client', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

jest.mock('../attendance-lifecycle', () => ({
  deriveAttendanceReconciliationState: jest.fn((teacher: string | null, cs: string | null) => {
    if (!teacher) return 'PENDING_TEACHER';
    if (!cs) return 'PENDING_CS';
    return teacher === cs ? 'MATCHED' : 'CONFLICT';
  }),
  runAttendancePostCommit: jest.fn(),
}));

import { prisma } from '../../../prisma/client';
import { runAttendancePostCommit } from '../attendance-lifecycle';
import { AttendanceImportService } from '../attendance-import.service';

const transaction = prisma.$transaction as jest.Mock;
const postCommit = runAttendancePostCommit as jest.Mock;

describe('AttendanceImportService commit downstream integration', () => {
  beforeEach(() => jest.clearAllMocks());

  function makePreview(overrides: Record<string, unknown> = {}) {
    return {
      items: [{
        id: 'CSKH:A1', source: 'CSKH', rowNumber: 3, cellAddress: 'A1', externalId: 'S1',
        sourceDate: '2026-01-01', targetDate: '2026-01-01', rawValue: 'X', status: 'ATTENDED',
        sessionCount: 1, messages: [], enrollmentClassId: 11, classId: 12,
        classification: 'CREATE', defaultAction: 'APPLY',
        sessionPlans: [{ startTime: '09:00', endTime: '09:30', action: 'CREATE_SESSION' }],
        ...overrides,
      }],
    } as any;
  }

  it('commits historical import as NO_SEND and still invokes post-commit policy', async () => {
    const tx = {
      classSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 21 }),
        create: jest.fn(),
      },
      attendance: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 31 }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    await new AttendanceImportService().commit(makePreview(), { id: 7, roles: ['ADMIN'] });

    expect(postCommit).toHaveBeenCalledWith(expect.objectContaining({
      attendanceId: 31,
      reconciliationState: 'PENDING_TEACHER',
      deliveryPolicy: 'NO_SEND',
    }));
  });

  it('allows an explicit SEND batch policy without persisting policy on Attendance', async () => {
    const tx = {
      classSession: { findFirst: jest.fn().mockResolvedValue({ id: 21 }), create: jest.fn() },
      attendance: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 32 }), update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    await new AttendanceImportService().commit(makePreview(), { id: 7, roles: ['ADMIN'] }, {}, { deliveryPolicy: 'SEND' });

    expect(postCommit).toHaveBeenCalledWith(expect.objectContaining({ attendanceId: 32, deliveryPolicy: 'SEND' }));
    expect(tx.attendance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ deliveryPolicy: expect.anything() }),
    }));
  });

  it('regression: historical NO_SEND update that invalidates an existing pending delivery still flags cancellation', async () => {
    // Existing record was previously reconciled MATCHED (teacher ATTENDED) and
    // may have a queued delivery. Historical CSKH import rewrites the CS side
    // with a different opinion => CONFLICT. NO_SEND suppresses NEW outbound
    // work but must still invalidate the now-stale pending delivery.
    const existing = {
      id: 41,
      status: 'ATTENDED',
      teacher_status: 'ATTENDED',
      cs_status: 'ATTENDED',
      reconciliation_state: 'MATCHED',
    };
    const tx = {
      classSession: { findFirst: jest.fn().mockResolvedValue({ id: 21 }), create: jest.fn() },
      attendance: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ ...existing, cs_status: 'ABSENT_UNAPPROVED_C', reconciliation_state: 'CONFLICT' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    await new AttendanceImportService().commit(
      makePreview({ status: 'ABSENT_UNAPPROVED_C' as any }),
      { id: 7, roles: ['ADMIN'] },
    );
    expect(postCommit).toHaveBeenCalledTimes(1);
    expect(postCommit).toHaveBeenCalledWith({
      attendanceId: 41,
      reconciliationState: 'CONFLICT',
      deliveryPolicy: 'NO_SEND',
      invalidatePendingDeliveries: true,
    });
    // Read model + audit are still written for NO_SEND records.
    expect(tx.attendance.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('regression: omitted policy on a FINAL(NO_SEND) importer update never reaches the outbound trigger path', async () => {
    // CSKH import agrees with existing teacher opinion => MATCHED (FINAL).
    // Post-commit still receives the explicit NO_SEND policy so the shared
    // helper skips handleAttendanceEvent; only cancellation safety remains.
    const existing = {
      id: 42,
      status: 'ATTENDED',
      teacher_status: 'ATTENDED',
      cs_status: null,
      reconciliation_state: 'PENDING_CS',
    };
    const tx = {
      classSession: { findFirst: jest.fn().mockResolvedValue({ id: 21 }), create: jest.fn() },
      attendance: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ ...existing, cs_status: 'ATTENDED', reconciliation_state: 'MATCHED' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    await new AttendanceImportService().commit(makePreview(), { id: 7, roles: ['ADMIN'] });

    expect(postCommit).toHaveBeenCalledWith(expect.objectContaining({
      attendanceId: 42,
      reconciliationState: 'MATCHED',
      deliveryPolicy: 'NO_SEND',
    }));
  });

  it('regression: drains committed item before a later item rolls back', async () => {
    // Two valid items sharing one service call. Item 1's transaction commits and
    // must drain immediately; item 2's transaction rejects afterwards.
    const items = [makePreview().items[0], { ...makePreview().items[0], id: 'CSKH:B1', cellAddress: 'B1' }];
    const committedTx = {
      classSession: { findFirst: jest.fn().mockResolvedValue({ id: 21 }), create: jest.fn() },
      attendance: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 31 }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const events: string[] = [];
    let txCall = 0;
    transaction.mockImplementation(async (callback: (value: typeof committedTx) => unknown) => {
      txCall += 1;
      events.push('tx-start-' + txCall);
      if (txCall === 1) {
        const r = await callback(committedTx);
        events.push('tx-commit-1');
        return r;
      }
      throw new Error('second transaction rolled back');
    });
    postCommit.mockImplementation(async () => { events.push('downstream'); });

    await expect(
      new AttendanceImportService().commit({ items } as any, { id: 7, roles: ['ADMIN'] }),
    ).rejects.toThrow('second transaction rolled back');

    // Item 1's downstream must run right after item 1 commits and strictly before
    // item 2's transaction begins — otherwise durable work would strand on rollback.
    expect(events).toEqual(['tx-start-1', 'tx-commit-1', 'downstream', 'tx-start-2']);
    expect(postCommit).toHaveBeenCalledTimes(1);
    expect(postCommit).toHaveBeenCalledWith(expect.objectContaining({ attendanceId: 31 }));
  });

  it('regression: a single rolled-back transaction runs no downstream', async () => {
    const tx = {
      classSession: { findFirst: jest.fn().mockResolvedValue({ id: 21 }) },
      attendance: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 99 }),
      },
      // Failure after the attendance write has populated itemDownstream.
      auditLog: { create: jest.fn().mockRejectedValue(new Error('boom')) },
    };
    transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    await expect(
      new AttendanceImportService().commit(makePreview(), { id: 7, roles: ['ADMIN'] }),
    ).rejects.toThrow('boom');

    expect(postCommit).not.toHaveBeenCalled();
  });
});
