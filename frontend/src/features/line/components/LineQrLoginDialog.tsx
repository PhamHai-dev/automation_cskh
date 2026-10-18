import React, { useState, useCallback, useEffect } from 'react';
import type {
  LineAccount,
  LineSocketQrEvent,
  LineSocketPinEvent,
  LineSocketStatusEvent,
} from '../types/line.types';
import { lineApi } from '../api/line.api';
import { useLineAccountSocket } from '../../../hooks/useSocket';
import { ShieldCheck, QrCode, RefreshCw, KeyRound, CheckCircle2 } from 'lucide-react';

function normalizeQrImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith('data:image')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    if (raw.includes('api.qrserver.com')) return raw;
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(raw)}`;
  }
  if (raw.startsWith('line://')) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(raw)}`;
  }
  if (/^[A-Za-z0-9+/=]/.test(raw) && raw.length > 80) {
    return `data:image/png;base64,${raw}`;
  }
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(raw)}`;
}

interface LineQrLoginDialogProps {
  account: LineAccount;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * LineQrLoginDialog — Socket.IO & polling driven QR + E2EE Letter Sealing 6-digit PIN login
 * for PERSONAL LINE accounts (`@evex/linejs`).
 */
export const LineQrLoginDialog: React.FC<LineQrLoginDialogProps> = ({
  account,
  onClose,
  onSuccess,
}) => {
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(
    normalizeQrImageUrl(account.qr_code),
  );
  const [pinCode, setPinCode] = useState<string | null>(account.pin_code || null);
  const [loading, setLoading] = useState(!account.qr_code && !account.pin_code);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'qr' | 'pin' | 'success' | 'expired'>(
    account.status === 'PIN_REQUIRED' && account.pin_code ? 'pin' : 'qr',
  );

  const { connected, on, off } = useLineAccountSocket(account.id);

  const handleQrEvent = useCallback(
    (data: LineSocketQrEvent) => {
      if (data.accountId !== account.id) return;
      const raw = data.qrDataUrl || data.qrUrl;
      setQrImageUrl(normalizeQrImageUrl(raw));
      setPhase('qr');
      setLoading(false);
    },
    [account.id],
  );

  const handlePinEvent = useCallback(
    (data: LineSocketPinEvent) => {
      if (data.accountId !== account.id) return;
      if (data.pinCode) {
        setPinCode(data.pinCode);
        setPhase('pin');
        setLoading(false);
      }
    },
    [account.id],
  );

  const handleStatusEvent = useCallback(
    (data: LineSocketStatusEvent) => {
      if (data.accountId !== account.id) return;
      if (data.pinCode) {
        setPinCode(data.pinCode);
      }
      if (data.status === 'PIN_REQUIRED') {
        setPhase('pin');
        setLoading(false);
      } else if (data.status === 'ACTIVE') {
        setPhase('success');
        setTimeout(() => onSuccess(), 900);
      } else if (data.status === 'EXPIRED') {
        setPhase('expired');
      } else if (data.status === 'QR_PENDING') {
        setPhase('qr');
      }
    },
    [account.id, onSuccess],
  );

  useEffect(() => {
    on('line:qr', handleQrEvent);
    on('line:pin', handlePinEvent);
    on('line:status', handleStatusEvent);
    return () => {
      off('line:qr', handleQrEvent);
      off('line:pin', handlePinEvent);
      off('line:status', handleStatusEvent);
    };
  }, [on, off, handleQrEvent, handlePinEvent, handleStatusEvent]);

  const startQrFlow = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await lineApi.startQrLogin(account.id);
      if (res?.pinCode) {
        setPinCode(res.pinCode);
        setPhase('pin');
      } else if (res?.qrDataUrl || res?.qrUrl) {
        setQrImageUrl(normalizeQrImageUrl(res.qrDataUrl || res.qrUrl));
        setPhase('qr');
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể khởi tạo mã QR đăng nhập LINE',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!qrImageUrl && phase === 'qr') {
      startQrFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll account status every 3s as fallback while waiting for QR scan or PIN verification
  useEffect(() => {
    if (phase === 'success' || phase === 'expired') return;
    const interval = setInterval(async () => {
      try {
        const acc = await lineApi.getAccount(account.id);
        const st = acc.liveStatus || acc.status;
        if (acc.pin_code && (st === 'PIN_REQUIRED' || phase === 'qr')) {
          setPinCode(acc.pin_code);
          if (st === 'PIN_REQUIRED') setPhase('pin');
        }
        if (acc.qr_code && !qrImageUrl) {
          setQrImageUrl(normalizeQrImageUrl(acc.qr_code));
        }
        if (st === 'ACTIVE') {
          setPhase('success');
          clearInterval(interval);
          setTimeout(() => onSuccess(), 900);
        } else if (st === 'EXPIRED') {
          setPhase('expired');
        }
      } catch {
        // ignore transient poll errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [account.id, phase, qrImageUrl, onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-emerald-50/80 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#06C755] text-white flex items-center justify-center shadow-sm">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Đăng nhập LINE Cá nhân (QR)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Nick: {account.display_name || `#${account.id}`}{' '}
                {account.line_phone ? `• ${account.line_phone}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                connected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                }`}
              />
              {connected ? 'Live' : 'Polling'}
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center">
          {error && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl mb-4 text-xs">
              {error}
            </div>
          )}

          {phase === 'success' ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-9 h-9 text-[#06C755]" />
              </div>
              <p className="text-lg font-bold text-gray-900">Đăng nhập LINE thành công!</p>
              <p className="text-xs text-gray-500 mt-1">
                Đã đồng bộ khóa E2EE Letter Sealing và kết nối phiên trực tuyến.
              </p>
            </div>
          ) : phase === 'pin' && pinCode ? (
            /* ── Crucial E2EE Letter Sealing 6-Digit PIN UX ── */
            <div className="w-full flex flex-col items-center text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-3 shadow-xs">
                <KeyRound className="w-6 h-6" />
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 mb-3">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                Xác thực bảo mật E2EE (Letter Sealing)
              </span>
              <p className="text-xs text-gray-600 max-w-sm mb-4 leading-relaxed">
                Nhập mã PIN 6 số này trên ứng dụng LINE điện thoại để đồng bộ khóa mã hóa đầu cuối (Letter Sealing)
              </p>

              {/* Large 6-digit PIN box */}
              <div className="w-full bg-gradient-to-br from-emerald-50 to-amber-50/60 border-2 border-[#06C755]/40 rounded-2xl py-5 px-4 mb-4 shadow-inner">
                <div className="flex items-center justify-center gap-2">
                  {pinCode.split('').map((digit, idx) => (
                    <span
                      key={idx}
                      className="w-11 h-14 rounded-xl bg-white border-2 border-emerald-500/40 shadow-sm flex items-center justify-center text-2xl font-extrabold font-mono text-gray-900"
                    >
                      {digit}
                    </span>
                  ))}
                </div>
                <div className="mt-3 text-[11px] font-medium text-emerald-800 flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#06C755] animate-ping" />
                  Đang chờ xác nhận mã PIN trên điện thoại của bạn...
                </div>
              </div>

              <button
                type="button"
                onClick={startQrFlow}
                className="text-xs text-gray-500 hover:text-gray-800 underline flex items-center gap-1 mt-1"
              >
                <RefreshCw className="w-3 h-3" />
                Tạo lại mã QR khác
              </button>
            </div>
          ) : (
            /* ── QR Scan Phase ── */
            <>
              <div className="w-56 h-56 bg-gray-50 rounded-2xl border-2 border-dashed border-emerald-300 flex items-center justify-center mb-4 relative overflow-hidden">
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-[#06C755] border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-gray-500">Đang khởi tạo QR LINE...</span>
                  </div>
                ) : qrImageUrl ? (
                  <>
                    <img
                      src={qrImageUrl}
                      alt="QR Code LINE"
                      className="w-full h-full object-contain p-3"
                    />
                    {phase === 'expired' && (
                      <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
                        <div className="text-center p-3">
                          <p className="text-sm font-semibold text-orange-600">Mã QR đã hết hạn</p>
                          <button
                            onClick={startQrFlow}
                            className="mt-2 px-3 py-1.5 bg-[#06C755] text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition"
                          >
                            Tạo QR mới
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center p-4">
                    <span className="text-xs text-gray-400 block mb-2">Chưa có mã QR</span>
                    <button
                      onClick={startQrFlow}
                      className="px-3 py-1.5 bg-[#06C755] text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition"
                    >
                      Lấy mã QR
                    </button>
                  </div>
                )}
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm font-semibold text-gray-800">
                  Quét mã QR bằng ứng dụng LINE trên điện thoại
                </p>
                <ol className="text-xs text-gray-500 space-y-1.5 text-left max-w-xs mx-auto">
                  <li className="flex gap-2">
                    <span className="font-bold text-[#06C755]">1.</span>
                    Mở ứng dụng <strong>LINE</strong> trên điện thoại và chọn biểu tượng{' '}
                    <strong>Quét mã QR</strong>.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-[#06C755]">2.</span>
                    Quét mã QR trên màn hình và nhấn <strong>Đăng nhập</strong>.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-[#06C755]">3.</span>
                    Sau khi quét, màn hình sẽ hiện <strong>Mã PIN 6 số</strong> — nhập mã này vào điện thoại để mở khóa E2EE Letter Sealing.
                  </li>
                </ol>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <span className="text-[11px] text-gray-400">
            LINE Personal E2EE (@evex/linejs)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white border border-gray-200 rounded-lg transition"
          >
            {phase === 'success' ? 'Đóng' : 'Hủy'}
          </button>
        </div>
      </div>
    </div>
  );
};
