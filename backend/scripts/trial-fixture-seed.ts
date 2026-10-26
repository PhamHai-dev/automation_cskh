/**
 * trial-fixture-seed.ts — one-command fixture preparation for the manual
 * three-role UI trial (docs/khao-sat/AI_REVIEW/08, Section 3).
 *
 * Creates ONLY the scaffolding the owner cannot click into existence before
 * the first browser action:
 *  - 4 namespaced accounts: dedicated trial ADMIN, GV (TEACHER + linked
 *    Teacher record), CVHT (CS), MANAGE (to exercise the assist-mark 403 gate
 *    of 08 Step 3b / D8);
 *  - synthetic Student + Package + 2 Enrollments on the SAME student (D11
 *    enrollment picker), 1-1 Class, ClassTeacher assignment with explicit
 *    start_date/end_date covering 2026-10-20 (D8), EnrollmentClass for
 *    Enrollment #1;
 *  - NO ZaloContactRelation / LineContactRelation, auto_message_enabled =
 *    false on both enrollments (08 §2.2 prevention method 1 — the trial
 *    cannot send real messages);
 *  - NO Attendance / ClassSession rows — those are what the owner creates by
 *    clicking the GV UI (that is the point of the trial).
 *
 * SAFETY (hard rules):
 *  1. Refuses to run unless the DATABASE_URL database name ends with `_test`
 *     (prints DB host/name first). Never touches production.
 *  2. ADDITIVE ONLY — no deleteMany / updateMany / delete / truncate anywhere.
 *     If any row of the target namespace already exists, the script reports it
 *     and exits; it NEVER mutates or removes existing rows. Rerun with a fresh
 *     --namespace instead.
 *  3. Every generated identifier is namespaced by --namespace (emails
 *     `<role>.<namespace>@example.test`, code/class/teacher/student ids, name
 *     markers) so the owner can identify and remove the rows later with their
 *     own DB tooling (FK-safe cleanup order in 08 §6).
 *  4. Only @example.test emails and synthetic data; no real students/teachers.
 *  5. Passwords (bcrypt cost 10, same scheme as src/modules/users/users.service.ts
 *     createUser / src/modules/teachers/teachers.service.ts): the dedicated trial
 *     ADMIN uses the repo seed convention's fixed known test password
 *     (backend/prisma/seed.ts `123456`) and it is deliberately NOT printed to
 *     stdout; the CVHT / GV / MANAGE trial accounts get freshly generated random
 *     passwords that ARE printed in the final summary block for browser login.
 *
 * Usage (owner-run, from backend/):
 *   npx ts-node --transpile-only scripts/trial-fixture-seed.ts --help
 *   npx ts-node --transpile-only scripts/trial-fixture-seed.ts --dry-run
 *   npx ts-node --transpile-only scripts/trial-fixture-seed.ts
 *     [--namespace trial_ui_20261026]
 *
 * Env resolution mirrors jest.setup.js / src/config/env.ts: `.env.test` is
 * loaded first (it points at automation_cskh_test), then `.env` for any
 * remaining variables; pre-set shell variables always win.
 */

/// <reference types="node" />

import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

// Load .env.test first (points at automation_cskh_test), then .env for any
// remaining vars — before importing ../src/prisma/client so PrismaClient sees
// the test DATABASE_URL at construction time. Pre-set shell env vars always win.
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import {
  AttendanceSourceType,
  ClassModelType,
  ClassTeacherRole,
  EnrollmentClassStatus,
  EnrollmentStatus,
  TeacherType,
} from '@prisma/client';

import { prisma } from '../src/prisma/client';

// ---------------------------------------------------------------------------
// Pure helpers (exported; unit-tested mock-only in __tests__/trial-fixture-seed.test.ts)
// ---------------------------------------------------------------------------

export const DEFAULT_NAMESPACE = 'trial_ui_20261026';

/**
 * Repo seed/test-account convention password (prisma/seed.ts, seed_new_accounts.ts,
 * reset-all-passwords.ts default). Used ONLY for the dedicated trial ADMIN hash;
 * intentionally never printed to stdout (summary block refers to the convention
 * instead). Safety rule 5.
 */
const REPO_ADMIN_TEST_PASSWORD = '123456';
export const BCRYPT_ROUNDS = 10;

export interface GeneratedPasswords {
  cs: string;
  teacher: string;
  manage: string;
}

export function generateAccountPassword(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export function generateTrialPasswords(): GeneratedPasswords {
  return {
    cs: generateAccountPassword(),
    teacher: generateAccountPassword(),
    manage: generateAccountPassword(),
  };
}

export async function hashTrialPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Fixture window / dates (08 §3 + Step 3b): assignment covers SESSION_DATE. */
export const ASSIGNMENT_START = '2026-09-01';
export const ASSIGNMENT_END = '2026-10-31';
/** Two same-day real sessions the GV will click inside the window (D8 positive, D11 unaffected). */
export const SESSION_DATE = '2026-10-20';
/** Date OUTSIDE the window — negative D8 case for assist-mark / Excel import. */
export const SESSION_DATE_OUTSIDE = '2026-11-05';

export interface CliArgs {
  namespace: string;
  help: boolean;
  dryRun: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { namespace: DEFAULT_NAMESPACE, help: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--namespace') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) {
        throw new CliError('Missing value for --namespace');
      }
      args.namespace = v;
    } else {
      throw new CliError(`Unknown argument: ${a}`);
    }
  }
  if (!isSafeNamespace(args.namespace)) {
    throw new CliError(
      `Invalid --namespace "${args.namespace}" — use letters/digits/underscore, 3..40 chars (e.g. trial_ui_20261026)`,
    );
  }
  return args;
}

export class CliError extends Error {}

/** Namespace must be identifier-safe: it is embedded in emails, codes and names. */
export function isSafeNamespace(ns: string): boolean {
  return /^[A-Za-z0-9_]{3,40}$/.test(ns);
}

export interface FixtureIds {
  emails: {
    admin: string;
    cs: string;
    teacher: string;
    manage: string;
  };
  teacherCode: string;
  staffCode: string;
  csGroupName: string;
  studentExternalId: string;
  packageCode: string;
  classCode: string;
}

export function deriveFixtureIds(namespace: string): FixtureIds {
  const ns = namespace.toUpperCase();
  const nsU = namespace;
  return {
    emails: {
      admin: `admin.${nsU}@example.test`,
      cs: `cs.${nsU}@example.test`,
      teacher: `teacher.${nsU}@example.test`,
      manage: `manage.${nsU}@example.test`,
    },
    teacherCode: `GV_${ns}`,
    staffCode: `CS_${ns}`,
    csGroupName: `Trial CS Group [${nsU}]`,
    studentExternalId: `HV_${ns}`,
    packageCode: `PKG_${ns}`,
    classCode: `CLS_${ns}`,
  };
}

/** Extract host + database name from a mysql:// DATABASE_URL (never the credentials). */
export function parseDbInfo(databaseUrl: string): { host: string; database: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return null;
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '').split(/[/?#]/)[0] ?? '');
  if (!database) return null;
  return { host: parsed.host, database };
}

/** Hard guard: the script only runs against a database whose name ends with `_test`. */
export function isAllowedTestDatabase(database: string): boolean {
  return database.endsWith('_test');
}

export function guardErrorMessage(): string {
  return (
    'Script chỉ chạy trên môi trường test (DATABASE_URL kết thúc bằng _test). ' +
    'Kiểm tra lại biến DATABASE_URL (nên trỏ vào automation_cskh_test qua .env.test) rồi chạy lại.'
  );
}

/** Rows that would collide with an existing trial namespace (all reads, no writes). */
export function buildExistenceQueries(ids: FixtureIds) {
  return {
    users: {
      OR: [
        { email: { in: Object.values(ids.emails) } },
        { code: ids.staffCode },
        { staff_code: ids.staffCode },
      ],
    },
    csGroup: { group_name: ids.csGroupName },
    teacher: { code: ids.teacherCode },
    student: { external_id: ids.studentExternalId },
    package: { code: ids.packageCode },
    class: { class_code: ids.classCode },
  };
}

export function formatExistenceReport(found: Record<string, number>): string {
  const lines = Object.entries(found)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `  - ${label}: ${n} row(s)`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Plan rendering (shared by --dry-run and the real seed)
// ---------------------------------------------------------------------------

export function renderPlan(ids: FixtureIds, namespace: string): string {
  return [
    `Namespace : ${namespace}`,
    `Users     : ${ids.emails.admin} [ADMIN] | ${ids.emails.cs} [CS] | ${ids.emails.teacher} [TEACHER] | ${ids.emails.manage} [MANAGE]`,
    `Teacher   : code ${ids.teacherCode} (linked to GV user, active)`,
    `Student   : external_id ${ids.studentExternalId} "Học Viên Chạy Thử [${namespace}]" phone 0900000001`,
    `Package   : code ${ids.packageCode}, default_total_sessions 10`,
    `Enroll. #1: KAIWA, 10 sessions, status STUDYING, auto_message_enabled=false, cs=${ids.emails.cs}`,
    `Enroll. #2: JLPT, 20 sessions, status STUDYING, auto_message_enabled=false (same student — D11 picker)`,
    `Class     : code ${ids.classCode} "Lớp 1-1 Chạy Thử [${namespace}]" ONE_TO_ONE / LEARNING_SYSTEM`,
    `ClassTeacher: GV ${ids.teacherCode} → class, role MAIN, active, window [${ASSIGNMENT_START}, ${ASSIGNMENT_END}]`,
    `EnrollmentClass: Enrollment #1 → class, sequence_no 1, ACTIVE`,
    `CS group  : "Trial CS Group [${namespace}]" with CVHT as member + ManageAssignment for MANAGE`,
    `            (so MANAGE can keep exercising cs-mark/bulk-approve in-group per 08 Bước 3b)`,
    `NOT created  : Attendance, ClassSession (owner clicks them in GV UI), ZaloContactRelation, LineContactRelation,`,
    `               AutomationWorkflow/Step (08 §2.2 prevention method 1 — no outbound sends possible)`,
  ].join('\n');
}

export function renderSummaryBlock(data: {
  dbHost: string;
  dbName: string;
  namespace: string;
  ids: FixtureIds;
  passwords: GeneratedPasswords;
  adminUserId: number;
  csUserId: number;
  teacherUserId: number;
  manageUserId: number;
  csGroupId: number;
  teacherRecId: number;
  studentId: number;
  packageId: number;
  enrollment1Id: number;
  enrollment2Id: number;
  classId: number;
  classTeacherId: number;
  enrollmentClassId: number;
}): string {
  const { ids, passwords } = data;
  return [
    '═══ KẾT QUẢ CHUẨN BỊ FIXTURE — DÁN VÀO CHECKLIST 08 MỤC 3 ═════════════════════',
    `DB                      : ${data.dbHost} / ${data.dbName}  (chỉ DB test)`,
    `Namespace               : ${data.namespace}`,
    '',
    '── Tài khoản (mật khẩu sinh ngẫu nhiên mỗi tài khoản; Admin dùng mật khẩu seed cố định của repo) ──',
    `ADMIN  (thứ 2, dedicated): #${data.adminUserId}  ${ids.emails.admin}   password: <theo quy ước seed cố định trong backend/prisma/seed.ts — không in ra stdout>`,
    `CVHT   (CS)             : #${data.csUserId}  ${ids.emails.cs}   password: ${passwords.cs}   (code/staff_code: ${ids.staffCode})`,
    `GV     (TEACHER)        : #${data.teacherUserId}  ${ids.emails.teacher}   password: ${passwords.teacher}   (Teacher rec #${data.teacherRecId}, code ${ids.teacherCode})`,
    `MANAGE (MANAGE)         : #${data.manageUserId}  ${ids.emails.manage}   password: ${passwords.manage}   (nhóm CS #${data.csGroupId} — kiểm chứng assist-mark trả 403 ở 08 Bước 3b)`,
    '',
    '── Dữ liệu lớp / học viên ────────────────────────────────────────────────',
    `Student   : #${data.studentId}  ${ids.studentExternalId}  "Học Viên Chạy Thử [${data.namespace}]"`,
    `Package   : #${data.packageId}  ${ids.packageCode}  (default_total_sessions=10)`,
    `Class     : #${data.classId}  ${ids.classCode}  "Lớp 1-1 Chạy Thử [${data.namespace}]"`,
    `Enrollment #1 (KAIWA, 10 buổi)   : #${data.enrollment1Id}  auto_message_enabled=false`,
    `Enrollment #2 (JLPT, 20 buổi)    : #${data.enrollment2Id}  auto_message_enabled=false  (D11: 2 enrollment / 1 học viên)`,
    `ClassTeacher (GV→class, MAIN)    : #${data.classTeacherId}  window [${ASSIGNMENT_START}, ${ASSIGNMENT_END}], active`,
    `EnrollmentClass (Enr#1→Class)    : #${data.enrollmentClassId}  sequence_no=1, ACTIVE`,
    '',
    '── Ngày phiên (session_date) fixture đã chuẩn bị cho ─────────────────────',
    `Trong cửa sổ D8 (CA 1 + CA 2 CÙNG NGÀY, GV bấm UI):`,
    `  - ${SESSION_DATE}  ca 1: 19:00–19:30  (nội dung gợi ý: "Bài 1: Hội thoại mở đầu")`,
    `  - ${SESSION_DATE}  ca 2: 20:00–20:30  (nội dung gợi ý: "Bài 2: Luyện phản xạ nâng cao")`,
    `Ngoài cửa sổ D8 (ca tiêu cực — assist-mark / import Excel phải bị chặn 403):`,
    `  - ${SESSION_DATE_OUTSIDE}  (sau end_date ${ASSIGNMENT_END})`,
    '',
    '── Trạng thái chốt tin nhắn (08 §2.2, cách 1) ────────────────────────────',
    '  auto_message_enabled=false trên cả 2 enrollment; KHÔNG tạo',
    '  ZaloContactRelation/LineContactRelation/AutomationWorkflow → không thể gửi tin thật.',
    '',
    '── Không tạo trước (chủ dự án bấm trên UI) ───────────────────────────────',
    '  ClassSession + Attendance (2 ca cùng ngày) — đó chính là nội dung chạy thử.',
    '',
    '── Dọn dẹp sau thử (08 §6, xóa con trước → cha sau) ──────────────────────',
    `  Lọc theo namespace "${data.namespace}": attendances/class_sessions theo class #${data.classId};`,
    `  enrollment_classes→enrollments #${data.enrollment1Id},#${data.enrollment2Id}; students #${data.studentId};`,
    `  classes #${data.classId}; teachers #${data.teacherRecId}; packages #${data.packageId};`,
    `  manage_assignments/cs_group_members→cs_groups #${data.csGroupId};`,
    `  auth_sessions/audit_logs→users #${data.adminUserId},#${data.csUserId},#${data.teacherUserId},#${data.manageUserId}.`,
    '══════════════════════════════════════════════════════════════════════════',
  ].join('\n');
}

export function usageText(): string {
  return [
    'Usage (from backend/):',
    '  npx ts-node --transpile-only scripts/trial-fixture-seed.ts [options]',
    '',
    'Prepares the fixture scaffolding for the manual three-role UI trial',
    '(docs/khao-sat/AI_REVIEW/08, Section 3): ADMIN/GV/CVHT/MANAGE accounts, synthetic',
    'student + package + 2 enrollments (D11), 1-1 class, GV assignment with explicit',
    'D8 window. Never creates Attendance/ClassSession; never sends messages',
    '(auto_message_enabled=false, no Zalo/LINE relations).',
    '',
    'Options:',
    `  --namespace <ns>   Fixture namespace (default: ${DEFAULT_NAMESPACE}); safe chars: [A-Za-z0-9_]{3,40}`,
    '  --dry-run          Run guards + collision checks and print the plan WITHOUT writing',
    '  -h, --help         Show this help and exit (no DB access)',
    '',
    'Safety:',
    '  - Refuses to run unless the DATABASE_URL database name ends with "_test".',
    '  - ADDITIVE ONLY: if any row of the target namespace exists, the script reports it',
    '    and exits — rerun with a fresh --namespace instead of mutating/removing rows.',
    '  - Passwords: generates a random password per non-admin trial account (bcrypt cost 10)',
    '    and uses the repo seed test password convention (backend/prisma/seed.ts) for Admin',
    '    without printing the Admin password to stdout.',
    '',
    'Env: loads .env.test first (points at automation_cskh_test), then .env — same order',
    'as jest.setup.js. Pre-exported DATABASE_URL always wins.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

async function checkNamespaceCollisions(ids: FixtureIds): Promise<Record<string, number>> {
  const q = buildExistenceQueries(ids);
  const [users, csGroup, teacher, student, pkg, cls] = await Promise.all([
    prisma.user.count({ where: q.users }),
    prisma.cSGroup.count({ where: q.csGroup }),
    prisma.teacher.count({ where: q.teacher }),
    prisma.student.count({ where: q.student }),
    prisma.package.count({ where: q.package }),
    prisma.class.count({ where: q.class }),
  ]);
  return { users, csGroup, teacher, student, package: pkg, class: cls };
}

async function seedFixture(ids: FixtureIds, namespace: string) {
  const passwords = generateTrialPasswords();
  const [adminPasswordHash, csPasswordHash, teacherPasswordHash, managePasswordHash] =
    await Promise.all([
      hashTrialPassword(REPO_ADMIN_TEST_PASSWORD),
      hashTrialPassword(passwords.cs),
      hashTrialPassword(passwords.teacher),
      hashTrialPassword(passwords.manage),
    ]);
  const nameMarker = `[${namespace}]`;

  const [adminUser, csUser, teacherUser, manageUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: ids.emails.admin,
        name: `Trial Admin ${nameMarker}`,
        password_hash: adminPasswordHash,
        roles: ['ADMIN'],
        active: true,
      },
    }),
    prisma.user.create({
      data: {
        email: ids.emails.cs,
        name: `Trial CVHT ${nameMarker}`,
        code: ids.staffCode,
        staff_code: ids.staffCode,
        password_hash: csPasswordHash,
        roles: ['CS'],
        active: true,
      },
    }),
    prisma.user.create({
      data: {
        email: ids.emails.teacher,
        name: `Trial GV ${nameMarker}`,
        password_hash: teacherPasswordHash,
        roles: ['TEACHER'],
        active: true,
      },
    }),
    prisma.user.create({
      data: {
        email: ids.emails.manage,
        name: `Trial MANAGE ${nameMarker}`,
        password_hash: managePasswordHash,
        roles: ['MANAGE'],
        active: true,
      },
    }),
  ]);

  // CS group + ManageAssignment so MANAGE can exercise in-group cs-mark / bulk-approve
  // while still getting 403 on teacher-mark assist and resolve-conflict (08 Step 3b).
  const csGroup = await prisma.cSGroup.create({
    data: {
      group_name: ids.csGroupName,
      active: true,
    },
  });
  await prisma.cSGroupMember.create({
    data: {
      cs_group_id: csGroup.id,
      user_id: csUser.id,
    },
  });
  await prisma.manageAssignment.create({
    data: {
      manage_user_id: manageUser.id,
      cs_group_id: csGroup.id,
    },
  });

  // Teacher profile linked to the GV user (mirrors the proven test fixture shape).
  const teacherRec = await prisma.teacher.create({
    data: {
      code: ids.teacherCode,
      name: `Trial GV ${nameMarker}`,
      email: ids.emails.teacher,
      user_id: teacherUser.id,
      teacher_type: TeacherType.OTHER,
      active: true,
    },
  });

  const student = await prisma.student.create({
    data: {
      external_id: ids.studentExternalId,
      full_name: `Học Viên Chạy Thử ${nameMarker}`,
      phone: '0900000001',
      // Intentionally NO zalo_uid / line_uid and no Zalo/LINE contact relations below.
    },
  });

  const pkg = await prisma.package.create({
    data: {
      code: ids.packageCode,
      name: `Gói 1-1 Chạy Thử ${nameMarker}`,
      default_total_sessions: 10,
      active: true,
    },
  });

  // Enrollment #1 (KAIWA, 10) — the one classed into the trial class (D8 session path).
  const enrollment1 = await prisma.enrollment.create({
    data: {
      student_id: student.id,
      package_id: pkg.id,
      cs_id: csUser.id,
      program_type: 'KAIWA',
      total_sessions: 10,
      status: EnrollmentStatus.STUDYING,
      auto_message_enabled: false,
    },
  });

  // Enrollment #2 (JLPT, 20) — same student, for the D11 explicit enrollment_id picker.
  const enrollment2 = await prisma.enrollment.create({
    data: {
      student_id: student.id,
      package_id: pkg.id,
      cs_id: csUser.id,
      program_type: 'JLPT',
      total_sessions: 20,
      status: EnrollmentStatus.STUDYING,
      auto_message_enabled: false,
    },
  });

  const cls = await prisma.class.create({
    data: {
      class_code: ids.classCode,
      class_name: `Lớp 1-1 Chạy Thử ${nameMarker}`,
      model_type: ClassModelType.ONE_TO_ONE,
      attendance_source: AttendanceSourceType.LEARNING_SYSTEM,
      active: true,
    },
  });

  // D8: explicit window covering SESSION_DATE and excluding SESSION_DATE_OUTSIDE.
  const classTeacher = await prisma.classTeacher.create({
    data: {
      class_id: cls.id,
      teacher_id: teacherRec.id,
      role: ClassTeacherRole.MAIN,
      active: true,
      start_date: new Date(`${ASSIGNMENT_START}T00:00:00Z`),
      end_date: new Date(`${ASSIGNMENT_END}T00:00:00Z`),
    },
  });

  const enrollmentClass = await prisma.enrollmentClass.create({
    data: {
      enrollment_id: enrollment1.id,
      class_id: cls.id,
      sequence_no: 1,
      status: EnrollmentClassStatus.ACTIVE,
    },
  });

  return {
    passwords,
    adminUser,
    csUser,
    teacherUser,
    manageUser,
    csGroup,
    teacherRec,
    student,
    pkg,
    enrollment1,
    enrollment2,
    cls,
    classTeacher,
    enrollmentClass,
  };
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`${err.message}\n\n${usageText()}`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  if (args.help) {
    // Safe dry invocation: no DB access at all.
    console.log(usageText());
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Thiếu biến môi trường DATABASE_URL — không xác định được database đích.');
    process.exitCode = 1;
    return;
  }
  const dbInfo = parseDbInfo(databaseUrl);
  if (!dbInfo) {
    console.error('DATABASE_URL không hợp lệ (mong dạng mysql://user:pass@host:port/dbname).');
    process.exitCode = 1;
    return;
  }

  console.log(`DB đích: host=${dbInfo.host} database=${dbInfo.database}`);
  if (!isAllowedTestDatabase(dbInfo.database)) {
    console.error(guardErrorMessage());
    process.exitCode = 1;
    return;
  }

  const ids = deriveFixtureIds(args.namespace);

  console.log(`\n== PLAN (namespace=${args.namespace}) ==`);
  console.log(renderPlan(ids, args.namespace));

  if (args.dryRun) {
    console.log(
      `\n--dry-run: guard OK (${dbInfo.host}/${dbInfo.database} kết thúc bằng _test). Không kết nối/ghi gì vào DB.`,
    );
    return;
  }

  // Namespace collision detection (READ-ONLY, run before any insert).
  const found = await checkNamespaceCollisions(ids);
  if (Object.values(found).some((n) => n > 0)) {
    console.error('\nFixture namespace đã tồn tại một phần — script KHÔNG sửa/xóa dữ liệu cũ:');
    console.error(formatExistenceReport(found));
    console.error(
      `\nHãy chạy lại với namespace mới, ví dụ:  --namespace ${args.namespace}_2`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nĐang tạo fixture (chỉ thêm, không sửa/xóa)...');
  const created = await seedFixture(ids, args.namespace);

  console.log(
    renderSummaryBlock({
      dbHost: dbInfo.host,
      dbName: dbInfo.database,
      namespace: args.namespace,
      ids,
      passwords: created.passwords,
      adminUserId: created.adminUser.id,
      csUserId: created.csUser.id,
      teacherUserId: created.teacherUser.id,
      manageUserId: created.manageUser.id,
      csGroupId: created.csGroup.id,
      teacherRecId: created.teacherRec.id,
      studentId: created.student.id,
      packageId: created.pkg.id,
      enrollment1Id: created.enrollment1.id,
      enrollment2Id: created.enrollment2.id,
      classId: created.cls.id,
      classTeacherId: created.classTeacher.id,
      enrollmentClassId: created.enrollmentClass.id,
    }),
  );
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('trial-fixture-seed FAILED (additive-only; no rows were mutated or removed):', err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
