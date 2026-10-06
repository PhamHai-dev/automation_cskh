import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

export const TeacherMarkSchema = z.object({
  status: z.nativeEnum(AttendanceStatus, {
    errorMap: () => ({ message: 'Trạng thái điểm danh không hợp lệ' }),
  }),
  rawValue: z.string().optional(),
  lessonTopic: z.string().optional(),
  note: z.string().optional(),
  sessionCount: z.number().positive().optional(),
});

export const CSMarkSchema = z.object({
  status: z.nativeEnum(AttendanceStatus, {
    errorMap: () => ({ message: 'Trạng thái điểm danh không hợp lệ' }),
  }),
  rawValue: z.string().optional(),
  note: z.string().optional(),
  sessionCount: z.number().positive().optional(),
});

export const ResolveConflictSchema = z.object({
  finalStatus: z.nativeEnum(AttendanceStatus, {
    errorMap: () => ({ message: 'Trạng thái chốt phân xử không hợp lệ' }),
  }),
  resolutionNote: z.string().min(1, 'Lý do giải trình phân xử là bắt buộc'),
  sessionCount: z.number().positive().optional(),
});

export const BulkApprovePendingSchema = z.object({
  attendanceIds: z.array(z.number().int().positive()).min(1, 'Danh sách ID không được rỗng'),
});

export const ReconciliationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  csId: z.coerce.number().int().positive().optional(),
  teacherId: z.coerce.number().int().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
});
