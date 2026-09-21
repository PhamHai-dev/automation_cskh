import { useState, useMemo, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Button } from '../ui/Button';

export interface Column<T> {
  header: string | ReactNode;
  accessorKey?: keyof T;
  cell?: (item: T) => ReactNode;
  className?: string;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  pagination?: boolean;
  pageSize?: number;
}

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'Không có dữ liệu hiển thị',
  onRowClick,
  pagination = true,
  pageSize: initialPageSize = 10,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.ceil(data.length / pageSize) || 1;

  const paginatedData = useMemo(() => {
    if (!pagination) return data;
    const start = (currentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, currentPage, pageSize, pagination]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const startRecord = data.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, data.length);

  return (
    <div className="w-full bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
      {/* Table Scrollable Container */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-border/80 bg-surface-muted/60 text-text-secondary">
              {columns.map((col, index) => (
                <th
                  key={index}
                  style={col.width ? { width: col.width } : undefined}
                  className={`px-4 py-3.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              // Skeleton loading rows
              Array.from({ length: pageSize > 5 ? 5 : pageSize }).map((_, rIdx) => (
                <tr key={`skeleton-${rIdx}`} className="animate-pulse">
                  {columns.map((_, cIdx) => (
                    <td key={`skeleton-cell-${cIdx}`} className="px-4 py-4">
                      <div className="h-4 bg-slate-200/70 rounded-md w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-text-muted">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="p-3 bg-surface-muted rounded-full text-text-muted">
                      <Inbox className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((item, rowIndex) => (
                <tr
                  key={rowIndex}
                  onClick={() => onRowClick?.(item)}
                  className={`transition-colors hover:bg-slate-50/80 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {columns.map((col, colIndex) => (
                    <td key={colIndex} className={`px-4 py-3.5 text-text-primary ${col.className || ''}`}>
                      {col.cell
                        ? col.cell(item)
                        : col.accessorKey
                        ? (item[col.accessorKey] as ReactNode)
                        : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination && !isLoading && data.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border/80 bg-surface-muted/30 text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <span>
              Hiển thị <strong className="text-text-primary">{startRecord}</strong> -{' '}
              <strong className="text-text-primary">{endRecord}</strong> trên tổng số{' '}
              <strong className="text-text-primary">{data.length}</strong> bản ghi
            </span>
            <span className="hidden sm:inline text-text-muted">•</span>
            <div className="hidden sm:flex items-center gap-1.5">
              <span>Mỗi trang:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="h-8 w-8 p-0"
              aria-label="Trang trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2 font-medium">
              Trang {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="h-8 w-8 p-0"
              aria-label="Trang sau"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
