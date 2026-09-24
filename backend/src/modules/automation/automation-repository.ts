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
        steps: { orderBy: [{ session_number: 'asc' }, { trigger_event: 'asc' }] },
        _count: { select: { enrollments: true, steps: true } },
      },
    });
  }

  async listWorkflows(ownerCsId: number, options?: { active?: boolean; search?: string; page?: number; limit?: number }) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const where: Prisma.AutomationWorkflowWhereInput = {
      owner_cs_id: ownerCsId,
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

  async listEnrollments(workflowId: number) {
    return prisma.automationEnrollment.findMany({
      where: { workflow_id: workflowId },
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

  // ─── Delivery ────────────────────────────────────────────────────────

  async createDelivery(data: {
    enrollment_id: number;
    attendance_id: number;
    automation_step_id: number;
    zalo_account_id: number;
    zalo_group_id?: number;
    scheduled_at: Date;
    rendered_content: string;
    variables_snapshot: Record<string, any>;
  }) {
    return prisma.messageDelivery.create({ data });
  }

  async findDeliveryForIdempotency(attendanceId: number, automationStepId: number) {
    return prisma.messageDelivery.findUnique({
      where: {
        attendance_id_automation_step_id: {
          attendance_id: attendanceId,
          automation_step_id: automationStepId,
        },
      },
    });
  }

  async updateDeliveryStatus(deliveryId: number, status: string, extra?: {
    sent_at?: Date;
    provider_message_id?: string;
    error_message?: string;
    queue_job_id?: string;
  }) {
    return prisma.messageDelivery.update({
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
            student: { select: { id: true, full_name: true, phone: true } },
            cs: { select: { id: true, name: true } },
          },
        },
        automation_step: {
          include: { workflow: { select: { id: true, name: true } } },
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
    return prisma.messageDelivery.updateMany({
      where: {
        attendance_id: attendanceId,
        status: { in: ['SCHEDULED', 'QUEUED'] },
      },
      data: { status: 'CANCELLED' },
    });
  }

  async listDeliveries(workflowId: number, options?: { status?: string; enrollmentId?: number; page?: number; limit?: number }) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const where: Prisma.MessageDeliveryWhereInput = {
      automation_step: { workflow_id: workflowId },
      ...(options?.status ? { status: options.status as any } : {}),
      ...(options?.enrollmentId ? { enrollment_id: options.enrollmentId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.messageDelivery.findMany({
        where,
        include: {
          enrollment: {
            include: { student: { select: { id: true, full_name: true } } },
          },
          automation_step: { select: { session_number: true, trigger_event: true } },
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

export const automationRepository = new AutomationRepository();
