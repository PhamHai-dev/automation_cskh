import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    code: z.string().optional(),
    email: z.string().email(),
    name: z.string().min(1),
    phone: z.string().optional(),
    password: z.string().min(6),
    roles: z.array(z.string()).min(1),
    staff_code: z.string().optional().nullable(),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    code: z.string().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    roles: z.array(z.string()).optional(),
    staff_code: z.string().optional().nullable(),
  }),
});
