import { DashboardRepository } from './dashboard.repository';
import {
  DashboardFilterParams,
  EnrollmentSummaryStats,
  AttendanceStats,
  CarePivotMatrix,
  TasksOverviewStats,
  OverviewPayload,
  CarePayload,
  AttendancePayload,
  PerformancePayload,
  TrendGranularity,
  CareResponseMatrix,
  CareResponseBucket,
} from './dashboard.types';
import { CareLogOutcome } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { AppError } from '../../middlewares/error.middleware';

const CARE_LABEL_TO_BUCKET: Record<string, CareResponseBucket> = {
  'Phản hồi tích cực': 'POSITIVE',
  'Cần hỗ trợ về hệ thống': 'NEED_SUPPORT_SYSTEM',
  'Phản hồi tạm, học thêm rồi báo': 'TEMP_PAUSE',
  'Cần hỗ trợ về chương trình học': 'NEED_CURRICULUM_SUPPORT',
  'Cần hỗ trợ về điểm yếu của chính học viên': 'NEED_STUDENT_WEAKNESS_FIX',
  'Cần hỗ trợ về giáo viên': 'NEED_TEACHER_SUPPORT',
  'Phản hồi tiêu cực, muốn dừng': 'NEGATIVE_WANTS_TO_STOP',
  'Chưa phản hồi': 'NO_RESPONSE',
};

export class DashboardService {
  private repo: DashboardRepository;

  constructor(repo?: DashboardRepository) {
    this.repo = repo || new DashboardRepository();
  }

  // Data scope resolution
  async getAccessibleCSIds(userId: number, roles: string[]): Promise<number[] | null> {
    if (roles.includes('ADMIN')) {
      return null;
    }

    if (roles.includes('MANAGE')) {
      const assignments = await prisma.manageAssignment.findMany({
        where: { manage_user_id: userId },
        include: {
          cs_group: {
            include: { members: true },
          },
        },
      });

      const csIds = new Set<number>();
      csIds.add(userId);
      assignments.forEach((a) => {
        a.cs_group.members.forEach((m) => csIds.add(m.user_id));
      });
      return Array.from(csIds);
    }

    if (roles.includes('CS')) {
      return [userId];
    }

    throw new AppError(403, 'Bạn không có quyền xem thống kê dashboard');
  }

  // 1. Enrollment Summary
  async getSummary(filter: DashboardFilterParams, userId: number, roles: string[]): Promise<EnrollmentSummaryStats> {
    const accessibleCSIds = await this.getAccessibleCSIds(userId, roles);
    const { totalEnrollments, uniqueStudents, statusBreakdown } = await this.repo.getEnrollmentSummary(accessibleCSIds, filter);

    const statusPercentage: Record<string, number> = {};
    Object.keys(statusBreakdown).forEach((st) => {
      const count = statusBreakdown[st] || 0;
      statusPercentage[st] = totalEnrollments > 0 ? parseFloat(((count / totalEnrollments) * 100).toFixed(1)) : 0;
    });

    return {
      total_enrollments: totalEnrollments,
      unique_students: uniqueStudents,
      status_breakdown: statusBreakdown,
      status_percentage: statusPercentage,
    };
  }

  // 2. Attendance Stats
  async getAttendance(filter: DashboardFilterParams, userId: number, roles: string[]): Promise<AttendanceStats> {
    const accessibleCSIds = await this.getAccessibleCSIds(userId, roles);
    const { totalSessions, totalAttendances, breakdown } = await this.repo.getAttendanceStats(accessibleCSIds, filter);

    const attendedCount = breakdown.ATTENDED || 0;
    const rate = totalAttendances > 0 ? parseFloat(((attendedCount / totalAttendances) * 100).toFixed(1)) : 0;

    return {
      total_sessions: totalSessions,
      total_attendances: totalAttendances,
      attendance_rate: rate,
      breakdown,
    };
  }

  // 3. Care Pivot Matrix
  async getCarePivot(filter: DashboardFilterParams, userId: number, roles: string[]): Promise<CarePivotMatrix> {
    const accessibleCSIds = await this.getAccessibleCSIds(userId, roles);
    const logs = await this.repo.getCareLogsForPivot(accessibleCSIds, filter);

    const matrix: Record<string, Record<string, number>> = {};
    const sessionNumbersSet = new Set<number>();
    const allOutcomes = Object.values(CareLogOutcome);

    logs.forEach((log) => {
      const sess = log.after_session_number || 1;
      sessionNumbersSet.add(sess);

      const sessKey = String(sess);
      if (!matrix[sessKey]) {
        matrix[sessKey] = {};
      }

      const outcome = log.outcome || 'NO_RESPONSE';
      matrix[sessKey][outcome] = (matrix[sessKey][outcome] || 0) + 1;
    });

    const sortedSessionNumbers = Array.from(sessionNumbersSet).sort((a, b) => a - b);
    if (sortedSessionNumbers.length === 0) {
      sortedSessionNumbers.push(1, 3, 5, 10);
    }

    return {
      session_numbers: sortedSessionNumbers,
      outcomes: allOutcomes,
      matrix,
      total_logs: logs.length,
    };
  }

  // 4. Tasks Overview
  async getTasksOverview(csIdFilter: number | undefined, userId: number, roles: string[]): Promise<TasksOverviewStats> {
    const accessibleCSIds = await this.getAccessibleCSIds(userId, roles);
    return this.repo.getTasksOverview(accessibleCSIds, csIdFilter);
  }

  // ---------------------------------------------------------------------------
  //  Granularity resolver: auto-pick day/week/month from the filtered range
  // ---------------------------------------------------------------------------
  private resolveGranularity(filter: DashboardFilterParams): TrendGranularity {
    const DAY = 24 * 60 * 60 * 1000;
    const to = filter.date_to ? new Date(filter.date_to).getTime() : Date.now();
    const from = filter.date_from ? new Date(filter.date_from).getTime() : to - 30 * DAY;
    const span = Math.max(0, to - from);
    if (span <= 14 * DAY) return 'day';
    if (span <= 90 * DAY) return 'week';
    return 'month';
  }

  // ---------------------------------------------------------------------------
  //  TAB 1 — Overview
  // ---------------------------------------------------------------------------
  async getOverview(filter: DashboardFilterParams, userId: number, roles: string[]): Promise<OverviewPayload> {
    const csIds = await this.getAccessibleCSIds(userId, roles);
    const granularity = this.resolveGranularity(filter);

    const summary = await this.getSummary(filter, userId, roles);
    const [trend, byCS, nearCompletion, tasks] = await Promise.all([
      this.repo.getEnrollmentTrend(csIds, filter, granularity),
      this.repo.getEnrollmentByCS(csIds, filter),
      this.repo.countNearCompletion(csIds, filter),
      this.repo.getTasksOverview(csIds, filter.cs_id),
    ]);

    const total = summary.total_enrollments;
    const studying = summary.status_breakdown.STUDYING || 0;

    return {
      summary,
      kpis: {
        total_enrollments: total,
        studying,
        studying_pct: total > 0 ? parseFloat(((studying / total) * 100).toFixed(1)) : 0,
        paused: summary.status_breakdown.PAUSED || 0,
        near_completion: nearCompletion,
        overdue_tasks: tasks.overdue,
      },
      enrollment_trend: { granularity, points: trend },
      enrollment_by_cs: byCS,
    };
  }

  // ---------------------------------------------------------------------------
  //  TAB 2 — Care
  // ---------------------------------------------------------------------------
  private async buildCareResponseMatrix(
    filter: DashboardFilterParams,
    csIds: number[] | null,
  ): Promise<CareResponseMatrix> {
    const { enrollments, milestones } = await this.repo.getCareResponseRows(csIds, filter);
    const buckets: CareResponseBucket[] = [
      'POSITIVE',
      'NEED_SUPPORT_SYSTEM',
      'TEMP_PAUSE',
      'NEED_CURRICULUM_SUPPORT',
      'NEED_STUDENT_WEAKNESS_FIX',
      'NEED_TEACHER_SUPPORT',
      'NEGATIVE_WANTS_TO_STOP',
      'NO_RESPONSE',
      'OTHER',
      'NOT_ENTERED',
    ];
    const sessionNumbers = Array.from(new Set([
      ...milestones.map((m) => m.session_number),
      ...enrollments.flatMap((e) => e.care_logs.map((l) => l.after_session_number).filter((n): n is number => n !== null)),
      1,
    ])).sort((a, b) => a - b);

    const emptyCounts = (): Record<CareResponseBucket, number> => ({
      POSITIVE: 0,
      NEED_SUPPORT_SYSTEM: 0,
      TEMP_PAUSE: 0,
      NEED_CURRICULUM_SUPPORT: 0,
      NEED_STUDENT_WEAKNESS_FIX: 0,
      NEED_TEACHER_SUPPORT: 0,
      NEGATIVE_WANTS_TO_STOP: 0,
      NO_RESPONSE: 0,
      OTHER: 0,
      NOT_ENTERED: 0,
    });

    const rows = sessionNumbers.map((sessionNumber) => {
      const counts = emptyCounts();
      for (const enrollment of enrollments) {
        const log = enrollment.care_logs.find((candidate) => candidate.after_session_number === sessionNumber);
        let bucket: CareResponseBucket = 'NOT_ENTERED';
        if (log) {
          const normalizedContent = log.content?.trim() || '';
          const contentBucket = CARE_LABEL_TO_BUCKET[normalizedContent];
          if (contentBucket) {
            bucket = contentBucket;
          } else if (normalizedContent) {
            // Legacy rows often have outcome=POSITIVE by default while the
            // actual free-text response is stored in content.
            bucket = 'OTHER';
          } else if (log.outcome && Object.values(CareLogOutcome).includes(log.outcome)) {
            bucket = log.outcome as CareResponseBucket;
          }
        }
        counts[bucket] += 1;
      }
      const totalEnrollments = enrollments.length;
      const enteredTotal = totalEnrollments - counts.NOT_ENTERED;
      return {
        session_number: sessionNumber,
        counts,
        total_enrollments: totalEnrollments,
        entered_total: enteredTotal,
        response_rate: totalEnrollments > 0 ? parseFloat(((enteredTotal / totalEnrollments) * 100).toFixed(1)) : 0,
      };
    });

    const totalEnrollments = enrollments.length * sessionNumbers.length;
    const totalEntered = rows.reduce((sum, row) => sum + row.entered_total, 0);
    return {
      session_numbers: sessionNumbers,
      buckets,
      rows,
      total_enrollments: totalEnrollments,
      total_entered: totalEntered,
      response_rate: totalEnrollments > 0 ? parseFloat(((totalEntered / totalEnrollments) * 100).toFixed(1)) : 0,
    };
  }

  async getCare(filter: DashboardFilterParams, userId: number, roles: string[]): Promise<CarePayload> {
    const csIds = await this.getAccessibleCSIds(userId, roles);

    const [pivot, outcomeBreakdown, milestoneCoverage, atRisk, responseMatrix] = await Promise.all([
      this.getCarePivot(filter, userId, roles),
      this.repo.getCareOutcomeBreakdown(csIds, filter),
      this.repo.getMilestoneCoverage(csIds, filter),
      this.repo.getAtRiskStudents(csIds, filter),
      this.buildCareResponseMatrix(filter, csIds),
    ]);

    return {
      pivot,
      outcome_breakdown: outcomeBreakdown,
      milestone_coverage: milestoneCoverage,
      at_risk: atRisk,
      response_matrix: responseMatrix,
    };
  }

  // ---------------------------------------------------------------------------
  //  TAB 3 — Attendance
  // ---------------------------------------------------------------------------
  async getAttendanceTab(filter: DashboardFilterParams, userId: number, roles: string[]): Promise<AttendancePayload> {
    const csIds = await this.getAccessibleCSIds(userId, roles);
    const granularity = this.resolveGranularity(filter);

    const [stats, trend, byClass] = await Promise.all([
      this.getAttendance(filter, userId, roles),
      this.repo.getAttendanceTrend(csIds, filter, granularity),
      this.repo.getAttendanceByClass(csIds, filter),
    ]);

    return {
      stats,
      trend: { granularity, points: trend },
      by_class: byClass,
    };
  }

  // ---------------------------------------------------------------------------
  //  TAB 4 — Performance & Tasks
  // ---------------------------------------------------------------------------
  async getPerformance(filter: DashboardFilterParams, userId: number, roles: string[]): Promise<PerformancePayload> {
    const csIds = await this.getAccessibleCSIds(userId, roles);
    const canSeeLeaderboard = roles.includes('ADMIN') || roles.includes('MANAGE');

    const [tasks, tasksByType, completion] = await Promise.all([
      this.repo.getTasksOverview(csIds, filter.cs_id),
      this.repo.getTasksByType(csIds, filter.cs_id),
      this.repo.getTaskCompletion(csIds, filter.cs_id),
    ]);

    const leaderboard = canSeeLeaderboard
      ? await this.repo.getCSLeaderboard(csIds, filter)
      : [];

    return {
      tasks,
      tasks_by_type: tasksByType,
      task_completion: completion,
      cs_leaderboard: leaderboard,
    };
  }
}
