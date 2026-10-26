// D8 owner ruling (A) 2026-10-26 — privileged assist-mark branch of
// reconciliation.service.markByTeacher enforces TWO INDEPENDENT conditions:
//   1. Operator assist authority = existing isPrivileged (ADMIN/MANAGE policy;
//      D8 grants no assist rights by itself — MANAGE is neither widened nor
//      narrowed here).
//   2. The RECORDED teacher (data.teacherId) was validly assigned to the class
//      AT THE SESSION DATE, per the D8 window rule (findEffectiveAssignment),
//      with the teacher ACCOUNT still usable (teacher { active: true }).
// The 2026-10-26 strict boundary: active=false requires an EXPLICIT end_date;
// `start_date` set + `end_date` null does NOT authorize (no inferred /
// unbounded post-departure authority).
//
// Pure mock tests — no DB, no app boot; automation-trigger mocked so no
// BullMQ. Mock shape reused from reconciliation-cancelled-session.unit.test.ts.

jest.mock('../../../prisma/client', () => ({
  prisma: {
    attendance: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    classTeacher: {
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
  classTeacher: { findMany: jest.Mock };
  $transaction: jest.Mock;
  auditLog: { create: jest.Mock };
};

const attendanceId = 100;
const TEACHER_USER_ID = 10;
const ADMIN = { id: 1, roles: ['ADMIN'] };
const MANAGE = { id: 2, roles: ['MANAGE'] };
const TEACHER = { id: TEACHER_USER_ID, roles: ['TEACHER'] };
const CS_ASSIGNED = { id: 3, roles: ['CS'] };

function teacherRecord() {
  return {
    id: attendanceId,
    teacher_status: null,
    cs_status: null,
    source: 'MANUAL',
    class_session: { class_id: 5, status: 'SCHEDULED', session_date: new Date('2026-06-15T00:00:00.000Z') },
    enrollment_class: { enrollment: { cs_id: CS_ASSIGNED.id } },
  };
}

function mockSuccessfulWrite() {
  const updated = {
    ...teacherRecord(),
    teacher_status: AttendanceStatus.ATTENDED,
    reconciliation_state: ReconciliationState.PENDING_CS,
  };
  mockPrisma.$transaction.mockImplementation(async (fn: any) => {
    mockPrisma.attendance.update.mockResolvedValue(updated);
    return fn({ attendance: mockPrisma.attendance, auditLog: mockPrisma.auditLog });
  });
}

let service: ReconciliationService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new ReconciliationService();
  (handleAttendanceEvent as jest.Mock).mockResolvedValue({});
  (cancelPendingDeliveries as jest.Mock).mockResolvedValue(0);
  mockPrisma.attendance.findUnique.mockResolvedValue(teacherRecord());
});

describe('markByTeacher — privileged assist condition 2: assignment effective AT the session date', () => {
  it('ACTIVE assignment whose window covers the session date -> 200 (and queries candidates with NO active filter, teacher account still required active)', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { active: true, start_date: new Date('2026-06-01T00:00:00.000Z'), end_date: new Date('2026-06-30T00:00:00.000Z') },
    ]);
    mockSuccessfulWrite();

    const result = await service.markByTeacher(
      attendanceId,
      { status: AttendanceStatus.ATTENDED, teacherId: TEACHER_USER_ID },
      ADMIN
    );

    expect(result.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    expect(mockPrisma.classTeacher.findMany).toHaveBeenCalledWith({
      where: { class_id: 5, teacher: { active: true, user_id: TEACHER_USER_ID } },
      select: { active: true, start_date: true, end_date: true },
    });
  });

  it('INACTIVE assignment revoked AFTER the session date (explicit end_date covering it) -> assist allowed (D8 case #14 on the assist path)', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { active: false, start_date: new Date('2026-01-01T00:00:00.000Z'), end_date: new Date('2026-06-30T00:00:00.000Z') },
    ]);
    mockSuccessfulWrite();

    const result = await service.markByTeacher(
      attendanceId,
      { status: AttendanceStatus.ATTENDED, teacherId: TEACHER_USER_ID },
      ADMIN
    );

    expect(result.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
  });

  it('INACTIVE assignment with start_date but NO explicit end_date -> 403 (strict 2026-10-26 boundary: no unbounded post-departure authority)', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { active: false, start_date: new Date('2026-01-01T00:00:00.000Z'), end_date: null },
    ]);

    const err = await service
      .markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED, teacherId: TEACHER_USER_ID }, ADMIN)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe('Giáo viên được chọn không phụ trách lớp này tại ngày dạy của buổi học');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('INACTIVE window-less row (start_date and end_date both null) -> 403 (ambiguous removal boundary)', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { active: false, start_date: null, end_date: null },
    ]);

    await expect(
      service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED, teacherId: TEACHER_USER_ID }, ADMIN)
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('ACTIVE row whose window ENDED before the session date -> 403 (condition 2 is session-date based, not the old blind active:true lookup)', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { active: true, start_date: new Date('2026-01-01T00:00:00.000Z'), end_date: new Date('2026-05-31T00:00:00.000Z') },
    ]);

    await expect(
      service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED, teacherId: TEACHER_USER_ID }, ADMIN)
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('no candidate rows at all (unknown/inactive teacher account also lands here — teacher.active filter kept) -> 403', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([]);

    await expect(
      service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED, teacherId: TEACHER_USER_ID }, ADMIN)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('missing teacherId still 400 before any lookup', async () => {
    await expect(
      service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, ADMIN)
    ).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.classTeacher.findMany).not.toHaveBeenCalled();
  });
});

describe('markByTeacher — privileged assist condition 1: operator authority is unchanged policy', () => {
  it('MANAGE keeps assist authority exactly as before (isPrivileged unchanged — D8 grants none, revokes none)', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { active: false, start_date: new Date('2026-01-01T00:00:00.000Z'), end_date: new Date('2026-12-31T00:00:00.000Z') },
    ]);
    mockSuccessfulWrite();

    const result = await service.markByTeacher(
      attendanceId,
      { status: AttendanceStatus.ATTENDED, teacherId: TEACHER_USER_ID },
      MANAGE
    );

    expect(result.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
  });
});

describe('markByTeacher — non-privileged path unchanged', () => {
  it('CS actor is not privileged and cannot assist another teacher (403 before any classTeacher lookup)', async () => {
    const err = await service
      .markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED, teacherId: TEACHER_USER_ID }, CS_ASSIGNED)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe('Bạn không được điểm danh thay giáo viên khác');
    expect(mockPrisma.classTeacher.findMany).not.toHaveBeenCalled();
  });

  it('TEACHER self-mark still routes through assertTeacherScope (window rule for actor.id), not the assist branch', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { active: false, start_date: new Date('2026-01-01T00:00:00.000Z'), end_date: new Date('2026-06-30T00:00:00.000Z') },
    ]);
    mockSuccessfulWrite();

    const result = await service.markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, TEACHER);

    expect(result.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    // assertTeacherScope selects candidates for the actor's own user id.
    expect(mockPrisma.classTeacher.findMany).toHaveBeenCalledWith({
      where: { class_id: 5, teacher: { user_id: TEACHER.id } },
      select: { active: true, start_date: true, end_date: true },
    });
  });
});
