import React, { useEffect, useState } from 'react';
import { apiClient } from '../../../api/client';
import { enrollmentsApi } from '../../enrollments/api/enrollments.api';
import {
  EnrollmentCsViewer,
  ReassignCsMode,
} from '../../enrollments/types/enrollments.types';
import { Student } from '../types/students.types';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import {
  UserCheck,
  ArrowRightLeft,
  Eye,
  EyeOff,
  Trash2,
  Users,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

interface CsUserAccount {
  id: number;
  code?: string | null;
  staff_code?: string | null;
  display_label?: string;
  name?: string | null;
  email: string;
  roles?: string[];
  active?: boolean;
}

export interface ReassignCsModalProps {
  isOpen: boolean;
  students: Student[];
  onClose: () => void;
  onSuccess: () => void;
}

function formatCsUserOption(u: CsUserAccount): string {
  const code = (u.staff_code || u.code || '').trim().toUpperCase();
  const name = (u.name || '').trim();
  const email = (u.email || '').trim();
  const parts: string[] = [];
  if (code) parts.push(`[${code}]`);
  if (name) parts.push(name);
  if (email) parts.push(`(${email})`);
  return parts.join(' ') || `CS #${u.id}`;
}

export const ReassignCsModal: React.FC<ReassignCsModalProps> = ({
  isOpen,
  students,
  onClose,
  onSuccess,
}) => {
  const toast = useToast();

  const [csUsers, setCsUsers] = useState<CsUserAccount[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [targetCsId, setTargetCsId] = useState<number | ''>('');
  const [mode, setMode] = useState<ReassignCsMode>('KEEP_READONLY');
  const [transferPendingTasks, setTransferPendingTasks] = useState<boolean>(true);
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const singleStudent = students.length === 1 ? students[0] : null;
  const singleEnrollment = singleStudent?.enrollments?.[0];

  const [viewers, setViewers] = useState<EnrollmentCsViewer[]>(
    singleEnrollment?.cs_viewers || []
  );
  const [revokingCsId, setRevokingCsId] = useState<number | null>(null);

  useEffect(() => {
    setViewers(singleEnrollment?.cs_viewers || []);
  }, [singleEnrollment]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadCsUsers = async () => {
      setLoadingUsers(true);
      try {
        let list: CsUserAccount[] = [];
        try {
          const res = await apiClient.get('/settings/users');
          list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        } catch {
          const resFallback = await apiClient.get('/users');
          list = Array.isArray(resFallback.data)
            ? resFallback.data
            : resFallback.data?.data || [];
        }
        if (cancelled) return;
        const activeCs = list.filter(
          (u) => u.active !== false && u.roles?.includes('CS')
        );
        // Sort prioritizing CS with staff_code / code
        activeCs.sort((a, b) => {
          const codeA = (a.staff_code || a.code || a.name || a.email || '').toUpperCase();
          const codeB = (b.staff_code || b.code || b.name || b.email || '').toUpperCase();
          return codeA.localeCompare(codeB, 'vi-VN');
        });
        setCsUsers(activeCs);
      } catch {
        if (!cancelled) {
          toast.error('Không thể tải danh sách tài khoản CVHT');
        }
      } finally {
        if (!cancelled) {
          setLoadingUsers(false);
        }
      }
    };
    loadCsUsers();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const validEnrollmentIds = students
    .map((s) => s.enrollments?.[0]?.id)
    .filter((id): id is number => typeof id === 'number' && id > 0);

  const handleRevokeViewer = async (viewer: EnrollmentCsViewer) => {
    if (!singleEnrollment) return;
    try {
      setRevokingCsId(viewer.cs_id);
      await enrollmentsApi.revokeCsViewer(singleEnrollment.id, viewer.cs_id);
      setViewers((prev) => prev.filter((v) => v.cs_id !== viewer.cs_id));
      toast.success(
        `Đã thu hồi quyền xem của ${
          viewer.cs?.staff_code || viewer.cs?.code || viewer.cs?.name || `CS #${viewer.cs_id}`
        }`
      );
      onSuccess();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể thu hồi quyền xem của CVHT cũ'
      );
    } finally {
      setRevokingCsId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCsId) {
      toast.warning('Vui lòng chọn CVHT mới nhận bàn giao');
      return;
    }
    if (validEnrollmentIds.length === 0) {
      toast.error('Không tìm thấy gói ghi danh hợp lệ để chuyển CVHT');
      return;
    }

    try {
      setSubmitting(true);
      await enrollmentsApi.reassignCs({
        enrollment_ids: validEnrollmentIds,
        target_cs_id: Number(targetCsId),
        mode,
        transfer_pending_tasks: transferPendingTasks,
        note: note.trim() || undefined,
      });

      const targetUser = csUsers.find((u) => u.id === Number(targetCsId));
      const targetLabel =
        targetUser?.staff_code ||
        targetUser?.code ||
        targetUser?.name ||
        `#${targetCsId}`;

      toast.success(
        `Đã chuyển ${validEnrollmentIds.length} học viên sang CVHT ${targetLabel} (${
          mode === 'KEEP_READONLY' ? 'Giữ quyền xem cho CVHT cũ' : 'Chuyển hẳn'
        })`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Có lỗi xảy ra khi chuyển CVHT phụ trách'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Chuyển CVHT phụ trách học viên
            </h3>
            <p className="text-xs text-slate-500 font-normal">
              Bàn giao quyền phụ trách chăm sóc từ CVHT hiện tại sang CVHT mới
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* 1. Tóm tắt học viên đang chọn */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
          {singleStudent ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                    {singleStudent.external_id || `HV_${singleStudent.id}`}
                  </span>
                  <strong className="text-sm text-slate-900">
                    {singleStudent.full_name}
                  </strong>
                </div>
                <Badge variant="info" size="sm">
                  {(singleEnrollment?.program_type || 'KAIWA').toUpperCase()}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-slate-600 border-t border-slate-200/60">
                <div>
                  <span className="text-slate-500">Gói học / Khóa: </span>
                  <strong className="text-slate-800">
                    {singleEnrollment?.package?.name ||
                      singleEnrollment?.package?.code ||
                      singleEnrollment?.course_content ||
                      '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">CVHT chính hiện tại: </span>
                  <strong className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                    {singleEnrollment?.cs?.staff_code ||
                      (singleEnrollment?.cs as any)?.code ||
                      singleEnrollment?.cs?.name ||
                      'Chưa gán'}
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>
                    Đang chọn chuyển hàng loạt:{' '}
                    <strong className="text-primary">{students.length} học viên</strong>
                  </span>
                </div>
                <Badge variant="info" size="sm">
                  {validEnrollmentIds.length} gói ghi danh hợp lệ
                </Badge>
              </div>
              <div className="max-h-28 overflow-y-auto bg-white border border-slate-200/80 rounded-lg p-2 flex flex-wrap gap-1.5">
                {students.map((st) => {
                  const enr = st.enrollments?.[0];
                  const curCs =
                    enr?.cs?.staff_code ||
                    (enr?.cs as any)?.code ||
                    enr?.cs?.name ||
                    '—';
                  return (
                    <span
                      key={st.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px]"
                    >
                      <strong className="font-mono text-blue-700">
                        {st.external_id || `HV_${st.id}`}
                      </strong>
                      <span className="truncate max-w-[130px]">{st.full_name}</span>
                      <span className="text-slate-400">({curCs})</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2. Chọn CVHT mới */}
        <div>
          <label className="block font-bold text-slate-800 mb-1.5">
            Chọn CVHT mới phụ trách <span className="text-rose-500">*</span>
          </label>
          {loadingUsers ? (
            <div className="flex items-center gap-2 text-slate-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Đang tải danh sách CVHT...</span>
            </div>
          ) : (
            <select
              value={targetCsId}
              onChange={(e) =>
                setTargetCsId(e.target.value ? Number(e.target.value) : '')
              }
              required
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
            >
              <option value="">-- Chọn tài khoản CVHT nhận bàn giao --</option>
              {csUsers.map((u) => {
                const isCurrentSingleOwner =
                  singleEnrollment && singleEnrollment.cs_id === u.id;
                return (
                  <option key={u.id} value={u.id}>
                    {formatCsUserOption(u)}
                    {isCurrentSingleOwner ? ' — [Đang phụ trách chính]' : ''}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {/* 3. Chọn Hướng chuyển giao (2 Radio Card trực quan) */}
        <div>
          <label className="block font-bold text-slate-800 mb-2">
            Chọn hướng chuyển giao quyền truy cập <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-1 gap-2.5">
            {/* Hướng 1: FULL_TRANSFER */}
            <label
              onClick={() => setMode('FULL_TRANSFER')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                mode === 'FULL_TRANSFER'
                  ? 'border-primary bg-blue-50/50 shadow-2xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="reassign_mode"
                value="FULL_TRANSFER"
                checked={mode === 'FULL_TRANSFER'}
                onChange={() => setMode('FULL_TRANSFER')}
                className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-rose-600" />
                    Hướng 1: Chuyển hẳn sang CVHT mới
                  </span>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    FULL_TRANSFER
                  </span>
                </div>
                <p className="text-slate-600 mt-1 leading-relaxed text-[11px]">
                  CVHT cũ sẽ không còn nhìn thấy dữ liệu của học viên này. Toàn bộ quyền xem và chỉnh sửa chuyển sang CVHT mới.
                </p>
              </div>
            </label>

            {/* Hướng 2: KEEP_READONLY */}
            <label
              onClick={() => setMode('KEEP_READONLY')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                mode === 'KEEP_READONLY'
                  ? 'border-primary bg-blue-50/50 shadow-2xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="reassign_mode"
                value="KEEP_READONLY"
                checked={mode === 'KEEP_READONLY'}
                onChange={() => setMode('KEEP_READONLY')}
                className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-amber-600" />
                    Hướng 2: Chuyển quyền phụ trách, giữ quyền XEM cho CVHT cũ
                  </span>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    KEEP_READONLY
                  </span>
                </div>
                <p className="text-slate-600 mt-1 leading-relaxed text-[11px]">
                  CVHT mới có toàn quyền chỉnh sửa & chăm sóc. CVHT cũ vẫn nhìn thấy học viên trong danh sách nhưng ở chế độ Chỉ xem (không có quyền sửa).
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* 4. Checkbox chuyển CareTask */}
        <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={transferPendingTasks}
            onChange={(e) => setTransferPendingTasks(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span className="font-semibold text-slate-800 text-xs">
            Chuyển cả các công việc chăm sóc (CareTask) chưa hoàn thành sang CVHT mới
          </span>
        </label>

        {/* 5. Ghi chú bàn giao */}
        <div>
          <label className="block font-bold text-slate-800 mb-1">
            Ghi chú bàn giao (Không bắt buộc)
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nhập lý do chuyển hoặc lưu ý bàn giao cho CVHT mới..."
            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* 6. Quản lý danh sách CVHT cũ đang có quyền xem (khi mở modal cho 1 học viên) */}
        {singleStudent && viewers.length > 0 && (
          <div className="border-t border-slate-200 pt-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>
                  CVHT cũ đang giữ quyền Chỉ xem ({viewers.length})
                </span>
              </span>
            </div>
            <div className="space-y-2">
              {viewers.map((v) => {
                const viewerLabel =
                  v.cs?.staff_code || v.cs?.code || v.cs?.name || `CS #${v.cs_id}`;
                const viewerName = v.cs?.name && v.cs?.name !== viewerLabel ? v.cs.name : '';
                return (
                  <div
                    key={v.id || v.cs_id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                          {viewerLabel}
                        </span>
                        {viewerName && (
                          <span className="font-semibold text-slate-800">
                            {viewerName}
                          </span>
                        )}
                        {v.cs?.email && (
                          <span className="text-slate-500 text-[11px]">
                            ({v.cs.email})
                          </span>
                        )}
                      </div>
                      {v.note && (
                        <p className="text-[11px] text-slate-600 italic">
                          Ghi chú: {v.note}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isLoading={revokingCsId === v.cs_id}
                      onClick={() => handleRevokeViewer(v)}
                      leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}
                      className="border-rose-200 text-rose-700 hover:bg-rose-50 shrink-0"
                    >
                      Thu hồi quyền xem
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={submitting}
            disabled={!targetCsId || validEnrollmentIds.length === 0}
            leftIcon={< UserCheck className="w-4 h-4" />}
          >
            Xác nhận chuyển CVHT
          </Button>
        </div>
      </form>
    </Modal>
  );
};
