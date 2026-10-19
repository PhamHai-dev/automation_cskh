import React, { useEffect, useState, useRef } from 'react';
import {
  omnichannelApi,
  type OmnichannelPlatform,
  type CategoryRateLimitBound,
  type AccountLimitsSnapshot,
} from '../api/omnichannel.api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import {
  ShieldCheck,
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
  X,
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
          ? 'Đã gắn kết Proxy riêng (undici ProxyAgent) cho tài khoản'
          : 'Đã chuyển về chế độ kết nối Direct IP',
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
      toast.success('Đã lưu hạn mức chống khóa nick & bảo vệ tài khoản');
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể cập nhật hạn mức');
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
      a.download = `${slug}-account-${account.accountId}-aes256gcm-session.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Đã xuất file phiên đăng nhập mã hóa AES-256-GCM');
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
      toast.error('Vui lòng chọn file JSON hoặc dán nội dung phiên mã hóa AES-256-GCM');
      return;
    }
    setImporting(true);
    try {
      const parsed = JSON.parse(importJsonText);
      await omnichannelApi.importCredentials(account.platform, account.accountId, parsed);
      toast.success('Đã khôi phục phiên đăng nhập mã hóa AES-256-GCM thành công');
      setImportJsonText('');
      onUpdated?.();
      onClose();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || 'File JSON phiên đăng nhập không hợp lệ hoặc giải mã thất bại',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">
                  Bảo mật, Proxy & Giới hạn chống khóa nick
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    account.platform === 'ZALO'
                      ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30'
                      : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                  }`}
                >
                  {account.platform === 'ZALO'
                    ? 'Zalo Cá nhân'
                    : account.accountType === 'OA'
                      ? 'LINE Official Account (OA)'
                      : 'LINE Cá nhân (E2EE)'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {account.displayName} · ID #{account.accountId}{' '}
                {account.uidOrMid ? `(${account.uidOrMid})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50/80 px-6 gap-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('proxy')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'proxy'
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Globe className="w-4 h-4" />
            1. Mạng & Proxy (Isolation)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('limits')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'limits'
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Gauge className="w-4 h-4" />
            2. Giới hạn chống khóa nick
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'backup'
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            3. Sao lưu Phiên mã hóa (AES-256-GCM)
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
              <span className="text-sm">Đang tải thông số bảo mật & hạn mức...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: MẠNG & PROXY */}
              {activeTab === 'proxy' && (
                <form onSubmit={handleSaveProxy} className="space-y-5">
                  {/* Live Network Telemetry Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70">
                      <div className="text-[11px] font-medium text-gray-500">Chế độ kết nối</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {isProxyPinned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <Server className="w-3 h-3" />
                            Proxy Pinned (undici ProxyAgent)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            Direct IP
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70">
                      <div className="text-[11px] font-medium text-gray-500">Circuit Breaker</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-sm font-bold text-gray-900">
                          {snapshot?.circuitBreakerState || 'CLOSED'} (An toàn)
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70">
                      <div className="text-[11px] font-medium text-gray-500">Epoch / Listener ID</div>
                      <div className="mt-1 text-sm font-bold text-indigo-700 font-mono">
                        Epoch #{snapshot?.epochId ?? 1}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70">
                      <div className="text-[11px] font-medium text-gray-500">Uptime 7 ngày</div>
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
                        <h3 className="text-sm font-bold text-gray-900">
                          Cấu hình Proxy tĩnh cô lập IP theo từng tài khoản
                        </h3>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Mỗi tài khoản Zalo / LINE Cá nhân nên gắn 1 IP dân cư tĩnh riêng qua{' '}
                          <code className="px-1 py-0.5 bg-white rounded border text-indigo-700">
                            undici ProxyAgent
                          </code>{' '}
                          để tránh trùng IP khi vận hành đa tài khoản.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Proxy URL (HTTP / HTTPS / SOCKS5)
                      </label>
                      <Input
                        value={proxyUrlInput}
                        onChange={(e) => setProxyUrlInput(e.target.value)}
                        placeholder="http://username:password@103.145.x.x:8080 hoặc socks5://user:pass@ip:port"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Để trống nếu muốn sử dụng Direct IP của máy chủ.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    <Button type="button" variant="outline" onClick={onClose}>
                      Đóng
                    </Button>
                    <Button type="submit" isLoading={savingProxy}>
                      Lưu cấu hình Mạng & Proxy
                    </Button>
                  </div>
                </form>
              )}

              {/* TAB 2: GIỚI HẠN CHỐNG KHÓA NICK */}
              {activeTab === 'limits' && (
                <form onSubmit={handleSaveLimits} className="space-y-5">
                  {/* LINE OA Monthly Push Quota Guardrail */}
                  {isLineOa && (
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-emerald-700" />
                          <span className="text-sm font-bold text-emerald-950">
                            Hạn mức Push Message Tháng (LINE Official Account Guardrail)
                          </span>
                        </div>
                        <span className="text-xs font-bold text-emerald-800">
                          Đã dùng: {usedMonthly} / {maxMonthly} tin ({monthlyPct}%)
                        </span>
                      </div>

                      <div className="w-full h-2.5 bg-emerald-200/70 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            monthlyPct >= 95
                              ? 'bg-red-600'
                              : monthlyPct >= 80
                                ? 'bg-amber-500'
                                : 'bg-emerald-600'
                          }`}
                          style={{ width: `${monthlyPct}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="p-2 rounded-lg bg-white border border-amber-200 text-amber-800 font-medium">
                          • <strong>80% Cảnh báo</strong>: Báo động CSKH ưu tiên trả lời trong phiên
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-orange-200 text-orange-800 font-medium">
                          • <strong>95% Giới hạn</strong>: Tạm ngưng chiến dịch Push hàng loạt
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-emerald-300 text-emerald-900 font-medium">
                          • <strong>100% Chỉ cho phép Reply Token 0đ</strong>: Vẫn nhắn miễn phí khi HV nhắn trước
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-1">
                        <label className="text-xs font-semibold text-gray-700">
                          Giới hạn Push tối đa / tháng:
                        </label>
                        <input
                          type="number"
                          min={50}
                          value={monthlyQuotaInput}
                          onChange={(e) => setMonthlyQuotaInput(Number(e.target.value) || 200)}
                          className="w-32 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                  )}

                  {/* Category Rate Limits Table */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900">
                        Bộ giới hạn tần suất theo tác vụ (Sliding-Window Rate Limiter)
                      </h3>
                      <span className="text-xs text-gray-500">
                        Tự động chèn độ trễ ngẫu nhiên (Human Jitter 1.2s – 3.5s)
                      </span>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                      {categories.map((cat) => {
                        const pct =
                          cat.dailyLimit > 0
                            ? Math.min(100, Math.round((cat.usedToday / cat.dailyLimit) * 100))
                            : 0;
                        return (
                          <div
                            key={cat.category}
                            className="p-3.5 bg-white hover:bg-gray-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-900">{cat.label}</span>
                                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">
                                  {cat.category}
                                </span>
                              </div>
                              <div className="mt-1.5 flex items-center gap-3">
                                <div className="w-40 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      pct >= 85
                                        ? 'bg-red-500'
                                        : pct >= 60
                                          ? 'bg-amber-500'
                                          : 'bg-indigo-600'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-600 font-medium">
                                  Hôm nay: <strong>{cat.usedToday}</strong> / {cat.dailyLimit} ({pct}%)
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div>
                                <label className="block text-[10px] font-semibold text-gray-500 uppercase">
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
                                  className="w-24 px-2.5 py-1 text-xs font-semibold border border-gray-300 rounded-lg"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-gray-500 uppercase">
                                  Burst / {cat.burstWindowMinutes}p
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
                                  className="w-20 px-2.5 py-1 text-xs font-semibold border border-gray-300 rounded-lg"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    <Button type="button" variant="outline" onClick={onClose}>
                      Đóng
                    </Button>
                    <Button type="submit" isLoading={savingLimits}>
                      Lưu hạn mức chống khóa nick
                    </Button>
                  </div>
                </form>
              )}

              {/* TAB 3: SAO LƯU PHIÊN MÃ HÓA AES-256-GCM */}
              {activeTab === 'backup' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 flex items-start gap-3">
                    <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-gray-700 space-y-1">
                      <div className="font-bold text-gray-900 text-sm">
                        Cơ chế bảo vệ thông tin xác thực AES-256-GCM
                      </div>
                      <p>
                        Toàn bộ Cookie / ZPW Token (Zalo) và AuthToken + E2EE Letter Sealing Keypair
                        (LINE) được mã hóa bằng thuật toán <strong>AES-256-GCM</strong> trước khi lưu
                        hoặc xuất file. Giúp di chuyển tài khoản sang máy chủ mới mà không cần quét
                        lại mã QR.
                      </p>
                    </div>
                  </div>

                  {/* Export Box */}
                  <div className="p-4 rounded-xl border border-gray-200 bg-white flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">
                        Xuất file phiên đăng nhập (Export Encrypted Credentials JSON)
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Tải xuống gói JSON đã mã hóa AES-256-GCM của tài khoản{' '}
                        <strong>{account.displayName}</strong> để lưu trữ dự phòng.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={handleExportCredentials}
                      isLoading={exporting}
                      leftIcon={<Download className="w-4 h-4" />}
                    >
                      Xuất file phiên đăng nhập
                    </Button>
                  </div>

                  {/* Import Box */}
                  <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">
                          Khôi phục phiên (Import Encrypted Credentials JSON)
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Chọn file JSON đã sao lưu hoặc dán nội dung vào ô bên dưới để khôi phục ngay
                          mà không cần quét QR.
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
                      placeholder='{"version":1,"platform":"ZALO","cipher":"AES-256-GCM","payload":"..."}'
                      className="w-full p-3 text-xs font-mono border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                      Lưu ý: Chỉ khôi phục file được xuất từ hệ thống có cùng khóa{' '}
                      <code>CREDENTIALS_ENCRYPTION_KEY</code>.
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
