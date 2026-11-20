-- Keep every existing relation and its ID. Legacy GROUP rows remain ALL and
-- require explicit review; never infer one program from an arbitrary enrollment.
ALTER TABLE `zalo_contact_relations` ADD COLUMN `program_type` VARCHAR(10) NOT NULL DEFAULT 'ALL';
ALTER TABLE `line_contact_relations` ADD COLUMN `program_type` VARCHAR(10) NOT NULL DEFAULT 'ALL';
CREATE UNIQUE INDEX `zalo_relation_student_account_program_key`
  ON `zalo_contact_relations`(`student_id`, `zalo_account_id`, `program_type`);
CREATE UNIQUE INDEX `line_relation_student_account_program_key`
  ON `line_contact_relations`(`student_id`, `line_account_id`, `program_type`);
DROP INDEX `zalo_contact_relations_student_id_zalo_account_id_key` ON `zalo_contact_relations`;
DROP INDEX `line_contact_relations_student_id_line_account_id_key` ON `line_contact_relations`;
