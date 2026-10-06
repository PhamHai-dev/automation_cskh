-- Missing prerequisite for the subsequent friend UID migration.
-- Preserve existing db-push installations and historical migration checksums.
SET @has_avatar = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'zalo_contact_relations' AND COLUMN_NAME = 'avatar_url');
SET @ddl = IF(@has_avatar = 0,
  'ALTER TABLE `zalo_contact_relations` ADD COLUMN `avatar_url` VARCHAR(500) NULL',
  'SELECT 1');
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
