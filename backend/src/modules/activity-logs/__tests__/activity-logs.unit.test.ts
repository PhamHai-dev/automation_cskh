jest.mock('../../../prisma/client', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    manageAssignment: {
      findMany: jest.fn(),
    },
    enrollment: {
      findMany: jest.fn(),
    },
    student: {
      findMany: jest.fn(),
    },
    class: {
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    loginAudit: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../../prisma/client';
import {
  classifyAuditModule,
  computeChangedFields,
  enrichAuditLogItem,
  formatActorDisplay,
  recordAuditLogSafe,
  resolveActionLabel,
} from '../audit-helper';
import { ActivityLogsService } from '../activity-logs.service';

const mockPrisma = prisma as any;

describe('activity-logs module unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. audit-helper classification & Vietnamese labels', () => {
    it('classifies module accurately from action and entity_type', () => {
      expect(classifyAuditModule('REASSIGN_CS', 'Enrollment')).toBe('ENROLLMENT');
      expect(classifyAuditModule('STUDENT_CREATED', 'Student')).toBe('ENROLLMENT');
      expect(classifyAuditModule('TRANSFER_CLASS', 'Enrollment')).toBe('ENROLLMENT');
      expect(classifyAuditModule('ATTENDANCE_CS_MARK', 'Attendance')).toBe('ATTENDANCE');
      expect(classifyAuditModule('CANCEL', 'ClassSession')).toBe('ATTENDANCE');
      expect(classifyAuditModule('CLASS_TEACHER_ASSIGNMENT_ENDED', 'class_teacher')).toBe('ATTENDANCE');
      expect(classifyAuditModule('CARE_LOG_CREATED', 'CareLog')).toBe('CARE');
      expect(classifyAuditModule('CARE_TASK_COMPLETED', 'CareTask')).toBe('CARE');
      expect(classifyAuditModule('ENROLLMENT_CARE_UPDATED', 'Enrollment')).toBe('CARE');
      expect(classifyAuditModule('WORKFLOW_CREATED', 'AutomationWorkflow')).toBe('MESSAGING');
      expect(classifyAuditModule('BROADCAST_CREATED', 'BroadcastCampaign')).toBe('MESSAGING');
      expect(classifyAuditModule('CS_PROGRAM_BACKUP', 'ProgramSheetBackupConfig')).toBe('IMPORT_SYNC');
      expect(classifyAuditModule('IMPORT_REQUEST_APPROVED', 'ImportCreateRequest')).toBe('IMPORT_SYNC');
      expect(classifyAuditModule('ATTENDANCE_IMPORT_CREATED', 'Attendance')).toBe('IMPORT_SYNC');
      expect(classifyAuditModule('USER_CREATED', 'User')).toBe('SYSTEM');
    });

    it('translates action labels into clear Vietnamese', () => {
      expect(resolveActionLabel('REASSIGN_CS', 'Enrollment')).toBe('Chuyển giao CSKH');
      expect(resolveActionLabel('REVOKE_CS_VIEWER', 'Enrollment')).toBe('Thu hồi quyền xem CSKH');
      expect(resolveActionLabel('CANCEL', 'ClassSession')).toBe('Hủy buổi học');
      expect(resolveActionLabel('CS_PROGRAM_BACKUP', 'ProgramSheetBackupConfig')).toBe(
        'Chạy Backup sổ Google Sheet',
      );
      expect(resolveActionLabel('CARE_LOG_UPSERTED', 'CareLog')).toBe('Ghi nhật ký chăm sóc');
      expect(resolveActionLabel('WORKFLOW_UPDATED', 'AutomationWorkflow')).toBe(
        'Cập nhật kịch bản tự động',
      );
      expect(resolveActionLabel('BROADCAST_CANCELLED', 'BroadcastCampaign')).toBe(
        'Hủy chiến dịch phát tin',
      );
    });

    it('computes changedFields and maps cs_id to CVHTxx display names', () => {
      const usersMap = new Map([
        [2, formatActorDisplay({ id: 2, name: 'Trần Thị Hải Yến', code: 'CVHT01', email: 'yen@test.com', roles: ['CS'] })],
        [3, formatActorDisplay({ id: 3, name: 'Nguyễn Thu Hà', code: 'CVHT02', email: 'ha@test.com', roles: ['CS'] })],
      ]);
      const ctx = {
        usersMap,
        studentsMap: new Map(),
        enrollmentsMap: new Map(),
        classesMap: new Map(),
      };

      const diffs = computeChangedFields(
        { cs_id: 2, status: 'WAITING_CLASS', updated_at: '2026-10-01' },
        { cs_id: 3, status: 'STUDYING', updated_at: '2026-10-02', _meta: { module: 'ENROLLMENT' } },
        ctx,
      );

      expect(diffs).toEqual([
        {
          field: 'cs_id',
          label: 'CSKH phụ trách',
          before: 'CVHT01 - Trần Thị Hải Yến',
          after: 'CVHT02 - Nguyễn Thu Hà',
        },
        {
          field: 'status',
          label: 'Trạng thái',
          before: 'WAITING_CLASS',
          after: 'STUDYING',
        },
      ]);
    });

    it('enriches entityLabel with student name and class code', () => {
      const usersMap = new Map([
        [2, formatActorDisplay({ id: 2, name: 'Trần Thị Hải Yến', code: 'CVHT01', email: 'yen@test.com', roles: ['CS'] })],
        [3, formatActorDisplay({ id: 3, name: 'Nguyễn Thu Hà', code: 'CVHT02', email: 'ha@test.com', roles: ['CS'] })],
      ]);
      const enrollmentsMap = new Map([
        [
          45,
          {
            id: 45,
            student_id: 100,
            cs_id: 3,
            program_type: 'KAIWA',
            student: { id: 100, full_name: 'Nguyễn Văn A', external_id: '427901798' },
          },
        ],
      ]);
      const ctx = {
        usersMap,
        studentsMap: new Map(),
        enrollmentsMap,
        classesMap: new Map(),
      };

      const enriched = enrichAuditLogItem(
        {
          id: 101,
          user_id: 2,
          action: 'REASSIGN_CS',
          entity_type: 'Enrollment',
          entity_id: '45',
          before_data: { cs_id: 2 },
          after_data: { cs_id: 3, mode: 'FULL_TRANSFER' },
          ip_address: '127.0.0.1',
          created_at: new Date('2026-11-09T08:30:00.000Z'),
        },
        ctx,
      );

      expect(enriched.actor.displayLabel).toBe('Trần Thị Hải Yến - CVHT01');
      expect(enriched.module).toBe('ENROLLMENT');
      expect(enriched.actionLabel).toBe('Chuyển giao CSKH');
      expect(enriched.entityLabel).toBe('Ghi danh #45 - Nguyễn Văn A (427901798 · KAIWA)');
      expect(enriched.summary).toContain('CVHT01 - Trần Thị Hải Yến');
      expect(enriched.summary).toContain('CVHT02 - Nguyễn Thu Hà');
    });

    it('recordAuditLogSafe swallows errors and never breaks caller', async () => {
      mockPrisma.auditLog.create.mockRejectedValueOnce(new Error('DB error'));
      await expect(
        recordAuditLogSafe({
          userId: 1,
          action: 'STUDENT_CREATED',
          entityType: 'Student',
          entityId: 10,
          afterData: { full_name: 'Test' },
        }),
      ).resolves.toBeUndefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. ActivityLogsService RBAC scope (ADMIN, MANAGE, CS)', () => {
    let service: ActivityLogsService;

    beforeEach(() => {
      service = new ActivityLogsService();
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1, name: 'Admin', code: null, staff_code: null, email: 'admin@test.com', roles: ['ADMIN'] },
        { id: 2, name: 'Hải Yến', code: 'CVHT01', staff_code: 'CVHT01', email: 'cs1@test.com', roles: ['CS'] },
        { id: 3, name: 'Thu Hà', code: 'CVHT02', staff_code: 'CVHT02', email: 'cs2@test.com', roles: ['CS'] },
        { id: 5, name: 'Quản lý A', code: null, staff_code: null, email: 'manage@test.com', roles: ['MANAGE'] },
      ]);
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.class.findMany.mockResolvedValue([]);
    });

    it('ADMIN sees all AuditLogs without user_id restriction and gets stats + moduleCounts', async () => {
      const nowIso = new Date().toISOString();
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: 10,
          user_id: 2,
          action: 'STUDENT_CREATED',
          entity_type: 'Student',
          entity_id: '88',
          before_data: null,
          after_data: { full_name: 'Lê Minh' },
          ip_address: '127.0.0.1',
          created_at: new Date(nowIso),
        },
        {
          id: 9,
          user_id: 3,
          action: 'ATTENDANCE_CS_MARK',
          entity_type: 'Attendance',
          entity_id: '500',
          before_data: { cs_status: null },
          after_data: { cs_status: 'ATTENDED' },
          ip_address: null,
          created_at: new Date(nowIso),
        },
      ]);

      const res = await service.listAuditLogs(
        { id: 1, roles: ['ADMIN'] },
        { module: 'ALL', page: 1, limit: 50 },
      );

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
      expect(res.success).toBe(true);
      expect(res.total).toBe(2);
      expect(res.stats.todayTotal).toBe(2);
      expect(res.stats.todayByModule.ENROLLMENT).toBe(1);
      expect(res.stats.todayByModule.ATTENDANCE).toBe(1);
      expect(res.moduleCounts.ALL).toBe(2);
      expect(res.moduleCounts.ENROLLMENT).toBe(1);
      expect(res.moduleCounts.ATTENDANCE).toBe(1);
    });

    it('MANAGE only sees AuditLogs from users in their ManageAssignment CSGroups + themselves', async () => {
      mockPrisma.manageAssignment.findMany.mockResolvedValue([
        { cs_group: { members: [{ user_id: 2 }, { user_id: 3 }] } },
      ]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await service.listAuditLogs({ id: 5, roles: ['MANAGE'] }, {});

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: { in: [5, 2, 3] } },
        }),
      );
    });

    it('CS only sees AuditLogs where user_id = csId OR entity is an Enrollment assigned to csId', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValueOnce([{ id: 45 }, { id: 46 }]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await service.listAuditLogs({ id: 2, roles: ['CS'] }, {});

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { user_id: 2 },
              { entity_type: 'Enrollment', entity_id: { in: ['45', '46'] } },
            ],
          },
        }),
      );
    });

    it('listLoginAudits enforces MANAGE scope and computes login stats', async () => {
      mockPrisma.manageAssignment.findMany.mockResolvedValue([
        { cs_group: { members: [{ user_id: 2 }] } },
      ]);
      const now = new Date();
      mockPrisma.loginAudit.findMany.mockResolvedValue([
        {
          id: 1,
          user_id: 2,
          email_attempted: 'cs1@test.com',
          status: 'SUCCESS',
          reason: null,
          ip_address: '10.0.0.1',
          user_agent: 'Chrome',
          created_at: now,
          user: { id: 2, name: 'Hải Yến', code: 'CVHT01', staff_code: 'CVHT01', email: 'cs1@test.com', roles: ['CS'] },
        },
        {
          id: 2,
          user_id: 2,
          email_attempted: 'cs1@test.com',
          status: 'FAILED',
          reason: 'Invalid password',
          ip_address: '10.0.0.1',
          user_agent: 'Chrome',
          created_at: now,
          user: { id: 2, name: 'Hải Yến', code: 'CVHT01', staff_code: 'CVHT01', email: 'cs1@test.com', roles: ['CS'] },
        },
      ]);

      const res = await service.listLoginAudits({ id: 5, roles: ['MANAGE'] }, { status: 'ALL' });

      expect(mockPrisma.loginAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: { in: [5, 2] } },
        }),
      );
      expect(res.stats.todayTotal).toBe(2);
      expect(res.stats.todaySuccess).toBe(1);
      expect(res.stats.todayFailed).toBe(1);
      expect(res.items).toHaveLength(2);
      expect(res.items[0].user?.displayLabel).toBe('Hải Yến - CVHT01');
    });

    it('listActors scopes dropdown options according to ADMIN, MANAGE, and CS roles', async () => {
      const adminActors = await service.listActors({ id: 1, roles: ['ADMIN'] });
      expect(adminActors.items).toHaveLength(4);

      mockPrisma.manageAssignment.findMany.mockResolvedValue([
        { cs_group: { members: [{ user_id: 2 }] } },
      ]);
      const manageActors = await service.listActors({ id: 5, roles: ['MANAGE'] });
      expect(manageActors.items.map((a) => a.id)).toEqual([2, 5]);

      const csActors = await service.listActors({ id: 2, roles: ['CS'] });
      expect(csActors.items.map((a) => a.id)).toEqual([2]);
    });
  });
});
