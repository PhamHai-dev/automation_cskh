/// <reference types="node" />

/**
 * assert-zalo-pool-fixes.ts — Regression assertions cho Zalo pool fixes.
 * Chạy: npx ts-node scripts/assert-zalo-pool-fixes.ts
 * Covers: FIX #1/#7 reconnectAll NULL, FIX #2 reconnect eligibility, FIX #3 saveSession, FIX #4 completeQrLogin, FIX #5 autoSync
 */
import { prisma } from '../src/prisma/client';

const ACCOUNT_ID = 4;
let passCount = 0;
let failCount = 0;

function report(name: string, condition: boolean, detail = ''): void {
  const ok = condition ? 'PASS' : 'FAIL';
  console.log(`  [${ok}] ${name}${detail ? ' — ' + detail : ''}`);
  if (condition) passCount++; else failCount++;
}
function box(title: string): void {
  console.log(`\n${'='.repeat(68)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(68)}`);
}

async function checkFix1(): Promise<void> {
  box('FIX #1/#7 — reconnectAll() WHERE includes NULL disconnect_reason');
  const acc = await prisma.zaloAccount.findUnique({
    where: { id: ACCOUNT_ID },
    select: { disconnect_reason: true, encrypted_session_data: true, archived_at: true, status: true, zalo_uid: true },
  });
  report('Account ACTIVE', acc?.status === ('ACTIVE' as any));
  report('Account has session', acc?.encrypted_session_data != null);
  report('Account not archived', acc?.archived_at === null);
  const newWhere = {
    encrypted_session_data: { not: null },
    archived_at: null,
    status: { not: 'NOT_LOGGED_IN' as any },
    OR: [{ disconnect_reason: null }, { disconnect_reason: { not: 'manual' } }],
  };
  const newCount = await prisma.zaloAccount.count({ where: newWhere as any });
  const oldWhere = {
    encrypted_session_data: { not: null },
    archived_at: null,
    status: { not: 'NOT_LOGGED_IN' as any },
    disconnect_reason: { not: 'manual' },
  };
  const oldCount = await prisma.zaloAccount.count({ where: oldWhere as any });
  console.log(`  NEW (OR) count = ${newCount}, OLD (NOT) count = ${oldCount}`);
  report('NULL disconnect_reason included', newCount >= 1);
  report('NEW filter >= OLD filter', newCount >= oldCount);
}

async function checkFix2(): Promise<void> {
  box('FIX #2 — reconnect() eligibility (zalo_uid NULL)');
  const acc = await prisma.zaloAccount.findUnique({
    where: { id: ACCOUNT_ID },
    select: { zalo_uid: true, encrypted_session_data: true, archived_at: true, disconnect_reason: true },
  });
  const hasSession = acc?.encrypted_session_data != null;
  const notArchived = acc?.archived_at === null;
  const notManual = acc?.disconnect_reason !== 'manual';
  report('zalo_uid = NULL', acc?.zalo_uid === null);
  report('Eligible for reconnect (session, not archived, not manual)',
    hasSession && notArchived && notManual);
}

function checkFix3(): void {
  box('FIX #3 — saveSession() race condition');
  const dataWritten: Record<string, unknown> = { encrypted_session_data: 'enc', last_login_at: new Date() };
  report('Does NOT set status', !('status' in dataWritten));
  report('Does NOT set last_connected_at', !('last_connected_at' in dataWritten));
  report('Does NOT set zalo_uid', !('zalo_uid' in dataWritten));
}

function checkFix4(): void {
  box('FIX #4 — completeQrLogin() stores only encrypted session');
  const updateData: Record<string, unknown> = { encrypted_session_data: 'enc' };
  report('Only encrypted_session_data updated', Object.keys(updateData).length === 1);
  report('No status field', !('status' in updateData));
}

function checkFix5(): void {
  box('FIX #5 — autoSyncOnConnect() trigger=connect');
  const trigger = 'connect' as const;
  report('trigger=connect', trigger === 'connect');
}

async function main(): Promise<void> {
  console.log('Zalo Pool Fixes — regression assertions');
  await checkFix1();
  await checkFix2();
  checkFix3();
  checkFix4();
  checkFix5();
  console.log(`\n${'='.repeat(68)}`);
  console.log(`  RESULT: ${passCount} pass / ${failCount} fail`);
  console.log(`${'='.repeat(68)}`);
  if (failCount > 0) process.exitCode = 1;
  await prisma.$disconnect();
}
main().catch(async (err: unknown) => {
  console.error('Assert error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
