/**
 * Automation Routes — CRUD workflows, steps, enrollments, deliveries.
 * Scope: CS sees own workflows only; ADMIN/MANAGE can manage all.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middlewares/auth.middleware';
import { automationService } from './automation.service';
import { prisma } from '../../prisma/client';

const router = Router();

// All automation endpoints require auth
router.use(authenticate);

// ─── Helpers ─────────────────────────────────────────────────────────

function getRole(req: Request): string {
  const roles: string[] = (req.user?.roles as string[]) ?? [];
  if (roles.includes('ADMIN')) return 'ADMIN';
  if (roles.includes('MANAGE')) return 'MANAGE';
  return 'CS';
}

function handleError(res: Response, err: any) {
  const status = err?.status ?? 500;
  res.status(status).json({ success: false, message: err.message ?? 'Internal error' });
}

// ─── Workflow CRUD ───────────────────────────────────────────────────

// List workflows
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = getRole(req);
    const query = {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      search: req.query.search as string | undefined,
      active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
    };
    const result = await automationService.listWorkflows(userId, role, query);
    res.json({ success: true, ...result });
  } catch (err: any) {
    handleError(res, err);
  }
});

// Create workflow
router.post('/workflows', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1, 'Name is required').max(200),
      description: z.string().max(2000).optional(),
    });
    const dto = schema.parse(req.body);
    const workflow = await automationService.createWorkflow(req.user!.id, dto);
    res.status(201).json({ success: true, workflow });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ success: false, errors: err.issues });
    }
    handleError(res, err);
  }
});

// Available enrollments (popup chon HV)
router.get('/workflows/:id/enrollments/available', async (req: Request, res: Response) => {
  try {
    const workflowId = Number(req.params.id);
    if (isNaN(workflowId) || workflowId < 1) {
      return res.status(400).json({ success: false, message: 'Invalid workflow ID' });
    }
    const result = await automationService.listAvailableEnrollments(
      workflowId,
      req.user!.id,
      getRole(req),
      {
        q: (req.query.q as string)?.trim(),
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      },
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    handleError(res, err);
  }
});

// Get workflow detail (with steps + enrollments count)
router.get('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const workflow = await automationService.getWorkflow(id);
    const role = getRole(req);
    if (!['ADMIN', 'MANAGE'].includes(role) && workflow.owner_cs_id !== req.user!.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    res.json({ success: true, workflow });
  } catch (err: any) {
    handleError(res, err);
  }
});

// Update workflow
router.patch('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).optional().nullable(),
      active: z.boolean().optional(),
    });
    const dto = schema.parse(req.body);
    const updated = await automationService.updateWorkflow(Number(req.params.id), dto as any, req.user!.id, getRole(req));
    res.json({ success: true, workflow: updated });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ success: false, errors: err.issues });
    handleError(res, err);
  }
});

// Delete workflow
router.delete('/workflows/:id', async (req: Request, res: Response) => {
  try {
    await automationService.deleteWorkflow(Number(req.params.id), req.user!.id, getRole(req));
    res.json({ success: true, message: 'Workflow deleted' });
  } catch (err: any) {
    handleError(res, err);
  }
});

// ─── Steps (cụm trigger) ────────────────────────────────────────────

// Add step to workflow
router.post('/workflows/:id/steps', async (req: Request, res: Response) => {
  try {
    const workflowId = Number(req.params.id);
    const schema = z.object({
      session_number: z.number().int().min(1, 'Session number >= 1'),
      trigger_event: z.enum(['ATTENDED', 'ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E']),
      delay_minutes: z.number().int().min(0).max(10080),
      channel: z.enum(['ZALO_PERSONAL', 'ZALO_GROUP']).default('ZALO_PERSONAL'),
      target_group_id: z.number().int().optional().nullable(),
      message_content: z.string().min(1, 'Message content required').max(5000),
      message_variables: z.array(z.string()).default([]),
      active: z.boolean().optional(),
    });
    const dto = schema.parse(req.body);

    // If ZALO_GROUP, target_group_id is required
    if (dto.channel === 'ZALO_GROUP' && !dto.target_group_id) {
      return res.status(422).json({ success: false, message: 'target_group_id is required for ZALO_GROUP channel' });
    }

    const step = await automationService.addStep(workflowId, dto, req.user!.id, getRole(req));
    res.status(201).json({ success: true, step });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ success: false, errors: err.issues });
    handleError(res, err);
  }
});

// Update step
router.patch('/steps/:stepId', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      session_number: z.number().int().min(1).optional(),
      trigger_event: z.enum(['ATTENDED', 'ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E']).optional(),
      delay_minutes: z.number().int().min(0).max(10080).optional(),
      channel: z.enum(['ZALO_PERSONAL', 'ZALO_GROUP']).optional(),
      target_group_id: z.number().int().optional().nullable(),
      message_content: z.string().min(1).max(5000).optional(),
      message_variables: z.array(z.string()).optional(),
      active: z.boolean().optional(),
    });
    const dto = schema.parse(req.body);
    const updated = await automationService.updateStep(Number(req.params.stepId), dto, req.user!.id, getRole(req));
    res.json({ success: true, step: updated });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ success: false, errors: err.issues });
    handleError(res, err);
  }
});

// Delete step
router.delete('/steps/:stepId', async (req: Request, res: Response) => {
  try {
    await automationService.deleteStep(Number(req.params.stepId), req.user!.id, getRole(req));
    res.json({ success: true, message: 'Step deleted' });
  } catch (err: any) {
    handleError(res, err);
  }
});

// ─── Enrollments (add học viên vào workflow) ─────────────────────────

router.post('/workflows/:id/enrollments', async (req: Request, res: Response) => {
  try {
    const workflowId = Number(req.params.id);
    const schema = z.object({
      enrollment_id: z.number().int().optional(),
      enrollment_ids: z.array(z.number().int()).optional(),
    }).refine((d) => d.enrollment_id !== undefined || (d.enrollment_ids && d.enrollment_ids.length > 0), {
      message: 'Either enrollment_id or enrollment_ids is required',
    });
    const parsed = schema.parse(req.body);
    const ids: number[] = parsed.enrollment_ids ?? [parsed.enrollment_id!];

    const results: any[] = [];
    const errors: any[] = [];
    for (const eid of ids) {
      try {
        const added = await automationService.addEnrollment(workflowId, eid, req.user!.id, getRole(req));
        results.push(added);
      } catch (e: any) {
        errors.push({ enrollment_id: eid, message: e.message });
      }
    }

    res.status(201).json({ success: true, enrolled: results.length, results, errors });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ success: false, errors: err.issues });
    handleError(res, err);
  }
});

router.delete('/workflows/:id/enrollments/:enrollmentId', async (req: Request, res: Response) => {
  try {
    await automationService.removeEnrollment(Number(req.params.id), Number(req.params.enrollmentId), req.user!.id, getRole(req));
    res.json({ success: true, message: 'Enrollment removed' });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.get('/workflows/:id/enrollments', async (req: Request, res: Response) => {
  try {
    const items = await automationService.listEnrollments(Number(req.params.id));
    res.json({ success: true, items });
  } catch (err: any) {
    handleError(res, err);
  }
});

// ─── Deliveries ──────────────────────────────────────────────────────

router.get('/workflows/:id/deliveries', async (req: Request, res: Response) => {
  try {
    const result = await automationService.listDeliveries(Number(req.params.id), {
      status: req.query.status as string | undefined,
      enrollmentId: req.query.enrollment_id ? Number(req.query.enrollment_id) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    handleError(res, err);
  }
});

export { router as automationRouter };
