import React, { useEffect, useState } from 'react';
import { apiClient } from '../../../api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import {
  Clock,
  Save,
  Play,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Sparkles,
  Info,
} from 'lucide-react';

interface AutoAttendanceCycleResult {
  processed_schedules: number;
  attended_count: number;
  skipped_count: number;
  failed_count: number;
  issues_created: number;
}

const PRESET_DELAYS = [
  { label: '0 phút (Ngay lập tức)', value: 0 },
  { label: '5 phút', value: 5 },
  { label: '10 phút', value: 10 },
  { label: '15 phút (Mặc định)', value: 15 },
  { label: '30 phút', value: 30 },
  { label: '60 phút', value: 60 },
];

export const AutoAttendanceConfigCard: React.FC = () => {
  const toast = useToast();

  const [delayMinutes, setDelayMinutes] = useState<number>(15);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AutoAttendanceCycleResult | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/settings/auto-attendance');
      if (res.data?.data) {
        setDelayMinutes(res.data.data.delay_minutes ?? 15);
        setUpdatedAt(res.data.data.updated_at);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải cấu hình tự động điểm danh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (delayMinutes < 0 || delayMinutes > 1440 || !Number.isInteger(delayMinutes)) {
      toast.error('Thời gian chờ phải là số nguyên từ 0 đến 1440 phút (24 giờ)');
      return;
    }

    try {
      setSaving(true);
      const res = await apiClient.patch('/settings/auto-attendance', {
        delay_minutes: Number(delayMinutes),
      });
      if (res.data?.data) {
        setDelayMinutes(res.data.data.delay_minutes);
        setUpdatedAt(res.data.data.updated_at);
      }
      toast.success(`Đã lưu cấu hình: Tự động điểm danh sau ${delayMinutes} phút từ khi ca học bắt đầu!`);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Lưu cấu hình thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    try {
      setRunning(true);
      const res = await apiClient.post('/settings/auto-attendance/run');
      const data: AutoAttendanceCycleResult = res.data?.data;
      setLastResult(data);

      if (data.attended_count > 0) {
        toast.success(`Đã tự động điểm danh thành công ${data.attended_count} lượt học viên!`);
      } else if (data.issues_created > 0) {
        toast.warning(`Đã tạo ${data.issues_created} cảnh báo thiếu giờ học cho CSKH phụ trách!`);
      } else {
        toast.info('Đã quét xong: Chưa có lớp học nào đến giờ điểm danh trong chu kỳ này.');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Không thể chạy chu kỳ quét');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Main Settings Card */}
      <Card className="border-border/80 bg-surface shadow-soft">
        <CardHeader className="border-b border-border/60 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 shadow-sm">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  Tự động Điểm danh theo Lịch học
                  <Badge variant="success" size="sm" className="hidden sm:inline-flex">
                    Cron ngầm: 1 phút/lần
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-0.5">
                  Hệ thống tự động quét các lớp học, tạo buổi học và đánh dấu có mặt cho học viên đang học.
                </CardDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRunNow}
              disabled={loading || running}
              className="flex items-center gap-1.5 self-start sm:self-auto shrink-0 border-primary/30 text-primary hover:bg-primary/5"
            >
              <Play className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
              {running ? 'Đang quét...' : 'Quét kiểm tra ngay'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center text-text-muted gap-2 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              <span>Đang tải cấu hình hệ thống...</span>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              {/* Delay minutes field */}
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1.5">
                  Thời gian chờ sau khi ca học bắt đầu (Phút)
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative w-full sm:w-48">
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      step={1}
                      value={delayMinutes}
                      onChange={(e) => setDelayMinutes(Number(e.target.value))}
                      className="w-full pl-3 pr-12 py-2 border border-border rounded-xl text-sm font-semibold bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary shadow-xs"
                      placeholder="15"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-text-muted font-medium select-none">
                      phút
                    </span>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={saving}
                    className="flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
                  </Button>
                </div>
                <p className="text-[11px] text-text-muted mt-1.5 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  Mặc định: 15 phút. Cho phép cấu hình từ 0 phút (điểm danh đúng giờ bắt đầu) đến 1440 phút (24 giờ).
                </p>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Chọn nhanh thời gian chờ
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_DELAYS.map((preset) => {
                    const isSelected = delayMinutes === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setDelayMinutes(preset.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-primary text-white shadow-xs font-semibold'
                            : 'bg-surface-muted text-text-secondary hover:bg-slate-200/70 border border-border/50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Example calculation highlight */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 text-blue-900 text-xs flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Ví dụ minh họa cách tính:</span>
                  <p className="mt-0.5 text-blue-800 leading-relaxed">
                    Một lớp học có giờ bắt đầu là <strong className="font-bold text-blue-950">20:00</strong>. Với thời gian chờ là{' '}
                    <strong className="font-bold text-blue-950">{delayMinutes} phút</strong>, hệ thống sẽ tự động quét và ghi nhận điểm danh vào đúng{' '}
                    <strong className="font-bold text-blue-950">
                      {(() => {
                        const h = 20 + Math.floor((delayMinutes) / 60);
                        const m = (delayMinutes) % 60;
                        return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                      })()}
                    </strong>{' '}
                    của ngày học đó.
                  </p>
                </div>
              </div>

              {/* Last update metadata */}
              {updatedAt && (
                <div className="text-[11px] text-text-muted pt-2 border-t border-border/50 flex items-center justify-between">
                  <span>Cập nhật lần cuối: {new Date(updatedAt).toLocaleString('vi-VN')}</span>
                  <span className="text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Cấu hình đang áp dụng
                  </span>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* Last Manual Run Result (if any) */}
      {lastResult && (
        <Card className="border-border/80 bg-surface shadow-soft animate-in fade-in-50 duration-300">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-sm flex items-center gap-2 text-text-primary">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Kết quả chu kỳ quét vừa thực hiện
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <div className="text-xs text-text-muted font-medium">Lịch học đã quét</div>
                <div className="text-xl font-extrabold text-text-primary mt-1">
                  {lastResult.processed_schedules}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-center">
                <div className="text-xs text-emerald-800 font-medium">Lượt điểm danh mới</div>
                <div className="text-xl font-extrabold text-emerald-700 mt-1">
                  {lastResult.attended_count}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-center">
                <div className="text-xs text-amber-800 font-medium">Cảnh báo thiếu giờ</div>
                <div className="text-xl font-extrabold text-amber-700 mt-1">
                  {lastResult.issues_created}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <div className="text-xs text-text-muted font-medium">Lịch chưa đến giờ/Bỏ qua</div>
                <div className="text-xl font-extrabold text-text-secondary mt-1">
                  {lastResult.skipped_count}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules and Explanation Card */}
      <Card className="border-border/80 bg-surface shadow-soft">
        <CardHeader className="pb-3 border-b border-border/60">
          <CardTitle className="text-sm flex items-center gap-2 text-text-primary">
            <HelpCircle className="w-4 h-4 text-slate-500" />
            Quy tắc hoạt động của Tự động Điểm danh
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-3 text-xs text-text-secondary leading-relaxed">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
              1
            </div>
            <div>
              <strong className="text-text-primary font-semibold">Tần suất quét ngầm:</strong> Hệ thống sử dụng Background Cron Worker chạy tự động <strong>mỗi 1 phút</strong> để kiểm tra các lớp học đã qua mốc <code>start_time + delay_minutes</code>.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
              2
            </div>
            <div>
              <strong className="text-text-primary font-semibold">Kiểm tra lịch học trong tuần:</strong> Chỉ điểm danh nếu ngày hiện tại khớp với cấu hình <code>schedule_pattern</code> của lớp (ví dụ: <code>246</code> điểm danh Thứ 2, 4, 6; <code>24CN</code> điểm danh Thứ 2, 4, Chủ Nhật). Lịch <code>LKCD</code> (Lịch không cố định) được bỏ qua để điểm danh thủ công.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
              3
            </div>
            <div>
              <strong className="text-text-primary font-semibold">Học viên hợp lệ:</strong> Chỉ tự động điểm danh cho học viên có trạng thái ghi danh là <code>Đang học</code> (STUDYING) và phân lớp đang hoạt động (ACTIVE).
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
              4
            </div>
            <div>
              <strong className="text-text-primary font-semibold">Chỉ điền ô trống (Không ghi đè):</strong> Nếu buổi học đó đã được Giáo viên hoặc CSKH điểm danh tay trước đó (Có mặt, Xin nghỉ phép A, Bảo lưu B...), hệ thống giữ nguyên dữ liệu gốc, tuyệt đối không ghi đè.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
              5
            </div>
            <div>
              <strong className="text-text-primary font-semibold">Tự động cảnh báo thiếu giờ học:</strong> Nếu lớp học có lịch học nhưng bị để trống giờ bắt đầu (<code>start_time</code>), hệ thống sẽ không điểm danh mà tự động tạo nhiệm vụ <code>SCHEDULE_DATA_ISSUE</code> cho nhân viên CS phụ trách để bổ sung giờ.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
