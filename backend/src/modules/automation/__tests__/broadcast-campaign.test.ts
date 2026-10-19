jest.mock('../../../shared/queue/redis-connection', () => ({
  getRedisClient: jest.fn(() => null),
}));

jest.mock('../../../shared/realtime/socket-singleton', () => ({
  getIo: jest.fn(() => ({
    emit: jest.fn(),
  })),
}));

jest.mock('../../zalo/zalo-pool', () => ({
  zaloPool: {
    getApi: jest.fn(),
    tryReconnect: jest.fn(),
  },
}));

jest.mock('../../zalo/zalo-rate-limiter', () => ({
  zaloRateLimiter: {
    checkLimits: jest.fn().mockResolvedValue({ allowed: true }),
    recordSend: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../prisma/client', () => ({
  prisma: {
    student: {
      findMany: jest.fn(),
    },
    zaloGroup: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    lineGroup: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    zaloAccount: {
      findMany: jest.fn(),
    },
    lineAccount: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    zaloContactRelation: {
      findMany: jest.fn(),
    },
    lineContactRelation: {
      findMany: jest.fn(),
    },
    broadcastCampaign: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    broadcastRecipient: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../../prisma/client';
import { zaloPool } from '../../zalo/zalo-pool';
import { zaloRateLimiter } from '../../zalo/zalo-rate-limiter';
import {
  registerLineDeliveryDispatcher,
  type ILineDeliveryDispatcher,
} from '../../line/line-dispatcher.contract';
import { broadcastService } from '../broadcast.service';
import { startAutomationWorker, stopAutomationWorker } from '../automation-worker';

describe('Multi-Channel Broadcast & Scheduled Campaign Engine', () => {
  let mockLineDispatcher: jest.Mocked<ILineDeliveryDispatcher>;
  let mockZaloSendMessage: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockZaloSendMessage = jest.fn().mockResolvedValue({
      data: { messageId: 'zalo-bcast-msg-01' },
    });
    (zaloPool.getApi as jest.Mock).mockReturnValue({
      sendMessage: mockZaloSendMessage,
    });
    (zaloRateLimiter.checkLimits as jest.Mock).mockResolvedValue({ allowed: true });

    mockLineDispatcher = {
      ensureAccountReady: jest.fn().mockResolvedValue(true),
      sendPersonalMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'line-bcast-personal-01',
        sentVia: 'push_api',
      }),
      sendGroupMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'line-bcast-group-01',
        sentVia: 'push_api',
      }),
    };
    registerLineDeliveryDispatcher(mockLineDispatcher);
  });

  afterEach(async () => {
    await stopAutomationWorker();
  });

  describe('IMMEDIATE Broadcast Campaign Creation & Multi-Channel Execution', () => {
    it('creates an IMMEDIATE campaign targeting students + Zalo groups + LINE groups, renders {{student_name}} variables, and dispatches via zaloPool & LINE dispatcher', async () => {
      // Mock 3 students:
      // 1. Student 101: Linked to Zalo Care Group
      // 2. Student 102: Linked to LINE Care Group
      // 3. Student 103: Unlinked (should become SKIPPED_NOT_FRIEND)
      (prisma.student.findMany as jest.Mock).mockResolvedValue([
        {
          id: 101,
          full_name: 'Nguyễn Minh Anh',
          phone: '0901234567',
          zalo_uid: null,
          line_uid: null,
          enrollments: [
            {
              id: 501,
              status: 'STUDYING',
              total_sessions: 24,
              external_remaining_sessions: 10,
              package: { id: 1, code: 'JLPT-N3', name: 'Luyện thi N3' },
              cs: { id: 9, name: 'CS Lan' },
              enrollment_classes: [
                {
                  class: {
                    id: 30,
                    class_name: 'N3-Tối-246',
                    class_teachers: [{ teacher: { id: 3, name: 'Sensei Yuki' } }],
                  },
                },
              ],
            },
          ],
          zalo_contact_relations: [
            {
              id: 1,
              student_id: 101,
              zalo_account_id: 11,
              relation_status: 'FRIEND',
              target_type: 'GROUP',
              zalo_group_id: 70,
              friend_zalo_uid: 'zalo_care_grp_101',
              display_name: '01 - 101 Nguyễn Minh Anh',
              zalo_account: { id: 11, cs_id: 9, display_name: 'CS Lan Zalo', status: 'ACTIVE' },
              zalo_group: {
                id: 70,
                zalo_group_id: 'zalo_care_grp_101',
                name: '01 - 101 Nguyễn Minh Anh',
                zalo_account_id: 11,
              },
            },
          ],
          line_contact_relations: [],
        },
        {
          id: 102,
          full_name: 'Trần Quốc Bảo',
          phone: '0987654321',
          zalo_uid: null,
          line_uid: null,
          enrollments: [
            {
              id: 502,
              status: 'STUDYING',
              total_sessions: 36,
              external_remaining_sessions: 18,
              package: { id: 2, code: 'JLPT-N2', name: 'Luyện thi N2' },
              cs: { id: 9, name: 'CS Lan' },
              enrollment_classes: [
                {
                  class: {
                    id: 31,
                    class_name: 'N2-Sáng-357',
                    class_teachers: [{ teacher: { id: 4, name: 'Sensei Ken' } }],
                  },
                },
              ],
            },
          ],
          zalo_contact_relations: [],
          line_contact_relations: [
            {
              id: 2,
              student_id: 102,
              line_account_id: 22,
              relation_status: 'FRIEND',
              target_type: 'GROUP',
              line_group_id: 80,
              friend_line_uid: 'C_line_care_grp_102',
              display_name: '02 - 102 Trần Quốc Bảo',
              line_account: {
                id: 22,
                cs_id: 9,
                display_name: 'Edura LINE OA',
                status: 'ACTIVE',
                account_type: 'OA',
              },
              line_group: {
                id: 80,
                line_group_id: 'C_line_care_grp_102',
                name: '02 - 102 Trần Quốc Bảo',
                line_account_id: 22,
              },
            },
          ],
        },
        {
          id: 103,
          full_name: 'Lê Hoàng Nam',
          phone: '0911223344',
          zalo_uid: null,
          line_uid: null,
          enrollments: [],
          zalo_contact_relations: [],
          line_contact_relations: [],
        },
      ]);

      (prisma.zaloGroup.findMany as jest.Mock).mockResolvedValue([
        {
          id: 71,
          zalo_group_id: 'zalo_class_grp_71',
          name: 'Nhóm Lớp N3 Chung',
          zalo_account_id: 11,
        },
      ]);

      (prisma.lineGroup.findMany as jest.Mock).mockResolvedValue([
        {
          id: 81,
          line_group_id: 'C_line_class_grp_81',
          name: 'Nhóm LINE Lớp N2 Chung',
          line_account_id: 22,
        },
      ]);

      let capturedRecipientsCreate: any[] = [];
      (prisma.broadcastCampaign.create as jest.Mock).mockImplementation(async ({ data }) => {
        capturedRecipientsCreate = data.recipients.create.map((r: any, idx: number) => ({
          id: 1000 + idx,
          campaign_id: 50,
          ...r,
        }));
        return {
          id: 50,
          ...data,
          recipients: capturedRecipientsCreate,
        };
      });

      (prisma.broadcastCampaign.findUnique as jest.Mock).mockResolvedValue({
        id: 50,
        name: 'Thông báo lịch thi thử JLPT',
        status: 'SENDING',
        total_recipients: 5,
        sent_count: 0,
        failed_count: 0,
        skipped_count: 1,
        started_at: new Date(),
      });

      (prisma.broadcastRecipient.findMany as jest.Mock).mockImplementation(async () =>
        capturedRecipientsCreate.filter((r) => ['SCHEDULED', 'QUEUED'].includes(r.status)),
      );

      (prisma.broadcastRecipient.update as jest.Mock).mockImplementation(
        async ({ where, data }) => {
          const item = capturedRecipientsCreate.find((r) => r.id === where.id);
          if (item) Object.assign(item, data);
          return item;
        },
      );

      (prisma.broadcastCampaign.update as jest.Mock).mockImplementation(async ({ data }) => ({
        id: 50,
        name: 'Thông báo lịch thi thử JLPT',
        ...data,
        recipients: capturedRecipientsCreate,
      }));

      const result = await broadcastService.createCampaign(
        {
          name: 'Thông báo lịch thi thử JLPT',
          message_content:
            'Chào {{student_name}}, lớp {{class_name}} còn {{remaining_sessions}} buổi. Liên hệ {{cs_name}} nhé!',
          channel_mode: 'AUTO',
          schedule_type: 'IMMEDIATE',
          student_ids: [101, 102, 103],
          zalo_group_ids: [71],
          line_group_ids: [81],
          awaitExecution: true,
        },
        9,
      );

      // Verify 5 recipients created: 3 students (1 Zalo Care Group, 1 LINE Care Group, 1 Skipped) + 1 Zalo Group + 1 LINE Group
      expect(capturedRecipientsCreate).toHaveLength(5);

      const r101 = capturedRecipientsCreate.find((r) => r.student_id === 101);
      expect(r101).toMatchObject({
        platform: 'ZALO',
        zalo_account_id: 11,
        zalo_group_id: 70,
        external_target_id: 'zalo_care_grp_101',
        rendered_content:
          'Chào Nguyễn Minh Anh, lớp N3-Tối-246 còn 10 buổi. Liên hệ CS Lan nhé!',
        status: 'SENT',
      });

      const r102 = capturedRecipientsCreate.find((r) => r.student_id === 102);
      expect(r102).toMatchObject({
        platform: 'LINE',
        line_account_id: 22,
        line_group_id: 80,
        external_target_id: 'C_line_care_grp_102',
        rendered_content:
          'Chào Trần Quốc Bảo, lớp N2-Sáng-357 còn 18 buổi. Liên hệ CS Lan nhé!',
        status: 'SENT',
      });

      const r103 = capturedRecipientsCreate.find((r) => r.student_id === 103);
      expect(r103).toMatchObject({
        student_id: 103,
        status: 'SKIPPED_NOT_FRIEND',
        error_message: 'Học viên chưa gắn Nhóm/Tài khoản Zalo hoặc LINE',
      });

      // Verify Zalo dispatch calls (both student 101 Care Group and Zalo Group 71 use threadType = 1)
      expect(mockZaloSendMessage).toHaveBeenCalledTimes(2);
      expect(mockZaloSendMessage).toHaveBeenCalledWith(
        'Chào Nguyễn Minh Anh, lớp N3-Tối-246 còn 10 buổi. Liên hệ CS Lan nhé!',
        'zalo_care_grp_101',
        1,
      );
      expect(mockZaloSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Nhóm Lớp N3 Chung'),
        'zalo_class_grp_71',
        1,
      );
      expect(zaloRateLimiter.checkLimits).toHaveBeenCalledWith(11, 'message');
      expect(zaloRateLimiter.recordSend).toHaveBeenCalledWith(11, 'message');

      // Verify LINE dispatch calls (both student 102 Care Group and LINE Group 81 use sendGroupMessage)
      expect(mockLineDispatcher.ensureAccountReady).toHaveBeenCalledWith(22);
      expect(mockLineDispatcher.sendGroupMessage).toHaveBeenCalledTimes(2);
      expect(mockLineDispatcher.sendGroupMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          lineAccountId: 22,
          targetLineGroupId: 'C_line_care_grp_102',
          content: 'Chào Trần Quốc Bảo, lớp N2-Sáng-357 còn 18 buổi. Liên hệ CS Lan nhé!',
          sentVia: 'automation',
        }),
      );
      expect(mockLineDispatcher.sendGroupMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          lineAccountId: 22,
          targetLineGroupId: 'C_line_class_grp_81',
          sentVia: 'automation',
        }),
      );

      expect(result?.status).toBe('COMPLETED');
      expect(result?.sent_count).toBe(4);
      expect(result?.failed_count).toBe(0);
      expect(result?.skipped_count).toBe(1);
    });
  });

  describe('SCHEDULED Campaign Poller, Cancel & Retry Failed', () => {
    it('creates a SCHEDULED campaign and executes it when processDueScheduledCampaigns() runs', async () => {
      const scheduledTime = new Date(Date.now() - 60_000).toISOString();

      (prisma.zaloGroup.findMany as jest.Mock).mockResolvedValue([
        {
          id: 90,
          zalo_group_id: 'zalo_grp_scheduled_90',
          name: 'Nhóm Lịch Học N4',
          zalo_account_id: 15,
        },
      ]);

      (prisma.broadcastCampaign.create as jest.Mock).mockImplementation(async ({ data }) => ({
        id: 88,
        ...data,
        recipients: data.recipients.create.map((r: any, i: number) => ({ id: 2000 + i, ...r })),
      }));

      const scheduledCampaign = await broadcastService.createCampaign(
        {
          name: 'Nhắc lịch học tối thứ 6',
          message_content: 'Nhắc lịch học lớp {{class_name}} lúc 19:30 tối nay!',
          schedule_type: 'SCHEDULED',
          scheduled_at: scheduledTime,
          zalo_group_ids: [90],
        },
        9,
      );

      expect(scheduledCampaign.status).toBe('SCHEDULED');
      expect(mockZaloSendMessage).not.toHaveBeenCalled();

      // Now run processDueScheduledCampaigns()
      (prisma.broadcastCampaign.findMany as jest.Mock).mockResolvedValue([
        {
          id: 88,
          name: 'Nhắc lịch học tối thứ 6',
          status: 'SCHEDULED',
          scheduled_at: new Date(scheduledTime),
          total_recipients: 1,
          sent_count: 0,
          failed_count: 0,
          skipped_count: 0,
        },
      ]);

      (prisma.broadcastCampaign.findUnique as jest.Mock).mockResolvedValue({
        id: 88,
        name: 'Nhắc lịch học tối thứ 6',
        status: 'SCHEDULED',
        total_recipients: 1,
        sent_count: 0,
        failed_count: 0,
        skipped_count: 0,
      });

      (prisma.broadcastRecipient.findMany as jest.Mock).mockResolvedValue([
        {
          id: 2000,
          campaign_id: 88,
          target_type: 'ZALO_GROUP',
          platform: 'ZALO',
          zalo_account_id: 15,
          zalo_group_id: 90,
          external_target_id: 'zalo_grp_scheduled_90',
          rendered_content: 'Nhắc lịch học lớp Nhóm Lịch Học N4 lúc 19:30 tối nay!',
          status: 'SCHEDULED',
        },
      ]);

      (prisma.broadcastRecipient.update as jest.Mock).mockResolvedValue({});
      (prisma.broadcastCampaign.update as jest.Mock).mockImplementation(async ({ data }) => ({
        id: 88,
        ...data,
      }));

      const pollerResult = await broadcastService.processDueScheduledCampaigns();

      expect(pollerResult).toEqual({
        processedCount: 1,
        campaignIds: [88],
      });
      expect(mockZaloSendMessage).toHaveBeenCalledWith(
        'Nhắc lịch học lớp Nhóm Lịch Học N4 lúc 19:30 tối nay!',
        'zalo_grp_scheduled_90',
        1,
      );
    });

    it('cancels a SCHEDULED campaign via cancelCampaign()', async () => {
      (prisma.broadcastCampaign.findUnique as jest.Mock).mockResolvedValue({
        id: 95,
        name: 'Chiến dịch sắp gửi',
        status: 'SCHEDULED',
      });
      (prisma.broadcastRecipient.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
      (prisma.broadcastCampaign.update as jest.Mock).mockResolvedValue({
        id: 95,
        status: 'CANCELLED',
        recipients: [],
      });

      const cancelled = await broadcastService.cancelCampaign(95);

      expect(cancelled.status).toBe('CANCELLED');
      expect(prisma.broadcastRecipient.updateMany).toHaveBeenCalledWith({
        where: {
          campaign_id: 95,
          status: { in: ['SCHEDULED', 'QUEUED'] },
        },
        data: { status: 'CANCELLED' },
      });
    });

    it('retries FAILED recipients via retryFailedRecipients()', async () => {
      let campaignState: any = {
        id: 96,
        name: 'Chiến dịch lỗi một phần',
        status: 'PARTIAL_FAILED',
        total_recipients: 2,
        sent_count: 1,
        failed_count: 1,
        skipped_count: 0,
      };
      (prisma.broadcastCampaign.findUnique as jest.Mock).mockImplementation(
        async () => campaignState,
      );

      (prisma.broadcastRecipient.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.broadcastRecipient.findMany as jest.Mock)
        .mockResolvedValueOnce([
          { id: 3001, status: 'SENT' },
          { id: 3002, status: 'SCHEDULED' },
        ])
        .mockResolvedValueOnce([
          {
            id: 3002,
            campaign_id: 96,
            target_type: 'LINE_USER',
            platform: 'LINE',
            line_account_id: 22,
            line_group_id: null,
            external_target_id: 'U_line_user_3002',
            rendered_content: 'Tin nhắn gửi lại qua LINE',
            status: 'SCHEDULED',
          },
        ]);

      (prisma.broadcastRecipient.update as jest.Mock).mockResolvedValue({});
      (prisma.broadcastCampaign.update as jest.Mock).mockImplementation(async ({ data }) => {
        campaignState = {
          ...campaignState,
          ...data,
          recipients: [],
        };
        return campaignState;
      });

      const retried = await broadcastService.retryFailedRecipients(96, { awaitExecution: true });

      expect(mockLineDispatcher.sendPersonalMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          lineAccountId: 22,
          targetLineUid: 'U_line_user_3002',
          content: 'Tin nhắn gửi lại qua LINE',
          sentVia: 'automation',
        }),
      );
      expect(retried?.status).toBe('COMPLETED');
      expect(retried?.sent_count).toBe(2);
      expect(retried?.failed_count).toBe(0);
    });

    it('starts and stops the 15s scheduled broadcast poller inside startAutomationWorker / stopAutomationWorker even when Redis is disabled', async () => {
      const worker = startAutomationWorker();
      expect(worker).toBeNull(); // Redis is mocked as null, but poller timer is started
      await stopAutomationWorker();
    });
  });
});
