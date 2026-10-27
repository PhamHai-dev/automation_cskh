/**
 * Mock-only unit tests for the pure helpers in scripts/trial-fixture-seed.ts.
 * Zero DB access: prisma client is mocked so importing the module never touches
 * a database.
 */

jest.mock('../../src/prisma/client', () => ({
  prisma: {
    $disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

import bcrypt from 'bcrypt';
import {
  ASSIGNMENT_END,
  ASSIGNMENT_START,
  BCRYPT_ROUNDS,
  CliError,
  DEFAULT_NAMESPACE,
  SESSION_DATE,
  SESSION_DATE_OUTSIDE,
  buildExistenceQueries,
  deriveFixtureIds,
  formatExistenceReport,
  generateAccountPassword,
  generateTrialPasswords,
  guardErrorMessage,
  hashTrialPassword,
  isAllowedTestDatabase,
  isSafeNamespace,
  parseArgs,
  parseDbInfo,
  renderPlan,
  renderSummaryBlock,
  usageText,
} from '../trial-fixture-seed';

describe('trial-fixture-seed pure helpers (mock-only)', () => {
  describe('parseArgs & isSafeNamespace', () => {
    it('uses default namespace and flags when no args are given', () => {
      expect(parseArgs([])).toEqual({
        namespace: DEFAULT_NAMESPACE,
        help: false,
        dryRun: false,
      });
    });

    it('parses --help, -h, --dry-run, and --namespace', () => {
      expect(parseArgs(['--help']).help).toBe(true);
      expect(parseArgs(['-h']).help).toBe(true);
      expect(parseArgs(['--dry-run', '--namespace', 'trial_custom_01'])).toEqual({
        namespace: 'trial_custom_01',
        help: false,
        dryRun: true,
      });
    });

    it('rejects missing --namespace value, unknown flags, and unsafe namespaces', () => {
      expect(() => parseArgs(['--namespace'])).toThrow(CliError);
      expect(() => parseArgs(['--namespace', '--dry-run'])).toThrow(CliError);
      expect(() => parseArgs(['--unknown'])).toThrow(CliError);
      expect(() => parseArgs(['--namespace', 'ab'])).toThrow(CliError);
      expect(() => parseArgs(['--namespace', 'bad-ns!'])).toThrow(CliError);
      expect(isSafeNamespace('trial_ui_20261026')).toBe(true);
      expect(isSafeNamespace('bad-ns')).toBe(false);
    });
  });

  describe('parseDbInfo & isAllowedTestDatabase guard', () => {
    it('extracts host and database name without exposing credentials', () => {
      expect(
        parseDbInfo('mysql://user:secret@localhost:3306/automation_cskh_test?connection_limit=5'),
      ).toEqual({
        host: 'localhost:3306',
        database: 'automation_cskh_test',
      });
      expect(parseDbInfo('not-a-url')).toBeNull();
      expect(parseDbInfo('mysql://localhost:3306/')).toBeNull();
    });

    it('allows only database names ending with _test and returns the Vietnamese guard error', () => {
      expect(isAllowedTestDatabase('automation_cskh_test')).toBe(true);
      expect(isAllowedTestDatabase('automation_cskh')).toBe(false);
      expect(isAllowedTestDatabase('automation_cskh_prod')).toBe(false);
      expect(guardErrorMessage()).toContain(
        'Script chỉ chạy trên môi trường test (DATABASE_URL kết thúc bằng _test).',
      );
    });
  });

  describe('deriveFixtureIds & buildExistenceQueries', () => {
    it('namespaces all synthetic codes and uses @example.test emails', () => {
      const ids = deriveFixtureIds('trial_ui_20261026');
      expect(ids.emails).toEqual({
        admin: 'admin.trial_ui_20261026@example.test',
        cs: 'cs.trial_ui_20261026@example.test',
        teacher: 'teacher.trial_ui_20261026@example.test',
        manage: 'manage.trial_ui_20261026@example.test',
      });
      expect(ids.teacherCode).toBe('GV_TRIAL_UI_20261026');
      expect(ids.staffCode).toBe('CS_TRIAL_UI_20261026');
      expect(ids.csGroupName).toBe('Trial CS Group [trial_ui_20261026]');
      expect(ids.studentExternalId).toBe('HV_TRIAL_UI_20261026');
      expect(ids.packageCode).toBe('PKG_TRIAL_UI_20261026');
      expect(ids.classCode).toBe('CLS_TRIAL_UI_20261026');

      const q = buildExistenceQueries(ids);
      expect(q.teacher).toEqual({ code: 'GV_TRIAL_UI_20261026' });
      expect(q.student).toEqual({ external_id: 'HV_TRIAL_UI_20261026' });
      expect(q.package).toEqual({ code: 'PKG_TRIAL_UI_20261026' });
      expect(q.class).toEqual({ class_code: 'CLS_TRIAL_UI_20261026' });
      expect(formatExistenceReport({ users: 2, teacher: 0, class: 1 })).toBe(
        '  - users: 2 row(s)\n  - class: 1 row(s)',
      );
    });
  });

  describe('passwords & rendering', () => {
    it('generates distinct random URL-safe passwords per non-admin role and hashes with bcrypt cost 10', async () => {
      const pwds = generateTrialPasswords();
      expect(pwds.cs).toHaveLength(12);
      expect(pwds.teacher).toHaveLength(12);
      expect(pwds.manage).toHaveLength(12);
      expect(new Set([pwds.cs, pwds.teacher, pwds.manage]).size).toBe(3);

      const sample = generateAccountPassword();
      const hash = await hashTrialPassword(sample);
      expect(BCRYPT_ROUNDS).toBe(10);
      expect(await bcrypt.compare(sample, hash)).toBe(true);
    });

    it('renders plan, usage, and summary block with D8/D11 dates and never prints the fixed admin password to stdout', () => {
      const ids = deriveFixtureIds('trial_ui_20261026');
      const plan = renderPlan(ids, 'trial_ui_20261026');
      expect(plan).toContain(ASSIGNMENT_START);
      expect(plan).toContain(ASSIGNMENT_END);
      expect(plan).toContain('auto_message_enabled=false');

      const pwds = { cs: 'RandCsPwd001', teacher: 'RandGvPwd002', manage: 'RandMgPwd003' };
      const summary = renderSummaryBlock({
        dbHost: 'localhost:3306',
        dbName: 'automation_cskh_test',
        namespace: 'trial_ui_20261026',
        ids,
        passwords: pwds,
        adminUserId: 11,
        csUserId: 12,
        teacherUserId: 13,
        manageUserId: 14,
        csGroupId: 21,
        teacherRecId: 31,
        studentId: 41,
        packageId: 51,
        enrollment1Id: 61,
        enrollment2Id: 62,
        classId: 71,
        classTeacherId: 81,
        enrollmentClassId: 91,
      });

      expect(summary).toContain('automation_cskh_test');
      expect(summary).toContain('RandCsPwd001');
      expect(summary).toContain('RandGvPwd002');
      expect(summary).toContain('RandMgPwd003');
      expect(summary).toContain(SESSION_DATE);
      expect(summary).toContain(SESSION_DATE_OUTSIDE);
      expect(summary).not.toContain('123456');
      expect(usageText()).not.toContain('123456');
    });
  });
});
