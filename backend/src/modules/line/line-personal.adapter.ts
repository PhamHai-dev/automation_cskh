/**
 * line-personal.adapter.ts — Personal Account Adapter using `@evex/linejs`.
 *
 * Supports:
 *   - QR Login with E2EE Letter Sealing 6-digit PIN handshake (`qrcall` -> `pincall` -> `update:authtoken` / `update:qrcert`)
 *   - AuthToken + E2EE Keychain resume from AES-256-GCM encrypted session
 *   - 1-1 & Group messaging (with E2EE fallback to plain sendMessage)
 *   - Syncing Contacts (`LineFriend`) and Joined Groups (`LineGroup` & `LineGroupMember`)
 *   - Phone lookup (`findContactsByPhone`) and friend request (`tryFriendRequest`)
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

/**
 * In-memory key-value storage compatible with `@evex/linejs` BaseStorage
 * so E2EE Letter Sealing keys (`e2eeKeys`, `qrCert`, etc.) are captured and
 * persisted into `LineAccount.encrypted_session_data`.
 */
export class MemoryLineStorage {
  private store: Record<string, any>;
  private onMutate?: (snapshot: Record<string, any>) => void;

  constructor(initial?: Record<string, any>, onMutate?: (snapshot: Record<string, any>) => void) {
    this.store = { ...(initial ?? {}) };
    this.onMutate = onMutate;
  }

  public async set(key: string, value: any): Promise<void> {
    this.store[key] = value;
    this.onMutate?.(this.getSnapshot());
  }

  public async get(key: string): Promise<any> {
    return this.store[key];
  }

  public async delete(key: string): Promise<void> {
    delete this.store[key];
    this.onMutate?.(this.getSnapshot());
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
  public client: any = null;
  public storage: MemoryLineStorage;
  public sessionData: LinePersonalSessionData;
  public isListening = false;

  constructor(accountId: number, initialSession?: Partial<LinePersonalSessionData>) {
    this.accountId = accountId;
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
    });
  }

  private async loadLineJs(): Promise<any> {
    // @evex/linejs is an ESM-only package ("type": "module").
    // Use dynamic import via Function constructor so TypeScript ("module": "commonjs")
    // preserves native ESM import() at runtime in Node.js 22.
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    return dynamicImport('@evex/linejs');
  }

  /**
   * Start interactive QR Code + 6-digit PIN E2EE login for a Personal LINE account.
   */
  async startQrLogin(): Promise<{ qrUrl?: string; pinCode?: string; status: string }> {
    let firstQrUrl: string | undefined;
    let currentPin: string | undefined;

    let resolveInitialQr: ((val: { qrUrl?: string; pinCode?: string; status: string }) => void) | null =
      null;
    const initialQrPromise = new Promise<{ qrUrl?: string; pinCode?: string; status: string }>(
      (resolve) => {
        resolveInitialQr = resolve;
        // Timeout fallback so HTTP request returns promptly even if QR generation takes a few seconds
        setTimeout(() => {
          if (resolveInitialQr) {
            const r = resolveInitialQr;
            resolveInitialQr = null;
            r({ qrUrl: firstQrUrl, pinCode: currentPin, status: 'QR_PENDING' });
          }
        }, 8000);
      },
    );

    void this.runQrLoginFlow({
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

  private async runQrLoginFlow(callbacks?: {
    onQr?: (qrUrl: string, qrDataUri: string) => void;
    onPin?: (pin: string) => void;
  }): Promise<void> {
    try {
      const linejs = await this.loadLineJs();
      const loginFn = linejs.loginWithQR ?? linejs.loginWithQrCode;

      if (typeof loginFn !== 'function') {
        throw new Error('@evex/linejs loginWithQR not available');
      }

      const handleQrUrl = async (qrUrl: string) => {
        const qrDataUri = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
          qrUrl,
        )}`;
        await lineRepository.updateAccount(this.accountId, {
          status: 'QR_PENDING',
          qr_code: qrDataUri,
          pin_code: null,
          qr_pending_at: new Date(),
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
        await lineRepository.updateAccount(this.accountId, {
          status: 'PIN_REQUIRED',
          pin_code: pin,
        });
        emitLinePin({
          accountId: this.accountId,
          pinCode: pin,
          status: 'PIN_REQUIRED',
          timestamp: new Date().toISOString(),
        });
        callbacks?.onPin?.(pin);
      };

      // @evex/linejs v2.7 signature: loginWithQR(opts: WithQROptions, init: InitOptions)
      const client = await loginFn(
        {
          onReceiveQRUrl: handleQrUrl,
          onReceiveQrUrl: handleQrUrl,
          onPincodeRequest: handlePinCode,
          onReceivePinCode: handlePinCode,
        },
        {
          device: (this.sessionData.device as any) || 'DESKTOPWIN',
          storage: this.storage as any,
        },
      );

      await this.finalizeConnectedClient(client);
    } catch (err: any) {
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
    if (!this.sessionData.authToken) return false;
    try {
      const linejs = await this.loadLineJs();
      const loginWithAuthToken = linejs.loginWithAuthToken;
      if (typeof loginWithAuthToken !== 'function') {
        throw new Error('@evex/linejs loginWithAuthToken not available');
      }

      const client = await loginWithAuthToken(this.sessionData.authToken, {
        device: (this.sessionData.device as any) || 'DESKTOPWIN',
        storage: this.storage as any,
      });

      await this.finalizeConnectedClient(client);
      return true;
    } catch (err: any) {
      log.warn(`[LinePersonalAdapter] Reconnect failed for account ${this.accountId}`, {
        error: err?.message ?? String(err),
      });
      await lineRepository
        .updateAccount(this.accountId, {
          status: 'EXPIRED',
          disconnect_reason: 'token_expired',
          disconnected_at: new Date(),
        })
        .catch(() => undefined);
      return false;
    }
  }

  private async finalizeConnectedClient(client: any): Promise<void> {
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

    this.startPollingListener();
    void this.syncFriends().catch(() => undefined);
    void this.syncGroups().catch(() => undefined);
  }

  private startPollingListener(): void {
    if (!this.client || this.isListening) return;
    this.isListening = true;

    try {
      this.client.on?.('update:authtoken', async (newToken: string) => {
        this.sessionData.authToken = newToken;
        this.sessionData.e2eeKeychain = this.storage.getSnapshot();
        await lineRepository
          .updateAccount(this.accountId, {
            encrypted_session_data: encryptJson(this.sessionData),
          })
          .catch(() => undefined);
      });

      this.client.on?.('message', async (msg: any) => {
        try {
          const isGroup = msg?.toType === 'GROUP' || msg?.toType === 2 || String(msg?.to ?? '').startsWith('c');
          const externalThreadId = isGroup ? String(msg.to) : String(msg.from ?? msg.author?.mid ?? '');
          if (!externalThreadId) return;

          const text = String(msg?.text ?? msg?.content ?? '');
          const lineMsgId = String(msg?.id ?? `personal_${Date.now()}`);
          const senderUid = String(msg?.from ?? msg?.author?.mid ?? externalThreadId);
          const isSelf = Boolean(msg?.isMyMessage);

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
        void Promise.resolve(this.client.listen({ talk: true })).catch((err) => {
          log.warn(`[LinePersonalAdapter] listen stopped for account ${this.accountId}`, {
            error: String(err),
          });
          this.isListening = false;
        });
      }
    } catch (err) {
      this.isListening = false;
      log.warn(`[LinePersonalAdapter] Failed to attach polling listener`, { error: String(err) });
    }
  }

  /**
   * Send a 1-1 or Group message via `@evex/linejs` TalkService (with E2EE support).
   */
  async sendMessage(toMid: string, text: string): Promise<LineSendResult> {
    if (!this.client) {
      throw new Error('Personal LINE client is not connected');
    }

    let sent: any;
    if (typeof this.client.sendCompactMessage === 'function') {
      try {
        sent = await this.client.sendCompactMessage(toMid, text);
      } catch {
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
      } catch {
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
  }

  /**
   * Sync all contacts (`LineFriend`) for this Personal LINE account.
   */
  async syncFriends(): Promise<{ synced: number }> {
    if (!this.client) return { synced: 0 };

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
  }

  /**
   * Sync all joined chats/groups (`LineGroup` & `LineGroupMember`) for this Personal LINE account.
   */
  async syncGroups(): Promise<{ synced: number }> {
    if (!this.client) return { synced: 0 };

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
  }

  /**
   * Send friend request to a target MID.
   */
  async sendFriendRequest(targetMid: string): Promise<{ sent: boolean }> {
    if (!this.client?.base?.talk) {
      throw new Error('Personal LINE client is not connected');
    }

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
  }

  disconnect(): void {
    this.isListening = false;
    this.client = null;
  }
}
