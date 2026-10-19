-- Migration: add_student_care_group_linking
-- Created: 2026-10-19
-- Adds group-target linking fields (`target_type`, `zalo_group_id` / `line_group_id`, `matched_by`)
-- to `zalo_contact_relations` and `line_contact_relations` for automatic Student Care Group matching ("01 - 427901798 ...").

ALTER TABLE `zalo_contact_relations`
    ADD COLUMN `target_type` VARCHAR(32) NOT NULL DEFAULT 'USER',
    ADD COLUMN `zalo_group_id` INTEGER NULL,
    ADD COLUMN `matched_by` VARCHAR(64) NULL;

CREATE INDEX `zalo_contact_relations_zalo_group_id_idx` ON `zalo_contact_relations`(`zalo_group_id`);

ALTER TABLE `zalo_contact_relations`
    ADD CONSTRAINT `zalo_contact_relations_zalo_group_id_fkey`
    FOREIGN KEY (`zalo_group_id`) REFERENCES `zalo_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `line_contact_relations`
    ADD COLUMN `target_type` VARCHAR(32) NOT NULL DEFAULT 'USER',
    ADD COLUMN `line_group_id` INTEGER NULL,
    ADD COLUMN `matched_by` VARCHAR(64) NULL;

CREATE INDEX `line_contact_relations_line_group_id_idx` ON `line_contact_relations`(`line_group_id`);

ALTER TABLE `line_contact_relations`
    ADD CONSTRAINT `line_contact_relations_line_group_id_fkey`
    FOREIGN KEY (`line_group_id`) REFERENCES `line_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
