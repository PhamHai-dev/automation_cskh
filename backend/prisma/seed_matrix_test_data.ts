import { PrismaClient, AttendanceStatus, AttendanceSource, EnrollmentStatus, EnrollmentClassStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function seedMatrixTestData() {
  console.log('🚀 Bắt đầu tạo dữ liệu test ma trận điểm danh...');

  // 1. Get or create Admin & CS & Teacher
  let admin = await prisma.user.findFirst({ where: { email: 'admin@gmail.com' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: 'Quản trị viên',
        email: 'admin@gmail.com',
        password_hash: '$2b$10$wO3J2vA4X8gBf1u0J1zQ4OuX4Z4gBf1u0J1zQ4OuX4Z4gBf1u0J1z',
        roles: ['ADMIN'],
        active: true,
      },
    });
  }

  let csUser = await prisma.user.findFirst({ where: { email: 'cskh@gmail.com' } });
  if (!csUser) {
    csUser = await prisma.user.create({
      data: {
        name: 'Nguyễn CSKH',
        email: 'cskh@gmail.com',
        password_hash: '$2b$10$wO3J2vA4X8gBf1u0J1zQ4OuX4Z4gBf1u0J1zQ4OuX4Z4gBf1u0J1z',
        roles: ['CS'],
        active: true,
      },
    });
  }

  let teacher = await prisma.user.findFirst({ where: { email: 'tanaka@example.com' } });
  if (!teacher) {
    teacher = await prisma.user.create({
      data: {
        name: 'Sensei Tanaka Kenji',
        email: 'tanaka@example.com',
        password_hash: '$2b$10$wO3J2vA4X8gBf1u0J1zQ4OuX4Z4gBf1u0J1zQ4OuX4Z4gBf1u0J1z',
        roles: ['TEACHER'],
        active: true,
      },
    });
  }

  // Teacher Profile
  await prisma.teacherProfile.upsert({
    where: { user_id: teacher.id },
    create: {
      user_id: teacher.id,
      teacher_code: 'GV_JP01',
      teacher_type: 'JAPANESE',
    },
    update: {
      teacher_code: 'GV_JP01',
      teacher_type: 'JAPANESE',
    },
  });

  // Second Teacher
  const teacher2 = await prisma.user.upsert({
    where: { email: 'maianh@example.com' },
    create: {
      name: 'Cô Trần Mai Anh',
      email: 'maianh@example.com',
      password_hash: '$2b$10$wO3J2vA4X8gBf1u0J1zQ4OuX4Z4gBf1u0J1zQ4OuX4Z4gBf1u0J1z',
      roles: ['TEACHER'],
      active: true,
    },
    update: {},
  });

  await prisma.teacherProfile.upsert({
    where: { user_id: teacher2.id },
    create: {
      user_id: teacher2.id,
      teacher_code: 'GV_VN02',
      teacher_type: 'VIETNAMESE',
    },
    update: {
      teacher_code: 'GV_VN02',
      teacher_type: 'VIETNAMESE',
    },
  });

  // 2. Package
  const pkg = await prisma.package.upsert({
    where: { code: 'PKG_JP_30' },
    create: {
      code: 'PKG_JP_30',
      name: 'Khóa Tiếng Nhật Chuẩn 30 Buổi',
      default_total_sessions: 30,
      active: true,
    },
    update: {},
  });

  // 3. Classes
  const class1 = await prisma.class.upsert({
    where: { id: 1 },
    create: {
      class_name: 'Lớp N5 - K01 (246 Sáng)',
      class_code: 'CLASS_01',
      level: 'N5',
      model_type: 'GROUP',
      attendance_source: 'LEARNING_SYSTEM',
      active: true,
      class_teachers: {
        create: {
          teacher_id: teacher.id,
          role: 'MAIN',
          start_date: new Date('2026-08-01'),
        },
      },
      class_schedules: {
        create: {
          schedule_pattern: '2,4,6',
          start_time: '08:00',
          duration_minutes: 90,
        },
      },
    },
    update: {
      class_name: 'Lớp N5 - K01 (246 Sáng)',
      class_code: 'CLASS_01',
      level: 'N5',
    },
  });

  const class2 = await prisma.class.upsert({
    where: { id: 2 },
    create: {
      class_name: 'Lớp N4 - K02 (357 Tối)',
      class_code: 'CLASS_02',
      level: 'N4',
      model_type: 'GROUP',
      attendance_source: 'LEARNING_SYSTEM',
      active: true,
      class_teachers: {
        create: {
          teacher_id: teacher2.id,
          role: 'MAIN',
          start_date: new Date('2026-08-15'),
        },
      },
      class_schedules: {
        create: {
          schedule_pattern: '3,5,7',
          start_time: '20:00',
          duration_minutes: 45,
        },
      },
    },
    update: {
      class_name: 'Lớp N4 - K02 (357 Tối)',
      class_code: 'CLASS_02',
      level: 'N4',
    },
  });

  // 4. Sample Students matching Sheet 1 & Sheet 3
  const sampleStudents = [
    { extId: 'HV_001', name: 'Nguyễn Văn An', phone: '0912345678', email: 'an.nguyen@gmail.com', status: 'STUDYING', remaining: 18 },
    { extId: 'HV_002', name: 'Trần Thị Mai', phone: '0987654321', email: 'mai.tran@gmail.com', status: 'STUDYING', remaining: 12 },
    { extId: 'HV_003', name: 'Lê Hoàng Long', phone: '0905123456', email: 'long.le@gmail.com', status: 'STUDYING', remaining: 5 },
    { extId: 'HV_004', name: 'Phạm Minh Đức', phone: '0934567890', email: 'duc.pham@gmail.com', status: 'PAUSED', remaining: 20 },
    { extId: 'HV_005', name: 'Hoàng Thu Trang', phone: '0978901234', email: 'trang.hoang@gmail.com', status: 'STUDYING', remaining: -2 }, // Debt case
    { extId: 'HV_006', name: 'Vũ Hải Đăng', phone: '0967890123', email: 'dang.vu@gmail.com', status: 'STUDYING', remaining: 8 },
    { extId: 'HV_007', name: 'Đỗ Bích Ngọc', phone: '0945678901', email: 'ngoc.do@gmail.com', status: 'STUDYING', remaining: 15 },
    { extId: 'HV_008', name: 'Bùi Anh Tuấn', phone: '0923456789', email: 'tuan.bui@gmail.com', status: 'STUDYING', remaining: -1 }, // Debt case
  ];

  console.log('Dọn dẹp dữ liệu cũ của Lớp 1 nếu có...');
  // Delete previous attendances, sessions and enrollment_classes for clean seeding
  await prisma.attendance.deleteMany({
    where: {
      OR: [
        { class_session: { class_id: class1.id } },
        { enrollment_class: { class_id: class1.id } },
      ],
    },
  });
  await prisma.classSession.deleteMany({
    where: { class_id: class1.id },
  });
  await prisma.enrollmentClass.deleteMany({
    where: { class_id: class1.id },
  });

  console.log(`Đang khởi tạo ${sampleStudents.length} học viên và ghi danh vào Lớp 1...`);
  const enrollmentClasses: any[] = [];

  for (let i = 0; i < sampleStudents.length; i++) {
    const s = sampleStudents[i];
    const student = await prisma.student.upsert({
      where: { external_id: s.extId },
      create: {
        external_id: s.extId,
        full_name: s.name,
        phone: s.phone,
        email: s.email,
        gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
      },
      update: {
        full_name: s.name,
        phone: s.phone,
        email: s.email,
      },
    });

    let enrollment = await prisma.enrollment.findFirst({
      where: { student_id: student.id },
    });

    if (!enrollment) {
      enrollment = await prisma.enrollment.create({
        data: {
          external_id: s.extId,
          student_id: student.id,
          package_id: pkg.id,
          cs_id: csUser.id,
          total_sessions: 30,
          external_remaining_sessions: s.remaining,
          start_date: new Date('2026-08-15'),
          end_date: new Date('2026-11-15'),
          status: s.status as EnrollmentStatus,
        },
      });
    } else {
      enrollment = await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          external_remaining_sessions: s.remaining,
          status: s.status as EnrollmentStatus,
        },
      });
    }

    const ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollment.id,
        class_id: class1.id,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
        start_date: new Date('2026-08-15'),
        end_date: new Date('2026-11-15'),
      },
    });

    enrollmentClasses.push(ec);
  }

  // 5. Create Sessions across September 2026 on MWF (2, 4, 6)
  console.log('Đang tạo các buổi học theo lịch Thứ 2, 4, 6 trong Tháng 9/2026...');

  // Calendar dates for September 2026 (Year 2026, Month 9):
  // 2026-09-02 (T4), 2026-09-04 (T6), 2026-09-07 (T2), 2026-09-09 (T4), 2026-09-11 (T6),
  // 2026-09-14 (T2), 2026-09-16 (T4), 2026-09-18 (T6), 2026-09-21 (T2), 2026-09-23 (T4),
  // 2026-09-25 (T6), 2026-09-28 (T2), 2026-09-30 (T4)
  const mwfDatesSept2026 = [
    new Date('2026-09-02T01:00:00Z'),
    new Date('2026-09-04T01:00:00Z'),
    new Date('2026-09-07T01:00:00Z'),
    new Date('2026-09-09T01:00:00Z'),
    new Date('2026-09-11T01:00:00Z'),
    new Date('2026-09-14T01:00:00Z'),
    new Date('2026-09-16T01:00:00Z'),
    new Date('2026-09-18T01:00:00Z'),
    new Date('2026-09-21T01:00:00Z'),
    new Date('2026-09-23T01:00:00Z'),
    new Date('2026-09-25T01:00:00Z'),
    new Date('2026-09-28T01:00:00Z'),
    new Date('2026-09-30T01:00:00Z'),
  ];

  // Distribution of statuses to create a rich and realistic matrix
  const statusPool: AttendanceStatus[] = [
    AttendanceStatus.ATTENDED,
    AttendanceStatus.ATTENDED,
    AttendanceStatus.ATTENDED,
    AttendanceStatus.ATTENDED,
    AttendanceStatus.ATTENDED,
    AttendanceStatus.ABSENT_APPROVED_A,
    AttendanceStatus.LEAVE_B,
    AttendanceStatus.ABSENT_UNAPPROVED_C,
    AttendanceStatus.TEACHER_ABSENT_D,
    AttendanceStatus.TECH_ERROR_E,
  ];

  let totalAttendancesCreated = 0;

  for (let sIdx = 0; sIdx < mwfDatesSept2026.length; sIdx++) {
    const sessionDate = mwfDatesSept2026[sIdx];
    const sessionNum = sIdx + 1;
    const isPast = sessionDate <= new Date('2026-09-21T23:59:59Z');

    const session = await prisma.classSession.create({
      data: {
        class_id: class1.id,
        session_number: sessionNum,
        session_date: sessionDate,
        start_time: '20:00',
        end_time: '21:30',
        teacher_id: teacher.id,
        status: isPast ? 'COMPLETED' : 'SCHEDULED',
        created_by_id: admin.id,
      },
    });

    // For past or current sessions, record attendance for students
    if (isPast) {
      for (let stIdx = 0; stIdx < enrollmentClasses.length; stIdx++) {
        const ec = enrollmentClasses[stIdx];
        // Select status
        let assignedStatus: AttendanceStatus = AttendanceStatus.ATTENDED;
        if (stIdx === 3) {
          assignedStatus = AttendanceStatus.LEAVE_B; // Student 4 is on leave (Bảo lưu)
        } else if ((sIdx + stIdx) % 7 === 0) {
          assignedStatus = AttendanceStatus.ABSENT_APPROVED_A;
        } else if ((sIdx + stIdx) % 11 === 0) {
          assignedStatus = AttendanceStatus.ABSENT_UNAPPROVED_C;
        } else if (sIdx === 2 && stIdx === 0) {
          assignedStatus = AttendanceStatus.TEACHER_ABSENT_D;
        } else if (sIdx === 5 && stIdx === 2) {
          assignedStatus = AttendanceStatus.TECH_ERROR_E;
        }

        await prisma.attendance.create({
          data: {
            enrollment_class_id: ec.id,
            class_session_id: session.id,
            status: assignedStatus,
            source: AttendanceSource.MANUAL,
            created_by_id: admin.id,
          },
        });
        totalAttendancesCreated++;
      }
    }
  }

  // 6. Also Seed Class 2 (Lớp N4 - K02 - 357 Tối)
  console.log('Đang khởi tạo dữ liệu cho Lớp 2 (N4 - K02)...');
  await prisma.attendance.deleteMany({
    where: {
      OR: [
        { class_session: { class_id: class2.id } },
        { enrollment_class: { class_id: class2.id } },
      ],
    },
  });
  await prisma.classSession.deleteMany({ where: { class_id: class2.id } });
  await prisma.enrollmentClass.deleteMany({ where: { class_id: class2.id } });

  const sampleStudents2 = [
    { extId: 'HV_101', name: 'Đặng Quốc Huy', phone: '0981112233', email: 'huy.dang@gmail.com', status: 'STUDYING', remaining: 22 },
    { extId: 'HV_102', name: 'Lê Thảo My', phone: '0982223344', email: 'my.le@gmail.com', status: 'STUDYING', remaining: 10 },
    { extId: 'HV_103', name: 'Phạm Tiến Dũng', phone: '0983334455', email: 'dung.pham@gmail.com', status: 'STUDYING', remaining: 3 },
    { extId: 'HV_104', name: 'Ngô Thanh Hương', phone: '0984445566', email: 'huong.ngo@gmail.com', status: 'STUDYING', remaining: -1 },
    { extId: 'HV_105', name: 'Vũ Đức Minh', phone: '0985556677', email: 'minh.vu@gmail.com', status: 'STUDYING', remaining: 14 },
  ];

  const ecList2: any[] = [];
  for (let i = 0; i < sampleStudents2.length; i++) {
    const s = sampleStudents2[i];
    const student = await prisma.student.upsert({
      where: { external_id: s.extId },
      create: {
        external_id: s.extId,
        full_name: s.name,
        phone: s.phone,
        email: s.email,
        gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
      },
      update: { full_name: s.name, phone: s.phone, email: s.email },
    });

    let enrollment = await prisma.enrollment.findFirst({ where: { student_id: student.id } });
    if (!enrollment) {
      enrollment = await prisma.enrollment.create({
        data: {
          external_id: s.extId,
          student_id: student.id,
          package_id: pkg.id,
          cs_id: csUser.id,
          total_sessions: 30,
          external_remaining_sessions: s.remaining,
          start_date: new Date('2026-08-15'),
          end_date: new Date('2026-11-15'),
          status: s.status as EnrollmentStatus,
        },
      });
    }

    const ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollment.id,
        class_id: class2.id,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
        start_date: new Date('2026-08-15'),
        end_date: new Date('2026-11-15'),
      },
    });
    ecList2.push(ec);
  }

  // Schedule for 357 (Tue, Thu, Sat):
  // 2026-09-01 (T3), 2026-09-03 (T5), 2026-09-05 (T7), 2026-09-08 (T3), 2026-09-10 (T5),
  // 2026-09-12 (T7), 2026-09-15 (T3), 2026-09-17 (T5), 2026-09-19 (T7), 2026-09-22 (T3),
  // 2026-09-24 (T5), 2026-09-26 (T7), 2026-09-29 (T3)
  const ttsDatesSept2026 = [
    new Date('2026-09-01T01:00:00Z'),
    new Date('2026-09-03T01:00:00Z'),
    new Date('2026-09-05T01:00:00Z'),
    new Date('2026-09-08T01:00:00Z'),
    new Date('2026-09-10T01:00:00Z'),
    new Date('2026-09-12T01:00:00Z'),
    new Date('2026-09-15T01:00:00Z'),
    new Date('2026-09-17T01:00:00Z'),
    new Date('2026-09-19T01:00:00Z'),
    new Date('2026-09-22T01:00:00Z'),
    new Date('2026-09-24T01:00:00Z'),
    new Date('2026-09-26T01:00:00Z'),
    new Date('2026-09-29T01:00:00Z'),
  ];

  for (let sIdx = 0; sIdx < ttsDatesSept2026.length; sIdx++) {
    const sessionDate = ttsDatesSept2026[sIdx];
    const isPast = sessionDate <= new Date('2026-09-21T23:59:59Z');
    const session = await prisma.classSession.create({
      data: {
        class_id: class2.id,
        session_number: sIdx + 1,
        session_date: sessionDate,
        start_time: '20:00',
        end_time: '20:45',
        teacher_id: teacher2.id,
        status: isPast ? 'COMPLETED' : 'SCHEDULED',
        created_by_id: admin.id,
      },
    });

    if (isPast) {
      for (let stIdx = 0; stIdx < ecList2.length; stIdx++) {
        const ec = ecList2[stIdx];
        let assignedStatus: AttendanceStatus = AttendanceStatus.ATTENDED;
        if ((sIdx + stIdx) % 5 === 0) assignedStatus = AttendanceStatus.ABSENT_APPROVED_A;
        if ((sIdx + stIdx) % 8 === 0) assignedStatus = AttendanceStatus.LEAVE_B;

        await prisma.attendance.create({
          data: {
            enrollment_class_id: ec.id,
            class_session_id: session.id,
            status: assignedStatus,
            source: AttendanceSource.MANUAL,
            created_by_id: admin.id,
          },
        });
      }
    }
  }

  console.log(`✅ Đã tạo thành công dữ liệu ma trận cho cả Lớp 1 và Lớp 2!`);
  console.log(`- Lớp 1 (ID: ${class1.id}): ${sampleStudents.length} học viên, ${mwfDatesSept2026.length} buổi học`);
  console.log(`- Lớp 2 (ID: ${class2.id}): ${sampleStudents2.length} học viên, ${ttsDatesSept2026.length} buổi học`);
  console.log('🎉 Hoàn tất nạp dữ liệu test cho Ma trận Điểm danh!');
}

seedMatrixTestData()
  .catch((e) => {
    console.error('Lỗi khi nạp dữ liệu test:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
