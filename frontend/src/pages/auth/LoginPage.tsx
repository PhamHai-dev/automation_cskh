import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../api/client';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { ArrowRight, Check, Eye, EyeOff, GraduationCap, Lock, Mail, ShieldCheck, UserRound, X } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { label: 'Quản trị viên', role: 'ADMIN', email: 'admin@gmail.com', icon: ShieldCheck },
  { label: 'Quản lý CSKH', role: 'MANAGE', email: 'manage@gmail.com', icon: ShieldCheck },
  { label: 'CSKH 1', role: 'CS', email: 'cskh1@gmail.com', icon: UserRound },
  { label: 'CSKH 2', role: 'CS', email: 'cskh2@gmail.com', icon: UserRound },
  { label: 'CSKH 3', role: 'CS', email: 'cskh3@gmail.com', icon: UserRound },
  { label: 'Giáo viên', role: 'TEACHER', email: 'teacher@gmail.com', icon: GraduationCap },
] as const;

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await apiClient.post('/auth/login', { email, password });
      login(response.data.accessToken, response.data.user);
      toast.success(`Chào mừng trở lại, ${response.data.user?.name || response.data.user?.email}!`);
      navigate('/');
    } catch (err: any) {
      const message = err.response?.data?.message || 'Đăng nhập không thành công. Vui lòng kiểm tra email hoặc mật khẩu.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const chooseDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('123456');
    setError('');
    setShowDemoAccounts(false);
  };

  useEffect(() => {
    document.title = 'Đăng nhập | CSKH Automation';
  }, []);

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-7 font-sans sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_45%,rgba(219,234,254,0.74),transparent_43%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-16 -top-32 -z-10 hidden h-64 w-64 rotate-[20deg] rounded-[2.25rem] border border-primary-border/70 bg-primary-soft/20 sm:block" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-20 top-24 -z-10 hidden h-56 w-56 rounded-full bg-blue-100/40 blur-3xl lg:block" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 -right-36 -z-10 h-[30rem] w-[30rem] rounded-full bg-cyan-100/70 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-16 left-8 -z-10 h-24 w-24 opacity-70 [background-image:radial-gradient(#bfdbfe_1.5px,transparent_1.5px)] [background-size:18px_18px] lg:left-[3%]" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 right-[-2rem] -z-10 hidden h-80 w-80 rotate-[28deg] rounded-[5rem] border border-primary-border/45 bg-white/25 sm:block" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-0 right-0 -z-10 hidden h-44 w-72 rounded-tl-[9rem] bg-gradient-to-tl from-blue-100/55 via-cyan-50/50 to-transparent sm:block" aria-hidden="true" />

      <section className="relative flex w-full max-w-[430px] flex-col items-center">
        <div className="w-full rounded-2xl border border-primary-border/50 bg-white px-8 py-8 shadow-[0_24px_70px_-30px_rgba(37,99,235,0.38)] sm:px-9 sm:py-9">
          <header className="text-center">
            <div className="flex items-center justify-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky-500 text-white shadow-lg shadow-primary/25">
                <GraduationCap className="h-7 w-7" strokeWidth={2.2} aria-hidden="true" />
              </div>
              <p className="text-[17px] font-bold tracking-tight text-text-primary">CSKH Automation</p>
            </div>
            <h1 className="mt-6 text-[32px] font-extrabold leading-none tracking-[-0.045em] text-text-primary">Đăng nhập</h1>
            <p className="mt-2.5 text-[13px] text-text-muted">Chào mừng bạn trở lại hệ thống</p>
          </header>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-xs leading-relaxed text-danger" role="alert">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">!</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <Input
              id="login-email"
              label="Email"
              labelClassName="normal-case tracking-normal text-[11px] text-text-primary"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Nhập email của bạn"
              leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
              className="h-10 rounded-md bg-white text-[12px] shadow-none"
            />

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-[11px] font-semibold text-text-primary">Mật khẩu</label>
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu"
                leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
                rightIcon={
                  <button
                    id="toggle-login-password"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="rounded text-text-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                }
                className="h-10 rounded-md bg-white text-[12px] shadow-none"
              />
            </div>

            <Button
              id="login-submit"
              type="submit"
              variant="primary"
              size="lg"
              isLoading={submitting}
              rightIcon={!submitting ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : undefined}
              className="h-10 w-full justify-center rounded-md text-[12px] font-semibold shadow-md shadow-primary/20"
            >
              Đăng nhập
            </Button>
          </form>

          {import.meta.env.DEV && (
            <>
              <div className="my-4 flex items-center gap-3 text-[11px] text-text-muted" aria-hidden="true">
                <span className="h-px flex-1 bg-border-strong" />
                <span>Bạn muốn khám phá hệ thống?</span>
                <span className="h-px flex-1 bg-border-strong" />
              </div>

              <button
                id="demo-accounts-toggle"
                type="button"
                onClick={() => setShowDemoAccounts(true)}
                className="mx-auto flex items-center gap-1.5 text-[12px] font-semibold text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:underline"
              >
                Trải nghiệm bản demo
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          )}

        </div>

        <p className="mt-5 text-[10px] text-text-muted">Cần hỗ trợ? Liên hệ quản trị viên để được cấp lại mật khẩu</p>
        <p className="mt-5 text-[10px] text-text-muted">© 2026 CSKH Automation</p>
      </section>

      {import.meta.env.DEV && showDemoAccounts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4 py-6 backdrop-blur-[3px]" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowDemoAccounts(false)}>
          <section id="demo-accounts-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-accounts-title" className="w-full max-w-[390px] rounded-2xl border border-primary-border/70 bg-white p-5 shadow-[0_24px_70px_-20px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Demo workspace</p>
                <h2 id="demo-accounts-title" className="mt-1 text-lg font-bold text-text-primary">Chọn tài khoản trải nghiệm</h2>
                <p className="mt-1 text-xs text-text-muted">Thông tin sẽ được tự động điền vào biểu mẫu.</p>
              </div>
              <button id="close-demo-accounts" type="button" onClick={() => setShowDemoAccounts(false)} className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Đóng danh sách tài khoản demo"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div className="mt-4 space-y-2" role="listbox" aria-label="Tài khoản demo">
              {DEMO_ACCOUNTS.map(({ label, role, email: demoEmail, icon: Icon }) => (
                <button key={demoEmail} id={`demo-account-${role.toLowerCase()}-${demoEmail.split('@')[0]}`} type="button" role="option" onClick={() => chooseDemoAccount(demoEmail)} className="group flex w-full items-center gap-3 rounded-xl border border-border bg-white px-3 py-3 text-left transition-all hover:border-primary-border hover:bg-primary-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" title={`${demoEmail} · Mật khẩu: 123456`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text-primary">{label}</span><span className="mt-0.5 block truncate text-xs text-text-muted">{demoEmail}</span></span>
                  <span className="rounded-md bg-surface-muted px-2 py-1 text-[10px] font-bold text-text-muted">{role}</span><Check className="h-4 w-4 text-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-xs text-text-muted">Mật khẩu dùng chung: <strong className="text-text-secondary">123456</strong></p>
          </section>
        </div>
      )}
    </main>
  );
};
