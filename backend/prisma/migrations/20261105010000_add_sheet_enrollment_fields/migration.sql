ALTER TABLE `enrollments`
  ADD COLUMN `total_attended` INT NULL,
  ADD COLUMN `end_hold_week` INT NULL,
  ADD COLUMN `end_hold_year` INT NULL,
  ADD COLUMN `handover_month` INT NULL,
  ADD COLUMN `renewal_deadline` DATE NULL;
