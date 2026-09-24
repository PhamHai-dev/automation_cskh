-- Migration: add_automation_workflow
-- Replaces MessageRule with AutomationWorkflow engine
-- Created: 2026-09-22 (manual, DB offline)

-- 1. Create new tables
CREATE TABLE `automation_workflows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `owner_cs_id` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `automation_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workflow_id` INTEGER NOT NULL,
    `session_number` INTEGER NOT NULL,
    `trigger_event` ENUM('ATTENDED','ABSENT_APPROVED_A','LEAVE_B','ABSENT_UNAPPROVED_C','TEACHER_ABSENT_D','TECH_ERROR_E') NOT NULL,
    `delay_minutes` INTEGER NOT NULL,
    `channel` ENUM('ZALO_PERSONAL','ZALO_GROUP') NOT NULL DEFAULT 'ZALO_PERSONAL',
    `target_group_id` INTEGER NULL,
    `message_content` TEXT NOT NULL,
    `message_variables` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `automation_steps_workflow_id_session_number_trigger_event_key`(`workflow_id`, `session_number`, `trigger_event`),
    INDEX `automation_steps_workflow_id_idx`(`workflow_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `automation_enrollments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workflow_id` INTEGER NOT NULL,
    `enrollment_id` INTEGER NOT NULL,
    `added_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `automation_enrollments_workflow_id_enrollment_id_key`(`workflow_id`, `enrollment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Add new columns to message_deliveries
ALTER TABLE `message_deliveries` ADD COLUMN `automation_step_id` INTEGER NULL;
ALTER TABLE `message_deliveries` ADD COLUMN `zalo_group_id` INTEGER NULL;

-- 3. Drop old FK and columns
ALTER TABLE `message_deliveries` DROP FOREIGN KEY `message_deliveries_message_rule_id_fkey`;
-- attendance_id FK currently relies on the composite unique index; give it its own index first
CREATE INDEX `message_deliveries_attendance_id_idx` ON `message_deliveries`(`attendance_id`);
ALTER TABLE `message_deliveries` DROP INDEX `message_deliveries_attendance_id_message_rule_id_key`;
ALTER TABLE `message_deliveries` DROP COLUMN `message_rule_id`;
ALTER TABLE `message_deliveries` DROP COLUMN `template_version`;

-- 4. Make automation_step_id NOT NULL
ALTER TABLE `message_deliveries` MODIFY `automation_step_id` INTEGER NOT NULL;

-- 5. Update status enum
ALTER TABLE `message_deliveries` MODIFY `status` ENUM('SCHEDULED','QUEUED','SENDING','SENT','FAILED','CANCELLED','SKIPPED_NOT_FRIEND','SKIPPED_GROUP_INACTIVE','SKIPPED_ACCOUNT_INACTIVE','SKIPPED_SESSION_EXPIRED','SKIPPED_DISABLED') NOT NULL DEFAULT 'SCHEDULED';

-- 6. Add new unique index
ALTER TABLE `message_deliveries` ADD UNIQUE INDEX `message_deliveries_attendance_id_automation_step_id_key`(`attendance_id`, `automation_step_id`);

-- 7. Drop message_rules table
DROP TABLE `message_rules`;

-- 8. Create indexes
CREATE INDEX `friends_phone_from_sdk_idx` ON `friends`(`phone_from_sdk`);
CREATE INDEX `zalo_contact_relations_student_id_idx` ON `zalo_contact_relations`(`student_id`);
CREATE INDEX `automation_workflows_owner_cs_id_idx` ON `automation_workflows`(`owner_cs_id`);

-- 9. Add foreign keys
ALTER TABLE `automation_workflows` ADD CONSTRAINT `automation_workflows_owner_cs_id_fkey` FOREIGN KEY (`owner_cs_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `automation_steps` ADD CONSTRAINT `automation_steps_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `automation_workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `automation_enrollments` ADD CONSTRAINT `automation_enrollments_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `automation_workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `automation_enrollments` ADD CONSTRAINT `automation_enrollments_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `message_deliveries` ADD CONSTRAINT `message_deliveries_automation_step_id_fkey` FOREIGN KEY (`automation_step_id`) REFERENCES `automation_steps`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `message_deliveries` ADD CONSTRAINT `message_deliveries_zalo_group_id_fkey` FOREIGN KEY (`zalo_group_id`) REFERENCES `zalo_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;