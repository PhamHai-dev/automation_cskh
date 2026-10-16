-- Migration: add_user_preferences
-- Created: 2026-10-16
-- Per-user UI preferences (column visibility per scope/tab)

CREATE TABLE `user_preferences` (
    `id`         INT NOT NULL AUTO_INCREMENT,
    `user_id`    INT NOT NULL,
    `scope`      VARCHAR(64) NOT NULL,
    `value`      JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_preferences_user_id_idx`(`user_id`),
    UNIQUE INDEX `user_preferences_user_id_scope_key`(`user_id`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign key: user_id -> users.id (CASCADE delete)
ALTER TABLE `user_preferences`
    ADD CONSTRAINT `user_preferences_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
