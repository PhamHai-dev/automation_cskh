import React, { useEffect, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { importsApi } from '../api/imports.api';
import { ImportCreateRequest } from '../types/imports.types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';

export const ImportApprovalQueue: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<ImportCreateRequest[]>([]);
  const [selected, setSelected] = useState<ImportCreateRequest | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setBusy(true); const data = await importsApi.listCreateRequests('PENDING'); setItems(data.items); } catch { toast.error('Không thể tải hàng đợi phê duyệt'); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, []);
  const approve = async () => { if (!selected) return; try { setBusy(true); await importsApi.approveCreateRequest(selected.id, selected.version, selected.assigned_cs?.id); toast.success('Đã duyệt và tạo dữ liệu học viên'); setSelected(null); await load(); } catch (e: any) { toast.error(e.response?.data?.message || 'Không thể phê duyệt'); } finally { setBusy(false); } };
  const reject = async () => { if (!selected || !reason.trim()) return; try { setBusy(true); await importsApi.rejectCreateRequest(selected.id, selected.version, reason.trim()); toast.success('Đã từ chối yêu cầu'); setSelected(null); setReason(''); await load(); } catch (e: any) { toast.error(e.response?.data?.message || 'Không thể từ chối'); } finally { setBusy(false); } };
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
                <th className="p-3">Phiên bản</th>
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
                  <td className="p-3">{String(item.snapshot.full_name || 'Chưa có tên')}</td>
                  <td className="p-3 text-xs">{item.requested_by.name || item.requested_by.email}</td>
                  <td className="p-3 text-center">
                    <Badge variant="warning">v{item.version}</Badge>
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
              {Object.entries(selected.snapshot)
                .filter(([k]) => k !== 'attendance')
                .map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-surface-muted p-3">
                    <p className="text-[10px] uppercase font-bold text-text-muted">{key}</p>
                    <p className="text-sm break-words">{String(value ?? '—')}</p>
                  </div>
                ))}
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
