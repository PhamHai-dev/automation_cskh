import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import '../styles/data-management.css';

export function DataGroups<T extends string>({ items, value, onChange, label }: {
  items: { value: T; label: string; count: number; icon?: ReactNode; tone?: string }[];
  value: T; onChange: (value: T) => void; label: string;
}) {
  const id = useId();
  return <div className="data-groups" role="group" aria-label={label}>
    {items.map(item => <button data-tone={item.tone} id={`${id}-${item.value}`} key={item.value} type="button" aria-pressed={value === item.value} onClick={() => onChange(item.value)}>
      {item.icon}{item.label}<span className="data-count">{item.count}</span>
    </button>)}
  </div>;
}

export function DataFilters({ search, onSearch, placeholder, program, onProgram, status, onStatus, children, activeCount, onReset }: {
  search: string; onSearch: (value: string) => void; placeholder: string;
  program: string; onProgram: (value: string) => void; status: string; onStatus: (value: string) => void;
  children: ReactNode; activeCount: number; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="data-toolbar">
    <input id={`${id}-search`} className="data-search" type="search" aria-label="Tìm kiếm nguồn dữ liệu" value={search} onChange={e => onSearch(e.target.value)} placeholder={placeholder} />
    <select id={`${id}-program`} aria-label="Chương trình" value={program} onChange={e => onProgram(e.target.value)}>
      <option value="ALL">Chương trình: Tất cả</option><option value="JLPT">JLPT</option><option value="KAIWA">KAIWA</option>
    </select>
    <select id={`${id}-status`} aria-label="Trạng thái" value={status} onChange={e => onStatus(e.target.value)}>
      <option value="ALL">Trạng thái: Tất cả</option><option value="SUCCESS">Thành công</option><option value="FAILED">Có lỗi / Cảnh báo</option><option value="IDLE">Chưa chạy</option>
    </select>
    <Button id={`${id}-toggle`} size="sm" variant="outline" aria-expanded={open} aria-controls={`${id}-extra`} onClick={() => setOpen(!open)} leftIcon={<SlidersHorizontal className="w-4 h-4" />}>Bộ lọc{activeCount > 0 ? ` (${activeCount})` : ''}</Button>
    {(search || program !== 'ALL' || status !== 'ALL' || activeCount > 0) && <Button id={`${id}-reset`} size="sm" variant="ghost" onClick={onReset}>Xóa bộ lọc</Button>}
    <div id={`${id}-extra`} className={open ? 'data-more-filters' : 'hidden'}>{children}</div>
  </div>;
}

export interface DataMenuAction { label: string; icon?: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; }
/** Portalled menu avoids clipping inside the horizontally scrolling data table. */
export function DataRowMenu({ label, actions }: { label: string; actions: DataMenuAction[] }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const close = (event: Event) => {
      if (event.type === 'mousedown' && (menu.current?.contains(event.target as Node) || trigger.current?.contains(event.target as Node))) return;
      if (event.type === 'scroll' && menu.current?.contains(event.target as Node)) return;
      setPosition(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPosition(null); trigger.current?.focus(); }
      if (event.key === 'Tab') {
        // Restore the logical tab origin before removing the portalled menu.
        trigger.current?.focus();
        setPosition(null);
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
        if (!buttons.length) return;
        event.preventDefault();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [position]);
  return <>
    <Button ref={trigger} id={`${id}-trigger`} size="sm" variant="ghost" aria-label={`Thao tác khác: ${label}`} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position ? `${id}-menu` : undefined} onClick={() => {
      if (position) return setPosition(null);
      const rect = trigger.current!.getBoundingClientRect();
      const height = actions.length * 40 + 16;
      setPosition({ left: Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232)), top: Math.max(8, rect.bottom + height > window.innerHeight ? rect.top - height : rect.bottom + 4) });
    }}><MoreHorizontal className="w-4 h-4" /></Button>
    {position && createPortal(<div id={`${id}-menu`} ref={menu} className="data-menu" role="menu" aria-label={`Thao tác: ${label}`} style={{ ...position, maxHeight: `calc(100dvh - ${position.top + 8}px)`, overflowY: 'auto' }}>
      {actions.map((action, index) => <button id={`${id}-action-${index}`} key={action.label} role="menuitem" type="button" disabled={action.disabled} data-danger={action.danger} onClick={() => { setPosition(null); trigger.current?.focus(); action.onClick(); }}>{action.icon}{action.label}</button>)}
    </div>, document.body)}
  </>;
}
