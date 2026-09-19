import { z } from 'zod';

export const createStudentSchema = z.object({
  body: z.object({
    full_name: z.string().min(1),
    gender: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    date_of_birth: z.string().optional(),
    occupation: z.string().optional(),
    zalo_uid: z.string().optional(),
    note: z.string().optional(),
  })
});

export const updateStudentSchema = z.object({
  body: z.object({
    full_name: z.string().min(1).optional(),
    gender: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    date_of_birth: z.string().optional(),
    occupation: z.string().optional(),
    zalo_uid: z.string().optional(),
    note: z.string().optional(),
  })
});
