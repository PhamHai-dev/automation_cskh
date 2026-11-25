import { Modal } from '../../../components/ui/Modal';
import React, { useState } from 'react';
import type { LineAccount } from '../types/line.types';
import { lineApi } from '../api/line.api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { Copy, Check, Link2, Shield, BarChart3 } from 'lucide-react';

interface LineOaConfigDialogProps {
  account: LineAccount;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * LineOaConfigDialog — Configure LINE Official Account (`@line/bot-sdk`) credentials,
 * copy Webhook URL, and inspect Monthly Push Quota consumption.
 */
export const LineOaConfigDialog: React.FC<LineOaConfigDialogProps> = ({
  account,
  onClose,
  onSuccess,
}) => {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(account.display_name || '');
  const [basicId, setBasicId] = useState(account.basic_id || '');
  const [channelId, setChannelId] = useState(account.line_mid || '');
  const [channelSecret, setChannelSecret] = useState('');
  const [channelAccessToken, setChannelAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookUrl = `${window.location.origin}/api/v1/line/webhook/${account.id}`;

  const quota = account.monthly_quota ?? 200;
  const used = account.monthly_consumption ?? 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      toast.success('Đã sao chép Webhook URL');
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      toast.error('Không thể sao chép tự động');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await lineApi.updateOaCredentials(account.id, {
        display_name: displayName.trim() || undefined,
        basic_id: basicId.trim() || undefined,
        channel_id: channelId.trim() || undefined,
        channel_secret: channelSecret.trim() || undefined,
        channel_access_token: channelAccessToken.trim() || undefined,
      });
      toast.success('Đã cập nhật cấu hình LINE Official Account');
      onSuccess();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Không thể cập nhật cấu hình LINE OA',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg" title={'Cấu hình LINE Official Account (OA)'} description={account.display_name || `Tài khoản #${account.id}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Webhook URL Box */}
        <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-line" />
              Webhook URL (Dán vào LINE Developers Console)
            </span>
            <button
              type="button"
              onClick={handleCopyWebhook}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-surface text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
            >
              {copiedWebhook ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  Đã chép
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Sao chép
                </>
              )}
            </button>
          </div>
          <div className="font-mono text-[11px] bg-surface px-3 py-2 rounded-lg border border-emerald-200/60 text-text-primary break-all select-all">
            {webhookUrl}
          </div>
          <p className="text-[11px] text-emerald-800">
            Bật <strong>Use webhook</strong> và cho phép <strong>Allow bot to join group chats</strong> trong tab Messaging API trên LINE Developers.
          </p>
        </div>

        {/* Monthly Push Quota Bar */}
        <div className="p-3.5 rounded-xl bg-surface-subtle border border-border/80 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-text-secondary flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-line" />
              Hạn mức Push Message trong tháng (Quota)
            </span>
            <span className="font-mono font-bold text-text-primary">
              {used.toLocaleString()} / {quota.toLocaleString()} tin
            </span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-line'
                }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-text-muted">
            Tin nhắn phản hồi qua <code className="bg-surface px-1 rounded">replyToken</code> (khi học viên nhắn trước) được <strong>miễn phí 100% (0 quota)</strong>.
          </p>
        </div>

        {/* Credentials inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Tên hiển thị Bot OA"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="VD: Edura CSKH Official"
          />
          <Input
            label="Bot Basic ID (@xxx)"
            value={basicId}
            onChange={(e) => setBasicId(e.target.value)}
            placeholder="VD: @edura_jp"
          />
        </div>

        <Input
          label="Channel ID"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          placeholder="VD: 2001234567"
        />

        <Input
          label="Channel Secret (Để trống nếu giữ nguyên)"
          type="password"
          value={channelSecret}
          onChange={(e) => setChannelSecret(e.target.value)}
          placeholder="Nhập Channel Secret từ LINE Developers..."
        />

        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1.5 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-line" />
            Channel Access Token (Long-lived — để trống nếu giữ nguyên)
          </label>
          <textarea
            rows={3}
            value={channelAccessToken}
            onChange={(e) => setChannelAccessToken(e.target.value)}
            placeholder="Dán Channel Access Token (long-lived) từ LINE Developers Console..."
            className="w-full px-3 py-2 text-xs font-mono bg-surface-subtle border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="pt-3 border-t border-border flex flex-wrap justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="primary" type="submit" isLoading={saving}>
            Lưu cấu hình OA
          </Button>
        </div>
      </form>
    </Modal>
  );
};
