/**
 * friend-event-handler.ts — persists zca-js `friend_event` to the Friend table.
 *
 * Ported from ZaloCRM friend-event-handler.ts (701 lines) → single-org, Int IDs.
 *
 * Maps zca-js FriendEventType into our state machine:
 *   ADD             → friendship_status='accepted', relationshipKind='friend'
 *   REMOVE          → friendship_status='removed',  relationshipKind='ghost'
 *   REQUEST         → friendship_status='pending_received' (someone sent ME a request)
 *   REJECT_REQUEST  → friendship_status='rejected', relationshipKind='ghost'
 *   UNDO_REQUEST    → friendship_status='none' (request retracted, row stays)
 *   BLOCK / BLOCK_CALL   → friendship_status='blocked'
 *   UNBLOCK / UNBLOCK_CALL → revert to 'none'
 *   SEEN_FRIEND_REQUEST, PIN_*, UNKNOWN — ignored
 *
 * Adaptations from ZaloCRM:
 *   - No orgId/tenantTransaction → prisma.$transaction + Int IDs
 *   - No Contact / ContactAccess / FriendshipAttempt / FriendRequestOutbox — stubbed (log only)
 *   - No AutomationTrigger / automationEventBus / ee-registry — stubbed
 *   - No internal-contact handshake — stubbed
 *   - Friend model uses snake_case fields: zalo_account_id, zalo_uid_in_nick, friendship_status, relationship_kind
 *   - randomUUID() removed — Friend.id is autoincrement Int
 *   - reconcileConversationContact adapted: our Conversation has no contactId → simplified to no-op with log
 */

import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { emitToAccount } from '../../shared/realtime/socket-singleton';
import { upsertContactAccess } from './contact-resolver';

const log = createLogger('FriendEventHandler');

// zca-js FriendEventType numeric values (mirrored from models/FriendEvent.d.ts)
export const FriendEventType = {
  ADD: 0,
  REMOVE: 1,
  REQUEST: 2,
  UNDO_REQUEST: 3,
  REJECT_REQUEST: 4,
  SEEN_FRIEND_REQUEST: 5,
  BLOCK: 6,
  UNBLOCK: 7,
  BLOCK_CALL: 8,
  UNBLOCK_CALL: 9,
  PIN_UNPIN: 10,
  PIN_CREATE: 11,
  UNKNOWN: 12,
} as const;

export type FriendEventTypeValue = (typeof FriendEventType)[keyof typeof FriendEventType];

type RelationshipKind = 'friend' | 'pending_friend' | 'chatting_stranger' | 'ghost' | 'none';

/**
 * Counter delta for a Contact when a Friend row's relationshipKind transitions.
 * Kept for reference / future use. In single-org without Contact counters, this is
 * not persisted but exported for tests and potential Student-level stats.
 */
export function counterDelta(
  from: RelationshipKind,
  to: RelationshipKind,
): { accepted: number; pending: number; chatting: number } {
  const sub = (k: RelationshipKind) => ({
    accepted: k === 'friend' ? 1 : 0,
    pending: k === 'pending_friend' ? 1 : 0,
    chatting: k === 'chatting_stranger' ? 1 : 0,
  });
  const a = sub(to);
  const b = sub(from);
  return {
    accepted: a.accepted - b.accepted,
    pending: a.pending - b.pending,
    chatting: a.chatting - b.chatting,
  };
}

/** Derive relationshipKind from friendshipStatus + hasConversation. */
export function deriveRelationshipKind(
  friendshipStatus: string,
  hasConversation: boolean,
): RelationshipKind {
  if (friendshipStatus === 'accepted') return 'friend';
  if (friendshipStatus === 'pending_sent' || friendshipStatus === 'pending_received')
    return 'pending_friend';
  if (friendshipStatus === 'rejected' || friendshipStatus === 'removed' || friendshipStatus === 'blocked')
    return 'ghost';
  if (hasConversation) return 'chatting_stranger';
  return 'none';
}

/**
 * Best-effort reconcile placeholder.
 * In ZaloCRM this re-pointed Conversation(contactId) when a Friend was linked.
 * Our Conversation has no contactId field (only zalo_account_id + externalThreadId),
 * so there is nothing to re-point. Kept as no-op for interface compatibility.
 */
export async function reconcileConversationContact(_args: {
  zaloAccountId: number;
  contactId?: number | string;
  zaloUidInNick: string;
}): Promise<number> {
  // Best-effort reconcile: our Conversation has no contactId (only zalo_account_id + externalThreadId),
  // so there is nothing to re-point. Kept as no-op for interface compatibility.
  return 0;
}

export async function applyFriendTransition(args: {
  zaloAccountId: number;
  zaloUidInNick: string;
  newFriendshipStatus: string;
  attemptStateOnAccept?: string;
  /** 'event' = real Zalo event (reliable becameFriendAt); 'sync' = bulk getAllFriends (don't set becameFriendAt) */
  source?: 'event' | 'sync';
  aliasInNick?: string | null;
  /** Per-identity profile from Zalo SDK (set on real events + bulk sync) */
  zaloDisplayName?: string | null;
  zaloAvatarUrl?: string | null;
  zaloGlobalId?: string | null;
  zaloUsername?: string | null;
}): Promise<void> {
  const { zaloAccountId, zaloUidInNick, newFriendshipStatus } = args;
  const source = args.source ?? 'event';

  if (!zaloUidInNick) return;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.friend.findUnique({
      where: {
        zalo_account_id_zalo_uid_in_nick: { zalo_account_id: zaloAccountId, zalo_uid_in_nick: zaloUidInNick },
      },
      select: {
        relationship_kind: true,
        has_conversation: true,
        became_friend_at: true,
      },
    });

    const fromKind = (existing?.relationship_kind as RelationshipKind) ?? 'none';
    const hasConversation = existing?.has_conversation ?? false;
    const toKind = deriveRelationshipKind(newFriendshipStatus, hasConversation);

    const now = new Date();
    const data: Record<string, unknown> = {
      friendship_status: newFriendshipStatus,
      relationship_kind: toKind,
    };
    if (args.aliasInNick !== undefined) {
      data.alias_in_nick = args.aliasInNick;
    }
    // Per-identity Zalo profile fields — set when provided (events + bulk sync)
    if (args.zaloDisplayName !== undefined) {
      data.zalo_display_name = args.zaloDisplayName;
    }
    if (args.zaloAvatarUrl !== undefined) {
      data.zalo_avatar_url = args.zaloAvatarUrl;
    }
    if (args.zaloGlobalId !== undefined) {
      data.zalo_global_id = args.zaloGlobalId;
    }
    if (args.zaloUsername !== undefined) {
      data.zalo_username = args.zaloUsername;
    }

    // Only set becameFriendAt on REAL event source, and only if not already set.
    // Bulk sync (getAllFriends) does not return the real friendship date — using sync time would
    // make every old friend appear as "Became friend today".
    if (source === 'event' && newFriendshipStatus === 'accepted' && !existing?.became_friend_at) {
      data.became_friend_at = now;
    }
    // removedAt: set only on transition into ghost when not already ghost
    if (
      (newFriendshipStatus === 'removed' || newFriendshipStatus === 'blocked') &&
      existing?.relationship_kind !== 'ghost'
    ) {
      data.removed_at = now;
    } else if (newFriendshipStatus === 'accepted') {
      // Re-friend: clear removedAt
      data.removed_at = null;
    }

    await tx.friend.upsert({
      where: {
        zalo_account_id_zalo_uid_in_nick: { zalo_account_id: zaloAccountId, zalo_uid_in_nick: zaloUidInNick },
      },
      create: {
        zalo_account_id: zaloAccountId,
        zalo_uid_in_nick: zaloUidInNick,
        friendship_status: newFriendshipStatus,
        relationship_kind: toKind,
        alias_in_nick: (args.aliasInNick as string) ?? null,
        has_conversation: hasConversation,
        became_friend_at: (data.became_friend_at as Date) ?? null,
        removed_at: (data.removed_at as Date) ?? null,
        zalo_display_name: (args.zaloDisplayName as string) ?? null,
        zalo_avatar_url: (args.zaloAvatarUrl as string) ?? null,
        zalo_global_id: (args.zaloGlobalId as string) ?? null,
        zalo_username: (args.zaloUsername as string) ?? null,
      },
      update: data as never,
    });

    // Counter delta — logged for observability; no Contact table in single-org
    const delta = counterDelta(fromKind, toKind);
    if (source !== 'sync' && (delta.accepted !== 0 || delta.pending !== 0 || delta.chatting !== 0)) {
      log.debug('Friend counter delta (no-op without Contact table)', {
        zaloAccountId,
        zaloUidInNick,
        fromKind,
        toKind,
        delta,
      });
    }
  });

  // Contact unification: upsert ContactAccess (best-effort, non-blocking)
  upsertContactAccess(zaloAccountId, zaloUidInNick, {
    isFriend: newFriendshipStatus === 'accepted',
    friendshipStatus: newFriendshipStatus,
    aliasInNick: args.aliasInNick ?? null,
  }).catch(() => {});

  // Best-effort reconcile (no-op in current schema)
  await reconcileConversationContact({ zaloAccountId, zaloUidInNick });

  // Only log per-friend transitions for real-time events, not bulk sync
  if (source !== 'sync') {
    log.info('Friend transition applied', {
      zaloAccountId,
      zaloUidInNick,
      newFriendshipStatus,
      source,
    });
  }
}

/**
 * Mark Friend(pending_sent) right after a successful sendFriendRequest call.
 * Idempotent. Called from campaign / manual friend request flows.
 */
export async function markFriendRequestSent(
  accountId: number,
  uid: string,
): Promise<void> {
  if (!accountId || !uid) return;
  const exists = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { id: true },
  });
  if (!exists) {
    log.warn('markFriendRequestSent: account not found', { accountId });
    return;
  }
  await applyFriendTransition({
    zaloAccountId: accountId,
    zaloUidInNick: uid,
    newFriendshipStatus: 'pending_sent',
  });
}

/**
 * Top-level entry called from zalo-listener-factory on every `friend_event`.
 * Decides what to persist based on event type + isSelf.
 *
 * ZaloCRM accepted `accountId: string` with orgId lookup; here accountId is Int and
 * ZaloAccount lookup is not needed for org (single-org), only existence check.
 */
export async function handleFriendEvent(
  accountId: number,
  event: { type: number; data: unknown; threadId: string; isSelf: boolean },
): Promise<void> {
  // Existence check (skip unknown accounts)
  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { id: true },
  });
  if (!account) {
    log.warn('Friend event: account not found', { accountId });
    return;
  }

  // Determine the friend's uid
  let friendUid: string | null = null;
  if (typeof event.data === 'string') {
    friendUid = (event.data as string) || event.threadId || null;
  } else if (event.data && typeof event.data === 'object') {
    const d = event.data as Record<string, unknown>;
    friendUid = (event.isSelf ? (d.toUid as string) : (d.fromUid as string)) || null;
    if (!friendUid) friendUid = event.threadId || null;
  } else {
    friendUid = event.threadId || null;
  }
  if (!friendUid) {
    log.debug('Friend event: missing uid, skipping', { accountId, type: event.type });
    return;
  }

  let newStatus: string | null = null;
  // attemptUpdate is used in ZaloCRM to update FriendshipAttempt audit rows — not present in our schema, logged only.

  switch (event.type) {
    case FriendEventType.ADD:
      newStatus = 'accepted';
      break;
    case FriendEventType.REMOVE:
      newStatus = 'removed';
      break;
    case FriendEventType.REQUEST:
      // Someone sent ME a request — don't auto-accept. Mark pending_received.
      if (!event.isSelf) newStatus = 'pending_received';
      break;
    case FriendEventType.REJECT_REQUEST:
      newStatus = 'rejected';
      break;
    case FriendEventType.UNDO_REQUEST:
      newStatus = 'none';
      break;
    case FriendEventType.BLOCK:
    case FriendEventType.BLOCK_CALL:
      newStatus = 'blocked';
      break;
    case FriendEventType.UNBLOCK:
    case FriendEventType.UNBLOCK_CALL:
      newStatus = 'none';
      break;
    case FriendEventType.SEEN_FRIEND_REQUEST:
    case FriendEventType.PIN_CREATE:
    case FriendEventType.PIN_UNPIN:
    case FriendEventType.UNKNOWN:
    default:
      return; // ignore
  }

  if (!newStatus) return;

  try {
    // Try to enrich alias from event payload if available
    let alias: string | null | undefined = undefined;
    if (event.data && typeof event.data === 'object') {
      const d = event.data as Record<string, unknown>;
      if (typeof d.displayName === 'string') alias = d.displayName;
      else if (typeof d.dName === 'string') alias = d.dName;
      else if (typeof d.alias === 'string') alias = d.alias;
    }

    // Extract per-identity Zalo profile from event payload
    let zaloDisplayName: string | null | undefined = undefined;
    let zaloAvatarUrl: string | null | undefined = undefined;
    let zaloGlobalId: string | null | undefined = undefined;
    let zaloUsername: string | null | undefined = undefined;
    if (event.data && typeof event.data === 'object') {
      const d = event.data as Record<string, unknown>;
      if (typeof d.displayName === 'string') zaloDisplayName = d.displayName;
      else if (typeof d.dName === 'string') zaloDisplayName = d.dName;
      if (typeof d.avatar === 'string') zaloAvatarUrl = d.avatar;
      else if (typeof d.avatarUrl === 'string') zaloAvatarUrl = d.avatarUrl;
      if (typeof d.globalId === 'string') zaloGlobalId = d.globalId;
      if (typeof d.username === 'string') zaloUsername = d.username;
    }

    await applyFriendTransition({
      zaloAccountId: accountId,
      zaloUidInNick: friendUid,
      newFriendshipStatus: newStatus,
      aliasInNick: alias,
      zaloDisplayName,
      zaloAvatarUrl,
      zaloGlobalId,
      zaloUsername,
    });
    // Real-time: emit friend status change to subscribed clients
    emitToAccount(accountId, 'zalo:friend-update', {
      accountId, type: event.type, uid: friendUid, newStatus, alias: alias ?? null,
    });
    log.info('Friend event processed', { accountId, type: event.type, uid: friendUid, newStatus });
  } catch (err) {
    log.error('Friend event apply error', { accountId, error: String(err) });
  }
}
