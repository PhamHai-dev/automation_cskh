import type { AuthUser } from '../../middlewares/auth.middleware';
import { AppError } from '../../middlewares/error.middleware';
import { omnichannelRepository } from './omnichannel.repository';
import type { GroupListQuery } from './omnichannel.schema';
import type { GroupAccount, GroupClassLink, OmnichannelGroup } from './omnichannel.types';

import { careGroupSettingsRepository } from './care-group-settings.repository';
import { classifyCareGroupName, type CareProgram } from './care-group-rules';

interface LinkedStudent {
  id: number; external_id: string | null; full_name: string;
  enrollments: { program_type: string; enrollment_classes: { class: { id: number; class_name: string; class_code: string | null } }[] }[];
}
function classLinks(relations: { program_type: string; student: LinkedStudent }[]): GroupClassLink[] {
  const links = new Map<string, GroupClassLink>();
  for (const relation of relations) for (const enrollment of relation.student.enrollments) for (const assignment of enrollment.enrollment_classes) {
    if (!['KAIWA', 'JLPT'].includes(relation.program_type) || enrollment.program_type !== relation.program_type) continue;
    const student = relation.student;
    const cls = assignment.class;
    links.set(`${student.id}:${enrollment.program_type}:${cls.id}`, { programType: enrollment.program_type as CareProgram, studentId: student.id, studentName: student.full_name, studentExternalId: student.external_id,
      classId: cls.id, className: cls.class_name, classCode: cls.class_code });
  }
  return [...links.values()];
}

export const omnichannelService = {
  async listGroups(actor: AuthUser, query: GroupListQuery) {
    const rules = await careGroupSettingsRepository.read();
    const classification = (name: string | null, relations: { program_type: string }[]) => {
      const parsed = classifyCareGroupName(name, rules);
      const programs = [...new Set(relations.map(r => r.program_type).filter(p => p !== 'ALL'))];
      return { programType: (programs.length === 1 ? programs[0] : programs.length > 1 ? null : parsed?.programType || null) as CareProgram | null, levelNote: parsed?.levelNote || null, needsProgramReview: relations.some(r => r.program_type === 'ALL') || programs.length > 1 };
    };
    const owned = await omnichannelRepository.listAccounts(actor.id);
    const accounts: GroupAccount[] = [
      ...owned.zalo.map((a): GroupAccount => ({ id: a.id, platform: 'ZALO', name: a.display_name || `Zalo #${a.id}`, status: a.status })),
      ...owned.line.map((a): GroupAccount => ({ id: a.id, platform: 'LINE', name: a.display_name || `LINE #${a.id}`, status: a.status })),
    ];
    if (query.accountId && !accounts.some((a) => a.id === query.accountId && a.platform === query.platform)) throw new AppError(403, 'Bạn không có quyền truy cập tài khoản này');
    const selectedAccounts = accounts.filter((a) => (query.platform === 'ALL' || a.platform === query.platform) && (!query.accountId || a.id === query.accountId));
    const rows = await omnichannelRepository.listGroups(actor, selectedAccounts.filter((a) => a.platform === 'ZALO').map((a) => a.id), selectedAccounts.filter((a) => a.platform === 'LINE').map((a) => a.id));
    const accountMap = new Map(accounts.map((a) => [`${a.platform}:${a.id}`, a]));
    const groups: OmnichannelGroup[] = [
      ...rows.zalo.map((g): OmnichannelGroup => ({ ...classification(g.name, g.zalo_contact_relations.filter(r => r.zalo_account_id === g.zalo_account_id)), key: `ZALO:${g.zalo_account_id}:${g.zalo_group_id}`, id: g.id, platform: 'ZALO', account: accountMap.get(`ZALO:${g.zalo_account_id}`)!,
        externalGroupId: g.zalo_group_id, name: g.name || g.zalo_group_id, avatarUrl: g.avatar_url, memberCount: g.member_count, lastSyncedAt: g.last_synced_at?.toISOString() || null,
        classLinks: classLinks(g.zalo_contact_relations.filter((r) => r.zalo_account_id === g.zalo_account_id)) })),
      ...rows.line.map((g): OmnichannelGroup => ({ ...classification(g.name, g.line_contact_relations.filter(r => r.line_account_id === g.line_account_id)), key: `LINE:${g.line_account_id}:${g.line_group_id}`, id: g.id, platform: 'LINE', account: accountMap.get(`LINE:${g.line_account_id}`)!,
        externalGroupId: g.line_group_id, name: g.name || g.line_group_id, avatarUrl: g.avatar_url, memberCount: g.member_count, lastSyncedAt: g.last_synced_at?.toISOString() || null,
        classLinks: classLinks(g.line_contact_relations.filter((r) => r.line_account_id === g.line_account_id)) })),
    ];
    const search = query.search.toLocaleLowerCase('vi');
    const filtered = [...new Map(groups.map((g) => [g.key, g])).values()].filter((g) => {
      if (query.program !== 'ALL' && g.programType !== query.program) return false;
      if (query.scope === 'class-linked' && !g.classLinks.length) return false;
      return !search || [g.name, g.externalGroupId, g.account.name, ...g.classLinks.flatMap((link) => [link.className, link.classCode || '', link.studentName, link.studentExternalId || ''])]
        .some((value) => value.toLocaleLowerCase('vi').includes(search));
    }).sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.key.localeCompare(b.key));
    const totalPages = Math.max(1, Math.ceil(filtered.length / query.pageSize));
    const page = Math.min(query.page, totalPages);
    return { data: filtered.slice((page - 1) * query.pageSize, page * query.pageSize), meta: { page, pageSize: query.pageSize, total: filtered.length, totalPages, accounts } };
  },
};
