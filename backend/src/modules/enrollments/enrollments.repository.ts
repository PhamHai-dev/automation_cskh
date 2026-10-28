import { prisma } from '../../prisma/client';
import {
  CreateEnrollmentDTO,
  UpdateEnrollmentDTO,
  TransferClassDTO,
  EnrollmentListFilters,
  EnrollmentClassAttendanceStats,
  SideAttendanceCounts,
  EnrollmentListMeta,
} from './enrollments.types';

export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  last_login_at: true,
} as const;

function buildEnrollmentIncludes(sessionRange?: { fromDate?: Date; toDate?: Date }) {
  const sessionDateWhere: any = {};
  if (sessionRange?.fromDate) sessionDateWhere.gte = sessionRange.fromDate;
  if (sessionRange?.toDate) sessionDateWhere.lte = sessionRange.toDate;
  const hasDateBounds = Object.keys(sessionDateWhere).length > 0;

  return {
    student: true,
    package: true,
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
            class_sessions: {
              ...(hasDateBounds ? { where: { session_date: sessionDateWhere } } : {}),
              orderBy: [{ session_date: 'asc' as const }, { session_number: 'asc' as const }],
            },
          },
        },
        attendance: {
          where: {
            deleted_at: null,
            ...(hasDateBounds ? { class_session: { session_date: sessionDateWhere } } : {}),
          },
          include: {
            class_session: true,
          },
        },
      },
    },
  };
}

function emptySideCounts(): SideAttendanceCounts {
  return { totalAttended: 0, totalAbsentA: 0, totalAbsentC: 0, totalTeacherD: 0 };
}

function emptyEnrollmentClassStats(): EnrollmentClassAttendanceStats {
  return {
    ADMIN: emptySideCounts(),
    TEACHER: emptySideCounts(),
    CS: emptySideCounts(),
  };
}

function accumulateSideStatus(counts: SideAttendanceCounts, status?: string | null) {
  if (!status) return;
  if (status === 'ATTENDED') counts.totalAttended += 1;
  else if (status === 'ABSENT_APPROVED_A') counts.totalAbsentA += 1;
  else if (status === 'ABSENT_UNAPPROVED_C') counts.totalAbsentC += 1;
  else if (status === 'TEACHER_ABSENT_D') counts.totalTeacherD += 1;
}

function normalizeModelValue(model?: string | null): string {
  const upper = (model || '').toUpperCase().trim();
  if (upper === 'ONE_TO_ONE' || upper === '1:1' || upper === '1-1') return '1:1';
  if (upper === 'ONE_TO_TWO' || upper === '1:2' || upper === '1-2') return '1:2';
  if (upper === 'ONE_TO_N' || upper === 'GROUP' || upper === '1:N' || upper === '1-N' || upper === 'NHÓM') return '1:n';
  return model || '1:1';
}

export class EnrollmentsRepository {
  /**
   * Build the Prisma `where` clause combining mandatory CS scope with optional filters.
   * Scope is ALWAYS enforced as an outer AND constraint so no filter can widen scope.
   */
  buildWhereClause(
    scopeCsIds: number[] | number | undefined,
    saleIdentifier?: string,
    filters?: EnrollmentListFilters,
    opts?: { includeProgramType?: boolean; includeStatus?: boolean },
  ): any {
    const includeProgram = opts?.includeProgramType ?? true;
    const includeStatus = opts?.includeStatus ?? true;

    const andClauses: any[] = [];

    // 1. Mandatory scope
    if (typeof scopeCsIds === 'number') {
      if (filters?.csId !== undefined) {
        andClauses.push({ cs_id: filters.csId === scopeCsIds ? scopeCsIds : { in: [] } });
      } else {
        andClauses.push({ cs_id: scopeCsIds });
      }
    } else if (Array.isArray(scopeCsIds)) {
      if (filters?.csId !== undefined) {
        andClauses.push({ cs_id: scopeCsIds.includes(filters.csId) ? filters.csId : { in: [] } });
      } else {
        andClauses.push({ cs_id: { in: scopeCsIds } });
      }
    } else if (filters?.csId !== undefined) {
      andClauses.push({ cs_id: filters.csId });
    }

    // 2. Program type
    const programType =
      includeProgram && filters?.programType && filters.programType.toUpperCase() !== 'ALL'
        ? filters.programType.toUpperCase()
        : undefined;
    if (programType) {
      andClauses.push({ program_type: programType });
    }

    // 3. Sale filter (only applied when saleIdentifier or filters.sale is provided;
    // because scope is already in `andClauses`, this narrows within scope and never widens it)
    const sale = saleIdentifier || filters?.sale;
    if (sale && sale.trim()) {
      const s = sale.trim();
      andClauses.push({
        OR: [
          { sale_name: { equals: s } },
          { cs: { name: { equals: s } } },
          { cs: { email: { equals: s } } },
        ],
      });
    }

    // 4. Status
    if (includeStatus && filters?.status && filters.status.trim()) {
      andClauses.push({ status: filters.status.trim().toUpperCase() as any });
    }

    // 5. Search (student.full_name, student.external_id, external_id, student.phone, student.email)
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      andClauses.push({
        OR: [
          { external_id: { contains: q } },
          { student: { full_name: { contains: q } } },
          { student: { external_id: { contains: q } } },
          { student: { phone: { contains: q } } },
          { student: { email: { contains: q } } },
        ],
      });
    }

    // 6. Package name
    if (filters?.packageName && filters.packageName.trim()) {
      const pkg = filters.packageName.trim();
      andClauses.push({
        package: {
          OR: [
            { name: { contains: pkg } },
            { code: { contains: pkg } },
          ],
        },
      });
    }

    // 7. Teacher name / code / Class name / Schedule pattern / Start time
    if (filters?.teacherName && filters.teacherName.trim()) {
      const tName = filters.teacherName.trim();
      andClauses.push({
        enrollment_classes: {
          some: {
            class: {
              class_teachers: {
                some: {
                  teacher: { name: { equals: tName } },
                },
              },
            },
          },
        },
      });
    }

    if (filters?.teacherCode && filters.teacherCode.trim()) {
      const tCode = filters.teacherCode.trim();
      andClauses.push({
        enrollment_classes: {
          some: {
            class: {
              class_teachers: {
                some: {
                  teacher: { code: { equals: tCode } },
                },
              },
            },
          },
        },
      });
    }

    if (filters?.className && filters.className.trim()) {
      const cName = filters.className.trim();
      andClauses.push({
        enrollment_classes: {
          some: {
            class: {
              class_name: { contains: cName },
            },
          },
        },
      });
    }

    if (filters?.schedulePattern && filters.schedulePattern.trim()) {
      const sp = filters.schedulePattern.trim();
      andClauses.push({
        enrollment_classes: {
          some: {
            class: {
              class_schedules: {
                some: {
                  schedule_pattern: { contains: sp },
                },
              },
            },
          },
        },
      });
    }

    if (filters?.startTime && filters.startTime.trim()) {
      const st = filters.startTime.trim();
      andClauses.push({
        enrollment_classes: {
          some: {
            class: {
              class_schedules: {
                some: {
                  start_time: { contains: st },
                },
              },
            },
          },
        },
      });
    }

    // 8. Model filter ('1:1', '1:2', '1:n')
    if (filters?.modelFilter && filters.modelFilter.trim()) {
      const mf = normalizeModelValue(filters.modelFilter);
      const enumVal =
        mf === '1:1' ? 'ONE_TO_ONE' : mf === '1:2' ? 'ONE_TO_TWO' : 'ONE_TO_N';
      const rawVariants =
        mf === '1:1'
          ? ['1:1', '1-1', 'ONE_TO_ONE']
          : mf === '1:2'
          ? ['1:2', '1-2', 'ONE_TO_TWO']
          : ['1:n', '1-N', 'ONE_TO_N', 'GROUP', 'Nhóm'];
      andClauses.push({
        OR: [
          { class_model: { in: rawVariants } },
          {
            enrollment_classes: {
              some: {
                class: { model_type: enumVal as any },
              },
            },
          },
        ],
      });
    }

    // 9. Start date / End date (EXACT or RANGE)
    if (filters?.startDateOp === 'EXACT' && filters.startDateExact) {
      andClauses.push({ start_date: new Date(`${filters.startDateExact}T00:00:00.000Z`) });
    } else if (filters?.startDateFrom || filters?.startDateTo) {
      const dateCond: any = {};
      if (filters.startDateFrom) dateCond.gte = new Date(`${filters.startDateFrom}T00:00:00.000Z`);
      if (filters.startDateTo) dateCond.lte = new Date(`${filters.startDateTo}T00:00:00.000Z`);
      andClauses.push({ start_date: dateCond });
    }

    if (filters?.endDateOp === 'EXACT' && filters.endDateExact) {
      andClauses.push({ end_date: new Date(`${filters.endDateExact}T00:00:00.000Z`) });
    } else if (filters?.endDateFrom || filters?.endDateTo) {
      const dateCond: any = {};
      if (filters.endDateFrom) dateCond.gte = new Date(`${filters.endDateFrom}T00:00:00.000Z`);
      if (filters.endDateTo) dateCond.lte = new Date(`${filters.endDateTo}T00:00:00.000Z`);
      andClauses.push({ end_date: dateCond });
    }

    // 10. Total sessions (EXACT or RANGE)
    if (filters?.totalSessionsOp === 'EXACT' && filters.totalSessionsExact !== undefined) {
      andClauses.push({ total_sessions: filters.totalSessionsExact });
    } else if (filters?.totalSessionsMin !== undefined || filters?.totalSessionsMax !== undefined) {
      const numCond: any = {};
      if (filters.totalSessionsMin !== undefined) numCond.gte = filters.totalSessionsMin;
      if (filters.totalSessionsMax !== undefined) numCond.lte = filters.totalSessionsMax;
      andClauses.push({ total_sessions: numCond });
    }

    if (andClauses.length === 0) return undefined;
    if (andClauses.length === 1) return andClauses[0];
    return { AND: andClauses };
  }

  /**
   * Batch-fetches full-course attendance statistics for all EnrollmentClass IDs in 1 query
   * and attaches `ec.attendance_stats` to every `enrollment_class`.
   */
  async attachFullCourseAttendanceStats(enrollments: any[]): Promise<Map<number, EnrollmentClassAttendanceStats>> {
    const ecIds: number[] = [];
    for (const enr of enrollments) {
      for (const ec of enr.enrollment_classes || []) {
        if (typeof ec.id === 'number') ecIds.push(ec.id);
      }
    }

    const statsByEcId = new Map<number, EnrollmentClassAttendanceStats>();
    if (ecIds.length === 0) return statsByEcId;

    for (const id of ecIds) {
      statsByEcId.set(id, emptyEnrollmentClassStats());
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
        },
      });

      for (const row of rows || []) {
        const entry = statsByEcId.get(row.enrollment_class_id) || emptyEnrollmentClassStats();
        accumulateSideStatus(entry.ADMIN, row.status);
        accumulateSideStatus(entry.TEACHER, row.teacher_status);
        accumulateSideStatus(entry.CS, row.cs_status);
        statsByEcId.set(row.enrollment_class_id, entry);
      }
    } else {
      // Fallback for unit-test mocks without prisma.attendance.findMany
      for (const enr of enrollments) {
        for (const ec of enr.enrollment_classes || []) {
          const entry = statsByEcId.get(ec.id) || emptyEnrollmentClassStats();
          for (const att of ec.attendance || []) {
            if (att.deleted_at) continue;
            accumulateSideStatus(entry.ADMIN, att.status);
            accumulateSideStatus(entry.TEACHER, att.teacher_status);
            accumulateSideStatus(entry.CS, att.cs_status);
          }
          statsByEcId.set(ec.id, entry);
        }
      }
    }

    for (const enr of enrollments) {
      for (const ec of enr.enrollment_classes || []) {
        ec.attendance_stats = statsByEcId.get(ec.id) || emptyEnrollmentClassStats();
      }
    }

    return statsByEcId;
  }

  private matchesInMemoryCourseAndSessionFilters(
    enr: any,
    filters: EnrollmentListFilters | undefined,
    statsByEcId: Map<number, EnrollmentClassAttendanceStats>,
  ): boolean {
    if (!filters) return true;

    const ec = enr.enrollment_classes?.[0];
    const cls = ec?.class;
    const levelStr = String(enr.level || cls?.level || '').toLowerCase();
    const contentStr = String(enr.course_content || '').toLowerCase();
    const classNameStr = String(cls?.class_name || '').toLowerCase();

    if (filters.courseCategory === 'KAIWA') {
      const isKaiwa =
        levelStr.includes('kaiwa') ||
        contentStr.includes('kaiwa') ||
        classNameStr.includes('kaiwa');
      if (!isKaiwa) return false;
    } else if (filters.courseCategory === 'JNPT') {
      const isJnpt =
        levelStr.includes('jnpt') ||
        levelStr.includes('jlpt') ||
        /\bn[1-6]\b/i.test(levelStr) ||
        contentStr.includes('jnpt') ||
        contentStr.includes('jlpt') ||
        /\bn[1-6]\b/i.test(contentStr) ||
        classNameStr.includes('jnpt') ||
        classNameStr.includes('jlpt');
      if (!isJnpt) return false;
    }

    if (filters.courseLevel && filters.courseLevel.trim()) {
      const target = filters.courseLevel.trim().toLowerCase();
      let matchesLevel =
        levelStr.includes(target) ||
        contentStr.includes(target) ||
        classNameStr.includes(target);

      if (!matchesLevel && target.startsWith('jnpt ')) {
        const num = target.replace('jnpt ', '').trim();
        matchesLevel =
          levelStr.includes(`n${num}`) ||
          contentStr.includes(`n${num}`) ||
          levelStr.includes(`jlpt ${num}`) ||
          contentStr.includes(`jlpt ${num}`);
      } else if (!matchesLevel && target.startsWith('n')) {
        const num = target.replace('n', '').trim();
        matchesLevel =
          levelStr.includes(`jnpt ${num}`) ||
          contentStr.includes(`jnpt ${num}`) ||
          levelStr.includes(`jlpt ${num}`) ||
          contentStr.includes(`jlpt ${num}`);
      }

      if (!matchesLevel) return false;
    }

    const hasAttendedFilter =
      (filters.attendedSessionsOp === 'EXACT' && filters.attendedSessionsExact !== undefined) ||
      filters.attendedSessionsMin !== undefined ||
      filters.attendedSessionsMax !== undefined;
    const hasRemainingFilter =
      (filters.remainingSessionsOp === 'EXACT' && filters.remainingSessionsExact !== undefined) ||
      filters.remainingSessionsMin !== undefined ||
      filters.remainingSessionsMax !== undefined;

    if (hasAttendedFilter || hasRemainingFilter) {
      const prevAttended = enr.attended_previous_years || 0;
      let attendedCurrent = 0;
      for (const itemEc of enr.enrollment_classes || []) {
        const st = statsByEcId.get(itemEc.id) || itemEc.attendance_stats;
        attendedCurrent += st?.ADMIN?.totalAttended || 0;
      }
      const attended = prevAttended + attendedCurrent;
      const remaining = enr.total_sessions
        ? enr.total_sessions - attended
        : (enr.external_remaining_sessions ?? 0) - attendedCurrent;

      if (filters.attendedSessionsOp === 'EXACT' && filters.attendedSessionsExact !== undefined) {
        if (attended !== filters.attendedSessionsExact) return false;
      } else {
        if (filters.attendedSessionsMin !== undefined && attended < filters.attendedSessionsMin) return false;
        if (filters.attendedSessionsMax !== undefined && attended > filters.attendedSessionsMax) return false;
      }

      if (filters.remainingSessionsOp === 'EXACT' && filters.remainingSessionsExact !== undefined) {
        if (remaining !== filters.remainingSessionsExact) return false;
      } else {
        if (filters.remainingSessionsMin !== undefined && remaining < filters.remainingSessionsMin) return false;
        if (filters.remainingSessionsMax !== undefined && remaining > filters.remainingSessionsMax) return false;
      }
    }

    return true;
  }

  private getSessionDateRange(filters?: EnrollmentListFilters): { fromDate?: Date; toDate?: Date } | undefined {
    if (!filters?.sessionFrom && !filters?.sessionTo) return undefined;
    return {
      fromDate: filters.sessionFrom ? new Date(`${filters.sessionFrom}T00:00:00.000Z`) : undefined,
      toDate: filters.sessionTo ? new Date(`${filters.sessionTo}T00:00:00.000Z`) : undefined,
    };
  }

  async findAllByCS(csId: number, programTypeOrFilters?: string | EnrollmentListFilters) {
    // B.5/D9: CS scope is enrollment.cs_id only. The former ?sale= identifier
    // (sale_name / cs.name / cs.email OR-match) could let a CS widen scope to
    // another CS's enrollments by guessing a name/email; name/email are plain
    // handover data and are never an access grant.
    const filters: EnrollmentListFilters =
      typeof programTypeOrFilters === 'string'
        ? { programType: programTypeOrFilters }
        : programTypeOrFilters || {};

    return this.executeScopedQuery(csId, undefined, filters);
  }

  async findAllByCSIds(csIds: number[], programTypeOrFilters?: string | EnrollmentListFilters) {
    const filters: EnrollmentListFilters =
      typeof programTypeOrFilters === 'string'
        ? { programType: programTypeOrFilters }
        : programTypeOrFilters || {};

    return this.executeScopedQuery(csIds, undefined, filters);
  }

  async findAll(saleIdentifier?: string, filters?: EnrollmentListFilters) {
    return this.executeScopedQuery(undefined, saleIdentifier, filters);
  }

  private async executeScopedQuery(
    scopeCsIds: number[] | number | undefined,
    saleIdentifier?: string,
    filters?: EnrollmentListFilters,
  ) {
    const where = this.buildWhereClause(scopeCsIds, saleIdentifier, filters);
    const sessionRange = this.getSessionDateRange(filters);
    const include = buildEnrollmentIncludes(sessionRange);

    const needsInMemoryFilter = Boolean(
      filters?.courseCategory ||
        filters?.courseLevel ||
        filters?.attendedSessionsExact !== undefined ||
        filters?.attendedSessionsMin !== undefined ||
        filters?.attendedSessionsMax !== undefined ||
        filters?.remainingSessionsExact !== undefined ||
        filters?.remainingSessionsMin !== undefined ||
        filters?.remainingSessionsMax !== undefined,
    );

    const page = filters?.page && filters.page >= 1 ? filters.page : 1;
    const pageSize = filters?.pageSize && filters.pageSize >= 1 ? Math.min(filters.pageSize, 100) : 50;
    const isPaginated = Boolean(filters?.isPaginated);

    const rows = await prisma.enrollment.findMany({
      where,
      ...(isPaginated && !needsInMemoryFilter
        ? { skip: (page - 1) * pageSize, take: pageSize }
        : {}),
      include,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });

    const statsByEcId = await this.attachFullCourseAttendanceStats(rows);

    if (!needsInMemoryFilter) {
      return rows;
    }

    const filtered = rows.filter((enr) =>
      this.matchesInMemoryCourseAndSessionFilters(enr, filters, statsByEcId),
    );

    if (isPaginated) {
      return filtered.slice((page - 1) * pageSize, page * pageSize);
    }

    return filtered;
  }

  async computeMeta(
    scopeCsIds: number[] | number | undefined,
    saleIdentifier: string | undefined,
    filters: EnrollmentListFilters | undefined,
    currentData: any[],
  ): Promise<EnrollmentListMeta> {
    const isPaginated = Boolean(filters?.isPaginated);
    const page = filters?.page && filters.page >= 1 ? filters.page : 1;

    const whereNoProgram = this.buildWhereClause(scopeCsIds, saleIdentifier, filters, {
      includeProgramType: false,
    });

    let rowsForFacets: any[] = currentData;
    if (
      (isPaginated || (filters?.programType && filters.programType.toUpperCase() !== 'ALL')) &&
      typeof (prisma.enrollment as any)?.findMany === 'function'
    ) {
      try {
        const fetched = await prisma.enrollment.findMany({
          where: whereNoProgram,
          select: {
            id: true,
            program_type: true,
            status: true,
            sale_name: true,
            level: true,
            course_content: true,
            total_sessions: true,
            attended_previous_years: true,
            external_remaining_sessions: true,
            cs: { select: { name: true, email: true } },
            package: { select: { name: true, code: true } },
            enrollment_classes: {
              select: {
                id: true,
                class: {
                  select: {
                    class_name: true,
                    level: true,
                    class_teachers: {
                      select: {
                        teacher: { select: { name: true, code: true } },
                      },
                    },
                  },
                },
              },
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
    const salesSet = new Set<string>();
    const packagesSet = new Set<string>();
    const teachersSet = new Set<string>();
    const teacherCodesSet = new Set<string>();
    const classesSet = new Set<string>();

    const normalizedProgramFilter =
      filters?.programType && filters.programType.toUpperCase() !== 'ALL'
        ? filters.programType.toUpperCase()
        : undefined;

    let matchingTotal = 0;
    for (const e of rowsForFacets) {
      const pType = (e.program_type || 'KAIWA').toUpperCase();
      if (pType === 'JLPT') {
        jlpt++;
      } else {
        kaiwa++;
      }

      if (!normalizedProgramFilter || pType === normalizedProgramFilter) {
        matchingTotal++;
        const st = e.status || 'NOT_STARTED';
        statusCounts[st] = (statusCounts[st] || 0) + 1;
      }

      if (e.sale_name) salesSet.add(e.sale_name);
      if (e.cs?.name) salesSet.add(e.cs.name);
      if (e.cs?.email) salesSet.add(e.cs.email);

      const pkgName = e.package?.name || e.package?.code;
      if (pkgName && pkgName !== 'Gói học' && pkgName !== '-') {
        packagesSet.add(pkgName);
      }

      for (const ec of e.enrollment_classes || []) {
        const cls = ec.class;
        if (cls?.class_name && cls.class_name !== 'Chưa xếp lớp' && cls.class_name !== '—' && cls.class_name !== 'Lớp học') {
          classesSet.add(cls.class_name);
        }
        for (const ct of cls?.class_teachers || []) {
          const tName = ct.teacher?.name;
          const tCode = ct.teacher?.code;
          if (tName && tName !== 'Chưa xếp GV' && tName !== 'Giáo viên') {
            teachersSet.add(tName);
          }
          if (tCode && tCode !== '—' && tCode !== 'GV_--') {
            teacherCodesSet.add(tCode);
          }
        }
      }
    }

    const total = isPaginated ? matchingTotal : currentData.length;
    const effectivePageSize = isPaginated
      ? (filters?.pageSize && filters.pageSize >= 1 ? Math.min(filters.pageSize, 100) : 50)
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
        salesList: Array.from(salesSet).filter(Boolean).sort(),
        packagesList: Array.from(packagesSet).filter(Boolean).sort(),
        teachersList: Array.from(teachersSet).filter(Boolean).sort(),
        teacherCodesList: Array.from(teacherCodesSet).filter(Boolean).sort(),
        classesList: Array.from(classesSet).filter(Boolean).sort(),
      },
    };
  }

  async findById(id: number) {
    return prisma.enrollment.findUnique({
      where: { id },
      include: { student: true, package: true, enrollment_classes: { include: { class: true } } }
    });
  }

  async create(data: CreateEnrollmentDTO) {
    const startDate = data.start_date ? new Date(data.start_date) : undefined;
    const endDate = data.end_date ? new Date(data.end_date) : undefined;

    return prisma.enrollment.create({
      data: {
        ...data,
        start_date: startDate,
        end_date: endDate
      }
    });
  }

  async update(id: number, data: UpdateEnrollmentDTO) {
    const startDate = data.start_date ? new Date(data.start_date) : undefined;
    const endDate = data.end_date ? new Date(data.end_date) : undefined;

    return prisma.enrollment.update({
      where: { id },
      data: {
        ...data,
        program_metadata: data.program_metadata !== undefined ? (data.program_metadata as any) : undefined,
        start_date: startDate,
        end_date: endDate
      }
    });
  }

  async reassignCS(id: number, csId: number) {
    return prisma.enrollment.update({
      where: { id },
      data: { cs_id: csId }
    });
  }

  async transferClass(enrollmentId: number, data: TransferClassDTO) {
    const startDate = data.start_date ? new Date(data.start_date) : new Date();

    return prisma.$transaction(async (tx) => {
      // Find current active enrollment_class
      const currentEC = await tx.enrollmentClass.findFirst({
        where: {
          enrollment_id: enrollmentId,
          class_id: data.from_class_id,
          status: 'ACTIVE'
        },
        orderBy: { sequence_no: 'desc' }
      });

      if (currentEC) {
        // End current
        await tx.enrollmentClass.update({
          where: { id: currentEC.id },
          data: { status: 'TRANSFERRED', end_date: startDate }
        });
      }

      // Find max sequence_no for the enrollment
      const maxEC = await tx.enrollmentClass.findFirst({
        where: { enrollment_id: enrollmentId },
        orderBy: { sequence_no: 'desc' }
      });
      const newSequenceNo = maxEC ? maxEC.sequence_no + 1 : 1;

      // Start new
      const newEC = await tx.enrollmentClass.create({
        data: {
          enrollment_id: enrollmentId,
          class_id: data.to_class_id,
          sequence_no: newSequenceNo,
          status: 'ACTIVE',
          start_date: startDate
        }
      });

      return newEC;
    });
  }
}
