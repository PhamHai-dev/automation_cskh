import { z } from 'zod';

export const groupListSchema = z.object({
  program: z.enum(['ALL', 'KAIWA', 'JLPT']).default('ALL'),
  scope: z.enum(['all', 'class-linked']).default('all'),
  platform: z.enum(['ALL', 'ZALO', 'LINE']).default('ALL'),
  accountId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).refine((value) => !value.accountId || value.platform !== 'ALL', { message: 'Chọn nền tảng khi lọc tài khoản', path: ['accountId'] });
export type GroupListQuery = z.infer<typeof groupListSchema>;
