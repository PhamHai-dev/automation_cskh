import React from 'react';
import { FriendAvatar } from './FriendAvatar';

export interface MentionUser {
  uid: string;
  name: string;
  avatarUrl?: string | null;
  roleLabel?: string;
}

interface MentionPopoverProps {
  user: MentionUser;
  anchorRect?: DOMRect | null;
  onClose?: () => void;
}

/**
 * Popover shown when hovering a @mention tag in a message.
 * Displays avatar + name + role.
 */
export const MentionPopover: React.FC<MentionPopoverProps> = ({ user }) => {
  return (
    <div className="absolute z-40 bottom-full left-0 mb-1 bg-white rounded-xl shadow-xl border border-gray-100 p-3 flex items-center gap-3 min-w-[180px] animate-fadeIn">
      <FriendAvatar url={user.avatarUrl || null} name={user.name} size={36} rounded="rounded-full" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
        {user.roleLabel && <p className="text-[11px] text-gray-400">{user.roleLabel}</p>}
        <p className="text-[10px] text-gray-400 font-mono truncate">{user.uid}</p>
      </div>
    </div>
  );
};

/** Inline highlighted @mention span rendered inside message content */
export const MentionTag: React.FC<{ name: string; onHover?: (hovering: boolean) => void }> = ({ name }) => {
  return (
    <span className="inline-flex items-center bg-blue-50 text-blue-600 rounded px-1 py-0 text-xs font-medium border border-blue-100">
      @{name}
    </span>
  );
};
