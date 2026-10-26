/**
 * class-teacher-window-audit.ts — READ-ONLY audit script (D8 owner ruling
 * 2026-10-26): lists every `ClassTeacher` row where `active = false` AND
 * `end_date IS NULL` (both `start_date IS NULL` and `start_date IS NOT NULL`).
 *
 * Per the 2026-10-26 owner ruling:
 *  - Inactive rows without an explicit `end_date` are NEVER auto-fixed or
 *    assigned a script-time `end_date`, and they do NOT grant attendance
 *    marking authority (`isTeacherAssignmentEffectiveOn` returns `false`).
 *  - Operations/Admin reviews this list and confirms the historical `end_date`
 *    for each assignment individually.
 *
 * READ-ONLY TOOL: performs Prisma `findMany` SELECTs only. No writes, no
 * updates, no deletes, no raw mutations. Safe against production data.
 *
 * Usage (owner-run, from backend/):
 *   npx ts-node --transpile-only scripts/class-teacher-window-audit.ts \
 *     [--csv out/class-teacher-window-audit.csv]
 */

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

import { prisma } from '../src/prisma/client';

export interface ClassTeacherWindowAuditRow {
  id: number;
  class_id: number;
  class_code: string | null;
  class_name: string;
  teacher_id: number;
  teacher_code: string;
  teacher_name: string;
  teacher_user_id: number | null;
  teacher_active: boolean;
  role: string;
  active: boolean;
  start_date: Date | null;
  end_date: Date | null;
  updated_at: Date;
}

export interface ClassTeacherWindowAuditSummary {
  totalMissingEndDate: number;
  withStartDateOnly: number;
  withoutAnyWindowBounds: number;
}

interface CliArgs {
  csvPath: string | null;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { csvPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) {
        console.error('Missing value for --csv');
        process.exit(2);
      }
      args.csvPath = v;
    } else {
      console.error(
        `Unknown argument: ${a}\nUsage: npx ts-node --transpile-only scripts/class-teacher-window-audit.ts [--csv <outpath>]`,
      );
      process.exit(2);
    }
  }
  return args;
}

function isoDateOrNull(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : 'NULL';
}

export function summarizeWindowAuditRows(
  rows: readonly ClassTeacherWindowAuditRow[],
): ClassTeacherWindowAuditSummary {
  let withStartDateOnly = 0;
  let withoutAnyWindowBounds = 0;
  for (const r of rows) {
    if (r.start_date !== null) {
      withStartDateOnly++;
    } else {
      withoutAnyWindowBounds++;
    }
  }
  return {
    totalMissingEndDate: rows.length,
    withStartDateOnly,
    withoutAnyWindowBounds,
  };
}

export function formatWindowAuditTable(rows: readonly ClassTeacherWindowAuditRow[]): string {
  if (rows.length === 0) {
    return 'No ClassTeacher rows found with active=false AND end_date=null.';
  }
  const header = [
    'ID'.padEnd(6),
    'CLASS_ID'.padEnd(8),
    'CLASS_CODE'.padEnd(14),
    'TEACHER_ID'.padEnd(10),
    'TEACHER_CODE'.padEnd(14),
    'USER_ID'.padEnd(8),
    'ROLE'.padEnd(10),
    'START_DATE'.padEnd(12),
    'END_DATE'.padEnd(10),
    'UPDATED_AT',
  ].join(' | ');
  const sep = '-'.repeat(header.length);
  const lines = rows.map((r) =>
    [
      String(r.id).padEnd(6),
      String(r.class_id).padEnd(8),
      (r.class_code ?? '-').slice(0, 14).padEnd(14),
      String(r.teacher_id).padEnd(10),
      r.teacher_code.slice(0, 14).padEnd(14),
      String(r.teacher_user_id ?? '-').padEnd(8),
      r.role.padEnd(10),
      isoDateOrNull(r.start_date).padEnd(12),
      isoDateOrNull(r.end_date).padEnd(10),
      r.updated_at.toISOString(),
    ].join(' | '),
  );
  return [header, sep, ...lines].join('\n');
}

function csvEscape(val: string | number | boolean | null): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRowsForWindowAudit(rows: readonly ClassTeacherWindowAuditRow[]): string {
  const columns = [
    'id',
    'class_id',
    'class_code',
    'class_name',
    'teacher_id',
    'teacher_code',
    'teacher_name',
    'teacher_user_id',
    'teacher_active',
    'role',
    'active',
    'start_date',
    'end_date',
    'updated_at',
  ];
  const lines = [columns.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.class_id,
        r.class_code,
        r.class_name,
        r.teacher_id,
        r.teacher_code,
        r.teacher_name,
        r.teacher_user_id,
        r.teacher_active,
        r.role,
        r.active,
        r.start_date ? r.start_date.toISOString().slice(0, 10) : null,
        r.end_date ? r.end_date.toISOString().slice(0, 10) : null,
        r.updated_at.toISOString(),
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export async function fetchInactiveNullEndAssignments(): Promise<ClassTeacherWindowAuditRow[]> {
  const records = await prisma.classTeacher.findMany({
    where: {
      active: false,
      end_date: null,
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      class_id: true,
      teacher_id: true,
      role: true,
      active: true,
      start_date: true,
      end_date: true,
      updated_at: true,
      class: {
        select: {
          class_code: true,
          class_name: true,
        },
      },
      teacher: {
        select: {
          code: true,
          name: true,
          user_id: true,
          active: true,
        },
      },
    },
  });

  return records.map((r) => ({
    id: r.id,
    class_id: r.class_id,
    class_code: r.class.class_code,
    class_name: r.class.class_name,
    teacher_id: r.teacher_id,
    teacher_code: r.teacher.code,
    teacher_name: r.teacher.name,
    teacher_user_id: r.teacher.user_id,
    teacher_active: r.teacher.active,
    role: r.role,
    active: r.active,
    start_date: r.start_date,
    end_date: r.end_date,
    updated_at: r.updated_at,
  }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();

  console.log(`ClassTeacher window audit (READ ONLY) @ ${now.toISOString()}`);
  console.log('Querying ClassTeacher rows with active = false AND end_date IS NULL...\n');

  const rows = await fetchInactiveNullEndAssignments();
  const summary = summarizeWindowAuditRows(rows);

  console.log(formatWindowAuditTable(rows));
  console.log('\n── SUMMARY ──────────────────────────────────────────────────────────');
  console.log(`Total inactive rows missing end_date : ${summary.totalMissingEndDate}`);
  console.log(`  - start_date set, end_date NULL    : ${summary.withStartDateOnly}`);
  console.log(`  - both start_date & end_date NULL  : ${summary.withoutAnyWindowBounds}`);

  if (args.csvPath) {
    const abs = resolve(process.cwd(), args.csvPath);
    try {
      writeFileSync(abs, csvRowsForWindowAudit(rows), 'utf8');
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

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('ClassTeacher window audit FAILED (read-only; nothing was written to the DB):', err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
