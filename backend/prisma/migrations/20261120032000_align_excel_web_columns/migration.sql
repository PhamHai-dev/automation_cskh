-- Store Kaiwa birth year without fabricating a month/day.
ALTER TABLE `students`
  ADD COLUMN `birth_year` INTEGER NULL AFTER `date_of_birth`;

-- Remove fields that are outside the approved Web/import contract.
-- These drops are intentionally destructive and require a database backup first.
ALTER TABLE `enrollments`
  DROP COLUMN `end_hold_week`,
  DROP COLUMN `end_hold_year`,
  DROP COLUMN `handover_month`,
  DROP COLUMN `renewal_deadline`;

ALTER TABLE `class_schedules`
  DROP COLUMN `duration_minutes`;