import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD');

const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

function validateDateRange<T extends { fromDate?: string; toDate?: string }>(value: T, ctx: z.RefinementCtx) {
  if (!value.fromDate || !value.toDate) return;
  const from = new Date(`${value.fromDate}T00:00:00.000Z`);
  const to = new Date(`${value.toDate}T00:00:00.000Z`);
  if (from > to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi' });
    return;
  }
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > 30) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'Chỉ được truy vấn tối đa 30 ngày lịch sử' });
  }
}

export const auditLogQuerySchema = z
  .object({
    module: z.enum(['ALL', 'ENROLLMENT', 'ATTENDANCE', 'CARE', 'MESSAGING', 'IMPORT_SYNC', 'SYSTEM']).default('ALL'),
    action: z.string().trim().max(100).optional(),
    actorId: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(200).optional(),
    fromDate: dateOnlySchema.optional(),
    toDate: dateOnlySchema.optional(),
    ...paginationSchema,
  })
  .superRefine(validateDateRange);

export const loginAuditQuerySchema = z
  .object({
    status: z.enum(['ALL', 'SUCCESS', 'FAILED', 'LOCKED', 'DISABLED']).default('ALL'),
    actorId: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(200).optional(),
    fromDate: dateOnlySchema.optional(),
    toDate: dateOnlySchema.optional(),
    ...paginationSchema,
  })
  .superRefine(validateDateRange);

export const activityExportQuerySchema = z
  .object({
    view: z.enum(['audit', 'sync', 'backup', 'login']),
    module: z.enum(['ALL', 'ENROLLMENT', 'ATTENDANCE', 'CARE', 'MESSAGING', 'IMPORT_SYNC', 'SYSTEM']).optional(),
    status: z.string().trim().max(50).optional(),
    actorId: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(200).optional(),
    programType: z.string().trim().max(50).optional(),
    fromDate: dateOnlySchema.optional(),
    toDate: dateOnlySchema.optional(),
  })
  .superRefine(validateDateRange);

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
export type LoginAuditQueryInput = z.infer<typeof loginAuditQuerySchema>;
export type ActivityExportQueryInput = z.infer<typeof activityExportQuerySchema>;
