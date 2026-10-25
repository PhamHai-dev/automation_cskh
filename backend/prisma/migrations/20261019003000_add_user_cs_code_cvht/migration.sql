-- Migration: add_user_cs_code_cvht
-- Created: 2026-10-19
-- Adds unique `code` column to `users` table for CS staff identification (CVHT01, CVHT02, ...)

ALTER TABLE `users` ADD COLUMN `code` VARCHAR(64) NULL;
CREATE UNIQUE INDEX `users_code_key` ON `users`(`code`);
