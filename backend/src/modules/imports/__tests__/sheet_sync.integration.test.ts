import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { CareLogOutcome } from '@prisma/client';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import {
  extractCellValue,
  extractCvhtCode,
  inferCareLogOutcome,
  loadOptimizedWorkbook,
  normalizePhone,
  parseJlptSettingsSheet,
  parseJlptSheetRows,
  parseKaiwaSheetRows,
  parseSheetDate,
} from '../sheet-sync.parser';

describe('Google Sheet Sync & CVHT Scope Integration', () => {
  let adminToken: string;
  let cvht01Token: string;
  let cvht02Token: string;
  let cvht03Token: string;
  let adminId: number;
  let cvht01Id: number;
  let cvht02Id: number;
  let cvht03Id: number;

  const jlptPath = path.resolve(__dirname, '../../../../../docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
  const kaiwaPath = path.resolve(__dirname, '../../../../../docs/data/hoc_vien/hoc_vien_kaiwa.xlsx');

  beforeAll(async () => {
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_sheet_sync_test@example.com' },
      update: { active: true, roles: ['ADMIN'] },
      create: {
        email: 'admin_sheet_sync_test@example.com',
        name: 'Admin Sheet Sync',
        password_hash: 'dummy',
        roles: ['ADMIN'],
        active: true,
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    // Ensure CVHT01, CVHT02, CVHT03 users exist
    const u1 = await prisma.user.upsert({
      where: { email: 'cskh1@gmail.com' },
      update: { staff_code: 'CVHT01', active: true, roles: ['CS'] },
      create: {
        email: 'cskh1@gmail.com',
        name: 'CVHT01 - CSKH 1',
        staff_code: 'CVHT01',
        password_hash: 'dummy',
        roles: ['CS'],
        active: true,
      },
    });
    cvht01Id = u1.id;
    cvht01Token = signTestToken(cvht01Id, ['CS']);

    const u2 = await prisma.user.upsert({
      where: { email: 'cskh2@gmail.com' },
      update: { staff_code: 'CVHT02', active: true, roles: ['CS'] },
      create: {
        email: 'cskh2@gmail.com',
        name: 'CVHT02 - CSKH 2',
        staff_code: 'CVHT02',
        password_hash: 'dummy',
        roles: ['CS'],
        active: true,
      },
    });
    cvht02Id = u2.id;
    cvht02Token = signTestToken(cvht02Id, ['CS']);

    const u3 = await prisma.user.upsert({
      where: { email: 'cskh3@gmail.com' },
      update: { staff_code: 'CVHT03', active: true, roles: ['CS'] },
      create: {
        email: 'cskh3@gmail.com',
        name: 'CVHT03 - CSKH 3',
        staff_code: 'CVHT03',
        password_hash: 'dummy',
        roles: ['CS'],
        active: true,
      },
    });
    cvht03Id = u3.id;
    cvht03Token = signTestToken(cvht03Id, ['CS']);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Formula Decoder & Phone/CareLog Parsers', () => {
    it('should decode IFERROR(__xludf.DUMMYFUNCTION(...), fallback) formulas accurately', () => {
      const strFormula = {
        formula: 'IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Hà Thị Tươi")',
      };
      expect(extractCellValue(strFormula)).toBe('Hà Thị Tươi');

      const numFormula = {
        formula: 'IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),3.83904692E8)',
      };
      expect(extractCellValue(numFormula)).toBe(383904692);

      const dateSerialFormula = {
        formula: 'IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),44387.0)',
      };
      const parsedDate = parseSheetDate(dateSerialFormula);
      expect(parsedDate).toBeInstanceOf(Date);
      expect(parsedDate?.toISOString().slice(0, 10)).toBe('2021-07-10');

      const errorResultFormula = {
        formula: 'VLOOKUP(A3,Setting!C:E,3,False)',
        result: { error: '#N/A' },
      };
      expect(extractCellValue(errorResultFormula)).toBeNull();
    });

    it('should normalize Vietnamese and Japanese phone numbers missing leading zero', () => {
      expect(normalizePhone(383904692)).toBe('0383904692');
      expect(normalizePhone('961290497')).toBe('0961290497');
      expect(normalizePhone(7091972356)).toBe('07091972356');
      expect(normalizePhone(8041811792)).toBe('08041811792');
      expect(normalizePhone(0)).toBeNull();
    });

    it('should extract CVHT code from primary cell or fallback sales note', () => {
      expect(extractCvhtCode('CVHT01')).toBe('CVHT01');
      expect(extractCvhtCode('', 'Mã lớp: N4A110005-CVHT03')).toBe('CVHT03');
      expect(extractCvhtCode(null, 'N4A110005 CVHTO3')).toBe('CVHT03');
    });

    it('should classify CareLogOutcome from Vietnamese content', () => {
      expect(inferCareLogOutcome('Cần hỗ trợ hệ thống gấp')).toBe(CareLogOutcome.NEED_SUPPORT_SYSTEM);
      expect(inferCareLogOutcome('HV phản hồi tạm ổn, học thêm rồi báo')).toBe(CareLogOutcome.TEMP_PAUSE);
      expect(inferCareLogOutcome('Cần hỗ trợ chương trình học N3')).toBe(CareLogOutcome.NEED_CURRICULUM_SUPPORT);
      expect(inferCareLogOutcome('Cần khắc phục điểm yếu nghe hiểu')).toBe(CareLogOutcome.NEED_STUDENT_WEAKNESS_FIX);
      expect(inferCareLogOutcome('Phản hồi về giáo viên dạy nhanh')).toBe(CareLogOutcome.NEED_TEACHER_SUPPORT);
      expect(inferCareLogOutcome('HV tiêu cực, muốn dừng khóa')).toBe(CareLogOutcome.NEGATIVE_WANTS_TO_STOP);
      expect(inferCareLogOutcome('Nhắn tin chưa phản hồi')).toBe(CareLogOutcome.NO_RESPONSE);
      expect(inferCareLogOutcome('HV khen lớp vui vẻ')).toBe(CareLogOutcome.POSITIVE);
    });
  });

  describe('2. Parsing hoc_vien_jlpt.xlsx & hoc_vien_kaiwa.xlsx', () => {
    it('should parse JLPT Setting sheet and Data JLPT_Inhouse rows with CVHT01/02/03', async () => {
      const wb = await loadOptimizedWorkbook(fs.readFileSync(jlptPath), [
        'Data JLPT_Inhouse',
        'Setting',
        'Điểm học tập',
      ]);

      const settings = parseJlptSettingsSheet(wb, 'Setting');
      expect(settings.get('N5VIP16')?.totalSessions).toBe(38);
      expect(settings.get('N5VIP16')?.durationMinutes).toBe(90);
      expect(settings.get('N4VIP16')?.totalSessions).toBe(35);
      expect(settings.get('N4VIP16')?.durationMinutes).toBe(120);
      expect(settings.get('N3VIP110')?.totalSessions).toBe(42);

      const rows = parseJlptSheetRows(wb, 'Data JLPT_Inhouse', 'Setting', 2, 50);
      expect(rows.length).toBe(50);
      expect(rows[0].programType).toBe('JLPT');
      expect(rows[0].fullName).toBe('Hà Thị Tươi');
      expect(rows[0].phone).toBe('0383904692');
      expect(rows[0].totalSessions).toBe(35); // N4VIP16 -> 35 sessions
    }, 30000);

    it('should parse Kaiwa Tổng rows accurately', async () => {
      const wb = await loadOptimizedWorkbook(fs.readFileSync(kaiwaPath), ['Tổng']);

      const rows = parseKaiwaSheetRows(wb, 'Tổng', 2, 30);
      expect(rows.length).toBe(30);
      expect(rows[0].programType).toBe('KAIWA');
      expect(rows[0].externalId).toBe('72019001');
      expect(rows[0].phone).toBe('0917520969');
      expect(rows[0].cvhtCode).toBe('CVHT01');
    }, 30000);
  });

  describe('3. Sheet Sync API, SHA-256 Row Hash Diffing & CVHT Data Scope', () => {
    it('should return configs and CS users via GET /api/v1/imports/sheet-sync/configs', async () => {
      const res = await request(app)
        .get('/api/v1/imports/sheet-sync/configs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.configs.length).toBeGreaterThanOrEqual(2);
      const codes = res.body.data.configs.map((c: any) => c.code);
      expect(codes).toContain('JLPT');
      expect(codes).toContain('KAIWA');
      expect(res.body.data.csUsers.length).toBeGreaterThanOrEqual(3);
    });

    it('should update config via PUT /api/v1/imports/sheet-sync/configs/:code', async () => {
      const res = await request(app)
        .put('/api/v1/imports/sheet-sync/configs/JLPT')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          cvht_mapping: {
            CVHT01: cvht01Id,
            CVHT02: cvht02Id,
            CVHT03: cvht03Id,
          },
          default_cs_id: cvht01Id,
          sync_interval_minutes: 15,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe('JLPT');
      expect(res.body.data.sync_interval_minutes).toBe(15);
    });

    it('should sync JLPT and KAIWA rows and skip unchanged rows on second run (SHA-256 Row Hash Diffing)', async () => {
      // First run with forceFullSync: true and limit: 15
      const sync1 = await request(app)
        .post('/api/v1/imports/sheet-sync/configs/JLPT/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ forceFullSync: true, limit: 15 });

      expect(sync1.status).toBe(200);
      expect(sync1.body.data.code).toBe('JLPT');
      expect(sync1.body.data.totalRows).toBe(15);
      expect(sync1.body.data.createdCount + sync1.body.data.updatedCount).toBe(15);
      expect(sync1.body.data.failedCount).toBe(0);

      // Second run with forceFullSync: false and limit: 15 -> all 15 rows must be unchanged!
      const sync2 = await request(app)
        .post('/api/v1/imports/sheet-sync/configs/JLPT/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ forceFullSync: false, limit: 15 });

      expect(sync2.status).toBe(200);
      expect(sync2.body.data.totalRows).toBe(15);
      expect(sync2.body.data.unchangedRows).toBe(15);
      expect(sync2.body.data.createdCount).toBe(0);
      expect(sync2.body.data.updatedCount).toBe(0);

      // Also test sync-all endpoint with limit: 10
      const syncAllRes = await request(app)
        .post('/api/v1/imports/sheet-sync/sync-all')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ forceFullSync: false, limit: 10 });

      expect(syncAllRes.status).toBe(200);
      expect(Array.isArray(syncAllRes.body.data.results)).toBe(true);
      expect(syncAllRes.body.data.results.length).toBeGreaterThanOrEqual(2);
    }, 60000);

    it('should enforce CVHT Data Scope on GET /api/v1/students and GET /api/v1/enrollments', async () => {
      // Ensure we have at least one enrollment for CVHT01 and one for CVHT02
      const s1 = await prisma.student.upsert({
        where: { external_id: 'TEST_CVHT01_STU' },
        update: {},
        create: { external_id: 'TEST_CVHT01_STU', full_name: 'Học Viên CVHT01' },
      });
      await prisma.enrollment.upsert({
        where: { external_sync_key: 'JLPT::TEST_CVHT01_STU::N3VIP16::r1' },
        update: { cs_id: cvht01Id, program_type: 'JLPT' },
        create: {
          external_id: 'TEST_CVHT01_STU',
          external_sync_key: 'JLPT::TEST_CVHT01_STU::N3VIP16::r1',
          program_type: 'JLPT',
          student_id: s1.id,
          cs_id: cvht01Id,
          total_sessions: 45,
        },
      });

      const s2 = await prisma.student.upsert({
        where: { external_id: 'TEST_CVHT02_STU' },
        update: {},
        create: { external_id: 'TEST_CVHT02_STU', full_name: 'Học Viên CVHT02' },
      });
      await prisma.enrollment.upsert({
        where: { external_sync_key: 'KAIWA::TEST_CVHT02_STU::VIP1::r1' },
        update: { cs_id: cvht02Id, program_type: 'KAIWA' },
        create: {
          external_id: 'TEST_CVHT02_STU',
          external_sync_key: 'KAIWA::TEST_CVHT02_STU::VIP1::r1',
          program_type: 'KAIWA',
          student_id: s2.id,
          cs_id: cvht02Id,
          total_sessions: 30,
        },
      });

      // CVHT01 queries /api/v1/students -> only sees students with enrollment.cs_id === cvht01Id
      const stuRes1 = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${cvht01Token}`);
      expect(stuRes1.status).toBe(200);
      expect(stuRes1.body.data.length).toBeGreaterThan(0);
      for (const stu of stuRes1.body.data) {
        expect(stu.enrollments.every((e: any) => e.cs_id === cvht01Id)).toBe(true);
      }

      // CVHT02 queries /api/v1/enrollments -> only sees enrollments with cs_id === cvht02Id
      const enrRes2 = await request(app)
        .get('/api/v1/enrollments')
        .set('Authorization', `Bearer ${cvht02Token}`);
      expect(enrRes2.status).toBe(200);
      expect(enrRes2.body.data.length).toBeGreaterThan(0);
      expect(enrRes2.body.data.every((e: any) => e.cs_id === cvht02Id)).toBe(true);

      // Admin queries /api/v1/students?program_type=JLPT&cs_id=cvht01Id
      const adminFilterRes = await request(app)
        .get(`/api/v1/students?program_type=JLPT&cs_id=${cvht01Id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminFilterRes.status).toBe(200);
      expect(adminFilterRes.body.data.length).toBeGreaterThan(0);
      for (const stu of adminFilterRes.body.data) {
        expect(
          stu.enrollments.every((e: any) => e.program_type === 'JLPT' && e.cs_id === cvht01Id)
        ).toBe(true);
      }
    });
  });
});
