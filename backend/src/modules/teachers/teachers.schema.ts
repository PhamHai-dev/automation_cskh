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

export const updateMyTeacherProfileSchema = z.object({
  body: z
    .object({
      phone: z.string().trim().max(30, 'Số điện thoại tối đa 30 ký tự').nullable().optional(),
      email: z
        .string()
        .trim()
        .email('Email không hợp lệ')
        .max(255, 'Email tối đa 255 ký tự')
        .nullable()
        .optional(),
    })
    .strict('Chỉ được cập nhật email và số điện thoại')
    .refine((body) => body.phone !== undefined || body.email !== undefined, {
      message: 'Cần cung cấp email hoặc số điện thoại',
    }),
});

export const provisionAccountSchema = z.object({
  body: z.object({
    email: z.string().email('Email không hợp lệ'),
    password: z.string().min(6, 'Mật khẩu phải từ 6 ký tự').optional(),
  }),
});
