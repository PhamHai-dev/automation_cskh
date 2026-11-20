import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../middlewares/error.middleware';
import { CareController } from '../care.controller';
import { CareService } from '../care.service';

describe('CareController.getCareTasks query validation', () => {
  let getTasks: jest.Mock;
  let controller: CareController;

  beforeEach(() => {
    getTasks = jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    controller = new CareController({ getCareTasks: getTasks } as unknown as CareService);
  });

  async function invoke(query: Record<string, unknown>) {
    const req = { query, user: { id: 7, roles: ['CS'] } } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;
    await controller.getCareTasks(req, res, next);
    return { res, next };
  }

  it('normalizes JNPT and forwards validated filters with server pagination', async () => {
    const { next } = await invoke({
      program_type: 'jnpt', status: 'pending', priority: 'high', type: 'callback',
      due_filter: 'today', search: '  học viên A  ', page: '2', pageSize: '50',
    });

    expect(next).not.toHaveBeenCalled();
    expect(getTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'học viên A', program_type: 'JLPT', status: 'PENDING', priority: 'HIGH',
        type: 'CALLBACK', due_filter: 'today', page: 2, pageSize: 50, limit: 50, offset: 50,
      }),
      7,
      ['CS'],
    );
  });

  it.each([
    ['program_type', 'TOEIC'], ['status', 'ACTIVE'], ['priority', 'CRITICAL'],
    ['type', 'OTHER'], ['due_filter', 'tomorrow'], ['assigned_to_id', '0'],
    ['enrollment_id', 'abc'], ['due_from', '20-11-2026'],
  ])('rejects invalid %s instead of widening the query', async (param, value) => {
    const { next } = await invoke({ [param]: value });
    expect(getTasks).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({ status: 400 });
  });

  it.each([
    ['due_from', '2026-12-31', 'due_to', '2026-01-01'],
    ['created_from', '2026-12-31', 'created_to', '2026-01-01'],
  ])('rejects reversed ranges for %s and %s', async (fromParam, from, toParam, to) => {
    const { next } = await invoke({ [fromParam]: from, [toParam]: to });
    expect(getTasks).not.toHaveBeenCalled();
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({
      status: 400,
      message: `Tham số ${fromParam} không được lớn hơn ${toParam}`,
    });
  });
});
