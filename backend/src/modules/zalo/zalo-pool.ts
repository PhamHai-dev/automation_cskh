/**
 * ZaloAccountPool — singleton managing live Zalo SDK instances.
 *
 * Ported from ZaloCRM zalo-pool.ts → single-org, Int IDs.
 *
 * Adaptations from ZaloCRM:
 *   - No orgId/ownerUserId → uses cs_id (Int), single-org
 *   - No runSystemQuery (no multi-tenant cross-org sweep)
 *   - No status-log-service (Chặng 2)
 *   - No message-sync, friend-sync, webhook, backfill (Chặng 2)
 *   - No sticky-hold (CRM-specific)
 *   - encrypted_session_data (AES-GCM) instead of raw ZaloCredentials.cookie
 *   - zca-js loaded via dynamic import (no createRequire ESM hack needed here)
 *
 * Core stability features KEPT from ZaloCRM:
 *   - Epoch guard (anti-flap: stale listener events ignored)
 *   - Circuit breaker (5 disconnects in 5min → stop auto-reconnect)
 *   - teardownExisting (clean old WS/listener before creating new)
 *   - cleanupStaleGhosts (hourly cron hides ghost qr_pending > 24h)
 *   - reconnect() eligibility guard (skip archived/ghost/manual-disconnect)
 *   - reconnect() uid verification (session must match existing zaloUid)
 *   - in-flight guard (prevent duplicate concurrent reconnects)
 */

import { EventEmitter } from 'events';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { encryptJson, decryptJson } from '../../shared/crypto/aes-gcm';
import { withProxy } from './proxy-util';
import { createProxyFetch } from '../../shared/network/proxy-dispatcher';
import { emitToAccount } from '../../shared/realtime/socket-singleton';
import type { ZaloSessionData } from './types/zalo.types';
import { PoolAccountStatus } from './types/zalo.types';
import { writeTransition } from './status-log-service';
import { extractZaloProfile } from './zalo-profile-utils';

const log = createLogger('ZaloPool');

// ── QR normalization ──────────────────────────────────────────────────────
/** Ensure QR image string has proper data URI prefix for browser <img> src. */
function normalizeQrImage(raw: string | null | undefined): string {
  if (!raw) return '';
  // Already has data URI prefix
  if (raw.startsWith('data:image')) return raw;
  // Looks like base64 — prepend PNG prefix
  if (/^[A-Za-z0-9+/=]/.test(raw)) {
    return `data:image/png;base64,${raw}`;
  }
  // Anything else (URL etc.) return as-is
  return raw;
}

// ── zca-js lazy require (CJS) ─────────────────────────────────────────────────
let ZaloClass: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zca = require('zca-js');
  ZaloClass = zca.Zalo ?? zca.default?.Zalo ?? null;
} catch {
  log.warn('zca-js not available — running in degraded mode (no QR login/reconnect)');
}

// ── Types ────────────────────────────────────────────────────────────────────
interface ZaloInstance {
  zalo: any;
  api: any;
  status: 'connected' | 'disconnected' | 'qr_pending' | 'connecting';
  displayName?: string;
  zaloUid?: string;
  csId: number;
  lastActivity: Date;
  epoch: number;
}

export type PoolEvent =
  | { type: 'qr:generated'; accountId: number; data: { qr: string } }
  | { type: 'qr:scanned'; accountId: number }
  | { type: 'qr:expired'; accountId: number }
  | { type: 'qr:session-dead'; accountId: number }
  | { type: 'session:connected'; accountId: number }
  | { type: 'session:disconnected'; accountId: number }
  | { type: 'session:expired'; accountId: number }
  | { type: 'error'; accountId: number; error: string };

// ── Helpers ──────────────────────────────────────────────────────────────────
function mapToLogStatus(status: string): 'connected' | 'disconnected' | 'qr_pending' | null {
  if (status === 'connected') return 'connected';
  if (status === 'disconnected') return 'disconnected';
  if (status === 'qr_pending') return 'qr_pending';
  return null;
}

// ── Main class ───────────────────────────────────────────────────────────────
class ZaloAccountPool extends EventEmitter {
  private instances = new Map<number, ZaloInstance>();
  private disconnectHistory = new Map<string, number[]>();
  private reconnecting = new Set<number>();
  private epochCounter = 0;

  // ── Epoch guard (anti-flap) ──────────────────────────────────────────────
  private nextEpoch(): number {
    return ++this.epochCounter;
  }

  private isCurrentEpoch(accountId: number, epoch: number): boolean {
    return this.instances.get(accountId)?.epoch === epoch;
  }

  // ── Teardown existing instance ───────────────────────────────────────────
  // Dọn listener/WS cũ trước khi tạo instance mới (Fix flap ZaloCRM 2026-06-06)
  private teardownExisting(accountId: number): void {
    const prev = this.instances.get(accountId);
    if (prev?.api?.listener) {
      try { prev.api.listener.stop(); } catch { /* ignore */ }
    }
  }

  // ── QR Login ─────────────────────────────────────────────────────────────
  async loginQR(accountId: number, csId: number): Promise<{ qrImage: string }> {
    if (!ZaloClass) throw new Error('zca-js not available');

    log.info('loginQR start', { accountId });

    // F5: Reset circuit breaker — user is manually re-login, old breaker shouldn't block.
    this.disconnectHistory.delete(`dc_${accountId}`);

    // Clean up any stale instance
    this.teardownExisting(accountId);
    this.reconnecting.delete(accountId);

    const accountRecord = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { proxy_url: true },
    }).catch(() => null);
    const proxyUrl = accountRecord?.proxy_url ?? null;

    const epoch = this.nextEpoch();
    const zalo = new ZaloClass({
      logging: false,
      selfListen: true,
      polyfill: createProxyFetch(proxyUrl),
      // F8: image metadata getter for send-image dimensions
      imageMetadataGetter: async (filePath: string) => {
        try {
          const { readFile } = await import('fs/promises');
          const { imageSize } = await import('image-size');
          const data = await readFile(filePath);
          const info = imageSize(data);
          if (!info.width || !info.height) throw new Error(`Cannot read image size: ${filePath}`);
          return { width: info.width, height: info.height, size: data.length };
        } catch {
          return { width: 0, height: 0, size: 0 };
        }
      },
    });
    this.instances.set(accountId, {
      zalo, api: null, status: 'qr_pending', csId, lastActivity: new Date(), epoch,
    });

    const MAX_QR_RETRY = 3;
    let qrExpiredCount = 0;

    return new Promise((resolve, reject) => {
      const isCurrentEpoch = () => this.instances.get(accountId)?.epoch === epoch;

      withProxy(proxyUrl, () => zalo.loginQR({}, (event: any) => {
        if (!isCurrentEpoch()) return;

        switch (event.type) {
          case 0: // QRCodeGenerated
            log.info('QR code generated', { accountId });
            const qrDataUrl = normalizeQrImage(event.data.image);
            this.emitEvent({ type: 'qr:generated', accountId, data: { qr: qrDataUrl } });
            emitToAccount(accountId, 'zalo:qr', { accountId, qrDataUrl });
            break;
          case 1: // QRCodeExpired
            qrExpiredCount++;
            if (qrExpiredCount >= MAX_QR_RETRY) {
              log.info('QR expired max retries', { accountId });
              this.emitEvent({ type: 'qr:session-dead', accountId });
              this.teardownExisting(accountId);
              reject(new Error('QR expired after max retries'));
              return;
            }
            this.emitEvent({ type: 'qr:expired', accountId });
            event.actions?.retry();
            break;
          case 2: // QRCodeScanned
            log.info('QR scanned', { accountId });
            this.emitEvent({ type: 'qr:scanned', accountId });
            break;
          case 4: // GotLoginInfo
            this.saveSession(accountId, event.data);
            break;
        }
      })).then((api: any) => {
        if (!isCurrentEpoch()) {
          log.warn('loginQR resolved but epoch changed', { accountId });
          try { api?.listener?.stop?.(); } catch { /* ignore */ }
          return;
        }

        const instance = this.instances.get(accountId)!;
        instance.api = api;
        instance.status = 'connected';
        instance.lastActivity = new Date();

        // F6: Write status log transition for uptime tracking
        writeTransition({ accountId, status: 'connected', reason: 'login' }).catch(() => {});

        Promise.resolve(api.getOwnId()).then(async (ownId: string) => {
          instance.zaloUid = ownId;
          await this.updateAccountDB(accountId, 'connected', ownId);
          await this.fetchAndSaveAvatar(accountId, api, ownId);
          this.autoSyncOnConnect(accountId);
          this.emitEvent({ type: 'session:connected', accountId });
          emitToAccount(accountId, 'zalo:status', { accountId, status: 'ACTIVE' });
          log.info('Login completed', { accountId, zaloUid: ownId });
        }).catch((err: any) => {
          log.error('getOwnId failed after login', { accountId, error: String(err) });
          instance.status = 'disconnected';
          this.emitEvent({ type: 'error', accountId, error: String(err) });
        });
      }).catch((err: any) => {
        const instance = this.instances.get(accountId);
        if (instance) instance.status = 'disconnected';
        this.emitEvent({ type: 'error', accountId, error: String(err) });
        if (isCurrentEpoch()) reject(err);
      });
    });
  }

  // ── Reconnect ────────────────────────────────────────────────────────────
  // Ported from ZaloCRM reconnect() with eligibility guard, epoch, uid verify.
  async reconnect(accountId: number, encryptedSession: string | null): Promise<void> {
    if (!ZaloClass || !encryptedSession) return;

    // FIX #2: Relax eligibility guard — allow recovery when session exists but uid is null
    // (copy từ ZaloCRM L338-349)
    const eligibility = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { zalo_uid: true, archived_at: true, disconnect_reason: true, proxy_url: true },
    });
    if (!eligibility || eligibility.archived_at !== null) {
      log.info(`[zalo:${accountId}] reconnect() skip — ghost/archived`);
      return;
    }
    if (eligibility.disconnect_reason === 'manual') {
      log.info('reconnect skip — manual disconnect', { accountId });
      return;
    }

    // In-flight guard
    if (this.reconnecting.has(accountId)) {
      log.info('reconnect skip — already in-flight', { accountId });
      return;
    }
    this.reconnecting.add(accountId);

    const proxyUrl = eligibility.proxy_url ?? null;

    try {
      // Teardown existing + fresh epoch
      this.teardownExisting(accountId);
      const epoch = this.nextEpoch();
      const zalo = new ZaloClass({
        logging: false,
        selfListen: true,
        polyfill: createProxyFetch(proxyUrl),
        imageMetadataGetter: async (filePath: string) => {
          try {
            const { readFile } = await import('fs/promises');
            const { imageSize } = await import('image-size');
            const data = await readFile(filePath);
            const info = imageSize(data);
            if (!info.width || !info.height) throw new Error(`Cannot read image size: ${filePath}`);
            return { width: info.width, height: info.height, size: data.length };
          } catch {
            return { width: 0, height: 0, size: 0 };
          }
        },
      });
      this.instances.set(accountId, {
        zalo, api: null, status: 'connecting', csId: 0, lastActivity: new Date(), epoch,
      });

      // Decrypt stored session
      const session = decryptJson<ZaloSessionData>(encryptedSession);

      const api: any = await withProxy(proxyUrl, () => zalo.login({
        cookie: session.cookies,
        imei: session.imei,
        userAgent: session.userAgent,
      }));

      const instance = this.instances.get(accountId)!;
      if (instance.epoch !== epoch) {
        log.warn('reconnect superseded during login', { accountId });
        try { api?.listener?.stop?.(); } catch { /* ignore */ }
        return;
      }

      instance.api = api;
      instance.status = 'connected';
      instance.lastActivity = new Date();

      const ownId: string = await api.getOwnId();

      // UID verification (ZaloCRM FIX #4b)
      if (eligibility.zalo_uid && ownId && ownId !== eligibility.zalo_uid) {
        log.error('reconnect uid mismatch', {
          accountId, expected: eligibility.zalo_uid, got: ownId,
        });
        this.teardownExisting(accountId);
        instance.status = 'disconnected';
        this.updateAccountDB(accountId, 'qr_pending', null);
        return;
      }

      instance.zaloUid = ownId;
      this.attachListeners(accountId, api, epoch);
      await this.updateAccountDB(accountId, 'connected', ownId);
      await this.fetchAndSaveAvatar(accountId, api, ownId);
      this.autoSyncOnConnect(accountId);
      this.emitEvent({ type: 'session:connected', accountId });
      emitToAccount(accountId, 'zalo:status', { accountId, status: 'ACTIVE' });
      log.info('Reconnected', { accountId, zaloUid: ownId });
    } catch (err) {
      const instance = this.instances.get(accountId);
      if (instance) instance.status = 'disconnected';
      this.updateAccountDB(accountId, 'qr_pending', null);
      this.emitEvent({ type: 'error', accountId, error: String(err) });
    } finally {
      this.reconnecting.delete(accountId);
    }
  }

  // ── Auto-reconnect (with epoch guard) ────────────────────────────────────
  private async autoReconnect(accountId: number, expectedEpoch?: number): Promise<void> {
    const inst = this.instances.get(accountId);
    if (inst?.status === 'connected') return;
    if (expectedEpoch !== undefined && inst && inst.epoch !== expectedEpoch) {
      log.info('autoReconnect skip — superseded', { accountId });
      return;
    }
    if (inst?.status === 'qr_pending') return;
    if (inst?.status === 'connecting') return;

    try {
      const account = await prisma.zaloAccount.findUnique({
        where: { id: accountId },
        select: { encrypted_session_data: true, proxy_url: true, disconnect_reason: true },
      });
      if (account?.disconnect_reason === 'manual') return;
      if (account?.encrypted_session_data) {
        log.info('Auto-reconnecting', { accountId });
        await this.reconnect(accountId, account.encrypted_session_data);
      }
    } catch (err) {
      log.error('Auto-reconnect failed', { accountId, error: String(err) });
      setTimeout(() => this.autoReconnect(accountId), 120_000);
    }
  }

  // ── Public: tryReconnect (auto-recovery) ─────────────────────────────────
  /**
   * tryReconnect — ensure a live SDK client for accountId before operations
   * that REQUIRE the client (groups sync, chat send, ...).
   * Returns true if a live client is available after the attempt.
   * Mirrors autoReconnect(): skips manual-disconnect / archived / missing session.
   */
  async tryReconnect(accountId: number | null | undefined): Promise<boolean> {
    if (!accountId) return false;
    if (this.getApi(accountId)) return true;

    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { encrypted_session_data: true, disconnect_reason: true, archived_at: true },
    });
    if (!account?.encrypted_session_data) return false;
    if (account.disconnect_reason === 'manual' || account.archived_at !== null) return false;

    log.info('tryReconnect — client missing, attempting recovery', { accountId });
    try {
      await this.reconnect(accountId, account.encrypted_session_data);
    } catch (err) {
      log.error('tryReconnect failed', { accountId, error: String(err) });
    }
    return !!this.getApi(accountId);
  }

  // ── Listeners ────────────────────────────────────────────────────────────
  private attachListeners(accountId: number, api: any, epoch: number): void {
    const listener = api.listener ?? api;
    if (!listener?.on) return;

    // Disconnect handler with epoch guard + circuit breaker
    const handleDisconnect = () => {
      const cur = this.instances.get(accountId);
      if (cur && cur.epoch !== epoch) {
        log.info('Ignoring stale closed from superseded listener', { accountId });
        return;
      }
      if (cur) cur.status = 'disconnected';
      this.updateAccountDB(accountId, 'disconnected', null);
      this.emitEvent({ type: 'session:disconnected', accountId });
      emitToAccount(accountId, 'zalo:status', { accountId, status: 'EXPIRED', reason: 'disconnect' });
      // F6: Write status log transition
      writeTransition({ accountId, status: 'disconnected', reason: 'disconnect' }).catch(() => {});

      // Circuit breaker (ZaloCRM pattern)
      const now = Date.now();
      const key = `dc_${accountId}`;
      const history = (this.disconnectHistory.get(key) || []).filter((t) => now - t < 5 * 60_000);
      history.push(now);
      this.disconnectHistory.set(key, history);

      if (history.length >= 5) {
        log.error('Circuit breaker tripped', { accountId, count: history.length });
        this.updateAccountDB(accountId, 'qr_pending', null);
        this.disconnectHistory.delete(key);
        this.emitEvent({ type: 'error', accountId, error: 'Session unstable — QR re-login required' });
        emitToAccount(accountId, 'zalo:status', { accountId, status: 'ERROR', reason: 'circuit_breaker' });
        // F6: Write status log for auth_fail
        writeTransition({ accountId, status: 'qr_pending', reason: 'session_expired' }).catch(() => {});
        return;
      }

      // Normal auto-reconnect after 30s
      setTimeout(() => this.autoReconnect(accountId, epoch), 30_000);
    };

    try { listener.on('closed', handleDisconnect); } catch { /* skip */ }

    // Message events (for downstream consumers)
    const handleMessage = (payload: any) => {
      const cur = this.instances.get(accountId);
      if (cur && cur.epoch !== epoch) return;
      this.emit('message', { accountId, payload });
    };
    for (const evt of ['message', 'onMessage', 'newMessage']) {
      try { listener.on(evt, handleMessage); } catch { /* skip */ }
    }
  }

  // ── DB updates ───────────────────────────────────────────────────────────
  private async updateAccountDB(
    accountId: number,
    poolStatus: string,
    zaloUid: string | null,
  ): Promise<void> {
    try {
      // Release zaloUid from archived ghosts (ZaloCRM FIX 0)
      if (zaloUid !== null) {
        await prisma.zaloAccount.updateMany({
          where: {
            zalo_uid: zaloUid,
            id: { not: accountId },
            archived_at: { not: null },
          },
          data: { zalo_uid: null },
        });
      }

      // FIX #9: Map pool-internal status → Prisma ZaloAccountStatus enum
      const statusMap: Record<string, string> = {
        connected: 'ACTIVE',
        disconnected: 'NOT_LOGGED_IN',
        qr_pending: 'QR_PENDING',
        connecting: 'CONNECTING',
      };
      const prismaStatus = statusMap[poolStatus] ?? poolStatus;

      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          status: prismaStatus as any,
          ...(zaloUid !== null ? { zalo_uid: zaloUid } : {}),
          ...(poolStatus === 'connected' ? {
            last_connected_at: new Date(),
            disconnect_reason: null,
            disconnected_at: null,
            archived_at: null,
          } : {}),
          ...(poolStatus === 'disconnected' ? {
            disconnected_at: new Date(),
          } : {}),
          ...(poolStatus === 'qr_pending' ? {
            encrypted_session_data: null,
          } : {}),
        },
      });
    } catch (err) {
      if ((err as any)?.code === 'P2002') {
        const target = (err as any)?.meta?.target ?? [];
        if (Array.isArray(target) && target.some((t: string) => t.includes('zalo_uid'))) {
          log.warn('Duplicate zalo_uid', { accountId, zaloUid });
        }
      } else {
        log.error('updateAccountDB error', { accountId, error: String(err) });
      }
    }
  }

  // ── Avatar fetch (best-effort, emits completion after persistence) ─────────
  private async fetchAndSaveAvatar(accountId: number, api: any, ownId: string): Promise<string | null> {
    try {
      let profile: ReturnType<typeof extractZaloProfile> = null;
      if (typeof api.getOwnInfo === 'function') {
        profile = extractZaloProfile(await api.getOwnInfo(), ownId);
      }
      if (!profile?.avatarUrl && typeof api.getUserInfo === 'function') {
        profile = extractZaloProfile(await api.getUserInfo(ownId), ownId) ?? profile;
      }
      if (!profile?.avatarUrl && typeof api.fetchAccountInfo === 'function') {
        profile = extractZaloProfile(await api.fetchAccountInfo(), ownId) ?? profile;
      }
      if (!profile?.avatarUrl && typeof api?.profile?.getProfile === 'function') {
        profile = extractZaloProfile(await api.profile.getProfile(), ownId) ?? profile;
      }

      if (!profile?.avatarUrl && !profile?.displayName) {
        log.warn('No avatar/profile found from any method', { accountId, ownId });
        return null;
      }

      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          ...(profile.avatarUrl ? { avatar_url: profile.avatarUrl } : {}),
          ...(profile.displayName ? { display_name: profile.displayName } : {}),
        },
      });
      emitToAccount(accountId, 'zalo:avatar-updated', {
        accountId,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
      });
      log.info('Avatar/profile saved', { accountId, avatarUrl: profile.avatarUrl });
      return profile.avatarUrl;
    } catch (err: any) {
      log.warn('Avatar fetch/save failed (non-critical)', { accountId, error: String(err) });
      return null;
    }
  }

  // ── Refresh avatar (manual, callable from service) ───────────────────────
  async refreshAvatar(accountId: number): Promise<string | null> {
    const inst = this.instances.get(accountId);
    if (!inst?.api || inst.status !== 'connected') {
      log.warn('Cannot refresh avatar — not connected', { accountId });
      return null;
    }
    const ownId = inst.zaloUid ?? await inst.api.getOwnId();
    return this.fetchAndSaveAvatar(accountId, inst.api, ownId);
  }

  // ── Refresh group avatars (bulk) ─────────────────────────────────────────
  async refreshGroupAvatars(accountId: number): Promise<number> {
    const api = this.getApi(accountId);
    if (!api) return 0;
    const groups = await prisma.conversation.findMany({
      where: { zalo_account_id: accountId, thread_type: 'group', group_avatar_url: null },
      select: { id: true, external_thread_id: true },
      take: 50,
    });
    let updated = 0;
    for (const conv of groups) {
      try {
        const infoRes: any = await api.getGroupInfo?.(conv.external_thread_id);
        const info = infoRes?.gridInfoMap?.[conv.external_thread_id]
          ?? Object.values(infoRes?.gridInfoMap ?? {})[0];
        if (info) {
          const newAvatar = info.fullAvt || info.avt || null;
          if (newAvatar) {
            await prisma.conversation.update({
              where: { id: conv.id },
              data: { group_avatar_url: newAvatar } as any,
            });
            updated++;
          }
        }
      } catch { /* non-critical */ }
    }
    log.info('Group avatars refreshed', { accountId, updated, total: groups.length });
    return updated;
  }

  // ── Session persistence ──────────────────────────────────────────────────
  private saveSession(accountId: number, loginData: any): void {
    try {
      const sessionData: ZaloSessionData = {
        cookies: loginData.cookie,
        imei: loginData.imei,
        userAgent: loginData.userAgent,
      };
      const encrypted = encryptJson(sessionData);
      prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          encrypted_session_data: encrypted,
          // FIX #3: KHÔNG set status/last_connected_at — updateAccountDB() xử lý sau getOwnId()
          last_login_at: new Date(),
        },
      }).catch((err) => log.error('saveSession error', { accountId, error: String(err) }));
    } catch (err) {
      log.error('saveSession encryption failed', { accountId, error: String(err) });
    }
  }

  // ── Public API (preserved for zalo.service.ts, zalo-health-check.ts) ────
  disconnect(accountId: number): void {
    const instance = this.instances.get(accountId);
    if (instance?.api?.listener) {
      try { instance.api.listener.stop(); } catch { /* ignore */ }
    }
    this.instances.delete(accountId);
    emitToAccount(accountId, 'zalo:status', { accountId, status: 'NOT_LOGGED_IN', reason: 'manual' });
    log.info('Disconnected', { accountId });
  }

  getStatus(accountId: number | null | undefined): string {
    if (!accountId) return 'disconnected';
    return this.instances.get(accountId)?.status ?? 'disconnected';
  }

  getApi(accountId: number | null | undefined): any | null {
    if (!accountId) return null;
    const inst = this.instances.get(accountId);
    return inst?.status === 'connected' ? inst.api : null;
  }

  getInstance(accountId: number | null | undefined): ZaloInstance | undefined {
    if (!accountId) return undefined;
    return this.instances.get(accountId);
  }

  getAllStatuses(): Record<number, string> {
    const statuses: Record<number, string> = {};
    for (const [id, inst] of this.instances) statuses[id] = inst.status;
    return statuses;
  }

  // ── Cleanup stale ghosts (hourly cron) ───────────────────────────────────
  // Ported from ZaloCRM cleanupStaleGhosts — hides ghost qr_pending > staleMinutes
  async cleanupStaleGhosts(staleMinutes = 24 * 60): Promise<number> {
    const cutoff = new Date(Date.now() - staleMinutes * 60_000);
    try {
      const ghosts = await prisma.zaloAccount.findMany({
        where: {
          zalo_uid: null,
          archived_at: null,
          last_connected_at: null,
          status: { in: ['QR_PENDING', 'NOT_LOGGED_IN'] as any },
          created_at: { lt: cutoff },
        },
        select: { id: true },
      });
      if (ghosts.length === 0) return 0;
      const ids = ghosts.map((g) => g.id);
      for (const id of ids) {
        try { this.disconnect(id); } catch { /* best-effort */ }
      }
      await prisma.zaloAccount.updateMany({
        where: { id: { in: ids } },
        data: { archived_at: new Date(), status: 'NOT_LOGGED_IN', encrypted_session_data: null },
      });
      log.info('Cleaned up stale ghosts', { count: ids.length, staleMinutes });
      return ids.length;
    } catch (err) {
      log.error('cleanupStaleGhosts error', { error: String(err) });
      return 0;
    }
  }

  // ── Reconnect all accounts (boot) ────────────────────────────────────────
  async reconnectAll(): Promise<void> {
    // FIX #1 + #7: Widen filter — include accounts with session but no uid yet (ghost recovery)
    // FIX #7: MySQL NULL handling — use OR to explicitly include NULL disconnect_reason
    // (NOT disconnect_reason='manual') excludes NULLs in MySQL, so we need OR clause
    const accounts = await prisma.zaloAccount.findMany({
      where: {
        encrypted_session_data: { not: null },
        archived_at: null,
        status: { not: 'NOT_LOGGED_IN' as any },
        OR: [
          { disconnect_reason: null },
          { disconnect_reason: { not: 'manual' } },
        ],
      },
      select: { id: true, encrypted_session_data: true, cs_id: true, display_name: true },
    });

    log.info('Reconnecting accounts on boot', { count: accounts.length });
    for (const acc of accounts) {
      try {
        await this.reconnect(acc.id, acc.encrypted_session_data);
      } catch (err) {
        log.error('Boot reconnect failed', { accountId: acc.id, error: String(err) });
      }
    }
  }

  // ── Event emitter ────────────────────────────────────────────────────────
  private emitEvent(event: PoolEvent): void {
    this.emit(event.type, event);
    this.emit('pool:event', event);
  }

  // ── Adapter methods (backward compat for service/server/listener-factory) ──
  /** Alias for reconnectAll() — called by server.ts on boot */
  async init(): Promise<void> {
    await this.reconnectAll();
  }

  /** Return IDs of all connected accounts — used by server.ts logging */
  getActiveAccountIds(): number[] {
    const ids: number[] = [];
    for (const [id, inst] of this.instances) {
      if (inst.status === 'connected') ids.push(id);
    }
    return ids;
  }

  /** Alias for getApi() — used by zalo-listener-factory.ts and service */
  getAccountClient(accountId: number): any | null {
    return this.getApi(accountId);
  }

  /** Return pool status array for zalo.service.getPoolStatus() */
  getPoolStatus(): Array<{ accountId: number; status: string; csId: number }> {
    const result: Array<{ accountId: number; status: string; csId: number }> = [];
    for (const [id, inst] of this.instances) {
      result.push({ accountId: id, status: inst.status, csId: inst.csId });
    }
    return result;
  }

  /** Alias for loginQR() — used by zalo.service.generateQr() */
  async generateQr(accountId: number, csId: number): Promise<{ qrDataUrl: string }> {
    const result = await this.loginQR(accountId, csId);
    return { qrDataUrl: normalizeQrImage(result.qrImage) };
  }

  /** FIX #4: Complete QR login — store encrypted session, don't assign raw data as api */
  async completeQrLogin(accountId: number, sessionData: any): Promise<void> {
    try {
      const encrypted = encryptJson(sessionData);
      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: { encrypted_session_data: encrypted },
      });
      log.info('completeQrLogin — session stored', { accountId });
    } catch (err) {
      log.error('completeQrLogin error', { accountId, error: String(err) });
    }
  }

  // ── FIX #5: Auto-sync friends/groups after connect (copy từ ZaloCRM L454-475) ──
  private autoSyncOnConnect(accountId: number): void {
    void (async () => {
      try {
        const { syncFriendsForAccount } = await import('./friend-sync-service');
        const res = await syncFriendsForAccount(accountId, { trigger: 'connect' });
        log.info('Auto-sync on connect', {
          accountId,
          friends: res.upsertedFriends ?? res.liveCount ?? 0,
          changed: res.emittedCount ?? 0,
          errors: res.errors,
        });
      } catch (err) {
        log.error('Auto-sync on connect failed', { accountId, error: String(err) });
      }

      try {
        const { syncAndMatchCareGroups } = await import('./student-care-group-matcher.service');
        const report = await syncAndMatchCareGroups({
          triggeredBy: 'login',
          zaloAccountId: accountId,
          refreshLiveGroups: true,
        });
        log.info('Auto-sync care groups on connect', {
          accountId,
          totalZaloGroupsScanned: report.totalZaloGroupsScanned,
          linkedStudentsCount: report.linkedStudentsCount,
          newlyLinkedZaloCount: report.newlyLinkedZaloCount,
        });
      } catch (err) {
        log.error('Auto-sync care groups on connect failed', { accountId, error: String(err) });
      }
    })();
  }

  // ── Shutdown ─────────────────────────────────────────────────────────────
  async shutdown(): Promise<void> {
    for (const [id] of this.instances) {
      this.disconnect(id);
    }
    this.instances.clear();
    log.info('Pool shut down');
  }
}

/** Singleton instance */
export const zaloPool = new ZaloAccountPool();
