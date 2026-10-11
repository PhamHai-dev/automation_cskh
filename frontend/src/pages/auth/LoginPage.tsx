import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../api/client';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { Eye, EyeOff, GraduationCap, Lock, Mail } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      login(res.data.accessToken, res.data.user);
      toast.success(`Chào mừng trở lại, ${res.data.user?.name || res.data.user?.email}!`);
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Đăng nhập không thành công. Vui lòng kiểm tra email hoặc mật khẩu.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickFill = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError('');
  };

  useEffect(() => {
    document.title = 'Đăng nhập | CSKH Automation';
  }, []);

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-background px-4 py-4 font-sans sm:px-6 sm:py-6 lg:px-10">
      <div
        className="pointer-events-none absolute -left-32 -top-36 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-accent/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.4]"
        style={{ backgroundImage: 'radial-gradient(#cbd5e1 0.75px, transparent 0.75px)', backgroundSize: '22px 22px' }}
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute -bottom-20 -left-24 hidden h-72 w-72 rotate-45 rounded-[4rem] border border-accent/10 bg-accent/5 lg:block" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-32 right-[12%] hidden h-20 w-20 opacity-50 lg:block" style={{ backgroundImage: 'radial-gradient(#93c5fd 1px, transparent 1px)', backgroundSize: '8px 8px' }} aria-hidden="true" />
      <div className="pointer-events-none absolute -right-8 top-0 hidden h-44 w-44 rotate-45 rounded-[2.5rem] border border-primary/10 lg:block" aria-hidden="true" />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1440px] items-center justify-center sm:min-h-[calc(100vh-3rem)]">
        <section className="w-full max-w-md sm:max-w-lg">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/20">
              <GraduationCap className="h-6 w-6" aria-hidden="true" />
            </div>
            <span className="text-base font-bold tracking-tight text-text-primary">CSKH Automation</span>
          </div>

          <header className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Đăng nhập</h1>
          </header>

          {error && (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-soft p-3 text-xs font-medium leading-relaxed text-danger" role="alert">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger text-[10px] text-white">!</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="login-email"
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
              className="h-12 bg-surface text-base hover:border-primary-border focus:bg-white"
            />

            <Input
              id="login-password"
              label="Mật khẩu"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
              rightIcon={
                <button
                  id="toggle-login-password"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="rounded text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              }
              className="h-12 bg-surface text-base hover:border-primary-border focus:bg-white"
            />

            <Button
              id="login-submit"
              type="submit"
              variant="primary"
              size="lg"
              isLoading={submitting}
              className="mt-6 h-12 w-full justify-center text-base font-semibold shadow-lg shadow-primary/25"
            >
              Đăng nhập
            </Button>
          </form>

          <details className="mt-8 border-t border-border pt-5">
            <summary className="cursor-pointer select-none text-xs font-medium text-text-muted transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:text-primary">
              Tài khoản thử nghiệm
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: 'Quản trị viên', email: 'admin@gmail.com' },
                { label: 'CSKH 1', email: 'cskh1@gmail.com' },
                { label: 'CSKH 2', email: 'cskh2@gmail.com' },
                { label: 'CSKH 3', email: 'cskh3@gmail.com' },
                { label: 'Giáo viên', email: 'teacher@gmail.com' },
              ].map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => handleQuickFill(account.email, '123456')}
                  className="rounded-lg border border-border bg-surface-subtle px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:border-primary-border hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title={account.email}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </details>
        </section>
      </div>
    </main>
  );
};
