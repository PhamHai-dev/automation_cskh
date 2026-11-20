import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import type { AuthUser } from '../../middlewares/auth.middleware';
import { getStudentCsScope } from '../students/students.repository';

const accountSelect = { id: true, display_name: true, status: true } as const;

export const omnichannelRepository = {
  async listAccounts(ownerId: number) {
    const where = { cs_id: ownerId, archived_at: null };
    const [zalo, line] = await Promise.all([
      prisma.zaloAccount.findMany({ where, select: accountSelect }),
      prisma.lineAccount.findMany({ where, select: accountSelect }),
    ]);
    return { zalo, line };
  },
  async listGroups(actor: AuthUser, zaloAccountIds: number[], lineAccountIds: number[]) {
    const csIds = await getStudentCsScope(actor);
    const enrollmentWhere: Prisma.EnrollmentWhereInput = csIds ? { cs_id: { in: csIds } } : {};
    const studentSelect = {
      id: true, external_id: true, full_name: true,
      enrollments: {
        where: enrollmentWhere,
        select: { program_type: true, enrollment_classes: { select: { class: { select: { id: true, class_code: true, class_name: true } } } } },
      },
    } as const;
    const relationWhere = { target_type: 'GROUP', relation_status: 'FRIEND' as const, student: { enrollments: { some: enrollmentWhere } } };
    const [zalo, line] = await Promise.all([
      zaloAccountIds.length ? prisma.zaloGroup.findMany({
        where: { zalo_account_id: { in: zaloAccountIds } },
        select: { id: true, zalo_group_id: true, zalo_account_id: true, name: true, avatar_url: true, member_count: true, last_synced_at: true,
          zalo_contact_relations: { where: relationWhere, select: { program_type: true, zalo_account_id: true, student: { select: studentSelect } } } },
      }) : Promise.resolve([]),
      lineAccountIds.length ? prisma.lineGroup.findMany({
        where: { line_account_id: { in: lineAccountIds } },
        select: { id: true, line_group_id: true, line_account_id: true, name: true, avatar_url: true, member_count: true, last_synced_at: true,
          line_contact_relations: { where: relationWhere, select: { program_type: true, line_account_id: true, student: { select: studentSelect } } } },
      }) : Promise.resolve([]),
    ]);
    return { zalo, line };
  },
};
