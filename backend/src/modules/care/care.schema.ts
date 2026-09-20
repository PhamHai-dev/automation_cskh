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
