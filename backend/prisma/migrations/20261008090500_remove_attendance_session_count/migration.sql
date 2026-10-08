-- Each lesson/period in a day is represented by its own ClassSession.
-- Attendance therefore records one status for exactly one ClassSession.
ALTER TABLE `attendances` DROP COLUMN `session_count`;
