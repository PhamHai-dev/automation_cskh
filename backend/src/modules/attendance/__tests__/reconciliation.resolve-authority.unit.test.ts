// D2 (owner-confirmed authority): conflict resolution belongs to ADMIN only.
// MANAGE keeps group-management scope but NOT Admin-equivalent resolution
// authority; CS must not self-resolve. These are pure mock tests — no DB, no
// automation, no app boot — asserting the service-level guard plus the
// preserved cs-mark CS scope and CONFLICT precondition/audit semantics.

jest.mock('../../../prisma/client', () => ({
  prisma: {
    attendance: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    classTeacher: {
      findFirst: jest.fn(),
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
import { cancelPendingDeliveries, handleAttendanceEvent } from '../../automation/automation-trigger.service';
import { ReconciliationService } from '../reconciliation.service';
import { AppError } from '../../../middlewares/error.middleware';

const mockPrisma = prisma as unknown as {
  attendance: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
  auditLog: { create: jest.Mock };
};
const mockCancel = cancelPendingDeliveries as jest.Mock;
const mockTrigger = handleAttendanceEvent as jest.Mock;

const ADMIN = { id: 1, roles: ['ADMIN'] };
const MANAGE = { id: 2, roles: ['MANAGE'] };
const CS_ASSIGNED = { id: 3, roles: ['CS'] };
const enrollmentCsId = CS_ASSIGNED.id;

const conflictRecord = {
  id: 100,
  reconciliation_state: ReconciliationState.CONFLICT,
  teacher_status: AttendanceStatus.ATTENDED,
  cs_status: AttendanceStatus.ABSENT_UNAPPROVED_C,
  status: AttendanceStatus.ATTENDED,
  enrollment_class: { enrollment: { cs_id: enrollmentCsId } },
};

const resolveDTO = {
  finalStatus: AttendanceStatus.ABSENT_APPROVED_A,
  resolutionNote: 'Học viên xin phép qua Zalo trước giờ học',
};

let service: ReconciliationService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new ReconciliationService();
});

describe('resolveConflict — ADMIN-only authority (D2)', () => {
  it('rejects MANAGE with 403 even for group-scoped records (no Admin-equivalent resolution)', async () => {
    await expect(
      service.resolveConflict(conflictRecord.id, resolveDTO, MANAGE)
    ).rejects.toMatchObject({ status: 403 });

    // Fail closed before any read/write: MANAGE must not even reach the record.
    expect(mockPrisma.attendance.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('rejects the assigned CS self-resolving its own conflict with 403', async () => {
    // Under the old rules this call would have passed assertCSScope (cs_id ===
    // actor.id). The CS must instead re-mark via cs-mark.
    mockPrisma.attendance.findUnique.mockResolvedValue(conflictRecord);

    await expect(
      service.resolveConflict(conflictRecord.id, resolveDTO, CS_ASSIGNED)
    ).rejects.toMatchObject({ status: 403 });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('accepts ADMIN: CONFLICT precondition, RESOLVED write, before/after audit, downstream preserved', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(conflictRecord);
    const updated = {
      ...conflictRecord,
      status: resolveDTO.finalStatus,
      reconciliation_state: ReconciliationState.RESOLVED,
      resolved_by_id: ADMIN.id,
      resolution_note: resolveDTO.resolutionNote,
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      mockPrisma.attendance.update.mockResolvedValue(updated);
      return fn({
        attendance: mockPrisma.attendance,
        auditLog: mockPrisma.auditLog,
      });
    });
    mockCancel.mockResolvedValue(0);
    mockTrigger.mockResolvedValue({});

    const result = await service.resolveConflict(conflictRecord.id, resolveDTO, ADMIN);

    expect(result.reconciliation_state).toBe(ReconciliationState.RESOLVED);
    expect(mockPrisma.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: conflictRecord.id },
        data: expect.objectContaining({
          status: resolveDTO.finalStatus,
          reconciliation_state: ReconciliationState.RESOLVED,
          resolved_by_id: ADMIN.id,
        }),
      })
    );

    // Before/after audit preserved for the resolve.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: ADMIN.id,
          action: 'ATTENDANCE_CONFLICT_RESOLVED',
          entity_type: 'Attendance',
          entity_id: String(conflictRecord.id),
          before_data: expect.objectContaining({ reconciliation_state: ReconciliationState.CONFLICT }),
          after_data: expect.objectContaining({ reconciliation_state: ReconciliationState.RESOLVED }),
        }),
      })
    );

    // Preserve existing downstream semantics: cancellation is NOT swallowed
    // (awaited directly) and the FINAL trigger runs via runAttendancePostCommit.
    expect(mockCancel).toHaveBeenCalledWith(conflictRecord.id);
    expect(mockTrigger).toHaveBeenCalledWith(conflictRecord.id);
  });

  it('ADMIN still gets 409 when the record is not in CONFLICT state', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue({
      ...conflictRecord,
      reconciliation_state: ReconciliationState.PENDING_CS,
    });

    await expect(
      service.resolveConflict(conflictRecord.id, resolveDTO, ADMIN)
    ).rejects.toMatchObject({ status: 409 });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('ADMIN gets 404 for a missing record', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(null);
    await expect(
      service.resolveConflict(999, resolveDTO, ADMIN)
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('markByCS — CS scope unchanged (opinions stay columns on Attendance)', () => {
  it('assigned CS can still cs-mark a conflicted record (sets cs_status column, re-derives state)', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue({
      ...conflictRecord,
      teacher_status: AttendanceStatus.ATTENDED,
    });
    // CS marks identical to teacher -> MATCHED path exercises the write fully.
    const updated = {
      ...conflictRecord,
      cs_status: AttendanceStatus.ATTENDED,
      reconciliation_state: ReconciliationState.MATCHED,
      status: AttendanceStatus.ATTENDED,
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      mockPrisma.attendance.update.mockResolvedValue(updated);
      return fn({ attendance: mockPrisma.attendance, auditLog: mockPrisma.auditLog });
    });
    mockTrigger.mockResolvedValue({});

    const result = await service.markByCS(conflictRecord.id, { status: AttendanceStatus.ATTENDED }, CS_ASSIGNED);

    expect(result.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(mockPrisma.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: conflictRecord.id },
        data: expect.objectContaining({ cs_status: AttendanceStatus.ATTENDED }),
      })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ATTENDANCE_CS_MARK', user_id: CS_ASSIGNED.id }),
      })
    );
  });

  it('unassigned CS is rejected with 403 on cs-mark (assertCSScope preserved exactly)', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(conflictRecord);
    const otherCs = { id: 77, roles: ['CS'] };

    const err = await service
      .markByCS(conflictRecord.id, { status: AttendanceStatus.ABSENT_APPROVED_A }, otherCs)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
