import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';

describe('Enrollments Data Scope Integration', () => {
  let adminToken: string;
  let cs1Token: string;
  let cs2Token: string;
  let adminId: number;
  let cs1Id: number;
  let cs2Id: number;
  let studentId: number;
  let enrollment1Id: number;
  let enrollment2Id: number;

  beforeAll(async () => {
    // 1. Setup Users
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_scope@example.com' },
      update: {},
      create: { email: 'admin_scope@example.com', name: 'Admin', password_hash: 'd', roles: ['ADMIN'] }
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    const cs1User = await prisma.user.upsert({
      where: { email: 'cs1_scope@example.com' },
      update: {},
      create: { email: 'cs1_scope@example.com', name: 'CS 1', password_hash: 'd', roles: ['CS'] }
    });
    cs1Id = cs1User.id;
    cs1Token = signTestToken(cs1Id, ['CS']);

    const cs2User = await prisma.user.upsert({
      where: { email: 'cs2_scope@example.com' },
      update: {},
      create: { email: 'cs2_scope@example.com', name: 'CS 2', password_hash: 'd', roles: ['CS'] }
    });
    cs2Id = cs2User.id;
    cs2Token = signTestToken(cs2Id, ['CS']);

    // 2. Setup Student
    const student = await prisma.student.create({
      data: { full_name: 'Scope Test Student', phone: '0999999999' }
    });
    studentId = student.id;

    // 3. Setup Enrollments
    const e1 = await prisma.enrollment.create({
      data: { student_id: studentId, cs_id: cs1Id, total_sessions: 10 }
    });
    enrollment1Id = e1.id;

    const e2 = await prisma.enrollment.create({
      data: { student_id: studentId, cs_id: cs2Id, total_sessions: 10 }
    });
    enrollment2Id = e2.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.enrollment.deleteMany({ where: { student_id: studentId } });
    await prisma.student.delete({ where: { id: studentId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, cs1Id, cs2Id] } } });
    await prisma.$disconnect();
  });

  it('should allow CS1 to view only CS1 enrollments in list', async () => {
    const res = await request(app).get('/api/v1/enrollments').set('Authorization', `Bearer ${cs1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    
    // Check that none of the enrollments belong to cs2
    const hasCs2 = res.body.data.some((e: any) => e.cs_id === cs2Id);
    expect(hasCs2).toBe(false);
  });

  it('should allow Admin to view all enrollments', async () => {
    const res = await request(app).get('/api/v1/enrollments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    
    const hasCs1 = res.body.data.some((e: any) => e.cs_id === cs1Id);
    const hasCs2 = res.body.data.some((e: any) => e.cs_id === cs2Id);
    expect(hasCs1).toBe(true);
    expect(hasCs2).toBe(true);
  });

  it('should prevent CS1 from viewing CS2 enrollment detail (403)', async () => {
    const res = await request(app).get(`/api/v1/enrollments/${enrollment2Id}`).set('Authorization', `Bearer ${cs1Token}`);
    expect(res.status).toBe(403);
  });

  it('should allow CS1 to view CS1 enrollment detail (200)', async () => {
    const res = await request(app).get(`/api/v1/enrollments/${enrollment1Id}`).set('Authorization', `Bearer ${cs1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(enrollment1Id);
  });
});
