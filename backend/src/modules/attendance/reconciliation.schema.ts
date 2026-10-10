import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

const attendanceStatusSchema = z.nativeEnum(AttendanceStatus, {
  errorMap: () => ({ message: 'Trạng thái điểm danh không hợp lệ' }),
});

const nullableText = (max: number) => z.string().trim().max(max).optional();

export const TeacherMarkSchema = z.object({
  status: attendanceStatusSchema,
  rawValue: nullableText(100),
  lessonTopic: nullableText(500),
  note: nullableText(1000),
});

export const CSMarkSchema = z.object({
  status: attendanceStatusSchema,
  rawValue: nullableText(100),
  note: nullableText(1000),
});

export const ResolveConflictSchema = z.object({
  finalStatus: attendanceStatusSchema,
  resolutionNote: z.string().trim().min(1, 'Lý do giải trình phân xử là bắt buộc').max(1000),
});

export const BulkApprovePendingSchema = z.object({
  attendanceIds: z.array(z.number().int().positive())
    .min(1, 'Danh sách ID không được rỗng')
    .max(100, 'Chỉ được duyệt tối đa 100 bản ghi mỗi lần')
    .refine((ids) => new Set(ids).size === ids.length, 'Danh sách ID không được trùng'),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD');

export const ReconciliationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  classId: z.coerce.number().int().positive().optional(),
  csId: z.coerce.number().int().positive().optional(),
  teacherId: z.coerce.number().int().positive().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  search: z.string().trim().max(100).optional(),
}).refine(
  ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
  { message: 'startDate phải nhỏ hơn hoặc bằng endDate', path: ['endDate'] },
);

export const TeacherSessionsQuerySchema = z.object({
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  teacherId: z.coerce.number().int().positive().optional(),
}).refine(
  ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
  { message: 'startDate phải nhỏ hơn hoặc bằng endDate', path: ['endDate'] },
);
