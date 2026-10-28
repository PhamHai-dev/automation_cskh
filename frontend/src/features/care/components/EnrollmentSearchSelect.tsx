import React, { useEffect, useMemo, useRef, useState } from 'react';
import { enrollmentsApi } from '../../enrollments/api/enrollments.api';
import { Enrollment } from '../../enrollments/types/enrollments.types';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useQuery } from '../../../hooks/useQuery';
import { Search, X } from 'lucide-react';

interface EnrollmentSearchSelectProps {
  value: number | null;
  onChange: (id: number | null, enrollment: Enrollment | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Label shown when `value` is set but the enrollment is not in the loaded list (e.g. role-scoped). */
  fallbackLabel?: string;
}

const normalizeStaffLabel = (enr: Enrollment): string => {
  const name = enr.student?.full_name || `HV #${enr.student_id}`;
  const code = enr.student?.external_id || enr.external_id || `GĐ_${enr.id}`;
  const pkg = enr.package?.name || enr.package?.code || 'Gói chưa rõ';
  return `${name} · ${code} · ${pkg}`;
};

export const EnrollmentSearchSelect: React.FC<EnrollmentSearchSelectProps> = ({
  value,
  onChange,
  placeholder = 'Tìm theo tên học viên, mã HV...',
  disabled = false,
  fallbackLabel,
}) => {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [cachedSelected, setCachedSelected] = useState<Enrollment | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    data: paginatedResult,
    isLoading: loading,
    isFetching,
    error: loadError,
  } = useQuery({
    queryKey: ['enrollments', 'search-select', { search: debouncedQuery, page: 1, pageSize: 50 }],
    queryFn: (signal) =>
      enrollmentsApi.listPaginated(
        { search: debouncedQuery || undefined, page: 1, pageSize: 50 },
        signal
      ),
    staleTime: 30 * 1000,
    keepPreviousData: true,
    enabled: !disabled,
  });

  const enrollments = useMemo(() => paginatedResult?.data || [], [paginatedResult]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const byId = useMemo(() => {
    const map = new Map<number, Enrollment>();
    if (cachedSelected) {
      map.set(cachedSelected.id, cachedSelected);
    }
    enrollments.forEach((e) => map.set(e.id, e));
    return map;
  }, [enrollments, cachedSelected]);

  const selectedEnrollment = value != null ? byId.get(value) || null : null;
  const selectedLabel =
    value == null
      ? ''
      : selectedEnrollment
        ? normalizeStaffLabel(selectedEnrollment)
        : fallbackLabel || `Ghi danh #${value}`;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enrollments.slice(0, 50);
    return enrollments
      .filter((e) => {
        const haystack = [
          e.student?.full_name,
          e.student?.external_id,
          e.external_id,
          String(e.id),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 50);
  }, [enrollments, query]);

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  const handleSelect = (enr: Enrollment) => {
    setCachedSelected(enr);
    onChange(enr.id, enr);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    setCachedSelected(null);
    onChange(null, null);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[highlighted]) {
        e.preventDefault();
        handleSelect(filtered[highlighted]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={open && !disabled ? query : selectedLabel}
          onChange={(e) => {
            if (disabled) return;
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-16 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
        />
        {value != null && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
            title="Xóa lựa chọn"
          >
            <X className="w-3 h-3" />
            Xóa chọn
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-3 text-xs text-slate-400">Đang tải danh sách ghi danh...</div>
            ) : loadError ? (
              <div className="px-3 py-3 text-xs text-rose-500">
                Không tải được danh sách ghi danh. (Bạn cần quyền ADMIN/MANAGE/CS)
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400">
                {isFetching ? 'Đang tìm kiếm học viên...' : 'Không tìm thấy học viên / ghi danh phù hợp.'}
              </div>
            ) : (
              filtered.map((enr, idx) => (
                <button
                  key={enr.id}
                  type="button"
                  onClick={() => handleSelect(enr)}
                  onMouseEnter={() => setHighlighted(idx)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer ${
                    idx === highlighted ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                  } ${enr.id === value ? 'font-bold' : ''}`}
                >
                  <span className="truncate">{normalizeStaffLabel(enr)}</span>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">#{enr.id}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
