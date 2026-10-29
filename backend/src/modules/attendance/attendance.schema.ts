import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

const attendanceSideSchema = z.enum(['TEACHER', 'CS', 'ADMIN']);

export const markAttendanceSchema = z.object({
  body: z.object({
    enrollment_class_id: z.number().int().positive(),
    status: z.nativeEnum(AttendanceStatus).optional(),
    side: attendanceSideSchema.optional(),
    lesson_topic: z.string().nullable().optional(),
    teacher_note: z.string().nullable().optional(),
    cs_note: z.string().nullable().optional(),
  }),
});

export const bulkMarkAttendanceSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      enrollment_class_id: z.number().int().positive(),
      status: z.nativeEnum(AttendanceStatus),
      lesson_topic: z.string().nullable().optional(),
      teacher_note: z.string().nullable().optional(),
      cs_note: z.string().nullable().optional(),
    })).min(1),
    side: attendanceSideSchema.optional(),
  }),
});

export const updateAttendanceSchema = z.object({
  body: z.object({
    status: z.nativeEnum(AttendanceStatus).optional(),
    side: attendanceSideSchema.optional(),
    lesson_topic: z.string().nullable().optional(),
    teacher_note: z.string().nullable().optional(),
    cs_note: z.string().nullable().optional(),
  }),
});

export const listAttendanceSchema = z.object({
  query: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
    status: z.nativeEnum(AttendanceStatus).optional(),
    enrollment_class_id: z.number().int().positive().optional(),
  }),
});
