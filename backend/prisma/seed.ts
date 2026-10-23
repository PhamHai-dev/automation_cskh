/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  AttendanceSourceType,
  EnrollmentClassStatus,
  EnrollmentStatus,
  ImportBatchStatus,
  ImportType,
  Prisma,
  PrismaClient,
  TeacherType,
} from '@prisma/client';
import {
  NormalizedSheetRow,
  loadOptimizedWorkbook,
  mapClassModelType,
  parseJlptSheetRows,
  parseKaiwaSheetRows,
} from '../src/modules/imports/sheet-sync.parser';

const prisma = new PrismaClient();
const JLPT_FILE = path.resolve(__dirname, '../../docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
const KAIWA_FILE = path.resolve(__dirname, '../../docs/data/hoc_vien/hoc_vien_kaiwa.xlsx');
const SAMPLES_PER_PROGRAM = 18;

function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function selectRepresentativeRows(rows: NormalizedSheetRow[], count: number): NormalizedSheetRow[] {
  const selected: NormalizedSheetRow[] = [];
  const usedKeys = new Set<string>();

  const addIfNotUsed = (r?: NormalizedSheetRow) => {
    if (r && !usedKeys.has(r.syncKey) && selected.length < count) {
      usedKeys.add(r.syncKey);
      selected.push(r);
    }
  };

  // Prioritize active/studying, waiting class, paused, finished across CVHT01, CVHT02, CVHT03
  const cvhtCodes = ['CVHT01', 'CVHT02', 'CVHT03'];
  const statuses: EnrollmentStatus[] = [
    EnrollmentStatus.STUDYING,
    EnrollmentStatus.WAITING_CLASS,
    EnrollmentStatus.PAUSED,
    EnrollmentStatus.FINISHED,
  ];

  for (const status of statuses) {
    for (const cvht of cvhtCodes) {
      const matches = rows.filter((r) => r.cvhtCode === cvht && r.status === status);
      // Pick up to 2 from each combination
      addIfNotUsed(matches[0]);
      addIfNotUsed(matches[1]);
    }
  }

  // Ensure each CVHT has at least 5 records if available
  for (const cvht of cvhtCodes) {
    const matches = rows.filter((r) => r.cvhtCode === cvht);
    for (const m of matches) {
      if (selected.filter((s) => s.cvhtCode === cvht).length >= 6) break;
      addIfNotUsed(m);
    }
  }

  // Fill remaining up to count from the most recent rows (end of sheet) or start
  for (let i = rows.length - 1; i >= 0 && selected.length < count; i--) {
    addIfNotUsed(rows[i]);
  }

  return selected;
}

async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'
  `;
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');
  try {
    for (const { TABLE_NAME } of tables) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${TABLE_NAME.replace(/`/g, '``')}\`;`);
    }
  } finally {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
  }
}

async function main() {
  console.log('Đọc dữ liệu từ 2 file nguồn JLPT và Kaiwa...');
  const jlptWb = await loadOptimizedWorkbook(fs.readFileSync(JLPT_FILE), [
    'Data JLPT_Inhouse',
    'Setting',
    'Điểm học tập',
  ]);
  const allJlptRows = parseJlptSheetRows(jlptWb, 'Data JLPT_Inhouse', 'Setting', 2);

  const kaiwaWb = await loadOptimizedWorkbook(fs.readFileSync(KAIWA_FILE), ['Tổng']);
  const allKaiwaRows = parseKaiwaSheetRows(kaiwaWb, 'Tổng', 2);

  const selectedJlpt = selectRepresentativeRows(allJlptRows, SAMPLES_PER_PROGRAM);
  const selectedKaiwa = selectRepresentativeRows(allKaiwaRows, SAMPLES_PER_PROGRAM);

  // Ensure Kaiwa also has some CVHT03 representation if the source only had CVHT01/02
  if (!selectedKaiwa.some((r) => r.cvhtCode === 'CVHT03') && selectedKaiwa.length >= 3) {
    selectedKaiwa[selectedKaiwa.length - 1].cvhtCode = 'CVHT03';
    selectedKaiwa[selectedKaiwa.length - 2].cvhtCode = 'CVHT03';
  }

  console.log(
    `Đã chọn ${selectedJlpt.length} học viên JLPT (trên tổng ${allJlptRows.length}) và ${selectedKaiwa.length} học viên Kaiwa (trên tổng ${allKaiwaRows.length}).`
  );

  console.log('Xóa dữ liệu cũ...');
  await resetDatabase();

  const passwordHash = bcrypt.hashSync('123456', 10);
  const admin = await prisma.user.create({
    data: {
      name: 'Quản trị viên',
      email: 'admin@gmail.com',
      password_hash: passwordHash,
      roles: ['ADMIN'],
      active: true,
    },
  });

  const csUsers = await Promise.all([
    prisma.user.create({
      data: {
        code: 'CVHT01',
        staff_code: 'CVHT01',
        name: 'Trần Thị Hải Yến',
        email: 'cskh1@gmail.com',
        password_hash: passwordHash,
        roles: ['CS'],
        active: true,
        created_by_id: admin.id,
      },
    }),
    prisma.user.create({
      data: {
        code: 'CVHT02',
        staff_code: 'CVHT02',
        name: 'Lưu Thị Vân',
        email: 'cskh2@gmail.com',
        password_hash: passwordHash,
        roles: ['CS'],
        active: true,
        created_by_id: admin.id,
      },
    }),
    prisma.user.create({
      data: {
        code: 'CVHT03',
        staff_code: 'CVHT03',
        name: 'Đào Thị Minh Huyền',
        email: 'cskh3@gmail.com',
        password_hash: passwordHash,
        roles: ['CS'],
        active: true,
        created_by_id: admin.id,
      },
    }),
  ]);

  const cvhtMapping: Record<string, number> = {
    CVHT01: csUsers[0].id,
    CVHT02: csUsers[1].id,
    CVHT03: csUsers[2].id,
  };

  const defaultTeacherUser = await prisma.user.create({
    data: {
      name: 'Giáo viên phụ trách',
      email: 'teacher@gmail.com',
      password_hash: passwordHash,
      roles: ['TEACHER'],
      active: true,
      created_by_id: admin.id,
    },
  });

  const defaultTeacher = await prisma.teacher.create({
    data: {
      user_id: defaultTeacherUser.id,
      code: 'GV-MOCK',
      name: defaultTeacherUser.name ?? 'Giáo viên phụ trách',
      teacher_type: TeacherType.OTHER,
    },
  });

  const group = await prisma.cSGroup.create({ data: { group_name: 'Nhóm CSKH', active: true } });
  await prisma.cSGroupMember.createMany({
    data: csUsers.map((user) => ({ cs_group_id: group.id, user_id: user.id })),
  });
  await prisma.manageAssignment.create({ data: { manage_user_id: admin.id, cs_group_id: group.id } });

  // CareMilestoneConfig cho cả Kaiwa và JLPT: [1, 3, 10, 15, 20, 25, 27, 30, 35, 40]
  const milestones = [1, 3, 10, 15, 20, 25, 27, 30, 35, 40];
  await prisma.careMilestoneConfig.createMany({
    data: milestones.map((session, index) => ({
      session_number: session,
      display_order: index + 1,
      created_by_id: admin.id,
    })),
  });

  // Khởi tạo 2 bản ghi GoogleSheetSyncConfig (JLPT & KAIWA)
  const jlptConfig = await prisma.googleSheetSyncConfig.create({
    data: {
      code: 'JLPT',
      name: 'Dữ liệu Học viên JLPT',
      program_type: 'JLPT',
      local_file_path: 'docs/data/hoc_vien/hoc_vien_jlpt.xlsx',
      sheet_name: 'Data JLPT_Inhouse',
      setting_sheet_name: 'Setting',
      header_row: 2,
      cvht_mapping: cvhtMapping,
      default_cs_id: csUsers[0].id,
      sync_interval_minutes: 10,
      enabled: true,
      last_status: 'SUCCESS',
      last_synced_at: new Date(),
    },
  });

  const kaiwaConfig = await prisma.googleSheetSyncConfig.create({
    data: {
      code: 'KAIWA',
      name: 'Dữ liệu Học viên Kaiwa',
      program_type: 'KAIWA',
      local_file_path: 'docs/data/hoc_vien/hoc_vien_kaiwa.xlsx',
      sheet_name: 'Tổng',
      setting_sheet_name: null,
      header_row: 2,
      cvht_mapping: cvhtMapping,
      default_cs_id: csUsers[0].id,
      sync_interval_minutes: 10,
      enabled: true,
      last_status: 'SUCCESS',
      last_synced_at: new Date(),
    },
  });

  const allSeedRows: Array<{ row: NormalizedSheetRow; configId: number }> = [
    ...selectedJlpt.map((row) => ({ row, configId: jlptConfig.id })),
    ...selectedKaiwa.map((row) => ({ row, configId: kaiwaConfig.id })),
  ];

  for (let idx = 0; idx < allSeedRows.length; idx++) {
    const { row, configId } = allSeedRows[idx];
    const targetCsId = (row.cvhtCode && cvhtMapping[row.cvhtCode]) || csUsers[idx % csUsers.length].id;

    const saleCode = row.saleName || `SALE-${(idx % 3) + 1}`;
    const sale = await prisma.sale.upsert({
      where: { code: saleCode },
      update: {},
      create: { code: saleCode, name: saleCode, active: true },
    });

    const pkg = await prisma.package.upsert({
      where: { code: row.packageCode },
      update: { default_total_sessions: row.totalSessions },
      create: {
        code: row.packageCode,
        name: `Gói ${row.packageCode}`,
        default_total_sessions: row.totalSessions,
        active: true,
      },
    });

    const dobDate = row.dateOfBirth ? new Date(row.dateOfBirth) : null;
    const student = await prisma.student.upsert({
      where: { external_id: row.externalId },
      update: {
        full_name: row.fullName,
        gender: row.gender,
        phone: row.phone,
        email: row.email,
        date_of_birth: dobDate,
        occupation: row.occupation,
      },
      create: {
        external_id: row.externalId,
        full_name: row.fullName,
        gender: row.gender,
        phone: row.phone,
        email: row.email,
        date_of_birth: dobDate,
        occupation: row.occupation,
        note: row.salesNote,
      },
    });

    const paidAtDate = row.paidAt ? new Date(row.paidAt) : null;
    const startDateObj = row.startDate ? new Date(row.startDate) : null;
    const endDateObj = row.endDate ? new Date(row.endDate) : null;
    const handedOverObj = row.handedOverAt ? new Date(row.handedOverAt) : null;

    const enrollment = await prisma.enrollment.create({
      data: {
        external_id: row.externalId,
        external_sync_key: row.syncKey,
        program_type: row.programType,
        program_metadata: row.programMetadata as Prisma.InputJsonValue,
        student_id: student.id,
        package_id: pkg.id,
        cs_id: targetCsId,
        sale_id: sale.id,
        sale_name: saleCode,
        paid_at: paidAtDate,
        student_source_status: row.studentSourceStatus,
        course_content: row.courseContent,
        payment_status: row.paymentStatus,
        course_teacher_type: row.courseTeacherType,
        level: row.level,
        total_sessions: row.totalSessions,
        class_model: row.classModel,
        sales_note: row.salesNote,
        study_report_url: row.studyReportUrl,
        exchange_info: row.exchangeInfo,
        callback_note: row.callbackNote,
        hot_issue_note: row.hotIssueNote,
        post_course_care: row.postCourseCare,
        start_date: startDateObj,
        end_date: endDateObj,
        status: row.status,
        external_remaining_sessions: row.remainingSessions,
        attended_previous_years: row.attendedPreviousYears,
        external_synced_at: new Date(),
        handed_over_at: handedOverObj,
      },
    });

    const className = row.className || row.classCode || `${row.fullName} - ${row.packageCode}`;
    const classCode = row.classCode || `CLS-${row.programType}-${row.externalId}-${idx + 1}`;
    let learningClass = await prisma.class.findFirst({
      where: { OR: [{ class_code: classCode }, { class_name: className }] },
    });
    if (!learningClass) {
      learningClass = await prisma.class.create({
        data: {
          class_code: classCode,
          class_name: className,
          level: row.level,
          model_type: mapClassModelType(row.classModel),
          attendance_source: AttendanceSourceType.LEARNING_SYSTEM,
          active: true,
        },
      });
    }

    let teacherId = defaultTeacher.id;
    if (row.teacherName || row.teacherCode) {
      const tCode = (row.teacherCode || row.teacherName || 'GV').trim().slice(0, 50);
      const tRec = await prisma.teacher.upsert({
        where: { code: tCode },
        update: {},
        create: {
          code: tCode,
          name: row.teacherName || tCode,
          teacher_type: row.courseTeacherType?.includes('Nhật') ? TeacherType.JAPANESE : TeacherType.VIETNAMESE,
          active: true,
        },
      });
      teacherId = tRec.id;
    }

    const existingCT = await prisma.classTeacher.findFirst({
      where: { class_id: learningClass.id, teacher_id: teacherId },
    });
    if (!existingCT) {
      await prisma.classTeacher.create({
        data: {
          class_id: learningClass.id,
          teacher_id: teacherId,
          role: 'MAIN',
          start_date: startDateObj,
          active: true,
        },
      });
    }

    if (row.schedulePattern || row.startTime) {
      const existingSched = await prisma.classSchedule.findFirst({
        where: { class_id: learningClass.id },
      });
      if (!existingSched) {
        await prisma.classSchedule.create({
          data: {
            class_id: learningClass.id,
            schedule_pattern: row.schedulePattern || '246',
            start_time: row.startTime || '19:30',
            duration_minutes: row.durationMinutes || 90,
            valid_from: startDateObj,
            valid_to: endDateObj,
            active: true,
          },
        });
      }
    }

    await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollment.id,
        class_id: learningClass.id,
        sequence_no: 1,
        start_date: startDateObj,
        end_date: endDateObj,
        status:
          enrollment.status === EnrollmentStatus.FINISHED
            ? EnrollmentClassStatus.COMPLETED
            : enrollment.status === EnrollmentStatus.PAUSED
            ? EnrollmentClassStatus.TRANSFERRED
            : EnrollmentClassStatus.ACTIVE,
      },
    });

    if (row.careLogs.length > 0) {
      for (const cl of row.careLogs) {
        await prisma.careLog.create({
          data: {
            enrollment_id: enrollment.id,
            cs_id: targetCsId,
            after_session_number: cl.after_session_number,
            content: cl.content,
            outcome: cl.outcome,
            created_by_id: targetCsId,
          },
        });
      }
    }

    if (row.callbackNote) {
      await prisma.careTask.create({
        data: {
          enrollment_id: enrollment.id,
          assigned_to_id: targetCsId,
          type: 'CALLBACK',
          title: 'Lịch hẹn gọi từ Google Sheet',
          note: row.callbackNote,
          priority: 'NORMAL',
          status: 'PENDING',
        },
      });
    }

    if (row.hotIssueNote) {
      await prisma.careTask.create({
        data: {
          enrollment_id: enrollment.id,
          assigned_to_id: targetCsId,
          type: 'HOT_ISSUE',
          title: 'Điểm nóng từ Google Sheet',
          note: row.hotIssueNote,
          priority: 'HIGH',
          status: 'PENDING',
        },
      });
    }

    await prisma.googleSheetRowState.create({
      data: {
        config_id: configId,
        sync_key: row.syncKey,
        row_number: row.rowNumber,
        row_hash: sha256(JSON.stringify(row)),
        student_id: student.id,
        enrollment_id: enrollment.id,
      },
    });
  }

  const batch = await prisma.importBatch.create({
    data: {
      uploaded_by_id: admin.id,
      file_name: 'hoc_vien_jlpt.xlsx + hoc_vien_kaiwa.xlsx',
      import_type: ImportType.GOOGLE_SHEET_SYNC,
      total_rows: allSeedRows.length,
      success_rows: allSeedRows.length,
      failed_rows: 0,
      status: ImportBatchStatus.COMPLETED,
      completed_at: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      user_id: admin.id,
      action: 'SEED_GOOGLE_SHEET_SYNC',
      entity_type: 'ImportBatch',
      entity_id: String(batch.id),
      after_data: {
        jlptRows: selectedJlpt.length,
        kaiwaRows: selectedKaiwa.length,
      },
    },
  });

  const counts = {
    users: await prisma.user.count(),
    students: await prisma.student.count(),
    enrollments: await prisma.enrollment.count(),
    jlptEnrollments: await prisma.enrollment.count({ where: { program_type: 'JLPT' } }),
    kaiwaEnrollments: await prisma.enrollment.count({ where: { program_type: 'KAIWA' } }),
    syncConfigs: await prisma.googleSheetSyncConfig.count(),
    rowStates: await prisma.googleSheetRowState.count(),
    careMilestones: await prisma.careMilestoneConfig.count(),
  };
  console.log('Hoàn tất seed:', counts);
}

main()
  .catch((error) => {
    console.error('Seed thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
