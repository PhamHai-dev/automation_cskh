/**
 * Automation Trigger Service — Core automation engine.
 *
 * Called after attendance is marked/updated/bulk-marked.
 * Resolves matching AutomationSteps, creates deliveries with rendered templates,
 * and enqueues BullMQ delayed jobs.
 */

import { prisma } from '../../prisma/client';
import { automationRepository } from './automation-repository';
import { render, resolveVars } from './automation-renderer';
import { enqueueDelivery } from './automation-bullmq-adapter';
import { createLogger } from '../../shared/logger/logger';
import type { AttendanceStatus, AutomationTriggerEvent } from '@prisma/client';

const log = createLogger('AutomationTrigger');

// Map AttendanceStatus → AutomationTriggerEvent (they share the same values)
function attendanceToTriggerEvent(status: AttendanceStatus): AutomationTriggerEvent {
  return status as AutomationTriggerEvent;
}

export interface TriggerResult {
  attendanceId: number;
  deliveriesCreated: number;
  deliveriesSkipped: number;
  details: Array<{
    stepId: number;
    workflowName: string;
    status: 'CREATED' | 'SKIPPED_NO_LINK' | 'SKIPPED_INACTIVE' | 'SKIPPED_DUPLICATE' | 'CANCELLED';
    reason?: string;
  }>;
}

/**
 * Handle attendance event — main entry point.
 * Called after markAttendance / bulkMarkAttendance / updateAttendance.
 */
export async function handleAttendanceEvent(attendanceId: number): Promise<TriggerResult> {
  const result: TriggerResult = { attendanceId, deliveriesCreated: 0, deliveriesSkipped: 0, details: [] };

  try {
    // 1. Load attendance with full context
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        enrollment_class: {
          include: {
            enrollment: {
              include: {
                student: { select: { id: true, full_name: true, phone: true } },
                cs: { select: { id: true, name: true } },
                package: { select: { name: true } },
                enrollment_classes: {
                  include: {
                    class: { select: { id: true, class_name: true } },
                  },
                },
              },
            },
            class: { select: { id: true, class_name: true } },
          },
        },
        class_session: {
          include: {
            class: {
              include: {
                class_teachers: {
                  include: { teacher: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!attendance) {
      log.warn('Attendance not found', { attendanceId });
      return result;
    }

    const enrollment = attendance.enrollment_class.enrollment;

    // 2. Check auto_message_enabled
    if (!enrollment.auto_message_enabled) {
      log.info('Auto-message disabled for enrollment', { enrollmentId: enrollment.id });
      return result;
    }

    // 3. Calculate enrollment session number (count of past attended sessions + 1)
    const sessionNumber = await resolveEnrollmentSessionNumber(
      enrollment.id,
      attendance.class_session.session_date,
    );

    // 4. Find matching steps
    const triggerEvent = attendanceToTriggerEvent(attendance.status);
    const matchingSteps = await automationRepository.findMatchingSteps(
      enrollment.id,
      sessionNumber,
      triggerEvent,
    );

    if (matchingSteps.length === 0) {
      log.info('No matching steps', {
        enrollmentId: enrollment.id,
        sessionNumber,
        triggerEvent,
      });
      return result;
    }

    const student = enrollment.student;
    const cs = enrollment.cs;
    const className = attendance.enrollment_class.class?.class_name ?? attendance.class_session.class?.class_name;
    const teacher = attendance.class_session.class?.class_teachers?.[0]?.teacher;
    const totalSessions = enrollment.total_sessions;

    // 5. For each matching step → resolve target + create delivery
    for (const step of matchingSteps) {
      // Check idempotency (delivery already exists for this attendance+step)
      const existing = await automationRepository.findDeliveryForIdempotency(attendanceId, step.id);
      if (existing) {
        result.deliveriesSkipped++;
        result.details.push({
          stepId: step.id,
          workflowName: step.workflow.name,
          status: 'SKIPPED_DUPLICATE',
          reason: 'Delivery already exists',
        });
        continue;
      }

      // Resolve target
      const target = await resolveDeliveryTarget(step, enrollment.id, enrollment.cs_id);
      if (!target) {
        result.deliveriesSkipped++;
        result.details.push({
          stepId: step.id,
          workflowName: step.workflow.name,
          status: 'SKIPPED_NO_LINK',
          reason: 'No linked Zalo account / not friend',
        });
        continue;
      }

      // Resolve remaining sessions
      const remainingSessions = Math.max(0, totalSessions - sessionNumber);

      // Render template
      const vars = resolveVars({
        studentName: student.full_name,
        studentPhone: student.phone ?? undefined,
        packageName: enrollment.package?.name ?? undefined,
        sessionNumber,
        className,
        teacherName: teacher?.name ?? undefined,
        attendanceStatus: attendance.status,
        remainingSessions,
        csName: cs.name ?? undefined,
      });

      const renderedContent = render(step.message_content, vars);

      // Create delivery
      const scheduledAt = new Date(Date.now());
      const delivery = await automationRepository.createDelivery({
        enrollment_id: enrollment.id,
        attendance_id: attendanceId,
        automation_step_id: step.id,
        zalo_account_id: target.zaloAccountId,
        zalo_group_id: target.zaloGroupId,
        scheduled_at: scheduledAt,
        rendered_content: renderedContent,
        variables_snapshot: vars as Record<string, any>,
      });

      // Enqueue BullMQ job
      const queueJobId = await enqueueDelivery(
        {
          deliveryId: delivery.id,
          automationStepId: step.id,
          enrollmentId: enrollment.id,
          attendanceId,
        },
        step.delay_minutes,
      );

      // Update delivery with queue_job_id
      if (queueJobId) {
        await automationRepository.updateDeliveryStatus(delivery.id, 'QUEUED', { queue_job_id: queueJobId });
      }

      result.deliveriesCreated++;
      result.details.push({
        stepId: step.id,
        workflowName: step.workflow.name,
        status: 'CREATED',
      });

      log.info('Delivery created', {
        deliveryId: delivery.id,
        stepId: step.id,
        workflowId: step.workflow_id,
        enrollmentId: enrollment.id,
        studentName: student.full_name,
        delayMinutes: step.delay_minutes,
      });
    }
  } catch (err: any) {
    log.error('handleAttendanceEvent error', { attendanceId, error: err.message, stack: err.stack });
  }

  return result;
}

/**
 * Cancel pending deliveries when attendance is updated/deleted.
 */
export async function cancelPendingDeliveries(attendanceId: number): Promise<number> {
  const result = await automationRepository.cancelDeliveriesForAttendance(attendanceId);
  if (result.count > 0) {
    log.info('Cancelled pending deliveries', { attendanceId, count: result.count });
  }
  return result.count;
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Calculate enrollment session number: count of distinct class_sessions with attendance
 * before the given date + 1.
 * Sessions are counted across all enrollment_classes (cross-class = continuous numbering).
 */
async function resolveEnrollmentSessionNumber(
  enrollmentId: number,
  sessionDate: Date,
): Promise<number> {
  const count = await prisma.attendance.count({
    where: {
      enrollment_class: { enrollment_id: enrollmentId },
      class_session: { session_date: { lt: sessionDate } },
    },
  });
  return count + 1;
}

/**
 * Resolve delivery target (which Zalo nick to send from).
 *
 * ZALO_PERSONAL: Find ZaloContactRelation where:
 *   - student_id matches enrollment's student
 *   - relation_status = FRIEND
 *   - Prefer nick owned by enrollment.cs_id
 *   - Fallback: any FRIEND nick
 *
 * ZALO_GROUP: Use step.target_group_id → verify group exists + account active.
 */
async function resolveDeliveryTarget(
  step: { channel: string; target_group_id: number | null; workflow: { owner_cs_id: number } },
  enrollmentId: number,
  csId: number,
): Promise<{ zaloAccountId: number; zaloGroupId?: number } | null> {
  // Load enrollment student_id
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { student_id: true },
  });
  if (!enrollment) return null;

  if (step.channel === 'ZALO_GROUP') {
    if (!step.target_group_id) return null;
    // Verify group exists and its account is active
    const group = await prisma.zaloGroup.findUnique({
      where: { id: step.target_group_id },
      select: { zalo_account_id: true, zalo_group_id: true },
    });
    if (!group) return null;
    const account = await prisma.zaloAccount.findUnique({
      where: { id: group.zalo_account_id },
      select: { status: true },
    });
    if (!account || account.status !== 'ACTIVE') return null;
    return { zaloAccountId: group.zalo_account_id, zaloGroupId: step.target_group_id };
  }

  // ZALO_PERSONAL: resolve via ZaloContactRelation
  // Priority: nick owned by csId + FRIEND
  const preferredRelation = await prisma.zaloContactRelation.findFirst({
    where: {
      student_id: enrollment.student_id,
      zalo_account: { cs_id: csId },
      relation_status: 'FRIEND',
    },
  });
  if (preferredRelation) {
    return { zaloAccountId: preferredRelation.zalo_account_id };
  }

  // Fallback: any nick that is FRIEND
  const anyRelation = await prisma.zaloContactRelation.findFirst({
    where: {
      student_id: enrollment.student_id,
      relation_status: 'FRIEND',
    },
  });
  if (anyRelation) {
    return { zaloAccountId: anyRelation.zalo_account_id };
  }

  return null; // No friend link → SKIPPED_NOT_FRIEND
}
