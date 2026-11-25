import { prisma } from '../../../prisma/client';
import { syncAndMatchCareGroups } from '../student-care-group-matcher.service';
import { DEFAULT_CARE_GROUP_RULES } from '../../omnichannel/care-group-rules';

jest.mock('../../../prisma/client', () => ({ prisma: {
  appSetting: { findUnique: jest.fn() }, user: { findMany: jest.fn(), update: jest.fn() }, student: { findMany: jest.fn() },
  zaloGroup: { findMany: jest.fn() }, lineGroup: { findMany: jest.fn() },
  zaloContactRelation: { findMany: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
  lineContactRelation: { upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
} }));
jest.mock('../zalo-pool', () => ({ zaloPool: { getActiveAccountIds: () => [], getAccountClient: () => null } }));
jest.mock('../../../shared/realtime/socket-singleton', () => ({ getIo: () => null }));
const db = prisma as any;
const cs = { id: 6, code: 'CVHT01', name: 'CS Một' };
const student = () => ({ id: 1, external_id: 'HV_001', full_name: 'Nguyễn Văn An',
  enrollments: [{ id: 2, cs_id: 6, cs, program_type: 'JLPT', level: 'N2' }, { id: 1, cs_id: 6, cs, program_type: 'KAIWA', level: null }],
  zalo_contact_relations: [] as any[], line_contact_relations: [] as any[] });
const group = (id: number, name: string, platform = 'zalo', owner = 6) => ({ id, name, avatar_url: null,
  [platform + '_account_id']: 5, [platform + '_group_id']: 'group-' + id, [platform + '_account']: { id: 5, cs_id: owner, status: 'ACTIVE' } });
const relation = (platform = 'zalo', program = 'JLPT', matchedBy = 'MANUAL') => ({ id: 100, student_id: 1, program_type: program,
  target_type: 'GROUP', relation_status: 'FRIEND', matched_by: matchedBy,
  [platform + '_group_id']: 9, [platform + '_account_id']: 5, ['friend_' + platform + '_uid']: 'manual-group',
  [platform + '_account']: { cs_id: 6, status: 'ACTIVE', archived_at: null }, [platform + '_group']: { id: 9, name: 'Nhóm đã chọn', [platform + '_group_id']: 'manual-group' } });
beforeEach(() => {
  jest.resetAllMocks(); db.appSetting.findUnique.mockResolvedValue(null); db.user.findMany.mockResolvedValue([]);
  db.student.findMany.mockResolvedValue([student()]); db.zaloContactRelation.findMany.mockResolvedValue([]);
  db.zaloGroup.findMany.mockResolvedValue([]); db.lineGroup.findMany.mockResolvedValue([]);
  for (const platform of ['zalo', 'line']) {
    const model = db[platform + 'ContactRelation'];
    model.upsert.mockImplementation(async (args: any) => {
      const row = { id: 100, ...args.create, [platform + '_group']: { name: args.create.display_name, [platform + '_group_id']: args.create['friend_' + platform + '_uid'] } };
      model.findUnique.mockResolvedValue(row); return row;
    });
  }
});
test('same student + account supports Kaiwa and JLPT without overwrite; N4 group matches N2 enrollment', async () => {
  db.zaloGroup.findMany.mockResolvedValue([group(1, '01 - HV_001 Nguyễn Văn An'), group(2, '01 - HV_001 Nguyễn Văn An N4')]);
  const report = await syncAndMatchCareGroups({ csId: 6, silent: true });
  expect(report.totalEligibleStudents).toBe(2); expect(report.linkedStudentsCount).toBe(2);
  expect(db.zaloContactRelation.upsert.mock.calls.map((c: any) => c[0].create.program_type).sort()).toEqual(['JLPT', 'KAIWA']);
  expect(report.linkedItems.find(r => r.programType === 'JLPT')?.zaloGroupId).toBe('group-2');
});

test.each(['zalo', 'line'])('%s matches arbitrary JLPT suffix independently of enrollment level and examples', async platform => {
  const st = student();
  st.external_id = '420285164'; st.full_name = 'Nguyễn Hoài Ngân';
  st.enrollments = [{ ...st.enrollments[0], cs: { ...cs, code: 'CVHT02' }, level: 'N54Video' }];
  db.student.findMany.mockResolvedValue([st]);
  db.appSetting.findUnique.mockResolvedValue({ value: { ...DEFAULT_CARE_GROUP_RULES, jlptNotes: ['N54Video'] }, updated_at: new Date() });
  db[platform + 'Group'].findMany.mockResolvedValue([
    group(1, '02 - 420285164 Nguyễn Hoài Ngân VIPN4N5', platform),
    group(2, '02 - 4202851640 Nguyễn Hoài Ngân VIPN4N5', platform),
    group(3, '02 - 420285164 Nguyễn Hoài Nam VIPN4N5', platform),
  ]);
  const report = await syncAndMatchCareGroups({ csId: 6, silent: true });
  expect(report.linkedStudentsCount).toBe(1);
  expect(report.linkedItems[0]).toMatchObject({ programType: 'JLPT', studentExternalId: '420285164',
    [platform === 'zalo' ? 'zaloGroupId' : 'lineGroupId']: 'group-1' });
  expect(report.linkedItems[0].suggestedGroupName).toBe('02 - 420285164 Nguyễn Hoài Ngân [Ghi chú JLPT]');
  expect(db[platform + 'ContactRelation'].upsert).toHaveBeenCalledTimes(1);
});
test.each(['zalo','line'])('%s duplicate JLPT notes require manual choice and disable previous auto link without deletion', async platform => {
  const st = student(); st[platform === 'zalo' ? 'zalo_contact_relations' : 'line_contact_relations'] = [relation(platform, 'JLPT', 'AUTO_GROUP_NAME')];
  db.student.findMany.mockResolvedValue([st]);
  db[platform + 'Group'].findMany.mockResolvedValue([group(1, '01 - HV_001 Nguyễn Văn An N4', platform), group(2, '01 - HV_001 Nguyễn Văn An N3', platform)]);
  const report = await syncAndMatchCareGroups({ silent: true });
  expect(report.unlinkedItems.find(r => r.programType === 'JLPT')?.reason).toContain('trùng 2 nhóm');
  expect(db[platform + 'ContactRelation'].upsert).not.toHaveBeenCalled();
  expect(db[platform + 'ContactRelation'].updateMany).toHaveBeenCalledWith({ where: { id: 100, matched_by: 'AUTO_GROUP_NAME' }, data: { relation_status: 'UNKNOWN' } });
  expect(db[platform + 'ContactRelation'].deleteMany).not.toHaveBeenCalled();
});
test.each(['zalo','line'])('%s manual selection survives duplicate groups and sync', async platform => {
  const st = student(); st[platform === 'zalo' ? 'zalo_contact_relations' : 'line_contact_relations'] = [relation(platform)];
  db.student.findMany.mockResolvedValue([st]); db[platform + 'Group'].findMany.mockResolvedValue([group(1,'01 - HV_001 Nguyễn Văn An N4',platform), group(2,'01 - HV_001 Nguyễn Văn An N3',platform)]);
  const report = await syncAndMatchCareGroups({ silent: true });
  expect(report.linkedItems.find(r => r.programType === 'JLPT')?.[platform === 'zalo' ? 'zaloGroupId' : 'lineGroupId']).toBe('manual-group');
  expect(db[platform + 'ContactRelation'].upsert).not.toHaveBeenCalled(); expect(db[platform + 'ContactRelation'].updateMany).not.toHaveBeenCalled();
});
test('read-only report never refreshes, assigns codes, creates or disables relations', async () => {
  const st = student(); st.zalo_contact_relations = [relation('zalo', 'JLPT', 'AUTO_GROUP_NAME')]; db.student.findMany.mockResolvedValue([st]);
  db.zaloGroup.findMany.mockResolvedValue([group(1,'01 - HV_001 Nguyễn Văn An N4'), group(2,'01 - HV_001 Nguyễn Văn An N3')]);
  await syncAndMatchCareGroups({ applyMatches: false, refreshLiveGroups: true, silent: true });
  expect(db.user.findMany).not.toHaveBeenCalled(); expect(db.zaloContactRelation.upsert).not.toHaveBeenCalled(); expect(db.zaloContactRelation.update).not.toHaveBeenCalled();
});
test('legacy ALL groups need program review, shared USER contacts cover both programs', async () => {
  const st = student(); st.zalo_contact_relations = [relation('zalo', 'ALL')]; db.student.findMany.mockResolvedValue([st]);
  let report = await syncAndMatchCareGroups({ applyMatches: false, silent: true });
  expect(report.linkedStudentsCount).toBe(0); expect(report.unlinkedItems.every(r => r.reason.includes('chưa xác định chương trình'))).toBe(true);
  st.zalo_contact_relations = [{ ...relation('zalo', 'ALL'), target_type: 'USER', zalo_group_id: null, zalo_group: null, friend_zalo_uid: 'user-1' }];
  report = await syncAndMatchCareGroups({ applyMatches: false, silent: true }); expect(report.linkedStudentsCount).toBe(2);
});
test('rejects owner mismatch and external-ID prefix false positives, with no token fallback', async () => {
  db.zaloGroup.findMany.mockResolvedValue([group(1,'01 - HV_001 Nguyễn Văn An', 'zalo', 7), group(2,'01 - HV_0011 Nguyễn Văn An'), group(3,'Nhóm HV_001'), group(4,'02 - HV_001 Nguyễn Văn An')]);
  const report = await syncAndMatchCareGroups({ silent: true }); expect(report.linkedStudentsCount).toBe(0); expect(db.zaloContactRelation.upsert).not.toHaveBeenCalled();
});
test('reads custom naming config and can disable future auto linking', async () => {
  db.appSetting.findUnique.mockResolvedValue({ value: { ...DEFAULT_CARE_GROUP_RULES, jlptTemplate: '{csNumber} | {studentId}: {studentName} {level}', jlptNotes: ['Trung cấp'] }, updated_at: new Date() });
  db.lineGroup.findMany.mockResolvedValue([group(1,'01 | HV_001: Nguyễn Văn An Trung cấp','line')]);
  let report = await syncAndMatchCareGroups({ silent: true }); expect(report.linkedItems[0].programType).toBe('JLPT');
  db.appSetting.findUnique.mockResolvedValue({ value: { ...DEFAULT_CARE_GROUP_RULES, enabled: false }, updated_at: new Date() });
  db.lineContactRelation.upsert.mockClear(); db.zaloGroup.findMany.mockResolvedValue([group(1,'01 - HV_001 Nguyễn Văn An')]);
  report = await syncAndMatchCareGroups({ silent: true }); expect(report.linkedStudentsCount).toBe(0); expect(db.lineContactRelation.upsert).not.toHaveBeenCalled();
});
