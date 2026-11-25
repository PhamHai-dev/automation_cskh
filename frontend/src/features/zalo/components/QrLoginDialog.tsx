import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Check } from 'lucide-react';
import React, { useState, useCallback } from 'react';
import type { ZaloAccount, ZaloSocketStatusEvent, ZaloSocketQrEvent } from '../types/zalo.types';
import { zaloApi } from '../api/zalo.api';
import { useZaloAccountSocket } from '../../../hooks/useSocket';

/** Ensure QR image string has proper data URI prefix for browser <img> src. */
function normalizeQrDataUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith('data:image')) return raw;
  if (/^[A-Za-z0-9+/=]/.test(raw)) return `data:image/png;base64,${raw}`;
  return raw;
}

interface QrLoginDialogProps {
  account: ZaloAccount;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * QrLoginDialog — Socket.IO driven QR login.
 * Subscribes to zalo:qr + zalo:status events; no HTTP polling.
 */
export const QrLoginDialog: React.FC<QrLoginDialogProps> = ({ account, onClose, onSuccess }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(normalizeQrDataUrl(account.qr_code));
  const [loading, setLoading] = useState(!account.qr_code);
  const [error, setError] = useState('');
  const [scanStatus, setScanStatus] = useState<'waiting' | 'scanned' | 'success' | 'expired'>('waiting');

  const { on, off } = useZaloAccountSocket(account.id);

  // Socket listeners: zalo:qr, zalo:status
  const handleQrEvent = useCallback((data: ZaloSocketQrEvent) => {
    if (data.accountId !== account.id) return;
    setQrDataUrl(normalizeQrDataUrl(data.qrDataUrl));
    setScanStatus('waiting');
    setLoading(false);
  }, [account.id]);

  const handleStatusEvent = useCallback((data: ZaloSocketStatusEvent) => {
    if (data.accountId !== account.id) return;
    if (data.status === 'ACTIVE') {
      setScanStatus('success');
      onSuccess();
    } else if (data.status === 'EXPIRED') {
      setScanStatus('expired');
    } else if (data.status === 'QR_PENDING') {
      setScanStatus('waiting');
    }
  }, [account.id, onSuccess]);

  React.useEffect(() => {
    on('zalo:qr', handleQrEvent);
    on('zalo:status', handleStatusEvent);
    return () => {
      off('zalo:qr', handleQrEvent);
      off('zalo:status', handleStatusEvent);
    };
  }, [on, off, handleQrEvent, handleStatusEvent]);

  // Generate QR on mount
  React.useEffect(() => {
    if (qrDataUrl) return;
    generateQr();
  }, []);

  const generateQr = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await zaloApi.generateQr(account.id);
      setQrDataUrl(normalizeQrDataUrl(result.qrDataUrl));
      setScanStatus('waiting');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Không thể tạo mã QR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="sm" title={'Đăng nhập Zalo'} description={account.display_name || `Tài khoản #${account.id}`} footer={<div className="flex w-full flex-wrap items-center justify-between gap-2"><span className="text-xs text-text-secondary">Zalo · {account.display_name || `#${account.id}`}</span><Button variant="outline" onClick={onClose}>{scanStatus === 'success' ? 'Đóng' : 'Hủy'}</Button></div>}>

      <div className="flex min-w-0 flex-col items-center">
        {error && (
          <div className="w-full bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {scanStatus === 'success' ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-success" aria-hidden="true" />
            </div>
            <p className="text-lg font-semibold text-text-primary">Đăng nhập thành công!</p>
            <p className="text-sm text-text-muted mt-1">Tài khoản Zalo đã được kết nối</p>
          </div>
        ) : (
          <>
            {/* QR Code Area */}
            <div className="w-56 h-56 bg-surface-subtle rounded-xl border-2 border-dashed border-border flex items-center justify-center mb-4 relative overflow-hidden">
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-text-muted">Đang tạo mã QR...</span>
                </div>
              ) : qrDataUrl ? (
                <>
                  <img
                    src={qrDataUrl}
                    alt="QR Code Zalo"
                    className="w-full h-full object-contain p-2"
                  />
                  {scanStatus === 'expired' && (
                    <div className="absolute inset-0 bg-surface/80 flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-sm font-medium text-orange-600">QR đã hết hạn</p>
                        <button
                          onClick={generateQr}
                          className="mt-2 text-sm text-blue-600 hover:underline font-medium"
                        >
                          Tạo QR mới
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <span className="text-sm text-text-muted">Chưa có mã QR</span>
              )}
            </div>

            {/* Instructions */}
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-text-secondary">
                {scanStatus === 'waiting'
                  ? 'Quét mã QR bằng ứng dụng Zalo trên điện thoại'
                  : scanStatus === 'expired'
                    ? 'Mã QR đã hết hạn. Vui lòng tạo mã mới.'
                    : ''}
              </p>
              <ol className="text-xs text-text-muted space-y-1 text-left max-w-xs mx-auto">
                <li className="flex gap-2">
                  <span className="shrink-0 font-semibold text-text-secondary">1.</span>
                  <span>Mở ứng dụng Zalo trên điện thoại</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 font-semibold text-text-secondary">2.</span>
                  <span>Nhấn <strong>Quét QR</strong> hoặc vào <strong>Cài đặt &rarr; Zalo QR</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 font-semibold text-text-secondary">3.</span>
                  <span>Quét mã QR hiển thị trên màn hình</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 font-semibold text-text-secondary">4.</span>
                  <span>Xác nhận đăng nhập trên điện thoại</span>
                </li>
              </ol>
            </div>

            {/* Refresh button */}
            {scanStatus === 'expired' && (
              <button
                onClick={generateQr}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Tạo mã QR mới
              </button>
            )}
          </>
        )}
      </div>

    </Modal>
  );
};
