-- JLPT learning-log foundation.
-- IMPORTANT: this migration is intentionally NOT applied by the implementation task.
-- Run the read-only jlpt-classification-audit.ts first and resolve mixed/unknown classes
-- before enabling the JLPT feature. Existing classes start as KAIWA for schema compatibility;
-- a reviewed deployment backfill must explicitly set eligible classes to JLPT and bind templates.

-- Extend import history with the dedicated NKHT flow.
ALTER TABLE `import_batches`
  MODIFY `import_type` ENUM(
    'WORKBOOK',
    'STUDENT_ENROLLMENT',
    'ATTENDANCE',
    'TEACHER_ATTENDANCE',
    'JLPT_LEARNING_LOG',
    'GOOGLE_SHEET_SYNC',
    'GOOGLE_SHEET_BACKUP'
  ) NOT NULL;

-- All JLPT classes share one global session template. Dates and times remain on ClassSession.
CREATE TABLE `jlpt_session_templates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `singleton_key` VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
  `name` VARCHAR(150) NOT NULL,
  `total_sessions` INTEGER NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_by_id` INTEGER NOT NULL,
  `updated_by_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `jlpt_session_templates_singleton_key_key`(`singleton_key`),
  INDEX `jlpt_session_templates_active_idx`(`active`),
  INDEX `jlpt_session_templates_created_by_id_idx`(`created_by_id`),
  INDEX `jlpt_session_templates_updated_by_id_idx`(`updated_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `jlpt_session_template_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `template_id` INTEGER NOT NULL,
  `session_number` INTEGER NOT NULL,
  `session_type` ENUM('LESSON', 'TEST') NOT NULL DEFAULT 'LESSON',
  `session_title` VARCHAR(120) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `jlpt_session_template_items_template_id_session_number_key`(`template_id`, `session_number`),
  INDEX `jlpt_session_template_items_template_id_session_type_idx`(`template_id`, `session_type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Program is explicit at Class level. JLPT classes use the global template implicitly.
ALTER TABLE `classes`
  ADD COLUMN `program_type` ENUM('KAIWA', 'JLPT') NOT NULL DEFAULT 'KAIWA' AFTER `level`;

CREATE INDEX `classes_program_type_level_active_idx`
  ON `classes`(`program_type`, `level`, `active`);

-- Session metadata never duplicates or changes the actual schedule.
ALTER TABLE `class_sessions`
  ADD COLUMN `session_type` ENUM('LESSON', 'TEST') NOT NULL DEFAULT 'LESSON' AFTER `teacher_id`,
  ADD COLUMN `session_title` VARCHAR(120) NULL AFTER `session_type`;

CREATE INDEX `class_sessions_class_id_session_type_idx`
  ON `class_sessions`(`class_id`, `session_type`);

-- Teacher-proposed changes retain before/after snapshots for review and audit.
CREATE TABLE `jlpt_template_change_requests` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `template_id` INTEGER NOT NULL,
  `class_id` INTEGER NOT NULL,
  `requested_by_id` INTEGER NOT NULL,
  `before_snapshot` JSON NOT NULL,
  `proposed_snapshot` JSON NOT NULL,
  `request_note` TEXT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by_id` INTEGER NULL,
  `review_reason` TEXT NULL,
  `reviewed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `jlpt_template_change_requests_template_status_created_idx`(`template_id`, `status`, `created_at`),
  INDEX `jlpt_template_change_requests_class_id_status_idx`(`class_id`, `status`),
  INDEX `jlpt_template_change_requests_requested_by_status_idx`(`requested_by_id`, `status`),
  INDEX `jlpt_template_change_requests_reviewed_by_id_idx`(`reviewed_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Attendance status/note stay in Attendance; only four JLPT criteria are stored here.
CREATE TABLE `jlpt_learning_records` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `enrollment_class_id` INTEGER NOT NULL,
  `class_session_id` INTEGER NOT NULL,
  `preparation_rating` ENUM('A', 'B', 'C') NULL,
  `attitude_rating` ENUM('A', 'B', 'C') NULL,
  `homework_completed` BOOLEAN NULL,
  `test_correct_answers` INTEGER NULL,
  `created_by_id` INTEGER NOT NULL,
  `updated_by_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `jlpt_learning_records_enrollment_class_session_key`(`enrollment_class_id`, `class_session_id`),
  INDEX `jlpt_learning_records_class_session_id_idx`(`class_session_id`),
  INDEX `jlpt_learning_records_created_by_id_idx`(`created_by_id`),
  INDEX `jlpt_learning_records_updated_by_id_idx`(`updated_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ambiguous legacy absences and header mismatches are never silently normalized.
CREATE TABLE `jlpt_normalization_tasks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `source_type` ENUM('MANUAL_IMPORT', 'GOOGLE_SHEET_SYNC') NOT NULL,
  `issue_type` ENUM('AMBIGUOUS_ABSENCE', 'SESSION_HEADER_MISMATCH') NOT NULL,
  `status` ENUM('PENDING', 'RESOLVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `pending_key` VARCHAR(191) NULL,
  `import_batch_id` INTEGER NULL,
  `sync_run_item_id` INTEGER NULL,
  `class_id` INTEGER NULL,
  `enrollment_class_id` INTEGER NULL,
  `class_session_id` INTEGER NULL,
  `raw_payload` JSON NOT NULL,
  `source_note` TEXT NULL,
  `proposed_metadata` JSON NULL,
  `resolution` JSON NULL,
  `resolved_by_id` INTEGER NULL,
  `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `jlpt_normalization_tasks_pending_key_key`(`pending_key`),
  INDEX `jlpt_normalization_tasks_status_issue_created_idx`(`status`, `issue_type`, `created_at`),
  INDEX `jlpt_normalization_tasks_import_batch_id_idx`(`import_batch_id`),
  INDEX `jlpt_normalization_tasks_sync_run_item_id_idx`(`sync_run_item_id`),
  INDEX `jlpt_normalization_tasks_class_id_status_idx`(`class_id`, `status`),
  INDEX `jlpt_normalization_tasks_enrollment_class_id_idx`(`enrollment_class_id`),
  INDEX `jlpt_normalization_tasks_class_session_id_idx`(`class_session_id`),
  INDEX `jlpt_normalization_tasks_resolved_by_id_idx`(`resolved_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys are declared after all referenced tables/columns exist.
ALTER TABLE `jlpt_session_templates`
  ADD CONSTRAINT `jlpt_session_templates_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_session_templates_updated_by_id_fkey`
    FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `jlpt_session_template_items`
  ADD CONSTRAINT `jlpt_session_template_items_template_id_fkey`
    FOREIGN KEY (`template_id`) REFERENCES `jlpt_session_templates`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `jlpt_template_change_requests`
  ADD CONSTRAINT `jlpt_template_change_requests_template_id_fkey`
    FOREIGN KEY (`template_id`) REFERENCES `jlpt_session_templates`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_template_change_requests_class_id_fkey`
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_template_change_requests_requested_by_id_fkey`
    FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_template_change_requests_reviewed_by_id_fkey`
    FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `jlpt_learning_records`
  ADD CONSTRAINT `jlpt_learning_records_enrollment_class_id_fkey`
    FOREIGN KEY (`enrollment_class_id`) REFERENCES `enrollment_classes`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_learning_records_class_session_id_fkey`
    FOREIGN KEY (`class_session_id`) REFERENCES `class_sessions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_learning_records_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_learning_records_updated_by_id_fkey`
    FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `jlpt_normalization_tasks`
  ADD CONSTRAINT `jlpt_normalization_tasks_import_batch_id_fkey`
    FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_normalization_tasks_sync_run_item_id_fkey`
    FOREIGN KEY (`sync_run_item_id`) REFERENCES `google_sheet_sync_run_items`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_normalization_tasks_class_id_fkey`
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_normalization_tasks_enrollment_class_id_fkey`
    FOREIGN KEY (`enrollment_class_id`) REFERENCES `enrollment_classes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_normalization_tasks_class_session_id_fkey`
    FOREIGN KEY (`class_session_id`) REFERENCES `class_sessions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `jlpt_normalization_tasks_resolved_by_id_fkey`
    FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
