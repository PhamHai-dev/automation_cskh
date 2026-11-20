import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../middlewares/error.middleware';
import { StudentsController } from '../students.controller';
import { StudentsService } from '../students.service';

describe('StudentsController.list query validation', () => {
  const controller = new StudentsController();
  const actor = { id: 1, roles: ['ADMIN'] };
  let getStudentsSpy: jest.SpyInstance;

  beforeEach(() => {
    getStudentsSpy = jest
      .spyOn(StudentsService.prototype, 'getStudentsWithMeta')
      .mockResolvedValue({ data: [], meta: {} } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function invoke(query: Record<string, unknown>) {
    const req = { query, user: actor } as unknown as Request;
    const res = { json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await controller.list(req, res, next);

    return { res, next };
  }

  it('normalizes legacy program and case-insensitive model values before calling the service', async () => {
    const { res, next } = await invoke({ program_type: 'jnpt', model: '1:n' });

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    expect(getStudentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        programType: 'JLPT',
        model: '1:N',
      }),
    );
  });

  it.each([
    ['program_type', 'TOEIC'],
    ['gender', 'UNKNOWN'],
    ['status', 'ACTIVE'],
    ['model', '2:1'],
    ['payment', 'PARTIAL'],
    ['has_class', 'yes'],
    ['start_date_from', '20-11-2026'],
    ['total_sessions_min', '-1'],
  ])('rejects invalid %s values instead of silently widening results', async (param, value) => {
    const { next } = await invoke({ [param]: value });

    expect(getStudentsSpy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({ status: 400 });
  });

  it.each([
    ['start_date_from', '2026-12-31', 'start_date_to', '2026-01-01'],
    ['end_date_from', '2026-12-31', 'end_date_to', '2026-01-01'],
    ['total_sessions_min', '40', 'total_sessions_max', '20'],
    ['remaining_sessions_min', '10', 'remaining_sessions_max', '-5'],
    ['birth_year_min', '2010', 'birth_year_max', '1990'],
  ])('rejects reversed ranges for %s and %s', async (minParam, min, maxParam, max) => {
    const { next } = await invoke({ [minParam]: min, [maxParam]: max });

    expect(getStudentsSpy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({
      status: 400,
      message: `Tham số ${minParam} không được lớn hơn ${maxParam}`,
    });
  });
});
