import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import { prisma } from '../../../prisma/client';
import { errorMiddleware } from '../../../middlewares/error.middleware';
import { omnichannelRouter } from '../omnichannel.routes';

jest.mock('../../../prisma/client', () => ({ prisma: {
  appSetting: { findUnique: jest.fn().mockResolvedValue(null) },
  user: { findUnique: jest.fn() }, manageAssignment: { findMany: jest.fn() },
  zaloAccount: { findMany: jest.fn() }, lineAccount: { findMany: jest.fn() },
  zaloGroup: { findMany: jest.fn() }, lineGroup: { findMany: jest.fn() },
} }));

const db = prisma as any;
const app = express(); app.use('/api/v1/omnichannel', omnichannelRouter); app.use(errorMiddleware);
const url = '/api/v1/omnichannel/groups';
const student = (id: number, withClass = true) => ({ id, full_name: `Student ${id}`, external_id: `HV-${id}`,
  enrollments: [{ program_type: 'KAIWA', enrollment_classes: withClass ? [{ class: { id: 101, class_name: 'Class A', class_code: 'A-01' } }, { class: { id: 101, class_name: 'Class A', class_code: 'A-01' } }] : [] }] });
const group = (id: number, relations: any[] = []) => ({ id, zalo_group_id: `z-${id}`, zalo_account_id: 5, name: `Zalo ${id}`, avatar_url: null, member_count: null, last_synced_at: null,
  zalo_contact_relations: relations });
const auth = (id = 11) => `Bearer ${jwt.sign({ id }, env.JWT_SECRET, { expiresIn: '5m' })}`;

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: 11, active: true, roles: ['CS'] });
  db.manageAssignment.findMany.mockResolvedValue([{ cs_group: { members: [{ user_id: 22 }] } }]);
  db.zaloAccount.findMany.mockResolvedValue([{ id: 5, display_name: 'Zalo CS', status: 'ACTIVE' }]);
  db.lineAccount.findMany.mockResolvedValue([{ id: 5, display_name: 'LINE CS', status: 'ACTIVE' }]);
  db.zaloGroup.findMany.mockResolvedValue([
    group(1, [{ program_type: 'KAIWA', zalo_account_id: 5, student: student(1) }]),
    group(2), // Synced but unlinked.
    group(3, [{ program_type: 'KAIWA', zalo_account_id: 5, student: student(3, false) }]), // Linked to a student, no class.
    group(4, [{ program_type: 'KAIWA', zalo_account_id: 999, student: student(4) }]), // Wrong-account relation.
  ]);
  db.lineGroup.findMany.mockResolvedValue([{ id: 1, line_group_id: 'l-1', line_account_id: 5, name: 'LINE class', avatar_url: null, member_count: 0, last_synced_at: null,
    line_contact_relations: [{ program_type: 'KAIWA', line_account_id: 5, student: student(2) }] }]);
});

test('class-linked scope excludes synced-only, classless and wrong-account relations', async () => {
  const response = await request(app).get(`${url}?scope=class-linked`).set('Authorization', auth()).expect(200);
  expect(response.body.meta.total).toBe(2);
  expect(response.body.data.map((g: any) => g.key).sort()).toEqual(['LINE:5:l-1', 'ZALO:5:z-1']);
  expect(response.body.data.every((g: any) => g.classLinks.length === 1)).toBe(true);
  expect(response.body.data.find((g: any) => g.platform === 'ZALO').memberCount).toBeNull();
  expect(response.body.data.find((g: any) => g.platform === 'LINE').memberCount).toBe(0);
});

test('all scope includes every synced group and leaves unlinked metadata empty', async () => {
  const response = await request(app).get(url).set('Authorization', auth()).expect(200);
  expect(response.body.meta.total).toBe(5);
  expect(response.body.data.find((g: any) => g.key === 'ZALO:5:z-2').classLinks).toEqual([]);
  expect(response.body.data.find((g: any) => g.key === 'ZALO:5:z-4').classLinks).toEqual([]);
  expect(response.body.meta.accounts).toHaveLength(2);
});

test('owner filtering is applied to both platforms including ADMIN and inactive stored history', async () => {
  db.user.findUnique.mockResolvedValue({ id: 77, active: true, roles: ['ADMIN'] });
  await request(app).get(url).set('Authorization', auth(77)).expect(200);
  for (const model of [db.zaloAccount, db.lineAccount]) expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cs_id: 77, archived_at: null } }));
  expect(db.zaloGroup.findMany.mock.calls[0][0].where).toEqual({ zalo_account_id: { in: [5] } });
});

test.each([
  [['CS'], { cs_id: { in: [11] } }],
  [['MANAGE', 'TEACHER'], { cs_id: { in: [11, 22] } }],
  [['ADMIN'], {}],
])('class metadata uses student scope for roles %j', async (roles, expectedScope) => {
  db.user.findUnique.mockResolvedValue({ id: 11, active: true, roles });
  await request(app).get(url).set('Authorization', auth()).expect(200);
  const relation = db.zaloGroup.findMany.mock.calls[0][0].select.zalo_contact_relations;
  expect(relation.where).toEqual({ target_type: 'GROUP', student: { enrollments: { some: expectedScope } } });
  expect(relation.select.student.select.enrollments.where).toEqual(expectedScope);
});

test('filters before pagination, clamps page and searches linked classes/students', async () => {
  const response = await request(app).get(`${url}?scope=class-linked&search=HV-1&page=99&pageSize=1`).set('Authorization', auth()).expect(200);
  expect(response.body.meta).toMatchObject({ page: 1, pageSize: 1, total: 1, totalPages: 1 });
  expect(response.body.data[0].platform).toBe('ZALO');
});

test('platform-specific account IDs cannot collide or escape ownership', async () => {
  await request(app).get(`${url}?platform=LINE&accountId=5`).set('Authorization', auth()).expect(200);
  expect(db.zaloGroup.findMany).not.toHaveBeenCalled();
  expect(db.lineGroup.findMany.mock.calls[0][0].where).toEqual({ line_account_id: { in: [5] } });
  db.lineGroup.findMany.mockClear();
  await request(app).get(`${url}?platform=LINE&accountId=999`).set('Authorization', auth()).expect(403);
  expect(db.lineGroup.findMany).not.toHaveBeenCalled();
});

test.each(['page=0', 'pageSize=101', 'scope=linked', 'platform=OTHER', 'accountId=5', 'search=' + 'a'.repeat(201), 'page=abc'])('rejects invalid filters %s', async (query) => {
  await request(app).get(`${url}?${query}`).set('Authorization', auth()).expect(400);
  expect(db.zaloGroup.findMany).not.toHaveBeenCalled();
});

test('enforces authentication, active users and channel roles', async () => {
  await request(app).get(url).expect(401);
  db.user.findUnique.mockResolvedValue({ id: 11, active: false, roles: ['CS'] });
  await request(app).get(url).set('Authorization', auth()).expect(403);
  db.user.findUnique.mockResolvedValue({ id: 11, active: true, roles: ['TEACHER'] });
  await request(app).get(url).set('Authorization', auth()).expect(403);
  expect(db.zaloGroup.findMany).not.toHaveBeenCalled();
});

test('class metadata follows persisted program, never every enrollment of the student', async () => {
  const st = student(1);
  st.enrollments.push({ program_type: 'JLPT', enrollment_classes: [{ class: { id: 202, class_name: 'JLPT class', class_code: 'N4' } }] });
  db.zaloGroup.findMany.mockResolvedValue([group(1, [{ program_type: 'JLPT', zalo_account_id: 5, student: st }])]);
  db.lineGroup.findMany.mockResolvedValue([]);
  const res = await request(app).get(`${url}?scope=class-linked&program=JLPT`).set('Authorization', auth()).expect(200);
  expect(res.body.data).toHaveLength(1);
  expect(res.body.data[0].programType).toBe('JLPT');
  expect(res.body.data[0].classLinks.map((link: any) => link.classId)).toEqual([202]);
  const kaiwa = await request(app).get(`${url}?program=KAIWA`).set('Authorization', auth()).expect(200);
  expect(kaiwa.body.data).toHaveLength(0);
});

test('legacy ALL group is reviewable in directory and does not fabricate a class/program binding', async () => {
  db.zaloGroup.findMany.mockResolvedValue([{ ...group(1, [{ program_type: 'ALL', zalo_account_id: 5, student: student(1) }]), name: '01 - HV_001 Nguyễn Văn An N4' }]);
  db.lineGroup.findMany.mockResolvedValue([]);
  const all = await request(app).get(url).set('Authorization', auth()).expect(200);
  expect(all.body.data[0]).toMatchObject({ programType: 'JLPT', levelNote: 'N4', needsProgramReview: true, classLinks: [] });
  const linked = await request(app).get(`${url}?scope=class-linked`).set('Authorization', auth()).expect(200);
  expect(linked.body.data).toHaveLength(0);
});
