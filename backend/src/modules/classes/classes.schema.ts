import { z } from 'zod';

export const createClassSchema = z.object({
  body: z.object({
    class_code: z.string().optional(),
    class_name: z.string().min(1, 'Tên lớp học là bắt buộc'),
    level: z.string().optional(),
    model_type: z.enum(['1:1', '1:2', '1:n', 'ONE_TO_ONE', 'ONE_TO_TWO', 'ONE_TO_N'], {
      required_error: 'Mô hình lớp là bắt buộc',
    }),
    attendance_source: z.enum(['LEARNING_SYSTEM', 'ZOOM']).optional().default('LEARNING_SYSTEM'),
  })
});

export const updateClassSchema = z.object({
  body: z.object({
    class_code: z.string().optional(),
    class_name: z.string().min(1, 'Tên lớp học là bắt buộc').optional(),
    level: z.string().optional(),
    model_type: z.enum(['1:1', '1:2', '1:n', 'ONE_TO_ONE', 'ONE_TO_TWO', 'ONE_TO_N']).optional(),
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
