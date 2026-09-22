// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * alias-sync.ts — Pull "Tên gợi nhớ" (alias) từ Zalo Real → CRM Friend.aliasInNick.
 * Ported from ZaloCRM alias-sync.ts (95 lines, ~4.2KB) → single-org, Int IDs.
 *
 * Adaptations:
 *   - api.getAliasList → zaloPool.getApi(accountId).api.getAliasList
 *   - No orgId/tenant → single-org
 *   - No logActivity/contactId → direct Friend update only
 *   - Friend.id is Int (autoincrement)
 *
 * Key logic giữ nguyên:
 *   - Diff-and-skip-empty: CHỈ kéo-vào alias từ Zalo, KHÔNG tự xoá. Zalo trả rỗng
 *     có thể là do alias nằm trên UID/danh tính khác của cùng KH → clear sẽ mất.
 *   - Pagination 200/page, hard cap 20 pages (MAX_PAGES) chống infinite loop.
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';

const log = createLogger('AliasSync');

const PAGE_SIZE = 200;
const MAX_PAGES = 20;

/**
 * Pull tất cả aliases từ Zalo SDK.
 * Returns Map<zaloUid, alias>.
 */
export async function pullAliasMap(accountId: number): Promise<Map<string, string>> {
  const api = zaloPool.getApi(accountId);
  if (!api) {
    log.warn(`Account ${accountId} — Zalo API chưa sẵn sàng`);
    return new Map();
  }

  const map = new Map<string, string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    let items: Array<{ userId: string; alias: string }> = [];
    try {
      const res = await api.getAliasList(PAGE_SIZE, page);
      items = (res?.items ?? []) as Array<{ userId: string; alias: string }>;
    } catch (err) {
      log.warn(`[alias-sync] getAliasList page=${page} failed`, { error: String(err) });
      break;
    }
    for (const it of items) {
      if (it.userId && it.alias) map.set(String(it.userId), String(it.alias));
    }
    if (items.length < PAGE_SIZE) break;
  }
  return map;
}

/**
 * Sync alias từ Zalo → CRM cho tất cả friends của 1 account.
 * Diff Friend.aliasInNick với alias hiện tại trên Zalo. Update + log nếu khác.
 * Returns { updated, pulled }.
 * KHÔNG xoá alias khi Zalo trả rỗng (FIX 2026-06-19 — xem header).
 */
export async function syncAliasesForAccount(
  accountId: number,
): Promise<{ updated: number; pulled: number }> {
  const aliasMap = await pullAliasMap(accountId);
  if (aliasMap.size === 0) return { updated: 0, pulled: 0 };

  const friends = await prisma.friend.findMany({
    where: { zalo_account_id: accountId },
    select: { id: true, zalo_uid_in_nick: true, alias_in_nick: true },
  });

  let updated = 0;
  for (const f of friends) {
    const newAlias = aliasMap.get(f.zalo_uid_in_nick) || null;
    const oldAlias = f.alias_in_nick || null;
    if (newAlias === oldAlias) continue;
    // Chỉ kéo-vào, không tự xoá (FIX 2026-06-19)
    if (!newAlias) continue;

    await prisma.friend.update({
      where: { id: f.id },
      data: { alias_in_nick: newAlias },
    });
    updated++;
  }

  log.info(`[alias-sync] Account ${accountId}: pulled ${aliasMap.size}, updated ${updated}`);
  return { updated, pulled: aliasMap.size };
}
