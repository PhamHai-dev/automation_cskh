import { z } from 'zod';
import { ClassSessionStatus } from '@prisma/client';

const SESSION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SESSION_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const optionalTime = z
  .string()
  .regex(SESSION_TIME_RE, 'Giờ phải theo định dạng HH:mm')
  .optional();

const actualDate = z
  .string()
  .regex(SESSION_DATE_RE, 'Ngày phải theo định dạng YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }, 'Ngày không hợp lệ');

const actualTimes = <T extends { start_time?: string; end_time?: string }>(data: T) =>
  !data.start_time || !data.end_time || data.end_time > data.start_time;

// Generic scheduled-session create is unchanged: it never accepts an idempotency key or
// enrollment_class_id (zod strips unknown keys), so the actual-session skeleton capability
// stays confined to the teacher-only createActual route below.
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


export const createActualClassSessionSchema = z
  .object({
    body: z.object({
      idempotency_key: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Khóa ý định chỉ chứa chữ, số, dấu gạch dưới hoặc gạch ngang'),
      enrollment_class_id: z.number().int().positive(),
      session_date: actualDate,
      start_time: optionalTime,
      end_time: optionalTime,
      teacher_id: z.number().int().positive().optional(),
    }),
  })
  .refine((data) => actualTimes(data.body), { message: 'Giờ kết thúc phải sau giờ bắt đầu', path: ['body', 'end_time'] });


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
    reason: z.string().max(500).optional(),
  }),
});

export const listClassSessionsSchema = z.object({
  query: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
    status: z.nativeEnum(ClassSessionStatus).optional(),
  }),
});
