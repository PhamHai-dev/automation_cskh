-- Activity-center list, filtering, exact pagination, and 30-day retention access paths.
CREATE INDEX `login_audits_created_at_idx` ON `login_audits`(`created_at`);
CREATE INDEX `login_audits_user_id_created_at_idx` ON `login_audits`(`user_id`, `created_at`);
CREATE INDEX `login_audits_status_created_at_idx` ON `login_audits`(`status`, `created_at`);

DROP INDEX `google_sheet_sync_runs_status_idx` ON `google_sheet_sync_runs`;
CREATE INDEX `google_sheet_sync_runs_status_started_at_idx` ON `google_sheet_sync_runs`(`status`, `started_at`);

CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs`(`created_at`);
CREATE INDEX `audit_logs_user_id_created_at_idx` ON `audit_logs`(`user_id`, `created_at`);
CREATE INDEX `audit_logs_action_created_at_idx` ON `audit_logs`(`action`, `created_at`);
CREATE INDEX `audit_logs_entity_type_entity_id_idx` ON `audit_logs`(`entity_type`, `entity_id`);
