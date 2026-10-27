import type { Job } from 'bullmq';

jest.mock('../../../shared/queue/redis-connection', () => ({
  getRedisClient: jest.fn(() => null),
}));

jest.mock('../../../prisma/client', () => ({
  prisma: {
    attendance: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    enrollment: {
      findUnique: jest.fn(),
    },
    automationStep: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    messageDelivery: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    zaloGroup: {
      findUnique: jest.fn(),
    },
    zaloAccount: {
      findUnique: jest.fn(),
    },
    zaloContactRelation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    friend: {
      findMany: jest.fn(),
    },
    lineGroup: {
      findUnique: jest.fn(),
    },
    lineAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    lineContactRelation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    lineFriend: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../automation-bullmq-adapter', () => ({
  enqueueDelivery: jest.fn(),
  cancelDelivery: jest.fn(),
}));

jest.mock('../../zalo/zalo-pool', () => ({
  zaloPool: {
    getApi: jest.fn(),
    tryReconnect: jest.fn(),
  },
}));

import { prisma } from '../../../prisma/client';
import { enqueueDelivery } from '../automation-bullmq-adapter';
import { zaloPool } from '../../zalo/zalo-pool';
import {
  registerLineDeliveryDispatcher,
  type ILineDeliveryDispatcher,
} from '../../line/line-dispatcher.contract';
import { handleAttendanceEvent, resolveDeliveryTarget } from '../automation-trigger.service';
import {
  processDeliveryJob,
  buildLineRetryKey,
  MAX_DELIVERY_ATTEMPTS,
  PRE_SEND_ERROR_PREFIX,
  UNCERTAIN_SEND_ERROR_PREFIX,
  type SendJobData,
} from '../automation-worker';
import { automationService } from '../automation.service';

describe('Automation Multi-Channel Zalo + LINE Engine & Worker', () => {
  let mockLineDispatcher: jest.Mocked<ILineDeliveryDispatcher>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLineDispatcher = {
      ensureAccountReady: jest.fn().mockResolvedValue(true),
      sendPersonalMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'line-msg-101',
        sentVia: 'push_api',
      }),
      sendGroupMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'line-grp-msg-202',
        sentVia: 'push_api',
      }),
    };
    registerLineDeliveryDispatcher(mockLineDispatcher);
    (enqueueDelivery as jest.Mock).mockResolvedValue('automation:delivery:1');
  });

  // ─── Trigger Resolution Tests ──────────────────────────────────────────────

  describe('resolveDeliveryTarget & handleAttendanceEvent for LINE channels', () => {
    const baseStep = {
      id: 10,
      workflow_id: 1,
      session_number: 1,
      trigger_event: 'ATTENDED' as const,
      delay_minutes: 5,
      channel: 'LINE_PERSONAL' as const,
      target_group_id: null as number | null,
      message_content: 'Chào {{student_name}}, buổi {{session_number}} lớp {{class_name}} đã hoàn thành!',
      message_variables: ['student_name', 'session_number', 'class_name'],
      active: true,
      workflow: { id: 1, name: 'LINE CSKH Flow', owner_cs_id: 50 },
    };

    const baseAttendance = {
      id: 900,
      status: 'ATTENDED',
      reconciliation_state: 'MATCHED',
      enrollment_class: {
        enrollment: {
          id: 300,
          student_id: 400,
          cs_id: 50,
          total_sessions: 24,
          auto_message_enabled: true,
          student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', line_uid: null },
          cs: { id: 50, name: 'CS Hương' },
          package: { name: 'Gói N3' },
          enrollment_classes: [{ class: { id: 20, class_name: 'N3-K12' } }],
        },
        class: { id: 20, class_name: 'N3-K12' },
      },
      class_session: {
        session_date: new Date('2026-10-18T10:00:00Z'),
        class: {
          class_name: 'N3-K12',
          class_teachers: [{ teacher: { id: 5, name: 'Sensei Tanaka' } }],
        },
      },
    };

    it('resolves LINE_PERSONAL Priority 1: CS own active LINE account', async () => {
      (prisma.enrollment.findUnique as jest.Mock).mockResolvedValue({
        student_id: 400,
        student: { id: 400, line_uid: null },
      });
      (prisma.lineContactRelation.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 1,
        line_account_id: 77,
        student_id: 400,
        relation_status: 'FRIEND',
      });

      const target = await resolveDeliveryTarget(baseStep, 300, 50);
      expect(target).toEqual({ lineAccountId: 77 });
      expect(prisma.lineContactRelation.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.lineContactRelation.findFirst).toHaveBeenCalledWith({
        where: {
          student_id: 400,
          relation_status: 'FRIEND',
          line_account: { cs_id: 50, status: 'ACTIVE' },
        },
      });
    });

    it('resolves LINE_PERSONAL Priority 2: any active OA account when CS own account has no FRIEND relation', async () => {
      (prisma.enrollment.findUnique as jest.Mock).mockResolvedValue({
        student_id: 400,
        student: { id: 400, line_uid: null },
      });
      (prisma.lineContactRelation.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // Priority 1: CS's own LINE account
        .mockResolvedValueOnce({
          id: 2,
          line_account_id: 88,
          student_id: 400,
          relation_status: 'FRIEND',
        }); // Priority 2: Active OA account

      const target = await resolveDeliveryTarget(baseStep, 300, 50);
      expect(target).toEqual({ lineAccountId: 88 });
      expect(prisma.lineContactRelation.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          student_id: 400,
          relation_status: 'FRIEND',
          line_account: { account_type: 'OA', status: 'ACTIVE' },
        },
      });
    });

    it('resolves LINE_PERSONAL Priority 3: fallback any active LINE account with FRIEND relation', async () => {
      (prisma.enrollment.findUnique as jest.Mock).mockResolvedValue({
        student_id: 400,
        student: { id: 400, line_uid: null },
      });
      (prisma.lineContactRelation.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // Priority 1
        .mockResolvedValueOnce(null) // Priority 2
        .mockResolvedValueOnce({
          id: 3,
          line_account_id: 99,
          student_id: 400,
          relation_status: 'FRIEND',
        }); // Priority 3

      const target = await resolveDeliveryTarget(baseStep, 300, 50);
      expect(target).toEqual({ lineAccountId: 99 });
      expect(prisma.lineContactRelation.findFirst).toHaveBeenNthCalledWith(3, {
        where: {
          student_id: 400,
          relation_status: 'FRIEND',
          line_account: { status: 'ACTIVE' },
        },
      });
    });

    it('resolves LINE_PERSONAL Priority 4: Student.line_uid + active OA account fallback', async () => {
      (prisma.enrollment.findUnique as jest.Mock).mockResolvedValue({
        student_id: 400,
        student: { id: 400, line_uid: 'U1234567890abcdef' },
      });
      (prisma.lineContactRelation.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.lineAccount.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // CS's OA
        .mockResolvedValueOnce({ id: 105 }); // Any active OA

      const target = await resolveDeliveryTarget(baseStep, 300, 50);
      expect(target).toEqual({ lineAccountId: 105 });
    });

    it('resolves LINE_GROUP when group exists and its lineAccount is ACTIVE', async () => {
      (prisma.enrollment.findUnique as jest.Mock).mockResolvedValue({
        student_id: 400,
        student: { id: 400, line_uid: null },
      });
      (prisma.lineGroup.findUnique as jest.Mock).mockResolvedValue({
        line_account_id: 77,
        line_group_id: 'Cgroup123',
        line_account: { status: 'ACTIVE' },
      });

      const groupStep = {
        ...baseStep,
        channel: 'LINE_GROUP' as const,
        target_group_id: 15,
      };

      const target = await resolveDeliveryTarget(groupStep, 300, 50);
      expect(target).toEqual({ lineAccountId: 77, lineGroupId: 15 });
    });

    it('creates delivery with line_account_id and line_group_id in handleAttendanceEvent', async () => {
      (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(baseAttendance);
      (prisma.attendance.count as jest.Mock).mockResolvedValue(0);
      (prisma.automationStep.findMany as jest.Mock).mockResolvedValue([
        {
          ...baseStep,
          channel: 'LINE_GROUP',
          target_group_id: 15,
        },
      ]);
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.enrollment.findUnique as jest.Mock).mockResolvedValue({
        student_id: 400,
        student: { id: 400, line_uid: null },
      });
      (prisma.lineGroup.findUnique as jest.Mock).mockResolvedValue({
        line_account_id: 77,
        line_group_id: 'Cgroup123',
        line_account: { status: 'ACTIVE' },
      });
      (prisma.messageDelivery.create as jest.Mock).mockResolvedValue({ id: 555 });
      (prisma.messageDelivery.update as jest.Mock).mockResolvedValue({ id: 555, status: 'QUEUED' });

      const res = await handleAttendanceEvent(900);

      expect(res.deliveriesCreated).toBe(1);
      expect(prisma.messageDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          enrollment_id: 300,
          attendance_id: 900,
          automation_step_id: 10,
          zalo_account_id: null,
          zalo_group_id: null,
          line_account_id: 77,
          line_group_id: 15,
          rendered_content: 'Chào Nguyễn Văn A, buổi 1 lớp N3-K12 đã hoàn thành!',
        }),
      });
    });

    it('routes ZALO_PERSONAL step to student Care Group when ZaloContactRelation has zalo_group_id', async () => {
      (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(baseAttendance);
      (prisma.attendance.count as jest.Mock).mockResolvedValue(0);
      (prisma.automationStep.findMany as jest.Mock).mockResolvedValue([
        {
          ...baseStep,
          id: 21,
          channel: 'ZALO_PERSONAL',
          target_group_id: null,
        },
      ]);
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.enrollment.findUnique as jest.Mock).mockResolvedValue({
        student_id: 400,
        student: { id: 400, line_uid: null },
      });
      (prisma.zaloContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 10,
        student_id: 400,
        zalo_account_id: 12,
        relation_status: 'FRIEND',
        target_type: 'GROUP',
        zalo_group_id: 88,
        matched_by: 'AUTO_GROUP_NAME',
      });
      (prisma.messageDelivery.create as jest.Mock).mockResolvedValue({ id: 701 });
      (prisma.messageDelivery.update as jest.Mock).mockResolvedValue({ id: 701, status: 'QUEUED' });

      const res = await handleAttendanceEvent(900);

      expect(res.deliveriesCreated).toBe(1);
      expect(prisma.messageDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          enrollment_id: 300,
          attendance_id: 900,
          automation_step_id: 21,
          zalo_account_id: 12,
          zalo_group_id: 88,
          line_account_id: null,
          line_group_id: null,
        }),
      });
    });

    it('routes LINE_PERSONAL step to student Care Group when LineContactRelation has line_group_id', async () => {
      (prisma.attendance.findUnique as jest.Mock).mockResolvedValue(baseAttendance);
      (prisma.attendance.count as jest.Mock).mockResolvedValue(0);
      (prisma.automationStep.findMany as jest.Mock).mockResolvedValue([
        {
          ...baseStep,
          id: 22,
          channel: 'LINE_PERSONAL',
          target_group_id: null,
        },
      ]);
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.enrollment.findUnique as jest.Mock).mockResolvedValue({
        student_id: 400,
        student: { id: 400, line_uid: null },
      });
      (prisma.lineContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 11,
        student_id: 400,
        line_account_id: 77,
        relation_status: 'FRIEND',
        target_type: 'GROUP',
        line_group_id: 99,
        matched_by: 'AUTO_GROUP_NAME',
      });
      (prisma.messageDelivery.create as jest.Mock).mockResolvedValue({ id: 702 });
      (prisma.messageDelivery.update as jest.Mock).mockResolvedValue({ id: 702, status: 'QUEUED' });

      const res = await handleAttendanceEvent(900);

      expect(res.deliveriesCreated).toBe(1);
      expect(prisma.messageDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          enrollment_id: 300,
          attendance_id: 900,
          automation_step_id: 22,
          zalo_account_id: null,
          zalo_group_id: null,
          line_account_id: 77,
          line_group_id: 99,
        }),
      });
    });
  });

  // ─── Worker Execution Tests ────────────────────────────────────────────────

  describe('processDeliveryJob for LINE & Zalo channels', () => {
    const makeJob = (deliveryId = 555): Job<SendJobData> =>
      ({
        id: `automation:delivery:${deliveryId}`,
        data: {
          deliveryId,
          automationStepId: 10,
          enrollmentId: 300,
          attendanceId: 900,
        },
      }) as unknown as Job<SendJobData>;

    it('dispatches LINE_PERSONAL message using LineContactRelation.friend_line_uid and marks SENT', async () => {
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 555,
        status: 'QUEUED',
        enrollment_id: 300,
        zalo_account_id: null,
        zalo_group_id: null,
        line_account_id: 77,
        line_group_id: null,
        rendered_content: 'Xin chào từ LINE!',
        automation_step: { id: 10, channel: 'LINE_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: {
            id: 400,
            full_name: 'Nguyễn Văn A',
            phone: '0988767563',
            zalo_uid: null,
            line_uid: null,
          },
        },
        zalo_account: null,
        zalo_group: null,
        line_account: {
          id: 77,
          status: 'ACTIVE',
          account_type: 'OA',
          line_mid: 'U_oa_bot',
          display_name: 'Edura OA',
        },
        line_group: null,
        attendance: { enrollment_class: {} },
      });

      (prisma.lineContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 12,
        student_id: 400,
        line_account_id: 77,
        relation_status: 'FRIEND',
        friend_line_uid: 'U_target_student_001',
      });

      await processDeliveryJob(makeJob(555));

      expect(mockLineDispatcher.ensureAccountReady).toHaveBeenCalledWith(77);
      expect(mockLineDispatcher.sendPersonalMessage).toHaveBeenCalledWith({
        lineAccountId: 77,
        targetLineUid: 'U_target_student_001',
        content: 'Xin chào từ LINE!',
        retryKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
        sentVia: 'automation',
      });
      expect(prisma.messageDelivery.update).toHaveBeenLastCalledWith({
        where: { id: 555 },
        data: expect.objectContaining({
          status: 'SENT',
          provider_message_id: 'line-msg-101',
          error_message: null,
        }),
      });
    });

    it('dispatches LINE_PERSONAL via 9-digit phone suffix fallback and backfills LineContactRelation', async () => {
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 556,
        status: 'QUEUED',
        enrollment_id: 300,
        zalo_account_id: null,
        zalo_group_id: null,
        line_account_id: 78,
        line_group_id: null,
        rendered_content: 'Tin nhắn qua SĐT fallback',
        automation_step: { id: 10, channel: 'LINE_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: {
            id: 400,
            full_name: 'Nguyễn Văn A',
            phone: '0988767563',
            zalo_uid: null,
            line_uid: null,
          },
        },
        zalo_account: null,
        zalo_group: null,
        line_account: {
          id: 78,
          status: 'ACTIVE',
          account_type: 'PERSONAL',
          line_mid: 'u_personal_cs',
          display_name: 'CS Personal LINE',
        },
        line_group: null,
        attendance: { enrollment_class: {} },
      });

      // Relation is FRIEND but friend_line_uid is not populated yet
      (prisma.lineContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 19,
        student_id: 400,
        line_account_id: 78,
        relation_status: 'FRIEND',
        friend_line_uid: null,
      });

      (prisma.lineFriend.findMany as jest.Mock).mockResolvedValue([
        { line_uid_in_nick: 'u_line_matched_by_phone', phone_from_sdk: '+84988767563' },
      ]);
      (prisma.lineContactRelation.update as jest.Mock).mockResolvedValue({});

      await processDeliveryJob(makeJob(556));

      expect(mockLineDispatcher.sendPersonalMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          lineAccountId: 78,
          targetLineUid: 'u_line_matched_by_phone',
          content: 'Tin nhắn qua SĐT fallback',
          sentVia: 'automation',
        }),
      );
      expect(prisma.lineContactRelation.update).toHaveBeenCalledWith({
        where: { id: 19 },
        data: { friend_line_uid: 'u_line_matched_by_phone' },
      });
    });

    it('dispatches LINE_GROUP message via sendGroupMessage', async () => {
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 557,
        status: 'SCHEDULED',
        enrollment_id: 300,
        zalo_account_id: null,
        zalo_group_id: null,
        line_account_id: 77,
        line_group_id: 15,
        rendered_content: 'Thông báo nhóm LINE',
        automation_step: { id: 11, channel: 'LINE_GROUP' },
        enrollment: {
          student_id: 400,
          student: {
            id: 400,
            full_name: 'Nguyễn Văn A',
            phone: '0988767563',
            zalo_uid: null,
            line_uid: null,
          },
        },
        zalo_account: null,
        zalo_group: null,
        line_account: {
          id: 77,
          status: 'ACTIVE',
          account_type: 'OA',
          line_mid: 'U_oa_bot',
          display_name: 'Edura OA',
        },
        line_group: {
          id: 15,
          line_group_id: 'C_line_group_999',
          name: 'Lớp N3-K12 LINE',
        },
        attendance: { enrollment_class: {} },
      });

      await processDeliveryJob(makeJob(557));

      expect(mockLineDispatcher.sendGroupMessage).toHaveBeenCalledWith({
        lineAccountId: 77,
        targetLineGroupId: 'C_line_group_999',
        content: 'Thông báo nhóm LINE',
        retryKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
        sentVia: 'automation',
      });
      expect(prisma.messageDelivery.update).toHaveBeenLastCalledWith({
        where: { id: 557 },
        data: expect.objectContaining({
          status: 'SENT',
          provider_message_id: 'line-grp-msg-202',
        }),
      });
    });

    it('skips LINE delivery with SKIPPED_ACCOUNT_INACTIVE when line_account is not ACTIVE or ensureAccountReady returns false', async () => {
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 558,
        status: 'QUEUED',
        enrollment_id: 300,
        line_account_id: 77,
        line_group_id: null,
        rendered_content: 'Test inactive',
        automation_step: { id: 10, channel: 'LINE_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: { id: 400, full_name: 'HV', phone: null, zalo_uid: null, line_uid: 'U111' },
        },
        line_account: {
          id: 77,
          status: 'EXPIRED',
          account_type: 'PERSONAL',
          line_mid: 'u_1',
          display_name: 'Expired LINE',
        },
        line_group: null,
      });

      await processDeliveryJob(makeJob(558));

      expect(mockLineDispatcher.sendPersonalMessage).not.toHaveBeenCalled();
      expect(prisma.messageDelivery.update).toHaveBeenCalledWith({
        where: { id: 558 },
        data: expect.objectContaining({
          status: 'SKIPPED_ACCOUNT_INACTIVE',
        }),
      });
    });

    it('skips LINE_PERSONAL with SKIPPED_NOT_FRIEND when neither FRIEND relation nor student.line_uid exists', async () => {
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 559,
        status: 'QUEUED',
        enrollment_id: 300,
        line_account_id: 77,
        line_group_id: null,
        rendered_content: 'Test not friend',
        automation_step: { id: 10, channel: 'LINE_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: { id: 400, full_name: 'HV', phone: null, zalo_uid: null, line_uid: null },
        },
        line_account: {
          id: 77,
          status: 'ACTIVE',
          account_type: 'PERSONAL',
          line_mid: 'u_1',
          display_name: 'Active LINE',
        },
        line_group: null,
      });
      (prisma.lineContactRelation.findFirst as jest.Mock).mockResolvedValue(null);

      await processDeliveryJob(makeJob(559));

      expect(mockLineDispatcher.sendPersonalMessage).not.toHaveBeenCalled();
      expect(prisma.messageDelivery.update).toHaveBeenCalledWith({
        where: { id: 559 },
        data: expect.objectContaining({
          status: 'SKIPPED_NOT_FRIEND',
        }),
      });
    });

    it('preserves existing Zalo delivery flow identically', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({ data: { messageId: 'zalo-msg-999' } });
      (zaloPool.getApi as jest.Mock).mockReturnValue({ sendMessage: mockSendMessage });

      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 600,
        status: 'QUEUED',
        enrollment_id: 300,
        zalo_account_id: 12,
        zalo_group_id: null,
        line_account_id: null,
        line_group_id: null,
        rendered_content: 'Xin chào qua Zalo!',
        automation_step: { id: 20, channel: 'ZALO_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: {
            id: 400,
            full_name: 'Nguyễn Văn A',
            phone: '0988767563',
            zalo_uid: 'zalo_u_1',
            line_uid: null,
          },
        },
        zalo_account: {
          id: 12,
          status: 'ACTIVE',
          zalo_uid: 'cs_zalo_1',
          display_name: 'CS Zalo',
        },
        zalo_group: null,
        line_account: null,
        line_group: null,
        attendance: { enrollment_class: {} },
      });

      (prisma.zaloContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 5,
        student_id: 400,
        zalo_account_id: 12,
        relation_status: 'FRIEND',
        friend_zalo_uid: 'zalo_friend_400',
      });

      await processDeliveryJob(makeJob(600));

      expect(mockSendMessage).toHaveBeenCalledWith('Xin chào qua Zalo!', 'zalo_friend_400', 0);
      expect(prisma.messageDelivery.update).toHaveBeenLastCalledWith({
        where: { id: 600 },
        data: expect.objectContaining({
          status: 'SENT',
          provider_message_id: 'zalo-msg-999',
        }),
      });
    });

    it('routes ZALO_PERSONAL delivery to Care Group with threadType = 1 when relation is linked to a Care Group after delivery creation', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({ data: { messageId: 'zalo-care-grp-1001' } });
      (zaloPool.getApi as jest.Mock).mockReturnValue({ sendMessage: mockSendMessage });

      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 601,
        status: 'QUEUED',
        enrollment_id: 300,
        zalo_account_id: 12,
        zalo_group_id: null,
        line_account_id: null,
        line_group_id: null,
        rendered_content: 'Chăm sóc học viên qua Nhóm Zalo!',
        automation_step: { id: 20, channel: 'ZALO_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: {
            id: 400,
            full_name: 'Trần Văn An',
            phone: '0988767563',
            zalo_uid: null,
            line_uid: null,
          },
        },
        zalo_account: {
          id: 12,
          status: 'ACTIVE',
          zalo_uid: 'cs_zalo_1',
          display_name: 'CVHT01 Zalo',
        },
        zalo_group: null,
        line_account: null,
        line_group: null,
        attendance: { enrollment_class: {} },
      });

      (prisma.zaloContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 15,
        student_id: 400,
        zalo_account_id: 12,
        relation_status: 'FRIEND',
        target_type: 'GROUP',
        zalo_group_id: 88,
        friend_zalo_uid: 'zalo_care_group_ext_88',
        zalo_group: { id: 88, zalo_group_id: 'zalo_care_group_ext_88' },
      });

      await processDeliveryJob(makeJob(601));

      expect(mockSendMessage).toHaveBeenCalledWith(
        'Chăm sóc học viên qua Nhóm Zalo!',
        'zalo_care_group_ext_88',
        1,
      );
      expect(prisma.messageDelivery.update).toHaveBeenLastCalledWith({
        where: { id: 601 },
        data: expect.objectContaining({
          status: 'SENT',
          provider_message_id: 'zalo-care-grp-1001',
        }),
      });
    });

    it('routes LINE_PERSONAL delivery to Care Group via sendGroupMessage when LineContactRelation has target_type GROUP or C-prefixed group ID', async () => {
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 602,
        status: 'QUEUED',
        enrollment_id: 300,
        zalo_account_id: null,
        zalo_group_id: null,
        line_account_id: 77,
        line_group_id: null,
        rendered_content: 'Chăm sóc học viên qua Nhóm LINE!',
        automation_step: { id: 10, channel: 'LINE_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: {
            id: 400,
            full_name: 'Trần Văn An',
            phone: '0988767563',
            zalo_uid: null,
            line_uid: null,
          },
        },
        zalo_account: null,
        zalo_group: null,
        line_account: {
          id: 77,
          status: 'ACTIVE',
          account_type: 'OA',
          line_mid: 'U_oa_bot',
          display_name: 'Edura OA',
        },
        line_group: null,
        attendance: { enrollment_class: {} },
      });

      (prisma.lineContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 25,
        student_id: 400,
        line_account_id: 77,
        relation_status: 'FRIEND',
        target_type: 'GROUP',
        line_group_id: 99,
        friend_line_uid: 'C_care_group_427901798',
        line_group: { id: 99, line_group_id: 'C_care_group_427901798' },
      });

      await processDeliveryJob(makeJob(602));

      expect(mockLineDispatcher.sendGroupMessage).toHaveBeenCalledWith({
        lineAccountId: 77,
        targetLineGroupId: 'C_care_group_427901798',
        content: 'Chăm sóc học viên qua Nhóm LINE!',
        retryKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
        sentVia: 'automation',
      });
      expect(mockLineDispatcher.sendPersonalMessage).not.toHaveBeenCalled();
      expect(prisma.messageDelivery.update).toHaveBeenLastCalledWith({
        where: { id: 602 },
        data: expect.objectContaining({
          status: 'SENT',
          provider_message_id: 'line-grp-msg-202',
        }),
      });
    });
  });

  // ─── Task 1: Step Identity & Delete Guards (AutomationService) ─────────────

  describe('Step identity & delete guards (Task 1)', () => {
    const existingStep = {
      id: 41,
      workflow_id: 7,
      session_number: 5,
      trigger_event: 'ATTENDED' as const,
      delay_minutes: 5,
      channel: 'ZALO_PERSONAL' as const,
      target_group_id: null as number | null,
      message_content: 'Chào {{student_name}}, hoàn thành buổi 5!',
      message_variables: ['student_name'],
      active: true,
      workflow: { id: 7, name: 'Care W7', owner_cs_id: 50 },
    };

    it('blocks changing session_number or trigger_event with 409 when MessageDelivery rows exist for the step', async () => {
      (prisma.automationStep.findUnique as jest.Mock).mockResolvedValue(existingStep);
      (prisma.messageDelivery.count as jest.Mock).mockResolvedValue(3);

      await expect(
        automationService.updateStep(41, { session_number: 10 }, 50, 'CS'),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('Bước đã có lịch sử gửi'),
      });

      await expect(
        automationService.updateStep(41, { trigger_event: 'ABSENT_UNAPPROVED_C' }, 50, 'CS'),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('Bước đã có lịch sử gửi'),
      });

      expect(prisma.automationStep.update).not.toHaveBeenCalled();
    });

    it('allows changing session_number and trigger_event when zero deliveries exist for the step', async () => {
      (prisma.automationStep.findUnique as jest.Mock).mockResolvedValue(existingStep);
      (prisma.messageDelivery.count as jest.Mock).mockResolvedValue(0);
      (prisma.automationStep.update as jest.Mock).mockResolvedValue({
        ...existingStep,
        session_number: 8,
        trigger_event: 'LEAVE_B',
      });

      const updated = await automationService.updateStep(
        41,
        { session_number: 8, trigger_event: 'LEAVE_B' },
        50,
        'CS',
      );

      expect(prisma.messageDelivery.count).toHaveBeenCalledWith({
        where: { automation_step_id: 41 },
      });
      expect(prisma.automationStep.update).toHaveBeenCalledWith({
        where: { id: 41 },
        data: { session_number: 8, trigger_event: 'LEAVE_B' },
      });
      expect(updated.session_number).toBe(8);
    });

    it('allows operational field edits (message_content, message_variables, delay_minutes, channel, target_group_id, active) even when SENT deliveries exist, and never grants re-send on handleAttendanceEvent', async () => {
      (prisma.automationStep.findUnique as jest.Mock).mockResolvedValue(existingStep);
      (prisma.messageDelivery.count as jest.Mock).mockResolvedValue(5);
      const updatedStepObj = {
        ...existingStep,
        message_content: 'Nội dung mới buổi 5 cho {{student_name}}!',
        message_variables: ['student_name'],
        delay_minutes: 15,
        channel: 'LINE_GROUP' as const,
        target_group_id: 99,
        active: true,
      };
      (prisma.automationStep.update as jest.Mock).mockResolvedValue(updatedStepObj);

      const resEdit = await automationService.updateStep(
        41,
        {
          // Passing identical session_number/trigger_event alongside operational edits is also allowed
          session_number: 5,
          trigger_event: 'ATTENDED',
          message_content: 'Nội dung mới buổi 5 cho {{student_name}}!',
          message_variables: ['student_name'],
          delay_minutes: 15,
          channel: 'LINE_GROUP',
          target_group_id: 99,
          active: true,
        },
        50,
        'CS',
      );

      expect(resEdit.message_content).toBe('Nội dung mới buổi 5 cho {{student_name}}!');
      expect(prisma.automationStep.update).toHaveBeenCalledTimes(1);

      // Simulate handleAttendanceEvent after operational step edit when enrollment 300 already has a SENT delivery for step 41:
      // Editing operational fields NEVER creates a new delivery or re-sends the milestone.
      const sentDelivery = {
        id: 9001,
        enrollment_id: 300,
        attendance_id: 905,
        automation_step_id: 41,
        status: 'SENT',
        rendered_content: 'Chào Nguyễn Văn A, hoàn thành buổi 5!',
        variables_snapshot: { student_name: 'Nguyễn Văn A' },
      };
      (prisma.attendance.findUnique as jest.Mock).mockResolvedValue({
        id: 905,
        status: 'ATTENDED',
        reconciliation_state: 'MATCHED',
        created_at: new Date('2026-10-18T10:00:00Z'),
        enrollment_class: {
          enrollment: {
            id: 300,
            student_id: 400,
            cs_id: 50,
            total_sessions: 24,
            auto_message_enabled: true,
            student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', line_uid: null },
            cs: { id: 50, name: 'CS Hương' },
            package: { name: 'Gói N3' },
            enrollment_classes: [{ class: { id: 20, class_name: 'N3-K12' } }],
          },
          class: { id: 20, class_name: 'N3-K12' },
        },
        class_session: {
          session_date: new Date('2026-10-18T00:00:00Z'),
          class: {
            class_name: 'N3-K12',
            class_teachers: [{ teacher: { id: 5, name: 'Sensei Tanaka' } }],
          },
        },
      });
      (prisma.attendance.count as jest.Mock).mockResolvedValue(4); // 4 prior + 1 = ordinal 5
      (prisma.automationStep.findMany as jest.Mock).mockResolvedValue([updatedStepObj]);
      (prisma.messageDelivery.findMany as jest.Mock).mockResolvedValue([sentDelivery]);
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue(sentDelivery);

      const triggerRes = await handleAttendanceEvent(905);
      expect(triggerRes.deliveriesCreated).toBe(0);
      expect(triggerRes.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stepId: 41,
            status: 'SKIPPED_DUPLICATE',
          }),
        ]),
      );
      expect(prisma.messageDelivery.create).not.toHaveBeenCalled();
      expect(enqueueDelivery).not.toHaveBeenCalled();
    });

    it('blocks deleteStep with 409 when deliveries exist, and catches P2003 defensively', async () => {
      (prisma.automationStep.findUnique as jest.Mock).mockResolvedValue(existingStep);
      (prisma.messageDelivery.count as jest.Mock).mockResolvedValue(2);

      await expect(automationService.deleteStep(41, 50, 'CS')).rejects.toMatchObject({
        status: 409,
        message: 'Bước đã có bản ghi gửi — không thể xóa. Hãy đặt active=false để ngừng áp dụng.',
      });
      expect(prisma.automationStep.delete).not.toHaveBeenCalled();

      // Defensive P2003 catch if a delivery is inserted concurrently between count and delete:
      (prisma.messageDelivery.count as jest.Mock).mockResolvedValueOnce(0);
      (prisma.automationStep.delete as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' }),
      );

      await expect(automationService.deleteStep(41, 50, 'CS')).rejects.toMatchObject({
        status: 409,
        message: 'Bước đã có bản ghi gửi — không thể xóa. Hãy đặt active=false để ngừng áp dụng.',
      });
    });
  });

  // ─── Task 2: BullMQ Retry-After-FAILED & Certainty Classes ────────────────

  describe('BullMQ retry-after-FAILED, certainty classes & SENDING protection (Task 2)', () => {
    const makeRetryJob = (deliveryId: number, attempts = MAX_DELIVERY_ATTEMPTS): Job<SendJobData> =>
      ({
        id: `automation:delivery:${deliveryId}`,
        opts: { attempts },
        data: {
          deliveryId,
          automationStepId: 41,
          enrollmentId: 300,
          attendanceId: 901,
        },
      }) as unknown as Job<SendJobData>;

    it('Class (1) PRE_SEND failure on attempt 1 marks FAILED with PRE_SEND: prefix and rethrows; attempt 2 on the SAME row re-runs checkInvariants + checkMilestoneStillEligible and succeeds', async () => {
      // Stateful in-memory delivery row to observe exact status transitions on the same delivery.id
      const state: Record<string, any> = {
        id: 710,
        status: 'QUEUED',
        retry_count: 0,
        error_message: null,
        provider_message_id: null,
        enrollment_id: 300,
        zalo_account_id: 12,
        zalo_group_id: 88,
        line_account_id: null,
        line_group_id: null,
        rendered_content: 'Chào HV buổi 5!',
        automation_step: { id: 41, session_number: 5, trigger_event: 'ATTENDED', channel: 'ZALO_GROUP' },
        enrollment: {
          student_id: 400,
          student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', zalo_uid: 'z_400', line_uid: null },
        },
        zalo_account: { id: 12, status: 'ACTIVE', zalo_uid: 'cs_zalo', display_name: 'CS Zalo' },
        // Attempt 1: zalo_group_id=88 is set, but zalo_group.zalo_group_id is missing -> throws 'Group ID missing' BEFORE api.sendMessage
        zalo_group: { id: 88, zalo_group_id: null, name: 'Lớp N3' },
        line_account: null,
        line_group: null,
        attendance: {
          id: 901,
          status: 'ATTENDED',
          reconciliation_state: 'MATCHED',
          deleted_at: null,
          enrollment_class: { enrollment_id: 300 },
        },
      };

      (prisma.messageDelivery.findUnique as jest.Mock).mockImplementation(async () => ({ ...state }));
      (prisma.messageDelivery.update as jest.Mock).mockImplementation(async ({ where, data }) => {
        expect(where.id).toBe(710); // Always the SAME delivery.id row
        if (data.status !== undefined) state.status = data.status;
        if (data.error_message !== undefined) state.error_message = data.error_message;
        if (data.provider_message_id !== undefined) state.provider_message_id = data.provider_message_id;
        if (data.retry_count?.increment) state.retry_count += data.retry_count.increment;
        return { ...state };
      });
      (prisma.attendance.count as jest.Mock).mockResolvedValue(5);

      const mockZaloSend = jest.fn().mockResolvedValue({ data: { messageId: 'zalo-grp-msg-710' } });
      (zaloPool.getApi as jest.Mock).mockReturnValue({ sendMessage: mockZaloSend });

      // ── Attempt #1: fails in pre-send target validation before api.sendMessage
      await expect(processDeliveryJob(makeRetryJob(710))).rejects.toThrow('Group ID missing');

      expect(mockZaloSend).not.toHaveBeenCalled();
      expect(state.status).toBe('FAILED');
      expect(state.retry_count).toBe(1);
      expect(state.error_message).toBe(`${PRE_SEND_ERROR_PREFIX} Group ID missing`);
      expect(prisma.attendance.count).toHaveBeenCalledTimes(1);

      // ── Fix group metadata before Attempt #2; BullMQ retries the SAME deliveryId=710
      state.zalo_group = { id: 88, zalo_group_id: 'zalo_grp_ext_88', name: 'Lớp N3' };

      await processDeliveryJob(makeRetryJob(710));

      // Eligibility check (prisma.attendance.count) was re-invoked on Attempt #2!
      expect(prisma.attendance.count).toHaveBeenCalledTimes(2);
      expect(mockZaloSend).toHaveBeenCalledTimes(1);
      expect(mockZaloSend).toHaveBeenCalledWith('Chào HV buổi 5!', 'zalo_grp_ext_88', 1);
      expect(state.status).toBe('SENT');
      expect(state.retry_count).toBe(1);
      expect(state.provider_message_id).toBe('zalo-grp-msg-710');
      expect(state.error_message).toBeNull();
      expect(prisma.messageDelivery.create).not.toHaveBeenCalled();
    });

    it('re-evaluates checkMilestoneStillEligible on retry attempt #2 and marks CANCELLED without sending when milestone became ineligible', async () => {
      const state: Record<string, any> = {
        id: 711,
        status: 'FAILED',
        retry_count: 1,
        error_message: `${PRE_SEND_ERROR_PREFIX} Group ID missing`,
        enrollment_id: 300,
        zalo_account_id: 12,
        zalo_group_id: 88,
        line_account_id: null,
        line_group_id: null,
        rendered_content: 'Chào HV buổi 5!',
        automation_step: { id: 41, session_number: 5, trigger_event: 'ATTENDED', channel: 'ZALO_GROUP' },
        enrollment: {
          student_id: 400,
          student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', zalo_uid: 'z_400', line_uid: null },
        },
        zalo_account: { id: 12, status: 'ACTIVE', zalo_uid: 'cs_zalo', display_name: 'CS Zalo' },
        zalo_group: { id: 88, zalo_group_id: 'zalo_grp_ext_88', name: 'Lớp N3' },
        line_account: null,
        line_group: null,
        attendance: {
          id: 901,
          status: 'ATTENDED',
          reconciliation_state: 'MATCHED',
          deleted_at: null,
          enrollment_class: { enrollment_id: 300 },
        },
      };

      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue(state);
      (prisma.messageDelivery.update as jest.Mock).mockImplementation(async ({ data }) => {
        Object.assign(state, data);
        return state;
      });
      // Enrollment dropped to 4 qualifying sessions (< session_number 5) before retry #2 ran:
      (prisma.attendance.count as jest.Mock).mockResolvedValue(4);

      const mockZaloSend = jest.fn();
      (zaloPool.getApi as jest.Mock).mockReturnValue({ sendMessage: mockZaloSend });

      await processDeliveryJob(makeRetryJob(711));

      expect(prisma.attendance.count).toHaveBeenCalledTimes(1);
      expect(mockZaloSend).not.toHaveBeenCalled();
      expect(state.status).toBe('CANCELLED');
      expect(state.error_message).toBe('Milestone no longer eligible at send time');
    });

    it('Class (2) Zalo during-send failure marks FAILED with UNCERTAIN_SEND: and does NOT rethrow (job consumed, no second sendMessage call)', async () => {
      const state: Record<string, any> = {
        id: 712,
        status: 'QUEUED',
        retry_count: 0,
        error_message: null,
        provider_message_id: null,
        enrollment_id: 300,
        zalo_account_id: 12,
        zalo_group_id: null,
        line_account_id: null,
        line_group_id: null,
        rendered_content: 'Tin nhắn Zalo buổi 5',
        automation_step: { id: 41, session_number: 5, trigger_event: 'ATTENDED', channel: 'ZALO_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', zalo_uid: 'z_400', line_uid: null },
        },
        zalo_account: { id: 12, status: 'ACTIVE', zalo_uid: 'cs_zalo', display_name: 'CS Zalo' },
        zalo_group: null,
        line_account: null,
        line_group: null,
        attendance: {
          id: 901,
          status: 'ATTENDED',
          reconciliation_state: 'MATCHED',
          deleted_at: null,
          enrollment_class: { enrollment_id: 300 },
        },
      };

      (prisma.messageDelivery.findUnique as jest.Mock).mockImplementation(async () => ({ ...state }));
      (prisma.messageDelivery.update as jest.Mock).mockImplementation(async ({ data }) => {
        if (data.status !== undefined) state.status = data.status;
        if (data.error_message !== undefined) state.error_message = data.error_message;
        if (data.retry_count?.increment) state.retry_count += data.retry_count.increment;
        return { ...state };
      });
      (prisma.attendance.count as jest.Mock).mockResolvedValue(5);
      (prisma.zaloContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 5,
        student_id: 400,
        zalo_account_id: 12,
        relation_status: 'FRIEND',
        friend_zalo_uid: 'zalo_friend_400',
      });

      const mockZaloSend = jest.fn().mockRejectedValue(new Error('ETIMEDOUT waiting for Zalo response'));
      (zaloPool.getApi as jest.Mock).mockReturnValue({ sendMessage: mockZaloSend });

      // Does NOT throw — job ends cleanly without automatic BullMQ retry
      await expect(processDeliveryJob(makeRetryJob(712))).resolves.toBeUndefined();

      expect(mockZaloSend).toHaveBeenCalledTimes(1);
      expect(state.status).toBe('FAILED');
      expect(state.retry_count).toBe(1);
      expect(state.error_message).toContain(UNCERTAIN_SEND_ERROR_PREFIX);
      expect(state.error_message).toContain('ETIMEDOUT waiting for Zalo response');
      expect(state.error_message).toContain('kiểm tra lịch sử thread Zalo trước khi thử lại');

      // Even if a job were manually/spuriously invoked again, gate blocks UNCERTAIN_SEND:
      await expect(processDeliveryJob(makeRetryJob(712))).resolves.toBeUndefined();
      expect(mockZaloSend).toHaveBeenCalledTimes(1); // No second sendMessage call!
    });

    it('Class (3) LINE OA failure with X-Line-Retry-Key capability rethrows and retries on the SAME row with identical retryKey', async () => {
      const state: Record<string, any> = {
        id: 713,
        status: 'QUEUED',
        retry_count: 0,
        error_message: null,
        provider_message_id: null,
        enrollment_id: 300,
        zalo_account_id: null,
        zalo_group_id: null,
        line_account_id: 77,
        line_group_id: null,
        rendered_content: 'Tin nhắn LINE OA buổi 5',
        automation_step: { id: 41, session_number: 5, trigger_event: 'ATTENDED', channel: 'LINE_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', zalo_uid: null, line_uid: 'U_student_400' },
        },
        zalo_account: null,
        zalo_group: null,
        line_account: {
          id: 77,
          status: 'ACTIVE',
          account_type: 'OA',
          line_mid: 'U_oa_bot',
          display_name: 'Edura OA',
        },
        line_group: null,
        attendance: {
          id: 901,
          status: 'ATTENDED',
          reconciliation_state: 'MATCHED',
          deleted_at: null,
          enrollment_class: { enrollment_id: 300 },
        },
      };

      (prisma.messageDelivery.findUnique as jest.Mock).mockImplementation(async () => ({ ...state }));
      (prisma.messageDelivery.update as jest.Mock).mockImplementation(async ({ where, data }) => {
        expect(where.id).toBe(713);
        if (data.status !== undefined) state.status = data.status;
        if (data.error_message !== undefined) state.error_message = data.error_message;
        if (data.provider_message_id !== undefined) state.provider_message_id = data.provider_message_id;
        if (data.retry_count?.increment) state.retry_count += data.retry_count.increment;
        return { ...state };
      });
      (prisma.attendance.count as jest.Mock).mockResolvedValue(5);
      (prisma.lineContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 12,
        student_id: 400,
        line_account_id: 77,
        relation_status: 'FRIEND',
        friend_line_uid: 'U_student_400',
      });

      mockLineDispatcher.sendPersonalMessage
        .mockRejectedValueOnce(new Error('LINE 503 Service Temporarily Unavailable'))
        .mockResolvedValueOnce({
          providerMessageId: 'line-oa-msg-713',
          sentVia: 'push_api',
        });

      const expectedRetryKey = buildLineRetryKey(713);

      // Attempt #1: throws so BullMQ schedules retry #2
      await expect(processDeliveryJob(makeRetryJob(713))).rejects.toThrow(
        'LINE 503 Service Temporarily Unavailable',
      );
      expect(state.status).toBe('FAILED');
      expect(state.retry_count).toBe(1);
      expect(state.error_message).toBe('LINE 503 Service Temporarily Unavailable');

      // Attempt #2: accepted by gate on the same row, re-checks invariants, sends with identical retryKey
      await processDeliveryJob(makeRetryJob(713));

      expect(prisma.attendance.count).toHaveBeenCalledTimes(2);
      expect(mockLineDispatcher.sendPersonalMessage).toHaveBeenCalledTimes(2);
      expect(mockLineDispatcher.sendPersonalMessage.mock.calls[0][0].retryKey).toBe(expectedRetryKey);
      expect(mockLineDispatcher.sendPersonalMessage.mock.calls[1][0].retryKey).toBe(expectedRetryKey);
      expect(state.status).toBe('SENT');
      expect(state.provider_message_id).toBe('line-oa-msg-713');
      expect(state.error_message).toBeNull();
      expect(prisma.messageDelivery.create).not.toHaveBeenCalled();
    });

    it('treats LINE PERSONAL (@evex/linejs, no X-Line-Retry-Key header) mid-send failure as Class (2) UNCERTAIN_SEND without auto-retry', async () => {
      const state: Record<string, any> = {
        id: 714,
        status: 'QUEUED',
        retry_count: 0,
        error_message: null,
        enrollment_id: 300,
        line_account_id: 78,
        line_group_id: null,
        rendered_content: 'Tin nhắn LINE Personal',
        automation_step: { id: 41, session_number: 5, trigger_event: 'ATTENDED', channel: 'LINE_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', zalo_uid: null, line_uid: 'u_mid_400' },
        },
        line_account: {
          id: 78,
          status: 'ACTIVE',
          account_type: 'PERSONAL',
          line_mid: 'u_personal_cs',
          display_name: 'CS Personal LINE',
        },
        line_group: null,
        attendance: {
          id: 901,
          status: 'ATTENDED',
          reconciliation_state: 'MATCHED',
          deleted_at: null,
          enrollment_class: { enrollment_id: 300 },
        },
      };

      (prisma.messageDelivery.findUnique as jest.Mock).mockImplementation(async () => ({ ...state }));
      (prisma.messageDelivery.update as jest.Mock).mockImplementation(async ({ data }) => {
        if (data.status !== undefined) state.status = data.status;
        if (data.error_message !== undefined) state.error_message = data.error_message;
        if (data.retry_count?.increment) state.retry_count += data.retry_count.increment;
        return { ...state };
      });
      (prisma.attendance.count as jest.Mock).mockResolvedValue(5);
      (prisma.lineContactRelation.findFirst as jest.Mock).mockResolvedValue({
        id: 19,
        student_id: 400,
        line_account_id: 78,
        relation_status: 'FRIEND',
        friend_line_uid: 'u_mid_400',
      });

      mockLineDispatcher.sendPersonalMessage.mockRejectedValueOnce(new Error('LEGY stream reset'));

      await expect(processDeliveryJob(makeRetryJob(714))).resolves.toBeUndefined();

      expect(mockLineDispatcher.sendPersonalMessage).toHaveBeenCalledTimes(1);
      expect(state.status).toBe('FAILED');
      expect(state.retry_count).toBe(1);
      expect(state.error_message).toContain(UNCERTAIN_SEND_ERROR_PREFIX);
      expect(state.error_message).toContain('LEGY stream reset');
    });

    it('gate rejects FAILED delivery when retry_count >= maxAttempts (3)', async () => {
      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 715,
        status: 'FAILED',
        retry_count: 3,
        error_message: `${PRE_SEND_ERROR_PREFIX} Group ID missing`,
        enrollment_id: 300,
        line_account_id: 77,
        line_group_id: 15,
        rendered_content: 'Max attempts reached',
        automation_step: { id: 41, session_number: 5, trigger_event: 'ATTENDED', channel: 'LINE_GROUP' },
        enrollment: {
          student_id: 400,
          student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', zalo_uid: null, line_uid: null },
        },
        line_account: { id: 77, status: 'ACTIVE', account_type: 'OA', line_mid: 'U_oa', display_name: 'OA' },
        line_group: { id: 15, line_group_id: 'C_grp', name: 'Grp' },
        attendance: { enrollment_class: {} },
      });

      await processDeliveryJob(makeRetryJob(715));

      expect(prisma.attendance.count).not.toHaveBeenCalled();
      expect(mockLineDispatcher.ensureAccountReady).not.toHaveBeenCalled();
      expect(mockLineDispatcher.sendGroupMessage).not.toHaveBeenCalled();
      expect(prisma.messageDelivery.update).not.toHaveBeenCalled();
    });

    it('SENDING row is never blind-resent or mutated by a new job execution', async () => {
      const mockZaloSend = jest.fn();
      (zaloPool.getApi as jest.Mock).mockReturnValue({ sendMessage: mockZaloSend });

      (prisma.messageDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 716,
        status: 'SENDING',
        retry_count: 0,
        error_message: null,
        enrollment_id: 300,
        zalo_account_id: 12,
        zalo_group_id: null,
        line_account_id: null,
        line_group_id: null,
        rendered_content: 'Đang gửi giữa chừng khi worker cũ crash',
        automation_step: { id: 41, session_number: 5, trigger_event: 'ATTENDED', channel: 'ZALO_PERSONAL' },
        enrollment: {
          student_id: 400,
          student: { id: 400, full_name: 'Nguyễn Văn A', phone: '0988767563', zalo_uid: 'z_400', line_uid: null },
        },
        zalo_account: { id: 12, status: 'ACTIVE', zalo_uid: 'cs_zalo', display_name: 'CS Zalo' },
        zalo_group: null,
        line_account: null,
        line_group: null,
        attendance: { enrollment_class: {} },
      });

      await processDeliveryJob(makeRetryJob(716));

      expect(prisma.attendance.count).not.toHaveBeenCalled();
      expect(mockZaloSend).not.toHaveBeenCalled();
      expect(mockLineDispatcher.sendPersonalMessage).not.toHaveBeenCalled();
      expect(prisma.messageDelivery.update).not.toHaveBeenCalled();
    });
  });
});
