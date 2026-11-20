import { prisma } from '../../../prisma/client';
import { careGroupLinksRepository } from '../care-group-links.repository';
jest.mock('../../../prisma/client', () => ({ prisma: {
  $transaction: jest.fn(),
  zaloContactRelation: { upsert: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  lineContactRelation: { upsert: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
} }));
const db = prisma as any;
beforeEach(() => { jest.resetAllMocks(); db.$transaction.mockImplementation((fn: any) => fn(db)); });

test.each(['zalo', 'line'])('%s overlapping automatic match keeps a just-saved manual choice', async platform => {
  const row = { id: 100, student_id: 1, program_type: 'JLPT', matched_by: 'MANUAL', relation_status: 'FRIEND',
    [platform + '_account_id']: 5, [platform + '_group_id']: 900 };
  const model = db[platform + 'ContactRelation']; model.upsert.mockResolvedValue(row);
  model.updateMany.mockImplementation(async (args: any) => {
    const eligible = args.where.OR.some((condition: any) => condition.matched_by === row.matched_by || (condition.matched_by && typeof condition.matched_by === 'object' && condition.matched_by.not !== row.matched_by));
    if (eligible) Object.assign(row, args.data);
    return { count: eligible ? 1 : 0 };
  });
  model.findUnique.mockImplementation(async () => row);
  const group = { id: 99, name: '01 - HV_001 An N4', avatar_url: null, [platform + '_account_id']: 5, [platform + '_group_id']: 'auto-target' };
  const result = platform === 'zalo' ? await careGroupLinksRepository.matchZalo(1, 'JLPT', group as any) : await careGroupLinksRepository.matchLine(1, 'JLPT', group as any);
  expect(result?.matched_by).toBe('MANUAL'); expect((result as any)[platform + '_group_id']).toBe(900);
  expect(model.upsert.mock.calls[0][0].update).toEqual({});
});
test.each(['zalo', 'line'])('%s manual selection suspends other group choices only for same owner/program inside transaction', async platform => {
  const row = { id: 100, student_id: 1, program_type: 'JLPT', target_type: 'GROUP' };
  const model = db[platform + 'ContactRelation']; model.upsert.mockResolvedValue(row);
  const args: any = { where: { id: 100 }, create: {}, update: {} };
  if (platform === 'zalo') await careGroupLinksRepository.selectManualZalo(args, 6);
  else await careGroupLinksRepository.selectManualLine(args, 6);
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(model.updateMany).toHaveBeenCalledWith({ where: {
    student_id: 1, program_type: 'JLPT', id: { not: 100 }, target_type: 'GROUP', [platform + '_account']: { cs_id: 6 },
  }, data: { relation_status: 'UNKNOWN' } });
});
