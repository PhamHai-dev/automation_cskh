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
  HomeDashboardPayload,
  HomeTodayTaskItem,
  HomeUpcomingSessionItem,
  SparklinePoint,
  GlobalSearchPayload,
} from './dashboard.types';
import { CareLogOutcome, AttendanceStatus } from '@prisma/client';
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

  // ---------------------------------------------------------------------------
  //  Command Center Home: GET /api/v1/dashboard/home
  // ---------------------------------------------------------------------------
  async getHome(userId: number, roles: string[]): Promise<HomeDashboardPayload> {
    const csIds = await this.getAccessibleCSIds(userId, roles);

    const now = new Date();
    const todayStr = formatLocalYMD(now);
    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayStr = formatLocalYMD(yesterdayDate);

    // 7-day window (including today): d-6 .. d0
    const last7Dates: string[] = [];
    const last7EndOfDay: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      last7Dates.push(formatLocalYMD(d));
      last7EndOfDay.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
    }

    const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 23, 59, 59, 999);
    const sevenDaysAgoMidnight = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 7));

    const raw = await this.repo.getHomeRawData(csIds, sevenDaysAgoMidnight, sevenDaysAgoMidnight);

    // 1. KPI: total_students (unique students in scope)
    const studentFirstSeen = new Map<number, number>();
    for (const e of raw.enrollmentsForStudents) {
      const ts = e.created_at.getTime();
      const prev = studentFirstSeen.get(e.student_id);
      if (prev === undefined || ts < prev) {
        studentFirstSeen.set(e.student_id, ts);
      }
    }
    const currentStudents = studentFirstSeen.size;
    let prevMonthStudents = 0;
    for (const ts of studentFirstSeen.values()) {
      if (ts <= thirtyDaysAgo.getTime()) prevMonthStudents += 1;
    }
    const studentDelta = calcPercentDelta(currentStudents, prevMonthStudents);
    const studentSparkline: SparklinePoint[] = last7Dates.map((dateStr, idx) => {
      const cutoff = last7EndOfDay[idx].getTime();
      let cnt = 0;
      for (const ts of studentFirstSeen.values()) {
        if (ts <= cutoff) cnt += 1;
      }
      return { date: dateStr, value: cnt };
    });

    // 2. KPI: active_classes
    const currentClasses = raw.activeClasses.length;
    const prevMonthClasses = raw.activeClasses.filter((c) => c.created_at.getTime() <= thirtyDaysAgo.getTime()).length;
    const classDelta = calcPercentDelta(currentClasses, prevMonthClasses);
    const classSparkline: SparklinePoint[] = last7Dates.map((dateStr, idx) => {
      const cutoff = last7EndOfDay[idx].getTime();
      const cnt = raw.activeClasses.filter((c) => c.created_at.getTime() <= cutoff).length;
      return { date: dateStr, value: cnt };
    });

    // 3. KPI: attendance_today
    const attByDate = new Map<string, { total: number; attended: number }>();
    let total7d = 0;
    let attended7d = 0;
    for (const a of raw.recentAttendances) {
      const dStr = formatSessionDateYMD(a.class_session.session_date);
      if (!last7Dates.includes(dStr)) continue;
      const cur = attByDate.get(dStr) || { total: 0, attended: 0 };
      cur.total += 1;
      total7d += 1;
      if (a.status === AttendanceStatus.ATTENDED) {
        cur.attended += 1;
        attended7d += 1;
      }
      attByDate.set(dStr, cur);
    }

    const todayBucket = attByDate.get(todayStr);
    const yesterdayBucket = attByDate.get(yesterdayStr);
    const todayRate =
      todayBucket && todayBucket.total > 0
        ? round1((todayBucket.attended / todayBucket.total) * 100)
        : total7d > 0
          ? round1((attended7d / total7d) * 100)
          : 0;
    const yesterdayRate =
      yesterdayBucket && yesterdayBucket.total > 0
        ? round1((yesterdayBucket.attended / yesterdayBucket.total) * 100)
        : todayRate;
    const attDelta = round1(todayRate - yesterdayRate);
    const attSparkline: SparklinePoint[] = last7Dates.map((dateStr) => {
      const b = attByDate.get(dateStr);
      const val = b && b.total > 0 ? round1((b.attended / b.total) * 100) : 0;
      return { date: dateStr, value: val };
    });

    // 4. KPI: pending_tasks
    const tasksCreatedByDate = new Map<string, number>();
    for (const t of raw.recentTasksCreated) {
      const dStr = formatLocalYMD(t.created_at);
      tasksCreatedByDate.set(dStr, (tasksCreatedByDate.get(dStr) || 0) + 1);
    }
    const createdToday = tasksCreatedByDate.get(todayStr) || 0;
    const createdYesterday = tasksCreatedByDate.get(yesterdayStr) || 0;
    const taskDelta = createdToday - createdYesterday;
    const taskSparkline: SparklinePoint[] = last7Dates.map((dateStr) => ({
      date: dateStr,
      value: tasksCreatedByDate.get(dateStr) || 0,
    }));

    // 5. Today Tasks (max 6, PENDING, URGENT/HIGH first, then due_at ASC)
    const priorityRank: Record<string, number> = {
      URGENT: 0,
      HIGH: 1,
      NORMAL: 2,
      LOW: 3,
    };
    const sortedTasks = [...raw.pendingTasksList]
      .sort((a, b) => {
        const pa = priorityRank[a.priority] ?? 9;
        const pb = priorityRank[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        const da = a.due_at ? a.due_at.getTime() : Number.MAX_SAFE_INTEGER;
        const db = b.due_at ? b.due_at.getTime() : Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return b.created_at.getTime() - a.created_at.getTime();
      })
      .slice(0, 6);

    const today_tasks: HomeTodayTaskItem[] = sortedTasks.map((t) => {
      const studentName = t.enrollment.student.full_name;
      const firstClass = t.enrollment.enrollment_classes[0]?.class?.class_name;
      const pkgLabel = t.enrollment.package?.name || t.enrollment.package?.code;
      const contextSuffix = firstClass
        ? `Lớp ${firstClass}`
        : pkgLabel
          ? `Gói ${pkgLabel}`
          : `Hồ sơ #${t.enrollment_id}`;
      const subtitle = `Học viên ${studentName} - ${contextSuffix}`;

      const { badge_label, badge_variant } = resolveTaskBadge(t.priority, t.type);
      const refTime = t.due_at || t.created_at;
      const time_label = `${pad2(refTime.getHours())}:${pad2(refTime.getMinutes())}`;
      const date_label = resolveTaskDateLabel(t.due_at, now, todayStr);

      return {
        id: t.id,
        title: t.title || defaultTaskTitle(t.type, studentName),
        subtitle,
        type: t.type,
        priority: t.priority,
        status: t.status,
        badge_label,
        badge_variant,
        due_at: t.due_at ? t.due_at.toISOString() : null,
        time_label,
        date_label,
        enrollment_id: t.enrollment_id,
        student_id: t.enrollment.student_id,
        student_name: studentName,
      };
    });

    // 6. Upcoming Sessions (max 6, status != CANCELLED, prefer session_date >= today)
    const futureOrToday = raw.candidateSessions.filter(
      (s) => formatSessionDateYMD(s.session_date) >= todayStr,
    );
    const pastRecent = raw.candidateSessions.filter(
      (s) => formatSessionDateYMD(s.session_date) < todayStr,
    );
    const pickedSessions =
      futureOrToday.length >= 6
        ? futureOrToday.slice(0, 6)
        : [
            ...pastRecent.slice(-Math.max(0, 6 - futureOrToday.length)),
            ...futureOrToday,
          ].slice(0, 6);

    pickedSessions.sort((a, b) => {
      const da = formatSessionDateYMD(a.session_date);
      const db = formatSessionDateYMD(b.session_date);
      if (da !== db) return da.localeCompare(db);
      const sa = normalizeHHMM(a.start_time || a.class_schedule?.start_time) || '08:00';
      const sb = normalizeHHMM(b.start_time || b.class_schedule?.start_time) || '08:00';
      return sa.localeCompare(sb);
    });

    const nowHHMM = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

    const upcoming_sessions: HomeUpcomingSessionItem[] = pickedSessions.map((s) => {
      const sessionDate = formatSessionDateYMD(s.session_date);
      const startTime = normalizeHHMM(s.start_time || s.class_schedule?.start_time) || '08:00';
      const durationMin = s.class_schedule?.duration_minutes || 90;
      const endTime = normalizeHHMM(s.end_time) || addMinutesToHHMM(startTime, durationMin);
      const modelType = formatClassModel(s.class.model_type);
      const mainClassTeacher = s.class.class_teachers[0]?.teacher?.name || null;
      const teacherName =
        (s.teacher_id ? raw.sessionTeacherNameMap.get(s.teacher_id) : null) ||
        mainClassTeacher ||
        null;

      const subtitleParts: string[] = [];
      subtitleParts.push(teacherName ? `GV: ${teacherName}` : 'Chưa phân công GV');
      subtitleParts.push(`Mô hình ${modelType}`);
      if (s.class.level) subtitleParts.push(`Trình độ ${s.class.level}`);

      const { display_status, display_status_label } = resolveSessionDisplayStatus(
        s.status,
        sessionDate,
        todayStr,
        startTime,
        endTime,
        nowHHMM,
      );

      return {
        session_id: s.id,
        class_id: s.class_id,
        class_name: s.class.class_name,
        class_code: s.class.class_code,
        level: s.class.level,
        model_type: modelType,
        teacher_name: teacherName,
        subtitle: subtitleParts.join(' • '),
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        display_status,
        display_status_label,
        student_count: s.class.enrollment_classes.length,
      };
    });

    return {
      kpis: {
        total_students: {
          value: currentStudents,
          delta: studentDelta,
          delta_unit: 'percent',
          comparison_label: 'so với tháng trước',
          sparkline: studentSparkline,
        },
        active_classes: {
          value: currentClasses,
          delta: classDelta,
          delta_unit: 'percent',
          comparison_label: 'so với tháng trước',
          sparkline: classSparkline,
        },
        attendance_today: {
          value: todayRate,
          delta: attDelta,
          delta_unit: 'percent',
          comparison_label: 'so với hôm qua',
          sparkline: attSparkline,
        },
        pending_tasks: {
          value: raw.pendingTaskCount,
          delta: taskDelta,
          delta_unit: 'count',
          comparison_label: 'so với hôm qua',
          sparkline: taskSparkline,
        },
      },
      today_tasks,
      upcoming_sessions,
    };
  }

  // ---------------------------------------------------------------------------
  //  Header Global Search: GET /api/v1/dashboard/search
  // ---------------------------------------------------------------------------
  async globalSearch(
    rawQuery: string | undefined,
    rawLimit: number | undefined,
    userId: number,
    roles: string[],
  ): Promise<GlobalSearchPayload> {
    const q = (rawQuery || '').trim();
    if (q.length < 1) {
      return { students: [], classes: [], teachers: [] };
    }

    const limit = Math.min(10, Math.max(1, Number.isFinite(rawLimit) && rawLimit ? Math.floor(rawLimit) : 5));
    const isAdmin = roles.includes('ADMIN');
    const isManageOrCS = roles.includes('MANAGE') || roles.includes('CS');
    const isTeacherOnly = !isAdmin && !isManageOrCS && roles.includes('TEACHER');

    let scope: { mode: 'ALL' } | { mode: 'CS'; csIds: number[] } | { mode: 'TEACHER'; classIds: number[] };
    if (isAdmin) {
      scope = { mode: 'ALL' };
    } else if (isManageOrCS) {
      const csIds = (await this.getAccessibleCSIds(userId, roles)) || [];
      scope = { mode: 'CS', csIds };
    } else if (isTeacherOnly) {
      const classIds = await this.repo.getTeacherAssignedClassIds(userId);
      scope = { mode: 'TEACHER', classIds };
    } else {
      throw new AppError(403, 'Bạn không có quyền sử dụng tìm kiếm');
    }

    const [rawStudents, rawClasses, rawTeachers] = await Promise.all([
      this.repo.searchStudents(q, limit, scope),
      this.repo.searchClasses(q, limit, scope),
      isTeacherOnly ? Promise.resolve([]) : this.repo.searchTeachers(q, limit, !isAdmin),
    ]);

    const students = rawStudents.map((s) => {
      const parts: string[] = [];
      if (s.external_id) parts.push(`Mã: ${s.external_id}`);
      if (s.phone) parts.push(`SĐT: ${s.phone}`);
      const pkg = s.enrollments[0]?.package;
      if (pkg?.name || pkg?.code) parts.push(`Gói: ${pkg.name || pkg.code}`);
      return {
        id: s.id,
        full_name: s.full_name,
        external_id: s.external_id,
        phone: s.phone,
        subtitle: parts.length > 0 ? parts.join(' • ') : `Học viên #${s.id}`,
      };
    });

    const classes = rawClasses.map((c) => {
      const parts: string[] = [];
      if (c.class_code) parts.push(`Mã: ${c.class_code}`);
      if (c.level) parts.push(`Trình độ ${c.level}`);
      const mainTeacher = c.class_teachers[0]?.teacher?.name;
      if (mainTeacher) parts.push(`GV: ${mainTeacher}`);
      parts.push(`Mô hình ${formatClassModel(c.model_type)}`);
      return {
        id: c.id,
        class_name: c.class_name,
        class_code: c.class_code,
        level: c.level,
        subtitle: parts.join(' • '),
      };
    });

    const teachers = rawTeachers.map((t) => {
      const typeLabel =
        t.teacher_type === 'JAPANESE'
          ? 'GV Bản ngữ (Nhật)'
          : t.teacher_type === 'VIETNAMESE'
            ? 'GV Việt Nam'
            : 'Giáo viên';
      return {
        id: t.id,
        name: t.name,
        code: t.code,
        teacher_type: t.teacher_type,
        subtitle: `${t.code} • ${typeLabel}`,
      };
    });

    return { students, classes, teachers };
  }
}

// ---------------------------------------------------------------------------
//  Private formatting helpers for Home & Global Search
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatSessionDateYMD(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function round1(n: number): number {
  return parseFloat(n.toFixed(1));
}

function calcPercentDelta(current: number, previous: number): number {
  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }
  return round1(((current - previous) / previous) * 100);
}

function resolveTaskBadge(
  priority: string,
  type: string,
): { badge_label: 'Ưu tiên' | 'Đang xử lý' | 'Chờ xử lý'; badge_variant: 'danger' | 'info' | 'warning' } {
  if (priority === 'URGENT' || priority === 'HIGH' || type === 'HOT_ISSUE') {
    return { badge_label: 'Ưu tiên', badge_variant: 'danger' };
  }
  if (type === 'CALLBACK' || type === 'FOLLOW_UP') {
    return { badge_label: 'Đang xử lý', badge_variant: 'info' };
  }
  return { badge_label: 'Chờ xử lý', badge_variant: 'warning' };
}

function resolveTaskDateLabel(dueAt: Date | null, now: Date, todayStr: string): string {
  if (!dueAt) return 'Hôm nay';
  const dueStr = formatLocalYMD(dueAt);
  if (dueAt.getTime() < now.getTime() && dueStr < todayStr) {
    return 'Quá hạn';
  }
  if (dueStr === todayStr) {
    return dueAt.getTime() < now.getTime() ? 'Quá hạn' : 'Hôm nay';
  }
  return `${pad2(dueAt.getDate())}/${pad2(dueAt.getMonth() + 1)}`;
}

function defaultTaskTitle(type: string, studentName: string): string {
  switch (type) {
    case 'CALLBACK':
      return `Gọi lại tư vấn học viên ${studentName}`;
    case 'HOT_ISSUE':
      return `Xử lý phản hồi khẩn của ${studentName}`;
    case 'FOLLOW_UP':
      return `Chăm sóc định kỳ học viên ${studentName}`;
    case 'AUTO_ATTENDANCE':
      return `Kiểm tra điểm danh tự động cho ${studentName}`;
    case 'SCHEDULE_DATA_ISSUE':
      return `Rà soát dữ liệu lịch học của ${studentName}`;
    default:
      return `Công việc chăm sóc ${studentName}`;
  }
}

function formatClassModel(modelType: string): '1:1' | '1:2' | '1:n' {
  if (modelType === 'ONE_TO_ONE' || modelType === '1:1') return '1:1';
  if (modelType === 'ONE_TO_TWO' || modelType === '1:2') return '1:2';
  if (modelType === 'ONE_TO_N' || modelType === '1:n') return '1:n';
  return '1:1';
}

function normalizeHHMM(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${pad2(hh)}:${pad2(mm)}`;
}

function addMinutesToHHMM(startHHMM: string, durationMinutes: number): string {
  const [hStr, mStr] = startHHMM.split(':');
  const totalMinutes = (parseInt(hStr, 10) || 8) * 60 + (parseInt(mStr, 10) || 0) + durationMinutes;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${pad2(endH)}:${pad2(endM)}`;
}

function resolveSessionDisplayStatus(
  status: string,
  sessionDate: string,
  todayStr: string,
  startTime: string,
  endTime: string,
  nowHHMM: string,
): {
  display_status: 'ONGOING' | 'UPCOMING' | 'COMPLETED';
  display_status_label: 'Đang diễn ra' | 'Sắp diễn ra' | 'Đã hoàn thành';
} {
  if (status === 'COMPLETED') {
    return { display_status: 'COMPLETED', display_status_label: 'Đã hoàn thành' };
  }
  if (sessionDate === todayStr && nowHHMM >= startTime && nowHHMM <= endTime) {
    return { display_status: 'ONGOING', display_status_label: 'Đang diễn ra' };
  }
  return { display_status: 'UPCOMING', display_status_label: 'Sắp diễn ra' };
}
