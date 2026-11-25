import { z } from 'zod';
import { AppError } from '../../middlewares/error.middleware';
import { careGroupRulesSchema, classifyCareGroupName } from './care-group-rules';
import { careGroupSettingsRepository } from './care-group-settings.repository';

export const careGroupSettingsService = {
  read: () => careGroupSettingsRepository.read(),
  async save(body: unknown, actorId: number) {
    const parsed = careGroupRulesSchema.innerType().extend({ expectedUpdatedAt: z.string().datetime().nullable() }).strict().safeParse(body);
    if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
    const { expectedUpdatedAt, ...rules } = parsed.data;
    const validated = careGroupRulesSchema.safeParse(rules);
    if (!validated.success) throw new AppError(400, validated.error.issues[0].message);
    try { return await careGroupSettingsRepository.save(validated.data, expectedUpdatedAt, actorId); }
    catch (error: any) {
      if (error?.code === 'P2002') throw new AppError(409, 'Cấu hình đã được người khác tạo. Hãy tải lại.');
      throw error;
    }
  },
  preview(body: unknown) {
    const parsed = z.object({ config: careGroupRulesSchema, groupName: z.string().trim().min(1).max(300), studentName: z.string().trim().min(1).max(200) }).strict().safeParse(body);
    if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
    return classifyCareGroupName(parsed.data.groupName, parsed.data.config, parsed.data.studentName);
  },
};
