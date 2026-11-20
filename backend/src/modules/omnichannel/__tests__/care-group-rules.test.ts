import { careGroupRulesSchema, classifyCareGroupName, DEFAULT_CARE_GROUP_RULES as defaults, suggestCareGroupName, programRelationWhere, lineProgramRelationWhere } from '../care-group-rules';

test.each([
  ['01 - HV_001 Nguyễn Văn An', 'KAIWA', null],
  ['01 - HV_001 Nguyễn Văn An N4', 'JLPT', 'N4'],
  ['01 - HV_001 Nguyễn Văn An N3', 'JLPT', 'N3'],
  ['02 - 420285164 Nguyễn Hoài Ngân VIPN4N5', 'JLPT', 'VIPN4N5'],
  ['02 - 420285164 Nguyễn Hoài Ngân N54Video', 'JLPT', 'N54Video'],
  ['[CVHT01] — HV_001 Nguyễn Văn An n5', 'JLPT', 'n5'],
  ['01 - 427901798123456789 Nguyễn Văn An N2', 'JLPT', 'N2'],
])('classifies %s without enrollment level', (name, programType, levelNote) => {
  const studentName = name.includes('420285164') ? 'Nguyễn Hoài Ngân' : 'Nguyễn Văn An';
  expect(classifyCareGroupName(name, defaults, studentName)).toMatchObject({ csCode: name.startsWith('02') ? 'CVHT02' : 'CVHT01', programType, levelNote });
});
test('matches exact ID boundaries and preserves Unicode', () => {
  expect(classifyCareGroupName('01 - HV_0011 Đặng Quốc Huy', defaults, 'Đặng Quốc Huy')?.studentId).toBe('HV_0011');
  expect(classifyCareGroupName('00 - HV_001 Nguyễn Văn An N4', defaults, 'Nguyễn Văn An')).toBeNull();
  expect(classifyCareGroupName('Nhóm chung', defaults, 'Nguyễn Văn An')).toBeNull();
  expect(classifyCareGroupName('01 - HV_001', defaults, 'Nguyễn Văn An')).toBeNull();
});

test('free-form suffix ignores configured examples and requires the known name boundary', () => {
  const rules = { ...defaults, jlptNotes: ['N54Video'] };
  expect(classifyCareGroupName('02 - 420285164 Nguyễn Hoài Ngân VIPN4N5', rules, 'Nguyễn Hoài Ngân'))
    .toMatchObject({ programType: 'JLPT', levelNote: 'VIPN4N5' });
  expect(classifyCareGroupName('02 - 420285164 Nguyễn Hoài Ngân VIPN4N5', rules)).toBeNull();
  expect(classifyCareGroupName('02 - 420285164 Nguyễn Hoài Ngân VIPN4N5', rules, 'Nguyễn Hoài Nam')).toBeNull();
  expect(classifyCareGroupName('02 - 420285164 Nguyễn Hoài Ngân   ', rules, 'Nguyễn Hoài Ngân'))
    .toMatchObject({ programType: 'KAIWA', levelNote: null });
});
test('supports literal custom separators and level notes with regex characters', () => {
  const rules = { ...defaults, kaiwaTemplate: '{csNumber} | {studentId}: {studentName}', jlptTemplate: '{csNumber} | {studentId}: {studentName} ({level}', jlptNotes: ['N4+)', 'Sơ cấp)'] };
  expect(careGroupRulesSchema.safeParse(rules).success).toBe(true);
  expect(classifyCareGroupName('01 | HV_001: Nguyễn Văn An (N4+)', rules, 'Nguyễn Văn An')).toMatchObject({ programType: 'JLPT', levelNote: 'N4+)' });
  expect(classifyCareGroupName('01 | HV_001: Nguyễn Văn An (N444)', rules, 'Nguyễn Văn An')).toMatchObject({ programType: 'JLPT', levelNote: 'N444)' });
});
test.each([
  { kaiwaTemplate: '{csNumber}{studentId} {studentName}' },
  { kaiwaTemplate: '{csNumber} - {studentId} {unknown}' },
  { kaiwaTemplate: '{csNumber} - {studentId} {studentName} {studentName}' },
  { jlptTemplate: '{csNumber} - {studentId} {level} {studentName}' },
  { jlptNotes: ['N4', 'n4'] }, { enabled: 'yes' },
])('rejects invalid settings %j', (override) => expect(careGroupRulesSchema.safeParse({ ...defaults, ...override }).success).toBe(false));
test('suggests from configured templates only; level is a note', () => {
  expect(suggestCareGroupName(defaults, 'JLPT', { csNumber: '01', studentId: 'HV_001', studentName: 'An', level: 'N4' })).toBe('01 - HV_001 An N4');
  expect(suggestCareGroupName(defaults, 'JLPT', { csNumber: '01', studentId: 'HV_001', studentName: 'An' })).toBe('01 - HV_001 An [Ghi chú JLPT]');
});
test('delivery predicates permit only exact program and shared personal contacts; missing program fails closed', () => {
  expect(programRelationWhere('JLPT')).toEqual({ OR: [{ program_type: 'JLPT' }, { program_type: 'ALL', target_type: 'USER', zalo_group_id: null }] });
  expect(lineProgramRelationWhere('KAIWA')).toEqual({ OR: [{ program_type: 'KAIWA' }, { program_type: 'ALL', target_type: 'USER', line_group_id: null, OR: [{ friend_line_uid: null }, { NOT: { friend_line_uid: { startsWith: 'C' } } }] }] });
  expect(programRelationWhere(undefined).OR[0].program_type).toBe('__NONE__');
});
