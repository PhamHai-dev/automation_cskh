import { z } from 'zod';
import { ClassSessionStatus } from '@prisma/client';

export const createClassSessionSchema = z.object({
  body: z.object({
    session_number: z.number().int().positive().optional(),
    session_date: z.string().min(1),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    teacher_id: z.number().int().positive().optional(),
    status: z.nativeEnum(ClassSessionStatus).optional(),
  }),
});

export const updateClassSessionSchema = z.object({
  body: z.object({
    session_number: z.number().int().positive().optional(),
    session_date: z.string().optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    teacher_id: z.number().int().positive().optional(),
    status: z.nativeEnum(ClassSessionStatus).optional(),
  }),
});

export const cancelClassSessionSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
  }),
});

export const listClassSessionsSchema = z.object({
  query: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
    status: z.nativeEnum(ClassSessionStatus).optional(),
  }),
});
