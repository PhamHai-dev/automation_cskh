import React from 'react';
import { Check, FileText } from 'lucide-react';
import { Attendance, AttendanceStatus, ClassSession } from '../types/classes.types';

export type CellWorkflowCategory =
  | 'ADMIN_RESOLVED'
  | 'CONFLICT'
  | 'MATCHED'
  | 'PENDING_ONE_SIDE'
  | 'SESSION_UNMARKED';

export type MatrixCellFilter =
  | 'ALL'
  | 'CONFLICT'
  | 'PENDING_ONE_SIDE'
  | 'SESSION_UNMARKED'
  | 'MATCHED'
  | 'ADMIN_RESOLVED';

export const ATTENDANCE_CODE_CONFIG: Record<
  AttendanceStatus,
  {
    label: string;
    short: string;
    solidBg: string;
    solidText: string;
    solidBorder: string;
    dashedBg: string;
    dashedText: string;
    dashedBorder: string;
  }
> = {
  ATTENDED: {
    label: 'Có mặt',
    short: '1',
    solidBg: 'bg-emerald-100 hover:bg-emerald-200',
    solidText: 'text-emerald-900 font-extrabold',
    solidBorder: 'border-emerald-400',
    dashedBg: 'bg-emerald-50/80 hover:bg-emerald-100/80',
    dashedText: 'text-emerald-800 font-bold',
    dashedBorder: 'border-dashed border-emerald-500',
  },
  ABSENT_APPROVED_A: {
    label: 'Nghỉ phép (A)',
    short: 'A',
    solidBg: 'bg-amber-100 hover:bg-amber-200',
    solidText: 'text-amber-900 font-extrabold',
    solidBorder: 'border-amber-400',
    dashedBg: 'bg-amber-50/80 hover:bg-amber-100/80',
    dashedText: 'text-amber-800 font-bold',
    dashedBorder: 'border-dashed border-amber-500',
  },
  LEAVE_B: {
    label: 'Bảo lưu (B)',
    short: 'B',
    solidBg: 'bg-blue-100 hover:bg-blue-200',
    solidText: 'text-blue-900 font-extrabold',
    solidBorder: 'border-blue-400',
    dashedBg: 'bg-blue-50/80 hover:bg-blue-100/80',
    dashedText: 'text-blue-800 font-bold',
    dashedBorder: 'border-dashed border-blue-500',
  },
  ABSENT_UNAPPROVED_C: {
    label: 'Nghỉ sai QĐ (C)',
    short: 'C',
    solidBg: 'bg-rose-100 hover:bg-rose-200',
    solidText: 'text-rose-900 font-extrabold',
    solidBorder: 'border-rose-400',
    dashedBg: 'bg-rose-50/80 hover:bg-rose-100/80',
    dashedText: 'text-rose-800 font-bold',
    dashedBorder: 'border-dashed border-rose-500',
  },
  TEACHER_ABSENT_D: {
    label: 'GV nghỉ (D)',
    short: 'D',
    solidBg: 'bg-red-200 hover:bg-red-300',
    solidText: 'text-red-950 font-extrabold',
    solidBorder: 'border-red-500',
    dashedBg: 'bg-red-50/80 hover:bg-red-100/80',
    dashedText: 'text-red-800 font-bold',
    dashedBorder: 'border-dashed border-red-500',
  },
  TECH_ERROR_E: {
    label: 'Lỗi kỹ thuật (E)',
    short: 'E',
    solidBg: 'bg-slate-200 hover:bg-slate-300',
    solidText: 'text-slate-900 font-extrabold',
    solidBorder: 'border-slate-400',
    dashedBg: 'bg-slate-100/80 hover:bg-slate-200/80',
    dashedText: 'text-slate-700 font-bold',
    dashedBorder: 'border-dashed border-slate-500',
  },
};

export interface ClassifiedSessionAttendance {
  category: CellWorkflowCategory;
  /** Finalized status when category is MATCHED or ADMIN_RESOLVED */
  finalStatus?: AttendanceStatus;
  /** Provisional status when category is PENDING_ONE_SIDE */
  provisionalStatus?: AttendanceStatus;
  provisionalSide?: 'GV' | 'CS';
  teacherStatus?: AttendanceStatus;
  csStatus?: AttendanceStatus;
  hasNote: boolean;
  /** Short text displayed inside the badge (without Ca prefix) */
  badgeText: string;
  /** Human-readable workflow status description for tooltip & drawer */
  workflowSummary: string;
}

/**
 * Canonical classifier for a ClassSession's attendance record.
 * Never treats placeholder `att.status = 'ATTENDED'` as a mark when both
 * `teacher_status` and `cs_status` are null and `reconciliation_state` is not FINAL.
 */
export function classifySessionAttendance(
  att: Attendance | undefined,
): ClassifiedSessionAttendance {
  const tSt = (att?.teacher_status as AttendanceStatus | null | undefined) || undefined;
  const csSt = (att?.cs_status as AttendanceStatus | null | undefined) || undefined;
  const recState = att?.reconciliation_state;
  const hasNote = Boolean(
    att?.lesson_topic?.trim() || att?.teacher_note?.trim() || att?.cs_note?.trim(),
  );

  // 1. Admin / Quản lý đã chốt phân xử (RESOLVED)
  if (recState === 'RESOLVED' || Boolean(att?.resolved_by_id)) {
    const finalStatus = (att?.status || csSt || tSt || 'ATTENDED') as AttendanceStatus;
    const cfg = ATTENDANCE_CODE_CONFIG[finalStatus];
    return {
      category: 'ADMIN_RESOLVED',
      finalStatus,
      teacherStatus: tSt,
      csStatus: csSt,
      hasNote,
      badgeText: cfg.short,
      workflowSummary: `Admin đã chốt: ${cfg.short} · ${cfg.label}`,
    };
  }

  // 2. Hai bên chấm lệch nhau (CONFLICT)
  if (recState === 'CONFLICT' || Boolean(tSt && csSt && tSt !== csSt)) {
    const tShort = tSt ? ATTENDANCE_CODE_CONFIG[tSt].short : '?';
    const csShort = csSt ? ATTENDANCE_CODE_CONFIG[csSt].short : '?';
    return {
      category: 'CONFLICT',
      teacherStatus: tSt,
      csStatus: csSt,
      hasNote,
      badgeText: `${tShort}≠${csShort}`,
      workflowSummary: `Hai bên lệch (GV: ${tShort} · CSKH: ${csShort}) — Chờ Admin chốt`,
    };
  }

  // 3. Hai bên đã khớp (MATCHED)
  if (
    (recState === 'MATCHED' && Boolean(tSt || csSt || att?.status)) ||
    Boolean(tSt && csSt && tSt === csSt)
  ) {
    const finalStatus = (tSt || csSt || att?.status || 'ATTENDED') as AttendanceStatus;
    const cfg = ATTENDANCE_CODE_CONFIG[finalStatus];
    return {
      category: 'MATCHED',
      finalStatus,
      teacherStatus: tSt,
      csStatus: csSt,
      hasNote,
      badgeText: cfg.short,
      workflowSummary: `Đã khớp 2 bên: ${cfg.short} · ${cfg.label}`,
    };
  }

  // 4. Mới 1 bên chấm (GV hoặc CSKH) — đang chờ bên còn lại
  if (tSt && !csSt) {
    const cfg = ATTENDANCE_CODE_CONFIG[tSt];
    return {
      category: 'PENDING_ONE_SIDE',
      provisionalStatus: tSt,
      provisionalSide: 'GV',
      teacherStatus: tSt,
      csStatus: undefined,
      hasNote,
      badgeText: `GV:${cfg.short}`,
      workflowSummary: `Mới GV chấm (${cfg.short} · ${cfg.label}) — Chờ CSKH chấm`,
    };
  }

  if (!tSt && csSt) {
    const cfg = ATTENDANCE_CODE_CONFIG[csSt];
    return {
      category: 'PENDING_ONE_SIDE',
      provisionalStatus: csSt,
      provisionalSide: 'CS',
      teacherStatus: undefined,
      csStatus: csSt,
      hasNote,
      badgeText: `CS:${cfg.short}`,
      workflowSummary: `Mới CSKH chấm (${cfg.short} · ${cfg.label}) — Chờ GV chấm`,
    };
  }

  // 5. Đã có ca học nhưng CẢ GV & CSKH đều chưa chấm (bao gồm cả AUTO_SCHEDULE / chỉ mới ghi chú)
  return {
    category: 'SESSION_UNMARKED',
    teacherStatus: undefined,
    csStatus: undefined,
    hasNote,
    badgeText: '?',
    workflowSummary: hasNote
      ? 'Đã mở ca (có bài học/ghi chú) — Cả GV & CSKH đều chưa điểm danh'
      : 'Đã mở ca học — Cả GV & CSKH đều chưa điểm danh',
  };
}

/**
 * Build rich tooltip for a monthly session badge.
 */
export function buildSessionBadgeTooltip(params: {
  sessionNumber: number;
  session?: ClassSession;
  att?: Attendance;
  classified: ClassifiedSessionAttendance;
}): string {
  const { sessionNumber, session, att, classified } = params;
  const tCfg = classified.teacherStatus
    ? ATTENDANCE_CODE_CONFIG[classified.teacherStatus]
    : null;
  const csCfg = classified.csStatus
    ? ATTENDANCE_CODE_CONFIG[classified.csStatus]
    : null;

  const lines: string[] = [
    `Ca ${sessionNumber}${session?.start_time ? ` (${session.start_time})` : ''}: ${classified.workflowSummary}`,
    `• Giáo viên: ${tCfg ? `${tCfg.short} · ${tCfg.label}` : 'Chưa chấm'}`,
    `• CSKH: ${csCfg ? `${csCfg.short} · ${csCfg.label}` : 'Chưa chấm'}`,
  ];

  if (att?.lesson_topic?.trim()) {
    lines.push(`• Bài học: ${att.lesson_topic.trim()}`);
  }
  if (att?.teacher_note?.trim()) {
    lines.push(`• Ghi chú GV: ${att.teacher_note.trim()}`);
  }
  if (att?.cs_note?.trim()) {
    lines.push(`• Ghi chú CSKH: ${att.cs_note.trim()}`);
  }
  if (att?.resolution_note?.trim()) {
    lines.push(`• Ghi chú chốt Admin: ${att.resolution_note.trim()}`);
  }
  lines.push('👉 Nhấn để xem chi tiết / cập nhật điểm danh');
  return lines.join('\n');
}

export interface MonthlyEmptyDateCellProps {
  id?: string;
  studentName: string;
  dateLabel: string;
  onClick: () => void;
}

export const MonthlyEmptyDateCell: React.FC<MonthlyEmptyDateCellProps> = ({
  id,
  studentName,
  dateLabel,
  onClick,
}) => {
  return (
    <div className="flex min-h-9 w-full min-w-[56px] items-center justify-center px-1 py-1">
      <button
        id={id}
        type="button"
        onClick={onClick}
        aria-label={`Tạo và điểm danh Ca 1 cho ${studentName} ngày ${dateLabel}`}
        title={`Ngày ${dateLabel}: Chưa tạo ca học — Nhấn để mở & điểm danh Ca 1`}
        className="group/empty inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-transparent bg-transparent px-2 text-xs font-bold text-slate-300 transition hover:border-dashed hover:border-primary/60 hover:bg-primary-soft/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span className="group-hover/empty:hidden">·</span>
        <span className="hidden group-hover/empty:inline text-[11px] font-extrabold">+</span>
      </button>
    </div>
  );
};

export interface MonthlySessionBadgeProps {
  id?: string;
  session: ClassSession;
  sessionNumber: number;
  totalSessionsInDay: number;
  att?: Attendance;
  studentName: string;
  dateLabel: string;
  onClick: () => void;
}

export const MonthlySessionBadge: React.FC<MonthlySessionBadgeProps> = ({
  id,
  session,
  sessionNumber,
  totalSessionsInDay,
  att,
  studentName,
  dateLabel,
  onClick,
}) => {
  const classified = classifySessionAttendance(att);
  const tooltip = buildSessionBadgeTooltip({
    sessionNumber,
    session,
    att,
    classified,
  });

  const showCaPrefix = totalSessionsInDay > 1;
  const caPrefix = showCaPrefix ? `C${sessionNumber}:` : '';

  let styleClasses = '';
  if (classified.category === 'ADMIN_RESOLVED' && classified.finalStatus) {
    const cfg = ATTENDANCE_CODE_CONFIG[classified.finalStatus];
    styleClasses = `${cfg.solidBg} ${cfg.solidText} ${cfg.solidBorder} ring-1 ring-violet-500/70`;
  } else if (classified.category === 'MATCHED' && classified.finalStatus) {
    const cfg = ATTENDANCE_CODE_CONFIG[classified.finalStatus];
    styleClasses = `${cfg.solidBg} ${cfg.solidText} ${cfg.solidBorder}`;
  } else if (classified.category === 'CONFLICT') {
    styleClasses =
      'bg-rose-50 hover:bg-rose-100 text-rose-800 border-2 border-rose-500 font-extrabold shadow-2xs';
  } else if (classified.category === 'PENDING_ONE_SIDE' && classified.provisionalStatus) {
    const cfg = ATTENDANCE_CODE_CONFIG[classified.provisionalStatus];
    styleClasses = `${cfg.dashedBg} ${cfg.dashedText} ${cfg.dashedBorder}`;
  } else {
    // SESSION_UNMARKED
    styleClasses =
      'border-dashed border-slate-400 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold';
  }

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-label={`Xem chi tiết ${studentName} ngày ${dateLabel}, Ca ${sessionNumber}: ${classified.workflowSummary}`}
      title={tooltip}
      className={`relative inline-flex h-6 min-w-[26px] items-center justify-center gap-0.5 rounded-md border px-1.5 text-[10px] leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${styleClasses}`}
    >
      {/* Top-left badge for Admin Resolved */}
      {classified.category === 'ADMIN_RESOLVED' && (
        <span
          className=" -ml-0.5 inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white"
          aria-hidden="true"
        >
          <Check className="h-2 w-2 stroke-[3]" />
        </span>
      )}

      {/* Optional Ca prefix when a day has 2+ sessions */}
      {showCaPrefix && (
        <span className="text-[9px] font-bold opacity-75">{caPrefix}</span>
      )}

      {/* Main status text */}
      <span className="tracking-tight">{classified.badgeText}</span>

      {/* Bottom-right indicator for Lesson Topic / Notes */}
      {classified.hasNote && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-indigo-600 shadow-2xs"
          aria-hidden="true"
        />
      )}
    </button>
  );
};

export interface AttendanceLegendCounts {
  conflict: number;
  pendingOneSide: number;
  sessionUnmarked: number;
  matched: number;
  adminResolved: number;
}

export interface AttendanceMatrixLegendBarProps {
  activeFilter?: MatrixCellFilter;
  onFilterChange?: (filter: MatrixCellFilter) => void;
  counts?: AttendanceLegendCounts;
}

export const AttendanceMatrixLegendBar: React.FC<AttendanceMatrixLegendBarProps> = ({
  activeFilter = 'ALL',
  onFilterChange,
  counts,
}) => {
  const filterItems: Array<{
    key: MatrixCellFilter;
    label: string;
    count?: number;
    preview: React.ReactNode;
    desc: string;
  }> = [
    {
      key: 'ALL',
      label: 'Tất cả',
      preview: null,
      desc: 'Hiển thị toàn bộ học viên / lớp học',
    },
    {
      key: 'SESSION_UNMARKED',
      label: 'Đã mở ca, chưa chấm',
      count: counts?.sessionUnmarked,
      preview: (
        <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded border border-dashed border-slate-400 bg-slate-50 px-1 text-[10px] font-bold text-slate-600">
          ?
        </span>
      ),
      desc: 'Đã có ca học trên hệ thống nhưng cả Giáo viên và CSKH đều chưa điểm danh',
    },
    {
      key: 'PENDING_ONE_SIDE',
      label: 'Mới 1 bên chấm',
      count: counts?.pendingOneSide,
      preview: (
        <span className="inline-flex h-5 items-center justify-center rounded border border-dashed border-emerald-500 bg-emerald-50 px-1 text-[9px] font-bold text-emerald-800">
          GV:1
        </span>
      ),
      desc: 'Mới Giáo viên (GV:...) hoặc CSKH (CS:...) chấm 1 phía, đang chờ bên còn lại xác nhận',
    },
    {
      key: 'CONFLICT',
      label: 'Hai bên lệch',
      count: counts?.conflict,
      preview: (
        <span className="inline-flex h-5 items-center justify-center rounded border-2 border-rose-500 bg-rose-50 px-1 text-[9px] font-extrabold text-rose-800">
          1≠C
        </span>
      ),
      desc: 'Giáo viên và CSKH chấm khác nhau — cần kiểm tra lại hoặc chờ Admin chốt',
    },
    {
      key: 'MATCHED',
      label: 'Đã khớp 2 bên',
      count: counts?.matched,
      preview: (
        <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded border border-emerald-400 bg-emerald-100 px-1.5 text-[10px] font-extrabold text-emerald-900">
          1
        </span>
      ),
      desc: 'Giáo viên và CSKH đã chấm trùng khớp kết quả',
    },
    {
      key: 'ADMIN_RESOLVED',
      label: 'Admin đã chốt',
      count: counts?.adminResolved,
      preview: (
        <span className="inline-flex h-5 items-center justify-center gap-0.5 rounded border border-emerald-400 bg-emerald-100 px-1 text-[10px] font-extrabold text-emerald-900 ring-1 ring-violet-500/70">
          <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-violet-600 text-white">
            <Check className="h-2 w-2 stroke-[3]" />
          </span>
          1
        </span>
      ),
      desc: 'Đã được Admin / Quản lý phân xử chốt kết quả cuối cùng',
    },
  ];

  return (
    <div className="px-4 py-2.5 bg-slate-50/90 border-b border-border/80 flex flex-col gap-2 text-xs">
      {/* Row 1: Workflow States + Interactive Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-600 mr-1">
            Trạng thái ô điểm danh:
          </span>

          {/* Non-filterable static cue for No Session */}
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
            title="Ngày chưa có ca học nào được mở. Rê chuột vào ô và bấm (+) để tạo Ca 1 mới."
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-200 text-slate-400 font-bold">
              ·
            </span>
            <span>Chưa tạo ca</span>
          </span>

          {filterItems.map((item) => {
            const isActive = activeFilter === item.key;
            const clickable = Boolean(onFilterChange);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  onFilterChange?.(
                    isActive && item.key !== 'ALL' ? 'ALL' : item.key,
                  )
                }
                title={
                  clickable
                    ? `${item.desc} — Nhấn để lọc nhanh`
                    : item.desc
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                  isActive
                    ? 'border-primary bg-primary/10 text-primary shadow-2xs ring-1 ring-primary/30'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100/70'
                } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {item.preview}
                <span>{item.label}</span>
                {typeof item.count === 'number' && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                      item.key === 'CONFLICT' && item.count > 0
                        ? 'bg-rose-600 text-white'
                        : item.key === 'PENDING_ONE_SIDE' && item.count > 0
                        ? 'bg-amber-500 text-white'
                        : item.key === 'SESSION_UNMARKED' && item.count > 0
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}

          {/* Note dot cue */}
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
            title="Ca học có nhập Nội dung bài học hoặc Ghi chú của Giáo viên / CSKH (rê chuột lên ô để xem nhanh)"
          >
            <span className="relative inline-flex h-4 w-5 items-center justify-center rounded border border-slate-300 bg-slate-100 text-[9px] font-bold text-slate-600">
              1
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-indigo-600" />
            </span>
            <FileText className="h-3 w-3 text-indigo-600" />
            <span>Có bài học / ghi chú</span>
          </span>
        </div>

        {/* Row 2 / Right side: 6 Attendance Codes */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 mr-0.5">Mã kết quả:</span>
          {(Object.entries(ATTENDANCE_CODE_CONFIG) as Array<
            [AttendanceStatus, (typeof ATTENDANCE_CODE_CONFIG)[AttendanceStatus]]
          >).map(([key, cfg]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
            >
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 text-[10px] ${cfg.solidBg.replace(/\s*hover:\S+/g, '')} ${cfg.solidText} ${cfg.solidBorder}`}
              >
                {cfg.short}
              </span>
              <span className="font-medium">{cfg.label.replace(/\s*\([A-E]\)$/, '')}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
