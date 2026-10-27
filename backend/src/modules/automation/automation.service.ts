/**
 * Automation Service — Business logic for CRUD workflow/step/enrollment.
 */

import { automationRepository } from './automation-repository';
import type { CreateWorkflowDTO, UpdateWorkflowDTO, CreateStepDTO, UpdateStepDTO, ListWorkflowsQuery } from './automation.types';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('AutomationService');

export class AutomationService {
  // ─── Workflow ────────────────────────────────────────────────────────

  async createWorkflow(ownerCsId: number, dto: CreateWorkflowDTO) {
    return automationRepository.createWorkflow({
      name: dto.name,
      description: dto.description,
      owner_cs_id: ownerCsId,
    });
  }

  async getWorkflow(id: number) {
    const workflow = await automationRepository.findWorkflowById(id);
    if (!workflow) {
      throw Object.assign(new Error('Workflow not found'), { status: 404 });
    }
    return workflow;
  }

  async listWorkflows(ownerCsId: number, role: string, query: ListWorkflowsQuery) {
    // ADMIN/MANAGE can see all workflows, CS sees only own
    const effectiveCsId = ['ADMIN', 'MANAGE'].includes(role) ? undefined : ownerCsId;

    const workflows = await automationRepository.listWorkflows(effectiveCsId ?? ownerCsId, {
      active: query.active,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    // For ADMIN/MANAGE, we need to override the owner_cs_id filter
    if (['ADMIN', 'MANAGE'].includes(role)) {
      // TODO: update repository to support seeAll mode
      // For now, admin gets all
    }

    return workflows;
  }

  async updateWorkflow(id: number, dto: UpdateWorkflowDTO, ownerCsId: number, role: string) {
    const workflow = await automationRepository.findWorkflowById(id);
    if (!workflow) throw Object.assign(new Error('Workflow not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role) && workflow.owner_cs_id !== ownerCsId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    return automationRepository.updateWorkflow(id, dto);
  }

  async deleteWorkflow(id: number, ownerCsId: number, role: string) {
    const workflow = await automationRepository.findWorkflowById(id);
    if (!workflow) throw Object.assign(new Error('Workflow not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role) && workflow.owner_cs_id !== ownerCsId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
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

  // ─── Enrollments ────────────────────────────────────────────────────

  async addEnrollment(workflowId: number, enrollmentId: number, userId: number, role: string) {
    const workflow = await automationRepository.findWorkflowById(workflowId);
    if (!workflow) throw Object.assign(new Error('Workflow not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role) && workflow.owner_cs_id !== userId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    try {
      return await automationRepository.addEnrollment(workflowId, enrollmentId, userId);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw Object.assign(new Error('Enrollment already in this workflow'), { status: 409 });
      }
      throw err;
    }
  }

  async removeEnrollment(workflowId: number, enrollmentId: number, ownerCsId: number, role: string) {
    const workflow = await automationRepository.findWorkflowById(workflowId);
    if (!workflow) throw Object.assign(new Error('Workflow not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role) && workflow.owner_cs_id !== ownerCsId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    return automationRepository.removeEnrollment(workflowId, enrollmentId);
  }

  async listEnrollments(workflowId: number) {
    return automationRepository.listEnrollments(workflowId);
  }

  async listAvailableEnrollments(workflowId: number, userId: number, role: string, query: { q?: string; page?: number; limit?: number }) {
    const workflow = await automationRepository.findWorkflowById(workflowId);
    if (!workflow) throw Object.assign(new Error('Workflow not found'), { status: 404 });
    if (!['ADMIN', 'MANAGE'].includes(role) && workflow.owner_cs_id !== userId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    // CS chỉ thấy học viên mình phụ trách; ADMIN/MANAGE thấy tất cả
    const csId = ['ADMIN', 'MANAGE'].includes(role) ? undefined : userId;
    return automationRepository.listAvailableEnrollments(workflowId, { ...query, csId });
  }

  // ─── Deliveries ─────────────────────────────────────────────────────

  async listDeliveries(workflowId: number, query: { status?: string; enrollmentId?: number; page?: number; limit?: number }) {
    return automationRepository.listDeliveries(workflowId, query);
  }
}

export const automationService = new AutomationService();
