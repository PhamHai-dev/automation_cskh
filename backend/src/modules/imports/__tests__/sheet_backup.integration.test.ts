import request from 'supertest';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import {
  AttendanceSource,
  AttendanceSourceType,
  AttendanceStatus,
  CareLogOutcome,
  ClassModelType,
  ClassSessionStatus,
  EnrollmentClassStatus,
  EnrollmentStatus,
} from '@prisma/client';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { colNumberToLetter, detectJlptMonthBlocks, normalizeCellComparable } from '../attendance-sheet.util';

/**
 * Program Sheet Backup (2-Sheet Workbook: Profile + Attendance) & Column Config Integration Test
 *
 * Covers the complete 2-sheet backup and Admin column-mapping contract:
 *  1. ensureConfigs / listConfigs create 2 configs per CS (JLPT + KAIWA) with both
 *     profile sheet (`Data JLPT_Inhouse` / `1.Chăm sóc`) and attendance sheet
 *     (`Chấm buổi` / `3.Chấm buổi`); CS sees only own configs, ADMIN/MANAGE see all.
 *  2. KAIWA backup writes 2 sheets into `hoc_vien_kaiwa_<CVHT>.xlsx`:
 *     - Sheet 1 `1.Chăm sóc` (header row = 3, data from row 4, 60 cols A..BH):
 *       student profile, class, teacher, status, and CareLog milestones (`care.1`, `care.3`, `care.10`, `care.15`, ...).
 *     - Sheet 3 `3.Chấm buổi` (header row = 2, data from row 3, 28 fixed cols A..AB with col A = ID học viên + month blocks from col AC):
 *       fixed columns + attendance mark '1' on 31/10/2026 without spilling into November.
 *  3. JLPT backup writes 2 sheets into `hoc_vien_jlpt_<CVHT>.xlsx`:
 *     - Sheet 1 `Data JLPT_Inhouse` (header row = 2, data from row 3, 52 cols A..AZ):
 *       profile, CVHT col P (16), Mã khóa học col Q (17), Mã lớp col W (23),
 *       CareLog milestones (`care.1`, `care.15`, `care.25`, ...), test scores 1..7 from `program_metadata`.
 *     - Sheet 2 `Chấm buổi` (header row = 2, data from row 3, 12 fixed cols A..L with col A = Mã lớp, col B = ID học viên + month blocks from col M):
 *       fixed columns + attendance mark 'C' on 05/10/2026 without drifting into September.
 *  4. Year filter (year = 2025) writes 0 attendance cells when all sessions are in 2026.
 *  5. Re-running with unchanged data is idempotent on `Data JLPT_Inhouse` (and `1.Chăm sóc` + `3.Chấm buổi`).
 *  6. Cross-CS access (CVHT02 touching CVHT99's config) is rejected with 403; owner can download.
 *  7. Admin Column Config & Service Account permissions:
 *     - GET `/api/v1/imports/sheet-backup/column-config` returns KAIWA (profile 60 + attendance 28)
 *       and JLPT (profile 52 + attendance 12) + `serviceAccount`.
 *     - PUT `/api/v1/imports/sheet-backup/column-config` rejects CS and MANAGE with 403;
 *       allows ADMIN to disable a column and relocate another column on `Data JLPT_Inhouse`,
 *       and running backup respects the disabled column (does not overwrite manual cell value)
 *       and writes the relocated column to its new position.
 *     - POST `/api/v1/imports/sheet-backup/column-config/reset` restores default 52/60/28/12 mapping.
 *     - PUT `/api/v1/imports/sheet-sync/service-account` rejects CS and MANAGE with 403, allows ADMIN.
 */
describe('Program Sheet Backup (2-Sheet JLPT & KAIWA + Admin Column Config) Integration', () => {
  let adminToken: string;
  let manageToken: string;
  let csTestToken: string;
  let cvht02Token: string;

  let adminId: number;
  let manageId: number;
  let csTestId: number;
  let cvht02Id: number;

  let testClassId: number;
  let testEnrollmentClass1Id: number; // JLPT
  let testEnrollmentClass2Id: number; // KAIWA
  let testEnrollment1Id: number;
  let testEnrollment2Id: number;
  let testStudent1Id: number;
  let testStudent2Id: number;

  const TEST_STAFF_CODE = 'CVHT99';
  const EXTERNAL_ID_JLPT = 'HV_SBKPG_JLPT_001';
  const EXTERNAL_ID_KAIWA = 'HV_SBKPG_KAIWA_001';
  const SYNC_KEY_JLPT = 'SBKPG_TEST::HV_SBKPG_JLPT_001::JLPT_SBK_TEST';
  const SYNC_KEY_KAIWA = 'SBKPG_TEST::HV_SBKPG_KAIWA_001::KAIWA_SBK_TEST';

  let jlptConfigId: number;
  let kaiwaConfigId: number;
  const createdBackupFiles: string[] = [];
  let savedColumnConfigSetting: { value: any; updated_by_id: number | null } | null = null;
  let savedServiceAccountSetting: { value: any; updated_by_id: number | null } | null = null;

  beforeAll(async () => {
    // Snapshot existing AppSetting rows so afterAll restores the exact pre-test state
    const existingColCfg = await prisma.appSetting.findUnique({ where: { key: 'SHEET_BACKUP_COLUMN_CONFIG' } });
    savedColumnConfigSetting = existingColCfg
      ? { value: existingColCfg.value, updated_by_id: existingColCfg.updated_by_id }
      : null;
    const existingSaCfg = await prisma.appSetting.findUnique({ where: { key: 'GOOGLE_SERVICE_ACCOUNT_JSON' } });
    savedServiceAccountSetting = existingSaCfg
      ? { value: existingSaCfg.value, updated_by_id: existingSaCfg.updated_by_id }
      : null;

    // Ensure column config starts from clean defaults
    await prisma.appSetting.deleteMany({ where: { key: 'SHEET_BACKUP_COLUMN_CONFIG' } });

    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_sheet_backup_test@example.com' },
      update: { active: true, roles: ['ADMIN'] },
      create: {
        email: 'admin_sheet_backup_test@example.com',
        name: 'Admin Backup Test',
        password_hash: 'dummy',
        roles: ['ADMIN'],
        active: true,
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    const manageUser = await prisma.user.upsert({
      where: { email: 'manage_sheet_backup_test@example.com' },
      update: { active: true, roles: ['MANAGE'] },
      create: {
        email: 'manage_sheet_backup_test@example.com',
        name: 'Manage Backup Test',
        password_hash: 'dummy',
        roles: ['MANAGE'],
        active: true,
      },
    });
    manageId = manageUser.id;
    manageToken = signTestToken(manageId, ['MANAGE']);

    // Dedicated CS user for isolated, fast, deterministic 2-sheet backup verification
    const uTest = await prisma.user.upsert({
      where: { email: 'cskh_sbkpg_test99@example.com' },
      update: { staff_code: TEST_STAFF_CODE, active: true, roles: ['CS'] },
      create: {
        email: 'cskh_sbkpg_test99@example.com',
        name: 'CVHT99 - CSKH Backup Test',
        staff_code: TEST_STAFF_CODE,
        password_hash: 'dummy',
        roles: ['CS'],
        active: true,
      },
    });
    csTestId = uTest.id;
    csTestToken = signTestToken(csTestId, ['CS']);

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

    // ---- Temp seed data -------------------------------------------------
    const pkgJlpt = await prisma.package.upsert({
      where: { code: 'JLPT_SBK_TEST' },
      update: { default_total_sessions: 12, active: true },
      create: { code: 'JLPT_SBK_TEST', name: 'Gói JLPT Backup Test', default_total_sessions: 12, active: true },
    });

    const pkgKaiwa = await prisma.package.upsert({
      where: { code: 'KAIWA_SBK_TEST' },
      update: { default_total_sessions: 30, active: true },
      create: {
        code: 'KAIWA_SBK_TEST',
        name: 'Gói Kaiwa Backup Test',
        default_total_sessions: 30,
        active: true,
      },
    });

    const teacher = await prisma.teacher.upsert({
      where: { code: 'GV_SBKPG_01' },
      update: { name: 'Sensei Backup Program 01', active: true },
      create: { code: 'GV_SBKPG_01', name: 'Sensei Backup Program 01', active: true },
    });

    await prisma.class.deleteMany({ where: { class_code: 'CLS_SBKPG_CVHT99' } });
    const cls = await prisma.class.create({
      data: {
        class_code: 'CLS_SBKPG_CVHT99',
        class_name: 'Lớp Backup Program Test CVHT99',
        level: 'N4',
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: AttendanceSourceType.LEARNING_SYSTEM,
        active: true,
      },
    });
    testClassId = cls.id;

    await prisma.classTeacher.create({
      data: { class_id: cls.id, teacher_id: teacher.id, role: 'MAIN', active: true },
    });
    await prisma.classSchedule.create({
      data: {
        class_id: cls.id,
        schedule_pattern: 'T2-T4-T6',
        start_time: '20:00',
        duration_minutes: 50,
        active: true,
      },
    });

    const student1 = await prisma.student.upsert({
      where: { external_id: EXTERNAL_ID_JLPT },
      update: {
        full_name: 'Nguyễn Văn SBK JLPT',
        gender: 'Nam',
        phone: '0912340001',
        email: 'hv_sbkpg_jlpt@example.com',
      },
      create: {
        external_id: EXTERNAL_ID_JLPT,
        full_name: 'Nguyễn Văn SBK JLPT',
        gender: 'Nam',
        phone: '0912340001',
        email: 'hv_sbkpg_jlpt@example.com',
      },
    });
    testStudent1Id = student1.id;

    const student2 = await prisma.student.upsert({
      where: { external_id: EXTERNAL_ID_KAIWA },
      update: {
        full_name: 'Trần Thị SBK KAIWA',
        gender: 'Nữ',
        phone: '0912340002',
        email: 'hv_sbkpg_kaiwa@example.com',
        date_of_birth: new Date('1999-05-15T00:00:00.000Z'),
        occupation: 'Kỹ sư IT',
      },
      create: {
        external_id: EXTERNAL_ID_KAIWA,
        full_name: 'Trần Thị SBK KAIWA',
        gender: 'Nữ',
        phone: '0912340002',
        email: 'hv_sbkpg_kaiwa@example.com',
        date_of_birth: new Date('1999-05-15T00:00:00.000Z'),
        occupation: 'Kỹ sư IT',
      },
    });
    testStudent2Id = student2.id;

    const jlptMetadata = {
      tuition_fee: '8500000',
      expected_start_date: '2026-10-01',
      active_state: 'Active',
      satisfaction_score_b18: '9.5/10',
      exam_score: '145/180',
      exam_result: 'Đỗ N4',
      renewal_note: 'Đăng ký lên N3',
      latest_class_code: 'CLS_SBKPG_CVHT99',
      exam_registration: 'Đã đăng ký T12/2026',
      exam_status_final: 'Đạt',
      test_scores: {
        l1: '85',
        l2: '88',
        l3: '90',
        l4: '92',
        l5: '94',
        l6: '95',
        l7: '98',
      },
      special_support: {
        l1: 'Bổ trợ ngữ pháp lần 1',
        l2: 'Bổ trợ đọc hiểu lần 2',
        l3: 'Bổ trợ nghe hiểu lần 3',
      },
    };

    const enrJlpt = await prisma.enrollment.upsert({
      where: { external_sync_key: SYNC_KEY_JLPT },
      update: {
        cs_id: csTestId,
        student_id: student1.id,
        package_id: pkgJlpt.id,
        paid_at: new Date('2026-09-01T00:00:00.000Z'),
        sale_name: 'Sale A',
        student_source_status: 'HV mới',
        course_content: 'Thường',
        payment_status: 'Full phí',
        course_teacher_type: 'GV Việt Nam',
        level: 'N4',
        total_sessions: 12,
        class_model: 'Lớp 1-1',
        sales_note: 'Ghi chú sale JLPT',
        start_date: new Date('2026-10-01T00:00:00.000Z'),
        exchange_info: 'Trao đổi định kỳ JLPT',
        callback_note: 'Gọi lại thứ 6',
        hot_issue_note: 'Cần ôn kỹ phần Choukai',
        post_course_care: 'Tư vấn lộ trình N3',
        program_metadata: jlptMetadata,
        status: EnrollmentStatus.STUDYING,
      },
      create: {
        external_id: EXTERNAL_ID_JLPT,
        external_sync_key: SYNC_KEY_JLPT,
        program_type: 'JLPT',
        student_id: student1.id,
        package_id: pkgJlpt.id,
        cs_id: csTestId,
        paid_at: new Date('2026-09-01T00:00:00.000Z'),
        sale_name: 'Sale A',
        student_source_status: 'HV mới',
        course_content: 'Thường',
        payment_status: 'Full phí',
        course_teacher_type: 'GV Việt Nam',
        level: 'N4',
        total_sessions: 12,
        class_model: 'Lớp 1-1',
        sales_note: 'Ghi chú sale JLPT',
        start_date: new Date('2026-10-01T00:00:00.000Z'),
        exchange_info: 'Trao đổi định kỳ JLPT',
        callback_note: 'Gọi lại thứ 6',
        hot_issue_note: 'Cần ôn kỹ phần Choukai',
        post_course_care: 'Tư vấn lộ trình N3',
        program_metadata: jlptMetadata,
        status: EnrollmentStatus.STUDYING,
      },
    });
    testEnrollment1Id = enrJlpt.id;

    const enrKaiwa = await prisma.enrollment.upsert({
      where: { external_sync_key: SYNC_KEY_KAIWA },
      update: {
        cs_id: csTestId,
        student_id: student2.id,
        package_id: pkgKaiwa.id,
        paid_at: new Date('2026-09-15T00:00:00.000Z'),
        sale_name: 'Sale B',
        student_source_status: 'HV mới',
        course_content: 'Thường',
        payment_status: 'Full phí',
        course_teacher_type: 'GV Việt Nam',
        level: 'N4',
        total_sessions: 30,
        attended_previous_years: 2,
        class_model: 'Lớp 1-1',
        sales_note: 'Ghi chú sale KAIWA',
        start_date: new Date('2026-10-01T00:00:00.000Z'),
        study_report_url: 'https://example.com/report/kaiwa001',
        exchange_info: 'HV phản hồi tốt',
        callback_note: 'Hẹn gọi cuối tuần',
        hot_issue_note: 'Muốn tăng tốc phản xạ',
        post_course_care: 'Giới thiệu gói Kaiwa nâng cao',
        status: EnrollmentStatus.STUDYING,
      },
      create: {
        external_id: EXTERNAL_ID_KAIWA,
        external_sync_key: SYNC_KEY_KAIWA,
        program_type: 'KAIWA',
        student_id: student2.id,
        package_id: pkgKaiwa.id,
        cs_id: csTestId,
        paid_at: new Date('2026-09-15T00:00:00.000Z'),
        sale_name: 'Sale B',
        student_source_status: 'HV mới',
        course_content: 'Thường',
        payment_status: 'Full phí',
        course_teacher_type: 'GV Việt Nam',
        level: 'N4',
        total_sessions: 30,
        attended_previous_years: 2,
        class_model: 'Lớp 1-1',
        sales_note: 'Ghi chú sale KAIWA',
        start_date: new Date('2026-10-01T00:00:00.000Z'),
        study_report_url: 'https://example.com/report/kaiwa001',
        exchange_info: 'HV phản hồi tốt',
        callback_note: 'Hẹn gọi cuối tuần',
        hot_issue_note: 'Muốn tăng tốc phản xạ',
        post_course_care: 'Giới thiệu gói Kaiwa nâng cao',
        status: EnrollmentStatus.STUDYING,
      },
    });
    testEnrollment2Id = enrKaiwa.id;

    // Seed CareLogs for KAIWA (milestones 1, 3, 10, 15, 25, 30) and JLPT (milestones 1, 15, 25, 30, 35, 40)
    await prisma.careLog.deleteMany({ where: { enrollment_id: { in: [enrJlpt.id, enrKaiwa.id] } } });
    await prisma.careLog.createMany({
      data: [
        {
          enrollment_id: enrKaiwa.id,
          cs_id: csTestId,
          after_session_number: 1,
          outcome: CareLogOutcome.POSITIVE,
          content: 'KAIWA chăm sóc sau buổi 1: HV làm quen tốt',
          created_by_id: csTestId,
        },
        {
          enrollment_id: enrKaiwa.id,
          cs_id: csTestId,
          after_session_number: 3,
          outcome: CareLogOutcome.POSITIVE,
          content: 'KAIWA chăm sóc sau buổi 3: Phát âm rõ',
          created_by_id: csTestId,
        },
        {
          enrollment_id: enrKaiwa.id,
          cs_id: csTestId,
          after_session_number: 10,
          outcome: CareLogOutcome.POSITIVE,
          content: 'KAIWA chăm sóc sau buổi 10: Phản xạ tiến bộ',
          created_by_id: csTestId,
        },
        {
          enrollment_id: enrKaiwa.id,
          cs_id: csTestId,
          after_session_number: 15,
          outcome: CareLogOutcome.POSITIVE,
          content: 'KAIWA chăm sóc sau buổi 15: Tự tin giao tiếp',
          created_by_id: csTestId,
        },
        {
          enrollment_id: enrJlpt.id,
          cs_id: csTestId,
          after_session_number: 1,
          outcome: CareLogOutcome.POSITIVE,
          content: 'JLPT chăm sóc buổi 1: Nắm vững lộ trình',
          created_by_id: csTestId,
        },
        {
          enrollment_id: enrJlpt.id,
          cs_id: csTestId,
          after_session_number: 15,
          outcome: CareLogOutcome.POSITIVE,
          content: 'JLPT chăm sóc buổi 15: Hoàn thành bài tập đầy đủ',
          created_by_id: csTestId,
        },
        {
          enrollment_id: enrJlpt.id,
          cs_id: csTestId,
          after_session_number: 25,
          outcome: CareLogOutcome.POSITIVE,
          content: 'JLPT chăm sóc buổi 25: Sẵn sàng luyện đề',
          created_by_id: csTestId,
        },
        {
          enrollment_id: enrJlpt.id,
          cs_id: csTestId,
          after_session_number: 40,
          outcome: CareLogOutcome.POSITIVE,
          content: 'JLPT chăm sóc cuối khóa: Đạt mục tiêu đầu ra',
          created_by_id: csTestId,
        },
      ],
    });

    const ec1 = await prisma.enrollmentClass.upsert({
      where: {
        enrollment_id_class_id_sequence_no: { enrollment_id: enrJlpt.id, class_id: cls.id, sequence_no: 1 },
      },
      update: { status: EnrollmentClassStatus.ACTIVE },
      create: {
        enrollment_id: enrJlpt.id,
        class_id: cls.id,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });
    testEnrollmentClass1Id = ec1.id;

    const ec2 = await prisma.enrollmentClass.upsert({
      where: {
        enrollment_id_class_id_sequence_no: { enrollment_id: enrKaiwa.id, class_id: cls.id, sequence_no: 2 },
      },
      update: { status: EnrollmentClassStatus.ACTIVE },
      create: {
        enrollment_id: enrKaiwa.id,
        class_id: cls.id,
        sequence_no: 2,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });
    testEnrollmentClass2Id = ec2.id;

    // JLPT session on 2026-10-05 -> attendance ABSENT_UNAPPROVED_C (cell value 'C')
    const sessionJlpt = await prisma.classSession.upsert({
      where: { class_id_session_number: { class_id: cls.id, session_number: 101 } },
      update: { session_date: new Date('2026-10-05T00:00:00.000Z'), status: ClassSessionStatus.COMPLETED },
      create: {
        class_id: cls.id,
        session_number: 101,
        session_date: new Date('2026-10-05T00:00:00.000Z'),
        status: ClassSessionStatus.COMPLETED,
        created_by_id: adminId,
      },
    });
    await prisma.attendance.upsert({
      where: {
        enrollment_class_id_class_session_id: {
          enrollment_class_id: ec1.id,
          class_session_id: sessionJlpt.id,
        },
      },
      update: {
        status: AttendanceStatus.ABSENT_UNAPPROVED_C,
        reconciliation_state: 'MATCHED',
        deleted_at: null,
      },
      create: {
        enrollment_class_id: ec1.id,
        class_session_id: sessionJlpt.id,
        status: AttendanceStatus.ABSENT_UNAPPROVED_C,
        reconciliation_state: 'MATCHED',
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
      },
    });

    // KAIWA session on 2026-10-31 (month-end) -> attendance ATTENDED (cell value '1')
    const sessionKaiwa = await prisma.classSession.upsert({
      where: { class_id_session_number: { class_id: cls.id, session_number: 102 } },
      update: { session_date: new Date('2026-10-31T00:00:00.000Z'), status: ClassSessionStatus.COMPLETED },
      create: {
        class_id: cls.id,
        session_number: 102,
        session_date: new Date('2026-10-31T00:00:00.000Z'),
        status: ClassSessionStatus.COMPLETED,
        created_by_id: adminId,
      },
    });
    await prisma.attendance.upsert({
      where: {
        enrollment_class_id_class_session_id: {
          enrollment_class_id: ec2.id,
          class_session_id: sessionKaiwa.id,
        },
      },
      update: {
        status: AttendanceStatus.ATTENDED,
        reconciliation_state: 'MATCHED',
        deleted_at: null,
      },
      create: {
        enrollment_class_id: ec2.id,
        class_session_id: sessionKaiwa.id,
        status: AttendanceStatus.ATTENDED,
        reconciliation_state: 'MATCHED',
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
      },
    });
  });

  afterAll(async () => {
    // Each step is isolated: an FK failure in one step must not abort the rest
    // (the workbook unlink below used to be skipped silently).
    const safe = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err: any) {
        console.warn(`cleanup failed [${label}]: ${err?.message || err}`);
      }
    };

    await safe('appSettingColumnConfig', async () => {
      if (savedColumnConfigSetting) {
        await prisma.appSetting.upsert({
          where: { key: 'SHEET_BACKUP_COLUMN_CONFIG' },
          update: { value: savedColumnConfigSetting.value, updated_by_id: savedColumnConfigSetting.updated_by_id },
          create: {
            key: 'SHEET_BACKUP_COLUMN_CONFIG',
            value: savedColumnConfigSetting.value,
            updated_by_id: savedColumnConfigSetting.updated_by_id,
          },
        });
      } else {
        await prisma.appSetting.deleteMany({ where: { key: 'SHEET_BACKUP_COLUMN_CONFIG' } });
      }
    });
    await safe('appSettingServiceAccount', async () => {
      if (savedServiceAccountSetting) {
        await prisma.appSetting.upsert({
          where: { key: 'GOOGLE_SERVICE_ACCOUNT_JSON' },
          update: { value: savedServiceAccountSetting.value, updated_by_id: savedServiceAccountSetting.updated_by_id },
          create: {
            key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
            value: savedServiceAccountSetting.value,
            updated_by_id: savedServiceAccountSetting.updated_by_id,
          },
        });
      } else {
        await prisma.appSetting.deleteMany({ where: { key: 'GOOGLE_SERVICE_ACCOUNT_JSON' } });
      }
    });

    const enrollmentClassIds = [testEnrollmentClass1Id, testEnrollmentClass2Id].filter(Boolean);
    const enrollmentIds = [testEnrollment1Id, testEnrollment2Id].filter(Boolean);
    const studentIds = [testStudent1Id, testStudent2Id].filter(Boolean);
    const tempUserIds = [csTestId, manageId].filter(Boolean);

    await safe('attendance', () => prisma.attendance.deleteMany({ where: { enrollment_class_id: { in: enrollmentClassIds } } }));
    await safe('enrollmentClass', () => prisma.enrollmentClass.deleteMany({ where: { enrollment_id: { in: enrollmentIds } } }));
    await safe('careLog', () =>
      prisma.careLog.deleteMany({
        where: { OR: [{ enrollment_id: { in: enrollmentIds } }, { cs_id: { in: tempUserIds } }] },
      })
    );
    await safe('classSession', () => prisma.classSession.deleteMany({ where: { class_id: testClassId } }));
    await safe('classSchedule', () => prisma.classSchedule.deleteMany({ where: { class_id: testClassId } }));
    await safe('classTeacher', () => prisma.classTeacher.deleteMany({ where: { class_id: testClassId } }));
    await safe('class', () => prisma.class.deleteMany({ where: { id: testClassId } }));
    await safe('enrollment', () => prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } }));
    await safe('student', () => prisma.student.deleteMany({ where: { id: { in: studentIds } } }));
    await safe('backupConfig', () => prisma.programSheetBackupConfig.deleteMany({ where: { cs_user_id: { in: tempUserIds } } }));
    await safe('auditLog', () => prisma.auditLog.deleteMany({ where: { user_id: { in: tempUserIds } } }));
    await safe('authSession', () => prisma.authSession.deleteMany({ where: { user_id: { in: tempUserIds } } }));
    await safe('user', () => prisma.user.deleteMany({ where: { id: { in: tempUserIds } } }));

    for (const f of createdBackupFiles) {
      await safe(`unlink ${path.basename(f)}`, async () => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
    }
    await prisma.$disconnect();
  });

  const resolveBackupPath = (p: string): string =>
    path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);

  type MonthBlockLite = {
    month: number;
    year: number;
    label?: string;
    startCol: number;
    endCol: number;
    dailyCols: Array<{ colNumber: number; colLetter?: string; date: string }>;
    summaryCols?: Record<string, number>;
  };

  const monthBlocks = (ws: ExcelJS.Worksheet, headerRow = 2): MonthBlockLite[] =>
    detectJlptMonthBlocks(ws, headerRow) as unknown as MonthBlockLite[];

  const cellText = (row: ExcelJS.Row, col: number): string =>
    normalizeCellComparable(row.getCell(col).value);

  const findRowByColValue = (
    ws: ExcelJS.Worksheet,
    targetValue: string,
    keyCol: number,
    headerRow: number
  ): ExcelJS.Row | null => {
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (cellText(row, keyCol) === targetValue) return row;
    }
    return null;
  };

  it('1. ensureConfigs creates 2 configs per CS (JLPT + KAIWA) with 2-sheet metadata; CS sees only own configs, admin sees all', async () => {
    const adminRes = await request(app)
      .get('/api/v1/imports/sheet-backup/configs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    const configs = adminRes.body.data.configs as any[];
    expect(Array.isArray(configs)).toBe(true);

    const forCsTest = configs.filter((c) => c.cs_user_id === csTestId);
    expect(forCsTest.map((c) => c.program_type).sort()).toEqual(['JLPT', 'KAIWA']);

    const jlpt = forCsTest.find((c) => c.program_type === 'JLPT')!;
    const kaiwa = forCsTest.find((c) => c.program_type === 'KAIWA')!;

    expect(jlpt.sheet_name).toBe('Chấm buổi');
    expect(jlpt.header_row).toBe(2);
    expect(jlpt.profile_sheet_name).toBe('Data JLPT_Inhouse');
    expect(jlpt.profile_header_row).toBe(2);
    expect(jlpt.profile_enabled).toBe(true);

    expect(kaiwa.sheet_name).toBe('3.Chấm buổi');
    expect(kaiwa.header_row).toBe(2);
    expect(kaiwa.profile_sheet_name).toBe('1.Chăm sóc');
    expect(kaiwa.profile_header_row).toBe(3);
    expect(kaiwa.profile_enabled).toBe(true);

    expect(String(jlpt.local_backup_path)).toContain(`hoc_vien_jlpt_${TEST_STAFF_CODE}`);
    expect(String(kaiwa.local_backup_path)).toContain(`hoc_vien_kaiwa_${TEST_STAFF_CODE}`);
    expect(jlpt.schedule_times).toEqual(['12:00', '21:00']);
    expect(jlpt.enabled).toBe(true);
    expect(jlpt.require_private_sheet).toBe(true);
    expect(jlpt.mask_sensitive_data).toBe(false);
    expect(jlpt.backup_year).toBeNull();
    expect(jlpt.cs_user.staff_code).toBe(TEST_STAFF_CODE);
    expect(jlpt.student_counts.total).toBe(1);
    expect(kaiwa.student_counts.total).toBe(1);
    expect(adminRes.body.data.serviceAccount).toBeDefined();
    expect(Array.isArray(adminRes.body.data.availableYears)).toBe(true);

    jlptConfigId = jlpt.id;
    kaiwaConfigId = kaiwa.id;

    // CS user only sees their own 2 configs
    const csRes = await request(app)
      .get('/api/v1/imports/sheet-backup/configs')
      .set('Authorization', `Bearer ${csTestToken}`);
    expect(csRes.status).toBe(200);
    const csConfigs = csRes.body.data.configs as any[];
    expect(csConfigs).toHaveLength(2);
    expect(csConfigs.every((c) => c.cs_user_id === csTestId)).toBe(true);
  });

  it('2. KAIWA backup writes 2 sheets into hoc_vien_kaiwa_<CVHT>.xlsx: 1.Chăm sóc (60 cols A..BH, header=3) + 3.Chấm buổi (28 fixed cols A..AB, header=2, month blocks from AC)', async () => {
    const runRes = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${kaiwaConfigId}/run`)
      .set('Authorization', `Bearer ${csTestToken}`)
      .send({ forceFullRewrite: true });

    expect(runRes.status).toBe(200);
    const summary = runRes.body.data;
    expect(summary.csUserId).toBe(csTestId);
    expect(summary.staffCode).toBe(TEST_STAFF_CODE);
    expect(summary.programType).toBe('KAIWA');
    expect(summary.status).toBe('SUCCESS');
    expect(summary.totalStudents).toBe(1);
    expect(summary.attendanceCellsWritten).toBe(1);
    expect(summary.profile).toBeDefined();
    expect(summary.profile.sheetName).toBe('1.Chăm sóc');
    expect(summary.profile.totalEnrollments).toBe(1);
    expect(summary.attendance).toBeDefined();
    expect(summary.attendance.sheetName).toBe('3.Chấm buổi');
    expect(summary.attendance.totalEnrollments).toBe(1);

    const absFile = resolveBackupPath(summary.localFilePath);
    createdBackupFiles.push(absFile);
    expect(path.basename(absFile)).toBe(`hoc_vien_kaiwa_${TEST_STAFF_CODE}.xlsx`);
    expect(fs.existsSync(absFile)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(absFile);

    // ---- Verify Sheet 1: `1.Chăm sóc` (header row = 3, data from row 4, 60 cols A..BH) ----
    const wsProfile = wb.getWorksheet('1.Chăm sóc');
    expect(wsProfile).toBeDefined();
    expect(wsProfile!.columnCount).toBeGreaterThanOrEqual(60);
    expect(colNumberToLetter(60)).toBe('BH');

    // Data starts from row 4 (header row = 3)
    const profileRow = findRowByColValue(wsProfile!, EXTERNAL_ID_KAIWA, 1, 3);
    expect(profileRow).not.toBeNull();
    expect(profileRow!.number).toBeGreaterThanOrEqual(4);

    // Profile columns A..BH checks
    expect(cellText(profileRow!, 1)).toBe(EXTERNAL_ID_KAIWA); // A: ID
    expect(cellText(profileRow!, 2)).toBe('2026-09-15'); // B: Ngày nộp học phí
    expect(cellText(profileRow!, 3)).toBe('Sale B'); // C: Sale
    expect(cellText(profileRow!, 4)).toBe('HV mới'); // D: Trạng thái HV
    expect(cellText(profileRow!, 5)).toBe('Trần Thị SBK KAIWA'); // E: Họ tên HV
    expect(cellText(profileRow!, 6)).toBe('Nữ'); // F: Giới tính
    expect(cellText(profileRow!, 7)).toBe('0912340002'); // G: SĐT
    expect(cellText(profileRow!, 8)).toBe('hv_sbkpg_kaiwa@example.com'); // H: Email
    expect(cellText(profileRow!, 9)).toBe('Thường'); // I: Nội dung khoá
    expect(cellText(profileRow!, 10)).toBe('Full phí'); // J: Trạng thái thanh toán
    expect(cellText(profileRow!, 11)).toBe('KAIWA_SBK_TEST'); // K: Gói học
    expect(cellText(profileRow!, 12)).toBe('GV Việt Nam'); // L: Khoá học
    expect(cellText(profileRow!, 13)).toBe('N4'); // M: Trình độ
    expect(cellText(profileRow!, 14)).toBe('30'); // N: Tổng số buổi
    expect(cellText(profileRow!, 15)).toBe('Lớp 1-1'); // O: Mô hình lớp
    expect(cellText(profileRow!, 16)).toBe('Ghi chú sale KAIWA'); // P: Ghi chú sale
    expect(cellText(profileRow!, 17)).toBe('1999-05-15'); // Q: DOB
    expect(cellText(profileRow!, 18)).toBe('Kỹ sư IT'); // R: Nghề nghiệp
    expect(cellText(profileRow!, 19)).toBe(TEST_STAFF_CODE); // S: CVHT
    expect(cellText(profileRow!, 20)).toBe('29'); // T: Số buổi còn lại (30 - 1 consumed; prev-years 2 tách riêng ở cột AI)
    expect(cellText(profileRow!, 21)).toBe('2026-10-01'); // U: Ngày bắt đầu học
    expect(cellText(profileRow!, 22)).toBe('Đang học'); // V: Trạng thái
    expect(cellText(profileRow!, 24)).toBe('20:00'); // X: Giờ học (1)
    expect(cellText(profileRow!, 25)).toBe('T2-T4-T6'); // Y: Lịch học (1)
    expect(cellText(profileRow!, 26)).toBe('50'); // Z: Thời lượng buổi học (1)
    expect(cellText(profileRow!, 32)).toBe('Sensei Backup Program 01'); // AF: Giáo viên
    expect(cellText(profileRow!, 33)).toBe('GV_SBKPG_01'); // AG: Mã GV
    expect(cellText(profileRow!, 34)).toBe('Lớp Backup Program Test CVHT99'); // AH: Tên lớp
    expect(cellText(profileRow!, 35)).toBe('2'); // AI: Tổng số buổi đã học năm trước
    expect(cellText(profileRow!, 36)).toBe('1'); // AJ: Tổng số buổi đã học trong năm
    expect(cellText(profileRow!, 37)).toBe('https://example.com/report/kaiwa001'); // AK: Báo cáo học tập
    expect(cellText(profileRow!, 38)).toBe('HV phản hồi tốt'); // AL: Thông tin trao đổi với HV
    expect(cellText(profileRow!, 39)).toBe('Hẹn gọi cuối tuần'); // AM: Lịch hẹn gọi
    expect(cellText(profileRow!, 40)).toBe('Muốn tăng tốc phản xạ'); // AN: Điểm nóng

    // CareLog milestones on `1.Chăm sóc` (cols 41..55 -> AO..BC)
    expect(cellText(profileRow!, 41)).toBe('KAIWA chăm sóc sau buổi 1: HV làm quen tốt'); // AO: sau buổi 1
    expect(cellText(profileRow!, 42)).toBe('KAIWA chăm sóc sau buổi 3: Phát âm rõ'); // AP: sau buổi 3
    expect(cellText(profileRow!, 43)).toBe('KAIWA chăm sóc sau buổi 10: Phản xạ tiến bộ'); // AQ: sau buổi 10
    expect(cellText(profileRow!, 44)).toBe('KAIWA chăm sóc sau buổi 15: Tự tin giao tiếp'); // AR: sau buổi 15
    expect(cellText(profileRow!, 56)).toBe('Giới thiệu gói Kaiwa nâng cao'); // BD: Chăm sóc sau kết thúc
    expect(cellText(profileRow!, 59)).toBe('9'); // BG: Tháng nộp học phí
    expect(cellText(profileRow!, 60)).not.toBe(''); // BH: Ngày tạo tài khoản (col 60)

    // ---- Verify Sheet 3: `3.Chấm buổi` (header row = 2, data from row 3, 28 fixed cols A..AB + month blocks from col AC=29) ----
    const wsAtt = wb.getWorksheet('3.Chấm buổi');
    expect(wsAtt).toBeDefined();

    // Verify 28 fixed cols A..AB (col 1 = ID học viên) and first month block starts at col 29 (AC)
    expect(colNumberToLetter(28)).toBe('AB');
    expect(colNumberToLetter(29)).toBe('AC');
    const blocks = monthBlocks(wsAtt!, 2);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].startCol).toBe(29); // AC

    // In KAIWA `3.Chấm buổi`, col A (1) = ID học viên (`student.external_id`)
    const attRow = findRowByColValue(wsAtt!, EXTERNAL_ID_KAIWA, 1, 2);
    expect(attRow).not.toBeNull();
    expect(attRow!.number).toBeGreaterThanOrEqual(3);

    expect(cellText(attRow!, 1)).toBe(EXTERNAL_ID_KAIWA); // A: ID
    expect(cellText(attRow!, 2)).toBe('Trần Thị SBK KAIWA'); // B: Họ tên HV
    expect(cellText(attRow!, 3)).toBe('KAIWA_SBK_TEST'); // C: Gói học
    expect(cellText(attRow!, 4)).toBe('Thường'); // D: Nội dung khoá
    expect(cellText(attRow!, 5)).toBe('30'); // E: Tổng số buổi
    expect(cellText(attRow!, 6)).toBe('GV Việt Nam'); // F: Khoá học
    expect(cellText(attRow!, 7)).toBe('hv_sbkpg_kaiwa@example.com'); // G: Email
    expect(cellText(attRow!, 8)).toBe('Lớp 1-1'); // H: Mô hình
    expect(cellText(attRow!, 9)).toBe('29'); // I: Số buổi còn lại (30 - 1 consumed)
    expect(cellText(attRow!, 10)).toBe('2026-10-01'); // J: Ngày bắt đầu học
    expect(cellText(attRow!, 11)).toBe('Đang học'); // K: Trạng thái
    expect(cellText(attRow!, 13)).toBe('20:00'); // M: Giờ học (1)
    expect(cellText(attRow!, 14)).toBe('T2-T4-T6'); // N: Lịch học (1)
    expect(cellText(attRow!, 15)).toBe('50'); // O: Thời lượng buổi học (1)
    expect(cellText(attRow!, 21)).toBe('Sensei Backup Program 01'); // U: Giáo viên
    expect(cellText(attRow!, 22)).toBe('GV_SBKPG_01'); // V: Mã GV
    expect(cellText(attRow!, 23)).toBe('Lớp Backup Program Test CVHT99'); // W: Tên lớp
    expect(cellText(attRow!, 24)).toBe('3'); // X: Tổng số buổi đã học (all time = 2 + 1)
    expect(cellText(attRow!, 25)).toBe('1'); // Y: Tổng số buổi đã học (năm)

    const oct = blocks.find((b) => b.month === 10 && b.year === 2026);
    expect(oct).toBeDefined();
    const day31 = oct!.dailyCols.find((d) => d.date.slice(0, 10) === '2026-10-31');
    expect(day31).toBeDefined();
    expect(cellText(attRow!, day31!.colNumber)).toBe('1');
    // 31/10 must not spill into column after end of T10 block
    expect(cellText(attRow!, oct!.endCol + 1)).toBe('');
  }, 60000);

  it('3. JLPT backup writes 2 sheets into hoc_vien_jlpt_<CVHT>.xlsx: Data JLPT_Inhouse (52 cols A..AZ, header=2) + Chấm buổi (12 fixed cols A..L, header=2, month blocks from M)', async () => {
    const runRes = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${csTestToken}`)
      .send({ forceFullRewrite: true });

    expect(runRes.status).toBe(200);
    const summary = runRes.body.data;
    expect(summary.csUserId).toBe(csTestId);
    expect(summary.staffCode).toBe(TEST_STAFF_CODE);
    expect(summary.programType).toBe('JLPT');
    expect(summary.status).toBe('SUCCESS');
    expect(summary.totalStudents).toBe(1);
    expect(summary.attendanceCellsWritten).toBe(1);
    expect(summary.profile).toBeDefined();
    expect(summary.profile.sheetName).toBe('Data JLPT_Inhouse');
    expect(summary.profile.totalEnrollments).toBe(1);
    expect(summary.attendance).toBeDefined();
    expect(summary.attendance.sheetName).toBe('Chấm buổi');
    expect(summary.attendance.totalEnrollments).toBe(1);

    const absFile = resolveBackupPath(summary.localFilePath);
    createdBackupFiles.push(absFile);
    expect(path.basename(absFile)).toBe(`hoc_vien_jlpt_${TEST_STAFF_CODE}.xlsx`);
    expect(fs.existsSync(absFile)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(absFile);

    // ---- Verify Sheet 1: `Data JLPT_Inhouse` (header row = 2, data from row 3, 52 cols A..AZ) ----
    const wsProfile = wb.getWorksheet('Data JLPT_Inhouse');
    expect(wsProfile).toBeDefined();
    expect(wsProfile!.columnCount).toBeGreaterThanOrEqual(52);
    expect(colNumberToLetter(52)).toBe('AZ');

    const profileRow = findRowByColValue(wsProfile!, EXTERNAL_ID_JLPT, 1, 2);
    expect(profileRow).not.toBeNull();
    expect(profileRow!.number).toBeGreaterThanOrEqual(3);

    expect(cellText(profileRow!, 1)).toBe(EXTERNAL_ID_JLPT); // A: ID
    expect(cellText(profileRow!, 2)).toBe('Sale A'); // B: Sale
    expect(cellText(profileRow!, 3)).toBe('HV mới'); // C: Tình trạng
    expect(cellText(profileRow!, 4)).toBe('2026-09-01'); // D: Ngày nộp học phí
    expect(cellText(profileRow!, 5)).toBe('Nguyễn Văn SBK JLPT'); // E: Họ tên HV
    expect(cellText(profileRow!, 6)).toBe('Nam'); // F: Giới tính
    expect(cellText(profileRow!, 7)).toBe('0912340001'); // G: SĐT
    expect(cellText(profileRow!, 8)).toBe('hv_sbkpg_jlpt@example.com'); // H: Email
    expect(cellText(profileRow!, 9)).toBe('Lớp 1-1'); // I: Mã gói
    expect(cellText(profileRow!, 10)).toBe('N4'); // J: Gói SP
    expect(cellText(profileRow!, 11)).toBe('8500000'); // K: Học phí thực nộp (meta.tuition_fee)
    expect(cellText(profileRow!, 12)).toBe('Full phí'); // L: Trạng thái thanh toán
    expect(cellText(profileRow!, 13)).toBe('Ghi chú sale JLPT'); // M: Ghi chú
    expect(cellText(profileRow!, 16)).toBe(TEST_STAFF_CODE); // P (16): CVHT
    expect(cellText(profileRow!, 17)).toBe('JLPT_SBK_TEST'); // Q (17): Mã khóa học
    expect(cellText(profileRow!, 18)).toBe('2026-10-01'); // R (18): Ngày bắt đầu học
    expect(cellText(profileRow!, 19)).toBe('Đang học'); // S (19): Trạng thái
    expect(cellText(profileRow!, 20)).toBe('20:00'); // T (20): Giờ học
    expect(cellText(profileRow!, 21)).toBe('T2-T4-T6'); // U (21): Buổi học
    expect(cellText(profileRow!, 22)).toBe('Sensei Backup Program 01'); // V (22): Giáo viên
    expect(cellText(profileRow!, 23)).toBe('CLS_SBKPG_CVHT99'); // W (23): Mã lớp
    expect(cellText(profileRow!, 24)).toBe('Lớp Backup Program Test CVHT99'); // X (24): Tên lớp
    expect(cellText(profileRow!, 25)).toBe('Trao đổi định kỳ JLPT'); // Y (25): Tóm tắt trao đổi
    expect(cellText(profileRow!, 26)).toBe('Gọi lại thứ 6'); // Z (26): Lịch hẹn tái chăm
    expect(cellText(profileRow!, 30)).toBe('Cần ôn kỹ phần Choukai'); // AD (30): Điểm nóng

    // CareLog milestones on `Data JLPT_Inhouse` (cols 31..36 -> AE..AJ)
    expect(cellText(profileRow!, 31)).toBe('JLPT chăm sóc buổi 1: Nắm vững lộ trình'); // AE: sau buổi 1
    expect(cellText(profileRow!, 32)).toBe('JLPT chăm sóc buổi 15: Hoàn thành bài tập đầy đủ'); // AF: sau buổi 15
    expect(cellText(profileRow!, 33)).toBe('JLPT chăm sóc buổi 25: Sẵn sàng luyện đề'); // AG: sau buổi 25
    expect(cellText(profileRow!, 36)).toBe('JLPT chăm sóc cuối khóa: Đạt mục tiêu đầu ra'); // AJ: cuối khóa (care.40)
    expect(cellText(profileRow!, 37)).toBe('Tư vấn lộ trình N3'); // AK: Chăm sóc sau kết thúc

    // Test scores 1..7 from program_metadata.test_scores (cols 38..44 -> AL..AR)
    expect(cellText(profileRow!, 38)).toBe('85'); // AL: Kiểm tra lần 1
    expect(cellText(profileRow!, 39)).toBe('88'); // AM: Kiểm tra lần 2
    expect(cellText(profileRow!, 40)).toBe('90'); // AN: Kiểm tra lần 3
    expect(cellText(profileRow!, 41)).toBe('92'); // AO: Kiểm tra lần 4
    expect(cellText(profileRow!, 42)).toBe('94'); // AP: Kiểm tra lần 5
    expect(cellText(profileRow!, 43)).toBe('95'); // AQ: Kiểm tra lần 6
    expect(cellText(profileRow!, 44)).toBe('98'); // AR: Kiểm tra lần 7

    // Special support & trailing metadata cols 45..52 (AS..AZ)
    expect(cellText(profileRow!, 45)).toBe('Bổ trợ ngữ pháp lần 1'); // AS
    expect(cellText(profileRow!, 48)).toBe('Đăng ký lên N3'); // AV: Tái tục
    expect(cellText(profileRow!, 50)).toBe('09/2026'); // AX: Tháng nộp học phí
    expect(cellText(profileRow!, 52)).toBe('Đạt'); // AZ (52): Tình trạng thi

    // ---- Verify Sheet 2: `Chấm buổi` (header row = 2, data from row 3, 12 fixed cols A..L + month blocks from col M=13) ----
    const wsAtt = wb.getWorksheet('Chấm buổi');
    expect(wsAtt).toBeDefined();
    expect(colNumberToLetter(12)).toBe('L');
    expect(colNumberToLetter(13)).toBe('M');

    const blocks = monthBlocks(wsAtt!, 2);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].startCol).toBe(13); // Col M

    // In JLPT `Chấm buổi`, col A (1) = Mã lớp, col B (2) = ID học viên
    const attRow = findRowByColValue(wsAtt!, EXTERNAL_ID_JLPT, 2, 2);
    expect(attRow).not.toBeNull();
    expect(attRow!.number).toBeGreaterThanOrEqual(3);

    expect(cellText(attRow!, 1)).toBe('CLS_SBKPG_CVHT99'); // A: Mã lớp
    expect(cellText(attRow!, 2)).toBe(EXTERNAL_ID_JLPT); // B: ID học viên
    expect(cellText(attRow!, 3)).toBe('Nguyễn Văn SBK JLPT'); // C: Tên học viên
    expect(cellText(attRow!, 4)).toBe('Đang học'); // D: Trạng thái
    expect(cellText(attRow!, 5)).toBe('20:00'); // E: Giờ học
    expect(cellText(attRow!, 7)).toBe(TEST_STAFF_CODE); // G: CVHT
    expect(cellText(attRow!, 8)).toBe('T2-T4-T6'); // H: Lịch học
    expect(cellText(attRow!, 9)).toBe('50'); // I: Thời lượng buổi học
    expect(cellText(attRow!, 10)).toBe('GV_SBKPG_01'); // J: Mã GV
    expect(cellText(attRow!, 11)).toBe('12'); // K: Tổng số buổi
    expect(cellText(attRow!, 12)).toBe('1'); // L: Số buổi đã học

    const oct = blocks.find((b) => b.month === 10 && b.year === 2026);
    expect(oct).toBeDefined();
    const day05 = oct!.dailyCols.find((d) => d.date.slice(0, 10) === '2026-10-05');
    expect(day05).toBeDefined();
    expect(cellText(attRow!, day05!.colNumber)).toBe('C');

    const day04 = oct!.dailyCols.find((d) => d.date.slice(0, 10) === '2026-10-04');
    expect(day04).toBeDefined();
    expect(cellText(attRow!, day04!.colNumber)).toBe('');

    // Timezone guard: 05/10 must not leak into T9/2026
    const sep = blocks.find((b) => b.month === 9 && b.year === 2026);
    expect(sep).toBeDefined();
    if (sep) {
      for (const d of sep.dailyCols) {
        expect(cellText(attRow!, d.colNumber)).toBe('');
      }
    }
  }, 60000);

  it('4. year=2025 filter writes zero attendance cells (all test sessions are in 2026)', async () => {
    const runRes = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${csTestToken}`)
      .send({ year: 2025 });

    expect(runRes.status).toBe(200);
    expect(runRes.body.data.status).toBe('SUCCESS');
    expect(runRes.body.data.yearFilter).toBe(2025);
    expect(runRes.body.data.attendanceCellsWritten).toBe(0);
  }, 60000);

  it('5. Re-running with unchanged data yields unchangedRows === totalStudents and updatedCellsCount === 0', async () => {
    // First converge with default year filter (null) - test 4 ran year=2025 which
    // resets the in-year stats columns, so one extra run is needed before the
    // idempotency contract can be asserted.
    await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${csTestToken}`)
      .send({ forceFullRewrite: false });

    const runRes = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${csTestToken}`)
      .send({ forceFullRewrite: false });

    expect(runRes.status).toBe(200);
    const summary = runRes.body.data;
    expect(summary.status).toBe('SUCCESS');
    expect(summary.updatedCellsCount).toBe(0);
    expect(summary.updatedRows).toBe(0);
    expect(summary.appendedRows).toBe(0);
    expect(summary.unchangedRows).toBe(summary.totalStudents);
    expect(summary.profile.unchangedRows).toBe(summary.totalStudents);
    expect(summary.profile.updatedCellsCount).toBe(0);
    expect(summary.attendance.unchangedRows).toBe(summary.totalStudents);
    expect(summary.attendance.updatedCellsCount).toBe(0);
  }, 60000);

  it('6. CVHT02 cannot run or download CVHT99 config (403); CVHT99 can download own backup', async () => {
    const forbiddenRun = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${cvht02Token}`)
      .send({});
    expect(forbiddenRun.status).toBe(403);

    const forbiddenDownload = await request(app)
      .get(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/download`)
      .set('Authorization', `Bearer ${cvht02Token}`);
    expect(forbiddenDownload.status).toBe(403);

    const allowedDownload = await request(app)
      .get(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/download`)
      .set('Authorization', `Bearer ${csTestToken}`);
    expect(allowedDownload.status).toBe(200);
    expect(allowedDownload.headers['content-disposition']).toContain(`hoc_vien_jlpt_${TEST_STAFF_CODE}`);
  });

  it('7. Column Config & Service Account: GET returns 60/28 (KAIWA) & 52/12 (JLPT); PUT blocks CS/MANAGE (403) & allows ADMIN to disable/move column; Reset restores defaults; Service Account PUT is ADMIN-only', async () => {
    // 7a. GET /api/v1/imports/sheet-backup/column-config
    const getRes = await request(app)
      .get('/api/v1/imports/sheet-backup/column-config')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    const { columnConfig, serviceAccount } = getRes.body.data;
    expect(serviceAccount).toBeDefined();
    expect(typeof serviceAccount.configured).toBe('boolean');

    expect(columnConfig.KAIWA.profile.defaultSheetName).toBe('1.Chăm sóc');
    expect(columnConfig.KAIWA.profile.headerRow).toBe(3);
    expect(columnConfig.KAIWA.profile.firstDataRow).toBe(4);
    expect(columnConfig.KAIWA.profile.columns).toHaveLength(60);

    expect(columnConfig.KAIWA.attendance.defaultSheetName).toBe('3.Chấm buổi');
    expect(columnConfig.KAIWA.attendance.headerRow).toBe(2);
    expect(columnConfig.KAIWA.attendance.firstDataRow).toBe(3);
    expect(columnConfig.KAIWA.attendance.columns).toHaveLength(28);

    expect(columnConfig.JLPT.profile.defaultSheetName).toBe('Data JLPT_Inhouse');
    expect(columnConfig.JLPT.profile.headerRow).toBe(2);
    expect(columnConfig.JLPT.profile.firstDataRow).toBe(3);
    expect(columnConfig.JLPT.profile.columns).toHaveLength(52);

    expect(columnConfig.JLPT.attendance.defaultSheetName).toBe('Chấm buổi');
    expect(columnConfig.JLPT.attendance.headerRow).toBe(2);
    expect(columnConfig.JLPT.attendance.firstDataRow).toBe(3);
    expect(columnConfig.JLPT.attendance.columns).toHaveLength(12);

    // 7b. PUT /api/v1/imports/sheet-backup/column-config: CS & MANAGE blocked with 403
    const csPutRes = await request(app)
      .put('/api/v1/imports/sheet-backup/column-config')
      .set('Authorization', `Bearer ${csTestToken}`)
      .send({ JLPT: columnConfig.JLPT });
    expect(csPutRes.status).toBe(403);

    const managePutRes = await request(app)
      .put('/api/v1/imports/sheet-backup/column-config')
      .set('Authorization', `Bearer ${manageToken}`)
      .send({ JLPT: columnConfig.JLPT });
    expect(managePutRes.status).toBe(403);

    // 7c. ADMIN disables `enr.sales_note` (col 13 = M) and moves `enr.hot_issue_note` from col 30 (AD) to col 53 (BA) on `Data JLPT_Inhouse`
    const modifiedJlpt = JSON.parse(JSON.stringify(columnConfig.JLPT));
    const salesNoteCol = modifiedJlpt.profile.columns.find((c: any) => c.fieldKey === 'enr.sales_note');
    const hotIssueCol = modifiedJlpt.profile.columns.find((c: any) => c.fieldKey === 'enr.hot_issue_note');
    expect(salesNoteCol).toBeDefined();
    expect(hotIssueCol).toBeDefined();
    salesNoteCol.enabled = false;
    hotIssueCol.col = 53; // BA

    const adminPutRes = await request(app)
      .put('/api/v1/imports/sheet-backup/column-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ JLPT: modifiedJlpt });
    expect(adminPutRes.status).toBe(200);

    const savedCols = adminPutRes.body.data.columnConfig.JLPT.profile.columns as any[];
    const savedSalesNote = savedCols.find((c) => c.fieldKey === 'enr.sales_note');
    const savedHotIssue = savedCols.find((c) => c.fieldKey === 'enr.hot_issue_note');
    expect(savedSalesNote.enabled).toBe(false);
    expect(savedHotIssue.col).toBe(53);
    expect(savedHotIssue.colLetter).toBe('BA');

    // Put a manual sentinel value into col 13 (M) of `Data JLPT_Inhouse` and run backup:
    // because `enr.sales_note` is disabled, col 13 must NOT be overwritten, while col 53 (BA) receives `hot_issue_note`.
    const jlptBackupPath = resolveBackupPath(`backups/cskh/hoc_vien_jlpt_${TEST_STAFF_CODE}.xlsx`);
    const wbBefore = new ExcelJS.Workbook();
    await wbBefore.xlsx.readFile(jlptBackupPath);
    const wsBefore = wbBefore.getWorksheet('Data JLPT_Inhouse')!;
    const rowBefore = findRowByColValue(wsBefore, EXTERNAL_ID_JLPT, 1, 2)!;
    rowBefore.getCell(13).value = 'MANUAL_KEEP_NOTE_DO_NOT_OVERWRITE';
    await wbBefore.xlsx.writeFile(jlptBackupPath);

    const runWithCustomCols = await request(app)
      .post(`/api/v1/imports/sheet-backup/configs/${jlptConfigId}/run`)
      .set('Authorization', `Bearer ${csTestToken}`)
      .send({ forceFullRewrite: false });
    expect(runWithCustomCols.status).toBe(200);

    const wbAfter = new ExcelJS.Workbook();
    await wbAfter.xlsx.readFile(jlptBackupPath);
    const wsAfter = wbAfter.getWorksheet('Data JLPT_Inhouse')!;
    const rowAfter = findRowByColValue(wsAfter, EXTERNAL_ID_JLPT, 1, 2)!;
    expect(cellText(rowAfter, 13)).toBe('MANUAL_KEEP_NOTE_DO_NOT_OVERWRITE');
    expect(cellText(rowAfter, 53)).toBe('Cần ôn kỹ phần Choukai');

    // 7d. POST /api/v1/imports/sheet-backup/column-config/reset: CS/MANAGE blocked (403), ADMIN restores defaults
    const manageResetRes = await request(app)
      .post('/api/v1/imports/sheet-backup/column-config/reset')
      .set('Authorization', `Bearer ${manageToken}`)
      .send({});
    expect(manageResetRes.status).toBe(403);

    const resetRes = await request(app)
      .post('/api/v1/imports/sheet-backup/column-config/reset')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ programType: 'JLPT' });
    expect(resetRes.status).toBe(200);
    const resetCols = resetRes.body.data.columnConfig.JLPT.profile.columns as any[];
    expect(resetCols.find((c) => c.fieldKey === 'enr.sales_note').enabled).toBe(true);
    expect(resetCols.find((c) => c.fieldKey === 'enr.sales_note').col).toBe(13);
    expect(resetCols.find((c) => c.fieldKey === 'enr.hot_issue_note').col).toBe(30);
    expect(resetCols.find((c) => c.fieldKey === 'enr.hot_issue_note').colLetter).toBe('AD');

    // 7e. PUT /api/v1/imports/sheet-sync/service-account: MANAGE and CS blocked (403), ADMIN allowed
    const manageSaRes = await request(app)
      .put('/api/v1/imports/sheet-sync/service-account')
      .set('Authorization', `Bearer ${manageToken}`)
      .send({ service_account_json: null });
    expect(manageSaRes.status).toBe(403);

    const csSaRes = await request(app)
      .put('/api/v1/imports/sheet-sync/service-account')
      .set('Authorization', `Bearer ${csTestToken}`)
      .send({ service_account_json: null });
    expect(csSaRes.status).toBe(403);

    const adminSaRes = await request(app)
      .put('/api/v1/imports/sheet-sync/service-account')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ service_account_json: null });
    expect(adminSaRes.status).toBe(200);
    expect(adminSaRes.body.data.serviceAccount).toBeDefined();
  }, 60000);
});
