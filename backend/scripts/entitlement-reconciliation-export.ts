/**
 * entitlement-reconciliation-export.ts — READ-ONLY reconciliation export
 * (D10): compares the canonical web-computed session remaining against the
 * imported external_remaining_sessions for EVERY enrollment, so the owner can
 * review the divergence BEFORE flipping the broadcast display precedence
 * (external-first → computed-first).
 *
 * ⚠ READ-ONLY TOOL: performs Prisma `findMany` SELECTs only. No writes, no
 * updates, no deletes, no raw mutations. Safe against production data.
 *
 * Usage (owner-run, from backend/):
 *   npx ts-node --transpile-only scripts/entitlement-reconciliation-export.ts \
 *     [--csv out/entitlement-reconciliation.csv] [--stale-days 30]
 *
 * Notes on semantics (mirrored, NOT re-implemented):
 *  - consumed / computed remaining: canonical calculator
 *    src/modules/enrollments/enrollment-entitlement.ts
 *    (FINAL = reconciliation_state ∈ {MATCHED, RESOLVED}; consuming status =
 *    ATTENDED | ABSENT_UNAPPROVED_C; remaining = total − consumed, UNCLAMPED;
 *    external/opening values never folded in).
 *  - "FLIP?" column: current broadcast display chain (broadcast.service
 *    extractStudentTemplateVars) is external ?? computed ?? total ?? ''.
 *    A row changes iff external is non-null and external !== computed.
 *  - "SEL" marks the enrollment the broadcast would actually select per
 *    student (updated_at desc; first of STUDYING|WAITING_CLASS|UPCOMING|
 *    NOT_STARTED else the newest). The SUMMARY "would CHANGE" headline counts
 *    students, via selected rows only.
 *  - "ALL non-deleted enrollments": the Enrollment table has NO soft-delete
 *    column, so every row qualifies; soft-deleted ATTENDANCE rows are excluded
 *    by the calculator itself and surfaced via the HISTORY_INCOMPLETE flag.
 */

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

import { prisma } from '../src/prisma/client';
import {
  applyBroadcastSelection,
  computeBroadcastSelectedIds,
  csvRowsFor,
  deriveReconciliationRow,
  formatSummary,
  formatTable,
  summarizeRows,
  worstByAbsDelta,
  type ReconDerivedRow,
  type ReconEnrollmentRow,
} from './entitlement-reconciliation.core';

const PAGE_SIZE = 200;

interface CliArgs {
  csvPath: string | null;
  staleDays: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { csvPath: null, staleDays: 30 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) {
        console.error('Missing value for --csv');
        process.exit(2);
      }
      args.csvPath = v;
    } else if (a === '--stale-days') {
      const v = argv[++i];
      const n = v === undefined ? NaN : Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        console.error('--stale-days must be a positive number of days');
        process.exit(2);
      }
      args.staleDays = n;
    } else {
      console.error(`Unknown argument: ${a}\nUsage: ts-node scripts/entitlement-reconciliation-export.ts [--csv <outpath>] [--stale-days <n>]`);
      process.exit(2);
    }
  }
  return args;
}

/** Fetch every enrollment with the graph the canonical calculator needs. */
async function fetchAllEnrollmentRows(): Promise<ReconEnrollmentRow[]> {
  const collected: ReconEnrollmentRow[] = [];
  let cursorId: number | undefined;
  // Keyset paging on id; stable and cheap for a read-only export.
  for (;;) {
    const page = await prisma.enrollment.findMany({
      where: cursorId === undefined ? {} : { id: { gt: cursorId } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        updated_at: true,
        total_sessions: true,
        attended_previous_years: true,
        external_remaining_sessions: true,
        external_synced_at: true,
        student_id: true,
        student: { select: { external_id: true } },
        enrollment_classes: {
          select: {
            id: true,
            attendance: {
              select: {
                status: true,
                reconciliation_state: true,
                deleted_at: true,
                teacher_status: true,
                cs_status: true,
              },
            },
          },
        },
      },
    });
    for (const e of page) {
      collected.push({
        id: e.id,
        status: e.status,
        updated_at: e.updated_at,
        student_id: e.student_id,
        student_code: e.student.external_id,
        total_sessions: e.total_sessions,
        attended_previous_years: e.attended_previous_years,
        external_remaining_sessions: e.external_remaining_sessions,
        external_synced_at: e.external_synced_at,
        enrollment_classes: e.enrollment_classes,
      });
    }
    if (page.length < PAGE_SIZE) break;
    cursorId = page[page.length - 1].id;
  }
  return collected;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const thresholds = { staleExternalSyncDays: args.staleDays, now };

  console.log(`Entitlement reconciliation export (READ ONLY) @ ${now.toISOString()}`);
  console.log(`Stale external-sync threshold: ${args.staleDays} days\n`);

  const rows = await fetchAllEnrollmentRows();
  console.log(`Fetched ${rows.length} enrollment(s).`);

  // 1) Derive (canonical calculator per row; pure classification).
  let derived: ReconDerivedRow[] = rows.map((r) => deriveReconciliationRow(r, thresholds));

  // 2) Broadcast selection stamp: group per student in broadcast's scan order
  //    (updated_at desc, id desc), pick like extractStudentTemplateVars.
  const updatedAtById = new Map(rows.map((r) => [r.id, r.updated_at.getTime()]));
  const byStudent = new Map<number, ReconDerivedRow[]>();
  for (const d of derived) {
    const list = byStudent.get(d.studentId) ?? [];
    list.push(d);
    byStudent.set(d.studentId, list);
  }
  const orderedGroups = new Map<number, ReconDerivedRow[]>();
  for (const [studentId, list] of byStudent) {
    const ordered = [...list].sort((a, b) => {
      const ua = updatedAtById.get(a.id)!;
      const ub = updatedAtById.get(b.id)!;
      if (ub !== ua) return ub - ua; // updated_at DESC
      return b.id - a.id; // id DESC tiebreak (Prisma tie order unspecified)
    });
    orderedGroups.set(studentId, ordered);
  }
  const selectedIds = computeBroadcastSelectedIds(orderedGroups);
  derived = applyBroadcastSelection(derived, selectedIds);

  // 3) Human-readable table (scan order by id for review stability).
  console.log('\n' + formatTable(derived));

  // 4) Worst-10 by |delta|.
  const worst = worstByAbsDelta(derived, 10);
  console.log('\n' + '── WORST 10 BY |delta| ─────────────────────────────────────────────');
  console.log(formatTable(worst));

  // 5) Summary.
  const summary = summarizeRows(derived);
  console.log('\n' + formatSummary(summary));

  // 6) Optional CSV.
  if (args.csvPath) {
    const abs = resolve(process.cwd(), args.csvPath);
    try {
      writeFileSync(abs, csvRowsFor(derived), 'utf8');
      console.log(`\nCSV written: ${abs}`);
    } catch (err) {
      console.error(
        `Failed to write CSV to ${abs} (parent directory must exist): ` +
          String((err as Error).message),
      );
      process.exitCode = 1;
    }
  } else {
    console.log('\n(no --csv given; pass --csv <outpath> for an Excel-reviewable export)');
  }
}

main()
  .catch((err) => {
    console.error('Reconciliation export FAILED (read-only; nothing was written to the DB):', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
