import React, { useRef, useEffect } from 'react';

const QUICK_REACTIONS = ['❤️', '😆', '😮', '😭', '😡', '👍'];

interface ReactionPickerProps {
  isSelf: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ isSelf, onPick, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute -top-10 z-50 flex items-center gap-0.5 bg-white rounded-full shadow-lg border border-gray-100 px-2 py-1 ${
        isSelf ? 'right-0' : 'left-0'
      }`}
      style={{ animation: 'rp-pop 0.15s ease-out' }}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => { onPick(emoji); onClose(); }}
          className="text-lg hover:scale-125 transition-transform px-0.5 leading-none"
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
