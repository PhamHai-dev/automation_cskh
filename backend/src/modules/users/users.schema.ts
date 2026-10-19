import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(6),
    roles: z.array(z.string()).min(1),
    staff_code: z.string().optional().nullable(),
  })
});

export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    roles: z.array(z.string()).optional(),
    staff_code: z.string().optional().nullable(),
  })
});
