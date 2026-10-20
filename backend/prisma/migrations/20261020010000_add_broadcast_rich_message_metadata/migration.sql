-- Migration: add_broadcast_rich_message_metadata
-- Created: 2026-10-20
-- Adds `message_metadata` and `rendered_metadata` JSON columns to `broadcast_campaigns` and `broadcast_recipients`
-- for rich text formatting (Zalo styles / LINE Flex spans), urgency, file/image attachments, and link cards.

ALTER TABLE `broadcast_campaigns`
    ADD COLUMN `message_metadata` JSON NULL;

ALTER TABLE `broadcast_recipients`
    ADD COLUMN `rendered_metadata` JSON NULL;
