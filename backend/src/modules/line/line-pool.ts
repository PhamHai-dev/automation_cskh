/**
 * line-pool.ts — Hybrid LINE Account Pool Manager (`linePool`).
 *
 * Manages both:
 *   - `LineAccountType.OA` instances (`LineOaAdapter` wrapping `@line/bot-sdk`)
 *   - `LineAccountType.PERSONAL` instances (`LinePersonalAdapter` wrapping `@evex/linejs`)
 *
 * Enforces `lineRateLimiter` on outbound personal/group messages and passes
 * `account.proxy_url` into `LinePersonalAdapter` for per-account IP isolation.
 */

import { createLogger } from '../../shared/logger/logger';
import { decryptJson, encryptJson } from '../../shared/crypto/aes-gcm';
import { lineRepository } from './line-repository';
import { LineOaAdapter } from './line-oa.adapter';
import { LinePersonalAdapter } from './line-personal.adapter';
import { lineRateLimiter } from './line-rate-limiter';
import {
  registerLineDeliveryDispatcher,
  type ILineDeliveryDispatcher,
  type LineSendResult,
  type RichMessageMetadata,
} from './line-dispatcher.contract';
import { emitLineMessage, emitLineStatus } from './line-socket';
import type {
  LineOaSessionData,
  LinePersonalSessionData,
  LineSessionData,
} from './types/line.types';

const log = createLogger('LinePool');

export class LineAccountPool implements ILineDeliveryDispatcher {
  private oaAdapters = new Map<number, LineOaAdapter>();
  private personalAdapters = new Map<number, LinePersonalAdapter>();

  constructor() {
    registerLineDeliveryDispatcher(this);
  }

  /**
   * Initialize pool at server startup — restore all active OA and PERSONAL accounts from DB.
   */
  async init(): Promise<void> {
    const accounts = await lineRepository.findActiveAccounts();
    log.info(`Initializing LINE pool with ${accounts.length} stored account(s)`);

    for (const account of accounts) {
      try {
        await this.ensureAccountReady(account.id);
      } catch (err) {
        log.warn(`Failed to initialize LINE account ${account.id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async shutdown(): Promise<void> {
    for (const adapter of this.personalAdapters.values()) {
      await adapter.flushSessionPersistence().catch(() => undefined);
      adapter.disconnect();
    }
    this.personalAdapters.clear();
    this.oaAdapters.clear();
  }

  getActiveAccountIds(): number[] {
    return [
      ...Array.from(this.oaAdapters.keys()),
      ...Array.from(this.personalAdapters.keys()),
    ];
  }

  getOaAdapter(accountId: number): LineOaAdapter | undefined {
    return this.oaAdapters.get(accountId);
  }

  getPersonalAdapter(accountId: number): LinePersonalAdapter | undefined {
    return this.personalAdapters.get(accountId);
  }

  /**
   * Connect and verify a LINE Official Account (`OA`).
   */
  async connectOaAccount(
    accountId: number,
    credentials: LineOaSessionData,
  ): Promise<LineOaAdapter> {
    const adapter = new LineOaAdapter(accountId, credentials);
    const botInfo = await adapter.verifyAndFetchBotInfo();

    const sessionToSave: LineOaSessionData = {
      ...credentials,
      mode: 'OA',
      basicId: botInfo.basicId || credentials.basicId,
    };

    const now = new Date();
    const updated = await lineRepository.updateAccount(accountId, {
      status: 'ACTIVE',
      line_mid: botInfo.userId,
      basic_id: botInfo.basicId || credentials.basicId || null,
      display_name: botInfo.displayName || null,
      avatar_url: botInfo.pictureUrl || null,
      monthly_quota: botInfo.monthlyQuota,
      monthly_consumption: botInfo.monthlyConsumption,
      encrypted_session_data: encryptJson(sessionToSave),
      webhook_secret: credentials.channelSecret,
      last_connected_at: now,
      last_login_at: now,
      last_active_at: now,
      disconnect_reason: null,
    });

    this.oaAdapters.set(accountId, adapter);

    emitLineStatus({
      accountId,
      accountType: 'OA',
      status: 'ACTIVE',
      displayName: updated.display_name,
      lineMid: updated.line_mid,
      basicId: updated.basic_id,
      avatarUrl: updated.avatar_url,
      monthlyQuota: updated.monthly_quota,
      monthlyConsumption: updated.monthly_consumption,
      timestamp: now.toISOString(),
    });

    return adapter;
  }

  /**
   * Start QR + 6-digit PIN login for a Personal LINE account (`PERSONAL`).
   */
  async startPersonalQrLogin(accountId: number): Promise<{
    qrUrl?: string;
    pinCode?: string;
    status: string;
  }> {
    const account = await lineRepository.findAccountById(accountId);
    const proxyUrl = account?.proxy_url ?? null;

    let adapter = this.personalAdapters.get(accountId);
    if (!adapter) {
      adapter = new LinePersonalAdapter(accountId, undefined, proxyUrl);
      this.personalAdapters.set(accountId, adapter);
    } else {
      adapter.setProxyUrl(proxyUrl);
    }
    return adapter.startQrLogin();
  }

  /**
   * Disconnect an account from the live pool.
   */
  async disconnectAccount(accountId: number, reason = 'manual_disconnect'): Promise<void> {
    this.oaAdapters.delete(accountId);
    const personal = this.personalAdapters.get(accountId);
    if (personal) {
      await personal.flushSessionPersistence().catch(() => undefined);
      personal.disconnect();
      this.personalAdapters.delete(accountId);
    }

    const updated = await lineRepository.updateAccount(accountId, {
      status: 'NOT_LOGGED_IN',
      disconnect_reason: reason,
      disconnected_at: new Date(),
    });

    emitLineStatus({
      accountId,
      accountType: updated.account_type,
      status: 'NOT_LOGGED_IN',
      displayName: updated.display_name,
      disconnectReason: reason,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── ILineDeliveryDispatcher Implementation ───────────────────────────────

  async ensureAccountReady(lineAccountId: number): Promise<boolean> {
    if (this.oaAdapters.has(lineAccountId)) return true;
    const existingPersonal = this.personalAdapters.get(lineAccountId);
    if (existingPersonal?.client) return true;

    const account = await lineRepository.findAccountById(lineAccountId);
    if (!account || account.archived_at || !account.encrypted_session_data) {
      return false;
    }

    try {
      const session = decryptJson<LineSessionData>(account.encrypted_session_data);
      if (account.account_type === 'OA' || session.mode === 'OA') {
        const oaCreds = session as LineOaSessionData;
        if (!oaCreds.channelAccessToken || !oaCreds.channelSecret) return false;
        const adapter = new LineOaAdapter(lineAccountId, oaCreds);
        this.oaAdapters.set(lineAccountId, adapter);
        if (account.status !== 'ACTIVE') {
          await lineRepository.updateAccount(lineAccountId, { status: 'ACTIVE' });
        }
        return true;
      } else {
        const personalCreds = session as LinePersonalSessionData;
        const adapter = new LinePersonalAdapter(
          lineAccountId,
          personalCreds,
          account.proxy_url,
        );
        const connected = await adapter.connectWithSavedSession();
        if (connected) {
          this.personalAdapters.set(lineAccountId, adapter);
          return true;
        }
        return false;
      }
    } catch (err) {
      log.warn(`ensureAccountReady failed for LINE account ${lineAccountId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async sendPersonalMessage(params: {
    lineAccountId: number;
    targetLineUid: string;
    content: string;
    richMetadata?: RichMessageMetadata | null;
    retryKey?: string;
    sentVia?: 'user' | 'automation' | 'system';
  }): Promise<LineSendResult> {
    const ready = await this.ensureAccountReady(params.lineAccountId);
    if (!ready) {
      throw new Error(`LINE account ${params.lineAccountId} is not ready`);
    }

    const oaAdapter = this.oaAdapters.get(params.lineAccountId);
    const accountType = oaAdapter ? 'OA' : 'PERSONAL';

    await lineRateLimiter.consumeOrThrow(params.lineAccountId, 'message', accountType);

    let result: LineSendResult;
    if (oaAdapter) {
      result = await oaAdapter.sendMessageWithReplyFallback({
        lineAccountId: params.lineAccountId,
        to: params.targetLineUid,
        text: params.content,
        ...(params.richMetadata ? { richMetadata: params.richMetadata } : {}),
        retryKey: params.retryKey,
      });
    } else {
      const personalAdapter = this.personalAdapters.get(params.lineAccountId);
      if (!personalAdapter) {
        throw new Error(`LINE personal adapter not found for account ${params.lineAccountId}`);
      }
      const linkSuffix = (params.richMetadata?.links ?? [])
        .map((l) => l.url?.trim())
        .filter((u): u is string => Boolean(u) && !params.content.includes(u!))
        .join('\n');
      const personalText = linkSuffix ? `${params.content}\n${linkSuffix}` : params.content;
      result = await personalAdapter.sendMessage(params.targetLineUid, personalText);
    }

    await this.recordOutboundMessage({
      lineAccountId: params.lineAccountId,
      externalThreadId: params.targetLineUid,
      threadType: 'user',
      content: params.content,
      providerMessageId: result.providerMessageId ?? `out_${Date.now()}`,
      sentVia: result.sentVia === 'reply_token' ? 'reply_token' : (params.sentVia ?? 'user'),
    });

    return result;
  }

  async sendGroupMessage(params: {
    lineAccountId: number;
    targetLineGroupId: string;
    content: string;
    richMetadata?: RichMessageMetadata | null;
    retryKey?: string;
    sentVia?: 'user' | 'automation' | 'system';
  }): Promise<LineSendResult> {
    const ready = await this.ensureAccountReady(params.lineAccountId);
    if (!ready) {
      throw new Error(`LINE account ${params.lineAccountId} is not ready`);
    }

    const oaAdapter = this.oaAdapters.get(params.lineAccountId);
    const accountType = oaAdapter ? 'OA' : 'PERSONAL';

    await lineRateLimiter.consumeOrThrow(params.lineAccountId, 'group_message', accountType);

    let result: LineSendResult;
    if (oaAdapter) {
      result = await oaAdapter.sendMessageWithReplyFallback({
        lineAccountId: params.lineAccountId,
        to: params.targetLineGroupId,
        text: params.content,
        ...(params.richMetadata ? { richMetadata: params.richMetadata } : {}),
        retryKey: params.retryKey,
      });
    } else {
      const personalAdapter = this.personalAdapters.get(params.lineAccountId);
      if (!personalAdapter) {
        throw new Error(`LINE personal adapter not found for account ${params.lineAccountId}`);
      }
      const linkSuffix = (params.richMetadata?.links ?? [])
        .map((l) => l.url?.trim())
        .filter((u): u is string => Boolean(u) && !params.content.includes(u!))
        .join('\n');
      const personalText = linkSuffix ? `${params.content}\n${linkSuffix}` : params.content;
      result = await personalAdapter.sendMessage(params.targetLineGroupId, personalText);
    }

    await this.recordOutboundMessage({
      lineAccountId: params.lineAccountId,
      externalThreadId: params.targetLineGroupId,
      threadType: 'group',
      content: params.content,
      providerMessageId: result.providerMessageId ?? `out_${Date.now()}`,
      sentVia: result.sentVia === 'reply_token' ? 'reply_token' : (params.sentVia ?? 'user'),
    });

    return result;
  }

  private async recordOutboundMessage(params: {
    lineAccountId: number;
    externalThreadId: string;
    threadType: 'user' | 'group';
    content: string;
    providerMessageId: string;
    sentVia: string;
  }): Promise<void> {
    try {
      const now = new Date();
      const conv = await lineRepository.upsertConversation({
        line_account_id: params.lineAccountId,
        external_thread_id: params.externalThreadId,
        thread_type: params.threadType,
        last_message_at: now,
        is_replied: true,
      });

      const saved = await lineRepository.saveMessage({
        conversation_id: conv.id,
        line_msg_id: params.providerMessageId,
        sender_uid: `account_${params.lineAccountId}`,
        sender_type: 'self',
        content: params.content,
        content_type: 'text',
        is_self: true,
        sent_via: params.sentVia,
        timestamp: now,
      });

      emitLineMessage({
        accountId: params.lineAccountId,
        conversationId: conv.id,
        externalThreadId: params.externalThreadId,
        threadType: params.threadType,
        message: {
          id: saved.id,
          lineMsgId: saved.line_msg_id,
          quoteToken: saved.quote_token,
          senderUid: saved.sender_uid,
          senderName: saved.sender_name,
          senderType: 'self',
          content: saved.content,
          contentType: saved.content_type,
          isSelf: true,
          sentVia: saved.sent_via,
          timestamp: saved.timestamp.toISOString(),
        },
      });
    } catch (err) {
      log.warn('Failed to persist outbound LINE message', { error: String(err) });
    }
  }
}

export const linePool = new LineAccountPool();
