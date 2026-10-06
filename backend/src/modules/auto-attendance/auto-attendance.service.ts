import { AutoAttendanceRepository } from './auto-attendance.repository';
import {
  AutoAttendanceCycleResult,
  AutoAttendanceSettings,
  DEFAULT_AUTO_ATTENDANCE_DELAY_MINUTES,
  UpdateAutoAttendanceSettingsDTO,
} from './auto-attendance.types';
import {
  isDateInSchedule,
  normalizeSchedulePattern,
  normalizeScheduleTime,
  parseSchedulePattern,
} from '../../shared/schedule/schedule-pattern';
import { handleAttendanceEvent } from '../automation/automation-trigger.service';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('AutoAttendanceService');

function toDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class AutoAttendanceService {
  constructor(private readonly repository = new AutoAttendanceRepository()) {}

  async getSettings(): Promise<AutoAttendanceSettings> {
    const setting = await this.repository.findDelaySetting();
    if (!setting) {
      return {
        delay_minutes: DEFAULT_AUTO_ATTENDANCE_DELAY_MINUTES,
        updated_at: new Date(0),
        updated_by_id: null,
      };
    }

    return {
      delay_minutes: this.readDelay(setting.value),
      updated_at: setting.updated_at,
      updated_by_id: setting.updated_by_id,
    };
  }

  async updateSettings(
    dto: UpdateAutoAttendanceSettingsDTO,
    updatedById: number,
  ): Promise<AutoAttendanceSettings> {
    const setting = await this.repository.upsertDelaySetting(dto.delay_minutes, updatedById);

    return {
      delay_minutes: this.readDelay(setting.value),
      updated_at: setting.updated_at,
      updated_by_id: setting.updated_by_id,
    };
  }

  /**
   * Process a single auto-attendance check cycle for all active schedules.
   * Runs idempotently: one (class_schedule_id, session_date) is only processed once.
   */
  async processAutoAttendance(now: Date = new Date(), retryFailed = false): Promise<AutoAttendanceCycleResult> {
    const settings = await this.getSettings();
    const delayMinutes = settings.delay_minutes ?? DEFAULT_AUTO_ATTENDANCE_DELAY_MINUTES;

    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();
    const sessionDate = new Date(Date.UTC(year, month, date));
    const sessionDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

    const activeSchedules = await this.repository.findActiveSchedules();

    let processedCount = 0;
    let attendedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let issuesCreated = 0;

    for (const schedule of activeSchedules) {
      // 1. Check schedule pattern (compact Vietnamese format: 246, 35CN, LKCD...)
      let pattern;
      try {
        pattern = parseSchedulePattern(schedule.schedule_pattern);
      } catch (err) {
        log.warn(`Invalid schedule_pattern="${schedule.schedule_pattern}" on schedule #${schedule.id}`);
        continue;
      }

      if (pattern.kind === 'MANUAL_ONLY') {
        // LKCD is manual-only attendance
        continue;
      }

      if (!isDateInSchedule(pattern, now)) {
        // Today is not a class day for this schedule
        continue;
      }

      // 2. Filter students in class who are active and currently within their study period (start_date -> end_date)
      const eligibleEnrollmentClasses = schedule.class.enrollment_classes.filter((ec) => {
        if (ec.status !== 'ACTIVE' || ec.enrollment.status !== 'STUDYING') {
          return false;
        }
        if (ec.enrollment.start_date) {
          const startDateStr = toDateString(ec.enrollment.start_date);
          if (startDateStr > sessionDateStr) {
            return false;
          }
        }
        if (ec.enrollment.end_date) {
          const endDateStr = toDateString(ec.enrollment.end_date);
          if (endDateStr < sessionDateStr) {
            return false;
          }
        }
        return true;
      });

      // 3. Check start_time (Rule: "Thiếu giờ học thì không tự điểm danh; hệ thống tạo SCHEDULE_DATA_ISSUE cho CS phụ trách")
      if (!schedule.start_time || !schedule.start_time.trim()) {
        const existingExec = await this.repository.findExecution(schedule.id, sessionDate);
        if (!existingExec) {
          await this.repository.createExecution({
            class_schedule_id: schedule.id,
            session_date: sessionDate,
            scheduled_run_at: now,
            status: 'SKIPPED',
            attendance_count: 0,
            error_message: 'Thiếu giờ học (start_time)',
          });

          for (const ec of eligibleEnrollmentClasses) {
            const csId = ec.enrollment.cs_id || 1;
            const idempotencyKey = `SCHEDULE_DATA_ISSUE_${schedule.id}_${ec.enrollment.id}_${sessionDateStr}`;
            await this.repository.upsertScheduleIssueTask({
              enrollment_id: ec.enrollment.id,
              assigned_to_id: csId,
              title: `Lớp ${schedule.class.class_name} thiếu giờ học`,
              note: `Lịch học "${schedule.schedule_pattern}" của lớp "${schedule.class.class_name}" thiếu giờ học (start_time) nên hệ thống không thể tự động điểm danh ngày ${sessionDateStr}.`,
              idempotency_key: idempotencyKey,
            });
            issuesCreated++;
          }
          skippedCount++;
        }
        continue;
      }

      // 4. Calculate scheduledRunAt (start_time + delay_minutes)
      let normalizedTime: string;
      try {
        normalizedTime = normalizeScheduleTime(schedule.start_time);
      } catch (err) {
        log.warn(`Invalid start_time="${schedule.start_time}" on schedule #${schedule.id}`);
        continue;
      }

      const [startHour, startMin] = normalizedTime.split(':').map(Number);
      const scheduledStart = new Date(now);
      scheduledStart.setHours(startHour, startMin, 0, 0);
      const scheduledRunAt = new Date(scheduledStart.getTime() + delayMinutes * 60 * 1000);

      // Has it reached the execution time yet?
      if (now.getTime() < scheduledRunAt.getTime()) {
        continue;
      }

      // 5. Idempotency: "Một (class_schedule_id, session_date) chỉ được xử lý một lần"
      const existingExec = await this.repository.findExecution(schedule.id, sessionDate);
      if (existingExec && (!retryFailed || existingExec.status !== 'FAILED')) {
        continue;
      }

      // 6. Claim a failed execution atomically, or create the first execution.
      let execution;
      if (existingExec) {
        const claim = await this.repository.claimFailedExecution(existingExec.id);
        if (claim.count !== 1) continue;
        execution = existingExec;
      } else {
        try {
          execution = await this.repository.createExecution({
            class_schedule_id: schedule.id,
            session_date: sessionDate,
            scheduled_run_at: scheduledRunAt,
            status: 'PROCESSING',
          });
        } catch (err: any) {
          // Only a unique-constraint race means another worker owns this execution.
          if (err.code === 'P2002') continue;
          throw err;
        }
      }

      // 7. Check if class has active eligible enrollments
      if (eligibleEnrollmentClasses.length === 0) {
        await this.repository.updateExecution(execution.id, {
          status: 'SKIPPED',
          error_message: 'Không có học viên đang học và trong hạn học trong lớp',
          completed_at: new Date(),
        });
        skippedCount++;
        continue;
      }

      // 8. Execute attendance marking
      try {
        const actor = await this.repository.ensureSystemActor();
        const session = await this.repository.findOrCreateClassSession(
          schedule.class_id,
          schedule.id,
          sessionDate,
          actor.id,
        );

        let classAttendedCount = 0;
        const createdAttendanceIds: number[] = [];

        for (const ec of eligibleEnrollmentClasses) {
          // Rule: "chỉ điền ô trống cho Enrollment STUDYING và EnrollmentClass ACTIVE còn hạn học"
          const existingAtt = await this.repository.findExistingAttendance(ec.id, session.id);
          if (existingAtt) {
            continue;
          }

          const att = await this.repository.createAttendance({
            enrollment_class_id: ec.id,
            class_session_id: session.id,
            status: 'ATTENDED',
            session_count: 1,
            source: 'AUTO_SCHEDULE',
            created_by_id: actor.id,
          });

          classAttendedCount++;
          createdAttendanceIds.push(att.id);
        }

        await this.repository.updateExecution(execution.id, {
          status: 'COMPLETED',
          attendance_count: classAttendedCount,
          completed_at: new Date(),
        });

        // Trigger automation deliveries for created attendances
        for (const id of createdAttendanceIds) {
          handleAttendanceEvent(id).catch((err: any) =>
            log.error('Automation trigger failed (autoAttendance)', { attendanceId: id, error: err.message }),
          );
        }

        attendedCount += classAttendedCount;
        processedCount++;
      } catch (err: any) {
        log.error(`Auto attendance failed for schedule #${schedule.id}`, { error: err.message });
        await this.repository.updateExecution(execution.id, {
          status: 'FAILED',
          error_message: err instanceof Error ? err.message : String(err),
          completed_at: new Date(),
        });
        failedCount++;
      }
    }

    return {
      processed_schedules: processedCount,
      attended_count: attendedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      issues_created: issuesCreated,
    };
  }

  private readDelay(value: unknown): number {
    return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 1440
      ? Number(value)
      : DEFAULT_AUTO_ATTENDANCE_DELAY_MINUTES;
  }
}
