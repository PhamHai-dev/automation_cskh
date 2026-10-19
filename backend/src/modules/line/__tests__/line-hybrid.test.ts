/**
 * Unit & integration tests for the Hardened Hybrid LINE module:
 *   - LineOaAdapter (HMAC-SHA256 signature verification, Reply-First 0-quota, Push-Fallback, HTTP 409 idempotency, Monthly Quota Guardrail at 100%)
 *   - LineRateLimiter (anti-ban burst/daily limits for friend_lookup protecting against TalkException Code 35, custom overrides, OA quota guardrail)
 *   - LinePersonalAdapter (per-account Proxy custom fetch, Epoch Guard & AbortController signal, debounced reqseq persistence, TalkException Code 35/107, circuit breaker)
 *   - LineService (AES-256-GCM credential export/import validation, rate-limited phone lookup)
 *   - LineWebhookHandler (2-tap `LK-xxxxxx` student binding, `join` class group event)
 *   - LineAccountPool (`ILineDeliveryDispatcher` registration & routing)
 */

import crypto from 'node:crypto';
import { LineOaAdapter } from '../line-oa.adapter';
import { LinePersonalAdapter } from '../line-personal.adapter';
import { lineRateLimiter } from '../line-rate-limiter';
import { lineService } from '../line.service';
import { lineWebhookHandler } from '../line-webhook.handler';
import { linePool } from '../line-pool';
import { getLineDeliveryDispatcher } from '../line-dispatcher.contract';
import { encryptJson } from '../../../shared/crypto/aes-gcm';
import { prisma } from '../../../prisma/client';
import { lineRepository } from '../line-repository';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-line-hybrid-32bytes';

jest.mock('../../../prisma/client', () => ({
  prisma: {
    lineAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
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

describe('LINE Hybrid Module (Official Account + Personal E2EE + Anti-Ban Hardening)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lineRateLimiter.resetMemory();
    (prisma.lineAccount.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.lineAccount.update as jest.Mock).mockResolvedValue({});
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

    it('blocks pushMessage at 100% monthly quota while still allowing free reply_token replies', async () => {
      const adapter = new LineOaAdapter(10, credentials);
      const replySpy = jest
        .spyOn(adapter.client, 'replyMessage')
        .mockResolvedValue({ sentMessages: [{ id: 'msg_free_reply_99' }] } as any);
      const pushSpy = jest
        .spyOn(adapter.client, 'pushMessage')
        .mockResolvedValue({ sentMessages: [{ id: 'msg_push_blocked' }] } as any);

      // Account is at 100% monthly quota (200 / 200)
      (prisma.lineAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        monthly_quota: 200,
        monthly_consumption: 200,
      });

      // 1. When no reply_token exists, pushMessage must be blocked by monthly quota guardrail
      (prisma.lineConversation.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        adapter.sendMessageWithReplyFallback({
          lineAccountId: 10,
          to: 'U_student_001',
          text: 'Push message vượt quota',
        }),
      ).rejects.toThrow(/100% hạn mức tin nhắn Push tháng của LINE OA/);
      expect(pushSpy).not.toHaveBeenCalled();

      // 2. When a fresh reply_token exists, free reply still succeeds despite 100% quota
      (prisma.lineConversation.findUnique as jest.Mock).mockResolvedValue({
        id: 55,
        reply_token: 'free_reply_token_still_works',
        reply_token_expires_at: new Date(Date.now() + 30_000),
      });

      const freeReplyRes = await adapter.sendMessageWithReplyFallback({
        lineAccountId: 10,
        to: 'U_student_001',
        text: 'Phản hồi miễn phí qua Reply Token',
      });

      expect(freeReplyRes.sentVia).toBe('reply_token');
      expect(freeReplyRes.providerMessageId).toBe('msg_free_reply_99');
      expect(replySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('LineRateLimiter (Anti-Ban & TalkException Code 35 Protection)', () => {
    it('blocks friend_lookup after 2 burst lookups in 10 minutes on PERSONAL account', async () => {
      const accountId = 501;

      // 1st lookup allowed
      await expect(
        lineRateLimiter.consumeOrThrow(accountId, 'friend_lookup', 'PERSONAL'),
      ).resolves.toBeUndefined();

      // 2nd lookup allowed
      await expect(
        lineRateLimiter.consumeOrThrow(accountId, 'friend_lookup', 'PERSONAL'),
      ).resolves.toBeUndefined();

      // 3rd lookup within 10 mins blocked with HTTP 429
      await expect(
        lineRateLimiter.consumeOrThrow(accountId, 'friend_lookup', 'PERSONAL'),
      ).rejects.toMatchObject({
        statusCode: 429,
        code: 'LINE_RATE_LIMIT_EXCEEDED',
      });
    });

    it('computes OA quota guardrail statuses (OK, WARN_80, CRITICAL_95, EXHAUSTED_100)', () => {
      expect(
        lineRateLimiter.checkOaQuotaGuardrail({ monthly_quota: 1000, monthly_consumption: 250 }),
      ).toMatchObject({ status: 'OK', usagePct: 25, allowPush: true, allowFreeReplyToken: true });

      expect(
        lineRateLimiter.checkOaQuotaGuardrail({ monthly_quota: 1000, monthly_consumption: 820 }),
      ).toMatchObject({
        status: 'WARN_80',
        usagePct: 82,
        allowPush: true,
        allowFreeReplyToken: true,
      });

      expect(
        lineRateLimiter.checkOaQuotaGuardrail({ monthly_quota: 1000, monthly_consumption: 960 }),
      ).toMatchObject({
        status: 'CRITICAL_95',
        usagePct: 96,
        allowPush: true,
        allowFreeReplyToken: true,
      });

      expect(
        lineRateLimiter.checkOaQuotaGuardrail({ monthly_quota: 1000, monthly_consumption: 1000 }),
      ).toMatchObject({
        status: 'EXHAUSTED_100',
        usagePct: 100,
        allowPush: false,
        allowFreeReplyToken: true,
      });
    });
  });

  describe('LinePersonalAdapter (Proxy Isolation, AbortController Signal, reqseq Persistence)', () => {
    it('passes custom proxy fetch and AbortController signal to @evex/linejs and persists reqseq updates', async () => {
      jest.useFakeTimers();
      try {
        const updateAccountSpy = jest
          .spyOn(lineRepository, 'updateAccount')
          .mockResolvedValue({
            id: 77,
            account_type: 'PERSONAL',
            status: 'ACTIVE',
            display_name: 'CSKH Personal',
            line_mid: 'u_mid_77',
            avatar_url: null,
          } as any);

        const listenMock = jest.fn().mockResolvedValue(undefined);
        const loginWithAuthTokenMock = jest.fn().mockResolvedValue({
          authToken: 'saved_auth_token_77',
          getMyProfile: jest.fn().mockResolvedValue({
            mid: 'u_mid_77',
            displayName: 'CSKH Personal',
          }),
          on: jest.fn(),
          listen: listenMock,
        });

        const adapter = new LinePersonalAdapter(
          77,
          {
            mode: 'PERSONAL',
            authToken: 'saved_auth_token_77',
            e2eeKeychain: { reqseq: 12 },
          },
          'http://proxy.edura.local:8080',
        );

        jest.spyOn(adapter as any, 'loadLineJs').mockResolvedValue({
          loginWithAuthToken: loginWithAuthTokenMock,
        });
        jest.spyOn(adapter, 'syncFriends').mockResolvedValue({ synced: 0 });
        jest.spyOn(adapter, 'syncGroups').mockResolvedValue({ synced: 0 });

        const connected = await adapter.connectWithSavedSession();
        expect(connected).toBe(true);

        // Verify custom proxy fetch was passed in InitOptions to loginWithAuthToken
        expect(loginWithAuthTokenMock).toHaveBeenCalledWith(
          'saved_auth_token_77',
          expect.objectContaining({
            device: 'DESKTOPWIN',
            storage: adapter.storage,
            fetch: expect.any(Function),
          }),
        );

        // Verify AbortController signal was passed to client.listen({ talk: true, signal })
        expect(listenMock).toHaveBeenCalledWith(
          expect.objectContaining({
            talk: true,
            signal: expect.any(AbortSignal),
          }),
        );
        const passedSignal: AbortSignal = listenMock.mock.calls[0][0].signal;
        expect(passedSignal.aborted).toBe(false);

        // Clear calls from initial login and mutate storage ("reqseq")
        updateAccountSpy.mockClear();
        await adapter.storage.set('reqseq', 42);

        // Advance debounce timer (2000ms) -> should persist encrypted_session_data with reqseq=42
        jest.advanceTimersByTime(2100);
        await Promise.resolve();

        expect(updateAccountSpy).toHaveBeenCalledWith(
          77,
          expect.objectContaining({
            encrypted_session_data: expect.any(String),
            session_epoch: adapter.epoch,
          }),
        );

        // Disconnect should abort the signal and increment epoch
        const prevEpoch = adapter.epoch;
        adapter.disconnect();
        expect(passedSignal.aborted).toBe(true);
        expect(adapter.epoch).toBe(prevEpoch + 1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('LineService Credential Export & Import Validation', () => {
    it('exports encrypted session blob and validates decrypted structure on import', async () => {
      const validPersonalBlob = encryptJson({
        mode: 'PERSONAL',
        authToken: 'token_abc_123',
        e2eeKeychain: { reqseq: 99 },
      });
      const validOaBlob = encryptJson({
        mode: 'OA',
        channelId: '2000999',
        channelSecret: 'sec_999',
        channelAccessToken: 'tok_999',
      });

      jest.spyOn(lineRepository, 'findAccountById').mockResolvedValue({
        id: 88,
        account_type: 'PERSONAL',
        display_name: 'Nick CS 01',
        encrypted_session_data: validPersonalBlob,
      } as any);
      const updateSpy = jest.spyOn(lineRepository, 'updateAccount').mockResolvedValue({
        id: 88,
        account_type: 'PERSONAL',
      } as any);

      // Export
      const exported = await lineService.exportCredentials(88);
      expect(exported.encrypted_session_data).toBe(validPersonalBlob);
      expect(exported.account_type).toBe('PERSONAL');

      // Import valid PERSONAL blob into PERSONAL account
      const imported = await lineService.importCredentials(88, validPersonalBlob);
      expect(imported.success).toBe(true);
      expect(imported.mode).toBe('PERSONAL');
      expect(updateSpy).toHaveBeenCalled();

      // Reject corrupted / non-decryptable blob
      await expect(lineService.importCredentials(88, 'not-valid-base64-gcm')).rejects.toMatchObject(
        { statusCode: 400 },
      );

      // Reject OA credentials imported into a PERSONAL account
      await expect(lineService.importCredentials(88, validOaBlob)).rejects.toMatchObject({
        statusCode: 400,
      });
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
