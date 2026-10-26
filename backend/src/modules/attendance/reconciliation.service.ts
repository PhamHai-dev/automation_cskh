import { prisma } from '../../prisma/client';
import { AttendanceStatus, ReconciliationState, AttendanceSource, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { runAttendancePostCommit } from './attendance-lifecycle';
import { findEffectiveAssignment, isTeacherAssignmentEffectiveInRange } from './teacher-assignment';
import { handleAttendanceEvent, cancelPendingDeliveries } from '../automation/automation-trigger.service';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';
import { parseAttendanceValue, parseTimeSlot, normalizeDateOnly } from './attendance.utils';

const log = createLogger('ReconciliationService');

export interface TeacherMarkDTO {
  status: AttendanceStatus;
  rawValue?: string;
  lessonTopic?: string;
  note?: string;
  teacherId?: number;
}

export interface CSMarkDTO {
  status: AttendanceStatus;
  rawValue?: string;
  note?: string;
}

export interface ResolveConflictDTO {
  finalStatus: AttendanceStatus;
  resolutionNote: string;
}

export interface ReconciliationQuery {
  page?: number;
  pageSize?: number;
  limit?: number;
  classId?: number;
  csId?: number;
  teacherId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
  state?: string;
}

interface Actor {
  id: number;
  roles: string[];
}

interface TeacherSessionsQuery {
  startDate?: string;
  endDate?: string;
  teacherId?: number;
}

export class ReconciliationService {
  private isPrivileged(actor: Actor) {
    return actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE');
  }

  private deriveState(teacherStatus: AttendanceStatus | null, csStatus: AttendanceStatus | null) {
    if (!teacherStatus) return ReconciliationState.PENDING_TEACHER;
    if (!csStatus) return ReconciliationState.PENDING_CS;
    return teacherStatus === csStatus ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT;
  }

  private async assertTeacherScope(actor: Actor, classId: number, sessionDate: Date) {
    if (this.isPrivileged(actor)) return;
    if (!actor.roles.includes('TEACHER')) throw new AppError(403, 'Vai trò không được phép điểm danh phía giáo viên');
    // D8 (owner verdict 2026-10-26): fetch ALL of this teacher's assignment
    // rows for the class (any current active state) and let the helper decide.
    // `active` records today's state, not history; a now-inactive row whose
    // window contained the session date still authorizes the mark (acceptance
    // case #14). Ambiguity rule (active=false with no window data) is pinned
    // in teacher-assignment.ts.
    const candidates = await prisma.classTeacher.findMany({
      where: { class_id: classId, teacher: { user_id: actor.id } },
      select: { active: true, start_date: true, end_date: true },
    });
    const effective = findEffectiveAssignment(candidates, sessionDate);
    if (!effective) throw new AppError(403, 'Bạn không được phân công cho lớp này tại ngày dạy của buổi học');
  }

  /**
   * MANAGE write scope: self + user_ids of every CS group assigned to the
   * actor (prisma.manageAssignment -> cs_group.members). Same idiom as
   * care.service.getAccessibleCSIds and students.repository.getStudentCsScope
   * (POLICY owner 2026-10-25: "MANAGE vẫn là CVHT có phạm vi quản lý nhóm").
   */
  private async resolveManageScope(actor: Actor): Promise<number[]> {
    const assignments = await prisma.manageAssignment.findMany({
      where: { manage_user_id: actor.id },
      include: { cs_group: { include: { members: true } } },
    });
    return Array.from(
      new Set([
        actor.id,
        ...assignments.flatMap((a) => a.cs_group.members.map((m) => m.user_id)),
      ])
    );
  }

  private async assertCSScope(actor: Actor, assignedCSId: number) {
    // ADMIN keeps the unrestricted bypass.
    if (actor.roles.includes('ADMIN')) return;
    // MANAGE acts on CS opinions only within its assigned CS groups + self;
    // no longer an ADMIN-equivalent short-circuit via isPrivileged().
    if (actor.roles.includes('MANAGE')) {
      const scope = await this.resolveManageScope(actor);
      if (!scope.includes(assignedCSId)) {
        throw new AppError(403, 'Bạn không phụ trách học viên này');
      }
      return;
    }
    // Plain CS: own-enrollment-only, unchanged.
    if (!actor.roles.includes('CS') || assignedCSId !== actor.id) {
      throw new AppError(403, 'Bạn không phụ trách học viên này');
    }
  }

  /**
   * Pending state must always be verified from both opinions as well as the
   * persisted state. This keeps stale records created with the schema default
   * out of the CSKH/teacher work queues.
   */
  private pendingStateWhere(state: ReconciliationState): Prisma.AttendanceWhereInput {
    if (state === ReconciliationState.PENDING_CS) {
      return {
        reconciliation_state: ReconciliationState.PENDING_CS,
        teacher_status: { not: null },
        cs_status: null,
      };
    }
    if (state === ReconciliationState.PENDING_TEACHER) {
      return {
        reconciliation_state: ReconciliationState.PENDING_TEACHER,
        teacher_status: null,
        cs_status: { not: null },
      };
    }
    return { reconciliation_state: state };
  }

  /** Build the shared reconciliation filter and enforce role-owned data scope. */
  private buildScopeWhere(
    query: ReconciliationQuery,
    actor?: Actor,
    stateFilter?: ReconciliationState | ReconciliationState[]
  ): Prisma.AttendanceWhereInput {
    const where: Prisma.AttendanceWhereInput = {};

    if (stateFilter) {
      where.AND = Array.isArray(stateFilter)
        ? { OR: stateFilter.map((state) => this.pendingStateWhere(state)) }
        : this.pendingStateWhere(stateFilter);
    }

    const classSessionWhere: Prisma.ClassSessionWhereInput = {};
    if (query.classId) classSessionWhere.class_id = query.classId;
    if (query.startDate || query.endDate) {
      classSessionWhere.session_date = {
        ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
        ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
      };
    }

    if (actor?.roles.includes('TEACHER') && !this.isPrivileged(actor)) {
      if (query.teacherId && query.teacherId !== actor.id) {
        throw new AppError(403, 'Bạn không được xem dữ liệu của giáo viên khác');
      }
      classSessionWhere.class = {
        class_teachers: { some: { active: true, teacher: { active: true, user_id: actor.id } } },
      };
    } else if (query.teacherId) {
      classSessionWhere.class = {
        class_teachers: { some: { active: true, teacher: { active: true, user_id: query.teacherId } } },
      };
    }

    if (Object.keys(classSessionWhere).length > 0) where.class_session = classSessionWhere;

    const enrollmentWhere: Prisma.EnrollmentWhereInput = {};
    if (actor && this.isScopedToOwnCS(actor)) enrollmentWhere.cs_id = actor.id;
    else if (query.csId) enrollmentWhere.cs_id = query.csId;

    if (query.search) {
      enrollmentWhere.student = {
        OR: [
          { full_name: { contains: query.search } },
          { external_id: { contains: query.search } },
          { phone: { contains: query.search } },
        ],
      };
    }

    if (Object.keys(enrollmentWhere).length > 0) {
      where.enrollment_class = { enrollment: enrollmentWhere };
    }
    return where;
  }

  /** Attach the teachers currently assigned to the attendance class for CSKH context. */
  private withAssignedTeachers(items: any[]) {
    return items.map((item) => ({
      ...item,
      assigned_teachers: (item.class_session?.class?.class_teachers || []).map((assignment: any) => ({
        id: assignment.teacher.id,
        user_id: assignment.teacher.user_id,
        code: assignment.teacher.code,
        name: assignment.teacher.name,
        email: assignment.teacher.email,
      })),
    }));
  }

  private assertTeacherTrackingContext(query: ReconciliationQuery, actor: Actor) {
    if (this.isPrivileged(actor) && !query.teacherId) {
      throw new AppError(400, 'Vui lòng chọn giáo viên cần theo dõi');
    }
  }

  /** CS-only (non privileged) users are scoped to their assigned students. */
  private isScopedToOwnCS(actor: Actor) {
    return (
      actor.roles.includes('CS') &&
      !actor.roles.includes('ADMIN') &&
      !actor.roles.includes('MANAGE')
    );
  }

  private async runDownstream(attendanceId: number, state: ReconciliationState) {
    await runAttendancePostCommit({ attendanceId, reconciliationState: state });
  }

  async markByTeacher(attendanceId: number, data: TeacherMarkDTO, actor: Actor) {
    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        class_session: { select: { class_id: true, status: true, session_date: true } },
        enrollment_class: { include: { enrollment: true } },
      },
    });
    if (!existing) throw new AppError(404, 'Không tìm thấy bản ghi điểm danh');
    if (existing.class_session?.status === 'CANCELLED') throw new AppError(409, 'Không thể điểm danh cho buổi học đã hủy');

    if (this.isPrivileged(actor)) {
      // Assist-mark enforces TWO independent conditions (owner 2026-10-26):
      //   1. Operator assist authority: `this.isPrivileged(actor)` (ADMIN/MANAGE
      //      per existing policy — D8 grants no assist-mark rights by itself).
      //   2. Target teacher (`data.teacherId`, with a usable `teacher.active = true`
      //      account) was validly assigned to the class AT THE SESSION DATE per D8
      //      (`findEffectiveAssignment` over all classTeacher rows without filtering
      //      on current `active`; inactive rows missing `end_date` are rejected).
      if (!data.teacherId) throw new AppError(400, 'Vui lòng chọn giáo viên được hỗ trợ');
      const candidates = await prisma.classTeacher.findMany({
        where: {
          class_id: existing.class_session.class_id,
          teacher: { active: true, user_id: data.teacherId },
        },
        select: { active: true, start_date: true, end_date: true },
      });
      const effective = findEffectiveAssignment(candidates, existing.class_session.session_date);
      if (!effective) throw new AppError(403, 'Giáo viên được chọn không phụ trách lớp này tại ngày dạy của buổi học');
    } else {
      if (data.teacherId && data.teacherId !== actor.id) {
        throw new AppError(403, 'Bạn không được điểm danh thay giáo viên khác');
      }
      await this.assertTeacherScope(actor, existing.class_session.class_id, existing.class_session.session_date);
    }

    const state = this.deriveState(data.status, existing.cs_status);
    const updateData: Prisma.AttendanceUpdateInput = {
      teacher_status: data.status,
      teacher_raw_value: data.rawValue || null,
      lesson_topic: data.lessonTopic || null,
      teacher_note: data.note || null,
      teacher_user: { connect: { id: actor.id } },
      teacher_submitted_at: new Date(),
      reconciliation_state: state,
      resolved_by: { disconnect: true },
      resolved_at: null,
      resolution_note: null,
      source: existing.source === AttendanceSource.MANUAL ? AttendanceSource.TEACHER_UPLOAD : existing.source,
      ...(state === ReconciliationState.MATCHED ? { status: data.status } : {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.attendance.update({ where: { id: attendanceId }, data: updateData });
      const action = existing.teacher_status && existing.teacher_status !== data.status
        ? 'ATTENDANCE_TEACHER_STATUS_CHANGED'
        : 'ATTENDANCE_TEACHER_MARK';
      await tx.auditLog.create({ data: {
        user_id: actor.id,
        action,
        entity_type: 'Attendance',
        entity_id: String(attendanceId),
        before_data: existing as any,
        after_data: result as any,
      } });
      return result;
    });
    await this.runDownstream(updated.id, state);
    return updated;
  }

  async markByCS(attendanceId: number, data: CSMarkDTO, actor: Actor) {
    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        class_session: { select: { status: true } },
        enrollment_class: { include: { enrollment: true } },
      },
    });
    if (!existing) throw new AppError(404, 'Không tìm thấy bản ghi điểm danh');
    if (existing.class_session?.status === 'CANCELLED') throw new AppError(409, 'Không thể điểm danh cho buổi học đã hủy');
    await this.assertCSScope(actor, existing.enrollment_class.enrollment.cs_id);

    const state = this.deriveState(existing.teacher_status, data.status);
    const updateData: Prisma.AttendanceUpdateInput = {
      cs_status: data.status,
      cs_raw_value: data.rawValue || null,
      cs_note: data.note || null,
      cs_user: { connect: { id: actor.id } },
      cs_submitted_at: new Date(),
      reconciliation_state: state,
      resolved_by: { disconnect: true },
      resolved_at: null,
      resolution_note: null,
      ...(state === ReconciliationState.MATCHED ? { status: data.status } : {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.attendance.update({ where: { id: attendanceId }, data: updateData });
      await tx.auditLog.create({ data: {
        user_id: actor.id,
        action: 'ATTENDANCE_CS_MARK',
        entity_type: 'Attendance',
        entity_id: String(attendanceId),
        before_data: existing as any,
        after_data: result as any,
      } });
      return result;
    });
    await this.runDownstream(updated.id, state);
    return updated;
  }

  /**
   * D2 (owner-confirmed): conflict resolution authority belongs to ADMIN only.
   * MANAGE keeps group-management scope but NOT Admin-equivalent resolution
   * authority, and CS must not self-resolve its own opinion conflict. This is
   * enforced again here in addition to the route's requireRoles(['ADMIN']).
   */
  private assertAdminResolver(actor: Actor) {
    if (!actor.roles.includes('ADMIN')) {
      throw new AppError(403, 'Chỉ ADMIN được phân xử xung đột điểm danh');
    }
  }

  async resolveConflict(attendanceId: number, data: ResolveConflictDTO, actor: Actor) {
    this.assertAdminResolver(actor);
    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { enrollment_class: { include: { enrollment: true } } },
    });
    if (!existing) throw new AppError(404, 'Không tìm thấy bản ghi điểm danh');
    if (existing.reconciliation_state !== ReconciliationState.CONFLICT) {
      throw new AppError(409, 'Chỉ có thể phân xử bản ghi đang xung đột');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.attendance.update({ where: { id: attendanceId }, data: {
        status: data.finalStatus,
        reconciliation_state: ReconciliationState.RESOLVED,
        resolved_by_id: actor.id,
        resolved_at: new Date(),
        resolution_note: data.resolutionNote.trim(),
      } });
      await tx.auditLog.create({ data: {
        user_id: actor.id,
        action: 'ATTENDANCE_CONFLICT_RESOLVED',
        entity_type: 'Attendance',
        entity_id: String(attendanceId),
        before_data: existing as any,
        after_data: result as any,
      } });
      return result;
    });
    // Preserve the existing resolve-conflict semantics: invalidation of queued
    // deliveries here is not swallowed (a cancellation failure must still fail
    // the request), while the FINAL trigger is best-effort.
    await cancelPendingDeliveries(updated.id);
    await runAttendancePostCommit({ attendanceId: updated.id, reconciliationState: ReconciliationState.RESOLVED });
    return updated;
  }

  async bulkApprovePending(attendanceIds: number[], actor: Actor) {
    const attendances = await prisma.attendance.findMany({
      where: { id: { in: attendanceIds } },
      include: { enrollment_class: { include: { enrollment: true } } },
    });
    if (attendances.length !== attendanceIds.length) {
      throw new AppError(404, 'Có bản ghi điểm danh không tồn tại');
    }
    for (const attendance of attendances) {
      await this.assertCSScope(actor, attendance.enrollment_class.enrollment.cs_id);
      if (attendance.reconciliation_state !== ReconciliationState.PENDING_CS || !attendance.teacher_status) {
        throw new AppError(409, `Điểm danh ${attendance.id} không ở trạng thái chờ CSKH`);
      }
    }

    const approvedIds = await prisma.$transaction(async (tx) => {
      const ids: number[] = [];
      for (const attendance of attendances) {
        const result = await tx.attendance.update({ where: { id: attendance.id }, data: {
          cs_status: attendance.teacher_status,
          cs_user_id: actor.id,
          cs_submitted_at: new Date(),
          status: attendance.teacher_status!,
          reconciliation_state: ReconciliationState.MATCHED,
        } });
        await tx.auditLog.create({ data: {
          user_id: actor.id,
          action: 'ATTENDANCE_BULK_APPROVED',
          entity_type: 'Attendance',
          entity_id: String(attendance.id),
          before_data: attendance as any,
          after_data: result as any,
        } });
        ids.push(result.id);
      }
      return ids;
    });
    for (const id of approvedIds) await this.runDownstream(id, ReconciliationState.MATCHED);
    return { approvedCount: approvedIds.length, approvedIds };
  }

  /**
   * List all conflicting attendances.
   */
  async getConflicts(query: ReconciliationQuery, actor?: { id: number; roles: string[] }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.pageSize || query.limit || 20));
    const skip = (page - 1) * limit;

    const where = this.buildScopeWhere(query, actor, ReconciliationState.CONFLICT);

    const [total, items] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { class_session: { session_date: 'desc' } },
        include: {
          enrollment_class: {
            include: {
              enrollment: {
                include: {
                  student: true,
                  cs: { select: { id: true, name: true, email: true } },
                  package: { select: { id: true, name: true, code: true } },
                },
              },
              class: { select: { id: true, class_name: true, class_code: true } },
            },
          },
          class_session: {
            include: {
              class: { select: { id: true, class_name: true } },
            },
          },
          teacher_user: { select: { id: true, name: true, email: true } },
          cs_user: { select: { id: true, name: true, email: true } },
          resolved_by: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List pending reconciliations.
   */
  async getPending(query: ReconciliationQuery, actor?: { id: number; roles: string[] }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.pageSize || query.limit || 20));
    const skip = (page - 1) * limit;

    const stateFilter: ReconciliationState | ReconciliationState[] = query.state
      ? (query.state as ReconciliationState)
      : [ReconciliationState.PENDING_CS, ReconciliationState.PENDING_TEACHER];

    const where = this.buildScopeWhere(query, actor, stateFilter);

    const [total, items] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { class_session: { session_date: 'desc' } },
        include: {
          enrollment_class: {
            include: {
              enrollment: {
                include: {
                  student: true,
                  cs: { select: { id: true, name: true, email: true } },
                  package: { select: { id: true, name: true, code: true } },
                },
              },
              class: { select: { id: true, class_name: true, class_code: true } },
            },
          },
          class_session: {
            include: {
              class: {
                select: {
                  id: true,
                  class_name: true,
                  class_teachers: {
                    where: { active: true, teacher: { active: true } },
                    orderBy: { created_at: 'asc' },
                    select: {
                      teacher: {
                        select: { id: true, user_id: true, code: true, name: true, email: true },
                      },
                    },
                  },
                },
              },
            },
          },
          teacher_user: { select: { id: true, name: true, email: true } },
          cs_user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const mappedItems = this.withAssignedTeachers(items);

    // Separate pending counts (independent of pagination) for KPI cards.
    const pendingCsWhere = this.buildScopeWhere(query, actor, ReconciliationState.PENDING_CS);
    const pendingTeacherWhere = this.buildScopeWhere(query, actor, ReconciliationState.PENDING_TEACHER);
    const [pendingCsCount, pendingTeacherCount] = await Promise.all([
      prisma.attendance.count({ where: pendingCsWhere }),
      prisma.attendance.count({ where: pendingTeacherWhere }),
    ]);

    return {
      items: mappedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      pendingCsCount,
      pendingTeacherCount,
    };
  }

  /**
   * KPI counts for the reconciliation header cards.
   * Independent of list pagination so numbers always match the tab totals.
   */
  async getStats(query: ReconciliationQuery, actor?: Actor) {
    const conflictWhere = this.buildScopeWhere(query, actor, ReconciliationState.CONFLICT);
    const pendingCsWhere = this.buildScopeWhere(query, actor, ReconciliationState.PENDING_CS);
    const pendingTeacherWhere = this.buildScopeWhere(query, actor, ReconciliationState.PENDING_TEACHER);

    const [conflictCount, pendingCsCount, pendingTeacherCount] = await Promise.all([
      prisma.attendance.count({ where: conflictWhere }),
      prisma.attendance.count({ where: pendingCsWhere }),
      prisma.attendance.count({ where: pendingTeacherWhere }),
    ]);

    return { conflictCount, pendingCsCount, pendingTeacherCount };
  }

  /** Actions that represent a change AFTER the first attendance report. */
  private readonly historyActions = [
    'ATTENDANCE_CS_MARK',
    'ATTENDANCE_BULK_APPROVED',
    'ATTENDANCE_CONFLICT_RESOLVED',
  ];

  /**
   * Reconciliation history: every change made to an attendance AFTER the first
   * report (CSKH ghi nhận / duyệt hàng loạt / phân xử). Scoped to the actor's
   * accessible students, with server-side pagination.
   */
  async getHistory(query: ReconciliationQuery, actor?: Actor) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.pageSize || query.limit || 20));
    const skip = (page - 1) * limit;

    // 1. Attendance ids within the actor's scope + search/session-date filters.
    const attendanceWhere = this.buildScopeWhere(query, actor);
    const scopedAttendances = await prisma.attendance.findMany({
      where: attendanceWhere,
      select: { id: true },
    });
    if (scopedAttendances.length === 0) {
      return { items: [], total: 0, page, limit, totalPages: 0 };
    }
    const entityIdStrings = scopedAttendances.map((a) => String(a.id));

    const logWhere: Prisma.AuditLogWhereInput = {
      entity_type: 'Attendance',
      action: { in: this.historyActions },
      entity_id: { in: entityIdStrings },
      ...(query.startDate || query.endDate
        ? {
            created_at: {
              ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
              ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    // 2. Paginated audit logs (most recent first) with actor info.
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where: logWhere }),
      prisma.auditLog.findMany({
        where: logWhere,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    // 3. Resolve attendance details for the visible page only.
    const pageAttendanceIds = Array.from(
      new Set(logs.map((log) => Number(log.entity_id)).filter((n) => Number.isFinite(n)))
    );
    const attendanceDetails = await prisma.attendance.findMany({
      where: { id: { in: pageAttendanceIds } },
      include: {
        enrollment_class: {
          include: {
            enrollment: { include: { student: { select: { id: true, full_name: true, external_id: true, phone: true } } } },
            class: { select: { id: true, class_name: true, class_code: true } },
          },
        },
        class_session: { select: { id: true, session_number: true, session_date: true, start_time: true, end_time: true } },
      },
    });
    const attendanceById = new Map(attendanceDetails.map((a) => [a.id, a]));

    const items = logs.map((log) => {
      const attendance = attendanceById.get(Number(log.entity_id));
      const before = (log.before_data || {}) as any;
      const after = (log.after_data || {}) as any;
      const fromStatus: string | null = before.cs_status ?? before.teacher_status ?? null;
      const toStatus: string | null =
        after.status ?? after.cs_status ?? after.teacher_status ?? null;
      const note: string | null =
        after.resolution_note ?? after.cs_note ?? after.teacher_note ?? null;
      return {
        id: log.id,
        attendance_id: Number(log.entity_id),
        action: log.action,
        from_status: fromStatus,
        to_status: toStatus,
        note,
        performed_by: log.user?.name || log.user?.email || 'N/A',
        created_at: log.created_at,
        student: attendance?.enrollment_class?.enrollment?.student ?? null,
        class_name: attendance?.enrollment_class?.class?.class_name ?? null,
        session: attendance?.class_session ?? null,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getTeacherTrackingPending(query: ReconciliationQuery, actor: Actor) {
    this.assertTeacherTrackingContext(query, actor);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.pageSize || query.limit || 20));
    const where = this.buildScopeWhere(query, actor, ReconciliationState.PENDING_TEACHER);
    const [total, records] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { class_session: { session_date: 'desc' } },
        select: {
          id: true,
          reconciliation_state: true,
          class_session: {
            select: {
              id: true, session_number: true, session_date: true, start_time: true, end_time: true,
              class: { select: { id: true, class_name: true, class_code: true } },
            },
          },
          enrollment_class: {
            select: {
              enrollment: {
                select: { student: { select: { id: true, full_name: true, external_id: true, phone: true } } },
              },
            },
          },
        },
      }),
    ]);
    const items = records.map((record) => ({
      id: record.id,
      reconciliation_state: record.reconciliation_state,
      student: record.enrollment_class.enrollment.student,
      class: record.class_session.class,
      session: {
        id: record.class_session.id,
        session_number: record.class_session.session_number,
        session_date: record.class_session.session_date,
        start_time: record.class_session.start_time,
        end_time: record.class_session.end_time,
      },
    }));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getTeacherTrackingCount(query: ReconciliationQuery, actor: Actor) {
    this.assertTeacherTrackingContext(query, actor);
    const where = this.buildScopeWhere(query, actor, ReconciliationState.PENDING_TEACHER);
    return { count: await prisma.attendance.count({ where }) };
  }

  async getTeacherTrackingHistory(query: ReconciliationQuery, actor: Actor) {
    this.assertTeacherTrackingContext(query, actor);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.pageSize || query.limit || 20));
    const scoped = await prisma.attendance.findMany({
      where: this.buildScopeWhere(query, actor),
      select: { id: true },
    });
    const entityIds = scoped.map(({ id }) => String(id));
    if (entityIds.length === 0) return { items: [], total: 0, page, limit, totalPages: 0 };

    const where: Prisma.AuditLogWhereInput = {
      entity_type: 'Attendance',
      action: 'ATTENDANCE_TEACHER_STATUS_CHANGED',
      entity_id: { in: entityIds },
      ...(query.startDate || query.endDate ? { created_at: {
        ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
        ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
      } } : {}),
    };
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);
    const attendanceIds = logs.map(({ entity_id }) => Number(entity_id));
    const details = await prisma.attendance.findMany({
      where: { id: { in: attendanceIds } },
      select: {
        id: true,
        enrollment_class: { select: { enrollment: { select: { student: { select: { id: true, full_name: true, external_id: true } } } } } },
        class_session: { select: {
          id: true, session_number: true, session_date: true, start_time: true, end_time: true,
          class: { select: { id: true, class_name: true, class_code: true } },
        } },
      },
    });
    const byId = new Map(details.map((item) => [item.id, item]));
    const items = logs.map((entry) => {
      const before = (entry.before_data || {}) as any;
      const after = (entry.after_data || {}) as any;
      const attendance = byId.get(Number(entry.entity_id));
      return {
        id: entry.id,
        attendance_id: Number(entry.entity_id),
        from_status: before.teacher_status as AttendanceStatus,
        to_status: after.teacher_status as AttendanceStatus,
        note: after.teacher_note ?? null,
        performed_by: entry.user?.name || entry.user?.email || 'N/A',
        created_at: entry.created_at,
        student: attendance?.enrollment_class.enrollment.student ?? null,
        class: attendance?.class_session.class ?? null,
        session: attendance ? {
          id: attendance.class_session.id,
          session_number: attendance.class_session.session_number,
          session_date: attendance.class_session.session_date,
          start_time: attendance.class_session.start_time,
          end_time: attendance.class_session.end_time,
        } : null,
      };
    });
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Upload and process teacher schedule/attendance Excel (e.g. giao_vien.xlsx - Sheet "2026 スケジュール")
   */
  async uploadTeacherExcel(fileBuffer: Buffer, actor: Actor) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    // Find schedule sheet: prefer "2026 スケジュール" or name containing "スケジュール" or "Schedule" or sheet 3
    let sheet = workbook.worksheets.find((ws) =>
      /スケジュール|schedule|lịch dạy/i.test(ws.name)
    );
    if (!sheet) {
      sheet = workbook.worksheets[2] || workbook.worksheets[0];
    }
    if (!sheet) {
      throw new AppError(400, 'Không tìm thấy sheet lịch dạy trong file Excel');
    }

    // Find header row that contains dates
    let headerRowIdx = -1;
    let dateCols: Array<{ col: number; date: Date }> = [];
    let studentIdCol = 2; // Default col B
    let studentNameCol = 3; // Default col C
    let timeCol = 6; // Default col F

    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      const dates: Array<{ col: number; date: Date }> = [];
      row.eachCell((cell, colNumber) => {
        const val = cell.value;
        if (val instanceof Date && !isNaN(val.getTime())) {
          dates.push({ col: colNumber, date: val });
        } else if (typeof val === 'string') {
          const d = new Date(val);
          if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(val)) {
            dates.push({ col: colNumber, date: d });
          }
        }
        const text = String(cell.text || cell.value || '').toLowerCase();
        if (text.includes('mã học viên') || text.includes('学籍番号') || text.includes('id')) {
          studentIdCol = colNumber;
        }
        if (text.includes('họ tên') || text.includes('お名前') || text.includes('tên học viên')) {
          studentNameCol = colNumber;
        }
        if (text.includes('thời gian') || text.includes('時間') || text.includes('giờ học')) {
          timeCol = colNumber;
        }
      });

      if (dates.length >= 1) {
        headerRowIdx = r;
        dateCols = dates;
        break;
      }
    }

    if (headerRowIdx === -1 || dateCols.length === 0) {
      throw new AppError(400, 'Không tìm thấy các cột ngày tháng hợp lệ trong file Excel');
    }

    let processedCount = 0;
    let matchedCount = 0;
    let conflictCount = 0;
    let pendingCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const extIdRaw = String(row.getCell(studentIdCol).text || row.getCell(studentIdCol).value || '').trim();
      const fullNameRaw = String(row.getCell(studentNameCol).text || row.getCell(studentNameCol).value || '').trim();
      const timeSlotRaw = String(row.getCell(timeCol).text || row.getCell(timeCol).value || '').trim();
      const { startTime, endTime } = parseTimeSlot(timeSlotRaw);

      for (const dc of dateCols) {
        const cell = row.getCell(dc.col);
        const cellText = String(cell.text || cell.value || '').trim();
        if (!cellText) continue;

        const parsed = parseAttendanceValue(cellText);
        if (!parsed.status) continue;

        const targetExtId = parsed.studentExternalId || (extIdRaw ? extIdRaw.replace(/\.0$/, '') : undefined);

        try {
          // Find student by external_id or full_name
          const student = await prisma.student.findFirst({
            where: {
              OR: [
                ...(targetExtId ? [{ external_id: targetExtId }] : []),
                ...(fullNameRaw ? [{ full_name: fullNameRaw }] : []),
              ],
            },
            include: {
              enrollments: {
                include: {
                  enrollment_classes: {
                    include: { class: true },
                    orderBy: { sequence_no: 'desc' },
                  },
                },
                orderBy: { created_at: 'desc' },
              },
            },
          });

          if (!student || student.enrollments.length === 0) {
            continue;
          }

          const enrollment = student.enrollments[0];
          const ec = enrollment.enrollment_classes[0];
          if (!ec) continue;

          const normalizedDate = normalizeDateOnly(dc.date) || dc.date;
          const session = await prisma.classSession.findFirst({
            where: {
              class_id: ec.class_id,
              session_date: normalizedDate,
              ...(startTime ? { start_time: startTime } : {}),
            },
          });
          if (!session) {
            errors.push({ row: r, error: 'Không tìm thấy buổi học khớp lớp, ngày và giờ' });
            continue;
          }
          await this.assertTeacherScope(actor, ec.class_id, session.session_date);

          // Check existing attendance for reconciliation
          const existingAtt = await prisma.attendance.findUnique({
            where: {
              enrollment_class_id_class_session_id: {
                enrollment_class_id: ec.id,
                class_session_id: session.id,
              },
            },
          });

          let reconciliationState: ReconciliationState;

          if (existingAtt?.cs_status) {
            if (existingAtt.cs_status === parsed.status) {
              reconciliationState = ReconciliationState.MATCHED;
              matchedCount++;
            } else {
              reconciliationState = ReconciliationState.CONFLICT;
              conflictCount++;
            }
          } else {
            reconciliationState = ReconciliationState.PENDING_CS;
            pendingCount++;
          }

          const upserted = await prisma.attendance.upsert({
            where: {
              enrollment_class_id_class_session_id: {
                enrollment_class_id: ec.id,
                class_session_id: session.id,
              },
            },
            update: {
              teacher_status: parsed.status,
              teacher_raw_value: cellText,
              lesson_topic: parsed.lessonTopic || existingAtt?.lesson_topic || null,
              teacher_submitted_at: new Date(),
              teacher_user_id: actor.id,
              reconciliation_state: reconciliationState,
              source: AttendanceSource.TEACHER_UPLOAD,
              resolved_by_id: null,
              resolved_at: null,
              resolution_note: null,
              ...(reconciliationState === ReconciliationState.MATCHED ? { status: parsed.status } : {}),
            },
            create: {
              enrollment_class_id: ec.id,
              class_session_id: session.id,
              teacher_status: parsed.status,
              teacher_raw_value: cellText,
              lesson_topic: parsed.lessonTopic,
              teacher_submitted_at: new Date(),
              teacher_user_id: actor.id,
              status: parsed.status,
              reconciliation_state: reconciliationState,
              source: AttendanceSource.TEACHER_UPLOAD,
              created_by_id: actor.id,
            },
          });

          processedCount++;

          if (reconciliationState === ReconciliationState.MATCHED) {
            handleAttendanceEvent(upserted.id).catch((err: any) =>
              log.error('Automation trigger failed (uploadTeacherExcel MATCHED)', { attendanceId: upserted.id, error: err.message })
            );
          } else if (reconciliationState === ReconciliationState.CONFLICT) {
            cancelPendingDeliveries(upserted.id).catch((err: any) =>
              log.error('Cancel deliveries failed (uploadTeacherExcel CONFLICT)', { attendanceId: upserted.id, error: err.message })
            );
          }
        } catch (err: any) {
          errors.push({ row: r, error: err.message || 'Lỗi khi xử lý hàng điểm danh' });
        }
      }
    }

    return {
      sheetName: sheet.name,
      totalDates: dateCols.length,
      processedCount,
      matchedCount,
      conflictCount,
      pendingCount,
      errors,
    };
  }

  /**
   * Get teaching sessions in the selected teacher scope.
   */
  async getTeacherSessions(actor: Actor, query: TeacherSessionsQuery) {
    let targetUserId = actor.id;
    if (query.teacherId !== undefined) {
      if (!this.isPrivileged(actor)) {
        throw new AppError(403, 'Chỉ ADMIN/MANAGE được chọn giáo viên khác');
      }
      targetUserId = query.teacherId;
    } else if (!actor.roles.includes('TEACHER') && this.isPrivileged(actor)) {
      throw new AppError(400, 'Vui lòng chọn giáo viên cần hỗ trợ');
    }

    const teacherUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { teacher: true },
    });
    const teacherId = teacherUser?.teacher?.id;
    if (!teacherId || !teacherUser.teacher?.active) {
      throw new AppError(404, 'Không tìm thấy hồ sơ giáo viên đang hoạt động');
    }

    // D8 (owner verdict 2026-10-26): do NOT pre-filter active:true at the DB
    // query — fetch all of the teacher's assignment rows (selecting active,
    // start_date, end_date) and let the helper decide which classes/sessions
    // fall inside an effective window.
    const classTeachers = await prisma.classTeacher.findMany({
      where: { teacher_id: teacherId },
      select: { class_id: true, active: true, start_date: true, end_date: true },
    });

    const rangeStart = query.startDate ? new Date(`${query.startDate}T00:00:00.000Z`) : null;
    const rangeEnd = query.endDate ? new Date(`${query.endDate}T00:00:00.000Z`) : null;

    const byClass = new Map<number, typeof classTeachers>();
    for (const ct of classTeachers) {
      if (!isTeacherAssignmentEffectiveInRange(ct, rangeStart, rangeEnd)) continue;
      const list = byClass.get(ct.class_id) ?? [];
      list.push(ct);
      byClass.set(ct.class_id, list);
    }
    const classIds = Array.from(byClass.keys());
    if (classIds.length === 0) return [];

    const dateFilter: Prisma.DateTimeFilter = {};
    if (rangeStart) dateFilter.gte = rangeStart;
    if (rangeEnd) dateFilter.lte = rangeEnd;

    const sessions = await prisma.classSession.findMany({
      where: {
        class_id: { in: classIds },
        ...(rangeStart || rangeEnd ? { session_date: dateFilter } : {}),
      },
      orderBy: [{ session_date: 'desc' }, { start_time: 'asc' }],
      include: {
        class: {
          include: {
            enrollment_classes: {
              where: { status: 'ACTIVE' },
              include: {
                enrollment: {
                  include: {
                    student: true,
                    cs: { select: { id: true, name: true, phone: true } },
                  },
                },
                attendance: true,
              },
            },
          },
        },
      },
    });

    return sessions.filter((s) =>
      findEffectiveAssignment(byClass.get(s.class_id) ?? [], s.session_date) !== null
    );
  }
}

export const reconciliationService = new ReconciliationService();
