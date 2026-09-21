import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../api/client';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { Mail, Lock, Eye, EyeOff, GraduationCap, ShieldCheck, CheckCircle2, Sparkles } from 'lucide-react';

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

  return (
    <div className="min-h-screen flex bg-slate-950 font-sans selection:bg-blue-500 selection:text-white relative overflow-hidden">
      {/* Background Decorative Blur Spheres */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-40 w-96 h-96 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Left Column: Brand Hero Showcase (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative z-10 border-r border-slate-800/60 bg-gradient-to-br from-slate-900/90 via-slate-950/90 to-slate-900/90 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white flex items-center">
              CSKH Portal <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">v2.0</span>
            </h1>
            <p className="text-xs text-slate-400">Nền tảng Tự Động Hóa Chăm Sóc Học Viên</p>
          </div>
        </div>

        <div className="space-y-6 max-w-lg">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-teal-300 font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Chuẩn hóa nghiệp vụ theo Sheet 1 & Sheet 3</span>
          </div>

          <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
            Quản lý ghi danh, lịch học & điểm danh theo ngày chính xác tuyệt đối.
          </h2>

          <p className="text-sm text-slate-400 leading-relaxed">
            Hệ thống hỗ trợ đồng bộ dữ liệu Excel thông minh, nhận diện học viên mới và tự động theo dõi cảnh báo số buổi học nợ âm (-1, -90).
          </p>

          <div className="space-y-3 pt-2">
            {[
              'Ma trận điểm danh trực tiếp theo ngày & ca học',
              'Tự động khớp học viên hoặc xác nhận thêm mới khi import Sheet 3',
              'Theo dõi chi tiết số buổi nợ & phân loại trạng thái học chuyên nghiệp',
            ].map((item, idx) => (
              <div key={idx} className="flex items-center space-x-3 text-xs text-slate-300 font-medium">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-6">
          <span>© 2026 CSKH Automation Engine</span>
          <span className="flex items-center space-x-1 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>Bảo mật dữ liệu nội bộ</span>
          </span>
        </div>
      </div>

      {/* Right Column: Clean Elevated White Login Card */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl shadow-2xl border border-slate-200/80 text-slate-900 space-y-6">
          {/* Mobile Brand Header */}
          <div className="lg:hidden flex items-center space-x-3 pb-2 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-teal-400 flex items-center justify-center text-white shadow-md">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">CSKH Automation</h1>
              <p className="text-[11px] text-slate-500">Đăng nhập tài khoản công tác</p>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Đăng nhập hệ thống</h2>
            <p className="text-xs text-slate-500">Vui lòng nhập tài khoản và mật khẩu để tiếp tục</p>
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start space-x-2.5 animate-fadeIn">
              <div className="w-4 h-4 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                !
              </div>
              <span className="leading-relaxed font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                label="Địa chỉ Email"
                labelClassName="text-slate-700 font-bold"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                leftIcon={<Mail className="w-4 h-4 text-slate-400" />}
                className="bg-slate-50 hover:bg-white focus:bg-white border-slate-200 focus:border-blue-600 focus:ring-blue-100 text-slate-900 font-medium placeholder:text-slate-400"
              />
            </div>

            <div>
              <Input
                label="Mật khẩu"
                labelClassName="text-slate-700 font-bold"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4 text-slate-400" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-700 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                className="bg-slate-50 hover:bg-white focus:bg-white border-slate-200 focus:border-blue-600 focus:ring-blue-100 text-slate-900 font-medium placeholder:text-slate-400"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              isLoading={submitting}
              className="w-full py-2.5 text-xs font-bold uppercase tracking-wider shadow-md shadow-blue-500/20"
            >
              Đăng nhập
            </Button>
          </form>

          {/* Quick Demo Switcher */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <p className="text-[11px] font-bold text-slate-500 text-center uppercase tracking-wider">
              Tài khoản Thử nghiệm (Mật khẩu: 123456)
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickFill('admin@gmail.com', '123456')}
                className="px-1.5 py-2 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-[11px] font-bold text-slate-700 hover:text-blue-700 transition text-center shadow-xs"
                title="admin@gmail.com"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('cskh1@gmail.com', '123456')}
                className="px-1.5 py-2 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-[11px] font-bold text-slate-700 hover:text-emerald-700 transition text-center shadow-xs"
                title="cskh1@gmail.com"
              >
                CSKH 1
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('cskh2@gmail.com', '123456')}
                className="px-1.5 py-2 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-[11px] font-bold text-slate-700 hover:text-emerald-700 transition text-center shadow-xs"
                title="cskh2@gmail.com"
              >
                CSKH 2
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('cskh3@gmail.com', '123456')}
                className="px-1.5 py-2 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-[11px] font-bold text-slate-700 hover:text-emerald-700 transition text-center shadow-xs"
                title="cskh3@gmail.com"
              >
                CSKH 3
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('teacher@gmail.com', '123456')}
                className="px-1.5 py-2 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 text-[11px] font-bold text-slate-700 hover:text-purple-700 transition text-center shadow-xs"
                title="teacher@gmail.com"
              >
                GV
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
