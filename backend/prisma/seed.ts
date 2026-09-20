/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function truncateTables() {
  const tableNames = await prisma.$queryRaw<
    Array<{ TABLE_NAME: string }>
  >`SELECT TABLE_NAME from information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME != '_prisma_migrations';`;

  console.log('Truncating tables...');
  await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 0;`);
  
  for (const { TABLE_NAME } of tableNames) {
    if (TABLE_NAME !== '_prisma_migrations') {
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${TABLE_NAME}\`;`);
        console.log(`Truncated table: ${TABLE_NAME}`);
      } catch (error) {
        console.error(`Failed to truncate ${TABLE_NAME}`, error);
      }
    }
  }

  await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 1;`);
  console.log('Finished truncating tables.');
}

async function main() {
  console.log('Start seeding...');
  
  await truncateTables();

  const bcrypt = require('bcrypt');
  const password_hash = bcrypt.hashSync('password123', 10);

  // 1. Create Users
  console.log('Creating users...');
  const admin = await prisma.user.create({
    data: {
      name: 'Super Admin',
      email: 'admin@gmail.com',
      password_hash: password_hash,
      roles: ['ADMIN'],
      active: true,
    },
  });

  const csManager = await prisma.user.create({
    data: {
      name: 'CS Manager',
      email: 'cskh@gmail.com',
      password_hash: password_hash,
      roles: ['CS'],
      active: true,
    },
  });

  const teacher = await prisma.user.create({
    data: {
      name: 'Teacher 1',
      email: 'teacher@automation_cskh.local',
      password_hash: password_hash,
      roles: ['TEACHER'],
      active: true,
    },
  });

  // Create CS Group & Assignment
  console.log('Creating CS Groups...');
  const csGroup = await prisma.cSGroup.create({
    data: {
      group_name: 'Group 1',
      active: true,
      members: {
        create: { user_id: csManager.id }
      },
      assignments: {
        create: { manage_user_id: admin.id }
      }
    }
  });

  // Create Zalo Account for CS
  const zaloAccount = await prisma.zaloAccount.create({
    data: {
      cs_id: csManager.id,
      zalo_phone: '0987654321',
      status: 'ACTIVE'
    }
  });

  // 2. Packages
  console.log('Creating packages...');
  const package1 = await prisma.package.create({
    data: {
      code: 'PKG_01',
      name: 'Tiếng Nhật Cơ Bản',
      default_total_sessions: 24,
      active: true,
    }
  });

  const package2 = await prisma.package.create({
    data: {
      code: 'PKG_02',
      name: 'Tiếng Nhật Giao Tiếp',
      default_total_sessions: 36,
      active: true,
    }
  });
  const packages = [package1, package2];

  // 3. Classes
  console.log('Creating classes...');
  const class1 = await prisma.class.create({
    data: {
      class_code: 'CLASS_01',
      class_name: 'Lớp N5 Sáng',
      level: 'N5',
      model_type: 'GROUP',
      attendance_source: 'LEARNING_SYSTEM',
      class_teachers: {
        create: {
          teacher_id: teacher.id,
          role: 'MAIN',
          start_date: new Date()
        }
      },
      class_schedules: {
        create: {
          schedule_pattern: '2,4,6',
          start_time: '08:00',
          duration_minutes: 90
        }
      }
    }
  });

  const class2 = await prisma.class.create({
    data: {
      class_code: 'CLASS_02',
      class_name: 'Lớp N4 Tối',
      level: 'N4',
      model_type: 'GROUP',
      attendance_source: 'LEARNING_SYSTEM',
      class_teachers: {
        create: {
          teacher_id: teacher.id,
          role: 'MAIN',
          start_date: new Date()
        }
      }
    }
  });
  const classes = [class1, class2];

  // Create Class Sessions
  console.log('Creating class sessions...');
  for (let c of classes) {
    for (let i = 1; i <= 5; i++) {
      await prisma.classSession.create({
        data: {
          class_id: c.id,
          session_number: i,
          session_date: faker.date.recent({ days: 30 }),
          start_time: '08:00',
          end_time: '09:30',
          teacher_id: teacher.id,
          status: 'COMPLETED',
          created_by_id: admin.id
        }
      });
    }
  }

  // 4. Students & Enrollments
  console.log('Creating students & enrollments...');
  for (let i = 0; i < 10; i++) {
    const p = faker.helpers.arrayElement(packages);
    const c = faker.helpers.arrayElement(classes);
    
    const student = await prisma.student.create({
      data: {
        full_name: faker.person.fullName(),
        email: faker.internet.email(),
        phone: faker.phone.number(),
        date_of_birth: faker.date.birthdate(),
        zalo_contact_relations: {
          create: {
            zalo_account_id: zaloAccount.id,
            relation_status: 'FRIEND'
          }
        },
        enrollments: {
          create: {
            package_id: p.id,
            cs_id: csManager.id,
            total_sessions: p.default_total_sessions || 24,
            status: 'STUDYING',
            enrollment_classes: {
              create: {
                class_id: c.id,
                sequence_no: 1,
                status: 'ACTIVE'
              }
            }
          }
        }
      },
      include: {
        enrollments: {
          include: {
            enrollment_classes: true
          }
        }
      }
    });

    const enrollment = student.enrollments[0];
    const enrollmentClass = enrollment.enrollment_classes[0];

    // Create Attendances
    const sessions = await prisma.classSession.findMany({ where: { class_id: c.id } });
    for (let session of sessions) {
      await prisma.attendance.create({
        data: {
          enrollment_class_id: enrollmentClass.id,
          class_session_id: session.id,
          status: faker.helpers.arrayElement(['ATTENDED', 'ABSENT_APPROVED_A', 'ATTENDED']),
          source: 'MANUAL',
          created_by_id: admin.id
        }
      });
    }

    // Create Care Log
    await prisma.careLog.create({
      data: {
        enrollment_id: enrollment.id,
        cs_id: csManager.id,
        outcome: 'POSITIVE',
        content: faker.lorem.sentence(),
        created_by_id: csManager.id
      }
    });
  }

  // 5. Automation & Others
  console.log('Creating automation rules...');
  await prisma.messageRule.create({
    data: {
      package_id: package1.id,
      trigger_session_number: 1,
      delay_minutes: 30,
      message_content: 'Chào {{student_name}}, chúc mừng bạn đã hoàn thành buổi học đầu tiên!',
      message_variables: ['student_name'],
      created_by_id: admin.id
    }
  });

  await prisma.auditLog.create({
    data: {
      user_id: admin.id,
      action: 'SEED_DATA',
      entity_type: 'SYSTEM',
      entity_id: '1',
      before_data: {},
      after_data: { message: 'Database seeded' }
    }
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
