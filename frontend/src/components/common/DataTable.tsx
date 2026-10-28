import { useState, useEffect, useMemo, ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { PaginationFooter } from './Pagination';

export interface Column<T> {
  key?: string;
  header: string | ReactNode;
  accessorKey?: keyof T;
  cell?: (item: T, rowIndex: number) => ReactNode;
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
  /** When true, data is one server page; the parent controls page/pageSize/total. */
  serverPagination?: boolean;
  total?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'Không có dữ liệu hiển thị',
  onRowClick,
  pagination = true,
  pageSize: initialPageSize = 25,
  serverPagination = false,
  total,
  page: externalPage = 1,
  onPageChange,
  onPageSizeChange,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Server mode uses externally supplied page/total; otherwise slice locally.
  const currentPageSafe = serverPagination ? externalPage : currentPage;
  const effectivePageSize = serverPagination ? (initialPageSize || pageSize) : pageSize;
  const totalCount = serverPagination ? (total ?? data.length) : data.length;
  const totalPages = Math.ceil(totalCount / effectivePageSize) || 1;

  useEffect(() => {
    if (!serverPagination && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [serverPagination, currentPage, totalPages]);

  const paginatedData = useMemo(() => {
    if (!pagination || serverPagination) return data;
    const start = (currentPageSafe - 1) * effectivePageSize;
    return data.slice(start, start + effectivePageSize);
  }, [data, currentPageSafe, effectivePageSize, pagination, serverPagination]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    if (serverPagination) {
      onPageChange?.(newPage);
    } else {
      setCurrentPage(newPage);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (serverPagination) {
      setPageSize(newSize);
      onPageSizeChange?.(newSize);
      onPageChange?.(1);
    } else {
      setPageSize(newSize);
      setCurrentPage(1);
    }
  };

  const startRecord = totalCount === 0 ? 0 : (currentPageSafe - 1) * effectivePageSize + 1;
  const endRecord = Math.min(currentPageSafe * effectivePageSize, totalCount);

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
                  className={`px-4 py-3.5 text-xs font-bold whitespace-nowrap ${col.className || ''} !text-center`}
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
                  className={`group transition-colors hover:bg-slate-50/80 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {columns.map((col, colIndex) => (
                    <td key={colIndex} className={`px-4 py-3.5 text-text-primary group-hover:bg-slate-50 ${col.className || ''}`}>
                      {col.cell
                        ? col.cell(item, rowIndex)
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
      {pagination && !isLoading && totalCount > 0 && (
        <PaginationFooter
          startRecord={startRecord}
          endRecord={endRecord}
          totalCount={totalCount}
          pageSize={effectivePageSize}
          currentPage={currentPageSafe}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}
