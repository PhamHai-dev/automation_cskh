import type { LineConversation, LineMessage } from '../../line/types/line.types';
import type { PollView, QuoteRef } from '../../zalo/types/zalo.types';

export type InboxPlatform = 'ALL' | 'ZALO' | 'LINE';

export interface InboxAccount {
  key: string;
  platform: 'ZALO' | 'LINE';
  id: number;
  name: string;
  type: 'PERSONAL' | 'OA';
  status: string;
}

export interface InboxConversationItem {
  key: string;
  account: InboxAccount;
  threadId: string;
  group: boolean;
  name: string;
  avatar: string | null;
  unread: number;
  preview: string;
  lastMessageAt: string | null;
  replyExpiresAt?: string | null;
  isReplied?: boolean;
  messageCount?: number;
  memberCount?: number | null;
}

export interface InboxMessageItem {
  id: string | number;
  providerId?: string;
  senderName?: string | null;
  senderUid?: string;
  isSelf: boolean;
  content: string;
  contentType: string;
  timestamp: string;
  sentVia?: string;
  isDeleted?: boolean;
  deliveredAt?: string | null;
  seenAt?: string | null;
  quote?: QuoteRef | null;
  reactions?: Record<string, string[]> | null;
  poll?: PollView | null;
}

// Zalo's chat endpoint uses camelCase. LINE supports both versions of its API mapper.
export function toInboxConversation(account: InboxAccount, raw: Record<string, any> | LineConversation): InboxConversationItem {
  const c = raw as Record<string, any>;
  const threadId = String(c.externalThreadId || c.external_thread_id || '');
  const group = (c.threadType || c.thread_type) === 'group';
  const lastMessage = c.lastMessage || c.messages?.[0];
  return {
    key: `${account.key}:${threadId}`, account, threadId, group,
    name: (group ? c.groupName || c.group_name : null) || c.displayName || c.display_name || threadId,
    avatar: (group ? c.groupAvatarUrl || c.group_avatar_url : null) || c.avatarUrl || c.avatar_url || null,
    unread: c.unreadCount ?? c.unread_count ?? 0,
    preview: lastMessage?.content ? `${(lastMessage.isSelf ?? lastMessage.is_self) ? 'Bạn: ' : ''}${lastMessage.content}` : '',
    lastMessageAt: c.lastMessageAt || c.last_message_at || null,
    replyExpiresAt: c.replyTokenExpiresAt || c.reply_token_expires_at || null,
    isReplied: c.isReplied ?? c.is_replied,
    messageCount: c.messageCount,
    memberCount: c.groupMembersCount ?? c.group_members_count,
  };
}

export function toInboxMessage(raw: Record<string, any> | LineMessage): InboxMessageItem {
  const m = raw as Record<string, any>;
  return {
    id: m.id || m.zaloMsgId || m.line_msg_id || m.lineMsgId,
    providerId: m.zaloMsgId || m.line_msg_id || m.lineMsgId,
    senderName: m.senderName || m.sender_name || null,
    senderUid: m.senderUid || m.sender_uid,
    isSelf: m.isSelf ?? m.is_self ?? false,
    content: m.content || '',
    contentType: m.contentType || m.content_type || 'text',
    timestamp: m.timestamp,
    sentVia: m.sentVia || m.sent_via,
    isDeleted: m.isDeleted ?? m.is_deleted ?? false,
    deliveredAt: m.deliveredAt || m.delivered_at,
    seenAt: m.seenAt || m.seen_at,
    quote: m.quote,
    reactions: m.reactions,
    poll: m.rawContent || null,
  };
}

export function inboxError(error: unknown, fallback: string): string {
  const value = error as { response?: { data?: { error?: string | { message?: string }; message?: string } } };
  const body = value?.response?.data;
  return (typeof body?.error === 'string' ? body.error : body?.error?.message) || body?.message || fallback;
}
