import { z } from 'zod';

export const createEnrollmentSchema = z.object({
  body: z.object({
    external_id: z.string().optional(),
    student_id: z.number().int().positive(),
    package_id: z.number().int().positive().optional(),
    cs_id: z.number().int().positive(),
    total_sessions: z.number().int().positive(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  })
});

export const updateEnrollmentSchema = z.object({
  body: z.object({
    external_id: z.string().optional(),
    package_id: z.number().int().positive().optional(),
    total_sessions: z.number().int().positive().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    status: z.enum(['NOT_STARTED', 'STUDYING', 'PAUSED', 'FINISHED', 'CANCELLED']).optional(),
  })
});

export const reassignCSSchema = z.object({
  body: z.object({
    cs_id: z.number().int().positive(),
  })
});

export const transferClassSchema = z.object({
  body: z.object({
    from_class_id: z.number().int().positive(),
    to_class_id: z.number().int().positive(),
    start_date: z.string().optional(),
  })
});
