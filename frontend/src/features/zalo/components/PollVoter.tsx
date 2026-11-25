import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import type { PollView } from '../types/zalo.types';

interface PollVoterProps {
  poll: PollView;
  isSelf: boolean;
  onVote: (pollId: string, optionIds: number[]) => void | Promise<void>;
}

export const PollVoter: React.FC<PollVoterProps> = ({ poll, isSelf, onVote }) => {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [voted, setVoted] = useState<Set<number>>(new Set(poll.options.filter((o) => o.votedBySelf).map((o) => o.id)));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVoted(new Set(poll.options.filter((o) => o.votedBySelf).map((o) => o.id))); }, [poll]);
  const expired = !!poll.expiresAt && Date.parse(poll.expiresAt) <= Date.now();
  const toggle = (id: number) => {
    if (voted.size || saving || expired) return;
    setSelected((current) => {
      const next = new Set(poll.allowMulti ? current : []);
      if (current.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const vote = async () => {
    if (!selected.size || saving || expired) return;
    setSaving(true);
    try { await onVote(poll.id, [...selected]); setVoted(new Set(selected)); }
    catch { /* The caller reports the error; retain the selection for retry. */ }
    finally { setSaving(false); }
  };
  return <div className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-3 text-text-primary">
    <p className="whitespace-pre-wrap text-sm font-semibold">{poll.question}</p>
    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
      <span>{poll.totalVotes || 0} lượt bình chọn</span>
      {poll.anonymous && <Badge size="sm">Ẩn danh</Badge>}
      {poll.allowMulti && <Badge size="sm">Nhiều lựa chọn</Badge>}
      {expired && <Badge size="sm" variant="warning">Đã hết hạn</Badge>}
      {isSelf && <Badge size="sm">Bạn tạo</Badge>}
    </div>
    <div className="space-y-2">
      {poll.options.map((option) => {
        const chosen = selected.has(option.id) || voted.has(option.id);
        const percent = poll.totalVotes ? Math.min(100, Math.round(option.votes / poll.totalVotes * 100)) : 0;
        return <button key={option.id} type="button" aria-pressed={chosen} disabled={saving || expired || !!voted.size} onClick={() => toggle(option.id)}
          className={`relative flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${chosen ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-surface-muted'}`}>
          <span className="absolute inset-y-0 left-0 bg-primary-soft" style={{ width: `${percent}%` }} />
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border">{chosen && <Check className="h-3 w-3 text-primary" />}</span>
          <span className="relative min-w-0 flex-1 [overflow-wrap:anywhere]">{option.text}</span>
          {!!poll.totalVotes && <span className="relative shrink-0 text-xs text-text-muted">{percent}%</span>}
        </button>;
      })}
    </div>
    {!voted.size && !expired && <Button variant="primary" size="sm" disabled={!selected.size || saving} isLoading={saving} onClick={() => void vote()}>Bình chọn ({selected.size})</Button>}
  </div>;
};
