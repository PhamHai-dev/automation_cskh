import React, { useState } from 'react';
import type { ZaloAccount } from '../types/zalo.types';
import { zaloApi } from '../api/zalo.api';

interface QrLoginDialogProps {
  account: ZaloAccount;
  onClose: () => void;
  onSuccess: () => void;
}

export const QrLoginDialog: React.FC<QrLoginDialogProps> = ({ account, onClose, onSuccess }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(account.qr_code || null);
  const [loading, setLoading] = useState(!account.qr_code);
  const [error, setError] = useState('');
  const [scanStatus, setScanStatus] = useState<'waiting' | 'scanned' | 'success' | 'expired'>('waiting');
  const [pollTimer, setPollTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  // Generate QR on mount
  React.useEffect(() => {
    if (qrDataUrl) return; // already have QR
    generateQr();
    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  const generateQr = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await zaloApi.generateQr(account.id);
      setQrDataUrl(result.qrDataUrl);
      setScanStatus('waiting');
      // Start polling for scan status
      startPolling(account.id);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Không thể tạo mã QR');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (accountId: number) => {
    const timer = setInterval(async () => {
      try {
        const status = await zaloApi.getStatus(accountId);
        if (status.liveStatus === 'ACTIVE') {
          clearInterval(timer);
          setScanStatus('success');
          onSuccess();
        } else if (status.status === 'EXPIRED') {
          clearInterval(timer);
          setScanStatus('expired');
        }
      } catch {
        // Polling error — continue
      }
    }, 3000);
    setPollTimer(timer);
  };

  const handleClose = () => {
    if (pollTimer) clearInterval(pollTimer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Đăng nhập Zalo
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Nick: {account.display_name || `#${account.id}`}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center">
          {error && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {scanStatus === 'success' ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">Đăng nhập thành công!</p>
              <p className="text-sm text-gray-500 mt-1">Tài khoản Zalo đã được kết nối</p>
            </div>
          ) : (
            <>
              {/* QR Code Area */}
              <div className="w-56 h-56 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center mb-4 relative overflow-hidden">
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-gray-500">Đang tạo mã QR...</span>
                  </div>
                ) : qrDataUrl ? (
                  <>
                    <img
                      src={qrDataUrl}
                      alt="QR Code Zalo"
                      className="w-full h-full object-contain p-2"
                    />
                    {scanStatus === 'expired' && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
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
                  <span className="text-sm text-gray-400">Chưa có mã QR</span>
                )}
              </div>

              {/* Instructions */}
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  {scanStatus === 'waiting'
                    ? 'Quét mã QR bằng ứng dụng Zalo trên điện thoại'
                    : scanStatus === 'expired'
                    ? 'Mã QR đã hết hạn. Vui lòng tạo mã mới.'
                    : ''}
                </p>
                <ol className="text-xs text-gray-500 space-y-1 text-left max-w-xs mx-auto">
                  <li className="flex gap-2">
                    <span className="font-semibold text-gray-600">1.</span>
                    Mở ứng dụng Zalo trên điện thoại
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-gray-600">2.</span>
                    Nhấn <strong>Quét QR</strong> hoặc vào <strong>Cài đặt &rarr; Zalo QR</strong>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-gray-600">3.</span>
                    Quét mã QR hiển thị trên màn hình
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-gray-600">4.</span>
                    Xác nhận đăng nhập trên điện thoại
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

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
          >
            {scanStatus === 'success' ? 'Đóng' : 'Hủy'}
          </button>
        </div>
      </div>
    </div>
  );
};
