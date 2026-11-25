import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import { prisma } from '../../../prisma/client';
import { errorMiddleware } from '../../../middlewares/error.middleware';
import { lineRouter } from '../line.routes';
import { lineService } from '../line.service';
import { linePool } from '../line-pool';
import { lineRepository } from '../line-repository';
import { encryptJson } from '../../../shared/crypto/aes-gcm';

jest.mock('../../../prisma/client', () => ({ prisma: {
  user: { findUnique: jest.fn() }, lineAccount: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  lineConversation: { findUnique: jest.fn() }, lineFriend: { upsert: jest.fn() },
} }));
jest.mock('../line-pool', () => ({ linePool: { getPersonalAdapter: jest.fn(), getOaAdapter: jest.fn(), connectOaAccount: jest.fn(),
  ensureAccountReady: jest.fn(), sendPersonalMessage: jest.fn(), sendGroupMessage: jest.fn(), disconnectAccount: jest.fn() } }));
jest.mock('../line-rate-limiter', () => ({ lineRateLimiter: { consumeOrThrow: jest.fn() } }));
jest.mock('../line-socket', () => ({ emitLineStatus: jest.fn() }));
const db = prisma as any;
const account = { id: 13, cs_id: 6, account_type: 'PERSONAL', status: 'ACTIVE', archived_at: null,
  display_name: 'Test', encrypted_session_data: 'private-ciphertext', webhook_secret: 'private-secret', proxy_url: 'http://name:pass@proxy.local:8080' };
const app = express(); app.use(express.json()); app.use('/api/v1/line', lineRouter); app.use(errorMiddleware);
const token = `Bearer ${jwt.sign({ id: 6 }, env.JWT_SECRET, { expiresIn: '10m' })}`;
beforeEach(() => {
  jest.resetAllMocks(); db.user.findUnique.mockResolvedValue({ id: 6, active: true, roles: ['CS'] });
  db.lineAccount.findUnique.mockResolvedValue({ ...account }); db.lineAccount.findMany.mockResolvedValue([{ ...account }]);
  db.lineAccount.update.mockImplementation(async ({ data }: any) => ({ ...account, ...data }));
  db.lineAccount.create.mockImplementation(async ({ data }: any) => ({ ...account, ...data }));
});
test.each(['/accounts', '/accounts/13'])('%s hides secrets and does not report a disconnected pool as live', async path => {
  const res = await request(app).get('/api/v1/line' + path).set('Authorization', token).expect(200);
  const data = Array.isArray(res.body.data) ? res.body.data[0] : res.body.data;
  expect(data.liveStatus).toBe('NOT_LOGGED_IN'); expect(data.encrypted_session_data).toBeUndefined(); expect(data.webhook_secret).toBeUndefined();
  expect(JSON.stringify(res.body)).not.toContain('name:pass');
});
test('live status requires the personal receiving listener, and protected states take priority', async () => {
  (linePool.getPersonalAdapter as jest.Mock).mockReturnValue({ client: {}, isListening: true });
  let res = await request(app).get('/api/v1/line/accounts/13/status').set('Authorization', token).expect(200);
  expect(res.body.data.liveStatus).toBe('ACTIVE');
  db.lineAccount.findUnique.mockResolvedValue({ ...account, status: 'DISABLED' });
  res = await request(app).get('/api/v1/line/accounts/13/status').set('Authorization', token).expect(200);
  expect(res.body.data.liveStatus).toBe('DISABLED');
});
test.each(['abc','13abc','0','-1','9007199254740992'])('invalid account %s returns 400 before querying account', async id => {
  await request(app).get('/api/v1/line/accounts/' + id).set('Authorization', token).expect(400);
  expect(db.lineAccount.findUnique).not.toHaveBeenCalled();
});
test('owner and authentication apply to status and interaction routes', async () => {
  await request(app).get('/api/v1/line/accounts/13/status').expect(401);
  db.lineAccount.findUnique.mockResolvedValue({ ...account, cs_id: 9 });
  await request(app).get('/api/v1/line/accounts/13/status').set('Authorization', token).expect(403);
  await request(app).post('/api/v1/line/accounts/13/messages/send').set('Authorization', token).send({ to: 'u-peer', content: 'Hello' }).expect(403);
  expect(linePool.sendPersonalMessage).not.toHaveBeenCalled();
});
test.each([{}, {content:''}, {content:'   '}, {content:{}}, {content:'hello',contentType:'image'}, {to:[],content:'hello'}])('invalid send %j never reaches SDK', async body => {
  await request(app).post('/api/v1/line/accounts/13/messages/send').set('Authorization', token).send(body).expect(400);
  expect(linePool.sendPersonalMessage).not.toHaveBeenCalled(); expect(linePool.sendGroupMessage).not.toHaveBeenCalled();
});
test('valid text is dispatched once through the correct personal/group path', async () => {
  (linePool.sendPersonalMessage as jest.Mock).mockResolvedValue({ providerMessageId: 'fake' });
  (linePool.sendGroupMessage as jest.Mock).mockResolvedValue({ providerMessageId: 'fake-group' });
  await request(app).post('/api/v1/line/accounts/13/messages/send').set('Authorization', token).send({to:'u-peer',content:'Hello'}).expect(200);
  await request(app).post('/api/v1/line/accounts/13/conversations/c-group/messages').set('Authorization', token).send({content:'Group'}).expect(200);
  expect(linePool.sendPersonalMessage).toHaveBeenCalledTimes(1); expect(linePool.sendGroupMessage).toHaveBeenCalledTimes(1);
});
test('disconnected friend requests do not fabricate a saved friend or sent:true', async () => {
  (linePool.ensureAccountReady as jest.Mock).mockResolvedValue(false);
  await expect(lineService.sendFriendRequest(13,'u'+'1'.repeat(32))).rejects.toMatchObject({statusCode:503});
  expect(db.lineFriend.upsert).not.toHaveBeenCalled();
});
test('OA follower sync and friend request are explicitly unsupported', async () => {
  db.lineAccount.findUnique.mockResolvedValue({...account,account_type:'OA'});
  await expect(lineService.syncFriends(13)).rejects.toMatchObject({statusCode:400});
  await expect(lineService.sendFriendRequest(13,'u'+'1'.repeat(32))).rejects.toMatchObject({statusCode:400});
});
test('OA verification failure never stores ACTIVE for new credentials or credentials update', async () => {
  (linePool.connectOaAccount as jest.Mock).mockRejectedValue(new Error('bad token'));
  const credentials = {account_type:'OA' as const,cs_id:6,channel_id:'test',channel_secret:'secret',channel_access_token:'token'};
  await lineService.createAccount(credentials);
  expect(db.lineAccount.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'NOT_LOGGED_IN',disconnect_reason:'oa_connection_failed'})}));
  expect(db.lineAccount.update.mock.calls.some(([args]:any[])=>args.data.status==='ACTIVE')).toBe(false);
  db.lineAccount.update.mockClear();
  db.lineAccount.findUnique.mockResolvedValue({...account,account_type:'OA',encrypted_session_data:encryptJson({mode:'OA',channelId:'test',channelSecret:'secret',channelAccessToken:'token'})});
  await lineService.updateOaCredentials(13,{});
  expect(db.lineAccount.update.mock.calls.some(([args]:any[])=>args.data.status==='ACTIVE')).toBe(false);
});
