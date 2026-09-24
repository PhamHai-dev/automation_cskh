import React, { useState } from 'react';
import { X } from 'lucide-react';
import { FriendAvatar } from './FriendAvatar';
import type { ReactionView, ReactionDetailUser } from '../types/zalo.types';

interface ReactionDetailPopupProps {
  open: boolean;
  onClose: () => void;
  reactions: ReactionView[];
  // Map emoji → users who reacted with that emoji
  userMap: Record<string, ReactionDetailUser[]>;
  totalUsers: ReactionDetailUser[];
}

export const ReactionDetailPopup: React.FC<ReactionDetailPopupProps> = ({
  open,
  onClose,
  reactions,
  userMap,
  totalUsers,
}) => {
  const [activeTab, setActiveTab] = useState<string>('all');

  if (!open) return null;

  const tabs: { key: string; label: string; count: number }[] = [
    { key: 'all', label: `Tất cả ${totalUsers.length}`, count: totalUsers.length },
    ...reactions.map((r) => ({
      key: r.emoji,
      label: `${r.emoji} ${r.count}`,
      count: r.count,
    })),
  ];

  const displayUsers = activeTab === 'all' ? totalUsers : (userMap[activeTab] || []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-[360px] max-h-[70vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-gray-900">Đã thả cảm xúc</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto shrink-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === t.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto">
          {displayUsers.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">Chưa có ai</div>
          ) : (
            displayUsers.map((u) => (
              <div key={u.uid} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                <FriendAvatar url={u.avatarUrl || null} name={u.name || u.uid} size={32} rounded="rounded-full" />
                <span className="text-sm font-medium text-gray-800 truncate">{u.name || u.uid}</span>
                {activeTab === 'all' && (() => {
                  // Find which emoji this user reacted with
                  const emoji = reactions.find((r) => (userMap[r.emoji] || []).some((x) => x.uid === u.uid))?.emoji;
                  return emoji ? <span className="ml-auto text-base">{emoji}</span> : null;
                })()}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
