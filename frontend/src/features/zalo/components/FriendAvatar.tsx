import React, { useState } from 'react';

interface FriendAvatarProps {
  /** Zalo avatar URL (hotlinked Zalo CDN — bypass referrer). */
  url?: string | null;
  /** Display name for the initials fallback. */
  name?: string;
  /** Square size in px (default 40). */
  size?: number;
  /** Extra Tailwind classes. */
  className?: string;
  /** Border radius (default rounded-full). */
  rounded?: string;
}

/** Deterministic hue from a string — same name always gives same gradient. */
function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

const GRADIENTS = [
  'from-blue-400 to-purple-500',
  'from-emerald-400 to-cyan-500',
  'from-rose-400 to-orange-500',
  'from-amber-400 to-red-500',
  'from-indigo-400 to-blue-500',
  'from-fuchsia-400 to-pink-500',
];

export const FriendAvatar: React.FC<FriendAvatarProps> = ({
  url,
  name,
  size = 40,
  className = '',
  rounded = 'rounded-full',
}) => {
  const [failed, setFailed] = useState(false);
  const showImg = !!url && !failed;

  if (!showImg) {
    const initials = (name || '?').trim().slice(0, 2).toUpperCase();
    const g = GRADIENTS[hashHue(name || '?') % GRADIENTS.length];
    return (
      <div
        aria-hidden
        className={`${rounded} ${g} bg-gradient-to-br shrink-0 flex items-center justify-center text-white font-bold select-none ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={url!}
      alt={name || ''}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${rounded} object-cover shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
