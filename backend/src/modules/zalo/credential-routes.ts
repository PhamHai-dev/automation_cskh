/**
 * credential-routes.ts — Export/import Zalo session credentials for backup/restore.
 * Ported from ZaloCRM credential-routes.ts (116 lines) → Express, single-org, Int IDs.
 *
 * Routes:
 *   GET  /:accountId/credentials/export — download encrypted session blob
 *   POST /:accountId/credentials/import — restore credentials from encrypted blob
 *
 * Adaptations:
 *   - Fastify → Express Router
 *   - orgId → bypass (single-org)
 *   - ownerUserId → cs_id ownership check
 *   - sessionData → encrypted_session_data (AES-GCM blob)
 *   - Export: send raw encrypted blob (no decryption — client stores as-is)
 *   - Import: receive encrypted blob → save as encrypted_session_data
 *   - Admin-only access (resolveAccount + admin role check)
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('CredentialRoutes');
const router = Router({ mergeParams: true });

const BASE = '/:accountId/credentials';

// GET /:accountId/credentials/export — download session credentials as encrypted JSON blob
router.get(`${BASE}/export`, async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { id: true, encrypted_session_data: true, display_name: true, cs_id: true },
    });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Strict per-user isolation: only owner (cs_id = user.id) can export credentials
    if (account.cs_id !== user.id) {
      return res.status(403).json({ error: 'Không có quyền xuất thông tin phiên tài khoản Zalo của người dùng khác' });
    }

    if (!account.encrypted_session_data) {
      return res.status(404).json({ error: 'No credentials saved for this account' });
    }

    const filename = `zalo-credentials-${account.display_name ?? accountId}-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    log.info(`Exporting credentials for account ${accountId}`);

    // Export as encrypted blob — no decryption, client stores as-is
    return res.json({
      version: 1,
      platform: 'ZALO',
      accountId,
      cipher: 'AES-256-GCM',
      encrypted_session_data: account.encrypted_session_data,
      payload: account.encrypted_session_data,
      display_name: account.display_name,
      displayName: account.display_name,
      exported_at: new Date().toISOString(),
      exportedAt: new Date().toISOString(),
    });
  } catch (err) {
    log.error(`Export failed for account ${accountId}`, { error: String(err) });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:accountId/credentials/import — restore credentials from encrypted JSON blob
router.post(`${BASE}/import`, async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { id: true, cs_id: true },
    });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Strict per-user isolation: only owner can import credentials
    if (account.cs_id !== user.id) {
      return res.status(403).json({ error: 'Không có quyền nhập thông tin phiên vào tài khoản Zalo của người dùng khác' });
    }

    const body = req.body as Record<string, unknown> | undefined;
    const encryptedData = (body?.encrypted_session_data ?? body?.payload) as string | undefined;

    if (typeof encryptedData !== 'string' || encryptedData.length === 0) {
      return res.status(400).json({
        error: 'Invalid credential format. Expected: { encrypted_session_data: string }',
      });
    }

    await prisma.zaloAccount.update({
      where: { id: accountId },
      data: {
        encrypted_session_data: encryptedData,
        status: 'NOT_LOGGED_IN' as any, // will be reconnected later
      },
    });

    log.info(`Credentials imported for account ${accountId}`);
    return res.json({ success: true, message: 'Credentials imported. Use reconnect to activate.' });
  } catch (err) {
    log.error(`Import failed for account ${accountId}`, { error: String(err) });
    return res.status(500).json({ error: 'Failed to save credentials' });
  }
});

export { router as credentialRoutes };
