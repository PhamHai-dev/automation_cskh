// C.6 slice: attendance write paths must refuse sessions whose class_session
// status is CANCELLED with a 409 AppError (markAttendance, bulkMarkAttendance,
// updateAttendance, resetAttendance). Pure mock tests — no DB, no app boot.
// The repository layer is mocked so these tests exercise only the service
// guards; a mocked automation-trigger keeps BullMQ out of the process.

jest.mock('../../../prisma/client', () => ({
  prisma: {
    enrollmentClass: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    classSession: {
      findFirst: jest.fn(),
    },
    classTeacher: {
      findFirst: jest.fn(),
      // D8: assertWriteScope now checks the assignment effective at the
      // session date via findMany + window predicate.
      findMany: jest.fn(),
    },
    attendance: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

// One shared methods object created inside the factory (avoids temporal-dead-zone
// references from the hoisted mock factory to top-level consts).
jest.mock('../attendance.repository', () => {
  const methods = {
    findBySession: jest.fn(),
    findById: jest.fn(),
    findByEnrollmentClassAndSession: jest.fn(),
    mark: jest.fn(),
    bulkMark: jest.fn(),
    update: jest.fn(),
    reset: jest.fn(),
  };
  return {
    AttendanceRepository: jest.fn().mockReturnValue(methods),
    __methods: methods,
  };
});

jest.mock('../../automation/automation-trigger.service', () => ({
  handleAttendanceEvent: jest.fn(),
  cancelPendingDeliveries: jest.fn(),
}));

import { prisma } from '../../../prisma/client';
import { handleAttendanceEvent, cancelPendingDeliveries } from '../../automation/automation-trigger.service';
import { AttendanceService } from '../attendance.service';
import { AppError } from '../../../middlewares/error.middleware';

const repo = (jest.requireMock('../attendance.repository') as any).__methods as {
  findBySession: jest.Mock;
  findById: jest.Mock;
  findByEnrollmentClassAndSession: jest.Mock;
  mark: jest.Mock;
  bulkMark: jest.Mock;
  update: jest.Mock;
  reset: jest.Mock;
};

const mockPrisma = prisma as unknown as {
  enrollmentClass: { findUnique: jest.Mock; findFirst: jest.Mock };
  classSession: { findFirst: jest.Mock };
  classTeacher: { findFirst: jest.Mock; findMany: jest.Mock };
  attendance: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
  auditLog: { create: jest.Mock };
};

const classId = 5;
const sessionId = 42;
const enrollmentClassId = 7;

const TEACHER = { id: 10, roles: ['TEACHER'] };

function sessionRow(status: string) {
  // session_date present because D8 scope evaluation reads it from the session.
  return { id: sessionId, class_id: classId, status, session_date: new Date('2026-06-15T00:00:00.000Z') };
}

let service: AttendanceService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new AttendanceService();
  mockPrisma.auditLog.create.mockResolvedValue({ id: 1 });
  // Downstream helpers must resolve: runAttendancePostCommit chains .catch() on them.
  (handleAttendanceEvent as jest.Mock).mockResolvedValue({});
  (cancelPendingDeliveries as jest.Mock).mockResolvedValue(0);
});

describe('markAttendance — CANCELLED session guard (C.6)', () => {
  it('throws 409 when the session is CANCELLED and never touches the repository', async () => {
    mockPrisma.enrollmentClass.findUnique.mockResolvedValue({ id: enrollmentClassId, class_id: classId });
    mockPrisma.classSession.findFirst.mockResolvedValue(sessionRow('CANCELLED'));

    const err = await service
      .markAttendance(
        classId,
        sessionId,
        { enrollment_class_id: enrollmentClassId, status: 'ATTENDED', side: 'TEACHER' },
        TEACHER
      )
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect(repo.findByEnrollmentClassAndSession).not.toHaveBeenCalled();
    expect(repo.mark).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('SCHEDULED session passes the guard and completes the mark', async () => {
    mockPrisma.enrollmentClass.findUnique.mockResolvedValue({ id: enrollmentClassId, class_id: classId });
    mockPrisma.classSession.findFirst.mockResolvedValue(sessionRow('SCHEDULED'));
    mockPrisma.classTeacher.findMany.mockResolvedValue([{ active: true, start_date: null, end_date: null }]); // D8: effective on session date
    repo.findByEnrollmentClassAndSession.mockResolvedValue(null); // fresh record -> CREATE audit
    const marked = { id: 55, reconciliation_state: 'PENDING_CS' };
    repo.mark.mockResolvedValue(marked);

    const result = await service.markAttendance(
      classId,
      sessionId,
      { enrollment_class_id: enrollmentClassId, status: 'ATTENDED', side: 'TEACHER', lesson_topic: 'Bài 3' },
      TEACHER
    );

    expect(result).toBe(marked);
    expect(repo.mark).toHaveBeenCalledWith(
      enrollmentClassId,
      sessionId,
      'ATTENDED',
      'MANUAL',
      TEACHER.id,
      'TEACHER',
      expect.objectContaining({ lesson_topic: 'Bài 3' })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CREATE', entity_type: 'Attendance' }),
      })
    );
  });

  it('missing session still yields 404 (guard order preserved: 404 before 409)', async () => {
    mockPrisma.enrollmentClass.findUnique.mockResolvedValue({ id: enrollmentClassId, class_id: classId });
    mockPrisma.classSession.findFirst.mockResolvedValue(null);

    await expect(
      service.markAttendance(
        classId,
        sessionId,
        { enrollment_class_id: enrollmentClassId, status: 'ATTENDED', side: 'TEACHER' },
        TEACHER
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.mark).not.toHaveBeenCalled();
  });
});

describe('bulkMarkAttendance — CANCELLED session guard (C.6)', () => {
  it('throws 409 on a CANCELLED session before validating any item', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(sessionRow('CANCELLED'));

    const err = await service
      .bulkMarkAttendance(
        classId,
        sessionId,
        { items: [{ enrollment_class_id: enrollmentClassId, status: 'ATTENDED' }], side: 'TEACHER' },
        TEACHER
      )
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    // Guard runs before the per-item enrollment lookups and the bulk write.
    expect(mockPrisma.enrollmentClass.findUnique).not.toHaveBeenCalled();
    expect(repo.bulkMark).not.toHaveBeenCalled();
  });

  it('SCHEDULED session passes the guard and bulk-marks', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(sessionRow('SCHEDULED'));
    mockPrisma.enrollmentClass.findUnique.mockResolvedValue({ id: enrollmentClassId, class_id: classId });
    mockPrisma.classTeacher.findMany.mockResolvedValue([{ active: true, start_date: null, end_date: null }]);
    const results = [{ id: 61, reconciliation_state: 'PENDING_CS' }];
    repo.bulkMark.mockResolvedValue(results);

    const out = await service.bulkMarkAttendance(
      classId,
      sessionId,
      { items: [{ enrollment_class_id: enrollmentClassId, status: 'ATTENDED' }], side: 'TEACHER' },
      TEACHER
    );

    expect(out).toBe(results);
    expect(repo.bulkMark).toHaveBeenCalledTimes(1);
  });
});

describe('updateAttendance / resetAttendance — CANCELLED session guard (C.6)', () => {
  const cancelledRecord = {
    id: 70,
    enrollment_class_id: enrollmentClassId,
    class_session_id: sessionId,
    class_session: { id: sessionId, class_id: classId, status: 'CANCELLED' },
  };

  it('updateAttendance throws 409 when before.class_session.status is CANCELLED', async () => {
    repo.findById.mockResolvedValue(cancelledRecord);

    const err = await service
      .updateAttendance(70, { status: 'LEAVE_B', side: 'TEACHER' }, TEACHER, classId, sessionId)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect(repo.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('resetAttendance throws 409 when before.class_session.status is CANCELLED', async () => {
    repo.findById.mockResolvedValue(cancelledRecord);

    const err = await service.resetAttendance(70, TEACHER, 'TEACHER', classId, sessionId).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect(repo.reset).not.toHaveBeenCalled();
  });

  it('updateAttendance proceeds for a non-cancelled session (guard is status-specific)', async () => {
    repo.findById.mockResolvedValue({
      ...cancelledRecord,
      class_session: { id: sessionId, class_id: classId, status: 'SCHEDULED', session_date: new Date('2026-06-15T00:00:00.000Z') },
    });
    mockPrisma.classTeacher.findMany.mockResolvedValue([{ active: true, start_date: null, end_date: null }]);
    const updated = { id: 70, reconciliation_state: 'PENDING_CS' };
    repo.update.mockResolvedValue(updated);

    const result = await service.updateAttendance(70, { status: 'LEAVE_B', side: 'TEACHER' }, TEACHER, classId, sessionId);

    expect(result).toBe(updated);
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it('missing attendance record keeps its 404 (guard order: 404 before 409)', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      service.updateAttendance(999, { status: 'LEAVE_B', side: 'TEACHER' }, TEACHER)
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.resetAttendance(999, TEACHER, 'TEACHER')).rejects.toMatchObject({ status: 404 });
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.reset).not.toHaveBeenCalled();
  });
});
