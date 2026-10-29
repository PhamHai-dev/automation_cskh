/**
 * Automation Repository — Prisma access layer for AutomationWorkflow, AutomationStep, AutomationEnrollment, MessageDelivery.
 */

import { prisma } from '../../prisma/client';
import type { Prisma, AutomationTriggerEvent, AutomationChannel } from '@prisma/client';

export class AutomationRepository {
  // ─── Workflow CRUD ───────────────────────────────────────────────────

  async createWorkflow(data: { name: string; description?: string; owner_cs_id: number }) {
    return prisma.automationWorkflow.create({ data });
  }

  async findWorkflowById(id: number) {
    return prisma.automationWorkflow.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        steps: {
          orderBy: [{ session_number: 'asc' }, { trigger_event: 'asc' }],
          include: { _count: { select: { deliveries: true } } },
        },
        _count: { select: { enrollments: true, steps: true } },
      },
    });
  }

  async listWorkflows(
    ownerCsId?: number,
    options?: { active?: boolean; search?: string; page?: number; limit?: number; workflowIds?: number[] },
  ) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const where: Prisma.AutomationWorkflowWhereInput = {
      ...(ownerCsId !== undefined ? { owner_cs_id: ownerCsId } : {}),
      ...(options?.workflowIds !== undefined ? { id: { in: options.workflowIds } } : {}),
      ...(options?.active !== undefined ? { active: options.active } : {}),
      ...(options?.search ? { name: { contains: options.search } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.automationWorkflow.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true } },
          _count: { select: { enrollments: true, steps: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.automationWorkflow.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateWorkflow(id: number, data: { name?: string; description?: string; active?: boolean }) {
    return prisma.automationWorkflow.update({ where: { id }, data });
  }

  async deleteWorkflow(id: number) {
    return prisma.automationWorkflow.delete({ where: { id } });
  }

  // ─── Step CRUD ───────────────────────────────────────────────────────

  async createStep(workflowId: number, data: {
    session_number: number;
    trigger_event: AutomationTriggerEvent;
    delay_minutes: number;
    channel: AutomationChannel;
    target_group_id?: number | null;
    message_content: string;
    message_variables: string[];
    active?: boolean;
  }) {
    return prisma.automationStep.create({
      data: { workflow_id: workflowId, ...data },
    });
  }

  async findStepById(stepId: number) {
    return prisma.automationStep.findUnique({
      where: { id: stepId },
      include: { workflow: { select: { id: true, name: true, owner_cs_id: true } } },
    });
  }

  async updateStep(stepId: number, data: Partial<{
    session_number: number;
    trigger_event: AutomationTriggerEvent;
    delay_minutes: number;
    channel: AutomationChannel;
    target_group_id: number | null;
    message_content: string;
    message_variables: string[];
    active: boolean;
  }>) {
    return prisma.automationStep.update({ where: { id: stepId }, data });
  }

  async deleteStep(stepId: number) {
    return prisma.automationStep.delete({ where: { id: stepId } });
  }

  async countDeliveriesForStep(stepId: number): Promise<number> {
    return prisma.messageDelivery.count({
      where: { automation_step_id: stepId },
    });
  }

  // ─── Enrollment (add/remove HV vào workflow) ─────────────────────────

  async addEnrollment(workflowId: number, enrollmentId: number, addedBy: number) {
    return prisma.automationEnrollment.create({
      data: { workflow_id: workflowId, enrollment_id: enrollmentId, added_by: addedBy },
    });
  }

  async removeEnrollment(workflowId: number, enrollmentId: number) {
    return prisma.automationEnrollment.delete({
      where: { workflow_id_enrollment_id: { workflow_id: workflowId, enrollment_id: enrollmentId } },
    });
  }

  async listEnrollments(workflowId: number, csId?: number) {
    return prisma.automationEnrollment.findMany({
      where: {
        workflow_id: workflowId,
        ...(csId !== undefined ? { enrollment: { cs_id: csId } } : {}),
      },
      include: {
        enrollment: {
          include: {
            student: { select: { id: true, full_name: true, phone: true, email: true } },
            cs: { select: { id: true, name: true } },
            package: { select: { id: true, name: true } },
            enrollment_classes: {
              take: 1,
              orderBy: { sequence_no: 'asc' },
              select: {
                id: true,
                class: {
                  select: {
                    id: true,
                    class_code: true,
                    class_name: true,
                    class_teachers: {
                      where: { active: true, role: 'MAIN' },
                      select: {
                        teacher: { select: { id: true, name: true } },
                      },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async listAvailableEnrollments(workflowId: number, options?: { q?: string; csId?: number; page?: number; limit?: number }) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const q = options?.q?.trim() ?? '';

    // IDs already enrolled in this workflow
    const enrolledRows = await prisma.automationEnrollment.findMany({
      where: { workflow_id: workflowId },
      select: { enrollment_id: true },
    });
    const enrolledIds = enrolledRows.map((e) => e.enrollment_id);

    const where: any = {
      ...(enrolledIds.length ? { id: { notIn: enrolledIds } } : {}),
      ...(q ? {
        OR: [
          { student: { full_name: { contains: q } } },
          { student: { phone: { contains: q } } },
          { student: { email: { contains: q } } },
        ],
      } : {}),
      ...(options?.csId ? { cs_id: options.csId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.enrollment.findMany({
        where,
        include: {
          student: { select: { id: true, full_name: true, phone: true, email: true } },
          cs: { select: { id: true, name: true } },
          package: { select: { id: true, name: true } },
          enrollment_classes: {
            take: 1,
            orderBy: { sequence_no: 'asc' },
            select: {
              id: true,
              class: {
                select: {
                  id: true,
                  class_code: true,
                  class_name: true,
                  class_teachers: {
                    where: { active: true, role: 'MAIN' },
                    select: {
                      teacher: { select: { id: true, name: true } },
                    },
                    take: 1,
                  },
                },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.enrollment.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findEnrollmentsByWorkflow(workflowId: number) {
    return prisma.automationEnrollment.findMany({
      where: { workflow_id: workflowId },
      select: { enrollment_id: true },
    });
  }

  // ─── Trigger resolution (core query) ─────────────────────────────────

  /**
   * Find all matching steps for a given enrollment + session_number + trigger_event.
   * Steps must: belong to active workflow, be active, match session & event,
   * and enrollment must be in the workflow's enrollment list.
   */
  async findMatchingSteps(enrollmentId: number, sessionNumber: number, triggerEvent: AutomationTriggerEvent) {
    return prisma.automationStep.findMany({
      where: {
        active: true,
        session_number: sessionNumber,
        trigger_event: triggerEvent,
        workflow: {
          active: true,
          enrollments: { some: { enrollment_id: enrollmentId } },
        },
      },
      include: {
        workflow: {
          select: { id: true, name: true, owner_cs_id: true },
        },
      },
    });
  }

  /**
   * Find all active steps across active workflows for an enrollment and trigger_event.
   * Used by enrollment-wide milestone re-evaluation (S1a/S2c).
   */
  async findActiveStepsForEnrollment(
    enrollmentId: number,
    triggerEvent: AutomationTriggerEvent = 'ATTENDED',
    client: any = prisma,
  ) {
    if (typeof client?.automationStep?.findMany !== 'function') {
      return [];
    }
    const rows = await client.automationStep.findMany({
      where: {
        active: true,
        trigger_event: triggerEvent,
        workflow: {
          active: true,
          enrollments: { some: { enrollment_id: enrollmentId } },
        },
      },
      include: {
        workflow: {
          select: { id: true, name: true, owner_cs_id: true },
        },
      },
      orderBy: [{ session_number: 'asc' }, { id: 'asc' }],
    });
    return Array.isArray(rows) ? rows : [];
  }

  // ─── Delivery ────────────────────────────────────────────────────────

  async createDelivery(
    data: {
      enrollment_id: number;
      attendance_id: number;
      automation_step_id: number;
      zalo_account_id?: number | null;
      zalo_group_id?: number | null;
      line_account_id?: number | null;
      line_group_id?: number | null;
      scheduled_at: Date;
      rendered_content: string;
      variables_snapshot: Record<string, any>;
    },
    client: Pick<typeof prisma, 'messageDelivery'> = prisma,
  ) {
    return client.messageDelivery.create({ data });
  }

  async findDeliveryForIdempotency(
    attendanceId: number,
    automationStepId: number,
    client: Pick<typeof prisma, 'messageDelivery'> = prisma,
  ) {
    return client.messageDelivery.findUnique({
      where: {
        attendance_id_automation_step_id: {
          attendance_id: attendanceId,
          automation_step_id: automationStepId,
        },
      },
    });
  }

  /**
   * Find the canonical milestone occurrence delivery for (enrollment_id, automation_step_id).
   * Milestone identity is (enrollment_id, automation_step_id) because each AutomationStep
   * uniquely encodes (workflow_id, session_number, trigger_event).
   */
  async findDeliveryForMilestoneOccurrence(
    enrollmentId: number,
    automationStepId: number,
    client: any = prisma,
    fallbackAttendanceId?: number,
  ) {
    if (typeof client?.messageDelivery?.findMany === 'function') {
      const rows = await client.messageDelivery.findMany({
        where: {
          enrollment_id: enrollmentId,
          automation_step_id: automationStepId,
        },
        orderBy: { id: 'asc' },
      });
      if (Array.isArray(rows)) {
        if (rows.length === 0) return null;
        return pickCanonicalOccurrence(rows, fallbackAttendanceId);
      }
    }
    if (typeof client?.messageDelivery?.findFirst === 'function') {
      const row = await client.messageDelivery.findFirst({
        where: {
          enrollment_id: enrollmentId,
          automation_step_id: automationStepId,
        },
      });
      if (row) return row;
    }
    if (fallbackAttendanceId !== undefined && typeof client?.messageDelivery?.findUnique === 'function') {
      const byAtt = await this.findDeliveryForIdempotency(fallbackAttendanceId, automationStepId, client);
      if (byAtt) return byAtt;
    }
    return null;
  }

  /**
   * Ordered K7 milestone basis rows for an enrollment: FINAL ATTENDED rows in
   * (session_date, created_at, id) order. The k-th row is the current basis
   * attendance for ordinal session_number = k. Returns an empty array when the
   * client cannot enumerate rows (e.g. mock harness without findMany) —
   * callers must treat that as "basis unavailable".
   */
  async findMilestoneBasisRows(enrollmentId: number, client: any = prisma): Promise<any[]> {
    if (typeof client?.attendance?.findMany !== 'function') {
      return [];
    }
    const rows = await client.attendance.findMany({
      where: {
        enrollment_class: { enrollment_id: enrollmentId },
        status: 'ATTENDED',
        reconciliation_state: { in: ['MATCHED', 'RESOLVED'] },
        deleted_at: null,
      },
      include: {
        class_session: {
          select: {
            session_date: true,
            class: {
              select: {
                class_name: true,
                class_teachers: {
                  where: { active: true },
                  select: { teacher: { select: { name: true } } },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: [{ class_session: { session_date: 'asc' } }, { created_at: 'asc' }, { id: 'asc' }],
    });
    return Array.isArray(rows) ? rows : [];
  }

  async findDeliveriesForEnrollment(
    enrollmentId: number,
    triggerEvent?: AutomationTriggerEvent,
    client: any = prisma,
  ) {
    if (typeof client?.messageDelivery?.findMany !== 'function') {
      return [];
    }
    const rows = await client.messageDelivery.findMany({
      where: {
        enrollment_id: enrollmentId,
        ...(triggerEvent ? { automation_step: { trigger_event: triggerEvent } } : {}),
      },
      include: {
        automation_step: {
          select: {
            id: true,
            workflow_id: true,
            session_number: true,
            trigger_event: true,
            channel: true,
            target_group_id: true,
            message_content: true,
            delay_minutes: true,
            workflow: { select: { id: true, name: true, active: true, owner_cs_id: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    return Array.isArray(rows) ? rows : [];
  }

  async rebindDeliveryBasis(
    deliveryId: number,
    data: {
      attendance_id: number;
      rendered_content?: string;
      variables_snapshot?: Record<string, any>;
    },
    client: Pick<typeof prisma, 'messageDelivery'> = prisma,
  ) {
    return client.messageDelivery.update({
      where: { id: deliveryId },
      data: {
        attendance_id: data.attendance_id,
        ...(data.rendered_content !== undefined ? { rendered_content: data.rendered_content } : {}),
        ...(data.variables_snapshot !== undefined ? { variables_snapshot: data.variables_snapshot } : {}),
      },
    });
  }

  async reactivateDelivery(
    deliveryId: number,
    data: {
      attendance_id: number;
      zalo_account_id?: number | null;
      zalo_group_id?: number | null;
      line_account_id?: number | null;
      line_group_id?: number | null;
      scheduled_at: Date;
      rendered_content: string;
      variables_snapshot: Record<string, any>;
    },
    client: Pick<typeof prisma, 'messageDelivery'> = prisma,
  ) {
    return client.messageDelivery.update({
      where: { id: deliveryId },
      data: {
        attendance_id: data.attendance_id,
        zalo_account_id: data.zalo_account_id ?? null,
        zalo_group_id: data.zalo_group_id ?? null,
        line_account_id: data.line_account_id ?? null,
        line_group_id: data.line_group_id ?? null,
        scheduled_at: data.scheduled_at,
        sent_at: null,
        status: 'SCHEDULED',
        rendered_content: data.rendered_content,
        variables_snapshot: data.variables_snapshot,
        provider_message_id: null,
        error_message: null,
        queue_job_id: null,
      },
    });
  }

  async updateDeliveryStatus(
    deliveryId: number,
    status: string,
    extra?: {
      sent_at?: Date;
      provider_message_id?: string;
      error_message?: string;
      queue_job_id?: string;
    },
    client: Pick<typeof prisma, 'messageDelivery'> = prisma,
  ) {
    return client.messageDelivery.update({
      where: { id: deliveryId },
      data: { status: status as any, ...extra },
    });
  }

  async findPendingDeliveries() {
    return prisma.messageDelivery.findMany({
      where: { status: { in: ['SCHEDULED', 'QUEUED'] } },
      include: {
        enrollment: {
          include: {
            student: { select: { id: true, full_name: true, phone: true, zalo_uid: true, line_uid: true } },
            cs: { select: { id: true, name: true } },
          },
        },
        automation_step: {
          include: { workflow: { select: { id: true, name: true } } },
        },
        zalo_account: {
          select: { id: true, display_name: true, zalo_uid: true, status: true },
        },
        zalo_group: {
          select: { id: true, name: true, zalo_group_id: true },
        },
        line_account: {
          select: { id: true, display_name: true, account_type: true, basic_id: true, status: true },
        },
        line_group: {
          select: { id: true, name: true, line_group_id: true },
        },
        attendance: {
          include: {
            class_session: { select: { id: true, session_number: true } },
          },
        },
      },
      orderBy: { scheduled_at: 'asc' },
    });
  }

  async cancelDeliveriesForAttendance(attendanceId: number) {
    if (typeof (prisma.messageDelivery as any)?.updateMany !== 'function') {
      return { count: 0 };
    }
    return prisma.messageDelivery.updateMany({
      where: {
        attendance_id: attendanceId,
        status: { in: ['SCHEDULED', 'QUEUED'] },
      },
      data: { status: 'CANCELLED' },
    });
  }

  async listDeliveries(
    workflowId: number,
    options?: { status?: string; enrollmentId?: number; csId?: number; page?: number; limit?: number },
  ) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const where: Prisma.MessageDeliveryWhereInput = {
      automation_step: { workflow_id: workflowId },
      ...(options?.status ? { status: options.status as any } : {}),
      ...(options?.enrollmentId ? { enrollment_id: options.enrollmentId } : {}),
      ...(options?.csId !== undefined ? { enrollment: { cs_id: options.csId } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.messageDelivery.findMany({
        where,
        include: {
          enrollment: {
            include: { student: { select: { id: true, full_name: true } } },
          },
          automation_step: { select: { id: true, session_number: true, trigger_event: true, channel: true } },
          zalo_account: { select: { id: true, display_name: true, zalo_uid: true } },
          zalo_group: { select: { id: true, name: true, zalo_group_id: true } },
          line_account: { select: { id: true, display_name: true, account_type: true, basic_id: true } },
          line_group: { select: { id: true, name: true, line_group_id: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.messageDelivery.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

function pickCanonicalOccurrence<T extends { id: number; status?: string; attendance_id?: number }>(
  rows: T[],
  basisAttendanceId?: number,
): T {
  const protectedRow = rows.find((r) => r.status === 'SENT' || r.status === 'SENDING');
  if (protectedRow) return protectedRow;
  if (basisAttendanceId !== undefined) {
    const basisMatch = rows.find((r) => r.attendance_id === basisAttendanceId);
    if (basisMatch) return basisMatch;
  }
  const rank = (status?: string) => {
    switch (status) {
      case 'SENT':
        return 1;
      case 'SENDING':
        return 2;
      case 'QUEUED':
        return 3;
      case 'SCHEDULED':
        return 4;
      case 'CANCELLED':
        return 5;
      default:
        return 6;
    }
  };
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status) || a.id - b.id)[0];
}

export const automationRepository = new AutomationRepository();
