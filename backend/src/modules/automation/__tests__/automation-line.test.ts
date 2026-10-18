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
      update: jest.fn(),
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
import { processDeliveryJob, type SendJobData } from '../automation-worker';

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
  });
});
