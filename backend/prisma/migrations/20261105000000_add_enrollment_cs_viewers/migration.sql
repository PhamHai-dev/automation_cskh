-- CreateTable
CREATE TABLE `enrollment_cs_viewers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enrollment_id` INTEGER NOT NULL,
    `cs_id` INTEGER NOT NULL,
    `transferred_to_id` INTEGER NULL,
    `transferred_by_id` INTEGER NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `enrollment_cs_viewers_cs_id_idx`(`cs_id`),
    UNIQUE INDEX `enrollment_cs_viewers_enrollment_id_cs_id_key`(`enrollment_id`, `cs_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `enrollment_cs_viewers` ADD CONSTRAINT `enrollment_cs_viewers_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_cs_viewers` ADD CONSTRAINT `enrollment_cs_viewers_cs_id_fkey` FOREIGN KEY (`cs_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_cs_viewers` ADD CONSTRAINT `enrollment_cs_viewers_transferred_to_id_fkey` FOREIGN KEY (`transferred_to_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_cs_viewers` ADD CONSTRAINT `enrollment_cs_viewers_transferred_by_id_fkey` FOREIGN KEY (`transferred_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
