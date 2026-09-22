-- AlterEnum
ALTER TABLE `import_batches`
  MODIFY `import_type` ENUM('WORKBOOK', 'STUDENT_ENROLLMENT', 'ATTENDANCE', 'TEACHER_ATTENDANCE') NOT NULL;

-- AlterTable
ALTER TABLE `attendances`
  ADD COLUMN `deleted_at` DATETIME(3) NULL,
  ADD COLUMN `deleted_by_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `import_create_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `import_batch_id` INTEGER NOT NULL,
    `requested_by_id` INTEGER NOT NULL,
    `reviewed_by_id` INTEGER NULL,
    `assigned_cs_id` INTEGER NULL,
    `external_id` VARCHAR(191) NOT NULL,
    `package_code` VARCHAR(191) NOT NULL,
    `snapshot` JSON NOT NULL,
    `baseline` JSON NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CONFLICT') NOT NULL DEFAULT 'PENDING',
    `review_reason` TEXT NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `import_create_requests_external_id_package_code_idx`(`external_id`, `package_code`),
    INDEX `import_create_requests_status_created_at_idx`(`status`, `created_at`),
    INDEX `import_create_requests_requested_by_id_status_idx`(`requested_by_id`, `status`),
    INDEX `import_create_requests_assigned_cs_id_status_idx`(`assigned_cs_id`, `status`),
    UNIQUE INDEX `import_create_requests_import_batch_id_external_id_package_code_key`(`import_batch_id`, `external_id`, `package_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_deleted_by_id_fkey` FOREIGN KEY (`deleted_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `import_create_requests` ADD CONSTRAINT `import_create_requests_import_batch_id_fkey` FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `import_create_requests` ADD CONSTRAINT `import_create_requests_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `import_create_requests` ADD CONSTRAINT `import_create_requests_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `import_create_requests` ADD CONSTRAINT `import_create_requests_assigned_cs_id_fkey` FOREIGN KEY (`assigned_cs_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

