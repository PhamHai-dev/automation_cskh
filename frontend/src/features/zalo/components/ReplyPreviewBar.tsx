import React from 'react';
import { Reply, X } from 'lucide-react';
import type { QuoteRef } from '../types/zalo.types';

interface ReplyPreviewBarProps {
  quote: QuoteRef;
  onCancel: () => void;
}

/**
 * Reply preview bar shown above the chat input when replying to a message.
 * Shows sender name + truncated content preview + cancel button.
 */
export const ReplyPreviewBar: React.FC<ReplyPreviewBarProps> = ({ quote, onCancel }) => {
  const maxContentLen = 80;
  const preview = quote.content
    ? quote.content.length > maxContentLen
      ? quote.content.slice(0, maxContentLen) + '…'
      : quote.content
    : '';

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-l-[3px] border-l-blue-500 rounded-lg mb-2 animate-slideIn">
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-primary">
          <Reply className="h-4 w-4" /><span>Trả lời {quote.senderName || 'Không rõ người gửi'}</span>
        </p>
        {preview && (
          <p title={quote.content || ''} className="text-xs text-text-secondary truncate mt-0.5">{preview}</p>
        )}
      </div>
      <button
        onClick={onCancel}
        className="p-1 rounded-full hover:bg-blue-100 text-text-muted hover:text-text-secondary transition-colors shrink-0"
        title="Hủy trả lời"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
