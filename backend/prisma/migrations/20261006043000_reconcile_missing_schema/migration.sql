-- DropForeignKey
ALTER TABLE `class_teachers` DROP FOREIGN KEY `class_teachers_teacher_id_fkey`;

-- DropForeignKey
ALTER TABLE `teacher_profiles` DROP FOREIGN KEY `teacher_profiles_user_id_fkey`;

-- DropIndex
CREATE INDEX `zalo_accounts_cs_id_idx` ON `zalo_accounts`(`cs_id`);
DROP INDEX `zalo_accounts_cs_id_key` ON `zalo_accounts`;

-- AlterTable
ALTER TABLE `attendances` ADD COLUMN `session_count` DOUBLE NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `automation_steps` ALTER COLUMN `channel` DROP DEFAULT;

-- AlterTable
ALTER TABLE `classes` MODIFY `model_type` ENUM('ONE_TO_ONE', 'GROUP', '1:1', '1:2', '1:n') NOT NULL;
UPDATE `classes` SET `model_type` = CASE `model_type` WHEN 'ONE_TO_ONE' THEN '1:1' WHEN 'GROUP' THEN '1:n' ELSE `model_type` END;
ALTER TABLE `classes` MODIFY `model_type` ENUM('1:1', '1:2', '1:n') NOT NULL;

-- AlterTable
ALTER TABLE `enrollments` ADD COLUMN `attended_previous_years` INTEGER NULL DEFAULT 0,
    ADD COLUMN `callback_note` TEXT NULL,
    ADD COLUMN `exchange_info` TEXT NULL,
    ADD COLUMN `hot_issue_note` TEXT NULL,
    ADD COLUMN `post_course_care` TEXT NULL,
    ADD COLUMN `sale_id` INTEGER NULL,
    ADD COLUMN `study_report_url` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `students` ADD COLUMN `external_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `zalo_accounts` ADD COLUMN `archived_at` DATETIME(3) NULL,
    ADD COLUMN `archived_by_id` INTEGER NULL,
    ADD COLUMN `disconnect_reason` VARCHAR(50) NULL,
    ADD COLUMN `disconnected_at` DATETIME(3) NULL,
    ADD COLUMN `display_name` VARCHAR(191) NULL,
    ADD COLUMN `last_connected_at` DATETIME(3) NULL,
    ADD COLUMN `last_sync_at` DATETIME(3) NULL,
    ADD COLUMN `last_sync_error` TEXT NULL,
    ADD COLUMN `proxy_url` VARCHAR(191) NULL,
    ADD COLUMN `qr_code` TEXT NULL,
    ADD COLUMN `qr_pending_at` DATETIME(3) NULL,
    ADD COLUMN `session_epoch` INTEGER NULL,
    ADD COLUMN `zalo_uid` VARCHAR(191) NULL,
    MODIFY `status` ENUM('QR_PENDING', 'CONNECTING', 'ACTIVE', 'NOT_LOGGED_IN', 'EXPIRED', 'BANNED', 'DISABLED') NOT NULL DEFAULT 'QR_PENDING';

-- AlterTable
ALTER TABLE `zalo_contact_relations` ADD COLUMN `display_name` VARCHAR(191) NULL,
    MODIFY `avatar_url` VARCHAR(191) NULL;

-- Preserve legacy profile data until migration verification is complete.
RENAME TABLE `teacher_profiles` TO `teacher_profiles_legacy_backup`;

-- CreateTable
CREATE TABLE `teachers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `teacher_type` ENUM('VIETNAMESE', 'JAPANESE', 'OTHER') NULL DEFAULT 'OTHER',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teachers_code_key`(`code`),
    UNIQUE INDEX `teachers_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve user IDs so existing class_teachers references retain their meaning.
INSERT INTO teachers (id, code, name, phone, email, teacher_type, active, user_id, created_at, updated_at)
SELECT u.id, COALESCE(NULLIF(tp.teacher_code, ''), CONCAT('LEGACY-USER-', u.id)),
COALESCE(NULLIF(u.name, ''), u.email), u.phone, u.email, COALESCE(tp.teacher_type, 'OTHER'),
COALESCE(tp.active, u.active), u.id, COALESCE(tp.created_at, u.created_at), COALESCE(tp.updated_at, u.updated_at)
FROM users u LEFT JOIN teacher_profiles_legacy_backup tp ON tp.user_id = u.id
WHERE tp.id IS NOT NULL OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.teacher_id=u.id)
OR JSON_CONTAINS(u.roles, JSON_QUOTE('TEACHER'));

-- CreateTable
CREATE TABLE `sdk_limits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zalo_account_id` INTEGER NULL,
    `category` VARCHAR(191) NOT NULL,
    `daily_limit` INTEGER NOT NULL DEFAULT 200,
    `burst_limit` INTEGER NOT NULL DEFAULT 20,
    `burst_window_ms` INTEGER NOT NULL DEFAULT 30000,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sdk_limits_zalo_account_id_idx`(`zalo_account_id`),
    UNIQUE INDEX `sdk_limits_zalo_account_id_category_key`(`zalo_account_id`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_milestone_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_number` INTEGER NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `care_milestone_configs_session_number_key`(`session_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `friends` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zalo_account_id` INTEGER NOT NULL,
    `zalo_uid_in_nick` VARCHAR(191) NOT NULL,
    `contact_id` INTEGER NULL,
    `friendship_status` VARCHAR(191) NOT NULL DEFAULT 'none',
    `relationship_kind` VARCHAR(191) NOT NULL DEFAULT 'none',
    `alias_in_nick` VARCHAR(191) NULL,
    `has_conversation` BOOLEAN NOT NULL DEFAULT false,
    `phone_from_sdk` VARCHAR(191) NULL,
    `zalo_display_name` VARCHAR(191) NULL,
    `zalo_avatar_url` VARCHAR(191) NULL,
    `zalo_global_id` VARCHAR(191) NULL,
    `zalo_username` VARCHAR(191) NULL,
    `first_message_at` DATETIME(3) NULL,
    `last_inbound_at` DATETIME(3) NULL,
    `last_outbound_at` DATETIME(3) NULL,
    `total_inbound` INTEGER NOT NULL DEFAULT 0,
    `total_outbound` INTEGER NOT NULL DEFAULT 0,
    `became_friend_at` DATETIME(3) NULL,
    `removed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `friends_zalo_account_id_idx`(`zalo_account_id`),
    INDEX `friends_friendship_status_idx`(`friendship_status`),
    INDEX `friends_relationship_kind_idx`(`relationship_kind`),
    INDEX `friends_phone_from_sdk_idx`(`phone_from_sdk`),
    INDEX `friends_zalo_global_id_idx`(`zalo_global_id`),
    INDEX `friends_contact_id_idx`(`contact_id`),
    UNIQUE INDEX `friends_zalo_account_id_zalo_uid_in_nick_key`(`zalo_account_id`, `zalo_uid_in_nick`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zalo_uid` VARCHAR(191) NOT NULL,
    `student_id` INTEGER NULL,
    `display_name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `last_verified` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contacts_zalo_uid_key`(`zalo_uid`),
    INDEX `contacts_student_id_idx`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_accesses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zalo_uid` VARCHAR(191) NOT NULL,
    `zalo_account_id` INTEGER NOT NULL,
    `is_friend` BOOLEAN NOT NULL DEFAULT false,
    `friendship_status` VARCHAR(191) NOT NULL DEFAULT 'none',
    `alias_in_nick` VARCHAR(191) NULL,
    `has_conversation` BOOLEAN NOT NULL DEFAULT false,
    `last_seen_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `contact_accesses_zalo_uid_idx`(`zalo_uid`),
    INDEX `contact_accesses_zalo_account_id_idx`(`zalo_account_id`),
    UNIQUE INDEX `contact_accesses_zalo_uid_zalo_account_id_key`(`zalo_uid`, `zalo_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zalo_account_status_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `started_at` DATETIME(3) NOT NULL,
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `zalo_account_status_logs_account_id_idx`(`account_id`),
    INDEX `zalo_account_status_logs_account_id_ended_at_idx`(`account_id`, `ended_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zalo_account_id` INTEGER NOT NULL,
    `external_thread_id` VARCHAR(191) NOT NULL,
    `thread_type` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `group_name` VARCHAR(191) NULL,
    `group_avatar_url` VARCHAR(191) NULL,
    `group_members_count` INTEGER NULL,
    `last_message_at` DATETIME(3) NULL,
    `unread_count` INTEGER NOT NULL DEFAULT 0,
    `is_replied` BOOLEAN NOT NULL DEFAULT true,
    `tab` VARCHAR(191) NOT NULL DEFAULT 'main',
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `conversations_zalo_account_id_idx`(`zalo_account_id`),
    INDEX `conversations_zalo_account_id_tab_last_message_at_idx`(`zalo_account_id`, `tab`, `last_message_at`),
    INDEX `conversations_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `conversations_zalo_account_id_external_thread_id_key`(`zalo_account_id`, `external_thread_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `zalo_msg_id` VARCHAR(191) NOT NULL,
    `zalo_cli_msg_id` VARCHAR(191) NULL,
    `sender_uid` VARCHAR(191) NOT NULL,
    `sender_name` VARCHAR(191) NULL,
    `sender_type` VARCHAR(191) NOT NULL DEFAULT 'other',
    `content` TEXT NOT NULL,
    `content_type` VARCHAR(191) NOT NULL DEFAULT 'text',
    `attachments` JSON NOT NULL,
    `quote` JSON NULL,
    `mentions` JSON NULL,
    `reactions` JSON NULL,
    `album_key` VARCHAR(191) NULL,
    `album_index` INTEGER NULL,
    `album_total` INTEGER NULL,
    `is_self` BOOLEAN NOT NULL DEFAULT false,
    `is_backfill` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `seen_at` DATETIME(3) NULL,
    `sent_via` VARCHAR(191) NOT NULL DEFAULT 'user',
    `replied_by_user_id` INTEGER NULL,
    `raw_content` JSON NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `messages_conversation_id_idx`(`conversation_id`),
    INDEX `messages_sender_type_idx`(`sender_type`),
    UNIQUE INDEX `messages_conversation_id_zalo_msg_id_key`(`conversation_id`, `zalo_msg_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zalo_account_accesses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zalo_account_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `permission` VARCHAR(191) NOT NULL DEFAULT 'read',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `zalo_account_accesses_zalo_account_id_idx`(`zalo_account_id`),
    INDEX `zalo_account_accesses_user_id_idx`(`user_id`),
    UNIQUE INDEX `zalo_account_accesses_zalo_account_id_user_id_key`(`zalo_account_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zalo_labels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zalo_account_id` INTEGER NOT NULL,
    `zalo_label_id` VARCHAR(191) NOT NULL,
    `text` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `emoji` VARCHAR(191) NULL,
    `conversations` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `zalo_labels_zalo_account_id_idx`(`zalo_account_id`),
    UNIQUE INDEX `zalo_labels_zalo_account_id_zalo_label_id_key`(`zalo_account_id`, `zalo_label_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `group_scans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zalo_account_id` INTEGER NOT NULL,
    `scope` VARCHAR(191) NOT NULL DEFAULT 'selected',
    `group_ids` JSON NOT NULL,
    `state` VARCHAR(191) NOT NULL DEFAULT 'queued',
    `resume_cursor` VARCHAR(191) NULL,
    `scanned_groups` INTEGER NOT NULL DEFAULT 0,
    `total_groups` INTEGER NOT NULL DEFAULT 0,
    `member_count` INTEGER NOT NULL DEFAULT 0,
    `friend_count` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(191) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `group_scans_zalo_account_id_idx`(`zalo_account_id`),
    INDEX `group_scans_state_idx`(`state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `group_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zalo_account_id` INTEGER NOT NULL,
    `group_id` VARCHAR(191) NOT NULL,
    `member_uid` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NULL,
    `zalo_name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `is_admin` BOOLEAN NOT NULL DEFAULT false,
    `is_friend` BOOLEAN NOT NULL DEFAULT false,
    `friend_checked_at` DATETIME(3) NULL,
    `last_seen_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `group_members_zalo_account_id_idx`(`zalo_account_id`),
    INDEX `group_members_group_id_idx`(`group_id`),
    UNIQUE INDEX `group_members_zalo_account_id_group_id_member_uid_key`(`zalo_account_id`, `group_id`, `member_uid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `students_external_id_key` ON `students`(`external_id`);

-- CreateIndex
CREATE UNIQUE INDEX `zalo_accounts_zalo_uid_key` ON `zalo_accounts`(`zalo_uid`);

-- Supporting cs_id index was created before dropping the legacy unique index.

-- CreateIndex
CREATE INDEX `zalo_accounts_status_idx` ON `zalo_accounts`(`status`);

-- CreateIndex
CREATE INDEX `zalo_accounts_archived_at_idx` ON `zalo_accounts`(`archived_at`);

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_sale_id_fkey` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_teachers` ADD CONSTRAINT `class_teachers_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_accounts` ADD CONSTRAINT `zalo_accounts_archived_by_id_fkey` FOREIGN KEY (`archived_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sdk_limits` ADD CONSTRAINT `sdk_limits_zalo_account_id_fkey` FOREIGN KEY (`zalo_account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `friends` ADD CONSTRAINT `friends_zalo_account_id_fkey` FOREIGN KEY (`zalo_account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_accesses` ADD CONSTRAINT `contact_accesses_zalo_account_id_fkey` FOREIGN KEY (`zalo_account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_accesses` ADD CONSTRAINT `contact_accesses_zalo_uid_fkey` FOREIGN KEY (`zalo_uid`) REFERENCES `contacts`(`zalo_uid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_account_status_logs` ADD CONSTRAINT `zalo_account_status_logs_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_zalo_account_id_fkey` FOREIGN KEY (`zalo_account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_account_accesses` ADD CONSTRAINT `zalo_account_accesses_zalo_account_id_fkey` FOREIGN KEY (`zalo_account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_account_accesses` ADD CONSTRAINT `zalo_account_accesses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_labels` ADD CONSTRAINT `zalo_labels_zalo_account_id_fkey` FOREIGN KEY (`zalo_account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_scans` ADD CONSTRAINT `group_scans_zalo_account_id_fkey` FOREIGN KEY (`zalo_account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_zalo_account_id_fkey` FOREIGN KEY (`zalo_account_id`) REFERENCES `zalo_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `zalo_contact_relations` RENAME INDEX `zalo_contact_relations_zalo_account_id_fkey` TO `zalo_contact_relations_zalo_account_id_idx`;

