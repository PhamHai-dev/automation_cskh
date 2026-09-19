import { z } from 'zod';

export const createPackageSchema = z.object({
  body: z.object({
    code: z.string().min(1),
    name: z.string().optional(),
    default_total_sessions: z.number().int().positive().optional(),
    description: z.string().optional(),
    active: z.boolean().optional(),
  })
});

export const updatePackageSchema = z.object({
  body: z.object({
    code: z.string().min(1).optional(),
    name: z.string().optional(),
    default_total_sessions: z.number().int().positive().optional(),
    description: z.string().optional(),
    active: z.boolean().optional(),
  })
});
