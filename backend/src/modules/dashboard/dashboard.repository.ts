import { PrismaClient, EnrollmentStatus, AttendanceStatus, CareTaskStatus, CareTaskPriority, CareTaskType, CareLogOutcome } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { isCareMilestoneAttendance, isConsumedAttendance } from '../enrollments/enrollment-entitlement';
import { DashboardFilterParams } from './dashboard.types';

export class DashboardRepository {
  private db: PrismaClient;

  constructor(dbClient?: PrismaClient) {
    this.db = dbClient || prisma;
  }

  /**
   * Build the standard enrollment `where` clause honoring data scope (csIds)
   * and global dashboard filters. Shared across all overview/care/performance
   * aggregate queries to guarantee consistent filtering.
   */
  private enrollmentWhere(csIds: number[] | null, filter: DashboardFilterParams): any {
    const where: any = {};

    if (csIds !== null) {
      if (filter.cs_id && csIds.includes(filter.cs_id)) {
        where.cs_id = filter.cs_id;
      } else {
        where.cs_id = { in: csIds };
      }
    } else if (filter.cs_id) {
      where.cs_id = filter.cs_id;
    }

    if (filter.package_id) where.package_id = filter.package_id;
    if (filter.status) where.status = filter.status as EnrollmentStatus;

    if (filter.date_from || filter.date_to) {
      where.created_at = {};
      if (filter.date_from) where.created_at.gte = new Date(filter.date_from);
      if (filter.date_to) where.created_at.lte = new Date(filter.date_to);
    }

    return where;
  }

  // --- Enrollment Summary ---
  async getEnrollmentSummary(csIds: number[] | null, filter: DashboardFilterParams) {
    const where = this.enrollmentWhere(csIds, filter);

    const [totalEnrollments, statusGroups, distinctStudents] = await Promise.all([
      this.db.enrollment.count({ where }),
      this.db.enrollment.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.db.enrollment.findMany({
        where,
        select: { student_id: true },
        distinct: ['student_id'],
      }),
    ]);

    const statusBreakdown: Record<string, number> = {
      NOT_STARTED: 0,
      STUDYING: 0,
      PAUSED: 0,
      FINISHED: 0,
      CANCELLED: 0,
    };

    statusGroups.forEach((g) => {
      statusBreakdown[g.status] = g._count.id;
    });

    return {
      totalEnrollments,
      uniqueStudents: distinctStudents.length,
      statusBreakdown,
    };
  }

  // --- Attendance Stats ---
  async getAttendanceStats(csIds: number[] | null, filter: DashboardFilterParams) {
    const where: any = {};

    if (csIds !== null) {
      where.enrollment_class = {
        enrollment: {
          cs_id: { in: csIds },
        },
      };
    }

    if (filter.class_id) {
      where.class_session = { class_id: filter.class_id };
    }

    if (filter.package_id) {
      where.enrollment_class = {
        ...where.enrollment_class,
        enrollment: {
          ...where.enrollment_class?.enrollment,
          package_id: filter.package_id,
        },
      };
    }

    if (filter.date_from || filter.date_to) {
      where.class_session = {
        ...where.class_session,
        session_date: {},
      };
      if (filter.date_from) where.class_session.session_date.gte = new Date(filter.date_from);
      if (filter.date_to) where.class_session.session_date.lte = new Date(filter.date_to);
    }

    const [totalAttendances, statusGroups, sessionCount] = await Promise.all([
      this.db.attendance.count({ where }),
      this.db.attendance.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.db.classSession.count({
        where: filter.class_id ? { class_id: filter.class_id } : {},
      }),
    ]);

    const breakdown: Record<string, number> = {
      ATTENDED: 0,
      ABSENT_APPROVED_A: 0,
      LEAVE_B: 0,
      ABSENT_UNAPPROVED_C: 0,
      TEACHER_ABSENT_D: 0,
      TECH_ERROR_E: 0,
    };

    statusGroups.forEach((g) => {
      breakdown[g.status] = g._count.id;
    });

    return {
      totalSessions: sessionCount,
      totalAttendances,
      breakdown,
    };
  }

  // --- Care Outcomes Pivot Matrix ---
  async getCareLogsForPivot(csIds: number[] | null, filter: DashboardFilterParams) {
    const where: any = {};

    if (csIds !== null) {
      if (filter.cs_id && csIds.includes(filter.cs_id)) {
        where.cs_id = filter.cs_id;
      } else {
        where.cs_id = { in: csIds };
      }
    } else if (filter.cs_id) {
      where.cs_id = filter.cs_id;
    }

    if (filter.package_id) {
      where.enrollment = { package_id: filter.package_id };
    }

    if (filter.date_from || filter.date_to) {
      where.created_at = {};
      if (filter.date_from) where.created_at.gte = new Date(filter.date_from);
      if (filter.date_to) where.created_at.lte = new Date(filter.date_to);
    }

    return this.db.careLog.findMany({
      where,
      select: {
        after_session_number: true,
        outcome: true,
      },
    });
  }

  /**
   * Enrollment-scoped care response rows. The enrollment scope is intentionally
   * broader than the log date scope so missing logs can be counted as NOT_ENTERED.
   */
  async getCareResponseRows(csIds: number[] | null, filter: DashboardFilterParams) {
    const enrollmentWhere = this.enrollmentWhere(csIds, filter);
    // For care analytics, the date range belongs to the care activity, not
    // the enrollment creation date. Older enrollments may have recent logs.
    delete enrollmentWhere.created_at;

    const logWhere: any = {};
    if (filter.date_from || filter.date_to) {
      logWhere.created_at = {};
      if (filter.date_from) logWhere.created_at.gte = new Date(filter.date_from);
      if (filter.date_to) {
        const dateTo = new Date(filter.date_to);
        dateTo.setHours(23, 59, 59, 999);
        logWhere.created_at.lte = dateTo;
      }
    }

    const [enrollments, milestones] = await Promise.all([
      this.db.enrollment.findMany({
        where: enrollmentWhere,
        select: {
          id: true,
          care_logs: {
            where: logWhere,
            orderBy: { created_at: 'desc' },
            select: {
              after_session_number: true,
              outcome: true,
              content: true,
              created_at: true,
            },
          },
        },
      }),
      this.db.careMilestoneConfig.findMany({
        orderBy: { session_number: 'asc' },
        select: { session_number: true },
      }),
    ]);

    return { enrollments, milestones };
  }

  // --- Tasks Overview ---
  async getTasksOverview(csIds: number[] | null, csIdFilter?: number) {
    const where: any = {};

    if (csIds !== null) {
      if (csIdFilter && csIds.includes(csIdFilter)) {
        where.assigned_to_id = csIdFilter;
      } else {
        where.assigned_to_id = { in: csIds };
      }
    } else if (csIdFilter) {
      where.assigned_to_id = csIdFilter;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [pendingTotal, overdue, dueToday, dueThisWeek, urgentHotIssues, completedRecent] = await Promise.all([
      this.db.careTask.count({
        where: { ...where, status: CareTaskStatus.PENDING },
      }),
      this.db.careTask.count({
        where: {
          ...where,
          status: CareTaskStatus.PENDING,
          due_at: { lt: now },
        },
      }),
      this.db.careTask.count({
        where: {
          ...where,
          status: CareTaskStatus.PENDING,
          due_at: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.db.careTask.count({
        where: {
          ...where,
          status: CareTaskStatus.PENDING,
          due_at: { gte: now, lte: endOfWeek },
        },
      }),
      this.db.careTask.count({
        where: {
          ...where,
          status: CareTaskStatus.PENDING,
          OR: [
            { priority: CareTaskPriority.URGENT },
            { type: CareTaskType.HOT_ISSUE },
          ],
        },
      }),
      this.db.careTask.count({
        where: {
          ...where,
          status: CareTaskStatus.DONE,
          completed_at: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    return {
      pending_total: pendingTotal,
      overdue,
      due_today: dueToday,
      due_this_week: dueThisWeek,
      urgent_hot_issues: urgentHotIssues,
      completed_recent: completedRecent,
    };
  }

  // =====================================================================
  //  New aggregate queries for the 4 dashboard tabs
  // =====================================================================

  // --- Overview: enrollment trend bucketed by day/week/month ---
  async getEnrollmentTrend(
    csIds: number[] | null,
    filter: DashboardFilterParams,
    granularity: 'day' | 'week' | 'month',
  ) {
    const rows = await this.db.enrollment.findMany({
      where: this.enrollmentWhere(csIds, filter),
      select: { created_at: true },
    });

    const buckets = new Map<string, { date: Date; count: number }>();
    for (const r of rows) {
      const key = bucketKey(r.created_at, granularity);
      const cur = buckets.get(key.label);
      if (cur) cur.count += 1;
      else buckets.set(key.label, { date: key.date, count: 1 });
    }

    const points = Array.from(buckets.entries())
      .sort((a, b) => a[1].date.getTime() - b[1].date.getTime())
      .map(([label, v]) => ({ label, date: v.date.toISOString(), total: v.count }));

    return points;
  }

  // --- Overview: enrollment count per CS ---
  async getEnrollmentByCS(csIds: number[] | null, filter: DashboardFilterParams) {
    const groups = await this.db.enrollment.groupBy({
      by: ['cs_id'],
      where: this.enrollmentWhere(csIds, filter),
      _count: { id: true },
    });

    const csIdsList = groups.map((g) => g.cs_id);
    const users = csIdsList.length
      ? await this.db.user.findMany({
          where: { id: { in: csIdsList } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name || u.email]));

    return groups
      .map((g) => ({
        cs_id: g.cs_id,
        cs_name: nameById.get(g.cs_id) || `CS #${g.cs_id}`,
        count: g._count.id,
      }))
      .sort((a, b) => b.count - a.count);
  }

  // --- Overview: STUDYING enrollments nearing completion (<=10 sessions left) ---
  async countNearCompletion(csIds: number[] | null, filter: DashboardFilterParams) {
    const where = this.enrollmentWhere(csIds, filter);
    where.status = EnrollmentStatus.STUDYING;

    const enrollments = await this.db.enrollment.findMany({
      where,
      select: {
        id: true,
        total_sessions: true,
        enrollment_classes: {
          select: {
            attendance: {
              select: {
                status: true,
                reconciliation_state: true,
                deleted_at: true,
              },
            },
          },
        },
      },
    });

    let count = 0;
    for (const e of enrollments) {
      // C.4: consume only FINAL (MATCHED/RESOLVED) consuming-status rows;
      // deleted and provisional rows never count (enrollment-entitlement).
      const consumed = e.enrollment_classes.reduce(
        (sum, ec) => sum + ec.attendance.filter((att) => isConsumedAttendance(att)).length,
        0,
      );
      const remaining = e.total_sessions - consumed;
      if (remaining >= 0 && remaining <= 10) count += 1;
    }
    return count;
  }

  // --- Care: outcome breakdown (group by) ---
  async getCareOutcomeBreakdown(csIds: number[] | null, filter: DashboardFilterParams) {
    const where = buildCareLogWhere(csIds, filter);
    const groups = await this.db.careLog.groupBy({
      by: ['outcome'],
      where,
      _count: { id: true },
    });
    return groups.map((g) => ({
      outcome: g.outcome || 'NO_RESPONSE',
      count: g._count.id,
    }));
  }

  // --- Care: milestone coverage ---
  // reached = enrollments whose attended-session count >= milestone
  // covered = of those, how many have a care_log at exactly that milestone
  async getMilestoneCoverage(csIds: number[] | null, filter: DashboardFilterParams) {
    const milestones = await this.db.careMilestoneConfig.findMany({
      orderBy: { session_number: 'asc' },
      select: { session_number: true },
    });

    const where = this.enrollmentWhere(csIds, filter);
    const enrollments = await this.db.enrollment.findMany({
      where,
      select: {
        id: true,
        enrollment_classes: {
          select: {
            attendance: {
              select: {
                status: true,
                reconciliation_state: true,
                deleted_at: true,
              },
            },
          },
        },
        care_logs: { select: { after_session_number: true } },
      },
    });

    return milestones.map((m) => {
      let reached = 0;
      let covered = 0;
      for (const e of enrollments) {
        // D1 (approved 2026-10-25): the CARE milestone basis (K7) is FINAL
        // personal ATTENDED rows only — a rest-without-permit (C) consumes
        // entitlement (K5, see countNearCompletion) but does NOT advance the
        // "học đủ N buổi" care milestone. Two deliberate same-day ATTENDED
        // finals count as 2. Evaluation milestones are a separate catalog and
        // must not reuse this count (K7 ≠ K5 invariant, 05 §A.3).
        const attended = e.enrollment_classes.reduce(
          (sum, ec) => sum + ec.attendance.filter((att) => isCareMilestoneAttendance(att)).length,
          0,
        );
        if (attended >= m.session_number) {
          reached += 1;
          const hasLog = e.care_logs.some((l) => l.after_session_number === m.session_number);
          if (hasLog) covered += 1;
        }
      }
      return {
        session_number: m.session_number,
        reached,
        covered,
        coverage_pct: reached > 0 ? parseFloat(((covered / reached) * 100).toFixed(1)) : 0,
      };
    });
  }

  // --- Care: at-risk students (latest care log = NEGATIVE_WANTS_TO_STOP) ---
  async getAtRiskStudents(csIds: number[] | null, filter: DashboardFilterParams) {
    const where = buildCareLogWhere(csIds, filter);
    where.outcome = CareLogOutcome.NEGATIVE_WANTS_TO_STOP;

    const logs = await this.db.careLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        enrollment_id: true,
        after_session_number: true,
        created_at: true,
        enrollment: { select: { student: { select: { full_name: true } } } },
        cs: { select: { name: true, email: true } },
      },
    });

    // de-dup per enrollment (keep latest, which is first due to desc order)
    const seen = new Set<number>();
    const result: Array<{
      enrollment_id: number;
      student_name: string;
      cs_name: string | null;
      after_session_number: number | null;
      last_log_at: string;
    }> = [];

    for (const l of logs) {
      if (seen.has(l.enrollment_id)) continue;
      seen.add(l.enrollment_id);
      result.push({
        enrollment_id: l.enrollment_id,
        student_name: l.enrollment.student.full_name,
        cs_name: l.cs.name || l.cs.email || null,
        after_session_number: l.after_session_number,
        last_log_at: l.created_at.toISOString(),
      });
    }
    return result;
  }

  // --- Attendance: trend by bucket ---
  async getAttendanceTrend(
    csIds: number[] | null,
    filter: DashboardFilterParams,
    granularity: 'day' | 'week' | 'month',
  ) {
    const rows = await this.db.attendance.findMany({
      where: buildAttendanceWhere(csIds, filter),
      select: {
        status: true,
        class_session: { select: { session_date: true } },
      },
    });

    const buckets = new Map<string, { date: Date; total: number; attended: number }>();
    for (const r of rows) {
      const key = bucketKey(r.class_session.session_date, granularity);
      const cur = buckets.get(key.label) || { date: key.date, total: 0, attended: 0 };
      cur.total += 1;
      if (r.status === AttendanceStatus.ATTENDED) cur.attended += 1;
      buckets.set(key.label, cur);
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[1].date.getTime() - b[1].date.getTime())
      .map(([label, v]) => ({
        label,
        date: v.date.toISOString(),
        total: v.total,
        attended: v.attended,
        rate: v.total > 0 ? parseFloat(((v.attended / v.total) * 100).toFixed(1)) : 0,
      }));
  }

  // --- Attendance: rate by class ---
  async getAttendanceByClass(csIds: number[] | null, filter: DashboardFilterParams) {
    const rows = await this.db.attendance.findMany({
      where: buildAttendanceWhere(csIds, filter),
      select: {
        status: true,
        class_session: {
          select: { class_id: true, class: { select: { class_name: true } } },
        },
      },
    });

    const map = new Map<number, { class_name: string; total: number; attended: number }>();
    for (const r of rows) {
      const id = r.class_session.class_id;
      const cur = map.get(id) || { class_name: r.class_session.class.class_name, total: 0, attended: 0 };
      cur.total += 1;
      if (r.status === AttendanceStatus.ATTENDED) cur.attended += 1;
      map.set(id, cur);
    }

    return Array.from(map.entries())
      .map(([class_id, v]) => ({
        class_id,
        class_name: v.class_name,
        total: v.total,
        attended: v.attended,
        rate: v.total > 0 ? parseFloat(((v.attended / v.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => a.rate - b.rate);
  }

  // --- Performance: tasks grouped by type ---
  async getTasksByType(csIds: number[] | null, csIdFilter?: number) {
    const where: any = {};
    if (csIds !== null) {
      where.assigned_to_id = csIdFilter && csIds.includes(csIdFilter) ? csIdFilter : { in: csIds };
    } else if (csIdFilter) {
      where.assigned_to_id = csIdFilter;
    }

    const groups = await this.db.careTask.groupBy({
      by: ['type', 'status'],
      where,
      _count: { id: true },
    });

    const byType = new Map<string, { total: number; pending: number; done: number }>();
    for (const g of groups) {
      const cur = byType.get(g.type) || { total: 0, pending: 0, done: 0 };
      cur.total += g._count.id;
      if (g.status === CareTaskStatus.PENDING) cur.pending += g._count.id;
      if (g.status === CareTaskStatus.DONE) cur.done += g._count.id;
      byType.set(g.type, cur);
    }

    return Array.from(byType.entries()).map(([type, v]) => ({ type, ...v }));
  }

  // --- Performance: task completion for the current calendar month ---
  async getTaskCompletion(csIds: number[] | null, csIdFilter?: number) {
    const where: any = {};
    if (csIds !== null) {
      where.assigned_to_id = csIdFilter && csIds.includes(csIdFilter) ? csIdFilter : { in: csIds };
    } else if (csIdFilter) {
      where.assigned_to_id = csIdFilter;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const createdInMonth = { ...where, created_at: { gte: startOfMonth } };

    const [total, done] = await Promise.all([
      this.db.careTask.count({ where: createdInMonth }),
      this.db.careTask.count({ where: { ...createdInMonth, status: CareTaskStatus.DONE } }),
    ]);

    return {
      month_total: total,
      month_done: done,
      completion_pct: total > 0 ? parseFloat(((done / total) * 100).toFixed(1)) : 0,
    };
  }

  // --- Performance: CS leaderboard (ADMIN/MANAGE only, gated in service) ---
  async getCSLeaderboard(csIds: number[] | null, filter: DashboardFilterParams) {
    const scopeIds = csIds ?? (await this.db.enrollment.findMany({ select: { cs_id: true }, distinct: ['cs_id'] })).map((r) => r.cs_id);
    if (scopeIds.length === 0) return [];

    const [enrollGroups, logGroups, positiveGroups, taskGroups] = await Promise.all([
      this.db.enrollment.groupBy({
        by: ['cs_id'],
        where: { cs_id: { in: scopeIds } },
        _count: { id: true },
      }),
      this.db.careLog.groupBy({
        by: ['cs_id'],
        where: { cs_id: { in: scopeIds } },
        _count: { id: true },
      }),
      this.db.careLog.groupBy({
        by: ['cs_id'],
        where: { cs_id: { in: scopeIds }, outcome: CareLogOutcome.POSITIVE },
        _count: { id: true },
      }),
      this.db.careTask.groupBy({
        by: ['assigned_to_id', 'status'],
        where: { assigned_to_id: { in: scopeIds } },
        _count: { id: true },
      }),
    ]);

    const users = await this.db.user.findMany({
      where: { id: { in: scopeIds } },
      select: { id: true, name: true, email: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name || u.email]));

    const enrollMap = new Map(enrollGroups.map((g) => [g.cs_id, g._count.id]));
    const logMap = new Map(logGroups.map((g) => [g.cs_id, g._count.id]));
    const positiveMap = new Map(positiveGroups.map((g) => [g.cs_id, g._count.id]));

    const taskTotal = new Map<number, number>();
    const taskDone = new Map<number, number>();
    for (const g of taskGroups) {
      taskTotal.set(g.assigned_to_id, (taskTotal.get(g.assigned_to_id) || 0) + g._count.id);
      if (g.status === CareTaskStatus.DONE)
        taskDone.set(g.assigned_to_id, (taskDone.get(g.assigned_to_id) || 0) + g._count.id);
    }

    const pct = (n: number, d: number) => (d > 0 ? parseFloat(((n / d) * 100).toFixed(1)) : 0);

    return scopeIds
      .map((id) => {
        const totalLogs = logMap.get(id) || 0;
        const positiveLogs = positiveMap.get(id) || 0;
        const tasksTotal = taskTotal.get(id) || 0;
        const tasksDone = taskDone.get(id) || 0;
        return {
          cs_id: id,
          cs_name: nameById.get(id) || `CS #${id}`,
          total_enrollments: enrollMap.get(id) || 0,
          total_logs: totalLogs,
          positive_logs: positiveLogs,
          positive_pct: pct(positiveLogs, totalLogs),
          tasks_done: tasksDone,
          tasks_total: tasksTotal,
          tasks_done_pct: pct(tasksDone, tasksTotal),
        };
      })
      .sort((a, b) => b.total_logs - a.total_logs);
  }
}

// ---------------------------------------------------------------------------
//  Helper functions (module-private)
// ---------------------------------------------------------------------------

function bucketKey(d: Date, granularity: 'day' | 'week' | 'month'): { label: string; date: Date } {
  const date = new Date(d);
  if (granularity === 'day') {
    const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return { label: iso, date: new Date(iso) };
  }
  if (granularity === 'month') {
    const label = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    return { label, date: new Date(`${label}-01`) };
  }
  // week: bucket to Monday of that ISO week
  const day = date.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  const label = `${monday.getFullYear()}-W${isoWeek(date)}`;
  return { label, date: monday };
}

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return pad(weekNo);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function buildCareLogWhere(csIds: number[] | null, filter: DashboardFilterParams): any {
  const where: any = {};
  if (csIds !== null) {
    if (filter.cs_id && csIds.includes(filter.cs_id)) where.cs_id = filter.cs_id;
    else where.cs_id = { in: csIds };
  } else if (filter.cs_id) {
    where.cs_id = filter.cs_id;
  }
  if (filter.package_id) where.enrollment = { package_id: filter.package_id };
  if (filter.date_from || filter.date_to) {
    where.created_at = {};
    if (filter.date_from) where.created_at.gte = new Date(filter.date_from);
    if (filter.date_to) where.created_at.lte = new Date(filter.date_to);
  }
  return where;
}

function buildAttendanceWhere(csIds: number[] | null, filter: DashboardFilterParams): any {
  const where: any = { deleted_at: null };
  const enrollmentFilter: any = {};

  if (csIds !== null) enrollmentFilter.cs_id = { in: csIds };
  else if (filter.cs_id) enrollmentFilter.cs_id = filter.cs_id;
  if (filter.package_id) enrollmentFilter.package_id = filter.package_id;

  const ec: any = {};
  if (Object.keys(enrollmentFilter).length) ec.enrollment = enrollmentFilter;

  const cs: any = {};
  if (filter.class_id) cs.class_id = filter.class_id;
  if (filter.date_from || filter.date_to) {
    cs.session_date = {};
    if (filter.date_from) cs.session_date.gte = new Date(filter.date_from);
    if (filter.date_to) cs.session_date.lte = new Date(filter.date_to);
  }
  if (Object.keys(ec).length) where.enrollment_class = ec;
  if (Object.keys(cs).length) where.class_session = cs;
  return where;
}
