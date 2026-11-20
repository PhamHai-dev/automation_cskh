import { Modal } from '../../../components/ui/Modal';
import React, { useEffect, useState, useRef } from 'react';
import {
  omnichannelApi,
  type OmnichannelPlatform,
  type CategoryRateLimitBound,
  type AccountLimitsSnapshot,
} from '../api/omnichannel.api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { useToast } from '../../../components/ui/Toast';
import {
  Globe,
  Gauge,
  KeyRound,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Activity,
  Server,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

export interface SecurityDialogTargetAccount {
  platform: OmnichannelPlatform;
  accountId: number;
  displayName: string;
  uidOrMid?: string | null;
  accountType?: 'ZALO_PERSONAL' | 'OA' | 'PERSONAL';
  proxyUrl?: string | null;
  monthlyQuota?: number | null;
  monthlyConsumption?: number | null;
  status?: string;
}

interface ChannelSecurityLimitsDialogProps {
  account: SecurityDialogTargetAccount;
  onClose: () => void;
  onUpdated?: () => void;
}

type SecurityTab = 'proxy' | 'limits' | 'backup';

export const ChannelSecurityLimitsDialog: React.FC<ChannelSecurityLimitsDialogProps> = ({
  account,
  onClose,
  onUpdated,
}) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<SecurityTab>('proxy');
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<AccountLimitsSnapshot | null>(null);

  // Tab 1: Proxy state
  const [proxyUrlInput, setProxyUrlInput] = useState(account.proxyUrl || '');
  const [savingProxy, setSavingProxy] = useState(false);

  // Tab 2: Rate Limits state
  const [categories, setCategories] = useState<CategoryRateLimitBound[]>([]);
  const [monthlyQuotaInput, setMonthlyQuotaInput] = useState<number>(
    account.monthlyQuota ?? 200,
  );
  const [savingLimits, setSavingLimits] = useState(false);

  // Tab 3: Backup & Restore state
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSnapshot = async () => {
    setLoading(true);
    try {
      const data = await omnichannelApi.getAccountLimits(account.platform, account.accountId, {
        proxyUrl: account.proxyUrl,
        accountType: account.accountType,
        monthlyQuota: account.monthlyQuota,
        monthlyConsumption: account.monthlyConsumption,
      });
      setSnapshot(data);
      setProxyUrlInput(data.proxyUrl || '');
      setCategories(data.categories);
      if (data.monthlyQuota) {
        setMonthlyQuotaInput(data.monthlyQuota.monthlyQuota);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.platform, account.accountId]);

  const handleSaveProxy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProxy(true);
    try {
      const updated = await omnichannelApi.updateAccountProxy(
        account.platform,
        account.accountId,
        proxyUrlInput.trim() || null,
      );
      setSnapshot((prev) =>
        prev
          ? {
            ...prev,
            proxyUrl: updated.proxyUrl,
            proxyPinned: updated.proxyPinned,
            circuitBreakerState: updated.circuitBreakerState,
            epochId: updated.epochId,
          }
          : prev,
      );
      toast.success(
        updated.proxyUrl
          ? 'Đã gắn địa chỉ Proxy riêng cho tài khoản'
          : 'Đã chuyển về chế độ kết nối mạng trực tiếp',
      );
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể lưu cấu hình Proxy');
    } finally {
      setSavingProxy(false);
    }
  };

  const handleCategoryChange = (
    catKey: CategoryRateLimitBound['category'],
    field: 'dailyLimit' | 'burstLimit',
    val: number,
  ) => {
    setCategories((prev) =>
      prev.map((c) => (c.category === catKey ? { ...c, [field]: Math.max(1, val) } : c)),
    );
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLimits(true);
    try {
      await omnichannelApi.updateAccountLimits(account.platform, account.accountId, {
        categories: categories.map((c) => ({
          category: c.category,
          daily_limit: c.dailyLimit,
          burst_limit: c.burstLimit,
          burst_window_minutes: c.burstWindowMinutes,
        })),
        monthly_quota:
          account.platform === 'LINE' && account.accountType === 'OA'
            ? monthlyQuotaInput
            : undefined,
      });
      toast.success('Đã lưu cài đặt giới hạn gửi tin & chống khóa tài khoản');
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể cập nhật giới hạn');
    } finally {
      setSavingLimits(false);
    }
  };

  const handleExportCredentials = async () => {
    setExporting(true);
    try {
      const bundle = await omnichannelApi.exportCredentials(
        account.platform,
        account.accountId,
        account.displayName,
      );
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = account.platform.toLowerCase();
      a.href = url;
      a.download = `${slug}-account-${account.accountId}-backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Đã tải xuống file sao lưu phiên đăng nhập');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xuất phiên đăng nhập');
    } finally {
      setExporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportJsonText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleImportCredentials = async () => {
    if (!importJsonText.trim()) {
      toast.error('Vui lòng chọn file sao lưu hoặc dán nội dung vào ô bên dưới');
      return;
    }
    setImporting(true);
    try {
      const parsed = JSON.parse(importJsonText);
      await omnichannelApi.importCredentials(account.platform, account.accountId, parsed);
      toast.success('Đã khôi phục phiên đăng nhập thành công');
      setImportJsonText('');
      onUpdated?.();
      onClose();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || 'File sao lưu không hợp lệ hoặc không thể khôi phục',
      );
    } finally {
      setImporting(false);
    }
  };

  const isProxyPinned = Boolean(proxyUrlInput.trim() || snapshot?.proxyPinned);
  const isLineOa = account.platform === 'LINE' && account.accountType === 'OA';
  const usedMonthly = account.monthlyConsumption ?? snapshot?.monthlyQuota?.monthlyConsumption ?? 0;
  const maxMonthly = monthlyQuotaInput || 200;
  const monthlyPct = maxMonthly > 0 ? Math.min(100, Math.round((usedMonthly / maxMonthly) * 100)) : 0;

  return (
    <Modal isOpen onClose={onClose} size="xl" title={'Kết nối, giới hạn và phiên đăng nhập'} description={`${account.displayName} · ${account.platform} · Mã #${account.accountId}`}>

      <HorizontalTabs value={activeTab} onChange={setActiveTab} ariaLabel="Cài đặt tài khoản" size="sm" items={[
        { value: 'proxy', label: 'Kết nối', icon: <Globe /> },
        { value: 'limits', label: 'Giới hạn gửi tin', icon: <Gauge /> },
        { value: 'backup', label: 'Phiên đăng nhập', icon: <KeyRound /> },
      ]} />

      {/* Body */}
      <div className="min-w-0 pt-4 space-y-5">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-text-muted">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-sm">Đang tải cài đặt kết nối và giới hạn...</span>
          </div>
        ) : (
          <>
            {/* TAB 1: CẤU HÌNH PROXY & KẾT NỐI */}
            {activeTab === 'proxy' && (
              <form onSubmit={handleSaveProxy} className="space-y-5">
                {/* Live Network Telemetry Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl border border-border bg-surface-subtle/70">
                    <div className="text-[11px] font-medium text-text-muted">Chế độ kết nối</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {isProxyPinned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <Server className="w-3 h-3" />
                          Dùng Proxy riêng
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                          Mạng trực tiếp
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border bg-surface-subtle/70">
                    <div className="text-[11px] font-medium text-text-muted">Trạng thái bảo vệ</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-sm font-bold text-text-primary">
                        {snapshot?.circuitBreakerState === 'OPEN' ? 'Tạm ngắt bảo vệ' : 'Hoạt động an toàn'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border bg-surface-subtle/70">
                    <div className="text-[11px] font-medium text-text-muted">Phiên kết nối</div>
                    <div className="mt-1 text-sm font-bold text-indigo-700">
                      Phiên #{snapshot?.epochId ?? 1}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border bg-surface-subtle/70">
                    <div className="text-[11px] font-medium text-text-muted">Độ ổn định 7 ngày</div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                      <Activity className="w-4 h-4" />
                      {snapshot?.uptime7dPct ?? 99.8}%
                    </div>
                  </div>
                </div>

                {/* Proxy URL Config */}
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">
                        Địa chỉ Proxy riêng cho tài khoản
                      </h3>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Khi vận hành nhiều tài khoản Zalo hoặc LINE Cá nhân cùng lúc, bạn nên gắn
                        mỗi tài khoản một địa chỉ IP Proxy tĩnh riêng để tránh bị nền tảng đánh
                        dấu trùng mạng.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Đường dẫn Proxy (HTTP / HTTPS / SOCKS5)
                    </label>
                    <Input
                      value={proxyUrlInput}
                      onChange={(e) => setProxyUrlInput(e.target.value)}
                      placeholder="http://username:password@103.145.x.x:8080 hoặc socks5://user:pass@ip:port"
                    />
                    <p className="text-[11px] text-text-muted mt-1">
                      Bỏ trống nếu muốn kết nối trực tiếp qua mạng mặc định của hệ thống.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Đóng
                  </Button>
                  <Button type="submit" isLoading={savingProxy}>
                    Lưu cấu hình Proxy
                  </Button>
                </div>
              </form>
            )}

            {/* TAB 2: GIỚI HẠN GỬI TIN & CHỐNG KHÓA */}
            {activeTab === 'limits' && (
              <form onSubmit={handleSaveLimits} className="space-y-5">
                {/* LINE OA Monthly Push Quota Guardrail */}
                {isLineOa && (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-700" />
                        <span className="text-sm font-bold text-emerald-950">
                          Hạn mức tin nhắn chủ động trong tháng (LINE Official Account)
                        </span>
                      </div>
                      <span className="text-xs font-bold text-emerald-800">
                        Đã dùng: {usedMonthly} / {maxMonthly} tin ({monthlyPct}%)
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-emerald-200/70 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${monthlyPct >= 95
                          ? 'bg-red-600'
                          : monthlyPct >= 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-600'
                          }`}
                        style={{ width: `${monthlyPct}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div className="p-2 rounded-lg bg-surface border border-amber-200 text-amber-800 font-medium">
                        • <strong>Chạm mốc 80%</strong>: Nhắc nhân viên CVHT ưu tiên phản hồi
                        trong cuộc trò chuyện đang mở
                      </div>
                      <div className="p-2 rounded-lg bg-surface border border-orange-200 text-orange-800 font-medium">
                        • <strong>Chạm mốc 95%</strong>: Tạm dừng gửi thông báo tự động hàng loạt
                      </div>
                      <div className="p-2 rounded-lg bg-surface border border-emerald-300 text-emerald-900 font-medium">
                        • <strong>Chạm mốc 100%</strong>: Vẫn trả lời miễn phí bình thường khi học
                        viên nhắn tin trước
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <label className="text-xs font-semibold text-text-secondary">
                        Số tin nhắn chủ động tối đa mỗi tháng:
                      </label>
                      <input
                        type="number"
                        min={50}
                        value={monthlyQuotaInput}
                        onChange={(e) => setMonthlyQuotaInput(Number(e.target.value) || 200)}
                        className="w-32 px-3 py-1.5 text-sm border border-border-strong rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* Category Rate Limits Table */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">
                        Giới hạn số lượng thao tác mỗi ngày & mỗi đợt ngắn
                      </h3>
                      <p className="text-xs text-text-muted mt-0.5">
                        Hệ thống tự động giãn cách thời gian gửi giữa các tin nhắn (1.2 – 3.5 giây)
                        để bảo vệ tài khoản không bị đánh dấu spam.
                      </p>
                    </div>
                  </div>

                  <div className="border border-border rounded-xl overflow-hidden divide-y divide-gray-100">
                    {categories.map((cat) => {
                      const pct =
                        cat.dailyLimit > 0
                          ? Math.min(100, Math.round((cat.usedToday / cat.dailyLimit) * 100))
                          : 0;
                      return (
                        <div
                          key={cat.category}
                          className="p-3.5 bg-surface hover:bg-surface-subtle/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-text-primary">{cat.label}</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-3">
                              <div className="w-40 h-2 bg-surface-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pct >= 85
                                    ? 'bg-red-500'
                                    : pct >= 60
                                      ? 'bg-amber-500'
                                      : 'bg-indigo-600'
                                    }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-text-secondary font-medium">
                                Đã dùng hôm nay: <strong>{cat.usedToday}</strong> /{' '}
                                {cat.dailyLimit} ({pct}%)
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div>
                              <label className="block text-[10px] font-semibold text-text-muted uppercase">
                                Tối đa / Ngày
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={cat.dailyLimit}
                                onChange={(e) =>
                                  handleCategoryChange(
                                    cat.category,
                                    'dailyLimit',
                                    Number(e.target.value),
                                  )
                                }
                                className="w-24 px-2.5 py-1 text-xs font-semibold border border-border-strong rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-text-muted uppercase">
                                Tối đa / {cat.burstWindowMinutes} phút
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={cat.burstLimit}
                                onChange={(e) =>
                                  handleCategoryChange(
                                    cat.category,
                                    'burstLimit',
                                    Number(e.target.value),
                                  )
                                }
                                className="w-24 px-2.5 py-1 text-xs font-semibold border border-border-strong rounded-lg"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Đóng
                  </Button>
                  <Button type="submit" isLoading={savingLimits}>
                    Lưu cài đặt giới hạn
                  </Button>
                </div>
              </form>
            )}

            {/* TAB 3: SAO LƯU & KHÔI PHỤC PHIÊN */}
            {activeTab === 'backup' && (
              <div className="space-y-5">
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-text-secondary space-y-1">
                    <div className="font-bold text-text-primary text-sm">
                      Sao lưu an toàn phiên đăng nhập của tài khoản
                    </div>
                    <p>
                      Thông tin đăng nhập của tài khoản Zalo / LINE được mã hóa bảo mật trước khi
                      tải về máy. Bạn có thể dùng file này để khôi phục nhanh kết nối khi chuyển
                      hệ thống mà không cần quét lại mã QR trên điện thoại.
                    </p>
                  </div>
                </div>

                {/* Export Box */}
                <div className="p-4 rounded-xl border border-border bg-surface flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">
                      Tải xuống file sao lưu phiên đăng nhập
                    </h4>
                    <p className="text-xs text-text-muted mt-0.5">
                      Lưu trữ dự phòng phiên đăng nhập hiện tại của tài khoản{' '}
                      <strong>{account.displayName}</strong>.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleExportCredentials}
                    isLoading={exporting}
                    leftIcon={<Download className="w-4 h-4" />}
                  >
                    Tải file sao lưu
                  </Button>
                </div>

                {/* Import Box */}
                <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary">
                        Khôi phục phiên đăng nhập từ file sao lưu
                      </h4>
                      <p className="text-xs text-text-muted mt-0.5">
                        Chọn file sao lưu (.json) từ máy tính hoặc dán nội dung vào ô bên dưới để
                        khôi phục kết nối.
                      </p>
                    </div>
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        leftIcon={<Upload className="w-3.5 h-3.5" />}
                      >
                        Chọn file .JSON
                      </Button>
                    </div>
                  </div>

                  <textarea
                    rows={4}
                    value={importJsonText}
                    onChange={(e) => setImportJsonText(e.target.value)}
                    placeholder="Dán nội dung file sao lưu JSON vào đây..."
                    className="w-full p-3 text-xs font-mono border border-border-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleImportCredentials}
                      isLoading={importing}
                      leftIcon={<CheckCircle2 className="w-4 h-4" />}
                    >
                      Khôi phục phiên đăng nhập
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Lưu ý: Chỉ khôi phục được file sao lưu được xuất ra từ cùng hệ thống.
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
