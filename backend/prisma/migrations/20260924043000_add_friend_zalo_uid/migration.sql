-- AlterTable
ALTER TABLE `zalo_contact_relations` ADD COLUMN `friend_zalo_uid` VARCHAR(191) NULL AFTER `avatar_url`;

-- CreateIndex
CREATE INDEX `zalo_contact_relations_friend_zalo_uid_idx` ON `zalo_contact_relations`(`friend_zalo_uid`);
