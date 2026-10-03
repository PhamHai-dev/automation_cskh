import { z } from 'zod';

export const createTeacherSchema = z.object({
  body: z.object({
    code: z.string().optional(),
    name: z.string().min(1, 'Họ tên giáo viên là bắt buộc'),
    phone: z.string().optional(),
    email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
    teacher_type: z.enum(['VIETNAMESE', 'JAPANESE', 'OTHER']).optional(),
    active: z.boolean().optional(),
  }),
});

export const updateTeacherSchema = z.object({
  body: z.object({
    code: z.string().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
    teacher_type: z.enum(['VIETNAMESE', 'JAPANESE', 'OTHER']).optional(),
    active: z.boolean().optional(),
  }),
});

export const provisionAccountSchema = z.object({
  body: z.object({
    email: z.string().email('Email không hợp lệ'),
    password: z.string().min(6, 'Mật khẩu phải từ 6 ký tự').optional(),
  }),
});
