import React from 'react';
import type { ReactionView } from '../types/zalo.types';

interface ReactionDisplayProps {
  reactions: ReactionView[];
  isSelf: boolean;
  onOpenDetail?: () => void;
}

/**
 * Zalo-native reaction pill below a message.
 * Renders stacked emoji icons + total count.
 * Self messages → right-aligned; received → left-aligned.
 */
export const ReactionDisplay: React.FC<ReactionDisplayProps> = ({ reactions, isSelf, onOpenDetail }) => {
  if (!reactions || reactions.length === 0) return null;

  const totalCount = reactions.reduce((sum, r) => sum + r.count, 0);

  return (
    <div
      className={`flex items-center mt-1 ${isSelf ? 'justify-end' : 'justify-start'}`}
    >
      <button
        onClick={onOpenDetail}
        className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-xs hover:bg-gray-50 transition-colors shadow-sm"
        title={`${totalCount} reactions`}
      >
        {/* Stacked emoji icons */}
        <span className="flex -space-x-1">
          {reactions.slice(0, 3).map((r, i) => (
            <span
              key={`${r.emoji}-${i}`}
              className="text-sm leading-none"
            >
              {r.emoji}
            </span>
          ))}
        </span>
        {/* Total count */}
        <span className="text-[10px] text-gray-500 font-medium ml-0.5">
          {totalCount}
        </span>
        {/* Self indicator */}
        {reactions.some((r) => r.reactedBySelf) && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5" />
        )}
      </button>
    </div>
  );
};
