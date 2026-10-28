import { prisma } from '../../prisma/client';
import { CreateStudentDTO, UpdateStudentDTO, StudentListQueryOptions, StudentListMeta } from './students.types';
import { AuthUser } from '../../middlewares/auth.middleware';
import { AppError } from '../../middlewares/error.middleware';
import { getAccessibleClassIds } from '../classes/classes.scope';

function isTeacherOnlyActor(actor: AuthUser): boolean {
  return (
    actor.roles.includes('TEACHER') &&
    !actor.roles.includes('ADMIN') &&
    !actor.roles.includes('MANAGE') &&
    !actor.roles.includes('CS')
  );
}

export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  last_login_at: true,
} as const;

/** Same assigned-group + self scope already used by the student list. */
export async function getStudentCsScope(actor: AuthUser): Promise<number[] | undefined> {
  if (actor.roles.includes('ADMIN')) return undefined;
  if (actor.roles.includes('MANAGE')) {
    const assignments = await prisma.manageAssignment.findMany({
      where: { manage_user_id: actor.id },
      include: { cs_group: { include: { members: true } } },
    });
    return Array.from(new Set([actor.id, ...assignments.flatMap(a => a.cs_group.members.map(m => m.user_id))]));
  }
  if (actor.roles.includes('CS')) return [actor.id];
  throw new AppError(403, 'Bạn không có quyền truy cập học viên');
}

/**
 * B.5/D9: True when the user row's stored roles JSON contains the CS role.
 * enrollment.cs_id is the only scope grant, so every explicit cs_id
 * assignment must land on a CS-role account (no name/email guessing).
 */
async function isCsRoleUser(userId: number, tx?: any): Promise<boolean> {
  const client = tx ?? prisma;
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { roles: true },
  });
  return !!user && Array.isArray(user.roles) && (user.roles as string[]).includes('CS');
}

/**
 * Resolve and authorize the enrollment owner (cs_id) for a create request.
 * An explicit cs_id is validated against the actor's scope and the CS role;
 * with no explicit assignment the creator keeps ownership of what they create.
 * sale_name is plain handover data and never participates in this decision.
 */
async function resolveCreateCsId(
  requestedCsId: number | undefined,
  actor: AuthUser,
  allowedCsIds: number[] | undefined
): Promise<number> {
  if (requestedCsId === undefined) return actor.id;
  const csId = Number(requestedCsId);
  if (allowedCsIds !== undefined && !allowedCsIds.includes(csId)) {
    throw new AppError(403, 'Bạn không được gán học viên cho tài khoản CSKH ngoài phạm vi phụ trách');
  }
  if (!(await isCsRoleUser(csId))) {
    throw new AppError(400, 'Tài khoản được gán làm CSKH phụ trách phải có vai trò CS');
  }
  return csId;
}

/**
 * Authorize an explicit cs_id reassignment on update. Ownership transfer is
 * only a deliberate act via data.cs_id; ADMIN may target any CS-role account,
 * MANAGE is limited to its assigned CS group, CS may keep only its own id.
 * The target must be an active CS-role user (B.5/D9).
 */
async function authorizeUpdatedCsId(csId: number, tx: any, allowedCsIds: number[] | undefined): Promise<void> {
  if (allowedCsIds !== undefined && !allowedCsIds.includes(Number(csId))) {
    throw new AppError(403, 'CSKH không được chuyển học viên sang tài khoản CSKH khác');
  }
  const user = await tx.user.findUnique({
    where: { id: Number(csId) },
    select: { roles: true, active: true },
  });
  const roles = user && Array.isArray(user.roles) ? (user.roles as string[]) : [];
  if (!user || !user.active || !roles.includes('CS')) {
    throw new AppError(400, 'CSKH được gán phải là tài khoản CS đang hoạt động');
  }
}

export class StudentsRepository {
  /**
   * Builds the enrollment filter combining mandatory actor scope (`allowedCsIds`)
   * with optional query filters using `AND` so query filters can NEVER widen scope.
   */
  private buildEnrollmentFilter(
    allowedCsIds: number[] | undefined,
    options: StudentListQueryOptions,
    opts?: { includeProgramType?: boolean; includeStatus?: boolean },
  ): any {
    const includeProgram = opts?.includeProgramType ?? true;
    const includeStatus = opts?.includeStatus ?? true;

    const normalizedProgram =
      includeProgram && options.programType && options.programType.toUpperCase() !== 'ALL'
        ? options.programType.toUpperCase()
        : undefined;

    const hasAdvanced =
      Boolean(options.cvht && options.cvht.trim()) ||
      Boolean(includeStatus && options.status && options.status.trim()) ||
      Boolean(options.sale && options.sale.trim());

    // Keep exact legacy structure when only scope/csId/programType are used
    if (!hasAdvanced) {
      const enrollmentFilter: any = {};
      if (allowedCsIds !== undefined) {
        enrollmentFilter.cs_id = { in: allowedCsIds };
        if (options.csId) {
          enrollmentFilter.cs_id = allowedCsIds.includes(options.csId) ? options.csId : { in: [] };
        }
      } else if (options.csId) {
        enrollmentFilter.cs_id = options.csId;
      }
      if (normalizedProgram) {
        enrollmentFilter.program_type = normalizedProgram;
      }
      return enrollmentFilter;
    }

    const andClauses: any[] = [];
    if (allowedCsIds !== undefined) {
      if (options.csId) {
        andClauses.push({
          cs_id: allowedCsIds.includes(options.csId) ? options.csId : { in: [] },
        });
      } else {
        andClauses.push({ cs_id: { in: allowedCsIds } });
      }
    } else if (options.csId) {
      andClauses.push({ cs_id: options.csId });
    }

    if (normalizedProgram) {
      andClauses.push({ program_type: normalizedProgram });
    }

    if (includeStatus && options.status && options.status.trim()) {
      andClauses.push({ status: options.status.trim() as any });
    }

    if (options.cvht && options.cvht.trim()) {
      const cvht = options.cvht.trim();
      andClauses.push({
        cs: {
          OR: [
            { staff_code: { contains: cvht } },
            { code: { contains: cvht } },
            { name: { contains: cvht } },
          ],
        },
      });
    }

    if (options.sale && options.sale.trim()) {
      const sale = options.sale.trim();
      andClauses.push({
        OR: [
          { sale_name: { contains: sale } },
          { sale: { name: { contains: sale } } },
          { cs: { name: { contains: sale } } },
          { cs: { email: { contains: sale } } },
        ],
      });
    }

    return andClauses.length === 1 ? andClauses[0] : { AND: andClauses };
  }

  private buildStudentWhere(
    allowedCsIds: number[] | undefined,
    options: StudentListQueryOptions,
    opts?: { includeProgramType?: boolean; includeStatus?: boolean },
  ): any {
    const enrollmentFilter = this.buildEnrollmentFilter(allowedCsIds, options, opts);
    const hasEnrollmentFilter = Object.keys(enrollmentFilter).length > 0;
    const hasSearch = Boolean(options.search && options.search.trim());
    const hasGender = Boolean(options.gender && options.gender.trim());

    if (!hasSearch && !hasGender) {
      return {
        where: hasEnrollmentFilter ? { enrollments: { some: enrollmentFilter } } : undefined,
        enrollmentFilter: hasEnrollmentFilter ? enrollmentFilter : undefined,
      };
    }

    const andClauses: any[] = [];
    if (hasEnrollmentFilter) {
      andClauses.push({ enrollments: { some: enrollmentFilter } });
    }
    if (hasGender) {
      andClauses.push({ gender: options.gender!.trim() });
    }
    if (hasSearch) {
      const q = options.search!.trim();
      andClauses.push({
        OR: [
          { full_name: { contains: q } },
          { phone: { contains: q } },
          { external_id: { contains: q } },
          { email: { contains: q } },
        ],
      });
    }

    return {
      where: andClauses.length === 1 ? andClauses[0] : { AND: andClauses },
      enrollmentFilter: hasEnrollmentFilter ? enrollmentFilter : undefined,
    };
  }

  async findAll(options: StudentListQueryOptions) {
    // B.5/D9: list scope is enrollment.cs_id only, derived from the same
    // getStudentCsScope used by detail/update. Name- and email-based matching
    // (e.g. against sale_name) is never an access grant.
    const allowedCsIds = await getStudentCsScope(options.actor as AuthUser);
    const { where, enrollmentFilter } = this.buildStudentWhere(allowedCsIds, options);

    const page = options.page && options.page >= 1 ? options.page : 1;
    const pageSize = options.pageSize && options.pageSize >= 1 ? Math.min(options.pageSize, 100) : 50;

    return prisma.student.findMany({
      where,
      ...(options.isPaginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      include: {
        enrollments: {
          where: enrollmentFilter,
          include: {
            package: true,
            sale: true,
            cs: {
              select: {
                id: true,
                code: true,
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
                            user: {
                              select: SAFE_USER_SELECT,
                            },
                          },
                        },
                      },
                    },
                    class_schedules: true,
                  },
                },
                attendance: {
                  where: { deleted_at: null },
                  select: {
                    id: true,
                    status: true,
                    reconciliation_state: true,
                    class_session: {
                      select: {
                        id: true,
                        session_date: true,
                      },
                    },
                  },
                },
              },
            },
            care_logs: {
              orderBy: { after_session_number: 'asc' },
            },
          },
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: [{ id: 'asc' }],
    });
  }

  async computeMeta(options: StudentListQueryOptions, currentData: any[]): Promise<StudentListMeta> {
    const allowedCsIds = await getStudentCsScope(options.actor as AuthUser);
    const page = options.page && options.page >= 1 ? options.page : 1;
    const isPaginated = Boolean(options.isPaginated);

    // Base scope + filters WITHOUT program_type for programCounts
    const { where: whereNoProgram, enrollmentFilter: enrFilterNoProgram } = this.buildStudentWhere(
      allowedCsIds,
      options,
      { includeProgramType: false },
    );

    let rowsForFacets: any[] = currentData;
    if ((isPaginated || (options.programType && options.programType.toUpperCase() !== 'ALL')) && typeof (prisma.student as any).findMany === 'function') {
      try {
        const fetched = await prisma.student.findMany({
          where: whereNoProgram,
          select: {
            id: true,
            enrollments: {
              where: enrFilterNoProgram,
              select: {
                program_type: true,
                status: true,
                sale_name: true,
                sale: { select: { name: true } },
                cs: { select: { name: true, email: true, staff_code: true, code: true } },
              },
              orderBy: { created_at: 'desc' },
            },
          },
        });
        if (Array.isArray(fetched)) {
          rowsForFacets = fetched;
        }
      } catch {
        rowsForFacets = currentData;
      }
    }

    let kaiwa = 0;
    let jlpt = 0;
    const statusCounts: Record<string, number> = {};
    const cvhtSet = new Set<string>(['CVHT01', 'CVHT02', 'CVHT03']);
    const salesSet = new Set<string>();
    const normalizedProgramFilter =
      options.programType && options.programType.toUpperCase() !== 'ALL'
        ? options.programType.toUpperCase()
        : undefined;

    let matchingTotal = 0;
    for (const s of rowsForFacets) {
      const enr = s.enrollments?.[0];
      const pType = (enr?.program_type || 'KAIWA').toUpperCase();
      if (pType === 'JLPT') {
        jlpt++;
      } else {
        kaiwa++;
      }

      if (!normalizedProgramFilter || pType === normalizedProgramFilter) {
        matchingTotal++;
        const st = enr?.status || 'NOT_STARTED';
        statusCounts[st] = (statusCounts[st] || 0) + 1;
      }

      for (const e of s.enrollments || []) {
        if (e.cs?.staff_code) cvhtSet.add(String(e.cs.staff_code).toUpperCase());
        if (e.cs?.code) cvhtSet.add(String(e.cs.code).toUpperCase());
        if (e.sale_name) salesSet.add(e.sale_name);
        if (e.sale?.name) salesSet.add(e.sale.name);
        if (e.cs?.name) salesSet.add(e.cs.name);
        if (e.cs?.email) salesSet.add(e.cs.email);
      }
    }

    const total = isPaginated ? matchingTotal : currentData.length;
    const effectivePageSize = isPaginated
      ? (options.pageSize && options.pageSize >= 1 ? Math.min(options.pageSize, 100) : 50)
      : Math.max(1, currentData.length);
    const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

    return {
      page: isPaginated ? page : 1,
      pageSize: effectivePageSize,
      total,
      totalPages,
      facets: {
        programCounts: {
          all: kaiwa + jlpt,
          kaiwa,
          jlpt,
        },
        statusCounts,
      },
      filterOptions: {
        cvhtList: Array.from(cvhtSet).filter(Boolean).sort(),
        salesList: Array.from(salesSet).filter(Boolean).sort(),
      },
    };
  }

  async findById(id: number, actor: AuthUser) {
    if (isTeacherOnlyActor(actor)) {
      const accessibleClassIds = (await getAccessibleClassIds(actor)) ?? [];
      if (accessibleClassIds.length === 0) {
        throw new AppError(403, 'Bạn không phụ trách học viên này');
      }
      const student = await prisma.student.findUnique({
        where: { id },
        include: {
          enrollments: {
            where: {
              enrollment_classes: {
                some: { class_id: { in: accessibleClassIds } },
              },
            },
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
                where: { class_id: { in: accessibleClassIds } },
                include: {
                  class: {
                    include: {
                      class_teachers: {
                        include: {
                          teacher: {
                            include: {
                              user: {
                                select: SAFE_USER_SELECT,
                              },
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
      });
      if (student && student.enrollments.length === 0) {
        throw new AppError(403, 'Bạn không phụ trách học viên này');
      }
      return student;
    }

    // Only enrollment details inside the existing student-list scope are exposed.
    const allowedCsIds = await getStudentCsScope(actor);
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        enrollments: {
          ...(allowedCsIds !== undefined
            ? { where: { cs_id: allowedCsIds.length === 1 ? allowedCsIds[0] : { in: allowedCsIds } } }
            : {}),
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
                            user: {
                              select: SAFE_USER_SELECT,
                            },
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
    });
    if (student && allowedCsIds !== undefined && student.enrollments.length === 0) {
      throw new AppError(403, 'Bạn không phụ trách học viên này');
    }
    return student;
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

  async create(data: CreateStudentDTO, actor: AuthUser) {
    // B.5/D9: resolve the owner BEFORE the transaction. An explicit cs_id must
    // be a CS-role account inside the actor's scope; otherwise the creator owns
    // the enrollment. sale_name below is stored as plain handover data and is
    // never matched against users or used to grant access.
    const allowedCsIds = await getStudentCsScope(actor);
    const csId = await resolveCreateCsId(data.cs_id, actor, allowedCsIds);

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

      // 2. Create Enrollment (cs_id already authorized above)
      const enrollment = await tx.enrollment.create({
        data: {
          student_id: student.id,
          cs_id: csId,
          program_type: data.program_type || 'KAIWA',
          ...(data.program_metadata !== undefined ? { program_metadata: data.program_metadata as any } : {}),
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

      // 3. Create or link Class & Schedules
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

  async update(id: number, data: UpdateStudentDTO, actor: AuthUser) {
    if (isTeacherOnlyActor(actor)) {
      const accessibleClassIds = (await getAccessibleClassIds(actor)) ?? [];
      if (accessibleClassIds.length === 0) {
        throw new AppError(403, 'Bạn không phụ trách học viên này');
      }
      if (!Number.isInteger(data.enrollment_id) || data.enrollment_id <= 0) {
        throw new AppError(400, 'Hãy chọn rõ ghi danh cần cập nhật');
      }
      return prisma.$transaction(async (tx) => {
        const enrollment = await tx.enrollment.findFirst({
          where: {
            student_id: id,
            id: data.enrollment_id,
            enrollment_classes: {
              some: { class_id: { in: accessibleClassIds } },
            },
          },
          orderBy: { id: 'desc' },
        });
        if (!enrollment) {
          throw new AppError(403, 'Bạn không phụ trách học viên này');
        }

        const enrollmentUpdate: any = {};
        if (data.program_metadata !== undefined) enrollmentUpdate.program_metadata = data.program_metadata;
        if (data.exchange_info !== undefined) enrollmentUpdate.exchange_info = data.exchange_info || null;
        if (data.study_report_url !== undefined) enrollmentUpdate.study_report_url = data.study_report_url || null;

        if (Object.keys(enrollmentUpdate).length > 0) {
          await tx.enrollment.update({
            where: { id: enrollment.id },
            data: enrollmentUpdate,
          });
        }

        return tx.student.findUnique({ where: { id } });
      });
    }

    const allowedCsIds = await getStudentCsScope(actor);
    if (!Number.isInteger(data.enrollment_id) || data.enrollment_id <= 0) {
      throw new AppError(400, 'Hãy chọn rõ ghi danh cần cập nhật');
    }
    // B.5/D9: reject an out-of-scope cs_id before opening the transaction; the
    // CS-role check on the target runs inside the transaction below.
    if (allowedCsIds !== undefined && data.cs_id !== undefined && !allowedCsIds.includes(Number(data.cs_id))) {
      throw new AppError(403, 'CSKH không được chuyển học viên sang tài khoản CSKH khác');
    }

    return prisma.$transaction(async (tx) => {
      // Select the target enrollment before changing the Student row. This
      // prevents a CS from using the globally newest enrollment as an escape
      // hatch when a student has multiple enrollment records.
      const enrollmentWhere: any = {
        student_id: id,
        ...(data.enrollment_id !== undefined ? { id: data.enrollment_id } : {}),
        ...(allowedCsIds !== undefined
          ? { cs_id: allowedCsIds.length === 1 ? allowedCsIds[0] : { in: allowedCsIds } }
          : {}),
      };
      let enrollment = await tx.enrollment.findFirst({
        where: enrollmentWhere,
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
                          user: {
                            select: SAFE_USER_SELECT,
                          },
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
      if (!enrollment) {
        throw new AppError(403, 'Bạn không phụ trách học viên hoặc ghi danh này');
      }

      // A class/schedule/teacher edit affects every enrollment in that class.
      // Reject it when any affected enrollment is outside the actor's scope.
      const targetClass = enrollment.enrollment_classes?.[0]?.class;
      const editsClass = ['class_name', 'start_time', 'schedule_pattern', 'duration_minutes', 'teacher_name', 'teacher_code']
        .some(key => data[key as keyof UpdateStudentDTO] !== undefined);
      if (allowedCsIds !== undefined && editsClass && targetClass) {
        const outsideScope = await tx.enrollmentClass.findFirst({
          where: { class_id: targetClass.id, enrollment: { cs_id: { notIn: allowedCsIds } } },
          select: { id: true },
        });
        if (outsideScope) throw new AppError(403, 'Lớp học có ghi danh ngoài phạm vi phụ trách');
      }

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
      if (data.cs_id !== undefined) {
        // B.5/D9: explicit ownership transfer must target an active CS-role
        // account and stay inside the actor's scope (ADMIN: any CS account).
        await authorizeUpdatedCsId(Number(data.cs_id), tx, allowedCsIds);
        enrollmentUpdate.cs_id = Number(data.cs_id);
      }
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

      // `enrollment` was selected above using the actor scope and optional
      // explicit enrollment_id; never fall back to a global latest record.

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
