/**
 * friend-sync-service.ts — Canonical Friend full-sync (Zalo SDK -> Friend table).
 * Ported from ZaloCRM friend-sync-service.ts (612 lines) -> single-org, Int IDs.
 *
 * Single entry point for every trigger:
 *   - Manual: POST /friends/sync
 *   - On-connect: zalo-pool event
 *   - Cron: friend-sync-cron.ts every 15 min
 *
 * Pulls: getAllFriends() + getSentFriendRequests() -> diff-then-emit per uid.
 * Cooldown 5s/account for trigger='manual'.
 *
 * Adaptations: no orgId/withTenant/logActivity/resolveOrCreateContact/safeContactUpdate,
 * Int IDs, snake_case DB fields, createLogger.
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { applyFriendTransition } from './friend-event-handler';

const log = createLogger('FriendSync');

// Minimal emit surface — thay thế socket.io Server (chưa có dep trong project).
// Khi setup socket.io thật, chỉ cần truyền server vào opts.io.
export interface SyncIo {
  emit(event: string, payload: unknown): void;
}

export type SyncTrigger = 'manual' | 'connect' | 'cron';

export interface SyncFriendsOptions {
  trigger: SyncTrigger;
  io?: SyncIo | null;
}

export interface SyncFriendsResult {
  liveCount: number;
  createdContacts: number;
  upsertedFriends: number;
  emittedCount: number;
  errors: number;
  durationMs: number;
  skipped: 'cooldown' | null;
}

// Cooldown 5s/account for manual trigger
const COOLDOWN_MS = 5_000;
const lastManualSyncAt = new Map<number, number>();

// Diffable identity fields from Zalo SDK response
type DiffSnapshot = {
  alias_in_nick?: string | null;
  has_conversation?: boolean | null;
};

function computeDiff(existing: DiffSnapshot, incoming: DiffSnapshot): DiffSnapshot {
  const patch: DiffSnapshot = {};
  if ((existing.alias_in_nick ?? null) !== (incoming.alias_in_nick ?? null)) patch.alias_in_nick = incoming.alias_in_nick ?? null;
  if ((existing.has_conversation ?? null) !== (incoming.has_conversation ?? null)) patch.has_conversation = incoming.has_conversation ?? null;
  return patch;
}

/** Convert diff snapshot -> Prisma update data (strict types, bỏ null/undefined). */
function buildUpdateData(patch: DiffSnapshot): {
  alias_in_nick?: string | null;
  has_conversation?: boolean;
} {
  const data: { alias_in_nick?: string | null; has_conversation?: boolean } = {};
  if (patch.alias_in_nick !== undefined) data.alias_in_nick = patch.alias_in_nick;
  if (patch.has_conversation !== undefined && patch.has_conversation !== null) data.has_conversation = patch.has_conversation;
  return data;
}

function extractFriendInfo(raw: Record<string, unknown>): {
  uid: string;
  snapshot: { alias_in_nick: string | null; has_conversation: boolean };
  phoneNumber: string | null; // F2: capture public phone from SDK
} | null {
  const uid = String((raw.userId ?? raw.uid ?? '') as string);
  if (!uid) return null;
  return {
    uid,
    snapshot: {
      alias_in_nick: String((raw.zaloName ?? raw.displayName ?? '') as string) || null,
      has_conversation: true,
    },
    phoneNumber: String((raw.phoneNumber ?? '') as string).trim() || null,
  };
}

/**
 * Full sync Friend list for 1 nick from Zalo SDK -> Friend table.
 * Idempotent: re-run safe (dedup via @@unique([zalo_account_id, zalo_uid_in_nick])).
 */
export async function syncFriendsForAccount(
  accountId: number,
  opts: SyncFriendsOptions,
): Promise<SyncFriendsResult> {
  const startedAt = Date.now();
  const result: SyncFriendsResult = {
    liveCount: 0, createdContacts: 0, upsertedFriends: 0,
    emittedCount: 0, errors: 0, durationMs: 0, skipped: null,
  };

  // Cooldown gate for manual trigger only
  if (opts.trigger === 'manual') {
    const lastAt = lastManualSyncAt.get(accountId) || 0;
    if (Date.now() - lastAt < COOLDOWN_MS) {
      result.skipped = 'cooldown';
      result.durationMs = Date.now() - startedAt;
      return result;
    }
    lastManualSyncAt.set(accountId, Date.now());
  }

  const api = zaloPool.getApi(accountId);
  if (!api) {
    result.errors++;
    result.durationMs = Date.now() - startedAt;
    log.warn(`[friend-sync:${accountId}] No API client available`);
    return result;
  }

  let liveFriends: Array<Record<string, unknown>> = [];
  let sentRequests: Array<Record<string, unknown>> = [];

  try {
    const liveRaw: any = await api.getAllFriends();
    const sentRaw: any = await api.getSentFriendRequests();
    liveFriends = Array.isArray(liveRaw) ? liveRaw
      : Array.isArray(liveRaw?.data) ? liveRaw.data
      : Array.isArray(liveRaw?.items) ? liveRaw.items : [];
    sentRequests = Array.isArray(sentRaw) ? sentRaw
      : Array.isArray(sentRaw?.data) ? sentRaw.data
      : Array.isArray(sentRaw?.items) ? sentRaw.items : [];
  } catch (err) {
    result.errors++;
    result.durationMs = Date.now() - startedAt;
    log.warn(`[friend-sync:${accountId}] SDK fetch failed`, { error: String(err) });
    return result;
  }

  result.liveCount = liveFriends.length + sentRequests.length;

  // Pre-load existing Friend rows for diff (avoid N+1)
  const allUids = new Set<string>();
  for (const f of liveFriends) { const i = extractFriendInfo(f); if (i) allUids.add(i.uid); }
  for (const r of sentRequests) { const i = extractFriendInfo(r); if (i) allUids.add(i.uid); }

  const existingFriends = await prisma.friend.findMany({
    where: { zalo_account_id: accountId, zalo_uid_in_nick: { in: [...allUids] } },
    select: {
      id: true, zalo_uid_in_nick: true, alias_in_nick: true, has_conversation: true,
    },
  });
  const existingByUid = new Map(existingFriends.map((f) => [f.zalo_uid_in_nick, f]));

  // Process accepted friends
  for (const live of liveFriends) {
    const info = extractFriendInfo(live);
    if (!info) continue;
    try {
      await processFriend({
        accountId, uid: info.uid, snapshot: info.snapshot,
        phoneNumber: info.phoneNumber,
        targetStatus: 'accepted', existing: existingByUid.get(info.uid),
        io: opts.io ?? null, result,
      });
    } catch (err) {
      result.errors++;
      log.warn(`[friend-sync:${accountId}] process uid=${info.uid} failed`, { error: String(err) });
    }
  }

  // Process sent requests -> pending_sent
  for (const req of sentRequests) {
    const info = extractFriendInfo(req);
    if (!info) continue;
    try {
      await processFriend({
        accountId, uid: info.uid, snapshot: info.snapshot,
        phoneNumber: info.phoneNumber,
        targetStatus: 'pending_sent', existing: existingByUid.get(info.uid),
        io: opts.io ?? null, result,
      });
    } catch (err) {
      result.errors++;
      log.warn(`[friend-sync:${accountId}] process pending uid=${info.uid} failed`, { error: String(err) });
    }
  }

  result.durationMs = Date.now() - startedAt;

  // F1: Persist sync error/success to ZaloAccount for observability
  const updateData: Record<string, unknown> = { last_sync_at: new Date() };
  if (result.errors > 0 || (result.liveCount === 0 && result.durationMs > 1000)) {
    updateData.last_sync_error = `${result.errors} errors, live=${result.liveCount}, dur=${result.durationMs}ms`;
  } else {
    updateData.last_sync_error = null;
  }
  prisma.zaloAccount.update({ where: { id: accountId }, data: updateData as any }).catch(() => {});

  log.info(
    `[friend-sync:${accountId}] trigger=${opts.trigger} live=${result.liveCount} upserted=${result.upsertedFriends} emitted=${result.emittedCount} errors=${result.errors} dur=${result.durationMs}ms`,
  );
  return result;
}

// Per-friend processing
interface ProcessFriendArgs {
  accountId: number;
  uid: string;
  snapshot: { alias_in_nick: string | null; has_conversation: boolean };
  phoneNumber: string | null; // F2: public phone from SDK
  targetStatus: 'accepted' | 'pending_sent';
  existing: { id: number; alias_in_nick: string | null; has_conversation: boolean } | undefined;
  io: SyncIo | null;
  result: SyncFriendsResult;
}

async function processFriend(args: ProcessFriendArgs): Promise<void> {
  // 1. Apply friendship state machine
  await applyFriendTransition({
    zaloAccountId: args.accountId,
    zaloUidInNick: args.uid,
    newFriendshipStatus: args.targetStatus === 'accepted' ? 'accepted' : 'pending_sent',
    source: 'sync',
    aliasInNick: args.snapshot.alias_in_nick,
  });
  args.result.upsertedFriends++;

  // F2: If SDK returned a public phone number, save it (best-effort)
  if (args.phoneNumber) {
    prisma.friend.update({
      where: { zalo_account_id_zalo_uid_in_nick: { zalo_account_id: args.accountId, zalo_uid_in_nick: args.uid } },
      data: { phone_from_sdk: args.phoneNumber },
    }).catch(() => {}); // non-blocking
  }

  // 2. Diff identity fields -> update + emit only if changed
  const existingSnap: DiffSnapshot = args.existing
    ? { alias_in_nick: args.existing.alias_in_nick, has_conversation: args.existing.has_conversation }
    : {};
  const incomingSnap: DiffSnapshot = {
    alias_in_nick: args.snapshot.alias_in_nick,
    has_conversation: args.snapshot.has_conversation,
  };

  const patch = computeDiff(existingSnap, incomingSnap);
  if (Object.keys(patch).length === 0) return; // No change -> skip

  const updated = await prisma.friend.update({
    where: {
      zalo_account_id_zalo_uid_in_nick: {
        zalo_account_id: args.accountId, zalo_uid_in_nick: args.uid,
      },
    },
    data: buildUpdateData(patch),
    select: { id: true, zalo_account_id: true, zalo_uid_in_nick: true },
  });

  if (args.io) {
    args.io.emit('friend:updated', {
      friendId: updated.id,
      zaloAccountId: updated.zalo_account_id,
      zaloUidInNick: updated.zalo_uid_in_nick,
      patch,
    });
    args.result.emittedCount++;
  }
}
