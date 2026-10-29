/**
 * Automation Service — Business logic for CRUD workflow/step/enrollment
 * with Admin/Manage workflow & trigger authoring, CSKH assignment, and
 * strict per-CSKH student/delivery isolation.
 */

import { prisma } from '../../prisma/client';
import { automationRepository } from './automation-repository';
import type {
  CreateWorkflowDTO,
  UpdateWorkflowDTO,
  CreateStepDTO,
  UpdateStepDTO,
  ListWorkflowsQuery,
} from './automation.types';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('AutomationService');

const WORKFLOW_CS_ASSIGNMENTS_KEY = 'AUTOMATION_WORKFLOW_CS_ASSIGNMENTS';

export interface AssignableCsUser {
  id: number;
  name: string | null;
  email: string;
  staff_code: string | null;
}

export class AutomationService {
  // ─── CSKH Assignment Helpers (stored in AppSetting) ──────────────────

  async listAssignableCsUsers(): Promise<AssignableCsUser[]> {
    if (typeof (prisma as any)?.user?.findMany !== 'function') return [];
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, staff_code: true, roles: true },
      orderBy: { id: 'asc' },
    });
    return users
      .filter((u) => {
        const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
        return roles.includes('CS');
      })
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        staff_code: u.staff_code ?? null,
      }));
  }

  async getWorkflowCsAssignmentsMap(): Promise<Record<string, number[]>> {
    if (typeof (prisma as any)?.appSetting?.findUnique !== 'function') return {};
    try {
      const row = await prisma.appSetting.findUnique({
        where: { key: WORKFLOW_CS_ASSIGNMENTS_KEY },
      });
      if (!row || !row.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
        return {};
      }
      const raw = row.value as Record<string, unknown>;
      const result: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v)) {
          result[k] = Array.from(
            new Set(
              v
                .map((x) => Number(x))
                .filter((n) => Number.isInteger(n) && n > 0),
            ),
          );
        }
      }
      return result;
    } catch (err) {
      log.warn('Failed to read WORKFLOW_CS_ASSIGNMENTS_KEY', { error: String(err) });
      return {};
    }
  }

  async setWorkflowCsAssignments(
    workflowId: number,
    csIds: number[],
    updatedById?: number,
  ): Promise<number[]> {
    const cleanIds = Array.from(
      new Set(
        (csIds ?? [])
          .map((x) => Number(x))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    );
    if (typeof (prisma as any)?.appSetting?.upsert !== 'function') {
      return cleanIds;
    }
    const map = await this.getWorkflowCsAssignmentsMap();
    map[String(workflowId)] = cleanIds;
    await prisma.appSetting.upsert({
      where: { key: WORKFLOW_CS_ASSIGNMENTS_KEY },
      create: {
        key: WORKFLOW_CS_ASSIGNMENTS_KEY,
        value: map,
        updated_by_id: updatedById ?? null,
      },
      update: {
        value: map,
        updated_by_id: updatedById ?? null,
      },
    });
    return cleanIds;
  }

  private async enrichWorkflowWithAssignments(
    workflow: any,
    assignmentsMap: Record<string, number[]>,
    csUsersMap: Map<number, AssignableCsUser>,
    viewer?: { userId: number; role: string },
  ) {
    const rawAssigned = assignmentsMap[String(workflow.id)];
    // If not explicitly configured yet, default to owner_cs_id if owner is a CS user
    const assignedCsIds = Array.isArray(rawAssigned)
      ? rawAssigned
      : csUsersMap.has(workflow.owner_cs_id)
        ? [workflow.owner_cs_id]
        : [];

    const assignedCsUsers = assignedCsIds
      .map((id) => csUsersMap.get(id))
      .filter((u): u is AssignableCsUser => Boolean(u));

    const isViewerCsOnly = Boolean(viewer && !['ADMIN', 'MANAGE'].includes(viewer.role));

    let enrollmentCount = workflow._count?.enrollments ?? 0;
    if (
      isViewerCsOnly &&
      viewer &&
      typeof (prisma as any)?.automationEnrollment?.count === 'function'
    ) {
      enrollmentCount = await prisma.automationEnrollment.count({
        where: {
          workflow_id: workflow.id,
          enrollment: { cs_id: viewer.userId },
        },
      });
    }

    return {
      ...workflow,
      ...(isViewerCsOnly ? { owner: null, owner_cs_id: undefined } : {}),
      _count: {
        ...(workflow._count ?? {}),
        enrollments: enrollmentCount,
      },
      // Do not expose which other CSKHs are assigned when viewed by a CS user
      assigned_cs_ids: isViewerCsOnly ? [] : assignedCsIds,
      assigned_cs_users: isViewerCsOnly ? [] : assignedCsUsers,
    };
  }

  async isCsAllowedOnWorkflow(workflowId: number, userId: number, role: string): Promise<boolean> {
    if (['ADMIN', 'MANAGE'].includes(role)) return true;
    const workflow = await automationRepository.findWorkflowById(workflowId);
    if (!workflow) return false;
    const [assignmentsMap, csUsers] = await Promise.all([
      this.getWorkflowCsAssignmentsMap(),
      this.listAssignableCsUsers(),
    ]);
    const csUsersMap = new Map(csUsers.map((u) => [u.id, u]));
    const rawAssigned = assignmentsMap[String(workflowId)];
    const assignedCsIds = Array.isArray(rawAssigned)
      ? rawAssigned
      : csUsersMap.has(workflow.owner_cs_id)
        ? [workflow.owner_cs_id]
        : [];
    return assignedCsIds.includes(userId);
  }

  // ─── Workflow ────────────────────────────────────────────────────────

  async createWorkflow(ownerCsId: number, dto: CreateWorkflowDTO) {
    const created = await automationRepository.createWorkflow({
      name: dto.name,
      description: dto.description,
      owner_cs_id: ownerCsId,
    });

    if (Array.isArray(dto.assigned_cs_ids)) {
      await this.setWorkflowCsAssignments(created.id, dto.assigned_cs_ids, ownerCsId);
    } else {
      await this.setWorkflowCsAssignments(created.id, [], ownerCsId);
    }

    return this.getWorkflow(created.id, ownerCsId, 'ADMIN');
  }

  async getWorkflow(id: number, userId?: number, role: string = 'ADMIN') {
    const workflow = await automationRepository.findWorkflowById(id);
    if (!workflow) {
      throw Object.assign(new Error('Workflow not found'), { status: 404 });
    }

    const [assignmentsMap, csUsers] = await Promise.all([
      this.getWorkflowCsAssignmentsMap(),
      this.listAssignableCsUsers(),
    ]);
    const csUsersMap = new Map(csUsers.map((u) => [u.id, u]));

    const enriched = await this.enrichWorkflowWithAssignments(
      workflow,
      assignmentsMap,
      csUsersMap,
      userId !== undefined ? { userId, role } : undefined,
    );

    if (userId !== undefined && !['ADMIN', 'MANAGE'].includes(role)) {
      const rawAssigned = assignmentsMap[String(workflow.id)];
      const actualAssignedIds = Array.isArray(rawAssigned)
        ? rawAssigned
        : csUsersMap.has(workflow.owner_cs_id)
          ? [workflow.owner_cs_id]
          : [];
      if (!actualAssignedIds.includes(userId)) {
        throw Object.assign(
          new Error('Bạn chưa được phân quyền tham gia kịch bản tự động này'),
          { status: 403 },
        );
      }
    }

    return enriched;
  }

  async listWorkflows(userId: number, role: string, query: ListWorkflowsQuery) {
    const isAdminOrManage = ['ADMIN', 'MANAGE'].includes(role);
    const [assignmentsMap, csUsers] = await Promise.all([
      this.getWorkflowCsAssignmentsMap(),
      this.listAssignableCsUsers(),
    ]);
    const csUsersMap = new Map(csUsers.map((u) => [u.id, u]));

    let allowedWorkflowIds: number[] | undefined = undefined;
    if (!isAdminOrManage) {
      // Find all workflows where userId is in assigned_cs_ids (or legacy unconfigured owner_cs_id)
      const allWf =
        typeof (prisma as any)?.automationWorkflow?.findMany === 'function'
          ? await prisma.automationWorkflow.findMany({
              select: { id: true, owner_cs_id: true },
            })
          : [];
      allowedWorkflowIds = allWf
        .filter((wf) => {
          const rawAssigned = assignmentsMap[String(wf.id)];
          const assignedIds = Array.isArray(rawAssigned)
            ? rawAssigned
            : csUsersMap.has(wf.owner_cs_id)
              ? [wf.owner_cs_id]
              : [];
          return assignedIds.includes(userId);
        })
        .map((wf) => wf.id);
    }

    const workflows = await automationRepository.listWorkflows(undefined, {
      active: query.active,
      search: query.search,
      page: query.page,
      limit: query.limit,
      workflowIds: allowedWorkflowIds,
    });

    const enrichedItems = await Promise.all(
      workflows.items.map((wf) =>
        this.enrichWorkflowWithAssignments(wf, assignmentsMap, csUsersMap, { userId, role }),
      ),
    );

    return {
      ...workflows,
      items: enrichedItems,
    };
  }

  async updateWorkflow(id: number, dto: UpdateWorkflowDTO, userId: number, role: string) {
    const workflow = await automationRepository.findWorkflowById(id);
    if (!workflow) throw Object.assign(new Error('Workflow not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role)) {
      throw Object.assign(
        new Error('Chỉ Admin và Quản lý mới có quyền chỉnh sửa kịch bản tự động'),
        { status: 403 },
      );
    }

    const { assigned_cs_ids, ...updateFields } = dto;
    if (
      updateFields.name !== undefined ||
      updateFields.description !== undefined ||
      updateFields.active !== undefined
    ) {
      await automationRepository.updateWorkflow(id, updateFields);
    }

    if (Array.isArray(assigned_cs_ids)) {
      await this.setWorkflowCsAssignments(id, assigned_cs_ids, userId);
    }

    return this.getWorkflow(id, userId, role);
  }

  async deleteWorkflow(id: number, userId: number, role: string) {
    const workflow = await automationRepository.findWorkflowById(id);
    if (!workflow) throw Object.assign(new Error('Workflow not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role)) {
      throw Object.assign(
        new Error('Chỉ Admin và Quản lý mới có quyền xóa kịch bản tự động'),
        { status: 403 },
      );
    }
    return automationRepository.deleteWorkflow(id);
  }

  // ─── Steps ───────────────────────────────────────────────────────────

  async addStep(workflowId: number, dto: CreateStepDTO, ownerCsId: number, role: string) {
    const workflow = await automationRepository.findWorkflowById(workflowId);
    if (!workflow) throw Object.assign(new Error('Workflow not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role) && workflow.owner_cs_id !== ownerCsId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    try {
      return await automationRepository.createStep(workflowId, {
        ...dto,
        active: dto.active ?? true,
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw Object.assign(
          new Error(`Step already exists for session ${dto.session_number} + event ${dto.trigger_event}`),
          { status: 409 },
        );
      }
      throw err;
    }
  }

  async updateStep(stepId: number, dto: UpdateStepDTO, ownerCsId: number, role: string) {
    const step = await automationRepository.findStepById(stepId);
    if (!step) throw Object.assign(new Error('Step not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role) && step.workflow.owner_cs_id !== ownerCsId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    const changesSessionNumber =
      dto.session_number !== undefined && dto.session_number !== step.session_number;
    const changesTriggerEvent =
      dto.trigger_event !== undefined && dto.trigger_event !== step.trigger_event;
    if (changesSessionNumber || changesTriggerEvent) {
      const deliveryCount = await automationRepository.countDeliveriesForStep(stepId);
      if (deliveryCount > 0) {
        throw Object.assign(
          new Error(
            'Bước đã có lịch sử gửi — không thể thay đổi mốc (session_number) hoặc trigger_event. Hãy tạo bước mới nếu cần mốc khác.',
          ),
          { status: 409 },
        );
      }
    }

    const effectiveChannel = dto.channel ?? step.channel;
    const effectiveTargetGroupId = dto.target_group_id !== undefined ? dto.target_group_id : step.target_group_id;
    if ((effectiveChannel === 'ZALO_GROUP' || effectiveChannel === 'LINE_GROUP') && !effectiveTargetGroupId) {
      throw Object.assign(
        new Error(`target_group_id is required for ${effectiveChannel} channel`),
        { status: 422 },
      );
    }

    try {
      return await automationRepository.updateStep(stepId, dto);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw Object.assign(
          new Error(
            `Step already exists for session ${dto.session_number ?? step.session_number} + event ${dto.trigger_event ?? step.trigger_event}`,
          ),
          { status: 409 },
        );
      }
      throw err;
    }
  }

  async deleteStep(stepId: number, ownerCsId: number, role: string) {
    const step = await automationRepository.findStepById(stepId);
    if (!step) throw Object.assign(new Error('Step not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role) && step.workflow.owner_cs_id !== ownerCsId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    const deliveryCount = await automationRepository.countDeliveriesForStep(stepId);
    if (deliveryCount > 0) {
      throw Object.assign(
        new Error('Bước đã có bản ghi gửi — không thể xóa. Hãy đặt active=false để ngừng áp dụng.'),
        { status: 409 },
      );
    }

    try {
      return await automationRepository.deleteStep(stepId);
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw Object.assign(
          new Error('Bước đã có bản ghi gửi — không thể xóa. Hãy đặt active=false để ngừng áp dụng.'),
          { status: 409 },
        );
      }
      throw err;
    }
  }

  // ─── Enrollments (Strict per-CSKH isolation for CS role) ────────────

  async addEnrollment(workflowId: number, enrollmentId: number, userId: number, role: string) {
    const allowed = await this.isCsAllowedOnWorkflow(workflowId, userId, role);
    if (!allowed) {
      throw Object.assign(
        new Error('Bạn chưa được phân quyền tham gia kịch bản tự động này'),
        { status: 403 },
      );
    }

    // Strict per-CSKH isolation: CS can only add enrollments that belong to them (enrollment.cs_id === userId)
    if (!['ADMIN', 'MANAGE'].includes(role) && typeof (prisma as any)?.enrollment?.findUnique === 'function') {
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true, cs_id: true },
      });
      if (!enrollment) {
        throw Object.assign(new Error('Không tìm thấy ghi danh học viên'), { status: 404 });
      }
      if (enrollment.cs_id !== userId) {
        throw Object.assign(
          new Error('Bạn chỉ được thêm học viên do mình phụ trách vào kịch bản'),
          { status: 403 },
        );
      }
    }

    try {
      return await automationRepository.addEnrollment(workflowId, enrollmentId, userId);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw Object.assign(new Error('Học viên đã có trong kịch bản này'), { status: 409 });
      }
      throw err;
    }
  }

  async removeEnrollment(workflowId: number, enrollmentId: number, userId: number, role: string) {
    const allowed = await this.isCsAllowedOnWorkflow(workflowId, userId, role);
    if (!allowed) {
      throw Object.assign(
        new Error('Bạn chưa được phân quyền tham gia kịch bản tự động này'),
        { status: 403 },
      );
    }

    if (!['ADMIN', 'MANAGE'].includes(role) && typeof (prisma as any)?.enrollment?.findUnique === 'function') {
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true, cs_id: true },
      });
      if (!enrollment || enrollment.cs_id !== userId) {
        throw Object.assign(
          new Error('Bạn chỉ được gỡ học viên do mình phụ trách khỏi kịch bản'),
          { status: 403 },
        );
      }
    }

    return automationRepository.removeEnrollment(workflowId, enrollmentId);
  }

  async listEnrollments(workflowId: number, userId?: number, role: string = 'ADMIN') {
    if (userId !== undefined) {
      const allowed = await this.isCsAllowedOnWorkflow(workflowId, userId, role);
      if (!allowed) {
        throw Object.assign(
          new Error('Bạn chưa được phân quyền tham gia kịch bản tự động này'),
          { status: 403 },
        );
      }
    }
    const effectiveCsId =
      userId !== undefined && !['ADMIN', 'MANAGE'].includes(role) ? userId : undefined;
    return automationRepository.listEnrollments(workflowId, effectiveCsId);
  }

  async listAvailableEnrollments(
    workflowId: number,
    userId: number,
    role: string,
    query: { q?: string; page?: number; limit?: number },
  ) {
    const allowed = await this.isCsAllowedOnWorkflow(workflowId, userId, role);
    if (!allowed) {
      throw Object.assign(
        new Error('Bạn chưa được phân quyền tham gia kịch bản tự động này'),
        { status: 403 },
      );
    }

    // CS chỉ thấy học viên mình phụ trách; ADMIN/MANAGE thấy tất cả
    const csId = ['ADMIN', 'MANAGE'].includes(role) ? undefined : userId;
    return automationRepository.listAvailableEnrollments(workflowId, { ...query, csId });
  }

  // ─── Deliveries (Strict per-CSKH isolation for CS role) ─────────────

  async listDeliveries(
    workflowId: number,
    query: { status?: string; enrollmentId?: number; page?: number; limit?: number },
    userId?: number,
    role: string = 'ADMIN',
  ) {
    if (userId !== undefined) {
      const allowed = await this.isCsAllowedOnWorkflow(workflowId, userId, role);
      if (!allowed) {
        throw Object.assign(
          new Error('Bạn chưa được phân quyền tham gia kịch bản tự động này'),
          { status: 403 },
        );
      }
    }
    const effectiveCsId =
      userId !== undefined && !['ADMIN', 'MANAGE'].includes(role) ? userId : undefined;
    return automationRepository.listDeliveries(workflowId, {
      ...query,
      csId: effectiveCsId,
    });
  }
}

export const automationService = new AutomationService();
