-- AlterTable
ALTER TABLE `attendances` 
    ADD COLUMN `teacher_status` ENUM('ATTENDED', 'ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E') NULL,
    ADD COLUMN `teacher_raw_value` VARCHAR(191) NULL,
    ADD COLUMN `lesson_topic` VARCHAR(191) NULL,
    ADD COLUMN `teacher_note` TEXT NULL,
    ADD COLUMN `teacher_submitted_at` DATETIME(3) NULL,
    ADD COLUMN `teacher_user_id` INTEGER NULL,
    ADD COLUMN `cs_status` ENUM('ATTENDED', 'ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E') NULL,
    ADD COLUMN `cs_raw_value` VARCHAR(191) NULL,
    ADD COLUMN `cs_note` TEXT NULL,
    ADD COLUMN `cs_submitted_at` DATETIME(3) NULL,
    ADD COLUMN `cs_user_id` INTEGER NULL,
    ADD COLUMN `reconciliation_state` ENUM('PENDING_CS', 'PENDING_TEACHER', 'MATCHED', 'CONFLICT', 'RESOLVED') NOT NULL DEFAULT 'PENDING_CS',
    ADD COLUMN `resolved_by_id` INTEGER NULL,
    ADD COLUMN `resolved_at` DATETIME(3) NULL,
    ADD COLUMN `resolution_note` TEXT NULL;

-- CreateIndex
CREATE INDEX `attendances_reconciliation_state_idx` ON `attendances`(`reconciliation_state`);

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_teacher_user_id_fkey` FOREIGN KEY (`teacher_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_cs_user_id_fkey` FOREIGN KEY (`cs_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_resolved_by_id_fkey` FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
