import React, { useState } from 'react';
import { X, Plus, Trash2, BarChart3 } from 'lucide-react';

interface PollCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PollCreateData) => void;
}

export interface PollCreateData {
  question: string;
  options: string[];
  allowMulti: boolean;
  anonymous: boolean;
  expireMs?: number;
}

export const PollCreateDialog: React.FC<PollCreateDialogProps> = ({ open, onClose, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMulti, setAllowMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [expireMs, setExpireMs] = useState<number | undefined>(undefined);

  if (!open) return null;

  const updateOption = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  const addOption = () => {
    if (options.length < 10) setOptions([...options, '']);
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    const trimmed = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || trimmed.length < 2) return;
    onSubmit({ question: question.trim(), options: trimmed, allowMulti, anonymous, expireMs });
    setQuestion('');
    setOptions(['', '']);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[420px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-bold text-gray-900">Tạo bình chọn</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Question */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Câu hỏi</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Bạn muốn hỏi điều gì?"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Options */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">Lựa chọn</label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-5 text-center">{idx + 1}.</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    placeholder={`Lựa chọn ${idx + 1}`}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-1 focus:ring-blue-500"
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(idx)}
                      className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button
                onClick={addOption}
                className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm lựa chọn
              </button>
            )}
          </div>

          {/* Options toggles */}
          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowMulti}
                onChange={(e) => setAllowMulti(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-700">Cho phép nhiều lựa chọn</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-700">Bình chọn ẩn danh</span>
            </label>
          </div>

          {/* Expiry */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Thời hạn (tùy chọn)</label>
            <select
              value={expireMs ?? ''}
              onChange={(e) => setExpireMs(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Không giới hạn</option>
              <option value={3600000}>1 giờ</option>
              <option value={21600000}>6 giờ</option>
              <option value={43200000}>12 giờ</option>
              <option value={86400000}>1 ngày</option>
              <option value={259200000}>3 ngày</option>
              <option value={604800000}>7 ngày</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={!question.trim() || options.filter((o) => o.trim()).length < 2}
            className="px-5 py-2 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            Tạo bình chọn
          </button>
        </div>
      </div>
    </div>
  );
};
