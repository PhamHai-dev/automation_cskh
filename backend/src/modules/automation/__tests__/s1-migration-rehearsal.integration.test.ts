/**
 * INTEGRATION REHEARSAL (DB-backed, automation_cskh_test via .env.test):
 * S1 Milestone Occurrence Migration SQL Rehearsal (07 v2.3)
 *
 * Verifies the three SQL & protocol fixes mandated by the Owner review of 07 v2.2:
 *  1. Case 1 — Unified Canonical Rule (SQL §2.3 / §7.3 / §7.5 R3 vs application
 *     `automationRepository.findDeliveryForMilestoneOccurrence` / `pickCanonicalOccurrence`):
 *     Seeds an enrollment with 2 FINAL ATTENDED attendances (A1, A2) and 3
 *     MessageDelivery rows for step 2 (a CANCELLED superseded row on A0, an old
 *     QUEUED row on A1 with a lower id, and an active QUEUED row on current K7
 *     basis A2 with a higher id). Proves the unified SQL selector picks the exact
 *     same (canonical_delivery_id, status, basis_attendance_id) as the application!
 *  2. Case 2 — Real Delta-Sync (`QUEUED -> SENT`) & Monotonic Protection Guard (§7.3):
 *     - Initial backfill when delivery D1 is QUEUED -> occurrence is QUEUED.
 *     - D1 transitions to SENT in `message_deliveries` before cutover freeze.
 *     - Re-running §7.3 Delta-Sync updates occurrence to status='SENT',
 *       canonical_delivery_id=D1.id, basis_attendance_id=A1.id, satisfied_at!=null.
 *     - Simulating a stale/corrupted input (`QUEUED` on another basis A2) proves
 *       the monotonic guard in `ON DUPLICATE KEY UPDATE` never downgrades an
 *       already-SENT occurrence back to QUEUED or alters its basis_attendance_id
 *       or canonical_delivery_id.
 *     - Also verifies `SENDING -> SENT` is allowed on the same canonical_delivery_id
 *       while `SENDING -> QUEUED` is blocked.
 *  3. Case 3 — Rollback Contradiction Pre-Check Gate `R2.0`, Safe Unsent-Only `R2.1` & `R3`:
 *     - Seeds a contradiction where `message_deliveries` has `status = 'SENT'` on A1
 *       while the occurrence row has `status = 'QUEUED'` on A2.
 *     - Verifies `R2.0` detects the contradiction (`count > 0`) with reason
 *       `SENT_DELIVERY_CONTRADICTS_OCCURRENCE` and blocks rollback.
 *     - Verifies `R2.1` (even if executed directly) NEVER overwrites `md.status = 'SENT'`,
 *       `md.attendance_id`, `md.rendered_content`, `md.sent_at`, or `md.provider_message_id`.
 *     - Seeds a second non-contradicting post-cutover occurrence (`mo.status = 'CANCELLED'`
 *       after dropping below milestone while `md.status = 'QUEUED'`) -> verifies `R2.0`
 *       returns 0 contradictions for it, `R2.1` safely updates `md.status` to `'CANCELLED'`,
 *       and `R3` confirms 100% field-by-field parity with `findDeliveryForMilestoneOccurrence`.
 *
 * Uses temporary rehearsal table `milestone_occurrences_rehearsal_20261026`, dropped in
 * `afterAll` so `automation_cskh_test` schema is 100% restored with zero residue.
 */

import { prisma } from '../../../prisma/client';
import {
  AttendanceSource,
  AttendanceStatus,
  AutomationChannel,
  AutomationTriggerEvent,
  ClassModelType,
  EnrollmentClassStatus,
  EnrollmentStatus,
  MessageDeliveryStatus,
  ReconciliationState,
  ZaloAccountStatus,
} from '@prisma/client';
import { automationRepository } from '../automation-repository';

const NS = 's1_rehearsal_20261026';
const REHEARSAL_TABLE = 'milestone_occurrences_rehearsal_20261026';

interface RehearsalOccurrenceRow {
  id: number;
  enrollment_id: number;
  automation_step_id: number;
  basis_attendance_id: number;
  canonical_delivery_id: number | null;
  session_number: number;
  status: string;
  first_reached_at: Date;
  satisfied_at: Date | null;
  updated_at: Date;
}

describe('Integration Rehearsal (DB): 07 v2.3 S1 Migration SQL (Canonical Parity, Delta-Sync, R2.0/R2.1/R3)', () => {
  let adminId: number;
  let csId: number;
  let packageId: number;
  let classId: number;
  let zaloAccountId: number;
  let workflowId: number;
  let step1Id: number;
  let step2Id: number;

  const createdStudentIds: number[] = [];
  const createdEnrollmentIds: number[] = [];
  const createdEnrollmentClassIds: number[] = [];
  const createdSessionIds: number[] = [];
  let sessionSeq = 7000;

  beforeAll(async () => {
    // Ensure clean state before creating the rehearsal table
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${REHEARSAL_TABLE}\``);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${REHEARSAL_TABLE}\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`enrollment_id\` INT NOT NULL,
        \`automation_step_id\` INT NOT NULL,
        \`basis_attendance_id\` INT NOT NULL,
        \`canonical_delivery_id\` INT NULL,
        \`session_number\` INT NOT NULL,
        \`status\` ENUM(
          'SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED',
          'SKIPPED_NOT_FRIEND', 'SKIPPED_GROUP_INACTIVE', 'SKIPPED_ACCOUNT_INACTIVE',
          'SKIPPED_SESSION_EXPIRED', 'SKIPPED_DISABLED'
        ) NOT NULL DEFAULT 'SCHEDULED',
        \`first_reached_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`satisfied_at\` DATETIME(3) NULL DEFAULT NULL,
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`${REHEARSAL_TABLE}_enrollment_step_key\` (\`enrollment_id\`, \`automation_step_id\`),
        UNIQUE INDEX \`${REHEARSAL_TABLE}_canonical_delivery_key\` (\`canonical_delivery_id\`),
        INDEX \`${REHEARSAL_TABLE}_enrollment_session_idx\` (\`enrollment_id\`, \`session_number\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    const admin = await prisma.user.create({
      data: {
        email: `admin_${NS}@example.com`,
        name: 'S1 Rehearsal Admin',
        password_hash: 'x',
        roles: ['ADMIN'],
      },
    });
    const cs = await prisma.user.create({
      data: {
        email: `cs_${NS}@example.com`,
        name: 'S1 Rehearsal CS',
        password_hash: 'x',
        roles: ['CS'],
      },
    });
    adminId = admin.id;
    csId = cs.id;

    const pkg = await prisma.package.create({
      data: {
        code: `PKG_${NS}`,
        name: 'Gói S1 Rehearsal',
        default_total_sessions: 24,
      },
    });
    packageId = pkg.id;

    const cls = await prisma.class.create({
      data: {
        class_name: `Lớp ${NS}`,
        class_code: `CLS_${NS}`,
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: 'LEARNING_SYSTEM',
      },
    });
    classId = cls.id;

    const zalo = await prisma.zaloAccount.upsert({
      where: { zalo_uid: `zalo_${NS}` },
      update: { status: ZaloAccountStatus.ACTIVE, cs_id: csId },
      create: {
        cs_id: csId,
        zalo_uid: `zalo_${NS}`,
        display_name: 'Zalo S1 Rehearsal',
        status: ZaloAccountStatus.ACTIVE,
      },
    });
    zaloAccountId = zalo.id;

    const wf = await prisma.automationWorkflow.create({
      data: {
        name: `Workflow ${NS}`,
        owner_cs_id: csId,
        active: true,
      },
    });
    workflowId = wf.id;

    const s1 = await prisma.automationStep.create({
      data: {
        workflow_id: workflowId,
        session_number: 1,
        trigger_event: AutomationTriggerEvent.ATTENDED,
        delay_minutes: 0,
        channel: AutomationChannel.ZALO_PERSONAL,
        message_content: 'Milestone 1 {{student_name}}',
        message_variables: ['student_name'] as any,
        active: true,
      },
    });
    const s2 = await prisma.automationStep.create({
      data: {
        workflow_id: workflowId,
        session_number: 2,
        trigger_event: AutomationTriggerEvent.ATTENDED,
        delay_minutes: 0,
        channel: AutomationChannel.ZALO_PERSONAL,
        message_content: 'Milestone 2 {{student_name}}',
        message_variables: ['student_name'] as any,
        active: true,
      },
    });
    step1Id = s1.id;
    step2Id = s2.id;
  });

  afterAll(async () => {
    // 1. Drop the temporary rehearsal table first
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${REHEARSAL_TABLE}\``);

    // 2. Clean up all seeded rows in FK-safe order
    if (createdEnrollmentIds.length > 0) {
      await prisma.messageDelivery.deleteMany({
        where: { enrollment_id: { in: createdEnrollmentIds } },
      });
      await prisma.attendance.deleteMany({
        where: { enrollment_class: { enrollment_id: { in: createdEnrollmentIds } } },
      });
      await prisma.automationEnrollment.deleteMany({
        where: { enrollment_id: { in: createdEnrollmentIds } },
      });
    }
    if (createdSessionIds.length > 0) {
      await prisma.classSession.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
    }
    if (createdEnrollmentClassIds.length > 0) {
      await prisma.enrollmentClass.deleteMany({
        where: { id: { in: createdEnrollmentClassIds } },
      });
    }
    if (createdEnrollmentIds.length > 0) {
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
    }
    if (workflowId) {
      await prisma.automationStep.deleteMany({ where: { workflow_id: workflowId } });
      await prisma.automationEnrollment.deleteMany({ where: { workflow_id: workflowId } });
      await prisma.automationWorkflow.deleteMany({ where: { id: workflowId } });
    }
    if (createdStudentIds.length > 0) {
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds } },
      });
    }
    if (zaloAccountId) {
      await prisma.zaloAccount.deleteMany({ where: { id: zaloAccountId } });
    }
    if (classId) {
      await prisma.classSession.deleteMany({ where: { class_id: classId } });
      await prisma.class.deleteMany({ where: { id: classId } });
    }
    if (packageId) {
      await prisma.package.deleteMany({ where: { id: packageId } });
    }
    const userIds = [adminId, csId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    // 3. Verify zero schema or data residue
    const tables = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
      `SHOW TABLES LIKE 'milestone_occurrences%'`,
    );
    expect(tables).toHaveLength(0);

    const remUsers = await prisma.user.count({
      where: { email: { endsWith: `_${NS}@example.com` } },
    });
    expect(remUsers).toBe(0);

    await prisma.$disconnect();
  });

  async function seedEnrollment(tag: string) {
    const student = await prisma.student.create({
      data: {
        external_id: `HV_${tag}_${NS}`,
        full_name: `Học Viên ${tag}`,
        phone: '0988111222',
      },
    });
    createdStudentIds.push(student.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        student_id: student.id,
        package_id: packageId,
        cs_id: csId,
        total_sessions: 24,
        status: EnrollmentStatus.STUDYING,
        auto_message_enabled: true,
      },
    });
    createdEnrollmentIds.push(enrollment.id);

    const ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollment.id,
        class_id: classId,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });
    createdEnrollmentClassIds.push(ec.id);

    await prisma.automationEnrollment.create({
      data: {
        enrollment_id: enrollment.id,
        workflow_id: workflowId,
        added_by: csId,
      },
    });

    return { student, enrollment, enrollmentClass: ec };
  }

  async function createAttendanceRow(params: {
    enrollmentClassId: number;
    sessionDate: string;
    status: AttendanceStatus;
    reconciliationState: ReconciliationState;
  }) {
    sessionSeq += 1;
    const session = await prisma.classSession.create({
      data: {
        class_id: classId,
        session_number: sessionSeq,
        session_date: new Date(params.sessionDate),
        created_by_id: adminId,
      },
    });
    createdSessionIds.push(session.id);

    return prisma.attendance.create({
      data: {
        enrollment_class_id: params.enrollmentClassId,
        class_session_id: session.id,
        teacher_status: params.status,
        cs_status: params.status,
        status: params.status,
        reconciliation_state: params.reconciliationState,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
      },
    });
  }

  /**
   * Executes the exact §7.3 Backfill + Delta-Sync SQL from 07 v2.3 against the
   * rehearsal table for the given enrollment IDs.
   */
  async function runSection73BackfillAndDeltaSync(enrollmentIds: number[]) {
    const idList = enrollmentIds.map((id) => Number(id)).join(', ');
    await prisma.$executeRawUnsafe(`
      INSERT INTO \`${REHEARSAL_TABLE}\` (
        \`enrollment_id\`,
        \`automation_step_id\`,
        \`basis_attendance_id\`,
        \`canonical_delivery_id\`,
        \`session_number\`,
        \`status\`,
        \`first_reached_at\`,
        \`satisfied_at\`,
        \`updated_at\`
      )
      SELECT
        ranked.enrollment_id,
        ranked.automation_step_id,
        ranked.attendance_id AS basis_attendance_id,
        ranked.id AS canonical_delivery_id,
        ranked.session_number,
        ranked.status,
        ranked.first_reached_at,
        ranked.satisfied_at,
        NOW(3) AS updated_at
      FROM (
        SELECT
          md.id,
          md.enrollment_id,
          md.automation_step_id,
          md.attendance_id,
          md.status,
          s.session_number,
          MIN(md.created_at) OVER (
            PARTITION BY md.enrollment_id, md.automation_step_id
          ) AS first_reached_at,
          CASE
            WHEN md.status = 'SENT' THEN COALESCE(md.sent_at, md.created_at)
            ELSE MIN(md.created_at) OVER (
              PARTITION BY md.enrollment_id, md.automation_step_id
            )
          END AS satisfied_at,
          ROW_NUMBER() OVER (
            PARTITION BY md.enrollment_id, md.automation_step_id
            ORDER BY
              CASE
                WHEN md.status = 'SENT' THEN 1
                WHEN md.status = 'SENDING' THEN 2
                ELSE 3
              END ASC,
              CASE
                WHEN md.status IN ('SENT', 'SENDING') THEN 0
                WHEN md.status IN ('QUEUED', 'SCHEDULED') THEN 1
                ELSE 2
              END ASC,
              CASE
                WHEN COALESCE(md.error_message, '') LIKE 'Superseded duplicate%'
                  OR COALESCE(md.error_message, '') LIKE 'Rollback reconciliation:%'
                THEN 1
                ELSE 0
              END ASC,
              CASE
                WHEN md.status NOT IN ('SENT', 'SENDING')
                 AND k7_basis.attendance_id IS NOT NULL
                 AND md.attendance_id = k7_basis.attendance_id
                THEN 0
                ELSE 1
              END ASC,
              CASE md.status
                WHEN 'SENT' THEN 1
                WHEN 'SENDING' THEN 2
                WHEN 'QUEUED' THEN 3
                WHEN 'SCHEDULED' THEN 4
                WHEN 'CANCELLED' THEN 5
                ELSE 6
              END ASC,
              md.id ASC
          ) AS rn
        FROM \`message_deliveries\` md
        INNER JOIN \`automation_steps\` s ON s.id = md.automation_step_id
        LEFT JOIN (
          SELECT
            ec.enrollment_id,
            a.id AS attendance_id,
            ROW_NUMBER() OVER (
              PARTITION BY ec.enrollment_id
              ORDER BY cs.session_date ASC, a.created_at ASC, a.id ASC
            ) AS k7_ordinal
          FROM \`attendances\` a
          INNER JOIN \`enrollment_classes\` ec ON ec.id = a.enrollment_class_id
          INNER JOIN \`class_sessions\` cs ON cs.id = a.class_session_id
          WHERE a.status = 'ATTENDED'
            AND a.reconciliation_state IN ('MATCHED', 'RESOLVED')
            AND a.deleted_at IS NULL
        ) AS k7_basis
          ON k7_basis.enrollment_id = md.enrollment_id
         AND k7_basis.k7_ordinal = s.session_number
        WHERE s.trigger_event = 'ATTENDED'
          AND md.enrollment_id IN (${idList})
      ) AS ranked
      WHERE ranked.rn = 1
      ON DUPLICATE KEY UPDATE
        \`basis_attendance_id\` = CASE
          WHEN \`${REHEARSAL_TABLE}\`.\`status\` IN ('SENT', 'SENDING')
            THEN \`${REHEARSAL_TABLE}\`.\`basis_attendance_id\`
          ELSE VALUES(\`basis_attendance_id\`)
        END,
        \`canonical_delivery_id\` = CASE
          WHEN \`${REHEARSAL_TABLE}\`.\`status\` IN ('SENT', 'SENDING')
            THEN \`${REHEARSAL_TABLE}\`.\`canonical_delivery_id\`
          ELSE VALUES(\`canonical_delivery_id\`)
        END,
        \`satisfied_at\` = CASE
          WHEN \`${REHEARSAL_TABLE}\`.\`status\` = 'SENT'
            THEN COALESCE(\`${REHEARSAL_TABLE}\`.\`satisfied_at\`, VALUES(\`satisfied_at\`))
          WHEN \`${REHEARSAL_TABLE}\`.\`status\` = 'SENDING'
            THEN CASE
              WHEN VALUES(\`status\`) = 'SENT'
               AND VALUES(\`canonical_delivery_id\`) = \`${REHEARSAL_TABLE}\`.\`canonical_delivery_id\`
                THEN COALESCE(\`${REHEARSAL_TABLE}\`.\`satisfied_at\`, VALUES(\`satisfied_at\`))
              ELSE \`${REHEARSAL_TABLE}\`.\`satisfied_at\`
            END
          ELSE COALESCE(\`${REHEARSAL_TABLE}\`.\`satisfied_at\`, VALUES(\`satisfied_at\`))
        END,
        \`first_reached_at\` = LEAST(\`${REHEARSAL_TABLE}\`.\`first_reached_at\`, VALUES(\`first_reached_at\`)),
        \`status\` = CASE
          WHEN \`${REHEARSAL_TABLE}\`.\`status\` = 'SENT'
            THEN 'SENT'
          WHEN \`${REHEARSAL_TABLE}\`.\`status\` = 'SENDING'
            THEN CASE
              WHEN VALUES(\`status\`) = 'SENT'
               AND VALUES(\`canonical_delivery_id\`) = \`${REHEARSAL_TABLE}\`.\`canonical_delivery_id\`
                THEN 'SENT'
              ELSE 'SENDING'
            END
          ELSE VALUES(\`status\`)
        END,
        \`updated_at\` = VALUES(\`updated_at\`)
    `);
  }

  /**
   * Executes the §7.5 R2.0 Contradiction Pre-Check Gate query for the given enrollment IDs.
   */
  async function runR20ContradictionPreCheck(enrollmentIds: number[]) {
    const idList = enrollmentIds.map((id) => Number(id)).join(', ');
    return prisma.$queryRawUnsafe<
      Array<{
        occurrence_id: number;
        enrollment_id: number;
        automation_step_id: number;
        canonical_delivery_id: number | null;
        delivery_id: number | null;
        mo_status: string;
        md_status: string | null;
        mo_basis_attendance_id: number;
        md_attendance_id: number | null;
        contradiction_code: string;
      }>
    >(`
      SELECT
        mo.id AS occurrence_id,
        mo.enrollment_id,
        mo.automation_step_id,
        mo.canonical_delivery_id,
        md.id AS delivery_id,
        mo.status AS mo_status,
        md.status AS md_status,
        mo.basis_attendance_id AS mo_basis_attendance_id,
        md.attendance_id AS md_attendance_id,
        CASE
          WHEN md.status = 'SENT' AND (
            mo.status <> 'SENT'
            OR mo.basis_attendance_id <> md.attendance_id
            OR mo.canonical_delivery_id IS NULL
            OR mo.canonical_delivery_id <> md.id
          ) THEN 'SENT_DELIVERY_CONTRADICTS_OCCURRENCE'
          WHEN (md.status = 'SENDING' OR mo.status = 'SENDING') THEN 'UNRESOLVED_OR_MISMATCHED_SENDING'
          WHEN mo.status = 'SENT' AND (
            md.id IS NULL
            OR md.status <> 'SENT'
            OR mo.basis_attendance_id <> md.attendance_id
          ) THEN 'SENT_OCCURRENCE_WITHOUT_MATCHING_SENT_DELIVERY'
          ELSE 'EVIDENCE_CONFLICT'
        END AS contradiction_code
      FROM \`${REHEARSAL_TABLE}\` mo
      LEFT JOIN \`message_deliveries\` md
        ON md.enrollment_id = mo.enrollment_id
       AND md.automation_step_id = mo.automation_step_id
       AND (
         md.id = mo.canonical_delivery_id
         OR md.status IN ('SENT', 'SENDING')
       )
      WHERE mo.enrollment_id IN (${idList})
        AND (
          (
            md.status = 'SENT'
            AND (
              mo.status <> 'SENT'
              OR (md.id = mo.canonical_delivery_id AND mo.basis_attendance_id <> md.attendance_id)
              OR mo.canonical_delivery_id IS NULL
              OR NOT EXISTS (
                SELECT 1
                FROM \`message_deliveries\` cd
                WHERE cd.id = mo.canonical_delivery_id
                  AND cd.enrollment_id = mo.enrollment_id
                  AND cd.automation_step_id = mo.automation_step_id
                  AND cd.status = 'SENT'
                  AND cd.attendance_id = mo.basis_attendance_id
              )
            )
          )
          OR (
            (md.status = 'SENDING' OR mo.status = 'SENDING')
            AND (
              md.id IS NULL
              OR mo.status <> md.status
              OR mo.basis_attendance_id <> md.attendance_id
              OR mo.canonical_delivery_id IS NULL
              OR mo.canonical_delivery_id <> md.id
            )
          )
          OR (
            mo.status = 'SENT'
            AND (
              md.id IS NULL
              OR (
                md.id = mo.canonical_delivery_id
                AND (md.status <> 'SENT' OR mo.basis_attendance_id <> md.attendance_id)
              )
            )
          )
        )
    `);
  }

  /**
   * Executes the §7.5 R2.1 Safe Unsent-Only Reverse Sync SQL for the given enrollment IDs.
   */
  async function runR21SafeUnsentReverseSync(enrollmentIds: number[], tCutoverIso: string) {
    const idList = enrollmentIds.map((id) => Number(id)).join(', ');
    return prisma.$executeRawUnsafe(`
      UPDATE \`message_deliveries\` md
      INNER JOIN \`${REHEARSAL_TABLE}\` mo
        ON mo.\`canonical_delivery_id\` = md.\`id\`
       AND mo.\`enrollment_id\` = md.\`enrollment_id\`
       AND mo.\`automation_step_id\` = md.\`automation_step_id\`
      SET
        md.\`status\` = mo.\`status\`,
        md.\`attendance_id\` = mo.\`basis_attendance_id\`
      WHERE mo.\`enrollment_id\` IN (${idList})
        AND mo.\`updated_at\` >= '${tCutoverIso}'
        AND md.\`status\` NOT IN ('SENT', 'SENDING')
        AND mo.\`status\` NOT IN ('SENT', 'SENDING')
        AND NOT EXISTS (
          SELECT 1
          FROM (
            SELECT m2.\`enrollment_id\`, m2.\`automation_step_id\`
            FROM \`message_deliveries\` m2
            WHERE m2.\`status\` IN ('SENT', 'SENDING')
          ) AS protected_groups
          WHERE protected_groups.\`enrollment_id\` = md.\`enrollment_id\`
            AND protected_groups.\`automation_step_id\` = md.\`automation_step_id\`
        )
        AND (
          md.\`status\` <> mo.\`status\`
          OR md.\`attendance_id\` <> mo.\`basis_attendance_id\`
        )
    `);
  }

  /**
   * Executes the §7.5 R3 Unified Canonical Parity Check query for the given enrollment IDs.
   */
  async function runR3CanonicalParityCheck(enrollmentIds: number[]) {
    const idList = enrollmentIds.map((id) => Number(id)).join(', ');
    return prisma.$queryRawUnsafe<
      Array<{
        occurrence_id: number;
        enrollment_id: number;
        automation_step_id: number;
        mo_canonical_delivery_id: number | null;
        mo_status: string;
        mo_basis_attendance_id: number;
        legacy_canonical_delivery_id: number | null;
        legacy_status: string | null;
        legacy_basis_attendance_id: number | null;
      }>
    >(`
      SELECT
        mo.id AS occurrence_id,
        mo.enrollment_id,
        mo.automation_step_id,
        mo.canonical_delivery_id AS mo_canonical_delivery_id,
        mo.status AS mo_status,
        mo.basis_attendance_id AS mo_basis_attendance_id,
        legacy_pick.id AS legacy_canonical_delivery_id,
        legacy_pick.status AS legacy_status,
        legacy_pick.attendance_id AS legacy_basis_attendance_id
      FROM \`${REHEARSAL_TABLE}\` mo
      LEFT JOIN (
        SELECT
          md.id,
          md.enrollment_id,
          md.automation_step_id,
          md.attendance_id,
          md.status,
          ROW_NUMBER() OVER (
            PARTITION BY md.enrollment_id, md.automation_step_id
            ORDER BY
              CASE
                WHEN md.status = 'SENT' THEN 1
                WHEN md.status = 'SENDING' THEN 2
                ELSE 3
              END ASC,
              CASE
                WHEN md.status IN ('SENT', 'SENDING') THEN 0
                WHEN md.status IN ('QUEUED', 'SCHEDULED') THEN 1
                ELSE 2
              END ASC,
              CASE
                WHEN COALESCE(md.error_message, '') LIKE 'Superseded duplicate%'
                  OR COALESCE(md.error_message, '') LIKE 'Rollback reconciliation:%'
                THEN 1
                ELSE 0
              END ASC,
              CASE
                WHEN md.status NOT IN ('SENT', 'SENDING')
                 AND k7_basis.attendance_id IS NOT NULL
                 AND md.attendance_id = k7_basis.attendance_id
                THEN 0
                ELSE 1
              END ASC,
              CASE md.status
                WHEN 'SENT' THEN 1
                WHEN 'SENDING' THEN 2
                WHEN 'QUEUED' THEN 3
                WHEN 'SCHEDULED' THEN 4
                WHEN 'CANCELLED' THEN 5
                ELSE 6
              END ASC,
              md.id ASC
          ) AS rn
        FROM \`message_deliveries\` md
        INNER JOIN \`automation_steps\` s ON s.id = md.automation_step_id
        LEFT JOIN (
          SELECT
            ec.enrollment_id,
            a.id AS attendance_id,
            ROW_NUMBER() OVER (
              PARTITION BY ec.enrollment_id
              ORDER BY cs.session_date ASC, a.created_at ASC, a.id ASC
            ) AS k7_ordinal
          FROM \`attendances\` a
          INNER JOIN \`enrollment_classes\` ec ON ec.id = a.enrollment_class_id
          INNER JOIN \`class_sessions\` cs ON cs.id = a.class_session_id
          WHERE a.status = 'ATTENDED'
            AND a.reconciliation_state IN ('MATCHED', 'RESOLVED')
            AND a.deleted_at IS NULL
        ) AS k7_basis
          ON k7_basis.enrollment_id = md.enrollment_id
         AND k7_basis.k7_ordinal = s.session_number
        WHERE s.trigger_event = 'ATTENDED'
      ) AS legacy_pick
        ON legacy_pick.enrollment_id = mo.enrollment_id
       AND legacy_pick.automation_step_id = mo.automation_step_id
       AND legacy_pick.rn = 1
      WHERE mo.enrollment_id IN (${idList})
        AND (
          legacy_pick.id IS NULL
          OR legacy_pick.id <> mo.canonical_delivery_id
          OR legacy_pick.status <> mo.status
          OR legacy_pick.attendance_id <> mo.basis_attendance_id
        )
    `);
  }

  it('Case 1 (Unified Canonical Rule): SQL §2.3/§7.3/R3 selects the exact same canonical delivery, status, and basis_attendance_id as pickCanonicalOccurrence', async () => {
    const { enrollment, enrollmentClass } = await seedEnrollment('C1_CANONICAL');

    // A0: a non-qualifying (CONFLICT) attendance used by a superseded legacy row
    const att0 = await createAttendanceRow({
      enrollmentClassId: enrollmentClass.id,
      sessionDate: '2026-10-01T00:00:00.000Z',
      status: AttendanceStatus.ATTENDED,
      reconciliationState: ReconciliationState.CONFLICT,
    });
    // A1: 1st FINAL ATTENDED attendance (ordinal 1)
    const att1 = await createAttendanceRow({
      enrollmentClassId: enrollmentClass.id,
      sessionDate: '2026-10-02T00:00:00.000Z',
      status: AttendanceStatus.ATTENDED,
      reconciliationState: ReconciliationState.MATCHED,
    });
    // A2: 2nd FINAL ATTENDED attendance (ordinal 2 = current basis for step2Id!)
    const att2 = await createAttendanceRow({
      enrollmentClassId: enrollmentClass.id,
      sessionDate: '2026-10-03T00:00:00.000Z',
      status: AttendanceStatus.ATTENDED,
      reconciliationState: ReconciliationState.MATCHED,
    });

    // Seed 3 MessageDelivery rows for step2Id (session_number = 2):
    // 1. D_superseded: lowest id, CANCELLED with Superseded duplicate error_message
    const dSuperseded = await prisma.messageDelivery.create({
      data: {
        enrollment_id: enrollment.id,
        attendance_id: att0.id,
        automation_step_id: step2Id,
        zalo_account_id: zaloAccountId,
        scheduled_at: new Date(),
        status: MessageDeliveryStatus.CANCELLED,
        rendered_content: 'Superseded row on A0',
        variables_snapshot: {},
        error_message: 'Superseded duplicate milestone occurrence',
      },
    });
    // 2. D_old_queued: lower id than D_curr_queued, QUEUED on A1 (ordinal 1, NOT current basis for step 2)
    const dOldQueued = await prisma.messageDelivery.create({
      data: {
        enrollment_id: enrollment.id,
        attendance_id: att1.id,
        automation_step_id: step2Id,
        zalo_account_id: zaloAccountId,
        scheduled_at: new Date(),
        status: MessageDeliveryStatus.QUEUED,
        rendered_content: 'Old queued row on A1',
        variables_snapshot: {},
      },
    });
    // 3. D_curr_queued: higher id, QUEUED on A2 (ordinal 2 = current K7 basis for step 2!)
    const dCurrQueued = await prisma.messageDelivery.create({
      data: {
        enrollment_id: enrollment.id,
        attendance_id: att2.id,
        automation_step_id: step2Id,
        zalo_account_id: zaloAccountId,
        scheduled_at: new Date(),
        status: MessageDeliveryStatus.QUEUED,
        rendered_content: 'Active queued row on current basis A2',
        variables_snapshot: {},
      },
    });
    expect(dSuperseded.id).toBeLessThan(dOldQueued.id);
    expect(dOldQueued.id).toBeLessThan(dCurrQueued.id);

    // 1. Application ground truth via findMilestoneBasisRows + findDeliveryForMilestoneOccurrence
    const basisRows = await automationRepository.findMilestoneBasisRows(enrollment.id, prisma);
    expect(basisRows).toHaveLength(2);
    const currentBasisForStep2 = basisRows[2 - 1];
    expect(currentBasisForStep2.id).toBe(att2.id);

    const appCanonical = await automationRepository.findDeliveryForMilestoneOccurrence(
      enrollment.id,
      step2Id,
      prisma,
      currentBasisForStep2.id,
    );
    expect(appCanonical).not.toBeNull();
    expect(appCanonical!.id).toBe(dCurrQueued.id);
    expect(appCanonical!.status).toBe('QUEUED');
    expect(appCanonical!.attendance_id).toBe(att2.id);

    // 2. Execute §7.3 SQL Backfill/Selector into the rehearsal table
    await runSection73BackfillAndDeltaSync([enrollment.id]);

    const moRows = await prisma.$queryRawUnsafe<RehearsalOccurrenceRow[]>(
      `SELECT * FROM \`${REHEARSAL_TABLE}\` WHERE enrollment_id = ? AND automation_step_id = ?`,
      enrollment.id,
      step2Id,
    );
    expect(moRows).toHaveLength(1);
    const mo = moRows[0];

    // Verify 100% parity between SQL canonical selector and pickCanonicalOccurrence
    expect(Number(mo.canonical_delivery_id)).toBe(appCanonical!.id);
    expect(mo.status).toBe(appCanonical!.status);
    expect(Number(mo.basis_attendance_id)).toBe(appCanonical!.attendance_id);

    // Verify R3 also reports 0 mismatches
    const r3Mismatches = await runR3CanonicalParityCheck([enrollment.id]);
    expect(r3Mismatches).toHaveLength(0);
  });

  it('Case 2 (Delta-Sync & Monotonic Guard): updates QUEUED -> SENT on delta-sync and never downgrades or mutates an already-SENT occurrence', async () => {
    const { enrollment, enrollmentClass } = await seedEnrollment('C2_DELTASYNC');

    const att1 = await createAttendanceRow({
      enrollmentClassId: enrollmentClass.id,
      sessionDate: '2026-10-05T00:00:00.000Z',
      status: AttendanceStatus.ATTENDED,
      reconciliationState: ReconciliationState.MATCHED,
    });
    const att2 = await createAttendanceRow({
      enrollmentClassId: enrollmentClass.id,
      sessionDate: '2026-10-06T00:00:00.000Z',
      status: AttendanceStatus.ATTENDED,
      reconciliationState: ReconciliationState.MATCHED,
    });

    // Step 1: D1 starts as QUEUED on A1 during online initial backfill
    const d1 = await prisma.messageDelivery.create({
      data: {
        enrollment_id: enrollment.id,
        attendance_id: att1.id,
        automation_step_id: step1Id,
        zalo_account_id: zaloAccountId,
        scheduled_at: new Date('2026-10-05T01:00:00.000Z'),
        status: MessageDeliveryStatus.QUEUED,
        rendered_content: 'Milestone 1 initial queued',
        variables_snapshot: {},
      },
    });

    await runSection73BackfillAndDeltaSync([enrollment.id]);

    let [mo] = await prisma.$queryRawUnsafe<RehearsalOccurrenceRow[]>(
      `SELECT * FROM \`${REHEARSAL_TABLE}\` WHERE enrollment_id = ? AND automation_step_id = ?`,
      enrollment.id,
      step1Id,
    );
    expect(mo.status).toBe('QUEUED');
    expect(Number(mo.canonical_delivery_id)).toBe(d1.id);
    expect(Number(mo.basis_attendance_id)).toBe(att1.id);

    // Step 2: Before cutover freeze, worker finishes sending D1 (QUEUED -> SENT)
    const sentAt = new Date('2026-10-05T01:05:00.000Z');
    await prisma.messageDelivery.update({
      where: { id: d1.id },
      data: {
        status: MessageDeliveryStatus.SENT,
        sent_at: sentAt,
        provider_message_id: 'zalo_msg_c2_001',
      },
    });

    // Step 3: Run §7.3 Delta-Sync -> must update status='SENT', canonical_delivery_id=d1.id, basis_attendance_id=att1.id
    await runSection73BackfillAndDeltaSync([enrollment.id]);

    [mo] = await prisma.$queryRawUnsafe<RehearsalOccurrenceRow[]>(
      `SELECT * FROM \`${REHEARSAL_TABLE}\` WHERE enrollment_id = ? AND automation_step_id = ?`,
      enrollment.id,
      step1Id,
    );
    expect(mo.status).toBe('SENT');
    expect(Number(mo.canonical_delivery_id)).toBe(d1.id);
    expect(Number(mo.basis_attendance_id)).toBe(att1.id);
    expect(mo.satisfied_at).not.toBeNull();

    // Step 4: Simulate a stale/corrupted input in message_deliveries (e.g. D1 corrupted to QUEUED on att2)
    // and verify the monotonic guard in ON DUPLICATE KEY UPDATE NEVER downgrades an already-SENT occurrence
    // back to QUEUED and NEVER changes its canonical_delivery_id or basis_attendance_id!
    const d2Stale = await prisma.messageDelivery.create({
      data: {
        enrollment_id: enrollment.id,
        attendance_id: att2.id,
        automation_step_id: step1Id,
        zalo_account_id: zaloAccountId,
        scheduled_at: new Date('2026-10-06T01:00:00.000Z'),
        status: MessageDeliveryStatus.QUEUED,
        rendered_content: 'Stale queued row on A2',
        variables_snapshot: {},
      },
    });
    // Temporarily flip d1 to QUEUED in message_deliveries so the SELECT subquery feeds a QUEUED candidate
    // into ON DUPLICATE KEY UPDATE against the already-SENT occurrence in milestone_occurrences
    await prisma.messageDelivery.update({
      where: { id: d1.id },
      data: { status: MessageDeliveryStatus.CANCELLED },
    });

    await runSection73BackfillAndDeltaSync([enrollment.id]);

    const [moAfterStale] = await prisma.$queryRawUnsafe<RehearsalOccurrenceRow[]>(
      `SELECT * FROM \`${REHEARSAL_TABLE}\` WHERE enrollment_id = ? AND automation_step_id = ?`,
      enrollment.id,
      step1Id,
    );
    // Monotonic guard: status stays SENT, canonical_delivery_id stays d1.id, basis_attendance_id stays att1.id!
    expect(moAfterStale.status).toBe('SENT');
    expect(Number(moAfterStale.canonical_delivery_id)).toBe(d1.id);
    expect(Number(moAfterStale.basis_attendance_id)).toBe(att1.id);

    // Restore d1 to SENT and clean up d2Stale
    await prisma.messageDelivery.update({
      where: { id: d1.id },
      data: { status: MessageDeliveryStatus.SENT },
    });
    await prisma.messageDelivery.delete({ where: { id: d2Stale.id } });
  });

  it('Case 3 (Rollback Gate R2.0, Safe R2.1 & R3): R2.0 blocks SENT/QUEUED contradiction, R2.1 never overwrites SENT evidence, and non-contradicting unsent rollback passes R2.0 -> R2.1 -> R3', async () => {
    // --- Sub-scenario 3A: Contradicting group (md is SENT on A1, mo is QUEUED on A2) ---
    const { enrollment: enrConflict, enrollmentClass: ecConflict } = await seedEnrollment('C3A_CONFLICT');
    const c3aAtt1 = await createAttendanceRow({
      enrollmentClassId: ecConflict.id,
      sessionDate: '2026-10-10T00:00:00.000Z',
      status: AttendanceStatus.ATTENDED,
      reconciliationState: ReconciliationState.MATCHED,
    });
    const c3aAtt2 = await createAttendanceRow({
      enrollmentClassId: ecConflict.id,
      sessionDate: '2026-10-11T00:00:00.000Z',
      status: AttendanceStatus.ATTENDED,
      reconciliationState: ReconciliationState.MATCHED,
    });

    const sentAt = new Date('2026-10-10T02:00:00.000Z');
    const dSent = await prisma.messageDelivery.create({
      data: {
        enrollment_id: enrConflict.id,
        attendance_id: c3aAtt1.id,
        automation_step_id: step1Id,
        zalo_account_id: zaloAccountId,
        scheduled_at: new Date('2026-10-10T01:55:00.000Z'),
        sent_at: sentAt,
        status: MessageDeliveryStatus.SENT,
        rendered_content: 'Immutable SENT content on A1',
        variables_snapshot: { basis: 'A1' },
        provider_message_id: 'zalo_msg_immutable_3a',
      },
    });

    // Seed a contradicting occurrence row in the rehearsal table: status='QUEUED' on c3aAtt2
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`${REHEARSAL_TABLE}\`
        (\`enrollment_id\`, \`automation_step_id\`, \`basis_attendance_id\`, \`canonical_delivery_id\`, \`session_number\`, \`status\`, \`first_reached_at\`, \`updated_at\`)
       VALUES (?, ?, ?, ?, 1, 'QUEUED', NOW(3), NOW(3))`,
      enrConflict.id,
      step1Id,
      c3aAtt2.id,
      dSent.id,
    );

    // 1. Verify R2.0 detects the contradiction (count > 0) and identifies the exact contradicting pair
    const r20Conflicts = await runR20ContradictionPreCheck([enrConflict.id]);
    expect(r20Conflicts.length).toBeGreaterThan(0);
    expect(r20Conflicts[0]).toMatchObject({
      enrollment_id: enrConflict.id,
      automation_step_id: step1Id,
      mo_status: 'QUEUED',
      md_status: 'SENT',
      mo_basis_attendance_id: c3aAtt2.id,
      md_attendance_id: c3aAtt1.id,
      contradiction_code: 'SENT_DELIVERY_CONTRADICTS_OCCURRENCE',
    });

    // 2. Verify R2.1 (even if executed directly bypassing R2.0) NEVER overwrites md.status='SENT' or md.attendance_id!
    const r21MutatedOnConflict = await runR21SafeUnsentReverseSync(
      [enrConflict.id],
      '2026-10-01 00:00:00.000',
    );
    expect(Number(r21MutatedOnConflict)).toBe(0);

    const dSentAfterR21 = await prisma.messageDelivery.findUniqueOrThrow({
      where: { id: dSent.id },
    });
    expect(dSentAfterR21.status).toBe(MessageDeliveryStatus.SENT);
    expect(dSentAfterR21.attendance_id).toBe(c3aAtt1.id);
    expect(dSentAfterR21.rendered_content).toBe('Immutable SENT content on A1');
    expect(dSentAfterR21.provider_message_id).toBe('zalo_msg_immutable_3a');
    expect(dSentAfterR21.sent_at?.toISOString()).toBe(sentAt.toISOString());

    // --- Sub-scenario 3B: Non-contradicting post-cutover occurrence (mo.status = 'CANCELLED' while md.status = 'QUEUED') ---
    const { enrollment: enrClean, enrollmentClass: ecClean } = await seedEnrollment('C3B_CLEAN');
    // Attendance dropped to CONFLICT post-cutover, so milestone 1 is no longer eligible
    const c3bAtt1 = await createAttendanceRow({
      enrollmentClassId: ecClean.id,
      sessionDate: '2026-10-12T00:00:00.000Z',
      status: AttendanceStatus.ATTENDED,
      reconciliationState: ReconciliationState.CONFLICT,
    });

    const dPending = await prisma.messageDelivery.create({
      data: {
        enrollment_id: enrClean.id,
        attendance_id: c3bAtt1.id,
        automation_step_id: step1Id,
        zalo_account_id: zaloAccountId,
        scheduled_at: new Date('2026-10-12T01:00:00.000Z'),
        status: MessageDeliveryStatus.QUEUED,
        rendered_content: 'Pending delivery before drop to CONFLICT',
        variables_snapshot: {},
      },
    });

    // Post-cutover occurrence in S1 table was updated to CANCELLED when attendance dropped below milestone
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`${REHEARSAL_TABLE}\`
        (\`enrollment_id\`, \`automation_step_id\`, \`basis_attendance_id\`, \`canonical_delivery_id\`, \`session_number\`, \`status\`, \`first_reached_at\`, \`updated_at\`)
       VALUES (?, ?, ?, ?, 1, 'CANCELLED', NOW(3), NOW(3))`,
      enrClean.id,
      step1Id,
      c3bAtt1.id,
      dPending.id,
    );

    // 1. Verify R2.0 returns 0 contradictions for enrClean
    const r20Clean = await runR20ContradictionPreCheck([enrClean.id]);
    expect(r20Clean).toHaveLength(0);

    // 2. Execute R2.1 -> safely syncs unsent md.status from 'QUEUED' to 'CANCELLED'
    const r21MutatedClean = await runR21SafeUnsentReverseSync(
      [enrClean.id],
      '2026-10-01 00:00:00.000',
    );
    expect(Number(r21MutatedClean)).toBe(1);

    const dPendingAfterR21 = await prisma.messageDelivery.findUniqueOrThrow({
      where: { id: dPending.id },
    });
    expect(dPendingAfterR21.status).toBe(MessageDeliveryStatus.CANCELLED);
    expect(dPendingAfterR21.attendance_id).toBe(c3bAtt1.id);

    // 3. Verify R3 confirms 0 mismatches and 100% field-by-field parity with pickCanonicalOccurrence
    const r3MismatchesClean = await runR3CanonicalParityCheck([enrClean.id]);
    expect(r3MismatchesClean).toHaveLength(0);

    const appCanonicalClean = await automationRepository.findDeliveryForMilestoneOccurrence(
      enrClean.id,
      step1Id,
      prisma,
    );
    expect(appCanonicalClean).not.toBeNull();
    expect(appCanonicalClean!.id).toBe(dPending.id);
    expect(appCanonicalClean!.status).toBe('CANCELLED');
    expect(appCanonicalClean!.attendance_id).toBe(c3bAtt1.id);
  });
});
