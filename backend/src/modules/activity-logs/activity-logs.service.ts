import { prisma } from '../../prisma/client';
import type { AuthUser } from '../../middlewares/auth.middleware';
import type {
  ActivityModuleCode,
  ActivityModuleType,
  AuditActorDto,
  AuditLogListResponseDto,
  AuditLogQueryParams,
  EnrichmentContext,
  LoginAuditListResponseDto,
  LoginAuditQueryParams,
} from './activity-logs.types';
import {
  classifyAuditModule,
  enrichAuditLogItem,
  formatActorDisplay,
} from './audit-helper';

const ALL_MODULES: ActivityModuleCode[] = [
  'ENROLLMENT',
  'ATTENDANCE',
  'CARE',
  'MESSAGING',
  'IMPORT_SYNC',
  'SYSTEM',
];

const LOGIN_STATUS_LABELS: Record<string, string> = {
  SUCCESS: 'Đăng nhập thành công',
  FAILED: 'Sai mật khẩu / thất bại',
  LOCKED: 'Tài khoản bị khóa tạm thời',
  DISABLED: 'Tài khoản bị vô hiệu hóa',
};

export class ActivityLogsService {
  /**
   * Resolve allowed user IDs for MANAGE role (manage_user_id + all members in managed CSGroups).
   */
  async getManageAllowedUserIds(userId: number): Promise<number[]> {
    const allowed = new Set<number>([userId]);
    if (typeof (prisma as any)?.manageAssignment?.findMany === 'function') {
      const assignments = await prisma.manageAssignment.findMany({
        where: { manage_user_id: userId },
        include: {
          cs_group: {
            include: { members: true },
          },
        },
      });
      for (const a of assignments) {
        for (const m of a.cs_group?.members || []) {
          allowed.add(m.user_id);
        }
      }
    }
    return Array.from(allowed);
  }

  /**
   * Load users map for enrichment and actor filtering.
   */
  private async loadUsersMap(): Promise<Map<number, AuditActorDto>> {
    const map = new Map<number, AuditActorDto>();
    if (typeof (prisma as any)?.user?.findMany !== 'function') return map;

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        staff_code: true,
        email: true,
        roles: true,
      },
      orderBy: { id: 'asc' },
    });

    for (const u of users) {
      map.set(u.id, formatActorDisplay(u));
    }
    return map;
  }

  /**
   * Build Prisma where clause for AuditLog based on actor's RBAC scope and date/actor filters.
   */
  private async buildAuditScopeWhere(
    actor: AuthUser,
    query: AuditLogQueryParams,
  ): Promise<Record<string, any>> {
    const roles = actor.roles || [];
    const conditions: any[] = [];

    if (roles.includes('ADMIN')) {
      if (query.actorId) {
        conditions.push({ user_id: query.actorId });
      }
    } else if (roles.includes('MANAGE')) {
      const allowedUserIds = await this.getManageAllowedUserIds(actor.id);
      if (query.actorId) {
        if (!allowedUserIds.includes(query.actorId)) {
          conditions.push({ user_id: -1 });
        } else {
          conditions.push({ user_id: query.actorId });
        }
      } else {
        conditions.push({ user_id: { in: allowedUserIds } });
      }
    } else {
      // CS scope: user_id = actor.id OR entity_type='Enrollment' with entity_id in CS's enrollments
      let csEnrollmentIds: string[] = [];
      if (typeof (prisma as any)?.enrollment?.findMany === 'function') {
        const enrollments = await prisma.enrollment.findMany({
          where: { cs_id: actor.id },
          select: { id: true },
        });
        csEnrollmentIds = enrollments.map((e: any) => String(e.id));
      }

      if (csEnrollmentIds.length > 0) {
        conditions.push({
          OR: [
            { user_id: actor.id },
            {
              entity_type: 'Enrollment',
              entity_id: { in: csEnrollmentIds },
            },
          ],
        });
      } else {
        conditions.push({ user_id: actor.id });
      }

      if (query.actorId) {
        conditions.push({ user_id: query.actorId });
      }
    }

    if (query.action && query.action.trim()) {
      conditions.push({ action: query.action.trim() });
    }

    if (query.fromDate || query.toDate) {
      const createdAt: Record<string, Date> = {};
      if (query.fromDate) {
        createdAt.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
      }
      if (query.toDate) {
        createdAt.lte = new Date(`${query.toDate}T23:59:59.999Z`);
      }
      conditions.push({ created_at: createdAt });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  /**
   * Batch load Student, Enrollment, Class records referenced by the given AuditLog rows.
   */
  private async buildEnrichmentContext(
    rows: any[],
    usersMap: Map<number, AuditActorDto>,
  ): Promise<EnrichmentContext> {
    const enrollmentIds = new Set<number>();
    const studentIds = new Set<number>();
    const classIds = new Set<number>();

    for (const r of rows) {
      const idNum = Number(r.entity_id);
      const ent = (r.entity_type || '').trim();
      const afterObj = r.after_data && typeof r.after_data === 'object' ? r.after_data : {};
      const beforeObj = r.before_data && typeof r.before_data === 'object' ? r.before_data : {};

      if (ent === 'Enrollment' && Number.isInteger(idNum) && idNum > 0) {
        enrollmentIds.add(idNum);
      } else if (ent === 'Student' && Number.isInteger(idNum) && idNum > 0) {
        studentIds.add(idNum);
      } else if (ent === 'Class' && Number.isInteger(idNum) && idNum > 0) {
        classIds.add(idNum);
      }

      if (Number.isInteger(Number(afterObj.enrollment_id)) && Number(afterObj.enrollment_id) > 0) {
        enrollmentIds.add(Number(afterObj.enrollment_id));
      }
      if (Number.isInteger(Number(beforeObj.enrollment_id)) && Number(beforeObj.enrollment_id) > 0) {
        enrollmentIds.add(Number(beforeObj.enrollment_id));
      }
      if (Number.isInteger(Number(afterObj.student_id)) && Number(afterObj.student_id) > 0) {
        studentIds.add(Number(afterObj.student_id));
      }
      if (Number.isInteger(Number(afterObj.class_id)) && Number(afterObj.class_id) > 0) {
        classIds.add(Number(afterObj.class_id));
      }
      if (Number.isInteger(Number(beforeObj.from_class_id)) && Number(beforeObj.from_class_id) > 0) {
        classIds.add(Number(beforeObj.from_class_id));
      }
      if (Number.isInteger(Number(afterObj.to_class_id)) && Number(afterObj.to_class_id) > 0) {
        classIds.add(Number(afterObj.to_class_id));
      }
    }

    const enrollmentsMap = new Map<
      number,
      {
        id: number;
        student_id: number;
        cs_id: number;
        program_type: string;
        student?: { id: number; full_name: string; external_id: string | null } | null;
      }
    >();
    const studentsMap = new Map<
      number,
      { id: number; full_name: string; external_id: string | null }
    >();
    const classesMap = new Map<
      number,
      { id: number; class_code: string | null; class_name: string }
    >();

    await Promise.all([
      enrollmentIds.size > 0 && typeof (prisma as any)?.enrollment?.findMany === 'function'
        ? prisma.enrollment
            .findMany({
              where: { id: { in: Array.from(enrollmentIds) } },
              select: {
                id: true,
                student_id: true,
                cs_id: true,
                program_type: true,
                student: {
                  select: { id: true, full_name: true, external_id: true },
                },
              },
            })
            .then((list: any[]) => {
              for (const e of list || []) {
                enrollmentsMap.set(e.id, e);
                if (e.student) {
                  studentsMap.set(e.student.id, e.student);
                }
              }
            })
            .catch(() => undefined)
        : Promise.resolve(),
      studentIds.size > 0 && typeof (prisma as any)?.student?.findMany === 'function'
        ? prisma.student
            .findMany({
              where: { id: { in: Array.from(studentIds) } },
              select: { id: true, full_name: true, external_id: true },
            })
            .then((list: any[]) => {
              for (const s of list || []) {
                studentsMap.set(s.id, s);
              }
            })
            .catch(() => undefined)
        : Promise.resolve(),
      classIds.size > 0 && typeof (prisma as any)?.class?.findMany === 'function'
        ? prisma.class
            .findMany({
              where: { id: { in: Array.from(classIds) } },
              select: { id: true, class_code: true, class_name: true },
            })
            .then((list: any[]) => {
              for (const c of list || []) {
                classesMap.set(c.id, c);
              }
            })
            .catch(() => undefined)
        : Promise.resolve(),
    ]);

    return {
      usersMap,
      studentsMap,
      enrollmentsMap,
      classesMap,
    };
  }

  /**
   * GET /api/v1/activity-logs/audit
   */
  async listAuditLogs(
    actor: AuthUser,
    query: AuditLogQueryParams,
  ): Promise<AuditLogListResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const moduleFilter: ActivityModuleType =
      query.module &&
      ['ALL', 'ENROLLMENT', 'ATTENDANCE', 'CARE', 'MESSAGING', 'IMPORT_SYNC', 'SYSTEM'].includes(
        query.module,
      )
        ? query.module
        : 'ALL';
    const search = query.search?.trim().toLowerCase() || '';

    const [where, usersMap] = await Promise.all([
      this.buildAuditScopeWhere(actor, query),
      this.loadUsersMap(),
    ]);

    const rawRows =
      typeof (prisma as any)?.auditLog?.findMany === 'function'
        ? await prisma.auditLog.findMany({
            where,
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: 2000,
          })
        : [];

    // Compute stats (today) and moduleCounts before module tab filter
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const todayByModule: Record<ActivityModuleCode, number> = {
      ENROLLMENT: 0,
      ATTENDANCE: 0,
      CARE: 0,
      MESSAGING: 0,
      IMPORT_SYNC: 0,
      SYSTEM: 0,
    };
    let todayTotal = 0;

    const moduleCounts: Record<ActivityModuleType, number> = {
      ALL: 0,
      ENROLLMENT: 0,
      ATTENDANCE: 0,
      CARE: 0,
      MESSAGING: 0,
      IMPORT_SYNC: 0,
      SYSTEM: 0,
    };

    // If search is provided, we enrich candidate rows so search can match student/class/summary/actor name
    const needFullEnrichForSearch = search.length > 0;
    const fullCtx = needFullEnrichForSearch
      ? await this.buildEnrichmentContext(rawRows, usersMap)
      : null;

    const matchedBySearch: Array<{ raw: any; mod: ActivityModuleCode; enriched?: any }> = [];

    for (const row of rawRows) {
      const mod = classifyAuditModule(row.action, row.entity_type, row.after_data);
      const createdAtDate =
        row.created_at instanceof Date ? row.created_at : new Date(row.created_at);

      if (createdAtDate >= startOfToday) {
        todayTotal++;
        todayByModule[mod] = (todayByModule[mod] || 0) + 1;
      }

      if (needFullEnrichForSearch && fullCtx) {
        const enriched = enrichAuditLogItem(row, fullCtx);
        const haystack = [
          enriched.action,
          enriched.actionLabel,
          enriched.entityType,
          enriched.entityId,
          enriched.entityLabel,
          enriched.summary,
          enriched.actor.name || '',
          enriched.actor.code || '',
          enriched.actor.email || '',
          enriched.actor.displayLabel || '',
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(search)) {
          continue;
        }
        matchedBySearch.push({ raw: row, mod, enriched });
      } else {
        matchedBySearch.push({ raw: row, mod });
      }

      moduleCounts.ALL++;
      moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;
    }

    const filteredRows =
      moduleFilter === 'ALL'
        ? matchedBySearch
        : matchedBySearch.filter((item) => item.mod === moduleFilter);

    const total = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIdx = (page - 1) * limit;
    const pageSlice = filteredRows.slice(startIdx, startIdx + limit);

    let items;
    if (needFullEnrichForSearch) {
      items = pageSlice.map((entry) => entry.enriched!);
    } else {
      const pageCtx = await this.buildEnrichmentContext(
        pageSlice.map((e) => e.raw),
        usersMap,
      );
      items = pageSlice.map((entry) => enrichAuditLogItem(entry.raw, pageCtx));
    }

    const lastActivityAt =
      rawRows.length > 0
        ? rawRows[0].created_at instanceof Date
          ? rawRows[0].created_at.toISOString()
          : String(rawRows[0].created_at)
        : null;

    return {
      success: true,
      stats: {
        todayTotal,
        todayByModule,
        lastActivityAt,
      },
      moduleCounts,
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * GET /api/v1/activity-logs/logins
   */
  async listLoginAudits(
    actor: AuthUser,
    query: LoginAuditQueryParams,
  ): Promise<LoginAuditListResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const statusFilter =
      query.status && ['SUCCESS', 'FAILED', 'LOCKED', 'DISABLED'].includes(query.status)
        ? query.status
        : 'ALL';
    const search = query.search?.trim().toLowerCase() || '';

    const roles = actor.roles || [];
    const conditions: any[] = [];

    if (!roles.includes('ADMIN')) {
      // MANAGE scope
      const allowedUserIds = await this.getManageAllowedUserIds(actor.id);
      if (query.actorId) {
        if (!allowedUserIds.includes(query.actorId)) {
          conditions.push({ user_id: -1 });
        } else {
          conditions.push({ user_id: query.actorId });
        }
      } else {
        conditions.push({ user_id: { in: allowedUserIds } });
      }
    } else if (query.actorId) {
      conditions.push({ user_id: query.actorId });
    }

    if (query.fromDate || query.toDate) {
      const createdAt: Record<string, Date> = {};
      if (query.fromDate) {
        createdAt.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
      }
      if (query.toDate) {
        createdAt.lte = new Date(`${query.toDate}T23:59:59.999Z`);
      }
      conditions.push({ created_at: createdAt });
    }

    const baseWhere =
      conditions.length === 0
        ? {}
        : conditions.length === 1
          ? conditions[0]
          : { AND: conditions };

    const [rawRows, usersMap] = await Promise.all([
      typeof (prisma as any)?.loginAudit?.findMany === 'function'
        ? prisma.loginAudit.findMany({
            where: baseWhere,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  staff_code: true,
                  email: true,
                  roles: true,
                },
              },
            },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: 2000,
          })
        : Promise.resolve([]),
      this.loadUsersMap(),
    ]);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    let todayTotal = 0;
    let todaySuccess = 0;
    let todayFailed = 0;

    for (const r of rawRows) {
      const createdAtDate =
        r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
      if (createdAtDate >= startOfToday) {
        todayTotal++;
        if (r.status === 'SUCCESS') {
          todaySuccess++;
        } else {
          todayFailed++;
        }
      }
    }

    const enrichedAll = rawRows
      .filter((r: any) => (statusFilter === 'ALL' ? true : r.status === statusFilter))
      .map((r: any) => {
        const userDto = r.user
          ? formatActorDisplay(r.user)
          : r.user_id && usersMap.has(r.user_id)
            ? usersMap.get(r.user_id)!
            : null;
        return {
          id: r.id,
          createdAt:
            r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
          emailAttempted: r.email_attempted,
          status: r.status,
          statusLabel: LOGIN_STATUS_LABELS[r.status] || r.status,
          reason: r.reason ?? null,
          ipAddress: r.ip_address ?? null,
          userAgent: r.user_agent ?? null,
          actor: userDto,
          user: userDto,
        };
      })
      .filter((item: any) => {
        if (!search) return true;
        const haystack = [
          item.emailAttempted || '',
          item.ipAddress || '',
          item.reason || '',
          item.statusLabel || '',
          item.user?.name || '',
          item.user?.code || '',
          item.user?.email || '',
          item.user?.displayLabel || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });

    const total = enrichedAll.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIdx = (page - 1) * limit;
    const items = enrichedAll.slice(startIdx, startIdx + limit);

    const lastLoginAt =
      rawRows.length > 0
        ? rawRows[0].created_at instanceof Date
          ? rawRows[0].created_at.toISOString()
          : String(rawRows[0].created_at)
        : null;

    return {
      success: true,
      stats: {
        todayTotal,
        todaySuccess,
        todayFailed,
        lastLoginAt,
      },
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * GET /api/v1/activity-logs/actors
   */
  async listActors(actor: AuthUser): Promise<{ success: boolean; items: AuditActorDto[] }> {
    const roles = actor.roles || [];
    const usersMap = await this.loadUsersMap();
    const allActors = Array.from(usersMap.values());

    if (roles.includes('ADMIN')) {
      return { success: true, items: allActors };
    }

    if (roles.includes('MANAGE')) {
      const allowedIds = new Set(await this.getManageAllowedUserIds(actor.id));
      return {
        success: true,
        items: allActors.filter((u) => u.id !== null && allowedIds.has(u.id)),
      };
    }

    // CS: return self
    return {
      success: true,
      items: allActors.filter((u) => u.id === actor.id),
    };
  }
}

export const activityLogsService = new ActivityLogsService();
