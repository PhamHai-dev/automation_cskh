import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Attendance,
  AttendanceSide,
  AttendanceStatus,
  ClassSession,
} from '../types/classes.types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Edit3,
  FileText,
  Plus,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

export interface AttendanceDrawerStatusConfig {
  label: string;
  short: string;
  bg: string;
  text: string;
  border: string;
}

export const DRAWER_STATUS_CONFIG: Record<AttendanceStatus, AttendanceDrawerStatusConfig> = {
  ATTENDED: {
    label: 'Có mặt',
    short: '1',
    bg: 'bg-emerald-100 hover:bg-emerald-200',
    text: 'text-emerald-800 font-extrabold',
    border: 'border-emerald-300',
  },
  ABSENT_APPROVED_A: {
    label: 'Nghỉ có phép',
    short: 'A',
    bg: 'bg-amber-100 hover:bg-amber-200',
    text: 'text-amber-800 font-extrabold',
    border: 'border-amber-300',
  },
  LEAVE_B: {
    label: 'Bảo lưu',
    short: 'B',
    bg: 'bg-blue-100 hover:bg-blue-200',
    text: 'text-blue-800 font-extrabold',
    border: 'border-blue-300',
  },
  ABSENT_UNAPPROVED_C: {
    label: 'Nghỉ không phép',
    short: 'C',
    bg: 'bg-rose-100 hover:bg-rose-200',
    text: 'text-rose-800 font-extrabold',
    border: 'border-rose-300',
  },
  TEACHER_ABSENT_D: {
    label: 'GV nghỉ',
    short: 'D',
    bg: 'bg-red-200 hover:bg-red-300',
    text: 'text-red-900 font-extrabold',
    border: 'border-red-400',
  },
  TECH_ERROR_E: {
    label: 'Lỗi kỹ thuật',
    short: 'E',
    bg: 'bg-slate-200 hover:bg-slate-300',
    text: 'text-slate-800 font-extrabold',
    border: 'border-slate-400',
  },
};

export const DRAWER_STATUS_LIST: Array<{ status: AttendanceStatus; code: string; label: string }> = [
  { status: 'ATTENDED', code: '1', label: 'Có mặt' },
  { status: 'ABSENT_APPROVED_A', code: 'A', label: 'Nghỉ có phép' },
  { status: 'LEAVE_B', code: 'B', label: 'Bảo lưu' },
  { status: 'ABSENT_UNAPPROVED_C', code: 'C', label: 'Nghỉ không phép' },
  { status: 'TEACHER_ABSENT_D', code: 'D', label: 'GV nghỉ' },
  { status: 'TECH_ERROR_E', code: 'E', label: 'Lỗi kỹ thuật' },
];

export interface AttendanceSessionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  studentCode?: string | null;
  className?: string;
  classCode?: string | null;
  dateStr: string;
  daySessions: ClassSession[];
  selectedSessionNumber: number; // 1-based index in daySessions; if === daySessions.length + 1 => new session draft
  onSelectSessionNumber: (sessionNumber: number) => void;
  getAttendanceForSession: (session: ClassSession | undefined) => Attendance | undefined;
  side: AttendanceSide;
  canEditTeacherFields: boolean;
  canEditCsFields: boolean;
  canMarkStatus: boolean;
  canDeleteSession?: boolean;
  defaultEditing?: boolean;
  saving?: boolean;
  onSaveStatusAndNotes: (params: {
    session: ClassSession | undefined;
    sessionNumber: number;
    status: AttendanceStatus;
    lesson_topic?: string | null;
    teacher_note?: string | null;
    cs_note?: string | null;
  }) => Promise<void> | void;
  onSaveNotesOnly?: (params: {
    session: ClassSession | undefined;
    sessionNumber: number;
    lesson_topic: string | null;
    teacher_note: string | null;
    cs_note?: string | null;
  }) => Promise<void> | void;
  onClearStatus?: (session: ClassSession) => Promise<void> | void;
  onDeleteSession?: (session: ClassSession) => Promise<void> | void;
}

export const AttendanceSessionDrawer: React.FC<AttendanceSessionDrawerProps> = ({
  isOpen,
  onClose,
  studentName,
  studentCode,
  className,
  classCode,
  dateStr,
  daySessions,
  selectedSessionNumber,
  onSelectSessionNumber,
  getAttendanceForSession,
  side,
  canEditTeacherFields,
  canEditCsFields,
  canMarkStatus,
  canDeleteSession = false,
  defaultEditing = false,
  saving = false,
  onSaveStatusAndNotes,
  onSaveNotesOnly,
  onClearStatus,
  onDeleteSession,
}) => {
  const canEditAnything = canEditTeacherFields || canEditCsFields || canMarkStatus;

  const getAdminFinalizedStatus = (record: Attendance | undefined): AttendanceStatus | undefined => {
    if (!record) return undefined;
    if (record.reconciliation_state === 'RESOLVED') {
      return record.status as AttendanceStatus | undefined;
    }
    if (
      record.reconciliation_state === 'MATCHED' ||
      (!record.reconciliation_state &&
        Boolean(record.teacher_status && record.cs_status && record.teacher_status === record.cs_status))
    ) {
      return (record.status || record.cs_status || record.teacher_status) as AttendanceStatus | undefined;
    }
    return undefined;
  };

  const getSideStatusForRecord = (record: Attendance | undefined): AttendanceStatus | undefined => {
    if (side === 'TEACHER') return (record?.teacher_status as AttendanceStatus | undefined) || undefined;
    if (side === 'CS') return (record?.cs_status as AttendanceStatus | undefined) || undefined;
    return getAdminFinalizedStatus(record);
  };

  interface CaDraft {
    status: AttendanceStatus | undefined;
    lessonTopic: string;
    teacherNote: string;
    csNote: string;
    dirty: boolean;
  }

  const buildInitialDrafts = (): Record<number, CaDraft> => {
    const count = Math.max(1, daySessions.length, selectedSessionNumber);
    const map: Record<number, CaDraft> = {};
    for (let caNo = 1; caNo <= count; caNo++) {
      const sess = daySessions[caNo - 1];
      const rec = getAttendanceForSession(sess);
      map[caNo] = {
        status: getSideStatusForRecord(rec),
        lessonTopic: rec?.lesson_topic || '',
        teacherNote: rec?.teacher_note || '',
        csNote: rec?.cs_note || '',
        dirty: false,
      };
    }
    return map;
  };

  const [isEditing, setIsEditing] = useState<boolean>(defaultEditing);
  const [maxCaCount, setMaxCaCount] = useState<number>(Math.max(1, daySessions.length, selectedSessionNumber));
  const [draftsByCa, setDraftsByCa] = useState<Record<number, CaDraft>>(buildInitialDrafts);

  // Chỉ khởi tạo lại chế độ sửa khi đóng/mở Drawer hoặc đổi ngày/học viên (KHÔNG thoát sửa khi chuyển qua lại giữa các Ca)
  useEffect(() => {
    if (!isOpen) return;
    const initialHasSession = Boolean(daySessions[selectedSessionNumber - 1]);
    setIsEditing(Boolean(defaultEditing || !initialHasSession));
    setMaxCaCount(Math.max(1, daySessions.length, selectedSessionNumber));
    setDraftsByCa(buildInitialDrafts());
  }, [isOpen, dateStr, studentName]);

  // Đồng bộ dữ liệu mới từ server cho những Ca chưa bị người dùng chỉnh sửa (dirty = false)
  useEffect(() => {
    if (!isOpen) return;
    setMaxCaCount((prev) => Math.max(prev, daySessions.length, selectedSessionNumber));
    setDraftsByCa((prev) => {
      const next: Record<number, CaDraft> = { ...prev };
      const count = Math.max(1, daySessions.length, selectedSessionNumber, Object.keys(prev).length);
      for (let caNo = 1; caNo <= count; caNo++) {
        const sess = daySessions[caNo - 1];
        const rec = getAttendanceForSession(sess);
        const existing = prev[caNo];
        if (!existing || !existing.dirty) {
          next[caNo] = {
            status: getSideStatusForRecord(rec),
            lessonTopic: rec?.lesson_topic || '',
            teacherNote: rec?.teacher_note || '',
            csNote: rec?.cs_note || '',
            dirty: false,
          };
        }
      }
      return next;
    });
  }, [daySessions, selectedSessionNumber, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeSession = daySessions[selectedSessionNumber - 1];
  const att = getAttendanceForSession(activeSession);
  const activeSideStatus = getSideStatusForRecord(att);
  const currentDraft: CaDraft = draftsByCa[selectedSessionNumber] || {
    status: activeSideStatus,
    lessonTopic: att?.lesson_topic || '',
    teacherNote: att?.teacher_note || '',
    csNote: att?.cs_note || '',
    dirty: false,
  };

  const updateCurrentDraft = (patch: Partial<Omit<CaDraft, 'dirty'>>) => {
    setDraftsByCa((prev) => ({
      ...prev,
      [selectedSessionNumber]: {
        ...currentDraft,
        ...patch,
        dirty: true,
      },
    }));
  };

  const formattedDate = (() => {
    if (!dateStr) return '—';
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  })();

  const isCreatingNewCa = !activeSession;
  const totalCaTabs = Math.max(daySessions.length, selectedSessionNumber, maxCaCount);

  const teacherCfg = att?.teacher_status ? DRAWER_STATUS_CONFIG[att.teacher_status] : null;
  const csCfg = att?.cs_status ? DRAWER_STATUS_CONFIG[att.cs_status] : null;
  const adminFinalStatus = getAdminFinalizedStatus(att);
  const adminFinalCfg = adminFinalStatus ? DRAWER_STATUS_CONFIG[adminFinalStatus] : null;
  const isConflict =
    att?.reconciliation_state === 'CONFLICT' ||
    Boolean(att?.teacher_status && att?.cs_status && att.teacher_status !== att.cs_status);

  // Chọn trạng thái trong chế độ Sửa: chỉ cập nhật nháp của Ca hiện tại để người dùng có thể
  // chuyển qua các Ca khác sửa tiếp rồi bấm "Lưu thông tin" 1 lần.
  const handleSelectDraftStatus = (st: AttendanceStatus) => {
    updateCurrentDraft({ status: st });
  };

  const handleCancelEdit = () => {
    setDraftsByCa(buildInitialDrafts());
    setMaxCaCount(Math.max(1, daySessions.length));
    if (selectedSessionNumber > Math.max(1, daySessions.length)) {
      onSelectSessionNumber(Math.max(1, daySessions.length));
    }
    setIsEditing(false);
  };

  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Lưu lần lượt tất cả các Ca có thay đổi (dirty) hoặc Ca hiện tại nếu đang tạo mới
    const caNumbers = Array.from({ length: totalCaTabs }, (_, idx) => idx + 1);
    const dirtyCaNumbers = caNumbers.filter((caNo) => draftsByCa[caNo]?.dirty);
    const targets = dirtyCaNumbers.length > 0 ? dirtyCaNumbers : [selectedSessionNumber];

    for (const caNo of targets) {
      const sess = daySessions[caNo - 1];
      const rec = getAttendanceForSession(sess);
      const recSideStatus = getSideStatusForRecord(rec);
      const d = draftsByCa[caNo] || {
        status: recSideStatus,
        lessonTopic: rec?.lesson_topic || '',
        teacherNote: rec?.teacher_note || '',
        csNote: rec?.cs_note || '',
        dirty: false,
      };

      const effectiveStatus = d.status ?? recSideStatus;
      const hasNoteInput = Boolean(
        d.lessonTopic.trim() ||
          d.teacherNote.trim() ||
          d.csNote.trim() ||
          rec?.lesson_topic ||
          rec?.teacher_note ||
          rec?.cs_note
      );
      if (canMarkStatus && effectiveStatus) {
        await onSaveStatusAndNotes({
          session: sess,
          sessionNumber: caNo,
          status: effectiveStatus,
          ...(canEditTeacherFields
            ? {
                lesson_topic: d.lessonTopic.trim() || null,
                teacher_note: d.teacherNote.trim() || null,
              }
            : {}),
          ...(canEditCsFields
            ? {
                cs_note: d.csNote.trim() || null,
              }
            : {}),
        });
      } else if (onSaveNotesOnly && (sess || hasNoteInput)) {
        await onSaveNotesOnly({
          session: sess,
          sessionNumber: caNo,
          lesson_topic: d.lessonTopic.trim() || null,
          teacher_note: d.teacherNote.trim() || null,
          cs_note: d.csNote.trim() || null,
        });
      } else if (canMarkStatus && !sess && !rec) {
        await onSaveStatusAndNotes({
          session: sess,
          sessionNumber: caNo,
          status: 'ATTENDED',
          ...(canEditTeacherFields
            ? {
                lesson_topic: d.lessonTopic.trim() || null,
                teacher_note: d.teacherNote.trim() || null,
              }
            : {}),
          ...(canEditCsFields
            ? {
                cs_note: d.csNote.trim() || null,
              }
            : {}),
        });
      }
    }

    setIsEditing(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        role="dialog"
        aria-label={`Chi tiết điểm danh ${studentName}`}
        className="relative z-10 flex h-full w-full max-w-[440px] flex-col bg-surface shadow-2xl border-l border-border animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border bg-slate-50/80 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-base font-extrabold text-text-primary">
                {studentName}
              </span>
              {studentCode && (
                <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                  {studentCode}
                </span>
              )}
            </div>
            {(className || classCode) && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
                <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-700">{className}</span>
                {classCode && (
                  <span className="font-mono text-[11px] text-text-muted">({classCode})</span>
                )}
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>{formattedDate}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted transition hover:bg-slate-200/60 hover:text-text-primary"
              title="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Thanh chọn Ca học trong ngày */}
        <div className="border-b border-border/80 bg-white px-5 py-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Chọn ca học trong ngày{' '}
              {isEditing && (
                <span className="normal-case font-semibold text-primary">
                  (chuyển ca không mất nội dung đang sửa)
                </span>
              )}
            </span>
            {activeSession && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <Clock className="h-3 w-3 text-slate-400" />
                <span>
                  Buổi #{activeSession.session_number}
                  {activeSession.start_time ? ` · ${activeSession.start_time}` : ''}
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {Array.from({ length: totalCaTabs }, (_, idx) => {
              const caNo = idx + 1;
              const sess = daySessions[idx];
              const sessAtt = getAttendanceForSession(sess);
              const draftForCa = draftsByCa[caNo];
              const st =
                isEditing && draftForCa?.dirty
                  ? draftForCa.status
                  : getSideStatusForRecord(sessAtt);
              const cfg = st ? DRAWER_STATUS_CONFIG[st as AttendanceStatus] : null;
              const isSelected = selectedSessionNumber === caNo;

              return (
                <button
                  key={sess?.id ?? `new-${caNo}`}
                  type="button"
                  onClick={() => onSelectSessionNumber(caNo)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition ${
                    isSelected
                      ? 'border-primary bg-primary text-white shadow-xs'
                      : 'border-border bg-slate-50 text-text-primary hover:bg-slate-100'
                  }`}
                >
                  <span>Ca {caNo}</span>
                  {cfg ? (
                    <span
                      className={`inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-extrabold ${
                        isSelected ? 'bg-white/25 text-white' : `${cfg.bg} ${cfg.text}`
                      }`}
                    >
                      {cfg.short}
                    </span>
                  ) : !sess ? (
                    <span className="text-[10px] opacity-80">(Mới)</span>
                  ) : (
                    <span
                      className={`inline-flex h-4 min-w-4 items-center justify-center rounded border border-dashed px-1 text-[10px] font-bold ${
                        isSelected
                          ? 'border-white/60 bg-white/15 text-white'
                          : 'border-slate-400 bg-white text-slate-500'
                      }`}
                      title="Ca đã tạo nhưng chưa chấm điểm danh"
                    >
                      ?
                    </span>
                  )}
                  {isEditing && draftForCa?.dirty && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-amber-200' : 'bg-amber-500'}`}
                      title="Ca này có thay đổi chưa lưu"
                    />
                  )}
                </button>
              );
            })}

            {canMarkStatus && isEditing && totalCaTabs >= 1 && (
              <button
                type="button"
                onClick={() => {
                  const nextCa = totalCaTabs + 1;
                  setMaxCaCount(nextCa);
                  onSelectSessionNumber(nextCa);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-primary/60 bg-primary-soft/40 px-2.5 text-xs font-bold text-primary transition hover:bg-primary-soft"
                title="Thêm ca học mới trong ngày này"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Thêm ca {totalCaTabs + 1}</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSaveAll} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isCreatingNewCa ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900">
              <span className="font-bold">Đang tạo Ca {selectedSessionNumber} mới:</span> Chọn trạng thái điểm danh rồi bấm <strong>Lưu thông tin</strong> ở cuối khung.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                  Tóm tắt trạng thái Ca {selectedSessionNumber}
                </span>
                {att?.reconciliation_state === 'RESOLVED' ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-800">
                    ✓ Admin đã chốt: {adminFinalCfg ? `${adminFinalCfg.short} · ${adminFinalCfg.label}` : '—'}
                  </span>
                ) : isConflict ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-800">
                    ! Hai bên lệch ({teacherCfg?.short || '?'} ≠ {csCfg?.short || '?'}) — Chờ Admin chốt
                  </span>
                ) : adminFinalCfg ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                    Đã khớp 2 bên: {adminFinalCfg.short} · {adminFinalCfg.label}
                  </span>
                ) : teacherCfg && !csCfg ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    Mới GV chấm ({teacherCfg.short}) — Chờ CSKH chấm
                  </span>
                ) : !teacherCfg && csCfg ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    Mới CSKH chấm ({csCfg.short}) — Chờ GV chấm
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-400 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    ? Đã mở ca — Cả GV & CSKH đều chưa chấm
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10px] font-semibold text-slate-500">Giáo viên</div>
                  <div className="mt-0.5 font-bold text-slate-800">
                    {teacherCfg ? `${teacherCfg.short} · ${teacherCfg.label}` : 'Chưa chấm'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10px] font-semibold text-slate-500">CSKH</div>
                  <div className="mt-0.5 font-bold text-slate-800">
                    {csCfg ? `${csCfg.short} · ${csCfg.label}` : 'Chưa chấm'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10px] font-semibold text-slate-500">Kết quả chốt</div>
                  <div className="mt-0.5 font-bold text-slate-800">
                    {adminFinalCfg ? `${adminFinalCfg.short} · ${adminFinalCfg.label}` : 'Chưa chốt'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* BOX 1: THÔNG TIN GIÁO VIÊN (Điểm danh GV + Bài học + Ghi chú GV)   */}
          {/* ================================================================= */}
          <div className="rounded-xl border border-teal-200/80 bg-teal-50/25 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-teal-200/60 pb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-teal-950">
                <BookOpen className="h-4 w-4 text-teal-600 shrink-0" />
                <span>1. Giáo viên (Ca {selectedSessionNumber})</span>
              </div>
              {(() => {
                const displaySt =
                  side === 'TEACHER' && isEditing
                    ? currentDraft.status ?? (att?.teacher_status as AttendanceStatus | undefined)
                    : (att?.teacher_status as AttendanceStatus | undefined);
                const cfg = displaySt ? DRAWER_STATUS_CONFIG[displaySt] : null;
                return cfg ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-extrabold ${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`}
                  >
                    GV: {cfg.short} · {cfg.label}
                  </span>
                ) : (
                  <Badge variant="neutral" size="sm">
                    GV: — · Chưa chấm
                  </Badge>
                );
              })()}
            </div>

            {side === 'TEACHER' && canMarkStatus && isEditing && (
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Chọn trạng thái điểm danh Giáo viên
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {DRAWER_STATUS_LIST.map(({ status, code, label }) => {
                    const cfg = DRAWER_STATUS_CONFIG[status];
                    const isActive = (currentDraft.status ?? activeSideStatus) === status;
                    return (
                      <button
                        key={status}
                        id={`attendance-${activeSession?.id ?? 'draft'}-${status}`}
                        type="button"
                        disabled={saving}
                        onClick={() => handleSelectDraftStatus(status)}
                        className={`flex h-9 items-center justify-between rounded-lg border px-2.5 text-left text-xs font-bold transition ${
                          isActive
                            ? 'ring-2 ring-primary ring-offset-1 shadow-xs'
                            : 'opacity-90 hover:opacity-100'
                        } ${cfg.bg} ${cfg.text} ${cfg.border} disabled:opacity-50`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/70 text-[11px] font-black">
                            {code}
                          </span>
                          <span>{label}</span>
                        </span>
                        {isActive && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {canEditTeacherFields && isEditing ? (
              <div className="space-y-2.5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Nội dung bài học (Ca {selectedSessionNumber})
                  </label>
                  <input
                    type="text"
                    value={currentDraft.lessonTopic}
                    onChange={(e) => updateCurrentDraft({ lessonTopic: e.target.value })}
                    placeholder="VD: Bài 5 - Ngữ pháp N4, Kaiwa chủ đề Gia đình..."
                    className="h-9 w-full rounded-lg border border-border bg-white px-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Ghi chú của Giáo viên (Ca {selectedSessionNumber})
                  </label>
                  <textarea
                    rows={2}
                    value={currentDraft.teacherNote}
                    onChange={(e) => updateCurrentDraft({ teacherNote: e.target.value })}
                    placeholder="Nhận xét buổi học, bài tập về nhà, thái độ học tập..."
                    className="w-full rounded-lg border border-border bg-white p-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-border/60 bg-white px-3 py-2">
                  <div className="text-[10px] font-bold uppercase text-text-muted">Trạng thái điểm danh GV</div>
                  <div className="mt-0.5 font-bold text-slate-800">
                    {teacherCfg ? (
                      <span>{teacherCfg.short} · {teacherCfg.label}</span>
                    ) : (
                      <span className="font-normal italic text-text-muted">— · Chưa điểm danh</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-white px-3 py-2">
                  <div className="text-[10px] font-bold uppercase text-text-muted">Nội dung bài học</div>
                  <div className="mt-0.5 font-semibold text-teal-800">
                    {att?.lesson_topic || <span className="font-normal italic text-text-muted">Chưa ghi bài học</span>}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-white px-3 py-2">
                  <div className="text-[10px] font-bold uppercase text-text-muted">Ghi chú buổi học (GV)</div>
                  <div className="mt-0.5 text-text-secondary">
                    {att?.teacher_note ? (
                      <span className="italic">"{att.teacher_note}"</span>
                    ) : (
                      <span className="italic text-text-muted">Chưa có ghi chú</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* BOX 2: THÔNG TIN CSKH (Điểm danh CSKH + Ghi chú CSKH)              */}
          {/* ================================================================= */}
          {(side !== 'TEACHER' || att?.cs_status || att?.cs_note) && (
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-blue-200/60 pb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-blue-950">
                  <UserCheck className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>2. CSKH (Ca {selectedSessionNumber})</span>
                </div>
                {(() => {
                  const displaySt =
                    side === 'CS' && isEditing
                      ? currentDraft.status ?? (att?.cs_status as AttendanceStatus | undefined)
                      : (att?.cs_status as AttendanceStatus | undefined);
                  const cfg = displaySt ? DRAWER_STATUS_CONFIG[displaySt] : null;
                  return cfg ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-extrabold ${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`}
                    >
                      CSKH: {cfg.short} · {cfg.label}
                    </span>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      CSKH: — · Chưa chấm
                    </Badge>
                  );
                })()}
              </div>

              {side === 'CS' && canMarkStatus && isEditing ? (
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Chọn trạng thái điểm danh CSKH
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {DRAWER_STATUS_LIST.map(({ status, code, label }) => {
                      const cfg = DRAWER_STATUS_CONFIG[status];
                      const isActive = (currentDraft.status ?? activeSideStatus) === status;
                      return (
                        <button
                          key={status}
                          id={`attendance-${activeSession?.id ?? 'draft'}-${status}`}
                          type="button"
                          disabled={saving}
                          onClick={() => handleSelectDraftStatus(status)}
                          className={`flex h-9 items-center justify-between rounded-lg border px-2.5 text-left text-xs font-bold transition ${
                            isActive
                              ? 'ring-2 ring-primary ring-offset-1 shadow-xs'
                              : 'opacity-90 hover:opacity-100'
                          } ${cfg.bg} ${cfg.text} ${cfg.border} disabled:opacity-50`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/70 text-[11px] font-black">
                              {code}
                            </span>
                            <span>{label}</span>
                          </span>
                          {isActive && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-white px-3 py-2 text-xs">
                  <div className="text-[10px] font-bold uppercase text-text-muted">Trạng thái điểm danh CSKH</div>
                  <div className="mt-0.5 font-bold text-slate-800">
                    {csCfg ? (
                      <span>{csCfg.short} · {csCfg.label}</span>
                    ) : (
                      <span className="font-normal italic text-text-muted">— · Chưa điểm danh</span>
                    )}
                  </div>
                </div>
              )}

              {canEditCsFields && isEditing ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Ghi chú của CSKH (Ca {selectedSessionNumber})
                  </label>
                  <textarea
                    rows={2}
                    value={currentDraft.csNote}
                    onChange={(e) => updateCurrentDraft({ csNote: e.target.value })}
                    placeholder="Ghi chú xác nhận từ phụ huynh/học viên, lý do nghỉ..."
                    className="w-full rounded-lg border border-border bg-white p-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-white px-3 py-2 text-xs">
                  <div className="text-[10px] font-bold uppercase text-text-muted">Ghi chú CSKH</div>
                  <div className="mt-0.5 text-text-secondary">
                    {att?.cs_note ? (
                      <span className="italic">"{att.cs_note}"</span>
                    ) : (
                      <span className="italic text-text-muted">Chưa có ghi chú CSKH</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* BOX 3: THÔNG TIN ADMIN / ĐIỂM DANH CHỐT & ĐỐI SOÁT                 */}
          {/* ================================================================= */}
          {side !== 'TEACHER' && (
            <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-950">
                  <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>3. Admin — Điểm danh chốt (Ca {selectedSessionNumber})</span>
                </div>
                {(() => {
                  const displaySt =
                    side === 'ADMIN' && isEditing
                      ? currentDraft.status ?? adminFinalStatus
                      : adminFinalStatus;
                  const cfg = displaySt ? DRAWER_STATUS_CONFIG[displaySt] : null;
                  return cfg ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-extrabold ${cfg.bg.replace(/\s*hover:\S+/g, '')} ${cfg.text} ${cfg.border}`}
                    >
                      Chốt: {cfg.short} · {cfg.label}
                    </span>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      Chốt: —
                    </Badge>
                  );
                })()}
              </div>

              {side === 'ADMIN' && canMarkStatus && isEditing ? (
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Chọn trạng thái điểm danh chốt (Admin)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {DRAWER_STATUS_LIST.map(({ status, code, label }) => {
                      const cfg = DRAWER_STATUS_CONFIG[status];
                      const isActive = (currentDraft.status ?? adminFinalStatus) === status;
                      return (
                        <button
                          key={status}
                          id={`attendance-${activeSession?.id ?? 'draft'}-${status}`}
                          type="button"
                          disabled={saving}
                          onClick={() => handleSelectDraftStatus(status)}
                          className={`flex h-9 items-center justify-between rounded-lg border px-2.5 text-left text-xs font-bold transition ${
                            isActive
                              ? 'ring-2 ring-primary ring-offset-1 shadow-xs'
                              : 'opacity-90 hover:opacity-100'
                          } ${cfg.bg} ${cfg.text} ${cfg.border} disabled:opacity-50`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/70 text-[11px] font-black">
                              {code}
                            </span>
                            <span>{label}</span>
                          </span>
                          {isActive && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-white px-3 py-2 text-xs">
                  <div className="text-[10px] font-bold uppercase text-text-muted">Kết quả điểm danh chốt</div>
                  <div className="mt-0.5 font-bold text-slate-800">
                    {adminFinalCfg ? (
                      <span>{adminFinalCfg.short} · {adminFinalCfg.label}</span>
                    ) : (
                      <span className="font-normal italic text-text-muted">— · Chưa có kết quả chốt</span>
                    )}
                  </div>
                </div>
              )}

              {/* Dòng trạng thái đối chiếu 2 bên */}
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2 text-xs">
                <div className="text-[10px] font-bold uppercase text-text-muted">Trạng thái đối soát</div>
                <div className="mt-0.5 font-semibold">
                  {!att || (!att.teacher_status && !att.cs_status && !adminFinalCfg) ? (
                    <span className="italic font-normal text-text-muted">Chưa bên nào chấm điểm</span>
                  ) : att.reconciliation_state === 'RESOLVED' ? (
                    <span className="text-violet-700">Đã phân xử bởi Admin</span>
                  ) : adminFinalCfg ? (
                    <span className="text-emerald-700">Đã khớp giữa Giáo viên & CSKH</span>
                  ) : isConflict ? (
                    <span className="text-rose-600">
                      Lệch (GV: {teacherCfg?.short || '?'} · CSKH: {csCfg?.short || '?'}) — chờ Admin chốt
                    </span>
                  ) : att.teacher_status && !att.cs_status ? (
                    <span className="text-amber-700">
                      Chờ CSKH chấm (GV: {teacherCfg?.short || '?'})
                    </span>
                  ) : (
                    <span className="text-amber-700">
                      Chờ GV chấm (CSKH: {csCfg?.short || '?'})
                    </span>
                  )}
                </div>
                {att?.resolution_note && (
                  <div className="mt-1.5 border-t border-border/50 pt-1.5 text-[11px] text-text-secondary">
                    <span className="font-semibold text-slate-700">Ghi chú phân xử: </span>
                    <span>{att.resolution_note}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Thao tác xóa duy nhất theo phạm vi của vai trò đang đăng nhập (chỉ hiện khi đang Sửa) */}
          {isEditing && activeSession && ((canDeleteSession && onDeleteSession) || onClearStatus) && (
            <div className="border-t border-border/70 pt-3 flex items-center justify-end">
              <button
                id={`delete-session-${activeSession.id}`}
                type="button"
                disabled={saving}
                onClick={() => {
                  if (canDeleteSession && onDeleteSession) {
                    onDeleteSession(activeSession);
                  } else if (onClearStatus) {
                    onClearStatus(activeSession);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                title="Xóa dữ liệu điểm danh của bạn ở ca này (nếu ca chưa có bên nào khác chấm sẽ tự gỡ bỏ ca)"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Xóa ca / điểm danh Ca {selectedSessionNumber}</span>
              </button>
            </div>
          )}
        </form>

        {/* Footer (chuẩn hóa duy nhất 1 nút Sửa ở đây; khi đang sửa thì hiện Hủy sửa + Lưu thông tin) */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-slate-50 px-5 py-3.5">
          {isEditing && daySessions.length > 0 && !defaultEditing ? (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleCancelEdit}
              disabled={saving}
            >
              Hủy sửa
            </Button>
          ) : (
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={saving}>
              Đóng
            </Button>
          )}

          {canEditAnything &&
            (isEditing ? (
              <Button
                variant="primary"
                size="sm"
                type="button"
                disabled={saving}
                onClick={() => void handleSaveAll()}
                leftIcon={<Check className="h-4 w-4" />}
              >
                {saving ? 'Đang lưu...' : 'Lưu thông tin'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => setIsEditing(true)}
                leftIcon={<Edit3 className="h-3.5 w-3.5" />}
              >
                Sửa thông tin
              </Button>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
