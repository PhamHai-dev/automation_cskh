import { DashboardRepository } from './dashboard.repository';
import { DashboardFilterParams, EnrollmentSummaryStats, AttendanceStats, CarePivotMatrix, TasksOverviewStats } from './dashboard.types';
import { CareLogOutcome } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { AppError } from '../../middlewares/error.middleware';

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
}
