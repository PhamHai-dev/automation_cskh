import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

const attendanceSideSchema = z.enum(['TEACHER', 'CS']);

export const markAttendanceSchema = z.object({
  body: z.object({
    enrollment_class_id: z.number().int().positive(),
    status: z.nativeEnum(AttendanceStatus),
    side: attendanceSideSchema.optional(),
  }),
});

export const bulkMarkAttendanceSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      enrollment_class_id: z.number().int().positive(),
      status: z.nativeEnum(AttendanceStatus),
    })).min(1),
    side: attendanceSideSchema.optional(),
  }),
});

export const updateAttendanceSchema = z.object({
  body: z.object({
    status: z.nativeEnum(AttendanceStatus),
    side: attendanceSideSchema.optional(),
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
