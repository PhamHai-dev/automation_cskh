import React, { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { importsApi } from '../api/imports.api';
import { ImportCreateRequest } from '../types/imports.types';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';

const SNAPSHOT_LABELS: Record<string, string> = {
  external_id: 'Mã học viên',
  full_name: 'Họ và tên',
  phone: 'Số điện thoại',
  email: 'Email',
  gender: 'Giới tính',
  date_of_birth: 'Ngày sinh',
  occupation: 'Nghề nghiệp',
  package_code: 'Gói học',
  package_name: 'Gói học',
  program_type: 'Chương trình',
  level: 'Trình độ',
  total_sessions: 'Tổng số buổi',
  remaining_sessions: 'Số buổi còn lại',
  attended_previous_years: 'Số buổi năm trước',
  class_code: 'Mã lớp',
  class_name: 'Tên lớp',
  class_model: 'Mô hình lớp',
  course_content: 'Nội dung khóa học',
  schedule_pattern: 'Lịch học',
  start_time: 'Giờ học',
  teacher_name: 'Giáo viên',
  teacher_code: 'Mã giáo viên',
  cvht_code: 'Mã CSKH',
  sale_name: 'Nhân viên Sale',
  sales_note: 'Ghi chú Sale',
  payment_status: 'Trạng thái thanh toán',
  tuition_fee: 'Học phí',
  paid_at: 'Ngày thanh toán',
  start_date: 'Ngày bắt đầu',
  end_date: 'Ngày kết thúc',
  status: 'Trạng thái học tập',
  student_source_status: 'Nguồn / Tình trạng HV',
  study_report_url: 'Link báo cáo học tập',
  exchange_info: 'Thông tin trao đổi',
  callback_note: 'Ghi chú gọi lại',
  hot_issue_note: 'Vấn đề nóng',
  post_course_care: 'Chăm sóc sau khóa',
  handed_over_at: 'Ngày bàn giao',
  account_created_at: 'Ngày tạo tài khoản',
};

const isSimpleNonEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'object') return false;
  const str = String(value).trim();
  return str.length > 0;
};

export const ImportApprovalQueue: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<ImportCreateRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<ImportCreateRequest | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBusy(true);
      const data = await importsApi.listCreateRequests('PENDING', page, pageSize);
      setItems(data.items || []);
      setTotal(data.total ?? (data.items ? data.items.length : 0));
    } catch {
      toast.error('Không thể tải hàng đợi phê duyệt');
    } finally {
      setBusy(false);
    }
  }, [page, pageSize, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);

  const handleConflict = async (e: any): Promise<boolean> => {
    if (e?.response?.status === 409) {
      toast.error('Yêu cầu đã thay đổi, vui lòng tải lại');
      setSelected(null);
      setReason('');
      await load();
      return true;
    }
    return false;
  };

  const approve = async () => {
    if (!selected) return;
    try {
      setBusy(true);
      await importsApi.approveCreateRequest(selected.id, selected.version, selected.assigned_cs?.id);
      toast.success('Đã duyệt và tạo dữ liệu học viên');
      setSelected(null);
      await load();
    } catch (e: any) {
      if (!(await handleConflict(e))) toast.error(e.response?.data?.message || 'Không thể phê duyệt');
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!selected || !reason.trim()) return;
    try {
      setBusy(true);
      await importsApi.rejectCreateRequest(selected.id, selected.version, reason.trim());
      toast.success('Đã từ chối yêu cầu');
      setSelected(null);
      setReason('');
      await load();
    } catch (e: any) {
      if (!(await handleConflict(e))) toast.error(e.response?.data?.message || 'Không thể từ chối');
    } finally {
      setBusy(false);
    }
  };

  const snapshotEntries = selected
    ? Object.entries(selected.snapshot || {}).filter(
        ([k, v]) => k !== 'attendance' && k !== 'careLogs' && isSimpleNonEmptyValue(v),
      )
    : [];

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Yêu cầu tạo mới chờ duyệt
            </h2>
            <p className="text-xs text-text-muted mt-1">Dữ liệu chưa tồn tại sau đối soát ID + Gói học.</p>
          </div>
          <Button
            id="refresh-approval-queue"
            variant="outline"
            size="sm"
            isLoading={busy}
            onClick={load}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Làm mới
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-muted text-xs">
              <tr>
                <th className="p-3 text-left">ID / Gói học</th>
                <th className="p-3 text-left">Học viên</th>
                <th className="p-3 text-left">Người yêu cầu</th>
                <th className="p-3 text-left">Thời gian tạo</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">
                    {item.external_id}
                    <br />
                    <span className="text-primary">{item.package_code}</span>
                  </td>
                  <td className="p-3">{String(item.snapshot?.full_name || 'Chưa có tên')}</td>
                  <td className="p-3 text-xs">{item.requested_by.name || item.requested_by.email}</td>
                  <td className="p-3 text-xs text-text-secondary whitespace-nowrap">
                    {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '—'}
                  </td>
                  <td className="p-3 text-right">
                    <Button id={`review-request-${item.id}`} size="sm" variant="outline" onClick={() => setSelected(item)}>
                      Xem & duyệt
                    </Button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-text-muted">
                    Không có yêu cầu đang chờ duyệt.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh phân trang chuẩn */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-surface-muted/30 text-xs text-text-secondary">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Hiển thị <strong className="text-text-primary">{startRow}</strong> -{' '}
              <strong className="text-text-primary">{endRow}</strong> /{' '}
              <strong className="text-text-primary">{total}</strong> dòng
            </span>
            <span className="text-text-muted">•</span>
            <label className="flex items-center gap-1.5">
              <span>Mỗi trang:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
              disabled={page <= 1 || busy}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </Button>
            <span className="px-2 font-medium text-text-primary">
              Trang {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || busy}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Sau
            </Button>
          </div>
        </div>
      </Card>
      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title="Phê duyệt yêu cầu tạo mới"
        description={selected ? `${selected.external_id} · ${selected.package_code}` : ''}
        size="lg"
        footer={
          <>
            <Button
              id="reject-create-request"
              variant="danger"
              size="sm"
              disabled={!reason.trim()}
              isLoading={busy}
              onClick={reject}
              leftIcon={<X className="w-4 h-4" />}
            >
              Từ chối
            </Button>
            <Button
              id="approve-create-request"
              size="sm"
              isLoading={busy}
              onClick={approve}
              leftIcon={<Check className="w-4 h-4" />}
            >
              Phê duyệt
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              {snapshotEntries.map(([key, value]) => (
                <div key={key} className="rounded-lg bg-surface-muted p-3">
                  <p className="text-[11px] font-bold text-text-muted">
                    {SNAPSHOT_LABELS[key] || key}
                  </p>
                  <p className="text-sm font-medium text-text-primary break-words mt-0.5">
                    {String(value)}
                  </p>
                </div>
              ))}
              {snapshotEntries.length === 0 && (
                <p className="sm:col-span-2 text-xs text-text-muted italic">
                  Không có thông tin chi tiết.
                </p>
              )}
            </div>
            <label className="block text-xs font-semibold">
              Lý do từ chối
              <textarea
                id="rejection-reason"
                className="mt-1 w-full rounded-xl border border-border p-3 min-h-24"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Chỉ bắt buộc khi từ chối"
              />
            </label>
          </div>
        )}
      </Modal>
    </>
  );
};
