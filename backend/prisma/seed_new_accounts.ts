import { PrismaClient, AttendanceStatus, AttendanceSource, EnrollmentStatus, EnrollmentClassStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedNewAccounts() {
  console.log('🚀 Bắt đầu reset và tạo 5 tài khoản mới theo yêu cầu...');

  // 1. Tắt tạm thời Foreign Key Checks để xóa sạch dữ liệu cũ
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

  const tablesToTruncate = [
    'users',
    'teacher_profiles',
    'class_teachers',
    'classes',
    'class_schedules',
    'class_sessions',
    'attendances',
    'students',
    'packages',
    'enrollments',
    'enrollment_classes',
    'auth_sessions',
    'login_audits',
    'password_reset_tokens',
    'care_logs',
    'care_tasks',
    'cs_groups',
    'cs_group_members',
    'manage_assignments',
  ];

  for (const table of tablesToTruncate) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\`;`);
    } catch (e) {
      // Bỏ qua nếu bảng không tồn tại
    }
  }

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('✅ Đã xóa sạch dữ liệu tài khoản và bảng liên quan.');

  // 2. Hash mật khẩu chung: 123456
  const passwordHash = bcrypt.hashSync('123456', 10);

  // 3. Tạo chính xác 5 tài khoản
  console.log('Đang tạo 5 tài khoản mới (Mật khẩu: 123456)...');

  const admin = await prisma.user.create({
    data: {
      name: 'Quản trị viên',
      email: 'admin@gmail.com',
      password_hash: passwordHash,
      roles: ['ADMIN'],
      active: true,
    },
  });

  const cskh1 = await prisma.user.create({
    data: {
      name: 'CSKH 1',
      email: 'cskh1@gmail.com',
      password_hash: passwordHash,
      roles: ['CS'],
      active: true,
    },
  });

  const cskh2 = await prisma.user.create({
    data: {
      name: 'CSKH 2',
      email: 'cskh2@gmail.com',
      password_hash: passwordHash,
      roles: ['CS'],
      active: true,
    },
  });

  const cskh3 = await prisma.user.create({
    data: {
      name: 'CSKH 3',
      email: 'cskh3@gmail.com',
      password_hash: passwordHash,
      roles: ['CS'],
      active: true,
    },
  });

  const teacher = await prisma.user.create({
    data: {
      name: 'Sensei Tanaka Kenji',
      email: 'teacher@gmail.com',
      password_hash: passwordHash,
      roles: ['TEACHER'],
      active: true,
    },
  });

  await prisma.teacherProfile.create({
    data: {
      user_id: teacher.id,
      teacher_code: 'GV_JP01',
      teacher_type: 'JAPANESE',
    },
  });

  console.log('✅ Đã tạo 5 tài khoản:');
  console.log('1. admin@gmail.com / 123456 (Role: ADMIN)');
  console.log('2. cskh1@gmail.com / 123456 (Role: CS)');
  console.log('3. cskh2@gmail.com / 123456 (Role: CS)');
  console.log('4. cskh3@gmail.com / 123456 (Role: CS)');
  console.log('5. teacher@gmail.com / 123456 (Role: TEACHER)');

  // 4. Tạo Gói học
  const pkg = await prisma.package.create({
    data: {
      code: 'PKG_JP_30',
      name: 'Khóa Tiếng Nhật Chuẩn 30 Buổi',
      default_total_sessions: 30,
      active: true,
    },
  });

  // 5. Tạo 2 Lớp học
  const class1 = await prisma.class.create({
    data: {
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
  });

  const class2 = await prisma.class.create({
    data: {
      class_name: 'Lớp N4 - K02 (357 Tối)',
      class_code: 'CLASS_02',
      level: 'N4',
      model_type: 'GROUP',
      attendance_source: 'LEARNING_SYSTEM',
      active: true,
      class_teachers: {
        create: {
          teacher_id: teacher.id,
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
  });

  // 6. Dữ liệu học viên phân bổ cho từng Sale
  // NHÓM 1: Thuộc về cskh1@gmail.com (CSKH 1)
  const studentsCS1 = [
    { extId: 'HV_001', name: 'Nguyễn Văn An', phone: '0912345678', email: 'an.nguyen@gmail.com', status: 'STUDYING', remaining: 18, classId: class1.id },
    { extId: 'HV_002', name: 'Trần Thị Mai', phone: '0987654321', email: 'mai.tran@gmail.com', status: 'STUDYING', remaining: 12, classId: class1.id },
    { extId: 'HV_003', name: 'Lê Hoàng Long', phone: '0905123456', email: 'long.le@gmail.com', status: 'STUDYING', remaining: 5, classId: class1.id },
    { extId: 'HV_004', name: 'Phạm Minh Đức', phone: '0934567890', email: 'duc.pham@gmail.com', status: 'PAUSED', remaining: 20, classId: class1.id },
  ];

  // NHÓM 2: Thuộc về cskh2@gmail.com (CSKH 2)
  const studentsCS2 = [
    { extId: 'HV_005', name: 'Hoàng Thu Trang', phone: '0978901234', email: 'trang.hoang@gmail.com', status: 'STUDYING', remaining: -2, classId: class1.id }, // Nợ buổi
    { extId: 'HV_006', name: 'Vũ Hải Đăng', phone: '0967890123', email: 'dang.vu@gmail.com', status: 'STUDYING', remaining: 8, classId: class1.id },
    { extId: 'HV_007', name: 'Đỗ Bích Ngọc', phone: '0945678901', email: 'ngoc.do@gmail.com', status: 'STUDYING', remaining: 15, classId: class1.id },
    { extId: 'HV_008', name: 'Bùi Anh Tuấn', phone: '0923456789', email: 'tuan.bui@gmail.com', status: 'STUDYING', remaining: -1, classId: class1.id }, // Nợ buổi
  ];

  // NHÓM 3: Thuộc về cskh3@gmail.com (CSKH 3)
  const studentsCS3 = [
    { extId: 'HV_101', name: 'Đặng Quốc Huy', phone: '0981112233', email: 'huy.dang@gmail.com', status: 'STUDYING', remaining: 22, classId: class2.id },
    { extId: 'HV_102', name: 'Lê Thảo My', phone: '0982223344', email: 'my.le@gmail.com', status: 'STUDYING', remaining: 10, classId: class2.id },
    { extId: 'HV_103', name: 'Phạm Tiến Dũng', phone: '0983334455', email: 'dung.pham@gmail.com', status: 'STUDYING', remaining: 3, classId: class2.id },
    { extId: 'HV_104', name: 'Ngô Thanh Hương', phone: '0984445566', email: 'huong.ngo@gmail.com', status: 'STUDYING', remaining: -1, classId: class2.id }, // Nợ buổi
    { extId: 'HV_105', name: 'Vũ Đức Minh', phone: '0985556677', email: 'minh.vu@gmail.com', status: 'STUDYING', remaining: 14, classId: class2.id },
  ];

  const salesConfig = [
    { user: cskh1, saleName: 'CSKH 1', students: studentsCS1 },
    { user: cskh2, saleName: 'CSKH 2', students: studentsCS2 },
    { user: cskh3, saleName: 'CSKH 3', students: studentsCS3 },
  ];

  const allEnrollmentClasses: any[] = [];

  for (const sc of salesConfig) {
    console.log(`Đang nạp ${sc.students.length} học viên cho Sale: ${sc.user.email} (${sc.saleName})...`);

    for (let i = 0; i < sc.students.length; i++) {
      const s = sc.students[i];
      const student = await prisma.student.create({
        data: {
          external_id: s.extId,
          full_name: s.name,
          phone: s.phone,
          email: s.email,
          gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
          date_of_birth: new Date('2002-05-15'),
          occupation: 'Học viên',
        },
      });

      const enrollment = await prisma.enrollment.create({
        data: {
          external_id: s.extId,
          student_id: student.id,
          package_id: pkg.id,
          cs_id: sc.user.id,
          sale_name: sc.saleName, // Cột Sale chuẩn Sheet 1
          total_sessions: 30,
          external_remaining_sessions: s.remaining,
          start_date: new Date('2026-08-15'),
          end_date: new Date('2026-11-15'),
          status: s.status as EnrollmentStatus,
          paid_at: new Date('2026-08-10'),
          payment_status: 'Đã đóng đủ',
          course_content: 'Tiếng Nhật Kaiwa Chuẩn',
          class_model: 'Nhóm',
          level: s.classId === class1.id ? 'N5' : 'N4',
        },
      });

      const ec = await prisma.enrollmentClass.create({
        data: {
          enrollment_id: enrollment.id,
          class_id: s.classId,
          sequence_no: 1,
          status: EnrollmentClassStatus.ACTIVE,
          start_date: new Date('2026-08-15'),
          end_date: new Date('2026-11-15'),
        },
      });

      allEnrollmentClasses.push({ ec, classId: s.classId, remaining: s.remaining });
    }
  }

  // 7. Tạo lịch học và điểm danh Tháng 9/2026
  console.log('Đang tạo các buổi học và điểm danh cho Tháng 9/2026...');

  // Lớp 1 (2,4,6)
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

  const class1ECs = allEnrollmentClasses.filter((item) => item.classId === class1.id);

  for (let sIdx = 0; sIdx < mwfDatesSept2026.length; sIdx++) {
    const sessionDate = mwfDatesSept2026[sIdx];
    const isPast = sessionDate <= new Date('2026-09-21T23:59:59Z');

    const session = await prisma.classSession.create({
      data: {
        class_id: class1.id,
        session_number: sIdx + 1,
        session_date: sessionDate,
        start_time: '08:00',
        end_time: '09:30',
        teacher_id: teacher.id,
        status: isPast ? 'COMPLETED' : 'SCHEDULED',
        created_by_id: admin.id,
      },
    });

    if (isPast) {
      for (let stIdx = 0; stIdx < class1ECs.length; stIdx++) {
        const { ec } = class1ECs[stIdx];
        let assignedStatus: AttendanceStatus = AttendanceStatus.ATTENDED;
        if (stIdx === 3) assignedStatus = AttendanceStatus.LEAVE_B;
        else if ((sIdx + stIdx) % 7 === 0) assignedStatus = AttendanceStatus.ABSENT_APPROVED_A;
        else if ((sIdx + stIdx) % 11 === 0) assignedStatus = AttendanceStatus.ABSENT_UNAPPROVED_C;

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

  // Lớp 2 (3,5,7)
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

  const class2ECs = allEnrollmentClasses.filter((item) => item.classId === class2.id);

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
        teacher_id: teacher.id,
        status: isPast ? 'COMPLETED' : 'SCHEDULED',
        created_by_id: admin.id,
      },
    });

    if (isPast) {
      for (let stIdx = 0; stIdx < class2ECs.length; stIdx++) {
        const { ec } = class2ECs[stIdx];
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

  console.log('🎉 Hoàn tất nạp dữ liệu: 5 tài khoản mới, 13 học viên gắn đủ cho 3 Sale, và điểm danh Tháng 9/2026!');
}

seedNewAccounts()
  .catch((e) => {
    console.error('Lỗi khi nạp dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
