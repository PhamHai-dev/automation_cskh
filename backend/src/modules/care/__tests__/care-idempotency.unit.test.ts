// C.6 idempotency + CareLog atomicity. Pure mock tests — no DB, no app.
// Lane 1 (service): updateEnrollmentCare derives a STABLE dedupe key for the
//   same enrollment+type+note (so a repeated save upserts one task) and a
//   DIFFERENT key for a genuinely different note (so it creates a new task).
// Lane 2 (repository): createCareTask routes through careTask.upsert keyed on
//   idempotency_key when a key is provided, and careTask.create otherwise;
//   upsertCareLogBySession wraps its findFirst→update/create in a Serializable
//   transaction (the schema has no unique constraint to upsert on).

jest.mock('../../../prisma/client', () => {
  const careTask = { upsert: jest.fn(), create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() };
  const careLog = { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() };
  const enrollment = { findFirst: jest.fn(), update: jest.fn() };
  const manageAssignment = { findMany: jest.fn() };
  const prisma: any = {
    careTask, careLog, enrollment, manageAssignment,
    $transaction: jest.fn(),
    auditLog: { create: jest.fn() },
  };
  return { prisma, PrismaClient: { TransactionIsolationLevel: { Serializable: 'Serializable' } } };
});

import { prisma } from '../../../prisma/client';
import { CareService } from '../care.service';
import { CareRepository } from '../care.repository';
import { CareTaskType, CareTaskPriority, CareLogOutcome } from '@prisma/client';

const mock = prisma as any;

describe('care note-task idempotency key (service)', () => {
  let service: CareService;
  let createCareTask: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    createCareTask = jest.fn().mockResolvedValue({ id: 1 });
    service = new CareService({
      findEnrollmentById: jest.fn().mockResolvedValue({ id: 55, cs_id: 7 }),
      createCareTask,
      updateEnrollmentCareFields: jest.fn().mockResolvedValue({ id: 55 }),
    } as any);
  });

  const actor = { userId: 1, roles: ['ADMIN'] } as const;

  it('same callback note produces the same dedupe key on repeated saves', async () => {
    await service.updateEnrollmentCare(55, { callback_note: 'Gọi lại buổi tối' }, actor.userId, [...actor.roles]);
    await service.updateEnrollmentCare(55, { callback_note: 'Gọi lại buổi tối' }, actor.userId, [...actor.roles]);

    expect(createCareTask).toHaveBeenCalledTimes(2);
    const [first, second] = createCareTask.mock.calls.map((c) => c[0]);
    expect(first.idempotency_key).toBeTruthy();
    expect(first.idempotency_key).toBe(second.idempotency_key);
    expect(first.type).toBe(CareTaskType.CALLBACK);
  });

  it('a different callback note yields a different key (new event => new task)', async () => {
    await service.updateEnrollmentCare(55, { callback_note: 'Nhắc A' }, 1, ['ADMIN']);
    await service.updateEnrollmentCare(55, { callback_note: 'Nhắc B' }, 1, ['ADMIN']);
    const keys = createCareTask.mock.calls.map((c) => c[0].idempotency_key);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('callback and hot-issue for the same note are distinct types/keys', async () => {
    await service.updateEnrollmentCare(55, { callback_note: 'X', hot_issue_note: 'X' }, 1, ['ADMIN']);
    const calls = createCareTask.mock.calls.map((c) => c[0]);
    const types = calls.map((c) => c.type).sort();
    expect(types).toEqual([CareTaskType.CALLBACK, CareTaskType.HOT_ISSUE].sort());
    expect(new Set(calls.map((c) => c.idempotency_key)).size).toBe(2);
  });
});

describe('careTask upsert on idempotency_key (repository)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses careTask.upsert keyed by idempotency_key when a key is provided', async () => {
    mock.careTask.upsert.mockResolvedValue({ id: 42 });
    const repo = new CareRepository(prisma);
    const out = await repo.createCareTask({
      enrollment_id: 55, assigned_to_id: 7, type: CareTaskType.CALLBACK,
      priority: CareTaskPriority.NORMAL, idempotency_key: 'auto-note:CALLBACK:55:abc',
    } as any);

    expect(out.id).toBe(42);
    expect(mock.careTask.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotency_key: 'auto-note:CALLBACK:55:abc' },
        create: expect.objectContaining({ idempotency_key: 'auto-note:CALLBACK:55:abc' }),
      }),
    );
    expect(mock.careTask.create).not.toHaveBeenCalled();
  });

  it('falls back to careTask.create when no key is supplied', async () => {
    mock.careTask.create.mockResolvedValue({ id: 43 });
    const repo = new CareRepository(prisma);
    await repo.createCareTask({
      enrollment_id: 55, assigned_to_id: 7, type: CareTaskType.HOT_ISSUE,
      priority: CareTaskPriority.HIGH,
    } as any);
    expect(mock.careTask.upsert).not.toHaveBeenCalled();
    expect(mock.careTask.create).toHaveBeenCalled();
  });
});

describe('upsertCareLogBySession Serializable transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mock.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  });

  it('creates a CareLog when none exists, wrapped in a Serializable transaction', async () => {
    mock.careLog.findFirst.mockResolvedValue(null);
    mock.careLog.create.mockResolvedValue({ id: 7 });
    const repo = new CareRepository(prisma);
    const out = await repo.upsertCareLogBySession({
      enrollment_id: 55, after_session_number: 10, content: 'ok',
      outcome: CareLogOutcome.POSITIVE, userId: 1, csId: 7,
    });

    expect(out.id).toBe(7);
    expect(mock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(mock.careLog.update).not.toHaveBeenCalled();
  });

  it('updates the existing CareLog for the same (enrollment, session_number)', async () => {
    mock.careLog.findFirst.mockResolvedValue({ id: 8 });
    mock.careLog.update.mockResolvedValue({ id: 8, content: 'new' });
    const repo = new CareRepository(prisma);
    const out = await repo.upsertCareLogBySession({
      enrollment_id: 55, after_session_number: 10, content: 'new', userId: 1, csId: 7,
    });
    expect(out.id).toBe(8);
    expect(mock.careLog.update).toHaveBeenCalled();
    expect(mock.careLog.create).not.toHaveBeenCalled();
  });
});
