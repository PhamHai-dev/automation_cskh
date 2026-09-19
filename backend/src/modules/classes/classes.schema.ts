import { z } from 'zod';

export const createClassSchema = z.object({
  body: z.object({
    class_code: z.string().optional(),
    class_name: z.string().min(1),
    level: z.string().optional(),
    model_type: z.enum(['ONE_TO_ONE', 'GROUP']),
    attendance_source: z.enum(['LEARNING_SYSTEM', 'ZOOM']),
  })
});

export const updateClassSchema = z.object({
  body: z.object({
    class_code: z.string().optional(),
    class_name: z.string().min(1).optional(),
    level: z.string().optional(),
    model_type: z.enum(['ONE_TO_ONE', 'GROUP']).optional(),
    attendance_source: z.enum(['LEARNING_SYSTEM', 'ZOOM']).optional(),
    active: z.boolean().optional(),
  })
});

export const assignTeacherSchema = z.object({
  body: z.object({
    teacher_id: z.number().int().positive(),
    role: z.enum(['MAIN', 'ASSISTANT', 'SUBSTITUTE']),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  })
});
