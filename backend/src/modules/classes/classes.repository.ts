import { prisma } from '../../prisma/client';
import {
  CreateClassDTO,
  UpdateClassDTO,
  AssignTeacherDTO,
  ClassListQueryOptions,
  ClassEnrollmentAttendanceStats,
  ClassListMeta,
} from './classes.types';
import { ClassModelType, AttendanceSourceType } from '@prisma/client';

export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  last_login_at: true,
} as const;

function normalizeModelTypeInput(raw?: string): ClassModelType | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (trimmed === '1:1' || upper === 'ONE_TO_ONE') return ClassModelType.ONE_TO_ONE;
  if (trimmed === '1:2' || upper === 'ONE_TO_TWO') return ClassModelType.ONE_TO_TWO;
  if (trimmed === '1:n' || upper === 'ONE_TO_N' || upper === 'GROUP') return ClassModelType.ONE_TO_N;
  return undefined;
}

function formatDateYmd(raw?: Date | string | null): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  const y = raw.getUTCFullYear();
  const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
  const d = String(raw.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class ClassesRepository {
  buildWhereClause(
    accessibleClassIds?: number[] | null,
    options?: ClassListQueryOptions,
  ): any {
    const andClauses: any[] = [];

    if (accessibleClassIds !== null && accessibleClassIds !== undefined) {
      andClauses.push({ id: { in: accessibleClassIds } });
    }

    if (options?.active !== undefined) {
      andClauses.push({ active: options.active });
    }

    if (options?.modelType) {
      const normalizedModel = normalizeModelTypeInput(options.modelType);
      if (normalizedModel) {
        andClauses.push({ model_type: normalizedModel });
      }
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim();
      const compactMatch = q.match(/^(?:class_|id|cls_)0*(\d+)$/i);
      const parsedId = compactMatch ? parseInt(compactMatch[1], 10) : undefined;
      andClauses.push({
        OR: [
          { class_name: { contains: q } },
          { class_code: { contains: q } },
          ...(parsedId && !Number.isNaN(parsedId) ? [{ id: parsedId }] : []),
          {
            enrollment_classes: {
              some: {
                enrollment: {
                  OR: [
                    { external_id: { contains: q } },
                    {
                      student: {
                        OR: [
                          { full_name: { contains: q } },
                          { external_id: { contains: q } },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      });
    }

    if (options?.relevantDate) {
      const [y, m, d] = options.relevantDate.split('-').map(Number);
      const targetDate = new Date(Date.UTC(y, m - 1, d));
      const jsDay = new Date(y, m - 1, d).getDay();
      const dayToken = jsDay === 0 ? 'CN' : String(jsDay + 1);

      andClauses.push({
        OR: [
          {
            class_sessions: {
              some: {
                session_date: targetDate,
              },
            },
          },
          {
            class_schedules: {
              some: {
                AND: [
                  { schedule_pattern: { contains: dayToken } },
                  { NOT: { schedule_pattern: { contains: 'LKCD' } } },
                ],
              },
            },
          },
        ],
      });
    }

    if (andClauses.length === 0) return undefined;
    if (andClauses.length === 1) return andClauses[0];
    return { AND: andClauses };
  }

  async attachFullCourseAttendanceStats(
    classes: any[],
    summaryMonth?: string,
  ): Promise<void> {
    const ecIds: number[] = [];
    for (const cls of classes) {
      for (const ec of cls.enrollment_classes || []) {
        if (typeof ec.id === 'number') ecIds.push(ec.id);
      }
    }
    if (ecIds.length === 0) return;

    const now = new Date();
    const defaultMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthPrefix =
      summaryMonth && /^\d{4}-\d{2}$/.test(summaryMonth.trim())
        ? summaryMonth.trim()
        : defaultMonthPrefix;

    const statsByEcId = new Map<number, ClassEnrollmentAttendanceStats>();
    for (const id of ecIds) {
      statsByEcId.set(id, {
        totalAttendedAdmin: 0,
        totalAttendedTeacher: 0,
        monthAttendedAdmin: 0,
        monthAttendedTeacher: 0,
      });
    }

    if (typeof (prisma.attendance as any)?.findMany === 'function') {
      const rows = await prisma.attendance.findMany({
        where: {
          enrollment_class_id: { in: ecIds },
          deleted_at: null,
        },
        select: {
          enrollment_class_id: true,
          status: true,
          teacher_status: true,
          cs_status: true,
          class_session: {
            select: {
              session_date: true,
            },
          },
        },
      });

      for (const row of rows || []) {
        const cur = statsByEcId.get(row.enrollment_class_id);
        if (!cur) continue;
        const dStr = formatDateYmd(row.class_session?.session_date);
        const isInMonth = Boolean(dStr && dStr.startsWith(monthPrefix));

        const adminEffective = row.status || row.teacher_status;
        const teacherEffective = row.teacher_status || row.status;

        if (adminEffective === 'ATTENDED') {
          cur.totalAttendedAdmin += 1;
          if (isInMonth) cur.monthAttendedAdmin += 1;
        }
        if (teacherEffective === 'ATTENDED') {
          cur.totalAttendedTeacher += 1;
          if (isInMonth) cur.monthAttendedTeacher += 1;
        }
      }
    }

    for (const cls of classes) {
      for (const ec of cls.enrollment_classes || []) {
        ec.attendance_stats = statsByEcId.get(ec.id) || {
          totalAttendedAdmin: 0,
          totalAttendedTeacher: 0,
          monthAttendedAdmin: 0,
          monthAttendedTeacher: 0,
        };
      }
    }
  }

  async findAll(
    accessibleClassIds?: number[] | null,
    options?: ClassListQueryOptions,
  ) {
    const where = this.buildWhereClause(accessibleClassIds, options);

    const sessionDateWhere: any = {};
    if (options?.sessionFrom) {
      sessionDateWhere.gte = new Date(`${options.sessionFrom}T00:00:00.000Z`);
    }
    if (options?.sessionTo) {
      sessionDateWhere.lte = new Date(`${options.sessionTo}T00:00:00.000Z`);
    }
    const hasSessionBounds = Object.keys(sessionDateWhere).length > 0;

    const isPaginated = Boolean(options?.isPaginated);
    const page = options?.page && options.page >= 1 ? options.page : 1;
    const pageSize = options?.pageSize && options.pageSize >= 1 ? Math.min(options.pageSize, 100) : 50;

    const classes = await prisma.class.findMany({
      where,
      ...(isPaginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      include: {
        class_teachers: {
          include: { teacher: true }
        },
        class_schedules: true,
        class_sessions: {
          ...(hasSessionBounds ? { where: { session_date: sessionDateWhere } } : {}),
          orderBy: [{ session_date: 'asc' }, { session_number: 'asc' }],
        },
        enrollment_classes: {
          include: {
            enrollment: {
              include: {
                student: true,
                package: true,
                sale: true,
              },
            },
            attendance: {
              where: {
                deleted_at: null,
                ...(hasSessionBounds ? { class_session: { session_date: sessionDateWhere } } : {}),
              },
              include: {
                class_session: true,
              },
            },
          },
        },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });

    await this.attachFullCourseAttendanceStats(classes, options?.summaryMonth);
    return classes;
  }

  async computeMeta(
    accessibleClassIds: number[] | null | undefined,
    options: ClassListQueryOptions | undefined,
    currentData: any[],
  ): Promise<ClassListMeta> {
    const isPaginated = Boolean(options?.isPaginated);
    const page = options?.page && options.page >= 1 ? options.page : 1;
    let total = currentData.length;

    if (isPaginated && typeof (prisma.class as any)?.count === 'function') {
      try {
        const where = this.buildWhereClause(accessibleClassIds, options);
        total = await prisma.class.count({ where });
      } catch {
        total = currentData.length;
      }
    }

    const effectivePageSize = isPaginated
      ? (options?.pageSize && options.pageSize >= 1 ? Math.min(options.pageSize, 100) : 50)
      : Math.max(1, currentData.length);
    const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

    return {
      page: isPaginated ? page : 1,
      pageSize: effectivePageSize,
      total,
      totalPages,
      facets: {},
      filterOptions: {},
    };
  }

  async findById(id: number) {
    return prisma.class.findUnique({
      where: { id },
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
        class_sessions: {
          include: {
            attendance: {
              where: { deleted_at: null },
            },
          },
          orderBy: [{ session_date: 'asc' }, { session_number: 'asc' }],
        },
        enrollment_classes: {
          include: {
            enrollment: {
              include: {
                student: true,
                package: true,
                sale: true,
              },
            },
            attendance: {
              where: { deleted_at: null },
              include: {
                class_session: true,
              },
            },
          },
        },
      },
    });
  }

  async findByCode(class_code: string) {
    return prisma.class.findFirst({
      where: { class_code }
    });
  }

  async create(data: {
    class_code?: string;
    class_name: string;
    level?: string;
    model_type: ClassModelType;
    attendance_source?: AttendanceSourceType;
  }) {
    return prisma.class.create({
      data: {
        class_name: data.class_name,
        class_code: data.class_code,
        level: data.level,
        model_type: data.model_type,
        attendance_source: data.attendance_source || AttendanceSourceType.LEARNING_SYSTEM,
      }
    });
  }

  async update(id: number, data: {
    class_code?: string;
    class_name?: string;
    level?: string;
    model_type?: ClassModelType;
    attendance_source?: AttendanceSourceType;
    active?: boolean;
  }) {
    return prisma.class.update({
      where: { id },
      data
    });
  }

  async assignTeacher(classId: number, data: AssignTeacherDTO) {
    const startDate = data.start_date ? new Date(data.start_date) : undefined;
    const endDate = data.end_date ? new Date(data.end_date) : undefined;

    return prisma.classTeacher.create({
      data: {
        class_id: classId,
        teacher_id: data.teacher_id,
        role: data.role,
        start_date: startDate,
        end_date: endDate,
        ...(data.active !== undefined ? { active: data.active } : {}),
      }
    });
  }

  async findTeacherAssignment(classId: number, assignmentId: number) {
    return prisma.classTeacher.findFirst({
      where: { id: assignmentId, class_id: classId },
    });
  }

  async endTeacherAssignment(assignmentId: number, endDate: Date) {
    return prisma.classTeacher.update({
      where: { id: assignmentId },
      data: {
        active: false,
        end_date: endDate,
      },
    });
  }
}
