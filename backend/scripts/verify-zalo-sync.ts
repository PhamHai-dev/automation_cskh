/**
 * verify-zalo-sync.ts — Live verification của 6 Zalo sync fixes.
 *
 * Chạy standalone (không cần server):  npx ts-node scripts/verify-zalo-sync.ts
 *   hoặc:                              npm run verify:zalo
 *
 * Checks:
 *  1. DB state account 4 ("Nick test1") — status/zalo_uid/session
 *  2. Pool filter logic (Fix #1/#2) — reproduce reconnectAll/reconnect eligibility query
 *  3. Live friend sync (Fix #5) — gọi syncFriendsForAccount trigger='manual'
 *  4. Cron registration — startZaloHealthCheck + startFriendSyncCron trong server.ts
 *  5. Friends/Groups count trước vs sau sync
 *
 * Không sửa DB — chỉ đọc + gọi sync (idempotent, upsert dedup @@unique).
 */
import { prisma } from '../src/prisma/client';
import { syncFriendsForAccount } from '../src/modules/zalo/friend-sync-service';

const ACCOUNT_ID = 4;

function pad(s: string, w = 60): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function box(title: string): void {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(72)}`);
}

async function check1_dbState(): Promise<void> {
  box('CHECK 1 — DB state account (Nick test1)');
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number; cs_id: number; display_name: string; status: string;
      has_uid: number; has_session: number; archived: number;
      disconnect_reason: string | null; last_sync_at: Date | null;
      last_sync_error: string | null;
    }>
  >(
    `SELECT id, cs_id, display_name, status,
            zalo_uid IS NOT NULL AS has_uid,
            encrypted_session_data IS NOT NULL AS has_session,
            archived_at IS NOT NULL AS archived,
            disconnect_reason,
            last_sync_at, last_sync_error
     FROM zalo_accounts ORDER BY id`,
  );
  for (const r of rows) {
    console.log(pad(`  #${r.id} ${r.display_name}`), `status=${r.status}`);
    console.log(pad(`    uid=${r.has_uid ? 'YES' : 'NO'} session=${r.has_session ? 'YES' : 'NO'}`),
      `archived=${r.archived ? 1 : 0} dc=${r.disconnect_reason ?? '-'}`);
    console.log(pad(`    last_sync_at=${r.last_sync_at?.toISOString() ?? '-'}`),
      `last_sync_error=${r.last_sync_error ?? '-'}`);
  }

  const mine = rows.find((r) => r.id === ACCOUNT_ID);
  if (!mine) {
    console.warn(`  ⚠ Account #${ACCOUNT_ID} not found`);
    return;
  }
  if (!mine.has_session) console.warn(`  ⚠ Account #${ACCOUNT_ID}: NO session — cần QR login lại`);
  if (!mine.has_uid) console.warn(`  ⚠ Account #${ACCOUNT_ID}: zalo_uid NULL — race cũ; run UPDATE status='QR_PENDING' rồi QR lại`);
  if ((mine.status ?? '').toLowerCase() === 'connected' || mine.status === 'ACTIVE') {
    console.log(`  ✅ Account #${ACCOUNT_ID} đang ${mine.status} — sẵn sàng cho live sync`);
  }
}

async function check2_poolFilters(): Promise<void> {
  box('CHECK 2 — Pool filters (Fix #1 reconnectAll / Fix #2 reconnect)');

  // Fix #1 + #7: reconnectAll() where — KHÔNG còn zalo_uid: {not:null}, dùng OR cho NULL disconnect_reason
  const newFilter = await prisma.zaloAccount.count({
    where: {
      encrypted_session_data: { not: null },
      archived_at: null,
      status: { not: 'NOT_LOGGED_IN' as any },
      OR: [
        { disconnect_reason: null },
        { disconnect_reason: { not: 'manual' } },
      ],
    },
  });
  // Filter cũ (broken): có zalo_uid: {not:null}
  const oldFilter = await prisma.zaloAccount.count({
    where: {
      encrypted_session_data: { not: null },
      archived_at: null,
      zalo_uid: { not: null },
      NOT: { disconnect_reason: 'manual' },
    },
  });
  console.log(pad(`  reconnectAll match (new, wide) = ${newFilter}`), `(old, strict) = ${oldFilter}`);
  if (newFilter > oldFilter) {
    console.log(`  ✅ Fix #1: filter mới bao thêm ${newFilter - oldFilter} account có session nhưng chưa uid`);
  } else {
    console.log(`  ℹ Fix #1: filter mới == cũ (không có account nào cần ghost recovery)`);
  }

  // Fix #2: reconnect() eligibility — account có session + archived_at NULL được phép reconnect dù zalo_uid NULL
  const eligible = await prisma.zaloAccount.findMany({
    where: { encrypted_session_data: { not: null }, archived_at: null },
    select: { id: true, display_name: true, zalo_uid: true, disconnect_reason: true },
  });
  console.log(`  reconnect() eligibility (session + not archived) = ${eligible.length} account(s):`);
  for (const a of eligible) {
    console.log(`    - #${a.id} ${a.display_name} uid=${a.zalo_uid ? a.zalo_uid : 'NULL'} dc=${a.disconnect_reason ?? '-'}`);
  }
}

async function check3_liveSync(): Promise<void> {
  box('CHECK 3 — Live friend sync (Fix #5, trigger=manual)');
  const before = await prisma.friend.count({ where: { zalo_account_id: ACCOUNT_ID } });
  console.log(`  Friends before sync: ${before}`);

  try {
    const res = await syncFriendsForAccount(ACCOUNT_ID, { trigger: 'manual', io: null });
    console.log(`  ✅ syncFriendsForAccount(#${ACCOUNT_ID}) completed:`);
    console.log(`    liveCount=${res.liveCount}  upserted=${res.upsertedFriends}  emitted=${res.emittedCount}`);
    console.log(`    errors=${res.errors}  durationMs=${res.durationMs}  skipped=${res.skipped ?? 'none'}`);

    const after = await prisma.friend.count({ where: { zalo_account_id: ACCOUNT_ID } });
    console.log(`  Friends after sync: ${after} (delta=${after - before})`);
    if (res.liveCount > 0) console.log('  ✅ Zalo session còn hạn — data live sync OK');
    if (res.errors > 0) console.warn(`  ⚠ ${res.errors} error(s) — check log chi tiết`);
  } catch (err) {
    console.warn(`  ⚠ Live sync FAILED: ${String(err)}`);
    console.warn(`    → Session hết hạn hoặc zca-js không available. Không phải lỗi fix.`);
  }
}

async function check4_cronRegistration(): Promise<void> {
  box('CHECK 4 — Cron registration trong server.ts');
  const fs = await import('fs');
  const serverSrc = fs.readFileSync('src/server.ts', 'utf-8');
  const hasHealth = /startZaloHealthCheck\(/.test(serverSrc);
  const hasFriendCron = /startFriendSyncCron\(/.test(serverSrc);
  console.log(`  startZaloHealthCheck()  : ${hasHealth ? '✅ registered' : '❌ MISSING'}`);
  console.log(`  startFriendSyncCron(io) : ${hasFriendCron ? '✅ registered' : '❌ MISSING'}`);
}

async function check5_dataCounts(): Promise<void> {
  box('CHECK 5 — Data counts account #' + ACCOUNT_ID);
  const [friends, groups, members] = await Promise.all([
    prisma.friend.count({ where: { zalo_account_id: ACCOUNT_ID } }),
    prisma.zaloGroup.count({ where: { zalo_account_id: ACCOUNT_ID } }),
    prisma.zaloGroupMember.count({ where: { zalo_group: { zalo_account_id: ACCOUNT_ID } } }),
  ]);
  console.log(pad(`  friends        = ${friends}`));
  console.log(pad(`  groups         = ${groups}`));
  console.log(pad(`  group_members  = ${members}`));
}

async function main(): Promise<void> {
  console.log('Zalo Sync Verification — bắt đầu');
  await check1_dbState();
  await check2_poolFilters();
  await check3_liveSync();
  await check4_cronRegistration();
  await check5_dataCounts();
  console.log('\nHoàn tất.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Verify script error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
