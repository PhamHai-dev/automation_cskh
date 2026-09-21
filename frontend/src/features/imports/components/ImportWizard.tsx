import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, FileSpreadsheet, Upload, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useToast } from '../../../components/ui/Toast';
import { importsApi } from '../api/imports.api';
import { LogicalSheet, SheetPreviewData, UploadResponse, ValidationReport, ImportBatchSummary } from '../types/imports.types';

interface Props { onImportComplete?: () => void }
const fields: Record<LogicalSheet, { key: string; label: string }[]> = {
  studentEnrollment: [
    { key: 'external_id', label: 'ID học viên *' }, { key: 'full_name', label: 'Họ tên' },
    { key: 'package_code', label: 'Gói học *' }, { key: 'phone', label: 'Số điện thoại' },
    { key: 'email', label: 'Email' }, { key: 'total_sessions', label: 'Tổng số buổi' },
    { key: 'remaining_sessions', label: 'Số buổi còn lại' }, { key: 'class_name', label: 'Tên lớp' },
  ],
  attendance: [
    { key: 'external_id', label: 'ID học viên *' }, { key: 'full_name', label: 'Họ tên' },
    { key: 'package_code', label: 'Gói học *' }, { key: 'class_name', label: 'Tên lớp' },
  ],
};

export const ImportWizard: React.FC<Props> = ({ onImportComplete }) => {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [sheet, setSheet] = useState<LogicalSheet>('studentEnrollment');
  const [previews, setPreviews] = useState<Record<LogicalSheet, SheetPreviewData> | null>(null);
  const [mappings, setMappings] = useState<Record<LogicalSheet, Record<string, string>>>({ studentEnrollment: {}, attendance: {} });
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [result, setResult] = useState<ImportBatchSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const current = previews?.[sheet];

  const run = async (action: () => Promise<void>) => { try { setBusy(true); await action(); } catch (e: any) { toast.error(e.response?.data?.message || 'Không thể thực hiện thao tác'); } finally { setBusy(false); } };
  const doUpload = () => run(async () => {
    if (!file) return;
    const data = await importsApi.upload(file);
    setUpload(data); setPreviews(data.sheets);
    setMappings({ studentEnrollment: data.sheets.studentEnrollment.suggestedMapping, attendance: data.sheets.attendance.suggestedMapping });
    setStep(2); toast.success('Đã đọc đủ Sheet 1 và Sheet 3');
  });
  const validate = () => run(async () => {
    if (!upload || !previews) return;
    for (const logical of ['studentEnrollment', 'attendance'] as LogicalSheet[]) {
      await importsApi.saveMapping(upload.importId, { sheet: logical, headerRowIndex: previews[logical].headerRowIndex, columnMapping: mappings[logical] });
    }
    setReport(await importsApi.validate(upload.importId)); setStep(3);
  });
  const confirm = () => run(async () => { if (!upload) return; setResult(await importsApi.confirm(upload.importId, true)); setStep(4); onImportComplete?.(); });

  return <div className="space-y-6">
    <div className="grid grid-cols-4 gap-2" aria-label="Tiến trình nhập workbook">
      {['Chọn workbook', 'Ánh xạ 2 sheet', 'Đối soát thay đổi', 'Kết quả'].map((x, i) => <div key={x} className={`rounded-xl px-3 py-3 text-xs font-bold ${step === i + 1 ? 'bg-primary text-white shadow-md' : step > i + 1 ? 'bg-success/10 text-success' : 'bg-surface-muted text-text-muted'}`}>{i + 1}. {x}</div>)}
    </div>

    {step === 1 && <Card className="p-8 bg-gradient-to-br from-primary/5 via-white to-accent/5">
      <div className="max-w-2xl mx-auto text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><FileSpreadsheet className="w-8 h-8" /></div>
        <div><h2 className="text-xl font-bold text-text-primary">Nhập workbook chăm sóc học viên</h2><p className="text-sm text-text-muted mt-2">Một file .xlsx bắt buộc có cả <b>1.Chăm sóc</b> và <b>3.Chấm buổi</b>. Hệ thống đối soát theo ID + Gói học.</p></div>
        <label id="workbook-upload-label" className="block border-2 border-dashed border-border hover:border-primary rounded-2xl p-8 cursor-pointer transition-colors bg-white/70">
          <Upload className="w-6 h-6 mx-auto text-primary mb-2" /><span className="text-sm font-semibold">{file?.name || 'Chọn file cham_soc_hoc_vien.xlsx'}</span>
          <input id="workbook-file-input" className="hidden" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <Button id="upload-workbook-button" variant="primary" disabled={!file} isLoading={busy} onClick={doUpload}>Đọc và kiểm tra workbook <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </div>
    </Card>}

    {step === 2 && current && <Card className="p-6 space-y-6">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold text-text-primary">Ánh xạ dữ liệu hai sheet</h2><p className="text-xs text-text-muted">ID và Gói học bắt buộc ở cả hai sheet.</p></div><div className="flex gap-2">{(['studentEnrollment','attendance'] as LogicalSheet[]).map((s) => <Button key={s} id={`select-${s}-sheet`} size="sm" variant={sheet === s ? 'primary' : 'outline'} onClick={() => setSheet(s)}>{s === 'studentEnrollment' ? '1.Chăm sóc' : '3.Chấm buổi'}</Button>)}</div></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{fields[sheet].map((f) => <label key={f.key} className="text-xs font-semibold text-text-secondary">{f.label}<select id={`${sheet}-${f.key}-mapping`} value={mappings[sheet][f.key] || ''} onChange={(e) => setMappings((p) => ({...p, [sheet]: {...p[sheet], [f.key]: e.target.value}}))} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"><option value="">Bỏ qua</option>{current.headers.map((h) => <option key={h.col} value={h.col}>{h.col} — {h.title}</option>)}</select></label>)}</div>
      <div className="overflow-x-auto rounded-xl border border-border"><table className="min-w-full text-xs"><thead className="bg-surface-muted"><tr><th className="p-2">Dòng</th>{current.headers.slice(0,12).map((h) => <th key={h.col} className="p-2 text-left whitespace-nowrap">{h.col}. {h.title}</th>)}</tr></thead><tbody>{current.rows.slice(0,5).map((r,i) => <tr key={i} className="border-t border-border"><td className="p-2">{String(r._rowNumber)}</td>{current.headers.slice(0,12).map((h) => <td key={h.col} className="p-2 whitespace-nowrap">{String(r[h.col] ?? '')}</td>)}</tr>)}</tbody></table></div>
      <div className="flex justify-between"><Button id="mapping-back-button" variant="outline" onClick={() => setStep(1)}>Quay lại</Button><Button id="validate-workbook-button" variant="primary" isLoading={busy} disabled={!mappings.studentEnrollment.external_id || !mappings.studentEnrollment.package_code || !mappings.attendance.external_id || !mappings.attendance.package_code} onClick={validate}>Đối soát dữ liệu <ArrowRight className="w-4 h-4 ml-2" /></Button></div>
    </Card>}

    {step === 3 && report?.summary && <Card className="p-6 space-y-6">
      <div><h2 className="font-bold text-text-primary">Báo cáo đối soát theo ID + Gói học</h2><p className="text-xs text-text-muted">Sheet 1 ưu tiên hồ sơ/ghi danh; Sheet 3 ưu tiên lớp và điểm danh.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[['Tổng khóa',report.summary.totalKeys,'info'],['Ghi đè',report.summary.willUpdate,'success'],['Chờ duyệt tạo',report.summary.willRequestCreate,'accent'],['Conflict',report.summary.conflict,'warning'],['Không hợp lệ',report.summary.invalid,'danger']].map(([l,n,v]) => <div key={String(l)} className="rounded-xl border border-border p-4"><Badge variant={v as any}>{String(l)}</Badge><p className="text-2xl font-bold mt-2">{String(n)}</p></div>)}</div>
      <div className="overflow-x-auto max-h-[420px] rounded-xl border border-border"><table className="min-w-full text-xs"><thead className="sticky top-0 bg-surface-muted"><tr><th className="p-3 text-left">Khóa</th><th className="p-3">Phân loại</th><th className="p-3 text-left">Thay đổi</th><th className="p-3 text-left">Cảnh báo / lỗi</th></tr></thead><tbody>{report.items.map((item) => <tr key={item.key} className="border-t border-border align-top"><td className="p-3 font-mono">{item.externalId}<br/>{item.packageCode}</td><td className="p-3"><Badge variant={item.classification === 'UPDATE' ? 'success' : item.classification === 'REQUEST_CREATE' ? 'accent' : 'danger'}>{item.classification}</Badge></td><td className="p-3">{item.diffs.length + item.attendanceDiffs.length ? [...item.diffs,...item.attendanceDiffs].slice(0,4).map((d,i) => <div key={i}>{d.entity}.{d.field}: <b>{String(d.before ?? '∅')}</b> → <b>{String(d.after ?? '∅')}</b></div>) : 'Không đổi field'}</td><td className="p-3 text-warning">{[...item.warnings,...item.errors].join('; ') || '—'}</td></tr>)}</tbody></table></div>
      {(report.summary.conflict > 0 || report.summary.invalid > 0) && <div className="flex gap-2 rounded-xl bg-warning/10 text-warning p-3 text-xs"><AlertTriangle className="w-4 h-4 shrink-0"/>Các khóa lỗi sẽ được bỏ qua. Bản ghi mới hợp lệ chỉ tạo yêu cầu PENDING, không tự động tạo dữ liệu.</div>}
      <div className="flex justify-between"><Button id="recheck-mapping-button" variant="outline" onClick={() => setStep(2)}>Sửa ánh xạ</Button><Button id="confirm-import-button" variant="primary" isLoading={busy} onClick={confirm}>Xác nhận ghi đè & gửi yêu cầu</Button></div>
    </Card>}

    {step === 4 && result && <Card className="p-10 text-center space-y-5"><CheckCircle2 className="w-16 h-16 mx-auto text-success"/><div><h2 className="text-xl font-bold">Đã xử lý workbook</h2><p className="text-sm text-text-muted mt-2">{result.success_rows} khóa đã xử lý; {result.failed_rows} khóa lỗi. Các khóa mới đang chờ Admin/Manage duyệt.</p></div><Button id="new-import-button" variant="outline" onClick={() => { setStep(1); setFile(null); setUpload(null); setReport(null); setResult(null); }}>Nhập workbook khác</Button></Card>}
  </div>;
};
