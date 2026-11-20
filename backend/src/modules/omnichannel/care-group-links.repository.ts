import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import type { CareProgram } from './care-group-rules';

/** Conditional writes keep an overlapping manual selection authoritative. */
export const careGroupLinksRepository = {
  async selectManualZalo(args: Prisma.ZaloContactRelationUpsertArgs, ownerId: number) {
    return prisma.$transaction(async tx => {
      const relation = await tx.zaloContactRelation.upsert(args);
      if (relation.program_type !== 'ALL') await tx.zaloContactRelation.updateMany({ where: {
        student_id: relation.student_id, program_type: relation.program_type, id: { not: relation.id },
        target_type: 'GROUP', zalo_account: { cs_id: ownerId },
      }, data: { relation_status: 'UNKNOWN' } });
      return relation;
    });
  },
  async selectManualLine(args: Prisma.LineContactRelationUpsertArgs, ownerId: number) {
    return prisma.$transaction(async tx => {
      const relation = await tx.lineContactRelation.upsert(args);
      if (relation.program_type !== 'ALL') await tx.lineContactRelation.updateMany({ where: {
        student_id: relation.student_id, program_type: relation.program_type, id: { not: relation.id },
        target_type: 'GROUP', line_account: { cs_id: ownerId },
      }, data: { relation_status: 'UNKNOWN' } });
      return relation;
    });
  },
  async matchZalo(studentId: number, program: CareProgram, group: { id: number; zalo_account_id: number; zalo_group_id: string; name: string | null; avatar_url: string | null }) {
    const key = { student_id: studentId, zalo_account_id: group.zalo_account_id, program_type: program };
    const data = { relation_status: 'FRIEND' as const, target_type: 'GROUP', zalo_group_id: group.id, friend_zalo_uid: group.zalo_group_id,
      display_name: group.name, avatar_url: group.avatar_url, matched_by: 'AUTO_GROUP_NAME', last_checked_at: new Date() };
    const initial = await prisma.zaloContactRelation.upsert({ where: { student_id_zalo_account_id: key }, create: { ...key, ...data }, update: {} });
    await prisma.zaloContactRelation.updateMany({ where: { id: initial.id, OR: [{ matched_by: null }, { matched_by: { not: 'MANUAL' } }] }, data });
    return prisma.zaloContactRelation.findUnique({ where: { id: initial.id }, include: { zalo_group: true } });
  },
  async matchLine(studentId: number, program: CareProgram, group: { id: number; line_account_id: number; line_group_id: string; name: string | null; avatar_url: string | null }) {
    const key = { student_id: studentId, line_account_id: group.line_account_id, program_type: program };
    const data = { relation_status: 'FRIEND' as const, target_type: 'GROUP', line_group_id: group.id, friend_line_uid: group.line_group_id,
      display_name: group.name, avatar_url: group.avatar_url, matched_by: 'AUTO_GROUP_NAME', last_checked_at: new Date() };
    const initial = await prisma.lineContactRelation.upsert({ where: { student_id_line_account_id: key }, create: { ...key, ...data }, update: {} });
    await prisma.lineContactRelation.updateMany({ where: { id: initial.id, OR: [{ matched_by: null }, { matched_by: { not: 'MANUAL' } }] }, data });
    return prisma.lineContactRelation.findUnique({ where: { id: initial.id }, include: { line_group: true } });
  },
  async suspendAutomatic(platform: 'ZALO' | 'LINE', relationId: number) {
    const where = { id: relationId, matched_by: 'AUTO_GROUP_NAME' };
    if (platform === 'ZALO') await prisma.zaloContactRelation.updateMany({ where, data: { relation_status: 'UNKNOWN' } });
    else await prisma.lineContactRelation.updateMany({ where, data: { relation_status: 'UNKNOWN' } });
  },
};
