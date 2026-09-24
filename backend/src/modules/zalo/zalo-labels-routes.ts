/**
 * zalo-labels-routes.ts — Express Router: Zalo native label sync & management.
 * Ported from ZaloCRM zalo-labels-routes.ts (903 lines) → simplified.
 *
 * Adaptations (CRM deps NOT in automation_cskh schema):
 *   - No CrmTag/CrmTagGroup/Tag/FriendTag models → skip CRM mirror logic
 *   - No Friend.zaloLabels JSON → skip friend label rebuild
 *   - No orgId (single-org) → remove all tenant scoping
 *   - No Fastify → Express Router
 *   - zaloPool.getApi(id) → zaloPool.getAccountClient(id)
 *   - account.id: number (not string)
 *   - No alias-sync (deferred)
 *   - No Socket.IO broadcast (deferred)
 *   - ZaloLabel schema lacks: textKey, offset, version, syncedAt, createTime
 *     → store text/color/emoji/conversations only; version tracked in-memory
 *
 * Kept from CRM:
 *   - syncLabelsForAccount: pull from SDK getLabels(), upsert ZaloLabel,
 *     delta mode (affectedUidsOnly) vs full mode
 *   - GET /:id/labels — list labels with assignedTo flag per thread
 *   - POST /:id/labels/sync — force sync from SDK
 *   - POST /:id/labels/touch — sync-if-stale (5s cooldown + 30s grace)
 *   - POST /:id/labels/assign-thread — single-select label assignment per thread
 *   - PATCH /:id/labels/:labelId — edit color/text/emoji via SDK
 *   - Cooldown + grace window logic
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { checkAccess, handleError } from './zalo-route-helpers';

const log = createLogger('ZaloLabels');
const router = Router({ mergeParams: true });

// ─── Types ────────────────────────────────────────────────────────────────────

type LabelDataFromSdk = {
  id: number | string;
  text: string;
  textKey?: string;
  color: string;
  emoji?: string;
  offset?: number;
  conversations?: string[];
  createTime?: number;
};

// ─── Cooldown + Grace ────────────────────────────────────────────────────────

const lastSyncedAt = new Map<number, number>();
const SYNC_COOLDOWN_MS = 5_000;
const recentAssignAt = new Map<number, number>();
const ASSIGN_GRACE_MS = 30_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  for (const x of a) if (!setB.has(x)) return false;
  return true;
}

// ─── syncLabelsForAccount ─────────────────────────────────────────────────────

/**
 * Pull labels from Zalo SDK, upsert into DB.
 * Delta mode: only process affected UIDs (assign-thread path).
 * Full mode: delete stale labels, rebuild all.
 */
export async function syncLabelsForAccount(
  accountId: number,
  opts?: { seedLabelData?: LabelDataFromSdk[]; seedVersion?: number; affectedUidsOnly?: string[] },
): Promise<{
  labels: Array<{ id: string; text: string; color: string; emoji: string | null; assignedCount: number }>;
  friendsUpdated: number;
  version: number;
}> {
  const isDelta = Array.isArray(opts?.affectedUidsOnly);
  const client = zaloPool.getAccountClient(accountId);
  if (!client) throw new Error('Zalo account chua ket noi — khong the dong bo label');
  if (typeof client.getLabels !== 'function') throw new Error('SDK khong ho tro getLabels()');

  // Pull label data from Zalo SDK
  let labelData: LabelDataFromSdk[];
  let version: number;
  if (opts?.seedLabelData && opts.seedLabelData.length >= 0) {
    labelData = opts.seedLabelData;
    version = opts.seedVersion ?? 0;
    log.info('Using SEED labelData', { count: labelData.length, version, accountId });
  } else {
    log.info('Pulling labels from SDK', { accountId });
    const res = await client.getLabels();
    labelData = res?.labelData || res?.data?.labelData || [];
    version = res?.version || res?.data?.version || 0;
    log.info('Got labels from Zalo', { count: labelData.length, version, accountId });
  }

  // Upsert labels into ZaloLabel table
  const upserted = await prisma.$transaction(async (tx) => {
    // Full mode: delete labels no longer in Zalo
    if (!isDelta) {
      const incomingIds = labelData.map((l) => String(l.id));
      await (tx as any).zaloLabel.deleteMany({
        where: {
          zalo_account_id: accountId,
          zalo_label_id: { notIn: incomingIds.length ? incomingIds : ['__none__'] },
        },
      });
    }

    const existing = await (tx as any).zaloLabel.findMany({
      where: { zalo_account_id: accountId },
    });
    const byLabelId = new Map<string, any>(existing.map((l: any) => [l.zalo_label_id, l]));

    const rows = [];
    for (const lbl of labelData) {
      const id = String(lbl.id);
      const prev: any = byLabelId.get(id);
      const nextConvs = lbl.conversations || [];
      const nextText = lbl.text || '';
      const nextColor = lbl.color || '#999999';
      const nextEmoji = lbl.emoji || null;

      // Skip upsert if nothing changed (optimization)
      if (
        prev &&
        prev.text === nextText &&
        prev.color === nextColor &&
        prev.emoji === nextEmoji &&
        sameStringSet(Array.isArray(prev.conversations) ? (prev.conversations as string[]) : [], nextConvs)
      ) {
        rows.push(prev);
        continue;
      }

      const row = await (tx as any).zaloLabel.upsert({
        where: {
          zalo_account_id_zalo_label_id: { zalo_account_id: accountId, zalo_label_id: id },
        },
        create: {
          zalo_account_id: accountId,
          zalo_label_id: id,
          text: nextText,
          color: nextColor,
          emoji: nextEmoji,
          conversations: nextConvs,
        },
        update: {
          text: nextText,
          color: nextColor,
          emoji: nextEmoji,
          conversations: nextConvs,
        },
      });
      rows.push(row);
    }
    return rows;
  });

  return {
    labels: upserted.map((l: any) => ({
      id: l.zalo_label_id,
      text: l.text,
      color: l.color,
      emoji: l.emoji,
      assignedCount: Array.isArray(l.conversations) ? (l.conversations as string[]).length : 0,
    })),
    friendsUpdated: 0, // Friend.zaloLabels not in schema
    version,
  };
}

/**
 * Sync if stale (5s cooldown + 30s grace after user assign).
 */
export async function syncLabelsIfStale(
  accountId: number,
): Promise<Awaited<ReturnType<typeof syncLabelsForAccount>> | null> {
  const lastAssign = recentAssignAt.get(accountId) || 0;
  if (Date.now() - lastAssign < ASSIGN_GRACE_MS) {
    log.info('Skip passive sync — user assigned recently', { accountId, age: Math.round((Date.now() - lastAssign) / 1000) });
    return null;
  }
  const last = lastSyncedAt.get(accountId) || 0;
  if (Date.now() - last < SYNC_COOLDOWN_MS) return null;
  lastSyncedAt.set(accountId, Date.now());
  try {
    return await syncLabelsForAccount(accountId);
  } catch (e) {
    lastSyncedAt.delete(accountId);
    throw e;
  }
}

// ─── GET /:id/labels — list labels for an account ────────────────────────────
router.get('/:id/labels', async (req: Request, res: Response) => {
  try {
    const accountId = Number(req.params.id);
    const ok = await checkAccess(req, res, accountId, 'read');
    if (!ok) return;

    const threadId = (req.query.threadId as string) || '';
    const labels = await (prisma as any).zaloLabel.findMany({
      where: { zalo_account_id: accountId },
    });
    res.json({
      labels: labels.map((l: any) => {
        const convs = Array.isArray(l.conversations) ? (l.conversations as string[]) : [];
        return {
          id: l.zalo_label_id,
          dbId: l.id,
          text: l.text,
          color: l.color,
          emoji: l.emoji,
          assignedCount: convs.length,
          assignedTo: threadId ? convs.includes(threadId) : false,
        };
      }),
    });
  } catch (err) {
    handleError(res, err, 'Failed to list labels');
  }
});

// ─── POST /:id/labels/sync — force sync from SDK ────────────────────────────
router.post('/:id/labels/sync', async (req: Request, res: Response) => {
  try {
    const accountId = Number(req.params.id);
    const ok = await checkAccess(req, res, accountId, 'admin');
    if (!ok) return;

    const result = await syncLabelsForAccount(accountId);
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Sync failed');
  }
});

// ─── POST /:id/labels/touch — sync-if-stale ──────────────────────────────────
router.post('/:id/labels/touch', async (req: Request, res: Response) => {
  try {
    const accountId = Number(req.params.id);
    const ok = await checkAccess(req, res, accountId, 'read');
    if (!ok) return;

    const result = await syncLabelsIfStale(accountId);
    if (!result) {
      res.json({ ok: true, skipped: true, reason: 'cooldown' });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    log.warn('Touch sync warn', { error: String(err) });
    res.json({ ok: false, error: String(err) });
  }
});

// ─── POST /:id/labels/assign-thread — assign label to a thread ───────────────
// Body: { threadId: string, labelId: number | null }
// Single-select: strip threadId from all labels, add to selected label.
router.post('/:id/labels/assign-thread', async (req: Request, res: Response) => {
  try {
    const accountId = Number(req.params.id);
    const ok = await checkAccess(req, res, accountId, 'admin');
    if (!ok) return;

    const threadId = (req.body?.threadId || '').trim();
    const newLabelId = req.body?.labelId ?? null;
    if (!threadId) {
      res.status(400).json({ error: 'threadId is required' });
      return;
    }

    const client = zaloPool.getAccountClient(accountId);
    if (!client || typeof client.updateLabels !== 'function') {
      res.status(503).json({ error: 'Zalo account chua ket noi — khong the gan tag' });
      return;
    }

    // Pull current label data from Zalo
    const current = await client.getLabels();
    const labelData: LabelDataFromSdk[] = (current?.labelData || []).map((l: LabelDataFromSdk) => ({
      ...l,
      conversations: Array.isArray(l.conversations) ? [...l.conversations] : [],
    }));
    const version: number = current?.version || 0;

    // Strip threadId from all labels (single-select cleanup)
    for (const l of labelData) {
      l.conversations = (l.conversations || []).filter((c: string) => c !== threadId);
    }

    // Add to new label if provided
    if (newLabelId !== null) {
      const target = labelData.find((l) => Number(l.id) === newLabelId);
      if (!target) {
        res.status(400).json({ error: 'Label ID khong ton tai' });
        return;
      }
      target.conversations = target.conversations || [];
      if (!target.conversations.includes(threadId)) target.conversations.push(threadId);
    }

    // Push to Zalo SDK
    let writeRes: { labelData?: LabelDataFromSdk[]; version?: number } | undefined;
    try {
      writeRes = await client.updateLabels({ labelData, version });
      log.info('Zalo updateLabels success', { accountId, newVersion: writeRes?.version });
    } catch (sdkErr: unknown) {
      const msg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      log.error('Zalo updateLabels FAILED', { accountId, error: msg });
      res.status(502).json({ error: `Zalo tu choi: ${msg}` });
      return;
    }

    // Seed sync with authoritative response (avoid eventual-consistency lag)
    const seedLabelData = Array.isArray(writeRes?.labelData) ? writeRes!.labelData : labelData;
    const seedVersion = writeRes?.version ?? version;
    recentAssignAt.set(accountId, Date.now());
    const result = await syncLabelsForAccount(accountId, {
      seedLabelData: seedLabelData as LabelDataFromSdk[],
      seedVersion,
      affectedUidsOnly: [threadId],
    });
    res.json({ ok: true, assignedLabelId: newLabelId, ...result });
  } catch (err) {
    handleError(res, err, 'Assign-thread failed');
  }
});

// ─── PATCH /:id/labels/:labelId — edit label color/text/emoji ────────────────
router.patch('/:id/labels/:labelId', async (req: Request, res: Response) => {
  try {
    const accountId = Number(req.params.id);
    const ok = await checkAccess(req, res, accountId, 'admin');
    if (!ok) return;

    const labelId = req.params.labelId;
    const label = await (prisma as any).zaloLabel.findUnique({
      where: { zalo_account_id_zalo_label_id: { zalo_account_id: accountId, zalo_label_id: labelId } },
    });
    if (!label) {
      res.status(404).json({ error: 'Label not found' });
      return;
    }

    const client = zaloPool.getAccountClient(accountId);
    if (!client || typeof client.updateLabels !== 'function') {
      res.status(503).json({ error: 'Zalo account chua ket noi — khong the cap nhat' });
      return;
    }

    // Fetch full current labelData, mutate the target, push back
    const current = await client.getLabels();
    const labelData = (current?.labelData || []).map((l: LabelDataFromSdk) => {
      if (Number(l.id) !== Number(labelId)) return l;
      return {
        ...l,
        text: req.body.text ?? l.text,
        color: req.body.color ?? l.color,
        emoji: req.body.emoji ?? l.emoji,
      };
    });
    await client.updateLabels({ labelData, version: current?.version || 0 });

    // Re-sync to capture the new server state
    const result = await syncLabelsForAccount(accountId);
    res.json({ ok: true, ...result });
  } catch (err) {
    handleError(res, err, 'Update label failed');
  }
});

// ─── Compat stubs (CRM app.ts calls these — keep empty to avoid breaks) ──────
export function startLabelsBackgroundSync(_intervalMs?: number): void {
  log.info('On-demand sync mode (no background interval, 5s cooldown per account)');
}
export function stopLabelsBackgroundSync(): void {}

export { router as zaloLabelsRouter };
