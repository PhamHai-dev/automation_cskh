import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import { attendanceImportApi, AttendanceImportAction, AttendanceImportPreview, AttendanceImportResult, AttendanceImportSource } from '../api/reconciliation.api';

const label: Record<string, string> = { CREATE: 'Tạo mới', UNCHANGED: 'Không đổi', CONFLICT: 'Cần duyệt', INVALID: 'Lỗi dữ liệu', OUT_OF_SCOPE: 'Ngoài quyền' };
const resultLabel: Record<string, string> = { APPLY: 'Đã áp dụng', KEEP_DATABASE: 'Giữ hệ thống', SKIP: 'Bỏ qua' };

export const AttendanceExcelImportPanel: React.FC = () => {
  const toast = useToast();
  const [source, setSource] = useState<AttendanceImportSource>('CSKH');
  const [year, setYear] = useState(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttendanceImportPreview | null>(null);
  const [result, setResult] = useState<AttendanceImportResult | null>(null);
  const [actions, setActions] = useState<Record<string, AttendanceImportAction>>({});
  const [filter, setFilter] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => preview?.items.filter((item) => filter === 'ALL' || item.classification === filter) || [], [preview, filter]);

  const analyze = async () => {
    if (!file) return;
    try { setBusy(true); setPreview(await attendanceImportApi.preview(file, source, year)); setResult(null); setActions({}); toast.success('Đã tạo preview điểm danh'); }
    catch (error: any) { toast.error(error.response?.data?.message || 'Không thể phân tích file'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!preview || !file) return;
    try {
      setBusy(true);
      const commitResult = await attendanceImportApi.confirm(file, source, year, actions);
      setResult(commitResult);
      toast.success('Đã xác nhận và xử lý file điểm danh');
    } catch (error: any) { toast.error(error.response?.data?.message || 'Không thể xác nhận'); }
    finally { setBusy(false); }
  };

  const backToPreview = () => setResult(null);
  const startOver = () => { setPreview(null); setResult(null); setFile(null); setActions({}); setFilter('ALL'); };

  if (result) return <Card className="p-6 space-y-5">
    <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
      <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
      <div><h2 className="text-lg font-bold text-text-primary">Nhập điểm danh thành công</h2><p className="mt-1 text-sm text-text-muted">Hệ thống đã xử lý theo lựa chọn của bạn. Kiểm tra chi tiết bên dưới trước khi rời màn hình.</p></div>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[['Session tạo mới', result.createdSessions], ['Attendance tạo mới', result.createdAttendances], ['Attendance cập nhật', result.updatedAttendances], ['Bỏ qua', result.skipped]].map(([name, count]) => <div key={String(name)} className="rounded-xl border border-border bg-white p-4"><span className="text-xs text-text-muted">{name}</span><strong className="mt-1 block text-2xl text-text-primary">{count}</strong></div>)}
    </div>
    <div className="max-h-[420px] overflow-auto rounded-xl border border-border"><table className="min-w-[850px] w-full text-xs"><thead className="sticky top-0 bg-surface-muted"><tr><th className="p-3 text-left">Học viên</th><th className="p-3 text-left">Ngày</th><th className="p-3 text-left">Giá trị</th><th className="p-3 text-left">Kết quả</th><th className="p-3 text-left">Chi tiết</th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id} className="border-t border-border align-top"><td className="p-3 font-mono">{item.externalId}<br /><span className="text-text-muted">{item.cellAddress}</span></td><td className="p-3">{item.targetDate || '—'}</td><td className="p-3">{item.rawValue}</td><td className="p-3"><Badge variant={item.skipped ? 'neutral' : 'success'}>{item.skipped ? resultLabel[item.action] : resultLabel[item.action] || 'Đã xử lý'}</Badge></td><td className="p-3">{item.createdSessions ? `Tạo ${item.createdSessions} session; ` : ''}{item.createdAttendances ? `tạo ${item.createdAttendances} attendance; ` : ''}{item.updatedAttendances ? `cập nhật ${item.updatedAttendances} attendance` : item.skipped ? 'Không thay đổi dữ liệu' : 'Đã xử lý'}</td></tr>)}</tbody></table></div>
    <div className="flex flex-wrap justify-between gap-3"><Button id="attendance-result-back" variant="outline" onClick={backToPreview}><ArrowLeft className="mr-2 h-4 w-4" />Quay lại xem preview</Button><Button id="attendance-result-done" variant="primary" onClick={startOver}><CheckCircle2 className="mr-2 h-4 w-4" />Đồng ý / Nhập file khác</Button></div>
  </Card>;

  return <Card className="p-6 space-y-5">
    <div><h2 className="text-lg font-bold text-text-primary">Nhập điểm danh Excel</h2><p className="mt-1 text-sm text-text-muted">Ngày nguồn được remap sang năm đích; dữ liệu chỉ ghi sau khi xác nhận.</p></div>
    {!preview ? <div className="grid gap-4 md:grid-cols-3">
      <label className="text-sm font-semibold text-text-secondary">Nguồn<select id="attendance-import-source" value={source} onChange={(event) => setSource(event.target.value as AttendanceImportSource)} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"><option value="CSKH">CSKH — Sheet 3 Chấm buổi</option><option value="TEACHER">Giáo viên — Lịch dạy</option></select></label>
      <label className="text-sm font-semibold text-text-secondary">Năm đích<input id="attendance-import-year" type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2" /></label>
      <label className="text-sm font-semibold text-text-secondary">File Excel<input id="attendance-import-file" type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border border-border bg-white p-1.5" /></label>
      <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-text-secondary"><span>Số nguyên N được xử lý là N ClassSession liên tiếp.</span><Button id="preview-attendance-import" variant="primary" disabled={!file} isLoading={busy} onClick={analyze}><Upload className="mr-2 h-4 w-4" />Phân tích & xem trước</Button></div>
    </div> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{Object.entries(preview.summary).map(([key, count]) => <button type="button" key={key} onClick={() => setFilter(filter === key ? 'ALL' : key)} className={`rounded-xl border p-3 text-left ${filter === key ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}><span className="text-xs text-text-muted">{label[key]}</span><strong className="block text-xl text-text-primary">{count}</strong></button>)}</div>
      <div className="flex justify-between rounded-xl border border-border bg-surface-muted p-3 text-sm"><span><b>{preview.sheetName}</b> · Năm đích {preview.targetYear}</span><Button id="attendance-preview-back" size="sm" variant="outline" onClick={startOver}>Đổi file</Button></div>
      <div className="max-h-[500px] overflow-auto rounded-xl border border-border"><table className="min-w-[1050px] w-full text-xs"><thead className="sticky top-0 bg-surface-muted"><tr><th className="p-3 text-left">Học viên</th><th className="p-3 text-left">Ngày</th><th className="p-3 text-left">Giá trị</th><th className="p-3 text-left">Ca xử lý</th><th className="p-3 text-left">Trạng thái</th><th className="p-3 text-left">Duyệt</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-border align-top"><td className="p-3 font-mono"><b>{item.externalId}</b><br />{item.cellAddress}</td><td className="p-3">{item.sourceDate} → <b>{item.targetDate || 'Lỗi'}</b></td><td className="p-3"><b>{item.rawValue}</b> · {item.sessionCount} buổi</td><td className="p-3">{item.sessionPlans.map((plan: any) => <div key={`${plan.startTime}-${plan.endTime}`}>{plan.startTime}–{plan.endTime}: {plan.action}</div>)}</td><td className="p-3"><Badge variant={item.classification === 'INVALID' ? 'danger' : item.classification === 'CONFLICT' ? 'warning' : item.classification === 'CREATE' ? 'success' : 'neutral'}>{label[item.classification]}</Badge>{item.messages.map((message: string) => <p key={message} className="mt-1 text-danger">{message}</p>)}</td><td className="p-3">{item.classification === 'CONFLICT' ? <select id={`attendance-action-${item.id}`} value={actions[item.id] || item.defaultAction} onChange={(event) => setActions((current) => ({ ...current, [item.id]: event.target.value as AttendanceImportAction }))} className="rounded border border-border bg-white p-1"><option value="SKIP">Bỏ qua</option><option value="KEEP_DATABASE">Giữ hệ thống</option><option value="APPLY">Ghi theo Excel</option></select> : <span className="text-text-muted">{item.defaultAction === 'APPLY' ? 'Sẽ áp dụng' : 'Không ghi'}</span>}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><span className="flex gap-2 text-sm text-text-secondary"><AlertTriangle className="h-4 w-4 text-primary" />Chỉ các xung đột được duyệt “Ghi theo Excel” mới thay đổi dữ liệu.</span><Button id="confirm-attendance-import" variant="primary" isLoading={busy} onClick={confirm}><CheckCircle2 className="mr-2 h-4 w-4" />Xác nhận nhập</Button></div>
    </>}
  </Card>;
};
