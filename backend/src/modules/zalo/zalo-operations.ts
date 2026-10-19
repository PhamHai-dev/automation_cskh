/**
 * zalo-operations.ts — SDK operation category types for rate limiting.
 *
 * Ported from ZaloCRM shared/zalo-operations.ts → simplified single-org.
 * Each category maps to a daily + burst limit pair in sdk-limit.service.
 */

/** All Zalo SDK operation categories that have independent rate limits. */
export type OpCategory =
  | 'message'
  | 'stranger_message'
  | 'reaction'
  | 'chat_action'
  | 'group_admin'
  | 'group_read'
  | 'friend_action'
  | 'friend_read'
  | 'profile'
  | 'query'
  | 'friend_lookup'
  | 'contact_sync';
