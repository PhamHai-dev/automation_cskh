import { z } from 'zod';

export const createTeacherSchema = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(6).optional(),
    phone: z.string().optional(),
    teacher_code: z.string().optional(),
    teacher_type: z.enum(['VIETNAMESE', 'JAPANESE', 'OTHER']).optional(),
  })
});

export const updateTeacherSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    teacher_code: z.string().optional(),
    teacher_type: z.enum(['VIETNAMESE', 'JAPANESE', 'OTHER']).optional(),
    active: z.boolean().optional(),
  })
});
