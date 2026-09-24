import React, { useEffect, useState, useCallback } from 'react';
import { zaloApi } from '../api/zalo.api';
import type { ZaloAccount, CreateZaloAccountDTO, ZaloSocketStatusEvent } from '../types/zalo.types';
import { ZALO_STATUS_LABELS, ZALO_STATUS_COLORS } from '../types/zalo.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { QrLoginDialog } from '../components/QrLoginDialog';
import { useSocket } from '../../../hooks/useSocket';
import { Plus, QrCode, Trash2, WifiOff, RefreshCw, Users } from 'lucide-react';

export const ZaloAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [qrAccount, setQrAccount] = useState<ZaloAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ZaloAccount | null>(null);

  // Create form
  const [form, setForm] = useState<CreateZaloAccountDTO>({ cs_id: 0, display_name: '', zalo_phone: '', proxy_url: '' });
  const [formLoading, setFormLoading] = useState(false);

  const fetchAccounts = async () => {
    try {
      const data = await zaloApi.listAccounts();
      setAccounts(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Khong the tai danh sach tai khoan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  // Live: update account status in-place when zalo:status arrives
  const handleStatusEvent = useCallback((evt: ZaloSocketStatusEvent) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === evt.accountId ? { ...a, liveStatus: evt.status as ZaloAccount['liveStatus'] } : a,
      ),
    );
  }, []);

  const { on, off } = useSocket();

  useEffect(() => {
    on('zalo:status', handleStatusEvent);
    return () => { off('zalo:status', handleStatusEvent); };
  }, [on, off, handleStatusEvent]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await zaloApi.createAccount(form);
      setIsCreateOpen(false);
      setForm({ cs_id: 0, display_name: '', zalo_phone: '', proxy_url: '' });
      fetchAccounts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Khong the tao tai khoan');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRefreshGroups = async (account: ZaloAccount) => {
    try {
      const result = await zaloApi.refreshGroups(account.id);
      alert('Da dong bo ' + result.synced + '/' + result.total + ' nhom');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Khong the dong bo nhom');
    }
  };

  const handleDisconnect = async (account: ZaloAccount) => {
    try {
      await zaloApi.disconnect(account.id);
      fetchAccounts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Khong the ngat ket noi');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await zaloApi.removeAccount(deleteTarget.id);
      setDeleteTarget(null);
      fetchAccounts();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Khong the xoa tai khoan');
    }
  };

  const columns: Column<ZaloAccount>[] = [
    {
      header: 'Tai khoan Zalo',
      cell: (item) => (
        <div>
          <div className="font-semibold text-gray-900">{item.display_name || 'Nick #' + item.id}</div>
          <div className="text-gray-500 text-xs">{item.zalo_uid || 'ID: ' + item.id}</div>
        </div>
      ),
    },
    { header: 'CS phu trach', cell: (item) => item.cs?.full_name || 'CS #' + item.cs_id },
    { header: 'So dien thoai', cell: (item) => item.zalo_phone || '—' },
    {
      header: 'Trang thai',
      cell: (item) => {
        const st = item.liveStatus || item.status;
        return (
          <span className={'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' + (ZALO_STATUS_COLORS[st] || 'bg-gray-100 text-gray-600')}>
            {ZALO_STATUS_LABELS[st] || st}
          </span>
        );
      },
    },
    { header: 'Ket noi cuoi', cell: (item) => item.last_connected_at ? new Date(item.last_connected_at).toLocaleString('vi-VN') : '—' },
    {
      header: 'Thao tac',
      className: 'text-right',
      cell: (item) => {
        const st = item.liveStatus || item.status;
        return (
          <div className="flex justify-end gap-1">
            {st !== 'ACTIVE' && (
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setQrAccount(item); }} title="Dang nhap QR">
                <QrCode className="w-3.5 h-3.5" />
              </Button>
            )}
            {st === 'ACTIVE' && (
              <>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleRefreshGroups(item); }} title="Dong bo nhom">
                  <Users className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDisconnect(item); }} title="Ngat ket noi">
                  <WifiOff className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }} title="Xoa tai khoan">
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </Button>
          </div>
        );
      },
    },
  ];

  const active = accounts.filter((a) => (a.liveStatus || a.status) === 'ACTIVE').length;
  const qrPending = accounts.filter((a) => (a.liveStatus || a.status) === 'QR_PENDING').length;
  const broken = accounts.filter((a) => ['EXPIRED', 'ERROR', 'BANNED'].includes(a.liveStatus || a.status)).length;

  return (
    <PageContainer>
      <PageHeader
        title="Quan ly Tai khoan Zalo"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => fetchAccounts()} variant="outline" className="flex items-center gap-2">
              <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />
              Lam moi
            </Button>
            <Button onClick={() => setIsCreateOpen(true)} variant="primary" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Them tai khoan Zalo
            </Button>
          </div>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Tong so', value: accounts.length, cls: 'bg-blue-50 text-blue-700' },
          { label: 'Dang ket noi', value: active, cls: 'bg-emerald-50 text-emerald-700' },
          { label: 'Dang quet QR', value: qrPending, cls: 'bg-yellow-50 text-yellow-700' },
          { label: 'Het han / Loi', value: broken, cls: 'bg-red-50 text-red-700' },
        ].map((s) => (
          <div key={s.label} className={'rounded-xl p-3 ' + s.cls}>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs font-medium opacity-75">{s.label}</div>
          </div>
        ))}
      </div>

      <DataTable columns={columns} data={accounts} isLoading={loading} emptyMessage="Chua co tai khoan Zalo nao." />

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">Them Tai khoan Zalo Moi</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <Input label="CS phu trach (User ID) *" type="number" required value={form.cs_id || ''} onChange={(e) => setForm({ ...form, cs_id: parseInt(e.target.value) || 0 })} placeholder="ID nhan vien CS" />
              <Input label="Ten hien thi" value={form.display_name || ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="VD: Nick CS An" />
              <Input label="So dien thoai Zalo" value={form.zalo_phone || ''} onChange={(e) => setForm({ ...form, zalo_phone: e.target.value })} placeholder="0901234567" />
              <Input label="Proxy URL (tuy chon)" value={form.proxy_url || ''} onChange={(e) => setForm({ ...form, proxy_url: e.target.value })} placeholder="http://proxy:port" />
              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button variant="outline" type="button" onClick={() => setIsCreateOpen(false)}>Huy</Button>
                <Button variant="primary" type="submit" isLoading={formLoading}>Tao tai khoan</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Login Dialog */}
      {qrAccount && <QrLoginDialog account={qrAccount} onClose={() => setQrAccount(null)} onSuccess={() => { setQrAccount(null); fetchAccounts(); }} />}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="w-6 h-6 text-red-500" /></div>
              <h3 className="text-base font-bold text-gray-900 mb-2">Xoa tai khoan Zalo?</h3>
              <p className="text-sm text-gray-500">Tai khoan <strong>{deleteTarget.display_name || '#' + deleteTarget.id}</strong> se bi xoa vinh vien.</p>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Huy</Button>
              <Button variant="danger" onClick={handleDelete}>Xoa tai khoan</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
