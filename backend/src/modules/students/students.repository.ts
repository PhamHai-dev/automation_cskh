import { prisma } from '../../prisma/client';
import { CreateStudentDTO, UpdateStudentDTO } from './students.types';

export class StudentsRepository {
  async findAll(options?: {
    userId?: number;
    roles?: string[];
    programType?: string;
    csId?: number;
  }) {
    const roles = options?.roles || [];
    const userId = options?.userId;
    const isAdmin = roles.includes('ADMIN');
    const isManage = !isAdmin && roles.includes('MANAGE');
    const isCS = !isAdmin && !isManage && roles.includes('CS');

    let allowedCsIds: number[] | undefined = undefined;
    if (isCS && userId) {
      allowedCsIds = [userId];
    } else if (isManage && userId) {
      const assignments = await prisma.manageAssignment.findMany({
        where: { manage_user_id: userId },
        include: { cs_group: { include: { members: true } } },
      });
      const csSet = new Set<number>([userId]);
      assignments.forEach((a) => {
        a.cs_group.members.forEach((m) => csSet.add(m.user_id));
      });
      allowedCsIds = Array.from(csSet);
      if (options?.csId) {
        allowedCsIds = allowedCsIds.filter((id) => id === options.csId);
      }
    } else if (options?.csId) {
      allowedCsIds = [options.csId];
    }

    const enrollmentFilter: any = {};
    if (allowedCsIds !== undefined) {
      enrollmentFilter.cs_id = allowedCsIds.length === 1 ? allowedCsIds[0] : { in: allowedCsIds };
    }
    if (options?.programType) {
      enrollmentFilter.program_type = options.programType;
    }

    const hasEnrollmentFilter = Object.keys(enrollmentFilter).length > 0;

    return prisma.student.findMany({
      where: hasEnrollmentFilter
        ? {
            enrollments: {
              some: enrollmentFilter,
            },
          }
        : undefined,
      include: {
        enrollments: {
          where: hasEnrollmentFilter ? enrollmentFilter : undefined,
          include: {
            package: true,
            sale: true,
            cs: {
              select: {
                id: true,
                name: true,
                email: true,
                staff_code: true,
              },
            },
            enrollment_classes: {
              include: {
                class: {
                  include: {
                    class_teachers: {
                      include: {
                        teacher: {
                          include: {
                            user: true,
                          },
                        },
                      },
                    },
                    class_schedules: true,
                  },
                },
                attendance: { where: { deleted_at: null } },
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
          line_uid: data.line_uid || undefined,
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
          attended_previous_years:
            data.attended_previous_years !== undefined && data.attended_previous_years !== ''
              ? Number(data.attended_previous_years)
              : 0,
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
      if (data.class_name || data.schedule_pattern) {
        const className =
          data.class_name?.trim() ||
          `Lớp ${student.full_name} (${data.schedule_pattern})`;

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

        // A schedule requires an explicit pattern; time and duration may remain missing
        // so the data-quality flow can report them instead of inventing defaults.
        if (data.schedule_pattern) {
          await tx.classSchedule.create({
            data: {
              class_id: classObj.id,
              start_time: data.start_time || null,
              schedule_pattern: data.schedule_pattern,
              duration_minutes:
                data.duration_minutes !== undefined && data.duration_minutes !== ''
                  ? Number(data.duration_minutes)
                  : null,
            },
          });
        }

        // Teacher
        if (data.teacher_name || data.teacher_code) {
          const teacherName = data.teacher_name?.trim() || '';
          const teacherCode = data.teacher_code?.trim() || '';
          let teacherRec = null;

          if (teacherCode) {
            teacherRec = await tx.teacher.findUnique({
              where: { code: teacherCode },
            });
          }

          if (!teacherRec && teacherName) {
            teacherRec = await tx.teacher.findFirst({
              where: {
                OR: [
                  { name: { contains: teacherName } },
                  { code: teacherName },
                ],
              },
            });
          }

          if (!teacherRec) {
            const finalCode = teacherCode || ('GV_' + (teacherName || 'GV').toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20));
            const finalName = teacherName || teacherCode;
            teacherRec = await tx.teacher.create({
              data: {
                name: finalName,
                code: finalCode,
                active: true,
              },
            });
          }

          await tx.classTeacher.create({
            data: {
              class_id: classObj.id,
              teacher_id: teacherRec.id,
              role: 'MAIN',
            },
          });
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
          ...(data.line_uid !== undefined ? { line_uid: data.line_uid || null } : {}),
          ...(data.note !== undefined ? { note: data.note || null } : {}),
        },
      });

      // 2. Prepare Enrollment update
      const enrollmentUpdate: any = {};
      if (data.program_type !== undefined) enrollmentUpdate.program_type = data.program_type;
      if (data.program_metadata !== undefined) enrollmentUpdate.program_metadata = data.program_metadata;
      if (data.cs_id !== undefined) enrollmentUpdate.cs_id = Number(data.cs_id);
      if (data.package_code !== undefined) {
        const trimmedPkg = String(data.package_code).trim();
        if (trimmedPkg) {
          let pkg = await tx.package.findUnique({ where: { code: trimmedPkg } });
          if (!pkg) {
            pkg = await tx.package.create({
              data: {
                code: trimmedPkg,
                name: `Gói ${trimmedPkg}`,
                default_total_sessions: data.total_sessions ? Number(data.total_sessions) : 30,
                active: true,
              },
            });
          }
          enrollmentUpdate.package_id = pkg.id;
        }
      }
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
      if (data.attended_previous_years !== undefined)
        enrollmentUpdate.attended_previous_years =
          data.attended_previous_years === '' || data.attended_previous_years === null
            ? null
            : Number(data.attended_previous_years);
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
                    include: {
                      teacher: {
                        include: {
                          user: true,
                        },
                      },
                    },
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
          if (sched && (data.start_time !== undefined || data.schedule_pattern !== undefined || data.duration_minutes !== undefined)) {
            await tx.classSchedule.update({
              where: { id: sched.id },
              data: {
                ...(data.start_time !== undefined ? { start_time: data.start_time || null } : {}),
                ...(data.schedule_pattern !== undefined ? { schedule_pattern: data.schedule_pattern } : {}),
                ...(data.duration_minutes !== undefined
                  ? {
                      duration_minutes:
                        data.duration_minutes === '' ? null : Number(data.duration_minutes),
                    }
                  : {}),
              },
            });
          } else if (!sched && data.schedule_pattern) {
            await tx.classSchedule.create({
              data: {
                class_id: ec.class.id,
                start_time: data.start_time || null,
                schedule_pattern: data.schedule_pattern,
                duration_minutes:
                  data.duration_minutes !== undefined && data.duration_minutes !== ''
                    ? Number(data.duration_minutes)
                    : null,
              },
            });
          }

          // Teacher update
          if (data.teacher_name !== undefined || data.teacher_code !== undefined) {
            const teacherName = data.teacher_name !== undefined ? data.teacher_name.trim() : '';
            const teacherCode = data.teacher_code !== undefined ? data.teacher_code.trim() : '';
            const existingCT = ec.class.class_teachers?.[0];

            if (teacherName || teacherCode) {
              let teacherRec = null;

              if (teacherCode) {
                teacherRec = await tx.teacher.findUnique({
                  where: { code: teacherCode },
                });
              }

              if (!teacherRec && teacherName) {
                teacherRec = await tx.teacher.findFirst({
                  where: {
                    OR: [
                      { name: { contains: teacherName } },
                      { code: teacherName },
                    ],
                  },
                });
              }

              if (!teacherRec) {
                const finalCode = teacherCode || ('GV_' + (teacherName || 'GV').toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20));
                const finalName = teacherName || teacherCode;
                teacherRec = await tx.teacher.create({
                  data: {
                    name: finalName,
                    code: finalCode,
                    active: true,
                  },
                });
              }

              if (existingCT) {
                await tx.classTeacher.update({
                  where: { id: existingCT.id },
                  data: { teacher_id: teacherRec.id, active: true },
                });
              } else {
                await tx.classTeacher.create({
                  data: {
                    class_id: ec.class.id,
                    teacher_id: teacherRec.id,
                    role: 'MAIN',
                  },
                });
              }
            } else if (existingCT) {
              await tx.classTeacher.delete({
                where: { id: existingCT.id },
              });
            }
          }
        }
      }

      return student;
    });
  }
}
