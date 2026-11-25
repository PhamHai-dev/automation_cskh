import { maskProxyUrl } from '../../shared/network/proxy-dispatcher';
import { linePool } from './line-pool';

/** Public account view; credential material is available only through explicit export. */
export function lineAccountResponse<T extends { id: number; status: string; account_type: string; proxy_url?: string | null; archived_at?: unknown }>(account: T) {
  const { encrypted_session_data: _session, webhook_secret: _secret, ...safe } = account as T & { encrypted_session_data?: unknown; webhook_secret?: unknown };
  const personal = linePool.getPersonalAdapter(account.id);
  const ready = account.account_type === 'OA' ? Boolean(linePool.getOaAdapter(account.id)) : Boolean(personal?.client && personal.isListening);
  const liveStatus = account.archived_at ? 'DISABLED' : ['DISABLED', 'BANNED'].includes(account.status) ? account.status
    : ready ? 'ACTIVE' : account.status === 'ACTIVE' ? 'NOT_LOGGED_IN' : account.status;
  return { ...safe, proxy_url: maskProxyUrl(account.proxy_url), liveStatus };
}
