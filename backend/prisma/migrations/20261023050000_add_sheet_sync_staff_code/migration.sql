-- DropForeignKey
ALTER TABLE `message_deliveries` DROP FOREIGN KEY `message_deliveries_zalo_account_id_fkey`;

-- AlterTable
ALTER TABLE `broadcast_campaigns` MODIFY `channel_mode` VARCHAR(191) NOT NULL DEFAULT 'AUTO',
    MODIFY `schedule_type` VARCHAR(191) NOT NULL DEFAULT 'IMMEDIATE';

-- AlterTable
ALTER TABLE `broadcast_recipients` MODIFY `platform` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `enrollments` ADD COLUMN `external_sync_key` VARCHAR(191) NULL,
    ADD COLUMN `program_metadata` JSON NULL,
    ADD COLUMN `program_type` VARCHAR(191) NOT NULL DEFAULT 'KAIWA';

-- AlterTable
ALTER TABLE `import_batches` MODIFY `import_type` ENUM('WORKBOOK', 'STUDENT_ENROLLMENT', 'ATTENDANCE', 'TEACHER_ATTENDANCE', 'GOOGLE_SHEET_SYNC', 'GOOGLE_SHEET_BACKUP') NOT NULL;

-- AlterTable
ALTER TABLE `line_contact_relations` MODIFY `target_type` VARCHAR(191) NOT NULL DEFAULT 'USER',
    MODIFY `matched_by` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `staff_code` VARCHAR(191) NULL,
    MODIFY `code` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `zalo_contact_relations` MODIFY `target_type` VARCHAR(191) NOT NULL DEFAULT 'USER',
    MODIFY `matched_by` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `cs_sheet_backup_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cs_user_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `target_spreadsheet_url` TEXT NULL,
    `target_spreadsheet_id` VARCHAR(191) NULL,
    `local_backup_path` VARCHAR(191) NULL,
    `sheet1_name` VARCHAR(191) NOT NULL DEFAULT '1.Chăm sóc',
    `sheet3_name` VARCHAR(191) NOT NULL DEFAULT '3.Chấm buổi',
    `schedule_times` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `require_private_sheet` BOOLEAN NOT NULL DEFAULT true,
    `mask_sensitive_data` BOOLEAN NOT NULL DEFAULT false,
    `last_backup_at` DATETIME(3) NULL,
    `last_status` VARCHAR(191) NULL,
    `last_summary` JSON NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cs_sheet_backup_configs_cs_user_id_key`(`cs_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `google_sheet_sync_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `program_type` VARCHAR(191) NOT NULL DEFAULT 'KAIWA',
    `spreadsheet_url` TEXT NULL,
    `spreadsheet_id` VARCHAR(191) NULL,
    `local_file_path` VARCHAR(191) NULL,
    `sheet_name` VARCHAR(191) NOT NULL,
    `setting_sheet_name` VARCHAR(191) NULL,
    `header_row` INTEGER NOT NULL DEFAULT 2,
    `cvht_mapping` JSON NULL,
    `default_cs_id` INTEGER NULL,
    `sync_interval_minutes` INTEGER NOT NULL DEFAULT 10,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `last_file_hash` VARCHAR(191) NULL,
    `last_synced_at` DATETIME(3) NULL,
    `last_status` VARCHAR(191) NULL,
    `last_summary` JSON NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `google_sheet_sync_configs_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `google_sheet_row_states` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `config_id` INTEGER NOT NULL,
    `sync_key` VARCHAR(191) NOT NULL,
    `row_number` INTEGER NOT NULL,
    `row_hash` VARCHAR(191) NOT NULL,
    `student_id` INTEGER NULL,
    `enrollment_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `google_sheet_row_states_config_id_idx`(`config_id`),
    UNIQUE INDEX `google_sheet_row_states_config_id_sync_key_key`(`config_id`, `sync_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `enrollments_external_sync_key_key` ON `enrollments`(`external_sync_key`);

-- CreateIndex
CREATE INDEX `enrollments_program_type_cs_id_idx` ON `enrollments`(`program_type`, `cs_id`);

-- CreateIndex
CREATE UNIQUE INDEX `users_staff_code_key` ON `users`(`staff_code`);

-- AddForeignKey
ALTER TABLE `message_deliveries` ADD CONSTRAINT `message_deliveries_zalo_account_id_fkey` FOREIGN KEY (`zalo_account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cs_sheet_backup_configs` ADD CONSTRAINT `cs_sheet_backup_configs_cs_user_id_fkey` FOREIGN KEY (`cs_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `google_sheet_row_states` ADD CONSTRAINT `google_sheet_row_states_config_id_fkey` FOREIGN KEY (`config_id`) REFERENCES `google_sheet_sync_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

