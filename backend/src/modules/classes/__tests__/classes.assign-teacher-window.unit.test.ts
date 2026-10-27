// D8 owner ruling (B1) 2026-10-26 — assignment termination must carry an
// EXPLICIT end_date, never a script-inferred one. classes.routes POST
// /:id/teachers is the only API surface that can write `active` on a
// ClassTeacher row (there is NO PATCH/DELETE unassign endpoint); the service
// now refuses active=false without end_date with 422 before touching the DB.
// Pure unit tests on the validator — no DB, no app boot.

import { ClassesService } from '../classes.service';
import { ClassesController } from '../classes.controller';
import { ClassesRepository } from '../classes.repository';
import { prisma } from '../../../prisma/client';
import { AppError } from '../../../middlewares/error.middleware';

// CustomError is module-private in classes.service; it carries .status like
// AppError. Assert on status + message structurally.
const CUSTOM_422 = 'Vui lòng nhập ngày kết thúc phân công khi cho GV ngừng phụ trách lớp';

describe('ClassesService.assertValidTeacherAssignmentWindow (ruling B1, 2026-10-26)', () => {
  const service = new ClassesService();

  it('active=false WITHOUT end_date -> 422 (explicit termination date required, never defaulted to today)', () => {
    const err = catchErr(() =>
      service.assertValidTeacherAssignmentWindow({ active: false, start_date: '2026-01-01', end_date: null })
    );
    expect(err.status).toBe(422);
    expect(err.message).toBe(CUSTOM_422);

    const err2 = catchErr(() => service.assertValidTeacherAssignmentWindow({ active: false }));
    expect(err2.status).toBe(422);
    expect(err2.message).toBe(CUSTOM_422);

    const err3 = catchErr(() =>
      service.assertValidTeacherAssignmentWindow({ active: false, start_date: '2026-01-01', end_date: '   ' })
    );
    expect(err3.status).toBe(422);
    expect(err3.message).toBe(CUSTOM_422);

    const err4 = catchErr(() =>
      service.assertValidTeacherAssignmentWindow({ active: false, end_date: 'not-a-date' })
    );
    expect(err4.status).toBe(422);
    expect(err4.message).toBe(CUSTOM_422);
  });

  it('active=false WITH explicit end_date passes (the ops path for recording a bounded termination)', () => {
    expect(() =>
      service.assertValidTeacherAssignmentWindow({
        active: false,
        start_date: '2026-01-01',
        end_date: '2026-06-30',
      })
    ).not.toThrow();
    // end_date alone (half-open historical window) is also acceptable —
    // B1 only requires the termination date, not a start.
    expect(() =>
      service.assertValidTeacherAssignmentWindow({ active: false, end_date: '2026-06-30' })
    ).not.toThrow();
  });

  it('active omitted / true passes unchanged (assignment creation is not termination)', () => {
    expect(() => service.assertValidTeacherAssignmentWindow({ start_date: '2026-01-01' })).not.toThrow();
    expect(() => service.assertValidTeacherAssignmentWindow({ active: true })).not.toThrow();
  });

  it('inverted window rejected when both bounds present (do-not-silently-accept nonsense dates)', () => {
    const err = catchErr(() =>
      service.assertValidTeacherAssignmentWindow({
        active: true,
        start_date: '2026-06-30',
        end_date: '2026-06-01',
      })
    );
    expect(err.status).toBe(422);
    expect(err.message).toBe('Ngày kết thúc phân công phải lớn hơn hoặc bằng ngày bắt đầu');
  });

  it('Date objects accepted alongside strings (DTO type is string | Date)', () => {
    expect(() =>
      service.assertValidTeacherAssignmentWindow({
        active: false,
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-06-30'),
      })
    ).not.toThrow();
  });
});

function catchErr(fn: () => void): { status: number; message: string } {
  try {
    fn();
  } catch (e: any) {
    return e;
  }
  throw new Error('expected assertValidTeacherAssignmentWindow to throw');
}

// Also pin the AppError-compat shape used by errorMiddleware mapping.
describe('AppError sanity', () => {
  it('AppError keeps status', () => {
    expect(new AppError(422, 'x').status).toBe(422);
  });
});

describe('ClassesService & ClassesController endTeacherAssignment (D8 "Kết thúc phân công", 2026-10-26)', () => {
  const adminActor = { id: 1, roles: ['ADMIN'] };
  const manageActor = { id: 2, roles: ['MANAGE'] };
  const existingAssignment = {
    id: 77,
    class_id: 10,
    teacher_id: 5,
    role: 'MAIN' as const,
    start_date: new Date('2026-10-01T00:00:00.000Z'),
    end_date: null,
    active: true,
    created_at: new Date('2026-10-01T00:00:00.000Z'),
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Admin ending assignment with valid end_date updates ClassTeacher in place (active=false, end_date) and writes AuditLog', async () => {
    jest.spyOn(ClassesRepository.prototype, 'findById').mockResolvedValue({ id: 10 } as any);
    jest.spyOn(ClassesRepository.prototype, 'findTeacherAssignment').mockResolvedValue(existingAssignment as any);
    const endSpy = jest.spyOn(ClassesRepository.prototype, 'endTeacherAssignment').mockImplementation(
      async (assignmentId: number, endDate: Date) => ({
        ...existingAssignment,
        id: assignmentId,
        active: false,
        end_date: endDate,
      }) as any
    );
    const auditSpy = jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 900 } as any);

    const req: any = {
      params: { id: '10', assignmentId: '77' },
      body: { end_date: '2026-10-22' },
      user: adminActor,
    };
    const res: any = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await new ClassesController().endTeacherAssignment(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(endSpy).toHaveBeenCalledWith(77, new Date('2026-10-22'));
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 77,
        class_id: 10,
        teacher_id: 5,
        role: 'MAIN',
        start_date: existingAssignment.start_date,
        end_date: new Date('2026-10-22'),
        active: false,
      }),
      meta: null,
    });
    expect(auditSpy).toHaveBeenCalledWith({
      data: {
        user_id: 1,
        action: 'CLASS_TEACHER_ASSIGNMENT_ENDED',
        entity_type: 'class_teacher',
        entity_id: '77',
        before_data: {
          active: true,
          start_date: existingAssignment.start_date,
          end_date: null,
        },
        after_data: {
          active: false,
          start_date: existingAssignment.start_date,
          end_date: new Date('2026-10-22'),
        },
      },
    });
  });

  it('missing or blank end_date -> 422 (never auto-fills today)', async () => {
    const service = new ClassesService();
    await expect(
      service.endTeacherAssignment(10, 77, {}, adminActor)
    ).rejects.toMatchObject({
      status: 422,
      message: CUSTOM_422,
    });

    await expect(
      service.endTeacherAssignment(10, 77, { end_date: '   ' }, adminActor)
    ).rejects.toMatchObject({
      status: 422,
      message: CUSTOM_422,
    });
  });

  it('end_date < start_date -> 422', async () => {
    jest.spyOn(ClassesRepository.prototype, 'findById').mockResolvedValue({ id: 10 } as any);
    jest.spyOn(ClassesRepository.prototype, 'findTeacherAssignment').mockResolvedValue(existingAssignment as any);

    const service = new ClassesService();
    await expect(
      service.endTeacherAssignment(10, 77, { end_date: '2026-09-15' }, adminActor)
    ).rejects.toMatchObject({
      status: 422,
      message: 'Ngày kết thúc phân công phải lớn hơn hoặc bằng ngày bắt đầu',
    });
  });

  it('non-Admin actor -> 403', async () => {
    const service = new ClassesService();
    await expect(
      service.endTeacherAssignment(10, 77, { end_date: '2026-10-22' }, manageActor)
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it('wrong classId or missing assignment on class -> 404', async () => {
    const findClassSpy = jest.spyOn(ClassesRepository.prototype, 'findById').mockResolvedValue(null);
    const service = new ClassesService();

    await expect(
      service.endTeacherAssignment(9999, 77, { end_date: '2026-10-22' }, adminActor)
    ).rejects.toMatchObject({
      status: 404,
      message: 'Class not found',
    });

    findClassSpy.mockResolvedValue({ id: 10 } as any);
    jest.spyOn(ClassesRepository.prototype, 'findTeacherAssignment').mockResolvedValue(null);

    await expect(
      service.endTeacherAssignment(10, 9999, { end_date: '2026-10-22' }, adminActor)
    ).rejects.toMatchObject({
      status: 404,
      message: 'Teacher assignment not found on this class',
    });
  });
});

