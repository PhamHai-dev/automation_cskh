-- Preserve the legacy cs_sheet_backup_configs table for recovery and comparison.
-- Its sheet1/sheet3 layout is the KAIWA workbook; copy its settings into the
-- current per-program model without overwriting any existing configuration.
CREATE TABLE IF NOT EXISTS `program_sheet_backup_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cs_user_id` INTEGER NOT NULL,
    `program_type` VARCHAR(20) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `target_spreadsheet_url` TEXT NULL,
    `target_spreadsheet_id` VARCHAR(191) NULL,
    `local_backup_path` VARCHAR(191) NULL,
    `sheet_name` VARCHAR(191) NOT NULL DEFAULT 'Chấm buổi',
    `header_row` INTEGER NOT NULL DEFAULT 2,
    `profile_sheet_name` VARCHAR(191) NULL,
    `profile_header_row` INTEGER NOT NULL DEFAULT 3,
    `profile_enabled` BOOLEAN NOT NULL DEFAULT true,
    `schedule_times` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `require_private_sheet` BOOLEAN NOT NULL DEFAULT true,
    `mask_sensitive_data` BOOLEAN NOT NULL DEFAULT false,
    `backup_year` INTEGER NULL,
    `last_backup_at` DATETIME(3) NULL,
    `last_status` VARCHAR(191) NULL,
    `last_summary` JSON NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `program_sheet_backup_configs_enabled_program_type_idx`(`enabled`, `program_type`),
    UNIQUE INDEX `program_sheet_backup_configs_cs_user_id_program_type_key`(`cs_user_id`, `program_type`),
    PRIMARY KEY (`id`),
    CONSTRAINT `program_sheet_backup_configs_cs_user_id_fkey` FOREIGN KEY (`cs_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `program_sheet_backup_configs` (
  `cs_user_id`, `program_type`, `name`, `target_spreadsheet_url`, `target_spreadsheet_id`,
  `local_backup_path`, `sheet_name`, `header_row`, `profile_sheet_name`, `profile_header_row`,
  `profile_enabled`, `schedule_times`, `enabled`, `require_private_sheet`, `mask_sensitive_data`,
  `last_backup_at`, `last_status`, `last_summary`, `last_error`, `created_at`, `updated_at`
)
SELECT legacy.cs_user_id, 'KAIWA', legacy.name, legacy.target_spreadsheet_url, legacy.target_spreadsheet_id,
  legacy.local_backup_path, legacy.sheet3_name, 2, legacy.sheet1_name, 3,
  TRUE, legacy.schedule_times, legacy.enabled, legacy.require_private_sheet, legacy.mask_sensitive_data,
  legacy.last_backup_at, legacy.last_status, legacy.last_summary, legacy.last_error, legacy.created_at, legacy.updated_at
FROM `cs_sheet_backup_configs` legacy
LEFT JOIN `program_sheet_backup_configs` current_config
  ON current_config.cs_user_id = legacy.cs_user_id AND current_config.program_type = 'KAIWA'
WHERE current_config.id IS NULL;

-- Defaults affect future rows only. Existing configured intervals are preserved.
ALTER TABLE `google_sheet_sync_configs` MODIFY `sync_interval_minutes` INTEGER NOT NULL DEFAULT 30;
CREATE INDEX `google_sheet_sync_configs_flow_type_program_type_idx` ON `google_sheet_sync_configs`(`flow_type`, `program_type`);
CREATE INDEX `google_sheet_sync_configs_enabled_source_type_idx` ON `google_sheet_sync_configs`(`enabled`, `source_type`);
CREATE INDEX `google_sheet_sync_configs_target_student_external_id_idx` ON `google_sheet_sync_configs`(`target_student_external_id`);
ALTER TABLE `google_sheet_sync_runs` ADD CONSTRAINT `google_sheet_sync_runs_config_id_fkey` FOREIGN KEY (`config_id`) REFERENCES `google_sheet_sync_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `google_sheet_sync_run_items` ADD CONSTRAINT `google_sheet_sync_run_items_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `google_sheet_sync_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
