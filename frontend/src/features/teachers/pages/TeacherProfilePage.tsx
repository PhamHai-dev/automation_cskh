import React, { useEffect, useState } from 'react';
import { AtSign, BadgeCheck, Loader2, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import { teachersApi } from '../api/teachers.api';
import type { Teacher } from '../types/teachers.types';

const TEACHER_TYPE_LABEL: Record<string, string> = {
  VIETNAMESE: 'Giáo viên Việt',
  JAPANESE: 'Giáo viên Bản ngữ',
  OTHER: 'Khác',
};

const getInitials = (name?: string) => {
  if (!name) return 'GV';
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] || ''}${parts[parts.length - 1]?.[0] || ''}`.toUpperCase();
};

export const TeacherProfilePage: React.FC = () => {
  const toast = useToast();
  const [profile, setProfile] = useState<Teacher | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Hồ sơ giáo viên | CSKH Automation';
    const controller = new AbortController();
    teachersApi
      .getMyProfile(controller.signal)
      .then((data) => {
        setProfile(data);
        setPhone(data.phone || '');
        setEmail(data.email || '');
      })
      .catch((error: any) => {
        if (error.name !== 'CanceledError') {
          toast.error(error.response?.data?.error?.message || 'Không thể tải hồ sơ giáo viên');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [toast]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await teachersApi.updateMyProfile({
        phone: phone.trim() || null,
        email: email.trim() || null,
      });
      setProfile(updated);
      setPhone(updated.phone || '');
      setEmail(updated.email || '');
      toast.success('Đã cập nhật thông tin liên hệ');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Không thể cập nhật hồ sơ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex min-h-[55vh] items-center justify-center gap-3 text-sm text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Đang tải hồ sơ giáo viên...
        </div>
      </PageContainer>
    );
  }

  if (!profile) {
    return (
      <PageContainer>
        <Card className="p-10 text-center">
          <UserRound className="mx-auto mb-3 h-10 w-10 text-text-muted" />
          <h1 className="text-lg font-bold text-text-primary">Chưa có hồ sơ giáo viên</h1>
          <p className="mt-2 text-sm text-text-muted">Vui lòng liên hệ quản trị viên để liên kết hồ sơ với tài khoản.</p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Hồ sơ giáo viên" description="Xem thông tin giảng dạy và cập nhật thông tin liên hệ của bạn." />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden p-0">
          <div className="bg-gradient-to-br from-primary to-accent p-6 text-white">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/30 bg-white/15 text-2xl font-extrabold shadow-lg backdrop-blur">
              {getInitials(profile.name)}
            </div>
            <h2 className="mt-4 text-xl font-extrabold">{profile.name}</h2>
            <p className="mt-1 text-sm text-white/80">{profile.code}</p>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-text-muted">Phân loại</span>
              <Badge variant="accent" size="sm">{TEACHER_TYPE_LABEL[profile.teacher_type || 'OTHER']}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-text-muted">Trạng thái</span>
              <Badge variant={profile.active ? 'success' : 'neutral'} size="sm">{profile.active ? 'Đang hoạt động' : 'Tạm ngưng'}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-text-muted">Tài khoản</span>
              <span className="truncate text-xs font-bold text-text-primary">{profile.user?.email || '—'}</span>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="rounded-xl bg-primary-soft p-2.5 text-primary"><BadgeCheck className="h-5 w-5" /></div>
              <div><h2 className="text-base font-bold text-text-primary">Thông tin nghiệp vụ</h2><p className="mt-1 text-xs text-text-muted">Các trường này do Admin/Manage quản lý và chỉ có thể xem.</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface-muted/50 p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Mã giáo viên</div><div className="mt-2 font-mono text-sm font-extrabold text-text-primary">{profile.code}</div></div>
              <div className="rounded-xl border border-border bg-surface-muted/50 p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Họ và tên</div><div className="mt-2 text-sm font-extrabold text-text-primary">{profile.name}</div></div>
              <div className="rounded-xl border border-border bg-surface-muted/50 p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Loại giáo viên</div><div className="mt-2 text-sm font-extrabold text-text-primary">{TEACHER_TYPE_LABEL[profile.teacher_type || 'OTHER']}</div></div>
              <div className="rounded-xl border border-border bg-surface-muted/50 p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Trạng thái hồ sơ</div><div className="mt-2 text-sm font-extrabold text-text-primary">{profile.active ? 'Đang hoạt động' : 'Tạm ngưng'}</div></div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700"><AtSign className="h-5 w-5" /></div>
              <div><h2 className="text-base font-bold text-text-primary">Thông tin liên hệ</h2><p className="mt-1 text-xs text-text-muted">Bạn có thể tự cập nhật email liên hệ và số điện thoại.</p></div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input id="teacher-profile-email" type="email" label="Email liên hệ" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="giaovien@example.com" leftIcon={<Mail className="h-4 w-4" />} />
              <Input id="teacher-profile-phone" label="Số điện thoại" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0912345678" leftIcon={<Phone className="h-4 w-4" />} />
              <div className="flex flex-col-reverse gap-3 border-t border-border/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center gap-2 text-xs text-text-muted"><ShieldCheck className="h-4 w-4 text-emerald-600" />Thay đổi được lưu vào nhật ký hệ thống.</div>
                <Button type="submit" variant="primary" disabled={saving} isLoading={saving} leftIcon={!saving ? <Save className="h-4 w-4" /> : undefined}>Lưu thay đổi</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
};

export default TeacherProfilePage;
