// Owner ruling 2026-10-26 — privileged assist-mark branch of
// reconciliation.service.markByTeacher enforces TWO INDEPENDENT conditions:
//   1. Operator assist authority = ADMIN ONLY (isAssistMarkPrivileged /
//      assertAssistMarkAuthority). MANAGE is NOT allowed to assist-mark for a
//      teacher; MANAGE continues to record CVHT opinions within its assigned
//      group via markByCS / bulkApprovePending. Assist authority is a separate
//      gate from conflict resolution (assertAdminResolver).
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
  attendance: { findUnique: jest.Mock; update: jest.Mock };
  classTeacher: { findMany: jest.Mock };
  manageAssignment: { findMany: jest.Mock };
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

describe('markByTeacher — condition 1 (owner ruling 2026-10-26): assist authority is ADMIN only, per thao tác', () => {
  it('(a) ADMIN keeps assist-mark authority: D8-valid target teacher -> write succeeds', async () => {
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
    expect(mockPrisma.classTeacher.findMany).toHaveBeenCalled();
  });

  it('(b) MANAGE assist-mark with teacherId -> 403 on the NEW authority gate even when the target teacher is perfectly D8-valid (proves authority gate, not the window)', async () => {
    // A fully valid window is staged so a window failure is impossible; the
    // 403 below can therefore only come from the ADMIN-only assist gate.
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { active: true, start_date: new Date('2026-06-01T00:00:00.000Z'), end_date: new Date('2026-06-30T00:00:00.000Z') },
    ]);

    const err = await service
      .markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED, teacherId: TEACHER_USER_ID }, MANAGE)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe(
      'Chỉ Admin mới được điểm danh hộ giáo viên; MANAGE vui lòng ghi ý kiến CVHT trong nhóm phụ trách'
    );
    // Authority is evaluated BEFORE any D8 candidate lookup and before any write.
    expect(mockPrisma.classTeacher.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('(b2) MANAGE teacher-mark without teacherId also hits the authority 403 (no assist path for MANAGE at all; replaces the old 400 "chọn giáo viên")', async () => {
    const err = await service
      .markByTeacher(attendanceId, { status: AttendanceStatus.ATTENDED }, MANAGE)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe(
      'Chỉ Admin mới được điểm danh hộ giáo viên; MANAGE vui lòng ghi ý kiến CVHT trong nhóm phụ trách'
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('(c) MANAGE cs-mark stays allowed group-scoped (ruling keeps CVHT opinions in the assigned group — NOT weakened by the assist gate)', async () => {
    // resolveManageScope: MANAGE's group contains CS_ASSIGNED (the record's cs_id).
    mockPrisma.manageAssignment.findMany.mockResolvedValue([
      { cs_group: { members: [{ user_id: CS_ASSIGNED.id }] } },
    ]);
    mockSuccessfulWrite();

    const result = await service.markByCS(
      attendanceId,
      { status: AttendanceStatus.ATTENDED, note: 'Ý kiến CVHT' },
      MANAGE
    );

    expect(result).toBeDefined();
    expect(mockPrisma.manageAssignment.findMany).toHaveBeenCalledWith({
      where: { manage_user_id: MANAGE.id },
      include: { cs_group: { include: { members: true } } },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('(c2) MANAGE cs-mark outside its group stays 403 (group scope pinned alongside the allow case)', async () => {
    mockPrisma.manageAssignment.findMany.mockResolvedValue([
      { cs_group: { members: [{ user_id: 99 }] } },
    ]);

    const err = await service
      .markByCS(attendanceId, { status: AttendanceStatus.ATTENDED }, MANAGE)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe('Bạn không phụ trách học viên này');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('(d) MANAGE resolve-conflict stays 403 (separate ADMIN-only adjudication authority, unchanged by this ruling)', async () => {
    const err = await service
      .resolveConflict(
        attendanceId,
        { finalStatus: AttendanceStatus.ATTENDED, resolutionNote: 'MANAGE tự phân xử' },
        MANAGE
      )
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe('Chỉ ADMIN được phân xử xung đột điểm danh');
    expect(mockPrisma.attendance.findUnique).not.toHaveBeenCalled();
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
