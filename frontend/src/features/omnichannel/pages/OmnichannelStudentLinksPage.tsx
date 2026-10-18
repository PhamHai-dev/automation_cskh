import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../api/client';
import { automationApi } from '../../automation/api/automation.api';
import { lineApi } from '../../line/api/line.api';
import { StudentZaloLinkPage } from '../../zalo/pages/StudentZaloLinkPage';
import { StudentLineLinkPage } from '../../line/pages/StudentLineLinkPage';
import { useToast } from '../../../components/ui/Toast';
import {
  Link2,
  Sparkles,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Smartphone,
  Bot,
  Copy,
} from 'lucide-react';

type LinksWorkspaceTab = 'MATRIX' | 'ZALO' | 'LINE';

interface StudentCoverageRow {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  zalo_uid: string | null;
  line_uid: string | null;
  zaloLinked: boolean;
  lineLinked: boolean;
}

export const OmnichannelStudentLinksPage: React.FC<{ initialTab?: LinksWorkspaceTab }> = ({
  initialTab,
}) => {
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const resolvedInitial = useMemo<LinksWorkspaceTab>(() => {
    if (initialTab) return initialTab;
    const ch = (searchParams.get('channel') || '').toUpperCase();
    if (ch === 'ZALO') return 'ZALO';
    if (ch === 'LINE') return 'LINE';
    return 'MATRIX';
  }, [initialTab, searchParams]);

  const [tab, setTab] = useState<LinksWorkspaceTab>(resolvedInitial);
  const [students, setStudents] = useState<StudentCoverageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [deepLinkModal, setDeepLinkModal] = useState<{
    studentName: string;
    linkCode: string;
    deepLinkUrl: string;
  } | null>(null);

  const loadCoverageMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const [studentsRes, zaloUnlinkedRes, lineUnlinkedRes] = await Promise.all([
        apiClient.get('/students').catch(() => ({ data: { data: [] } })),
        automationApi.getUnlinkedStudents({ limit: 200 }).catch(() => ({ items: [] })),
        lineApi.listUnlinkedStudents({ limit: 200 }).catch(() => ({ items: [] })),
      ]);

      const rawStudents: any[] =
        studentsRes.data?.data ?? studentsRes.data?.students ?? studentsRes.data ?? [];
      const zaloUnlinkedIds = new Set(
        (zaloUnlinkedRes.items ?? []).map((s: any) => Number(s.id)),
      );
      const lineUnlinkedIds = new Set(
        (lineUnlinkedRes.items ?? []).map((s: any) => Number(s.id)),
      );

      const rows: StudentCoverageRow[] = (Array.isArray(rawStudents) ? rawStudents : []).map(
        (s: any) => ({
          id: s.id,
          full_name: s.full_name,
          phone: s.phone || null,
          email: s.email || null,
          zalo_uid: s.zalo_uid || null,
          line_uid: s.line_uid || null,
          zaloLinked: Boolean(s.zalo_uid) || !zaloUnlinkedIds.has(Number(s.id)),
          lineLinked: Boolean(s.line_uid) || !lineUnlinkedIds.has(Number(s.id)),
        }),
      );

      setStudents(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'MATRIX') {
      loadCoverageMatrix();
    }
  }, [tab, loadCoverageMatrix]);

  const handleOmnichannelAutoSuggest = async () => {
    setSuggesting(true);
    try {
      const [zaloSug, lineSug] = await Promise.all([
        automationApi.autoSuggestLinks({}).catch(() => ({ items: [] })),
        lineApi.autoSuggestLinks({}).catch(() => ({ items: [], total: 0 })),
      ]);
      const zCount = zaloSug?.items?.length ?? 0;
      const lCount = lineSug?.items?.length ?? 0;
      toast.success(
        `Đã đối chiếu SĐT toàn hệ thống: Tìm thấy ${zCount} gợi ý Zalo và ${lCount} gợi ý LINE!`,
      );
      await loadCoverageMatrix();
    } finally {
      setSuggesting(false);
    }
  };

  const handleGenerateLineQr = async (student: StudentCoverageRow) => {
    try {
      const lineAccs = await lineApi.listAccounts();
      const targetAcc = lineAccs.find((a) => a.account_type === 'OA') || lineAccs[0];
      if (!targetAcc) {
        toast.error('Vui lòng thêm ít nhất 1 tài khoản LINE trước khi tạo mã QR');
        return;
      }
      const res = await lineApi.generateDeepLink({
        student_id: student.id,
        line_account_id: targetAcc.id,
      });
      setDeepLinkModal({
        studentName: student.full_name,
        linkCode: res.linkCode,
        deepLinkUrl: res.deepLinkUrl,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Không thể tạo mã QR LINE');
    }
  };

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.phone && s.phone.includes(q)) ||
        (s.zalo_uid && s.zalo_uid.toLowerCase().includes(q)) ||
        (s.line_uid && s.line_uid.toLowerCase().includes(q)),
    );
  }, [students, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Top Omnichannel Header & Mode Switcher */}
      <div className="mx-4 mt-4 p-3.5 rounded-2xl bg-surface border border-border shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 text-white flex items-center justify-center">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary">
              Liên kết Học viên Đa kênh 360° (Student ↔ Zalo & LINE)
            </h1>
            <p className="text-xs text-text-muted">
              Theo dõi trạng thái kết nối Zalo và LINE của từng học viên trên cùng một bảng ma trận
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-surface-muted p-1 rounded-xl border border-border">
          <button
            onClick={() => setTab('MATRIX')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === 'MATRIX'
                ? 'bg-surface text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ma trận 360° (Zalo + LINE)
          </button>
          <button
            onClick={() => setTab('ZALO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === 'ZALO'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Liên kết HV ↔ Zalo
          </button>
          <button
            onClick={() => setTab('LINE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === 'LINE'
                ? 'bg-[#06C755] text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Liên kết HV ↔ LINE (QR 2-Chạm)
          </button>
        </div>
      </div>

      {tab === 'ZALO' ? (
        <StudentZaloLinkPage />
      ) : tab === 'LINE' ? (
        <StudentLineLinkPage />
      ) : (
        <div className="px-4 pb-6 space-y-4">
          <div className="p-4 rounded-2xl bg-surface border border-border flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-64 max-w-md">
              <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên học viên, SĐT, Zalo UID, LINE UID..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-border bg-surface-muted/60 focus:bg-surface focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOmnichannelAutoSuggest}
                disabled={suggesting}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {suggesting
                  ? 'Đang quét SĐT Zalo + LINE...'
                  : 'Gợi ý Tự động Đa kênh (Khớp SĐT Zalo + LINE)'}
              </button>
              <button
                onClick={loadCoverageMatrix}
                className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium flex items-center gap-1.5 hover:bg-surface-muted"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Làm mới
              </button>
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-muted/70 border-b border-border text-[11px] font-bold text-text-muted uppercase">
                    <th className="py-3 px-4">Học viên</th>
                    <th className="py-3 px-4">Số điện thoại</th>
                    <th className="py-3 px-4">Trạng thái Kênh Zalo</th>
                    <th className="py-3 px-4">Trạng thái Kênh LINE</th>
                    <th className="py-3 px-4 text-right">Thao tác nhanh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-text-muted">
                        Đang tải ma trận liên kết học viên...
                      </td>
                    </tr>
                  ) : filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-text-muted">
                        Không tìm thấy học viên nào.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((st) => (
                      <tr key={st.id} className="hover:bg-surface-muted/40 transition-colors">
                        <td className="py-3 px-4 font-semibold text-text-primary">
                          {st.full_name}
                          <div className="text-[11px] font-normal text-text-muted">
                            ID: #{st.id}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-text-secondary">
                          {st.phone || <span className="text-text-muted italic">Chưa có SĐT</span>}
                        </td>
                        <td className="py-3 px-4">
                          {st.zaloLinked ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Đã liên kết Zalo {st.zalo_uid ? `(${st.zalo_uid})` : ''}
                            </span>
                          ) : (
                            <button
                              onClick={() => setTab('ZALO')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 font-medium text-[11px]"
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              Chưa gắn Zalo · Gắn ngay
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {st.lineLinked ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Đã liên kết LINE {st.line_uid ? `(${st.line_uid.slice(0, 10)}...)` : ''}
                            </span>
                          ) : (
                            <button
                              onClick={() => setTab('LINE')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-muted text-text-secondary hover:bg-emerald-500/10 hover:text-emerald-700 font-medium text-[11px]"
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              Chưa gắn LINE · Gắn ngay
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => handleGenerateLineQr(st)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#06C755]/10 text-[#06C755] hover:bg-[#06C755] hover:text-white font-semibold text-[11px] transition-colors"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            QR LINE 2-Chạm
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2-Tap LINE OA QR Modal */}
      {deepLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-border shadow-xl max-w-md w-full p-5 space-y-4 text-center">
            <h3 className="text-sm font-bold text-text-primary">
              Mã QR Liên kết LINE 2-Chạm cho {deepLinkModal.studentName}
            </h3>
            <p className="text-xs text-text-muted">
              Phụ huynh / Học viên quét mã QR dưới đây và bấm Gửi tin nhắn có sẵn mã{' '}
              <strong className="text-primary">{deepLinkModal.linkCode}</strong> để tự động liên kết
              tức thì (0 Quota)!
            </p>
            <div className="flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  deepLinkModal.deepLinkUrl,
                )}`}
                alt="LINE Deep Link QR"
                className="w-48 h-48 rounded-xl border border-border p-2 bg-white"
              />
            </div>
            <div className="p-2.5 rounded-xl bg-surface-muted text-[11px] font-mono break-all flex items-center justify-between gap-2">
              <span className="truncate">{deepLinkModal.deepLinkUrl}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(deepLinkModal.deepLinkUrl);
                  toast.success('Đã sao chép đường dẫn liên kết LINE!');
                }}
                className="p-1.5 rounded-lg bg-surface border border-border hover:bg-primary-soft shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setDeepLinkModal(null)}
              className="w-full py-2 rounded-xl bg-primary text-white text-xs font-semibold"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
