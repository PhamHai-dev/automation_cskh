import { PrismaClient, EnrollmentStatus, AttendanceStatus, CareTaskStatus, CareTaskPriority, CareTaskType } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { DashboardFilterParams } from './dashboard.types';

export class DashboardRepository {
  private db: PrismaClient;

  constructor(dbClient?: PrismaClient) {
    this.db = dbClient || prisma;
  }

  // --- Enrollment Summary ---
  async getEnrollmentSummary(csIds: number[] | null, filter: DashboardFilterParams) {
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
      where.package_id = filter.package_id;
    }

    if (filter.status) {
      where.status = filter.status as EnrollmentStatus;
    }

    if (filter.date_from || filter.date_to) {
      where.created_at = {};
      if (filter.date_from) where.created_at.gte = new Date(filter.date_from);
      if (filter.date_to) where.created_at.lte = new Date(filter.date_to);
    }

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
}
