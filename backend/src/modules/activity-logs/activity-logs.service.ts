import { prisma } from '../../prisma/client';
import type { AuthUser } from '../../middlewares/auth.middleware';
import { AppError } from '../../middlewares/error.middleware';
import type {
  ActivityExportQueryParams,
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
import {
  resolveActivityDateRange,
  vietnamDateKey,
  vietnamDateTime,
  vietnamTodayBounds,
} from './activity-time';

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

interface AuditDomainScope {
  actorIds: Set<number>;
  enrollmentIds: Set<number>;
  studentIds: Set<number>;
  enrollmentClassIds: Set<number>;
  attendanceIds: Set<number>;
  careLogIds: Set<number>;
  careTaskIds: Set<number>;
  classIds: Set<number>;
  classSessionIds: Set<number>;
  backupConfigIds: Set<number>;
  syncConfigIds: Set<number>;
  allowActorFallback: boolean;
}

function emptyModuleCounts(): Record<ActivityModuleType, number> {
  return {
    ALL: 0,
    ENROLLMENT: 0,
    ATTENDANCE: 0,
    CARE: 0,
    MESSAGING: 0,
    IMPORT_SYNC: 0,
    SYSTEM: 0,
  };
}

function objectData(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function numericRef(data: Record<string, any>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(data[key]);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return null;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export class ActivityLogsService {
  async getManageAllowedUserIds(userId: number): Promise<number[]> {
    const allowed = new Set<number>([userId]);
    const assignments = await prisma.manageAssignment.findMany({
      where: { manage_user_id: userId },
      include: { cs_group: { include: { members: true } } },
    });
    for (const assignment of assignments) {
      for (const member of assignment.cs_group?.members || []) allowed.add(member.user_id);
    }
    return [...allowed];
  }

  private async loadUsersMap(): Promise<Map<number, AuditActorDto>> {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, code: true, staff_code: true, email: true, roles: true },
      orderBy: { id: 'asc' },
    });
    return new Map(users.map((user) => [user.id, formatActorDisplay(user)]));
  }

  private async allowedCsIds(actor: AuthUser): Promise<number[] | null> {
    if (actor.roles?.includes('ADMIN')) return null;
    if (actor.roles?.includes('MANAGE')) return this.getManageAllowedUserIds(actor.id);
    return [actor.id];
  }

  private async allowedSyncConfigIds(actor: AuthUser): Promise<number[] | null> {
    const csIds = await this.allowedCsIds(actor);
    if (csIds === null) return null;
    const allowed = new Set<number>();
    const configs = await prisma.googleSheetSyncConfig.findMany({
      select: { id: true, default_cs_id: true, cvht_mapping: true },
    });
    for (const config of configs) {
      if (config.default_cs_id && csIds.includes(config.default_cs_id)) allowed.add(config.id);
      const mapping = objectData(config.cvht_mapping);
      if (Object.values(mapping).some((value) => csIds.includes(Number(value)))) allowed.add(config.id);
    }
    const itemRuns = await prisma.googleSheetSyncRunItem.findMany({
      where: {
        OR: [
          { after_snapshot: { path: '$.enrollmentId', not: undefined } as any },
          { before_snapshot: { path: '$.enrollmentId', not: undefined } as any },
        ],
      },
      select: { run: { select: { config_id: true } }, after_snapshot: true, before_snapshot: true },
    }).catch(() => [] as any[]);
    if (itemRuns.length) {
      const enrollmentIds = new Set(
        (await prisma.enrollment.findMany({ where: { cs_id: { in: csIds } }, select: { id: true } }))
          .map((item) => item.id),
      );
      for (const item of itemRuns as any[]) {
        const after = objectData(item.after_snapshot);
        const before = objectData(item.before_snapshot);
        const enrollmentId = numericRef(after, 'enrollmentId', 'enrollment_id') || numericRef(before, 'enrollmentId', 'enrollment_id');
        if (enrollmentId && enrollmentIds.has(enrollmentId)) allowed.add(item.run.config_id);
      }
    }
    return [...allowed];
  }

  private async buildDomainScope(actor: AuthUser): Promise<AuditDomainScope | null> {
    if (actor.roles?.includes('ADMIN')) return null;
    const isManage = actor.roles?.includes('MANAGE');
    const actorIds = new Set<number>(
      isManage ? await this.getManageAllowedUserIds(actor.id) : [actor.id],
    );
    const csIds = [...actorIds];
    const enrollments = await prisma.enrollment.findMany({
      where: { cs_id: { in: csIds } },
      select: { id: true, student_id: true },
    });
    const enrollmentIds = new Set(enrollments.map((item) => item.id));
    const studentIds = new Set(enrollments.map((item) => item.student_id));
    const enrollmentClasses = enrollmentIds.size
      ? await prisma.enrollmentClass.findMany({
          where: { enrollment_id: { in: [...enrollmentIds] } },
          select: { id: true, class_id: true },
        })
      : [];
    const enrollmentClassIds = new Set(enrollmentClasses.map((item) => item.id));
    const classIds = new Set(enrollmentClasses.map((item) => item.class_id));

    const [attendances, careLogs, careTasks, classSessions, backups, syncConfigIds] = await Promise.all([
      enrollmentClassIds.size
        ? prisma.attendance.findMany({
            where: { enrollment_class_id: { in: [...enrollmentClassIds] } },
            select: { id: true, class_session_id: true },
          })
        : Promise.resolve([]),
      enrollmentIds.size
        ? prisma.careLog.findMany({ where: { enrollment_id: { in: [...enrollmentIds] } }, select: { id: true } })
        : Promise.resolve([]),
      enrollmentIds.size
        ? prisma.careTask.findMany({ where: { enrollment_id: { in: [...enrollmentIds] } }, select: { id: true } })
        : Promise.resolve([]),
      classIds.size
        ? prisma.classSession.findMany({ where: { class_id: { in: [...classIds] } }, select: { id: true } })
        : Promise.resolve([]),
      prisma.programSheetBackupConfig.findMany({
        where: { cs_user_id: { in: csIds } },
        select: { id: true },
      }),
      this.allowedSyncConfigIds(actor),
    ]);

    return {
      actorIds,
      enrollmentIds,
      studentIds,
      enrollmentClassIds,
      attendanceIds: new Set(attendances.map((item) => item.id)),
      careLogIds: new Set(careLogs.map((item) => item.id)),
      careTaskIds: new Set(careTasks.map((item) => item.id)),
      classIds,
      classSessionIds: new Set([
        ...classSessions.map((item) => item.id),
        ...attendances.map((item) => item.class_session_id),
      ]),
      backupConfigIds: new Set(backups.map((item) => item.id)),
      syncConfigIds: new Set(syncConfigIds || []),
      allowActorFallback: Boolean(isManage),
    };
  }

  private rowInDomainScope(row: any, scope: AuditDomainScope | null): boolean {
    if (!scope) return true;
    const id = Number(row.entity_id);
    const entityType = String(row.entity_type || '');
    const direct: Record<string, Set<number>> = {
      Enrollment: scope.enrollmentIds,
      Student: scope.studentIds,
      EnrollmentClass: scope.enrollmentClassIds,
      Attendance: scope.attendanceIds,
      CareLog: scope.careLogIds,
      CareTask: scope.careTaskIds,
      Class: scope.classIds,
      ClassSession: scope.classSessionIds,
      ProgramSheetBackupConfig: scope.backupConfigIds,
      GoogleSheetSyncConfig: scope.syncConfigIds,
    };
    if (Number.isInteger(id) && direct[entityType]?.has(id)) return true;

    const snapshots = [objectData(row.before_data), objectData(row.after_data)];
    for (const data of snapshots) {
      const enrollmentId = numericRef(data, 'enrollment_id', 'enrollmentId');
      if (enrollmentId && scope.enrollmentIds.has(enrollmentId)) return true;
      const studentId = numericRef(data, 'student_id', 'studentId');
      if (studentId && scope.studentIds.has(studentId)) return true;
      const enrollmentClassId = numericRef(data, 'enrollment_class_id', 'enrollmentClassId');
      if (enrollmentClassId && scope.enrollmentClassIds.has(enrollmentClassId)) return true;
      const configId = numericRef(data, 'configId', 'config_id');
      if (configId && (scope.syncConfigIds.has(configId) || scope.backupConfigIds.has(configId))) return true;
    }
    return scope.allowActorFallback && scope.actorIds.has(Number(row.user_id));
  }

  private async buildEnrichmentContext(rows: any[], usersMap: Map<number, AuditActorDto>): Promise<EnrichmentContext> {
    const enrollmentIds = new Set<number>();
    const studentIds = new Set<number>();
    const classIds = new Set<number>();
    for (const row of rows) {
      const id = Number(row.entity_id);
      const entity = String(row.entity_type || '');
      const after = objectData(row.after_data);
      const before = objectData(row.before_data);
      if (entity === 'Enrollment' && id > 0) enrollmentIds.add(id);
      if (entity === 'Student' && id > 0) studentIds.add(id);
      if (entity === 'Class' && id > 0) classIds.add(id);
      for (const data of [before, after]) {
        const enrollmentId = numericRef(data, 'enrollment_id', 'enrollmentId');
        const studentId = numericRef(data, 'student_id', 'studentId');
        const classId = numericRef(data, 'class_id', 'classId', 'from_class_id', 'to_class_id');
        if (enrollmentId) enrollmentIds.add(enrollmentId);
        if (studentId) studentIds.add(studentId);
        if (classId) classIds.add(classId);
      }
    }

    const [enrollments, students, classes] = await Promise.all([
      enrollmentIds.size
        ? prisma.enrollment.findMany({
            where: { id: { in: [...enrollmentIds] } },
            select: {
              id: true, student_id: true, cs_id: true, program_type: true,
              student: { select: { id: true, full_name: true, external_id: true } },
            },
          })
        : Promise.resolve([]),
      studentIds.size
        ? prisma.student.findMany({
            where: { id: { in: [...studentIds] } },
            select: { id: true, full_name: true, external_id: true },
          })
        : Promise.resolve([]),
      classIds.size
        ? prisma.class.findMany({
            where: { id: { in: [...classIds] } },
            select: { id: true, class_code: true, class_name: true },
          })
        : Promise.resolve([]),
    ]);
    const studentsMap = new Map(students.map((item) => [item.id, item]));
    for (const enrollment of enrollments) if (enrollment.student) studentsMap.set(enrollment.student.id, enrollment.student);
    return {
      usersMap,
      studentsMap,
      enrollmentsMap: new Map(enrollments.map((item) => [item.id, item])),
      classesMap: new Map(classes.map((item) => [item.id, item])),
    };
  }

  private async scopedAuditEntries(actor: AuthUser, query: AuditLogQueryParams) {
    const range = resolveActivityDateRange(query.fromDate, query.toDate);
    const where: any = { created_at: { gte: range.from, lte: range.to } };
    if (query.action) where.action = query.action;
    if (query.actorId) where.user_id = query.actorId;
    const [rows, usersMap, domainScope] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }] }),
      this.loadUsersMap(),
      this.buildDomainScope(actor),
    ]);
    const scoped = rows.filter((row) => this.rowInDomainScope(row, domainScope));
    const context = await this.buildEnrichmentContext(scoped, usersMap);
    const canViewRaw = actor.roles?.includes('ADMIN') || actor.roles?.includes('MANAGE');
    const search = query.search?.trim().toLocaleLowerCase('vi') || '';
    return scoped
      .map((raw) => ({ raw, item: enrichAuditLogItem(raw, context) }))
      .map((entry) => {
        if (!canViewRaw) {
          entry.item.beforeData = null;
          entry.item.afterData = null;
        }
        return entry;
      })
      .filter(({ item }) => {
        if (query.module && query.module !== 'ALL' && item.module !== query.module) return false;
        if (!search) return true;
        return [
          item.action, item.actionLabel, item.entityType, item.entityId, item.entityLabel,
          item.summary, item.actor.name, item.actor.code, item.actor.email, item.actor.displayLabel,
        ].filter(Boolean).join(' ').toLocaleLowerCase('vi').includes(search);
      });
  }

  async listAuditLogs(actor: AuthUser, query: AuditLogQueryParams): Promise<AuditLogListResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
    const entries = await this.scopedAuditEntries(actor, query);
    const moduleCounts = emptyModuleCounts();
    for (const { item } of entries) {
      moduleCounts.ALL++;
      moduleCounts[item.module]++;
    }
    const { from: todayFrom, to: todayTo } = vietnamTodayBounds();
    const todayByModule = Object.fromEntries(ALL_MODULES.map((module) => [module, 0])) as Record<ActivityModuleCode, number>;
    let todayTotal = 0;
    for (const { raw, item } of entries) {
      if (raw.created_at >= todayFrom && raw.created_at <= todayTo) {
        todayTotal++;
        todayByModule[item.module]++;
      }
    }
    const total = entries.length;
    const items = entries.slice((page - 1) * pageSize, page * pageSize).map((entry) => entry.item);
    return {
      success: true,
      stats: { todayTotal, todayByModule, lastActivityAt: entries[0]?.item.createdAt || null },
      moduleCounts,
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      refreshedAt: new Date().toISOString(),
    };
  }

  private async loginWhere(actor: AuthUser, query: LoginAuditQueryParams): Promise<any> {
    const range = resolveActivityDateRange(query.fromDate, query.toDate);
    const and: any[] = [{ created_at: { gte: range.from, lte: range.to } }];
    if (!actor.roles?.includes('ADMIN')) {
      const allowed = await this.getManageAllowedUserIds(actor.id);
      and.push({ user_id: { in: allowed } });
      if (query.actorId && !allowed.includes(query.actorId)) and.push({ user_id: -1 });
    }
    if (query.actorId) and.push({ user_id: query.actorId });
    if (query.status && query.status !== 'ALL') and.push({ status: query.status });
    if (query.search) {
      and.push({
        OR: [
          { email_attempted: { contains: query.search } },
          { ip_address: { contains: query.search } },
          { reason: { contains: query.search } },
          { user: { is: { OR: [
            { name: { contains: query.search } },
            { email: { contains: query.search } },
            { code: { contains: query.search } },
          ] } } },
        ],
      });
    }
    return { AND: and };
  }

  async listLoginAudits(actor: AuthUser, query: LoginAuditQueryParams): Promise<LoginAuditListResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
    const where = await this.loginWhere(actor, query);
    const include = { user: { select: { id: true, name: true, code: true, staff_code: true, email: true, roles: true } } } as const;
    const [rows, total] = await Promise.all([
      prisma.loginAudit.findMany({ where, include, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.loginAudit.count({ where }),
    ]);
    const baseScopeQuery = { ...query, status: 'ALL' as const, search: undefined };
    const statsScope = await this.loginWhere(actor, baseScopeQuery);
    const today = vietnamTodayBounds();
    const todayWhere = { AND: [statsScope, { created_at: { gte: today.from, lte: today.to } }] };
    const [todayTotal, todaySuccess, last] = await Promise.all([
      prisma.loginAudit.count({ where: todayWhere }),
      prisma.loginAudit.count({ where: { AND: [todayWhere, { status: 'SUCCESS' }] } }),
      prisma.loginAudit.findFirst({ where: statsScope, orderBy: { created_at: 'desc' }, select: { created_at: true } }),
    ]);
    const items = rows.map((row) => {
      const userDto = row.user ? formatActorDisplay(row.user) : null;
      return {
        id: row.id,
        createdAt: row.created_at.toISOString(),
        emailAttempted: row.email_attempted,
        status: row.status,
        statusLabel: LOGIN_STATUS_LABELS[row.status] || row.status,
        reason: row.reason,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        actor: userDto,
        user: userDto,
      };
    });
    return {
      success: true,
      stats: { todayTotal, todaySuccess, todayFailed: todayTotal - todaySuccess, lastLoginAt: last?.created_at.toISOString() || null },
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      refreshedAt: new Date().toISOString(),
    };
  }

  async listActors(actor: AuthUser): Promise<{ success: boolean; items: AuditActorDto[] }> {
    const users = [...(await this.loadUsersMap()).values()];
    if (actor.roles?.includes('ADMIN')) return { success: true, items: users };
    const allowed = new Set(actor.roles?.includes('MANAGE') ? await this.getManageAllowedUserIds(actor.id) : [actor.id]);
    return { success: true, items: users.filter((item) => item.id !== null && allowed.has(item.id)) };
  }

  private async exportAudit(actor: AuthUser, query: ActivityExportQueryParams): Promise<string> {
    const entries = await this.scopedAuditEntries(actor, query);
    return csvRows(
      ['ID', 'Thời gian (UTC+7)', 'Người thực hiện', 'Email', 'Phân hệ', 'Hành động', 'Đối tượng', 'Tóm tắt', 'Số trường thay đổi', 'IP'],
      entries.map(({ item }) => [item.id, vietnamDateTime(item.createdAt), item.actor.displayLabel, item.actor.email, item.moduleLabel, item.actionLabel, item.entityLabel, item.summary, item.changedFields.length, item.ipAddress]),
    );
  }

  private async exportLogin(actor: AuthUser, query: ActivityExportQueryParams): Promise<string> {
    if (!actor.roles?.some((role) => role === 'ADMIN' || role === 'MANAGE')) throw new AppError(403, 'Bạn không có quyền xuất lịch sử đăng nhập');
    const where = await this.loginWhere(actor, { ...query, status: query.status as any });
    const rows = await prisma.loginAudit.findMany({ where, include: { user: true }, orderBy: { created_at: 'desc' } });
    return csvRows(
      ['ID', 'Thời gian (UTC+7)', 'Nhân viên', 'Email đăng nhập', 'Trạng thái', 'IP', 'Thiết bị', 'Lý do'],
      rows.map((row) => [row.id, vietnamDateTime(row.created_at), row.user ? formatActorDisplay(row.user).displayLabel : '', row.email_attempted, LOGIN_STATUS_LABELS[row.status] || row.status, row.ip_address, row.user_agent, row.reason]),
    );
  }

  private async exportSync(actor: AuthUser, query: ActivityExportQueryParams): Promise<string> {
    const range = resolveActivityDateRange(query.fromDate, query.toDate);
    const allowed = await this.allowedSyncConfigIds(actor);
    const where: any = { started_at: { gte: range.from, lte: range.to } };
    if (allowed) where.config_id = { in: allowed };
    if (query.status && query.status !== 'ALL') where.status = query.status;
    if (query.programType && query.programType !== 'ALL') where.program_type = query.programType;
    if (query.search) where.OR = [{ config_name: { contains: query.search } }, { config_code: { contains: query.search } }];
    const rows = await prisma.googleSheetSyncRun.findMany({ where, orderBy: { started_at: 'desc' } });
    return csvRows(
      ['ID', 'Thời gian (UTC+7)', 'Nguồn đồng bộ', 'Luồng', 'Chương trình', 'Kích hoạt', 'Tổng dòng', 'Tạo mới', 'Cập nhật', 'Xung đột', 'Lỗi', 'Kết quả', 'Thời lượng (giây)'],
      rows.map((row) => [row.id, vietnamDateTime(row.completed_at || row.started_at), row.config_name, row.flow_type, row.program_type, row.trigger_type === 'AUTO' ? 'Tự động' : 'Thủ công', row.total_rows, row.created_count, row.updated_count, row.conflict_count, row.failed_count, row.status, Math.round(row.duration_ms / 1000)]),
    );
  }

  private async exportBackup(actor: AuthUser, query: ActivityExportQueryParams): Promise<string> {
    const range = resolveActivityDateRange(query.fromDate, query.toDate);
    const csIds = await this.allowedCsIds(actor);
    const configs = await prisma.programSheetBackupConfig.findMany({
      where: csIds ? { cs_user_id: { in: csIds } } : undefined,
      select: { id: true },
    });
    const rows = await prisma.auditLog.findMany({
      where: {
        action: 'CS_PROGRAM_BACKUP', entity_type: 'ProgramSheetBackupConfig',
        entity_id: { in: configs.map((item) => String(item.id)) },
        created_at: { gte: range.from, lte: range.to },
      },
      orderBy: { created_at: 'desc' },
    });
    const mapped = rows.map((row) => ({ row, data: objectData(row.after_data) })).filter(({ data }) => {
      if (query.status && query.status !== 'ALL' && String(data.status || 'SUCCESS') !== query.status) return false;
      if (query.programType && query.programType !== 'ALL' && String(data.programType || data.program_type) !== query.programType) return false;
      return true;
    });
    return csvRows(
      ['ID', 'Thời gian (UTC+7)', 'Mã đợt', 'Sổ sao lưu', 'Chương trình', 'Kích hoạt', 'Chế độ', 'Tổng học viên', 'Số ô cập nhật', 'Google Sheet', 'Kết quả', 'Lỗi'],
      mapped.map(({ row, data }) => [row.id, vietnamDateTime(data.backedUpAt || row.created_at), data.batchId, data.configName, data.programType || data.program_type, data.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công', data.mode || 'DELTA', data.totalStudents || 0, data.updatedCellsCount || 0, data.syncedToGoogleSheet ? 'Đã đẩy' : 'Chỉ lưu Excel', data.status || 'SUCCESS', data.error || '']),
    );
  }

  async exportCsv(actor: AuthUser, query: ActivityExportQueryParams): Promise<string> {
    if (query.view === 'audit') return this.exportAudit(actor, query);
    if (query.view === 'login') return this.exportLogin(actor, query);
    if (query.view === 'sync') return this.exportSync(actor, query);
    return this.exportBackup(actor, query);
  }
}

export const activityLogsService = new ActivityLogsService();
