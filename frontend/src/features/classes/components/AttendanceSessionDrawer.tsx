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
  RotateCcw,
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
  const activeSession = daySessions[selectedSessionNumber - 1];
  const att = getAttendanceForSession(activeSession);
  const canEditAnything = canEditTeacherFields || canEditCsFields || canMarkStatus;

  const activeSideStatus: AttendanceStatus | undefined =
    side === 'TEACHER'
      ? (att?.teacher_status as AttendanceStatus | undefined)
      : side === 'CS'
      ? (att?.cs_status as AttendanceStatus | undefined)
      : ((att?.status || att?.cs_status || att?.teacher_status) as AttendanceStatus | undefined);

  const [isEditing, setIsEditing] = useState<boolean>(defaultEditing);
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus | undefined>(activeSideStatus);
  const [lessonTopic, setLessonTopic] = useState<string>(att?.lesson_topic || '');
  const [teacherNote, setTeacherNote] = useState<string>(att?.teacher_note || '');
  const [csNote, setCsNote] = useState<string>(att?.cs_note || '');

  useEffect(() => {
    setIsEditing(defaultEditing || !activeSession);
    setSelectedStatus(activeSideStatus);
    setLessonTopic(att?.lesson_topic || '');
    setTeacherNote(att?.teacher_note || '');
    setCsNote(att?.cs_note || '');
  }, [
    isOpen,
    dateStr,
    selectedSessionNumber,
    activeSession?.id,
    att?.id,
    att?.teacher_status,
    att?.cs_status,
    att?.status,
    att?.lesson_topic,
    att?.teacher_note,
    att?.cs_note,
    activeSideStatus,
    defaultEditing,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
  const totalCaTabs = Math.max(daySessions.length, selectedSessionNumber);

  const teacherCfg = att?.teacher_status ? DRAWER_STATUS_CONFIG[att.teacher_status] : null;
  const csCfg = att?.cs_status ? DRAWER_STATUS_CONFIG[att.cs_status] : null;
  const isConflict =
    att?.reconciliation_state === 'CONFLICT' ||
    Boolean(att?.teacher_status && att?.cs_status && att.teacher_status !== att.cs_status);

  const handleQuickStatusClick = async (st: AttendanceStatus) => {
    setSelectedStatus(st);
    await onSaveStatusAndNotes({
      session: activeSession,
      sessionNumber: selectedSessionNumber,
      status: st,
      ...(canEditTeacherFields
        ? {
            lesson_topic: lessonTopic.trim() || null,
            teacher_note: teacherNote.trim() || null,
          }
        : {}),
      ...(canEditCsFields
        ? {
            cs_note: csNote.trim() || null,
          }
        : {}),
    });
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveStatus = selectedStatus || activeSideStatus || 'ATTENDED';
    if (canMarkStatus && (selectedStatus || !activeSession || !att)) {
      await onSaveStatusAndNotes({
        session: activeSession,
        sessionNumber: selectedSessionNumber,
        status: effectiveStatus,
        ...(canEditTeacherFields
          ? {
              lesson_topic: lessonTopic.trim() || null,
              teacher_note: teacherNote.trim() || null,
            }
          : {}),
        ...(canEditCsFields
          ? {
              cs_note: csNote.trim() || null,
            }
          : {}),
      });
    } else if (onSaveNotesOnly) {
      await onSaveNotesOnly({
        session: activeSession,
        sessionNumber: selectedSessionNumber,
        lesson_topic: lessonTopic.trim() || null,
        teacher_note: teacherNote.trim() || null,
        cs_note: csNote.trim() || null,
      });
    }
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
            {canEditAnything && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary-soft/60 px-2.5 text-xs font-bold text-primary transition hover:bg-primary-soft"
                title="Chuyển sang chế độ chỉnh sửa buổi học này"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Sửa</span>
              </button>
            )}
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
              Chọn ca học trong ngày
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
              const st =
                side === 'TEACHER'
                  ? sessAtt?.teacher_status
                  : side === 'CS'
                  ? sessAtt?.cs_status
                  : sessAtt?.status || sessAtt?.cs_status || sessAtt?.teacher_status;
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
                  ) : null}
                </button>
              );
            })}

            {canMarkStatus && isEditing && daySessions.length > 0 && selectedSessionNumber <= daySessions.length && (
              <button
                type="button"
                onClick={() => onSelectSessionNumber(daySessions.length + 1)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-primary/60 bg-primary-soft/40 px-2.5 text-xs font-bold text-primary transition hover:bg-primary-soft"
                title="Thêm ca học mới trong ngày này"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Thêm ca {daySessions.length + 1}</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSaveAll} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isCreatingNewCa && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900">
              <span className="font-bold">Đang tạo Ca {selectedSessionNumber} mới:</span> Chọn trạng thái điểm danh bên dưới để lưu ca học này.
            </div>
          )}

          {/* 1. Chọn trạng thái điểm danh (chỉ hiện khi đang ở chế độ Sửa) */}
          {canMarkStatus && isEditing && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  {side === 'TEACHER'
                    ? '1. Điểm danh của Giáo viên'
                    : side === 'CS'
                    ? '1. Điểm danh của CSKH'
                    : '1. Trạng thái điểm danh chốt'}
                </label>
                {activeSideStatus && (
                  <span className="text-[11px] font-semibold text-emerald-700">
                    Đang chọn: {DRAWER_STATUS_CONFIG[activeSideStatus].label}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {DRAWER_STATUS_LIST.map(({ status, code, label }) => {
                  const cfg = DRAWER_STATUS_CONFIG[status];
                  const isActive = (selectedStatus ?? activeSideStatus) === status;
                  return (
                    <button
                      key={status}
                      id={`attendance-${activeSession?.id ?? 'draft'}-${status}`}
                      type="button"
                      disabled={saving}
                      onClick={() => handleQuickStatusClick(status)}
                      className={`flex h-10 items-center justify-between rounded-xl border px-3 text-left text-xs font-bold transition ${
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

          {/* 2. Nội dung Bài học & Ghi chú Giáo viên */}
          <div className="rounded-xl border border-border/80 bg-slate-50/60 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                <BookOpen className="h-4 w-4 text-teal-600" />
                <span>Nội dung bài học & Nhận xét GV</span>
              </div>
              {teacherCfg ? (
                <Badge variant="success" size="sm">
                  GV: {teacherCfg.short} · {teacherCfg.label}
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  GV chưa chấm
                </Badge>
              )}
            </div>

            {canEditTeacherFields && isEditing ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Tên bài học riêng học viên (Ca {selectedSessionNumber})
                  </label>
                  <input
                    type="text"
                    value={lessonTopic}
                    onChange={(e) => setLessonTopic(e.target.value)}
                    placeholder="VD: Bài 5 - Ngữ pháp N4, Kaiwa chủ đề Gia đình..."
                    className="h-9 w-full rounded-lg border border-border bg-white px-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Ghi chú của Giáo viên (Ca {selectedSessionNumber})
                  </label>
                  <textarea
                    rows={3}
                    value={teacherNote}
                    onChange={(e) => setTeacherNote(e.target.value)}
                    placeholder="Nhận xét buổi học, bài tập về nhà, thái độ học tập..."
                    className="w-full rounded-lg border border-border bg-white p-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-border/60 bg-white px-3 py-2">
                  <div className="text-[10px] font-bold uppercase text-text-muted">Bài học</div>
                  <div className="mt-0.5 font-semibold text-teal-800">
                    {att?.lesson_topic || <span className="font-normal italic text-text-muted">Chưa ghi bài học</span>}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-white px-3 py-2">
                  <div className="text-[10px] font-bold uppercase text-text-muted">Ghi chú Giáo viên</div>
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

          {/* 3. Kết quả & Ghi chú bên CSKH */}
          {(canEditCsFields || side !== 'TEACHER' || att?.cs_status || att?.cs_note) && (
            <div className="rounded-xl border border-blue-200/70 bg-blue-50/35 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-blue-950">
                  <UserCheck className="h-4 w-4 text-blue-600" />
                  <span>Ghi nhận của CSKH</span>
                </div>
                {csCfg ? (
                  <Badge variant="info" size="sm">
                    CSKH: {csCfg.short} · {csCfg.label}
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="sm">
                    CSKH chưa chấm
                  </Badge>
                )}
              </div>

              {canEditCsFields && isEditing ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Ghi chú của CSKH (Ca {selectedSessionNumber})
                  </label>
                  <textarea
                    rows={3}
                    value={csNote}
                    onChange={(e) => setCsNote(e.target.value)}
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

          {/* 4. Trạng thái đối soát 2 bên */}
          {att && (
            <div
              className={`rounded-xl border p-3 text-xs ${
                isConflict
                  ? 'border-rose-200 bg-rose-50/70 text-rose-900'
                  : att.reconciliation_state === 'MATCHED' || att.reconciliation_state === 'RESOLVED'
                  ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                  : 'border-amber-200 bg-amber-50/60 text-amber-900'
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Trạng thái đối soát:</span>
                </span>
                <span>
                  {isConflict
                    ? 'Đang lệch (GV ≠ CSKH)'
                    : att.reconciliation_state === 'RESOLVED'
                    ? 'Đã phân xử'
                    : att.reconciliation_state === 'MATCHED'
                    ? 'Đã khớp'
                    : att.teacher_status && !att.cs_status
                    ? 'Chờ CSKH đối soát'
                    : 'Chờ Giáo viên điểm danh'}
                </span>
              </div>
              {att.resolution_note && (
                <div className="mt-1.5 border-t border-current/15 pt-1.5 text-[11px]">
                  <span className="font-semibold">Ghi chú phân xử: </span>
                  <span>{att.resolution_note}</span>
                </div>
              )}
            </div>
          )}

          {/* Các thao tác phụ: Bỏ điểm danh / Xóa buổi học (chỉ hiện khi đang Sửa) */}
          {isEditing && activeSession && (onClearStatus || (canDeleteSession && onDeleteSession)) && (
            <div className="border-t border-border/70 pt-3 flex flex-wrap items-center justify-between gap-2">
              {onClearStatus && activeSideStatus && (
                <button
                  id={`clear-attendance-${activeSession.id}`}
                  type="button"
                  disabled={saving}
                  onClick={() => onClearStatus(activeSession)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Bỏ điểm danh ca này</span>
                </button>
              )}

              {canDeleteSession && onDeleteSession && (
                <button
                  id={`delete-session-${activeSession.id}`}
                  type="button"
                  disabled={saving}
                  onClick={() => onDeleteSession(activeSession)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Xóa Ca {selectedSessionNumber} (toàn lớp)</span>
                </button>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-slate-50 px-5 py-3.5">
          {isEditing && activeSession && !defaultEditing ? (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsEditing(false)}
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
                onClick={async (e) => {
                  await handleSaveAll(e);
                  setIsEditing(false);
                }}
                leftIcon={<Check className="h-4 w-4" />}
              >
                {saving ? 'Đang lưu...' : 'Lưu thông tin'}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsEditing(true)}
                leftIcon={<Edit3 className="h-3.5 w-3.5" />}
              >
                Sửa buổi học này
              </Button>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
