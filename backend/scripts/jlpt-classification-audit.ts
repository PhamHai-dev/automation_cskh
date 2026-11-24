/**
 * jlpt-classification-audit.ts — READ-ONLY pre-migration audit for explicit
 * Class.program_type and JLPT template rollout.
 *
 * This script uses Prisma findMany SELECTs only. It never creates templates,
 * changes classes, applies migrations, or writes business data.
 *
 * Usage (owner-run from backend/ after generating the current Prisma client):
 *   npx ts-node --transpile-only scripts/jlpt-classification-audit.ts
 *   npx ts-node --transpile-only scripts/jlpt-classification-audit.ts --json out/jlpt-audit.json
 */

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

import { prisma } from '../src/prisma/client';

type CanonicalProgram = 'KAIWA' | 'JLPT';
type Classification = CanonicalProgram | 'MIXED' | 'UNKNOWN';

interface CliArgs {
  jsonPath: string | null;
}

export interface JlptClassificationAuditRow {
  classId: number;
  classCode: string | null;
  className: string;
  level: string | null;
  proposedLevel: string | null;
  classification: Classification;
  rawProgramTypes: string[];
  historicalCourseCodes: string[];
  activeCourseCodes: string[];
  activeEnrollmentClassCount: number;
  reasons: string[];
}

export interface JlptClassificationSummary {
  totalClasses: number;
  kaiwa: number;
  jlpt: number;
  jlptValidExportLevel: number;
  jlptSafeInferredLevel: number;
  jlptManualLevelReview: number;
  jlptUniqueActiveCourseCode: number;
  jlptMissingActiveCourseCode: number;
  jlptMultipleActiveCourseCodes: number;
  mixed: number;
  unknown: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { jsonPath: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --json');
      }
      args.jsonPath = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function normalizeProgramType(raw: string | null | undefined): CanonicalProgram | null {
  const value = raw?.trim().toUpperCase();
  if (value === 'JLPT' || value === 'JNPT') return 'JLPT';
  if (value === 'KAIWA') return 'KAIWA';
  return null;
}

export function classifyPrograms(rawTypes: readonly string[]): Classification {
  const canonical = new Set(rawTypes.map(normalizeProgramType).filter(Boolean));
  if (canonical.size > 1) return 'MIXED';
  if (canonical.has('JLPT')) return 'JLPT';
  if (canonical.has('KAIWA')) return 'KAIWA';
  return 'UNKNOWN';
}

export function isJlptLevel(level: string | null): boolean {
  return level === 'N2' || level === 'N3' || level === 'N4' || level === 'N5';
}

function extractJlptLevels(value: string | null | undefined): string[] {
  return [...new Set((value?.toUpperCase().match(/N[2-5]/g) ?? []))].sort();
}

export function inferJlptLevel(
  classCode: string | null,
  activeCourseCodes: readonly string[],
): string | null {
  const classLevels = extractJlptLevels(classCode);
  const courseLevelGroups = activeCourseCodes.map(extractJlptLevels);
  if (classLevels.length !== 1 || courseLevelGroups.length === 0) return null;
  if (courseLevelGroups.some((levels) => levels.length !== 1)) return null;

  const allLevels = new Set([classLevels[0], ...courseLevelGroups.map((levels) => levels[0])]);
  return allLevels.size === 1 ? classLevels[0] : null;
}

export function summarizeRows(rows: readonly JlptClassificationAuditRow[]): JlptClassificationSummary {
  const summary: JlptClassificationSummary = {
    totalClasses: rows.length,
    kaiwa: 0,
    jlpt: 0,
    jlptValidExportLevel: 0,
    jlptSafeInferredLevel: 0,
    jlptManualLevelReview: 0,
    jlptUniqueActiveCourseCode: 0,
    jlptMissingActiveCourseCode: 0,
    jlptMultipleActiveCourseCodes: 0,
    mixed: 0,
    unknown: 0,
  };

  for (const row of rows) {
    if (row.classification === 'KAIWA') summary.kaiwa++;
    if (row.classification === 'MIXED') summary.mixed++;
    if (row.classification === 'UNKNOWN') summary.unknown++;
    if (row.classification !== 'JLPT') continue;

    summary.jlpt++;
    if (isJlptLevel(row.level)) summary.jlptValidExportLevel++;
    else if (row.proposedLevel) summary.jlptSafeInferredLevel++;
    else summary.jlptManualLevelReview++;

    if (row.activeCourseCodes.length === 0) summary.jlptMissingActiveCourseCode++;
    else if (row.activeCourseCodes.length === 1) summary.jlptUniqueActiveCourseCode++;
    else summary.jlptMultipleActiveCourseCodes++;
  }

  return summary;
}

export async function fetchClassificationAudit(): Promise<JlptClassificationAuditRow[]> {
  const classes = await prisma.class.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      class_code: true,
      class_name: true,
      level: true,
      enrollment_classes: {
        where: {
          enrollment: { student: { deleted_at: null } },
        },
        select: {
          status: true,
          enrollment: {
            select: {
              program_type: true,
              course_code: true,
            },
          },
        },
      },
    },
  });

  return classes.map((record) => {
    const rawProgramTypes = [...new Set(
      record.enrollment_classes
        .map((item) => item.enrollment.program_type?.trim())
        .filter((value): value is string => Boolean(value)),
    )].sort();
    const historicalCourseCodes = [...new Set(
      record.enrollment_classes
        .filter((item) => normalizeProgramType(item.enrollment.program_type) === 'JLPT')
        .map((item) => item.enrollment.course_code?.trim())
        .filter((value): value is string => Boolean(value)),
    )].sort();
    const activeCourseCodes = [...new Set(
      record.enrollment_classes
        .filter((item) => item.status === 'ACTIVE' && normalizeProgramType(item.enrollment.program_type) === 'JLPT')
        .map((item) => item.enrollment.course_code?.trim())
        .filter((value): value is string => Boolean(value)),
    )].sort();
    const classification = classifyPrograms(rawProgramTypes);
    const proposedLevel = classification === 'JLPT' && !isJlptLevel(record.level)
      ? inferJlptLevel(record.class_code, activeCourseCodes)
      : null;
    const reasons: string[] = [];

    if (classification === 'MIXED') reasons.push('Class contains both KAIWA and JLPT enrollments; block automatic backfill.');
    if (classification === 'UNKNOWN') reasons.push('Class has no canonical program type from enrollment data.');
    if (classification === 'JLPT' && !isJlptLevel(record.level) && proposedLevel) {
      reasons.push(`Class level may be safely proposed as ${proposedLevel}; ADMIN must approve the dry-run before any write.`);
    }
    if (classification === 'JLPT' && !isJlptLevel(record.level) && !proposedLevel) {
      reasons.push('JLPT class level requires manual review for N2, N3, N4 or N5 export.');
    }
    if (classification === 'JLPT' && activeCourseCodes.length === 0) {
      reasons.push('JLPT class has no course_code among ACTIVE EnrollmentClass records; manual course normalization required.');
    }
    if (classification === 'JLPT' && activeCourseCodes.length > 1) {
      reasons.push('JLPT class has multiple course_code values among ACTIVE EnrollmentClass records; manual course normalization required.');
    }

    return {
      classId: record.id,
      classCode: record.class_code,
      className: record.class_name,
      level: record.level,
      proposedLevel,
      classification,
      rawProgramTypes,
      historicalCourseCodes,
      activeCourseCodes,
      activeEnrollmentClassCount: record.enrollment_classes.filter((item) => item.status === 'ACTIVE').length,
      reasons,
    };
  });
}

function printSummary(summary: JlptClassificationSummary): void {
  console.log('JLPT class classification audit (READ ONLY)');
  console.log('No migration, create, update or delete is performed.\n');
  console.table(summary);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = await fetchClassificationAudit();
  const summary = summarizeRows(rows);
  printSummary(summary);

  const needsReview = rows.filter((row) => row.reasons.length > 0);
  console.log(`Rows requiring manual review: ${needsReview.length}`);
  console.table(needsReview.map((row) => ({
    classId: row.classId,
    classCode: row.classCode,
    className: row.className,
    classification: row.classification,
    level: row.level,
    proposedLevel: row.proposedLevel,
    activeCourseCodes: row.activeCourseCodes.join(', '),
    historicalCourseCodes: row.historicalCourseCodes.join(', '),
    reasons: row.reasons.join(' | '),
  })));

  if (args.jsonPath) {
    const outputPath = resolve(process.cwd(), args.jsonPath);
    writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 2), 'utf8');
    console.log(`JSON written: ${outputPath}`);
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
