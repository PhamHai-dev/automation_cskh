import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Info, RefreshCw, Smile, Trash2 } from 'lucide-react';
import { zaloApi } from '../../zalo/api/zalo.api';
import { lineApi } from '../../line/api/line.api';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { useSocket } from '../../../hooks/useSocket';
import { ReactionDisplay } from '../../zalo/components/ReactionDisplay';
import { PollVoter } from '../../zalo/components/PollVoter';
import { PollCreateDialog, type PollCreateData } from '../../zalo/components/PollCreateDialog';
import type { ReactionView } from '../../zalo/types/zalo.types';
import { InboxComposer, InboxMessage, InboxMessageList, InboxThreadHeader } from './InboxWorkspace';
import { inboxError, toInboxMessage, type InboxConversationItem, type InboxMessageItem } from '../utils/inbox';

const QUICK_REACTIONS = ['❤️', '😆', '😮', '😭', '😡', '👍'];
const reactionViews = (reactions?: Record<string, string[]> | null): ReactionView[] => Object.entries(reactions || {})
  .filter(([, users]) => users.length).map(([emoji, users]) => ({ emoji, count: users.length, reactedBySelf: users.includes('self') }));

// Mounted with a conversation key: requests and drafts belong to exactly one account/thread.
export function InboxThread({ conversation, onBack, onRead, onChanged, onDeleted }: {
  conversation: InboxConversationItem; onBack: () => void; onRead: (key: string) => void;
  onChanged: () => void; onDeleted: (key: string) => void;
}) {
  const { account, threadId, key } = conversation;
  const isZalo = account.platform === 'ZALO';
  const socket = useSocket();
  const toast = useToast();
  const [messages, setMessages] = useState<InboxMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<InboxMessageItem | null>(null);
  const [reactionDetail, setReactionDetail] = useState<ReactionView[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const sendingRef = useRef(false);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestVersion.current++; }; }, []);

  const loadMessages = useCallback(async (silent = false) => {
    const version = ++requestVersion.current;
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = isZalo ? await zaloApi.getMessages(account.id, threadId, { limit: 100 })
        : await lineApi.listMessages(account.id, threadId, { limit: 100 });
      if (!mounted.current || version !== requestVersion.current) return;
      setMessages((result.items || []).map(toInboxMessage));
      const markRead = isZalo ? zaloApi.markConversationRead(account.id, threadId) : lineApi.markRead(account.id, threadId);
      void markRead.then(() => {
        if (mounted.current && version === requestVersion.current) onReadRef.current(key);
      }).catch(() => {});
    } catch (err) {
      if (mounted.current && version === requestVersion.current) setError(inboxError(err, 'Không tải được tin nhắn.'));
    } finally { if (mounted.current && version === requestVersion.current) setLoading(false); }
  }, [account.id, isZalo, threadId, key]);
  useEffect(() => { void loadMessages(); }, [loadMessages]);
  useEffect(() => {
    const expiry = Date.parse(conversation.replyExpiresAt || '');
    setNow(Date.now());
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(expiry - Date.now() + 50, 2147483647));
    return () => window.clearTimeout(timer);
  }, [conversation.replyExpiresAt]);
  useEffect(() => {
    if (!socket) return;
    const incoming = (event: { accountId: number; threadId?: string; externalThreadId?: string }) => {
      if (event.accountId === account.id && (event.threadId || event.externalThreadId) === threadId) void loadMessages(true);
    };
    const eventName = isZalo ? 'zalo:message' : 'line:message';
    socket.on(eventName, incoming);
    return () => { socket.off(eventName, incoming); };
  }, [socket, isZalo, account.id, threadId, loadMessages]);

  const send = async () => {
    if (!text.trim() || sendingRef.current) return;
    sendingRef.current = true; setSending(true);
    try {
      if (isZalo) await zaloApi.sendMessage(account.id, threadId, text.trim());
      else await lineApi.sendMessage(account.id, threadId, text.trim());
      if (!mounted.current) return;
      setText(''); void loadMessages(true); onChanged();
    } catch (err) { if (mounted.current) toast.error(inboxError(err, 'Không gửi được tin nhắn. Nội dung đã được giữ lại.')); }
    finally { sendingRef.current = false; if (mounted.current) setSending(false); }
  };

  const react = async (emoji: string) => {
    if (!reactionTarget?.providerId) return;
    const target = reactionTarget;
    try {
      const result = await zaloApi.toggleReaction(account.id, target.providerId!, emoji);
      if (mounted.current) { setMessages((items) => items.map((m) => m.id === target.id ? { ...m, reactions: result.reactions } : m)); setReactionTarget(null); }
    } catch (err) { toast.error(inboxError(err, 'Không cập nhật được cảm xúc.')); }
  };
  const createPoll = async (data: PollCreateData) => {
    try { await zaloApi.createPoll(account.id, threadId, data); if (mounted.current) { void loadMessages(true); onChanged(); } }
    catch (err) { toast.error(inboxError(err, 'Không tạo được bình chọn.')); throw err; }
  };
  const votePoll = async (pollId: string, optionIds: number[]) => {
    try { await zaloApi.votePoll(account.id, threadId, pollId, optionIds); if (mounted.current) void loadMessages(true); }
    catch (err) { toast.error(inboxError(err, 'Không gửi được bình chọn.')); throw err; }
  };
  const deleteConversation = async () => {
    if (!window.confirm(`Xóa đoạn chat "${conversation.name}"?`)) return;
    setDeleting(true);
    try { await zaloApi.deleteConversation(account.id, threadId); if (mounted.current) onDeleted(key); }
    catch (err) { toast.error(inboxError(err, 'Không xóa được hội thoại.')); }
    finally { if (mounted.current) setDeleting(false); }
  };
  const freeReply = account.type === 'OA' && !!conversation.replyExpiresAt && new Date(conversation.replyExpiresAt).getTime() > now;

  return <>
    <InboxThreadHeader name={conversation.name} avatar={conversation.avatar} group={conversation.group} platform={isZalo ? 'Zalo' : 'LINE'} accountName={account.name} onBack={onBack}
      actions={<>
        <Button variant="ghost" size="icon-sm" aria-label="Thông tin hội thoại" title="Thông tin hội thoại" onClick={() => setShowInfo(true)}><Info className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Tải lại tin nhắn" title="Tải lại tin nhắn" onClick={() => void loadMessages()}><RefreshCw className="h-4 w-4" /></Button>
      </>} note={freeReply ? <Badge variant="success" size="sm">Có thể phản hồi miễn phí qua LINE OA</Badge> : undefined} />
    <InboxMessageList conversationKey={key} messages={messages} loading={loading} error={error} onRetry={() => void loadMessages()}
      renderMessage={(m) => <InboxMessage isSelf={m.isSelf} senderName={m.senderName || (conversation.group ? m.senderUid : undefined)} timestamp={m.timestamp}
        receipt={m.isSelf ? m.seenAt ? 'Đã xem' : m.deliveredAt ? 'Đã nhận' : m.sentVia === 'reply_token' ? 'Phản hồi miễn phí' : undefined : undefined}
        actions={isZalo && !m.isDeleted && m.providerId && <div className={`mb-1 flex ${m.isSelf ? 'justify-end' : 'justify-start'}`}>
          <Button variant="ghost" size="icon-xs" aria-label="Thả cảm xúc" title="Thả cảm xúc" onClick={() => setReactionTarget(m)}><Smile className="h-3.5 w-3.5" /></Button>
        </div>}
        reactions={isZalo && <ReactionDisplay reactions={reactionViews(m.reactions)} isSelf={m.isSelf} onOpenDetail={() => setReactionDetail(reactionViews(m.reactions))} />}>
        {m.quote && <div className="mb-2 border-l-2 border-current pl-2 text-xs opacity-80"><span className="font-semibold">{m.quote.senderName || 'Người gửi'}</span><p className="whitespace-pre-wrap">{m.quote.content}</p></div>}
        {isZalo && !m.isDeleted && m.contentType === 'poll' && m.poll ? <PollVoter poll={m.poll} isSelf={m.isSelf} onVote={votePoll} />
          : <p className={`whitespace-pre-wrap ${m.isDeleted ? 'italic opacity-60' : ''}`}>{m.isDeleted ? 'Tin nhắn đã bị thu hồi' : m.content}</p>}
      </InboxMessage>} />
    <InboxComposer value={text} onChange={setText} onSend={() => void send()} sending={sending}
      extra={isZalo && <Button variant="ghost" size="icon" aria-label="Tạo bình chọn" title="Tạo bình chọn" onClick={() => setShowPoll(true)}><BarChart3 className="h-4 w-4" /></Button>} />
    <Modal isOpen={showInfo} onClose={() => setShowInfo(false)} title="Thông tin hội thoại" size="sm">
      <dl className="space-y-3 text-sm">
        <div><dt className="text-xs text-text-muted">Tên hội thoại</dt><dd className="break-words font-semibold">{conversation.name}</dd></div>
        <div><dt className="text-xs text-text-muted">Nền tảng</dt><dd>{isZalo ? 'Zalo cá nhân' : account.type === 'OA' ? 'LINE OA' : 'LINE cá nhân'}</dd></div>
        <div><dt className="text-xs text-text-muted">Tài khoản nhận và gửi</dt><dd className="break-words">{account.name}</dd></div>
        <div><dt className="text-xs text-text-muted">Loại hội thoại</dt><dd>{conversation.group ? 'Nhóm' : 'Cá nhân'}</dd></div>
        {conversation.memberCount != null && <div><dt className="text-xs text-text-muted">Thành viên</dt><dd>{conversation.memberCount}</dd></div>}
        {conversation.messageCount != null && <div><dt className="text-xs text-text-muted">Tin nhắn đã lưu</dt><dd>{conversation.messageCount}</dd></div>}
        <div><dt className="text-xs text-text-muted">Mã hội thoại</dt><dd className="break-all">{threadId}</dd></div>
      </dl>
      {isZalo && <Button variant="danger" size="sm" className="mt-4" isLoading={deleting} leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => void deleteConversation()}>Xóa đoạn chat</Button>}
    </Modal>
    <Modal isOpen={!!reactionTarget} onClose={() => setReactionTarget(null)} title="Thả cảm xúc" size="sm">
      <div className="flex flex-wrap justify-center gap-2">{QUICK_REACTIONS.map((emoji) => <Button key={emoji} variant="ghost" size="icon" aria-label={emoji} onClick={() => void react(emoji)}>{emoji}</Button>)}</div>
    </Modal>
    {isZalo && <>
      <PollCreateDialog open={showPoll} onClose={() => setShowPoll(false)} onSubmit={createPoll} />
      <Modal isOpen={!!reactionDetail} onClose={() => setReactionDetail(null)} title="Cảm xúc trên tin nhắn" size="sm">
        <ul className="space-y-2">{reactionDetail?.map((reaction) => <li key={reaction.emoji} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
          <span>{reaction.emoji} {reaction.reactedBySelf ? '· Bạn đã thả cảm xúc' : ''}</span><span>{reaction.count}</span>
        </li>)}</ul>
      </Modal>
    </>}
  </>;
}
