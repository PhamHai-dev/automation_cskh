import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { PollView } from '../types/zalo.types';

interface PollVoterProps {
  poll: PollView;
  isSelf: boolean;
  onVote: (pollId: string, optionIds: number[]) => void;
}

/**
 * Zalo-style poll vote UI within a chat bubble.
 * Shows question + option bars with progress + vote button.
 */
export const PollVoter: React.FC<PollVoterProps> = ({ poll, isSelf, onVote }) => {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [voted, setVoted] = useState(() =>
    new Set(poll.options.filter((o) => o.votedBySelf).map((o) => o.id))
  );

  const totalVotes = poll.totalVotes || 0;

  const toggleOption = (id: number) => {
    if (voted.size > 0) return; // already voted
    const next = new Set(selected);
    if (poll.allowMulti) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    } else {
      next.clear();
      next.add(id);
    }
    setSelected(next);
  };

  const handleVote = () => {
    if (selected.size === 0) return;
    onVote(poll.id, Array.from(selected));
    setVoted(selected);
  };


  const isExpired = poll.expiresAt && new Date(poll.expiresAt) < new Date();

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isSelf ? 'border-blue-400/30 bg-blue-500/10' : 'border-gray-200 bg-white'
    }`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200/50">
        <p className={`text-sm font-bold ${isSelf ? 'text-white' : 'text-gray-900'}`}>
          📊 {poll.question}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-gray-400">
            {totalVotes} votes
          </span>
          {poll.anonymous && (
            <span className="text-[10px] bg-gray-200/50 text-gray-500 px-1.5 py-0.5 rounded-full">
              Ẩn danh
            </span>
          )}
          {poll.allowMulti && (
            <span className="text-[10px] bg-gray-200/50 text-gray-500 px-1.5 py-0.5 rounded-full">
              Nhiều lựa chọn
            </span>
          )}
          {isExpired && (
            <span className="text-[10px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-medium">
              Đã hết hạn
            </span>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="px-4 py-3 space-y-2">
        {poll.options.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
          const isSelected = selected.has(opt.id);
          const isVotedOpt = voted.has(opt.id);
          const showProgress = voted.size > 0 || totalVotes > 0;

          return (
            <button
              key={opt.id}
              onClick={() => toggleOption(opt.id)}
              disabled={voted.size > 0 || !!isExpired}
              className={`w-full text-left rounded-xl px-3 py-2.5 relative overflow-hidden transition-all ${
                !voted.size && !isExpired
                  ? isSelected
                    ? 'ring-2 ring-blue-500 bg-blue-50'
                    : 'hover:bg-gray-50 border border-gray-200'
                  : isVotedOpt
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-gray-50 border border-gray-200'
              }`}
            >
              {/* Progress bar background */}
              {showProgress && (
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                    isVotedOpt ? 'bg-blue-100' : 'bg-gray-100'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              )}

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Radio / Checkbox indicator */}
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected || isVotedOpt
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {(isSelected || isVotedOpt) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>
                  <span className={`text-xs font-medium ${
                    isVotedOpt ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {opt.text}
                  </span>
                </div>

                {showProgress && (
                  <span className={`text-[10px] font-bold ml-2 ${
                    isVotedOpt ? 'text-blue-600' : 'text-gray-400'
                  }`}>
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Vote button */}
      {voted.size === 0 && !isExpired && (
        <div className="px-4 py-2 border-t border-gray-200/50">
          <button
            onClick={handleVote}
            disabled={selected.size === 0}
            className="w-full py-2 text-xs font-bold text-white bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            Bình chọn ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
};
