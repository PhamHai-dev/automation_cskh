import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';

describe('Packages API Integration', () => {
  let adminToken: string;
  let csToken: string;
  let adminId: number;
  let csId: number;

  beforeAll(async () => {
    // Clean up specific test data if any
    await prisma.package.deleteMany({
      where: { code: { startsWith: 'TEST_' } }
    });

    // We can assume some users exist or just mock IDs since token decoding only checks DB if we didn't mock it.
    // Wait, auth middleware does: const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    // So we MUST have a real user in the DB to pass auth.
    // Let's create a test user.
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_test@example.com' },
      update: {},
      create: {
        email: 'admin_test@example.com',
        name: 'Admin Test',
        password_hash: 'dummy',
        roles: ['ADMIN']
      }
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    const csUser = await prisma.user.upsert({
      where: { email: 'cs_test@example.com' },
      update: {},
      create: {
        email: 'cs_test@example.com',
        name: 'CS Test',
        password_hash: 'dummy',
        roles: ['CS']
      }
    });
    csId = csUser.id;
    csToken = signTestToken(csId, ['CS']);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.package.deleteMany({
      where: { code: { startsWith: 'TEST_' } }
    });
    await prisma.user.delete({ where: { id: csId } });
    await prisma.user.delete({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it('should prevent CS from creating a package (403)', async () => {
    const res = await request(app)
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${csToken}`)
      .send({
        code: 'TEST_PKG_1',
        name: 'Test Package 1',
        default_total_sessions: 10
      });

    expect(res.status).toBe(403);
  });

  it('should allow ADMIN to create a package (201)', async () => {
    const res = await request(app)
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'TEST_PKG_1',
        name: 'Test Package 1',
        default_total_sessions: 10
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('TEST_PKG_1');
  });

  it('should allow CS to view packages (200)', async () => {
    const res = await request(app)
      .get('/api/v1/packages')
      .set('Authorization', `Bearer ${csToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    // Find the one we just created
    const created = res.body.data.find((p: any) => p.code === 'TEST_PKG_1');
    expect(created).toBeDefined();
  });
});
