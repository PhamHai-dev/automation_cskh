import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';

describe('Imports API Integration', () => {
  let adminToken: string;
  let csToken: string;
  let adminId: number;
  let csId: number;

  const validSheet1Path = path.resolve(__dirname, '../../../../test-fixtures/valid_sheet1.xlsx');
  const invalidSheet1Path = path.resolve(__dirname, '../../../../test-fixtures/invalid_sheet1.xlsx');
  const validSheet3Path = path.resolve(__dirname, '../../../../test-fixtures/valid_sheet3.xlsx');
  const invalidSheet3Path = path.resolve(__dirname, '../../../../test-fixtures/invalid_sheet3.xlsx');

  beforeAll(async () => {
    // Create test users
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_import_test@example.com' },
      update: {},
      create: {
        email: 'admin_import_test@example.com',
        name: 'Admin Import Test',
        password_hash: 'dummy',
        roles: ['ADMIN'],
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    const csUser = await prisma.user.upsert({
      where: { email: 'cs_import_test@example.com' },
      update: {},
      create: {
        email: 'cs_import_test@example.com',
        name: 'CS Import Test',
        password_hash: 'dummy',
        roles: ['CS'],
      },
    });
    csId = csUser.id;
    csToken = signTestToken(csId, ['CS']);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.attendance.deleteMany({
      where: {
        OR: [
          { created_by_id: adminId },
          {
            enrollment_class: {
              enrollment: {
                student: { external_id: { in: ['HV_TEST_001', 'HV_TEST_002', 'HV_DUP_001', 'HV_NONAME'] } },
              },
            },
          },
        ],
      },
    });
    await prisma.classSession.deleteMany({
      where: { created_by_id: adminId },
    });
    await prisma.enrollmentClass.deleteMany({
      where: {
        enrollment: {
          student: { external_id: { in: ['HV_TEST_001', 'HV_TEST_002', 'HV_DUP_001', 'HV_NONAME'] } },
        },
      },
    });
    await prisma.class.deleteMany({
      where: { class_name: { in: ['Lớp Test N1', 'Lớp Test N2', 'Lớp Test'] } },
    });
    await prisma.enrollment.deleteMany({
      where: {
        student: { external_id: { in: ['HV_TEST_001', 'HV_TEST_002', 'HV_DUP_001', 'HV_NONAME'] } },
      },
    });
    await prisma.student.deleteMany({
      where: { external_id: { in: ['HV_TEST_001', 'HV_TEST_002', 'HV_DUP_001', 'HV_NONAME'] } },
    });
    await prisma.package.deleteMany({
      where: { code: { in: ['PKG_TEST_A', 'PKG_TEST_B'] } },
    });
    await prisma.importRow.deleteMany({
      where: { import_batch: { uploaded_by_id: adminId } },
    });
    await prisma.importBatch.deleteMany({
      where: { uploaded_by_id: adminId },
    });
    await prisma.auditLog.deleteMany({
      where: { user_id: adminId },
    });
    await prisma.user.delete({ where: { id: csId } });
    await prisma.user.delete({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  describe('Permissions', () => {
    it('should reject CS role when uploading file (403)', async () => {
      const res = await request(app)
        .post('/api/v1/imports/upload')
        .set('Authorization', `Bearer ${csToken}`)
        .attach('file', validSheet1Path)
        .field('import_type', 'STUDENT_ENROLLMENT');

      expect(res.status).toBe(403);
    });

    it('should allow CS to access templates and exports (200)', async () => {
      const res = await request(app)
        .get('/api/v1/imports/template/student_enrollment')
        .set('Authorization', `Bearer ${csToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    });
  });

  describe('Sheet 1 Flow (Student & Enrollment)', () => {
    let importId: number;

    it('should upload valid_sheet1.xlsx and return preview', async () => {
      const res = await request(app)
        .post('/api/v1/imports/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', validSheet1Path)
        .field('import_type', 'STUDENT_ENROLLMENT');

      expect(res.status).toBe(200);
      expect(res.body.importId).toBeDefined();
      expect(res.body.selectedSheet).toBe('1.Chăm sóc');
      expect(res.body.preview).toBeDefined();
      expect(res.body.preview.rows.length).toBeGreaterThan(0);
      expect(res.body.preview.suggestedMapping.full_name).toBeDefined();

      importId = res.body.importId;
    });

    it('should get preview data for the batch', async () => {
      const res = await request(app)
        .get(`/api/v1/imports/${importId}/preview`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.headers).toBeDefined();
      expect(res.body.rows.length).toBeGreaterThan(0);
    });

    it('should save column mapping', async () => {
      const res = await request(app)
        .post(`/api/v1/imports/${importId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sheetName: '1.Chăm sóc',
          columnMapping: {
            external_id: 'A',
            full_name: 'E',
            phone: 'G',
            email: 'H',
            package_code: 'I',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should validate valid_sheet1 without errors', async () => {
      const res = await request(app)
        .post(`/api/v1/imports/${importId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.validRows).toBe(2);
      expect(res.body.invalidRows).toBe(0);
      expect(res.body.errors.length).toBe(0);
    });

    it('should confirm and execute import for valid_sheet1', async () => {
      const res = await request(app)
        .post(`/api/v1/imports/${importId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ skipErrors: true });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.success_rows).toBe(2);
      expect(res.body.failed_rows).toBe(0);

      // Verify DB persistence
      const student1 = await prisma.student.findUnique({ where: { external_id: 'HV_TEST_001' } });
      expect(student1).toBeDefined();
      expect(student1?.full_name).toBe('Nguyễn Văn Test 1');

      const student2 = await prisma.student.findUnique({ where: { external_id: 'HV_TEST_002' } });
      expect(student2).toBeDefined();
      expect(student2?.full_name).toBe('Trần Thị Test 2');
    });

    it('should detect errors when validating invalid_sheet1.xlsx', async () => {
      const uploadRes = await request(app)
        .post('/api/v1/imports/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', invalidSheet1Path)
        .field('import_type', 'STUDENT_ENROLLMENT');

      const invalidBatchId = uploadRes.body.importId;

      const validateRes = await request(app)
        .post(`/api/v1/imports/${invalidBatchId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.invalidRows).toBeGreaterThan(0);
      expect(validateRes.body.errors.length).toBeGreaterThan(0);

      // Verify specific errors caught: duplicate ID, missing name, not number
      const errorMsgs = validateRes.body.errors.map((e: any) => e.message).join(' ');
      expect(errorMsgs).toContain('Trùng lặp ID');
      expect(errorMsgs).toContain('Họ tên học viên là bắt buộc');
    });
  });

  describe('Sheet 3 Flow (Attendance)', () => {
    let importId: number;

    it('should upload valid_sheet3.xlsx and validate', async () => {
      const res = await request(app)
        .post('/api/v1/imports/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', validSheet3Path)
        .field('import_type', 'ATTENDANCE');

      expect(res.status).toBe(200);
      expect(res.body.selectedSheet).toBe('3.Chấm buổi');
      importId = res.body.importId;

      const validateRes = await request(app)
        .post(`/api/v1/imports/${importId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.errors.length).toBe(0);
    });

    it('should confirm attendance import and create Attendance records', async () => {
      const res = await request(app)
        .post(`/api/v1/imports/${importId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ skipErrors: true });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.success_rows).toBe(1);

      // Verify attendance records in DB for HV_TEST_001
      const student = await prisma.student.findUnique({
        where: { external_id: 'HV_TEST_001' },
        include: {
          enrollments: {
            include: {
              enrollment_classes: {
                include: { attendance: true },
              },
            },
          },
        },
      });

      const attendances = student?.enrollments[0]?.enrollment_classes[0]?.attendance || [];
      expect(attendances.length).toBeGreaterThan(0);
      const statuses = attendances.map((a) => a.status);
      expect(statuses).toContain('ATTENDED');
      expect(statuses).toContain('ABSENT_APPROVED_A');
      expect(statuses).toContain('LEAVE_B');
    });

    it('should detect invalid attendance codes in invalid_sheet3.xlsx', async () => {
      const uploadRes = await request(app)
        .post('/api/v1/imports/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', invalidSheet3Path)
        .field('import_type', 'ATTENDANCE');

      const invalidBatchId = uploadRes.body.importId;

      const validateRes = await request(app)
        .post(`/api/v1/imports/${invalidBatchId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(validateRes.status).toBe(200);
      const errorMsgs = validateRes.body.errors.map((e: any) => e.message).join(' ');
      expect(errorMsgs).toContain('Giá trị điểm danh không hợp lệ');
    });
  });

  describe('Batches, Errors & Exports', () => {
    it('should list all import batches', async () => {
      const res = await request(app)
        .get('/api/v1/imports/batches')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('should export current students to Excel file', async () => {
      const res = await request(app)
        .get('/api/v1/imports/export/students')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    });

    it('should export current attendance to Excel file', async () => {
      const res = await request(app)
        .get('/api/v1/imports/export/attendance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    });
  });
});
