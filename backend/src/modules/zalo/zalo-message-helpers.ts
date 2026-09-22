/**
 * zalo-message-helpers.ts — utilities for processing incoming Zalo messages.
 * Detects content type from msgType and updates contact avatars fire-and-forget.
 *
 * Ported from ZaloCRM zalo-message-helpers.ts → lean version (no Contact model).
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('ZaloMsgHelpers');

// Well-known msgType keyword patterns — used to suppress noise logging
const KNOWN_MSG_TYPE_PATTERNS = [
  'photo', 'image', 'sticker', 'video', 'voice',
  'gif', 'link', 'location', 'file', 'doc',
  'recommended', 'card', 'bank', 'transfer',
  'call', 'voip', 'qr', 'remind', 'todo',
  'poll', 'vote', 'note', 'forward',
];

/**
 * Map zca-js msgType string to a normalized content type label.
 * Falls back to 'text' for unrecognised types or plain-string content.
 */
export function detectContentType(msgType: string | undefined, content: any): string {
  if (!msgType) return 'text';

  // ── FIX 2026-05-21: action-based dispatch MUST run before msgType keyword check ──
  // Zalo wraps call/bank/qr under the same family "recommended.*" → if keyword check
  // "recommended/card" runs first, call messages get misclassified as 'contact_card'.
  // Note: Zalo has typo "recommened" (missing 'd') — match both for safety.
  if (typeof content === 'object' && content !== null) {
    const action = typeof content.action === 'string' ? content.action : '';
    if (action.includes('calltime') || action.includes('misscall')) return 'call';
    if (action === 'zinstant.bankcard') return 'bank_transfer';
    if (typeof content.description === 'string' && content.description.includes('qrCodeUrl')) {
      return 'qr_code';
    }
    // FIX G1 2026-05-21: action="recommened.link" / "recommended.link" = shared link
    // with preview (FB reel, Maps, YouTube...) — should be 'link', not 'contact_card'.
    if (
      (action === 'recommened.link' || action === 'recommended.link') &&
      typeof content.href === 'string' && content.href.startsWith('http')
    ) {
      return 'link';
    }
    // Fallback shape detection for call (some SDK versions use different keys)
    if (content.callDuration !== undefined || content.callType !== undefined) return 'call';
  }

  if (msgType.includes('photo') || msgType.includes('image')) return 'image';
  if (msgType.includes('sticker')) return 'sticker';
  if (msgType.includes('video')) return 'video';
  if (msgType.includes('voice')) return 'voice';
  if (msgType.includes('gif')) return 'gif';
  if (msgType.includes('link')) return 'link';
  if (msgType.includes('location')) return 'location';
  if (msgType.includes('file') || msgType.includes('doc')) return 'file';
  if (msgType.includes('recommended') || msgType.includes('card')) return 'contact_card';

  // Special message types
  if (msgType.includes('bank') || msgType.includes('transfer')) return 'bank_transfer';
  if (msgType.includes('call') || msgType.includes('voip')) return 'call';
  if (msgType.includes('qr')) return 'qr_code';
  if (msgType.includes('remind') || msgType.includes('todo')) return 'reminder';
  if (msgType.includes('poll') || msgType.includes('vote')) return 'poll';
  if (msgType.includes('note')) return 'note';
  if (msgType.includes('forward')) return 'forwarded';

  // Check content object shape for action-based messages (second pass)
  if (typeof content === 'object' && content !== null) {
    const action = typeof content.action === 'string' ? content.action : '';
    if (action.includes('calltime') || action.includes('misscall')) return 'call';
    if (action === 'msginfo.actionlist') return 'reminder';
    // QR Code (VietQR/bank): description contains JSON string with key qrCodeUrl
    if (typeof content.description === 'string' && content.description.includes('qrCodeUrl')) {
      return 'qr_code';
    }
    // Bank account card (zinstant variant)
    if (action === 'zinstant.bankcard' || (typeof content.params === 'string' && content.params.includes('zinstant.bankcard'))) {
      return 'bank_transfer';
    }
    if (content.bankCode || content.bankName) return 'bank_transfer';
    if (content.callDuration !== undefined || content.callType) return 'call';
    // Link auto-unfurl: has thumb + href + no action (not reminder/call/bank)
    if (
      typeof content.href === 'string' && content.href.startsWith('http') &&
      (typeof content.thumb === 'string' || typeof content.title === 'string') &&
      !action
    ) {
      return 'link';
    }

    // Log unknown types for analysis before returning rich
    if (!KNOWN_MSG_TYPE_PATTERNS.some((p) => msgType.includes(p))) {
      log.info(`[zalo:msgType] Unknown object type: "${msgType}" action="${action}"`, {
        contentKeys: Object.keys(content),
      });
    }
    return 'rich';
  }

  // Log unknown string-content types for discovery
  if (!KNOWN_MSG_TYPE_PATTERNS.some((p) => msgType.includes(p))) {
    log.info(`[zalo:msgType] Unknown string type: "${msgType}"`, {
      contentPreview: typeof content === 'string' ? content.slice(0, 100) : undefined,
    });
  }

  return 'text';
}

export interface AlbumInfo {
  albumKey: string | null;
  albumIndex: number | null;
  albumTotal: number | null;
}

/**
 * Extract multi-image album metadata from Zalo content payload.
 * Zalo tags each photo in an album with a shared group_layout_id and position.
 */
export function extractAlbumInfo(contentType: string, rawContent: unknown): AlbumInfo {
  const empty: AlbumInfo = { albumKey: null, albumIndex: null, albumTotal: null };
  if (contentType !== 'image' || typeof rawContent !== 'object' || rawContent === null) return empty;
  const paramsRaw = (rawContent as Record<string, unknown>).params;
  let params: Record<string, unknown> | null = null;
  try {
    params = typeof paramsRaw === 'string' ? JSON.parse(paramsRaw) : (paramsRaw as Record<string, unknown> | null);
  } catch {
    return empty;
  }
  if (!params || !params.is_group_layout || !params.group_layout_id) return empty;
  const idx = Number(params.id_in_group);
  const total = Number(params.total_item_in_group);
  return {
    albumKey: String(params.group_layout_id),
    albumIndex: Number.isFinite(idx) ? idx : null,
    albumTotal: Number.isFinite(total) ? total : null,
  };
}

/**
 * Fire-and-forget: fill in a missing avatar_url on ZaloContactRelation rows
 * linked to the student with the given zalo_uid. Only updates rows where
 * avatar_url is currently null.
 */
export function updateContactAvatar(zaloUid: string, avatarUrl: string): void {
  prisma.zaloContactRelation
    .updateMany({
      where: { avatar_url: null, student: { zalo_uid: zaloUid } },
      data: { avatar_url: avatarUrl },
    })
    .catch(() => {});
}
