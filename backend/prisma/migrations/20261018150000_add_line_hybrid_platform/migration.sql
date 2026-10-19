-- Migration: add_line_hybrid_platform
-- Created: 2026-10-18
-- Adds Hybrid LINE integration (Official Account @line/bot-sdk + Personal @evex/linejs)

-- 1. Add line_uid to students
ALTER TABLE `students` ADD COLUMN `line_uid` VARCHAR(191) NULL;

-- 2. Extend AutomationChannel enum on automation_steps
ALTER TABLE `automation_steps`
    MODIFY COLUMN `channel` ENUM('ZALO_PERSONAL', 'ZALO_GROUP', 'LINE_PERSONAL', 'LINE_GROUP') NOT NULL;

-- 3. Make zalo_account_id nullable and add line_account_id / line_group_id on message_deliveries
ALTER TABLE `message_deliveries`
    MODIFY COLUMN `zalo_account_id` INTEGER NULL,
    ADD COLUMN `line_account_id` INTEGER NULL,
    ADD COLUMN `line_group_id` INTEGER NULL;

CREATE INDEX `message_deliveries_line_account_id_idx` ON `message_deliveries`(`line_account_id`);
CREATE INDEX `message_deliveries_line_group_id_idx` ON `message_deliveries`(`line_group_id`);

-- 4. Create line_accounts table
CREATE TABLE `line_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cs_id` INTEGER NOT NULL,
    `account_type` ENUM('OA', 'PERSONAL') NOT NULL DEFAULT 'PERSONAL',
    `line_mid` VARCHAR(191) NULL,
    `basic_id` VARCHAR(191) NULL,
    `display_name` VARCHAR(191) NULL,
    `line_phone` VARCHAR(191) NULL,
    `status` ENUM('QR_PENDING', 'PIN_REQUIRED', 'CONNECTING', 'ACTIVE', 'NOT_LOGGED_IN', 'EXPIRED', 'BANNED', 'DISABLED') NOT NULL DEFAULT 'QR_PENDING',
    `encrypted_session_data` TEXT NULL,
    `qr_code` TEXT NULL,
    `pin_code` VARCHAR(16) NULL,
    `webhook_secret` VARCHAR(128) NULL,
    `monthly_quota` INTEGER NULL,
    `monthly_consumption` INTEGER NULL,
    `last_connected_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `last_active_at` DATETIME(3) NULL,
    `proxy_url` VARCHAR(191) NULL,
    `archived_by_id` INTEGER NULL,
    `archived_at` DATETIME(3) NULL,
    `disconnect_reason` VARCHAR(50) NULL,
    `disconnected_at` DATETIME(3) NULL,
    `qr_pending_at` DATETIME(3) NULL,
    `session_epoch` INTEGER NULL,
    `last_sync_error` TEXT NULL,
    `last_sync_at` DATETIME(3) NULL,
    `avatar_url` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `line_accounts_line_mid_key`(`line_mid`),
    INDEX `line_accounts_cs_id_idx`(`cs_id`),
    INDEX `line_accounts_account_type_idx`(`account_type`),
    INDEX `line_accounts_status_idx`(`status`),
    INDEX `line_accounts_archived_at_idx`(`archived_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. Create line_contact_relations table
CREATE TABLE `line_contact_relations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `line_account_id` INTEGER NOT NULL,
    `relation_status` ENUM('FRIEND', 'STRANGER', 'UNKNOWN', 'BLOCKED') NOT NULL DEFAULT 'UNKNOWN',
    `display_name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `friend_line_uid` VARCHAR(191) NULL,
    `link_code` VARCHAR(191) NULL,
    `last_checked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `line_contact_relations_link_code_key`(`link_code`),
    UNIQUE INDEX `line_contact_relations_student_id_line_account_id_key`(`student_id`, `line_account_id`),
    INDEX `line_contact_relations_student_id_idx`(`student_id`),
    INDEX `line_contact_relations_line_account_id_idx`(`line_account_id`),
    INDEX `line_contact_relations_friend_line_uid_idx`(`friend_line_uid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. Create line_groups table
CREATE TABLE `line_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `line_group_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `member_count` INTEGER NULL,
    `owner_line_uid` VARCHAR(191) NULL,
    `line_account_id` INTEGER NOT NULL,
    `last_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `line_groups_line_group_id_key`(`line_group_id`),
    INDEX `line_groups_line_account_id_idx`(`line_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7. Create line_group_members table
CREATE TABLE `line_group_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `group_id` INTEGER NOT NULL,
    `line_uid` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `is_admin` BOOLEAN NOT NULL DEFAULT false,
    `joined_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `line_group_members_group_id_line_uid_key`(`group_id`, `line_uid`),
    INDEX `line_group_members_group_id_idx`(`group_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 8. Create line_friends table
CREATE TABLE `line_friends` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `line_account_id` INTEGER NOT NULL,
    `line_uid_in_nick` VARCHAR(191) NOT NULL,
    `friendship_status` VARCHAR(191) NOT NULL DEFAULT 'friend',
    `relationship_kind` VARCHAR(191) NOT NULL DEFAULT 'friend',
    `alias_in_nick` VARCHAR(191) NULL,
    `has_conversation` BOOLEAN NOT NULL DEFAULT false,
    `phone_from_sdk` VARCHAR(191) NULL,
    `line_display_name` VARCHAR(191) NULL,
    `line_avatar_url` VARCHAR(191) NULL,
    `status_message` TEXT NULL,
    `first_message_at` DATETIME(3) NULL,
    `last_inbound_at` DATETIME(3) NULL,
    `last_outbound_at` DATETIME(3) NULL,
    `total_inbound` INTEGER NOT NULL DEFAULT 0,
    `total_outbound` INTEGER NOT NULL DEFAULT 0,
    `became_friend_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `line_friends_line_account_id_line_uid_in_nick_key`(`line_account_id`, `line_uid_in_nick`),
    INDEX `line_friends_line_account_id_idx`(`line_account_id`),
    INDEX `line_friends_phone_from_sdk_idx`(`phone_from_sdk`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 9. Create line_conversations table
CREATE TABLE `line_conversations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `line_account_id` INTEGER NOT NULL,
    `external_thread_id` VARCHAR(191) NOT NULL,
    `thread_type` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `group_name` VARCHAR(191) NULL,
    `group_avatar_url` VARCHAR(191) NULL,
    `group_members_count` INTEGER NULL,
    `reply_token` VARCHAR(128) NULL,
    `reply_token_expires_at` DATETIME(3) NULL,
    `last_message_at` DATETIME(3) NULL,
    `unread_count` INTEGER NOT NULL DEFAULT 0,
    `is_replied` BOOLEAN NOT NULL DEFAULT true,
    `tab` VARCHAR(191) NOT NULL DEFAULT 'main',
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `line_conversations_line_account_id_external_thread_id_key`(`line_account_id`, `external_thread_id`),
    INDEX `line_conversations_line_account_id_idx`(`line_account_id`),
    INDEX `line_conversations_line_account_id_tab_last_message_at_idx`(`line_account_id`, `tab`, `last_message_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 10. Create line_messages table
CREATE TABLE `line_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `line_msg_id` VARCHAR(191) NOT NULL,
    `quote_token` VARCHAR(255) NULL,
    `sender_uid` VARCHAR(191) NOT NULL,
    `sender_name` VARCHAR(191) NULL,
    `sender_type` VARCHAR(191) NOT NULL DEFAULT 'other',
    `content` TEXT NOT NULL,
    `content_type` VARCHAR(191) NOT NULL DEFAULT 'text',
    `attachments` JSON NOT NULL,
    `quote` JSON NULL,
    `mentions` JSON NULL,
    `reactions` JSON NULL,
    `is_self` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `delivered_at` DATETIME(3) NULL,
    `seen_at` DATETIME(3) NULL,
    `sent_via` VARCHAR(191) NOT NULL DEFAULT 'user',
    `replied_by_user_id` INTEGER NULL,
    `raw_content` JSON NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `line_messages_conversation_id_line_msg_id_key`(`conversation_id`, `line_msg_id`),
    INDEX `line_messages_conversation_id_idx`(`conversation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 11. Foreign Keys
ALTER TABLE `line_accounts`
    ADD CONSTRAINT `line_accounts_cs_id_fkey` FOREIGN KEY (`cs_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `line_accounts_archived_by_id_fkey` FOREIGN KEY (`archived_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `line_contact_relations`
    ADD CONSTRAINT `line_contact_relations_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `line_contact_relations_line_account_id_fkey` FOREIGN KEY (`line_account_id`) REFERENCES `line_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `line_groups`
    ADD CONSTRAINT `line_groups_line_account_id_fkey` FOREIGN KEY (`line_account_id`) REFERENCES `line_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `line_group_members`
    ADD CONSTRAINT `line_group_members_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `line_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `line_friends`
    ADD CONSTRAINT `line_friends_line_account_id_fkey` FOREIGN KEY (`line_account_id`) REFERENCES `line_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `line_conversations`
    ADD CONSTRAINT `line_conversations_line_account_id_fkey` FOREIGN KEY (`line_account_id`) REFERENCES `line_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `line_messages`
    ADD CONSTRAINT `line_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `line_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `message_deliveries`
    ADD CONSTRAINT `message_deliveries_line_account_id_fkey` FOREIGN KEY (`line_account_id`) REFERENCES `line_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `message_deliveries_line_group_id_fkey` FOREIGN KEY (`line_group_id`) REFERENCES `line_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
