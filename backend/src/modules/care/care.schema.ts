import { z } from 'zod';
import { CareLogOutcome, CareTaskType, CareTaskPriority, CareTaskStatus } from '@prisma/client';

export const createCareLogSchema = z.object({
  body: z.object({
    after_session_number: z.number().int().positive(),
    outcome: z.nativeEnum(CareLogOutcome),
    content: z.string().optional(),
  }),
});

export const createCareTaskSchema = z.object({
  body: z.object({
    enrollment_id: z.number().int().positive(),
    assigned_to_id: z.number().int().positive().optional(),
    type: z.nativeEnum(CareTaskType),
    title: z.string().optional(),
    note: z.string().optional(),
    due_at: z.string().optional(),
    priority: z.nativeEnum(CareTaskPriority).optional().default(CareTaskPriority.NORMAL),
  }),
});

export const updateCareTaskSchema = z.object({
  body: z.object({
    assigned_to_id: z.number().int().positive().optional(),
    type: z.nativeEnum(CareTaskType).optional(),
    title: z.string().optional(),
    note: z.string().optional(),
    due_at: z.string().optional(),
    priority: z.nativeEnum(CareTaskPriority).optional(),
    status: z.nativeEnum(CareTaskStatus).optional(),
  }),
});

export const createMilestoneSchema = z.object({
  body: z.object({
    session_number: z.number().int().positive(),
  }),
});

export const updateEnrollmentCareSchema = z.object({
  body: z.object({
    study_report_url: z.string().nullable().optional(),
    exchange_info: z.string().nullable().optional(),
    callback_note: z.string().nullable().optional(),
    hot_issue_note: z.string().nullable().optional(),
    post_course_care: z.string().nullable().optional(),
  }),
});

export const saveSessionCareLogSchema = z.object({
  body: z.object({
    content: z.string(),
    outcome: z.nativeEnum(CareLogOutcome).optional(),
  }),
});
