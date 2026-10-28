import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { importsApi } from '../api/imports.api';
import { ImportBatchSummary } from '../types/imports.types';
import { Download, RefreshCw, AlertCircle } from 'lucide-react';

export const ImportHistoryTable: React.FC = () => {
  const [batches, setBatches] = useState<ImportBatchSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await importsApi.listBatches(pageSize, (page - 1) * pageSize);
      setBatches(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thể tải danh sách lịch sử import');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void fetchBatches();
  }, [fetchBatches]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge variant="success">Hoàn thành</Badge>;
      case 'PARTIAL_FAILED':
        return <Badge variant="warning">Lỗi một phần</Badge>;
      case 'FAILED':
        return <Badge variant="danger">Thất bại</Badge>;
      case 'PROCESSING':
        return <Badge variant="info">Đang xử lý</Badge>;
      case 'PREVIEW':
        return <Badge variant="neutral">Xem trước</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const getImportTypeBadge = (type: string) => {
    if (type === 'STUDENT_ENROLLMENT') {
      return <Badge variant="info">Sheet 1: Học viên & Gói</Badge>;
    }
    if (type === 'ATTENDANCE') {
      return <Badge variant="neutral">Sheet 3: Điểm danh</Badge>;
    }
    return <Badge variant="neutral">{type}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-bold text-gray-900">
          Lịch sử các đợt Import ({total} đợt)
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchBatches}
          isLoading={loading}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Làm mới
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
            <thead className="bg-gray-50 text-gray-700 font-bold">
              <tr>
                <th className="px-4 py-3">Mã đợt</th>
                <th className="px-4 py-3">Tên file</th>
                <th className="px-4 py-3">Loại import</th>
                <th className="px-4 py-3">Người thực hiện</th>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3 text-center">Tổng</th>
                <th className="px-4 py-3 text-center">Thành công</th>
                <th className="px-4 py-3 text-center">Thất bại</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Báo cáo lỗi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading && batches.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Đang tải danh sách lịch sử...
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    Chưa có đợt import nào trong hệ thống.
                  </td>
                </tr>
              ) : (
                batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3 font-mono font-bold text-gray-800">#{batch.id}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate" title={batch.file_name}>
                      {batch.file_name}
                    </td>
                    <td className="px-4 py-3">{getImportTypeBadge(batch.import_type)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {batch.uploaded_by?.name || batch.uploaded_by?.email}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(batch.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-800">{batch.total_rows}</td>
                    <td className="px-4 py-3 text-center font-bold text-green-600">{batch.success_rows}</td>
                    <td className="px-4 py-3 text-center font-bold text-red-600">{batch.failed_rows}</td>
                    <td className="px-4 py-3">{getStatusBadge(batch.status)}</td>
                    <td className="px-4 py-3 text-right">
                      {batch.failed_rows > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => importsApi.downloadErrors(batch.id, `loi_import_${batch.id}.xlsx`)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                          leftIcon={<Download className="w-3.5 h-3.5" />}
                          title="Tải file Excel các dòng lỗi"
                        >
                          Tải lỗi
                        </Button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh phân trang chuẩn */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50/70 text-xs text-gray-600">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Hiển thị <strong className="text-gray-900">{startRow}</strong> -{' '}
              <strong className="text-gray-900">{endRow}</strong> /{' '}
              <strong className="text-gray-900">{total}</strong> dòng
            </span>
            <span className="text-gray-400">•</span>
            <label className="flex items-center gap-1.5">
              <span>Mỗi trang:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </Button>
            <span className="px-2 font-medium text-gray-800">
              Trang {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Sau
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
