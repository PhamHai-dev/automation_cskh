/**
 * Zalo Listener Factory — attaches event listeners to each pool account's zca-js client.
 *
 * Migrated from ZaloCRM listener-factory.ts.
 * Listens for: incoming messages, friend events, group updates.
 * Delegates to downstream services (message-sync, friend-sync, group-sync).
 */

import { zaloPool } from './zalo-pool';
import { createLogger } from '../../shared/logger/logger';
import type { IncomingMessage } from './types/zalo.types';

const log = createLogger('ZaloListener');

export type MessageHandler = (msg: IncomingMessage) => Promise<void>;
export type GroupUpdateHandler = (accountId: number, groupId: string) => Promise<void>;
export type FriendEventHandler = (accountId: number, uid: string) => Promise<void>;

let messageHandler: MessageHandler | null = null;
let groupHandler: GroupUpdateHandler | null = null;
let friendHandler: FriendEventHandler | null = null;

/**
 * Register a handler for incoming messages.
 * Called by message-sync / automation engine.
 */
export function onIncomingMessage(handler: MessageHandler): void {
  messageHandler = handler;
}

export function onGroupUpdate(handler: GroupUpdateHandler): void {
  groupHandler = handler;
}

export function onFriendEvent(handler: FriendEventHandler): void {
  friendHandler = handler;
}

/**
 * Attach listeners for a specific account.
 * Call after pool reports session:connected for that account.
 */
export function attachListenersForAccount(accountId: number): void {
  const client = zaloPool.getAccountClient(accountId) as any;
  if (!client) {
    log.warn('Cannot attach listeners — no client', { accountId });
    return;
  }

  // zca-js emits events via client.listener.on
  const listener = client.listener ?? client;

  // ── Message events ───────────────────────────────────────────────────
  const handleMessage = async (payload: any) => {
    try {
      const msg = normalizeIncomingMessage(accountId, payload);
      if (!msg) return;
      log.debug('Incoming message', { accountId, threadId: msg.threadId, isGroup: msg.isGroup });
      if (messageHandler) await messageHandler(msg);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error('Error handling incoming message', { accountId, error: errMsg });
    }
  };

  // zca-js event names (may vary by version — handle common variants)
  const messageEvents = ['message', 'onMessage', 'newMessage', 'chat:message'];
  for (const evt of messageEvents) {
    try {
      if (listener.on) listener.on(evt, handleMessage);
    } catch {
      // event not supported in this version — skip
    }
  }

  // ── Friend events ────────────────────────────────────────────────────
  const handleFriend = async (payload: any) => {
    const uid: string = payload?.uid ?? payload?.userId ?? payload?.id;
    if (!uid) return;
    log.info('Friend event', { accountId, uid });
    if (friendHandler) await friendHandler(accountId, uid);
  };

  const friendEvents = ['friend:added', 'friend:request', 'friend:update'];
  for (const evt of friendEvents) {
    try {
      if (listener.on) listener.on(evt, handleFriend);
    } catch {
      /* skip */
    }
  }

  // ── Group events ─────────────────────────────────────────────────────
  const handleGroup = async (payload: any) => {
    const groupId: string = payload?.groupId ?? payload?.grid ?? payload?.id;
    if (!groupId) return;
    log.info('Group update event', { accountId, groupId });
    if (groupHandler) await groupHandler(accountId, groupId);
  };

  const groupEvents = ['group:updated', 'group:added', 'group:member_updated'];
  for (const evt of groupEvents) {
    try {
      if (listener.on) listener.on(evt, handleGroup);
    } catch {
      /* skip */
    }
  }

  log.info('Listeners attached', { accountId });
}

/**
 * Detach all listeners for an account (on disconnect / expired).
 */
export function detachListenersForAccount(accountId: number): void {
  const client = zaloPool.getAccountClient(accountId) as any;
  if (!client) return;
  const listener = client.listener ?? client;
  try {
    if (listener.removeAllListeners) listener.removeAllListeners();
  } catch {
    /* ignore */
  }
  log.info('Listeners detached', { accountId });
}

/**
 * Normalize raw zca-js payload to IncomingMessage.
 */
function normalizeIncomingMessage(accountId: number, payload: any): IncomingMessage | null {
  if (!payload) return null;

  const data = payload.data ?? payload;
  const threadId: string = data.threadId ?? data.groupId ?? data.uidFrom ?? data.senderId ?? '';
  if (!threadId) return null;

  const isGroup = Boolean(data.isGroup ?? data.groupId);
  const uidFrom: string = data.uidFrom ?? data.senderId ?? data.fromUid ?? threadId;
  const displayName: string = data.displayName ?? data.dName ?? uidFrom;
  const content: string = extractTextContent(data);
  const timestamp: Date = data.timestamp ? new Date(Number(data.timestamp)) : new Date();

  return { accountId, threadId, uidFrom, displayName, content, timestamp, isGroup };
}

function extractTextContent(data: any): string {
  if (typeof data.content === 'string') return data.content;
  if (typeof data.msg === 'string') return data.msg;
  if (typeof data.message === 'string') return data.message;
  if (data.content?.title) return data.content.title;
  if (data.content?.description) return data.content.description ?? '';
  return '';
}

/**
 * Wire pool events to listener lifecycle.
 * Call once during app boot after zaloPool.init().
 */
export function wirePoolEvents(): void {
  zaloPool.on('session:connected', ({ accountId }: any) => {
    attachListenersForAccount(accountId);
  });
  zaloPool.on('session:expired', ({ accountId }: any) => {
    detachListenersForAccount(accountId);
  });
  log.info('Pool event wiring complete');
}
