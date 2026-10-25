// POLICY (owner, 2026-10-25): "MANAGE vẫn là CVHT có phạm vi quản lý nhóm" —
// MANAGE may act on CS opinions ONLY within its assigned CS groups + self
// (prisma.manageAssignment → cs_group.members.user_ids, the same idiom as
// care.service.getAccessibleCSIds / students.repository.getStudentCsScope).
// ADMIN keeps the unrestricted bypass; plain CS keeps own-enrollment-only.
// This closes the old gap where isPrivileged() = ADMIN||MANAGE short-circuited
// assertCSScope, letting MANAGE cs-mark ANY enrollment out of group.
//
// Pure mock tests — no DB, no app boot; automation-trigger mocked so no BullMQ.
// Mock shape reused from reconciliation-cancelled-session.unit.test.ts.

jest.mock('../../../prisma/client', () => ({
  prisma: {
    attendance: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    classTeacher: {
      findFirst: jest.fn(),
    },
    manageAssignment: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../../automation/automation-trigger.service', () => ({
  handleAttendanceEvent: jest.fn(),
  cancelPendingDeliveries: jest.fn(),
}));

import { AttendanceStatus, ReconciliationState } from '@prisma/client';
import { prisma } from '../../../prisma/client';
import { handleAttendanceEvent, cancelPendingDeliveries } from '../../automation/automation-trigger.service';
import { ReconciliationService } from '../reconciliation.service';
import { AppError } from '../../../middlewares/error.middleware';

const mockPrisma = prisma as unknown as {
  attendance: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  classTeacher: { findFirst: jest.Mock };
  manageAssignment: { findMany: jest.Mock };
  $transaction: jest.Mock;
  auditLog: { create: jest.Mock };
};

const attendanceId = 100;
const MANAGE_ID = 2;
const CS_ASSIGNED_ID = 3;
const GROUP_MEMBER_CS_ID = 4;

const MANAGE = { id: MANAGE_ID, roles: ['MANAGE'] };
const ADMIN = { id: 1, roles: ['ADMIN'] };
const CS_ASSIGNED = { id: CS_ASSIGNED_ID, roles: ['CS'] };
const CS_OTHER = { id: 77, roles: ['CS'] };

/** Attendance row as markByCS loads it: PENDING_CS with a teacher opinion set. */
function csRecord(enrollmentCsId: number) {
  return {
    id: attendanceId,
    teacher_status: AttendanceStatus.ATTENDED,
    cs_status: null,
    reconciliation_state: ReconciliationState.PENDING_CS,
    class_session: { status: 'SCHEDULED' },
    enrollment_class: { enrollment: { cs_id: enrollmentCsId } },
  };
}

/** manageAssignment fixture shaped like care's getAccessibleCSIds consumer. */
function groupWithMembers(...userIds: number[]) {
  return { cs_group: { members: userIds.map((user_id) => ({ user_id })) } };
}

function mockMatchedWrite() {
  mockPrisma.$transaction.mockImplementation(async (fn: any) => {
    const updated = {
      ...csRecord(CS_ASSIGNED_ID),
      cs_status: AttendanceStatus.ATTENDED,
      reconciliation_state: ReconciliationState.MATCHED,
      status: AttendanceStatus.ATTENDED,
    };
    mockPrisma.attendance.update.mockResolvedValue(updated);
    return fn({ attendance: mockPrisma.attendance, auditLog: mockPrisma.auditLog });
  });
}

let service: ReconciliationService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new ReconciliationService();
  // Downstream helpers must resolve: runAttendancePostCommit chains .catch() on them.
  (handleAttendanceEvent as jest.Mock).mockResolvedValue({});
  (cancelPendingDeliveries as jest.Mock).mockResolvedValue(0);
});

describe('markByCS — MANAGE is group-scoped, not ADMIN-equivalent', () => {
  it('(a) MANAGE marks an enrollment owned by SELF (empty assignments → scope = [self])', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(csRecord(MANAGE_ID));
    mockPrisma.manageAssignment.findMany.mockResolvedValue([]);
    mockMatchedWrite();

    const result = await service.markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, MANAGE);

    expect(result.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(mockPrisma.manageAssignment.findMany).toHaveBeenCalledWith({
      where: { manage_user_id: MANAGE_ID },
      include: { cs_group: { include: { members: true } } },
    });
    expect(mockPrisma.attendance.update).toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ATTENDANCE_CS_MARK', user_id: MANAGE_ID }),
      })
    );
  });

  it('(b) MANAGE marks an enrollment owned by a CS inside its assigned group', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(csRecord(GROUP_MEMBER_CS_ID));
    mockPrisma.manageAssignment.findMany.mockResolvedValue([
      groupWithMembers(CS_ASSIGNED_ID, GROUP_MEMBER_CS_ID),
    ]);
    mockMatchedWrite();

    const result = await service.markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, MANAGE);

    expect(result.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(mockPrisma.attendance.update).toHaveBeenCalled();
  });

  it('(c) MANAGE OUT of its groups is rejected 403 with the CS scope message and no write', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(csRecord(999)); // cs_id outside self ∪ members
    mockPrisma.manageAssignment.findMany.mockResolvedValue([groupWithMembers(CS_ASSIGNED_ID)]);

    const err = await service
      .markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, MANAGE)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe('Bạn không phụ trách học viên này');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('markByCS — ADMIN and plain CS behavior unchanged', () => {
  it('(f) ADMIN marks any enrollment without a scope lookup (unrestricted bypass kept)', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(csRecord(999));
    mockMatchedWrite();

    const result = await service.markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, ADMIN);

    expect(result.reconciliation_state).toBe(ReconciliationState.MATCHED);
    // ADMIN must not pay for manageAssignment — bypass preserved.
    expect(mockPrisma.manageAssignment.findMany).not.toHaveBeenCalled();
  });

  it('(d) assigned CS can still mark its own enrollment (no group lookup)', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(csRecord(CS_ASSIGNED_ID));
    mockMatchedWrite();

    const result = await service.markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, CS_ASSIGNED);

    expect(result.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(mockPrisma.manageAssignment.findMany).not.toHaveBeenCalled();
  });

  it('(e) unassigned CS is rejected with 403 (own-enrollment-only, unchanged)', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(csRecord(CS_ASSIGNED_ID));

    const err = await service
      .markByCS(attendanceId, { status: AttendanceStatus.ABSENT_APPROVED_A }, CS_OTHER)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe('Bạn không phụ trách học viên này');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.manageAssignment.findMany).not.toHaveBeenCalled();
  });
});

describe('bulkApprovePending — MANAGE out-of-group id aborts the batch (existing abort semantics)', () => {
  // Current semantics verified before asserting: the validation loop throws on
  // the first offending record BEFORE any transaction/write → whole-batch
  // abort, NOT per-item partial results. This test pins that behavior.
  it('(g) rejects the whole call with 403 and performs no writes when one id is out of group', async () => {
    const inGroup = { ...csRecord(GROUP_MEMBER_CS_ID), id: attendanceId };
    const outOfGroup = { ...csRecord(999), id: 101 };
    mockPrisma.attendance.findMany.mockResolvedValue([inGroup, outOfGroup]);
    mockPrisma.manageAssignment.findMany.mockResolvedValue([
      groupWithMembers(CS_ASSIGNED_ID, GROUP_MEMBER_CS_ID),
    ]);

    const err = await service
      .bulkApprovePending([attendanceId, 101], MANAGE)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe('Bạn không phụ trách học viên này');
    // Abort precedes the transaction: nothing is written, not even the in-group record.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('bulk approve still succeeds for MANAGE when every id is in-group', async () => {
    mockPrisma.attendance.findMany.mockResolvedValue([
      { ...csRecord(GROUP_MEMBER_CS_ID), id: attendanceId },
      { ...csRecord(MANAGE_ID), id: 101 },
    ]);
    mockPrisma.manageAssignment.findMany.mockResolvedValue([groupWithMembers(GROUP_MEMBER_CS_ID)]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      mockPrisma.attendance.update.mockResolvedValue({ id: attendanceId });
      return fn({ attendance: mockPrisma.attendance, auditLog: mockPrisma.auditLog });
    });

    const result = await service.bulkApprovePending([attendanceId, 101], MANAGE);

    expect(result.approvedCount).toBe(2);
    expect(mockPrisma.manageAssignment.findMany).toHaveBeenCalledTimes(2); // one scope resolution per record
    expect(mockPrisma.attendance.update).toHaveBeenCalledTimes(2);
  });

  it('plain CS bulk approve scope path is untouched (own ids only, no group lookup)', async () => {
    mockPrisma.attendance.findMany.mockResolvedValue([csRecord(CS_ASSIGNED_ID)]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      mockPrisma.attendance.update.mockResolvedValue({ id: attendanceId });
      return fn({ attendance: mockPrisma.attendance, auditLog: mockPrisma.auditLog });
    });

    const result = await service.bulkApprovePending([attendanceId], CS_ASSIGNED);

    expect(result.approvedCount).toBe(1);
    expect(mockPrisma.manageAssignment.findMany).not.toHaveBeenCalled();
  });

  it('ADMIN bulk approve keeps the unrestricted bypass (no scope lookup, no writes blocked)', async () => {
    mockPrisma.attendance.findMany.mockResolvedValue([{ ...csRecord(999), id: attendanceId }]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      mockPrisma.attendance.update.mockResolvedValue({ id: attendanceId });
      return fn({ attendance: mockPrisma.attendance, auditLog: mockPrisma.auditLog });
    });

    const result = await service.bulkApprovePending([attendanceId], ADMIN);

    expect(result.approvedCount).toBe(1);
    expect(mockPrisma.manageAssignment.findMany).not.toHaveBeenCalled();
  });
});
