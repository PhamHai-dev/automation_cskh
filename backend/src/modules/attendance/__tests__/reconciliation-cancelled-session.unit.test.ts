// C.6 slice: reconciliation markByTeacher / markByCS must refuse attendances
// whose linked class_session is CANCELLED with a 409 AppError, checked right
// after the record load and BEFORE role/scope checks (a CANCELLED session
// reports 409 even for an unassigned teacher/CS). Pure mock tests — no DB,
// no app boot; automation-trigger mocked so no BullMQ.

jest.mock('../../../prisma/client', () => ({
  prisma: {
    attendance: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    classTeacher: {
      findFirst: jest.fn(),
      // D8: assertTeacherScope now evaluates the assignment window effective
      // at the session date via findMany.
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
  attendance: { findUnique: jest.Mock; update: jest.Mock };
  classTeacher: { findFirst: jest.Mock; findMany: jest.Mock };
  $transaction: jest.Mock;
  auditLog: { create: jest.Mock };
};

const attendanceId = 100;
const TEACHER = { id: 10, roles: ['TEACHER'] };
const CS_ASSIGNED = { id: 3, roles: ['CS'] };

function teacherRecord(sessionStatus: string) {
  return {
    id: attendanceId,
    teacher_status: null,
    cs_status: null,
    source: 'MANUAL',
    class_session: { class_id: 5, status: sessionStatus, session_date: new Date('2026-06-15T00:00:00.000Z') },
    enrollment_class: { enrollment: { cs_id: CS_ASSIGNED.id } },
  };
}

function csRecord(sessionStatus: string) {
  return {
    id: attendanceId,
    teacher_status: AttendanceStatus.ATTENDED,
    cs_status: null,
    class_session: { status: sessionStatus },
    enrollment_class: { enrollment: { cs_id: CS_ASSIGNED.id } },
  };
}

let service: ReconciliationService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new ReconciliationService();
  // Downstream helpers must resolve: runAttendancePostCommit chains .catch() on them.
  (handleAttendanceEvent as jest.Mock).mockResolvedValue({});
  (cancelPendingDeliveries as jest.Mock).mockResolvedValue(0);
});

describe('markByTeacher — CANCELLED session guard (C.6)', () => {
  it('throws 409 on a CANCELLED session before any scope check or write', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(teacherRecord('CANCELLED'));

    const err = await service
      .markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, TEACHER)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    // Guard precedes assertTeacherScope and the transactional write.
    expect(mockPrisma.classTeacher.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('reports 409 (not 403) for an unassigned teacher — session-cancelled wins over scope', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(teacherRecord('CANCELLED'));
    const outsider = { id: 99, roles: ['TEACHER'] };

    await expect(
      service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, outsider)
    ).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.classTeacher.findFirst).not.toHaveBeenCalled();
  });

  it('SCHEDULED session passes the guard and the mark completes', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(teacherRecord('SCHEDULED'));
    mockPrisma.classTeacher.findMany.mockResolvedValue([{ active: true, start_date: null, end_date: null }]); // D8: effective at session date
    const updated = {
      ...teacherRecord('SCHEDULED'),
      teacher_status: AttendanceStatus.ATTENDED,
      reconciliation_state: ReconciliationState.PENDING_CS,
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      mockPrisma.attendance.update.mockResolvedValue(updated);
      return fn({ attendance: mockPrisma.attendance, auditLog: mockPrisma.auditLog });
    });

    const result = await service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, TEACHER);

    expect(result.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    expect(mockPrisma.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: attendanceId },
        data: expect.objectContaining({ teacher_status: AttendanceStatus.ATTENDED }),
      })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ATTENDANCE_TEACHER_MARK', entity_type: 'Attendance' }),
      })
    );
  });

  it('missing record keeps 404 (guard order: 404 before 409)', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(null);
    await expect(
      service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, TEACHER)
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('markByTeacher — D8 inactive assignment within window (owner verdict 2026-10-26)', () => {
  it('queries classTeacher with NO active filter and allows active=false when the window covers session_date', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(teacherRecord('SCHEDULED'));
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      {
        active: false,
        start_date: new Date('2026-06-01T00:00:00.000Z'),
        end_date: new Date('2026-06-30T00:00:00.000Z'),
      },
    ]); // revoked AFTER the session date, window still covers it -> authorized
    const updated = {
      ...teacherRecord('SCHEDULED'),
      teacher_status: AttendanceStatus.ATTENDED,
      reconciliation_state: ReconciliationState.PENDING_CS,
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      mockPrisma.attendance.update.mockResolvedValue(updated);
      return fn({ attendance: mockPrisma.attendance, auditLog: mockPrisma.auditLog });
    });

    const result = await service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, TEACHER);

    expect(result.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    expect(mockPrisma.classTeacher.findMany).toHaveBeenCalledWith({
      where: { class_id: 5, teacher: { user_id: TEACHER.id } },
      select: { active: true, start_date: true, end_date: true },
    });
  });

  it('403 when active=false carries no window data (ambiguous removal boundary)', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(teacherRecord('SCHEDULED'));
    mockPrisma.classTeacher.findMany.mockResolvedValue([{ active: false, start_date: null, end_date: null }]);

    const err = await service
      .markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, TEACHER)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('403 when the only inactive rows have windows that exclude session_date', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(teacherRecord('SCHEDULED'));
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { active: false, start_date: null, end_date: new Date('2026-05-31T00:00:00.000Z') },
      { active: false, start_date: new Date('2026-07-01T00:00:00.000Z'), end_date: null },
    ]);

    await expect(
      service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, TEACHER)
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('markByCS — CANCELLED session guard (C.6)', () => {
  it('throws 409 on a CANCELLED session before CS scope or write', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(csRecord('CANCELLED'));

    const err = await service
      .markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, CS_ASSIGNED)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('reports 409 (not 403) for an unassigned CS — session-cancelled wins over scope', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(csRecord('CANCELLED'));
    const otherCs = { id: 77, roles: ['CS'] };

    await expect(
      service.markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, otherCs)
    ).rejects.toMatchObject({ status: 409 });
  });

  it('SCHEDULED session passes the guard and the CS mark completes', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(csRecord('SCHEDULED'));
    const updated = {
      ...csRecord('SCHEDULED'),
      cs_status: AttendanceStatus.ATTENDED,
      reconciliation_state: ReconciliationState.MATCHED,
      status: AttendanceStatus.ATTENDED,
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      mockPrisma.attendance.update.mockResolvedValue(updated);
      return fn({ attendance: mockPrisma.attendance, auditLog: mockPrisma.auditLog });
    });

    const result = await service.markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, CS_ASSIGNED);

    expect(result.reconciliation_state).toBe(ReconciliationState.MATCHED);
    expect(mockPrisma.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: attendanceId },
        data: expect.objectContaining({ cs_status: AttendanceStatus.ATTENDED }),
      })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ATTENDANCE_CS_MARK', user_id: CS_ASSIGNED.id }),
      })
    );
  });

  it('missing record keeps 404 (guard order: 404 before 409)', async () => {
    mockPrisma.attendance.findUnique.mockResolvedValue(null);
    await expect(
      service.markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, CS_ASSIGNED)
    ).rejects.toMatchObject({ status: 404 });
  });
});
