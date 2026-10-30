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
  if (trimmed === '1:1' || trimmed === '1-1' || upper === 'ONE_TO_ONE') return ClassModelType.ONE_TO_ONE;
  if (trimmed === '1:2' || trimmed === '1-2' || upper === 'ONE_TO_TWO') return ClassModelType.ONE_TO_TWO;
  if (trimmed === '1:n' || trimmed === '1-n' || upper === '1:N' || upper === '1-N' || upper === 'ONE_TO_N' || upper === 'GROUP' || upper === 'NHÓM') return ClassModelType.ONE_TO_N;
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

function buildRelevantDateClause(dateStr: string): any {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d));
  const jsDay = new Date(y, m - 1, d).getDay();
  const dayToken = jsDay === 0 ? 'CN' : String(jsDay + 1);

  return {
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
  };
}

function isClassRelevantOnDateInMemory(cls: any, dateStr: string): boolean {
  const hasSessionOnDate = (cls.class_sessions || []).some(
    (s: any) => formatDateYmd(s.session_date) === dateStr,
  );
  if (hasSessionOnDate) return true;

  const raw = (cls.class_schedules || [])
    .map((s: any) => s.schedule_pattern || '')
    .filter(Boolean)
    .join('');
  if (!raw || raw.toUpperCase().includes('LKCD')) return false;

  const normalized = raw.toUpperCase().replace(/[^0-9CN]/g, '');
  const [y, m, d] = dateStr.split('-').map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  const code = jsDay === 0 ? 'CN' : String(jsDay + 1);
  return code === 'CN' ? normalized.includes('CN') : normalized.includes(code);
}

export class ClassesRepository {
  buildWhereClause(
    accessibleClassIds?: number[] | null,
    options?: ClassListQueryOptions,
    opts?: { includeRelevantDate?: boolean },
  ): any {
    const includeRelevant = opts?.includeRelevantDate ?? true;
    const andClauses: any[] = [];

    if (accessibleClassIds !== null && accessibleClassIds !== undefined) {
      andClauses.push({ id: { in: accessibleClassIds } });
    }

    if (options?.active !== undefined) {
      andClauses.push({ active: options.active });
    }

    const effectiveModel = options?.modelType || options?.modelFilter;
    if (effectiveModel) {
      const normalizedModel = normalizeModelTypeInput(effectiveModel);
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

    if (includeRelevant && options?.relevantDate) {
      andClauses.push(buildRelevantDateClause(options.relevantDate));
    }

    // Advanced filters
    if (options?.teacherName && options.teacherName.trim()) {
      const tName = options.teacherName.trim();
      andClauses.push({
        class_teachers: {
          some: {
            teacher: { name: { contains: tName } },
          },
        },
      });
    }

    if (options?.teacherCode && options.teacherCode.trim()) {
      const tCode = options.teacherCode.trim();
      andClauses.push({
        class_teachers: {
          some: {
            teacher: { code: { contains: tCode } },
          },
        },
      });
    }

    if (options?.className && options.className.trim()) {
      const cName = options.className.trim();
      andClauses.push({
        OR: [
          { class_name: { contains: cName } },
          { class_code: { contains: cName } },
        ],
      });
    }

    if (options?.schedulePattern && options.schedulePattern.trim()) {
      const sp = options.schedulePattern.trim();
      andClauses.push({
        class_schedules: {
          some: {
            schedule_pattern: { contains: sp },
          },
        },
      });
    }

    if (options?.startTime && options.startTime.trim()) {
      const st = options.startTime.trim();
      andClauses.push({
        class_schedules: {
          some: {
            start_time: { contains: st },
          },
        },
      });
    }

    if (options?.courseLevel && options.courseLevel.trim()) {
      const cLevel = options.courseLevel.trim();
      andClauses.push({
        OR: [
          { level: { contains: cLevel } },
          {
            enrollment_classes: {
              some: {
                enrollment: { level: { contains: cLevel } },
              },
            },
          },
        ],
      });
    }

    if (options?.courseCategory && options.courseCategory.trim()) {
      const cat = options.courseCategory.trim().toUpperCase();
      if (cat === 'KAIWA') {
        andClauses.push({
          OR: [
            { level: { contains: 'kaiwa' } },
            { class_name: { contains: 'kaiwa' } },
            {
              enrollment_classes: {
                some: {
                  enrollment: {
                    OR: [
                      { course_content: { contains: 'kaiwa' } },
                      { program_type: 'KAIWA' },
                    ],
                  },
                },
              },
            },
          ],
        });
      } else if (cat === 'JNPT' || cat === 'JLPT') {
        andClauses.push({
          OR: [
            { level: { contains: 'jlpt' } },
            { level: { contains: 'jnpt' } },
            { level: { contains: 'N1' } },
            { level: { contains: 'N2' } },
            { level: { contains: 'N3' } },
            { level: { contains: 'N4' } },
            { level: { contains: 'N5' } },
            { class_name: { contains: 'jlpt' } },
            { class_name: { contains: 'jnpt' } },
            { class_name: { contains: 'N1' } },
            { class_name: { contains: 'N2' } },
            { class_name: { contains: 'N3' } },
            { class_name: { contains: 'N4' } },
            { class_name: { contains: 'N5' } },
            {
              enrollment_classes: {
                some: {
                  enrollment: {
                    OR: [
                      { course_content: { contains: 'jlpt' } },
                      { course_content: { contains: 'jnpt' } },
                      { program_type: 'JLPT' },
                    ],
                  },
                },
              },
            },
          ],
        });
      }
    }

    if (options?.programType && options.programType.trim() && options.programType.trim().toUpperCase() !== 'ALL') {
      const pt = options.programType.trim().toUpperCase();
      if (pt === 'KAIWA') {
        andClauses.push({
          OR: [
            { enrollment_classes: { some: { enrollment: { program_type: 'KAIWA' } } } },
            { class_name: { contains: 'kaiwa' } },
            { level: { contains: 'kaiwa' } },
          ],
        });
      } else if (pt === 'JLPT') {
        andClauses.push({
          OR: [
            { enrollment_classes: { some: { enrollment: { program_type: 'JLPT' } } } },
            { class_name: { contains: 'jlpt' } },
            { class_name: { contains: 'jnpt' } },
            { level: { contains: 'jlpt' } },
            { level: { contains: 'jnpt' } },
            { level: { contains: 'N1' } },
            { level: { contains: 'N2' } },
            { level: { contains: 'N3' } },
            { level: { contains: 'N4' } },
            { level: { contains: 'N5' } },
          ],
        });
      } else {
        andClauses.push({
          enrollment_classes: {
            some: {
              enrollment: { program_type: pt },
            },
          },
        });
      }
    }

    if (options?.packageName && options.packageName.trim()) {
      const pkg = options.packageName.trim();
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              package: {
                OR: [
                  { name: { contains: pkg } },
                  { code: { contains: pkg } },
                ],
              },
            },
          },
        },
      });
    }

    if (options?.status && options.status.trim()) {
      const st = options.status.trim().toUpperCase();
      if (st === 'FINISHED') {
        andClauses.push({
          OR: [
            { active: false },
            {
              enrollment_classes: {
                some: {
                  enrollment: { status: 'FINISHED' as any },
                },
              },
            },
          ],
        });
      } else if (st === 'STUDYING') {
        andClauses.push({ active: true });
      } else {
        andClauses.push({
          enrollment_classes: {
            some: {
              enrollment: { status: st as any },
            },
          },
        });
      }
    }

    if (options?.sale && options.sale.trim()) {
      const sale = options.sale.trim();
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              OR: [
                { sale_name: { contains: sale } },
                { cs: { name: { contains: sale } } },
                { cs: { email: { contains: sale } } },
              ],
            },
          },
        },
      });
    }

    if (options?.startDateOp === 'EXACT' && options.startDateExact) {
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              start_date: new Date(`${options.startDateExact}T00:00:00.000Z`),
            },
          },
        },
      });
    } else if (options?.startDateFrom || options?.startDateTo) {
      const dateCond: any = {};
      if (options.startDateFrom) dateCond.gte = new Date(`${options.startDateFrom}T00:00:00.000Z`);
      if (options.startDateTo) dateCond.lte = new Date(`${options.startDateTo}T00:00:00.000Z`);
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              start_date: dateCond,
            },
          },
        },
      });
    }

    if (options?.endDateOp === 'EXACT' && options.endDateExact) {
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              end_date: new Date(`${options.endDateExact}T00:00:00.000Z`),
            },
          },
        },
      });
    } else if (options?.endDateFrom || options?.endDateTo) {
      const dateCond: any = {};
      if (options.endDateFrom) dateCond.gte = new Date(`${options.endDateFrom}T00:00:00.000Z`);
      if (options.endDateTo) dateCond.lte = new Date(`${options.endDateTo}T00:00:00.000Z`);
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              end_date: dateCond,
            },
          },
        },
      });
    }

    if (options?.totalSessionsOp === 'EXACT' && options.totalSessionsExact !== undefined) {
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              total_sessions: options.totalSessionsExact,
            },
          },
        },
      });
    } else if (options?.totalSessionsMin !== undefined || options?.totalSessionsMax !== undefined) {
      const numCond: any = {};
      if (options.totalSessionsMin !== undefined) numCond.gte = options.totalSessionsMin;
      if (options.totalSessionsMax !== undefined) numCond.lte = options.totalSessionsMax;
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              total_sessions: numCond,
            },
          },
        },
      });
    }

    if (options?.remainingSessionsOp === 'EXACT' && options.remainingSessionsExact !== undefined) {
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              external_remaining_sessions: options.remainingSessionsExact,
            },
          },
        },
      });
    } else if (options?.remainingSessionsMin !== undefined || options?.remainingSessionsMax !== undefined) {
      const numCond: any = {};
      if (options.remainingSessionsMin !== undefined) numCond.gte = options.remainingSessionsMin;
      if (options.remainingSessionsMax !== undefined) numCond.lte = options.remainingSessionsMax;
      andClauses.push({
        enrollment_classes: {
          some: {
            enrollment: {
              external_remaining_sessions: numCond,
            },
          },
        },
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
    const pageSize = options?.pageSize && options.pageSize >= 1 ? Math.min(options.pageSize, 200) : 25;

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
    const page = options?.page && options.page >= 1 ? filtersPageSafe(options?.page) : 1;
    const where = this.buildWhereClause(accessibleClassIds, options);

    let total = currentData.length;
    if (isPaginated && typeof (prisma.class as any)?.count === 'function') {
      try {
        const counted = await prisma.class.count({ where });
        if (typeof counted === 'number') total = counted;
      } catch {
        total = currentData.length;
      }
    }

    let totalStudentsCount = currentData.reduce(
      (acc, c) => acc + (Array.isArray(c.enrollment_classes) ? c.enrollment_classes.length : 0),
      0,
    );
    if (isPaginated && typeof (prisma.enrollmentClass as any)?.count === 'function') {
      try {
        const countedStudents = await prisma.enrollmentClass.count({
          where: where ? { class: where } : undefined,
        });
        if (typeof countedStudents === 'number') totalStudentsCount = countedStudents;
      } catch {
        // Fallback to currentData sum
      }
    }

    const referenceDate = options?.relevantDate || options?.sessionFrom;
    let relevantOnDateCount: number | undefined;
    if (referenceDate) {
      relevantOnDateCount = currentData.filter((c) =>
        isClassRelevantOnDateInMemory(c, referenceDate),
      ).length;

      if (isPaginated && typeof (prisma.class as any)?.count === 'function') {
        try {
          const whereWithRelevant = this.buildWhereClause(
            accessibleClassIds,
            { ...options, relevantDate: referenceDate },
            { includeRelevantDate: true },
          );
          const countedRelevant = await prisma.class.count({ where: whereWithRelevant });
          if (typeof countedRelevant === 'number') relevantOnDateCount = countedRelevant;
        } catch {
          // Fallback to in-memory count
        }
      }
    }

    const effectivePageSize = isPaginated
      ? (options?.pageSize && options.pageSize >= 1 ? Math.min(options.pageSize, 200) : 25)
      : Math.max(1, currentData.length);
    const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

    let rowsForFacets: any[] = currentData;
    const scopeWhere =
      accessibleClassIds !== null && accessibleClassIds !== undefined
        ? { id: { in: accessibleClassIds } }
        : undefined;

    if (
      (isPaginated || (options?.programType && options.programType.toUpperCase() !== 'ALL')) &&
      typeof (prisma.class as any)?.findMany === 'function'
    ) {
      try {
        const fetched = await prisma.class.findMany({
          where: scopeWhere,
          select: {
            id: true,
            class_name: true,
            level: true,
            class_teachers: {
              select: {
                teacher: { select: { name: true, code: true } },
              },
            },
            enrollment_classes: {
              select: {
                enrollment: {
                  select: {
                    program_type: true,
                    sale_name: true,
                    cs: { select: { name: true, email: true } },
                    sale: { select: { name: true } },
                    package: { select: { name: true, code: true } },
                  },
                },
              },
            },
          },
        });
        if (Array.isArray(fetched) && fetched.length > 0) {
          rowsForFacets = fetched;
        }
      } catch {
        rowsForFacets = currentData;
      }
    }

    let kaiwa = 0;
    let jlpt = 0;
    const salesSet = new Set<string>();
    const packagesSet = new Set<string>();
    const teachersSet = new Set<string>();
    const teacherCodesSet = new Set<string>();
    const classesSet = new Set<string>();

    for (const c of rowsForFacets) {
      if (c.class_name && c.class_name !== 'Chưa xếp lớp' && c.class_name !== '—' && c.class_name !== 'Lớp học') {
        classesSet.add(c.class_name);
      }

      for (const ct of c.class_teachers || []) {
        const tName = ct.teacher?.name;
        const tCode = ct.teacher?.code;
        if (tName && tName !== 'Chưa xếp GV' && tName !== 'Giáo viên') {
          teachersSet.add(tName);
        }
        if (tCode && tCode !== '—' && tCode !== 'GV_--') {
          teacherCodesSet.add(tCode);
        }
      }

      let hasJlpt = false;
      let hasKaiwa = false;
      for (const ec of c.enrollment_classes || []) {
        const enr = ec.enrollment;
        if (!enr) continue;
        const pt = (enr.program_type || '').toUpperCase();
        if (pt === 'JLPT') hasJlpt = true;
        else if (pt === 'KAIWA') hasKaiwa = true;

        if (enr.sale_name) salesSet.add(enr.sale_name);
        if (enr.sale?.name) salesSet.add(enr.sale.name);
        if (enr.cs?.name) salesSet.add(enr.cs.name);
        if (enr.cs?.email) salesSet.add(enr.cs.email);

        const pkgName = enr.package?.name || enr.package?.code;
        if (pkgName && pkgName !== 'Gói học' && pkgName !== '-') {
          packagesSet.add(pkgName);
        }
      }

      if (!hasJlpt && !hasKaiwa) {
        const lvl = String(c.level || c.class_name || '').toLowerCase();
        if (lvl.includes('jlpt') || lvl.includes('jnpt') || /\bn[1-5]\b/i.test(lvl)) {
          hasJlpt = true;
        } else {
          hasKaiwa = true;
        }
      }

      if (hasJlpt) jlpt++;
      if (hasKaiwa) kaiwa++;
    }

    return {
      page: isPaginated ? page : 1,
      pageSize: effectivePageSize,
      total,
      totalPages,
      facets: {
        totalStudentsCount,
        ...(relevantOnDateCount !== undefined ? { relevantOnDateCount } : {}),
        programCounts: {
          all: rowsForFacets.length,
          kaiwa,
          jlpt,
        },
      },
      filterOptions: {
        salesList: Array.from(salesSet).filter(Boolean).sort(),
        packagesList: Array.from(packagesSet).filter(Boolean).sort(),
        teachersList: Array.from(teachersSet).filter(Boolean).sort(),
        teacherCodesList: Array.from(teacherCodesSet).filter(Boolean).sort(),
        classesList: Array.from(classesSet).filter(Boolean).sort(),
      },
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

function filtersPageSafe(page?: number): number {
  return page && page >= 1 ? page : 1;
}
