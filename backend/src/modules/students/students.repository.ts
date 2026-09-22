import { prisma } from '../../prisma/client';
import { CreateStudentDTO, UpdateStudentDTO } from './students.types';

export class StudentsRepository {
  async findAll() {
    return prisma.student.findMany({
      include: {
        enrollments: {
          include: {
            package: true,
            sale: true,
            cs: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            enrollment_classes: {
              include: {
                class: {
                  include: {
                    class_teachers: {
                      include: {
                        teacher: true,
                      },
                    },
                    class_schedules: true,
                  },
                },
                attendance: true,
              },
            },
            care_logs: {
              orderBy: { after_session_number: 'asc' },
            },
            care_tasks: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  async findById(id: number) {
    return prisma.student.findUnique({
      where: { id }
    });
  }

  async findByPhone(phone: string) {
    return prisma.student.findFirst({
      where: { phone }
    });
  }

  async findByEmail(email: string) {
    return prisma.student.findFirst({
      where: { email }
    });
  }

  async create(data: CreateStudentDTO, currentUserId?: number) {
    return prisma.$transaction(async (tx) => {
      const dob = data.date_of_birth ? new Date(data.date_of_birth) : undefined;

      // 1. Create Student
      const student = await tx.student.create({
        data: {
          external_id: data.external_id ? String(data.external_id).trim() : undefined,
          full_name: data.full_name.trim(),
          gender: data.gender || undefined,
          phone: data.phone ? String(data.phone).trim() : undefined,
          email: data.email ? String(data.email).trim() : undefined,
          date_of_birth: dob,
          occupation: data.occupation || undefined,
          zalo_uid: data.zalo_uid || undefined,
          note: data.note || undefined,
        },
      });

      // 2. Resolve CS/Sale user
      let csId = currentUserId;
      const allUsers = await tx.user.findMany({
        select: { id: true, name: true, email: true, roles: true },
      });

      if (data.sale_name) {
        const query = data.sale_name.trim().toLowerCase();
        const matched = allUsers.find(
          (u) =>
            u.name?.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query)
        );
        if (matched) csId = matched.id;
      }

      if (!csId) {
        const csUser = allUsers.find(
          (u) => Array.isArray(u.roles) && (u.roles as string[]).includes('CS')
        );
        csId = csUser?.id || allUsers[0]?.id || 1;
      }

      // 3. Create Enrollment
      const enrollment = await tx.enrollment.create({
        data: {
          student_id: student.id,
          cs_id: csId,
          sale_name: data.sale_name ? String(data.sale_name).trim() : undefined,
          student_source_status: data.student_source_status || 'Học viên chuẩn',
          course_content: data.course_content || 'Tiếng Nhật Kaiwa',
          payment_status: data.payment_status || 'Đã đóng đủ',
          level: data.level || 'N5',
          total_sessions: data.total_sessions ? Number(data.total_sessions) : 30,
          external_remaining_sessions:
            data.external_remaining_sessions !== undefined && data.external_remaining_sessions !== ''
              ? Number(data.external_remaining_sessions)
              : 30,
          class_model: data.class_model || 'Nhóm',
          sales_note: data.sales_note || undefined,
          paid_at: data.paid_at ? new Date(data.paid_at) : undefined,
          start_date: data.start_date ? new Date(data.start_date) : undefined,
          end_date: data.end_date ? new Date(data.end_date) : undefined,
          status: (data.status as any) || 'STUDYING',
          study_report_url: data.study_report_url || undefined,
          exchange_info: data.exchange_info || undefined,
          callback_note: data.callback_note || undefined,
          hot_issue_note: data.hot_issue_note || undefined,
          post_course_care: data.post_course_care || undefined,
          handed_over_at: data.handed_over_at ? new Date(data.handed_over_at) : undefined,
          account_created_at: data.account_created_at
            ? new Date(data.account_created_at)
            : undefined,
        },
      });

      // 4. Create or link Class & Schedules
      if (data.class_name || data.start_time || data.schedule_pattern) {
        const className =
          data.class_name?.trim() ||
          `Lớp ${student.full_name} (${data.schedule_pattern || '246'})`;

        let classObj = await tx.class.findFirst({
          where: { class_name: className },
        });

        if (!classObj) {
          classObj = await tx.class.create({
            data: {
              class_name: className,
              model_type: data.class_model === '1:1' ? 'ONE_TO_ONE' : 'ONE_TO_N',
              attendance_source: 'LEARNING_SYSTEM',
              active: true,
            },
          });
        }

        // Schedule
        if (data.start_time || data.schedule_pattern || data.duration_minutes) {
          await tx.classSchedule.create({
            data: {
              class_id: classObj.id,
              start_time: data.start_time || '20h00',
              schedule_pattern: data.schedule_pattern || '246',
              duration_minutes: data.duration_minutes
                ? Number(data.duration_minutes)
                : 30,
            },
          });
        }

        // Teacher
        if (data.teacher_name) {
          const teacherQuery = data.teacher_name.trim().toLowerCase();
          const teacherUser = allUsers.find(
            (u) =>
              Array.isArray(u.roles) &&
              (u.roles as string[]).includes('TEACHER') &&
              (u.name?.toLowerCase().includes(teacherQuery) ||
                u.email.toLowerCase().includes(teacherQuery))
          );
          if (teacherUser) {
            const profile = await tx.teacherProfile.findUnique({
              where: { user_id: teacherUser.id },
            });
            if (profile) {
              await tx.classTeacher.create({
                data: {
                  class_id: classObj.id,
                  teacher_id: profile.id,
                  role: 'MAIN',
                },
              });
            }
          }
        }

        // EnrollmentClass
        await tx.enrollmentClass.create({
          data: {
            enrollment_id: enrollment.id,
            class_id: classObj.id,
            sequence_no: 1,
            status: 'ACTIVE',
          },
        });
      }

      return student;
    });
  }

  async update(id: number, data: UpdateStudentDTO) {
    return prisma.$transaction(async (tx) => {
      const dob = data.date_of_birth ? new Date(data.date_of_birth) : undefined;

      // 1. Update Student
      const student = await tx.student.update({
        where: { id },
        data: {
          ...(data.external_id !== undefined
            ? { external_id: data.external_id ? String(data.external_id).trim() : null }
            : {}),
          ...(data.full_name !== undefined ? { full_name: data.full_name.trim() } : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
          ...(data.phone !== undefined ? { phone: data.phone ? String(data.phone).trim() : null } : {}),
          ...(data.email !== undefined ? { email: data.email ? String(data.email).trim() : null } : {}),
          ...(data.date_of_birth !== undefined ? { date_of_birth: dob || null } : {}),
          ...(data.occupation !== undefined ? { occupation: data.occupation || null } : {}),
          ...(data.zalo_uid !== undefined ? { zalo_uid: data.zalo_uid || null } : {}),
          ...(data.note !== undefined ? { note: data.note || null } : {}),
        },
      });

      // 2. Prepare Enrollment update
      const enrollmentUpdate: any = {};
      if (data.sale_name !== undefined) enrollmentUpdate.sale_name = data.sale_name || null;
      if (data.student_source_status !== undefined)
        enrollmentUpdate.student_source_status = data.student_source_status || null;
      if (data.course_content !== undefined)
        enrollmentUpdate.course_content = data.course_content || null;
      if (data.payment_status !== undefined)
        enrollmentUpdate.payment_status = data.payment_status || null;
      if (data.level !== undefined) enrollmentUpdate.level = data.level || null;
      if (data.total_sessions !== undefined)
        enrollmentUpdate.total_sessions = Number(data.total_sessions) || 30;
      if (data.external_remaining_sessions !== undefined && data.external_remaining_sessions !== '')
        enrollmentUpdate.external_remaining_sessions = Number(data.external_remaining_sessions);
      if (data.class_model !== undefined)
        enrollmentUpdate.class_model = data.class_model || null;
      if (data.sales_note !== undefined)
        enrollmentUpdate.sales_note = data.sales_note || null;
      if (data.paid_at !== undefined)
        enrollmentUpdate.paid_at = data.paid_at ? new Date(data.paid_at) : null;
      if (data.start_date !== undefined)
        enrollmentUpdate.start_date = data.start_date ? new Date(data.start_date) : null;
      if (data.end_date !== undefined)
        enrollmentUpdate.end_date = data.end_date ? new Date(data.end_date) : null;
      if (data.status !== undefined)
        enrollmentUpdate.status = data.status as any;
      if (data.study_report_url !== undefined)
        enrollmentUpdate.study_report_url = data.study_report_url || null;
      if (data.exchange_info !== undefined)
        enrollmentUpdate.exchange_info = data.exchange_info || null;
      if (data.callback_note !== undefined)
        enrollmentUpdate.callback_note = data.callback_note || null;
      if (data.hot_issue_note !== undefined)
        enrollmentUpdate.hot_issue_note = data.hot_issue_note || null;
      if (data.post_course_care !== undefined)
        enrollmentUpdate.post_course_care = data.post_course_care || null;
      if (data.handed_over_at !== undefined)
        enrollmentUpdate.handed_over_at = data.handed_over_at ? new Date(data.handed_over_at) : null;
      if (data.account_created_at !== undefined)
        enrollmentUpdate.account_created_at = data.account_created_at
          ? new Date(data.account_created_at)
          : null;

      // Find primary enrollment
      let enrollment = await tx.enrollment.findFirst({
        where: { student_id: id },
        orderBy: { id: 'desc' },
        include: {
          enrollment_classes: {
            include: {
              class: {
                include: {
                  class_schedules: true,
                  class_teachers: {
                    include: { teacher: true },
                  },
                },
              },
            },
          },
        },
      });

      if (enrollment) {
        if (Object.keys(enrollmentUpdate).length > 0) {
          await tx.enrollment.update({
            where: { id: enrollment.id },
            data: enrollmentUpdate,
          });
        }

        // Update class or schedule
        const ec = enrollment.enrollment_classes?.[0];
        if (ec?.class) {
          if (data.class_name && data.class_name !== ec.class.class_name) {
            await tx.class.update({
              where: { id: ec.class.id },
              data: { class_name: data.class_name },
            });
          }
          const sched = ec.class.class_schedules?.[0];
          if (sched && (data.start_time || data.schedule_pattern || data.duration_minutes)) {
            await tx.classSchedule.update({
              where: { id: sched.id },
              data: {
                ...(data.start_time ? { start_time: data.start_time } : {}),
                ...(data.schedule_pattern ? { schedule_pattern: data.schedule_pattern } : {}),
                ...(data.duration_minutes ? { duration_minutes: Number(data.duration_minutes) } : {}),
              },
            });
          } else if (!sched && (data.start_time || data.schedule_pattern || data.duration_minutes)) {
            await tx.classSchedule.create({
              data: {
                class_id: ec.class.id,
                start_time: data.start_time || '20h00',
                schedule_pattern: data.schedule_pattern || '246',
                duration_minutes: data.duration_minutes ? Number(data.duration_minutes) : 30,
              },
            });
          }
        }
      }

      return student;
    });
  }
}
