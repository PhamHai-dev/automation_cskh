import { z } from 'zod';
import { AttendanceStatus, AttendanceSource } from '@prisma/client';

export const markAttendanceSchema = z.object({
  body: z.object({
    enrollment_class_id: z.number().int().positive(),
    status: z.nativeEnum(AttendanceStatus),
    session_count: z.number().positive().optional(),
    source: z.nativeEnum(AttendanceSource).optional(),
  }),
});

export const bulkMarkAttendanceSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      enrollment_class_id: z.number().int().positive(),
      status: z.nativeEnum(AttendanceStatus),
      session_count: z.number().positive().optional(),
    })),
    source: z.nativeEnum(AttendanceSource).optional(),
  }),
});

export const updateAttendanceSchema = z.object({
  body: z.object({
    status: z.nativeEnum(AttendanceStatus).optional(),
    session_count: z.number().positive().optional(),
    source: z.nativeEnum(AttendanceSource).optional(),
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
