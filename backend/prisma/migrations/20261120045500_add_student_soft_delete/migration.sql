-- Archive a student without deleting any learning, attendance, care, or messaging history.
ALTER TABLE `students`
  ADD COLUMN `deleted_at` DATETIME(3) NULL AFTER `note`,
  ADD COLUMN `deleted_by_id` INTEGER NULL AFTER `deleted_at`;

CREATE INDEX `students_deleted_at_idx` ON `students`(`deleted_at`);
CREATE INDEX `students_deleted_by_id_idx` ON `students`(`deleted_by_id`);

ALTER TABLE `students`
  ADD CONSTRAINT `students_deleted_by_id_fkey`
  FOREIGN KEY (`deleted_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
