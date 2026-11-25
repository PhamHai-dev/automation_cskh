import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AttendanceStatus } from '../types/classes.types';
import { ATTENDANCE_CODE_CONFIG } from './AttendanceCellBadge';
import './attendance-status.css';

export interface AttendanceStatusDropdownOption {
  status: AttendanceStatus;
  label: string;
}

export const ATTENDANCE_DROPDOWN_OPTIONS: AttendanceStatusDropdownOption[] =
  Object.entries(ATTENDANCE_CODE_CONFIG).map(([status, config]) => ({
    status: status as AttendanceStatus,
    label: `${config.short} · ${config.label}`,
  }));

interface AttendanceStatusDropdownProps {
  id: string;
  value?: AttendanceStatus | null;
  options?: AttendanceStatusDropdownOption[];
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
  emptyLabel?: '-' | '+';
  triggerClassName?: string;
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
  options = ATTENDANCE_DROPDOWN_OPTIONS,
  disabled = false,
  ariaLabel,
  title,
  emptyLabel = '-',
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
    const width = Math.min(Math.max(rect.width, 164), window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    const height = Math.min(288, window.innerHeight - 16);
    const top = rect.bottom + 6 + height <= window.innerHeight - 8
      ? rect.bottom + 6
      : Math.max(8, rect.top - height - 6);
    setMenuPosition({ top, left, width });
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
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
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
    if (disabled || nextValue === (value ?? null)) return;
    triggerRef.current?.focus();
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
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu();
            requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
          }
        }}
        className={triggerClassName || `attendance-status-trigger ${value
          ? `${ATTENDANCE_CODE_CONFIG[value].solidBg} ${ATTENDANCE_CODE_CONFIG[value].solidText} ${ATTENDANCE_CODE_CONFIG[value].solidBorder}`
          : 'attendance-status-trigger--empty'}`}
      >
        <span>{selectedOption?.label ?? emptyLabel}</span>
      </button>

      {isOpen && menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-label={ariaLabel}
            style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, zIndex: 9999 }}
            className="attendance-status-menu rounded-xl border border-border bg-surface p-1.5 text-xs shadow-xl"
          >
            {options.map((option) => {
              const isSelected = option.status === value;
              const config = ATTENDANCE_CODE_CONFIG[option.status];
              return (
                <button
                  key={option.status}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => chooseValue(option.status)}
                  className={`attendance-status-option ${config.solidBg} ${config.solidText} ${config.solidBorder} ${isSelected ? 'attendance-status-option--selected' : ''}`}
                >
                  <span>{option.label}</span>
                </button>
              );
            })}
            <div className="my-1 border-t border-slate-200" />
            <button
              type="button"
              role="option"
              aria-selected={!value}
              title="Chưa điểm danh / chưa tạo ca — chọn để xóa ca điểm danh của bạn"
              aria-label="- · Chưa điểm danh / chưa tạo ca"
              onClick={() => chooseValue(null)}
              className={`attendance-status-option attendance-status-option--unmarked ${!value ? 'attendance-status-option--selected' : ''}`}
            >
              <span>-</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
};
