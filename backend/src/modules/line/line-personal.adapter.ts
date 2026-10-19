/**
 * line-personal.adapter.ts — Personal Account Adapter using `@evex/linejs`.
 *
 * Hardened Features:
 *   - QR Login with E2EE Letter Sealing 6-digit PIN handshake (`qrcall` -> `pincall` -> `update:authtoken` / `update:qrcert`)
 *   - AuthToken + E2EE Keychain resume from AES-256-GCM encrypted session
 *   - Per-Account Proxy Isolation via `undici.ProxyAgent` custom `fetch` (pins Thrift `/S4` and HTTP/2 LEGY `/P5` traffic without mutating global `process.env.HTTP_PROXY`)
 *   - Epoch Guard & `AbortController` teardown (kills orphaned `listen({ talk: true, signal })` loops on reconnect/disconnect)
 *   - Debounced (2000ms) `reqseq` & E2EE Keychain persistence to `LineAccount.encrypted_session_data`
 *   - Human-like read receipt (`sendChatChecked`) + typing jitter (`150ms–450ms`) + `TalkException` code 35/8/14/107 detection
 *   - Circuit breaker (>5 disconnects within 5 minutes -> `disconnect_reason = 'circuit_breaker'`)
 */

import { createLogger } from '../../shared/logger/logger';
import { encryptJson } from '../../shared/crypto/aes-gcm';
import { lineRepository } from './line-repository';
import {
  emitLineQr,
  emitLinePin,
  emitLineStatus,
  emitLineMessage,
} from './line-socket';
import type { LinePersonalSessionData } from './types/line.types';
import type { LineSendResult } from './line-dispatcher.contract';

const log = createLogger('LinePersonalAdapter');

const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_BREAKER_THRESHOLD = 5; // >5 disconnects in 5 minutes trips circuit breaker
const STORAGE_PERSIST_DEBOUNCE_MS = 2000;

/**
 * Create a per-account custom `fetch` bound to `proxyUrl` via `undici.ProxyAgent`.
 */
export function createProxyFetch(
  proxyUrl?: string | null,
): ((input: any, init?: any) => Promise<any>) | undefined {
  if (!proxyUrl || !proxyUrl.trim()) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ProxyAgent, fetch: undiciFetch } = require('undici');
    const dispatcher = new ProxyAgent(proxyUrl.trim());
    const baseFetch = typeof undiciFetch === 'function' ? undiciFetch : globalThis.fetch;
    return (input: any, init?: any) => {
      return baseFetch(input, { ...(init ?? {}), dispatcher });
    };
  } catch (err) {
    log.warn('[LinePersonalAdapter] Failed to initialize undici.ProxyAgent; falling back to default fetch', {
      error: String(err),
    });
    return undefined;
  }
}

/**
 * Extract LINE Thrift `TalkException` numeric code if present on thrown error.
 */
function extractTalkExceptionCode(err: any): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  if (typeof err.code === 'number') return err.code;
  if (typeof err.errorCode === 'number') return err.errorCode;
  if (typeof err.data?.code === 'number') return err.data.code;
  if (typeof err.cause?.code === 'number') return err.cause.code;
  const msg = String(err.message ?? '');
  const match = msg.match(/\bcode[:=\s]+(\d+)\b/i);
  if (match) return Number(match[1]);
  return undefined;
}

/**
 * In-memory key-value storage compatible with `@evex/linejs` BaseStorage
 * so E2EE Letter Sealing keys (`e2eeKeys`, `qrCert`, `reqseq`, etc.) are captured and
 * persisted into `LineAccount.encrypted_session_data`.
 */
export class MemoryLineStorage {
  private store: Record<string, any>;
  private onMutate?: (snapshot: Record<string, any>, mutatedKey?: string) => void;

  constructor(
    initial?: Record<string, any>,
    onMutate?: (snapshot: Record<string, any>, mutatedKey?: string) => void,
  ) {
    this.store = { ...(initial ?? {}) };
    this.onMutate = onMutate;
  }

  public async set(key: string, value: any): Promise<void> {
    this.store[key] = value;
    this.onMutate?.(this.getSnapshot(), key);
  }

  public async get(key: string): Promise<any> {
    return this.store[key];
  }

  public async delete(key: string): Promise<void> {
    delete this.store[key];
    this.onMutate?.(this.getSnapshot(), key);
  }

  public async clear(): Promise<void> {
    this.store = {};
    this.onMutate?.(this.getSnapshot());
  }

  public getSnapshot(): Record<string, any> {
    return { ...this.store };
  }
}

export class LinePersonalAdapter {
  public readonly accountId: number;
  public proxyUrl: string | null;
  public client: any = null;
  public storage: MemoryLineStorage;
  public sessionData: LinePersonalSessionData;
  public isListening = false;
  public epoch = 0;
  public disconnectHistory: number[] = [];
  public circuitBroken = false;

  private abortController: AbortController | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private lastInboundMsgIdByThread = new Map<string, string>();

  constructor(
    accountId: number,
    initialSession?: Partial<LinePersonalSessionData>,
    proxyUrl?: string | null,
  ) {
    this.accountId = accountId;
    this.proxyUrl = proxyUrl ?? null;
    this.sessionData = {
      mode: 'PERSONAL',
      authToken: initialSession?.authToken ?? '',
      refreshToken: initialSession?.refreshToken,
      qrCert: initialSession?.qrCert,
      e2eeKeychain: initialSession?.e2eeKeychain ?? {},
      device: initialSession?.device ?? 'DESKTOPWIN',
    };

    this.storage = new MemoryLineStorage(this.sessionData.e2eeKeychain, (snapshot) => {
      this.sessionData.e2eeKeychain = snapshot;
      this.scheduleSessionPersistence();
    });
  }

  public setProxyUrl(proxyUrl: string | null): void {
    this.proxyUrl = proxyUrl;
  }

  /**
   * Debounced (2000ms) persistence of `sessionData` (including `reqseq` and E2EE keys)
   * into `LineAccount.encrypted_session_data`.
   */
  public scheduleSessionPersistence(): void {
    if (!this.sessionData.authToken) return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flushSessionPersistence();
    }, STORAGE_PERSIST_DEBOUNCE_MS);
    if (typeof (this.persistTimer as any)?.unref === 'function') {
      (this.persistTimer as any).unref();
    }
  }

  public async flushSessionPersistence(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.sessionData.authToken) return;
    try {
      this.sessionData.e2eeKeychain = this.storage.getSnapshot();
      await lineRepository.updateAccount(this.accountId, {
        encrypted_session_data: encryptJson(this.sessionData),
        session_epoch: this.epoch,
      });
    } catch (err) {
      log.warn(`[LinePersonalAdapter] Failed to flush session persistence for account ${this.accountId}`, {
        error: String(err),
      });
    }
  }

  /**
   * Prepare a new connection epoch, aborting any previous polling listener.
   */
  private advanceEpoch(): { epoch: number; signal: AbortSignal } {
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        // ignore
      }
    }
    this.isListening = false;
    this.epoch += 1;
    this.abortController = new AbortController();
    return { epoch: this.epoch, signal: this.abortController.signal };
  }

  /**
   * Record a disconnect event and trip circuit breaker if >5 disconnects occur within 5 minutes.
   */
  public async recordDisconnectEvent(reason = 'stream_disconnected'): Promise<boolean> {
    const now = Date.now();
    this.disconnectHistory = this.disconnectHistory.filter(
      (ts) => now - ts < CIRCUIT_BREAKER_WINDOW_MS,
    );
    this.disconnectHistory.push(now);

    if (this.disconnectHistory.length > CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBroken = true;
      this.disconnect();
      log.error(
        `[LinePersonalAdapter] Circuit breaker tripped for account ${this.accountId} (>5 disconnects in 5m)`,
      );
      await lineRepository
        .updateAccount(this.accountId, {
          status: 'NOT_LOGGED_IN',
          disconnect_reason: 'circuit_breaker',
          disconnected_at: new Date(),
          last_sync_error: `Circuit breaker: ${this.disconnectHistory.length} lần ngắt kết nối trong 5 phút`,
        })
        .catch(() => undefined);

      emitLineStatus({
        accountId: this.accountId,
        accountType: 'PERSONAL',
        status: 'NOT_LOGGED_IN',
        disconnectReason: 'circuit_breaker',
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    if (reason) {
      await lineRepository
        .updateAccount(this.accountId, {
          disconnect_reason: reason,
          disconnected_at: new Date(),
        })
        .catch(() => undefined);
    }
    return false;
  }

  private async loadLineJs(): Promise<any> {
    // @evex/linejs is an ESM-only package ("type": "module").
    // Use dynamic import via Function constructor so TypeScript ("module": "commonjs")
    // preserves native ESM import() at runtime in Node.js 22.
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    return dynamicImport('@evex/linejs');
  }

  private buildInitOptions(): Record<string, any> {
    const customProxyFetch = createProxyFetch(this.proxyUrl);
    return {
      device: (this.sessionData.device as any) || 'DESKTOPWIN',
      storage: this.storage as any,
      ...(customProxyFetch ? { fetch: customProxyFetch } : {}),
    };
  }

  /**
   * Start interactive QR Code + 6-digit PIN E2EE login for a Personal LINE account.
   */
  async startQrLogin(): Promise<{ qrUrl?: string; pinCode?: string; status: string }> {
    this.circuitBroken = false;
    this.disconnectHistory = [];
    const { epoch } = this.advanceEpoch();

    let firstQrUrl: string | undefined;
    let currentPin: string | undefined;

    let resolveInitialQr: ((val: { qrUrl?: string; pinCode?: string; status: string }) => void) | null =
      null;
    const initialQrPromise = new Promise<{ qrUrl?: string; pinCode?: string; status: string }>(
      (resolve) => {
        resolveInitialQr = resolve;
        setTimeout(() => {
          if (resolveInitialQr) {
            const r = resolveInitialQr;
            resolveInitialQr = null;
            r({ qrUrl: firstQrUrl, pinCode: currentPin, status: 'QR_PENDING' });
          }
        }, 8000);
      },
    );

    void this.runQrLoginFlow(epoch, {
      onQr: (qrUrl, qrDataUri) => {
        firstQrUrl = qrDataUri || qrUrl;
        if (resolveInitialQr) {
          const r = resolveInitialQr;
          resolveInitialQr = null;
          r({ qrUrl: firstQrUrl, status: 'QR_PENDING' });
        }
      },
      onPin: (pin) => {
        currentPin = pin;
        if (resolveInitialQr) {
          const r = resolveInitialQr;
          resolveInitialQr = null;
          r({ qrUrl: firstQrUrl, pinCode: pin, status: 'PIN_REQUIRED' });
        }
      },
    });

    return initialQrPromise;
  }

  private async runQrLoginFlow(
    runEpoch: number,
    callbacks?: {
      onQr?: (qrUrl: string, qrDataUri: string) => void;
      onPin?: (pin: string) => void;
    },
  ): Promise<void> {
    try {
      const linejs = await this.loadLineJs();
      const loginFn = linejs.loginWithQR ?? linejs.loginWithQrCode;

      if (typeof loginFn !== 'function') {
        throw new Error('@evex/linejs loginWithQR not available');
      }

      const handleQrUrl = async (qrUrl: string) => {
        if (this.epoch !== runEpoch) return;
        const qrDataUri = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
          qrUrl,
        )}`;
        await lineRepository.updateAccount(this.accountId, {
          status: 'QR_PENDING',
          qr_code: qrDataUri,
          pin_code: null,
          qr_pending_at: new Date(),
          session_epoch: runEpoch,
        });
        emitLineQr({
          accountId: this.accountId,
          qrUrl,
          qrCodeDataUri: qrDataUri,
          status: 'QR_PENDING',
          timestamp: new Date().toISOString(),
        });
        callbacks?.onQr?.(qrUrl, qrDataUri);
      };

      const handlePinCode = async (pin: string) => {
        if (this.epoch !== runEpoch) return;
        await lineRepository.updateAccount(this.accountId, {
          status: 'PIN_REQUIRED',
          pin_code: pin,
          session_epoch: runEpoch,
        });
        emitLinePin({
          accountId: this.accountId,
          pinCode: pin,
          status: 'PIN_REQUIRED',
          timestamp: new Date().toISOString(),
        });
        callbacks?.onPin?.(pin);
      };

      const client = await loginFn(
        {
          onReceiveQRUrl: handleQrUrl,
          onReceiveQrUrl: handleQrUrl,
          onPincodeRequest: handlePinCode,
          onReceivePinCode: handlePinCode,
        },
        this.buildInitOptions(),
      );

      if (this.epoch !== runEpoch) return;
      await this.finalizeConnectedClient(client, runEpoch);
    } catch (err: any) {
      if (this.epoch !== runEpoch) return;
      log.error(`[LinePersonalAdapter] QR login failed for account ${this.accountId}`, {
        error: err?.message ?? String(err),
      });
      await lineRepository
        .updateAccount(this.accountId, {
          status: 'NOT_LOGGED_IN',
          disconnect_reason: 'qr_login_failed',
          last_sync_error: err?.message ?? String(err),
        })
        .catch(() => undefined);

      emitLineStatus({
        accountId: this.accountId,
        accountType: 'PERSONAL',
        status: 'NOT_LOGGED_IN',
        disconnectReason: err?.message ?? 'QR login failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Reconnect using a previously saved authToken & E2EE keychain.
   */
  async connectWithSavedSession(): Promise<boolean> {
    if (!this.sessionData.authToken || this.circuitBroken) return false;
    const { epoch: runEpoch } = this.advanceEpoch();

    try {
      const linejs = await this.loadLineJs();
      const loginWithAuthToken = linejs.loginWithAuthToken;
      if (typeof loginWithAuthToken !== 'function') {
        throw new Error('@evex/linejs loginWithAuthToken not available');
      }

      const client = await loginWithAuthToken(
        this.sessionData.authToken,
        this.buildInitOptions(),
      );

      if (this.epoch !== runEpoch) return false;
      await this.finalizeConnectedClient(client, runEpoch);
      return true;
    } catch (err: any) {
      log.warn(`[LinePersonalAdapter] Reconnect failed for account ${this.accountId}`, {
        error: err?.message ?? String(err),
      });
      await this.handleTalkExceptionOrDisconnect(err);
      return false;
    }
  }

  private async finalizeConnectedClient(client: any, runEpoch = this.epoch): Promise<void> {
    if (this.epoch !== runEpoch) return;
    this.client = client;
    const authToken = client?.authToken || this.sessionData.authToken;
    this.sessionData.authToken = authToken;
    this.sessionData.e2eeKeychain = this.storage.getSnapshot();

    let mid: string | null = null;
    let displayName: string | null = null;
    let pictureUrl: string | null = null;

    try {
      const profile =
        (await client.getMyProfile?.()) ?? (await client.base?.talk?.getProfile?.());
      mid = profile?.mid ?? null;
      displayName = profile?.displayName ?? null;
      pictureUrl = profile?.pictureStatus
        ? `https://obs.line-scdn.net/${profile.pictureStatus}`
        : null;
    } catch (err) {
      log.warn(`[LinePersonalAdapter] getProfile failed after login for account ${this.accountId}`, {
        error: String(err),
      });
    }

    const encrypted = encryptJson(this.sessionData);
    const now = new Date();

    const updated = await lineRepository.updateAccount(this.accountId, {
      status: 'ACTIVE',
      ...(mid ? { line_mid: mid } : {}),
      ...(displayName ? { display_name: displayName } : {}),
      ...(pictureUrl ? { avatar_url: pictureUrl } : {}),
      encrypted_session_data: encrypted,
      qr_code: null,
      pin_code: null,
      last_connected_at: now,
      last_login_at: now,
      last_active_at: now,
      disconnect_reason: null,
      session_epoch: runEpoch,
    });

    emitLineStatus({
      accountId: this.accountId,
      accountType: 'PERSONAL',
      status: 'ACTIVE',
      displayName: updated.display_name,
      lineMid: updated.line_mid,
      avatarUrl: updated.avatar_url,
      timestamp: now.toISOString(),
    });

    this.startPollingListener(runEpoch);
    void this.syncFriends().catch(() => undefined);
    void this.syncGroups().catch(() => undefined);
  }

  public startPollingListener(listenerEpoch = this.epoch): void {
    if (!this.client || this.isListening) return;
    this.isListening = true;

    if (!this.abortController || this.abortController.signal.aborted) {
      this.abortController = new AbortController();
    }
    const signal = this.abortController.signal;

    try {
      this.client.on?.('update:authtoken', async (newToken: string) => {
        if (this.epoch !== listenerEpoch) return;
        this.sessionData.authToken = newToken;
        this.sessionData.e2eeKeychain = this.storage.getSnapshot();
        await lineRepository
          .updateAccount(this.accountId, {
            encrypted_session_data: encryptJson(this.sessionData),
            session_epoch: this.epoch,
          })
          .catch(() => undefined);
      });

      this.client.on?.('update:qrcert', async (qrCert: string) => {
        if (this.epoch !== listenerEpoch) return;
        this.sessionData.qrCert = qrCert;
        this.scheduleSessionPersistence();
      });

      this.client.on?.('message', async (msg: any) => {
        if (this.epoch !== listenerEpoch) return;
        try {
          const isGroup =
            msg?.toType === 'GROUP' ||
            msg?.toType === 2 ||
            String(msg?.to ?? '').startsWith('c');
          const externalThreadId = isGroup
            ? String(msg.to)
            : String(msg.from ?? msg.author?.mid ?? '');
          if (!externalThreadId) return;

          const text = String(msg?.text ?? msg?.content ?? '');
          const lineMsgId = String(msg?.id ?? `personal_${Date.now()}`);
          const senderUid = String(msg?.from ?? msg?.author?.mid ?? externalThreadId);
          const isSelf = Boolean(msg?.isMyMessage);

          if (!isSelf && msg?.id) {
            this.lastInboundMsgIdByThread.set(externalThreadId, String(msg.id));
          }

          const conv = await lineRepository.upsertConversation({
            line_account_id: this.accountId,
            external_thread_id: externalThreadId,
            thread_type: isGroup ? 'group' : 'user',
            last_message_at: new Date(),
            incrementUnread: !isSelf,
            is_replied: isSelf,
          });

          const saved = await lineRepository.saveMessage({
            conversation_id: conv.id,
            line_msg_id: lineMsgId,
            sender_uid: senderUid,
            sender_type: isSelf ? 'self' : 'other',
            content: text,
            content_type: 'text',
            is_self: isSelf,
            sent_via: 'user',
            timestamp: new Date(),
          });

          emitLineMessage({
            accountId: this.accountId,
            conversationId: conv.id,
            externalThreadId,
            threadType: isGroup ? 'group' : 'user',
            message: {
              id: saved.id,
              lineMsgId: saved.line_msg_id,
              senderUid: saved.sender_uid,
              senderName: saved.sender_name,
              senderType: isSelf ? 'self' : 'other',
              content: saved.content,
              contentType: saved.content_type,
              isSelf: saved.is_self,
              sentVia: saved.sent_via,
              timestamp: saved.timestamp.toISOString(),
            },
          });
        } catch (err) {
          log.warn(`[LinePersonalAdapter] message listener error on account ${this.accountId}`, {
            error: String(err),
          });
        }
      });

      if (typeof this.client.listen === 'function') {
        void Promise.resolve(this.client.listen({ talk: true, signal })).catch(async (err) => {
          if (this.epoch !== listenerEpoch || signal.aborted) return;
          log.warn(`[LinePersonalAdapter] listen stopped for account ${this.accountId}`, {
            error: String(err),
          });
          this.isListening = false;
          await this.recordDisconnectEvent('stream_disconnected');
        });
      }
    } catch (err) {
      this.isListening = false;
      log.warn(`[LinePersonalAdapter] Failed to attach polling listener`, { error: String(err) });
    }
  }

  /**
   * Inspect LINE `TalkException` codes and update account status or throw descriptive error:
   *   - `code === 35` (`ABUSE_BLOCK`): throw descriptive Vietnamese error
   *   - `code === 8 || code === 14`: mark account `EXPIRED`
   *   - `code === 107`: mark account `BANNED`
   */
  private async handleTalkExceptionOrDisconnect(err: any): Promise<never> {
    const code = extractTalkExceptionCode(err);

    if (code === 35) {
      log.error(
        `[LinePersonalAdapter] LINE TalkException Code 35 (ABUSE_BLOCK) on account ${this.accountId}`,
        { error: err?.message ?? String(err) },
      );
      const abuseErr: any = new Error(
        'LINE chặn tạm thời thao tác do giới hạn chống spam (Code 35 ABUSE_BLOCK)',
      );
      abuseErr.statusCode = 429;
      abuseErr.code = 35;
      throw abuseErr;
    }

    if (code === 8 || code === 14) {
      log.warn(
        `[LinePersonalAdapter] LINE TalkException Code ${code} (AUTH EXPIRED) on account ${this.accountId}`,
      );
      this.disconnect();
      await lineRepository
        .updateAccount(this.accountId, {
          status: 'EXPIRED',
          disconnect_reason: `talk_exception_${code}`,
          disconnected_at: new Date(),
        })
        .catch(() => undefined);

      emitLineStatus({
        accountId: this.accountId,
        accountType: 'PERSONAL',
        status: 'EXPIRED',
        disconnectReason: `talk_exception_${code}`,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }

    if (code === 107) {
      log.error(
        `[LinePersonalAdapter] LINE TalkException Code 107 (BANNED) on account ${this.accountId}`,
      );
      this.disconnect();
      await lineRepository
        .updateAccount(this.accountId, {
          status: 'BANNED',
          disconnect_reason: 'talk_exception_107_banned',
          disconnected_at: new Date(),
        })
        .catch(() => undefined);

      emitLineStatus({
        accountId: this.accountId,
        accountType: 'PERSONAL',
        status: 'BANNED',
        disconnectReason: 'talk_exception_107_banned',
        timestamp: new Date().toISOString(),
      });
      throw err;
    }

    await lineRepository
      .updateAccount(this.accountId, {
        status: 'EXPIRED',
        disconnect_reason: 'token_expired',
        disconnected_at: new Date(),
      })
      .catch(() => undefined);
    throw err;
  }

  private async handleTalkOperationError(err: any): Promise<never> {
    const code = extractTalkExceptionCode(err);
    if (code === 35 || code === 8 || code === 14 || code === 107) {
      return this.handleTalkExceptionOrDisconnect(err);
    }
    throw err;
  }

  private async applyHumanReadAndTypingSimulation(toMid: string): Promise<void> {
    // Best-effort read receipt (`sendChatChecked`)
    try {
      const lastMsgId = this.lastInboundMsgIdByThread.get(toMid);
      if (lastMsgId && typeof this.client?.base?.talk?.sendChatChecked === 'function') {
        await this.client.base.talk.sendChatChecked({
          chatMid: toMid,
          lastMessageId: lastMsgId,
        });
      }
    } catch {
      // best-effort only
    }

    // Short human typing jitter (150ms–450ms in normal mode, skipped in unit tests)
    if (process.env.NODE_ENV !== 'test') {
      const jitterMs = 150 + Math.floor(Math.random() * 301);
      await new Promise((resolve) => setTimeout(resolve, jitterMs));
    }
  }

  /**
   * Send a 1-1 or Group message via `@evex/linejs` TalkService (with E2EE support,
   * human simulation, and `TalkException` detection).
   */
  async sendMessage(toMid: string, text: string): Promise<LineSendResult> {
    if (!this.client) {
      throw new Error('Personal LINE client is not connected');
    }

    await this.applyHumanReadAndTypingSimulation(toMid);

    try {
      let sent: any;
      if (typeof this.client.sendCompactMessage === 'function') {
        try {
          sent = await this.client.sendCompactMessage(toMid, text);
        } catch (firstErr) {
          const code = extractTalkExceptionCode(firstErr);
          if (code === 35 || code === 8 || code === 14 || code === 107) {
            throw firstErr;
          }
          sent = await this.client.base?.talk?.sendMessage?.({
            to: toMid,
            text,
            e2ee: false,
          });
        }
      } else if (this.client.base?.talk?.sendMessage) {
        try {
          sent = await this.client.base.talk.sendMessage({
            to: toMid,
            text,
            e2ee: true,
          });
        } catch (firstErr) {
          const code = extractTalkExceptionCode(firstErr);
          if (code === 35 || code === 8 || code === 14 || code === 107) {
            throw firstErr;
          }
          sent = await this.client.base.talk.sendMessage({
            to: toMid,
            text,
            e2ee: false,
          });
        }
      } else if (typeof this.client.sendMessage === 'function') {
        sent = await this.client.sendMessage({ to: toMid, text });
      } else {
        throw new Error('Personal LINE client does not expose sendMessage');
      }

      return {
        providerMessageId: sent?.id ? String(sent.id) : `linejs_${Date.now()}`,
        sentVia: 'personal_e2ee',
      };
    } catch (err) {
      return this.handleTalkOperationError(err);
    }
  }

  /**
   * Sync all contacts (`LineFriend`) for this Personal LINE account.
   */
  async syncFriends(): Promise<{ synced: number }> {
    if (!this.client) return { synced: 0 };

    try {
      let contacts: any[] = [];
      if (typeof this.client.fetchUsers === 'function') {
        contacts = (await this.client.fetchUsers()) ?? [];
      } else if (this.client.base?.talk) {
        const contactIds: string[] =
          (await this.client.base.talk.getAllContactIds?.()) ?? [];
        if (contactIds.length) {
          contacts =
            (await this.client.base.talk.getContacts?.({ mids: contactIds })) ?? [];
        }
      }

      let synced = 0;
      for (const c of contacts) {
        const raw = c?.raw ?? c;
        const mid = c?.mid ?? raw?.mid;
        if (!mid) continue;
        await lineRepository.upsertFriend(this.accountId, mid, {
          friendship_status: 'friend',
          relationship_kind: 'friend',
          line_display_name:
            c?.displayName ?? raw?.displayName ?? raw?.overriddenDisplayName ?? null,
          alias_in_nick: raw?.overriddenDisplayName ?? null,
          line_avatar_url: raw?.pictureStatus
            ? `https://obs.line-scdn.net/${raw.pictureStatus}`
            : null,
          status_message: c?.statusMessage ?? raw?.statusMessage ?? null,
        });
        synced++;
      }

      await lineRepository.updateAccount(this.accountId, { last_sync_at: new Date() });
      return { synced };
    } catch (err) {
      return this.handleTalkOperationError(err);
    }
  }

  /**
   * Sync all joined chats/groups (`LineGroup` & `LineGroupMember`) for this Personal LINE account.
   */
  async syncGroups(): Promise<{ synced: number }> {
    if (!this.client) return { synced: 0 };

    try {
      let chats: any[] = [];
      if (typeof this.client.fetchJoinedChats === 'function') {
        chats = (await this.client.fetchJoinedChats()) ?? [];
      } else if (this.client.base?.talk?.getAllChatMids) {
        const res = await this.client.base.talk.getAllChatMids({
          request: { withMemberChats: true, withInvitedChats: false },
        });
        const mids: string[] = res?.memberChatMids ?? [];
        if (mids.length > 0 && this.client.base.talk.getChats) {
          const chatsRes = await this.client.base.talk.getChats({
            request: { chatMids: mids, withMembers: true, withInvitees: false },
          });
          chats = chatsRes?.chats ?? [];
        }
      }

      let synced = 0;
      for (const chat of chats) {
        const chatMid = chat?.chatMid ?? chat?.mid;
        if (!chatMid) continue;
        const memberMids: string[] = Object.keys(chat?.extra?.groupExtra?.memberMids ?? {});
        const group = await lineRepository.upsertGroup({
          line_group_id: chatMid,
          line_account_id: this.accountId,
          name: chat?.chatName ?? chat?.name ?? `LINE Group ${chatMid.slice(0, 8)}`,
          avatar_url: chat?.picturePath
            ? `https://obs.line-scdn.net${chat.picturePath}`
            : null,
          member_count: memberMids.length || undefined,
          owner_line_uid: chat?.extra?.groupExtra?.creator ?? null,
        });

        for (const memberMid of memberMids.slice(0, 200)) {
          await lineRepository.upsertGroupMember({
            group_id: group.id,
            line_uid: memberMid,
            is_admin: memberMid === chat?.extra?.groupExtra?.creator,
          });
        }
        synced++;
      }

      return { synced };
    } catch (err) {
      return this.handleTalkOperationError(err);
    }
  }

  /**
   * Find a contact on LINE by phone number (Personal account capability).
   */
  async findContactByPhone(phone: string): Promise<{
    found: boolean;
    mid?: string;
    displayName?: string;
    avatarUrl?: string;
  }> {
    if (!this.client?.base?.talk?.findContactsByPhone) {
      throw new Error('Personal LINE client does not support phone lookup or is disconnected');
    }

    try {
      const normalized = phone.trim();
      const res = await this.client.base.talk.findContactsByPhone({
        phones: [normalized],
      });

      const firstKey = res ? Object.keys(res)[0] : undefined;
      const contact = firstKey ? res[firstKey]?.contact ?? res[firstKey] : undefined;
      if (!contact?.mid) {
        return { found: false };
      }

      const avatarUrl = contact.pictureStatus
        ? `https://obs.line-scdn.net/${contact.pictureStatus}`
        : undefined;

      await lineRepository.upsertFriend(this.accountId, contact.mid, {
        friendship_status: 'stranger',
        relationship_kind: 'stranger',
        phone_from_sdk: normalized,
        line_display_name: contact.displayName ?? null,
        line_avatar_url: avatarUrl ?? null,
      });

      return {
        found: true,
        mid: contact.mid,
        displayName: contact.displayName,
        avatarUrl,
      };
    } catch (err) {
      return this.handleTalkOperationError(err);
    }
  }

  /**
   * Send friend request to a target MID.
   */
  async sendFriendRequest(targetMid: string): Promise<{ sent: boolean }> {
    if (!this.client?.base?.talk) {
      throw new Error('Personal LINE client is not connected');
    }

    try {
      if (typeof this.client.base.talk.tryFriendRequest === 'function') {
        await this.client.base.talk.tryFriendRequest({
          midOrEMid: targetMid,
          method: 1,
        });
      } else if (typeof this.client.base.talk.findAndAddContactsByMid === 'function') {
        await this.client.base.talk.findAndAddContactsByMid({
          mid: targetMid,
          type: 0,
        });
      }

      await lineRepository.upsertFriend(this.accountId, targetMid, {
        friendship_status: 'friend',
        relationship_kind: 'friend',
      });

      return { sent: true };
    } catch (err) {
      return this.handleTalkOperationError(err);
    }
  }

  disconnect(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        // ignore
      }
      this.abortController = null;
    }
    this.epoch += 1;
    this.isListening = false;
    this.client = null;
  }
}
