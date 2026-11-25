import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import { prisma } from '../../../prisma/client';
import { errorMiddleware } from '../../../middlewares/error.middleware';
import { omnichannelRouter } from '../omnichannel.routes';
import { DEFAULT_CARE_GROUP_RULES } from '../care-group-rules';

jest.mock('../../../prisma/client', () => ({ prisma: {
  user: { findUnique: jest.fn() }, appSetting: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() }, $transaction: jest.fn(),
} }));
const db = prisma as any;
const app = express(); app.use(express.json()); app.use('/api/v1/omnichannel', omnichannelRouter); app.use(errorMiddleware);
const url = '/api/v1/omnichannel/care-group-rules';
const auth = `Bearer ${jwt.sign({ id: 11 }, env.JWT_SECRET, { expiresIn: '5m' })}`;
beforeEach(() => {
  jest.resetAllMocks(); db.user.findUnique.mockResolvedValue({ id: 11, active: true, roles: ['ADMIN'] });
  db.appSetting.findUnique.mockResolvedValue(null); db.$transaction.mockImplementation((fn: any) => fn(db));
  db.appSetting.updateMany.mockResolvedValue({ count: 1 });
});
test.each(['ADMIN', 'MANAGE', 'CS'])('%s can read default rules without mutation', async role => {
  db.user.findUnique.mockResolvedValue({ id: 11, active: true, roles: [role] });
  const res = await request(app).get(url).set('Authorization', auth).expect(200);
  expect(res.body.data).toEqual({ ...DEFAULT_CARE_GROUP_RULES, updatedAt: null });
  expect(db.$transaction).not.toHaveBeenCalled();
});
test.each(['ADMIN', 'MANAGE'])('%s can save with audit', async role => {
  db.user.findUnique.mockResolvedValue({ id: 11, active: true, roles: [role] });
  await request(app).put(url).set('Authorization', auth).send({ ...DEFAULT_CARE_GROUP_RULES, expectedUpdatedAt: null }).expect(200);
  expect(db.appSetting.create).toHaveBeenCalledTimes(1);
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ user_id: 11, action: 'CARE_GROUP_RULES_UPDATED', after_data: DEFAULT_CARE_GROUP_RULES }) }));
});
test('CS cannot save or preview; unauthenticated/teacher cannot read', async () => {
  await request(app).get(url).expect(401);
  db.user.findUnique.mockResolvedValue({ id: 11, active: true, roles: ['CS'] });
  await request(app).put(url).set('Authorization', auth).send({}).expect(403);
  await request(app).post(url + '/preview').set('Authorization', auth).send({}).expect(403);
  db.user.findUnique.mockResolvedValue({ id: 11, active: true, roles: ['TEACHER'] });
  await request(app).get(url).set('Authorization', auth).expect(403);
  expect(db.$transaction).not.toHaveBeenCalled();
});
test('preview recognizes JLPT without DB settings writes', async () => {
  const res = await request(app).post(url + '/preview').set('Authorization', auth).send({ config: DEFAULT_CARE_GROUP_RULES, groupName: '01 - HV_001 Nguyễn Văn An N4', studentName: 'Nguyễn Văn An' }).expect(200);
  expect(res.body.data).toMatchObject({ programType: 'JLPT', studentId: 'HV_001', levelNote: 'N4' });
  expect(db.appSetting.findUnique).not.toHaveBeenCalled(); expect(db.$transaction).not.toHaveBeenCalled();
});
test('stale settings and concurrent updates return 409 with no overwrite', async () => {
  db.appSetting.findUnique.mockResolvedValue({ updated_at: new Date('2026-11-20T01:00:00Z'), value: DEFAULT_CARE_GROUP_RULES });
  await request(app).put(url).set('Authorization', auth).send({ ...DEFAULT_CARE_GROUP_RULES, expectedUpdatedAt: null }).expect(409);
  expect(db.appSetting.updateMany).not.toHaveBeenCalled();
  db.appSetting.updateMany.mockResolvedValue({ count: 0 });
  await request(app).put(url).set('Authorization', auth).send({ ...DEFAULT_CARE_GROUP_RULES, expectedUpdatedAt: '2026-11-20T01:00:00.000Z' }).expect(409);
  expect(db.auditLog.create).not.toHaveBeenCalled();
});
test('rejects invalid templates, unknown keys and missing version', async () => {
  for (const payload of [DEFAULT_CARE_GROUP_RULES, { ...DEFAULT_CARE_GROUP_RULES, expectedUpdatedAt: null, extra: true }, { ...DEFAULT_CARE_GROUP_RULES, expectedUpdatedAt: null, enabled: 'yes' }]) {
    await request(app).put(url).set('Authorization', auth).send(payload).expect(400);
  }
  expect(db.$transaction).not.toHaveBeenCalled();
});
