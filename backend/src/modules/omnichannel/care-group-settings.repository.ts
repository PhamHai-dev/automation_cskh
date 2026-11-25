import { prisma } from '../../prisma/client';
import { AppError } from '../../middlewares/error.middleware';
import { careGroupRulesSchema, DEFAULT_CARE_GROUP_RULES, type CareGroupRules } from './care-group-rules';

export const CARE_GROUP_RULES_KEY = 'omnichannel.care-group-rules.v1';
export const careGroupSettingsRepository = {
  async read() {
    const row = await prisma.appSetting.findUnique({ where: { key: CARE_GROUP_RULES_KEY } });
    if (!row) return { ...DEFAULT_CARE_GROUP_RULES, updatedAt: null };
    const parsed = careGroupRulesSchema.safeParse(row.value);
    if (!parsed.success) throw new AppError(500, 'Cấu hình quy tắc nhóm không hợp lệ; cần Admin kiểm tra');
    return { ...parsed.data, updatedAt: row.updated_at.toISOString() };
  },
  async save(rules: CareGroupRules, expectedUpdatedAt: string | null, actorId: number) {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.appSetting.findUnique({ where: { key: CARE_GROUP_RULES_KEY } });
      if ((previous?.updated_at.toISOString() || null) !== expectedUpdatedAt) throw new AppError(409, 'Cấu hình đã thay đổi. Hãy tải lại trước khi lưu.');
      if (previous) {
        const updatedAt = new Date(Math.max(Date.now(), previous.updated_at.getTime() + 1));
        const result = await tx.appSetting.updateMany({ where: { key: CARE_GROUP_RULES_KEY, updated_at: previous.updated_at }, data: { value: rules, updated_by_id: actorId, updated_at: updatedAt } });
        if (!result.count) throw new AppError(409, 'Cấu hình đã thay đổi. Hãy tải lại.');
      } else await tx.appSetting.create({ data: { key: CARE_GROUP_RULES_KEY, value: rules, updated_by_id: actorId } });
      await tx.auditLog.create({ data: { user_id: actorId, action: 'CARE_GROUP_RULES_UPDATED', entity_type: 'AppSetting', entity_id: CARE_GROUP_RULES_KEY,
        before_data: previous?.value || undefined, after_data: rules } });
    });
    return this.read();
  },
};
