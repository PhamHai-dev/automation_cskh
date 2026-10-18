/**
 * line-oa.adapter.ts — Official Account Adapter using `@line/bot-sdk`.
 *
 * Features:
 *   - Instantiates `messagingApi.MessagingApiClient` and `messagingApi.MessagingApiBlobClient`.
 *   - `verifyAndFetchBotInfo()`: calls `getBotInfo()`, `getMessageQuota()`, `getMessageQuotaConsumption()`.
 *   - `sendMessageWithReplyFallback(params)`:
 *       1. Checks `LineConversation` for an unexpired `reply_token` (`reply_token_expires_at > now`).
 *       2. Reply-First (0 quota): calls `replyMessage` and clears `reply_token`. Falls back to `pushMessage` on HTTP 400.
 *       3. Push-Fallback with Idempotency: calls `pushMessage` with `X-Line-Retry-Key` UUID.
 *          Handles HTTP 409 Conflict gracefully as already-delivered.
 *          Retries without `quoteToken` if `quoteToken` triggers HTTP 400.
 *   - `verifyWebhookSignature(rawBody, signature, channelSecret)`: HMAC-SHA256 signature verification.
 */

import crypto from 'node:crypto';
import { messagingApi, validateSignature } from '@line/bot-sdk';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import type { LineBotProfileInfo, LineOaSessionData } from './types/line.types';
import type { LineSendResult } from './line-dispatcher.contract';

const log = createLogger('LineOaAdapter');

export interface SendMessageWithReplyFallbackParams {
  lineAccountId: number;
  to: string;
  text: string;
  quoteToken?: string;
  retryKey?: string;
}

function getHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const anyErr = err as Record<string, any>;
  if (typeof anyErr.statusCode === 'number') return anyErr.statusCode;
  if (typeof anyErr.status === 'number') return anyErr.status;
  if (typeof anyErr.httpResponse?.status === 'number') return anyErr.httpResponse.status;
  if (typeof anyErr.response?.status === 'number') return anyErr.response.status;
  return undefined;
}

export class LineOaAdapter {
  public readonly accountId: number;
  public readonly channelId: string;
  public readonly channelSecret: string;
  public readonly channelAccessToken: string;
  public basicId?: string;
  public readonly client: messagingApi.MessagingApiClient;
  public readonly blobClient: messagingApi.MessagingApiBlobClient;

  constructor(accountId: number, credentials: LineOaSessionData) {
    this.accountId = accountId;
    this.channelId = credentials.channelId;
    this.channelSecret = credentials.channelSecret;
    this.channelAccessToken = credentials.channelAccessToken;
    this.basicId = credentials.basicId;

    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: credentials.channelAccessToken,
    });
    this.blobClient = new messagingApi.MessagingApiBlobClient({
      channelAccessToken: credentials.channelAccessToken,
    });
  }

  /**
   * Verify OA credentials and fetch bot profile + monthly quota & consumption.
   */
  async verifyAndFetchBotInfo(): Promise<LineBotProfileInfo> {
    const botInfo = await this.client.getBotInfo();

    let monthlyQuota: number | null = null;
    let monthlyConsumption = 0;

    try {
      const quota = await this.client.getMessageQuota();
      if (quota.type === 'limited' && typeof quota.value === 'number') {
        monthlyQuota = quota.value;
      }
    } catch (err) {
      log.warn(`[LineOaAdapter] getMessageQuota failed for account ${this.accountId}`, {
        error: String(err),
      });
    }

    try {
      const consumption = await this.client.getMessageQuotaConsumption();
      if (typeof consumption.totalUsage === 'number') {
        monthlyConsumption = consumption.totalUsage;
      }
    } catch (err) {
      log.warn(`[LineOaAdapter] getMessageQuotaConsumption failed for account ${this.accountId}`, {
        error: String(err),
      });
    }

    if (botInfo.basicId) {
      this.basicId = botInfo.basicId;
    }

    return {
      userId: botInfo.userId,
      basicId: botInfo.basicId,
      displayName: botInfo.displayName,
      pictureUrl: botInfo.pictureUrl,
      monthlyQuota,
      monthlyConsumption,
    };
  }

  /**
   * Send a text message using Reply-First (0 quota) when an unexpired reply_token exists
   * on LineConversation, falling back to Push API with X-Line-Retry-Key idempotency.
   */
  async sendMessageWithReplyFallback(
    params: SendMessageWithReplyFallbackParams,
  ): Promise<LineSendResult & { quoteToken?: string }> {
    const { lineAccountId, to, text, quoteToken } = params;
    const now = new Date();

    const conversation = await prisma.lineConversation.findUnique({
      where: {
        line_account_id_external_thread_id: {
          line_account_id: lineAccountId,
          external_thread_id: to,
        },
      },
      select: {
        id: true,
        reply_token: true,
        reply_token_expires_at: true,
      },
    });

    const hasFreshReplyToken =
      Boolean(conversation?.reply_token) &&
      Boolean(conversation?.reply_token_expires_at) &&
      conversation!.reply_token_expires_at!.getTime() > now.getTime();

    if (hasFreshReplyToken && conversation?.reply_token) {
      const replyToken = conversation.reply_token;

      await prisma.lineConversation
        .update({
          where: { id: conversation.id },
          data: { reply_token: null, reply_token_expires_at: null },
        })
        .catch(() => undefined);

      try {
        const replyRes = await this.client.replyMessage({
          replyToken,
          messages: [
            {
              type: 'text',
              text,
              ...(quoteToken ? { quoteToken } : {}),
            },
          ],
        });
        const firstSent = replyRes?.sentMessages?.[0];
        return {
          providerMessageId: firstSent?.id ?? `reply_${Date.now()}`,
          quoteToken: firstSent?.quoteToken,
          sentVia: 'reply_token',
        };
      } catch (err) {
        const status = getHttpStatus(err);
        log.warn(
          `[LineOaAdapter] replyMessage failed (${status ?? 'unknown'}) for account ${lineAccountId} -> falling back to pushMessage`,
          { error: String(err) },
        );
      }
    }

    const retryKey = params.retryKey || crypto.randomUUID();

    try {
      const pushRes = await this.invokePushMessage(to, text, retryKey, quoteToken);
      const firstSent = pushRes?.sentMessages?.[0];
      return {
        providerMessageId: firstSent?.id ?? `push_${retryKey}`,
        quoteToken: firstSent?.quoteToken,
        sentVia: 'push_api',
      };
    } catch (err) {
      const status = getHttpStatus(err);

      if (status === 409) {
        log.info(
          `[LineOaAdapter] pushMessage HTTP 409 Conflict (already delivered for retryKey=${retryKey})`,
        );
        return {
          providerMessageId: `push_idempotent_${retryKey}`,
          sentVia: 'push_api',
        };
      }

      if (status === 400 && quoteToken) {
        log.warn(
          `[LineOaAdapter] pushMessage with quoteToken returned HTTP 400 -> retrying without quoteToken`,
        );
        const fallbackRetryKey = crypto.randomUUID();
        try {
          const retryRes = await this.invokePushMessage(to, text, fallbackRetryKey, undefined);
          const firstSent = retryRes?.sentMessages?.[0];
          return {
            providerMessageId: firstSent?.id ?? `push_${fallbackRetryKey}`,
            quoteToken: firstSent?.quoteToken,
            sentVia: 'push_api',
          };
        } catch (retryErr) {
          if (getHttpStatus(retryErr) === 409) {
            return {
              providerMessageId: `push_idempotent_${fallbackRetryKey}`,
              sentVia: 'push_api',
            };
          }
          throw retryErr;
        }
      }

      throw err;
    }
  }

  private async invokePushMessage(
    to: string,
    text: string,
    retryKey: string,
    quoteToken?: string,
  ): Promise<messagingApi.PushMessageResponse> {
    const payload: messagingApi.PushMessageRequest = {
      to,
      messages: [
        {
          type: 'text',
          text,
          ...(quoteToken ? { quoteToken } : {}),
        },
      ],
    };

    return (this.client.pushMessage as any)(payload, retryKey);
  }

  async replyText(replyToken: string, text: string): Promise<string | null> {
    const res = await this.client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
    return res?.sentMessages?.[0]?.id ?? null;
  }

  async getUserProfile(userId: string) {
    return this.client.getProfile(userId);
  }

  async getGroupInfo(groupId: string): Promise<{
    groupId: string;
    groupName: string;
    pictureUrl?: string;
    memberCount: number;
  }> {
    const [summary, countRes] = await Promise.all([
      this.client.getGroupSummary(groupId).catch(() => ({
        groupId,
        groupName: `LINE Group ${groupId.slice(0, 8)}`,
        pictureUrl: undefined,
      })),
      this.client.getGroupMemberCount(groupId).catch(() => ({ count: 0 })),
    ]);

    return {
      groupId: summary.groupId || groupId,
      groupName: summary.groupName || `LINE Group ${groupId.slice(0, 8)}`,
      pictureUrl: summary.pictureUrl,
      memberCount: countRes.count ?? 0,
    };
  }

  async getGroupMemberProfile(groupId: string, userId: string) {
    return this.client.getGroupMemberProfile(groupId, userId);
  }

  static verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    channelSecret: string,
  ): boolean {
    if (!signature || !channelSecret) return false;
    try {
      return validateSignature(rawBody, channelSecret, signature);
    } catch {
      try {
        const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
        const expected = crypto
          .createHmac('sha256', channelSecret)
          .update(bodyBuf)
          .digest('base64');
        const sigBuf = Buffer.from(signature, 'utf8');
        const expBuf = Buffer.from(expected, 'utf8');
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
      } catch {
        return false;
      }
    }
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    return LineOaAdapter.verifyWebhookSignature(rawBody, signature, this.channelSecret);
  }
}
