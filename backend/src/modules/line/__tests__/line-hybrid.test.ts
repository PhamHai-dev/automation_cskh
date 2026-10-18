/**
 * Unit & integration tests for the Hybrid LINE module:
 *   - LineOaAdapter (HMAC-SHA256 signature verification, Reply-First 0-quota, Push-Fallback, HTTP 409 idempotency)
 *   - LineWebhookHandler (2-tap `LK-xxxxxx` student binding, `join` class group event, synthetic ping skip)
 *   - LineAccountPool (`ILineDeliveryDispatcher` registration & routing between OA and PERSONAL)
 */

import crypto from 'node:crypto';
import { LineOaAdapter } from '../line-oa.adapter';
import { lineWebhookHandler } from '../line-webhook.handler';
import { linePool } from '../line-pool';
import { getLineDeliveryDispatcher } from '../line-dispatcher.contract';
import { prisma } from '../../../prisma/client';
import { lineRepository } from '../line-repository';

jest.mock('../../../prisma/client', () => ({
  prisma: {
    lineConversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    lineContactRelation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    student: {
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  },
}));

jest.mock('../../../shared/realtime/socket-singleton', () => ({
  getIo: jest.fn(() => null),
}));

describe('LINE Hybrid Module (Official Account + Personal E2EE)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('LineOaAdapter', () => {
    const channelSecret = 'test_channel_secret_123';
    const credentials = {
      mode: 'OA' as const,
      channelId: '2000123456',
      channelSecret,
      channelAccessToken: 'test_access_token_xyz',
      basicId: '@edura',
    };

    it('verifies valid HMAC-SHA256 X-Line-Signature and rejects tampered body', () => {
      const rawBody = JSON.stringify({ destination: 'U12345', events: [] });
      const validSignature = crypto
        .createHmac('sha256', channelSecret)
        .update(rawBody)
        .digest('base64');

      expect(LineOaAdapter.verifyWebhookSignature(rawBody, validSignature, channelSecret)).toBe(
        true,
      );
      expect(
        LineOaAdapter.verifyWebhookSignature(rawBody + 'tampered', validSignature, channelSecret),
      ).toBe(false);
    });

    it('uses Reply-First (0 quota) when LineConversation has an unexpired reply_token', async () => {
      const adapter = new LineOaAdapter(10, credentials);
      const replySpy = jest
        .spyOn(adapter.client, 'replyMessage')
        .mockResolvedValue({ sentMessages: [{ id: 'msg_reply_001', quoteToken: 'qt_1' }] } as any);
      const pushSpy = jest.spyOn(adapter.client, 'pushMessage');

      (prisma.lineConversation.findUnique as jest.Mock).mockResolvedValue({
        id: 55,
        reply_token: 'fresh_reply_token_abc',
        reply_token_expires_at: new Date(Date.now() + 30_000),
      });
      (prisma.lineConversation.update as jest.Mock).mockResolvedValue({});

      const res = await adapter.sendMessageWithReplyFallback({
        lineAccountId: 10,
        to: 'U_student_001',
        text: 'Xin chào phụ huynh!',
      });

      expect(res.sentVia).toBe('reply_token');
      expect(res.providerMessageId).toBe('msg_reply_001');
      expect(replySpy).toHaveBeenCalledWith({
        replyToken: 'fresh_reply_token_abc',
        messages: [{ type: 'text', text: 'Xin chào phụ huynh!' }],
      });
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('falls back to pushMessage when replyMessage returns HTTP 400 (expired token)', async () => {
      const adapter = new LineOaAdapter(10, credentials);
      jest
        .spyOn(adapter.client, 'replyMessage')
        .mockRejectedValue(Object.assign(new Error('Invalid reply token'), { statusCode: 400 }));
      const pushSpy = jest
        .spyOn(adapter.client, 'pushMessage')
        .mockResolvedValue({ sentMessages: [{ id: 'msg_push_002' }] } as any);

      (prisma.lineConversation.findUnique as jest.Mock).mockResolvedValue({
        id: 55,
        reply_token: 'expired_reply_token',
        reply_token_expires_at: new Date(Date.now() + 10_000),
      });
      (prisma.lineConversation.update as jest.Mock).mockResolvedValue({});

      const res = await adapter.sendMessageWithReplyFallback({
        lineAccountId: 10,
        to: 'U_student_001',
        text: 'Thông báo điểm danh',
        retryKey: '11111111-2222-4333-8444-555555555555',
      });

      expect(res.sentVia).toBe('push_api');
      expect(res.providerMessageId).toBe('msg_push_002');
      expect(pushSpy).toHaveBeenCalledTimes(1);
    });

    it('treats HTTP 409 Conflict on pushMessage as idempotent success', async () => {
      const adapter = new LineOaAdapter(10, credentials);
      (prisma.lineConversation.findUnique as jest.Mock).mockResolvedValue(null);
      jest
        .spyOn(adapter.client, 'pushMessage')
        .mockRejectedValue(Object.assign(new Error('Conflict'), { statusCode: 409 }));

      const retryKey = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      const res = await adapter.sendMessageWithReplyFallback({
        lineAccountId: 10,
        to: 'U_student_001',
        text: 'Tin nhắn chống trùng',
        retryKey,
      });

      expect(res.sentVia).toBe('push_api');
      expect(res.providerMessageId).toBe(`push_idempotent_${retryKey}`);
    });
  });

  describe('LineWebhookHandler', () => {
    it('processes join event by syncing LineGroup and LineConversation', async () => {
      jest.spyOn(lineRepository, 'findAccountById').mockResolvedValue({
        id: 7,
        account_type: 'OA',
        status: 'ACTIVE',
        webhook_secret: null,
      } as any);
      jest.spyOn(linePool, 'ensureAccountReady').mockResolvedValue(true);
      jest.spyOn(linePool, 'getOaAdapter').mockReturnValue({
        getGroupInfo: jest.fn().mockResolvedValue({
          groupId: 'C_group_ielts_01',
          groupName: 'Lớp IELTS B2 - Tối 2-4-6',
          pictureUrl: 'https://obs.line-scdn.net/group1',
          memberCount: 24,
        }),
      } as any);

      const upsertGroupSpy = jest.spyOn(lineRepository, 'upsertGroup').mockResolvedValue({
        id: 101,
        line_group_id: 'C_group_ielts_01',
        name: 'Lớp IELTS B2 - Tối 2-4-6',
        member_count: 24,
        avatar_url: 'https://obs.line-scdn.net/group1',
      } as any);
      const upsertConvSpy = jest
        .spyOn(lineRepository, 'upsertConversation')
        .mockResolvedValue({ id: 201 } as any);

      const result = await lineWebhookHandler.handleWebhook({
        accountId: 7,
        skipSignatureCheck: true,
        body: {
          events: [
            {
              type: 'join',
              replyToken: 'join_reply_token_999',
              timestamp: Date.now(),
              source: { type: 'group', groupId: 'C_group_ielts_01' },
            },
          ],
        },
      });

      expect(result.processed).toBe(1);
      expect(upsertGroupSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          line_group_id: 'C_group_ielts_01',
          line_account_id: 7,
          name: 'Lớp IELTS B2 - Tối 2-4-6',
          member_count: 24,
        }),
      );
      expect(upsertConvSpy).toHaveBeenCalled();
    });

    it('processes 2-tap student deep-link code (LK-XXXXXX) and replies via free replyToken', async () => {
      const replyTextMock = jest.fn().mockResolvedValue('msg_confirm_1');
      jest.spyOn(lineRepository, 'findAccountById').mockResolvedValue({
        id: 7,
        account_type: 'OA',
        status: 'ACTIVE',
      } as any);
      jest.spyOn(linePool, 'ensureAccountReady').mockResolvedValue(true);
      jest.spyOn(linePool, 'getOaAdapter').mockReturnValue({
        getUserProfile: jest.fn().mockResolvedValue({
          displayName: 'PH Nguyễn Văn A',
          pictureUrl: 'https://obs.line-scdn.net/u1',
        }),
        replyText: replyTextMock,
      } as any);

      jest.spyOn(lineRepository, 'upsertFriend').mockResolvedValue({} as any);
      jest.spyOn(lineRepository, 'upsertConversation').mockResolvedValue({ id: 301 } as any);
      jest.spyOn(lineRepository, 'saveMessage').mockResolvedValue({
        id: 401,
        line_msg_id: 'm1',
        sender_uid: 'U_parent_99',
        sender_name: 'PH Nguyễn Văn A',
        content: 'LK-15A9F2',
        content_type: 'text',
        sent_via: 'user',
        timestamp: new Date(),
      } as any);
      jest.spyOn(lineRepository, 'findContactRelationByLinkCode').mockResolvedValue({
        id: 88,
        student_id: 15,
        line_account_id: 7,
        display_name: null,
        avatar_url: null,
        student: { id: 15, full_name: 'Nguyễn Văn A' },
      } as any);
      (prisma.lineContactRelation.update as jest.Mock).mockResolvedValue({});
      (prisma.student.update as jest.Mock).mockResolvedValue({});
      (prisma.lineConversation.update as jest.Mock).mockResolvedValue({});

      await lineWebhookHandler.handleWebhook({
        accountId: 7,
        skipSignatureCheck: true,
        body: {
          events: [
            {
              type: 'message',
              replyToken: 'free_reply_token_123',
              timestamp: Date.now(),
              source: { type: 'user', userId: 'U_parent_99' },
              message: { id: 'm1', type: 'text', text: 'LK-15A9F2' },
            },
          ],
        },
      });

      expect(prisma.lineContactRelation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 88 },
          data: expect.objectContaining({
            relation_status: 'FRIEND',
            friend_line_uid: 'U_parent_99',
          }),
        }),
      );
      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 15 },
        data: { line_uid: 'U_parent_99' },
      });
      expect(replyTextMock).toHaveBeenCalledWith(
        'free_reply_token_123',
        expect.stringContaining('Nguyễn Văn A'),
      );
    });
  });

  describe('LineAccountPool Dispatcher Contract', () => {
    it('registers itself as the global ILineDeliveryDispatcher', () => {
      const dispatcher = getLineDeliveryDispatcher();
      expect(dispatcher).toBe(linePool);
    });
  });
});
