import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, RefreshCw, RotateCcw, Search, Send, SlidersHorizontal, Users } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Badge } from '../../../components/ui/Badge';
import { FilterBar } from '../../../components/common/FilterBar';
import type { InboxPlatform } from '../utils/inbox';

export type InboxReadStatus = 'ALL' | 'unread' | 'read' | 'unreplied';
export type InboxThreadType = 'ALL' | 'user' | 'group';

export function inboxTime(timestamp?: string | null, conversation = false): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  if (conversation && date.toDateString() !== new Date().toDateString()) {
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function InboxWorkspace({ listHeader, list, children, showThread }: {
  listHeader: React.ReactNode; list: React.ReactNode; children: React.ReactNode; showThread: boolean;
}) {
  return (
    <div data-inbox="workspace" className="flex h-full min-h-0 min-w-0 overflow-hidden bg-background">
      <section aria-label="Danh sách hội thoại" className={`min-h-0 w-full shrink-0 flex-col border-r border-border bg-surface md:w-80 xl:w-96 ${showThread ? 'hidden md:flex' : 'flex'}`}>
        <div className="shrink-0 space-y-3 border-b border-border p-3">{listHeader}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
      </section>
      <section aria-label="Nội dung hội thoại" className={`min-h-0 min-w-0 flex-1 flex-col ${showThread ? 'flex' : 'hidden md:flex'}`}>
        {children}
      </section>
    </div>
  );
}

export function InboxToolbar({ accounts, accountId, onAccountChange, search, onSearchChange, platform, onPlatformChange,
  threadType, onThreadTypeChange, readStatus, onReadStatusChange, onReset, onRefresh, loading, count }: {
  accounts: { value: string | number; label: string }[]; accountId: string | number;
  onAccountChange: (value: string) => void; search: string; onSearchChange: (value: string) => void;
  platform: InboxPlatform; onPlatformChange: (value: InboxPlatform) => void;
  threadType: InboxThreadType; onThreadTypeChange: (value: InboxThreadType) => void;
  readStatus: InboxReadStatus; onReadStatusChange: (value: InboxReadStatus) => void;
  onReset: () => void; onRefresh: () => void; loading: boolean; count: number;
}) {
  const hasFilters = platform !== 'ALL' || accountId !== 'ALL' || threadType !== 'ALL' || readStatus !== 'ALL' || !!search.trim();
  const [expanded, setExpanded] = useState(false);
  const extraCount = Number(threadType !== 'ALL') + Number(readStatus !== 'ALL');
  const advancedId = React.useId();
  const compactControl = 'h-8 rounded-lg py-1 text-xs';
  return (
    <div role="search" aria-label="Bộ lọc hội thoại" data-inbox="filters">
      <FilterBar variant="embedded" showHeader={false} gridClassName="space-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1"><Input className="h-9 rounded-lg text-xs" aria-label="Tìm hội thoại" placeholder="Tìm hội thoại..." value={search} onChange={(e) => onSearchChange(e.target.value)} leftIcon={<Search className="h-4 w-4" />} /></div>
          <Button variant={expanded || extraCount ? 'secondary' : 'outline'} size="icon-sm" aria-label="Bộ lọc bổ sung" title="Loại hội thoại và trạng thái" aria-expanded={expanded} aria-controls={advancedId} onClick={() => setExpanded((value) => !value)} className="relative">
            <SlidersHorizontal className="h-4 w-4" />
            {extraCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-white">{extraCount}</span>}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={onRefresh} disabled={loading} aria-label="Làm mới hội thoại" title="Làm mới hội thoại">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0"><Select className={compactControl} label="Nền tảng" aria-label="Nền tảng" value={platform} onChange={(e) => onPlatformChange(e.target.value as InboxPlatform)} options={[
            { value: 'ALL', label: 'Tất cả' }, { value: 'ZALO', label: 'Zalo' }, { value: 'LINE', label: 'LINE' },
          ]} /></div>
          <div className="min-w-0"><Select className={compactControl} label="Tài khoản" aria-label="Tài khoản" title={accounts.find((account) => account.value === accountId)?.label} value={accountId} onChange={(e) => onAccountChange(e.target.value)} options={accounts} /></div>
        </div>
        <div id={advancedId} hidden={!expanded}>
          <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0"><Select className={compactControl} label="Loại hội thoại" aria-label="Loại hội thoại" value={threadType} onChange={(e) => onThreadTypeChange(e.target.value as InboxThreadType)} options={[
            { value: 'ALL', label: 'Tất cả' }, { value: 'user', label: 'Cá nhân' }, { value: 'group', label: 'Nhóm' },
          ]} /></div>
          <div className="min-w-0"><Select className={compactControl} label="Trạng thái" aria-label="Trạng thái hội thoại" value={readStatus} onChange={(e) => onReadStatusChange(e.target.value as InboxReadStatus)} options={[
            { value: 'ALL', label: 'Tất cả' }, { value: 'unread', label: 'Chưa đọc' }, { value: 'read', label: 'Đã đọc' }, { value: 'unreplied', label: 'Chưa trả lời' },
          ]} /></div>
          </div>
        </div>
        <div className="flex min-h-6 items-center justify-between gap-2">
          <p className="text-xs text-text-muted" role="status">{loading ? 'Đang cập nhật...' : `${count} hội thoại`}{extraCount > 0 && ` · ${extraCount} bộ lọc bổ sung`}</p>
          {hasFilters && <Button variant="ghost" size="sm" className="h-6 shrink-0 px-1 text-xs" leftIcon={<RotateCcw className="h-3 w-3" />} onClick={onReset}>Xóa bộ lọc</Button>}
        </div>
      </FilterBar>
    </div>
  );
}

export function InboxAvatar({ name, url, group = false }: { name: string; url?: string | null; group?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary-soft text-sm font-semibold text-primary" aria-hidden="true">
      {url && url !== failedUrl ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} className="h-full w-full object-cover" />
        : group ? <Users className="h-5 w-5" /> : name.trim().slice(0, 2).toUpperCase() || '?'}
    </div>
  );
}

export function InboxConversation({ name, avatar, group, platform, accountName, preview, timestamp, unread = 0, selected, onClick, onContextMenu, note }: {
  name: string; avatar?: string | null; group?: boolean; platform: 'Zalo' | 'LINE'; accountName: string;
  preview?: string; timestamp?: string | null; unread?: number; selected: boolean; onClick: () => void;
  onContextMenu?: React.MouseEventHandler<HTMLButtonElement>; note?: React.ReactNode;
}) {
  return (
    <button type="button" data-inbox="conversation" aria-pressed={selected} onClick={onClick} onContextMenu={onContextMenu}
      className={`flex w-full gap-3 border-b border-border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${selected ? 'bg-primary-soft' : 'bg-surface hover:bg-surface-muted'}`}>
      <InboxAvatar name={name} url={avatar} group={group} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span title={name} className={`min-w-0 flex-1 truncate text-sm text-text-primary ${unread ? 'font-bold' : 'font-semibold'}`}>{name}</span>
          <time title={timestamp ? new Date(timestamp).toLocaleString('vi-VN') : undefined} className="shrink-0 text-xs text-text-muted">{inboxTime(timestamp, true)}</time>
        </div>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-text-secondary" title={preview}>{preview || 'Chưa có tin nhắn'}</p>
          {unread > 0 && <Badge variant="info" size="sm">{unread > 99 ? '99+' : unread}</Badge>}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-text-muted">
          <Badge size="sm" variant="neutral">{platform}</Badge>
          <span className="truncate" title={accountName}>{accountName}</span>
        </div>
        {note}
      </div>
    </button>
  );
}

export function InboxState({ loading, error, title, onRetry }: { loading?: boolean; error?: string; title?: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-text-muted" role={error ? 'alert' : 'status'}>
      {loading ? <RefreshCw className="h-6 w-6 animate-spin motion-reduce:animate-none" /> : <MessageSquare className="h-8 w-8 text-text-muted" />}
      <p>{loading ? 'Đang tải dữ liệu...' : error || title || 'Chọn một hội thoại để bắt đầu nhắn tin'}</p>
      {error && onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Thử lại</Button>}
    </div>
  );
}

export function InboxThreadHeader({ name, avatar, group, platform, accountName, onBack, actions, note }: {
  name: string; avatar?: string | null; group?: boolean; platform: 'Zalo' | 'LINE'; accountName: string;
  onBack: () => void; actions?: React.ReactNode; note?: React.ReactNode;
}) {
  return (
    <header data-inbox="thread-header" className="shrink-0 border-b border-border bg-surface p-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Quay lại danh sách hội thoại"><ArrowLeft className="h-4 w-4" /></Button>
        <InboxAvatar name={name} url={avatar} group={group} />
        <div className="min-w-0 flex-1">
          <h2 title={name} className="truncate text-sm font-semibold text-text-primary">{name}</h2>
          <p title={`${platform} · ${accountName}`} className="truncate text-xs text-text-muted">{platform} · {accountName} · {group ? 'Nhóm' : 'Cá nhân'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      {note && <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-secondary">{note}</div>}
    </header>
  );
}

export function InboxMessageList<T extends { id: string | number; timestamp: string }>({ messages, loading, error, onRetry, renderMessage, conversationKey }: {
  messages: T[]; loading: boolean; error?: string; onRetry?: () => void; renderMessage: (message: T) => React.ReactNode; conversationKey: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useEffect(() => { followLatest.current = true; }, [conversationKey]);
  useEffect(() => {
    if (followLatest.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);
  return (
    <div data-inbox="messages" ref={scrollRef} role="log" aria-label="Tin nhắn" aria-live="polite" aria-busy={loading}
      onScroll={(e) => { const node = e.currentTarget; followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden bg-background p-3 sm:p-4">
      {loading ? <InboxState loading /> : error ? <InboxState error={error} onRetry={onRetry} /> : !messages.length ? <InboxState title="Chưa có tin nhắn trong hội thoại này" />
        : messages.map((message, index) => {
          const date = new Date(message.timestamp);
          const validDate = Number.isFinite(date.getTime());
          const previousDay = index ? new Date(messages[index - 1].timestamp).toDateString() : '';
          return <React.Fragment key={message.id}>
            {validDate && date.toDateString() !== previousDay && <div className="py-2 text-center"><span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted">{date.toLocaleDateString('vi-VN')}</span></div>}
            {renderMessage(message)}
          </React.Fragment>;
        })}
    </div>
  );
}

export function InboxMessage({ isSelf, senderName, timestamp, children, receipt, actions, reactions }: {
  isSelf: boolean; senderName?: string | null; timestamp: string; children: React.ReactNode;
  receipt?: React.ReactNode; actions?: React.ReactNode; reactions?: React.ReactNode;
}) {
  return (
    <div data-inbox="message" data-direction={isSelf ? 'outgoing' : 'incoming'} className={`group/msg flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div className="relative min-w-0 max-w-[85%] sm:max-w-[75%]">
        {actions}
        <div data-inbox="bubble" className={`min-w-0 rounded-2xl border px-3 py-2 text-sm leading-relaxed [overflow-wrap:anywhere] ${isSelf ? 'rounded-br-sm border-primary bg-primary text-white' : 'rounded-bl-sm border-border bg-surface text-text-primary'}`}>
          {!isSelf && senderName && <p className="mb-1 text-xs font-semibold text-primary">{senderName}</p>}
          {children}
          <div className={`mt-1 flex flex-wrap items-center justify-end gap-x-2 text-xs ${isSelf ? 'text-white/80' : 'text-text-muted'}`}>
            <time title={new Date(timestamp).toLocaleString('vi-VN')}>{inboxTime(timestamp)}</time>{receipt}
          </div>
        </div>
        {reactions}
      </div>
    </div>
  );
}

export function InboxComposer({ value, onChange, onSend, sending, disabled, extra, preview }: {
  value: string; onChange: (value: string) => void; onSend: () => void; sending: boolean;
  disabled?: boolean; extra?: React.ReactNode; preview?: React.ReactNode;
}) {
  const submit = () => { if (!sending && !disabled && value.trim()) onSend(); };
  return (
    <div data-inbox="composer" className="shrink-0 border-t border-border bg-surface p-3">
      {preview}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2">
        {extra}
        <div className="min-w-0 flex-1">
          <Textarea aria-label="Nội dung tin nhắn" rows={2} className="min-h-0 resize-none" placeholder="Nhập tin nhắn..." value={value} disabled={disabled || sending}
            onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
            }} />
        </div>
        <Button type="submit" variant="primary" size="sm" isLoading={sending} disabled={disabled || sending || !value.trim()} leftIcon={<Send className="h-4 w-4" />}>Gửi</Button>
      </form>
      <p className="mt-1 text-xs text-text-muted">Enter để gửi · Shift + Enter để xuống dòng</p>
    </div>
  );
}
