/**
 * student-care-group-matcher.test.ts
 *
 * Unit tests for Automatic Student Care Group Sync & Matching Engine:
 *   - parseStudentCareGroupName across standard & edge-case group naming conventions
 *   - formatExpectedCareGroupPrefix
 *   - syncAndMatchCareGroups matching ZaloGroup and LineGroup to eligible students,
 *     upserting ZaloContactRelation and LineContactRelation with target_type: 'GROUP',
 *     and computing accurate statistics & unlinkedItems.
 */

const mockEmit = jest.fn();

jest.mock('../../../shared/realtime/socket-singleton', () => ({
  getIo: jest.fn(() => ({ emit: mockEmit })),
  emitToAccount: jest.fn(),
}));

jest.mock('../../../prisma/client', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    student: {
      findMany: jest.fn(),
    },
    zaloGroup: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    lineGroup: {
      findMany: jest.fn(),
    },
    lineAccount: {
      findMany: jest.fn(),
    },
    zaloContactRelation: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    lineContactRelation: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../zalo-pool', () => ({
  zaloPool: {
    getActiveAccountIds: jest.fn(() => []),
    getAccountClient: jest.fn(() => null),
  },
}));

import { prisma } from '../../../prisma/client';
import {
  parseStudentCareGroupName,
  formatExpectedCareGroupPrefix,
  syncAndMatchCareGroups,
} from '../student-care-group-matcher.service';
import { runStudentCareGroupAutoSync } from '../student-care-group.contract';

describe('Student Care Group Matcher Service (student-care-group-matcher.service.ts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseStudentCareGroupName', () => {
    test('parses standard "01 - 427901798 Nguyễn Văn An - N5" format', () => {
      const parsed = parseStudentCareGroupName('01 - 427901798 Nguyễn Văn An - N5');
      expect(parsed).toEqual({
        rawName: '01 - 427901798 Nguyễn Văn An - N5',
        csNumberPadded: '01',
        csCode: 'CVHT01',
        studentExternalId: '427901798',
        remainderText: 'Nguyễn Văn An - N5',
      });
    });

    test('parses "CVHT02 - 998877112 - Lớp N4" format', () => {
      const parsed = parseStudentCareGroupName('CVHT02 - 998877112 - Lớp N4');
      expect(parsed).toEqual({
        rawName: 'CVHT02 - 998877112 - Lớp N4',
        csNumberPadded: '02',
        csCode: 'CVHT02',
        studentExternalId: '998877112',
        remainderText: '- Lớp N4',
      });
    });

    test('parses bracketed and unpadded "[3] - HV_101 Đặng Quốc Huy" format', () => {
      const parsed = parseStudentCareGroupName('[03] - HV_101 Đặng Quốc Huy');
      expect(parsed).toEqual({
        rawName: '[03] - HV_101 Đặng Quốc Huy',
        csNumberPadded: '03',
        csCode: 'CVHT03',
        studentExternalId: 'HV_101',
        remainderText: 'Đặng Quốc Huy',
      });

      const unpadded = parseStudentCareGroupName('1 - HV_001 Trần Thị B');
      expect(unpadded).toEqual({
        rawName: '1 - HV_001 Trần Thị B',
        csNumberPadded: '01',
        csCode: 'CVHT01',
        studentExternalId: 'HV_001',
        remainderText: 'Trần Thị B',
      });
    });

    test('returns null for invalid or non-care group names', () => {
      expect(parseStudentCareGroupName(null)).toBeNull();
      expect(parseStudentCareGroupName('')).toBeNull();
      expect(parseStudentCareGroupName('Nhóm thông báo chung Edura')).toBeNull();
      expect(parseStudentCareGroupName('Lớp N5 K42 - Thầy Tanaka')).toBeNull();
      expect(parseStudentCareGroupName('00 - 123456')).toBeNull();
    });
  });

  describe('formatExpectedCareGroupPrefix', () => {
    test('formats expected prefix from CS code or number and student external_id', () => {
      expect(formatExpectedCareGroupPrefix('CVHT01', '427901798')).toBe('01 - 427901798');
      expect(formatExpectedCareGroupPrefix('CVHT2', 'HV_005')).toBe('02 - HV_005');
      expect(formatExpectedCareGroupPrefix(3, '998877')).toBe('03 - 998877');
    });
  });

  describe('syncAndMatchCareGroups', () => {
    test('matches ZaloGroup and LineGroup to eligible students, upserts GROUP relations, and reports linked & unlinked items', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 10, code: 'CVHT01', roles: ['CS'] },
        { id: 20, code: 'CVHT02', roles: ['CS'] },
      ]);

      (prisma.student.findMany as jest.Mock).mockResolvedValue([
        {
          id: 101,
          external_id: '427901798',
          full_name: 'Nguyễn Văn An',
          enrollments: [
            {
              id: 501,
              cs: { id: 10, code: 'CVHT01', name: 'Trần Thị Hải Yến', email: 'yen@edura.vn' },
            },
          ],
          zalo_contact_relations: [],
          line_contact_relations: [],
        },
        {
          id: 102,
          external_id: 'HV_005',
          full_name: 'Hoàng Thu Trang',
          enrollments: [
            {
              id: 502,
              cs: { id: 20, code: 'CVHT02', name: 'Lê Minh Tuấn', email: 'tuan@edura.vn' },
            },
          ],
          zalo_contact_relations: [],
          line_contact_relations: [],
        },
        {
          id: 103,
          external_id: '888999000',
          full_name: 'Phạm Quốc Bảo',
          enrollments: [
            {
              id: 503,
              cs: { id: 10, code: 'CVHT01', name: 'Trần Thị Hải Yến', email: 'yen@edura.vn' },
            },
          ],
          zalo_contact_relations: [],
          line_contact_relations: [],
        },
      ]);

      (prisma.zaloGroup.findMany as jest.Mock).mockResolvedValue([
        {
          id: 1,
          zalo_group_id: 'zg_427901798',
          name: '01 - 427901798 Nguyễn Văn An - N5',
          avatar_url: 'https://cdn.zalo.me/avt1.jpg',
          member_count: 4,
          zalo_account_id: 7,
          zalo_account: {
            id: 7,
            cs_id: 10,
            status: 'ACTIVE',
            display_name: 'CS Hải Yến Zalo',
          },
        },
      ]);

      (prisma.lineGroup.findMany as jest.Mock).mockResolvedValue([
        {
          id: 2,
          line_group_id: 'C_line_hv005',
          name: '02 - HV_005 Hoàng Thu Trang',
          avatar_url: 'https://cdn.line.me/avt2.jpg',
          member_count: 3,
          line_account_id: 9,
          line_account: {
            id: 9,
            cs_id: 20,
            status: 'ACTIVE',
            display_name: 'CS Minh Tuấn LINE',
          },
        },
      ]);

      (prisma.zaloContactRelation.upsert as jest.Mock).mockResolvedValue({ id: 9001 });
      (prisma.lineContactRelation.upsert as jest.Mock).mockResolvedValue({ id: 9002 });

      const report = await syncAndMatchCareGroups({
        triggeredBy: 'manual',
        refreshLiveGroups: false,
      });

      // Verify ZaloContactRelation upsert for student 101
      expect(prisma.zaloContactRelation.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.zaloContactRelation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            student_id_zalo_account_id: {
              student_id: 101,
              zalo_account_id: 7,
            },
          },
          create: expect.objectContaining({
            student_id: 101,
            zalo_account_id: 7,
            relation_status: 'FRIEND',
            target_type: 'GROUP',
            zalo_group_id: 1,
            friend_zalo_uid: 'zg_427901798',
            display_name: '01 - 427901798 Nguyễn Văn An - N5',
            avatar_url: 'https://cdn.zalo.me/avt1.jpg',
            matched_by: 'AUTO_GROUP_NAME',
          }),
        }),
      );

      // Verify LineContactRelation upsert for student 102
      expect(prisma.lineContactRelation.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.lineContactRelation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            student_id_line_account_id: {
              student_id: 102,
              line_account_id: 9,
            },
          },
          create: expect.objectContaining({
            student_id: 102,
            line_account_id: 9,
            relation_status: 'FRIEND',
            target_type: 'GROUP',
            line_group_id: 2,
            friend_line_uid: 'C_line_hv005',
            display_name: '02 - HV_005 Hoàng Thu Trang',
            avatar_url: 'https://cdn.line.me/avt2.jpg',
            matched_by: 'AUTO_GROUP_NAME',
          }),
        }),
      );

      // Verify report counts
      expect(report.totalEligibleStudents).toBe(3);
      expect(report.linkedStudentsCount).toBe(2);
      expect(report.unlinkedStudentsCount).toBe(1);
      expect(report.newlyLinkedZaloCount).toBe(1);
      expect(report.newlyLinkedLineCount).toBe(1);

      // Verify linked items
      expect(report.linkedItems).toHaveLength(2);
      expect(report.linkedItems[0]).toEqual(
        expect.objectContaining({
          studentId: 101,
          studentExternalId: '427901798',
          csCode: 'CVHT01',
          zaloLinked: true,
          zaloGroupName: '01 - 427901798 Nguyễn Văn An - N5',
          zaloGroupId: 'zg_427901798',
          zaloAccountId: 7,
          lineLinked: false,
          newlyLinked: true,
        }),
      );
      expect(report.linkedItems[1]).toEqual(
        expect.objectContaining({
          studentId: 102,
          studentExternalId: 'HV_005',
          csCode: 'CVHT02',
          zaloLinked: false,
          lineLinked: true,
          lineGroupName: '02 - HV_005 Hoàng Thu Trang',
          lineGroupId: 'C_line_hv005',
          lineAccountId: 9,
          newlyLinked: true,
        }),
      );

      // Verify unlinked items with expectedGroupPrefix & suggestedGroupName
      expect(report.unlinkedItems).toHaveLength(1);
      expect(report.unlinkedItems[0]).toEqual(
        expect.objectContaining({
          studentId: 103,
          studentExternalId: '888999000',
          studentName: 'Phạm Quốc Bảo',
          csId: 10,
          csCode: 'CVHT01',
          expectedGroupPrefix: '01 - 888999000',
          suggestedGroupName: '01 - 888999000 - Phạm Quốc Bảo',
        }),
      );
      expect(report.unlinkedItems[0].reason).toContain('01 - 888999000');

      // Verify Socket.IO events emitted
      expect(mockEmit).toHaveBeenCalledWith(
        'omnichannel:sync-progress',
        expect.objectContaining({
          status: 'PROCESSING',
          stage: 'SYNCING_GROUPS',
          triggeredBy: 'manual',
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith('omnichannel:sync-complete', report);
    });

    test('ignores orphan/archived FRIEND relations with null group/uid/display_name and formats valid USER links with (Cá nhân)', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 10, code: 'CVHT01', roles: ['CS'] },
      ]);

      (prisma.student.findMany as jest.Mock).mockResolvedValue([
        {
          id: 201,
          external_id: 'HV_GHOST_01',
          full_name: 'Học Viên Ghost Seed',
          enrollments: [
            {
              id: 601,
              cs: { id: 10, code: 'CVHT01', name: 'Trần Thị Hải Yến', email: 'yen@edura.vn' },
            },
          ],
          // Old seed row with relation_status: 'FRIEND' but no group, no friend UID, no display_name
          zalo_contact_relations: [
            {
              id: 1,
              student_id: 201,
              zalo_account_id: 1,
              relation_status: 'FRIEND',
              target_type: 'USER',
              zalo_group_id: null,
              friend_zalo_uid: null,
              display_name: null,
              zalo_account: { id: 1, display_name: 'Old Nick', status: 'DISABLED', archived_at: null },
              zalo_group: null,
            },
          ],
          line_contact_relations: [],
        },
        {
          id: 202,
          external_id: 'HV_ARCHIVED_02',
          full_name: 'Học Viên Nick Đã Lưu Trữ',
          enrollments: [
            {
              id: 602,
              cs: { id: 10, code: 'CVHT01', name: 'Trần Thị Hải Yến', email: 'yen@edura.vn' },
            },
          ],
          // Relation pointing to an archived Zalo account
          zalo_contact_relations: [
            {
              id: 2,
              student_id: 202,
              zalo_account_id: 2,
              relation_status: 'FRIEND',
              target_type: 'USER',
              zalo_group_id: null,
              friend_zalo_uid: 'uid_archived',
              display_name: 'Nick Archived',
              zalo_account: {
                id: 2,
                display_name: 'Archived Nick',
                status: 'DISABLED',
                archived_at: new Date('2026-01-01T00:00:00Z'),
              },
              zalo_group: null,
            },
          ],
          line_contact_relations: [],
        },
        {
          id: 203,
          external_id: 'HV_USER_FRIEND_03',
          full_name: 'Lê Thị Mai',
          enrollments: [
            {
              id: 603,
              cs: { id: 10, code: 'CVHT01', name: 'Trần Thị Hải Yến', email: 'yen@edura.vn' },
            },
          ],
          // Valid 1-1 USER friend link on active non-archived account
          zalo_contact_relations: [
            {
              id: 3,
              student_id: 203,
              zalo_account_id: 7,
              relation_status: 'FRIEND',
              target_type: 'USER',
              zalo_group_id: null,
              friend_zalo_uid: 'zalo_uid_mai_203',
              display_name: 'Mai Lê Zalo',
              zalo_account: {
                id: 7,
                display_name: 'CS Hải Yến Zalo',
                status: 'ACTIVE',
                archived_at: null,
              },
              zalo_group: null,
            },
          ],
          line_contact_relations: [
            {
              id: 4,
              student_id: 203,
              line_account_id: 9,
              relation_status: 'FRIEND',
              target_type: 'USER',
              line_group_id: null,
              friend_line_uid: 'U_line_mai_203',
              display_name: 'Mai Lê LINE',
              line_account: {
                id: 9,
                display_name: 'CS Hải Yến LINE',
                status: 'ACTIVE',
                archived_at: null,
              },
              line_group: null,
            },
          ],
        },
      ]);

      (prisma.zaloGroup.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.lineGroup.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.zaloContactRelation.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

      const report = await syncAndMatchCareGroups({
        triggeredBy: 'manual',
        refreshLiveGroups: false,
      });

      // Orphan cleanup was executed
      expect(prisma.zaloContactRelation.deleteMany).toHaveBeenCalledTimes(1);

      // Only student 203 is counted as linked; students 201 and 202 are unlinked
      expect(report.totalEligibleStudents).toBe(3);
      expect(report.linkedStudentsCount).toBe(1);
      expect(report.unlinkedStudentsCount).toBe(2);

      expect(report.linkedItems).toHaveLength(1);
      expect(report.linkedItems[0]).toEqual(
        expect.objectContaining({
          studentId: 203,
          zaloLinked: true,
          zaloGroupName: 'Mai Lê Zalo (Cá nhân)',
          zaloGroupId: 'zalo_uid_mai_203',
          zaloAccountId: 7,
          lineLinked: true,
          lineGroupName: 'Mai Lê LINE (Cá nhân)',
          lineGroupId: 'U_line_mai_203',
          lineAccountId: 9,
          newlyLinked: false,
        }),
      );

      expect(report.unlinkedItems.map((u) => u.studentId)).toEqual([201, 202]);
    });

    test('registers runner with student-care-group.contract so runStudentCareGroupAutoSync works', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.student.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.zaloGroup.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.lineGroup.findMany as jest.Mock).mockResolvedValue([]);

      const report = await runStudentCareGroupAutoSync({ triggeredBy: 'import' });
      expect(report).not.toBeNull();
      expect(report?.triggeredBy).toBe('import');
    });
  });
});
