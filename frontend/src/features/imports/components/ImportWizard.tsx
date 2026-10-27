import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileSpreadsheet, Upload, AlertTriangle, UserCheck, Scale, Loader2, Link2, History } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useToast } from '../../../components/ui/Toast';
import { importsApi } from '../api/imports.api';
import { apiClient } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';
import { LogicalSheet, SheetPreviewData, UploadResponse, ValidationReport, ImportBatchSummary } from '../types/imports.types';
import { omnichannelApi, type CareGroupSyncReport } from '../../omnichannel/api/omnichannel.api';
import { CareGroupSyncReportCard } from '../../omnichannel/components/CareGroupSyncReportCard';

interface CSUser {
  id: number;
  code?: string | null;
  display_label?: string;
  name: string | null;
  email: string;
  roles: string[];
}

function formatCsUserOption(u: CSUser): string {
  if (u.display_label) return u.display_label;
  const name = (u.name || '').trim();
  const code = (u.code || '').trim();
  if (name && code) {
    if (name.toUpperCase().includes(code.toUpperCase())) return name;
    return `${name} - ${code}`;
  }
  return name || code || u.email;
}

interface Props { onImportComplete?: () => void }

const profileFields: { key: string; label: string }[] = [
  { key: 'external_id', label: 'ID học viên *' },
  { key: 'full_name', label: 'Họ tên' },
  { key: 'package_code', label: 'Gói học *' },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'email', label: 'Email' },
  { key: 'total_sessions', label: 'Tổng số buổi' },
  { key: 'remaining_sessions', label: 'Số buổi còn lại' },
  { key: 'class_name', label: 'Tên lớp' },
  { key: 'course_content', label: 'Nội dung khóa' },
  { key: 'status', label: 'Trạng thái học' },
  { key: 'student_source_status', label: 'Trạng thái HV' },
  { key: 'payment_status', label: 'Trạng thái TT' },
  { key: 'sale_name', label: 'Sale' },
  { key: 'paid_at', label: 'Ngày nộp HP' },
  { key: 'start_date', label: 'Ngày bắt đầu' },
  { key: 'end_date', label: 'Ngày kết thúc' },
  { key: 'study_report_url', label: 'Báo cáo học tập' },
  { key: 'exchange_info', label: 'Thông tin trao đổi' },
  { key: 'callback_note', label: 'Lịch hẹn gọi' },
  { key: 'hot_issue_note', label: 'Điểm nóng' },
  { key: 'post_course_care', label: 'CS sau kết thúc' },
  { key: 'handed_over_at', label: 'Ngày bàn giao' },
  { key: 'account_created_at', label: 'Ngày tạo TK' },
];

export const ImportWizard: React.FC<Props> = ({ onImportComplete }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isAdminOrManage = Boolean(user?.roles?.some((r: string) => r === 'ADMIN' || r === 'MANAGE'));

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<LogicalSheet, SheetPreviewData>> | null>(null);
  const [mappings, setMappings] = useState<Record<LogicalSheet, Record<string, string>>>({ studentEnrollment: {}, attendance: {} });
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [result, setResult] = useState<ImportBatchSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [csUsers, setCsUsers] = useState<CSUser[]>([]);
  const [assignedCsId, setAssignedCsId] = useState<number | undefined>(undefined);
  const [careSyncReport, setCareSyncReport] = useState<CareGroupSyncReport | null>(null);
  const [syncingCareGroups, setSyncingCareGroups] = useState(false);

  useEffect(() => {
    if (isAdminOrManage) {
      apiClient.get<CSUser[]>('/settings/users').then((res) => {
        const list = res.data.filter((u) => u.roles?.includes('CS') || u.roles?.includes('ADMIN') || u.roles?.includes('MANAGE'));
        setCsUsers(list);
      }).catch(() => {
        // silently ignore error if not loaded
      });
    }
  }, [isAdminOrManage]);

  const current = previews?.studentEnrollment;

  const run = async (action: () => Promise<void>) => {
    try {
      setBusy(true);
      await action();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Không thể thực hiện thao tác');
    } finally {
      setBusy(false);
    }
  };

  const doUpload = () => run(async () => {
    if (!file) return;
    const data = await importsApi.upload(file, assignedCsId);
    setUpload(data);
    if (data.assignedCsId) {
      setAssignedCsId(data.assignedCsId);
    }
    const sheetsMap: Partial<Record<LogicalSheet, SheetPreviewData>> = (data.sheets && typeof data.sheets === 'object' && !Array.isArray(data.sheets))
      ? data.sheets
      : {};
    if (!sheetsMap.studentEnrollment) {
      throw new Error('Luồng này chỉ nhập hồ sơ học viên (Sheet 1). Hãy dùng tab Điểm danh CSKH / GV cho Sheet 3 hoặc file giáo viên.');
    }

    setPreviews({ studentEnrollment: sheetsMap.studentEnrollment });
    setMappings({ studentEnrollment: sheetsMap.studentEnrollment.suggestedMapping || {}, attendance: {} });
    setStep(2);
    toast.success('Đã tải và phân tích cấu trúc file Excel');
  });

  const validate = () => run(async () => {
    if (!upload || !previews) return;
    if (previews.studentEnrollment) {
      await importsApi.saveMapping(upload.importId, {
        sheet: 'studentEnrollment',
        headerRowIndex: previews.studentEnrollment.headerRowIndex,
        columnMapping: mappings.studentEnrollment,
        assignedCsId,
      });
    }
    const valReport = await importsApi.validate(upload.importId, assignedCsId);
    setReport(valReport);
    setStep(3);
  });

  const runCareGroupResync = async () => {
    try {
      setSyncingCareGroups(true);
      const syncRes = await omnichannelApi.syncAndMatchCareGroups({
        refreshLiveGroups: true,
        cs_id: assignedCsId,
      });
      setCareSyncReport(syncRes);
      toast.success('Đã đồng bộ và đối sánh liên kết Nhóm Chăm sóc Zalo/LINE!');
    } catch {
      try {
        const fallbackReport = await omnichannelApi.getCareGroupReport({
          cs_id: assignedCsId,
        });
        setCareSyncReport(fallbackReport);
      } catch {
        // ignore fallback error
      }
    } finally {
      setSyncingCareGroups(false);
    }
  };

  const confirm = () => run(async () => {
    if (!upload) return;
    setSyncingCareGroups(true);
    const res = await importsApi.confirm(upload.importId, true, assignedCsId);
    setResult(res);
    setStep(4);

    if (res.care_group_sync_report) {
      setCareSyncReport(res.care_group_sync_report as CareGroupSyncReport);
      setSyncingCareGroups(false);
    } else {
      await runCareGroupResync();
    }
  });

  const isValidateDisabled = Boolean(previews?.studentEnrollment && (!mappings.studentEnrollment.external_id || !mappings.studentEnrollment.package_code));

  const selectedCsUser = csUsers.find((u) => u.id === (assignedCsId || report?.summary.assignedCsId));

  return <div className="space-y-6">
    <div className="grid grid-cols-4 gap-2" aria-label="Tiến trình nhập workbook">
      {['Chọn file Excel', 'Ánh xạ dữ liệu', 'Đối soát thay đổi', 'Kết quả'].map((x, i) => (
        <div key={x} className={`rounded-xl px-3 py-3 text-xs font-bold ${step === i + 1 ? 'bg-primary text-white shadow-md' : step > i + 1 ? 'bg-success/10 text-success' : 'bg-surface-muted text-text-muted'}`}>
          {i + 1}. {x}
        </div>
      ))}
    </div>

    {step === 1 && <Card className="p-8 bg-gradient-to-br from-primary/5 via-white to-accent/5">
      <div className="max-w-2xl mx-auto text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><FileSpreadsheet className="w-8 h-8" /></div>
        <div>
          <h2 className="text-xl font-bold text-text-primary">Nhập hồ sơ học viên từ Excel</h2>
          <p className="text-sm text-text-muted mt-2">
            Dùng luồng này cho <b>Sheet 1 (Chăm sóc)</b> để đối soát theo <b>ID học viên + Gói học</b>. Điểm danh Sheet 3 và file giáo viên có quy trình preview/xác nhận riêng trong tab <b>Điểm danh CSKH / GV</b>.
          </p>
        </div>

        {isAdminOrManage && (
          <div className="text-left bg-white p-4 rounded-xl border border-border shadow-sm space-y-2">
            <label htmlFor="assigned-cs-select" className="block text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-primary" />
              Gán học viên cho tài khoản CSKH:
            </label>
            <select
              id="assigned-cs-select"
              value={assignedCsId || ''}
              onChange={(e) => setAssignedCsId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="">-- Mặc định: Gán cho tài khoản của bạn --</option>
              {csUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {formatCsUserOption(u)} ({u.email})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-text-muted">
              (Dành cho Quản trị viên/Quản lý): Tất cả học viên tải lên sẽ được phân công trực tiếp cho CSKH được chọn.
            </p>
          </div>
        )}

        <label id="workbook-upload-label" className="block border-2 border-dashed border-border hover:border-primary rounded-2xl p-8 cursor-pointer transition-colors bg-white/70">
          <Upload className="w-6 h-6 mx-auto text-primary mb-2" />
          <span className="text-sm font-semibold">{file?.name || 'Chọn file Excel (.xlsx)'}</span>
          <input id="workbook-file-input" className="hidden" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <Button id="upload-workbook-button" variant="primary" disabled={!file} isLoading={busy} onClick={doUpload}>
          Đọc và phân tích file <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </Card>}

    {step === 2 && current && <Card className="p-6 space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-bold text-text-primary">Ánh xạ cột dữ liệu hồ sơ</h2>
          <p className="text-xs text-text-muted">Cột ID và Gói học là bắt buộc để đối soát và ghi đè / thêm mới. Cột Sale lưu thông tin nhân viên kinh doanh.</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {profileFields.map((f) => (
          <label key={f.key} className="text-xs font-semibold text-text-secondary">
            {f.label}
            <select
              id={`studentEnrollment-${f.key}-mapping`}
              value={mappings.studentEnrollment[f.key] || ''}
              onChange={(e) => setMappings((p) => ({ ...p, studentEnrollment: { ...p.studentEnrollment, [f.key]: e.target.value } }))}
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
            >
              <option value="">Bỏ qua</option>
              {current.headers.map((h) => <option key={h.col} value={h.col}>{h.col} — {h.title}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-xs">
          <thead className="bg-surface-muted">
            <tr>
              <th className="p-2">Dòng</th>
              {current.headers.slice(0, 12).map((h) => <th key={h.col} className="p-2 text-left whitespace-nowrap">{h.col}. {h.title}</th>)}
            </tr>
          </thead>
          <tbody>
            {current.rows.slice(0, 5).map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-2 text-center text-text-muted">{String(r._rowNumber)}</td>
                {current.headers.slice(0, 12).map((h) => <td key={h.col} className="p-2 whitespace-nowrap">{String(r[h.col] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between">
        <Button id="mapping-back-button" variant="outline" onClick={() => setStep(1)}>Quay lại</Button>
        <Button
          id="validate-workbook-button"
          variant="primary"
          isLoading={busy}
          disabled={isValidateDisabled}
          onClick={validate}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Đối soát dữ liệu
        </Button>
      </div>
    </Card>}

    {step === 3 && report?.summary && <Card className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-text-primary">Báo cáo đối soát theo ID + Gói học</h2>
          <p className="text-xs text-text-muted">Kiểm tra thay đổi trước khi ghi đè hoặc thêm mới vào cơ sở dữ liệu.</p>
        </div>
        {selectedCsUser && (
          <Badge variant="info" className="text-xs py-1 px-3">
            CSKH phụ trách: <b>{formatCsUserOption(selectedCsUser)}</b>
          </Badge>
        )}
      </div>

      {busy && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50/70 to-emerald-50 p-4 flex items-center gap-3 text-left shadow-xs">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
          <div className="text-xs text-blue-900">
            <div className="font-bold">
              Đang nhập hồ sơ học viên và tự động đồng bộ liên kết Nhóm Chăm sóc Zalo/LINE theo quy tắc [Mã CS - Mã HV]...
            </div>
            <div className="text-[11px] text-blue-700 mt-0.5">
              Vui lòng giữ nguyên màn hình trong giây lát để hệ thống hoàn tất ghi dữ liệu và đối sánh tên nhóm Zalo/LINE.
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          ['Tổng khóa', report.summary.totalKeys, 'info'],
          ['Ghi đè', report.summary.willUpdate, 'success'],
          ['Thêm mới', report.summary.willCreate ?? 0, 'accent'],
          ['Yêu cầu điều chuyển', report.summary.willTransfer ?? 0, 'warning'],
          ['Bỏ qua ngoài quyền', report.summary.skippedOutOfScope ?? 0, 'neutral'],
          ['Lỗi dữ liệu', report.summary.invalid, 'danger'],
        ].map(([label, count, variant]) => (
          <div key={String(label)} className="rounded-xl border border-border p-4 bg-white shadow-sm">
            <Badge variant={variant as any}>{String(label)}</Badge>
            <p className="text-2xl font-bold mt-2 text-text-primary">{String(count)}</p>
          </div>
        ))}
      </div>

      {Boolean(report.summary.willTransfer && report.summary.willTransfer > 0) && (
        <div className="flex gap-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-3 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          Có <b>{report.summary.willTransfer}</b> học viên thuộc CSKH khác. Hệ thống sẽ tự động gửi yêu cầu điều chuyển vào hàng đợi để Quản trị viên/Quản lý phê duyệt.
        </div>
      )}

      <div className="overflow-x-auto max-h-[420px] rounded-xl border border-border">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-surface-muted">
            <tr>
              <th className="p-3 text-left">Khóa học viên</th>
              <th className="p-3">Hành động</th>
              <th className="p-3 text-left">Chi tiết thay đổi</th>
              <th className="p-3 text-left">Cảnh báo / Lỗi</th>
            </tr>
          </thead>
          <tbody>
            {(report.items || []).map((item) => {
              const badgeVariant =
                item.classification === 'UPDATE' ? 'success' :
                item.classification === 'CREATE' ? 'accent' :
                item.classification === 'REQUEST_TRANSFER' ? 'warning' :
                item.classification === 'SKIPPED_SCOPE' ? 'neutral' : 'danger';
              const badgeText =
                item.classification === 'UPDATE' ? 'Ghi đè' :
                item.classification === 'CREATE' ? 'Thêm mới' :
                item.classification === 'REQUEST_TRANSFER' ? 'Yêu cầu điều chuyển' :
                item.classification === 'SKIPPED_SCOPE' ? 'Bỏ qua (ngoài quyền)' : 'Lỗi';

              return (
                <tr key={item.key} className="border-t border-border align-top">
                  <td className="p-3 font-mono">
                    <span className="font-semibold text-text-primary">{item.externalId}</span>
                    <br />
                    <span className="text-text-muted">{item.packageCode}</span>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant={badgeVariant}>{badgeText}</Badge>
                  </td>
                  <td className="p-3">
                    {item.diffs.length + item.attendanceDiffs.length ? (
                      [...item.diffs, ...item.attendanceDiffs].slice(0, 4).map((d, i) => (
                        <div key={i} className="text-text-secondary">
                          {d.entity}.{d.field}: <span className="line-through text-text-muted">{String(d.before ?? '∅')}</span> → <b className="text-text-primary">{String(d.after ?? '∅')}</b>
                        </div>
                      ))
                    ) : (
                      <span className="text-text-muted">Không thay đổi</span>
                    )}
                  </td>
                  <td className="p-3">
                    {[...item.warnings, ...item.errors].length > 0 ? (
                      <span className={item.errors.length ? 'text-danger font-medium' : 'text-warning'}>
                        {[...item.warnings, ...item.errors].join('; ')}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 rounded-xl bg-primary/5 border border-primary/20 text-text-secondary p-3 text-xs">
        <AlertTriangle className="w-4 h-4 shrink-0 text-primary" />
        Dữ liệu hợp lệ sẽ được ghi đè hoặc thêm mới trực tiếp vào hệ thống. Các dòng có yêu cầu điều chuyển sẽ được tạo yêu cầu chờ duyệt.
      </div>
      <div className="flex justify-between">
        <Button id="recheck-mapping-button" variant="outline" onClick={() => setStep(2)}>Sửa ánh xạ</Button>
        <Button id="confirm-import-button" variant="primary" isLoading={busy} onClick={confirm}>
          Xác nhận ghi đè & thêm mới
        </Button>
      </div>
    </Card>}

    {step === 4 && result && <Card className="p-10 text-center space-y-5">
      <CheckCircle2 className="w-16 h-16 mx-auto text-success" />
      <div>
        <h2 className="text-xl font-bold text-text-primary">Đã hoàn thành nhập dữ liệu</h2>
        <p className="text-sm text-text-muted mt-2">
          {result.success_rows} bản ghi đã xử lý thành công; {result.failed_rows} bản ghi lỗi hoặc bỏ qua.
        </p>
      </div>

      {result.conflict_attendances && result.conflict_attendances > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-left space-y-2">
          <div className="flex items-center gap-2 text-warning font-semibold text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Phát hiện {result.conflict_attendances} buổi học có xung đột điểm danh giữa Giáo viên và CSKH!</span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed pl-7">
            Các buổi học bị xung đột đã được <b>đóng băng tự động</b> (không tính công GV, không trừ buổi học và tạm dừng gửi tin Zalo) cho đến khi được phân xử tại Trung tâm Đối soát.
          </p>
        </div>
      ) : null}

      <div className="pt-2">
        <CareGroupSyncReportCard
          report={careSyncReport}
          isSyncing={syncingCareGroups}
          onResync={runCareGroupResync}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button id="new-import-button" variant="outline" onClick={() => { setStep(1); setFile(null); setUpload(null); setReport(null); setResult(null); setCareSyncReport(null); }}>
          Nhập file khác
        </Button>
        {onImportComplete && (
          <Button
            id="view-import-history-button"
            variant="outline"
            leftIcon={<History className="w-4 h-4" />}
            onClick={() => onImportComplete()}
          >
            Xem lịch sử nhập
          </Button>
        )}
        <Button
          id="go-omnichannel-links-button"
          variant="outline"
          leftIcon={<Link2 className="w-4 h-4" />}
          onClick={() => navigate('/omnichannel/student-links')}
        >
          Mở Ma trận Liên kết Nhóm Chăm sóc 360°
        </Button>
        <Button
          id="go-reconciliation-button"
          variant="primary"
          leftIcon={<Scale className="w-4 h-4" />}
          onClick={() => navigate('/attendance/reconciliation')}
        >
          Đến Trung tâm Đối soát Điểm danh
        </Button>
      </div>
    </Card>}
  </div>;
};
