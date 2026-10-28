import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

interface PaginationFooterProps {
  /** 1-based index of the first record on the current page (0 when empty). */
  startRecord: number;
  /** 1-based index of the last record on the current page. */
  endRecord: number;
  totalCount: number;
  pageSize: number;
  /** 1-based current page. */
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  recordLabel?: string;
}

/**
 * Shared pagination footer used by DataTable and custom table pages
 * (Quản lý Ghi danh — AttendanceMatrix, Lớp học & Điểm danh — ClassesPage).
 */
export const PaginationFooter: React.FC<PaginationFooterProps> = ({
  startRecord,
  endRecord,
  totalCount,
  pageSize,
  currentPage,
  totalPages,
  onPageChange,
  onPageSizeChange,
  recordLabel = 'bản ghi',
}) => {
  if (totalCount === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border/80 bg-surface-muted/30 text-xs text-text-secondary">
      <div className="flex items-center gap-2">
        <span>
          Hiển thị <strong className="text-text-primary">{startRecord}</strong> -{' '}
          <strong className="text-text-primary">{endRecord}</strong> trên tổng số{' '}
          <strong className="text-text-primary">{totalCount}</strong> {recordLabel}
        </span>
        <span className="hidden sm:inline text-text-muted">•</span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span>Mỗi trang:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {!PAGE_SIZE_OPTIONS.includes(pageSize) && (
                <option value={pageSize}>{pageSize}</option>
              )}
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
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
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="h-8 w-8 p-0"
          aria-label="Trang sau"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
