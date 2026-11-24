import { ClassSessionType } from '@prisma/client';
import { prisma } from '../../../prisma/client';
import { ClassSessionsRepository } from '../class-sessions.repository';
import { ClassSessionsService } from '../class-sessions.service';

const admin = { id: 1, roles: ['ADMIN'] };
const manager = { id: 2, roles: ['MANAGE'] };
const cs = { id: 3, roles: ['CS'] };
const teacher = { id: 4, roles: ['TEACHER'] };

const createInput = {
  session_date: '2026-11-24',
  session_type: ClassSessionType.TEST,
  session_title: 'KT 1',
};

describe('ClassSessionsService JLPT metadata permissions', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([cs, teacher])('blocks CS/TEACHER metadata on generic create %#', async (actor) => {
    const createSpy = jest.spyOn(ClassSessionsRepository.prototype, 'create');
    await expect(new ClassSessionsService().createSession(10, createInput, actor))
      .rejects.toMatchObject({ status: 403 });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it.each([admin, manager])('allows ADMIN/MANAGE metadata on generic create %#', async (actor) => {
    jest.spyOn(ClassSessionsRepository.prototype, 'findByClassAndNumber').mockResolvedValue(null);
    jest.spyOn(ClassSessionsRepository.prototype, 'findTestByTitle').mockResolvedValue(null);
    jest.spyOn(prisma.class, 'findUnique').mockResolvedValue({ id: 10 } as any);
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
    const createSpy = jest.spyOn(ClassSessionsRepository.prototype, 'create').mockResolvedValue({ id: 20 } as any);
    await expect(new ClassSessionsService().createSession(10, createInput, actor)).resolves.toEqual({ id: 20 });
    expect(createSpy).toHaveBeenCalledWith(10, createInput, actor.id);
  });

  it('keeps existing non-metadata update permission for an in-scope teacher', async () => {
    jest.spyOn(ClassSessionsRepository.prototype, 'findById').mockResolvedValue({
      id: 20,
      class_id: 10,
      session_number: 1,
      session_type: ClassSessionType.LESSON,
      session_title: null,
      attendance: [],
      jlpt_learning_records: [],
    } as any);
    const updateSpy = jest.spyOn(ClassSessionsRepository.prototype, 'update').mockResolvedValue({ id: 20 } as any);
    await expect(new ClassSessionsService().updateSession(10, 20, { start_time: '19:00' }, teacher))
      .resolves.toEqual({ id: 20 });
    expect(updateSpy).toHaveBeenCalledWith(10, 20, { start_time: '19:00' }, teacher.id);
  });

  it('blocks metadata on generic update before loading the session', async () => {
    const findSpy = jest.spyOn(ClassSessionsRepository.prototype, 'findById');
    await expect(new ClassSessionsService().updateSession(
      10,
      20,
      { session_type: ClassSessionType.TEST, session_title: 'KT 2' },
      teacher,
    )).rejects.toMatchObject({ status: 403 });
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('locks session_number after JLPT learning data exists', async () => {
    jest.spyOn(ClassSessionsRepository.prototype, 'findById').mockResolvedValue({
      id: 20,
      class_id: 10,
      session_number: 1,
      session_type: ClassSessionType.LESSON,
      session_title: null,
      attendance: [],
      jlpt_learning_records: [{ id: 99 }],
    } as any);
    const updateSpy = jest.spyOn(ClassSessionsRepository.prototype, 'update');
    await expect(new ClassSessionsService().updateSession(10, 20, { session_number: 2 }, admin))
      .rejects.toMatchObject({ status: 409 });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('does not delete a session that owns JLPT learning records', async () => {
    jest.spyOn(ClassSessionsRepository.prototype, 'findById').mockResolvedValue({
      id: 20,
      class_id: 10,
      session_number: 1,
      session_type: ClassSessionType.LESSON,
      session_title: null,
      attendance: [],
      jlpt_learning_records: [{ id: 99 }],
    } as any);
    const deleteSpy = jest.spyOn(ClassSessionsRepository.prototype, 'delete');
    await expect(new ClassSessionsService().deleteSession(10, 20, admin.id, true))
      .rejects.toMatchObject({ status: 409 });
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
