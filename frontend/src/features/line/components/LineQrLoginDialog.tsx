import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import React, { useState, useCallback, useEffect } from 'react';
import type {
  LineAccount,
  LineSocketQrEvent,
  LineSocketPinEvent,
  LineSocketStatusEvent,
} from '../types/line.types';
import { lineApi } from '../api/line.api';
import { useLineAccountSocket } from '../../../hooks/useSocket';
import { ShieldCheck, RefreshCw, KeyRound, CheckCircle2 } from 'lucide-react';

function normalizeQrImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith('data:image')) return raw;
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 80) {
    return `data:image/png;base64,${raw}`;
  }
  return null;
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

  const { on, off } = useLineAccountSocket(account.id);

  const handleQrEvent = useCallback(
    (data: LineSocketQrEvent) => {
      if (data.accountId !== account.id) return;
      const raw = data.qrCodeDataUri || data.qrDataUrl || data.qrUrl;
      setError('');
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
      } else if (data.status === 'NOT_LOGGED_IN' && data.disconnectReason) {
        setError(`Đăng nhập chưa hoàn tất: ${data.disconnectReason}`);
        setPhase('expired');
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
    setQrImageUrl(null);
    setPinCode(null);
    setPhase('qr');
    try {
      const res = await lineApi.startQrLogin(account.id);
      if (res?.pinCode) {
        setPinCode(res.pinCode);
        setPhase('pin');
      } else if (res?.qrDataUrl || res?.qrUrl) {
        setQrImageUrl(normalizeQrImageUrl(res.qrDataUrl || res.qrUrl));
        setPhase('qr');
      } else if (res?.status === 'NOT_LOGGED_IN' || res?.status === 'EXPIRED') {
        setError('Không thể tạo mã QR LINE. Vui lòng thử lại.');
        setPhase('expired');
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
        if (acc.qr_code && normalizeQrImageUrl(acc.qr_code) !== qrImageUrl) {
          setQrImageUrl(normalizeQrImageUrl(acc.qr_code));
          setLoading(false);
        }
        if (st === 'ACTIVE') {
          setPhase('success');
          clearInterval(interval);
          setTimeout(() => onSuccess(), 900);
        } else if (st === 'EXPIRED') {
          setPhase('expired');
        } else if (
          st === 'NOT_LOGGED_IN' &&
          (acc as any).disconnect_reason === 'qr_login_failed'
        ) {
          setError(
            (acc as any).last_sync_error ||
            'Xác thực trên điện thoại bị gián đoạn, vui lòng tạo mã QR mới.',
          );
          setPhase('expired');
        }
      } catch {
        // ignore transient poll errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [account.id, phase, qrImageUrl, onSuccess]);

  return (
    <Modal isOpen onClose={onClose} size="sm" title={'Đăng nhập LINE cá nhân'} description={account.display_name || `Tài khoản #${account.id}`} footer={<div className="flex w-full flex-wrap items-center justify-between gap-2"><span className="text-xs text-text-secondary">LINE · {account.display_name || `#${account.id}`}</span><Button variant="outline" onClick={onClose}>{phase === 'success' ? 'Đóng' : 'Hủy'}</Button></div>}>

      <div className="flex min-w-0 flex-col items-center">
        {error && (
          <div className="w-full bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl mb-4 text-xs">
            {error}
          </div>
        )}

        {phase === 'success' ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9 text-line" />
            </div>
            <p className="text-lg font-bold text-text-primary">Đăng nhập LINE thành công!</p>
            <p className="text-xs text-text-muted mt-1">
              Đã đồng bộ khóa E2EE Letter Sealing và kết nối phiên trực tuyến.
            </p>
          </div>
        ) : phase === 'pin' && pinCode ? (
          /* ── Crucial E2EE Letter Sealing 6-Digit PIN UX ── */
          <div className="w-full flex flex-col items-center text-center py-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-3 shadow-xs">
              <KeyRound className="w-6 h-6" />
            </div>
            <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warning-soft text-warning-foreground border border-warning-border mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              Xác thực bảo mật E2EE (Letter Sealing)
            </span>
            <p className="text-xs text-text-secondary max-w-sm mb-4 leading-relaxed">
              Nhập mã PIN 6 số này trên ứng dụng LINE điện thoại để đồng bộ khóa mã hóa đầu cuối (Letter Sealing)
            </p>

            {/* Large 6-digit PIN box */}
            <div className="w-full bg-gradient-to-br from-emerald-50 to-amber-50/60 border-2 border-line/40 rounded-2xl py-5 px-4 mb-4 shadow-inner">
              <div className="grid grid-cols-6 gap-1.5">
                {pinCode.split('').map((digit, idx) => (
                  <span
                    key={idx}
                    className="min-w-0 h-12 sm:h-14 rounded-xl bg-surface border-2 border-success/40 shadow-sm flex items-center justify-center text-xl sm:text-2xl font-extrabold font-mono text-text-primary"
                  >
                    {digit}
                  </span>
                ))}
              </div>
              <div className="mt-3 text-[11px] font-medium text-emerald-800 flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-line animate-ping" />
                Đang chờ xác nhận mã PIN trên điện thoại của bạn...
              </div>
            </div>

            <button
              type="button"
              onClick={startQrFlow}
              className="text-xs text-text-muted hover:text-text-primary underline flex items-center gap-1 mt-1"
            >
              <RefreshCw className="w-3 h-3" />
              Tạo lại mã QR khác
            </button>
          </div>
        ) : (
          /* ── QR Scan Phase ── */
          <>
            <div className="w-56 h-56 bg-surface-subtle rounded-2xl border-2 border-dashed border-emerald-300 flex items-center justify-center mb-4 relative overflow-hidden">
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-line border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-text-muted">Đang khởi tạo QR LINE...</span>
                </div>
              ) : qrImageUrl ? (
                <>
                  <img
                    src={qrImageUrl}
                    alt="QR Code LINE"
                    onError={() => setError('Không tải được ảnh QR LINE. Vui lòng tạo mã QR mới.')}
                    className="w-full h-full object-contain p-3"
                  />
                  {phase === 'expired' && (
                    <div className="absolute inset-0 bg-surface/90 flex items-center justify-center">
                      <div className="text-center p-3">
                        <p className="text-sm font-semibold text-orange-600">Mã QR đã hết hạn</p>
                        <button
                          onClick={startQrFlow}
                          className="mt-2 px-3 py-1.5 bg-line text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition"
                        >
                          Tạo QR mới
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-4">
                  <span className="text-xs text-text-muted block mb-2">Chưa có mã QR</span>
                  <button
                    onClick={startQrFlow}
                    className="px-3 py-1.5 bg-line text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition"
                  >
                    Lấy mã QR
                  </button>
                </div>
              )}
            </div>

            <div className="text-center space-y-2">
              <p className="text-sm font-semibold text-text-primary">
                Quét mã QR bằng ứng dụng LINE trên điện thoại
              </p>
              <ol className="text-xs text-text-muted space-y-1.5 text-left max-w-xs mx-auto">
                <li className="flex gap-2">
                  <span className="shrink-0 font-bold text-line">1.</span>
                  <span>Mở ứng dụng <strong>LINE</strong> trên điện thoại và chọn biểu tượng <strong>Quét mã QR</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 font-bold text-line">2.</span>
                  <span>Quét mã QR trên màn hình và nhấn <strong>Đăng nhập</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 font-bold text-line">3.</span>
                  <span>Sau khi quét, màn hình sẽ hiện <strong>Mã PIN 6 số</strong> — nhập mã này vào điện thoại để xác nhận đăng nhập.</span>
                </li>
              </ol>
            </div>
          </>
        )}
      </div>

    </Modal>
  );
};
