import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';

describe('Classes API & Random ID / Model Type Integration Tests', () => {
  let adminToken: string;
  let adminId: number;
  const createdClassIds: number[] = [];

  beforeAll(async () => {
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_class_test@example.com' },
      update: {},
      create: {
        email: 'admin_class_test@example.com',
        name: 'Admin Class Test',
        password_hash: 'd',
        roles: ['ADMIN'],
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);
  });

  afterAll(async () => {
    if (createdClassIds.length > 0) {
      await prisma.class.deleteMany({ where: { id: { in: createdClassIds } } });
    }
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it('should create class with model_type 1:1 and custom class_code', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        class_name: 'Lớp 1 kèm 1 Test',
        class_code: 'TEST_11_CUSTOM',
        level: 'N5',
        model_type: '1:1',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.class_name).toBe('Lớp 1 kèm 1 Test');
    expect(res.body.data.class_code).toBe('TEST_11_CUSTOM');
    expect(res.body.data.model_type).toBe('1:1');
    createdClassIds.push(res.body.data.id);
  });

  it('should automatically generate a compact class_code if class_code is omitted', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        class_name: 'Lớp Tự Sinh Mã 1:2',
        level: 'N4',
        model_type: '1:2',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.class_code).toMatch(/^class_\d{4,}$/);
    expect(res.body.data.model_type).toBe('1:2');
    createdClassIds.push(res.body.data.id);
  });

  it('should support model_type 1:n and default attendance_source to LEARNING_SYSTEM', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        class_name: 'Lớp Nhóm 1:n Test',
        model_type: '1:n',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.model_type).toBe('1:n');
    expect(res.body.data.attendance_source).toBe('LEARNING_SYSTEM');
    expect(res.body.data.class_code).toMatch(/^class_\d{4,}$/);
    createdClassIds.push(res.body.data.id);
  });

  it('should reject class creation if class_name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        model_type: '1:1',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject class creation if model_type is missing', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        class_name: 'Lớp thiếu model type',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
