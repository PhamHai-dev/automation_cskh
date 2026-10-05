-- Migration: add_auto_attendance
-- Adds configurable delayed automatic attendance with idempotent executions.

ALTER TABLE `attendances`
  MODIFY `source` ENUM('MANUAL', 'EXCEL_IMPORT', 'TEACHER_UPLOAD', 'AUTO_SCHEDULE') NOT NULL;

ALTER TABLE `care_tasks`
  MODIFY `type` ENUM('CALLBACK', 'HOT_ISSUE', 'FOLLOW_UP', 'AUTO_ATTENDANCE', 'SCHEDULE_DATA_ISSUE') NOT NULL;

CREATE TABLE `app_settings` (
  `key` VARCHAR(191) NOT NULL,
  `value` JSON NOT NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `app_settings`
  ADD CONSTRAINT `app_settings_updated_by_id_fkey`
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `class_sessions` ADD COLUMN `class_schedule_id` INTEGER NULL;
CREATE UNIQUE INDEX `class_sessions_class_schedule_id_session_date_key`
  ON `class_sessions`(`class_schedule_id`, `session_date`);
CREATE INDEX `class_sessions_session_date_status_idx`
  ON `class_sessions`(`session_date`, `status`);
ALTER TABLE `class_sessions`
  ADD CONSTRAINT `class_sessions_class_schedule_id_fkey`
  FOREIGN KEY (`class_schedule_id`) REFERENCES `class_schedules`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `class_schedules_active_valid_from_valid_to_idx`
  ON `class_schedules`(`active`, `valid_from`, `valid_to`);

CREATE TABLE `auto_attendance_executions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `class_schedule_id` INTEGER NOT NULL,
  `session_date` DATE NOT NULL,
  `scheduled_run_at` DATETIME(3) NOT NULL,
  `status` ENUM('PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PROCESSING',
  `attendance_count` INTEGER NOT NULL DEFAULT 0,
  `error_message` TEXT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `auto_attendance_executions_class_schedule_id_session_date_key` (`class_schedule_id`, `session_date`),
  INDEX `auto_attendance_executions_status_scheduled_run_at_idx` (`status`, `scheduled_run_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `auto_attendance_executions`
  ADD CONSTRAINT `auto_attendance_executions_class_schedule_id_fkey`
  FOREIGN KEY (`class_schedule_id`) REFERENCES `class_schedules`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `care_tasks` ADD COLUMN `idempotency_key` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `care_tasks_idempotency_key_key` ON `care_tasks`(`idempotency_key`);
CREATE INDEX `care_tasks_status_assigned_to_id_idx` ON `care_tasks`(`status`, `assigned_to_id`);

INSERT INTO `app_settings` (`key`, `value`, `updated_by_id`, `created_at`, `updated_at`)
VALUES ('AUTO_ATTENDANCE_DELAY_MINUTES', CAST('15' AS JSON), NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
