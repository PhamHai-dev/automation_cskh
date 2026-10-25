import { ClassSessionsRepository } from '../class-sessions.repository';
import { ClassSessionsService } from '../class-sessions.service';
import { createActualClassSessionSchema } from '../class-sessions.schema';
import { prisma } from '../../../prisma/client';

jest.mock('../../../prisma/client', () => ({ prisma: {
  $transaction: jest.fn(),
  class: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  teacher: { findFirst: jest.fn() },
  classTeacher: { findMany: jest.fn() },
  classSession: { findMany: jest.fn() },
} }));

// No app, Prisma client connection, or database is started: all persistence is mocked.
describe('teacher actual-session create', () => {
  const request = {
    idempotency_key: 'intent-first-123',
    enrollment_class_id: 7,
    session_date: '2026-10-24',
    teacher_id: 10,
    status: 'COMPLETED' as const,
  };
  let tx: any;
  let sessions: any[];
  let markers: any[];

  beforeEach(() => {
    sessions = [];
    markers = [];
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 5 }]),
      auditLog: {
        findFirst: jest.fn(async ({ where }: any) => markers.find((m) => m.entity_id === where.entity_id) || null),
        create: jest.fn(async ({ data }: any) => { markers.push(data); return data; }),
      },
      enrollmentClass: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      classSession: {
        findFirst: jest.fn(async ({ where, orderBy }: any) => orderBy
          ? sessions.at(-1) || null
          : sessions.find((s) => s.id === where.id && s.class_id === where.class_id) || null),
        create: jest.fn(async ({ data }: any) => {
          const row = { ...data, id: sessions.length + 1,
            attendance: data.attendance ? [{ ...data.attendance.create, id: sessions.length + 101, class_session_id: sessions.length + 1 }] : [] };
          sessions.push(row);
          return row;
        }),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation((callback: any) => callback(tx));
    (prisma.class.findUnique as jest.Mock).mockResolvedValue({ id: 5 });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 10, roles: ['TEACHER'] });
    (prisma.teacher.findFirst as jest.Mock).mockResolvedValue({ id: 11 });
    (prisma.classTeacher.findMany as jest.Mock).mockResolvedValue([{ class_id: 5 }]);
    (prisma.classSession.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('same-key network retry returns exactly one session and one attendance skeleton', async () => {
    const repo = new ClassSessionsRepository();
    const first = await repo.createIdempotent(5, request, 10);
    const replay = await repo.createIdempotent(5, { ...request }, 10);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.session.id).toBe(first.session.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].attendance).toHaveLength(1);
    expect(tx.classSession.create).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(markers).toHaveLength(1);
  });

  it('distinct intent keys allow two deliberate same-day sessions for the same student', async () => {
    const repo = new ClassSessionsRepository();
    await repo.createIdempotent(5, request, 10);
    await repo.createIdempotent(5, { ...request, idempotency_key: 'intent-second-456' }, 10);
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.session_number)).toEqual([1, 2]);
    expect(sessions[0].session_date).toEqual(sessions[1].session_date);
    expect(sessions.flatMap((s) => s.attendance)).toHaveLength(2);
  });

  it('rejects a reused key with a different request instead of silently duplicating', async () => {
    const repo = new ClassSessionsRepository();
    await repo.createIdempotent(5, request, 10);
    await expect(repo.createIdempotent(5, { ...request, session_date: '2026-10-25' }, 10)).rejects.toMatchObject({ status: 409 });
    expect(sessions).toHaveLength(1);
  });

  it('does not resurrect a deleted session on retry', async () => {
    const repo = new ClassSessionsRepository();
    await repo.createIdempotent(5, request, 10);
    sessions.length = 0;
    await expect(repo.createIdempotent(5, request, 10)).rejects.toMatchObject({ status: 409 });
    expect(tx.classSession.create).toHaveBeenCalledTimes(1);
  });

  it('keeps both opinions on one skeleton, without claiming either opinion before marking', async () => {
    await new ClassSessionsRepository().createIdempotent(5, request, 10);
    const attendance = sessions[0].attendance[0];
    expect(attendance.teacher_status).toBeNull();
    expect(attendance.cs_status).toBeNull();
    expect(attendance.reconciliation_state).toBe('PENDING_TEACHER');
  });

  it('teacher without access to this class receives 403 before any create', async () => {
    (prisma.classTeacher.findMany as jest.Mock).mockResolvedValue([]);
    await expect(new ClassSessionsService().createActualSession(5, request, 10)).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('assigned teacher can create without any pre-existing session', async () => {
    const result = await new ClassSessionsService().createActualSession(5, request, 10);
    expect(result.session.id).toBe(1);
    expect(result.session.status).toBe('COMPLETED');
    expect(sessions).toHaveLength(1);
  });

  it('requires an explicit client intent key for the actual endpoint', () => {
    const { idempotency_key, ...withoutKey } = request;
    expect(createActualClassSessionSchema.safeParse({ body: withoutKey }).success).toBe(false);
    expect(createActualClassSessionSchema.safeParse({ body: request }).success).toBe(true);
  });

  it('rejects malformed calendar dates and inverted time ranges', () => {
    expect(createActualClassSessionSchema.safeParse({ body: { ...request, session_date: '24/10/2026' } }).success).toBe(false);
    expect(createActualClassSessionSchema.safeParse({ body: { ...request, session_date: 'not-a-date' } }).success).toBe(false);
    expect(createActualClassSessionSchema.safeParse({ body: { ...request, session_date: '2026-02-30' } }).success).toBe(false);
    expect(createActualClassSessionSchema.safeParse({ body: { ...request, start_time: '25:00' } }).success).toBe(false);
    expect(createActualClassSessionSchema.safeParse({ body: { ...request, start_time: '19:00', end_time: '18:30' } }).success).toBe(false);
    expect(createActualClassSessionSchema.safeParse({ body: { ...request, start_time: '19:00', end_time: '19:30' } }).success).toBe(true);
  });

  it('blocks an admin/manage account from the teacher-only flow (no impersonation)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 1, roles: ['ADMIN', 'MANAGE'] });
    await expect(new ClassSessionsService().createActualSession(5, request, 1)).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks a teacher from creating a session attributed to another teacher account', async () => {
    await expect(new ClassSessionsService().createActualSession(5, { ...request, teacher_id: 99 }, 10)).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
