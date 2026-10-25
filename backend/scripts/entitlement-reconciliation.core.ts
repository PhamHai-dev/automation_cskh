/**
 * entitlement-reconciliation.core.ts — PURE (no DB) row-derivation for the D10
 * reconciliation export, required by the owner BEFORE any broadcast precedence
 * flip (external-first → computed-first).
 *
 * Semantics are mirrored EXACTLY from:
 *  - src/modules/enrollments/enrollment-entitlement.ts — the CANONICAL
 *    calculator. The consumed count below is produced by CALLING
 *    `calculateEnrollmentEntitlement` (not re-implemented): consumed = FINAL
 *    (reconciliation_state ∈ {MATCHED, RESOLVED}) non-deleted rows with status
 *    ∈ {ATTENDED, ABSENT_UNAPPROVED_C}; remaining = total − consumed, UNCLAMPED;
 *    external/opening values are never folded in.
 *  - src/modules/automation/broadcast.service.ts `extractStudentTemplateVars`
 *    (external-first display chain: external_remaining_sessions ?? computed ??
 *    total_sessions ?? '') and its enrollment selection (createCampaign fetches
 *    `enrollments` with `orderBy: { updated_at: 'desc' }`, then the first whose
 *    status ∈ {STUDYING, WAITING_CLASS, UPCOMING, NOT_STARTED}, else [0]).
 *
 * Local FINAL/consuming constants appear only for DIAGNOSTIC counters (e.g.
 * "zero FINAL rows but nonzero attendance rows"); the authoritative consumed /
 * remaining numbers always come from the calculator.
 */

import {
  AttendanceStatus,
  ReconciliationState,
} from '@prisma/client';
import {
  calculateEnrollmentEntitlement,
  type EnrollmentEntitlementInput,
} from '../src/modules/enrollments/enrollment-entitlement';

// ---------------------------------------------------------------------------
// Row shape (as fetched by the CLI; structurally compatible with the canonical
// calculator's EnrollmentEntitlementInput).
// ---------------------------------------------------------------------------

export interface ReconAttendanceInput {
  status: AttendanceStatus;
  reconciliation_state: ReconciliationState;
  deleted_at?: Date | string | null;
  /** Provisional per-side values — used ONLY for the MIXED_STATE diagnostic flag. */
  teacher_status?: AttendanceStatus | null;
  cs_status?: AttendanceStatus | null;
}

export interface ReconEnrollmentRow {
  /** Enrollment.id */
  id: number;
  /** Enrollment.status */
  status: EnrollmentStatusString;
  /** Enrollment.updated_at — needed to mirror broadcast's enrollment pick. */
  updated_at: Date;
  /** Student.id — grouping key for the per-student broadcast selection. */
  student_id: number;
  /** Student.external_id — "mã HV". */
  student_code: string | null;
  total_sessions: number;
  attended_previous_years: number | null;
  external_remaining_sessions: number | null;
  /** null when Enrollment.external_synced_at is absent. */
  external_synced_at: Date | null;
  /** Raw enrollment_classes → attendance graph (the calculator filters internally). */
  enrollment_classes: ReadonlyArray<{
    id: number;
    attendance: ReadonlyArray<ReconAttendanceInput>;
  }>;
}

/** EnrollmentStatus enum values as strings (kept loose so mocks stay simple). */
export type EnrollmentStatusString =
  | 'WAITING_CLASS'
  | 'STUDYING'
  | 'PAUSED'
  | 'FINISHED'
  | 'UPCOMING'
  | 'NOT_STARTED'
  | 'CANCELLED'
  | (string & {});

// ---------------------------------------------------------------------------
// Derived row (one table/CSV record per enrollment)
// ---------------------------------------------------------------------------

export type ReconRiskFlag =
  /** attended_previous_years > 0 OR external_remaining_sessions present. */
  | 'OPENING_BALANCE'
  /** History may be incomplete: external value present with null/stale external_synced_at, zero FINAL rows but nonzero attendance rows, or deleted/mixed-state rows present. */
  | 'HISTORY_INCOMPLETE'
  /** delta defined and !== 0. */
  | 'DIVERGES'
  /** Status outside broadcast's active list — only matters if it is still the student's fallback pick. */
  | 'NON_ACTIVE_STATUS'
  /** external_remaining_sessions is null → delta undefined (not a divergence, a gap). */
  | 'NO_EXTERNAL';

export interface ReconDerivedRow {
  id: number;
  studentId: number;
  student_code: string | null;
  status: string;
  totalSessions: number;
  /** Canonical calculator's consumedSessions (FINAL consuming rows). */
  consumedComputed: number;
  /** Calculator's remainingSessions = total − consumed, UNCLAMPED (may be < 0). */
  remainingComputed: number;
  externalRemainingSessions: number | null;
  externalSyncedAt: Date | null;
  attendedPreviousYears: number;
  /** computed − external; null when external is null (delta undefined). */
  delta: number | null;
  /**
   * Whether the broadcast's displayed number would change if the external-first
   * precedence were flipped to computed-first, evaluated for THIS enrollment:
   * current display per the ?? chain is `external ?? computed` (computed is
   * always a number for a present enrollment, so `total`/`''` are unreachable);
   * flipped display is always `computed`. Change iff external non-null AND
   * external !== computed.
   */
  changesIfFlippedThisEnrollment: boolean;
  /**
   * True only on the enrollment the broadcast would actually select for this
   * student (see `pickBroadcastEnrollmentIds`). The headline "would CHANGE the
   * broadcast number" count uses this, per student — not every enrollment row.
   */
  selectedForBroadcast: boolean;
  /** Current broadcast display value for this enrollment, per the ?? chain. */
  currentBroadcastDisplay: string;
  riskFlags: ReconRiskFlag[];
  // Diagnostics used for flags (kept for CSV review).
  rawAttendanceRowCount: number;
  finalRowCount: number;
  deletedRowCount: number;
  mixedStateRowCount: number;
}

export interface ReconThresholds {
  /** external_synced_at older than this many days (vs `now`) → stale. */
  staleExternalSyncDays: number;
  now: Date;
}

// ---------------------------------------------------------------------------
// Constants mirrored (for selection + diagnostics only)
// ---------------------------------------------------------------------------

/** FINAL_RECONCILIATION_STATES in enrollment-entitlement.ts (diagnostics only). */
const FINAL_RECONCILIATION_STATES: ReadonlySet<ReconciliationState> = new Set([
  ReconciliationState.MATCHED,
  ReconciliationState.RESOLVED,
]);

/** Status list in broadcast.service.ts extractStudentTemplateVars. */
const BROADCAST_ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'STUDYING',
  'WAITING_CLASS',
  'UPCOMING',
  'NOT_STARTED',
]);

// ---------------------------------------------------------------------------
// Pure derivations
// ---------------------------------------------------------------------------

function isFinalRow(attendance: ReconAttendanceInput): boolean {
  if (attendance.deleted_at != null) return false;
  return FINAL_RECONCILIATION_STATES.has(attendance.reconciliation_state);
}

/**
 * "Mixed state": a FINAL, non-deleted row whose per-side recorded statuses
 * (teacher_status / cs_status, when both present) disagree with each other or
 * with the final `status`. The calculator deliberately ignores per-side
 * columns for FINAL rows, so these disagreements are invisible to the computed
 * number but worth ops review.
 */
function isMixedStateRow(attendance: ReconAttendanceInput): boolean {
  if (attendance.deleted_at != null) return false;
  if (!isFinalRow(attendance)) return false;
  const sides = [attendance.teacher_status, attendance.cs_status].filter(
    (s): s is AttendanceStatus => s != null,
  );
  if (sides.length < 2) return false;
  if (new Set(sides).size > 1) return true;
  return sides[0] !== attendance.status;
}

/**
 * Derive one reconciliation row for an enrollment. The consumed/remaining
 * numbers come from the CANONICAL calculator, invoked on the fetched graph.
 */
export function deriveReconciliationRow(
  row: ReconEnrollmentRow,
  thresholds: ReconThresholds,
): ReconDerivedRow {
  // Authoritative numbers — the canonical calculator, same predicate sets,
  // same unclamped subtraction, same soft-delete exclusion.
  const entitlement = calculateEnrollmentEntitlement(
    row as unknown as EnrollmentEntitlementInput,
  );
  const consumedComputed = entitlement.consumedSessions;
  const remainingComputed = entitlement.remainingSessions;
  const totalSessions = entitlement.totalSessions;

  const attendances = row.enrollment_classes.flatMap((ec) => [...ec.attendance]);
  const rawAttendanceRowCount = attendances.length;
  let finalRowCount = 0;
  let deletedRowCount = 0;
  let mixedStateRowCount = 0;
  for (const att of attendances) {
    if (att.deleted_at != null) {
      deletedRowCount += 1;
      continue;
    }
    if (isFinalRow(att)) finalRowCount += 1;
    if (isMixedStateRow(att)) mixedStateRowCount += 1;
  }

  const apy = row.attended_previous_years ?? 0;
  const ext = row.external_remaining_sessions ?? null;
  const delta = ext === null ? null : remainingComputed - ext;

  // Broadcast display chain (extractStudentTemplateVars):
  //   external ?? computed ?? total ?? ''
  // computed is always a finite number for a present enrollment, so the chain
  // never reaches total/'' there; `currentBroadcastDisplay` mirrors that.
  const currentBroadcastDisplay = ext !== null ? String(ext) : String(remainingComputed);

  const changesIfFlippedThisEnrollment = ext !== null && ext !== remainingComputed;

  const flags: ReconRiskFlag[] = [];
  if (apy > 0 || ext !== null) flags.push('OPENING_BALANCE');

  let historyIncomplete = false;
  if (ext !== null) {
    if (row.external_synced_at === null) {
      historyIncomplete = true; // external value with no sync timestamp
    } else {
      const ageDays =
        (thresholds.now.getTime() - row.external_synced_at.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > thresholds.staleExternalSyncDays) historyIncomplete = true;
    }
  }
  // Activity exists but nothing has reached FINAL yet → computed number is 0-backed.
  if (rawAttendanceRowCount > 0 && finalRowCount === 0) historyIncomplete = true;
  if (deletedRowCount > 0 || mixedStateRowCount > 0) historyIncomplete = true;
  if (historyIncomplete) flags.push('HISTORY_INCOMPLETE');

  if (delta !== null && delta !== 0) flags.push('DIVERGES');
  if (!BROADCAST_ACTIVE_STATUSES.has(row.status)) flags.push('NON_ACTIVE_STATUS');
  if (ext === null) flags.push('NO_EXTERNAL');

  return {
    id: row.id,
    studentId: row.student_id,
    student_code: row.student_code,
    status: row.status,
    totalSessions,
    consumedComputed,
    remainingComputed,
    externalRemainingSessions: ext,
    externalSyncedAt: row.external_synced_at,
    attendedPreviousYears: apy,
    delta,
    changesIfFlippedThisEnrollment: changesIfFlippedThisEnrollment,
    selectedForBroadcast: false, // stamped later by stampBroadcastSelection
    currentBroadcastDisplay,
    riskFlags: flags,
    rawAttendanceRowCount,
    finalRowCount,
    deletedRowCount,
    mixedStateRowCount,
  };
}

/**
 * Mirror broadcast's per-student enrollment selection.
 *
 * Selection rule (createCampaign include `enrollments: { orderBy: { updated_at:
 * 'desc' } }` + extractStudentTemplateVars): among a student's enrollments, in
 * `updated_at DESC` order (Prisma tie order is unspecified — the CLI stabilizes
 * with `id DESC`, recorded as a residual risk), take the FIRST with status ∈
 * {STUDYING, WAITING_CLASS, UPCOMING, NOT_STARTED}; if none, take the first
 * ([0] fallback). Input array must already be in that order; the function is
 * pure and order-preserving.
 */
export function selectBroadcastOrder<T extends { id: number; status: string }>(
  orderedRows: readonly T[],
): T | null {
  const active = orderedRows.find((r) => BROADCAST_ACTIVE_STATUSES.has(r.status));
  return active ?? orderedRows[0] ?? null;
}

/**
 * Given ALL derived rows in the per-student scan order broadcast uses (rows
 * grouped by student, each group sorted updated_at desc then id desc),
 * compute the id set broadcast would select per student.
 *
 * `groupsByStudent` maps studentId → its rows in broadcast scan order.
 */
export function computeBroadcastSelectedIds(
  groupsByStudent: ReadonlyMap<number, readonly ReconDerivedRow[]>,
): Set<number> {
  const selected = new Set<number>();
  for (const list of groupsByStudent.values()) {
    const pick = selectBroadcastOrder(list);
    if (pick) selected.add(pick.id);
  }
  return selected;
}

/** Return copies of `rows` with selectedForBroadcast stamped from `selectedIds`. */
export function applyBroadcastSelection(
  rows: readonly ReconDerivedRow[],
  selectedIds: ReadonlySet<number>,
): ReconDerivedRow[] {
  return rows.map((r) => ({ ...r, selectedForBroadcast: selectedIds.has(r.id) }));
}

/** Sort comparator: descending |delta|, nulls last, id tiebreak for determinism. */
export function compareByAbsDeltaDesc(a: ReconDerivedRow, b: ReconDerivedRow): number {
  const ad = a.delta === null ? null : Math.abs(a.delta);
  const bd = b.delta === null ? null : Math.abs(b.delta);
  if (ad === null && bd === null) return a.id - b.id;
  if (ad === null) return 1;
  if (bd === null) return -1;
  if (bd !== ad) return bd - ad;
  return a.id - b.id;
}

/** Worst-N rows by |delta| (delta-null rows excluded, then sorted). */
export function worstByAbsDelta(rows: readonly ReconDerivedRow[], n: number): ReconDerivedRow[] {
  return rows
    .filter((r) => r.delta !== null)
    .slice()
    .sort(compareByAbsDeltaDesc)
    .slice(0, n);
}

export interface ReconSummary {
  enrollments: number;
  students: number;
  /**
   * Headline: students whose broadcast-selected enrollment would display a
   * different number after flipping external-first → computed-first.
   */
  wouldChangeBroadcastIfFlipped: number;
  /** Enrollment-level divergence (regardless of selection). */
  divergingEnrollments: number;
  openingBalancePresent: number;
  historyIncomplete: number;
  nonActiveStatus: number;
  externalNull: number;
  negativeRemaining: number;
}

/** Aggregate the table into the summary block printed at the end. */
export function summarizeRows(rows: readonly ReconDerivedRow[]): ReconSummary {
  let wouldChange = 0;
  let diverging = 0;
  let opening = 0;
  let incomplete = 0;
  let nonActive = 0;
  let extNull = 0;
  let negativeRemaining = 0;
  const students = new Set<number>();
  for (const r of rows) {
    students.add(r.studentId);
    if (r.selectedForBroadcast && r.changesIfFlippedThisEnrollment) wouldChange += 1;
    if (r.riskFlags.includes('DIVERGES')) diverging += 1;
    if (r.riskFlags.includes('OPENING_BALANCE')) opening += 1;
    if (r.riskFlags.includes('HISTORY_INCOMPLETE')) incomplete += 1;
    if (r.riskFlags.includes('NON_ACTIVE_STATUS')) nonActive += 1;
    if (r.externalRemainingSessions === null) extNull += 1;
    if (r.remainingComputed < 0) negativeRemaining += 1;
  }
  return {
    enrollments: rows.length,
    students: students.size,
    wouldChangeBroadcastIfFlipped: wouldChange,
    divergingEnrollments: diverging,
    openingBalancePresent: opening,
    historyIncomplete: incomplete,
    nonActiveStatus: nonActive,
    externalNull: extNull,
    negativeRemaining,
  };
}

// ---------------------------------------------------------------------------
// CSV (hand-rolled, no deps)
// ---------------------------------------------------------------------------

/** RFC-4180-ish escaping: quote when needed, double embedded quotes. */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

const CSV_HEADERS = [
  'enrollment_id',
  'student_id',
  'student_code_ma_hv',
  'status',
  'selected_for_broadcast',
  'total_sessions_contract',
  'consumed_computed',
  'remaining_computed',
  'external_remaining_sessions',
  'external_synced_at',
  'attended_previous_years',
  'delta_computed_minus_external',
  'changes_if_flipped_this_enrollment',
  'current_broadcast_display',
  'risk_flags',
  'attendance_rows_raw',
  'attendance_rows_final',
  'attendance_rows_deleted',
  'attendance_rows_mixed_state',
] as const;

function isoOrNull(d: Date | null): string {
  return d === null ? '' : d.toISOString();
}

/** One derived row → CSV fields (escaped, joined by the writer). */
export function rowToCsvFields(r: ReconDerivedRow): string[] {
  return [
    String(r.id),
    String(r.studentId),
    csvEscape(r.student_code ?? ''),
    csvEscape(r.status),
    r.selectedForBroadcast ? 'YES' : 'no',
    String(r.totalSessions),
    String(r.consumedComputed),
    String(r.remainingComputed),
    r.externalRemainingSessions === null ? '' : String(r.externalRemainingSessions),
    isoOrNull(r.externalSyncedAt),
    String(r.attendedPreviousYears),
    r.delta === null ? '' : String(r.delta),
    r.changesIfFlippedThisEnrollment ? 'YES' : 'no',
    csvEscape(r.currentBroadcastDisplay),
    csvEscape(r.riskFlags.join(';')),
    String(r.rawAttendanceRowCount),
    String(r.finalRowCount),
    String(r.deletedRowCount),
    String(r.mixedStateRowCount),
  ];
}

export function csvHeaderLine(): string {
  return CSV_HEADERS.join(',');
}

export function csvRowsFor(rows: readonly ReconDerivedRow[]): string {
  const lines = [csvHeaderLine()];
  for (const r of rows) lines.push(rowToCsvFields(r).join(','));
  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Human-readable table (stdout)
// ---------------------------------------------------------------------------

const COLS: ReadonlyArray<{
  key: string;
  header: string;
  width: number;
  align: 'left' | 'right';
}> = [
  { key: 'id', header: 'ENR_ID', width: 7, align: 'right' },
  { key: 'ma_hv', header: 'MA_HV', width: 14, align: 'left' },
  { key: 'status', header: 'STATUS', width: 13, align: 'left' },
  { key: 'sel', header: 'SEL', width: 3, align: 'left' },
  { key: 'total', header: 'TOTAL', width: 7, align: 'right' },
  { key: 'consumed', header: 'CONSUMED', width: 8, align: 'right' },
  { key: 'remaining', header: 'REMAIN', width: 8, align: 'right' },
  { key: 'external', header: 'EXT_REM', width: 8, align: 'right' },
  { key: 'synced', header: 'EXT_SYNCED', width: 20, align: 'left' },
  { key: 'apy', header: 'PREV_YRS', width: 8, align: 'right' },
  { key: 'delta', header: 'DELTA', width: 8, align: 'right' },
  { key: 'flip', header: 'FLIP?', width: 5, align: 'left' },
  { key: 'flags', header: 'RISK_FLAGS', width: 45, align: 'left' },
];

function cell(row: ReconDerivedRow, key: string): string {
  switch (key) {
    case 'id': return String(row.id);
    case 'ma_hv': return row.student_code ?? '-';
    case 'status': return row.status;
    case 'sel': return row.selectedForBroadcast ? '*' : ' ';
    case 'total': return String(row.totalSessions);
    case 'consumed': return String(row.consumedComputed);
    case 'remaining': return String(row.remainingComputed);
    case 'external': return row.externalRemainingSessions === null ? '-' : String(row.externalRemainingSessions);
    case 'synced': return row.externalSyncedAt ? row.externalSyncedAt.toISOString().slice(0, 19) : '-';
    case 'apy': return String(row.attendedPreviousYears);
    case 'delta': return row.delta === null ? '-' : String(row.delta);
    case 'flip': return row.changesIfFlippedThisEnrollment ? 'YES' : 'no';
    case 'flags': return row.riskFlags.length ? row.riskFlags.join(',') : '-';
    default: return '';
  }
}

function pad(text: string, width: number, align: 'left' | 'right'): string {
  // Vietnamese mã HV may contain combining characters; we treat length as
  // display columns (review tool, not a fixed-width contract).
  if (text.length >= width) return text.slice(0, width);
  return align === 'right' ? text.padStart(width) : text.padEnd(width);
}

export function formatTable(rows: readonly ReconDerivedRow[]): string {
  const out: string[] = [];
  out.push(COLS.map((c) => pad(c.header, c.width, c.align)).join(' '));
  out.push(COLS.map((c) => '-'.repeat(c.width)).join(' '));
  for (const r of rows) {
    out.push(COLS.map((c) => pad(cell(r, c.key), c.width, c.align)).join(' '));
  }
  return out.join('\n');
}

export function formatSummary(s: ReconSummary): string {
  return [
    '── SUMMARY ─────────────────────────────────────────────────────────',
    `  Enrollments:                    ${s.enrollments}`,
    `  Students:                       ${s.students}`,
    `  Would CHANGE broadcast if flipped (selected enrollment, per student): ${s.wouldChangeBroadcastIfFlipped}`,
    `  Diverging enrollments (delta != 0, any status): ${s.divergingEnrollments}`,
    `  Opening-balance present (APY>0 or external set): ${s.openingBalancePresent}`,
    `  History incomplete (stale/null sync, un-FINAL-only, deleted/mixed rows): ${s.historyIncomplete}`,
    `  Non-active status rows:         ${s.nonActiveStatus}`,
    `  External missing (delta undefined): ${s.externalNull}`,
    `  Negative computed remaining ("nợ buổi"): ${s.negativeRemaining}`,
  ].join('\n');
}
