// Route-level gate verification for D2: the resolve-conflict entry point must
// accept ADMIN only; MANAGE and CS get 403 at requireRoles before the
// controller ever runs. cs-mark keeps its ['ADMIN','MANAGE','CS'] gate.
// authenticate is stubbed (token injection); requireRoles is the real one.

jest.mock('../../../middlewares/auth.middleware', () => {
  const actual = jest.requireActual('../../../middlewares/auth.middleware');
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      const roles = req.headers['x-test-roles'];
      if (typeof roles !== 'string') return res.status(401).json({ message: 'Unauthorized' });
      req.user = { id: 999, roles: JSON.parse(roles) };
      next();
    },
  };
});

// The routes file references many controller methods while registering itself;
// provide a stub for EVERY property so router construction succeeds, and named
// stubs for the two endpoints this test actually exercises.
jest.mock('../reconciliation.controller', () => {
  const endpoints: Record<string, any> = {
    resolveConflict: (_req: any, res: any) => res.json({ success: true, data: { ran: 'resolveConflict' } }),
    markByCS: (_req: any, res: any) => res.json({ success: true, data: { ran: 'markByCS' } }),
  };
  const handlerFor = (name: string) =>
    endpoints[name] ?? ((_req: any, res: any) => res.json({ success: true, data: { ran: name } }));
  return {
    reconciliationController: new Proxy({}, {
      get: (_t, prop: string) => handlerFor(prop),
      has: () => true,
    }),
  };
});

import express from 'express';
import request from 'supertest';
import { reconciliationRouter } from '../reconciliation.routes';

const app = express();
app.use(express.json());
app.use('/attendance-reconciliation', reconciliationRouter);

const post = (path: string, roles: string[]) =>
  request(app)
    .post(`/attendance-reconciliation${path}`)
    .set('x-test-roles', JSON.stringify(roles))
    .send({ finalStatus: 'ABSENT_APPROVED_A', resolutionNote: 'Phân xử ADMIN', status: 'ATTENDED' });

describe('resolve-conflict route is ADMIN-only (D2)', () => {
  it('MANAGE is rejected with 403 (no Admin-equivalent resolution authority)', async () => {
    const res = await post('/100/resolve-conflict', ['MANAGE']);
    expect(res.status).toBe(403);
  });

  it('CS is rejected with 403 (CS must not self-resolve)', async () => {
    const res = await post('/100/resolve-conflict', ['CS']);
    expect(res.status).toBe(403);
  });

  it('TEACHER is rejected with 403', async () => {
    const res = await post('/100/resolve-conflict', ['TEACHER']);
    expect(res.status).toBe(403);
  });

  it('ADMIN passes the route gate', async () => {
    const res = await post('/100/resolve-conflict', ['ADMIN']);
    expect(res.status).toBe(200);
    expect(res.body.data.ran).toBe('resolveConflict');
  });
});

describe('cs-mark route gate unchanged (opinions stay CS-writable columns)', () => {
  it('CS can still reach cs-mark', async () => {
    const res = await post('/100/cs-mark', ['CS']);
    expect(res.status).toBe(200);
    expect(res.body.data.ran).toBe('markByCS');
  });

  it('MANAGE can still reach cs-mark (group-management scope untouched)', async () => {
    const res = await post('/100/cs-mark', ['MANAGE']);
    expect(res.status).toBe(200);
  });
});
