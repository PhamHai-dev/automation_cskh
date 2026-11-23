import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { AttendanceStatus } from '../types/classes.types';

export interface AttendanceStatusDropdownOption {
  status: AttendanceStatus;
  label: string;
}

interface AttendanceStatusDropdownProps {
  id: string;
  value?: AttendanceStatus | null;
  options: AttendanceStatusDropdownOption[];
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
  triggerClassName: string;
  onChange: (value: AttendanceStatus | null) => void | Promise<void>;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

export const AttendanceStatusDropdown: React.FC<AttendanceStatusDropdownProps> = ({
  id,
  value,
  options,
  disabled = false,
  ariaLabel,
  title,
  triggerClassName,
  onChange,
}) => {
  const reactId = useId();
  const menuId = `${id}-menu-${reactId.replace(/:/g, '')}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const selectedOption = options.find((option) => option.status === value);

  const openMenu = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = rect.width;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    setMenuPosition({ top: rect.bottom + 6, left, width });
    setIsOpen(true);
  };

  const closeMenu = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
      }
    };
    const handleViewportChange = () => closeMenu();
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen]);

  const chooseValue = (nextValue: AttendanceStatus | null) => {
    closeMenu();
    if (nextValue === (value ?? null)) return;
    void onChange(nextValue);
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        title={title}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        className={`${triggerClassName} inline-flex items-center justify-between gap-2`}
      >
        <span className="truncate">{selectedOption?.label ?? '–'}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-label={ariaLabel}
            style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, zIndex: 9999 }}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-xl"
          >
            {options.map((option) => {
              const isSelected = option.status === value;
              return (
                <button
                  key={option.status}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => chooseValue(option.status)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${isSelected ? 'bg-slate-100 font-bold text-slate-900' : ''}`}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              );
            })}
            <div className="my-1 border-t border-slate-200" />
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => chooseValue(null)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${!value ? 'bg-slate-100 font-bold text-slate-900' : ''}`}
            >
              <span>–</span>
              {!value && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          </div>,
          document.body
        )}
    </>
  );
};
