import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, X, Edit3, Loader2 } from 'lucide-react';

export interface CareOption {
  id: string;
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  dotClass: string;
}

export const CARE_LOG_PRESET_OPTIONS: CareOption[] = [
  {
    id: 'positive',
    label: 'Phản hồi tích cực',
    bgClass: 'bg-emerald-50 hover:bg-emerald-100',
    textClass: 'text-emerald-800',
    borderClass: 'border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  {
    id: 'system_support',
    label: 'Cần hỗ trợ về hệ thống',
    bgClass: 'bg-cyan-50 hover:bg-cyan-100',
    textClass: 'text-cyan-800',
    borderClass: 'border-cyan-200',
    dotClass: 'bg-cyan-500',
  },
  {
    id: 'temp_learn_more',
    label: 'Phản hồi tạm, học thêm rồi báo',
    bgClass: 'bg-blue-50 hover:bg-blue-100',
    textClass: 'text-blue-800',
    borderClass: 'border-blue-200',
    dotClass: 'bg-blue-500',
  },
  {
    id: 'curriculum_support',
    label: 'Cần hỗ trợ về chương trình học',
    bgClass: 'bg-indigo-50 hover:bg-indigo-100',
    textClass: 'text-indigo-800',
    borderClass: 'border-indigo-200',
    dotClass: 'bg-indigo-500',
  },
  {
    id: 'student_weakness',
    label: 'Cần hỗ trợ về điểm yếu của chính học viên',
    bgClass: 'bg-amber-50 hover:bg-amber-100',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-200',
    dotClass: 'bg-amber-500',
  },
  {
    id: 'teacher_support',
    label: 'Cần hỗ trợ về giáo viên',
    bgClass: 'bg-orange-50 hover:bg-orange-100',
    textClass: 'text-orange-800',
    borderClass: 'border-orange-200',
    dotClass: 'bg-orange-500',
  },
  {
    id: 'negative_quit',
    label: 'Phản hồi tiêu cực, muốn dừng',
    bgClass: 'bg-rose-50 hover:bg-rose-100',
    textClass: 'text-rose-800 font-bold',
    borderClass: 'border-rose-300',
    dotClass: 'bg-rose-500',
  },
  {
    id: 'no_response',
    label: 'Chưa phản hồi',
    bgClass: 'bg-slate-100 hover:bg-slate-200',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300',
    dotClass: 'bg-slate-400',
  },
];

interface CareSelectCellProps {
  value?: string | null;
  placeholder?: string;
  onSave: (newVal: string) => Promise<void>;
  className?: string;
}

export const CareSelectCell: React.FC<CareSelectCellProps> = ({
  value,
  placeholder = 'Chọn phản hồi...',
  onSave,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customText, setCustomText] = useState(value || '');
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomText(value || '');
  }, [value]);

  // Handle position calculation for the floating portal popover
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 280,
  });

  const updateCoords = () => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popoverWidth = Math.max(280, rect.width);
    const popoverHeight = 360;

    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    let top = rect.bottom + 4;
    // If popover overflows viewport bottom, show above anchor
    if (top + popoverHeight > window.innerHeight && rect.top > popoverHeight) {
      top = rect.top - popoverHeight - 4;
    }

    setPopoverCoords({
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(popoverWidth),
    });
  };

  const handleOpen = () => {
    updateCoords();
    setIsOpen(true);
    setCustomText(value || '');
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    const handleScrollOrResize = () => {
      updateCoords();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  const handleSelectOption = async (selectedLabel: string) => {
    handleClose();
    if (selectedLabel.trim() === (value || '').trim()) return;

    try {
      setIsSaving(true);
      await onSave(selectedLabel.trim());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch {
      // Revert if error
      setCustomText(value || '');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCommitCustomText = async () => {
    handleClose();
    const trimmed = customText.trim();
    if (trimmed === (value || '').trim()) return;

    try {
      setIsSaving(true);
      await onSave(trimmed);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch {
      setCustomText(value || '');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    handleClose();
    if (!value) return;

    try {
      setIsSaving(true);
      await onSave('');
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch {
      setCustomText(value || '');
    } finally {
      setIsSaving(false);
    }
  };

  // Find matching preset option or fallback
  const matchedOption = CARE_LOG_PRESET_OPTIONS.find(
    (opt) => opt.label.trim().toLowerCase() === value?.trim().toLowerCase()
  );

  return (
    <div className={`relative inline-block w-full max-w-[220px] ${className}`}>
      {/* Closed State Cell: Google Sheets Dropdown Chip */}
      <div
        ref={anchorRef}
        onClick={handleOpen}
        className={`group relative flex items-center justify-between gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer select-none transition-all border shadow-2xs ${
          isOpen
            ? 'ring-2 ring-primary border-primary bg-white z-10'
            : value
            ? matchedOption
              ? `${matchedOption.bgClass} ${matchedOption.textClass} ${matchedOption.borderClass} font-medium hover:shadow-xs`
              : 'bg-slate-50 text-slate-800 border-slate-300 font-medium hover:bg-slate-100 hover:border-slate-400'
            : 'bg-slate-100/70 hover:bg-slate-200/70 text-slate-400 border-slate-200/80 hover:border-slate-300 italic'
        }`}
        title={value || placeholder}
      >
        <div className="flex items-center gap-1.5 truncate">
          {matchedOption && (
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${matchedOption.dotClass}`} />
          )}
          <span className="truncate">{value || placeholder}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {isSaving ? (
            <Loader2 className="w-3 h-3 text-primary animate-spin" />
          ) : justSaved ? (
            <Check className="w-3 h-3 text-emerald-600" />
          ) : (
            <ChevronDown
              className={`w-3 h-3 transition-transform ${
                isOpen ? 'rotate-180 text-primary' : 'text-slate-400 group-hover:text-slate-700'
              }`}
            />
          )}
        </div>
      </div>

      {/* Floating Dropdown Portal */}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${popoverCoords.top}px`,
              left: `${popoverCoords.left}px`,
              minWidth: '290px',
              maxWidth: '340px',
              zIndex: 9999,
            }}
            className="bg-white rounded-xl shadow-2xl border border-slate-200/90 p-2 text-xs flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100 select-none font-sans"
          >
            {/* Top Search / Custom Text Input */}
            <div className="flex items-center gap-1 p-1 bg-surface-muted rounded-lg border-2 border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <input
                ref={inputRef}
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCommitCustomText();
                  } else if (e.key === 'Escape') {
                    handleClose();
                  }
                }}
                placeholder="Nhập hoặc chọn phản hồi..."
                className="w-full bg-transparent text-xs font-semibold text-slate-800 outline-none px-1.5 placeholder:text-slate-400 placeholder:font-normal"
              />
              {customText ? (
                <button
                  type="button"
                  onClick={() => setCustomText('')}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
                  title="Xóa trắng ô tìm kiếm"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleCommitCustomText}
                className="px-2 py-0.5 text-[11px] font-bold bg-primary text-white rounded-md hover:bg-primary/90 transition-colors shrink-0"
                title="Lưu nội dung đã nhập"
              >
                Lưu
              </button>
            </div>

            {/* Presets List matching Google Sheets style */}
            <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto pr-0.5 custom-scrollbar">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 pt-1">
                Danh mục phản hồi gợi ý:
              </div>

              {CARE_LOG_PRESET_OPTIONS.map((opt) => {
                const isSelected = (value || '').trim() === opt.label.trim();
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectOption(opt.label)}
                    className={`group w-full text-left px-2.5 py-1.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                      opt.bgClass
                    } ${opt.borderClass} ${
                      isSelected
                        ? 'ring-2 ring-primary shadow-xs font-bold'
                        : 'hover:scale-[1.01] hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotClass}`} />
                      <span className={`text-xs ${opt.textClass}`}>{opt.label}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Action Footer */}
            <div className="border-t border-slate-100 pt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              {value ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-rose-600 hover:text-rose-800 font-semibold px-1 py-0.5 rounded hover:bg-rose-50 transition-colors"
                >
                  Xóa phản hồi
                </button>
              ) : (
                <span className="text-[10px] text-slate-400 italic">Enter để lưu • Esc để hủy</span>
              )}
              <div className="flex items-center gap-1 text-[10px] text-slate-400 ml-auto">
                <Edit3 className="w-2.5 h-2.5" />
                <span>Hỗ trợ gõ tự do</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
