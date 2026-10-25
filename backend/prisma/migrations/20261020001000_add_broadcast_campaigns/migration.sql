-- Migration: add_broadcast_campaigns
-- Created: 2026-10-20
-- Adds `broadcast_campaigns` and `broadcast_recipients` tables for immediate and scheduled multi-channel broadcasts (Zalo & LINE).

CREATE TABLE `broadcast_campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `message_content` TEXT NOT NULL,
    `channel_mode` VARCHAR(32) NOT NULL DEFAULT 'AUTO',
    `schedule_type` VARCHAR(32) NOT NULL DEFAULT 'IMMEDIATE',
    `scheduled_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `total_recipients` INTEGER NOT NULL DEFAULT 0,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `skipped_count` INTEGER NOT NULL DEFAULT 0,
    `queue_job_id` VARCHAR(191) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `broadcast_campaigns_status_scheduled_at_idx`(`status`, `scheduled_at`),
    INDEX `broadcast_campaigns_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `broadcast_recipients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `target_type` ENUM('STUDENT', 'ZALO_GROUP', 'LINE_GROUP', 'ZALO_USER', 'LINE_USER') NOT NULL,
    `platform` VARCHAR(16) NOT NULL,
    `student_id` INTEGER NULL,
    `zalo_account_id` INTEGER NULL,
    `zalo_group_id` INTEGER NULL,
    `line_account_id` INTEGER NULL,
    `line_group_id` INTEGER NULL,
    `external_target_id` VARCHAR(191) NULL,
    `target_display_name` VARCHAR(191) NULL,
    `rendered_content` TEXT NOT NULL,
    `status` ENUM('SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED_NOT_FRIEND', 'SKIPPED_GROUP_INACTIVE', 'SKIPPED_ACCOUNT_INACTIVE', 'SKIPPED_SESSION_EXPIRED', 'SKIPPED_DISABLED') NOT NULL DEFAULT 'SCHEDULED',
    `sent_at` DATETIME(3) NULL,
    `provider_message_id` VARCHAR(191) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `broadcast_recipients_campaign_id_status_idx`(`campaign_id`, `status`),
    INDEX `broadcast_recipients_student_id_idx`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `broadcast_recipients`
    ADD CONSTRAINT `broadcast_recipients_campaign_id_fkey`
    FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
